import { describe, expect, it } from "vitest";
import {
  MAINNET_WITHDRAWAL_RELAYER_SELECTORS,
  MAINNET_FORBIDDEN_WITHDRAWAL_RELAYER_SELECTORS,
  MEGAETH_MAINNET_CHAIN_ID,
  PRIVATE_TRANSFER_WITH_ENCRYPTED_NOTE_SELECTOR,
  RELAY_RECEIPT_SECURITY_WARNING,
  TESTNET_WITHDRAWAL_RELAYER_SELECTORS,
  WITHDRAW_BOUNDED_SELECTOR,
  WITHDRAW_SELECTOR,
  STAGE_C_WITHDRAW_BOUNDED_SELECTOR,
  STAGE_C_WITHDRAW_UNBOUNDED_SELECTOR,
  decideNonceTooLowRetry,
  validateRelayBroadcastRequest,
  type RelayBroadcastPolicy,
  type RelayBroadcastRequest
} from "./broadcaster.js";

const NOW = 1_800_000_000;
const ALLOWED_CONTRACT = "0x1111111111111111111111111111111111111111";
const ALLOWED_SELECTOR = "0xa9059cbb";
const MAINNET_CONTRACT = "0x2222222222222222222222222222222222222222";

const policy: RelayBroadcastPolicy = {
  allowedChainIds: [6343],
  allowedContracts: [ALLOWED_CONTRACT],
  allowedFunctionSelectors: [ALLOWED_SELECTOR],
  maxValueWei: 0n,
  maxGasLimit: 500_000n,
  maxDeadlineSecondsFromNow: 120
};

const validRequest: RelayBroadcastRequest = {
  chainId: 6343,
  to: ALLOWED_CONTRACT,
  data: `${ALLOWED_SELECTOR}0000000000000000000000002222222222222222222222222222222222222222`,
  valueWei: 0n,
  gasLimit: 250_000n,
  deadlineEpochSeconds: NOW + 60
};

