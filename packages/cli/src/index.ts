#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  buildDirectWalletWithdrawalTransaction,
  buildWithdrawalRelayerRequest,
  assertStageCWithdrawCalldataBinding,
  assertV12UnlinkableWithdrawPublicInputBinding,
  assertWithdrawPublicInputBinding,
  buildV12UnlinkableWithdrawalWitnessFromRootAcceptedLogs,
  buildWithdrawalWitnessFromRootAcceptedLogs,
  deriveNoteCommitment,
  deriveNullifier,
  createV12UnlinkableWithdrawalPlan,
  createWithdrawalPlan,
  decodeRootAcceptedLogs,
  encodeNullifierLookupCalldata,
  decodeStageCWithdrawCalldata,
  fetchRootAcceptedLogs,
  generateWithdrawalGroth16Proof,
  getCurrentRuntime,
  getRuntimeForNetwork,
  importRecoveryKitV1ToRecoveredWalletNote,
  V12_UNLINKABLE_WITHDRAW_PUBLIC_INPUT_ORDER,
  V12_DUMMY_ENCRYPTED_OUTPUT_NOTE,
  ZERO_BYTES32,
  assertV12UnlinkableWithdrawPublicInputs,
  isHexBytes32,
  isHexString,
  preflightWithdrawal,
  redactNullarkDiagnostics,
  recoverWalletNotesFromChain,
  resolveProverArtifacts,
  toPrintableNoteSummaries,
  type HexString,
  type NullarkCurrentRuntime,
  type ProverRunner,
  type RecoveredWalletNote,
  type RootAcceptedLogRecord,
  type SignerProvider,
  type NullarkNetwork,
  type WithdrawProofPublicInputSchema,
  verifyLocalProverArtifacts
} from "@nullark/sdk";

export type CliIo = {
  stdout: (line: string) => void;
  stderr: (line: string) => void;
};

export type CliResult = {
  exitCode: number;
};

export type CliOptions = {
  fetchImpl?: typeof fetch;
  signer?: SignerProvider;
  session?: NullarkCliSession;
  runtimeForNetwork?: (network: NullarkNetwork) => NullarkCurrentRuntime;
  recoverWalletNotes?: (input: { wallet: string }) => Promise<RecoveredWalletNote[]>;
  readTextFile?: (path: string) => Promise<string>;
  recoveryKitNullifierStatus?: (input: { nullifier: HexString }) => Promise<boolean>;
  proveWithdrawalPlan?: (input: { plan: CliWithdrawalPlan; note: RecoveredWalletNote }) => Promise<CliProofBundlePrivate>;
  proverRunner?: ProverRunner<Record<string, unknown>>;
  rootAcceptedLogs?: (input: { plan: CliWithdrawalPlan; note: RecoveredWalletNote }) => Promise<RootAcceptedLogRecord[]>;
};

export type NullarkCliSession = {
  recoveredNotes: RecoveredWalletNote[];
  withdrawalPlans: CliWithdrawalPlan[];
  proofBundles: CliProofBundlePrivate[];
};

export type CliWithdrawalPlan = {
  id: string;
  noteId: string;
  destination: string;
  grossAmountWei: string;
  feeWei: string;
  netAmountWei: string;
  chainId: number;
  pool: string;
  publicInputSchema: WithdrawProofPublicInputSchema;
  submitVia: "relayer" | "wallet";
  directSenderImplication: string;
  relayerTrustBoundary: string;
};

export type CliProofBundlePrivate = {
  id: string;
  planId: string;
  proof: string;
  publicInputs: readonly string[];
  nullifier: string;
  calldata: string;
  currentRoot: string;
  publicInputSchema?: WithdrawProofPublicInputSchema | undefined;
  submitVia: "relayer" | "wallet";
};

export type V12UnlinkableWithdrawProofJson = {
  schema: "nullark-v1.2-withdraw-proof-json";
  publicInputOrder: readonly (typeof V12_UNLINKABLE_WITHDRAW_PUBLIC_INPUT_ORDER)[number][];
  publicInputs: readonly HexString[];
};

type ParsedArgs = {
  command: string[];
  flags: Map<string, string | true>;
};

const V12_UNLINKABLE_WITHDRAW_PROOF_JSON_SCHEMA = "nullark-v1.2-withdraw-proof-json" as const;
const V12_BLOCKED_DRAFT_REASON =
  "v1.2 remains draft-blocked until package-pinned final readiness and owner promotion evidence is present.";
const LEGACY_V12_WITHDRAW_PUBLIC_INPUT_FIELDS = Object.freeze([
  "newCommitment",
  "spentCommitment",
  "noteAmount",
  "encryptedNoteHash"
] as const);

const DEFAULT_IO: CliIo = {
  stdout: (line) => process.stdout.write(`${line}\n`),
  stderr: (line) => process.stderr.write(`${line}\n`)
};

export function createNullarkCliSession(): NullarkCliSession {
  return {
    recoveredNotes: [],
    withdrawalPlans: [],
    proofBundles: []
  };
}

