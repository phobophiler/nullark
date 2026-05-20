export type WithdrawProofWorkerRequest = {
  id: string;
  witness: Record<string, unknown>;
};

export type WithdrawProofWorkerSuccess = {
  id: string;
  ok: true;
  proof: `0x${string}`;
  proofCandidates?: `0x${string}`[];
  publicInputs: `0x${string}`[];
  nullifier: `0x${string}`;
};

export type WithdrawProofWorkerFailure = {
  id: string;
  ok: false;
  error: string;
};

export type WithdrawProofWorkerResponse = WithdrawProofWorkerSuccess | WithdrawProofWorkerFailure;

export type WorkerLike = {
  postMessage(message: unknown): void;
  terminate(): void;
  onmessage: ((event: { data: unknown }) => void) | undefined;
  onerror: ((event: unknown) => void) | undefined;
};

export function createWithdrawProofWorkerClient(input: { workerFactory: () => WorkerLike }) {
  return {
    generate(request: WithdrawProofWorkerRequest): Promise<WithdrawProofWorkerSuccess> {
      const worker = input.workerFactory();
      return new Promise((resolve, reject) => {
        worker.onmessage = (event) => {
          const response = event.data as WithdrawProofWorkerResponse;
          if (response.id !== request.id) {
            return;
          }
          worker.terminate();
          if (response.ok) {
            resolve(response);
          } else {
            reject(new Error(response.error));
          }
        };
        worker.onerror = () => {
          worker.terminate();
          reject(new Error("Withdrawal proof worker failed."));
        };
        worker.postMessage(request);
      });
    }
  };
}

export function createDefaultWithdrawProofWorkerClient() {
  return createWithdrawProofWorkerClient({
    workerFactory: () =>
      new Worker(new URL("./withdrawProof.worker.ts", import.meta.url), { type: "module" }) as unknown as WorkerLike
  });
}
