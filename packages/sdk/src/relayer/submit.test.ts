import { describe, expect, it } from "vitest";
import { getCurrentRuntime } from "../runtime/current.js";
import { encodeWithdrawBoundedCalldata } from "../withdraw/calldata.js";
import { submitWithdrawalRelayerTransaction } from "./submit.js";

const bytes32 = (byte: string) => `0x${byte.repeat(32)}`;
const calldata = encodeWithdrawBoundedCalldata({
  proof: "0x1234",
  publicInputs: Array.from({ length: 12 }, (_, index) => bytes32((index + 1).toString(16).padStart(2, "0"))),
  nullifier: bytes32("aa"),
  destination: "0x000000000000000000000000000000000000dEaD",
  grossAmountWei: "10001",
  minNetAmountWei: "9900",
  maxFeeWei: "101"
});

describe("relayer submit", () => {
  it("submits a prepared relayer request to the configured HTTPS machine endpoint", async () => {
    const runtime = getCurrentRuntime();
    const requests: Array<{ url: string; body: unknown }> = [];
    const result = await submitWithdrawalRelayerTransaction({
      endpoint: runtime.relayerEndpoint,
      request: {
        chainId: runtime.chainId,
        to: runtime.pool,
        value: "0x0",
        data: calldata,
        deadlineEpochSeconds: 1_780_000_120
      },
      fetchImpl: async (url, init) => {
        requests.push({ url: String(url), body: JSON.parse(String(init?.body ?? "{}")) });
        return Response.json({
          ok: true,
          scope: "deployed-withdrawal-relayer",
          txHash: `0x${"44".repeat(32)}`
        });
      }
    });

    expect(result).toEqual({
      ok: true,
      txHash: `0x${"44".repeat(32)}`,
      scope: "deployed-withdrawal-relayer"
    });
    expect(requests).toEqual([
      {
        url: runtime.relayerEndpoint,
        body: {
          chainId: runtime.chainId,
          to: runtime.pool,
          value: "0x0",
          data: calldata,
          deadlineEpochSeconds: 1_780_000_120
        }
      }
    ]);
  });

  it("fails closed for non-HTTPS endpoints and malformed relayer responses", async () => {
    await expect(
      submitWithdrawalRelayerTransaction({
        endpoint: "http://relayer.nullark.com/transaction",
        request: {
          chainId: 4326,
          to: getCurrentRuntime().pool,
          value: "0x0",
          data: calldata,
          deadlineEpochSeconds: 1_780_000_120
        },
        fetchImpl: async () => Response.json({ ok: true })
      })
    ).rejects.toThrow("HTTPS");

    await expect(
      submitWithdrawalRelayerTransaction({
        endpoint: "https://relayer.nullark.com/transaction",
        request: {
          chainId: 4326,
          to: getCurrentRuntime().pool,
          value: "0x0",
          data: calldata,
          deadlineEpochSeconds: 1_780_000_120
        },
        fetchImpl: async () => Response.json({ ok: true, scope: "deployed-withdrawal-relayer" })
      })
    ).rejects.toThrow("invalid relayer response");
  });
});
