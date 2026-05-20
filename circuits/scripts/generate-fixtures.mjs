import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildPoseidon } from "circomlibjs";
import { encodeAbiParameters, keccak256, toBytes } from "viem";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const circuitsDir = path.resolve(__dirname, "..");
const fixturesDir = path.join(circuitsDir, "fixtures");

const TESTNET_CHAIN_ID = 6343n;
const MAINNET_CHAIN_ID = 4326n;
const WRONG_CHAIN_ID = 1n;
const NOTE_DOMAIN = 10001n;
const NULLIFIER_DOMAIN = 10002n;
const VERIFYING_CONTRACT = 5555n;
const LEVELS = 20;
const TREE_CAPACITY = 2n ** BigInt(LEVELS);
const WITHDRAWAL_FEE_BPS = 33n;
const BPS_DENOMINATOR = 10000n;
const FIRST_NON_ADDRESS_VALUE = 2n ** 160n;
const MAX_UINT256 = 2n ** 256n - 1n;
const BN254_SCALAR_FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const PROOF_CONTEXT_DOMAIN = keccak256(toBytes("nullark.proof-context.v1"));
const ENCRYPTED_NOTE_DOMAIN = keccak256(toBytes("nullark.encrypted-note.v1"));
const RELAYER_POLICY_DOMAIN = keccak256(toBytes("nullark.relayer-policy.v1"));
const PRIVATE_TRANSFER_SHAPE = keccak256(toBytes("private_transfer_context_v1_1"));
const WITHDRAW_SHAPE = keccak256(toBytes("withdraw_context_v1_1"));
const PRIVATE_TRANSFER_SELECTOR = "0x6da3fd67";
const WITHDRAW_SELECTOR = "0xc7787d0f";
const DEFAULT_RELAYER_POLICY = {
  relayer: 0n,
  minNetAmount: 0n,
  maxFeeAmount: MAX_UINT256,
  deadlineOrZero: 0n
};
const PRIVATE_TRANSFER_ENCRYPTED_NOTE = "0x01020304";
const WITHDRAW_CHANGE_ENCRYPTED_NOTE = "0x09080706";
const EMPTY_BYTES = "0x";

const poseidon = await buildPoseidon();
const hash = (inputs) => poseidon.F.toObject(poseidon(inputs.map(BigInt)));
const asString = (value) => value.toString();
const asArray = (values) => values.map(asString);
const asBytes32 = (value) => `0x${BigInt(value).toString(16).padStart(64, "0")}`;
const asAddress = (value) => `0x${BigInt(value).toString(16).padStart(40, "0")}`;
const fieldFromHash = (hashHex) => BigInt(hashHex) % BN254_SCALAR_FIELD;

function noteCommitment({ assetId, amount, ownerCommitment, noteSecret }) {
  return hash([NOTE_DOMAIN, assetId, amount, ownerCommitment, noteSecret]);
}

function nullifier({ noteSecret, leafIndex, chainId, verifyingContract }) {
  return hash([NULLIFIER_DOMAIN, noteSecret, leafIndex, chainId, verifyingContract]);
}

function merkleRoot(leaf, leafIndex, pathElements) {
  let node = BigInt(leaf);
  let index = Number(leafIndex);

  for (const sibling of pathElements) {
    const siblingValue = BigInt(sibling);
    node = index % 2 === 0 ? hash([node, siblingValue]) : hash([siblingValue, node]);
    index = Math.floor(index / 2);
  }

  return node;
}

function merklePathForLeaf(leaves, leafIndex) {
  const zeroHashes = buildZeroHashes();
  let layer = new Map(
    leaves
      .map((leaf, index) => [index, BigInt(leaf ?? 0n)])
      .filter(([, leaf]) => leaf !== 0n)
  );
  const pathElements = [];
  let cursor = Number(leafIndex);

  for (let level = 0; level < LEVELS; level++) {
    pathElements.push(layer.get(cursor ^ 1) ?? zeroHashes[level]);
    const nextLayer = new Map();
    for (const index of layer.keys()) {
      const pairStart = index - (index % 2);
      if (nextLayer.has(pairStart / 2)) {
        continue;
      }
      const left = layer.get(pairStart) ?? zeroHashes[level];
      const right = layer.get(pairStart + 1) ?? zeroHashes[level];
      nextLayer.set(pairStart / 2, hash([left, right]));
    }
    layer = nextLayer;
    cursor = Math.floor(cursor / 2);
  }

  return {
    root: merkleRoot(leaves[Number(leafIndex)] ?? 0n, leafIndex, pathElements),
    pathElements
  };
}

