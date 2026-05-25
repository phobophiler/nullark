import { createReceiverIdentity } from "@nullark/core";

export function ReceiverIdentityPanel({ seed }: { seed: string }) {
  const identity = createReceiverIdentity(seed);

  return (
    <section aria-label="receiver identity">
      <h2>Private receiving identity</h2>
      <p>Created locally. The server cannot spend funds and there is no universal admin recovery.</p>
      <dl>
        <dt>Receiving handle</dt>
        <dd>{identity.shareableHandle}</dd>
        <dt>Viewing key</dt>
        <dd>{identity.viewingKeyId}</dd>
      </dl>
    </section>
  );
}
