import { describe, expect, it, vi } from "vitest";
import { createWithdrawProofWorkerClient } from "./withdrawProofWorkerClient.js";

describe("withdraw proof worker client", () => {
  it("generates withdrawal proof through a trusted local worker without fetch", async () => {
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

  it("forwards explicit v1.2 unlinkable public input schema to the worker", async () => {
    const posted: unknown[] = [];
    const worker = {
      postMessage(message: unknown) {
        posted.push(message);
        queueMicrotask(() => {
          this.onmessage?.({
            data: {
              id: "proof-v12",
              ok: true,
              proof: "0x1234",
              publicInputs: Array.from({ length: 10 }, (_item, index) => `0x${BigInt(index + 1).toString(16).padStart(64, "0")}`),
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
    await client.generate({
      id: "proof-v12",
      publicInputSchema: "v1.2-unlinkable",
      witness: {
        noteSecret: `0x${"33".repeat(32)}`,
        leafIndex: 0
      }
    });

    expect(posted[0]).toMatchObject({ publicInputSchema: "v1.2-unlinkable" });
  });
});