function encryptedNoteHash({
  chainId,
  verifyingContract,
  shape,
  selector,
  nullifier,
  commitment,
  noteAmount,
  encryptedNote
}) {
  return fieldFromHash(
    keccak256(
      encodeAbiParameters(
        [
          { type: "bytes32", name: "domain" },
          { type: "uint256", name: "version" },
          { type: "uint256", name: "chainId" },
          { type: "address", name: "pool" },
          { type: "bytes32", name: "shape" },
          { type: "bytes4", name: "selector" },
          { type: "bytes32", name: "nullifier" },
          { type: "bytes32", name: "commitment" },
          { type: "uint256", name: "noteAmount" },
          { type: "bytes", name: "encryptedNote" }
        ],
        [
          ENCRYPTED_NOTE_DOMAIN,
          1n,
          chainId,
          asAddress(verifyingContract),
          shape,
          selector,
          asBytes32(nullifier),
          asBytes32(commitment),
          noteAmount,
          encryptedNote
        ]
      )
    )
  );
}

function relayerPolicyHash({
  relayer = DEFAULT_RELAYER_POLICY.relayer,
  minNetAmount = DEFAULT_RELAYER_POLICY.minNetAmount,
  maxFeeAmount = DEFAULT_RELAYER_POLICY.maxFeeAmount,
  deadlineOrZero = DEFAULT_RELAYER_POLICY.deadlineOrZero
} = DEFAULT_RELAYER_POLICY) {
  return fieldFromHash(
    keccak256(
      encodeAbiParameters(
        [
          { type: "bytes32", name: "domain" },
          { type: "uint256", name: "version" },
          { type: "address", name: "relayer" },
          { type: "uint256", name: "minNetAmount" },
          { type: "uint256", name: "maxFeeAmount" },
          { type: "uint256", name: "deadlineOrZero" }
        ],
        [
          RELAYER_POLICY_DOMAIN,
          1n,
          asAddress(relayer),
          minNetAmount,
          maxFeeAmount,
          deadlineOrZero
        ]
      )
    )
  );
}

function proofContextHash({
  chainId,
  verifyingContract,
  shape,
  selector,
  root,
  nullifier,
  destination,
  grossAmount,
  fee,
  encryptedNoteHash,
  relayerPolicyHash,
  deadlineOrZero
}) {
  return fieldFromHash(
    keccak256(
      encodeAbiParameters(
        [
          { type: "bytes32", name: "domain" },
          { type: "uint256", name: "version" },
          { type: "uint256", name: "chainId" },
          { type: "address", name: "pool" },
          { type: "bytes32", name: "shape" },
          { type: "bytes4", name: "selector" },
          { type: "bytes32", name: "root" },
          { type: "bytes32", name: "nullifier" },
          { type: "bytes32", name: "destination" },
          { type: "uint256", name: "grossAmount" },
          { type: "uint256", name: "fee" },
          { type: "bytes32", name: "encryptedNoteHash" },
          { type: "bytes32", name: "relayerPolicyHash" },
          { type: "uint256", name: "deadlineOrZero" }
        ],
        [
          PROOF_CONTEXT_DOMAIN,
          1n,
          chainId,
          asAddress(verifyingContract),
          shape,
          selector,
          asBytes32(root),
          asBytes32(nullifier),
          asBytes32(destination),
          grossAmount,
          fee,
          asBytes32(encryptedNoteHash),
          asBytes32(relayerPolicyHash),
          deadlineOrZero
        ]
      )
    )
  );
}

