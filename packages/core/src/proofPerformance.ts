export type ProvingModeKind = "local" | "mobile" | "service-assisted";
export type ProvingUxClass = "desktop-local" | "mobile-local" | "service-assisted-safe" | "blocked";

export type ProvingModePolicyInput = {
  kind: ProvingModeKind;
  witnessLeavesDevice: boolean;
  spendingKeyLeavesDevice: boolean;
  serviceReceivesWitness?: boolean;
  serviceRequestsSpendingKey?: boolean;
  estimatedProvingMs?: number;
};

export type ProvingModePolicy = {
  uxClass: ProvingUxClass;
  allowed: boolean;
  warnings: string[];
  errors: string[];
};

export function classifyProvingMode(input: ProvingModePolicyInput): ProvingModePolicy {
  validateProvingModeInput(input);

  const errors: string[] = [];
  const warnings: string[] = [];

  if (input.spendingKeyLeavesDevice || input.serviceRequestsSpendingKey) {
    errors.push("spending keys must never leave the device");
  }

  if (input.witnessLeavesDevice || input.serviceReceivesWitness) {
    errors.push("private witness data must not leave the device");
  }

  if (input.kind === "mobile" && input.estimatedProvingMs !== undefined && input.estimatedProvingMs > 30_000) {
    warnings.push("mobile proving may need progress, pause, or fallback UX");
  }

  if (input.kind === "service-assisted" && !input.serviceReceivesWitness && !input.serviceRequestsSpendingKey) {
    warnings.push("service assistance is limited to public inputs, job coordination, or device-held proving");
  }

  return {
    uxClass: errors.length > 0 ? "blocked" : uxClassForKind(input.kind),
    allowed: errors.length === 0,
    warnings,
    errors
  };
}

function uxClassForKind(kind: ProvingModeKind): ProvingUxClass {
  if (kind === "local") {
    return "desktop-local";
  }

  if (kind === "mobile") {
    return "mobile-local";
  }

  return "service-assisted-safe";
}

function validateProvingModeInput(input: ProvingModePolicyInput): void {
  if (input.estimatedProvingMs !== undefined && (!Number.isSafeInteger(input.estimatedProvingMs) || input.estimatedProvingMs < 0)) {
    throw new Error("estimatedProvingMs must be a nonnegative safe integer");
  }
}