export function parseV12UnlinkableWithdrawJson(value: unknown): V12UnlinkableWithdrawProofJson {
  if (!isRecord(value)) {
    throw new Error("v1.2 unlinkable withdraw proof JSON must be an object.");
  }
  if (value.schema !== V12_UNLINKABLE_WITHDRAW_PROOF_JSON_SCHEMA) {
    throw new Error(`v1.2 unlinkable withdraw proof JSON schema must be ${V12_UNLINKABLE_WITHDRAW_PROOF_JSON_SCHEMA}.`);
  }
  if (!Array.isArray(value.publicInputOrder)) {
    throw new Error("v1.2 unlinkable withdraw proof JSON must include publicInputOrder.");
  }
  const publicInputOrder = value.publicInputOrder;

  const forbiddenFields = LEGACY_V12_WITHDRAW_PUBLIC_INPUT_FIELDS.filter((field) => publicInputOrder.includes(field));
  if (forbiddenFields.length > 0) {
    throw new Error(`v1.2 spend public inputs include forbidden public fields: ${forbiddenFields.join(", ")}`);
  }

  if (publicInputOrder.length !== V12_UNLINKABLE_WITHDRAW_PUBLIC_INPUT_ORDER.length) {
    throw new Error(
      `v1.2 unlinkable withdraw public input order must contain exactly ${V12_UNLINKABLE_WITHDRAW_PUBLIC_INPUT_ORDER.length.toString()} fields.`
    );
  }
  for (const [index, expected] of V12_UNLINKABLE_WITHDRAW_PUBLIC_INPUT_ORDER.entries()) {
    if (publicInputOrder[index] !== expected) {
      throw new Error(`v1.2 unlinkable withdraw public input at index ${index.toString()} must be ${expected}.`);
    }
  }

  if (!Array.isArray(value.publicInputs)) {
    throw new Error("v1.2 unlinkable withdraw proof JSON must include publicInputs.");
  }
  const publicInputs = assertV12UnlinkableWithdrawPublicInputs(value.publicInputs);
  return {
    schema: V12_UNLINKABLE_WITHDRAW_PROOF_JSON_SCHEMA,
    publicInputOrder: V12_UNLINKABLE_WITHDRAW_PUBLIC_INPUT_ORDER,
    publicInputs
  };
}

export async function runNullarkCli(
  argv: readonly string[],
  io: CliIo = DEFAULT_IO,
  options: CliOptions = {}
): Promise<CliResult> {
  try {
    const parsed = parseArgs(argv);
    assertNoPrivateMaterialFlags(parsed);
    const [namespace, action] = parsed.command;

    if (!namespace || namespace === "help" || parsed.flags.has("help")) {
      io.stdout(helpText());
      return { exitCode: 0 };
    }

    if (namespace === "config" && action === "show") {
      io.stdout(stringifyCliJson(publicRuntimeSummary(parsed, options)));
      return { exitCode: 0 };
    }

    if (namespace === "artifacts" && action === "resolve") {
      io.stdout(stringifyCliJson(resolveArtifactsFromFlags(parsed, options)));
      return { exitCode: 0 };
    }

    if (namespace === "artifacts" && action === "verify") {
      io.stdout(stringifyCliJson(await verifyArtifactsFromFlags(parsed, options)));
      return { exitCode: 0 };
    }

    if (namespace === "notes" && action === "recover") {
      io.stdout(stringifyCliJson(await recoverNotes(parsed, options)));
      return { exitCode: 0 };
    }

    if (namespace === "notes" && action === "import-kit") {
      io.stdout(stringifyCliJson(await importRecoveryKit(parsed, options)));
      return { exitCode: 0 };
    }

    if (namespace === "notes" && action === "list") {
      io.stdout(stringifyCliJson({ kind: "note-list", storage: "memory-only", notes: toPrintableNoteSummaries(session(options).recoveredNotes) }));
      return { exitCode: 0 };
    }

    if (namespace === "notes" && action === "inspect") {
      throw new Error("notes inspect requires an in-memory recovered note session.");
    }

    if (namespace === "withdraw" && action === "plan") {
      io.stdout(stringifyCliJson(buildWithdrawPlan(parsed, options)));
      return { exitCode: 0 };
    }

    if (namespace === "withdraw" && action === "preflight") {
      io.stdout(stringifyCliJson(await preflightWithdraw(parsed, options)));
      return { exitCode: 0 };
    }

    if (namespace === "withdraw" && action === "prove") {
      io.stdout(stringifyCliJson(await proveWithdraw(parsed, options)));
      return { exitCode: 0 };
    }

    if (namespace === "withdraw" && action === "submit") {
      throw new Error("Mainnet CLI submission is not enabled. Use withdraw plan and submit through an approved wallet flow.");
    }

    throw new Error(`Unknown command: ${parsed.command.join(" ")}`);
  } catch (error) {
    io.stderr(publicError(error));
    return { exitCode: 1 };
  }
}

