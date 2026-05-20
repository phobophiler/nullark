declare module "circomlibjs" {
  export type Poseidon = {
    F: { toObject(value: unknown): bigint };
    (inputs: readonly bigint[]): unknown;
  };

  export function buildPoseidon(): Promise<Poseidon>;
}
