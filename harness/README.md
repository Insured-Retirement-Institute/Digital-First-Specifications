# Strictness harness — `additionalProperties` vs `unevaluatedProperties`

A small, spec-agnostic test bench for the IRI Gov Committee discussion.

It takes any spec in `docs/specs/`, injects `additionalProperties: false` or
`unevaluatedProperties: false` into its schemas, and validates a folder of JSON
request bodies against **all three variants side by side** — so you can see
exactly which bodies pass and which don't, and why.

Nothing in `docs/specs/` is modified. The injection happens in memory.

## Quick start

```bash
node harness/run.mjs --spec docs/specs/fundtransfer_1.0.1.yaml --schema FundTransferRequest --cases harness/cases/fundtransfer
```

or, via npm:

```bash
npm run harness:demo
```

## Flags

| Flag | Meaning |
| --- | --- |
| `--spec <path>` | OpenAPI 3.1 YAML file. **Required.** |
| `--schema <Name>` | Component schema to validate against, e.g. `FundTransferRequest`. **Required.** |
| `--list` | List every schema in the spec (with its composition keywords) and exit. |
| `--cases <dir>` | Directory of `.json` bodies to run. |
| `--case <file>` | Run a single body. |
| `--modes <a,b,c>` | Subset of `baseline,additionalProperties,unevaluatedProperties`. Default: all three. |
| `--apply <A,B,C>` | Only inject into these named schemas. Default: `all`. |
| `--apply suggested` | Inject only where the usage rule says it belongs — whole-object schemas, never composition fragments. |
| `--suggest` | Classify every schema in the spec as whole-object / fragment / dual-use, and exit. |
| `--scope deep\|named` | `deep` (default) also injects into inline object subschemas; `named` touches only the top node of each selected schema. |
| `--include-conditionals` | Also inject inside `if` / `then` / `else` / `not` subschemas. Off by default — see caveat below. |
| `--print-touched` | Print every location where the keyword was injected. |
| `--print-schema <Name>` | Dump that schema, per mode, so you can see what changed. |
| `--verbose` | Show all validation errors instead of the first six. |
| `--out <file.md>` | Write the markdown report to a file. |
| `--json [file]` | Write machine-readable results. |

Validator: Ajv 8 in JSON Schema 2020-12 mode (`strict: false`, `allErrors: true`).
`format` assertions are disabled — they're orthogonal to what this demonstrates.

## The presentation script

Three runs, in this order. Each one lands a different point.

### Run 1 — "just add it everywhere"

```bash
node harness/run.mjs --spec docs/specs/fundtransfer_1.0.1.yaml --schema FundTransferRequest --cases harness/cases/fundtransfer
```

| Case | baseline | `additionalProperties: false` | `unevaluatedProperties: false` |
| --- | --- | --- | --- |
| 01 Valid, minimal | PASS | PASS | PASS |
| 02 Valid, individual party | PASS | **FAIL** | **FAIL** |
| 03 Unknown top-level property | PASS | FAIL | FAIL |
| 04 Typo in segment amount | PASS | FAIL | FAIL |
| 05 Unknown property inside party | PASS | FAIL | FAIL |
| 06 Valid FULL_REBALANCE | PASS | PASS | PASS |
| 07 Valid entity party | PASS | **FAIL** | **FAIL** |
| 08 Entity field on individual party | PASS | FAIL | FAIL |

**Point:** blanket-applying *either* keyword to every schema breaks valid traffic.
`unevaluatedProperties` is not a safe find-and-replace either. On `IndividualIdentity`
(one half of `allOf[IndividualIdentity, PartyRelationship]`), `unevaluatedProperties: false`
only sees its *own* evaluation scope — it never learns that its sibling
`PartyRelationship` evaluated `relationships`. So it rejects valid data too.

### Run 2 — apply at the composition roots only

```bash
node harness/run.mjs --spec docs/specs/fundtransfer_1.0.1.yaml --schema FundTransferRequest \
  --cases harness/cases/fundtransfer \
  --apply FundTransferRequest,Party,TransactionAmounts,FundTransferFunds,FundTransferItem,FundSegment,Producer
```

| Case | baseline | `additionalProperties: false` | `unevaluatedProperties: false` |
| --- | --- | --- | --- |
| 01 Valid, minimal | PASS | PASS | PASS |
| 02 Valid, individual party | PASS | **FAIL** | PASS |
| 03 Unknown top-level property | PASS | FAIL | FAIL |
| 04 Typo in segment amount | PASS | FAIL | FAIL |
| 05 Unknown property inside party | PASS | FAIL | FAIL |
| 06 Valid FULL_REBALANCE | PASS | PASS | PASS |
| 07 Valid entity party | PASS | **FAIL** | PASS |
| 08 Entity field on individual party | PASS | FAIL | FAIL |

**This is the headline table.** Same intent, same placement, opposite outcome:

- `unevaluatedProperties: false` accepts every valid body and rejects all four
  unknown-field bodies.
- `additionalProperties: false` rejects two perfectly valid bodies (02, 07) —
  false positives that would break production traffic.

### Run 3 — show *why*

```bash
node harness/run.mjs --spec docs/specs/fundtransfer_1.0.1.yaml --schema FundTransferRequest \
  --case harness/cases/fundtransfer/02-valid-individual-party.json \
  --apply Party --print-schema Party --verbose
```

`Party` declares three properties of its own (`type`, `paymentForm`,
`allocationPercentage`) and delegates the rest to
`oneOf: [IndividualParty, EntityParty]`, where `IndividualParty` is
`allOf: [IndividualIdentity, PartyRelationship]`.

