export type DisclosureField = "amount" | "destination" | "nullifierHash" | "commitment" | "timestamp";

export type DisclosureSubject = {
  amount: bigint;
  destination: `0x${string}`;
  nullifierHash: `0x${string}`;
  commitment: `0x${string}`;
  timestamp: number;
};

export type DisclosureReceipt<Field extends DisclosureField = DisclosureField> = {
  receiptVersion: 1;
  requestedFields: readonly Field[];
  revealed: Pick<DisclosureSubject, Field>;
};

export function createDisclosureReceipt<const Field extends DisclosureField>(
  subject: DisclosureSubject,
  requestedFields: readonly Field[]
): DisclosureReceipt<Field> {
  if (requestedFields.length === 0) {
    throw new Error("at least one disclosure field required");
  }

  validateDisclosureSubject(subject);
  const uniqueFields = uniqueRequestedFields(requestedFields);
  const revealed = {} as Pick<DisclosureSubject, Field>;

  for (const field of uniqueFields) {
    revealed[field] = subject[field];
  }

  return {
    receiptVersion: 1,
    requestedFields: uniqueFields,
    revealed
  };
}

export function assertNoOverDisclosure(
  requestedFields: readonly DisclosureField[],
  revealedFields: readonly DisclosureField[]
): void {
  const requested = new Set(requestedFields);
  const excess = revealedFields.filter((field) => !requested.has(field));

  if (excess.length > 0) {
    throw new Error(`over-disclosure rejected: ${excess.join(", ")}`);
  }
}

function uniqueRequestedFields<const Field extends DisclosureField>(fields: readonly Field[]): readonly Field[] {
  const unique: Field[] = [];
  for (const field of fields) {
    if (!unique.includes(field)) {
      unique.push(field);
    }
  }

  return unique;
}

function validateDisclosureSubject(subject: DisclosureSubject): void {
  if (typeof subject.amount !== "bigint" || subject.amount < 0n) {
    throw new Error("amount must be a nonnegative bigint");
  }

  validateHexLike(subject.destination, "destination");
  validateHexLike(subject.nullifierHash, "nullifierHash");
  validateHexLike(subject.commitment, "commitment");

  if (!Number.isSafeInteger(subject.timestamp) || subject.timestamp < 0) {
    throw new Error("timestamp must be a nonnegative safe integer");
  }
}

function validateHexLike(value: string, fieldName: string): void {
  if (!value.startsWith("0x") || value.length <= 2) {
    throw new Error(`${fieldName} must be a nonempty hex-like string`);
  }
}
