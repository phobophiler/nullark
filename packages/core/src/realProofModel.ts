export type FieldElement = bigint;
export type FieldHash = (inputs: readonly FieldElement[]) => FieldElement;

export type RealProofNotePreimage = {
  assetId: FieldElement;
  amount: FieldElement;
  ownerCommitment: FieldElement;
  noteSecret: FieldElement;
};

export type NullifierContext = {
  noteSecret: FieldElement;
  leafIndex: number;
  chainId: number;
  verifyingContract: FieldElement;
};

export type MerklePath = {
  leafIndex: number;
  root: FieldElement;
  pathElements: FieldElement[];
  pathIndices: number[];
};

export type AppendOnlyMerkleTree = {
  depth: number;
  zeroValue: FieldElement;
  leaves: FieldElement[];
  root: FieldElement;
  append(leaf: FieldElement): MerklePath;
  pathForLeaf(leafIndex: number): MerklePath;
};

export const BN254_SCALAR_FIELD =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;
export const NATIVE_TEST_ASSET_ID = 0n;
export const NOTE_COMMITMENT_DOMAIN = 10_001n;
export const NULLIFIER_DOMAIN = 10_002n;

export function deriveNoteCommitment(note: RealProofNotePreimage, hash: FieldHash): FieldElement {
  assertFieldElement(note.assetId, "assetId");
  assertPositiveFieldElement(note.amount, "amount");
  assertFieldElement(note.ownerCommitment, "ownerCommitment");
  assertFieldElement(note.noteSecret, "noteSecret");

  return normalizeHashOutput(
    hash([NOTE_COMMITMENT_DOMAIN, note.assetId, note.amount, note.ownerCommitment, note.noteSecret]),
    "commitment"
  );
}

export function deriveNullifier(context: NullifierContext, hash: FieldHash): FieldElement {
  assertFieldElement(context.noteSecret, "noteSecret");
  assertSafeNonnegativeInteger(context.leafIndex, "leafIndex");
  assertSafePositiveInteger(context.chainId, "chainId");
  assertFieldElement(context.verifyingContract, "verifyingContract");

  return normalizeHashOutput(
    hash([NULLIFIER_DOMAIN, context.noteSecret, BigInt(context.leafIndex), BigInt(context.chainId), context.verifyingContract]),
    "nullifier"
  );
}

export function createAppendOnlyMerkleTree(depth: number, zeroValue: FieldElement, hash: FieldHash): AppendOnlyMerkleTree {
  assertSafePositiveInteger(depth, "depth");
  if (depth > 32) {
    throw new Error("depth exceeds Phase 1 local proving cap");
  }
  assertFieldElement(zeroValue, "zeroValue");

  const leaves: FieldElement[] = [];

  function append(leaf: FieldElement): MerklePath {
    assertFieldElement(leaf, "leaf");
    if (leaves.length >= 2 ** depth) {
      throw new Error("Merkle tree is full");
    }

    leaves.push(leaf);
    return pathForLeaf(leaves.length - 1);
  }

  function pathForLeaf(leafIndex: number): MerklePath {
    assertSafeNonnegativeInteger(leafIndex, "leafIndex");
    if (leafIndex >= leaves.length) {
      throw new Error("leafIndex is not inserted");
    }

    const layers = buildLayers(depth, zeroValue, leaves, hash);
    const zeroHashes = buildZeroHashes(depth, zeroValue, hash);
    const pathElements: FieldElement[] = [];
    const pathIndices: number[] = [];
    let cursor = leafIndex;

    for (let level = 0; level < depth; level += 1) {
      const siblingIndex = cursor ^ 1;
      pathElements.push(layers[level]?.[siblingIndex] ?? zeroHashes[level] ?? zeroValue);
      pathIndices.push(cursor % 2);
      cursor = Math.floor(cursor / 2);
    }

    return {
      leafIndex,
      root: layers[depth]?.[0] ?? zeroValue,
      pathElements,
      pathIndices
    };
  }

  return {
    depth,
    zeroValue,
    leaves,
    get root() {
      return buildLayers(depth, zeroValue, leaves, hash)[depth]?.[0] ?? zeroValue;
    },
    append,
    pathForLeaf
  };
}

export function verifyMerklePath(leaf: FieldElement, path: MerklePath, hash: FieldHash): boolean {
  assertFieldElement(leaf, "leaf");
  if (path.pathElements.length !== path.pathIndices.length) {
    throw new Error("path elements and indices length mismatch");
  }

  let computed = leaf;
  for (let level = 0; level < path.pathElements.length; level += 1) {
    const sibling = path.pathElements[level];
    const direction = path.pathIndices[level];
    if (sibling === undefined || direction === undefined) {
      throw new Error("path is incomplete");
    }

    assertFieldElement(sibling, "pathElement");
    if (direction !== 0 && direction !== 1) {
      throw new Error("path index must be a bit");
    }

    computed = direction === 0 ? normalizeHashOutput(hash([computed, sibling]), "root") : normalizeHashOutput(hash([sibling, computed]), "root");
  }

  return computed === path.root;
}

export function fieldElementToBytes32(value: FieldElement): `0x${string}` {
  assertFieldElement(value, "value");
  return `0x${value.toString(16).padStart(64, "0")}`;
}

function buildLayers(
  depth: number,
  zeroValue: FieldElement,
  leaves: readonly FieldElement[],
  hash: FieldHash
): FieldElement[][] {
  const zeroHashes = buildZeroHashes(depth, zeroValue, hash);
  const layers: FieldElement[][] = [Array.from(leaves)];

  for (let level = 0; level < depth; level += 1) {
    const previous = layers[level] ?? [];
    const next: FieldElement[] = [];
    const pairCount = Math.max(1, Math.ceil(previous.length / 2));

    for (let pair = 0; pair < pairCount; pair += 1) {
      const index = pair * 2;
      const zero = zeroHashes[level] ?? zeroValue;
      next.push(normalizeHashOutput(hash([previous[index] ?? zero, previous[index + 1] ?? zero]), "root"));
    }
    layers.push(next);
  }

  return layers;
}

function buildZeroHashes(depth: number, zeroValue: FieldElement, hash: FieldHash): FieldElement[] {
  const zeroHashes: FieldElement[] = [zeroValue];
  for (let level = 0; level < depth; level += 1) {
    const zero = zeroHashes[level] ?? zeroValue;
    zeroHashes.push(normalizeHashOutput(hash([zero, zero]), "root"));
  }
  return zeroHashes;
}

function normalizeHashOutput(value: FieldElement, fieldName: string): FieldElement {
  assertFieldElement(value, fieldName);
  return value;
}

function assertPositiveFieldElement(value: FieldElement, fieldName: string): void {
  assertFieldElement(value, fieldName);
  if (value === 0n) {
    throw new Error(`${fieldName} must be positive`);
  }
}

function assertFieldElement(value: FieldElement, fieldName: string): void {
  if (typeof value !== "bigint" || value < 0n || value >= BN254_SCALAR_FIELD) {
    throw new Error(`${fieldName} must be a BN254 field element`);
  }
}

function assertSafePositiveInteger(value: number, fieldName: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${fieldName} must be a positive safe integer`);
  }
}

function assertSafeNonnegativeInteger(value: number, fieldName: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${fieldName} must be a nonnegative safe integer`);
  }
}
