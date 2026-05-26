import { encodeAbiParameters, encodeEventTopics } from "viem";
import { describe, expect, it } from "vitest";
import { listEncryptedNoteEvents } from "./encryptedNotes.js";
import { createIndexerState, ingestPoolLogs, POOL_EVENT_ABI, type EventTopics } from "./logIngest.js";
import { createMerklePathIndex, getMerklePathForCommitment, insertIndexedCommitment } from "./merklePaths.js";
import { findMissingRanges } from "./ranges.js";
import { createRecoveryApiHandlers } from "./recoveryApi.js";

const pool = "0xa87F70bdaBa7A8be894AC60D111FF79Ec8b0d544" as const;
const commitment = `0x${"11".repeat(32)}` as const;
const root = `0x${"22".repeat(32)}` as const;
const previousRoot = `0x${"33".repeat(32)}` as const;
const nullifier = `0x${"44".repeat(32)}` as const;
const zero = `0x${"00".repeat(32)}` as const;

function fakeHash(left: `0x${string}`, right: `0x${string}`): `0x${string}` {
  return `0x${(BigInt(left) ^ (BigInt(right) << 1n)).toString(16).padStart(64, "0").slice(-64)}`;
}

function rawLog(input: {
  topics: EventTopics;
  data: `0x${string}`;
  blockNumber: bigint;
  logIndex: number;
}) {
  return {
    address: pool,
    topics: input.topics,
    data: input.data,
    blockNumber: input.blockNumber,
    transactionHash: `0x${String(input.logIndex + 1).padStart(64, "0")}` as `0x${string}`,
    logIndex: input.logIndex
  };
}

describe("pool log ingestion", () => {
  it("parses exact encrypted-note ciphertexts, roots, nullifiers, and checked ranges", () => {
    const merklePaths = createMerklePathIndex({ depth: 8, zeroHash: zero, hashPair: fakeHash });
    const state = createIndexerState({ merklePaths });

    ingestPoolLogs(state, {
      chainId: 6343,
      pool,
      sourceRpc: "https://carrot.megaeth.com/rpc",
      observedAtMs: 1_777_700_000_000,
      logs: [
        rawLog({
          topics: encodeEventTopics({
            abi: POOL_EVENT_ABI,
            eventName: "DepositNoteCreated",
            args: { commitment, leafIndex: 4n }
          }) as EventTopics,
          data: encodeAbiParameters([{ type: "bytes" }, { type: "uint16" }], ["0x010203", 1]),
          blockNumber: 100n,
          logIndex: 0
        }),
        rawLog({
          topics: encodeEventTopics({
            abi: POOL_EVENT_ABI,
            eventName: "RootAccepted",
            args: { root, previousRoot, insertedCommitment: commitment }
          }) as EventTopics,
          data: "0x",
          blockNumber: 100n,
          logIndex: 1
        }),
        rawLog({
          topics: encodeEventTopics({
            abi: POOL_EVENT_ABI,
            eventName: "RootExpired",
            args: { root }
          }) as EventTopics,
          data: "0x",
          blockNumber: 101n,
          logIndex: 0
        }),
        rawLog({
          topics: encodeEventTopics({
            abi: POOL_EVENT_ABI,
            eventName: "NullifierSpent",
            args: { nullifier }
          }) as EventTopics,
          data: "0x",
          blockNumber: 101n,
          logIndex: 2
        })
      ],
      checkedRange: { fromBlock: 100n, toBlock: 101n }
    });

    expect(listEncryptedNoteEvents(state.encryptedNotes, { chainId: 6343, pool, fromBlock: 100n, toBlock: 101n })[0]).toMatchObject({
      eventType: "deposit",
      commitment,
      leafIndex: 4,
      encryptedNote: "0x010203"
    });
    expect(getMerklePathForCommitment(merklePaths, commitment)).toMatchObject({ commitment, leafIndex: 4 });
    expect(state.roots.has(root.toLowerCase())).toBe(false);
    expect(state.expiredRoots.get(root.toLowerCase())).toMatchObject({ root });
    expect(state.nullifiers.get(nullifier.toLowerCase())).toMatchObject({ nullifier, spent: true });
    expect(findMissingRanges(state.ranges, { fromBlock: 100n, toBlock: 102n })).toEqual([
      { fromBlock: 102n, toBlock: 102n }
    ]);
  });

  it("serves recovery paths from the Merkle index maintained by ingested logs", async () => {
    const expectedIndex = createMerklePathIndex({ depth: 8, zeroHash: zero, hashPair: fakeHash });
    insertIndexedCommitment(expectedIndex, { commitment, leafIndex: 4 });
    const acceptedRoot = getMerklePathForCommitment(expectedIndex, commitment).root;
    const merklePaths = createMerklePathIndex({ depth: 8, zeroHash: zero, hashPair: fakeHash });
    const state = createIndexerState({ merklePaths });

    ingestPoolLogs(state, {
      chainId: 6343,
      pool,
      sourceRpc: "https://carrot.megaeth.com/rpc",
      observedAtMs: 1_777_700_000_000,
      logs: [
        rawLog({
          topics: encodeEventTopics({
            abi: POOL_EVENT_ABI,
            eventName: "DepositNoteCreated",
            args: { commitment, leafIndex: 4n }
          }) as EventTopics,
          data: encodeAbiParameters([{ type: "bytes" }, { type: "uint16" }], ["0x010203", 1]),
          blockNumber: 200n,
          logIndex: 0
        }),
        rawLog({
          topics: encodeEventTopics({
            abi: POOL_EVENT_ABI,
            eventName: "RootAccepted",
            args: { root: acceptedRoot, previousRoot, insertedCommitment: commitment }
          }) as EventTopics,
          data: "0x",
          blockNumber: 200n,
          logIndex: 1
        })
      ],
      checkedRange: { fromBlock: 200n, toBlock: 200n }
    });

    const response = await createRecoveryApiHandlers({
      chainId: 6343,
      pool,
      merklePaths,
      latestCheckedBlock: 200n,
      scanStartBlock: 200n,
      checkedRanges: state.ranges,
      acceptedRoots: state.roots
    }).merklePath({ chainId: "6343", pool, commitment });

    expect(response).toMatchObject({
      status: 200,
      body: {
        commitment,
        leafIndex: 4,
        root: acceptedRoot
      }
    });
  });
});
