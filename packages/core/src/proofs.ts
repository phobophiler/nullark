import { encodeAbiParameters, keccak256 } from "viem";

export type ProofMode =
  | {
      kind: "local";
      sensitiveWitnessLeavesDevice: false;
      serviceRequestsSpendingKey?: false;
    }
  | {
      kind: "service-assisted";
      sensitiveWitnessLeavesDevice: boolean;
      serviceRequestsSpendingKey?: boolean;
    };

export type ProofPrivacyLabel = "privacy-preserving" | "reduced-privacy";

export type HexBytes32 = `0x${string}`;
export type HexBytes4 = `0x${string}`;
export type HexData = `0x${string}`;
export type EthereumAddress = `0x${string}`;

export const STAGE_A_PUBLIC_INPUT_ORDER = [
  "root",
  "nullifier",
  "newCommitment",
  "destination",
  "grossAmount",
  "fee",
  "chainId",
  "verifyingContract",
  "spentCommitment",
  "noteAmount"
] as const;

export const STAGE_A_PUBLIC_INPUT_COUNT = STAGE_A_PUBLIC_INPUT_ORDER.length;

export const STAGE_A_PUBLIC_INPUT_INDEX = {
  root: 0,
  nullifier: 1,
  newCommitment: 2,
  destination: 3,
  grossAmount: 4,
  fee: 5,
  chainId: 6,
  verifyingContract: 7,
  spentCommitment: 8,
  noteAmount: 9
} as const satisfies Record<StageAPublicInputName, number>;

export type StageAPublicInputName = (typeof STAGE_A_PUBLIC_INPUT_ORDER)[number];
export type EncodedStageAPublicInputs = readonly [
  HexBytes32,
  HexBytes32,
  HexBytes32,
  HexBytes32,
  HexBytes32,
  HexBytes32,
  HexBytes32,
  HexBytes32,
  HexBytes32,
  HexBytes32
];

export type NamedStageAPublicInputs = Record<StageAPublicInputName, HexBytes32>;

export type VerifierPublicInputBase = {
  root: HexBytes32;
  nullifier: HexBytes32;
  chainId: number;
  verifyingContract: EthereumAddress;
  spentCommitment: HexBytes32;
  noteAmount: bigint;
};

export type PrivateTransferPublicInputs = VerifierPublicInputBase & {
  kind: "private-transfer";
  newCommitment: HexBytes32;
};

export type WithdrawalPublicInputs = VerifierPublicInputBase & {
  kind: "withdrawal";
  destination: EthereumAddress;
  grossAmount: bigint;
  fee: bigint;
};

export type VerifierPublicInputs = PrivateTransferPublicInputs | WithdrawalPublicInputs;

export const ZERO_BYTES32 = `0x${"0".repeat(64)}` as const;
export const ZERO_ADDRESS_BYTES32 = ZERO_BYTES32;
export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;
export const SHIELDED_POOL_INITIAL_ROOT = "0x07f9d837cb17b0d36320ffe93ba52345f1b728571a568265caac97559dbc952a" as const;
export const MEGAETH_TESTNET_CHAIN_ID = 6343;
export const MEGAETH_MAINNET_CHAIN_ID = 4326;
export const BN254_SCALAR_FIELD_MODULUS =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

export const PROOF_CONTEXT_V1_DOMAIN_SEPARATOR = hashDomainSeparator("nullark.proof-context.v1");
export const PROOF_CONTEXT_V1_VERSION = 1n;
export const PROOF_CONTEXT_V1_SHAPE_WITHDRAW_V1_1 = hashDomainSeparator("withdraw_context_v1_1");
export const PROOF_CONTEXT_V1_SHAPE_WITHDRAW_V1_2_FEE_GOVERNANCE = hashDomainSeparator(
  "withdraw_context_v1_2_fee_governance"
);
export const PROOF_CONTEXT_V1_SHAPE_WITHDRAW = PROOF_CONTEXT_V1_SHAPE_WITHDRAW_V1_1;
export const PROOF_CONTEXT_V1_SHAPE_PRIVATE_TRANSFER_V1_1 = hashDomainSeparator("private_transfer_context_v1_1");
export const PROOF_CONTEXT_V1_SHAPE_PRIVATE_TRANSFER_V1_2_FEE_GOVERNANCE = hashDomainSeparator(
  "private_transfer_context_v1_2_fee_governance"
);
export const PROOF_CONTEXT_V1_SHAPE_PRIVATE_TRANSFER = PROOF_CONTEXT_V1_SHAPE_PRIVATE_TRANSFER_V1_1;
export const PROOF_CONTEXT_V1_SHAPE_WITHDRAW_CHANGE = PROOF_CONTEXT_V1_SHAPE_WITHDRAW;
export const PROOF_CONTEXT_V1_WITHDRAW_BOUNDED_SELECTOR = "0xc7787d0f" as const;
export const PROOF_CONTEXT_V1_WITHDRAW_RELAYER_POLICY_SELECTOR = "0x6666d824" as const;
export const PROOF_CONTEXT_V1_WITHDRAW_CHANGE_BOUNDED_SELECTOR = "0x678d8506" as const;
export const PROOF_CONTEXT_V1_PRIVATE_TRANSFER_WITH_NOTE_SELECTOR = "0x6da3fd67" as const;
export const PROOF_CONTEXT_V1_PRIVATE_TRANSFER_RELAYER_POLICY_SELECTOR = "0x1a587ce3" as const;
export const ENCRYPTED_NOTE_V1_DOMAIN_SEPARATOR = hashDomainSeparator("nullark.encrypted-note.v1");
export const ENCRYPTED_NOTE_V1_VERSION = 1n;
export const RELAYER_POLICY_V1_DOMAIN_SEPARATOR = hashDomainSeparator("nullark.relayer-policy.v1");
export const WITHDRAW_CHANGE_V1_1_WITHDRAWAL_FEE_BPS = 33n;
export const WITHDRAW_CHANGE_V1_1_BPS_DENOMINATOR = 10_000n;

export const PROOF_CONTEXT_V1_SCHEMA_ORDER = [
  "domainSeparator",
  "version",
  "chainId",
  "pool",
  "shape",
  "selector",
  "root",
  "nullifier",
  "destination",
  "grossAmount",
  "fee",
  "encryptedNoteHash",
  "relayerPolicyHash",
  "deadlineOrZero"
] as const;

export const ENCRYPTED_NOTE_V1_SCHEMA_ORDER = [
  "domainSeparator",
  "version",
  "chainId",
  "pool",
  "shape",
  "selector",
  "nullifier",
  "commitment",
  "noteAmount",
  "encryptedNote"
] as const;

