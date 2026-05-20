import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const circuitsDir = path.resolve(__dirname, "..");
const repoDir = path.resolve(circuitsDir, "..");
const manifestPath = path.join(circuitsDir, "build", "provenance", "manifest.json");

const sourceFiles = [
  "private_transfer.circom",
  "withdraw.circom",
  "include/poseidon_hashes.circom",
  "include/merkle_membership.circom",
  "scripts/generate-fixtures.mjs",
  "scripts/witness-check.mjs",
  "scripts/generate-groth16-artifacts.mjs",
  "scripts/clean-build.mjs",
  "scripts/write-provenance-manifest.mjs",
  "scripts/build-provenance.mjs",
  "README.md",
  "package.json",
  "package-lock.json"
];

const dependencyCircuitFiles = [
  "node_modules/circomlib/circuits/poseidon.circom",
  "node_modules/circomlib/circuits/poseidon_constants.circom",
  "node_modules/circomlib/circuits/mux1.circom",
  "node_modules/circomlib/circuits/multiplexer.circom",
  "node_modules/circomlib/circuits/comparators.circom",
  "node_modules/circomlib/circuits/bitify.circom",
  "node_modules/circomlib/circuits/binsum.circom",
  "node_modules/@zk-kit/binary-merkle-root.circom/src/binary-merkle-root.circom"
];

const artifactFiles = [
  "build/private_transfer/private_transfer.r1cs",
  "build/private_transfer/private_transfer.sym",
  "build/private_transfer/private_transfer_js/private_transfer.wasm",
  "build/private_transfer/private_transfer_js/generate_witness.js",
  "build/private_transfer/private_transfer_js/witness_calculator.js",
  "build/withdraw/withdraw.r1cs",
  "build/withdraw/withdraw.sym",
  "build/withdraw/withdraw_js/withdraw.wasm",
  "build/withdraw/withdraw_js/generate_witness.js",
  "build/withdraw/withdraw_js/witness_calculator.js",
  "build/witnesses/private_transfer.valid.wtns",
  "build/witnesses/private_transfer.mainnet_valid.wtns",
  "build/witnesses/withdraw.valid.wtns",
  "build/witnesses/withdraw.mainnet_valid.wtns"
];

const fixtureFiles = (await listFiles(path.join(circuitsDir, "fixtures")))
  .map((absolutePath) => path.relative(circuitsDir, absolutePath))
  .sort();
const groth16ArtifactFiles = [
  ...(await listFilesIfPresent(path.join(circuitsDir, "build", "groth16"))),
  ...(await listFilesIfPresent(path.join(circuitsDir, "build", "generated")))
].map((absolutePath) => path.relative(circuitsDir, absolutePath)).sort();

