import { decodeEventLog, toEventHash } from "viem";
import {
  CURRENT_ROOT_CALLDATA,
  MAINNET_SHIELDED_POOL_ADDRESS,
  MEGAETH_MAINNET_CHAIN_ID,
  MEGAETH_MAINNET_RPC_URL,
  MEGAETH_TESTNET_CHAIN_ID,
  MEGAETH_TESTNET_RPC_URL,
  SANDBOX_DEPLOYMENT_BLOCK_HEX,
  SANDBOX_POSEIDON_COMMITMENT_DERIVATION_STATUS,
  SHIELDED_POOL_ADDRESS,
  createSandboxSpendMaterialNoteRecord,
  encodeNullifierLookupCalldata,
  isEvmAddress,
  isHexBytes32,
  isHexString,
  isSupportedMegaEthChainId,
  type HexString,
  type SandboxSpendMaterialNoteRecord,
  type SupportedMegaEthChainId
} from "./shieldedTransfersHelpers.js";
import { deriveBrowserNoteCommitment, deriveBrowserNullifier } from "../recovery/browserPoseidon.js";
import {
  LEGACY_SHIELDED_TRANSFERS_RECOVERY_APP_ID,
  NULLARK_RECOVERY_APP_ID,
  decryptEncryptedNoteEnvelope,
  deriveNoteKey,
  deriveWalletRecoveryKey,
  makeRecoveryAssociatedData,
  parseEncryptedNoteEnvelopeFromHex,
  type EncryptedNoteV1Action,
  type SpendMaterialPlaintext
} from "../recovery/encryptedNoteEnvelope.js";

const NOTE_EVENTS_ABI = [
  {
    type: "event",
    name: "DepositNoteCreated",
    inputs: [
      { name: "commitment", type: "bytes32", indexed: true },
      { name: "leafIndex", type: "uint256", indexed: true },
      { name: "encryptedNote", type: "bytes", indexed: false },
      { name: "encryptionVersion", type: "uint16", indexed: false }
    ]
  },
  {
    type: "event",
    name: "PrivateTransferNoteCreated",
    inputs: [
      { name: "commitment", type: "bytes32", indexed: true },
      { name: "nullifier", type: "bytes32", indexed: true },
      { name: "leafIndex", type: "uint256", indexed: true },
      { name: "encryptedNote", type: "bytes", indexed: false },
      { name: "encryptionVersion", type: "uint16", indexed: false }
    ]
  },
  {
    type: "event",
    name: "WithdrawalChangeNoteCreated",
    inputs: [
      { name: "commitment", type: "bytes32", indexed: true },
      { name: "nullifier", type: "bytes32", indexed: true },
      { name: "leafIndex", type: "uint256", indexed: true },
      { name: "grossAmount", type: "uint256", indexed: false },
      { name: "encryptedNote", type: "bytes", indexed: false },
      { name: "encryptionVersion", type: "uint16", indexed: false }
    ]
  }
] as const;

const NOTE_EVENT_TOPICS = [
  toEventHash("DepositNoteCreated(bytes32,uint256,bytes,uint16)"),
  toEventHash("PrivateTransferNoteCreated(bytes32,bytes32,uint256,bytes,uint16)"),
  toEventHash("WithdrawalChangeNoteCreated(bytes32,bytes32,uint256,uint256,bytes,uint16)")
] as const;

export const SHIELDED_TRANSFERS_RECOVERY_EPOCH_ID_V1 = "megaeth-testnet-v1";
export const SHIELDED_TRANSFERS_LEGACY_RECOVERY_EPOCH_ID_V1 = SHIELDED_TRANSFERS_RECOVERY_EPOCH_ID_V1;
const DEFAULT_NOTE_RECOVERY_LOG_CHUNK_SIZE = 50_000n;

export type OnChainNoteRecoveryRuntime = {
  chainId: SupportedMegaEthChainId;
  rpcUrl: string;
  pool: HexString;
  fromBlock: HexString;
};

export const MEGAETH_TESTNET_NOTE_RECOVERY_RUNTIME: OnChainNoteRecoveryRuntime = {
  chainId: MEGAETH_TESTNET_CHAIN_ID,
  rpcUrl: MEGAETH_TESTNET_RPC_URL,
  pool: SHIELDED_POOL_ADDRESS,
  fromBlock: SANDBOX_DEPLOYMENT_BLOCK_HEX
};

export const MEGAETH_MAINNET_NOTE_RECOVERY_RUNTIME: OnChainNoteRecoveryRuntime = {
  chainId: MEGAETH_MAINNET_CHAIN_ID,
  rpcUrl: MEGAETH_MAINNET_RPC_URL,
  pool: MAINNET_SHIELDED_POOL_ADDRESS,
  fromBlock: "0xec757f"
};

export function getShieldedTransfersRecoveryEpochId(input: { chainId: SupportedMegaEthChainId }): string {
  return `megaeth-${input.chainId}-nullark-v1`;
}

type RawRpcLog = {
  address: string;
  topics: HexString[];
  data: HexString;
  transactionHash: HexString;
};

