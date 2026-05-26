export type ReceiverIdentity = {
  deviceId: string;
  viewingKeyId: string;
  spendingKeyId: string;
  shareableHandle: string;
  serverCanSpend: false;
};

function deterministicId(prefix: string, seed: string): string {
  let hash = 2166136261;
  for (const char of seed) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `${prefix}_${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function createReceiverIdentity(deviceId: string): ReceiverIdentity {
  if (deviceId.trim().length === 0) {
    throw new Error("device id required");
  }

  const normalizedDeviceId = deviceId.trim();

  return {
    deviceId: normalizedDeviceId,
    viewingKeyId: deterministicId("view", `${normalizedDeviceId}:view`),
    spendingKeyId: deterministicId("spend", `${normalizedDeviceId}:spend`),
    shareableHandle: `${deterministicId("recv", normalizedDeviceId)}.shield`,
    serverCanSpend: false
  };
}
