import { encodeAbiParameters, toEventHash } from "viem";
import { describe, expect, it } from "vitest";
import { createBrowserPoseidonFieldHash, deriveBrowserNoteCommitment } from "../recovery/browserPoseidon.js";
import {
  LEGACY_SHIELDED_TRANSFERS_RECOVERY_APP_ID,
  NULLARK_RECOVERY_APP_ID,
  createEncryptedOutputNoteV2Envelope,
  deriveNoteKey,
  deriveWalletRecoveryKey,
  encryptSpendMaterialEnvelope,
  makeRecoveryAssociatedData,
  serializeEncryptedOutputNoteV2EnvelopeToHex,
  serializeEncryptedNoteEnvelopeToHex,
  type SpendMaterialPlaintext
} from "../recovery/encryptedNoteEnvelope.js";
import {
  CURRENT_ROOT_CALLDATA,
  MAINNET_SHIELDED_POOL_ADDRESS,
  MEGAETH_MAINNET_CHAIN_ID,
  MEGAETH_MAINNET_RPC_URL,
  MEGAETH_TESTNET_CHAIN_ID,
  MEGAETH_TESTNET_RPC_URL,
  NULLIFIERS_SELECTOR,
  SANDBOX_NATIVE_ETH_ASSET_ID,
  SHIELDED_POOL_ADDRESS,
  type HexString
} from "./shieldedTransfersHelpers.js";
import {
  SHIELDED_TRANSFERS_LEGACY_RECOVERY_EPOCH_ID_V1,
  getShieldedTransfersRecoveryEpochId,
  recoverWalletNoteFromLog,
  recoverWalletNotesFromChain
} from "./onChainNoteRecovery.js";

const DEPOSIT_NOTE_CREATED_TOPIC = toEventHash("DepositNoteCreated(bytes32,uint256,bytes,uint16)");
const WITHDRAWAL_CHANGE_NOTE_CREATED_TOPIC = toEventHash(
  "WithdrawalChangeNoteCreated(bytes32,bytes32,uint256,uint256,bytes,uint16)"
);
const WITHDRAWAL_OUTPUT_NOTE_CREATED_TOPIC = toEventHash(
  "WithdrawalOutputNoteCreated(bytes32,bytes32,uint256,uint256,bytes,uint16)"
);

const walletSignature = `0x${"42".repeat(65)}` as const;
const currentRoot = `0x${"66".repeat(32)}` as const;

