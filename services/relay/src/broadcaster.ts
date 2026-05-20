export const RELAY_RECEIPT_SECURITY_WARNING =
  "A relay receipt only confirms submission/execution observation; it is not a security check.";

export type HexString = `0x${string}`;

export const MEGAETH_TESTNET_CHAIN_ID = 6343;
export const MEGAETH_MAINNET_CHAIN_ID = 4326;
export const PRIVATE_TRANSFER_WITH_ENCRYPTED_NOTE_SELECTOR = "0x6da3fd67" as const;
export const WITHDRAW_SELECTOR = "0x9b0c797c" as const;
export const WITHDRAW_BOUNDED_SELECTOR = "0xc7787d0f" as const;
export const STAGE_C_WITHDRAW_UNBOUNDED_SELECTOR = "0x7c61e6b1" as const;
export const STAGE_C_WITHDRAW_BOUNDED_SELECTOR = "0x678d8506" as const;
export const TESTNET_WITHDRAWAL_RELAYER_SELECTORS = [
  WITHDRAW_BOUNDED_SELECTOR,
  STAGE_C_WITHDRAW_BOUNDED_SELECTOR
] as const;
export const MAINNET_WITHDRAWAL_RELAYER_SELECTORS = [
  STAGE_C_WITHDRAW_BOUNDED_SELECTOR
] as const;
export const MAINNET_FORBIDDEN_WITHDRAWAL_RELAYER_SELECTORS = [
  WITHDRAW_BOUNDED_SELECTOR,
  STAGE_C_WITHDRAW_UNBOUNDED_SELECTOR
] as const;

export type RelayBroadcastRequest = {
  chainId: number;
  to: HexString;
  data: HexString;
  valueWei: bigint;
  gasLimit: bigint;
  deadlineEpochSeconds: number;
};

export type RelayBroadcastPolicy = {
  allowedChainIds: readonly number[];
  blockedChainIds?: readonly number[];
  allowMegaEthMainnet?: boolean;
  allowedContracts: readonly HexString[];
  allowedFunctionSelectors: readonly HexString[];
  maxValueWei: bigint;
  maxGasLimit: bigint;
  maxDeadlineSecondsFromNow: number;
};

export type RelayPolicyDecision = {
  allowed: boolean;
  errors: string[];
  warnings: string[];
};

export type NonceTooLowRetryInput = {
  originalExecutionChecked: boolean;
  originalTransactionExecuted?: boolean;
};

export type NonceTooLowRetryDecision = {
  canRetry: boolean;
  reason: string;
};

const FUNCTION_SELECTOR_LENGTH = 10;
const MAX_RELAY_DEADLINE_SECONDS_FROM_NOW = 300;

export function validateRelayBroadcastRequest(
  request: RelayBroadcastRequest,
  policy: RelayBroadcastPolicy,
  nowEpochSeconds: number
): RelayPolicyDecision {
  const errors: string[] = [];

  if (policy.maxDeadlineSecondsFromNow > MAX_RELAY_DEADLINE_SECONDS_FROM_NOW) {
    errors.push("relay policy deadline window exceeds short-deadline cap");
  }

  const defaultBlockedChainIds = policy.allowMegaEthMainnet ? [] : [MEGAETH_MAINNET_CHAIN_ID];
  const blockedChainIds = new Set([...defaultBlockedChainIds, ...(policy.blockedChainIds ?? [])]);
  if (blockedChainIds.has(request.chainId)) {
    errors.push(`chain ${request.chainId} is blocked for relay broadcasting`);
  }

  if (request.valueWei < 0n) {
    errors.push("transaction value must be nonnegative");
  }

  if (request.gasLimit <= 0n) {
    errors.push("gas limit must be positive");
  }

  if (!Number.isSafeInteger(request.deadlineEpochSeconds)) {
    errors.push("relay request deadline must be a safe integer");
  }

  if (!Number.isSafeInteger(nowEpochSeconds) || nowEpochSeconds < 0) {
    errors.push("current time must be a nonnegative safe integer");
  }

  if (!policy.allowedChainIds.includes(request.chainId)) {
    errors.push(`chain ${request.chainId} is not allowlisted`);
  }

  const allowedContracts = new Set(policy.allowedContracts.map(normalizeHex));
  if (!allowedContracts.has(normalizeHex(request.to))) {
    errors.push("target contract is not allowlisted");
  }

  const selector = getFunctionSelector(request.data);
  const allowedSelectors = new Set(policy.allowedFunctionSelectors.map(normalizeHex));
  if (selector === null || !allowedSelectors.has(selector)) {
    errors.push("function selector is not allowlisted");
  }
  errors.push(...validateMainnetProductionSelectorPolicy(request, policy, selector));

  if (request.valueWei > policy.maxValueWei) {
    errors.push("transaction value exceeds relay policy maximum");
  }

  if (request.gasLimit > policy.maxGasLimit) {
    errors.push("gas limit exceeds relay policy maximum");
  }

  if (Number.isSafeInteger(request.deadlineEpochSeconds) && request.deadlineEpochSeconds <= nowEpochSeconds) {
    errors.push("relay request deadline is expired");
  }

  if (
    Number.isSafeInteger(request.deadlineEpochSeconds) &&
    Number.isSafeInteger(nowEpochSeconds) &&
    request.deadlineEpochSeconds > nowEpochSeconds + policy.maxDeadlineSecondsFromNow
  ) {
    errors.push("relay request deadline is too far in the future");
  }

  return {
    allowed: errors.length === 0,
    errors,
    warnings: [RELAY_RECEIPT_SECURITY_WARNING]
  };
}

function validateMainnetProductionSelectorPolicy(
  request: RelayBroadcastRequest,
  policy: RelayBroadcastPolicy,
  selector: string | null
): string[] {
  if (request.chainId !== MEGAETH_MAINNET_CHAIN_ID || policy.allowMegaEthMainnet !== true) {
    return [];
  }

  const errors: string[] = [];
  const approvedSelectors = new Set(MAINNET_WITHDRAWAL_RELAYER_SELECTORS.map(normalizeHex));
  const configuredSelectors = new Set(policy.allowedFunctionSelectors.map(normalizeHex));
  for (const configuredSelector of configuredSelectors) {
    if (!approvedSelectors.has(configuredSelector)) {
      errors.push(`mainnet relay policy includes non-production selector ${configuredSelector}`);
    }
  }

  if (selector === null || !approvedSelectors.has(selector)) {
    errors.push("function selector is not approved for MegaETH mainnet production relayer");
  }

  return errors;
}

export function decideNonceTooLowRetry(input: NonceTooLowRetryInput): NonceTooLowRetryDecision {
  if (!input.originalExecutionChecked) {
    return {
      canRetry: false,
      reason: "nonce-too-low retry blocked until the original transaction execution status is checked"
    };
  }

  if (input.originalTransactionExecuted !== false) {
    return {
      canRetry: false,
      reason: "nonce-too-low retry blocked because the original transaction may already have executed"
    };
  }

  return {
    canRetry: true,
    reason: "retry allowed only after confirming the original transaction did not execute"
  };
}

function getFunctionSelector(data: HexString): string | null {
  if (!data.startsWith("0x") || data.length < FUNCTION_SELECTOR_LENGTH) {
    return null;
  }

  return normalizeHex(data.slice(0, FUNCTION_SELECTOR_LENGTH) as HexString);
}

function normalizeHex(value: HexString): string {
  return value.toLowerCase();
}
