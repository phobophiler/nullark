import { derivePrivateBalance, type ShieldedNote } from "@nullark/core";

const demoNotes: ShieldedNote[] = [
  { commitment: "0xaaa", nullifier: "0x111", ownerViewingKeyId: "view_demo", amount: 500n, spent: false },
  { commitment: "0xbbb", nullifier: "0x222", ownerViewingKeyId: "view_demo", amount: 700n, spent: false }
];

export function PrivateBalancePanel() {
  const balance = derivePrivateBalance(demoNotes, "view_demo");

  return (
    <section aria-label="private balance">
      <h2>Private balance</h2>
      <strong>{balance.toLocaleString("en-US")}</strong>
      <p>Balance is derived locally from decryptable unspent notes.</p>
    </section>
  );
}