export const RELAYER_POLICY_V1_SCHEMA_ORDER = [
  "domainSeparator",
  "version",
  "relayer",
  "minNetAmount",
  "maxFeeAmount",
  "deadlineOrZero"
] as const;

export const STAGE_B_PUBLIC_INPUT_ORDER = [
  ...STAGE_A_PUBLIC_INPUT_ORDER,
  "proofContextHash",
  "encryptedNoteHash"
] as const;
export const STAGE_B_PUBLIC_INPUT_COUNT = STAGE_B_PUBLIC_INPUT_ORDER.length;

export const STAGE_B_PUBLIC_INPUT_INDEX = {
  ...STAGE_A_PUBLIC_INPUT_INDEX,
  proofContextHash: 10,
  encryptedNoteHash: 11
} as const satisfies Record<StageBPublicInputName, number>;

export type ProofContextV1FieldName = (typeof PROOF_CONTEXT_V1_SCHEMA_ORDER)[number];
export type EncryptedNoteV1FieldName = (typeof ENCRYPTED_NOTE_V1_SCHEMA_ORDER)[number];
export type RelayerPolicyV1FieldName = (typeof RELAYER_POLICY_V1_SCHEMA_ORDER)[number];
export type StageBPublicInputName = (typeof STAGE_B_PUBLIC_INPUT_ORDER)[number];
export type EncodedStageBPublicInputs = readonly [
  ...EncodedStageAPublicInputs,
  HexBytes32,
  HexBytes32
];
export type NamedStageBPublicInputs = Record<StageBPublicInputName, HexBytes32>;

export const STAGE_C_WITHDRAW_CHANGE_PUBLIC_INPUT_ORDER = STAGE_B_PUBLIC_INPUT_ORDER;
export const STAGE_C_WITHDRAW_CHANGE_PUBLIC_INPUT_COUNT = STAGE_B_PUBLIC_INPUT_COUNT;
export const STAGE_C_WITHDRAW_CHANGE_PUBLIC_INPUT_INDEX = STAGE_B_PUBLIC_INPUT_INDEX;

export type StageCWithdrawChangePublicInputName = StageBPublicInputName;
export type EncodedStageCWithdrawChangePublicInputs = EncodedStageBPublicInputs;
export type NamedStageCWithdrawChangePublicInputs = NamedStageBPublicInputs;

export type ProofContextV1 = {
  domainSeparator: HexBytes32;
  version: bigint;
  chainId: number;
  pool: EthereumAddress;
  shape: HexBytes32;
  selector: HexBytes4;
  root: HexBytes32;
  nullifier: HexBytes32;
  destination: EthereumAddress;
  grossAmount: bigint;
  fee: bigint;
  encryptedNoteHash: HexBytes32;
  relayerPolicyHash: HexBytes32;
  deadlineOrZero: bigint;
};

export type ProofContextV1Input = Omit<ProofContextV1, "domainSeparator" | "version"> & {
  domainSeparator?: HexBytes32;
  version?: bigint;
};

export type EncryptedNoteV1 = {
  domainSeparator: HexBytes32;
  version: bigint;
  chainId: number;
  pool: EthereumAddress;
  shape: HexBytes32;
  selector: HexBytes4;
  nullifier: HexBytes32;
  commitment: HexBytes32;
  noteAmount: bigint;
  encryptedNote: HexData;
};

export type EncryptedNoteV1Input = Omit<EncryptedNoteV1, "domainSeparator" | "version"> & {
  domainSeparator?: HexBytes32;
  version?: bigint;
};

export type RelayerPolicyV1 = {
  domainSeparator: HexBytes32;
  version: bigint;
  relayer: EthereumAddress;
  minNetAmount: bigint;
  maxFeeAmount: bigint;
  deadlineOrZero: bigint;
};

export type RelayerPolicyV1Input = Omit<RelayerPolicyV1, "domainSeparator" | "version"> & {
  domainSeparator?: HexBytes32;
  version?: bigint;
};

export type WithdrawChangeV1_1ValueConservationInput = {
  noteAmount: bigint;
  grossAmount: bigint;
  changeAmount: bigint;
  fee: bigint;
};

export type WithdrawChangeV1_1Input = {
  root: HexBytes32;
  nullifier: HexBytes32;
  newCommitment: HexBytes32;
  destination: EthereumAddress;
  grossAmount: bigint;
  fee: bigint;
  chainId: number;
  pool: EthereumAddress;
  spentCommitment: HexBytes32;
  noteAmount: bigint;
  changeAmount: bigint;
  encryptedChangeNote: HexData;
  relayerPolicy: RelayerPolicyV1Input;
  selector?: HexBytes4;
};

export type WithdrawChangeV1_1 = {
  shape: HexBytes32;
  selector: HexBytes4;
  root: HexBytes32;
  nullifier: HexBytes32;
  newCommitment: HexBytes32;
  destination: EthereumAddress;
  grossAmount: bigint;
  fee: bigint;
  chainId: number;
  pool: EthereumAddress;
  spentCommitment: HexBytes32;
  noteAmount: bigint;
  changeAmount: bigint;
  netAmount: bigint;
  encryptedChangeNote: HexData;
  encryptedChangeNoteEnvelope: EncryptedNoteV1;
  relayerPolicy: RelayerPolicyV1;
  proofContext: ProofContextV1;
  encryptedNoteHash: HexBytes32;
  relayerPolicyHash: HexBytes32;
  proofContextHash: HexBytes32;
  publicInputs: EncodedStageCWithdrawChangePublicInputs;
};

const BYTES32_PATTERN = /^0x[0-9a-fA-F]{64}$/;
const BYTES4_PATTERN = /^0x[0-9a-fA-F]{8}$/;
const HEX_BYTES_PATTERN = /^0x(?:[0-9a-fA-F]{2})*$/;
const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;

const PROOF_CONTEXT_V1_ABI_PARAMETERS = [
  { type: "bytes32", name: "domainSeparator" },
  { type: "uint256", name: "version" },
  { type: "uint256", name: "chainId" },
  { type: "address", name: "pool" },
  { type: "bytes32", name: "shape" },
  { type: "bytes4", name: "selector" },
  { type: "bytes32", name: "root" },
  { type: "bytes32", name: "nullifier" },
  { type: "address", name: "destination" },
  { type: "uint256", name: "grossAmount" },
  { type: "uint256", name: "fee" },
  { type: "bytes32", name: "encryptedNoteHash" },
  { type: "bytes32", name: "relayerPolicyHash" },
  { type: "uint256", name: "deadlineOrZero" }
] as const;