describe("on-chain note recovery", () => {
  it("recovers multiple note sizes on a different device and marks spent notes", async () => {
    const depositNote = await createEncryptedRecoveryLog({
      action: "deposit",
      amountWei: "5000000000000",
      seed: 1,
      leafIndex: 0
    });
    const changeNote = await createEncryptedRecoveryLog({
      action: "withdraw-change",
      amountWei: "12000000000000",
      seed: 2,
      leafIndex: 1
    });
    const nullifierCalls: string[] = [];
    const logFilters: Array<{ fromBlock?: string; toBlock?: string }> = [];
    const fetchFn = async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe(MEGAETH_TESTNET_RPC_URL);
      const body = JSON.parse(String(init?.body ?? "{}"));
      if (body.method === "eth_blockNumber") {
        return Response.json({ jsonrpc: "2.0", id: 1, result: "0x1136f96" });
      }
      if (body.method === "eth_getLogs") {
        logFilters.push(body.params?.[0] ?? {});
        return Response.json({ jsonrpc: "2.0", id: 1, result: [depositNote.log, changeNote.log] });
      }
      if (body.method === "eth_call" && body.params?.[0]?.data === CURRENT_ROOT_CALLDATA) {
        return Response.json({ jsonrpc: "2.0", id: 1, result: currentRoot });
      }
      if (body.method === "eth_call" && String(body.params?.[0]?.data ?? "").startsWith(NULLIFIERS_SELECTOR)) {
        nullifierCalls.push(String(body.params[0].data));
        const spent = nullifierCalls.length === 2;
        return Response.json({ jsonrpc: "2.0", id: 1, result: `0x${(spent ? "1" : "0").padStart(64, "0")}` });
      }
      return Response.json({ jsonrpc: "2.0", id: 1, result: "0x" });
    };

    const recovered = await recoverWalletNotesFromChain({
      walletSignature,
      fetchFn: fetchFn as typeof fetch
    });

    expect(recovered).toHaveLength(2);
    expect(recovered.map((entry) => entry.record.noteAmountWei)).toEqual(["5000000000000", "12000000000000"]);
    expect(recovered.map((entry) => entry.record.commitment)).toEqual([
      depositNote.plaintext.commitment,
      changeNote.plaintext.commitment
    ]);
    expect(recovered[0]?.spent).toBe(false);
    expect(recovered[0]?.spentNullifier).toBeNull();
    expect(recovered[1]?.spent).toBe(true);
    expect(recovered[1]?.spentNullifier).toMatch(/^0x[0-9a-f]{64}$/);
    expect(recovered.every((entry) => entry.record.currentRootAfter === currentRoot)).toBe(true);
    expect(logFilters).toHaveLength(1);
    expect(logFilters[0]).toMatchObject({ fromBlock: "0x1136f96", toBlock: "0x1136f96" });
    expect(nullifierCalls).toHaveLength(2);
  });

  it("uses the supplied pool deployment block when scanning recovery logs", async () => {
    const requestedFilters: Array<{ fromBlock?: string; toBlock?: string }> = [];
    const fetchFn = async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}"));
      if (body.method === "eth_blockNumber") {
        return Response.json({ jsonrpc: "2.0", id: 1, result: "0xec757f" });
      }
      if (body.method === "eth_getLogs") {
        requestedFilters.push(body.params?.[0] ?? {});
        return Response.json({ jsonrpc: "2.0", id: 1, result: [] });
      }
      return Response.json({ jsonrpc: "2.0", id: 1, result: currentRoot });
    };

    await recoverWalletNotesFromChain({
      walletSignature,
      chainId: MEGAETH_TESTNET_CHAIN_ID,
      rpcUrl: MEGAETH_TESTNET_RPC_URL,
      pool: SHIELDED_POOL_ADDRESS,
      fromBlock: "0xec757f",
      fetchFn: fetchFn as typeof fetch
    });

    expect(requestedFilters).toHaveLength(1);
    expect(requestedFilters[0]).toMatchObject({ fromBlock: "0xec757f", toBlock: "0xec757f" });
  });

  it("recovers a single live encrypted note log without scanning history", async () => {
    const depositNote = await createEncryptedRecoveryLog({
      action: "deposit",
      amountWei: "7000000000000",
      seed: 7,
      leafIndex: 7
    });
    const rpcMethods: string[] = [];
    const fetchFn = async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}"));
      rpcMethods.push(body.method);
      if (body.method === "eth_call" && body.params?.[0]?.data === CURRENT_ROOT_CALLDATA) {
        return Response.json({ jsonrpc: "2.0", id: 1, result: currentRoot });
      }
      if (body.method === "eth_call" && String(body.params?.[0]?.data ?? "").startsWith(NULLIFIERS_SELECTOR)) {
        return Response.json({ jsonrpc: "2.0", id: 1, result: `0x${"0".repeat(64)}` });
      }
      throw new Error(`unexpected RPC method ${body.method}`);
    };

    const recovered = await recoverWalletNoteFromLog({
      walletSignature,
      log: depositNote.log,
      chainId: MEGAETH_TESTNET_CHAIN_ID,
      rpcUrl: MEGAETH_TESTNET_RPC_URL,
      pool: SHIELDED_POOL_ADDRESS,
      fetchFn: fetchFn as typeof fetch
    });

    expect(recovered?.record.commitment).toBe(depositNote.plaintext.commitment);
    expect(recovered?.record.noteAmountWei).toBe("7000000000000");
    expect(recovered?.spent).toBe(false);
    expect(rpcMethods).toEqual(["eth_call", "eth_call"]);
  });

  it("imports a recovered output note as spendable without public wallet-linked discovery tags", async () => {
    const outputNote = await createEncryptedRecoveryLog({
      action: "withdraw-output",
      amountWei: "10000000000000",
      seed: 8,
      leafIndex: 8
    });
    const fetchFn = async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}"));
      if (body.method === "eth_call" && body.params?.[0]?.data === CURRENT_ROOT_CALLDATA) {
        return Response.json({ jsonrpc: "2.0", id: 1, result: currentRoot });
      }
      if (body.method === "eth_call" && String(body.params?.[0]?.data ?? "").startsWith(NULLIFIERS_SELECTOR)) {
        return Response.json({ jsonrpc: "2.0", id: 1, result: `0x${"0".repeat(64)}` });
      }
      throw new Error(`unexpected RPC method ${body.method}`);
    };

    const recovered = await recoverWalletNoteFromLog({
      walletSignature,
      log: outputNote.log,
      chainId: MEGAETH_TESTNET_CHAIN_ID,
      rpcUrl: MEGAETH_TESTNET_RPC_URL,
      pool: SHIELDED_POOL_ADDRESS,
      fetchFn: fetchFn as typeof fetch
    });

    expect(recovered?.record.commitment).toBe(outputNote.plaintext.commitment);
    expect(recovered?.record.noteSecret).toBe(outputNote.plaintext.noteSecret);
    expect(recovered?.spent).toBe(false);
    expect(recovered?.spentNullifier).toBeNull();
    expect(Object.keys(recovered?.record ?? {}).filter((key) => /wallet|discovery|tag/i.test(key))).toEqual([]);
  });

  it("recovers a v1.2 encrypted output note only when the v2 envelope matches chain pool and output commitment", async () => {
    const outputNote = await createEncryptedV2OutputRecoveryLog({
      amountWei: "10000000000000",
      seed: 9,
      leafIndex: 9
    });
    const fetchFn = async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}"));
      if (body.method === "eth_call" && body.params?.[0]?.data === CURRENT_ROOT_CALLDATA) {
        return Response.json({ jsonrpc: "2.0", id: 1, result: currentRoot });
      }
      if (body.method === "eth_call" && String(body.params?.[0]?.data ?? "").startsWith(NULLIFIERS_SELECTOR)) {
        return Response.json({ jsonrpc: "2.0", id: 1, result: `0x${"0".repeat(64)}` });
      }
      throw new Error(`unexpected RPC method ${body.method}`);
    };

    const recovered = await recoverWalletNoteFromLog({
      walletSignature,
      log: outputNote.log,
      chainId: MEGAETH_TESTNET_CHAIN_ID,
      rpcUrl: MEGAETH_TESTNET_RPC_URL,
      pool: SHIELDED_POOL_ADDRESS,
      fetchFn: fetchFn as typeof fetch
    });

    expect(recovered?.record.commitment).toBe(outputNote.plaintext.commitment);
    expect(recovered?.record.noteSecret).toBe(outputNote.plaintext.noteSecret);
    expect(recovered?.record.noteAmountWei).toBe("10000000000000");
    expect(recovered?.spent).toBe(false);
    expect(recovered?.spentNullifier).toBeNull();
  });

  it("fails closed when a v1.2 encrypted output note envelope is bound to a different pool or output commitment", async () => {
    const wrongPool = "0x0000000000000000000000000000000000000001" as const;
    const wrongCommitment = `0x${"99".repeat(32)}` as const;
    const poolMismatchedNote = await createEncryptedV2OutputRecoveryLog({
      amountWei: "10000000000000",
      seed: 10,
      leafIndex: 10,
      envelopePool: wrongPool
    });
    const commitmentMismatchedNote = await createEncryptedV2OutputRecoveryLog({
      amountWei: "10000000000000",
      seed: 11,
      leafIndex: 11,
      envelopeOutputCommitment: wrongCommitment
    });
    const fetchFn = async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}"));
      if (body.method === "eth_call" && body.params?.[0]?.data === CURRENT_ROOT_CALLDATA) {
        return Response.json({ jsonrpc: "2.0", id: 1, result: currentRoot });
      }
      throw new Error(`unexpected RPC method ${body.method}`);
    };

    await expect(
      recoverWalletNoteFromLog({
        walletSignature,
        log: poolMismatchedNote.log,
        chainId: MEGAETH_TESTNET_CHAIN_ID,
        rpcUrl: MEGAETH_TESTNET_RPC_URL,
        pool: SHIELDED_POOL_ADDRESS,
        fetchFn: fetchFn as typeof fetch
      })
    ).resolves.toBeNull();
    await expect(
      recoverWalletNoteFromLog({
        walletSignature,
        log: commitmentMismatchedNote.log,
        chainId: MEGAETH_TESTNET_CHAIN_ID,
        rpcUrl: MEGAETH_TESTNET_RPC_URL,
        pool: SHIELDED_POOL_ADDRESS,
        fetchFn: fetchFn as typeof fetch
      })
    ).resolves.toBeNull();
  });

  it("chunks recovery log scans so broad deployment ranges do not depend on one eth_getLogs call", async () => {
    const requestedFilters: Array<{ fromBlock?: string; toBlock?: string }> = [];
    const fetchFn = async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}"));
      if (body.method === "eth_blockNumber") {
        return Response.json({ jsonrpc: "2.0", id: 1, result: "0x20" });
      }
      if (body.method === "eth_getLogs") {
        requestedFilters.push(body.params?.[0] ?? {});
        return Response.json({ jsonrpc: "2.0", id: 1, result: [] });
      }
      return Response.json({ jsonrpc: "2.0", id: 1, result: currentRoot });
    };

    await recoverWalletNotesFromChain({
      walletSignature,
      chainId: MEGAETH_TESTNET_CHAIN_ID,
      rpcUrl: MEGAETH_TESTNET_RPC_URL,
      pool: SHIELDED_POOL_ADDRESS,
      fromBlock: "0x10",
      logChunkSize: 7n,
      fetchFn: fetchFn as typeof fetch
    });

    expect(requestedFilters.map((filter) => [filter.fromBlock, filter.toBlock])).toEqual([
      ["0x10", "0x17"],
      ["0x18", "0x1f"],
      ["0x20", "0x20"]
    ]);
  });

  it("recovers mainnet notes with the approved mainnet RPC, pool, chain id, and deployment block", async () => {
    const depositNote = await createEncryptedRecoveryLog({
      action: "deposit",
      amountWei: "10000000000000",
      seed: 3,
      leafIndex: 2,
      chainId: MEGAETH_MAINNET_CHAIN_ID,
      pool: MAINNET_SHIELDED_POOL_ADDRESS
    });
    const requestedFilters: Array<{ address?: string; fromBlock?: string; toBlock?: string }> = [];
    const fetchUrls: string[] = [];
    const fetchFn = async (url: string | URL | Request, init?: RequestInit) => {
      fetchUrls.push(String(url));
      const body = JSON.parse(String(init?.body ?? "{}"));
      if (body.method === "eth_blockNumber") {
        return Response.json({ jsonrpc: "2.0", id: 1, result: "0xec757f" });
      }
      if (body.method === "eth_getLogs") {
        requestedFilters.push(body.params?.[0] ?? {});
        return Response.json({ jsonrpc: "2.0", id: 1, result: [depositNote.log] });
      }
      if (body.method === "eth_call" && body.params?.[0]?.data === CURRENT_ROOT_CALLDATA) {
        return Response.json({ jsonrpc: "2.0", id: 1, result: currentRoot });
      }
      if (body.method === "eth_call" && String(body.params?.[0]?.data ?? "").startsWith(NULLIFIERS_SELECTOR)) {
        return Response.json({ jsonrpc: "2.0", id: 1, result: `0x${"0".repeat(64)}` });
      }
      return Response.json({ jsonrpc: "2.0", id: 1, result: "0x" });
    };

    const recovered = await recoverWalletNotesFromChain({
      walletSignature,
      chainId: MEGAETH_MAINNET_CHAIN_ID,
      rpcUrl: MEGAETH_MAINNET_RPC_URL,
      pool: MAINNET_SHIELDED_POOL_ADDRESS,
      fromBlock: "0xec757f",
      fetchFn: fetchFn as typeof fetch
    });

    expect(new Set(fetchUrls)).toEqual(new Set([MEGAETH_MAINNET_RPC_URL]));
    expect(requestedFilters).toEqual([
      {
        address: MAINNET_SHIELDED_POOL_ADDRESS,
        fromBlock: "0xec757f",
        toBlock: "0xec757f",
        topics: expect.any(Array)
      }
    ]);
    expect(recovered).toHaveLength(1);
    expect(recovered[0]?.record.chainId).toBe(MEGAETH_MAINNET_CHAIN_ID);
    expect(recovered[0]?.record.rpcUrl).toBe(MEGAETH_MAINNET_RPC_URL);
    expect(recovered[0]?.record.pool).toBe(MAINNET_SHIELDED_POOL_ADDRESS);
  });

  it("rejects partial recovery runtime metadata to avoid scanning the wrong network", async () => {
    await expect(
      recoverWalletNotesFromChain({
        walletSignature,
        fromBlock: "0xec757f",
        fetchFn: (() => {
          throw new Error("fetch should not run");
        }) as typeof fetch
      })
    ).rejects.toThrow("Explicit note recovery runtime metadata requires chainId, rpcUrl, pool, and fromBlock.");
  });

  it("keeps the v1 recovery epoch label behind a helper for decrypt compatibility", () => {
    expect(getShieldedTransfersRecoveryEpochId({ chainId: MEGAETH_MAINNET_CHAIN_ID })).toBe("megaeth-4326-nullark-v1");
    expect(getShieldedTransfersRecoveryEpochId({ chainId: MEGAETH_TESTNET_CHAIN_ID })).toBe("megaeth-6343-nullark-v1");
  });

  it("recovers legacy private change notes encrypted with the old withdraw action label", async () => {
    const changeNote = await createEncryptedRecoveryLog({
      action: "withdraw",
      amountWei: "10000000000000",
      seed: 4,
      leafIndex: 3,
      epochId: SHIELDED_TRANSFERS_LEGACY_RECOVERY_EPOCH_ID_V1
    });
    const fetchFn = async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}"));
      if (body.method === "eth_blockNumber") {
        return Response.json({ jsonrpc: "2.0", id: 1, result: "0x1136f96" });
      }
      if (body.method === "eth_getLogs") {
        return Response.json({ jsonrpc: "2.0", id: 1, result: [changeNote.log] });
      }
      if (body.method === "eth_call" && body.params?.[0]?.data === CURRENT_ROOT_CALLDATA) {
        return Response.json({ jsonrpc: "2.0", id: 1, result: currentRoot });
      }
      if (body.method === "eth_call" && String(body.params?.[0]?.data ?? "").startsWith(NULLIFIERS_SELECTOR)) {
        return Response.json({ jsonrpc: "2.0", id: 1, result: `0x${"0".repeat(64)}` });
      }
      return Response.json({ jsonrpc: "2.0", id: 1, result: "0x" });
    };

    const recovered = await recoverWalletNotesFromChain({
      walletSignature,
      fetchFn: fetchFn as typeof fetch
    });

    expect(recovered).toHaveLength(1);
    expect(recovered[0]?.record.commitment).toBe(changeNote.plaintext.commitment);
  });

  it("recovers notes encrypted with the legacy recovery app id", async () => {
    const legacyNote = await createEncryptedRecoveryLog({
      action: "deposit",
      amountWei: "10000000000000",
      seed: 5,
      leafIndex: 4,
      appId: LEGACY_SHIELDED_TRANSFERS_RECOVERY_APP_ID
    });
    const fetchFn = async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}"));
      if (body.method === "eth_blockNumber") {
        return Response.json({ jsonrpc: "2.0", id: 1, result: "0x1136f96" });
      }
      if (body.method === "eth_getLogs") {
        return Response.json({ jsonrpc: "2.0", id: 1, result: [legacyNote.log] });
      }
      if (body.method === "eth_call" && body.params?.[0]?.data === CURRENT_ROOT_CALLDATA) {
        return Response.json({ jsonrpc: "2.0", id: 1, result: currentRoot });
      }
      if (body.method === "eth_call" && String(body.params?.[0]?.data ?? "").startsWith(NULLIFIERS_SELECTOR)) {
        return Response.json({ jsonrpc: "2.0", id: 1, result: `0x${"0".repeat(64)}` });
      }
      return Response.json({ jsonrpc: "2.0", id: 1, result: "0x" });
    };

    const recovered = await recoverWalletNotesFromChain({
      walletSignature,
      fetchFn: fetchFn as typeof fetch
    });

    expect(recovered).toHaveLength(1);
    expect(recovered[0]?.record.commitment).toBe(legacyNote.plaintext.commitment);
  });
});

