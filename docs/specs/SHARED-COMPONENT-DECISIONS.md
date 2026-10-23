# Shared Component Extraction Decisions

<!-- Modified by Cursor -->

Records conflict-resolution choices from the shared-components migration (Phase 2). Re-run `npm run inventory:components` and `npx tsx scripts/analyze-schema-variants.ts <SchemaName>` before changing these decisions.

## Phase 2 — Extracted (identical inventory variants)

| Shared file | Specs using `$ref` | Source variant |
|-------------|-------------------|----------------|
| `FundDistribution_v1.yaml` | 8 withdrawal/systematic specs | Single identical group |
| `PartyRelationship_v1.yaml` | 13 transaction + app-status specs | Inventory variant 2 |
| `IndividualIdentity_v1.yaml` | 5 OTW / OTW quote / systematic update specs | Inventory variant 8 |
| `EntityIdentity_v1.yaml` | 4 OTW / OTW quote specs | Inventory variant 7 |

## Phase 3 — Transaction error deduplication (`Error_v2`)

| Shared file | Specs using `$ref` | Notes |
|-------------|-------------------|-------|
| `Error_v2.yaml` | 11 Category A transaction specs | Same payload shape as prior inline Error; **not** README `Error_v1` |
| `BadRequestError_v2.yaml` … `GatewayTimeoutError_v2.yaml` | Same 11 specs | Reference `Error_v2` + `correlationId_v1` |

README alignment (`Error_v1`) remains future governance work — see [`ERROR-SCHEMA-DEBT.md`](ERROR-SCHEMA-DEBT.md).

## Phase 4 — App-status errors + policy inquiry producers

| Shared file | Specs using `$ref` | Notes |
|-------------|-------------------|-------|
| `Error_v3.yaml` | `appstatus_4.0.0.yaml`, `appstatuspushNotifications_2.0.0.yaml` | Category B app-status shape; **not** README `Error_v1` |
| `ProducerExternalIds_v1.yaml` | Policy inquiry v1 + v2.1.1 | Identical across both specs |
| `ProducerCommission_v1.yaml` | Policy inquiry v1 + v2.1.1 | Identical across both specs |
| `PolicyProducer_v1.yaml` | Policy inquiry v1 + v2.1.1 | References producer child shared files |
| `PolicyProducers_v1.yaml` | Policy inquiry v1 + v2.1.1 | Paginated producer list wrapper |

## App-status correlation ID (component key alias)

App-status specs keep the local component key **`correlationId`** (lowercase) but reference shared definitions:

| Local key | Shared file | Specs |
|-----------|-------------|-------|
| `parameters.correlationId` | `CorrelationIdHeader_v1.yaml` | All 6 app-status specs (`appstatusv1` … `appstatuspushNotifications_2.0.0`) |
| `headers.correlationId` | `correlationId_v1.yaml` | `appstatus_4.0.0.yaml`, `appstatuspushNotifications_2.0.0.yaml` |

Transaction specs use the PascalCase key **`CorrelationIdHeader`** for the same shared parameter. Run `npm run audit:shared-refs` to detect inline components the registry expects to be shared.

## Phase 2 — Kept inline (conflicting definitions)

| Component | Decision | Reason |
|-----------|----------|--------|
| `Producer` | **C — keep inline** | Flat transaction object vs discriminated notification producers |
| `Party` | **C — keep inline** | Simple oneOf vs policy-inquiry extended party |
| `IndividualParty`, `EntityParty` | **C — keep inline** | Structure differs when identity is inlined vs `$ref` |
| `RmdInfo` / `rmdInfo` | **C — keep inline** | Six variants; naming split across families |
| `TaxWithholdingInstruction` | **C — keep inline** | Five variants across v1/v2 systematic and policy inquiry |
| `Address`, `Bank` | **C — keep inline** | Multiple regex/maxLength variants |
| `PartyRelationship` (remaining specs) | **C — keep inline** | `FundTransfer_2.0.0.yml`, `SystematicProgramSetUp_2.0.0.yml`, `SystematicProgramUpdate_2.0.0.yml`, `policyinquiry.yaml`, `policyinquiry_2.1.1.yaml` use non-matching variants |

## Phase 1 — Legacy response names

| Component | Decision | Specs |
|-----------|----------|-------|
| `BadRequest` vs `BadRequestError` | **C — keep inline** | `beneficiaryreplacement_1.0.0.yaml`, `producertraining_1.0.1.yaml` |

## Error schema

See [`ERROR-SCHEMA-DEBT.md`](ERROR-SCHEMA-DEBT.md).

| Shared file | Purpose |
|-------------|---------|
| `Error_v1.yaml` | README Standard Error Schema (canonical target) |
| `Error_v2.yaml` | Transaction-style Error (Category A shape); used by 11 transaction specs |
| `*Error_v1.yaml` / `*Error_v2.yaml` | Standard HTTP responses referencing the matching Error version |

Category A transaction specs use **`Error_v2`** (deduplicated, not README). They remain README debt until upgraded to **`Error_v1`**.

## Versioning

Shared component version policy and upgrade workflow: [`SHARED-COMPONENT-VERSIONING.md`](SHARED-COMPONENT-VERSIONING.md). Per-spec version pins live in `SPEC_SHARED_VERSIONS` inside [`scripts/shared-component-registry.ts`](../../scripts/shared-component-registry.ts).