const manifest = {
  schemaVersion: 1,
  status: "local-groth16-artifacts-quarantined",
  generatedAt: new Date().toISOString(),
  hardBoundaries: {
    allowedChainIds: [6343, 4326],
    localUntrustedGroth16ArtifactsGenerated: true,
    localUntrustedSolidityVerifiersGenerated: true,
    trustedVerifierGenerated: false,
    contractIntegrationAuthorized: false,
    deploymentAuthorized: false,
    privateKeysAllowed: false,
    realFundsAllowed: false
  },
  publicInputs: [
    "root",
    "nullifier",
    "newCommitment",
    "destination",
    "grossAmount",
    "fee",
    "chainId",
    "verifyingContract",
    "spentCommitment",
    "noteAmount",
    "proofContextHash",
    "encryptedNoteHash"
  ],
  rangePolicy: {
    stageBBindingSchema: {
      proofContextDomain: "keccak256(\"nullark.proof-context.v1\")",
      encryptedNoteDomain: "keccak256(\"nullark.encrypted-note.v1\")",
      relayerPolicyDomain: "keccak256(\"nullark.relayer-policy.v1\")",
      privateTransferShape: "keccak256(\"private_transfer_context_v1_1\")",
      withdrawShape: "keccak256(\"withdraw_context_v1_1\")",
      privateTransferSelector: "0x6da3fd67",
      withdrawSelector: "0xc7787d0f",
      encryptedNoteShape:
        "NullarkPool.EncryptedNoteV1(shape, selector, nullifier, commitment, noteAmount, encryptedNote)",
      proofContextShape:
        "NullarkPool.ProofContextV1(shape, selector, root, nullifier, destination, grossAmount, fee, encryptedNoteHash, relayerPolicyHash, deadlineOrZero)",
      relayerPolicyShape:
        "NullarkPool.RelayerPolicy(relayer=0, minNetAmount=0, maxFeeAmount=type(uint256).max, deadlineOrZero=0)",
      withdrawPublicExitEncryptedNoteRule:
        "full public exit uses commitment=0 and encryptedNote=0x",
      withdrawChangeEncryptedNoteRule:
        "Stage C unified withdraw partial-exit fixtures use commitment=public newCommitment and deterministic encrypted change-note bytes",
      hashReduction: "bytes32(uint256(keccak256(abi.encode(...))) % BN254_SCALAR_FIELD)",
      sourceOfTruth:
        "contracts/src/NullarkPool.sol for the current unified withdraw schema; Stage C partial-exit fixtures remain local-untrusted provenance until artifact promotion is approved."
    },
    stageCUnifiedWithdrawPartialExitSemantics: {
      status: "circuit-fixture-only-quarantined-local-untrusted",
      arity: "one spent note, one public withdrawal, optional one private change note",
      valueConservation: "noteAmount = grossAmount + changeAmount",
      publicNewCommitmentRule:
        "newCommitment is zero for full public exit and equals the retained change-note commitment when changeAmount > 0",
      encryptedNoteHashRule:
        "full exit binds zero commitment and empty encrypted note; partial exit binds the public change commitment and deterministic encrypted change-note bytes",
      validFixtures: [
        "withdraw.valid.json",
        "withdraw_split.valid.json",
        "withdraw_split.dust_change.valid.json"
      ],
      negativeFixtures: [
        "withdraw.bad_nonzero_commitment_without_change.json",
        "withdraw_split.bad_new_commitment.json",
        "withdraw_split.bad_zero_change_commitment.json",
        "withdraw_split.bad_change_amount.json",
        "withdraw_split.bad_proof_context_hash.json",
        "withdraw_split.bad_encrypted_note_hash.json"
      ]
    },
    legacyNamedPartialExitFixtures: [
      "withdraw_split.valid.json",
      "withdraw_split.dust_change.valid.json",
      "withdraw_split.bad_new_commitment.json",
      "withdraw_split.bad_zero_change_commitment.json",
      "withdraw_split.bad_change_amount.json",
      "withdraw_split.bad_proof_context_hash.json",
      "withdraw_split.bad_encrypted_note_hash.json"
    ],
    circuitEnforced: [
      "All public inputs are BN254 field elements by Circom signal semantics.",
      "chainId is constrained to MegaETH testnet 6343 or MegaETH mainnet 4326.",
      "verifyingContract is constrained to less than 2^160.",
      "leafIndex is constrained by BinaryMerkleRoot(20), so it is less than 1048576.",
      "withdraw fee equals floor((grossAmount * 33) / 10000).",
      "withdraw fee may be zero when 33 bps rounds down to zero.",
      "private-transfer destination, grossAmount, and fee equal zero.",
      "withdraw noteAmount equals grossAmount plus private changeAmount.",
      "withdraw newCommitment equals zero for full exits or the retained private change-note commitment for partial exits.",
      "spentCommitment is publicly bound to the note preimage and Merkle leaf.",
      "noteAmount is publicly bound to the spent note amount.",
      "proofContextHash is a Stage B public input and is equality-bound to its fixture witness value.",
      "encryptedNoteHash is a Stage B public input and is equality-bound to its fixture witness value."
    ],
    typescriptOrSolidityPreconditions: [
      "withdraw destination must fit uint160 address width before field conversion.",
      "root, nullifier, newCommitment, grossAmount, fee, spentCommitment, noteAmount, proofContextHash, and encryptedNoteHash must round-trip as BN254 field elements before proof input encoding.",
      "Stage B proofContextHash must be recomputed from canonical ProofContextV1 fields by non-circuit consumers; the circuit does not implement ABI/keccak recomputation.",
      "Stage B encryptedNoteHash must be recomputed from canonical EncryptedNoteV1 fields by non-circuit consumers; the circuit does not decrypt or parse encrypted note payloads.",
      "withdraw_split.* fixtures are legacy-named partial-exit fixture files and remain local-untrusted provenance until artifact promotion is approved.",
      "the pool contract rechecks block.chainid against the public chainId input."
    ]
  },
  toolVersions: {
    node: process.version,
    circom: commandVersion("circom", ["--version"]),
    snarkjs: packageVersion("snarkjs"),
    npmPackages: {
      "@zk-kit/binary-merkle-root.circom": packageVersion("@zk-kit/binary-merkle-root.circom"),
      circomlib: packageVersion("circomlib"),
      circomlibjs: packageVersion("circomlibjs"),
      snarkjs: packageVersion("snarkjs"),
      underscore: packageVersion("underscore")
    }
  },
  sourceFiles: await hashRelativeFiles(sourceFiles),
  dependencyCircuitFiles: await hashRelativeFiles(dependencyCircuitFiles),
  fixtureFiles: await hashRelativeFiles(fixtureFiles),
  artifactFiles: await hashRelativeFiles([...artifactFiles, ...groth16ArtifactFiles]),
  groth16: {
    ceremony: {
      ptauPower: 13,
      source: "locally generated by snarkjs powersoftau new bn128 13",
      trustStatus: "UNTRUSTED_LOCAL_DEVELOPMENT_ONLY",
      productionUsable: false
    },
    verifierOutputDirectory: "build/generated/verifiers/UNTRUSTED_DO_NOT_USE_YET",
    commands: JSON.parse(readFileSync(path.join(circuitsDir, "build", "groth16", "commands.json"), "utf8"))
  },
  circuitMetadata: {
    private_transfer: r1csInfo("build/private_transfer/private_transfer.r1cs"),
    withdraw: r1csInfo("build/withdraw/withdraw.r1cs")
  },
  nextBlockedGates: [
    "IVerifier adapter integration",
    "public input adapter review",
    "production trusted setup ceremony or accepted ptau provenance",
    "on-chain Poseidon Merkle insertion and root history",
    "MegaETH testnet remote gas evidence",
    "external review"
  ]
};

