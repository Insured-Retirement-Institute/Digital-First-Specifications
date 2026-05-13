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
  - Response object body must only contain the resource or collection of resources that were requested (error responses are an exception to this rule.)
    - Additional response metadata should be in the response header (eg. correlationId)
  - The response body should __BE__ the resource or array rather than an object that contains a named object or array that contains the data.
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

Pagination introduces inherent complexity and accuracy tradeoffs — it can be difficult to guarantee a perfectly consistent dataset across pages when underlying data may change between requests. Because accurate pagination can significantly increase implementation costs and reduce adoption, and because IRI DFA IRI prefers simplicity over complexity, **pagination should be avoided unless necessary** (e.g., when the full dataset is too large to transfer within typical server or API-gateway limits).

When pagination is required, working groups must choose one of the two supported patterns based on their business requirements.

#### Option 1 — Offset-based pagination

Use offset-based pagination **only when**:
- The business case can accept a non-perfect (potentially incomplete or duplicated) dataset, **and**
- The dataset will never become extremely large (less than ~10K resources).

Query parameters:

| Parameter | Description |
|-----------|-------------|
| `offset` | Zero-based index of the first resources to return. |
| `limit` | Maximum number of resources to return per page. Note: the endpoint may use a lower number |
| `orderBy` | (optional) The field name used to indicate the order of resources in the result set |
| `sortOrder` | (optional) To indicate if the order of resources in ascending (`asc`) or descending (`desc`) |


Callers **must** be prepared to detect and handle duplicate resources across pages. The endpoint specification must identify the unique field (e.g., `id`) to be used for deduplication.

The API specification description for offset-based pagination endpoints **must** state the following:
- The data returned is **not** guaranteed to represent a moment-in-time snapshot of the data; concurrent writes may still affect results across pages.
- The caller **must** assume that, on occasion, some resources may be missing from the result set due to concurrent writes
- The caller **must** be prepared to handle the same resource being provided in multiple pages (i.e. be able to de-duplicate resources in the result set)
- If the business case requires the ability for the caller specify the ordering of the results, each endpoint specification **should** recommend the "safest" default `orderBy`/`sorrOrder` values — typically a stable, unique identifier sorted with newest entries in the latter pages — to minimize the risk of skipped or duplicated resources as pages are fetched.
- The endpoint may return a lower `limit` than the one requested by the caller

#### Option 2 — Cursor/token-based pagination

Use cursor-based pagination **when data accuracy is critical**.

Query parameters:

| Parameter | Description |
|-----------|-------------|
| `paginationToken` | Opaque token returned by the server identifying the position in the result set. |
| `limit` | Requested maximum number of resources to return per page. Note: the endpoint may use a lower number. |
| `orderBy` | (optional) The field name used to indicate the order of resources in the result set |
| `sortOrder` | (optional) To indicate if the order of resources in ascending (`asc`) or descending (`desc`) |

Key technical implementation requirements:
- The `paginationToken` **must** be treated as opaque by callers. Implementors should encode the token (e.g., base64) to discourage interpretation.
- `orderBy` options **should** use a unique identifier to ensure stable token generation.
- Implementors **must not** include sensitive information (e.g., SSN) in the token — the token is transmitted as a query parameter and may appear in server logs and browser history.

The API specification description for token-based pagination endpoints **must** state the following:

- The endpoint's pagination is **not** guaranteed to represent a moment-in-time snapshot of the data; concurrent writes may still affect results across pages.
- The endpoint may return a lower `limit` than the one requested by the caller

#### Common response schema

Both patterns **must** include the following metadata fields in the response body.  

| Field | Type | Description |
|-------|------|-------------|
| `offset` | Zero-based index of the first resource in the page. |
| `limit` | integer | The page size used for this response. |
| `nextOffset` | integer | *(Offset-based only)* Offset to use to retrieve the next page; omitted when no further pages exist. |
| `nextPaginationToken` | string | *(Cursor-based only)* Token to pass to retrieve the next page; omitted when no further pages exist. |
| `totalCount` | integer | (optional) Total number of resources matching the query (before pagination). |

To ensure that these fields are not confused as being part of the resource, they should be placed under a `metadata` attribute, like:
```json
 "policies": [
   {
     "id": "001234",
   },
   ...
   ],
 "metadata":{
   "offset": 0,
   "limit": 5,
   "nextOffset": 5,
   "totalCount": 100
  }
}

```

Note: Use of `totalCount` is discouraged unless the business case requires it as this can be expensive to calculate.

Standard Error Schema

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

Security issues and bugs should be reported directly to Hannah Pikus at hpikus@irionline.org and Matt Hendrickson at mhendrickson@irionline.org. Issues and bugs can be reported directly within the issues tab of a repository. Change requests should follow the standards governance workflow outlined on the [main page](https://github.com/Insured-Retirement-Institute).

## Code of conduct

See [code of conduct](https://github.com/Insured-Retirement-Institute/Digital-First-Specifications/blob/main/CODE_OF_CONDUCT.md)