function bindPrivateTransferStageB(fixture) {
  const encryptedHash = encryptedNoteHash({
    chainId: fixture.chainId,
    verifyingContract: fixture.verifyingContract,
    shape: PRIVATE_TRANSFER_SHAPE,
    selector: PRIVATE_TRANSFER_SELECTOR,
    nullifier: fixture.nullifier,
    commitment: fixture.newCommitment,
    noteAmount: fixture.noteAmount,
    encryptedNote: PRIVATE_TRANSFER_ENCRYPTED_NOTE
  });
  const policyHash = relayerPolicyHash();
  const contextHash = proofContextHash({
    chainId: fixture.chainId,
    verifyingContract: fixture.verifyingContract,
    shape: PRIVATE_TRANSFER_SHAPE,
    selector: PRIVATE_TRANSFER_SELECTOR,
    root: fixture.root,
    nullifier: fixture.nullifier,
    destination: fixture.destination,
    grossAmount: fixture.grossAmount,
    fee: fixture.fee,
    encryptedNoteHash: encryptedHash,
    relayerPolicyHash: policyHash,
    deadlineOrZero: DEFAULT_RELAYER_POLICY.deadlineOrZero
  });

  return {
    ...fixture,
    proofContextHash: contextHash,
    encryptedNoteHash: encryptedHash,
    expectedProofContextHash: contextHash,
    expectedEncryptedNoteHash: encryptedHash
  };
}

function bindWithdrawStageB(fixture) {
  const encryptedChangeNote = fixture.changeAmount === 0n ? EMPTY_BYTES : WITHDRAW_CHANGE_ENCRYPTED_NOTE;
  const encryptedHash = encryptedNoteHash({
    chainId: fixture.chainId,
    verifyingContract: fixture.verifyingContract,
    shape: WITHDRAW_SHAPE,
    selector: WITHDRAW_SELECTOR,
    nullifier: fixture.nullifier,
    commitment: fixture.newCommitment,
    noteAmount: fixture.noteAmount,
    encryptedNote: encryptedChangeNote
  });
  const policyHash = relayerPolicyHash();
  const contextHash = proofContextHash({
    chainId: fixture.chainId,
    verifyingContract: fixture.verifyingContract,
    shape: WITHDRAW_SHAPE,
    selector: WITHDRAW_SELECTOR,
    root: fixture.root,
    nullifier: fixture.nullifier,
    destination: fixture.destination,
    grossAmount: fixture.grossAmount,
    fee: fixture.fee,
    encryptedNoteHash: encryptedHash,
    relayerPolicyHash: policyHash,
    deadlineOrZero: DEFAULT_RELAYER_POLICY.deadlineOrZero
  });

  return {
    ...fixture,
    proofContextHash: contextHash,
    encryptedNoteHash: encryptedHash,
    expectedProofContextHash: contextHash,
    expectedEncryptedNoteHash: encryptedHash
  };
}

function buildZeroHashes() {
  const zeroHashes = [0n];
  for (let level = 0; level < LEVELS; level++) {
    zeroHashes.push(hash([zeroHashes[level], zeroHashes[level]]));
  }
  return zeroHashes;
}

function privateTransferValid({ chainId = TESTNET_CHAIN_ID } = {}) {
  const witness = {
    assetId: 1n,
    noteAmount: 1000n,
    ownerCommitment: 2000n,
    noteSecret: 3000n,
    leafIndex: 0n,
    recipientOwnerCommitment: 4000n,
    recipientNoteSecret: 5000n
  };
  witness.newCommitment = noteCommitment({
    assetId: witness.assetId,
    amount: witness.noteAmount,
    ownerCommitment: witness.recipientOwnerCommitment,
    noteSecret: witness.recipientNoteSecret
  });

  const oldNote = noteCommitment({
    assetId: witness.assetId,
    amount: witness.noteAmount,
    ownerCommitment: witness.ownerCommitment,
    noteSecret: witness.noteSecret
  });
  const path = merklePathForLeaf([oldNote], witness.leafIndex);

  return {
    root: path.root,
    nullifier: nullifier({
      noteSecret: witness.noteSecret,
      leafIndex: witness.leafIndex,
      chainId,
      verifyingContract: VERIFYING_CONTRACT
    }),
    destination: 0n,
    grossAmount: 0n,
    fee: 0n,
    chainId,
    verifyingContract: VERIFYING_CONTRACT,
    spentCommitment: oldNote,
    pathElements: path.pathElements,
    ...witness
  };
}

