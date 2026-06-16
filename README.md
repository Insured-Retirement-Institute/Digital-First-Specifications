# Digital First Specifications

This repository contains:

* Published OpenAPI specifications for the Digital-First standards
* Published AsyncAPI specifications for Digital-First messaging and event-driven APIs
* Style Guide and Versioning conventions used for all OpenAPI specifications

## Published OpenAPI Specifications

Once a working group's API specification has been reviewed and approved by the [Governance Committee](https://www.irionline.org/member-programs/operations-technology/committee-hub/governance/), the OpenAPI specification is moved into this repository and published at [specs.dfa.irionline.org](https://specs.dfa.irionline.org), which is the published GitHub Page of this repository.

## Published AsyncAPI Specifications

Once a working group's messaging specification has been reviewed and approved by the [Governance Committee](https://www.irionline.org/member-programs/operations-technology/committee-hub/governance/), the AsyncAPI specification is moved into this repository and published at [specs.dfa.irionline.org](https://specs.dfa.irionline.org), which is the published GitHub Page of this repository.

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

## Versioning

All Digital-First specifications follow [Semantic Versioning (SemVer)](https://semver.org/) to convey the meaning of changes in a release. Given a version number MAJOR.MINOR.PATCH, increment the:

- **MAJOR** version when you make incompatible changes (for example, breaking changes, addition of a required field, or deprecation of an existing field)
- **MINOR** version when you add functionality in a backward compatible manner (for example, addition of optional fields or possible values)
- **PATCH** version when you make backward compatible bug fixes
- Additional labels for pre-release and build metadata are available as extensions to the MAJOR.MINOR.PATCH format (for example, `-rc.1`, `-beta`)

Individual firms decide the versions they will support. Firms can support multiple versions if they choose.

### API Versioning
- API's will utilize the major version at the URL level, and the minor/patch versions should have a head for X-Api-Version.  For example, an API with a version of 1.2.1 would have the following:
-- URL: https://example-api.com/v1/products.
-- Header: X-Api-Version: 1.2.1

**Note: The standard will be effective going forward to include the full version in the header.  All existing API's will be updated before 12/31/2026.**

### Messaging Versioning

Messaging standards apply Semantic Versioning through two levels of versioning that serve distinct purposes:

- **Topic version** = MAJOR version (API version / contract boundary)
- **Payload version** = MINOR version (backward-compatible evolution within a topic)

This ensures safe evolution of event contracts, consumer protection from breaking changes, and scalable governance across domains.

**Messaging specs should include both the topic and payload versions in each definition**

#### Topic (Taxonomy) Versioning

**Standard format:**

```
<domain>.<entity>.<eventType>.v<version>
```

**Examples:**

```
policy.contract.created.v1
policy.contract.created.v2
```

**Purpose**

- Defines the contract boundary
- Controls routing and subscription behavior
- Separates breaking changes


#### Payload Versioning

**Standard format (within message metadata):**

```json
{
  "eventType": "policy.contract.created",
  "version": "1.2"
}
```

**Purpose**

- Tracks schema evolution within a stable contract
- Supports minor enhancements
- Maintains backward compatibility


#### Combined Example

**Topic:**

```
policy.contract.created.v1
```

**Message:**

```json
{
  "eventId": "12345",
  "eventTimestamp": "2026-06-09T10:15:00Z",
  "eventType": "policy.contract.created",
  "version": "1.2",
  "sourceSystem": "policy-admin",
  "correlationId": "abc-789",
  "payload": {
    "contractId": "C10001",
    "policyNumber": "P98765",
    "issueDate": "2026-06-01",
    "customerId": "U12345"
  }
}
```

## API definition format

API definitions will utilize [OpenAPI 3.1.X](https://swagger.io/specification/) specifications

## Messaging and Event driven definition format

Message driven definitions will utilize [AsyncAPI 3.1.X](https://www.asyncapi.com/docs/reference/specification/v3.1.0) specifications

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

## Messaging Governance
- Topic version is mandatory for all events
- Payload version is manadatory for all events
- Consumers must opt-in to receive each event type

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

Security issues and bugs should be reported directly to Katherine Dease kdease@irionline.org. Issues and bugs can be reported directly within the issues tab of a repository. Change requests should follow the standards governance workflow outlined on the [main page](https://github.com/Insured-Retirement-Institute).

## Code of conduct

See [code of conduct](https://github.com/Insured-Retirement-Institute/Digital-First-Specifications/blob/main/CODE_OF_CONDUCT.md)
