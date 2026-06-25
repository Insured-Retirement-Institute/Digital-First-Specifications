# Digital First Specifications

This repository contains:

* Published OpenAPI specifications for the Digital-First standards
* Style Guide and Versioning conventions used for all OpenAPI specifications

## Published OpenAPI Specifications

Once a working group's API specification has been reviewed and approved by the [Governance Committee](https://www.irionline.org/member-programs/operations-technology/committee-hub/governance/), the OpenAPI specification is moved into this repository and published at [specs.dfa.irionline.org](https://specs.dfa.irionline.org), which is the published GitHub Page of this repository.

## Style Guide

The style guide provides rules, regulations, and recommendations for Digital-First standards.

### Style Conventions

Field naming
- **Booleans**: Should be prefixed with is or has.
- **Lists/Arrays**: Use plural nouns to represent the array itself and singular nouns to represent the elements within the array.

Custom headers
- **_correlationId_**: Optional custom header to be returned to the caller in response payload

Query String Parameters
- Sending **_Personally Identifiable Information (PII)_** as query string parameters such as names, addresses, email addresses, or account numbers, directly in URL query strings is a common practice to be avoided due to the significant privacy and security risks involved. 
- **_associatedFirmId_**: Optional query parameter for the associated firm ID

Regular Expressions
- There is no single universally adopted regex "standard," but Perl-Compatible Regular Expressions (PCRE) is the most widely supported and influential standard