const ENCRYPTED_NOTE_V1_ABI_PARAMETERS = [
  { type: "bytes32", name: "domainSeparator" },
  { type: "uint256", name: "version" },
  { type: "uint256", name: "chainId" },
  { type: "address", name: "pool" },
  { type: "bytes32", name: "shape" },
  { type: "bytes4", name: "selector" },
  { type: "bytes32", name: "nullifier" },
  { type: "bytes32", name: "commitment" },
  { type: "uint256", name: "noteAmount" },
  { type: "bytes", name: "encryptedNote" }
] as const;

const RELAYER_POLICY_V1_ABI_PARAMETERS = [
  { type: "bytes32", name: "domainSeparator" },
  { type: "uint256", name: "version" },
  { type: "address", name: "relayer" },
  { type: "uint256", name: "minNetAmount" },
  { type: "uint256", name: "maxFeeAmount" },
  { type: "uint256", name: "deadlineOrZero" }
] as const;

// Literal cross-artifact vector generated independently from the helpers in this module.
export const STAGE_B_WITHDRAW_RELAYER_POLICY_VECTOR = {
  name: "stage-b-withdraw-relayer-policy-v1",
  chainId: MEGAETH_TESTNET_CHAIN_ID,
  pool: "0x5555555555555555555555555555555555555555",
  publicInputOrder: [
    "root",
    "nullifier",
    "newCommitment",
    "destination",
    "grossAmount",
    "fee",
    "chainId",
    "verifyingContract",
    "spentCommitment",
    "noteAmount",
    "proofContextHash",
    "encryptedNoteHash"
  ],
  proofContextSchemaOrder: [
    "domainSeparator",
    "version",
    "chainId",
    "pool",
    "shape",
    "selector",
    "root",
    "nullifier",
    "destination",
    "grossAmount",
    "fee",
    "encryptedNoteHash",
    "relayerPolicyHash",
    "deadlineOrZero"
  ],
  encryptedNoteSchemaOrder: [
    "domainSeparator",
    "version",
    "chainId",
    "pool",
    "shape",
    "selector",
    "nullifier",
    "commitment",
    "noteAmount",
    "encryptedNote"
  ],
  relayerPolicySchemaOrder: ["domainSeparator", "version", "relayer", "minNetAmount", "maxFeeAmount", "deadlineOrZero"],
  domainSeparators: {
    proofContext: "0x167d3fed4b07938ffe881d831968e90937bc85370f5e3e0f303dddba2bff5edb",
    encryptedNote: "0x3994515e45294d71d45e43547b0d292fd19163b6c0a642b290347d498346ad8c",
    relayerPolicy: "0x329974a0abd986bca812374468bf6442d66784a80921d5132af5b14353c55b8c"
  },
  shape: "0xeca6db398e85f22ea7cb867df253036dcd915dfd31bca459c6a83c5fc15ecd9b",
  selector: PROOF_CONTEXT_V1_WITHDRAW_RELAYER_POLICY_SELECTOR,
  publicInputsWithoutStageB: [
    "0x1111111111111111111111111111111111111111111111111111111111111111",
    "0x2222222222222222222222222222222222222222222222222222222222222222",
    "0x0000000000000000000000000000000000000000000000000000000000000000",
    "0x0000000000000000000000004444444444444444444444444444444444444444",
    "0x00000000000000000000000000000000000000000000000000000000000003e8",
    "0x000000000000000000000000000000000000000000000000000000000000000a",
    "0x00000000000000000000000000000000000000000000000000000000000018c7",
    "0x0000000000000000000000005555555555555555555555555555555555555555",
    "0x8888888888888888888888888888888888888888888888888888888888888888",
    "0x00000000000000000000000000000000000000000000000000000000000003e8"
  ],
  relayerPolicy: {
    relayer: "0x9999999999999999999999999999999999999999",
    minNetAmount: "990",
    maxFeeAmount: "10",
    deadlineOrZero: "1710000000"
  },
  encryptedNoteHash: "0x0f8cdfe937a98f6651e70eb252476fa1a5a55ec57beb7139309b752fbf9bb64e",
  relayerPolicyHash: "0x00269ff6ccfe08370f98649e75f59bbd7cbe021aedab2186882cb6cfcf91294c",
  proofContextHash: "0x155d5a897132660f8f7df598d55ef9be25285ebf302ddb7e21dddd42863b411b",
  stageBPublicInputs: [
    "0x1111111111111111111111111111111111111111111111111111111111111111",
    "0x2222222222222222222222222222222222222222222222222222222222222222",
    "0x0000000000000000000000000000000000000000000000000000000000000000",
    "0x0000000000000000000000004444444444444444444444444444444444444444",
    "0x00000000000000000000000000000000000000000000000000000000000003e8",
    "0x000000000000000000000000000000000000000000000000000000000000000a",
    "0x00000000000000000000000000000000000000000000000000000000000018c7",
    "0x0000000000000000000000005555555555555555555555555555555555555555",
    "0x8888888888888888888888888888888888888888888888888888888888888888",
    "0x00000000000000000000000000000000000000000000000000000000000003e8",
    "0x155d5a897132660f8f7df598d55ef9be25285ebf302ddb7e21dddd42863b411b",
    "0x0f8cdfe937a98f6651e70eb252476fa1a5a55ec57beb7139309b752fbf9bb64e"
  ],
  abiEncoded: {
    relayerPolicy:
      "0x329974a0abd986bca812374468bf6442d66784a80921d5132af5b14353c55b8c0000000000000000000000000000000000000000000000000000000000000001000000000000000000000000999999999999999999999999999999999999999900000000000000000000000000000000000000000000000000000000000003de000000000000000000000000000000000000000000000000000000000000000a0000000000000000000000000000000000000000000000000000000065ec8780",
    encryptedNote:
      "0x3994515e45294d71d45e43547b0d292fd19163b6c0a642b290347d498346ad8c000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000018c70000000000000000000000005555555555555555555555555555555555555555eca6db398e85f22ea7cb867df253036dcd915dfd31bca459c6a83c5fc15ecd9b6666d824000000000000000000000000000000000000000000000000000000002222222222222222222222222222222222222222222222222222222222222222000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000003e800000000000000000000000000000000000000000000000000000000000001400000000000000000000000000000000000000000000000000000000000000000",
    proofContext:
      "0x167d3fed4b07938ffe881d831968e90937bc85370f5e3e0f303dddba2bff5edb000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000018c70000000000000000000000005555555555555555555555555555555555555555eca6db398e85f22ea7cb867df253036dcd915dfd31bca459c6a83c5fc15ecd9b6666d8240000000000000000000000000000000000000000000000000000000011111111111111111111111111111111111111111111111111111111111111112222222222222222222222222222222222222222222222222222222222222222000000000000000000000000444444444444444444444444444444444444444400000000000000000000000000000000000000000000000000000000000003e8000000000000000000000000000000000000000000000000000000000000000a0f8cdfe937a98f6651e70eb252476fa1a5a55ec57beb7139309b752fbf9bb64e00269ff6ccfe08370f98649e75f59bbd7cbe021aedab2186882cb6cfcf91294c0000000000000000000000000000000000000000000000000000000065ec8780"
  },
  reductionVector: {
    keccak: "0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff0",
    field: "0x0e0a77c19a07df2f666ea36f7879462e36fc76959f60cd29ac96341c4fffffeb"
  }
} as const;

