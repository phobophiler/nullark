export type HexString = `0x${string}`;

export type HashPair = (left: HexString, right: HexString) => HexString;

export type IndexedCommitment = {
  commitment: HexString;
  leafIndex: number;
};

export type MerklePathIndex = {
  depth: number;
  zeroHash: HexString;
  hashPair: HashPair;
  leavesByIndex: Map<number, HexString>;
  indexByCommitment: Map<string, number>;
  sortedLeafIndexes: number[] | null;
  pathCache: Map<string, MerklePathResult>;
  maxPathCacheEntries: number;
};

export type MerklePathResult = {
  commitment: HexString;
  leafIndex: number;
  root: HexString;
  pathElements: HexString[];
  pathIndices: number[];
  source: "reconstructed-from-indexed-logs";
};

export function createMerklePathIndex(input: {
  depth: number;
  zeroHash: HexString;
  hashPair: HashPair;
  maxPathCacheEntries?: number;
}): MerklePathIndex {
  if (!Number.isInteger(input.depth) || input.depth <= 0) {
    throw new Error("Merkle depth must be a positive integer.");
  }
  if (!Number.isSafeInteger(2 ** input.depth)) {
    throw new Error("Merkle depth exceeds safe JavaScript index range.");
  }
  return {
    depth: input.depth,
    zeroHash: input.zeroHash,
    hashPair: input.hashPair,
    leavesByIndex: new Map(),
    indexByCommitment: new Map(),
    sortedLeafIndexes: null,
    pathCache: new Map(),
    maxPathCacheEntries: input.maxPathCacheEntries ?? 256
  };
}

export function insertIndexedCommitment(index: MerklePathIndex, commitment: IndexedCommitment): void {
  if (commitment.leafIndex < 0 || !Number.isInteger(commitment.leafIndex)) {
    throw new Error("Leaf index must be a non-negative integer.");
  }
  if (commitment.leafIndex >= 2 ** index.depth) {
    throw new Error("Leaf index exceeds Merkle tree capacity.");
  }

  const normalizedCommitment = commitment.commitment.toLowerCase();
  const existingLeafIndex = index.indexByCommitment.get(normalizedCommitment);
  if (existingLeafIndex !== undefined && existingLeafIndex !== commitment.leafIndex) {
    throw new Error("Commitment is already indexed at a different leaf index.");
  }

  const existingCommitment = index.leavesByIndex.get(commitment.leafIndex);
  if (existingCommitment !== undefined && existingCommitment.toLowerCase() !== normalizedCommitment) {
    throw new Error("Leaf index already has a different commitment.");
  }

  index.leavesByIndex.set(commitment.leafIndex, commitment.commitment);
  index.indexByCommitment.set(normalizedCommitment, commitment.leafIndex);
  index.sortedLeafIndexes = null;
  index.pathCache.clear();
}

export function getMerklePathForCommitment(index: MerklePathIndex, commitment: HexString): MerklePathResult {
  const leafIndex = index.indexByCommitment.get(commitment.toLowerCase());
  if (leafIndex === undefined) {
    throw new Error("Commitment is not indexed.");
  }

  const cacheKey = commitment.toLowerCase();
  const cachedPath = index.pathCache.get(cacheKey);
  if (cachedPath !== undefined) {
    index.pathCache.delete(cacheKey);
    index.pathCache.set(cacheKey, cachedPath);
    return cachedPath;
  }

  const leafIndexes = index.sortedLeafIndexes ?? [...index.leavesByIndex.keys()].sort((a, b) => a - b);
  index.sortedLeafIndexes = leafIndexes;
  const zeroHashesByLevel = [index.zeroHash];
  for (let level = 1; level <= index.depth; level += 1) {
    const previousZeroHash = zeroHashesByLevel[level - 1] as HexString;
    zeroHashesByLevel.push(index.hashPair(previousZeroHash, previousZeroHash));
  }

  const memoizedNodes = new Map<string, HexString>();

  const hasLeafInRange = (rangeStart: number, rangeEnd: number): boolean => {
    let lo = 0;
    let hi = leafIndexes.length;
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      const midLeafIndex = leafIndexes[mid] as number;
      if (midLeafIndex < rangeStart) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }
    const firstCandidate = leafIndexes[lo];
    return firstCandidate !== undefined && firstCandidate < rangeEnd;
  };

  const getNodeHash = (level: number, position: number): HexString => {
    if (level === 0) {
      return index.leavesByIndex.get(position) ?? index.zeroHash;
    }

    const key = `${level}:${position}`;
    const cached = memoizedNodes.get(key);
    if (cached !== undefined) {
      return cached;
    }

    const width = 2 ** level;
    const rangeStart = position * width;
    const rangeEnd = rangeStart + width;
    if (!hasLeafInRange(rangeStart, rangeEnd)) {
      return zeroHashesByLevel[level] as HexString;
    }

    const left = getNodeHash(level - 1, position * 2);
    const right = getNodeHash(level - 1, position * 2 + 1);
    const combined = index.hashPair(left, right);
    memoizedNodes.set(key, combined);
    return combined;
  };

  let cursor = leafIndex;
  let level = 0;
  const pathElements: HexString[] = [];
  const pathIndices: number[] = [];

  for (let depth = 0; depth < index.depth; depth += 1) {
    const siblingIndex = cursor ^ 1;
    pathElements.push(getNodeHash(level, siblingIndex));
    pathIndices.push(cursor & 1);

    cursor = Math.floor(cursor / 2);
    level += 1;
  }

  const result: MerklePathResult = {
    commitment,
    leafIndex,
    root: getNodeHash(index.depth, 0),
    pathElements,
    pathIndices,
    source: "reconstructed-from-indexed-logs"
  };
  if (index.maxPathCacheEntries > 0) {
    index.pathCache.set(cacheKey, result);
    while (index.pathCache.size > index.maxPathCacheEntries) {
      const oldestKey = index.pathCache.keys().next().value;
      if (oldestKey === undefined) {
        break;
      }
      index.pathCache.delete(oldestKey);
    }
  }
  return result;
}