async function createEncryptedRecoveryLog(input: {
  action: "deposit" | "withdraw" | "withdraw-change" | "withdraw-output";
  amountWei: string;
  seed: number;
  leafIndex: number;
  chainId?: typeof MEGAETH_TESTNET_CHAIN_ID | typeof MEGAETH_MAINNET_CHAIN_ID;
  pool?: HexString;
  epochId?: string;
  appId?: typeof NULLARK_RECOVERY_APP_ID | typeof LEGACY_SHIELDED_TRANSFERS_RECOVERY_APP_ID;
}): Promise<{
  plaintext: SpendMaterialPlaintext;
  log: {
    address: HexString;
    topics: HexString[];
    data: HexString;
    transactionHash: HexString;
  };
}> {
  const chainId = input.chainId ?? MEGAETH_TESTNET_CHAIN_ID;
  const pool = input.pool ?? SHIELDED_POOL_ADDRESS;
  const ownerCommitment = `0x${(0x9000n + BigInt(input.seed)).toString(16).padStart(64, "0")}` as const;
  const noteSecret = `0x${(0x9100n + BigInt(input.seed)).toString(16).padStart(64, "0")}` as const;
  const commitment = await deriveBrowserNoteCommitment({
    assetId: SANDBOX_NATIVE_ETH_ASSET_ID,
    noteAmountWei: input.amountWei,
    ownerCommitment,
    noteSecret
  });
  const plaintext: SpendMaterialPlaintext = {
    version: "spend-material-v1",
    chainId,
    pool,
    assetId: SANDBOX_NATIVE_ETH_ASSET_ID,
    noteAmountWei: input.amountWei,
    ownerCommitment,
    noteSecret,
    blinding: `0x${(0x9200n + BigInt(input.seed)).toString(16).padStart(64, "0")}`,
    commitment,
    createdAt: `2026-05-07T00:00:0${input.seed}.000Z`
  };
  const recoveryKey = await deriveWalletRecoveryKey({
    walletSignature,
    chainId,
    pool,
    appId: input.appId ?? NULLARK_RECOVERY_APP_ID,
    recoveryVersion: 1
  });
  const noteKey = await deriveNoteKey(recoveryKey, {
    commitment,
    epochId: input.epochId ?? getShieldedTransfersRecoveryEpochId({ chainId })
  });
  const aad = makeRecoveryAssociatedData({
    chainId,
    pool,
    action: input.action,
    commitment,
    encryptionVersion: 1
  });
  const encryptedNote = serializeEncryptedNoteEnvelopeToHex(
    await encryptSpendMaterialEnvelope({ noteKey, plaintext, aad })
  );
  const encoded =
    input.action === "deposit"
      ? {
          topics: [DEPOSIT_NOTE_CREATED_TOPIC, commitment, bytes32(input.leafIndex)],
          data: encodeAbiParameters(
            [
              { name: "encryptedNote", type: "bytes" },
              { name: "encryptionVersion", type: "uint16" }
            ],
            [encryptedNote, 1]
          )
        }
      : {
          topics: [
            input.action === "withdraw-output" ? WITHDRAWAL_OUTPUT_NOTE_CREATED_TOPIC : WITHDRAWAL_CHANGE_NOTE_CREATED_TOPIC,
            commitment,
            `0x${(0x9300n + BigInt(input.seed)).toString(16).padStart(64, "0")}`,
            bytes32(input.leafIndex)
          ],
          data: encodeAbiParameters(
            [
              { name: "grossAmount", type: "uint256" },
              { name: "encryptedNote", type: "bytes" },
              { name: "encryptionVersion", type: "uint16" }
            ],
            [1n, encryptedNote, 1]
          )
        };

  return {
    plaintext,
    log: {
      address: pool,
      topics: encoded.topics as HexString[],
      data: encoded.data,
      transactionHash: `0x${(0x9400n + BigInt(input.seed)).toString(16).padStart(64, "0")}`
    }
  };
}

