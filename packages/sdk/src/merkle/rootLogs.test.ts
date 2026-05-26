import { describe, expect, it } from "vitest";
import type { HexString } from "../types.js";
import {
  decodeRootAcceptedLog,
  decodeRootAcceptedLogs,
  fetchRecoveryHintedRootAcceptedLogs,
  fetchRootAcceptedLogs,
  ROOT_ACCEPTED_TOPIC
} from "./rootLogs.js";

const pool = "0xFa49572C8bdd03C3DB4caA6bafD73a4BA92F5F15" as const;
const root = `0x${"11".repeat(32)}` as const;
const previousRoot = `0x${"22".repeat(32)}` as const;
const insertedCommitment = `0x${"33".repeat(32)}` as const;
const runtime = {
  schema: "nullark-sdk-runtime-current-v1",
  productVersion: "test",
  environment: "megaeth-mainnet",
  chainId: 4326,
  rpcUrl: "https://mainnet.megaeth.com/rpc",
  poolContractName: "NullarkPool",
  pool,
  poolDeploymentBlock: "0x2",
  merkleTreeDepth: 20,
  withdrawalFeeBps: 33,
  relayerEndpoint: "https://relayer.nullark.test",
  relayerEndpointLabel: "Machine/API endpoint",
  withdrawSelector: "0x678d8506",
  privateTransferVerifier: pool,
  withdrawVerifier: pool,
  verifierAdapter: pool,
  withdrawVerifierBytecodeHash: `0x${"55".repeat(32)}`,
  artifactResolution: { mode: "https-base-url", baseUrl: "https://app.nullark.test" },
  proverManifest: { path: "/proving/withdraw-artifacts.manifest.json", sha256: `${"66".repeat(32)}` },
  trustedSetupRecord: { path: "/proving/trusted-setup-record.json", sha256: `${"99".repeat(32)}` },
  artifacts: {
    withdrawWasm: { path: "/proving/withdraw.wasm", sha256: `${"77".repeat(32)}` },
    withdrawFinalZkey: { path: "/proving/withdraw_final.zkey", sha256: `${"88".repeat(32)}` }
  },
  groth16PublicInputOrder: ["root"]
} as const;

