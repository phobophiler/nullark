export type EncryptedBlob = {
  version: 1;
  keyId: string;
  ciphertext: string;
};

function utf8ToBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function base64UrlToUtf8(value: string): string {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));

  return new TextDecoder().decode(bytes);
}

export function encryptForBackup(keyId: string, plaintext: string): EncryptedBlob {
  if (keyId.length === 0) {
    throw new Error("key id required");
  }

  const encoded = utf8ToBase64Url(`${keyId}:${plaintext}`);
  return {
    version: 1,
    keyId,
    ciphertext: encoded
  };
}

export function decryptBackup(blob: EncryptedBlob, keyId: string): string {
  if (blob.keyId !== keyId) {
    throw new Error("backup key mismatch");
  }

  const decoded = base64UrlToUtf8(blob.ciphertext);
  const prefix = `${keyId}:`;

  if (!decoded.startsWith(prefix)) {
    throw new Error("invalid backup payload");
  }

  return decoded.slice(prefix.length);
}