await fs.mkdir(path.dirname(manifestPath), { recursive: true });
await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`wrote ${path.relative(circuitsDir, manifestPath)}`);

async function hashRelativeFiles(relativePaths) {
  const entries = [];

  for (const relativePath of relativePaths) {
    const absolutePath = path.join(circuitsDir, relativePath);
    const data = await fs.readFile(absolutePath);
    entries.push({
      path: relativePath,
      sha256: createHash("sha256").update(data).digest("hex"),
      bytes: data.byteLength
    });
  }

  return entries;
}

async function listFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(absolutePath)));
    } else if (entry.isFile()) {
      files.push(absolutePath);
    }
  }

  return files;
}

async function listFilesIfPresent(directory) {
  try {
    return await listFiles(directory);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

function packageVersion(packageName) {
  const packageJsonPath = path.join(circuitsDir, "node_modules", ...packageName.split("/"), "package.json");
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  return packageJson.version;
}

function commandVersion(command, args) {
  const resolvedCommand =
    command === "circom" ? process.env.CIRCOM_BIN ?? "/Users/ahmadfitrahamdani/.cargo/bin/circom" : command;
  const result = spawnSync(resolvedCommand, args, {
    cwd: repoDir,
    encoding: "utf8",
    env: process.env
  });

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
  }

  return (result.stdout || result.stderr).trim();
}

function r1csInfo(relativePath) {
  const snarkjsBin = path.join(circuitsDir, "node_modules", ".bin", "snarkjs");
  const result = spawnSync(process.execPath, [snarkjsBin, "r1cs", "info", relativePath], {
    cwd: circuitsDir,
    encoding: "utf8",
    env: process.env
  });

  if (result.status !== 0) {
    throw new Error(`snarkjs r1cs info ${relativePath} failed: ${result.stderr || result.stdout}`);
  }

  const output = stripAnsi(result.stdout || result.stderr);
  return {
    curve: matchValue(output, /Curve:\s*([^\n]+)/),
    wires: Number(matchValue(output, /# of Wires:\s*(\d+)/)),
    constraints: Number(matchValue(output, /# of Constraints:\s*(\d+)/)),
    privateInputs: Number(matchValue(output, /# of Private Inputs:\s*(\d+)/)),
    publicInputs: Number(matchValue(output, /# of Public Inputs:\s*(\d+)/)),
    labels: Number(matchValue(output, /# of Labels:\s*(\d+)/)),
    outputs: Number(matchValue(output, /# of Outputs:\s*(\d+)/))
  };
}

function matchValue(text, pattern) {
  const match = text.match(pattern);
  if (!match?.[1]) {
    throw new Error(`could not parse snarkjs output for ${pattern}`);
  }
  return match[1].trim();
}

function stripAnsi(text) {
  return text.replace(/\u001b\[[0-9;]*m/g, "");
}