function withdrawForAmount(
  noteAmount,
  { grossAmount = noteAmount, changeOwnerCommitment = 0n, changeNoteSecret = 0n, chainId = TESTNET_CHAIN_ID } = {}
) {
  const changeAmount = noteAmount - grossAmount;
  if (changeAmount < 0n) {
    throw new Error("withdraw fixture grossAmount cannot exceed noteAmount");
  }

  const witness = {
    assetId: 1n,
    noteAmount,
    ownerCommitment: 2000n,
    noteSecret: 3000n,
    leafIndex: 0n,
    withdrawalDestination: 7777n,
    changeAmount,
    changeOwnerCommitment,
    changeNoteSecret
  };

  const note = noteCommitment({
    assetId: witness.assetId,
    amount: witness.noteAmount,
    ownerCommitment: witness.ownerCommitment,
    noteSecret: witness.noteSecret
  });

  const path = merklePathForLeaf([note], witness.leafIndex);

  return {
    root: path.root,
    nullifier: nullifier({
      noteSecret: witness.noteSecret,
      leafIndex: witness.leafIndex,
      chainId,
      verifyingContract: VERIFYING_CONTRACT
    }),
    newCommitment:
      changeAmount === 0n
        ? 0n
        : noteCommitment({
            assetId: witness.assetId,
            amount: changeAmount,
            ownerCommitment: changeOwnerCommitment,
            noteSecret: changeNoteSecret
          }),
    destination: witness.withdrawalDestination,
    grossAmount,
    fee: (grossAmount * WITHDRAWAL_FEE_BPS) / BPS_DENOMINATOR,
    chainId,
    verifyingContract: VERIFYING_CONTRACT,
    spentCommitment: note,
    pathElements: path.pathElements,
    ...witness
  };
}

function withdrawValid() {
  return withdrawForAmount(10001n);
}

function withdrawSplitValid() {
  return withdrawForAmount(10001n, {
    grossAmount: 2001n,
    changeOwnerCommitment: 2100n,
    changeNoteSecret: 2800n
  });
}

function serializeFixture(fixture) {
  const entries = Object.entries(fixture).map(([key, value]) => [
    key,
    Array.isArray(value) ? asArray(value) : asString(value)
  ]);

  return `${JSON.stringify(Object.fromEntries(entries), null, 2)}\n`;
}

function cloneWith(fixture, patch) {
  return { ...fixture, ...patch };
}

function mutatePath(fixture) {
  const pathElements = [...fixture.pathElements];
  pathElements[2] = pathElements[2] + 1n;
  return cloneWith(fixture, { pathElements });
}

const privateValid = bindPrivateTransferStageB(privateTransferValid());
const privateMainnetValid = bindPrivateTransferStageB(privateTransferValid({ chainId: MAINNET_CHAIN_ID }));
const privateTransferInflatedOutput = cloneWith(privateValid, {
  newCommitment: noteCommitment({
    assetId: privateValid.assetId,
    amount: privateValid.noteAmount + 1n,
    ownerCommitment: privateValid.recipientOwnerCommitment,
    noteSecret: privateValid.recipientNoteSecret
  })
});
const withdraw = bindWithdrawStageB(withdrawValid());
const withdrawMainnet = bindWithdrawStageB(withdrawForAmount(10001n, { chainId: MAINNET_CHAIN_ID }));
const withdrawSplit = bindWithdrawStageB(withdrawSplitValid());
const zeroFeeWithdraw = bindWithdrawStageB(withdrawForAmount(303n));
const feeBoundaryWithdraw = bindWithdrawStageB(withdrawForAmount(10000n));
const dustChangeWithdraw = bindWithdrawStageB(withdrawForAmount(10001n, {
  grossAmount: 10000n,
  changeOwnerCommitment: 2200n,
  changeNoteSecret: 2900n
}));

