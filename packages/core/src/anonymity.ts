export type CommitmentId = `0x${string}`;

export type AnonymitySetNote = {
  commitment: CommitmentId;
  depositorId: string;
  depositedAtMs: number;
  spent?: boolean;
  internalFixture?: boolean;
};

export type AnonymitySetPolicy = {
  minEligibleCommitments: number;
  minUniqueDepositors: number;
  minAgeMs: number;
  windowMs?: number;
};

export type AnonymitySetEvaluation = {
  eligibleCommitments: CommitmentId[];
  eligibleNoteCount: number;
  uniqueDepositorCount: number;
  thresholdMet: boolean;
  warnings: string[];
};

export function evaluateAnonymitySet(
  notes: readonly AnonymitySetNote[],
  policy: AnonymitySetPolicy,
  nowMs: number
): AnonymitySetEvaluation {
  validatePolicy(policy);
  validateTimestamp(nowMs, "nowMs");

  const eligibleNotes = notes.filter((note) => isEligibleAnonymityNote(note, policy, nowMs));
  const uniqueDepositors = new Set(eligibleNotes.map((note) => note.depositorId.trim()));
  const warnings: string[] = [];

  if (eligibleNotes.length < policy.minEligibleCommitments) {
    warnings.push(
      `anonymity set below commitment threshold: ${eligibleNotes.length}/${policy.minEligibleCommitments} eligible commitments`
    );
  }

  if (uniqueDepositors.size < policy.minUniqueDepositors) {
    warnings.push(
      `anonymity set below depositor threshold: ${uniqueDepositors.size}/${policy.minUniqueDepositors} unique depositors`
    );
  }

  return {
    eligibleCommitments: eligibleNotes.map((note) => note.commitment),
    eligibleNoteCount: eligibleNotes.length,
    uniqueDepositorCount: uniqueDepositors.size,
    thresholdMet: warnings.length === 0,
    warnings
  };
}

export function isEligibleAnonymityNote(note: AnonymitySetNote, policy: AnonymitySetPolicy, nowMs: number): boolean {
  validatePolicy(policy);
  validateTimestamp(nowMs, "nowMs");
  validateNote(note);

  if (note.spent || note.internalFixture) {
    return false;
  }

  const ageMs = nowMs - note.depositedAtMs;
  if (ageMs < policy.minAgeMs) {
    return false;
  }

  if (policy.windowMs !== undefined && ageMs > policy.windowMs) {
    return false;
  }

  return true;
}

function validatePolicy(policy: AnonymitySetPolicy): void {
  if (!Number.isSafeInteger(policy.minEligibleCommitments) || policy.minEligibleCommitments < 1) {
    throw new Error("minEligibleCommitments must be a positive safe integer");
  }

  if (!Number.isSafeInteger(policy.minUniqueDepositors) || policy.minUniqueDepositors < 1) {
    throw new Error("minUniqueDepositors must be a positive safe integer");
  }

  if (!Number.isSafeInteger(policy.minAgeMs) || policy.minAgeMs < 0) {
    throw new Error("minAgeMs must be a nonnegative safe integer");
  }

  if (policy.windowMs !== undefined && (!Number.isSafeInteger(policy.windowMs) || policy.windowMs < policy.minAgeMs)) {
    throw new Error("windowMs must be a safe integer greater than or equal to minAgeMs");
  }
}

function validateNote(note: AnonymitySetNote): void {
  if (typeof note.commitment !== "string" || !note.commitment.startsWith("0x") || note.commitment.length <= 2) {
    throw new Error("commitment must be a nonempty hex-like string");
  }

  if (note.depositorId.trim().length === 0) {
    throw new Error("depositorId required");
  }

  validateTimestamp(note.depositedAtMs, "depositedAtMs");
}

function validateTimestamp(value: number, fieldName: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${fieldName} must be a nonnegative safe integer`);
  }
}
