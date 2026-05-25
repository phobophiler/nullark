# Known Limitations

Nullark does not hide every part of a transaction.

- Deposits are public.
- Withdrawals are public.
- Recipients are public.
- Amounts are fixed-denomination but public.
- Timing is public.
- Relayer submission is not anonymity.
- Commitments, nullifiers, and encrypted-note bytes are public chain or event data.
- Production privacy claims are not part of the current public state.

Users should avoid address reuse, avoid self-linking timing patterns, and keep note material, recovery secrets, wallet unlock signatures, private keys, raw witnesses, and proof inputs out of public channels.
