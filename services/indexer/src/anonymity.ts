import type { ClassifiedPoolEvent } from "./events.js";

export type AnonymityEvent = Pick<ClassifiedPoolEvent, "kind"> & {
  commitment?: string;
  nullifier?: string;
  blockNumber?: number;
  transactionHash?: string;
  logIndex?: number;
  account?: string;
  amount?: string | bigint | number;
};

export type AnonymitySetSummary = {
  eligibleCommitmentCount: number;
  depositCommitmentCount: number;
  privateTransferCommitmentCount: number;
  spentNullifierCount: number;
  withdrawalCount: number;
  authoritativeForBalance: false;
  claim: "count-only-anonymity-set";
};

export type UiAnonymitySummary = {
  eligibleCommitmentCount: number;
  authoritativeForBalance: false;
  claim: "count-only-anonymity-set";
};

export function computeAnonymitySetSummary(events: readonly AnonymityEvent[]): AnonymitySetSummary {
  let depositCommitmentCount = 0;
  let privateTransferCommitmentCount = 0;
  let spentNullifierCount = 0;
  let withdrawalCount = 0;

  for (const event of events) {
    if (event.kind === "deposit") {
      depositCommitmentCount += 1;
    } else if (event.kind === "private-transfer") {
      privateTransferCommitmentCount += 1;
    } else if (event.kind === "nullifier") {
      spentNullifierCount += 1;
    } else if (event.kind === "withdrawal") {
      withdrawalCount += 1;
    }
  }

  return {
    eligibleCommitmentCount: depositCommitmentCount + privateTransferCommitmentCount,
    depositCommitmentCount,
    privateTransferCommitmentCount,
    spentNullifierCount,
    withdrawalCount,
    authoritativeForBalance: false,
    claim: "count-only-anonymity-set"
  };
}

export function toUiAnonymitySummary(summary: AnonymitySetSummary): UiAnonymitySummary {
  return {
    eligibleCommitmentCount: summary.eligibleCommitmentCount,
    authoritativeForBalance: false,
    claim: summary.claim
  };
}