export const STAGE_C_WITHDRAW_CHANGE_V1_1_VECTOR = {
  name: "stage-c-withdraw-change-v1-1",
  chainId: MEGAETH_TESTNET_CHAIN_ID,
  pool: "0x5555555555555555555555555555555555555555",
  publicInputOrder: [
    "root",
    "nullifier",
    "newCommitment",
    "destination",
    "grossAmount",
    "fee",
    "chainId",
    "verifyingContract",
    "spentCommitment",
    "noteAmount",
    "proofContextHash",
    "encryptedNoteHash"
  ],
  shape: "0xeca6db398e85f22ea7cb867df253036dcd915dfd31bca459c6a83c5fc15ecd9b",
  selector: PROOF_CONTEXT_V1_WITHDRAW_CHANGE_BOUNDED_SELECTOR,
  valueConservation: {
    noteAmount: "10000000000000000",
    grossAmount: "4000000000000000",
    fee: "13200000000000",
    changeAmount: "6000000000000000",
    netAmount: "3986800000000000",
    feeFormula: "floor(grossAmount * 33 / 10000)",
    relation: "noteAmount = grossAmount + changeAmount"
  },
  fields: {
    root: "0x1111111111111111111111111111111111111111111111111111111111111111",
    nullifier: "0x2222222222222222222222222222222222222222222222222222222222222222",
    newCommitment: "0x3333333333333333333333333333333333333333333333333333333333333333",
    destination: "0x4444444444444444444444444444444444444444",
    spentCommitment: "0x8888888888888888888888888888888888888888888888888888888888888888",
    encryptedChangeNote: "0x1234567890abcdef"
  },
  relayerPolicy: {
    relayer: "0x9999999999999999999999999999999999999999",
    minNetAmount: "3986800000000000",
    maxFeeAmount: "13200000000000",
    deadlineOrZero: "1710000000"
  },
  relayerPolicyHash: "0x1b60ee3227f987f672d3400edba31564eddba926b613a11a0b4d21252e661fbc",
  encryptedNoteHash: "0x1826b7c6e4bc834f501d6f485e4de232c71b80a3ca77495746111ce6425184cd",
  proofContextHash: "0x23511c4820fa20ab38ce304e8f079301954fd5a9fa30dfd5575164fd1b5f0594",
  stageCPublicInputs: [
    "0x1111111111111111111111111111111111111111111111111111111111111111",
    "0x2222222222222222222222222222222222222222222222222222222222222222",
    "0x3333333333333333333333333333333333333333333333333333333333333333",
    "0x0000000000000000000000004444444444444444444444444444444444444444",
    "0x000000000000000000000000000000000000000000000000000e35fa931a0000",
    "0x00000000000000000000000000000000000000000000000000000c015d4fa000",
    "0x00000000000000000000000000000000000000000000000000000000000018c7",
    "0x0000000000000000000000005555555555555555555555555555555555555555",
    "0x8888888888888888888888888888888888888888888888888888888888888888",
    "0x000000000000000000000000000000000000000000000000002386f26fc10000",
    "0x23511c4820fa20ab38ce304e8f079301954fd5a9fa30dfd5575164fd1b5f0594",
    "0x1826b7c6e4bc834f501d6f485e4de232c71b80a3ca77495746111ce6425184cd"
  ],
  abiEncoded: {
    relayerPolicy:
      "0x329974a0abd986bca812374468bf6442d66784a80921d5132af5b14353c55b8c00000000000000000000000000000000000000000000000000000000000000010000000000000000000000009999999999999999999999999999999999999999000000000000000000000000000000000000000000000000000e29f935ca600000000000000000000000000000000000000000000000000000000c015d4fa0000000000000000000000000000000000000000000000000000000000065ec8780",
    encryptedChangeNote:
      "0x3994515e45294d71d45e43547b0d292fd19163b6c0a642b290347d498346ad8c000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000018c70000000000000000000000005555555555555555555555555555555555555555eca6db398e85f22ea7cb867df253036dcd915dfd31bca459c6a83c5fc15ecd9b678d85060000000000000000000000000000000000000000000000000000000022222222222222222222222222222222222222222222222222222222222222223333333333333333333333333333333333333333333333333333333333333333000000000000000000000000000000000000000000000000001550f7dca70000000000000000000000000000000000000000000000000000000000000000014000000000000000000000000000000000000000000000000000000000000000081234567890abcdef000000000000000000000000000000000000000000000000",
    proofContext:
      "0x167d3fed4b07938ffe881d831968e90937bc85370f5e3e0f303dddba2bff5edb000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000018c70000000000000000000000005555555555555555555555555555555555555555eca6db398e85f22ea7cb867df253036dcd915dfd31bca459c6a83c5fc15ecd9b678d850600000000000000000000000000000000000000000000000000000000111111111111111111111111111111111111111111111111111111111111111122222222222222222222222222222222222222222222222222222222222222220000000000000000000000004444444444444444444444444444444444444444000000000000000000000000000000000000000000000000000e35fa931a000000000000000000000000000000000000000000000000000000000c015d4fa0001826b7c6e4bc834f501d6f485e4de232c71b80a3ca77495746111ce6425184cd1b60ee3227f987f672d3400edba31564eddba926b613a11a0b4d21252e661fbc0000000000000000000000000000000000000000000000000000000065ec8780"
  }
} as const;

