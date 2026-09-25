<!-- Modified by Cursor: shared-components migration conventions (2026-09-24) -->
# Managing API Documentation with GitHub Pages and Swagger UI

This document explains how to manage multiple API documentation pages using GitHub Pages and Swagger UI.

## Table of Contents
- [Overview](#overview)
- [Directory Structure](#directory-structure)
- [How the Site Works](#how-the-site-works)
- [Adding New API Documentation](#adding-new-api-documentation)
- [Shared components and bundling](#shared-components-and-bundling)
- [Adding Versioned API Documentation](#adding-versioned-api-documentation)
- [Validating Specifications](#validating-specifications)
- [Publishing to GitHub Pages](#publishing-to-github-pages)
- [Customizing the UI](#customizing-the-ui)

## Overview

This project uses GitHub Pages to host API documentation generated with Swagger UI. The setup allows for:
- Multiple API specifications to be hosted on a single site
- API versioning support
- Simple navigation between different APIs
- Consistent styling across all documentation

## Directory Structure

```
docs/
├── index.html           # API catalog landing page
├── api-viewer.html      # Swagger UI viewer (loads and renders specs)
├── css/
│   └── custom.css       # Custom styling
├── specs/
│   ├── shared/          # Reusable OpenAPI component fragments ($ref targets)
│   ├── src/             # Modular source specs (edit these when using shared components)
│   ├── appstatusv1.yaml # Published specs (Swagger UI loads these paths)
│   ├── appstatusv2.yaml
│   └── ...              # Bundled or standalone OpenAPI files
└── favicon.png          # Site favicon
```

## How the Site Works

The site is split into two pages:

**[`index.html`](index.html)** is the API catalog. It displays a card for each available API. Version links and the "View Documentation" button send users to `api-viewer.html` with query parameters identifying the API and version (e.g. `api-viewer.html?api=appstatus&version=v2`).

Each catalog card must include one link with `class="active-version"` (under Active Version, or under In-Review when there is no active release). On page load, a small script copies that link's `href` onto the card's View Documentation button (`a.view-docs`).

**[`api-viewer.html`](api-viewer.html)** is the Swagger UI viewer. It reads the `api` and `version` query parameters from the URL, looks up the corresponding spec file path in the `apiDefinitions` object, and renders it using Swagger UI. It also provides API and version selector dropdowns for switching between specs without returning to the catalog.

Important details about `apiDefinitions`:

- The **API key** (dropdown `value`, object key, and `?api=` query param) is an opaque catalog ID.
- The actual OpenAPI file is only referenced under `versions.*.path` (e.g. `specs/appstatusv3.yaml`) in **[`api-viewer.html`](api-viewer.html)**.
- List versions **oldest → newest**. When the API dropdown changes, the viewer rebuilds the version list and selects the **last** (newest) version by default.
- Legacy bookmarks that still use `?api=foo.yaml` are accepted by stripping the `.yaml` suffix.

## Adding New API Documentation

To add a new API specification:

1. Add your OpenAPI YAML file to the `docs/specs/` directory.

2. Add an entry to the `apiDefinitions` object in [`api-viewer.html`](api-viewer.html). Use a short ID without `.yaml` as the key; put the real filename only in `path`:

```javascript
const apiDefinitions = {
  // ... existing entries ...
  "your-api": {
    name: "Your API Name",
    versions: {
      "v1": { path: "specs/your-api.yaml", displayName: "v1.0.0" }
    }
  }
};
```

3. Add an `<option>` to the API selector dropdown in [`api-viewer.html`](api-viewer.html). The `value` must match the `apiDefinitions` key exactly:

```html
<select id="api-selector" onchange="onApiChange()">
  <!-- existing options -->
  <option value="your-api">Your API Name</option>
</select>
```

4. Add a card to the API grid in [`index.html`](index.html). Mark the active version link with `class="active-version"` and leave the View Documentation button as `href="#"`:

```html
<div class="api-card">
    <div class="api-card-header">
        <h3>Your API Name</h3>
    </div>
    <p>Short description of the API.</p>
    <div class="api-versions-container">
        <div class="api-versions">
            <span>Active Version:</span>
            <ul>
                <li><a class="active-version" href="api-viewer.html?api=your-api&version=v1">v1.0.0</a></li>
            </ul>
            <span>Previous Versions:</span>
        </div>
    </div>
    <!-- This href is replaced with the 'active-version' spec on page load -->
    <a href="#" class="btn btn-primary view-docs">View Documentation</a>
</div>
```

5. Ideally, validate the new spec before opening a pull request — see [Validating Specifications](#validating-specifications).  If this is not possible, verify the validation passes in the pull request (visible at the bottom of the _Conversation_ tab in the pull request)

## Shared components and bundling

Several specs define the same objects (for example the standard `Error` schema, `correlationId` header, and party identity schemas). Maintain those once under `docs/specs/shared/` and reference them from modular sources in `docs/specs/src/`.

### Portable `$ref`s with `SHARED_SPECS_BASE`

Source specs use a **placeholder** so the same file works in this repo and in working-group repos that copy specs in before merge:

```yaml
components:
  parameters:
    PolicyNumber:
      $ref: '${SHARED_SPECS_BASE}/PolicyNumber_v1.yaml#/components/parameters/PolicyNumber'
```

### Shared file naming (`{ComponentName}_vN.yaml`)

| Rule | Example |
|------|---------|
| One OpenAPI component per file | `Error_v1.yaml`, `PolicyNumber_v1.yaml` |
| File name = component key + `_vN` | Component `IndividualIdentity` → `IndividualIdentity_v1.yaml`; breaking change → `IndividualIdentity_v2.yaml` |
| OpenAPI component key unchanged | File is `IndividualIdentity_v2.yaml`; key remains `IndividualIdentity` under `components.schemas` |
| Child-only objects | Keep inline in the parent file (e.g. `validationErrors.items` inside `Error_v1.yaml`) |
| Cross-file refs inside `shared/` | Relative paths at the **same version** (e.g. `./Error_v2.yaml` from `BadRequestError_v2.yaml`) |

Specs with non-standard inline error models are tracked in [`specs/ERROR-SCHEMA-DEBT.md`](specs/ERROR-SCHEMA-DEBT.md). During migration those specs **keep inline `Error` / `ErrorResponse`** and do not `$ref` `Error_v1` until upgraded in a separate PR.

### Shared component versioning

Each src spec **pins** the shared file version in its `$ref` path. Bundling does not pick “latest” — it resolves exactly the file named in the ref.

```yaml
# Older spec stays on v1
PolicyNumber:
  $ref: '${SHARED_SPECS_BASE}/PolicyNumber_v1.yaml#/components/parameters/PolicyNumber'

# Newer spec adopts v2 when ready
PolicyNumber:
  $ref: '${SHARED_SPECS_BASE}/PolicyNumber_v2.yaml#/components/parameters/PolicyNumber'
```

Both `{Component}_v1.yaml` and `{Component}_v2.yaml` coexist under `docs/specs/shared/`. Specs upgrade individually; working-group repos can stay on `_v1` via pinned `$ref`s or a pinned `SHARED_SPECS_BASE` URL.

| Change type | What to do |
|-------------|------------|
| Non-breaking (optional field, relaxed constraint) | Edit `_v1` in place |
| Breaking (rename/remove field, tighter rules) | Add `_v2`; migrate specs one PR at a time; **do not** mutate `_v1` |

Automation: [`scripts/shared-component-registry.ts`](../scripts/shared-component-registry.ts) tracks available versions and optional **per-spec version pins** (`SPEC_SHARED_VERSIONS`). `npm run apply:shared` writes `$ref`s from those pins (default **v1**). Hand-edited src refs always win.

Full policy, upgrade checklist, and working-group notes: [`specs/SHARED-COMPONENT-VERSIONING.md`](specs/SHARED-COMPONENT-VERSIONING.md).

```bash
npm run report:shared-versions   # list _vN usage per src spec
```

Each API-family migration should be reviewed before the next (shared refs, bundled output, Swagger UI paths unchanged).

| Environment | `SHARED_SPECS_BASE` | Resolves to |
|-------------|---------------------|-------------|
| **This repo (default)** | *(unset)* | Local `docs/specs/shared/` |
| **Working-group repo** | `https://specs.dfa.irionline.org/specs/shared` | Published shared fragments |
| **Pinned to a branch/tag** | `https://raw.githubusercontent.com/…/main/docs/specs/shared` | Exact Git revision |

Set the variable in your shell, CI, or a local `.env` (not committed):

```bash
export SHARED_SPECS_BASE=https://specs.dfa.irionline.org/specs/shared
npm run validate:specs
```

Bundling and validation expand `${SHARED_SPECS_BASE}` before OpenAPI parsing, then write preprocessed copies under `docs/specs/src/.build/` (gitignored). This repo does **not** need the variable in CI — the default local path is used automatically.

Working-group repos can copy `docs/specs/src/<spec>.yaml` plus the `scripts/` helpers (`shared-ref-base.ts`, `preprocess-source-spec.ts`, `spec-paths.ts`, `bundle-specs.ts`, `validate-specs.ts`) and either:

- **Reference the published URL** (no local `shared/` copy), or
- **Copy `docs/specs/shared/`** as well and leave `SHARED_SPECS_BASE` unset.

### Authoring workflow

1. Add or update reusable fragments in `docs/specs/shared/` as `{ComponentName}_vN.yaml` (add `_v2+` for breaking changes; do not break `_v1` in place).
2. Reference them from `docs/specs/src/<spec-name>.yaml` using `${SHARED_SPECS_BASE}/…`.
3. Bundle into the published single-file spec:

```bash
npm run bundle:specs
```

4. Validate and build:

```bash
npm run validate:specs
npm run build:dictionary
```

Specs not yet under `docs/specs/src/` remain standalone YAML files in `docs/specs/` and work unchanged. CI runs `bundle:specs` before validate/build.

Run `npm run inventory:components` to list duplicate component names across published specs and classify them as identical or conflicting (descriptions/examples stripped for comparison).

**Shared fragments currently available**

| File | Contents |
|------|----------|
| `shared/Error_v1.yaml` | Canonical README Standard Error Schema |
| `shared/Error_v2.yaml` | Transaction-style Error (Category A; 11 specs) |
| `shared/Error_v3.yaml` | App-status-style Error (Category B; 2 specs) |
| `shared/BadRequestError_v1.yaml` … `GatewayTimeoutError_v1.yaml` | Standard responses referencing `Error_v1` |
| `shared/BadRequestError_v2.yaml` … `GatewayTimeoutError_v2.yaml` | Standard responses referencing `Error_v2` |
| `shared/correlationId_v1.yaml` | `correlationId` response header |
| `shared/CorrelationIdHeader_v1.yaml` | `correlationId` request header parameter |
| `shared/PolicyNumber_v1.yaml` | `PolicyNumber` path parameter |
| `shared/AssociatedFirmId_v1.yaml` | `AssociatedFirmId` query parameter |
| `shared/FundDistribution_v1.yaml` | Fund distribution schema (withdrawal/systematic family) |
| `shared/PartyRelationship_v1.yaml` | Party relationship enum schema (13-spec variant) |
| `shared/IndividualIdentity_v1.yaml` | Individual identity schema (OTW / systematic update variant) |
| `shared/EntityIdentity_v1.yaml` | Entity identity schema (OTW / OTW quote variant) |
| `shared/PolicyProducer_v1.yaml` … `PolicyProducers_v1.yaml` | Policy inquiry producer schemas |
| `shared/ProducerCommission_v1.yaml`, `ProducerExternalIds_v1.yaml` | Policy inquiry producer child schemas |

Conflict-resolution choices for deferred components are recorded in [`specs/SHARED-COMPONENT-DECISIONS.md`](specs/SHARED-COMPONENT-DECISIONS.md).

Cross-references **within** `docs/specs/shared/` use relative paths (e.g. `./Error_v1.yaml`). Those resolve correctly when fragments are served from `https://specs.dfa.irionline.org/specs/shared/`.

### Deferred shared extractions (inventory conflicts)

Party/financial schemas not yet extracted (`Producer`, `Party`, `IndividualParty`, `EntityParty`, `RmdInfo`, `TaxWithholdingInstruction`, `Address`, `Bank`, and alternate `PartyRelationship` variants) remain **inline in src specs** — see [`specs/SHARED-COMPONENT-DECISIONS.md`](specs/SHARED-COMPONENT-DECISIONS.md).

## Adding Versioned API Documentation

To add a new version of an existing API:

1. Add the new version's YAML file to `docs/specs/` (e.g. `your-api-v2.yaml`).

2. Add the new version to the existing entry in the `apiDefinitions` object in [`api-viewer.html`](api-viewer.html), **after** older versions so newest is last:

```javascript
"your-api": {
  name: "Your API Name",
  versions: {
    "v1": { path: "specs/your-api.yaml", displayName: "v1.0.0" },
    "v2": { path: "specs/your-api-v2.yaml", displayName: "v2.0.0" }
  }
}
```

The version selector in `api-viewer.html` will automatically appear when multiple versions are available for an API. Switching APIs in the dropdown selects the newest version by default.

3. Update the card in [`index.html`](index.html) to show the new active version (with `class="active-version"`) and move the old version to "Previous Versions". You do not need to change the View Documentation button — it still uses `href="#"` and picks up the new active link on page load:

```html
<span>Active Version:</span>
<ul>
    <li><a class="active-version" href="api-viewer.html?api=your-api&version=v2">v2.0.0</a></li>
</ul>
<span>Previous Versions:</span>
<ul>
    <li><a href="api-viewer.html?api=your-api&version=v1">v1.0.0</a></li>
</ul>
```

4. Ideally, validate the new version before opening a pull request — see [Validating Specifications](#validating-specifications).  If this is not possible, verify the validation passes in the pull request (visible at the bottom of the _Conversation_ tab in the pull request)

## Validating Specifications

Specifications are validated automatically on every pull request, but you can — and should — run the same checks locally first.

### Running the checks locally

CI runs these on Node.js 20; any recent Node version works locally. Install dependencies once, then:

```bash
npm ci
npm run bundle:specs
```

Validate modular sources in `docs/specs/src/` and published specs in `docs/specs/` against the OpenAPI 3.1 schema:

```bash
npm run validate:specs
```

Each file reports `PASS` or `FAIL`, with the validation errors indented beneath any failure, and the command exits non-zero if any spec is invalid. All specs are validated in a single run, so one invocation shows the complete list rather than stopping at the first problem.

Regenerate the data dictionary to confirm your spec builds:

```bash
npm run build:dictionary
```

This writes generated files into `docs/` (`data-dictionary-*.json`, `data-dictionary-*.xlsx`, `data-dictionary.html`, and `data-dictionary-manifest.json`). They are build output — don't commit them.

### What runs on a pull request

The **PR Checks** workflow reports two independent checks on every pull request targeting `main`:

| Check | What it does |
|-------|--------------|
| `Validate OpenAPI specs` | Runs `npm run bundle:specs`, then `npm run validate:specs`. |
| `Build data dictionary` | Runs `npm run bundle:specs`, then `npm run build:dictionary`, then packages `docs/` exactly as the publish workflow does. Attaches the built site to the workflow run as a downloadable `data-dictionary-preview` artifact, so you can inspect the generated dictionary before approving the merge. |

The build check shares its Node setup and build command with the publish workflow, so a passing build on the pull request means the same build will behave identically when merged to `main`. Schema validation runs only on pull requests — it is intended to gate merges, not to block publication of specs that are already approved.

### Interpreting common validation errors

Failures come in two classes, and the message format tells you which you have:

- **Parse errors** — the YAML itself could not be read. These name the file, give `(line:column)`, and print the surrounding lines with a caret under the problem. A parse error fails the build check too, since the generator cannot read the file either.
- **Schema errors** — the YAML parsed fine, but the document does not satisfy the OpenAPI 3.1 schema. These reference a JSON path, with `~1` representing a `/` inside a path segment. Schema validation is stricter than what Swagger UI needs to render a page, so a spec that displays correctly can still fail here.

| Error | Class | Cause |
|-------|-------|-------|
| `duplicated mapping key (16:7)` | Parse | The same key appears twice in one mapping — commonly a copy-paste edit that adds a second `description`, `summary`, or response code instead of replacing the first. The coordinates point at the **second** occurrence, so delete that one and keep the original. |
| `.../description must be string`, usually paired with `... must match "else" schema` | Schema | A required key is present but has no value, so YAML parses it as null. For example, every Response Object requires a `description`. The paired `else` message is the schema saying "this isn't a `$ref`, so it must be a complete Response Object." |
| `#/ must NOT have unevaluated properties` | Schema | A key sits at the document root that OpenAPI doesn't define there — most often a mis-indented `license`, `contact`, or `termsOfService` that belongs under `info`. The message does not name the offending key, so check the indentation of your top-level keys. The same message on a nested path means the same thing at that level. |
| `... must match "else" schema` on its own | Schema | An inline (non-`$ref`) Response, Parameter, or Schema Object is missing a required field. |

## Publishing to GitHub Pages

To publish your API documentation to GitHub Pages:

1. Push your changes to the repository branch that's configured for GitHub Pages (currently `main`).  Note: Only the content in the `docs` directory is published.

2. View published docs at [specs.dfa.irionline.org](https://specs.dfa.irionline.org)

## Customizing the UI

You can customize the appearance of the documentation by:

1. Adding custom CSS in `docs/css/custom.css`
2. Modifying the Swagger UI configuration in [`api-viewer.html`](api-viewer.html):

```javascript
window.ui = SwaggerUIBundle({
  url: apiPath,
  dom_id: '#swagger-ui',
  deepLinking: true,
  presets: [
    SwaggerUIBundle.presets.apis,
    SwaggerUIStandalonePreset
  ],
  plugins: [
    SwaggerUIBundle.plugins.DownloadUrl
  ],
  layout: "StandaloneLayout",
  // Add customizations here:
  displayRequestDuration: true,
  defaultModelsExpandDepth: -1, // Hide the models by default
  filter: true // Enable filtering operations
});
```

For more customization options, refer to the [Swagger UI documentation](https://swagger.io/docs/open-source-tools/swagger-ui/usage/configuration/).
