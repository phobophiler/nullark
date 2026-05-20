import fs from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const circuitsDir = path.resolve(__dirname, "..");
const snarkjsBin = path.join(circuitsDir, "node_modules", ".bin", "snarkjs");
const nodeExecutable = process.execPath;
const nodeBinDir = path.dirname(nodeExecutable);
const groth16Dir = path.join(circuitsDir, "build", "groth16");
const verifierDir = path.join(circuitsDir, "build", "generated", "verifiers", "UNTRUSTED_DO_NOT_USE_YET");
const commands = [];
const REQUIRED_PUBLIC_INPUT_COUNT = 12;

const circuitJobs = [
  {
    name: "private_transfer",
    label: "PrivateTransfer",
    r1cs: "build/private_transfer/private_transfer.r1cs",
    witness: "build/witnesses/private_transfer.valid.wtns"
  },
  {
    name: "withdraw",
    label: "Withdraw",
    r1cs: "build/withdraw/withdraw.r1cs",
    witness: "build/witnesses/withdraw.valid.wtns"
  }
];

fs.rmSync(groth16Dir, { force: true, recursive: true });
fs.rmSync(verifierDir, { force: true, recursive: true });
fs.mkdirSync(path.join(groth16Dir, "powersoftau"), { recursive: true });
fs.mkdirSync(verifierDir, { recursive: true });

const pot0000 = "build/groth16/powersoftau/pot13_0000.ptau";
const pot0001 = "build/groth16/powersoftau/pot13_0001.ptau";
const potFinal = "build/groth16/powersoftau/pot13_final.ptau";

run("powersoftau-new", [
  "powersoftau",
  "new",
  "bn128",
  "13",
  pot0000,
  "-v"
]);
run("powersoftau-contribute", [
  "powersoftau",
  "contribute",
  pot0000,
  pot0001,
  "--name=local untrusted phase1 slice4 contribution",
  "-v",
  "-e=shielded-balance-transfers phase1 slice4 local untrusted entropy"
]);
run("powersoftau-prepare-phase2", [
  "powersoftau",
  "prepare",
  "phase2",
  pot0001,
  potFinal,
  "-v"
]);

for (const job of circuitJobs) {
  const outputDir = path.join(groth16Dir, job.name);
  fs.mkdirSync(outputDir, { recursive: true });

  const zkey0000 = `build/groth16/${job.name}/${job.name}_0000.zkey`;
  const zkeyFinal = `build/groth16/${job.name}/${job.name}_final.zkey`;
  const verificationKey = `build/groth16/${job.name}/verification_key.json`;
  const proof = `build/groth16/${job.name}/proof.json`;
  const publicSignals = `build/groth16/${job.name}/public.json`;
  const verifier = `build/generated/verifiers/UNTRUSTED_DO_NOT_USE_YET/Groth16${job.label}Verifier.sol`;

  run(`${job.name}-setup`, ["groth16", "setup", job.r1cs, potFinal, zkey0000]);
  run(`${job.name}-contribute`, [
    "zkey",
    "contribute",
    zkey0000,
    zkeyFinal,
    "--name=local untrusted phase1 slice4 zkey contribution",
    "-v",
    `-e=shielded-balance-transfers ${job.name} local untrusted entropy`
  ]);
  run(`${job.name}-export-verification-key`, ["zkey", "export", "verificationkey", zkeyFinal, verificationKey]);
  run(`${job.name}-export-solidity-verifier`, ["zkey", "export", "solidityverifier", zkeyFinal, verifier]);
  trimTrailingWhitespace(verifier);
  run(`${job.name}-prove`, ["groth16", "prove", zkeyFinal, job.witness, proof, publicSignals]);
  run(`${job.name}-verify-valid`, ["groth16", "verify", verificationKey, publicSignals, proof]);

  assertPublicSignalCount(publicSignals, job.name);
  for (let index = 0; index < REQUIRED_PUBLIC_INPUT_COUNT; index += 1) {
    const mutatedPublicSignals =
      index === 0
        ? `build/groth16/${job.name}/public.mutated.json`
        : `build/groth16/${job.name}/public.mutated.${index}.json`;
    mutatePublicSignal(publicSignals, mutatedPublicSignals, index);
    run(`${job.name}-verify-mutated-public-signal-${index}`, ["groth16", "verify", verificationKey, mutatedPublicSignals, proof], {
      expectFailure: true
    });
  }
}

const commandsPath = path.join(groth16Dir, "commands.json");
fs.writeFileSync(commandsPath, `${JSON.stringify(commands, null, 2)}\n`);
console.log(`wrote ${path.relative(circuitsDir, commandsPath)}`);

function run(label, args, options = {}) {
  const result = spawnSync(nodeExecutable, [snarkjsBin, ...args], {
    cwd: circuitsDir,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: [nodeBinDir, process.env.PATH].filter(Boolean).join(path.delimiter)
    }
  });
  const command = `${nodeExecutable} ${snarkjsBin} ${args.join(" ")}`;
  const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();

  commands.push({
    label,
    command,
    expectedFailure: Boolean(options.expectFailure),
    exitCode: result.status,
    output: output.slice(-4000)
  });

  if (options.expectFailure) {
    if (result.status === 0) {
      throw new Error(`${label} unexpectedly succeeded`);
    }
    console.log(`${label}: failed as expected`);
    return;
  }

  if (result.status !== 0) {
    throw new Error(`${label} failed:\n${output}`);
  }

  console.log(`${label}: ok`);
}

function assertPublicSignalCount(source, label) {
  const sourcePath = path.join(circuitsDir, source);
  const signals = JSON.parse(fs.readFileSync(sourcePath, "utf8"));

  if (!Array.isArray(signals) || signals.length !== REQUIRED_PUBLIC_INPUT_COUNT) {
    throw new Error(`${label} proof must expose exactly ${REQUIRED_PUBLIC_INPUT_COUNT} public signals`);
  }
}

function mutatePublicSignal(source, destination, index) {
  const sourcePath = path.join(circuitsDir, source);
  const destinationPath = path.join(circuitsDir, destination);
  const signals = JSON.parse(fs.readFileSync(sourcePath, "utf8"));

  if (!Array.isArray(signals) || signals.length !== REQUIRED_PUBLIC_INPUT_COUNT) {
    throw new Error(`${source} did not contain ${REQUIRED_PUBLIC_INPUT_COUNT} public signals`);
  }

  signals[index] = (BigInt(signals[index]) + 1n).toString();
  fs.writeFileSync(destinationPath, `${JSON.stringify(signals, null, 2)}\n`);
}

function trimTrailingWhitespace(source) {
  const sourcePath = path.join(circuitsDir, source);
  const content = fs.readFileSync(sourcePath, "utf8");
  fs.writeFileSync(sourcePath, content.replace(/[ \t]+$/gm, ""));
}