export function assertProofModeAllowed(mode: ProofMode): ProofPrivacyLabel {
  if (mode.serviceRequestsSpendingKey) {
    throw new Error("spending keys must never leave the client");
  }

  if (mode.kind === "local") {
    return "privacy-preserving";
  }

  return mode.sensitiveWitnessLeavesDevice ? "reduced-privacy" : "privacy-preserving";
}

export function createProofContextV1(input: ProofContextV1Input): ProofContextV1 {
  return normalizeProofContextV1({
    ...input,
    domainSeparator: input.domainSeparator ?? PROOF_CONTEXT_V1_DOMAIN_SEPARATOR,
    version: input.version ?? PROOF_CONTEXT_V1_VERSION
  });
}

export function encodeProofContextV1(input: ProofContextV1): HexData {
  const context = normalizeProofContextV1(input);

  return encodeAbiParameters(PROOF_CONTEXT_V1_ABI_PARAMETERS, [
    context.domainSeparator,
    context.version,
    BigInt(context.chainId),
    context.pool,
    context.shape,
    context.selector,
    context.root,
    context.nullifier,
    context.destination,
    context.grossAmount,
    context.fee,
    context.encryptedNoteHash,
    context.relayerPolicyHash,
    context.deadlineOrZero
  ]);
}

export function hashProofContextV1(input: ProofContextV1): HexBytes32 {
  return hashAbiEncodedToField(encodeProofContextV1(input));
}

export function assertProofContextHashMatches(expected: ProofContextV1, actualHash: unknown): HexBytes32 {
  const actual = requireBytes32(actualHash, "proofContextHash");
  const expectedHash = hashProofContextV1(expected);

  if (actual !== expectedHash) {
    throw new Error("ProofContextV1 hash mismatch");
  }

  return actual;
}

export function createEncryptedNoteV1(input: EncryptedNoteV1Input): EncryptedNoteV1 {
  return normalizeEncryptedNoteV1({
    ...input,
    domainSeparator: input.domainSeparator ?? ENCRYPTED_NOTE_V1_DOMAIN_SEPARATOR,
    version: input.version ?? ENCRYPTED_NOTE_V1_VERSION
  });
}

export function encodeEncryptedNoteV1(input: EncryptedNoteV1): HexData {
  const note = normalizeEncryptedNoteV1(input);

  return encodeAbiParameters(ENCRYPTED_NOTE_V1_ABI_PARAMETERS, [
    note.domainSeparator,
    note.version,
    BigInt(note.chainId),
    note.pool,
    note.shape,
    note.selector,
    note.nullifier,
    note.commitment,
    note.noteAmount,
    note.encryptedNote
  ]);
}

export function hashEncryptedNoteV1(input: EncryptedNoteV1): HexBytes32 {
  return hashAbiEncodedToField(encodeEncryptedNoteV1(input));
}

export function assertEncryptedNoteHashMatches(expected: EncryptedNoteV1, actualHash: unknown): HexBytes32 {
  const actual = requireBytes32(actualHash, "encryptedNoteHash");
  const expectedHash = hashEncryptedNoteV1(expected);

  if (actual !== expectedHash) {
    throw new Error("EncryptedNoteV1 hash mismatch");
  }

  return actual;
}

export function createRelayerPolicyV1(input: RelayerPolicyV1Input): RelayerPolicyV1 {
  return normalizeRelayerPolicyV1({
    ...input,
    domainSeparator: input.domainSeparator ?? RELAYER_POLICY_V1_DOMAIN_SEPARATOR,
    version: input.version ?? PROOF_CONTEXT_V1_VERSION
  });
}

export function encodeRelayerPolicyV1(input: RelayerPolicyV1): HexData {
  const policy = normalizeRelayerPolicyV1(input);

  return encodeAbiParameters(RELAYER_POLICY_V1_ABI_PARAMETERS, [
    policy.domainSeparator,
    policy.version,
    policy.relayer,
    policy.minNetAmount,
    policy.maxFeeAmount,
    policy.deadlineOrZero
  ]);
}

export function hashRelayerPolicyV1(input: RelayerPolicyV1): HexBytes32 {
  return hashAbiEncodedToField(encodeRelayerPolicyV1(input));
}

export function assertRelayerPolicyHashMatches(expected: RelayerPolicyV1, actualHash: unknown): HexBytes32 {
  const actual = requireBytes32(actualHash, "relayerPolicyHash");
  const expectedHash = hashRelayerPolicyV1(expected);

  if (actual !== expectedHash) {
    throw new Error("RelayerPolicyV1 hash mismatch");
  }

  return actual;
}

export function hashAbiEncodedToField(encoded: HexData): HexBytes32 {
  return reduceKeccakToField(keccak256(requireHexBytes(encoded, "encoded")) as HexBytes32);
}

export function reduceKeccakToField(hash: HexBytes32): HexBytes32 {
  return encodeUint256(BigInt(requireBytes32(hash, "hash")) % BN254_SCALAR_FIELD_MODULUS, "hashField");
}

export function encodeVerifierPublicInputs(input: VerifierPublicInputs): HexBytes32[] {
  const root = requireNonZeroBytes32(input.root, "root");
  const nullifier = requireNonZeroBytes32(input.nullifier, "nullifier");
  const chainId = encodeSupportedChainId(input.chainId);
  const verifyingContract = encodeAddressAsBytes32(input.verifyingContract, "verifyingContract");

  if (input.kind === "private-transfer") {
    const newCommitment = requireNonZeroBytes32(input.newCommitment, "newCommitment");
    const spentCommitment = requireNonZeroBytes32(input.spentCommitment, "spentCommitment");
    const noteAmount = encodePositiveUint256(input.noteAmount, "noteAmount");
    return [
      root,
      nullifier,
      newCommitment,
      ZERO_ADDRESS_BYTES32,
      ZERO_BYTES32,
      ZERO_BYTES32,
      chainId,
      verifyingContract,
      spentCommitment,
      noteAmount
    ];
  }

  const destination = encodeAddressAsBytes32(input.destination, "destination");
  const grossAmount = encodePositiveUint256(input.grossAmount, "grossAmount");
  const fee = encodeFee(input.fee, input.grossAmount);
  const spentCommitment = requireNonZeroBytes32(input.spentCommitment, "spentCommitment");
  const noteAmount = encodePositiveUint256(input.noteAmount, "noteAmount");

  return [root, nullifier, ZERO_BYTES32, destination, grossAmount, fee, chainId, verifyingContract, spentCommitment, noteAmount];
}

