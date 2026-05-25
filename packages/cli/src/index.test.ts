import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import {
  createRecoveryKitV1,
  deriveNoteCommitment,
  encodeNullifierLookupCalldata,
  encodeV12UnlinkableWithdrawOutputNoteCalldata,
  encodeWithdrawBoundedCalldata,
  getCurrentRuntime,
  getRuntimeForNetwork,
  serializeRecoveryKitV1,
  V12_UNLINKABLE_WITHDRAW_PUBLIC_INPUT_ORDER,
  type HexString,
  type NullarkCurrentRuntime,
  type RecoveredWalletNote,
  type RootAcceptedLogRecord
} from "@nullark/sdk";
import { createNullarkCliSession, runNullarkCli, type CliIo, type CliOptions } from "./index.js";

const bytes32 = (byte: string): HexString => `0x${byte.repeat(32)}`;
const publicInputs = Array.from({ length: 12 }, (_, index) => bytes32((index + 1).toString(16).padStart(2, "0")));
const TEST_DESTINATION_ADDRESS = "0x000000000000000000000000000000000000dEaD";
const PROVING_ARTIFACT_DIR = fileURLToPath(new URL("../../../apps/web/public/proving", import.meta.url));

function captureIo(): { io: CliIo; stdout: string[]; stderr: string[] } {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    stdout,
    stderr,
    io: {
      stdout: (line) => stdout.push(line),
      stderr: (line) => stderr.push(line)
    }
  };
}

function calldata(): string {
  return encodeWithdrawBoundedCalldata({
    proof: "0x1234",
    publicInputs,
    nullifier: bytes32("aa"),
    destination: TEST_DESTINATION_ADDRESS,
    grossAmountWei: "10001",
    minNetAmountWei: "9900",
    maxFeeWei: "101"
  });
}

function uint256Bytes32(value: string | number | bigint): HexString {
  return `0x${BigInt(value).toString(16).padStart(64, "0")}`;
}

function addressBytes32(address: string): HexString {
  return `0x${"0".repeat(24)}${address.slice(2).toLowerCase()}`;
}

function planBoundPublicInputs(input: {
  root: HexString;
  nullifier: HexString;
  destination: string;
  grossAmountWei: string;
  feeWei: string;
  pool: string;
  noteAmountWei: string;
  chainId?: number;
}): HexString[] {
  return [
    input.root,
    input.nullifier,
    bytes32("00"),
    addressBytes32(input.destination),
    uint256Bytes32(input.grossAmountWei),
    uint256Bytes32(input.feeWei),
    uint256Bytes32(input.chainId ?? 4326),
    addressBytes32(input.pool),
    bytes32("07"),
    uint256Bytes32(input.noteAmountWei),
    bytes32("08"),
    bytes32("09")
  ];
}

function v12PlanBoundPublicInputs(input: {
  root: HexString;
  nullifier: HexString;
  destination: string;
  grossAmountWei: string;
  feeWei: string;
  pool: string;
  outputCommitment?: HexString;
  chainId?: number;
  proofContextHash?: HexString;
  encryptedOutputNoteHash?: HexString;
}): HexString[] {
  return [
    input.root,
    input.nullifier,
    input.outputCommitment ?? bytes32("0b"),
    addressBytes32(input.destination),
    uint256Bytes32(input.grossAmountWei),
    uint256Bytes32(input.feeWei),
    uint256Bytes32(input.chainId ?? 4326),
    addressBytes32(input.pool),
    input.proofContextHash ?? bytes32("07"),
    input.encryptedOutputNoteHash ?? bytes32("08")
  ];
}

function v12Calldata(input: {
  publicInputs?: HexString[];
  nullifier?: HexString;
  destination?: string;
  grossAmountWei?: string;
  minNetAmountWei?: string;
  maxFeeWei?: string;
  pool?: string;
  chainId?: number;
} = {}): string {
  const nullifier = input.nullifier ?? bytes32("aa");
  const destination = input.destination ?? TEST_DESTINATION_ADDRESS;
  const grossAmountWei = input.grossAmountWei ?? "10001";
  const maxFeeWei = input.maxFeeWei ?? "101";
  const publicInputBinding = {
    root: bytes32("01"),
    nullifier,
    destination,
    grossAmountWei,
    feeWei: maxFeeWei,
    pool: input.pool ?? getCurrentRuntime().pool,
    ...(input.chainId === undefined ? {} : { chainId: input.chainId })
  };
  return encodeV12UnlinkableWithdrawOutputNoteCalldata({
    proof: "0x1234",
    publicInputs: input.publicInputs ?? v12PlanBoundPublicInputs(publicInputBinding),
    nullifier,
    destination,
    grossAmountWei,
    minNetAmountWei: input.minNetAmountWei ?? "9900",
    maxFeeWei,
    encryptedOutputNote: "0xabcd"
  });
}

