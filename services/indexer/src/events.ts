export type RawPoolEvent = {
  name: string;
};

export type ClassifiedPoolEvent = {
  kind: "deposit" | "private-transfer" | "nullifier" | "withdrawal" | "fees-accrued" | "fees-swept" | "unknown";
  authoritativeForBalance: false;
};

export function classifyPoolEvent(event: RawPoolEvent): ClassifiedPoolEvent {
  const kindByName: Record<string, ClassifiedPoolEvent["kind"]> = {
    DepositCommitmentInserted: "deposit",
    PrivateTransferCommitmentInserted: "private-transfer",
    NullifierSpent: "nullifier",
    WithdrawalExecuted: "withdrawal",
    ProtocolFeesAccrued: "fees-accrued",
    ProtocolFeesSwept: "fees-swept"
  };

  return {
    kind: kindByName[event.name] ?? "unknown",
    authoritativeForBalance: false
  };
}
