# Error Schema Debt Register

<!-- Modified by Cursor -->

Specs listed here are **not yet aligned to README / shared `Error_v1`**. See [`SHARED-COMPONENT-VERSIONING.md`](SHARED-COMPONENT-VERSIONING.md) for how `Error_v1` (README) and `Error_v2` (transaction shape) coexist.

## Category A — Transaction-style `Error` → shared `Error_v2`

These specs **$ref** [`shared/Error_v2.yaml`](shared/Error_v2.yaml) and standard `*Error_v2` responses (deduplicated). They remain **README debt** until upgraded to `Error_v1` in a governance PR.

| Spec |
|------|
| `fundtransfer_1.0.1.yaml` |
| `FundTransfer_2.0.0.yml` |
| `systematicwithdrawalprogramsetup_1.0.1.yaml` |
| `SystematicProgramSetUp_2.0.0.yml` |
| `systematicwithdrawalprogramupdate_1.0.1.yaml` |
| `SystematicProgramUpdate_2.0.0.yml` |
| `onetimewithdrawal_1.0.1.yaml` |
| `onetimewithdrawal_2.0.1.yaml` |
| `onetimewithdrawalquote_1.0.1.yaml` |
| `onetimewithdrawalquote_2.0.1.yaml` |
| `activatedannuityincome_1.0.1.yaml` |

Shape: `httpStatus`, `code`, `timestamp`, `message`, `validationErrors` — **no** `userMessage` or body `correlationId`.

## Category A-inline — Policy inquiry transaction errors (still inline)

| Spec | Notes |
|------|-------|
| `policyinquiry.yaml` | Missing `httpStatus` |
| `policyinquiry_2.1.1.yaml` | Missing `userMessage`, body `correlationId` |

## Category B — App-status-style `Error` → shared `Error_v3`

These specs **$ref** [`shared/Error_v3.yaml`](shared/Error_v3.yaml) (deduplicated). They remain **README debt** until aligned to `Error_v1`.

| Spec |
|------|
| `appstatus_4.0.0.yaml` |
| `appstatuspushNotifications_2.0.0.yaml` |

Shape: `userMessage`, body `correlationId`; `validationErrors` uses `path`/`message`/`code` (not README's `code`/`message` only).

## Category C — Legacy field names (inline)

| Spec | Issue |
|------|-------|
| `producertraining_1.0.1.yaml` | `errorCode`, `errorMessage` |
| `paperlessreplacements1.yaml` | integer `code`, `description` |

## Category D — Domain-specific error model (inline)

| Spec | Issue |
|------|-------|
| `beneficiaryreplacement_1.0.0.yaml` | `ErrorResponse` schema (not generic `Error`) |

## Category E — No inline `Error` schema today

| Spec |
|------|
| `appstatusv1.yaml` |
| `appstatusv2.yaml` |
| `appstatus_3.1.0.yaml` |
| `appstatuspushNotifications_1.1.1.yaml` |

## Resolution workflow

1. Working group proposes alignment to README / `Error_v1`.
2. Governance approves breaking-change version bump if needed.
3. Remove spec from this register and switch src spec to `$ref: '${SHARED_SPECS_BASE}/Error_v1.yaml#/components/schemas/Error'` (and `*Error_v1` responses).

For transaction APIs not ready for README shape, shared deduplication uses **`Error_v2`** without changing the public error payload shape.