function publicRuntimeSummary(parsed: ParsedArgs, options: CliOptions): unknown {
  const runtime = runtimeForParsedNetwork(parsed, options);
  const v12Current = isRuntimeApprovedV12(runtime);
  return {
    productVersion: runtime.productVersion,
    currentRuntime: v12Current ? "v1_2" : "v1_1",
    defaultDepositRuntime: v12Current ? "v1_2" : "v1_1",
    v1_2: {
      status: v12Current ? "current" : "draft-blocked",
      advertised: v12Current,
      ready: v12Current,
      reason: v12Current
        ? "v1.2 is the package-pinned current runtime for MegaETH mainnet."
        : V12_BLOCKED_DRAFT_REASON
    },
    environment: runtime.environment,
    chainId: runtime.chainId,
    rpcUrl: runtime.rpcUrl,
    pool: runtime.pool,
    merkleTreeDepth: runtime.merkleTreeDepth,
    withdrawalFeeBps: runtime.withdrawalFeeBps,
    relayerEndpoint: runtime.relayerEndpoint,
    relayerEndpointLabel: runtime.relayerEndpointLabel,
    withdrawSelector: runtime.withdrawSelector,
    artifactTrustMode: runtime.artifactTrustMode ?? "mainnet-trusted-setup",
    artifactResolution: runtime.artifactResolution,
    groth16PublicInputOrder: runtime.groth16PublicInputOrder
  };
}

function isRuntimeApprovedV12(runtime: NullarkCurrentRuntime): boolean {
  return (
    /^nullark-v1\.2(?:-|$)/.test(runtime.productVersion) &&
    runtime.v1_2Readiness?.approvedForMainnet === true &&
    runtime.v1_2Readiness.ownerApprovedPromotion === true &&
    Array.isArray(runtime.v1_2Readiness.promotionEvidence) &&
    runtime.v1_2Readiness.promotionEvidence.length > 0
  );
}

function resolveArtifactsFromFlags(parsed: ParsedArgs, options: CliOptions): unknown {
  const runtime = runtimeForParsedNetwork(parsed, options);
  const artifactDir = flagValue(parsed, "artifact-dir");
  const artifactBaseUrl = flagValue(parsed, "artifact-base-url");

  if (artifactDir && artifactBaseUrl) {
    throw new Error("Choose either --artifact-dir or --artifact-base-url, not both.");
  }
  if (artifactDir) {
    return resolveProverArtifacts(runtime, { mode: "local-artifact-dir", artifactDir });
  }
  if (artifactBaseUrl) {
    return resolveProverArtifacts(runtime, { mode: "https-base-url", baseUrl: artifactBaseUrl });
  }
  return resolveProverArtifacts(runtime);
}

async function verifyArtifactsFromFlags(parsed: ParsedArgs, options: CliOptions): Promise<unknown> {
  const runtime = runtimeForParsedNetwork(parsed, options);
  const artifactDir = flagValue(parsed, "artifact-dir");
  if (!artifactDir) {
    throw new Error("artifacts verify requires --artifact-dir.");
  }
  const artifacts = resolveProverArtifacts(runtime, { mode: "local-artifact-dir", artifactDir });
  const status = await verifyLocalProverArtifacts(runtime, artifacts);
  if (!status.trusted) {
    throw new Error(`Artifact verification failed: ${status.reason}`);
  }
  const artifactTrustMode = runtime.artifactTrustMode ?? "mainnet-trusted-setup";
  return {
    acceptedForLocalProof: true,
    trusted: artifactTrustMode !== "testnet-local-dev-untrusted",
    mode: artifacts.mode,
    chainId: runtime.chainId,
    pool: runtime.pool,
    verifier: runtime.withdrawVerifier,
    verifierBytecodeHash: runtime.withdrawVerifierBytecodeHash,
    artifactTrustMode,
    publicInputOrder: runtime.groth16PublicInputOrder
  };
}

function buildWithdrawPlan(parsed: ParsedArgs, options: CliOptions): unknown {
  const runtime = runtimeForParsedNetwork(parsed, options);
  if (parsed.flags.has("persist-recovered-notes")) {
    throw new Error("Recovered note persistence is disabled until encrypted storage exists.");
  }
  if (parsed.flags.has("note")) {
    return buildNoteBackedWithdrawPlan(parsed, options);
  }
  const calldata = requiredFlag(parsed, "calldata");
  const submitVia = flagValue(parsed, "submit-via") ?? "relayer";

  if (submitVia === "relayer") {
    return redactNullarkDiagnostics({
      kind: "withdrawal-plan",
      submitVia,
      request: buildWithdrawalRelayerRequest({ runtime, calldata })
    });
  }
  if (submitVia === "wallet") {
    return redactNullarkDiagnostics({
      kind: "withdrawal-plan",
      submitVia,
      request: buildDirectWalletWithdrawalTransaction({ runtime, calldata })
    });
  }

  throw new Error("Expected --submit-via to be relayer or wallet.");
}