describe("RootAccepted logs", () => {
  it("decodes RootAccepted logs into public Merkle reconstruction records", () => {
    expect(
      decodeRootAcceptedLog({
        address: pool,
        topics: [ROOT_ACCEPTED_TOPIC, root, previousRoot, insertedCommitment],
        data: "0x"
      })
    ).toEqual({ root, previousRoot, insertedCommitment });
  });

  it("fetches RootAccepted logs in bounded chunks from the configured runtime", async () => {
    const calls: unknown[] = [];
    const fetchImpl = async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as { id: number; method: string; params?: unknown[] };
      calls.push(body);
      if (body.method === "eth_blockNumber") {
        return jsonRpc(body.id, "0x5");
      }
      if (body.method === "eth_getLogs") {
        const filter = body.params?.[0] as { fromBlock?: HexString } | undefined;
        const blockNumber = filter?.fromBlock ?? "0x2";
        return jsonRpc(body.id, [
          {
            address: pool,
            topics: [ROOT_ACCEPTED_TOPIC, root, previousRoot, insertedCommitment],
            data: "0x",
            blockNumber,
            transactionHash: `0x${"44".repeat(32)}`,
            logIndex: blockNumber === "0x2" ? "0x0" : "0x1"
          }
        ]);
      }
      throw new Error(`unexpected ${body.method}`);
    };

    const logs = await fetchRootAcceptedLogs({
      runtime: {
        ...runtime
      },
      fromBlock: "0x2",
      logChunkSize: 2,
      fetchImpl
    });

    expect(logs).toHaveLength(2);
    expect(decodeRootAcceptedLogs(logs)).toEqual([
      { root, previousRoot, insertedCommitment },
      { root, previousRoot, insertedCommitment }
    ]);
    expect(JSON.stringify(calls)).toContain(ROOT_ACCEPTED_TOPIC);
    expect(JSON.stringify(calls)).toContain('"fromBlock":"0x2"');
    expect(JSON.stringify(calls)).toContain('"toBlock":"0x4"');
    expect(JSON.stringify(calls)).toContain('"fromBlock":"0x5"');
    expect(JSON.stringify(calls)).toContain('"toBlock":"0x5"');
  });

  it("uses transaction and block hints to bound RootAccepted lookup without wallet-linked fields", async () => {
    const calls: Array<{ method: string; params?: unknown[] }> = [];
    const txHashHint = `0x${"44".repeat(32)}` as const;
    const fetchImpl = async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as { id: number; method: string; params?: unknown[] };
      calls.push(body);
      if (body.method === "eth_getTransactionReceipt") {
        return jsonRpc(body.id, {
          blockNumber: "0x4",
          logs: [{ address: pool, topics: [ROOT_ACCEPTED_TOPIC, root, previousRoot, insertedCommitment], data: "0x" }]
        });
      }
      if (body.method === "eth_getLogs") {
        return jsonRpc(body.id, [
          {
            address: pool,
            topics: [ROOT_ACCEPTED_TOPIC, root, previousRoot, insertedCommitment],
            data: "0x",
            blockNumber: "0x4",
            transactionHash: txHashHint,
            logIndex: "0x0"
          }
        ]);
      }
      throw new Error(`unexpected ${body.method}`);
    };

    const result = await fetchRecoveryHintedRootAcceptedLogs({
      runtime,
      commitment: insertedCommitment,
      txHashHint,
      blockNumberHint: "0x5",
      leafIndexHint: 0,
      toBlock: "0x4",
      fetchImpl
    });

    expect(result.source).toBe("hint");
    expect(decodeRootAcceptedLogs(result.logs)).toEqual([{ root, previousRoot, insertedCommitment }]);
    expect(calls.map((call) => call.method)).toEqual(["eth_getTransactionReceipt", "eth_getLogs"]);
    expect(JSON.stringify(calls)).toContain('"toBlock":"0x4"');
    expect(JSON.stringify(calls)).not.toMatch(/wallet|discovery|tag|futureNullifier/i);
  });

  it("falls back to broad RootAccepted lookup when a stale hint disagrees with chain-derived logs", async () => {
    const calls: Array<{ method: string; params?: unknown[] }> = [];
    const wrongCommitment = `0x${"99".repeat(32)}` as const;
    const fetchImpl = async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as { id: number; method: string; params?: unknown[] };
      calls.push(body);
      if (body.method === "eth_getTransactionReceipt") {
        return jsonRpc(body.id, {
          blockNumber: "0x4",
          logs: [{ address: pool, topics: [ROOT_ACCEPTED_TOPIC, root, previousRoot, wrongCommitment], data: "0x" }]
        });
      }
      if (body.method === "eth_blockNumber") {
        return jsonRpc(body.id, "0x7");
      }
      if (body.method === "eth_getLogs") {
        return jsonRpc(body.id, [
          {
            address: pool,
            topics: [ROOT_ACCEPTED_TOPIC, root, previousRoot, insertedCommitment],
            data: "0x",
            blockNumber: "0x6",
            transactionHash: `0x${"55".repeat(32)}`,
            logIndex: "0x0"
          }
        ]);
      }
      throw new Error(`unexpected ${body.method}`);
    };

    const result = await fetchRecoveryHintedRootAcceptedLogs({
      runtime,
      commitment: insertedCommitment,
      txHashHint: `0x${"44".repeat(32)}`,
      leafIndexHint: 0,
      minConfirmations: 1,
      fetchImpl
    });

    expect(result.source).toBe("fallback");
    expect(decodeRootAcceptedLogs(result.logs)).toEqual([{ root, previousRoot, insertedCommitment }]);
    expect(calls.map((call) => call.method)).toEqual(["eth_getTransactionReceipt", "eth_blockNumber", "eth_getLogs"]);
    expect(JSON.stringify(calls)).toContain('"toBlock":"0x6"');
  });

  it("falls back to broad RootAccepted lookup when receipt hint lookup fails", async () => {
    const calls: Array<{ method: string; params?: unknown[] }> = [];
    const fetchImpl = async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as { id: number; method: string; params?: unknown[] };
      calls.push(body);
      if (body.method === "eth_getTransactionReceipt") {
        return Response.json({ jsonrpc: "2.0", id: body.id, error: { message: "receipt unavailable" } });
      }
      if (body.method === "eth_blockNumber") {
        return jsonRpc(body.id, "0x7");
      }
      if (body.method === "eth_getLogs") {
        return jsonRpc(body.id, [
          {
            address: pool,
            topics: [ROOT_ACCEPTED_TOPIC, root, previousRoot, insertedCommitment],
            data: "0x",
            blockNumber: "0x6",
            transactionHash: `0x${"55".repeat(32)}`,
            logIndex: "0x0"
          }
        ]);
      }
      throw new Error(`unexpected ${body.method}`);
    };

    const result = await fetchRecoveryHintedRootAcceptedLogs({
      runtime,
      commitment: insertedCommitment,
      txHashHint: `0x${"44".repeat(32)}`,
      leafIndexHint: 0,
      minConfirmations: 1,
      fetchImpl
    });

    expect(result.source).toBe("fallback");
    expect(result.hintRejectedReason).toBe("receipt unavailable");
    expect(decodeRootAcceptedLogs(result.logs)).toEqual([{ root, previousRoot, insertedCommitment }]);
    expect(calls.map((call) => call.method)).toEqual(["eth_getTransactionReceipt", "eth_blockNumber", "eth_getLogs"]);
  });

  it("falls back to broad RootAccepted lookup when hinted log range lookup fails", async () => {
    const calls: Array<{ method: string; params?: unknown[] }> = [];
    const txHashHint = `0x${"44".repeat(32)}` as const;
    const fetchImpl = async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as { id: number; method: string; params?: unknown[] };
      calls.push(body);
      if (body.method === "eth_getTransactionReceipt") {
        return jsonRpc(body.id, {
          blockNumber: "0x4",
          logs: [{ address: pool, topics: [ROOT_ACCEPTED_TOPIC, root, previousRoot, insertedCommitment], data: "0x" }]
        });
      }
      if (body.method === "eth_blockNumber") {
        return jsonRpc(body.id, "0x7");
      }
      if (body.method === "eth_getLogs") {
        const filter = body.params?.[0] as { toBlock?: string } | undefined;
        if (filter?.toBlock === "0x4") {
          return Response.json({ jsonrpc: "2.0", id: body.id, error: { message: "hinted log range unavailable" } });
        }
        return jsonRpc(body.id, [
          {
            address: pool,
            topics: [ROOT_ACCEPTED_TOPIC, root, previousRoot, insertedCommitment],
            data: "0x",
            blockNumber: "0x6",
            transactionHash: `0x${"55".repeat(32)}`,
            logIndex: "0x0"
          }
        ]);
      }
      throw new Error(`unexpected ${body.method}`);
    };

    const result = await fetchRecoveryHintedRootAcceptedLogs({
      runtime,
      commitment: insertedCommitment,
      txHashHint,
      leafIndexHint: 0,
      minConfirmations: 1,
      fetchImpl
    });

    expect(result.source).toBe("fallback");
    expect(result.hintRejectedReason).toBe("hinted log range unavailable");
    expect(decodeRootAcceptedLogs(result.logs)).toEqual([{ root, previousRoot, insertedCommitment }]);
    expect(calls.map((call) => call.method)).toEqual([
      "eth_getTransactionReceipt",
      "eth_blockNumber",
      "eth_getLogs",
      "eth_getLogs"
    ]);
  });

  it("falls back to broad RootAccepted lookup when advisory hint fields are malformed", async () => {
    const calls: Array<{ method: string; params?: unknown[] }> = [];
    const fetchImpl = async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as { id: number; method: string; params?: unknown[] };
      calls.push(body);
      if (body.method === "eth_blockNumber") {
        return jsonRpc(body.id, "0x7");
      }
      if (body.method === "eth_getLogs") {
        return jsonRpc(body.id, [
          {
            address: pool,
            topics: [ROOT_ACCEPTED_TOPIC, root, previousRoot, insertedCommitment],
            data: "0x",
            blockNumber: "0x6",
            transactionHash: `0x${"55".repeat(32)}`,
            logIndex: "0x0"
          }
        ]);
      }
      throw new Error(`unexpected ${body.method}`);
    };

    const result = await fetchRecoveryHintedRootAcceptedLogs({
      runtime,
      commitment: insertedCommitment,
      txHashHint: "0xnot-a-transaction-hash" as `0x${string}`,
      blockNumberHint: "latest" as `0x${string}`,
      leafIndexHint: 0,
      minConfirmations: 1,
      fetchImpl
    });

    expect(result.source).toBe("fallback");
    expect(result.hintRejectedReason).toContain("transaction hash hint");
    expect(result.hintRejectedReason).toContain("block number hint");
    expect(decodeRootAcceptedLogs(result.logs)).toEqual([{ root, previousRoot, insertedCommitment }]);
    expect(calls.map((call) => call.method)).toEqual(["eth_blockNumber", "eth_getLogs"]);
  });

  it("normalizes RootAccepted logs by block and log index before decoding", () => {
    const txHash = `0x${"44".repeat(32)}` as const;
    const laterRoot = `0x${"55".repeat(32)}` as const;
    const laterCommitment = `0x${"66".repeat(32)}` as const;

    expect(
      decodeRootAcceptedLogs([
        rawRootAcceptedLog({ root: laterRoot, previousRoot: root, insertedCommitment: laterCommitment, blockNumber: "0x4", logIndex: "0x1" }),
        rawRootAcceptedLog({ root, previousRoot, insertedCommitment, blockNumber: "0x3", logIndex: "0x2", transactionHash: txHash }),
        rawRootAcceptedLog({ root, previousRoot, insertedCommitment, blockNumber: "0x3", logIndex: "0x2", transactionHash: txHash })
      ])
    ).toEqual([
      { root, previousRoot, insertedCommitment },
      { root: laterRoot, previousRoot: root, insertedCommitment: laterCommitment }
    ]);
  });

  it("rejects RootAccepted logs without stable ordering metadata or with ambiguous duplicates", () => {
    expect(() =>
      decodeRootAcceptedLogs([
        {
          address: pool,
          topics: [ROOT_ACCEPTED_TOPIC, root, previousRoot, insertedCommitment],
          data: "0x"
        }
      ])
    ).toThrow("blockNumber and logIndex");

    expect(() =>
      decodeRootAcceptedLogs([
        rawRootAcceptedLog({ root, previousRoot, insertedCommitment, blockNumber: "0x3", logIndex: "0x2" }),
        rawRootAcceptedLog({
          root: `0x${"55".repeat(32)}`,
          previousRoot,
          insertedCommitment,
          blockNumber: "0x3",
          logIndex: "0x2"
        })
      ])
    ).toThrow("ambiguous RootAccepted logs");
  });

  it("requires an explicit mainnet finality policy for fallback recovery log scans", async () => {
    const fetchImpl = async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as { id: number; method: string };
      if (body.method === "eth_getTransactionReceipt") {
        return Response.json({ jsonrpc: "2.0", id: body.id, error: { message: "receipt unavailable" } });
      }
      throw new Error(`unexpected ${body.method}`);
    };

    await expect(
      fetchRecoveryHintedRootAcceptedLogs({
        runtime,
        commitment: insertedCommitment,
        txHashHint: `0x${"44".repeat(32)}`,
        leafIndexHint: 0,
        fetchImpl
      })
    ).rejects.toThrow("finality policy");
  });
});

function jsonRpc(id: number, result: unknown): Response {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id, result }), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}

function rawRootAcceptedLog(input: {
  root: HexString;
  previousRoot: HexString;
  insertedCommitment: HexString;
  blockNumber: `0x${string}`;
  logIndex: `0x${string}`;
  transactionHash?: `0x${string}`;
}) {
  return {
    address: pool,
    topics: [ROOT_ACCEPTED_TOPIC, input.root, input.previousRoot, input.insertedCommitment],
    data: "0x" as const,
    blockNumber: input.blockNumber,
    logIndex: input.logIndex,
    ...(input.transactionHash === undefined ? {} : { transactionHash: input.transactionHash })
  };
}
