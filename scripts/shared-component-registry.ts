/**
 * Registry of shared OpenAPI components available for src spec $refs.
 *
 * Modified by Cursor
 *
 * Versioning: each entry is a distinct shared file ({Name}_vN.yaml). Specs pin
 * the version in their $ref path. SPEC_SHARED_VERSIONS overrides the default (v1)
 * per spec when apply:shared runs. See docs/specs/SHARED-COMPONENT-VERSIONING.md.
 *
 * Modified by Cursor
 */

export type ComponentKind = 'schemas' | 'parameters' | 'headers' | 'responses';

export type SharedComponentPin = `${ComponentKind}:${string}`;

/** Standard HTTP error response component names. */
export const STANDARD_ERROR_RESPONSES = [
  'BadRequestError',
  'UnauthorizedError',
  'ForbiddenError',
  'NotFoundError',
  'MethodNotAllowedError',
  'NotAcceptableError',
  'ConflictError',
  'PayloadTooLargeError',
  'UnsupportedMediaTypeError',
  'UnprocessableEntityError',
  'TooManyRequestsError',
  'InternalServerError',
  'BadGatewayError',
  'ServiceUnavailableError',
  'GatewayTimeoutError'
] as const;

export type StandardErrorResponseName = (typeof STANDARD_ERROR_RESPONSES)[number];

export const STANDARD_ERROR_RESPONSE_SET = new Set<string>(STANDARD_ERROR_RESPONSES);

export interface SharedComponentEntry {
  kind: ComponentKind;
  name: string;
  /** Shared file version suffix (_v1, _v2, …). */
  version: number;
  fileName: string;
}

/** All shared fragments. Multiple rows per kind+name when v2+ exists. */
const SHARED_COMPONENT_REGISTRY_V1: SharedComponentEntry[] = [
  { kind: 'schemas', name: 'Error', version: 1, fileName: 'Error_v1.yaml' },
  { kind: 'headers', name: 'correlationId', version: 1, fileName: 'correlationId_v1.yaml' },
  { kind: 'parameters', name: 'CorrelationIdHeader', version: 1, fileName: 'CorrelationIdHeader_v1.yaml' },
  { kind: 'parameters', name: 'PolicyNumber', version: 1, fileName: 'PolicyNumber_v1.yaml' },
  { kind: 'parameters', name: 'AssociatedFirmId', version: 1, fileName: 'AssociatedFirmId_v1.yaml' },
  { kind: 'schemas', name: 'FundDistribution', version: 1, fileName: 'FundDistribution_v1.yaml' },
  { kind: 'schemas', name: 'PartyRelationship', version: 1, fileName: 'PartyRelationship_v1.yaml' },
  { kind: 'schemas', name: 'IndividualIdentity', version: 1, fileName: 'IndividualIdentity_v1.yaml' },
  { kind: 'schemas', name: 'EntityIdentity', version: 1, fileName: 'EntityIdentity_v1.yaml' },
  ...STANDARD_ERROR_RESPONSES.map(name => ({
    kind: 'responses' as const,
    name,
    version: 1,
    fileName: `${name}_v1.yaml`
  }))
];

const SHARED_COMPONENT_REGISTRY_V2_ERROR: SharedComponentEntry[] = [
  { kind: 'schemas', name: 'Error', version: 2, fileName: 'Error_v2.yaml' },
  ...STANDARD_ERROR_RESPONSES.map(name => ({
    kind: 'responses' as const,
    name,
    version: 2,
    fileName: `${name}_v2.yaml`
  }))
];

const SHARED_COMPONENT_REGISTRY_V3_ERROR: SharedComponentEntry[] = [
  { kind: 'schemas', name: 'Error', version: 3, fileName: 'Error_v3.yaml' }
];

const SHARED_COMPONENT_REGISTRY_POLICY_INQUIRY: SharedComponentEntry[] = [
  { kind: 'schemas', name: 'ProducerExternalIds', version: 1, fileName: 'ProducerExternalIds_v1.yaml' },
  { kind: 'schemas', name: 'ProducerCommission', version: 1, fileName: 'ProducerCommission_v1.yaml' },
  { kind: 'schemas', name: 'PolicyProducer', version: 1, fileName: 'PolicyProducer_v1.yaml' },
  { kind: 'schemas', name: 'PolicyProducers', version: 1, fileName: 'PolicyProducers_v1.yaml' }
];

export const SHARED_COMPONENT_REGISTRY: SharedComponentEntry[] = [
  ...SHARED_COMPONENT_REGISTRY_V1,
  ...SHARED_COMPONENT_REGISTRY_V2_ERROR,
  ...SHARED_COMPONENT_REGISTRY_V3_ERROR,
  ...SHARED_COMPONENT_REGISTRY_POLICY_INQUIRY

  // Example when introducing a breaking PolicyNumber (do not enable until v2 file exists):
  // , { kind: 'parameters', name: 'PolicyNumber', version: 2, fileName: 'PolicyNumber_v2.yaml' }
];

