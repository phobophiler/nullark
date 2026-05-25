import { describe, expect, it } from "vitest";
import { createEphemeralSecretBag } from "./ephemeralSecrets.js";

describe("ephemeral secret bag", () => {
  it("tracks runtime-only values before clear and drops bag references after clear", () => {
    const bag = createEphemeralSecretBag();
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const buffer = new ArrayBuffer(4);
    const witness = { noteSecret: `0x${"11".repeat(32)}`, leafIndex: 7 };
    const workerPayload = { witness, values: [bytes, { buffer }] };

    bag.track("spend-material");
    bag.trackReference(witness);
    bag.trackBytes(bytes);
    bag.trackArrayBuffer(buffer);
    bag.track(workerPayload);

    expect(bag.references).toEqual(["spend-material", witness, workerPayload]);
    expect(bag.byteArrays).toEqual([bytes]);
    expect(bag.arrayBuffers).toEqual([buffer]);

    bag.clear();

    expect(bag.references).toHaveLength(0);
    expect(bag.byteArrays).toHaveLength(0);
    expect(bag.arrayBuffers).toHaveLength(0);
  });

  it("zeros tracked Uint8Array bytes before dropping references", () => {
    const bag = createEphemeralSecretBag();
    const secretBytes = new Uint8Array([1, 2, 3, 4]);

    bag.trackBytes(secretBytes);
    bag.clear();

    expect(Array.from(secretBytes)).toEqual([0, 0, 0, 0]);
  });

  it("zeros tracked ArrayBuffer bytes before dropping references", () => {
    const bag = createEphemeralSecretBag();
    const secretBuffer = new ArrayBuffer(4);
    const secretBytes = new Uint8Array(secretBuffer);
    secretBytes.set([9, 8, 7, 6]);

    bag.trackArrayBuffer(secretBuffer);
    bag.clear();

    expect(Array.from(secretBytes)).toEqual([0, 0, 0, 0]);
  });

  it("zeros byte values nested inside tracked objects", () => {
    const bag = createEphemeralSecretBag();
    const nestedBytes = new Uint8Array([5, 6, 7, 8]);
    const nestedBuffer = new ArrayBuffer(4);
    const nestedBufferBytes = new Uint8Array(nestedBuffer);
    nestedBufferBytes.set([4, 3, 2, 1]);
    const workerPayload = {
      witness: {
        noteSecret: `0x${"22".repeat(32)}`,
        nested: [{ bytes: nestedBytes }, new Map([["buffer", nestedBuffer]])]
      }
    };

    bag.trackReference(workerPayload);
    bag.clear();

    expect(Array.from(nestedBytes)).toEqual([0, 0, 0, 0]);
    expect(Array.from(nestedBufferBytes)).toEqual([0, 0, 0, 0]);
  });

  it("supports idempotent clear and reset calls", () => {
    const bag = createEphemeralSecretBag();
    const secretBytes = new Uint8Array([1, 2, 3, 4]);

    bag.track(secretBytes);
    bag.clear();
    bag.clear();
    bag.reset();

    expect(Array.from(secretBytes)).toEqual([0, 0, 0, 0]);
    expect(bag.references).toHaveLength(0);
    expect(bag.byteArrays).toHaveLength(0);
    expect(bag.arrayBuffers).toHaveLength(0);
  });
});
