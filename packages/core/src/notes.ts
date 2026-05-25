export type HexString = `0x${string}`;

export type ShieldedNote = {
  commitment: HexString;
  nullifier: HexString;
  ownerViewingKeyId: string;
  amount: bigint;
  spent: boolean;
};

export type PublicPoolAccounting = {
  deposited: bigint;
  withdrawnNet: bigint;
  accruedProtocolFees: bigint;
  feeSweptAccounting: bigint;
};

export function derivePrivateBalance(notes: ShieldedNote[], viewingKeyId: string): bigint {
  return notes.reduce((balance, note) => {
    if (note.ownerViewingKeyId !== viewingKeyId || note.spent) {
      return balance;
    }

    return balance + note.amount;
  }, 0n);
}

export function markSpent(notes: ShieldedNote[], nullifier: HexString): ShieldedNote[] {
  return notes.map((note) => (note.nullifier === nullifier ? { ...note, spent: true } : note));
}

export function assertPoolSolvent(accounting: PublicPoolAccounting, unspentPrivateNotes: bigint): boolean {
  if (accounting.feeSweptAccounting > accounting.accruedProtocolFees) {
    return false;
  }

  const unsweptFees = accounting.accruedProtocolFees - accounting.feeSweptAccounting;
  return accounting.deposited >= accounting.withdrawnNet + unspentPrivateNotes + unsweptFees;
}
