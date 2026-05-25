import type { HexString } from "../types.js";

export type CryptoProvider = {
  sha256(data: Uint8Array): Promise<Uint8Array>;
  randomBytes(length: number): Uint8Array;
};

export type FetchProvider = {
  fetch(input: string | URL, init?: RequestInit): Promise<Response>;
};

export type ArtifactResolver = {
  resolve(path: string): Promise<string>;
};

export type ProverRunner<TWitness = unknown> = {
  fullProve(witness: TWitness, wasmPath: string, zkeyPath: string): Promise<{
    proof: unknown;
    publicSignals: readonly string[];
  }>;
};

export type SignerProvider = {
  signTypedData(typedData: unknown): Promise<HexString>;
  prepareTransaction?(transaction: PreparedTransactionRequest): Promise<PreparedTransactionRequest>;
};

export type StorageProvider = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

export type TransactionSubmitter = {
  submit(transaction: RelayerTransactionRequest | PreparedTransactionRequest): Promise<{
    txHash?: HexString;
    status: "submitted" | "prepared";
  }>;
};

export type RelayerTransactionRequest = {
  chainId: number;
  to: HexString;
  value: "0x0";
  data: HexString;
  deadlineEpochSeconds: number;
};

export type PreparedTransactionRequest = {
  chainId: number;
  to: HexString;
  value: 0n;
  data: HexString;
};

export class MemoryOnlyStorageProvider implements StorageProvider {
  private readonly values = new Map<string, string>();

  async getItem(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }

  async removeItem(key: string): Promise<void> {
    this.values.delete(key);
  }
}