export type RecoveredWalletNoteEntry = {
  record: SandboxSpendMaterialNoteRecord;
  spent: boolean;
  spentNullifier: HexString | null;
};

export async function recoverWalletNotesFromChain(input: {
  walletSignature: HexString;
  chainId?: SupportedMegaEthChainId;
  rpcUrl?: string;
  pool?: HexString;
  fromBlock?: HexString;
  logChunkSize?: bigint | number;
  fetchFn?: typeof fetch;
}): Promise<RecoveredWalletNoteEntry[]> {
  const fetchFn = input.fetchFn ?? fetch;
  const { chainId, rpcUrl, pool, fromBlock } = resolveRecoveryRuntime(input);
  const logs = await fetchNoteLogsInChunks({
    fetchFn,
    rpcUrl,
    pool,
    fromBlock,
    chunkSize: input.logChunkSize === undefined ? DEFAULT_NOTE_RECOVERY_LOG_CHUNK_SIZE : BigInt(input.logChunkSize)
  });
  const currentRoot = await rpcRequest<string>(fetchFn, "eth_call", [
    { to: pool, data: CURRENT_ROOT_CALLDATA },
    "latest"
  ], rpcUrl).catch(() => null);

  const recoveryKeys = await Promise.all(
    [NULLARK_RECOVERY_APP_ID, LEGACY_SHIELDED_TRANSFERS_RECOVERY_APP_ID]
      .filter((appId, index, values) => values.indexOf(appId) === index)
      .map((appId) =>
        deriveWalletRecoveryKey({
          walletSignature: input.walletSignature,
          chainId,
          pool,
          appId,
          recoveryVersion: 1
        })
      )
  );

  const recovered: RecoveredWalletNoteEntry[] = [];
  for (const log of logs) {
    try {
      const event = decodeNoteEvent(log);
      if (!event || event.encryptedNote === "0x") {
        continue;
      }

      const plaintext = await tryDecryptEvent({ event, recoveryKeys, chainId, pool });
      if (!plaintext) {
        continue;
      }

      const derivedCommitment = await deriveBrowserNoteCommitment({
        assetId: plaintext.assetId,
        noteAmountWei: plaintext.noteAmountWei,
        ownerCommitment: plaintext.ownerCommitment,
        noteSecret: plaintext.noteSecret
      });
      if (derivedCommitment.toLowerCase() !== event.commitment.toLowerCase()) {
        continue;
      }

      const spendNullifier = await deriveBrowserNullifier({
        noteSecret: plaintext.noteSecret,
        leafIndex: event.leafIndex,
        chainId,
        verifyingContract: pool
      });
      const spent = await rpcRequest<string>(fetchFn, "eth_call", [
        { to: pool, data: encodeNullifierLookupCalldata(spendNullifier) },
        "latest"
      ], rpcUrl)
        .then((result) => BigInt(result) !== 0n)
        .catch(() => false);

      recovered.push({
        record: createSandboxSpendMaterialNoteRecord({
          assetId: plaintext.assetId,
          commitment: event.commitment,
          noteAmountWei: plaintext.noteAmountWei,
          ownerCommitment: plaintext.ownerCommitment,
          noteSecret: plaintext.noteSecret,
          blinding: plaintext.blinding,
          depositTxHash: log.transactionHash,
          currentRootAfter: currentRoot && isHexBytes32(currentRoot) ? currentRoot : null,
          createdAt: plaintext.createdAt,
          leafIndex: event.leafIndex,
          commitmentDerivationStatus: SANDBOX_POSEIDON_COMMITMENT_DERIVATION_STATUS,
          commitmentDerivedFromSpendMaterial: true,
          chainId,
          rpcUrl,
          pool
        }),
        spent,
        spentNullifier: spent ? spendNullifier : null
      });
    } catch {
      continue;
    }
  }

  return recovered;
}

async function tryDecryptEvent(input: {
  event: DecodedNoteEvent;
  recoveryKeys: CryptoKey[];
  chainId: SupportedMegaEthChainId;
  pool: HexString;
}): Promise<SpendMaterialPlaintext | null> {
  const encrypted = (() => {
    try {
      return parseEncryptedNoteEnvelopeFromHex(input.event.encryptedNote);
    } catch {
      return null;
    }
  })();
  if (!encrypted) {
    return null;
  }
  const epochIds = [
    getShieldedTransfersRecoveryEpochId({ chainId: input.chainId }),
    SHIELDED_TRANSFERS_LEGACY_RECOVERY_EPOCH_ID_V1
  ].filter((epochId, index, values) => values.indexOf(epochId) === index);
  const actions: EncryptedNoteV1Action[] =
    input.event.action === "withdraw-change" ? ["withdraw-change", "withdraw"] : [input.event.action];

  for (const recoveryKey of input.recoveryKeys) {
    for (const epochId of epochIds) {
      for (const action of actions) {
        try {
          const noteKey = await deriveNoteKey(recoveryKey, {
            commitment: input.event.commitment,
            epochId
          });
          const aad = makeRecoveryAssociatedData({
            chainId: input.chainId,
            pool: input.pool,
            action,
            commitment: input.event.commitment,
            encryptionVersion: 1
          });
          return await decryptEncryptedNoteEnvelope({ noteKey, encrypted, aad });
        } catch {
          continue;
        }
      }
    }
  }
  return null;
}