export function assertStageAPublicInputs(publicInputs: readonly unknown[]): EncodedStageAPublicInputs {
  if (!Array.isArray(publicInputs) || publicInputs.length !== STAGE_A_PUBLIC_INPUT_COUNT) {
    throw new Error(`expected exactly ${STAGE_A_PUBLIC_INPUT_COUNT} Stage A public inputs`);
  }

  return publicInputs.map((input, index) =>
    requireBytes32(input, `publicInputs[${index}:${STAGE_A_PUBLIC_INPUT_ORDER[index]}]`)
  ) as unknown as EncodedStageAPublicInputs;
}

export function nameStageAPublicInputs(publicInputs: readonly unknown[]): NamedStageAPublicInputs {
  const inputs = assertStageAPublicInputs(publicInputs);
  return {
    root: inputs[STAGE_A_PUBLIC_INPUT_INDEX.root],
    nullifier: inputs[STAGE_A_PUBLIC_INPUT_INDEX.nullifier],
    newCommitment: inputs[STAGE_A_PUBLIC_INPUT_INDEX.newCommitment],
    destination: inputs[STAGE_A_PUBLIC_INPUT_INDEX.destination],
    grossAmount: inputs[STAGE_A_PUBLIC_INPUT_INDEX.grossAmount],
    fee: inputs[STAGE_A_PUBLIC_INPUT_INDEX.fee],
    chainId: inputs[STAGE_A_PUBLIC_INPUT_INDEX.chainId],
    verifyingContract: inputs[STAGE_A_PUBLIC_INPUT_INDEX.verifyingContract],
    spentCommitment: inputs[STAGE_A_PUBLIC_INPUT_INDEX.spentCommitment],
    noteAmount: inputs[STAGE_A_PUBLIC_INPUT_INDEX.noteAmount]
  };
}

export function readStageAPublicInput(
  publicInputs: readonly unknown[],
  fieldName: StageAPublicInputName
): HexBytes32 {
  return assertStageAPublicInputs(publicInputs)[STAGE_A_PUBLIC_INPUT_INDEX[fieldName]];
}

export function assertStageAPublicInputsMatch(
  expected: VerifierPublicInputs,
  actualPublicInputs: readonly unknown[]
): EncodedStageAPublicInputs {
  const actual = assertStageAPublicInputs(actualPublicInputs);
  const expectedEncoded = encodeVerifierPublicInputs(expected);

  for (let index = 0; index < STAGE_A_PUBLIC_INPUT_COUNT; index += 1) {
    if (actual[index] !== expectedEncoded[index]) {
      throw new Error(`Stage A public input ${STAGE_A_PUBLIC_INPUT_ORDER[index]} mismatch at index ${index}`);
    }
  }

  return actual;
}

export function assertStageBPublicInputs(publicInputs: readonly unknown[]): EncodedStageBPublicInputs {
  if (!Array.isArray(publicInputs) || publicInputs.length !== STAGE_B_PUBLIC_INPUT_COUNT) {
    throw new Error(`expected exactly ${STAGE_B_PUBLIC_INPUT_COUNT} Stage B public inputs`);
  }

  return publicInputs.map((input, index) =>
    requireBytes32(input, `publicInputs[${index}:${STAGE_B_PUBLIC_INPUT_ORDER[index]}]`)
  ) as unknown as EncodedStageBPublicInputs;
}

export function nameStageBPublicInputs(publicInputs: readonly unknown[]): NamedStageBPublicInputs {
  const inputs = assertStageBPublicInputs(publicInputs);
  return {
    ...nameStageAPublicInputs(inputs.slice(0, STAGE_A_PUBLIC_INPUT_COUNT)),
    proofContextHash: inputs[STAGE_B_PUBLIC_INPUT_INDEX.proofContextHash],
    encryptedNoteHash: inputs[STAGE_B_PUBLIC_INPUT_INDEX.encryptedNoteHash]
  };
}

export function readStageBPublicInput(publicInputs: readonly unknown[], fieldName: StageBPublicInputName): HexBytes32 {
  return assertStageBPublicInputs(publicInputs)[STAGE_B_PUBLIC_INPUT_INDEX[fieldName]];
}

export function assertStageBPublicInputsMatch(input: {
  expectedBase: VerifierPublicInputs;
  expectedProofContextHash: HexBytes32;
  expectedEncryptedNoteHash: HexBytes32;
  actualPublicInputs: readonly unknown[];
}): EncodedStageBPublicInputs {
  const actual = assertStageBPublicInputs(input.actualPublicInputs);
  const expectedBase = encodeVerifierPublicInputs(input.expectedBase);
  const expected = [...expectedBase, input.expectedProofContextHash, input.expectedEncryptedNoteHash] as const;

  for (let index = 0; index < STAGE_B_PUBLIC_INPUT_COUNT; index += 1) {
    if (actual[index] !== expected[index]) {
      throw new Error(`Stage B public input ${STAGE_B_PUBLIC_INPUT_ORDER[index]} mismatch at index ${index}`);
    }
  }

  return actual;
}

export function encodeStageBPublicInputs(input: {
  base: VerifierPublicInputs;
  proofContextHash: HexBytes32;
  encryptedNoteHash: HexBytes32;
}): EncodedStageBPublicInputs {
  return [
    ...encodeVerifierPublicInputs(input.base),
    requireBytes32(input.proofContextHash, "proofContextHash"),
    requireBytes32(input.encryptedNoteHash, "encryptedNoteHash")
  ] as unknown as EncodedStageBPublicInputs;
}

export function calculateWithdrawChangeV1_1Fee(grossAmount: bigint): bigint {
  return (
    (requireUint256(grossAmount, "grossAmount") * WITHDRAW_CHANGE_V1_1_WITHDRAWAL_FEE_BPS) /
    WITHDRAW_CHANGE_V1_1_BPS_DENOMINATOR
  );
}

export function assertWithdrawChangeV1_1ValueConservation(
  input: WithdrawChangeV1_1ValueConservationInput
): WithdrawChangeV1_1ValueConservationInput & { netAmount: bigint } {
  const noteAmount = encodePositiveUint256(input.noteAmount, "noteAmount");
  const grossAmount = encodePositiveUint256(input.grossAmount, "grossAmount");
  const changeAmount = requireUint256(input.changeAmount, "changeAmount");
  const fee = requireUint256(input.fee, "fee");
  const noteAmountValue = BigInt(noteAmount);
  const grossAmountValue = BigInt(grossAmount);
  const expectedFee = calculateWithdrawChangeV1_1Fee(grossAmountValue);

  if (changeAmount === 0n) {
    throw new Error("withdraw_change_v1_1 changeAmount must be positive");
  }

  if (fee !== expectedFee) {
    throw new Error("withdraw_change_v1_1 fee must equal floor(grossAmount * 33 / 10000)");
  }

  if (noteAmountValue !== grossAmountValue + changeAmount) {
    throw new Error("withdraw_change_v1_1 value conservation failed");
  }

  if (fee >= grossAmountValue) {
    throw new Error("withdraw_change_v1_1 fee must be less than grossAmount");
  }

  return {
    noteAmount: noteAmountValue,
    grossAmount: grossAmountValue,
    changeAmount,
    fee,
    netAmount: grossAmountValue - fee
  };
}

