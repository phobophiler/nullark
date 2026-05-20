import { describe, expect, it } from "vitest";
import { getCurrentRuntime } from "../runtime/current.js";
import { encodeNullifierLookupCalldata, encodeStageCWithdrawChangeNoteCalldata } from "./calldata.js";
import { preflightWithdrawal } from "./preflight.js";

const NULLIFIER = `0x${"2".repeat(64)}` as const;
const CALLDATA = encodeStageCWithdrawChangeNoteCalldata({
  proof: "0x11",
  publicInputs: Array.from({ length: 12 }, (_, index) => `0x${(index + 1).toString(16).padStart(64, "0")}`),
  nullifier: NULLIFIER,
  destination: "0x000000000000000000000000000000000000dEaD",
  grossAmountWei: "10000",
  encryptedChangeNote: "0x22",
  minNetAmountWei: "9967",
  maxFeeWei: "33"
});

describe("withdraw preflight", () => {
  it("checks chain ID, nullifier state, eth_call, and gas estimate before submission", async () => {
    const runtime = getCurrentRuntime();
    const methods: string[] = [];
    const result = await preflightWithdrawal({
      runtime,
      calldata: CALLDATA,
      nullifier: NULLIFIER,
      fetchImpl: async (_url, init) => {
        const body = JSON.parse(String(init?.body ?? "{}")) as { method: string; params?: unknown[]; id: number };
        methods.push(body.method);
        if (body.method === "eth_chainId") {
          return jsonRpc(body.id, "0x10e6");
        }
        if (body.method === "eth_call") {
          const tx = body.params?.[0] as { to?: string; data?: string };
          if (tx.data === encodeNullifierLookupCalldata(NULLIFIER)) {
            expect(tx.to).toBe(runtime.pool);
            return jsonRpc(body.id, `0x${"0".repeat(64)}`);
          }
          expect(tx.data).toBe(CALLDATA);
          return jsonRpc(body.id, "0x");
        }
        if (body.method === "eth_estimateGas") {
          const tx = body.params?.[0] as { to?: string; data?: string; value?: string };
          expect(tx).toMatchObject({ to: runtime.pool, data: CALLDATA, value: "0x0" });
          return jsonRpc(body.id, "0x5208");
        }
        throw new Error(`unexpected method ${body.method}`);
      }
    });

    expect(methods).toEqual(["eth_chainId", "eth_call", "eth_call", "eth_estimateGas"]);
    expect(result).toEqual({
      ok: true,
      chainId: 4326,
      nullifierSpent: false,
      estimatedGas: "0x5208"
    });
  });

  it("fails closed when the RPC chain ID does not match the runtime", async () => {
    await expect(
      preflightWithdrawal({
        runtime: getCurrentRuntime(),
        calldata: CALLDATA,
        nullifier: NULLIFIER,
        fetchImpl: async (_url, init) => {
          const body = JSON.parse(String(init?.body ?? "{}")) as { id: number };
          return jsonRpc(body.id, "0x18c7");
        }
      })
    ).rejects.toThrow("Withdrawal preflight RPC is not connected to MegaETH mainnet 4326.");
  });

  it("rejects already-spent nullifiers before simulating withdrawal calldata", async () => {
    await expect(
      preflightWithdrawal({
        runtime: getCurrentRuntime(),
        calldata: CALLDATA,
        nullifier: NULLIFIER,
        fetchImpl: async (_url, init) => {
          const body = JSON.parse(String(init?.body ?? "{}")) as { method: string; id: number };
          if (body.method === "eth_chainId") {
            return jsonRpc(body.id, "0x10e6");
          }
          return jsonRpc(body.id, `0x${"0".repeat(63)}1`);
        }
      })
    ).rejects.toThrow("Withdrawal nullifier is already spent.");
  });
});

function jsonRpc(id: number, result: string): Response {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id, result }), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}
