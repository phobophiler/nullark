import { isHexBytes32, type HexString } from "../types.js";

export type FieldHash = (inputs: readonly bigint[]) => bigint;

export type RootAcceptedLogRecord = {
  root: HexString;
  previousRoot: HexString;
  insertedCommitment: HexString;
};

export type ReconstructedMerklePath = {
  commitment: HexString;
  leafIndex: number;
  root: HexString;
  pathElements: HexString[];
  pathIndices: number[];
  status: "reconstructed-from-root-accepted-history";
};

export type ReconstructMerklePathInput = {
  logs: readonly RootAcceptedLogRecord[];
  commitment: HexString;
  hash: FieldHash;
  depth: number;
};

const BN254_SCALAR_FIELD =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

export function reconstructMerklePathFromRootAcceptedLogs(input: ReconstructMerklePathInput): ReconstructedMerklePath {
  const commitment = assertFieldBytes32(input.commitment, "commitment");
  if (!Number.isSafeInteger(input.depth) || input.depth <= 0 || input.depth > 32) {
    throw new Error("Expected Merkle depth to be a positive safe integer no larger than 32.");
  }

  const zeroHashes = buildMerkleZeroHashes(input.depth, input.hash);
  const chain = verifyRootAcceptedChain({
    logs: input.logs,
    depth: input.depth,
    hash: input.hash,
    zeroHashes
  });
  const leaves = chain.leaves;
  const leafIndex = leaves.findIndex((leaf) => leaf.toLowerCase() === commitment.toLowerCase());
  if (leafIndex < 0) {
    throw new Error("Note commitment was not found in RootAccepted history.");
  }
  if (leaves.length > 2 ** input.depth) {
    throw new Error("RootAccepted history exceeds the configured Merkle tree capacity.");
  }

  const pathElements: HexString[] = [];
  const pathIndices: number[] = [];
  let layer = new Map<number, bigint>();
  leaves.forEach((leaf, index) => {
    layer.set(index, BigInt(leaf));
  });

  let cursor = leafIndex;
  for (let level = 0; level < input.depth; level += 1) {
    const zeroHash = zeroHashes[level] ?? 0n;
    const sibling = layer.get(cursor ^ 1) ?? zeroHash;
    pathElements.push(toBytes32(assertFieldBigint(sibling, "Merkle sibling")));
    pathIndices.push(cursor % 2);
    layer = buildNextSparseMerkleLayer(layer, zeroHash, input.hash);
    cursor = Math.floor(cursor / 2);
  }

  const root = toBytes32(assertFieldBigint(layer.get(0) ?? zeroHashes[input.depth] ?? 0n, "Merkle root"));
  return {
    commitment,
    leafIndex,
    root,
    pathElements,
    pathIndices,
    status: "reconstructed-from-root-accepted-history"
  };
}

function verifyRootAcceptedChain(input: {
  logs: readonly RootAcceptedLogRecord[];
  depth: number;
  hash: FieldHash;
  zeroHashes: readonly bigint[];
}): { leaves: HexString[]; root: HexString } {
  const initialRoot = toBytes32(input.zeroHashes[input.depth] ?? 0n);
  const filledSubtrees = input.zeroHashes.slice(0, input.depth);
  const leaves: HexString[] = [];
  let acceptedRoot = initialRoot;

  for (const log of input.logs) {
    const root = assertFieldBytes32(log.root, "root");
    const previousRoot = assertFieldBytes32(log.previousRoot, "previousRoot");
    const insertedCommitment = assertFieldBytes32(log.insertedCommitment, "insertedCommitment");

    if (BigInt(insertedCommitment) === 0n) {
      if (BigInt(previousRoot) !== 0n || root.toLowerCase() !== initialRoot.toLowerCase()) {
        throw new Error("RootAccepted initialization root does not match the computed zero root.");
      }
      acceptedRoot = root;
      continue;
    }

    if (previousRoot.toLowerCase() !== acceptedRoot.toLowerCase()) {
      throw new Error("RootAccepted previousRoot does not match the prior accepted root.");
    }
    if (leaves.length >= 2 ** input.depth) {
      throw new Error("RootAccepted history exceeds the configured Merkle tree capacity.");
    }

    const computedRoot = insertLeafAndComputeRoot({
      leaf: BigInt(insertedCommitment),
      leafIndex: leaves.length,
      depth: input.depth,
      zeroHashes: input.zeroHashes,
      filledSubtrees,
      hash: input.hash
    });
    const computedRootHex = toBytes32(computedRoot);
    if (root.toLowerCase() !== computedRootHex.toLowerCase()) {
      throw new Error("RootAccepted root does not match the computed Merkle root.");
    }
    leaves.push(insertedCommitment);
    acceptedRoot = root;
  }

  return { leaves, root: acceptedRoot };
}