describe("relay broadcaster policy", () => {
  it("allows only an explicitly allowlisted testnet contract and selector within value gas and deadline caps", () => {
    const decision = validateRelayBroadcastRequest(validRequest, policy, NOW);

    expect(decision.allowed).toBe(true);
    expect(decision.errors).toEqual([]);
    expect(decision.warnings).toContain(RELAY_RECEIPT_SECURITY_WARNING);
  });

  it("blocks MegaETH mainnet even when accidentally included in the allowlist", () => {
    const decision = validateRelayBroadcastRequest(
      { ...validRequest, chainId: 4326 },
      { ...policy, allowedChainIds: [4326, 6343] },
      NOW
    );

    expect(decision.allowed).toBe(false);
    expect(decision.errors).toContain("chain 4326 is blocked for relay broadcasting");
  });

  it("blocks MegaETH mainnet even when policy tries to clear blocked chains", () => {
    const decision = validateRelayBroadcastRequest(
      { ...validRequest, chainId: 4326 },
      { ...policy, allowedChainIds: [4326], blockedChainIds: [] },
      NOW
    );

    expect(decision.allowed).toBe(false);
    expect(decision.errors).toContain("chain 4326 is blocked for relay broadcasting");
  });

  it("allows MegaETH mainnet only in explicit production mode", () => {
    const selector = MAINNET_WITHDRAWAL_RELAYER_SELECTORS[0];
    const decision = validateRelayBroadcastRequest(
      {
        ...validRequest,
        chainId: MEGAETH_MAINNET_CHAIN_ID,
        to: MAINNET_CONTRACT,
        data: `${selector}00`
      },
      {
        ...policy,
        allowedChainIds: [MEGAETH_MAINNET_CHAIN_ID],
        allowMegaEthMainnet: true,
        allowedContracts: [MAINNET_CONTRACT],
        allowedFunctionSelectors: MAINNET_WITHDRAWAL_RELAYER_SELECTORS
      },
      NOW
    );

    expect(decision.allowed).toBe(true);
    expect(decision.errors).toEqual([]);
  });

  it("rejects stale or forbidden selectors even if a production policy accidentally allowlists them", () => {
    for (const selector of MAINNET_FORBIDDEN_WITHDRAWAL_RELAYER_SELECTORS) {
      const decision = validateRelayBroadcastRequest(
        {
          ...validRequest,
          chainId: MEGAETH_MAINNET_CHAIN_ID,
          to: MAINNET_CONTRACT,
          data: `${selector}00`
        },
        {
          ...policy,
          allowedChainIds: [MEGAETH_MAINNET_CHAIN_ID],
          allowMegaEthMainnet: true,
          allowedContracts: [MAINNET_CONTRACT],
          allowedFunctionSelectors: [selector]
        },
        NOW
      );

      expect(decision.allowed).toBe(false);
      expect(decision.errors).toContain(`mainnet relay policy includes non-production selector ${selector}`);
      expect(decision.errors).toContain("function selector is not approved for MegaETH mainnet production relayer");
    }
  });

  it("fails closed when a production policy mixes v1.1 approval with stale selectors", () => {
    const selector = MAINNET_WITHDRAWAL_RELAYER_SELECTORS[0];
    const staleSelector = STAGE_C_WITHDRAW_UNBOUNDED_SELECTOR;
    const decision = validateRelayBroadcastRequest(
      {
        ...validRequest,
        chainId: MEGAETH_MAINNET_CHAIN_ID,
        to: MAINNET_CONTRACT,
        data: `${selector}00`
      },
      {
        ...policy,
        allowedChainIds: [MEGAETH_MAINNET_CHAIN_ID],
        allowMegaEthMainnet: true,
        allowedContracts: [MAINNET_CONTRACT],
        allowedFunctionSelectors: [selector, staleSelector]
      },
      NOW
    );

    expect(decision.allowed).toBe(false);
    expect(decision.errors).toContain(`mainnet relay policy includes non-production selector ${staleSelector}`);
  });

  it("keeps production mainnet relayer policy on the current private-change withdraw selector only", () => {
    expect(MAINNET_WITHDRAWAL_RELAYER_SELECTORS).toEqual([STAGE_C_WITHDRAW_BOUNDED_SELECTOR]);
    expect(MAINNET_WITHDRAWAL_RELAYER_SELECTORS).not.toContain(PRIVATE_TRANSFER_WITH_ENCRYPTED_NOTE_SELECTOR);
    expect(MAINNET_WITHDRAWAL_RELAYER_SELECTORS).not.toContain(WITHDRAW_SELECTOR);
    expect(MAINNET_WITHDRAWAL_RELAYER_SELECTORS).not.toContain(WITHDRAW_BOUNDED_SELECTOR);
    expect(MAINNET_WITHDRAWAL_RELAYER_SELECTORS).not.toContain(STAGE_C_WITHDRAW_UNBOUNDED_SELECTOR);
    expect(TESTNET_WITHDRAWAL_RELAYER_SELECTORS).not.toContain(PRIVATE_TRANSFER_WITH_ENCRYPTED_NOTE_SELECTOR);
    expect(TESTNET_WITHDRAWAL_RELAYER_SELECTORS).toContain(STAGE_C_WITHDRAW_BOUNDED_SELECTOR);
  });

  it("rejects non-allowlisted contract and function selector", () => {
    const decision = validateRelayBroadcastRequest(
      {
        ...validRequest,
        to: "0x3333333333333333333333333333333333333333",
        data: "0x095ea7b30000000000000000000000002222222222222222222222222222222222222222"
      },
      policy,
      NOW
    );

    expect(decision.allowed).toBe(false);
    expect(decision.errors).toEqual([
      "target contract is not allowlisted",
      "function selector is not allowlisted"
    ]);
  });

  it("rejects value, gas, expired deadline, and long-lived relay requests", () => {
    expect(validateRelayBroadcastRequest({ ...validRequest, valueWei: 1n }, policy, NOW).errors).toContain(
      "transaction value exceeds relay policy maximum"
    );
    expect(validateRelayBroadcastRequest({ ...validRequest, gasLimit: 500_001n }, policy, NOW).errors).toContain(
      "gas limit exceeds relay policy maximum"
    );
    expect(validateRelayBroadcastRequest({ ...validRequest, deadlineEpochSeconds: NOW }, policy, NOW).errors).toContain(
      "relay request deadline is expired"
    );
    expect(
      validateRelayBroadcastRequest({ ...validRequest, deadlineEpochSeconds: NOW + 121 }, policy, NOW).errors
    ).toContain("relay request deadline is too far in the future");
  });

  it("rejects malformed negative or non-finite relay bounds before broadcast", () => {
    expect(validateRelayBroadcastRequest({ ...validRequest, valueWei: -1n }, policy, NOW).errors).toContain(
      "transaction value must be nonnegative"
    );
    expect(validateRelayBroadcastRequest({ ...validRequest, gasLimit: 0n }, policy, NOW).errors).toContain(
      "gas limit must be positive"
    );
    expect(validateRelayBroadcastRequest({ ...validRequest, gasLimit: -1n }, policy, NOW).errors).toContain(
      "gas limit must be positive"
    );
    expect(validateRelayBroadcastRequest({ ...validRequest, deadlineEpochSeconds: Number.NaN }, policy, NOW).errors).toContain(
      "relay request deadline must be a safe integer"
    );
  });

  it("rejects relay policy configurations that do not enforce a short deadline", () => {
    const decision = validateRelayBroadcastRequest(
      { ...validRequest, deadlineEpochSeconds: NOW + 60 },
      { ...policy, maxDeadlineSecondsFromNow: 3_600 },
      NOW
    );

    expect(decision.allowed).toBe(false);
    expect(decision.errors).toContain("relay policy deadline window exceeds short-deadline cap");
  });

  it("does not blindly retry nonce-too-low until execution status has been checked", () => {
    expect(decideNonceTooLowRetry({ originalExecutionChecked: false })).toMatchObject({ canRetry: false });
    expect(
      decideNonceTooLowRetry({ originalExecutionChecked: true, originalTransactionExecuted: true })
    ).toMatchObject({ canRetry: false });
    expect(
      decideNonceTooLowRetry({ originalExecutionChecked: true, originalTransactionExecuted: false })
    ).toMatchObject({ canRetry: true });
  });
});