const fixtures = {
  "private_transfer.valid.json": privateValid,
  "private_transfer.mainnet_valid.json": privateMainnetValid,
  "private_transfer.bad_chain_id.json": cloneWith(privateValid, { chainId: WRONG_CHAIN_ID }),
  "private_transfer.bad_leaf_index.json": cloneWith(privateValid, { leafIndex: TREE_CAPACITY }),
  "private_transfer.bad_nullifier.json": cloneWith(privateValid, { nullifier: privateValid.nullifier + 1n }),
  "private_transfer.bad_path_element.json": mutatePath(privateValid),
  "private_transfer.bad_root.json": cloneWith(privateValid, { root: privateValid.root + 1n }),
  "private_transfer.bad_output_amount.json": privateTransferInflatedOutput,
  "private_transfer.bad_proof_context_hash.json": cloneWith(privateValid, {
    proofContextHash: privateValid.proofContextHash + 1n
  }),
  "private_transfer.bad_encrypted_note_hash.json": cloneWith(privateValid, {
    encryptedNoteHash: privateValid.encryptedNoteHash + 1n
  }),
  "private_transfer.bad_verifying_contract.json": cloneWith(privateValid, { verifyingContract: VERIFYING_CONTRACT + 1n }),
  "private_transfer.bad_verifying_contract_width.json": cloneWith(privateValid, { verifyingContract: FIRST_NON_ADDRESS_VALUE }),
  "withdraw.valid.json": withdraw,
  "withdraw.mainnet_valid.json": withdrawMainnet,
  "withdraw_split.valid.json": withdrawSplit,
  "withdraw.fee_boundary.valid.json": feeBoundaryWithdraw,
  "withdraw_split.dust_change.valid.json": dustChangeWithdraw,
  "withdraw.bad_chain_id.json": cloneWith(withdraw, { chainId: WRONG_CHAIN_ID }),
  "withdraw.bad_destination.json": cloneWith(withdraw, { destination: withdraw.destination + 1n }),
  "withdraw.bad_fee.json": cloneWith(withdraw, { fee: withdraw.fee + 1n }),
  "withdraw.bad_gross_amount.json": cloneWith(withdraw, { grossAmount: withdraw.grossAmount + 1n }),
  "withdraw.bad_proof_context_hash.json": cloneWith(withdraw, { proofContextHash: withdraw.proofContextHash + 1n }),
  "withdraw.bad_encrypted_note_hash.json": cloneWith(withdraw, { encryptedNoteHash: withdraw.encryptedNoteHash + 1n }),
  "withdraw.bad_nonzero_commitment_without_change.json": cloneWith(withdraw, {
    newCommitment: withdrawSplit.newCommitment
  }),
  "withdraw_split.bad_new_commitment.json": cloneWith(withdrawSplit, { newCommitment: withdrawSplit.newCommitment + 1n }),
  "withdraw_split.bad_zero_change_commitment.json": cloneWith(withdrawSplit, { newCommitment: 0n }),
  "withdraw_split.bad_change_amount.json": cloneWith(withdrawSplit, { changeAmount: withdrawSplit.changeAmount + 1n }),
  "withdraw_split.bad_proof_context_hash.json": cloneWith(withdrawSplit, {
    proofContextHash: withdrawSplit.proofContextHash + 1n
  }),
  "withdraw_split.bad_encrypted_note_hash.json": cloneWith(withdrawSplit, {
    encryptedNoteHash: withdrawSplit.encryptedNoteHash + 1n
  }),
  "withdraw.bad_leaf_index.json": cloneWith(withdraw, { leafIndex: TREE_CAPACITY }),
  "withdraw.bad_nullifier.json": cloneWith(withdraw, { nullifier: withdraw.nullifier + 1n }),
  "withdraw.bad_path_element.json": mutatePath(withdraw),
  "withdraw.bad_root.json": cloneWith(withdraw, { root: withdraw.root + 1n }),
  "withdraw.bad_verifying_contract.json": cloneWith(withdraw, { verifyingContract: VERIFYING_CONTRACT + 1n }),
  "withdraw.bad_verifying_contract_width.json": cloneWith(withdraw, { verifyingContract: FIRST_NON_ADDRESS_VALUE }),
  "withdraw.zero_fee.valid.json": zeroFeeWithdraw
};

await fs.mkdir(fixturesDir, { recursive: true });

for (const [name, fixture] of Object.entries(fixtures)) {
  await fs.writeFile(path.join(fixturesDir, name), serializeFixture(fixture));
}

console.log(`wrote ${Object.keys(fixtures).length} fixtures for ${LEVELS}-level Poseidon Merkle circuits`);