function insertLeafAndComputeRoot(input: {
  leaf: bigint;
  leafIndex: number;
  depth: number;
  zeroHashes: readonly bigint[];
  filledSubtrees: bigint[];
  hash: FieldHash;
}): bigint {
  let current = input.leaf;
  for (let level = 0; level < input.depth; level += 1) {
    const zeroHash = input.zeroHashes[level] ?? 0n;
    if (Math.floor(input.leafIndex / 2 ** level) % 2 === 0) {
      input.filledSubtrees[level] = current;
      current = assertFieldBigint(input.hash([current, zeroHash]), "RootAccepted computed root");
    } else {
      const left = input.filledSubtrees[level] ?? zeroHash;
      current = assertFieldBigint(input.hash([left, current]), "RootAccepted computed root");
    }
  }
  return current;
}

export function verifyMerklePath(input: {
  commitment: HexString;
  root: HexString;
  pathElements: readonly HexString[];
  pathIndices: readonly number[];
  hash: FieldHash;
}): boolean {
  let computed = BigInt(assertFieldBytes32(input.commitment, "commitment"));
  const expectedRoot = assertFieldBytes32(input.root, "root");
  if (input.pathElements.length !== input.pathIndices.length) {
    throw new Error("Merkle path elements and indices length mismatch.");
  }
  for (const [level, element] of input.pathElements.entries()) {
    const pathIndex = input.pathIndices[level];
    const sibling = BigInt(assertFieldBytes32(element, "pathElement"));
    if (pathIndex !== 0 && pathIndex !== 1) {
      throw new Error("Merkle path indices must be bits.");
    }
    computed =
      pathIndex === 0
        ? assertFieldBigint(input.hash([computed, sibling]), "computedRoot")
        : assertFieldBigint(input.hash([sibling, computed]), "computedRoot");
  }
  return toBytes32(computed).toLowerCase() === expectedRoot.toLowerCase();
}

function buildMerkleZeroHashes(depth: number, hash: FieldHash): bigint[] {
  const zeroHashes = [0n];
  for (let level = 0; level < depth; level += 1) {
    const zeroHash = zeroHashes[level] ?? 0n;
    zeroHashes.push(assertFieldBigint(hash([zeroHash, zeroHash]), "zeroHash"));
  }
  return zeroHashes;
}

function buildNextSparseMerkleLayer(layer: Map<number, bigint>, zeroHash: bigint, hash: FieldHash): Map<number, bigint> {
  const parentIndexes = new Set<number>();
  for (const index of layer.keys()) {
    parentIndexes.add(Math.floor(index / 2));
  }

  const next = new Map<number, bigint>();
  for (const parentIndex of parentIndexes) {
    const left = layer.get(parentIndex * 2) ?? zeroHash;
    const right = layer.get(parentIndex * 2 + 1) ?? zeroHash;
    next.set(parentIndex, assertFieldBigint(hash([left, right]), "Merkle parent"));
  }
  return next;
}

function assertFieldBytes32(value: string, label: string): HexString {
  if (!isHexBytes32(value) || BigInt(value) >= BN254_SCALAR_FIELD) {
    throw new Error(`${label} must be a BN254 field bytes32 value.`);
  }
  return value as HexString;
}

function assertFieldBigint(value: bigint, label: string): bigint {
  if (value < 0n || value >= BN254_SCALAR_FIELD) {
    throw new Error(`${label} must be a BN254 field element.`);
  }
  return value;
}

function toBytes32(value: bigint): HexString {
  return `0x${value.toString(16).padStart(64, "0")}`;
}
