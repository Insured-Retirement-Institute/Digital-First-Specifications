# Managing API Documentation with GitHub Pages and Swagger UI

This document explains how to manage multiple API documentation pages using GitHub Pages and Swagger UI.

## Table of Contents
- [Overview](#overview)
- [Directory Structure](#directory-structure)
- [How the Site Works](#how-the-site-works)
- [Adding New API Documentation](#adding-new-api-documentation)
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
│   ├── appstatusv1.yaml
│   ├── appstatusv2.yaml
│   └── ...              # All OpenAPI specification files
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
```

Validate every spec in `docs/specs/` against the OpenAPI 3.1 schema:

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
| `Validate OpenAPI specs` | Runs `npm run validate:specs`. |
| `Build data dictionary` | Runs `npm run build:dictionary`, then packages `docs/` exactly as the publish workflow does. Attaches the built site to the workflow run as a downloadable `data-dictionary-preview` artifact, so you can inspect the generated dictionary before approving the merge. |

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
