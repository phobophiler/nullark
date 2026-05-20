declare module "snarkjs" {
  export interface Groth16 {
    fullProve(
      witness: Record<string, string | string[] | number | bigint>,
      wasmFilePath: string,
      zkeyFilePath: string
    ): Promise<{
      proof: unknown;
      publicSignals: unknown[];
    }>;
    exportSolidityCallData(proof: unknown, publicSignals: unknown[]): Promise<string>;
  }

  export const groth16: Groth16;
}