async function recoverNotes(parsed: ParsedArgs, options: CliOptions): Promise<unknown> {
  assertExplicitNetworkFlag(parsed);
  if (parsed.flags.has("persist-recovered-notes")) {
    throw new Error("Recovered note persistence is disabled until encrypted storage exists.");
  }
  const wallet = requiredFlag(parsed, "wallet");
  const recover =
    options.recoverWalletNotes ??
    (async ({ wallet }: { wallet: string }) => {
      if (!options.signer) {
        throw new Error("notes recover requires an external signer adapter; unsafe terminal unlock material is not supported.");
      }
      const runtime = runtimeForParsedNetwork(parsed, options);
      return recoverWalletNotesFromChain({
        runtime,
        wallet,
        signer: options.signer,
        ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {})
      });
    });
  const recovered = await recover({ wallet });
  const state = session(options);
  state.recoveredNotes = recovered;
  state.withdrawalPlans = [];
  state.proofBundles = [];
  return {
    kind: "notes-recovered",
    storage: "memory-only",
    chainId: runtimeForParsedNetwork(parsed, options).chainId,
    pool: runtimeForParsedNetwork(parsed, options).pool,
    notes: toPrintableNoteSummaries(recovered)
  };
}

async function importRecoveryKit(parsed: ParsedArgs, options: CliOptions): Promise<unknown> {
  assertExplicitNetworkFlag(parsed);
  if (parsed.flags.has("persist-recovered-notes")) {
    throw new Error("Recovered note persistence is disabled until encrypted storage exists.");
  }
  const kitPath = requiredFlag(parsed, "kit-file");
  const runtime = runtimeForParsedNetwork(parsed, options);
  const serializedKit = await (options.readTextFile ?? ((path: string) => readFile(path, "utf8")))(kitPath);
  const note = await importRecoveryKitV1ToRecoveredWalletNote({
    serializedKit,
    runtime,
    deriveCommitment: async (spendMaterial) =>
      deriveNoteCommitment({
        assetId: spendMaterial.assetId,
        noteAmountWei: spendMaterial.noteAmountWei,
        ownerCommitment: spendMaterial.ownerCommitment,
        noteSecret: spendMaterial.noteSecret
      }),
    deriveNullifier: async ({ spendMaterial, leafIndex, chainId, pool }) =>
      deriveNullifier({
        noteSecret: spendMaterial.noteSecret,
        leafIndex,
        chainId,
        verifyingContract: pool
      }),
    isNullifierSpent: (nullifier) => recoveryKitNullifierStatus(parsed, options, nullifier)
  });
  const state = session(options);
  state.recoveredNotes = [
    ...state.recoveredNotes.filter((candidate) => candidate.summary.id !== note.summary.id),
    note
  ];
  state.withdrawalPlans = [];
  state.proofBundles = [];
  return {
    kind: "recovery-kit-imported",
    storage: "memory-only",
    chainId: runtime.chainId,
    pool: runtime.pool,
    note: note.summary
  };
}

async function recoveryKitNullifierStatus(parsed: ParsedArgs, options: CliOptions, nullifier: HexString): Promise<boolean> {
  if (options.recoveryKitNullifierStatus) {
    return options.recoveryKitNullifierStatus({ nullifier });
  }
  const runtime = runtimeForParsedNetwork(parsed, options);
  const rpc = makeRpcClient(runtime.rpcUrl, options.fetchImpl ?? fetch);
  const chainIdHex = await rpc<string>("eth_chainId", []);
  if (BigInt(chainIdHex) !== BigInt(runtime.chainId)) {
    throw new Error("Recovery kit status RPC is not connected to the active MegaETH chain.");
  }
  const result = await rpc<string>("eth_call", [
    {
      to: runtime.pool,
      data: encodeNullifierLookupCalldata(nullifier)
    },
    "latest"
  ]);
  return BigInt(assertHexRpcResult(result, "recovery kit nullifier status")) !== 0n;
}

function buildNoteBackedWithdrawPlan(parsed: ParsedArgs, options: CliOptions): unknown {
  assertExplicitNetworkFlag(parsed);
  const state = session(options);
  const noteId = requiredFlag(parsed, "note");
  const destination = requiredFlag(parsed, "to");
  const amount = requiredFlag(parsed, "amount");
  const submitVia = flagValue(parsed, "submit-via") ?? "relayer";
  if (submitVia !== "relayer" && submitVia !== "wallet") {
    throw new Error("Expected --submit-via to be relayer or wallet.");
  }
  const note = state.recoveredNotes.find((candidate) => candidate.summary.id === noteId);
  if (!note) {
    throw new Error("Recovered note id is not available in the memory-only CLI session.");
  }
  if (note.summary.spent) {
    throw new Error("Recovered note is already spent.");
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(destination)) {
    throw new Error("Expected withdrawal destination to be an EVM address.");
  }
  const grossAmountWei = amount === "max" ? note.summary.amountWei : amount;
  if (!/^[0-9]+$/.test(grossAmountWei) || BigInt(grossAmountWei) <= 0n) {
    throw new Error("Expected withdrawal amount to be max or a positive decimal wei amount.");
  }
  if (BigInt(grossAmountWei) > BigInt(note.summary.amountWei)) {
    throw new Error("Withdrawal amount exceeds the selected recovered note.");
  }
  const runtime = runtimeForParsedNetwork(parsed, options);
  const feeWei = ((BigInt(grossAmountWei) * BigInt(runtime.withdrawalFeeBps)) / 10_000n).toString();
  const netAmountWei = (BigInt(grossAmountWei) - BigInt(feeWei)).toString();
  const plan: CliWithdrawalPlan = {
    id: `plan_${state.withdrawalPlans.length + 1}`,
    noteId,
    destination,
    grossAmountWei,
    feeWei,
    netAmountWei,
    chainId: runtime.chainId,
    pool: runtime.pool,
    publicInputSchema: withdrawPublicInputSchemaForRuntime(runtime),
    submitVia,
    directSenderImplication:
      submitVia === "wallet"
        ? "Direct wallet submission makes the user's wallet the public transaction sender."
        : "No direct wallet sender is selected for this plan.",
    relayerTrustBoundary:
      submitVia === "relayer"
        ? "The relayer submits prepared calldata only; it does not recover notes, generate witnesses, choose destinations, or custody funds."
        : "No relayer submission is selected for this plan."
  };
  state.withdrawalPlans.push(plan);
  return redactNullarkDiagnostics({
    kind: "withdrawal-plan",
    storage: "memory-only",
    plan
  });
}