/**
 * Optional per-spec version overrides for apply:shared automation.
 * Key: src spec filename. Value: pin → version number.
 *
 * Example — Fund Transfer 3.0 adopts PolicyNumber v2 only:
 *   'FundTransfer_3.0.0.yml': { 'parameters:PolicyNumber': 2 },
 */
export const SPEC_SHARED_VERSIONS: Partial<Record<string, Partial<Record<SharedComponentPin, number>>>> = {
  // 'FundTransfer_3.0.0.yml': { 'parameters:PolicyNumber': 2 },
};

export const DEFAULT_SHARED_COMPONENT_VERSION = 1;

export function makeSharedComponentPin(kind: ComponentKind, name: string): SharedComponentPin {
  return `${kind}:${name}`;
}

export function sharedComponentKey(kind: ComponentKind, name: string, version?: number): string {
  const v = version ?? DEFAULT_SHARED_COMPONENT_VERSION;
  return `${kind}:${name}:v${v}`;
}

export function getRegistryEntry(
  kind: ComponentKind,
  name: string,
  version: number
): SharedComponentEntry | undefined {
  return SHARED_COMPONENT_REGISTRY.find(
    entry => entry.kind === kind && entry.name === name && entry.version === version
  );
}

export function listRegistryVersions(kind: ComponentKind, name: string): number[] {
  return SHARED_COMPONENT_REGISTRY.filter(entry => entry.kind === kind && entry.name === name)
    .map(entry => entry.version)
    .sort((a, b) => a - b);
}

export function sharedRef(kind: ComponentKind, name: string, version: number = DEFAULT_SHARED_COMPONENT_VERSION): string {
  const entry = getRegistryEntry(kind, name, version);
  if (!entry) {
    throw new Error(
      `Unknown shared component ${kind}:${name} v${version}. Register it in SHARED_COMPONENT_REGISTRY.`
    );
  }
  return `\${SHARED_SPECS_BASE}/${entry.fileName}#/components/${kind}/${name}`;
}

export function getSharedComponentVersion(
  specFile: string,
  kind: ComponentKind,
  name: string
): number {
  const pin = makeSharedComponentPin(kind, name);
  const pinned = SPEC_SHARED_VERSIONS[specFile]?.[pin];
  if (pinned !== undefined) {
    return pinned;
  }

  if (usesTransactionErrorV2(specFile)) {
    if (kind === 'schemas' && name === 'Error') {
      return 2;
    }
    if (kind === 'responses' && STANDARD_ERROR_RESPONSE_SET.has(name)) {
      return 2;
    }
  }

  if (usesAppStatusErrorV3(specFile) && kind === 'schemas' && name === 'Error') {
    return 3;
  }

  return DEFAULT_SHARED_COMPONENT_VERSION;
}

/** Resolved $ref for automation, or null if this spec keeps the component inline. */
export function resolveSharedRef(
  specFile: string,
  kind: ComponentKind,
  name: string
): string | null {
  if (!shouldUseSharedComponent(specFile, kind, name)) {
    return null;
  }

  if (kind === 'parameters' && name === 'correlationId') {
    return sharedRef('parameters', 'CorrelationIdHeader', DEFAULT_SHARED_COMPONENT_VERSION);
  }

  const version = getSharedComponentVersion(specFile, kind, name);
  return sharedRef(kind, name, version);
}

/** Specs whose inline definition matches shared PolicyNumber_v1 (inventory: identical). */
const POLICY_NUMBER_SPECS = new Set([
  'FundTransfer_2.0.0.yml',
  'fundtransfer_1.0.1.yaml',
  'onetimewithdrawal_1.0.1.yaml',
  'onetimewithdrawal_2.0.1.yaml',
  'onetimewithdrawalquote_1.0.1.yaml',
  'onetimewithdrawalquote_2.0.1.yaml',
  'policyinquiry.yaml',
  'policyinquiry_2.1.1.yaml'
]);

const CORRELATION_ID_HEADER_SPECS = POLICY_NUMBER_SPECS;

const ASSOCIATED_FIRM_ID_SPECS = new Set([
  'FundTransfer_2.0.0.yml',
  'fundtransfer_1.0.1.yaml',
  'onetimewithdrawal_1.0.1.yaml',
  'onetimewithdrawal_2.0.1.yaml',
  'onetimewithdrawalquote_1.0.1.yaml',
  'onetimewithdrawalquote_2.0.1.yaml'
]);

