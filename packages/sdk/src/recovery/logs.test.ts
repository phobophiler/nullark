import { encodeAbiParameters, toEventHash } from "viem";
import { describe, expect, it } from "vitest";
import { getCurrentRuntime } from "../runtime/current.js";
import {
  decodeNoteEventLog,
  fetchNoteEventLogs,
  NOTE_EVENT_TOPICS
} from "./logs.js";

const depositTopic = toEventHash("DepositNoteCreated(bytes32,uint256,bytes,uint16)");
const commitment = `0x${"11".repeat(32)}` as const;

describe("recovery note logs", () => {
  it("fetches note logs in bounded chunks from the sanitized runtime deployment block", async () => {
    const runtime = getCurrentRuntime();
    const requestedFilters: Array<{ address?: string; fromBlock?: string; toBlock?: string; topics?: unknown[] }> = [];
    const fetchImpl = async (_url: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}"));
      if (body.method === "eth_blockNumber") {
        return Response.json({ jsonrpc: "2.0", id: body.id, result: "0xf98a20" });
      }
      if (body.method === "eth_getLogs") {
        requestedFilters.push(body.params[0]);
        return Response.json({ jsonrpc: "2.0", id: body.id, result: [] });
      }
      throw new Error(`unexpected rpc method ${body.method}`);
    };

    const logs = await fetchNoteEventLogs({ runtime, fetchImpl, logChunkSize: 8n });

    expect(logs).toEqual([]);
    expect(requestedFilters.map((filter) => [filter.address, filter.fromBlock, filter.toBlock])).toEqual([
      [runtime.pool, "0xf98a11", "0xf98a19"],
      [runtime.pool, "0xf98a1a", "0xf98a20"]
    ]);
    expect(requestedFilters.every((filter) => JSON.stringify(filter.topics?.[0]) === JSON.stringify(NOTE_EVENT_TOPICS))).toBe(true);
  });

  it("decodes deposit note events without exposing note plaintext", () => {
    const data = encodeAbiParameters(
      [
        { name: "encryptedNote", type: "bytes" },
        { name: "encryptionVersion", type: "uint16" }
      ],
      ["0x1234", 1]
    );
    const decoded = decodeNoteEventLog({
      address: getCurrentRuntime().pool,
      topics: [depositTopic, commitment, `0x${"0".repeat(63)}7`],
      data,
      transactionHash: `0x${"22".repeat(32)}`
    });

    expect(decoded).toEqual({
      action: "deposit",
      commitment,
      leafIndex: 7,
      encryptedNote: "0x1234",
      encryptionVersion: 1,
      nullifier: null,
      transactionHash: `0x${"22".repeat(32)}`
    });
  });

  it("rejects invalid chunk sizes before making RPC calls", async () => {
    await expect(
      fetchNoteEventLogs({
        runtime: getCurrentRuntime(),
        logChunkSize: 0n,
        fetchImpl: async () => {
          throw new Error("fetch should not run");
        }
      })
    ).rejects.toThrow("log chunk size");
  });
});