export function createWithdrawChangeV1_1(input: WithdrawChangeV1_1Input): WithdrawChangeV1_1 {
  const root = requireNonZeroBytes32(input.root, "root");
  const nullifier = requireNonZeroBytes32(input.nullifier, "nullifier");
  const newCommitment = requireNonZeroBytes32(input.newCommitment, "newCommitment");
  const destination = requireAddress(input.destination, "destination");
  const chainId = requireSupportedMegaEthChainId(input.chainId);
  const pool = requireAddress(input.pool, "pool");
  const spentCommitment = requireNonZeroBytes32(input.spentCommitment, "spentCommitment");
  const encryptedChangeNote = requireHexBytes(input.encryptedChangeNote, "encryptedChangeNote");
  const selector = input.selector ?? PROOF_CONTEXT_V1_WITHDRAW_CHANGE_BOUNDED_SELECTOR;
  const value = assertWithdrawChangeV1_1ValueConservation(input);

  if (encryptedChangeNote === "0x") {
    throw new Error("withdraw_change_v1_1 encryptedChangeNote must be nonempty");
  }

  const relayerPolicy = createRelayerPolicyV1(input.relayerPolicy);
  const relayerPolicyHash = hashRelayerPolicyV1(relayerPolicy);
  const encryptedChangeNoteEnvelope = createEncryptedNoteV1({
    chainId,
    pool,
    shape: PROOF_CONTEXT_V1_SHAPE_WITHDRAW_CHANGE,
    selector,
    nullifier,
    commitment: newCommitment,
    noteAmount: value.changeAmount,
    encryptedNote: encryptedChangeNote
  });
  const encryptedNoteHash = hashEncryptedNoteV1(encryptedChangeNoteEnvelope);
  const proofContext = createProofContextV1({
    chainId,
    pool,
    shape: PROOF_CONTEXT_V1_SHAPE_WITHDRAW_CHANGE,
    selector,
    root,
    nullifier,
    destination,
    grossAmount: value.grossAmount,
    fee: value.fee,
    encryptedNoteHash,
    relayerPolicyHash,
    deadlineOrZero: relayerPolicy.deadlineOrZero
  });
  const proofContextHash = hashProofContextV1(proofContext);
  const publicInputs = [
    root,
    nullifier,
    newCommitment,
    encodeAddressAsBytes32(destination, "destination"),
    encodeUint256(value.grossAmount, "grossAmount"),
    encodeUint256(value.fee, "fee"),
    encodeSupportedChainId(chainId),
    encodeAddressAsBytes32(pool, "pool"),
    spentCommitment,
    encodeUint256(value.noteAmount, "noteAmount"),
    proofContextHash,
    encryptedNoteHash
  ] as unknown as EncodedStageCWithdrawChangePublicInputs;

  return {
    shape: PROOF_CONTEXT_V1_SHAPE_WITHDRAW_CHANGE,
    selector,
    root,
    nullifier,
    newCommitment,
    destination,
    grossAmount: value.grossAmount,
    fee: value.fee,
    chainId,
    pool,
    spentCommitment,
    noteAmount: value.noteAmount,
    changeAmount: value.changeAmount,
    netAmount: value.netAmount,
    encryptedChangeNote,
    encryptedChangeNoteEnvelope,
    relayerPolicy,
    proofContext,
    encryptedNoteHash,
    relayerPolicyHash,
    proofContextHash,
    publicInputs
  };
}

export function encodeWithdrawChangeV1_1PublicInputs(input: WithdrawChangeV1_1Input): EncodedStageCWithdrawChangePublicInputs {
  return createWithdrawChangeV1_1(input).publicInputs;
}

export function assertStageCWithdrawChangePublicInputs(
  publicInputs: readonly unknown[]
): EncodedStageCWithdrawChangePublicInputs {
  return assertStageBPublicInputs(publicInputs);
}

export function nameStageCWithdrawChangePublicInputs(publicInputs: readonly unknown[]): NamedStageCWithdrawChangePublicInputs {
  return nameStageBPublicInputs(publicInputs);
}

export function readStageCWithdrawChangePublicInput(
  publicInputs: readonly unknown[],
  fieldName: StageCWithdrawChangePublicInputName
): HexBytes32 {
  return readStageBPublicInput(publicInputs, fieldName);
}

export function assertWithdrawChangeV1_1PublicInputsMatch(
  expected: WithdrawChangeV1_1Input,
  actualPublicInputs: readonly unknown[]
): EncodedStageCWithdrawChangePublicInputs {
  const actual = assertStageCWithdrawChangePublicInputs(actualPublicInputs);
  const expectedEncoded = encodeWithdrawChangeV1_1PublicInputs(expected);

  for (let index = 0; index < STAGE_C_WITHDRAW_CHANGE_PUBLIC_INPUT_COUNT; index += 1) {
    if (actual[index] !== expectedEncoded[index]) {
      throw new Error(
        `Stage C withdraw_change_v1_1 public input ${STAGE_C_WITHDRAW_CHANGE_PUBLIC_INPUT_ORDER[index]} mismatch at index ${index}`
      );
    }
  }

  return actual;
}

export function assertRootInAcceptedHistory(root: HexBytes32, acceptedRoots: readonly HexBytes32[]): HexBytes32 {
  const normalizedRoot = requireNonZeroBytes32(root, "root");
  const normalizedAcceptedRoots = acceptedRoots.map((acceptedRoot) => requireNonZeroBytes32(acceptedRoot, "acceptedRoot"));

  if (!normalizedAcceptedRoots.includes(normalizedRoot)) {
    throw new Error("root must be observed in accepted contract history");
  }

  return normalizedRoot;
}

function requireBytes32(value: unknown, fieldName: string): HexBytes32 {
  if (typeof value !== "string" || !BYTES32_PATTERN.test(value)) {
    throw new Error(`${fieldName} must be a bytes32 hex string`);
  }

  return value.toLowerCase() as HexBytes32;
}