async function createEncryptedV2OutputRecoveryLog(input: {
  amountWei: string;
  seed: number;
  leafIndex: number;
  chainId?: typeof MEGAETH_TESTNET_CHAIN_ID | typeof MEGAETH_MAINNET_CHAIN_ID;
  pool?: HexString;
  envelopePool?: HexString;
  envelopeOutputCommitment?: HexString;
}): Promise<{
  plaintext: SpendMaterialPlaintext;
  log: {
    address: HexString;
    topics: HexString[];
    data: HexString;
    transactionHash: HexString;
  };
}> {
  const chainId = input.chainId ?? MEGAETH_TESTNET_CHAIN_ID;
  const pool = input.pool ?? SHIELDED_POOL_ADDRESS;
  const ownerCommitment = `0x${(0xa000n + BigInt(input.seed)).toString(16).padStart(64, "0")}` as const;
  const noteSecret = `0x${(0xa100n + BigInt(input.seed)).toString(16).padStart(64, "0")}` as const;
  const commitment = await deriveBrowserOutputNoteCommitment({
    assetId: SANDBOX_NATIVE_ETH_ASSET_ID,
    noteAmountWei: input.amountWei,
    ownerCommitment,
    noteSecret
  });
  const plaintext: SpendMaterialPlaintext = {
    version: "spend-material-v1",
    chainId,
    pool,
    assetId: SANDBOX_NATIVE_ETH_ASSET_ID,
    noteAmountWei: input.amountWei,
    ownerCommitment,
    noteSecret,
    blinding: `0x${(0xa200n + BigInt(input.seed)).toString(16).padStart(64, "0")}`,
    commitment,
    createdAt: `2026-05-07T00:00:${String(input.seed).padStart(2, "0")}.000Z`
  };
  const recoveryKey = await deriveWalletRecoveryKey({
    walletSignature,
    chainId,
    pool,
    appId: NULLARK_RECOVERY_APP_ID,
    recoveryVersion: 1
  });
  const noteKey = await deriveNoteKey(recoveryKey, {
    commitment,
    epochId: getShieldedTransfersRecoveryEpochId({ chainId })
  });
  const aad = makeRecoveryAssociatedData({
    chainId,
    pool,
    action: "withdraw-output",
    commitment,
    encryptionVersion: 1
  });
  const innerEnvelope = await encryptCompactOutputNoteV2Payload({ noteKey, plaintext, aad });
  const encryptedNote = serializeEncryptedOutputNoteV2EnvelopeToHex(
    createEncryptedOutputNoteV2Envelope({
      chainId,
      verifyingContract: input.envelopePool ?? pool,
      outputCommitment: input.envelopeOutputCommitment ?? commitment,
      nonce: innerEnvelope.nonce,
      ciphertext: innerEnvelope.ciphertext
    })
  );

  return {
    plaintext,
    log: {
      address: pool,
      topics: [
        WITHDRAWAL_OUTPUT_NOTE_CREATED_TOPIC,
        commitment,
        `0x${(0xa300n + BigInt(input.seed)).toString(16).padStart(64, "0")}`,
        bytes32(input.leafIndex)
      ],
      data: encodeAbiParameters(
        [
          { name: "grossAmount", type: "uint256" },
          { name: "encryptedNote", type: "bytes" },
          { name: "encryptionVersion", type: "uint16" }
        ],
        [1n, encryptedNote, 2]
      ),
      transactionHash: `0x${(0xa400n + BigInt(input.seed)).toString(16).padStart(64, "0")}`
    }
  };
}

