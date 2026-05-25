export type FixedDenominationSplitPolicy = {
  denominationsWei: readonly bigint[];
  maxNoteCount?: number;
};

export type FixedDenominationSplit = {
  requestedAmountWei: bigint;
  notesWei: bigint[];
  noteCount: number;
  uniqueDenominationsWei: bigint[];
};

export type FixedDenominationPublicExit = {
  noteAmountWei: bigint;
  grossAmountWei: bigint;
};

export type SpendablePublicExitPolicy = FixedDenominationSplitPolicy & {
  allowFullExit?: boolean;
};

export const MAINNET_CANDIDATE_FIXED_DENOMINATIONS_WEI = [
  5_000_000_000_000_000n,
  10_000_000_000_000_000n,
  20_000_000_000_000_000n,
  30_000_000_000_000_000n,
  50_000_000_000_000_000n,
  100_000_000_000_000_000n,
  200_000_000_000_000_000n,
  300_000_000_000_000_000n,
  500_000_000_000_000_000n,
  1_000_000_000_000_000_000n
] as const;

export const MAINNET_CANDIDATE_FIXED_DENOMINATION_POLICY: FixedDenominationSplitPolicy = {
  denominationsWei: MAINNET_CANDIDATE_FIXED_DENOMINATIONS_WEI,
  maxNoteCount: 32
};

export function splitIntoFixedDenominations(
  amountWei: bigint,
  policy: FixedDenominationSplitPolicy = MAINNET_CANDIDATE_FIXED_DENOMINATION_POLICY
): FixedDenominationSplit {
  if (amountWei <= 0n) {
    throw new Error("amountWei must be positive");
  }

  const denominations = normalizeDenominations(policy.denominationsWei);
  const notesWei: bigint[] = [];
  let remaining = amountWei;

  for (const denomination of denominations) {
    while (remaining >= denomination) {
      notesWei.push(denomination);
      remaining -= denomination;
      if (policy.maxNoteCount !== undefined && notesWei.length > policy.maxNoteCount) {
        throw new Error(`fixed-denomination split exceeds max note count ${policy.maxNoteCount}`);
      }
    }
  }

  if (remaining !== 0n) {
    throw new Error(`amountWei has unsupported dust remainder ${remaining.toString()}`);
  }

  return {
    requestedAmountWei: amountWei,
    notesWei,
    noteCount: notesWei.length,
    uniqueDenominationsWei: [...new Set(notesWei)]
  };
}

export function isSupportedFixedDenomination(
  amountWei: bigint,
  policy: FixedDenominationSplitPolicy = MAINNET_CANDIDATE_FIXED_DENOMINATION_POLICY
): boolean {
  return normalizeDenominations(policy.denominationsWei).includes(amountWei);
}

export function spendablePublicExitAmountsForNote(
  noteAmountWei: bigint,
  policy: SpendablePublicExitPolicy = MAINNET_CANDIDATE_FIXED_DENOMINATION_POLICY
): bigint[] {
  if (!isSupportedFixedDenomination(noteAmountWei, policy)) {
    return [];
  }

  const exits = new Set<bigint>();
  if (policy.allowFullExit !== false) {
    exits.add(noteAmountWei);
  }

  for (const changeAmount of normalizeDenominations(policy.denominationsWei)) {
    const exitAmount = noteAmountWei - changeAmount;
    if (changeAmount < noteAmountWei && isSupportedFixedDenomination(exitAmount, policy)) {
      exits.add(exitAmount);
    }
  }

  return [...exits].sort((a, b) => (a > b ? -1 : a < b ? 1 : 0));
}

export function assertFixedDenominationPublicExit(
  exit: FixedDenominationPublicExit,
  policy: FixedDenominationSplitPolicy = MAINNET_CANDIDATE_FIXED_DENOMINATION_POLICY
): FixedDenominationPublicExit {
  if (!isSupportedFixedDenomination(exit.noteAmountWei, policy)) {
    throw new Error("public exit note amount must be a supported fixed denomination");
  }
  if (!isSupportedFixedDenomination(exit.grossAmountWei, policy)) {
    throw new Error("public exit amount must be a supported fixed denomination");
  }
  if (exit.grossAmountWei > exit.noteAmountWei) {
    throw new Error("public exit amount cannot exceed note amount");
  }
  const changeAmountWei = exit.noteAmountWei - exit.grossAmountWei;
  if (changeAmountWei !== 0n && !isSupportedFixedDenomination(changeAmountWei, policy)) {
    throw new Error("public exit private change must be a supported fixed denomination");
  }
  return exit;
}

function normalizeDenominations(denominationsWei: readonly bigint[]): bigint[] {
  if (!Array.isArray(denominationsWei) || denominationsWei.length === 0) {
    throw new Error("fixed denomination policy requires at least one denomination");
  }

  const seen = new Set<bigint>();
  const normalized: bigint[] = [];
  for (const denomination of denominationsWei) {
    if (denomination <= 0n) {
      throw new Error("fixed denominations must be positive");
    }
    if (!seen.has(denomination)) {
      seen.add(denomination);
      normalized.push(denomination);
    }
  }

  return normalized.sort((a, b) => (a > b ? -1 : a < b ? 1 : 0));
}
