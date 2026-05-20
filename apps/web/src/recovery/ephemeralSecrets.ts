export type EphemeralSecretBag = {
  byteArrays: Uint8Array[];
  arrayBuffers: ArrayBuffer[];
  references: unknown[];
  track<T>(value: T): T;
  trackBytes<T extends Uint8Array>(bytes: T): T;
  trackArrayBuffer<T extends ArrayBuffer>(buffer: T): T;
  trackReference<T>(value: T): T;
  clear(): void;
  reset(): void;
};

export function createEphemeralSecretBag(): EphemeralSecretBag {
  const bag: EphemeralSecretBag = {
    byteArrays: [],
    arrayBuffers: [],
    references: [],
    track<T>(value: T): T {
      if (value instanceof Uint8Array) {
        return bag.trackBytes(value) as T;
      }

      if (value instanceof ArrayBuffer) {
        return bag.trackArrayBuffer(value) as T;
      }

      return bag.trackReference(value);
    },
    trackBytes(bytes) {
      bag.byteArrays.push(bytes);
      return bytes;
    },
    trackArrayBuffer(buffer) {
      bag.arrayBuffers.push(buffer);
      return buffer;
    },
    trackReference(value) {
      bag.references.push(value);
      return value;
    },
    clear() {
      const seen = new WeakSet<object>();

      for (const bytes of bag.byteArrays) {
        zeroUint8Array(bytes);
      }

      for (const buffer of bag.arrayBuffers) {
        zeroArrayBuffer(buffer);
      }

      for (const reference of bag.references) {
        zeroNestedByteValues(reference, seen);
      }

      bag.byteArrays.length = 0;
      bag.arrayBuffers.length = 0;
      bag.references.length = 0;
    },
    reset() {
      bag.clear();
    }
  };

  return bag;
}

function zeroNestedByteValues(value: unknown, seen: WeakSet<object>): void {
  if (value instanceof Uint8Array) {
    zeroUint8Array(value);
    return;
  }

  if (value instanceof ArrayBuffer) {
    zeroArrayBuffer(value);
    return;
  }

  if (!isObject(value) || seen.has(value)) {
    return;
  }

  seen.add(value);

  if (Array.isArray(value)) {
    for (const item of value) {
      zeroNestedByteValues(item, seen);
    }
    return;
  }

  if (value instanceof Map) {
    for (const [key, mapValue] of value) {
      zeroNestedByteValues(key, seen);
      zeroNestedByteValues(mapValue, seen);
    }
    return;
  }

  if (value instanceof Set) {
    for (const item of value) {
      zeroNestedByteValues(item, seen);
    }
    return;
  }

  for (const item of Object.values(value as Record<string, unknown>)) {
    zeroNestedByteValues(item, seen);
  }
}

function zeroUint8Array(bytes: Uint8Array): void {
  try {
    bytes.fill(0);
  } catch {
    // Detached or otherwise inaccessible buffers cannot be wiped from JS.
  }
}

function zeroArrayBuffer(buffer: ArrayBuffer): void {
  try {
    new Uint8Array(buffer).fill(0);
  } catch {
    // Detached or otherwise inaccessible buffers cannot be wiped from JS.
  }
}

function isObject(value: unknown): value is object {
  return value !== null && typeof value === "object";
}
