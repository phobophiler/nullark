import { describe, expect, it } from "vitest";
import { createRangeTracker, findMissingRanges, markCheckedRange } from "./ranges.js";

describe("range tracker", () => {
  it("reports gaps between checked block ranges", () => {
    const tracker = createRangeTracker();
    markCheckedRange(tracker, { fromBlock: 10n, toBlock: 12n });
    markCheckedRange(tracker, { fromBlock: 15n, toBlock: 16n });

    expect(findMissingRanges(tracker, { fromBlock: 10n, toBlock: 17n })).toEqual([
      { fromBlock: 13n, toBlock: 14n },
      { fromBlock: 17n, toBlock: 17n }
    ]);
  });

  it("merges adjacent checked ranges", () => {
    const tracker = createRangeTracker();
    markCheckedRange(tracker, { fromBlock: 10n, toBlock: 11n });
    markCheckedRange(tracker, { fromBlock: 12n, toBlock: 14n });

    expect(tracker.checkedRanges).toEqual([{ fromBlock: 10n, toBlock: 14n }]);
  });
});
