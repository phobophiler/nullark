import { describe, expect, it, vi } from "vitest";
import { createWithdrawProofWorkerClient } from "./withdrawProofWorkerClient.js";

describe("withdraw proof worker client", () => {
  it("generates withdrawal proof through a user-controlled worker without fetch", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const posted: unknown[] = [];
    const worker = {
      postMessage(message: unknown) {
        posted.push(message);
        queueMicrotask(() => {
          this.onmessage?.({
            data: {
              id: "proof-1",
              ok: true,
              proof: "0x1234",
              publicInputs: [`0x${"11".repeat(32)}`],
              nullifier: `0x${"22".repeat(32)}`
            }
          });
        });
      },
      terminate() {},
      onmessage: undefined as ((event: { data: unknown }) => void) | undefined,
      onerror: undefined as ((event: unknown) => void) | undefined
    };

    const client = createWithdrawProofWorkerClient({ workerFactory: () => worker });
    const result = await client.generate({
      id: "proof-1",
      witness: {
        noteSecret: `0x${"33".repeat(32)}`,
        leafIndex: 0
      }
    });

    expect(result.proof).toBe("0x1234");
    expect(posted).toHaveLength(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