const CORRELATION_ID_RESPONSE_HEADER_SPECS = new Set([
  'FundTransfer_2.0.0.yml',
  'SystematicProgramSetUp_2.0.0.yml',
  'SystematicProgramUpdate_2.0.0.yml',
  'activatedannuityincome_1.0.1.yaml',
  'appstatus_4.0.0.yaml',
  'appstatuspushNotifications_2.0.0.yaml',
  'fundtransfer_1.0.1.yaml',
  'onetimewithdrawal_1.0.1.yaml',
  'onetimewithdrawal_2.0.1.yaml',
  'onetimewithdrawalquote_1.0.1.yaml',
  'onetimewithdrawalquote_2.0.1.yaml',
  'policyinquiry.yaml',
  'policyinquiry_2.1.1.yaml',
  'systematicwithdrawalprogramsetup_1.0.1.yaml',
  'systematicwithdrawalprogramupdate_1.0.1.yaml'
]);

const FUND_DISTRIBUTION_SPECS = new Set([
  'SystematicProgramSetUp_2.0.0.yml',
  'SystematicProgramUpdate_2.0.0.yml',
  'onetimewithdrawal_1.0.1.yaml',
  'onetimewithdrawal_2.0.1.yaml',
  'onetimewithdrawalquote_1.0.1.yaml',
  'onetimewithdrawalquote_2.0.1.yaml',
  'systematicwithdrawalprogramsetup_1.0.1.yaml',
  'systematicwithdrawalprogramupdate_1.0.1.yaml'
]);

/** Inventory variant shared by transaction + app-status specs (13 files). */
const PARTY_RELATIONSHIP_SPECS = new Set([
  'appstatus_3.1.0.yaml',
  'appstatus_4.0.0.yaml',
  'appstatuspushNotifications_1.1.1.yaml',
  'appstatuspushNotifications_2.0.0.yaml',
  'appstatusv1.yaml',
  'appstatusv2.yaml',
  'fundtransfer_1.0.1.yaml',
  'onetimewithdrawal_1.0.1.yaml',
  'onetimewithdrawal_2.0.1.yaml',
  'onetimewithdrawalquote_1.0.1.yaml',
  'onetimewithdrawalquote_2.0.1.yaml',
  'systematicwithdrawalprogramsetup_1.0.1.yaml',
  'systematicwithdrawalprogramupdate_1.0.1.yaml'
]);

const INDIVIDUAL_IDENTITY_SPECS = new Set([
  'onetimewithdrawal_1.0.1.yaml',
  'onetimewithdrawal_2.0.1.yaml',
  'onetimewithdrawalquote_1.0.1.yaml',
  'onetimewithdrawalquote_2.0.1.yaml',
  'systematicwithdrawalprogramupdate_1.0.1.yaml'
]);

const ENTITY_IDENTITY_SPECS = new Set([
  'onetimewithdrawal_1.0.1.yaml',
  'onetimewithdrawal_2.0.1.yaml',
  'onetimewithdrawalquote_1.0.1.yaml',
  'onetimewithdrawalquote_2.0.1.yaml'
]);

/** Category A transaction APIs sharing Error_v2 (deduplicated; still README Error_v1 debt). */
export const TRANSACTION_ERROR_V2_SPECS = new Set([
  'fundtransfer_1.0.1.yaml',
  'FundTransfer_2.0.0.yml',
  'systematicwithdrawalprogramsetup_1.0.1.yaml',
  'SystematicProgramSetUp_2.0.0.yml',
  'systematicwithdrawalprogramupdate_1.0.1.yaml',
  'SystematicProgramUpdate_2.0.0.yml',
  'onetimewithdrawal_1.0.1.yaml',
  'onetimewithdrawal_2.0.1.yaml',
  'onetimewithdrawalquote_1.0.1.yaml',
  'onetimewithdrawalquote_2.0.1.yaml',
  'activatedannuityincome_1.0.1.yaml'
]);

export function usesTransactionErrorV2(specFile: string): boolean {
  return TRANSACTION_ERROR_V2_SPECS.has(specFile);
}

/** Category B app-status APIs sharing Error_v3 (deduplicated; still README Error_v1 debt). */
export const APP_STATUS_ERROR_V3_SPECS = new Set([
  'appstatus_4.0.0.yaml',
  'appstatuspushNotifications_2.0.0.yaml'
]);

export function usesAppStatusErrorV3(specFile: string): boolean {
  return APP_STATUS_ERROR_V3_SPECS.has(specFile);
}

/** App-status family uses component key `correlationId` (parameter) — aliased to CorrelationIdHeader_v1. */
export const APP_STATUS_CORRELATION_ID_PARAMETER_SPECS = new Set([
  'appstatusv1.yaml',
  'appstatusv2.yaml',
  'appstatus_3.1.0.yaml',
  'appstatus_4.0.0.yaml',
  'appstatuspushNotifications_1.1.1.yaml',
  'appstatuspushNotifications_2.0.0.yaml'
]);

