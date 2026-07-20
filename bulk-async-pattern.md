# Bulk Asynchronous Request Pattern — Specification

> **Status:** Approved by the Governance Committee
> **Companion:** Pattern overview and four-step interaction summary are in the [main README](../README.md#bulk-asynchronous-request-pattern). This page is the complete normative specification.

For requests that return data sets too large or too time-consuming to return in a single synchronous response, Digital-First specifications adopt this standardized bulk asynchronous request pattern. The pattern is industry-aligned with established async integration patterns (RFC 7240 `Prefer: respond-async`, AWS S3 presigned URLs, webhook-based data export flows).

## Table of Contents

- [Required Endpoints](#required-endpoints)
- [Naming Guidance](#naming-guidance-for-the-bulk-job-collection)
- [Required Response Codes](#required-response-codes)
- [Status Values](#status-values)
- [Required Notification Payload Fields](#required-notification-payload-fields)
- [Webhook Delivery Requirements](#webhook-delivery-requirements)
- [Status Polling and Notification Recovery](#status-polling-and-notification-recovery)
- [Bulk-Flow Error Codes](#bulk-flow-error-codes)
- [Timing Expectations](#timing-expectations)
- [Intermediaries and Routing Envelopes](#intermediaries-and-routing-envelopes)
- [Example Endpoint Set](#example-endpoint-set)

## Required Endpoints

A working group adopting this pattern must define the following endpoints. The pattern is built around a job-lifecycle resource — the bulk request itself is the resource, and its status and results are sub-resources of it. This nesting expresses the ownership relationship in the URL (a result file exists because a bulk request produced it) and makes authorization natural: the same context that owns the request owns its results.

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/v{N}/{resource}/{job-collection}` | Submit bulk request. Returns `202 Accepted` with `requestId` and `statusUrl`. |
| `GET` | `/v{N}/{resource}/{job-collection}/{requestId}` | Poll status; returns current state and, when complete, the data-ready payload. |
| `GET` | `/v{N}/{resource}/{job-collection}/{requestId}/results/{fileId}` | Download a prepared file. Omit if the implementation uses presigned URLs delivered in the data-ready notification. |

Where:
- `{resource}` is the working group's resource name (e.g., `income-activation`, `policies`, `producers`)
- `{job-collection}` is the working group's chosen plural noun for the bulk job resource (e.g., `exports`, `bulk-requests`, `bulk-searches`). The chosen name should reflect that the operation creates a long-running job, not a synchronous query.

The data-ready notification (webhook) is documented on the bulk-request operation using OpenAPI 3.1 `callbacks`, **not** as a standalone path on the API. The callback URL is hosted by the Requestor and registered out of band; it is not a resource on the Data Provider.

## Naming Guidance for the Bulk Job Collection

The path segment chosen for `{job-collection}` should be a plural noun that names the resource being created (the bulk job), not a modifier on another resource.

- `bulk` on its own is a modifier and not a resource — prefer `bulk-requests` or `bulk-searches` over `bulk/searches`.
- `exports` is preferred when the operation produces a downloadable artifact.

OperationIds should be derived from the HTTP method and the resource (e.g., `postBulkRequest`, `getBulkRequestStatus`, `getBulkRequestResultFile`) rather than starting with arbitrary verbs (`download`, `process`, `handle`).

## Required Response Codes

| Endpoint | Code | Meaning |
|---|---|---|
| `POST /{job-collection}` | `202 Accepted` | Request validated and queued. Body must include `requestId` and `statusUrl`. |
| `GET /{job-collection}/{requestId}` | `200 OK` | Status returned. Body must include `status` and, when `status` is `complete`, the data-ready payload. |
| `GET /{job-collection}/{requestId}` | `404 Not Found` | Unknown `requestId`. |
| `GET /{job-collection}/{requestId}` | `410 Gone` | Request existed but has expired. |
| `GET /{job-collection}/{requestId}/results/{fileId}` | `200 OK` | File returned as `application/octet-stream` or appropriate media type. |
| `GET /{job-collection}/{requestId}/results/{fileId}` | `404 Not Found` | File not yet available. |
| `GET /{job-collection}/{requestId}/results/{fileId}` | `410 Gone` | File has expired. |
| Webhook callback | `2xx` | Acknowledged — Data Provider should not retry. |
| Webhook callback | non-`2xx` | Failed — Data Provider must retry per retry policy. |

All error responses follow the Standard Error Schema defined in the main README.

## Status Values

The `status` field returned by the polling endpoint and the data-ready notification must use one of:

| Value | Meaning |
|---|---|
| `pending` | Accepted, not yet started |
| `processing` | Work in progress |
| `complete` | Data ready for download |
| `failed` | Terminal failure; `validationErrors` or error details should be present |
| `expired` | Completed previously but the result is no longer retrievable |

## Required Notification Payload Fields

The data-ready notification (webhook payload and the `complete`-state polling response) must include at minimum:

| Field | Description |
|---|---|
| `requestId` | The same identifier returned from the original `POST`. Allows the Requestor to correlate the notification with the originating request. |
| `status` | One of the values listed above. |
| `dataDetails[]` | One or more entries describing the prepared data (see below). |

Each `dataDetails` entry must include:

| Field | Description |
|---|---|
| `fileId` _or_ `dataLocation` | Either a hub-resolved identifier (`fileId`) for hub-mediated download, or a fully-formed download URL (`dataLocation`) for the presigned-URL variant. Exactly one approach must be used per spec — implementations must not mix. |
| `dataType` | File type (e.g., `ZIP`, `TXT`, `JSON`). |
| `fileSizeBytes` | Expected file size, to enable Requestor capacity planning and progress reporting. |
| `checksum` | SHA-256 hash of the file, formatted as a 64-character hex string (`pattern: ^[a-fA-F0-9]{64}$`). |
| `checksumAlgorithm` | Algorithm name (default `SHA-256`); included to allow future algorithm evolution without breaking changes. |
| `urlExpiresAt` | ISO 8601 absolute timestamp at which the file or URL is no longer retrievable. Absolute timestamps are required (not durations) to avoid clock-relative ambiguity. |

## Webhook Delivery Requirements

- **Pre-registered callback URLs.** Requestors must register their callback URL with the Data Provider out of band. The Data Provider must not accept callback URLs supplied per request unless explicitly designed to do so with appropriate validation (open-redirect protection, allow-listing, etc.).
- **Retry policy.** On non-`2xx` responses or delivery timeouts, the Data Provider must retry with exponential backoff. Recommended default: at least 5 attempts over at least 24 hours. The specific policy must be documented per implementation.
- **Idempotency.** Each webhook delivery must include an `Idempotency-Key` header so the Requestor can safely deduplicate retried deliveries.
- **Signature verification.** Each webhook delivery must include an HMAC signature header (`X-Signature-SHA256` recommended) computed over the raw request body using a shared secret exchanged at registration time. Requestors must verify the signature before processing.

## Status Polling and Notification Recovery

The polling endpoint (`GET /{job-collection}/{requestId}`) is the canonical recovery mechanism when a webhook is missed or fails to deliver. Requestors that do not implement webhook handling at all may use polling exclusively. Implementations should publish a recommended minimum poll interval (e.g., 30 seconds) and may return `Retry-After` headers to throttle pollers.

## Bulk-Flow Error Codes

In addition to the Standard Error Schema, working groups adopting this pattern must publish a starting set of bulk-flow error codes following the `domain.category.subcategory` format. Suggested baseline taxonomy:

| Code | Meaning |
|---|---|
| `bulk.client.invalid_request` | Request validation failure |
| `bulk.client.expired_url` | Download attempted on expired file or URL |
| `bulk.client.unknown_request_id` | Polling against an unknown `requestId` |
| `bulk.server.data_provider_timeout` | Upstream data provider exceeded SLA |
| `bulk.server.data_provider_unavailable` | Upstream data provider unreachable |
| `bulk.server.checksum_mismatch` | File integrity verification failed during preparation |

Working groups may extend this taxonomy with domain-specific codes (e.g., `bulk.client.invalid_firm_id`).

## Timing Expectations

Each adopting working group must publish a service-level expectation for the typical time between the `202 Accepted` response and the data-ready notification. This allows Requestors to design appropriate user experiences (interactive wait vs. background batch vs. overnight reconciliation).

## Intermediaries and Routing Envelopes

When an intermediary (hub) sits between the Requestor and the Data Provider, the intermediary may require additional routing headers (e.g., sender, receiver, message type, sub-message type). These headers are **hub-specific extensions** under the existing _Extending the specification_ guidance in the main README and must not be hardcoded as required fields in the working group's standard specification. Direct Requestor-to-Data Provider integrations must remain valid against the standard without supplying hub envelope fields.

## Example Endpoint Set

For a working group with resource name `income-activation` and job collection `exports`:

```
POST   /v1/income-activation/exports
GET    /v1/income-activation/exports/{requestId}
GET    /v1/income-activation/exports/{requestId}/results/{fileId}
```
