const SENSITIVE_KEY_PATTERN =
  /(seed|mnemonic|privatekey|private_key|secret|spendmaterial|spend_material|witness|signature|proof|zkey|wasm|calldata|data)/i;

const SAFE_VISIBLE_KEY_PATTERN =
  /^(chainId|pool|rpcUrl|relayerEndpoint|relayerEndpointLabel|destination|grossAmountWei|minNetAmountWei|maxFeeWei|deadlineEpochSeconds|privateKeysIncluded|noteSecretsIncluded|rawProofIncluded|fullCalldataIncluded)$/i;

export const NULLARK_REDACTED = "[redacted:nullark-private-material]";

export function redactNullarkDiagnostics<T>(value: T): T {
  return redactValue(value, "") as T;
}

export function redactNullarkSensitiveValue(key: string, value: unknown): unknown {
  if (SAFE_VISIBLE_KEY_PATTERN.test(key)) {
    return value;
  }
  if (SENSITIVE_KEY_PATTERN.test(key)) {
    return NULLARK_REDACTED;
  }
  return redactValue(value, key);
}

function redactValue(value: unknown, key: string): unknown {
  if (SAFE_VISIBLE_KEY_PATTERN.test(key)) {
    return value;
  }
  if (SENSITIVE_KEY_PATTERN.test(key)) {
    return NULLARK_REDACTED;
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, key));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [entryKey, redactNullarkSensitiveValue(entryKey, entryValue)])
    );
  }
  return value;
}
