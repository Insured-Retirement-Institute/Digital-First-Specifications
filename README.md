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

## Bulk Asynchronous Request Pattern

For requests that return data sets too large or too time-consuming to return in a single synchronous response, Digital-First specifications adopt a standardized bulk asynchronous request pattern. This pattern was reviewed and approved by the Governance Committee and applies to any working group's API that needs bulk or long-running data retrieval.

The pattern is industry-aligned with established async integration patterns (RFC 7240 `Prefer: respond-async`, AWS S3 presigned URLs, webhook-based data export flows).

### Pattern Overview

The pattern has four interactions between two parties — the **Requestor** (the caller) and the **Data Provider** (the responding system, optionally fronted by a hub or intermediary):

1. **Bulk Request (Requestor → Data Provider).** The Requestor submits a `POST` request describing what data is needed. The Data Provider validates the request and responds with `202 Accepted` and a body containing a unique `requestId` and a `statusUrl` for polling.
2. **Data-Ready Notification (Data Provider → Requestor, webhook).** When the data is prepared, the Data Provider calls the Requestor's pre-registered callback URL with a notification payload describing how to retrieve the result (file identifier, expiration, checksum, size, etc.).
3. **File Download (Requestor → Data Provider).** The Requestor retrieves the prepared data via `GET`, either from a hub-mediated endpoint using the file identifier from the notification, or from a presigned URL contained in the notification.
4. **Status Lookup (Requestor → Data Provider).** At any time after the original request, the Requestor may `GET` the `statusUrl` to check the current state of the request and — when complete — retrieve the same payload that was (or will be) delivered via webhook. This endpoint is the recovery mechanism for missed or undelivered notifications and is **required** of any bulk async implementation.

Complete normative detail — required endpoints, naming guidance, response codes, status semantics, notification payload schemas, webhook security requirements, error code taxonomy, timing expectations, and intermediary handling — is in **[bulk-async-pattern.md](bulk-async-pattern.md)**.

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