async function proveWithdraw(parsed: ParsedArgs, options: CliOptions): Promise<unknown> {
  assertExplicitNetworkFlag(parsed);
  const state = session(options);
  const planId = requiredFlag(parsed, "plan");
  const plan = state.withdrawalPlans.find((candidate) => candidate.id === planId);
  if (!plan) {
    throw new Error("Withdrawal plan id is not available in the memory-only CLI session.");
  }
  const note = state.recoveredNotes.find((candidate) => candidate.summary.id === plan.noteId);
  if (!note) {
    throw new Error("Recovered note for withdrawal plan is not available in the memory-only CLI session.");
  }
  const proof = assertCliProofBundle(await proveWithdrawalPlan(parsed, options, plan, note), plan);
  state.proofBundles = state.proofBundles.filter((candidate) => candidate.planId !== plan.id);
  state.proofBundles.push(proof);
  return {
    kind: "withdrawal-proof",
    storage: "memory-only",
    bundle: {
      id: proof.id,
      planId: proof.planId,
      publicInputCount: proof.publicInputs.length,
      nullifier: proof.nullifier,
      currentRoot: proof.currentRoot,
      calldata: parsed.flags.has("show-calldata") && parsed.flags.has("i-understand-calldata-is-public-transaction-material")
        ? proof.calldata
        : "[hidden:use---show-calldata-with-acknowledgement]",
      proof: parsed.flags.has("export-proof") && parsed.flags.has("i-understand-proof-is-local-transaction-material")
        ? proof.proof
        : "[hidden:use---export-proof-with-acknowledgement]"
    }
  };
}

async function proveWithdrawalPlan(
  parsed: ParsedArgs,
  options: CliOptions,
  plan: CliWithdrawalPlan,
  note: RecoveredWalletNote
): Promise<CliProofBundlePrivate> {
  if (options.proveWithdrawalPlan) {
    return options.proveWithdrawalPlan({ plan, note });
  }
  if (!options.proverRunner) {
    throw new Error("withdraw prove requires a trusted local prover adapter and verified artifacts.");
  }
  if (plan.grossAmountWei !== note.summary.amountWei) {
    throw new Error("CLI split withdrawal proving requires a change-note encryption adapter; use --amount max for this slice.");
  }
  const artifactDir = requiredFlag(parsed, "artifact-dir");
  const runtime = runtimeForParsedNetwork(parsed, options);
  const artifacts = resolveProverArtifacts(runtime, { mode: "local-artifact-dir", artifactDir });
  const artifactBinding = await verifyLocalProverArtifacts(runtime, artifacts);
  if (!artifactBinding.trusted) {
    throw new Error(`Artifact verification failed: ${artifactBinding.reason}`);
  }
  const rootAcceptedLogs =
    options.rootAcceptedLogs === undefined
      ? decodeRootAcceptedLogs(
          await fetchRootAcceptedLogs({
            runtime,
            ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {})
          })
        )
      : await options.rootAcceptedLogs({ plan, note });
  if (plan.publicInputSchema === "v1.2-unlinkable") {
    const witnessBundle = await buildV12UnlinkableWithdrawalWitnessFromRootAcceptedLogs({
        note: note.spendMaterial,
        rootAcceptedLogs,
        destination: plan.destination as `0x${string}`,
        grossAmountWei: plan.grossAmountWei,
        withdrawalFeeBps: runtime.withdrawalFeeBps,
        chainId: runtime.chainId,
        pool: runtime.pool,
        merkleTreeDepth: runtime.merkleTreeDepth
      });
    const generated = await generateWithdrawalGroth16Proof({
      witness: witnessBundle.witness,
      artifacts,
      artifactBinding,
      proverRunner: options.proverRunner,
      v12UnlinkableIntent: witnessBundle.intent,
      publicInputSchema: "v1.2-unlinkable",
      expectedFeeBps: runtime.withdrawalFeeBps
    });
    const withdrawalPlan = createV12UnlinkableWithdrawalPlan({
      runtime,
      proof: generated.proof,
      publicInputs: generated.publicInputs,
      nullifier: witnessBundle.nullifier,
      currentRoot: witnessBundle.intent.root,
      outputCommitment: witnessBundle.intent.outputCommitment,
      destination: plan.destination as `0x${string}`,
      grossAmountWei: plan.grossAmountWei,
      minNetAmountWei: plan.netAmountWei,
      maxFeeWei: plan.feeWei,
      encryptedOutputNote: witnessBundle.encryptedOutputNote
    });
    return {
      id: `proof_${plan.id.slice("plan_".length)}`,
      planId: plan.id,
      proof: generated.proof,
      publicInputs: generated.publicInputs,
      nullifier: witnessBundle.nullifier,
      calldata: withdrawalPlan.calldata,
      currentRoot: witnessBundle.intent.root,
      publicInputSchema: plan.publicInputSchema,
      submitVia: plan.submitVia
    };
  }

  const witnessBundle = await buildWithdrawalWitnessFromRootAcceptedLogs({
        note: note.spendMaterial,
        rootAcceptedLogs,
        destination: plan.destination as `0x${string}`,
        grossAmountWei: plan.grossAmountWei,
        withdrawalFeeBps: runtime.withdrawalFeeBps,
        chainId: runtime.chainId,
        pool: runtime.pool,
        merkleTreeDepth: runtime.merkleTreeDepth
      });
  const generated = await generateWithdrawalGroth16Proof({
    witness: witnessBundle.witness,
    artifacts,
    artifactBinding,
    proverRunner: options.proverRunner,
    intent: witnessBundle.intent,
    expectedFeeBps: runtime.withdrawalFeeBps
  });
  const withdrawalPlan = createWithdrawalPlan({
        runtime,
        proof: generated.proof,
        publicInputs: generated.publicInputs,
        nullifier: witnessBundle.nullifier,
        currentRoot: witnessBundle.intent.root,
        destination: plan.destination as `0x${string}`,
        grossAmountWei: plan.grossAmountWei,
        minNetAmountWei: plan.netAmountWei,
        maxFeeWei: plan.feeWei,
        encryptedChangeNote: witnessBundle.changeNote ? witnessBundle.encryptedChangeNote : undefined,
        changeCommitment: witnessBundle.intent.changeCommitment
      });
  return {
    id: `proof_${plan.id.slice("plan_".length)}`,
    planId: plan.id,
    proof: generated.proof,
    publicInputs: generated.publicInputs,
    nullifier: witnessBundle.nullifier,
    calldata: withdrawalPlan.calldata,
    currentRoot: witnessBundle.intent.root,
    publicInputSchema: plan.publicInputSchema,
    submitVia: plan.submitVia
  };
}

