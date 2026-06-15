# Managing API Documentation with GitHub Pages and Swagger UI

This document explains how to manage multiple API documentation pages using GitHub Pages and Swagger UI.

## Table of Contents
- [Overview](#overview)
- [Directory Structure](#directory-structure)
- [How the Site Works](#how-the-site-works)
- [Adding New API Documentation](#adding-new-api-documentation)
- [Adding Versioned API Documentation](#adding-versioned-api-documentation)
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

**[`index.html`](index.html)** is the API catalog. It displays a card for each available API with links to its documentation. When a user clicks "View Documentation," they are sent to `api-viewer.html` with query parameters identifying the API and version (e.g. `api-viewer.html?api=appstatus.yaml&version=v2`).

**[`api-viewer.html`](api-viewer.html)** is the Swagger UI viewer. It reads the `api` and `version` query parameters from the URL, looks up the corresponding spec file path in the `apiDefinitions` object, and renders it using Swagger UI. It also provides API and version selector dropdowns for switching between specs without returning to the catalog.

## Adding New API Documentation

To add a new API specification:

1. Add your OpenAPI YAML file to the `docs/specs/` directory.

2. Add an entry to the `apiDefinitions` object in [`api-viewer.html`](api-viewer.html):

```javascript
const apiDefinitions = {
  // ... existing entries ...
  "your-api.yaml": {
    name: "Your API Name",
    versions: {
      "v1": { path: "specs/your-api.yaml", displayName: "v1.0.0" }
    }
  }
};
```

3. Add an `<option>` to the API selector dropdown in [`api-viewer.html`](api-viewer.html):

```html
<select id="api-selector" onchange="loadSelectedAPI()">
  <!-- existing options -->
  <option value="your-api.yaml">Your API Name</option>
</select>
```

4. Add a card to the API grid in [`index.html`](index.html):

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
                <li><a href="api-viewer.html?api=your-api.yaml&version=v1">v1.0.0</a></li>
            </ul>
            <span>Previous Versions:</span>
        </div>
    </div>
    <a href="api-viewer.html?api=your-api.yaml&version=v1" class="btn btn-primary">View Documentation</a>
</div>
```

## Adding Versioned API Documentation

To add a new version of an existing API:

1. Add the new version's YAML file to `docs/specs/` (e.g. `your-api-v2.yaml`).

2. Add the new version to the existing entry in the `apiDefinitions` object in [`api-viewer.html`](api-viewer.html):

```javascript
"your-api.yaml": {
  name: "Your API Name",
  versions: {
    "v1": { path: "specs/your-api.yaml", displayName: "v1.0.0" },
    "v2": { path: "specs/your-api-v2.yaml", displayName: "v2.0.0" }
  }
}
```

The version selector in `api-viewer.html` will automatically appear when multiple versions are available for an API.

3. Update the card in [`index.html`](index.html) to show the new active version and move the old version to "Previous Versions":

```html
<span>Active Version:</span>
<ul>
    <li><a href="api-viewer.html?api=your-api.yaml&version=v2">v2.0.0</a></li>
</ul>
<span>Previous Versions:</span>
<ul>
    <li><a href="api-viewer.html?api=your-api.yaml&version=v1">v1.0.0</a></li>
</ul>
```

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