function bytes32(value: number | bigint): HexString {
  return `0x${BigInt(value).toString(16).padStart(64, "0")}`;
}

async function deriveBrowserOutputNoteCommitment(input: {
  assetId: HexString;
  noteAmountWei: string;
  ownerCommitment: HexString;
  noteSecret: HexString;
}): Promise<HexString> {
  const hash = await createBrowserPoseidonFieldHash();
  const commitment = hash([
    10_001n,
    BigInt(input.assetId),
    BigInt(input.noteAmountWei),
    BigInt(input.ownerCommitment),
    BigInt(input.noteSecret)
  ]);

  return bytes32(commitment);
}

async function encryptCompactOutputNoteV2Payload(input: {
  noteKey: CryptoKey;
  plaintext: SpendMaterialPlaintext;
  aad: Uint8Array;
}): Promise<{ nonce: HexString; ciphertext: HexString }> {
  const nonce = crypto.getRandomValues(new Uint8Array(24));
  const encoded = new TextEncoder().encode(JSON.stringify([
    input.plaintext.noteAmountWei,
    strip0x(input.plaintext.ownerCommitment),
    strip0x(input.plaintext.noteSecret),
    strip0x(input.plaintext.blinding)
  ]));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: asArrayBuffer(nonce.slice(0, 12)), additionalData: asArrayBuffer(input.aad) },
    input.noteKey,
    asArrayBuffer(encoded)
  );

  return {
    nonce: bytesToHex(nonce),
    ciphertext: bytesToHex(new Uint8Array(encrypted))
  };
}

function strip0x(value: HexString): string {
  return value.slice(2);
}

function bytesToHex(bytes: Uint8Array): HexString {
  return `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function asArrayBuffer(value: Uint8Array): ArrayBuffer {
  return new Uint8Array(value).buffer;
}