function assertCliProofBundle(proof: CliProofBundlePrivate, plan: CliWithdrawalPlan): CliProofBundlePrivate {
  if (!proof.id || !/^proof_[A-Za-z0-9_-]+$/.test(proof.id)) {
    throw new Error("Trusted prover adapter returned an invalid proof id.");
  }
  if (proof.planId !== plan.id) {
    throw new Error("Trusted prover adapter returned a proof for the wrong withdrawal plan.");
  }
  if (proof.submitVia !== plan.submitVia) {
    throw new Error("Trusted prover adapter returned a proof with the wrong submit path.");
  }
  if (!isHexString(proof.proof)) {
    throw new Error("Trusted prover adapter returned malformed proof bytes.");
  }
  if (!isHexBytes32(proof.nullifier) || !isHexBytes32(proof.currentRoot)) {
    throw new Error("Trusted prover adapter returned malformed proof root or nullifier.");
  }
  if (proof.publicInputSchema !== undefined && proof.publicInputSchema !== plan.publicInputSchema) {
    throw new Error("Trusted prover adapter returned a proof with the wrong public input schema.");
  }
  const publicInputSchema = plan.publicInputSchema;
  const expectedPublicInputCount = publicInputSchema === "v1.2-unlinkable" ? 10 : 12;
  if (
    !Array.isArray(proof.publicInputs) ||
    proof.publicInputs.length !== expectedPublicInputCount ||
    proof.publicInputs.some((input) => !isHexBytes32(input))
  ) {
    throw new Error("Trusted prover adapter returned malformed withdrawal public inputs.");
  }
  if (publicInputSchema === "v1.2-unlinkable") {
    if (proof.publicInputs[2]?.toLowerCase() === ZERO_BYTES32) {
      throw new Error("v1.2 unlinkable withdrawal output commitment must be nonzero.");
    }
    assertV12UnlinkableWithdrawPublicInputBinding({
      publicInputs: proof.publicInputs,
      nullifier: proof.nullifier,
      destination: plan.destination,
      grossAmountWei: plan.grossAmountWei,
      currentRoot: proof.currentRoot,
      outputCommitment: proof.publicInputs[2],
      expectedPool: plan.pool,
      expectedChainId: plan.chainId === 6343 ? 6343 : getCurrentRuntime().chainId
    });
    assertV12StageCWithdrawCalldataBinding(proof, plan);
  } else {
    assertWithdrawPublicInputBinding({
      publicInputs: proof.publicInputs,
      nullifier: proof.nullifier,
      destination: plan.destination,
      grossAmountWei: plan.grossAmountWei,
      currentRoot: proof.currentRoot,
      expectedPool: plan.pool,
      expectedChainId: plan.chainId === 6343 ? 6343 : getCurrentRuntime().chainId
    });
    assertStageCWithdrawCalldataBinding(proof.calldata, {
      publicInputs: proof.publicInputs,
      nullifier: proof.nullifier,
      destination: plan.destination,
      grossAmountWei: plan.grossAmountWei,
      minNetAmountWei: plan.netAmountWei,
      maxFeeWei: plan.feeWei
    });
  }
  return proof;
}

