export type HexString = `0x${string}`;

export function isHexString(value: string): value is HexString {
  return /^0x(?:[0-9a-fA-F]{2})*$/.test(value);
}

export function isHexBytes32(value: string): value is HexString {
  return /^0x[0-9a-fA-F]{64}$/.test(value);
}

export function isEvmAddress(value: string): value is HexString {
  return /^0x[0-9a-fA-F]{40}$/.test(value);
}

export function normalizeHex(value: string): HexString {
  if (!isHexString(value)) {
    throw new Error("Expected even-length hex string.");
  }
  return `0x${value.slice(2).toLowerCase()}` as HexString;
}