- **`additionalProperties: false`** only ever consults the `properties` /
  `patternProperties` sitting *as its own siblings*. It cannot see through `$ref`,
  `allOf`, `oneOf`, `anyOf`, or `if/then`. So it rejects `firstName`, `lastName`,
  `taxId` and `relationships` — fields the spec plainly declares.
- **`unevaluatedProperties: false`** runs *after* the whole composition and asks
  "did anything in this schema, at any depth of composition, successfully evaluate
  this property?" It sees the inherited fields, so it only rejects the genuinely
  unknown ones.

### Run 4 — the rule, computed

```bash
npm run harness:classify     # classify the schemas
npm run harness:suggested    # run the eight bodies with that placement
```

`--suggest` classifies each schema by **how it is used**, not by what it contains:

- **whole-object** — referenced from a value position (`properties`, `items`,
  `additionalProperties`, `patternProperties`), used as a request or response
  body, or composed only alongside constraint-only branches (`required`, `not`,
  `enum`) that contribute no properties of their own. *Close it.*
- **composition fragment** — referenced from `allOf` / `oneOf` / `anyOf` /
  `if` / `then` / `else` alongside a co-applicator that contributes properties
  it does not itself declare. *Leave it open* — closing it is wrong, because it
  cannot see what its co-applicators evaluated.
- **dual-use** — both, in different places. Cannot be closed on its definition;
  needs a human, or a split into an open core plus a closed wrapper.

The hazard is never "appears inside an `allOf`". It is "appears inside an
`allOf` next to properties it does not declare", and that is decidable from the
document. On `fundtransfer_1.0.1.yaml` the classifier picks out exactly the
right five fragments (`IndividualParty`, `EntityParty`, `IndividualIdentity`,
`EntityIdentity`, `PartyRelationship`) with no human input, and running the
eight bodies at that computed placement reproduces the Run 2 table exactly.

### Placement, three ways

Same keyword, same spec, same eight bodies:

| Placement | Valid bodies rejected | Undeclared fields caught |
| --- | --- | --- |
| Root schema only | 0 of 4 | **1 of 4** |
| Every schema in the file | **2 of 4** | 4 of 4 |
| Computed — whole-object schemas only | 0 of 4 | 4 of 4 |

A single `unevaluatedProperties: false` at the root is not enough. It closes the
top-level object and nothing nested: annotations cross *composition*, not
*instance locations*, so it never sees inside `funds`, `parties` or
`fundSegments`.

### Catalogue inventory

Running `--suggest` across all 20 specs in `docs/specs/`:

| | Count |
| --- | --- |
| Schemas to close | 303 |
| Schemas to leave open | 102 |
| Dual-use occurrences needing a human | 15 |
| Distinct dual-use schemas | 7 |
| Specs that classify cleanly today | 9 of 20 |

The seven: `SystematicProgram` (4 specs), `Policy` (3), `PolicySummary` (3),
`TransactionAmountsFullSurrender` (2), `TransferNotificationBase`,
`notificationMetadata`, `BeneficiaryEventBase`.

## What to take away

1. **They are not interchangeable.** `additionalProperties` is a *lexical* check
   against sibling keywords. `unevaluatedProperties` is an *annotation* check
   against the whole composed result.
2. **`additionalProperties: false` is safe only on flat schemas** — no `allOf`,
   no `oneOf`/`anyOf`, no `$ref` fan-out, no `if/then` that introduces properties.
   Cases 01 and 06 are that world; 02 and 07 are not.
3. **`unevaluatedProperties: false` belongs at the composition root**, not on the
   building blocks. Put it on `Party`, never on `IndividualIdentity`. Run 1 vs
   Run 2 is that lesson.
4. **The status quo is not neutral.** Every strictness case (03, 04, 05, 08)
   passes today. Case 04 is the one to dwell on: a `requestedAmt` typo makes the
   segment match the "no amount specified" `oneOf` branch and the dollar figure
   is silently dropped.
5. **`unevaluatedProperties` requires OpenAPI 3.1.** It is a JSON Schema 2020-12
   keyword. Every spec in `docs/specs/` is already `openapi: 3.1.0`, so this is
   available to us — but tooling support is thinner than for
   `additionalProperties`, which is worth confirming with implementers.
6. **Both are breaking changes for senders**, not just a documentation tweak.
   Anything a partner sends today that isn't in the spec starts getting rejected.

## Caveat on `if` / `then` / `else` / `not`

By default the harness does **not** inject into conditional subschemas. Adding
`additionalProperties: false` inside an `if` changes when the condition *matches*,
silently rewriting a business rule rather than tightening a shape. Use
`--include-conditionals` if you want to demonstrate that failure mode.

Note also that in `TransactionAmounts` and `FundTransferRequest`, the `if/then`
blocks add *constraints*, not new properties — which is why case 06 is unaffected.
In a spec where a `then` introduces conditional properties,
`additionalProperties: false` on the parent would reject them and
`unevaluatedProperties: false` would not. That's a second, independent reason to
prefer `unevaluatedProperties`.

## Writing new cases

A case file is a plain JSON request body, with one optional reserved key:

```json
{
  "$case": {
    "name": "09 Whatever you're demonstrating",
    "note": "One paragraph on what this shows.",
    "expect": { "baseline": "pass", "additionalProperties": "fail", "unevaluatedProperties": "pass" }
  },
  "effectiveDate": "2026-10-01"
}
```

`$case` is stripped before validation. `expect` is optional; when present, a
mismatch is flagged in the report and the process exits non-zero — handy if you
want to pin this behaviour in CI.

To point the harness at a different spec:

```bash
node harness/run.mjs --spec docs/specs/policyinquiry_2.1.1.yaml --list
```

then pick a schema and a new cases directory.