function assertV12StageCWithdrawCalldataBinding(proof: CliProofBundlePrivate, plan: CliWithdrawalPlan): void {
  const decoded = decodeStageCWithdrawCalldata(proof.calldata);
  if (
    decoded.publicInputs.length !== 10 ||
    decoded.publicInputs.some((input, index) => input.toLowerCase() !== proof.publicInputs[index]?.toLowerCase())
  ) {
    throw new Error("Withdrawal calldata public inputs do not match the proof bundle.");
  }
  if (decoded.nullifier.toLowerCase() !== proof.nullifier.toLowerCase()) {
    throw new Error("Withdrawal calldata nullifier does not match the proof bundle.");
  }
  if (decoded.destination.toLowerCase() !== plan.destination.toLowerCase()) {
    throw new Error("Withdrawal calldata destination does not match the withdrawal plan.");
  }
  if (decoded.grossAmountWei !== plan.grossAmountWei) {
    throw new Error("Withdrawal calldata amount does not match the withdrawal plan.");
  }
  if (decoded.minNetAmountWei !== plan.netAmountWei || decoded.maxFeeWei !== plan.feeWei) {
    throw new Error("Withdrawal calldata fee bounds do not match the withdrawal plan.");
  }
  if (decoded.encryptedChangeNote === "0x") {
    throw new Error("v1.2 unlinkable withdrawal calldata must include an encrypted output note.");
  }
  if (decoded.encryptedChangeNote.toLowerCase() === V12_DUMMY_ENCRYPTED_OUTPUT_NOTE) {
    throw new Error("v1.2 unlinkable withdrawal calldata must include a real encrypted output note.");
  }
}

async function preflightWithdraw(parsed: ParsedArgs, options: CliOptions): Promise<unknown> {
  const runtime = runtimeForParsedNetwork(parsed, options);
  if (parsed.flags.has("persist-recovered-notes")) {
    throw new Error("Recovered note persistence is disabled until encrypted storage exists.");
  }
  const proofId = flagValue(parsed, "proof");
  if (proofId) {
    assertExplicitNetworkFlag(parsed);
    const proof = session(options).proofBundles.find((candidate) => candidate.id === proofId);
    if (!proof) {
      throw new Error("Withdrawal proof id is not available in the memory-only CLI session.");
    }
    const result =
      options.fetchImpl === undefined
        ? await preflightWithdrawal({ runtime, calldata: proof.calldata, nullifier: proof.nullifier })
        : await preflightWithdrawal({ runtime, calldata: proof.calldata, nullifier: proof.nullifier, fetchImpl: options.fetchImpl });
    return {
      kind: "withdrawal-preflight",
      storage: "memory-only",
      proof: proof.id,
      pool: runtime.pool,
      ...result
    };
  }
  const calldata = requiredFlag(parsed, "calldata");
  const nullifier = requiredFlag(parsed, "nullifier");
  const result =
    options.fetchImpl === undefined
      ? await preflightWithdrawal({ runtime, calldata, nullifier })
      : await preflightWithdrawal({ runtime, calldata, nullifier, fetchImpl: options.fetchImpl });
  return {
    kind: "withdrawal-preflight",
    pool: runtime.pool,
    ...result
  };
}

function assertNoPrivateMaterialFlags(parsed: ParsedArgs): void {
  if (parsed.flags.has("note-secret") || parsed.flags.has("spend-material") || parsed.flags.has("wallet-signature")) {
    throw new Error("Do not pass note secrets, spend material, or wallet unlock signatures as CLI flags.");
  }
}

function assertExplicitNetworkFlag(parsed: ParsedArgs): void {
  const network = flagValue(parsed, "network");
  if (network !== "megaeth-mainnet" && network !== "megaeth-testnet") {
    throw new Error("Use --network megaeth-mainnet or --network megaeth-testnet for CLI note recovery and note-backed withdrawal workflows.");
  }
}

function runtimeForParsedNetwork(parsed: ParsedArgs, options?: CliOptions): NullarkCurrentRuntime {
  const network = networkFromParsed(parsed);
  const runtime = options?.runtimeForNetwork?.(network) ?? getRuntimeForNetwork(network);
  assertV12CandidateRuntimeBlocked(runtime);
  return runtime;
}

function networkFromParsed(parsed: ParsedArgs): NullarkNetwork {
  const network = flagValue(parsed, "network");
  if (network === undefined) {
    return "megaeth-mainnet";
  }
  if (network === "megaeth-mainnet" || network === "megaeth-testnet") {
    return network;
  }
  throw new Error("Expected --network to be megaeth-mainnet or megaeth-testnet.");
}