const POLICY_INQUIRY_PRODUCER_SPECS = new Set(['policyinquiry.yaml', 'policyinquiry_2.1.1.yaml']);

/** Specs not yet aligned to README / shared Error_v1 (see ERROR-SCHEMA-DEBT.md). */
export const README_ERROR_DEBT_SPEC_FILES = new Set([
  ...TRANSACTION_ERROR_V2_SPECS,
  ...APP_STATUS_ERROR_V3_SPECS,
  'policyinquiry.yaml',
  'policyinquiry_2.1.1.yaml',
  'producertraining_1.0.1.yaml',
  'paperlessreplacements1.yaml',
  'beneficiaryreplacement_1.0.0.yaml'
]);

/** @deprecated Use README_ERROR_DEBT_SPEC_FILES — kept for existing imports. */
export const ERROR_DEBT_SPEC_FILES = README_ERROR_DEBT_SPEC_FILES;

/** Specs that keep fully inline Error / *Error responses (non-shared error shapes). */
const INLINE_ERROR_SPEC_FILES = new Set([
  'policyinquiry.yaml',
  'policyinquiry_2.1.1.yaml',
  'producertraining_1.0.1.yaml',
  'paperlessreplacements1.yaml',
  'beneficiaryreplacement_1.0.0.yaml'
]);

/** Specs that keep inline Error / ErrorResponse and standard *Error responses (local #/ refs). */
export function keepsInlineErrorModel(specFile: string): boolean {
  return INLINE_ERROR_SPEC_FILES.has(specFile);
}

export function shouldUseSharedComponent(
  specFile: string,
  kind: ComponentKind,
  name: string
): boolean {
  if (kind === 'parameters' && name === 'correlationId') {
    return APP_STATUS_CORRELATION_ID_PARAMETER_SPECS.has(specFile);
  }

  const inRegistry = SHARED_COMPONENT_REGISTRY.some(
    entry => entry.kind === kind && entry.name === name
  );
  if (!inRegistry) return false;

  if (kind === 'schemas' && name === 'Error' && keepsInlineErrorModel(specFile)) {
    return false;
  }

  if (kind === 'responses' && STANDARD_ERROR_RESPONSE_SET.has(name) && keepsInlineErrorModel(specFile)) {
    return false;
  }

  if (kind === 'schemas' && name === 'Error' && usesTransactionErrorV2(specFile)) {
    return true;
  }

  if (kind === 'responses' && STANDARD_ERROR_RESPONSE_SET.has(name) && usesTransactionErrorV2(specFile)) {
    return true;
  }

  if (kind === 'schemas' && name === 'Error' && usesAppStatusErrorV3(specFile)) {
    return true;
  }

  if (kind === 'parameters' && name === 'PolicyNumber') {
    return POLICY_NUMBER_SPECS.has(specFile);
  }

  if (kind === 'parameters' && name === 'CorrelationIdHeader') {
    return CORRELATION_ID_HEADER_SPECS.has(specFile);
  }

  if (kind === 'parameters' && name === 'AssociatedFirmId') {
    return ASSOCIATED_FIRM_ID_SPECS.has(specFile);
  }

  if (kind === 'headers' && name === 'correlationId') {
    return CORRELATION_ID_RESPONSE_HEADER_SPECS.has(specFile);
  }

  if (kind === 'schemas' && name === 'FundDistribution') {
    return FUND_DISTRIBUTION_SPECS.has(specFile);
  }

  if (kind === 'schemas' && name === 'PartyRelationship') {
    return PARTY_RELATIONSHIP_SPECS.has(specFile);
  }

  if (kind === 'schemas' && name === 'IndividualIdentity') {
    return INDIVIDUAL_IDENTITY_SPECS.has(specFile);
  }

  if (kind === 'schemas' && name === 'EntityIdentity') {
    return ENTITY_IDENTITY_SPECS.has(specFile);
  }

  if (kind === 'schemas' && name === 'ProducerExternalIds') {
    return POLICY_INQUIRY_PRODUCER_SPECS.has(specFile);
  }

  if (kind === 'schemas' && name === 'ProducerCommission') {
    return POLICY_INQUIRY_PRODUCER_SPECS.has(specFile);
  }

  if (kind === 'schemas' && name === 'PolicyProducer') {
    return POLICY_INQUIRY_PRODUCER_SPECS.has(specFile);
  }

  if (kind === 'schemas' && name === 'PolicyProducers') {
    return POLICY_INQUIRY_PRODUCER_SPECS.has(specFile);
  }

  if (kind === 'responses' && STANDARD_ERROR_RESPONSE_SET.has(name)) {
    return false;
  }

  if (kind === 'schemas' && name === 'Error') {
    return false;
  }

  return true;
}
