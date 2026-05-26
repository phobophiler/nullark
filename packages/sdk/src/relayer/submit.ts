import type { RelayerTransactionRequest } from "../adapters/index.js";
import { isEvmAddress, isHexString, type HexString } from "../types.js";
import { assertStageCWithdrawBoundedCalldata } from "../withdraw/calldata.js";

export type WithdrawalRelayerSubmitResult = {
  ok: true;
  txHash: HexString;
  scope: "deployed-withdrawal-relayer" | "local-untrusted-dev-only";
};

export async function submitWithdrawalRelayerTransaction(input: {
  endpoint: string;
  request: RelayerTransactionRequest;
  fetchImpl?: typeof fetch;
}): Promise<WithdrawalRelayerSubmitResult> {
  const endpoint = assertHttpsEndpoint(input.endpoint);
  const request = assertRelayerTransactionRequest(input.request);
  const response = await (input.fetchImpl ?? fetch)(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request)
  });

  if (!response.ok) {
    const failure = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(failure.error ?? `relayer returned HTTP ${response.status}`);
  }

  const body = (await response.json()) as Partial<WithdrawalRelayerSubmitResult>;
  if (
    body.ok !== true ||
    (body.scope !== "deployed-withdrawal-relayer" && body.scope !== "local-untrusted-dev-only") ||
    typeof body.txHash !== "string" ||
    !/^0x[0-9a-fA-F]{64}$/.test(body.txHash)
  ) {
    throw new Error("invalid relayer response");
  }

  return {
    ok: true,
    scope: body.scope,
    txHash: body.txHash as HexString
  };
}

function assertHttpsEndpoint(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("Relayer endpoint must be a valid HTTPS URL.");
  }
  if (parsed.protocol !== "https:") {
    throw new Error("Relayer endpoint must use HTTPS.");
  }
  return parsed.toString();
}

function assertRelayerTransactionRequest(value: RelayerTransactionRequest): RelayerTransactionRequest {
  if (!Number.isSafeInteger(value.chainId) || value.chainId <= 0) {
    throw new Error("Relayer request chain ID must be a positive safe integer.");
  }
  if (!isEvmAddress(value.to)) {
    throw new Error("Relayer request target must be an EVM address.");
  }
  if (value.value !== "0x0") {
    throw new Error("Relayer request value must be 0x0.");
  }
  assertStageCWithdrawBoundedCalldata(value.data);
  if (!isHexString(value.data)) {
    throw new Error("Relayer request data must be hex.");
  }
  if (!Number.isSafeInteger(value.deadlineEpochSeconds) || value.deadlineEpochSeconds <= 0) {
    throw new Error("Relayer request deadline must be a positive safe integer.");
  }
  return value;
}