Response Body Standards
  - Response body must only contain the resource or collection of resources that were requested (error responses are an exception to this rule.)
  - The response body should __BE__ the resource or array rather than an object that contains a named object or array that contains the data. Arbitrary renaming or nesting of single resources is disallowed.
  - **Metadata placement**
    - Transport and tracing metadata (e.g., `correlationId`) belongs in response headers.
    - Representation metadata that describes or navigates the payload belongs in a documented body envelope — not in ad-hoc wrapper objects.
  - **Exception — composite query results**: When a response delivers a collection together with metadata that describes or navigates *that collection* (e.g., pagination; see [Pagination](#pagination)), the body **may** use a standardized composite shape: a plural resource array plus a sibling `metadata` object. This is permitted only when:
    - The metadata fields are defined in this style guide (or an approved extension),
    - The metadata is intrinsically tied to the array in the same response, and
    - The shape uses the prescribed `metadata` sibling — not ad-hoc wrapper names.
  <details>
    <summary>Examples</summary>
    <code>
    {
      "attr1": "val1",
      "attr2": "val2",
      ...
    }
  </code>
    rather than
  <code>
    {
      "objName":
      {
        "attr1": "val1",
        "attr2": "val2",
        ...
      }
    }
  </code>
  and
  <code>
    [
      {
        "attr1": "val1",
        "attr2": "val2",
        ...
      },
      {
        "attr1": "val3",
        "attr2": "val4",
        ...
      },
      ...
    ]
  </code>
    rather than
  <code>
    {
      "arrayName": [
        {
          "attr1": "val3",
          "attr2": "val4"
        },
    ...
      ]
    }
  </code>
</details>

### Pagination

Pagination introduces inherent complexity and accuracy tradeoffs — it can be difficult to guarantee a perfectly consistent dataset across pages when underlying data may change between requests. Because accurate pagination can significantly increase implementation costs and reduce adoption, and because IRI DFA prefers simplicity over complexity, **pagination should be avoided unless necessary** (e.g., when the full dataset is too large to transfer within typical server or API-gateway limits).

When pagination is required, working groups must choose one of the two supported patterns based on their business requirements.

#### Choosing a pattern

Offset-based paging and cursor/token-based paging are paging patterns available for working groups to adopt. Neither pattern guarantees a moment-in-time snapshot of the data; concurrent writes may add, remove, or reorder resources between page requests. The patterns differ in their implementation complexity, dataset accuracy and how callers should handle responses.

| Concern | Offset-based | Cursor/token-based |
|---------|--------------|-------------------|
| Implementation effort/complexity | Med | Med/high depending on DB being used |
| Skipped or duplicated resources when data changes between requests | Expected; caller **must** deduplicate | Unlikely under stable sort order; iteration position is carried in the token |
| Dataset size | Suitable when fewer than ~10K resources | Suitable for large or unbounded datasets |
| Random access (e.g., "jump to page 5") | Supported via `offset` | Not supported |
| `totalCount` for "page X of Y" on a UI | Optional (discouraged unless required) | Optional (discouraged unless required) |

Use offset-based pagination when the business case accepts approximate completeness (with potentially incomplete or duplicated records) and the dataset stays small. Use cursor-based pagination when the caller must iterate the full result set reliably without missing/duplicated data (e.g., sync or export) or when the dataset may grow beyond ~10K resources.

> **Note on existing specifications**: Some published specs predate this guidance and use legacy field names (e.g., `start`, `startIndex`, `itemsCount`, `totalItemsCount`). New and revised specifications **must** follow the field names and response shape defined below.

#### Option 1 — Offset-based pagination

Query parameters:

| Parameter | Required | Description |
|-----------|----------|-------------|
| `offset` | No (default: `0`) | Zero-based index of the first resource to return. |
| `limit` | No | Maximum number of resources to return per page. The endpoint may return fewer resources than requested. |
| `orderBy` | No | Field name used to order resources in the result set. |
| `sortOrder` | No | Whether resources are ordered in ascending (`asc`) or descending (`desc`) order. |

Callers **must** be prepared to detect and handle duplicate resources across pages.

When the specified `offset` is greater than or equal to the total number of matching resources, the endpoint **must** return HTTP `200` with an empty resource array and omit `nextOffset` from `metadata`.

The API specification description for offset-based pagination endpoints **must** state the following:
- The data returned is **not** guaranteed to represent a moment-in-time snapshot of the data; concurrent writes may still affect results across pages.
- The caller **must** assume that, on occasion, some resources may be missing from the result set due to concurrent writes.
- The caller **must** be prepared to handle the same resource appearing on multiple pages (i.e., be able to de-duplicate resources in the result set). In this warning, also include the unique field (e.g., `id`) to be used for deduplication.
- When an endpoint supports sorting, the API specification **must** document the `orderBy` and `sortOrder` values that provide the most stability across pages — typically a unique, stable identifier.
- The endpoint may return a lower `limit` than the one requested by the caller.

#### Option 2 — Cursor/token-based pagination

Use cursor-based pagination when stable iteration through the result set is required, or when the dataset may be large or unbounded.

Query parameters:

| Parameter | Required | Description |
|-----------|----------|-------------|
| `paginationToken` | No | Opaque token returned by the server identifying the position in the result set. Omit on the first request. |
| `limit` | No | Maximum number of resources to return per page. The endpoint may return fewer resources than requested. |
| `orderBy` | No | Field name used to order resources in the result set. Must not change on subsequent requests in the same paginated session. |
| `sortOrder` | No | Whether resources are ordered in ascending (`asc`) or descending (`desc`) order. Must not change on subsequent requests in the same paginated session. |

Key technical implementation requirements:
- The `paginationToken` **must** be treated as opaque by callers. Implementors should encode the token (e.g., base64) to discourage interpretation.
- The token **must** encode sufficient state to resume iteration (including sort order when applicable). On subsequent requests, `orderBy` and `sortOrder` **must** match the values used to start the paginated session, or the endpoint **must** reject the request.
- `orderBy` options **should** include a unique, stable field (alone or as a tie-breaker) to ensure deterministic token generation.
- Implementors **must not** include sensitive information (e.g., SSN) in the token — the token is transmitted as a query parameter and may appear in server logs and browser history (see [Query String Parameters](#style-conventions) regarding PII in URLs).

The API specification description for token-based pagination endpoints **must** state the following:
- Pagination is **not** guaranteed to represent a moment-in-time snapshot; resources added or removed after the session starts may not appear in the result set.
- Pagination **does** provide stable forward iteration: callers should not receive skipped or duplicated resources under normal concurrent writes when using tokens as returned.
- When an endpoint supports sorting, the API specification **must** document the `orderBy` and `sortOrder` values that provide the most stability across pages — typically a unique, stable identifier.
- The endpoint may return a lower `limit` than the one requested by the caller.

#### Common response schema

Paginated responses are a composite query result (see Response Body Standards above): a plural resource array (named for the resource type, e.g., `policies`) and a sibling `metadata` object. Do not mix offset and cursor continuation fields in the same response — include only the fields applicable to the pattern in use.

| Field | Type | Applies to | Description |
|-------|------|------------|-------------|
| `offset` | integer | Offset-based only | Zero-based index of the first resource in this page. |
| `limit` | integer | Both | The page size used for this response (may be less than requested). |
| `nextOffset` | integer | Offset-based only | Offset to use to retrieve the next page. **Omit** when no further pages exist. |
| `nextPaginationToken` | string | Cursor-based only | Token to pass as `paginationToken` to retrieve the next page. **Omit** when no further pages exist. |
| `totalCount` | integer | Both (optional) | Total number of resources matching the query (before pagination). |

Note: Use of `totalCount` is discouraged unless the business case requires it, as it can be expensive to calculate.

**Offset-based example:**

```json
{
  "policies": [
    { "id": "001234" },
    { "id": "001235" }
  ],
  "metadata": {
    "offset": 0,
    "limit": 2,
    "nextOffset": 2,
    "totalCount": 100
  }
}
```

**Cursor-based example:**

```json
{
  "policies": [
    { "id": "001234" },
    { "id": "001235" }
  ],
  "metadata": {
    "limit": 2,
    "nextPaginationToken": "eyJvZmZzZXQiOjJ9"
  }
}
```

**Last page** (both patterns): omit `nextOffset` or `nextPaginationToken` from `metadata`. An empty resource array with no continuation field indicates the caller has reached the end of the result set.

### Standard Error Schema

- Every error response—regardless of transaction type—includes:
  - An HTTP status code in the **400–599** range
  - A structured and validated **error code**
  - A **timestamp** of when the error was generated
  - A developer‑focused **technical message** (`message`)
  - A safe, user‑friendly **userMessage**
  - A **correlationId** for cross‑system tracing
  - A **field‑level** or **rule‑level** error collections

- Key Fields
  | Field | Description |
  |-------|-------------|
  | **httpStatus** | Numeric HTTP status code (400–599) representing the type and severity of the failure. |
  | **code** | Structured identifier in the enforced format: `domain.category.subcategory`. Enables machine‑readable error handling. |
  | **correlationId** | Carries forward the inbound request’s correlation ID header to enable end‑to‑end traceability. |
  | **message** | End‑user‑friendly explanation, safe to show in portals or consumer‑facing apps. |
  | **validationErrors** | Array describing domain/business rule violations; each entry requires its own code and message. |

Data definitions  
- **_policyNumber_** is the term used to describe the unique identifier of the policy.
- **_producer_** is the preferred nomenclature when referring to licensed/appointed professional or firm selling products.
  - **_producerNumber_**: Carrier assigned unique identifier
  - **_npn_**: National Producer Number
  - **_crdNumber_**: Central Registration Depository number
- **_party_** is the term used to describe a party to the policy (that is not a producer) and may be an individual or another legal entity.
- Describing individuals and entities
  - **_firstName_**
  - **_middleName_**
  - **_lastName_**
  - **_taxId_**
  - **_name_** (for business/entity)

## API Versioning

- APIs will utilize versioning at the URL level. In this method, the API endpoint URL includes the major version number. For example, users wanting to retrieve all products from a database would send a request to https://example-api.com/v1/products. The specific version of an API can be specified as an optional header as outlined above.
- Release changes will institute [Semantic Versioning (SemVer)](https://semver.org/) for the versioning scheme to conveys the meaning about the changes in a release. To summarize, given a version number MAJOR.MINOR.PATCH, increment the:
  - MAJOR version when you make incompatible API changes (ex: breaking change, addition of required field or deprecation of an existing field)
  - MINOR version when you add functionality in a backward compatible manner (ex: addition of optional fields or possible values)
  - PATCH version when you make backward compatible bug fixes
  - Additional labels for pre-release and build metadata are available as extensions to the MAJOR.MINOR.PATCH format.
 
## API definition format

API definitions will utilize [OpenAPI 3.1.X](https://swagger.io/specification/) specifications

## Tagging & Releases

Git tags and GitHub releases mark specific points in the project’s history as official, shareable versions.  
They provide a clear, immutable reference for users and automation tools to download or deploy a stable build.

Follow **Semantic Versioning (MAJOR.MINOR.PATCH)** as outlined above, e.g. `v1.2.3`  
- **MAJOR**: breaking changes  
- **MINOR**: new features  
- **PATCH**: bug fixes  
- Optional pre-release suffixes: `-rc.1`, `-beta`

### Tagging
Use **annotated tags** on the main (stable) branch:
```bash
git tag -a v1.2.3 -m "Release v1.2.3"
git push origin v1.2.3
```
Tags are immutable—never overwrite an existing tag.

### Creating Releases on GitHub
Each GitHub Release should correspond to a tag. Releases provide a user-facing summary of what changed, include release notes, and may include built artifacts.

When drafting a release:
1. Choose or create the appropriate tag.
2. Select the correct target branch (usually `main` or the stable branch).
3. Provide a meaningful title.
4. Write release notes summarizing new features, breaking changes, bug fixes, and any migration steps or compatibility concerns. Properly attribute contributing PRs or issues.
5. Indicate if the release is a pre-release if it is not yet stable.

Include assets if relevant—binaries, installable packages, archives, etc. (GitHub automatically provides `.zip` and `.tar.gz` of the source at that tag.)

## Workflow / Policies & Governance

**Pull-request merges to `main` require two approvers.** All changes destined for the stable branch must be merged via a pull request and receive at least two approvals before merging.

**Restrict tagging and releasing to authorized maintainers.** Only individuals with appropriate permissions (e.g., maintainers) may approve and create releases or tags. This ensures quality control and prevents accidental or unauthorized releases.
## Implementation Considerations

### Versioning

- Individual firms decide the versions they will support.
- Firms can support multiple versions if they choose.

### Extending the specification

- The focus of the standard specification is to specify the data structures and how they are used in API requests and responses to ensure consistency across implementations. 
- When implementing the specification, parties are free to add custom fields, headers, and data to existing definitions at their own risk.
- It is strongly recommended that implementers avoid modifying the data structures. 
- It is recommend that custom headers be used to facilitate exchange of request meta-data that allows the receiver to process the request correctly or for tracking purposes. - Example: a service provider may require that distributors include sourceFirmId and targetFirmId and correlationId header fields to facilitate transmission of the data to downstream carriers that would not necessarily be required in direct API integration between distributor and carrier.

### Authentication

- Individual firms decide the authentication mechanism they will support. Parties are free to decide how their integrations will authenticate with one another.

## Change subsmissions and reporting issues and bugs

Security issues and bugs should be reported directly to Hannah Pikus at hpikus@irionline.org and Matthew Hendrickson at mhendrickson@irionline.org. Issues and bugs can be reported directly within the issues tab of a repository. Change requests should follow the standards governance workflow outlined on the [main page](https://github.com/Insured-Retirement-Institute).

## Code of conduct

See [code of conduct](https://github.com/Insured-Retirement-Institute/Digital-First-Specifications/blob/main/CODE_OF_CONDUCT.md)
