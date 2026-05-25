export type BlockRange = {
  fromBlock: bigint;
  toBlock: bigint;
};

export type RangeTracker = {
  checkedRanges: BlockRange[];
};

export function createRangeTracker(): RangeTracker {
  return { checkedRanges: [] };
}

export function markCheckedRange(tracker: RangeTracker, range: BlockRange): void {
  if (range.toBlock < range.fromBlock) {
    throw new Error("Invalid checked block range.");
  }
  const ranges = [...tracker.checkedRanges, range].sort((a, b) => (a.fromBlock < b.fromBlock ? -1 : 1));
  const merged: BlockRange[] = [];
  for (const next of ranges) {
    const last = merged[merged.length - 1];
    if (!last || next.fromBlock > last.toBlock + 1n) {
      merged.push({ ...next });
    } else if (next.toBlock > last.toBlock) {
      last.toBlock = next.toBlock;
    }
  }
  tracker.checkedRanges = merged;
}

export function findMissingRanges(tracker: RangeTracker, requested: BlockRange): BlockRange[] {
  const missing: BlockRange[] = [];
  let cursor = requested.fromBlock;
  for (const checked of tracker.checkedRanges) {
    if (checked.toBlock < cursor) continue;
    if (checked.fromBlock > requested.toBlock) break;
    if (checked.fromBlock > cursor) {
      missing.push({ fromBlock: cursor, toBlock: checked.fromBlock - 1n });
    }
    if (checked.toBlock + 1n > cursor) {
      cursor = checked.toBlock + 1n;
    }
  }
  if (cursor <= requested.toBlock) {
    missing.push({ fromBlock: cursor, toBlock: requested.toBlock });
  }
  return missing;
}
