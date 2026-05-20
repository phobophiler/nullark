import type { NullarkCurrentRuntime } from "../runtime/current.js";
import type { PreparedTransactionRequest, RelayerTransactionRequest } from "../adapters/index.js";
import {
  buildDirectWalletWithdrawalTransaction,
  buildWithdrawalRelayerRequest
} from "../relayer/request.js";
import type { HexString } from "../types.js";
import {
  encodeVerifiedStageCWithdrawChangeNoteCalldata,
  encodeVerifiedWithdrawBoundedCalldata,
  type StageCWithdrawChangeNoteCalldataInput,
  type WithdrawBoundedCalldataInput,
  type WithdrawPublicInputBinding
} from "./calldata.js";

export type WithdrawalProofBundle = {
  proof: HexString;
  publicInputs: readonly HexString[];
  nullifier: HexString;
  currentRoot: HexString;
};

export type WithdrawalPlanInput = WithdrawalProofBundle & {
  runtime: NullarkCurrentRuntime;
  destination: HexString;
  grossAmountWei: string;
  minNetAmountWei: string;
  maxFeeWei: string;
  encryptedChangeNote?: HexString | undefined;
  changeCommitment?: HexString | undefined;
  nowEpochSeconds?: number | undefined;
};

export type WithdrawalPlan = {
  chainId: number;
  pool: HexString;
  calldata: HexString;
  relayerRequest: RelayerTransactionRequest;
  directWalletTransaction: PreparedTransactionRequest;
};

export function createWithdrawalPlan(input: WithdrawalPlanInput): WithdrawalPlan {
  const common: WithdrawBoundedCalldataInput &
    Omit<WithdrawPublicInputBinding, "publicInputs" | "nullifier" | "destination" | "grossAmountWei"> = {
    proof: input.proof,
    publicInputs: input.publicInputs,
    nullifier: input.nullifier,
    destination: input.destination,
    grossAmountWei: input.grossAmountWei,
    minNetAmountWei: input.minNetAmountWei,
    maxFeeWei: input.maxFeeWei,
    currentRoot: input.currentRoot,
    changeCommitment: input.changeCommitment,
    expectedPool: input.runtime.pool,
    expectedChainId: input.runtime.chainId
  };
  const calldata =
    input.encryptedChangeNote === undefined
      ? encodeVerifiedWithdrawBoundedCalldata(common)
      : encodeVerifiedStageCWithdrawChangeNoteCalldata({
          ...common,
          encryptedChangeNote: input.encryptedChangeNote
        } satisfies StageCWithdrawChangeNoteCalldataInput &
          Omit<WithdrawPublicInputBinding, "publicInputs" | "nullifier" | "destination" | "grossAmountWei">);

  const relayerRequestInput =
    input.nowEpochSeconds === undefined
      ? { runtime: input.runtime, calldata }
      : { runtime: input.runtime, calldata, nowEpochSeconds: input.nowEpochSeconds };

  return {
    chainId: input.runtime.chainId,
    pool: input.runtime.pool,
    calldata,
    relayerRequest: buildWithdrawalRelayerRequest(relayerRequestInput),
    directWalletTransaction: buildDirectWalletWithdrawalTransaction({ runtime: input.runtime, calldata })
  };
}
