import {
  assertDeploymentPackageReady,
  type DeploymentPackageAddresses,
  type DeploymentPackageCandidate
} from "./deploymentPackage.js";

const deploymentAddressLabels = [
  "privateTransferVerifier",
  "withdrawVerifier",
  "verifierAdapter",
  "shieldedPool",
  "poseidon2",
  "feeController"
] as const satisfies readonly (keyof DeploymentPackageAddresses)[];

export type DeploymentPackageTemplateReadinessReport = {
  ready: boolean;
  blockers: string[];
};

export function collectDeploymentPackageTemplateReadinessBlockers(
  candidate: DeploymentPackageCandidate
): string[] {
  const blockers: string[] = [];

  validateDeploymentAddresses(candidate, blockers);
  validatePredictedAddressEvidence(candidate, blockers);
  validateConstructorAddressBindings(candidate, blockers);

  try {
    assertDeploymentPackageReady(candidate);
  } catch (error) {
    blockers.push(error instanceof Error ? error.message : String(error));
  }

  return [...new Set(blockers)];
}

export function getDeploymentPackageTemplateReadinessReport(
  candidate: DeploymentPackageCandidate
): DeploymentPackageTemplateReadinessReport {
  const blockers = collectDeploymentPackageTemplateReadinessBlockers(candidate);
  return {
    ready: blockers.length === 0,
    blockers
  };
}

export function assertDeploymentPackageTemplateReady(
  candidate: DeploymentPackageCandidate
): DeploymentPackageCandidate {
  const blockers = collectDeploymentPackageTemplateReadinessBlockers(candidate);
  if (blockers.length > 0) {
    throw new Error(`deployment package template readiness blockers: ${blockers.join("; ")}`);
  }
  return candidate;
}

function validateDeploymentAddresses(candidate: DeploymentPackageCandidate, blockers: string[]): void {
  const seen = new Map<string, string>();

  for (const label of deploymentAddressLabels) {
    const value = candidate.addresses[label];
    if (!isFinalAddress(value)) {
      blockers.push(`deployment package template ${label} address must be a final non-placeholder address`);
      continue;
    }

    const normalized = value.toLowerCase();
    const previousLabel = seen.get(normalized);
    if (previousLabel) {
      blockers.push(
        `deployment package template addresses must not reuse ${value} for ${previousLabel} and ${label}`
      );
      continue;
    }
    seen.set(normalized, label);
  }
}

function validatePredictedAddressEvidence(candidate: DeploymentPackageCandidate, blockers: string[]): void {
  const evidence = candidate.predictedAddressEvidence;
  if (!evidence) {
    blockers.push("deployment package template must include predicted address evidence before readiness");
    return;
  }

  if (!isFinalAddress(evidence.deployer)) {
    blockers.push("deployment package template predicted address deployer must be a final non-placeholder address");
  }
  if (!isNonPlaceholderString(evidence.salt)) {
    blockers.push("deployment package template predicted address salt must be final");
  }
  if (!isSha256Hash(evidence.initCodeHash)) {
    blockers.push("deployment package template predicted address init code hash must be final sha256 evidence");
  }
  if (!isNonPlaceholderString(evidence.derivationCommand)) {
    blockers.push("deployment package template predicted address derivation command must be final");
  }

  const contracts = new Map(evidence.contracts.map((contract) => [contract.label, contract]));
  for (const label of deploymentAddressLabels) {
    const contract = contracts.get(label);
    if (!contract) {
      blockers.push(`deployment package template predicted address evidence must include ${label}`);
      continue;
    }
    if (!isFinalAddress(contract.expectedAddress)) {
      blockers.push(`deployment package template predicted ${label} address must be a final non-placeholder address`);
    } else if (contract.expectedAddress.toLowerCase() !== candidate.addresses[label].toLowerCase()) {
      blockers.push(`deployment package template predicted ${label} address must match addresses.${label}`);
    }
    if (!isFinalAddress(contract.deployer)) {
      blockers.push(`deployment package template predicted ${label} deployer must be a final non-placeholder address`);
    }
    if (!isNonPlaceholderString(contract.salt)) {
      blockers.push(`deployment package template predicted ${label} salt must be final`);
    }
    if (!isSha256Hash(contract.initCodeHash)) {
      blockers.push(`deployment package template predicted ${label} init code hash must be final sha256 evidence`);
    }
    if (!isNonPlaceholderString(contract.derivationCommand)) {
      blockers.push(`deployment package template predicted ${label} derivation command must be final`);
    }
  }
}

function validateConstructorAddressBindings(candidate: DeploymentPackageCandidate, blockers: string[]): void {
  assertAddressTuple(
    candidate.constructorArgs.verifierAdapter,
    [candidate.addresses.privateTransferVerifier, candidate.addresses.withdrawVerifier],
    "verifierAdapter",
    blockers
  );
  assertAddressTuple(
    candidate.constructorArgs.shieldedPool,
    [candidate.addresses.verifierAdapter, candidate.addresses.feeController, candidate.addresses.poseidon2],
    "shieldedPool",
    blockers
  );
}

function assertAddressTuple(
  actual: readonly string[],
  expected: readonly string[],
  label: string,
  blockers: string[]
): void {
  if (!Array.isArray(actual) || actual.length !== expected.length) {
    blockers.push(`deployment package template ${label} ABI constructor address binding mismatch`);
    return;
  }

  for (let index = 0; index < expected.length; index++) {
    const actualAddress = actual[index];
    const expectedAddress = expected[index]!;
    if (!isFinalAddress(actualAddress) || actualAddress.toLowerCase() !== expectedAddress.toLowerCase()) {
      blockers.push(`deployment package template ${label} ABI constructor address binding mismatch`);
      return;
    }
  }
}

function isFinalAddress(value: unknown): value is `0x${string}` {
  return typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value) && !isObviousPlaceholderAddress(value);
}

function isObviousPlaceholderAddress(value: string): boolean {
  const hex = value.slice(2).toLowerCase();
  return hex === "0".repeat(40) || /^([0-9a-f])\1{39}$/.test(hex);
}

function isNonPlaceholderString(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    !/(todo|tbd|placeholder|replace-me|pending|dummy|sample|example)/i.test(value)
  );
}

function isSha256Hash(value: unknown): value is string {
  return typeof value === "string" && /^sha256:[0-9a-f]{64}$/.test(value);
}