async function fetchNoteLogsInChunks(input: {
  fetchFn: typeof fetch;
  rpcUrl: string;
  pool: HexString;
  fromBlock: HexString;
  chunkSize: bigint;
}): Promise<RawRpcLog[]> {
  if (input.chunkSize <= 0n) {
    throw new Error("Expected note recovery log chunk size to be positive.");
  }
  const latestBlockHex = await rpcRequest<HexString>(input.fetchFn, "eth_blockNumber", [], input.rpcUrl);
  const latestBlock = BigInt(latestBlockHex);
  const startBlock = BigInt(input.fromBlock);
  if (latestBlock < startBlock) {
    return [];
  }

  const logs: RawRpcLog[] = [];
  for (let chunkStart = startBlock; chunkStart <= latestBlock; chunkStart += input.chunkSize + 1n) {
    const chunkEnd = chunkStart + input.chunkSize > latestBlock ? latestBlock : chunkStart + input.chunkSize;
    logs.push(...await rpcRequest<RawRpcLog[]>(input.fetchFn, "eth_getLogs", [
      {
        address: input.pool,
        fromBlock: blockQuantityHex(chunkStart),
        toBlock: blockQuantityHex(chunkEnd),
        topics: [NOTE_EVENT_TOPICS]
      }
    ], input.rpcUrl));
  }
  return logs;
}

function blockQuantityHex(value: bigint): HexString {
  return `0x${value.toString(16)}` as HexString;
}

function resolveRecoveryRuntime(input: {
  chainId?: SupportedMegaEthChainId;
  rpcUrl?: string;
  pool?: HexString;
  fromBlock?: HexString;
}): OnChainNoteRecoveryRuntime {
  const hasExplicitRuntime =
    input.chainId !== undefined ||
    input.rpcUrl !== undefined ||
    input.pool !== undefined ||
    input.fromBlock !== undefined;

  if (!hasExplicitRuntime) {
    return MEGAETH_TESTNET_NOTE_RECOVERY_RUNTIME;
  }

  if (
    input.chainId === undefined ||
    input.rpcUrl === undefined ||
    input.pool === undefined ||
    input.fromBlock === undefined
  ) {
    throw new Error("Explicit note recovery runtime metadata requires chainId, rpcUrl, pool, and fromBlock.");
  }

  if (!isSupportedMegaEthChainId(input.chainId)) {
    throw new Error("Expected note recovery chain ID to be MegaETH mainnet or testnet.");
  }
  if (typeof input.rpcUrl !== "string" || input.rpcUrl.trim().length === 0) {
    throw new Error("Expected note recovery RPC URL.");
  }
  if (!isEvmAddress(input.pool)) {
    throw new Error("Expected note recovery pool to be an EVM address.");
  }
  if (typeof input.fromBlock !== "string" || !/^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$/.test(input.fromBlock)) {
    throw new Error("Expected note recovery fromBlock to be a hex block quantity.");
  }

  return {
    chainId: input.chainId,
    rpcUrl: input.rpcUrl,
    pool: input.pool,
    fromBlock: input.fromBlock
  };
}

type DecodedNoteEvent = {
  action: EncryptedNoteV1Action;
  commitment: HexString;
  leafIndex: number;
  encryptedNote: HexString;
};

function decodeNoteEvent(log: RawRpcLog): DecodedNoteEvent | null {
  try {
    if (log.topics.length === 0) {
      return null;
    }
    const decoded = decodeEventLog({
      abi: NOTE_EVENTS_ABI,
      data: log.data,
      topics: log.topics as [HexString, ...HexString[]]
    });
    if (decoded.eventName === "DepositNoteCreated") {
      return {
        action: "deposit",
        commitment: decoded.args.commitment,
        leafIndex: Number(decoded.args.leafIndex),
        encryptedNote: decoded.args.encryptedNote
      };
    }
    if (decoded.eventName === "PrivateTransferNoteCreated") {
      return {
        action: "private-transfer",
        commitment: decoded.args.commitment,
        leafIndex: Number(decoded.args.leafIndex),
        encryptedNote: decoded.args.encryptedNote
      };
    }
    if (decoded.eventName === "WithdrawalChangeNoteCreated") {
      return {
        action: "withdraw-change",
        commitment: decoded.args.commitment,
        leafIndex: Number(decoded.args.leafIndex),
        encryptedNote: decoded.args.encryptedNote
      };
    }
    return null;
  } catch {
    return null;
  }
}

async function rpcRequest<T>(fetchFn: typeof fetch, method: string, params: unknown[], rpcUrl = MEGAETH_TESTNET_RPC_URL): Promise<T> {
  const response = await fetchFn(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params })
  });
  if (!response.ok) {
    throw new Error(`MegaETH RPC ${method} failed with HTTP ${response.status}.`);
  }
  const body = (await response.json()) as { result?: T; error?: { message?: string } };
  if (body.error) {
    throw new Error(body.error.message ?? `MegaETH RPC ${method} failed.`);
  }
  return body.result as T;
}
