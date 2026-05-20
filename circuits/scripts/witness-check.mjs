import fs from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const circuitsDir = path.resolve(__dirname, "..");
const witnessDir = path.join(circuitsDir, "build", "witnesses");

const cases = [
  ["private_transfer", "private_transfer.valid.json", true],
  ["private_transfer", "private_transfer.mainnet_valid.json", true],
  ["private_transfer", "private_transfer.bad_chain_id.json", false],
  ["private_transfer", "private_transfer.bad_leaf_index.json", false],
  ["private_transfer", "private_transfer.bad_nullifier.json", false],
  ["private_transfer", "private_transfer.bad_path_element.json", false],
  ["private_transfer", "private_transfer.bad_root.json", false],
  ["private_transfer", "private_transfer.bad_output_amount.json", false],
  ["private_transfer", "private_transfer.bad_proof_context_hash.json", false],
  ["private_transfer", "private_transfer.bad_encrypted_note_hash.json", false],
  ["private_transfer", "private_transfer.bad_verifying_contract.json", false],
  ["private_transfer", "private_transfer.bad_verifying_contract_width.json", false],
  ["withdraw", "withdraw.valid.json", true],
  ["withdraw", "withdraw.mainnet_valid.json", true],
  ["withdraw", "withdraw_split.valid.json", true],
  ["withdraw", "withdraw.fee_boundary.valid.json", true],
  ["withdraw", "withdraw_split.dust_change.valid.json", true],
  ["withdraw", "withdraw.bad_chain_id.json", false],
  ["withdraw", "withdraw.bad_destination.json", false],
  ["withdraw", "withdraw.bad_fee.json", false],
  ["withdraw", "withdraw.bad_gross_amount.json", false],
  ["withdraw", "withdraw.bad_proof_context_hash.json", false],
  ["withdraw", "withdraw.bad_encrypted_note_hash.json", false],
  ["withdraw", "withdraw.bad_nonzero_commitment_without_change.json", false],
  ["withdraw", "withdraw_split.bad_new_commitment.json", false],
  ["withdraw", "withdraw_split.bad_zero_change_commitment.json", false],
  ["withdraw", "withdraw_split.bad_change_amount.json", false],
  ["withdraw", "withdraw_split.bad_proof_context_hash.json", false],
  ["withdraw", "withdraw_split.bad_encrypted_note_hash.json", false],
  ["withdraw", "withdraw.bad_leaf_index.json", false],
  ["withdraw", "withdraw.bad_nullifier.json", false],
  ["withdraw", "withdraw.bad_path_element.json", false],
  ["withdraw", "withdraw.bad_root.json", false],
  ["withdraw", "withdraw.bad_verifying_contract.json", false],
  ["withdraw", "withdraw.bad_verifying_contract_width.json", false],
  ["withdraw", "withdraw.zero_fee.valid.json", true]
];

fs.mkdirSync(witnessDir, { recursive: true });

let failures = 0;

for (const [circuit, fixtureName, shouldPass] of cases) {
  const generator = path.join(circuitsDir, "build", circuit, `${circuit}_js`, "generate_witness.js");
  const wasm = path.join(circuitsDir, "build", circuit, `${circuit}_js`, `${circuit}.wasm`);
  const fixture = path.join(circuitsDir, "fixtures", fixtureName);
  const output = path.join(witnessDir, fixtureName.replace(".json", ".wtns"));

  const result = spawnSync(process.execPath, [generator, wasm, fixture, output], {
    cwd: circuitsDir,
    encoding: "utf8"
  });
  const passed = result.status === 0;

  if (passed !== shouldPass) {
    failures += 1;
    console.error(`${fixtureName}: expected ${shouldPass ? "pass" : "fail"}, got ${passed ? "pass" : "fail"}`);
    if (result.stderr) {
      console.error(result.stderr);
    }
    if (result.stdout) {
      console.error(result.stdout);
    }
    continue;
  }

  console.log(`${fixtureName}: ${passed ? "pass" : "failed as expected"}`);
}

if (failures > 0) {
  process.exit(1);
}