function requireBytes4(value: unknown, fieldName: string): HexBytes4 {
  if (typeof value !== "string" || !BYTES4_PATTERN.test(value)) {
    throw new Error(`${fieldName} must be a bytes4 hex string`);
  }

  return value.toLowerCase() as HexBytes4;
}

function requireHexBytes(value: unknown, fieldName: string): HexData {
  if (typeof value !== "string" || !HEX_BYTES_PATTERN.test(value)) {
    throw new Error(`${fieldName} must be hex bytes`);
  }

  return value.toLowerCase() as HexData;
}

function requireNonZeroBytes32(value: unknown, fieldName: string): HexBytes32 {
  const bytes32 = requireBytes32(value, fieldName);
  if (bytes32 === ZERO_BYTES32) {
    throw new Error(`${fieldName} must be nonzero`);
  }

  return bytes32;
}

function requireAddress(value: unknown, fieldName: string): EthereumAddress {
  const address = requireAddressAllowZero(value, fieldName);
  if (address === ZERO_ADDRESS) {
    throw new Error(`${fieldName} must be nonzero`);
  }

  return address;
}

function requireAddressAllowZero(value: unknown, fieldName: string): EthereumAddress {
  if (typeof value !== "string" || !ADDRESS_PATTERN.test(value)) {
    throw new Error(`${fieldName} must be an address`);
  }

  const address = value.toLowerCase() as EthereumAddress;
  return address;
}

function encodeAddressAsBytes32(value: unknown, fieldName: string): HexBytes32 {
  const address = requireAddress(value, fieldName);
  return `0x${"0".repeat(24)}${address.slice(2)}` as HexBytes32;
}

function encodePositiveUint256(value: bigint, fieldName: string): HexBytes32 {
  if (typeof value !== "bigint") {
    throw new Error(`${fieldName} must be a bigint`);
  }

  if (value <= 0n) {
    throw new Error(`${fieldName} must be positive`);
  }

  return encodeUint256(value, fieldName);
}

function encodeFee(fee: bigint, grossAmount: bigint): HexBytes32 {
  if (typeof fee !== "bigint") {
    throw new Error("fee must be a bigint");
  }

  if (fee < 0n) {
    throw new Error("fee must be nonnegative");
  }

  if (typeof grossAmount === "bigint" && fee >= grossAmount) {
    throw new Error("fee must be less than grossAmount");
  }

  return encodeUint256(fee, "fee");
}

function normalizeProofContextV1(input: ProofContextV1): ProofContextV1 {
  return {
    domainSeparator: requireBytes32(input.domainSeparator, "domainSeparator"),
    version: requireUint256(input.version, "version"),
    chainId: requireSupportedMegaEthChainId(input.chainId),
    pool: requireAddress(input.pool, "pool"),
    shape: requireBytes32(input.shape, "shape"),
    selector: requireBytes4(input.selector, "selector"),
    root: requireNonZeroBytes32(input.root, "root"),
    nullifier: requireNonZeroBytes32(input.nullifier, "nullifier"),
    destination: requireAddressAllowZero(input.destination, "destination"),
    grossAmount: requireUint256(input.grossAmount, "grossAmount"),
    fee: requireUint256(input.fee, "fee"),
    encryptedNoteHash: requireBytes32(input.encryptedNoteHash, "encryptedNoteHash"),
    relayerPolicyHash: requireBytes32(input.relayerPolicyHash, "relayerPolicyHash"),
    deadlineOrZero: requireUint256(input.deadlineOrZero, "deadlineOrZero")
  };
}

function normalizeEncryptedNoteV1(input: EncryptedNoteV1): EncryptedNoteV1 {
  return {
    domainSeparator: requireBytes32(input.domainSeparator, "domainSeparator"),
    version: requireUint256(input.version, "version"),
    chainId: requireSupportedMegaEthChainId(input.chainId),
    pool: requireAddress(input.pool, "pool"),
    shape: requireBytes32(input.shape, "shape"),
    selector: requireBytes4(input.selector, "selector"),
    nullifier: requireNonZeroBytes32(input.nullifier, "nullifier"),
    commitment: requireBytes32(input.commitment, "commitment"),
    noteAmount: requireUint256(input.noteAmount, "noteAmount"),
    encryptedNote: requireHexBytes(input.encryptedNote, "encryptedNote")
  };
}

function normalizeRelayerPolicyV1(input: RelayerPolicyV1): RelayerPolicyV1 {
  return {
    domainSeparator: requireBytes32(input.domainSeparator, "domainSeparator"),
    version: requireUint256(input.version, "version"),
    relayer: requireAddressAllowZero(input.relayer, "relayer"),
    minNetAmount: requireUint256(input.minNetAmount, "minNetAmount"),
    maxFeeAmount: requireUint256(input.maxFeeAmount, "maxFeeAmount"),
    deadlineOrZero: requireUint256(input.deadlineOrZero, "deadlineOrZero")
  };
}

function requireUint256(value: bigint, fieldName: string): bigint {
  if (typeof value !== "bigint") {
    throw new Error(`${fieldName} must be a bigint`);
  }

  if (value < 0n) {
    throw new Error(`${fieldName} must be nonnegative`);
  }

  if (value > (1n << 256n) - 1n) {
    throw new Error(`${fieldName} exceeds uint256`);
  }

  return value;
}

function requirePositiveSafeInteger(value: number, fieldName: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${fieldName} must be a positive safe integer`);
  }

  return value;
}

function hashDomainSeparator(value: string): HexBytes32 {
  return keccak256(new TextEncoder().encode(value)) as HexBytes32;
}

function encodeSupportedChainId(chainId: number): HexBytes32 {
  return encodeUint256(BigInt(requireSupportedMegaEthChainId(chainId)), "chainId");
}

function requireSupportedMegaEthChainId(chainId: number): number {
  requirePositiveSafeInteger(chainId, "chainId");

  if (chainId !== MEGAETH_TESTNET_CHAIN_ID && chainId !== MEGAETH_MAINNET_CHAIN_ID) {
    throw new Error(`chainId must be MegaETH testnet ${MEGAETH_TESTNET_CHAIN_ID} or mainnet ${MEGAETH_MAINNET_CHAIN_ID}`);
  }

  return chainId;
}

function encodeUint256(value: bigint, fieldName: string): HexBytes32 {
  if (value > (1n << 256n) - 1n) {
    throw new Error(`${fieldName} exceeds uint256`);
  }

  return `0x${value.toString(16).padStart(64, "0")}` as HexBytes32;
}
