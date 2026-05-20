declare module "circomlibjs" {
  export type Poseidon = {
    (inputs: readonly bigint[]): unknown;
    F: {
      toObject(value: unknown): bigint;
    };
  };

  export function buildPoseidon(): Promise<Poseidon>;
}
