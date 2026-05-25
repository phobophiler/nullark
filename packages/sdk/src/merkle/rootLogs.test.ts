import { describe, expect, it } from "vitest";
import { decodeRootAcceptedLog, decodeRootAcceptedLogs, fetchRootAcceptedLogs, ROOT_ACCEPTED_TOPIC } from "./rootLogs.js";

const pool = "0xFa49572C8bdd03C3DB4caA6bafD73a4BA92F5F15" as const;
const root = `0x${"11".repeat(32)}` as const;
const previousRoot = `0x${"22".repeat(32)}` as const;
const insertedCommitment = `0x${"33".repeat(32)}` as const;

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
        return jsonRpc(body.id, [
          {
            address: pool,
            topics: [ROOT_ACCEPTED_TOPIC, root, previousRoot, insertedCommitment],
            data: "0x",
            blockNumber: "0x2",
            transactionHash: `0x${"44".repeat(32)}`,
            logIndex: "0x0"
          }
        ]);
      }
      throw new Error(`unexpected ${body.method}`);
    };

    const logs = await fetchRootAcceptedLogs({
      runtime: {
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
});

function jsonRpc(id: number, result: unknown): Response {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id, result }), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}
