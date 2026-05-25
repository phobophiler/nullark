import { describe, expect, it } from "vitest";
import {
  calculateWithdrawalFee,
  createReceiverIdentity,
  derivePrivateBalance,
  type ShieldedNote
} from "@nullark/core";

describe("Phase 0 shielded balance flow", () => {
  it("creates identity, receives private note, displays balance, and calculates public withdrawal", () => {
    const receiver = createReceiverIdentity("receiver-device");
    const receivedNotes: ShieldedNote[] = [
      {
        commitment: "0xabc",
        nullifier: "0xdef",
        ownerViewingKeyId: receiver.viewingKeyId,
        amount: 1_000_000n,
        spent: false
      }
    ];

    const privateBalance = derivePrivateBalance(receivedNotes, receiver.viewingKeyId);
    const withdrawal = calculateWithdrawalFee(privateBalance);

    expect(receiver.serverCanSpend).toBe(false);
    expect(privateBalance).toBe(1_000_000n);
    expect(withdrawal.fee).toBe(3_300n);
    expect(withdrawal.net).toBe(996_700n);
  });
});