function v12CandidateRuntime(): NullarkCurrentRuntime {
  const runtime = getRuntimeForNetwork("megaeth-testnet");
  return {
    ...runtime,
    schema: "nullark-sdk-runtime-v1-2-candidate-v1",
    productVersion: "nullark-v1.2-fee-governance",
    withdrawalFeeBps: 50,
    maxWithdrawalFeeBps: 100,
    artifactTrustMode: "testnet-local-dev-untrusted",
    feePolicy: {
      activeFeeBps: 50,
      maxFeeBps: 100,
      pendingFeeState: {
        pendingFeeBps: null,
        pendingFeeActivationTime: null,
        source: "on-chain-feeBps"
      }
    },
    groth16PublicInputOrder: V12_UNLINKABLE_WITHDRAW_PUBLIC_INPUT_ORDER
  };
}

function unapprovedV12MainnetRuntime(): NullarkCurrentRuntime {
  const { v1_2Readiness: _readiness, ...runtime } = getCurrentRuntime();
  return runtime;
}

describe("nullark cli", () => {
  it("refuses private material flags on every command", async () => {
    const { io, stderr } = captureIo();
    const result = await runNullarkCli(["config", "show", "--wallet-signature", "0xsecret"], io);

    expect(result.exitCode).toBe(1);
    expect(stderr[0]).toContain("Do not pass note secrets");
  });

  it("exposes notes commands without accepting unsafe terminal unlock material", async () => {
    const recoverIo = captureIo();
    const recoverResult = await runNullarkCli(
      ["notes", "recover", "--network", "megaeth-mainnet", "--wallet", "0x1111111111111111111111111111111111111111"],
      recoverIo.io
    );
    expect(recoverResult.exitCode).toBe(1);
    expect(recoverIo.stderr[0]).toContain("requires an external signer adapter");
    expect(recoverIo.stderr[0]).not.toContain("signature");

    const listIo = captureIo();
    const listResult = await runNullarkCli(["notes", "list"], listIo.io);
    expect(listResult.exitCode).toBe(0);
    expect(listIo.stdout[0]).toContain("\"notes\": []");
    expect(listIo.stdout[0]).toContain("memory-only");
  });

  it("shows the explicit Nullark testnet runtime without falling back to mainnet", async () => {
    const { io, stdout, stderr } = captureIo();
    const result = await runNullarkCli(["config", "show", "--network", "megaeth-testnet"], io);

    expect(result.exitCode).toBe(0);
    expect(stderr).toEqual([]);
    expect(stdout[0]).toContain("\"environment\": \"megaeth-testnet-nullark\"");
    expect(stdout[0]).toContain("\"chainId\": 6343");
    expect(stdout[0]).toContain("\"rpcUrl\": \"https://carrot.megaeth.com/rpc\"");
    expect(stdout[0]).toContain("\"artifactTrustMode\": \"testnet-local-dev-untrusted\"");
    expect(stdout[0]).not.toContain("\"relayerEndpoint\": \"https://relayer.nullark.com/transaction\"");
  });

  it("surfaces v1.2 as the current public config summary", async () => {
    const { io, stdout, stderr } = captureIo();
    const result = await runNullarkCli(["config", "show"], io);

    expect(result.exitCode).toBe(0);
    expect(stderr).toEqual([]);
    expect(stdout[0]).toContain("\"currentRuntime\": \"v1_2\"");
    expect(stdout[0]).toContain("\"defaultDepositRuntime\": \"v1_2\"");
    expect(stdout[0]).toContain("\"v1_2\": {");
    expect(stdout[0]).toContain("\"status\": \"current\"");
    expect(stdout[0]).toContain("\"advertised\": true");
    expect(stdout[0]).toContain("\"ready\": true");
    expect(stdout[0]).toContain("package-pinned current runtime");
  });

  it("blocks injected unapproved v1.2 mainnet runtime selection at the CLI boundary", async () => {
    const { io, stderr } = captureIo();
    const result = await runNullarkCli(["config", "show", "--network", "megaeth-mainnet"], io, {
      runtimeForNetwork: () => unapprovedV12MainnetRuntime()
    });

    expect(result.exitCode).toBe(1);
    expect(stderr[0]).toContain("v1.2 CLI runtime is blocked");
    expect(stderr[0]).toContain("package-pinned promotion evidence");
  });

  it("labels testnet artifact verification as accepted but not mainnet-trusted", async () => {
    const { io, stdout, stderr } = captureIo();
    const result = await runNullarkCli(
      ["artifacts", "verify", "--network", "megaeth-testnet", "--artifact-dir", PROVING_ARTIFACT_DIR],
      io
    );

    expect(result.exitCode).toBe(0);
    expect(stderr).toEqual([]);
    expect(stdout[0]).toContain("\"acceptedForLocalProof\": true");
    expect(stdout[0]).toContain("\"trusted\": false");
    expect(stdout[0]).toContain("\"artifactTrustMode\": \"testnet-local-dev-untrusted\"");
  });

  it("plans a recovered testnet note against the testnet pool", async () => {
    const runtime = getRuntimeForNetwork("megaeth-testnet");
    const session = createNullarkCliSession();
    const recoveredNote: RecoveredWalletNote = {
      summary: {
        id: "note_testnet_0",
        commitment: `0x01${"11".repeat(31)}`,
        amountWei: "10000000000000000",
        spent: false,
        leafIndex: 0,
        transactionHash: `0x04${"44".repeat(31)}`
      },
      spendMaterial: {
        version: "spend-material-v1",
        chainId: 6343,
        pool: runtime.pool,
        assetId: `0x${"00".repeat(31)}01`,
        noteAmountWei: "10000000000000000",
        ownerCommitment: `0x02${"22".repeat(31)}`,
        noteSecret: `0x03${"33".repeat(31)}`,
        blinding: `0x05${"55".repeat(31)}`,
        commitment: `0x01${"11".repeat(31)}`,
        createdAt: "2026-05-20T00:00:00.000Z"
      },
      nullifier: `0x06${"66".repeat(31)}`
    };
    const recoverIo = captureIo();
    await runNullarkCli(
      ["notes", "recover", "--network", "megaeth-testnet", "--wallet", "0x1111111111111111111111111111111111111111"],
      recoverIo.io,
      { session, recoverWalletNotes: async () => [recoveredNote] }
    );

    const planIo = captureIo();
    const result = await runNullarkCli(
      [
        "withdraw",
        "plan",
        "--network",
        "megaeth-testnet",
        "--note",
        "note_testnet_0",
        "--to",
        TEST_DESTINATION_ADDRESS,
        "--amount",
        "max"
      ],
      planIo.io,
      { session }
    );

    expect(result.exitCode).toBe(0);
    expect(planIo.stdout[0]).toContain("\"chainId\": 6343");
    expect(planIo.stdout[0]).toContain(`"pool": "${runtime.pool}"`);
    expect(planIo.stdout[0]).toContain("\"feeWei\": \"33000000000000\"");
  });

  it("recovers notes through an injected signer/recovery adapter and plans by note id without printing spend material", async () => {
    const session = createNullarkCliSession();
    const noteSecret = `0x03${"33".repeat(31)}` as const;
    const recoveredNote: RecoveredWalletNote = {
      summary: {
        id: "note_abcdef12_0",
        commitment: `0x01${"11".repeat(31)}`,
        amountWei: "100000000000000000",
        spent: false,
        leafIndex: 0,
        transactionHash: `0x04${"44".repeat(31)}`
      },
      spendMaterial: {
        version: "spend-material-v1",
        chainId: 4326,
        pool: getCurrentRuntime().pool,
        assetId: `0x${"00".repeat(31)}01`,
        noteAmountWei: "100000000000000000",
        ownerCommitment: `0x02${"22".repeat(31)}`,
        noteSecret,
        blinding: `0x05${"55".repeat(31)}`,
        commitment: `0x01${"11".repeat(31)}`,
        createdAt: "2026-05-20T00:00:00.000Z"
      },
      nullifier: `0x06${"66".repeat(31)}`
    };
    const options: CliOptions = {
      session,
      recoverWalletNotes: async () => [recoveredNote],
      proveWithdrawalPlan: async ({ plan }) => {
        const currentRoot = bytes32("01");
        const nullifier = bytes32("aa");
        const boundInputs = v12PlanBoundPublicInputs({
          root: currentRoot,
          nullifier,
          destination: plan.destination,
          grossAmountWei: plan.grossAmountWei,
          feeWei: plan.feeWei,
          pool: plan.pool
        });
        return {
          id: "proof_1",
          planId: plan.id,
          proof: "0x1234",
          publicInputs: boundInputs,
          nullifier,
          calldata: v12Calldata({
            publicInputs: boundInputs,
            nullifier,
            destination: plan.destination,
            grossAmountWei: plan.grossAmountWei,
            minNetAmountWei: plan.netAmountWei,
            maxFeeWei: plan.feeWei,
            pool: plan.pool
          }),
          currentRoot,
          submitVia: plan.submitVia
        };
      }
    };

    const recoverIo = captureIo();
    const recoverResult = await runNullarkCli(
      ["notes", "recover", "--network", "megaeth-mainnet", "--wallet", "0x1111111111111111111111111111111111111111"],
      recoverIo.io,
      options
    );
    expect(recoverResult.exitCode).toBe(0);
    expect(recoverIo.stdout[0]).toContain("\"kind\": \"notes-recovered\"");
    expect(recoverIo.stdout[0]).toContain("note_abcdef12_0");
    expect(recoverIo.stdout[0]).not.toContain(noteSecret);

    const listIo = captureIo();
    const listResult = await runNullarkCli(["notes", "list"], listIo.io, options);
    expect(listResult.exitCode).toBe(0);
    expect(listIo.stdout[0]).toContain("note_abcdef12_0");
    expect(listIo.stdout[0]).not.toContain(noteSecret);

    const planIo = captureIo();
    const planResult = await runNullarkCli(
      [
        "withdraw",
        "plan",
        "--network",
        "megaeth-mainnet",
        "--note",
        "note_abcdef12_0",
        "--to",
        TEST_DESTINATION_ADDRESS,
        "--amount",
        "max",
        "--submit-via",
        "relayer"
      ],
      planIo.io,
      options
    );
    expect(planResult.exitCode).toBe(0);
    expect(planIo.stdout[0]).toContain("\"id\": \"plan_1\"");
    expect(planIo.stdout[0]).toContain("\"grossAmountWei\": \"100000000000000000\"");
    expect(planIo.stdout[0]).toContain("\"feeWei\": \"330000000000000\"");
    expect(planIo.stdout[0]).toContain("does not recover notes");
    expect(planIo.stdout[0]).not.toContain(noteSecret);

    const proveIo = captureIo();
    const proveResult = await runNullarkCli(
      ["withdraw", "prove", "--network", "megaeth-mainnet", "--plan", "plan_1"],
      proveIo.io,
      options
    );
    expect(proveIo.stderr).toEqual([]);
    expect(proveResult.exitCode).toBe(0);
    expect(proveIo.stdout[0]).toContain("\"id\": \"proof_1\"");
    expect(proveIo.stdout[0]).toContain("[hidden:use---show-calldata-with-acknowledgement]");
    expect(proveIo.stdout[0]).toContain("[hidden:use---export-proof-with-acknowledgement]");
    expect(proveIo.stdout[0]).not.toContain(calldata());
    expect(proveIo.stdout[0]).not.toContain(noteSecret);

    const preflightIo = captureIo();
    const preflightResult = await runNullarkCli(
      ["withdraw", "preflight", "--network", "megaeth-mainnet", "--proof", "proof_1"],
      preflightIo.io,
      {
        ...options,
        fetchImpl: async (_url, init) => {
          const body = JSON.parse(String(init?.body ?? "{}")) as { id: number; method: string; params?: unknown[] };
          if (body.method === "eth_chainId") {
            return jsonRpc(body.id, "0x10e6");
          }
          if (body.method === "eth_call") {
            const tx = body.params?.[0] as { data?: string };
            return jsonRpc(body.id, tx.data === encodeNullifierLookupCalldata(bytes32("aa")) ? `0x${"0".repeat(64)}` : "0x");
          }
          if (body.method === "eth_estimateGas") {
            return jsonRpc(body.id, "0x5208");
          }
          throw new Error(`unexpected ${body.method}`);
        }
      }
    );
    expect(preflightResult.exitCode).toBe(0);
    expect(preflightIo.stdout[0]).toContain("\"proof\": \"proof_1\"");
    expect(preflightIo.stdout[0]).toContain("\"estimatedGas\": \"0x5208\"");
  });

  it("imports a recovery kit into the memory-only spendable session without wallet recovery", async () => {
    const runtime = getRuntimeForNetwork("megaeth-testnet");
    const session = createNullarkCliSession();
    const spendMaterial = {
      version: "spend-material-v1" as const,
      chainId: runtime.chainId,
      pool: runtime.pool,
      assetId: `0x${"00".repeat(31)}01` as const,
      noteAmountWei: "10000000000000000",
      ownerCommitment: uint256Bytes32(22),
      noteSecret: uint256Bytes32(33),
      blinding: uint256Bytes32(44),
      commitment: uint256Bytes32(55),
      createdAt: "2026-05-24T00:00:00.000Z"
    };
    spendMaterial.commitment = await deriveNoteCommitment(spendMaterial);
    const kit = serializeRecoveryKitV1(
      createRecoveryKitV1({
        runtime,
        spendMaterial,
        transactionHash: bytes32("66"),
        leafIndex: 3
      })
    );
    let walletRecoveryCalls = 0;

    const importIo = captureIo();
    const importResult = await runNullarkCli(
      ["notes", "import-kit", "--network", "megaeth-testnet", "--kit-file", "./local-kit.json"],
      importIo.io,
      {
        session,
        readTextFile: async () => kit,
        recoverWalletNotes: async () => {
          walletRecoveryCalls += 1;
          return [];
        },
        recoveryKitNullifierStatus: async () => false
      }
    );

    expect(importResult.exitCode).toBe(0);
    expect(walletRecoveryCalls).toBe(0);
    expect(importIo.stdout[0]).toContain("\"kind\": \"recovery-kit-imported\"");
    expect(importIo.stdout[0]).toContain("\"storage\": \"memory-only\"");
    expect(importIo.stdout[0]).toContain(spendMaterial.commitment);
    expect(importIo.stdout[0]).not.toContain(spendMaterial.noteSecret);

    const listIo = captureIo();
    const listResult = await runNullarkCli(["notes", "list"], listIo.io, { session });
    expect(listResult.exitCode).toBe(0);
    expect(listIo.stdout[0]).toContain(spendMaterial.commitment);
    expect(listIo.stdout[0]).not.toContain(spendMaterial.noteSecret);
  });

  it("requires explicit mainnet selection for note-backed recovery and withdrawal planning", async () => {
    const recoverIo = captureIo();
    const recoverResult = await runNullarkCli(["notes", "recover", "--wallet", "0x1111111111111111111111111111111111111111"], recoverIo.io, {
      recoverWalletNotes: async () => []
    });
    expect(recoverResult.exitCode).toBe(1);
    expect(recoverIo.stderr[0]).toContain("--network megaeth-mainnet");

    const planIo = captureIo();
    const planResult = await runNullarkCli(
      ["withdraw", "plan", "--note", "note_abcdef12_0", "--to", TEST_DESTINATION_ADDRESS, "--amount", "max"],
      planIo.io,
      { session: createNullarkCliSession() }
    );
    expect(planResult.exitCode).toBe(1);
    expect(planIo.stderr[0]).toContain("--network megaeth-mainnet");
  });

  it("rejects malformed trusted prover adapter output before storing proof state", async () => {
    const session = createNullarkCliSession();
    session.recoveredNotes.push({
      summary: {
        id: "note_badproof_0",
        commitment: `0x01${"11".repeat(31)}`,
        amountWei: "1000",
        spent: false,
        leafIndex: 0,
        transactionHash: `0x04${"44".repeat(31)}`
      },
      spendMaterial: {
        version: "spend-material-v1",
        chainId: 4326,
        pool: getCurrentRuntime().pool,
        assetId: `0x${"00".repeat(31)}01`,
        noteAmountWei: "1000",
        ownerCommitment: `0x02${"22".repeat(31)}`,
        noteSecret: `0x03${"33".repeat(31)}`,
        blinding: `0x05${"55".repeat(31)}`,
        commitment: `0x01${"11".repeat(31)}`,
        createdAt: "2026-05-20T00:00:00.000Z"
      },
      nullifier: `0x06${"66".repeat(31)}`
    });
    const planIo = captureIo();
    await runNullarkCli(
      [
        "withdraw",
        "plan",
        "--network",
        "megaeth-mainnet",
        "--note",
        "note_badproof_0",
        "--to",
        TEST_DESTINATION_ADDRESS,
        "--amount",
        "max"
      ],
      planIo.io,
      { session }
    );

    const proveIo = captureIo();
    const proveResult = await runNullarkCli(["withdraw", "prove", "--network", "megaeth-mainnet", "--plan", "plan_1"], proveIo.io, {
      session,
      proveWithdrawalPlan: async () => ({
        id: "proof_1",
        planId: "wrong_plan",
        proof: "0x1234",
        publicInputs,
        nullifier: bytes32("aa"),
        calldata: calldata(),
        currentRoot: publicInputs[0] ?? bytes32("01"),
        submitVia: "relayer"
      })
    });
    expect(proveResult.exitCode).toBe(1);
    expect(proveIo.stderr[0]).toContain("wrong withdrawal plan");
    expect(session.proofBundles).toEqual([]);
  });

  it("rejects trusted prover adapter calldata that does not match the selected plan", async () => {
    const session = createNullarkCliSession();
    const runtime = getCurrentRuntime();
    session.recoveredNotes.push({
      summary: {
        id: "note_wrongcalldata_0",
        commitment: `0x01${"11".repeat(31)}`,
        amountWei: "1000",
        spent: false,
        leafIndex: 0,
        transactionHash: `0x04${"44".repeat(31)}`
      },
      spendMaterial: {
        version: "spend-material-v1",
        chainId: 4326,
        pool: runtime.pool,
        assetId: `0x${"00".repeat(31)}01`,
        noteAmountWei: "1000",
        ownerCommitment: `0x02${"22".repeat(31)}`,
        noteSecret: `0x03${"33".repeat(31)}`,
        blinding: `0x05${"55".repeat(31)}`,
        commitment: `0x01${"11".repeat(31)}`,
        createdAt: "2026-05-20T00:00:00.000Z"
      },
      nullifier: `0x06${"66".repeat(31)}`
    });
    await runNullarkCli(
      [
        "withdraw",
        "plan",
        "--network",
        "megaeth-mainnet",
        "--note",
        "note_wrongcalldata_0",
        "--to",
        TEST_DESTINATION_ADDRESS,
        "--amount",
        "max"
      ],
      captureIo().io,
      { session }
    );

    const currentRoot = bytes32("01");
    const nullifier = bytes32("aa");
    const boundInputs = v12PlanBoundPublicInputs({
      root: currentRoot,
      nullifier,
      destination: TEST_DESTINATION_ADDRESS,
      grossAmountWei: "1000",
      feeWei: "3",
      pool: runtime.pool
    });
    const proveIo = captureIo();
    const proveResult = await runNullarkCli(["withdraw", "prove", "--network", "megaeth-mainnet", "--plan", "plan_1"], proveIo.io, {
      session,
      proveWithdrawalPlan: async ({ plan }) => ({
        id: "proof_1",
        planId: plan.id,
        proof: "0x1234",
        publicInputs: boundInputs,
        nullifier,
        calldata: v12Calldata({
          publicInputs: boundInputs,
          nullifier,
          destination: "0x000000000000000000000000000000000000bEEF",
          grossAmountWei: plan.grossAmountWei,
          minNetAmountWei: plan.netAmountWei,
          maxFeeWei: plan.feeWei,
          pool: runtime.pool
        }),
        currentRoot,
        submitVia: plan.submitVia
      })
    });

    expect(proveResult.exitCode).toBe(1);
    expect(proveIo.stderr[0]).toContain("calldata destination does not match");
    expect(session.proofBundles).toEqual([]);
  });

  it("proves a max withdrawal through the SDK artifact and Groth16 adapter path", async () => {
    const runtime = getCurrentRuntime();
    const session = createNullarkCliSession();
    const field = `0x02${"22".repeat(31)}` as const;
    const commitment = "0x1ab4558bf88a84386719c9eefae2377ac65e721c22733259cee94a61c5a490bb" as const;
    session.recoveredNotes.push({
      summary: {
        id: "note_sdkprove_0",
        commitment,
        amountWei: "123456789000000000",
        spent: false,
        leafIndex: 0,
        transactionHash: `0x04${"44".repeat(31)}`
      },
      spendMaterial: {
        version: "spend-material-v1",
        chainId: runtime.chainId,
        pool: runtime.pool,
        assetId: `0x${"00".repeat(31)}01`,
        noteAmountWei: "123456789000000000",
        ownerCommitment: field,
        noteSecret: field,
        blinding: field,
        commitment,
        createdAt: "2026-05-20T00:00:00.000Z"
      },
      nullifier: bytes32("06")
    });

    const planIo = captureIo();
    await runNullarkCli(
      [
        "withdraw",
        "plan",
        "--network",
        "megaeth-mainnet",
        "--note",
        "note_sdkprove_0",
        "--to",
        TEST_DESTINATION_ADDRESS,
        "--amount",
        "max"
      ],
      planIo.io,
      { session }
    );

    const proveIo = captureIo();
    const proveResult = await runNullarkCli(
      ["withdraw", "prove", "--network", "megaeth-mainnet", "--plan", "plan_1", "--artifact-dir", PROVING_ARTIFACT_DIR],
      proveIo.io,
      {
        session,
        rootAcceptedLogs: async (): Promise<RootAcceptedLogRecord[]> => [
          { root: bytes32("00"), previousRoot: bytes32("00"), insertedCommitment: bytes32("00") },
          { root: bytes32("00"), previousRoot: bytes32("00"), insertedCommitment: commitment }
        ],
        proverRunner: {
          async fullProve(witness) {
            return {
              proof: {
                pi_a: ["1", "2", "1"],
                pi_b: [
                  ["3", "4"],
                  ["5", "6"],
                  ["1", "0"]
                ],
                pi_c: ["7", "8", "1"]
              },
              publicSignals: [
                witness.root,
                witness.nullifier,
                witness.outputCommitment,
                witness.destination,
                witness.grossAmount,
                witness.fee,
                witness.chainId,
                witness.verifyingContract,
                witness.proofContextHash,
                witness.encryptedOutputNoteHash
              ] as string[]
            };
          }
        }
      }
    );

    expect(proveIo.stderr).toEqual([]);
    expect(proveResult.exitCode).toBe(0);
    expect(proveIo.stdout[0]).toContain("\"id\": \"proof_1\"");
    expect(proveIo.stdout[0]).toContain("[hidden:use---show-calldata-with-acknowledgement]");
    expect(session.proofBundles[0]?.calldata.startsWith("0x678d8506")).toBe(true);
  });

  it("proves a max withdrawal against the explicit testnet runtime with local-dev artifacts", async () => {
    const runtime = getRuntimeForNetwork("megaeth-testnet");
    const session = createNullarkCliSession();
    const field = `0x02${"22".repeat(31)}` as const;
    const commitment = "0x1ab4558bf88a84386719c9eefae2377ac65e721c22733259cee94a61c5a490bb" as const;
    session.recoveredNotes.push({
      summary: {
        id: "note_sdkprove_testnet_0",
        commitment,
        amountWei: "123456789000000000",
        spent: false,
        leafIndex: 0,
        transactionHash: `0x04${"44".repeat(31)}`
      },
      spendMaterial: {
        version: "spend-material-v1",
        chainId: 6343,
        pool: runtime.pool,
        assetId: `0x${"00".repeat(31)}01`,
        noteAmountWei: "123456789000000000",
        ownerCommitment: field,
        noteSecret: field,
        blinding: field,
        commitment,
        createdAt: "2026-05-20T00:00:00.000Z"
      },
      nullifier: bytes32("06")
    });

    await runNullarkCli(
      [
        "withdraw",
        "plan",
        "--network",
        "megaeth-testnet",
        "--note",
        "note_sdkprove_testnet_0",
        "--to",
        TEST_DESTINATION_ADDRESS,
        "--amount",
        "max"
      ],
      captureIo().io,
      { session }
    );

    const proveIo = captureIo();
    const proveResult = await runNullarkCli(
      ["withdraw", "prove", "--network", "megaeth-testnet", "--plan", "plan_1", "--artifact-dir", PROVING_ARTIFACT_DIR],
      proveIo.io,
      {
        session,
        rootAcceptedLogs: async (): Promise<RootAcceptedLogRecord[]> => [
          { root: bytes32("00"), previousRoot: bytes32("00"), insertedCommitment: bytes32("00") },
          { root: bytes32("00"), previousRoot: bytes32("00"), insertedCommitment: commitment }
        ],
        proverRunner: {
          async fullProve(witness) {
            return {
              proof: {
                pi_a: ["1", "2", "1"],
                pi_b: [
                  ["3", "4"],
                  ["5", "6"],
                  ["1", "0"]
                ],
                pi_c: ["7", "8", "1"]
              },
              publicSignals: [
                witness.root,
                witness.nullifier,
                witness.outputCommitment,
                witness.destination,
                witness.grossAmount,
                witness.fee,
                witness.chainId,
                witness.verifyingContract,
                witness.proofContextHash,
                witness.encryptedOutputNoteHash
              ] as string[]
            };
          }
        }
      }
    );

    expect(proveIo.stderr).toEqual([]);
    expect(proveResult.exitCode).toBe(0);
    expect(proveIo.stdout[0]).toContain("\"id\": \"proof_1\"");
    expect(session.proofBundles[0]?.publicInputs[6]).toBe(uint256Bytes32(6343));
    expect(session.proofBundles[0]?.calldata.startsWith("0x678d8506")).toBe(true);
  });

  it("allows note-backed planning through an explicit testnet v1.2 candidate runtime", async () => {
    const runtime = v12CandidateRuntime();
    const session = createNullarkCliSession();
    const field = `0x02${"22".repeat(31)}` as const;
    const commitment = "0x1ab4558bf88a84386719c9eefae2377ac65e721c22733259cee94a61c5a490bb" as const;
    session.recoveredNotes.push({
      summary: {
        id: "note_v12_sdkprove_testnet_0",
        commitment,
        amountWei: "123456789000000000",
        spent: false,
        leafIndex: 0,
        transactionHash: `0x04${"44".repeat(31)}`
      },
      spendMaterial: {
        version: "spend-material-v1",
        chainId: runtime.chainId,
        pool: runtime.pool,
        assetId: `0x${"00".repeat(31)}01`,
        noteAmountWei: "123456789000000000",
        ownerCommitment: field,
        noteSecret: field,
        blinding: field,
        commitment,
        createdAt: "2026-05-20T00:00:00.000Z"
      },
      nullifier: bytes32("06")
    });
    const options: CliOptions = {
      session,
      runtimeForNetwork: () => runtime,
      rootAcceptedLogs: async (): Promise<RootAcceptedLogRecord[]> => [
        { root: bytes32("00"), previousRoot: bytes32("00"), insertedCommitment: bytes32("00") },
        { root: bytes32("00"), previousRoot: bytes32("00"), insertedCommitment: commitment }
      ],
      proverRunner: {
        async fullProve(witness) {
          expect(Object.keys(witness)).not.toContain("spentCommitment");
          expect(Object.keys(witness)).not.toContain("noteAmount");
          expect(Object.keys(witness)).not.toContain("encryptedNoteHash");
          return {
            proof: {
              pi_a: ["1", "2", "1"],
              pi_b: [
                ["3", "4"],
                ["5", "6"],
                ["1", "0"]
              ],
              pi_c: ["7", "8", "1"]
            },
            publicSignals: [
              witness.root,
              witness.nullifier,
              witness.outputCommitment,
              witness.destination,
              witness.grossAmount,
              witness.fee,
              witness.chainId,
              witness.verifyingContract,
              witness.proofContextHash,
              witness.encryptedOutputNoteHash
            ] as string[]
          };
        }
      }
    };

    const planIo = captureIo();
    const planResult = await runNullarkCli(
      [
        "withdraw",
        "plan",
        "--network",
        "megaeth-testnet",
        "--note",
        "note_v12_sdkprove_testnet_0",
        "--to",
        TEST_DESTINATION_ADDRESS,
        "--amount",
        "max"
      ],
      planIo.io,
      options
    );

    expect(planResult.exitCode).toBe(0);
    expect(planIo.stderr).toEqual([]);
    expect(session.withdrawalPlans).toHaveLength(1);
    expect(session.withdrawalPlans[0]?.publicInputSchema).toBe("v1.2-unlinkable");
  });


  it("prints a public runtime summary without operator-only evidence paths", async () => {
    const { io, stdout, stderr } = captureIo();
    const result = await runNullarkCli(["config", "show"], io);

    expect(result.exitCode).toBe(0);
    expect(stderr).toEqual([]);
    expect(stdout[0]).toContain("\"chainId\": 4326");
    expect(stdout[0]).not.toContain("docs/evidence");
  });

  it("documents the v1.2 mainnet runtime in help output", async () => {
    const { io, stdout, stderr } = captureIo();
    const result = await runNullarkCli(["help"], io);

    expect(result.exitCode).toBe(0);
    expect(stderr).toEqual([]);
    expect(stdout[0]).toContain("v1.2 is current for MegaETH mainnet");
    expect(stdout[0]).toContain("Production privacy claims remain disabled");
  });

  it("resolves artifacts from an explicit HTTPS base URL", async () => {
    const { io, stdout } = captureIo();
    const result = await runNullarkCli(["artifacts", "resolve", "--artifact-base-url", "https://nullark.com"], io);

    expect(result.exitCode).toBe(0);
    expect(stdout[0]).toContain("https://nullark.com/proving/withdraw.wasm");
  });

  it("fails closed for artifacts verify without an explicit local artifact directory", async () => {
    const { io, stderr } = captureIo();
    const result = await runNullarkCli(["artifacts", "verify"], io);

    expect(result.exitCode).toBe(1);
    expect(stderr[0]).toContain("--artifact-dir");
  });

  it("builds a redacted withdrawal relay plan without submitting", async () => {
    const { io, stdout } = captureIo();
    const proofCalldata = v12Calldata();
    const result = await runNullarkCli(["withdraw", "plan", "--calldata", proofCalldata, "--submit-via", "relayer"], io);

    expect(result.exitCode).toBe(0);
    expect(stdout[0]).toContain("\"kind\": \"withdrawal-plan\"");
    expect(stdout[0]).toContain("[redacted:nullark-private-material]");
    expect(stdout[0]).not.toContain(proofCalldata);
  });

  it("builds a redacted direct-wallet plan without BigInt serialization failure", async () => {
    const { io, stdout, stderr } = captureIo();
    const result = await runNullarkCli(["withdraw", "plan", "--calldata", v12Calldata(), "--submit-via", "wallet"], io);

    expect(result.exitCode).toBe(0);
    expect(stderr).toEqual([]);
    expect(stdout[0]).toContain("\"submitVia\": \"wallet\"");
    expect(stdout[0]).toContain("\"value\": \"0\"");
    expect(stdout[0]).toContain("[redacted:nullark-private-material]");
  });

  it("refuses private material flags and submit", async () => {
    const privateFlagIo = captureIo();
    const privateResult = await runNullarkCli(
      ["withdraw", "plan", "--calldata", calldata(), "--note-secret", "0xsecret"],
      privateFlagIo.io
    );
    expect(privateResult.exitCode).toBe(1);
    expect(privateFlagIo.stderr[0]).toContain("Do not pass note secrets");

    const submitIo = captureIo();
    const submitResult = await runNullarkCli(["withdraw", "submit", "--calldata", calldata()], submitIo.io);
    expect(submitResult.exitCode).toBe(1);
    expect(submitIo.stderr[0]).toContain("Mainnet CLI submission is not enabled");
  });

  it("refuses private material flags before validating other withdraw plan arguments", async () => {
    const { io, stderr } = captureIo();
    const result = await runNullarkCli(["withdraw", "plan", "--note-secret", "0xsecret"], io);

    expect(result.exitCode).toBe(1);
    expect(stderr[0]).toContain("Do not pass note secrets");
  });

  it("refuses truncated selector-only withdrawal calldata", async () => {
    const { io, stderr } = captureIo();
    const result = await runNullarkCli(["withdraw", "plan", "--calldata", "0x678d850600"], io);

    expect(result.exitCode).toBe(1);
    expect(stderr[0]).toContain("complete proof-bound stage-C withdrawal calldata");
  });

  it("preflights withdrawal calldata without submitting", async () => {
    const runtime = getCurrentRuntime();
    const noteNullifier = bytes32("aa");
    const { io, stdout, stderr } = captureIo();
    const result = await runNullarkCli(
      ["withdraw", "preflight", "--calldata", calldata(), "--nullifier", noteNullifier],
      io,
      {
        fetchImpl: async (_url, init) => {
          const body = JSON.parse(String(init?.body ?? "{}")) as { id: number; method: string; params?: unknown[] };
          if (body.method === "eth_chainId") {
            return jsonRpc(body.id, "0x10e6");
          }
          if (body.method === "eth_call") {
            const tx = body.params?.[0] as { data?: string };
            return jsonRpc(body.id, tx.data === encodeNullifierLookupCalldata(noteNullifier) ? `0x${"0".repeat(64)}` : "0x");
          }
          if (body.method === "eth_estimateGas") {
            return jsonRpc(body.id, "0x5208");
          }
          throw new Error(`unexpected ${body.method}`);
        }
      }
    );

    expect(result.exitCode).toBe(0);
    expect(stderr).toEqual([]);
    expect(stdout[0]).toContain("\"kind\": \"withdrawal-preflight\"");
    expect(stdout[0]).toContain(`"pool": "${runtime.pool}"`);
    expect(stdout[0]).toContain("\"estimatedGas\": \"0x5208\"");
  });
});

function jsonRpc(id: number, result: string): Response {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id, result }), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}
