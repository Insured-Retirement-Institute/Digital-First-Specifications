# Shared Component Versioning

<!-- Modified by Cursor -->

How shared OpenAPI fragments under `docs/specs/shared/` are versioned, how specs adopt new versions at different paces, and how tooling tracks pins.

Related: [`CONTRIBUTING.md`](../CONTRIBUTING.md#shared-component-versioning), [`SHARED-COMPONENT-DECISIONS.md`](SHARED-COMPONENT-DECISIONS.md), [`scripts/shared-component-registry.ts`](../../scripts/shared-component-registry.ts).

## Principles

1. **Version is in the filename**, not inferred at bundle time. Each src spec `$ref` names the exact file, e.g. `PolicyNumber_v1.yaml` or `PolicyNumber_v2.yaml`.
2. **Specs move independently.** One API can stay on `_v1` while another adopts `_v2`; bundling resolves each src file separately.
3. **Never make breaking edits to an published `_vN` file.** Add `{ComponentName}_v{N+1}.yaml` and migrate specs one at a time.
4. **Non-breaking edits to `_v1` are allowed** (optional fields, relaxed constraints) and benefit all specs still on v1.
5. **OpenAPI component keys stay stable** (`PolicyNumber`, `Error`, …). Only the shared **file** suffix changes (`_v1`, `_v2`).

## File naming

| Pattern | Example |
|---------|---------|
| First extraction | `IndividualIdentity_v1.yaml` → `components.schemas.IndividualIdentity` |
| Breaking change | `IndividualIdentity_v2.yaml` → same component key, new shape |
| Cross-refs inside `shared/` | `./Error_v2.yaml#/components/schemas/Error` (match the version you depend on) |

## Src spec `$ref` (portable)

```yaml
components:
  parameters:
    PolicyNumber:
      $ref: '${SHARED_SPECS_BASE}/PolicyNumber_v1.yaml#/components/parameters/PolicyNumber'
```

Upgrading one spec to v2 is a **src-only change**:

```yaml
    PolicyNumber:
      $ref: '${SHARED_SPECS_BASE}/PolicyNumber_v2.yaml#/components/parameters/PolicyNumber'
```

`${SHARED_SPECS_BASE}` controls **where** fragments load from (local path, GitHub Pages, pinned git tag). It does **not** select the version — the filename does.

## Breaking vs non-breaking changes

| Change | Action |
|--------|--------|
| Add optional property | Edit `_v1` in place |
| Add enum value (backward compatible for readers) | Usually edit `_v1`; confirm with API owners |
| Rename/remove property, tighten `required`, stricter pattern | Create `_v2`, migrate specs individually |
| Error schema alignment (README) | Create/use `Error_v1`; debt specs stay inline until governance PR |

Record breaking shared releases in [`SHARED-COMPONENT-DECISIONS.md`](SHARED-COMPONENT-DECISIONS.md) and the upgrading spec’s PR description.

## Registry and automation

[`scripts/shared-component-registry.ts`](../../scripts/shared-component-registry.ts) lists every shared file and which specs may use it:

- **`SHARED_COMPONENT_REGISTRY`** — all `{ kind, name, version, fileName }` entries (multiple rows per component when v2 exists).
- **`SPEC_SHARED_VERSIONS`** — optional per-spec pins, e.g. `'FundTransfer_3.0.0.yml': { 'parameters:PolicyNumber': 2 }`. Unpinned specs default to **v1**.
- **`shouldUseSharedComponent`** — whether a spec uses a shared fragment at all (allowlists, error-debt exceptions).
- **`resolveSharedRef(spec, kind, name)`** — combines allowlist + version pin → `$ref` string for `apply:shared`.

Automation **never** upgrades a spec to v2 implicitly. `npm run apply:shared` writes refs from the registry pins; hand-edited `$ref`s in src are authoritative.

## Upgrade workflow (breaking shared change)

1. Add `docs/specs/shared/{Component}_v2.yaml` (leave `_v1` unchanged).
2. Register v2 in `SHARED_COMPONENT_REGISTRY`.
3. Add cross-refs in new shared files (e.g. `BadRequestError_v2.yaml` → `./Error_v2.yaml`).
4. Set `SPEC_SHARED_VERSIONS` for specs ready to adopt v2 (or edit src `$ref`s manually).
5. Run `npm run apply:shared`, `npm run bundle:specs`, `npm run validate:specs`.
6. Run `npm run report:shared-versions` to list v1 vs v2 usage across src specs.
7. When no src spec references `_v1`, mark v1 deprecated; remove in a later cleanup PR.

## Working-group repos

Working groups copy `docs/specs/src/<spec>.yaml` and either:

- Point `SHARED_SPECS_BASE` at a **pinned** URL (tag or commit) that includes the `_vN` files they need, or
- Copy `docs/specs/shared/` locally and keep `$ref`s on `_v1` until they choose to upgrade.

They are not forced to adopt `_v2` when this repo adds it.

## Tooling commands

| Command | Purpose |
|---------|---------|
| `npm run inventory:components` | Duplicate inline components across published specs |
| `npm run report:shared-versions` | Which shared `_vN` file each src spec references |
| `npm run apply:shared` | Apply registry pins to src (respects version map) |

## Error component versions

| File | Semantics | When to use |
|------|-----------|-------------|
| `Error_v1.yaml` | README Standard Error Schema (`userMessage`, body `correlationId`, …) | New specs and governance-approved upgrades |
| `Error_v2.yaml` | Transaction-style subset (Category A) | Existing transaction APIs not yet on README shape |
| `Error_v3.yaml` | App-status-style subset (Category B) | App Status REST + Push v2 APIs not yet on README shape |

Both can coexist indefinitely. Upgrading a spec from `Error_v2` → `Error_v1` is a **breaking API change** and requires a spec version bump plus governance approval. Do not replace `Error_v2.yaml` in place when transaction APIs still depend on it.

Standard `*Error_vN` response files must reference the matching Error version (`BadRequestError_v2.yaml` → `./Error_v2.yaml`).