function session(options: CliOptions): NullarkCliSession {
  options.session ??= createNullarkCliSession();
  return options.session;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseArgs(argv: readonly string[]): ParsedArgs {
  const command: string[] = [];
  const flags = new Map<string, string | true>();

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg?.startsWith("--")) {
      const name = arg.slice(2);
      const next = argv[index + 1];
      if (next && !next.startsWith("--")) {
        flags.set(name, next);
        index += 1;
      } else {
        flags.set(name, true);
      }
    } else if (arg) {
      command.push(arg);
    }
  }

  return { command, flags };
}

function flagValue(parsed: ParsedArgs, name: string): string | undefined {
  const value = parsed.flags.get(name);
  if (value === undefined || value === true) {
    return undefined;
  }
  return value;
}

function requiredFlag(parsed: ParsedArgs, name: string): string {
  const value = flagValue(parsed, name);
  if (!value) {
    throw new Error(`Missing required --${name}.`);
  }
  return value;
}

function publicError(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown Nullark CLI error.";
}

function stringifyCliJson(value: unknown): string {
  return JSON.stringify(
    value,
    (_key, entry) => {
      if (typeof entry === "bigint") {
        return entry.toString();
      }
      return entry;
    },
    2
  );
}

type JsonRpcResponse<T> = {
  result?: T;
  error?: { message?: string };
};

function makeRpcClient(rpcUrl: string, fetchImpl: typeof fetch): <T>(method: string, params: unknown[]) => Promise<T> {
  let id = 0;
  return async <T>(method: string, params: unknown[]): Promise<T> => {
    id += 1;
    const response = await fetchImpl(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params })
    });
    if (!response.ok) {
      throw new Error(`Recovery kit status RPC returned HTTP ${response.status}.`);
    }
    const body = (await response.json()) as JsonRpcResponse<T>;
    if (body.error) {
      throw new Error(body.error.message ?? "Recovery kit status RPC error.");
    }
    if (body.result === undefined) {
      throw new Error("Recovery kit status RPC returned no result.");
    }
    return body.result;
  };
}

function assertHexRpcResult(value: string, label: string): HexString {
  if (!isHexString(value)) {
    throw new Error(`Expected ${label} hex result.`);
  }
  return value as HexString;
}

function withdrawPublicInputSchemaForRuntime(runtime: NullarkCurrentRuntime): WithdrawProofPublicInputSchema {
  return publicInputOrderEquals(runtime.groth16PublicInputOrder, V12_UNLINKABLE_WITHDRAW_PUBLIC_INPUT_ORDER)
    ? "v1.2-unlinkable"
    : "v1.1";
}

function publicInputOrderEquals(actual: readonly string[], expected: readonly string[]): boolean {
  return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}

function assertV12CandidateRuntimeBlocked(runtime: NullarkCurrentRuntime): void {
  const productVersion = String(runtime.productVersion ?? "");
  if (
    runtime.chainId === 4326 &&
    !isRuntimeApprovedV12(runtime) &&
    (/^nullark-v1\.2(?:-|$)/.test(productVersion) ||
      publicInputOrderEquals(runtime.groth16PublicInputOrder, V12_UNLINKABLE_WITHDRAW_PUBLIC_INPUT_ORDER))
  ) {
    throw new Error(
      "v1.2 CLI runtime is blocked as draft until package-pinned promotion evidence and v1.2 readiness gates are satisfied."
    );
  }
}

function helpText(): string {
  return [
    "Nullark CLI",
    "",
    "Commands:",
    "  nullark config show",
    "  nullark config show [--network megaeth-mainnet|megaeth-testnet]",
    "  nullark artifacts resolve [--network megaeth-mainnet|megaeth-testnet] [--artifact-base-url https://nullark.com | --artifact-dir ./proving]",
    "  nullark artifacts verify [--network megaeth-mainnet|megaeth-testnet] --artifact-dir ./proving",
    "  nullark notes recover --network megaeth-mainnet|megaeth-testnet --wallet 0x... [external signer adapter required]",
    "  nullark notes import-kit --network megaeth-mainnet|megaeth-testnet --kit-file ./recovery-kit.json",
    "  nullark notes list",
    "  nullark withdraw plan --network megaeth-mainnet|megaeth-testnet --note note_... --to 0x... --amount max [--submit-via relayer|wallet]",
    "  nullark withdraw prove --network megaeth-mainnet|megaeth-testnet --plan plan_...",
    "  nullark withdraw preflight --network megaeth-mainnet|megaeth-testnet --proof proof_...",
    "  nullark withdraw plan --calldata 0x... [--submit-via relayer|wallet]",
    "  nullark withdraw preflight --calldata 0x... --nullifier 0x...",
    "",
    "Runtime status: v1.2 is current for MegaETH mainnet when using the package-pinned runtime and public artifacts. Production privacy claims remain disabled unless separately approved.",
    "",
    "The CLI does not accept seed phrases, note secrets, spend material, wallet unlock signatures, or raw private keys as flags."
  ].join("\n");
}

function isCliEntrypoint(): boolean {
  const invoked = process.argv[1];
  if (!invoked) {
    return false;
  }
  try {
    return realpathSync(invoked) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isCliEntrypoint()) {
  const result = await runNullarkCli(process.argv.slice(2));
  process.exitCode = result.exitCode;
}
