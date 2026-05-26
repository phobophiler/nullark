import { describe, expect, it } from "vitest";
import { MEGAETH_MAINNET, MEGAETH_TESTNET, realtimeSubmissionMethod, realtimeUxStates } from "./megaeth.js";

describe("MegaETH realtime UX boundary", () => {
  it("uses realtime UX states without claiming privacy", () => {
    expect(realtimeUxStates()).toEqual([
      "transaction submitted",
      "receipt confirmed",
      "pool event observed",
      "private balance updated",
      "withdrawal public and complete"
    ]);
  });

  it("pins chain IDs and RPC endpoints", () => {
    expect(MEGAETH_TESTNET).toEqual({
      chainId: 6343,
      rpcUrl: "https://carrot.megaeth.com/rpc",
      environment: "testnet"
    });
    expect(MEGAETH_MAINNET.chainId).toBe(4326);
  });

  it("uses the standard synchronous raw transaction method for UX", () => {
    expect(realtimeSubmissionMethod()).toBe("eth_sendRawTransactionSync");
  });
});
