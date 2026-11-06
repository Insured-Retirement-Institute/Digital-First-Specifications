/**
 * Loads shared *_v1.yaml fragments and compares spec components for structural equality.
 *
 * Modified by Cursor
 */

import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'yaml';
import {
  sharedRef,
  STANDARD_ERROR_RESPONSE_SET,
  type ComponentKind
} from './shared-component-registry.js';
import { SHARED_SPECS_BASE_PLACEHOLDER } from './shared-ref-base.js';
import { SPECS_SHARED_DIR } from './spec-paths.js';

export type CanonicalSharedEntry = {
  kind: ComponentKind;
  name: string;
  fileName: string;
  ref: string;
  canonical: unknown;
};

const V1_FILE_PATTERN = /^(.+)_v1\.ya?ml$/i;

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }
  if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      sorted[key] = sortKeysDeep(obj[key]);
    }
    return sorted;
  }
  return value;
}

/** OpenAPI components often differ only by description text; ignore for equivalence. */
function stripDescriptions(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripDescriptions);
  }
  if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const stripped: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(obj)) {
      if (key === 'description') {
        continue;
      }
      stripped[key] = stripDescriptions(child);
    }
    return stripped;
  }
  return value;
}

function normalizeForCompare(value: unknown): unknown {
  return sortKeysDeep(stripDescriptions(value));
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(normalizeForCompare(value));
}

export function structurallyEqual(a: unknown, b: unknown): boolean {
  return stableStringify(a) === stableStringify(b);
}

function listSharedV1Files(): string[] {
  return fs
    .readdirSync(SPECS_SHARED_DIR)
    .filter(name => V1_FILE_PATTERN.test(name))
    .sort();
}

function getJsonPointer(doc: unknown, pointer: string): unknown {
  const parts = pointer.replace(/^#\//, '').split('/').filter(Boolean);
  let current: unknown = doc;
  for (const part of parts) {
    if (!current || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function resolveSharedInternalRefs(value: unknown, baseDir: string = SPECS_SHARED_DIR): unknown {
  if (Array.isArray(value)) {
    return value.map(item => resolveSharedInternalRefs(item, baseDir));
  }

  if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if (typeof obj.$ref === 'string' && obj.$ref.startsWith('./')) {
      const hashIndex = obj.$ref.indexOf('#');
      const relativeFile = hashIndex >= 0 ? obj.$ref.slice(0, hashIndex) : obj.$ref;
      const pointer = hashIndex >= 0 ? obj.$ref.slice(hashIndex) : '';
      const filePath = path.join(baseDir, relativeFile.replace(/^\.\//, ''));
      const doc = parse(fs.readFileSync(filePath, 'utf8')) as unknown;
      const target = pointer ? getJsonPointer(doc, pointer) : doc;
      return resolveSharedInternalRefs(target, baseDir);
    }

    const resolved: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(obj)) {
      resolved[key] = resolveSharedInternalRefs(child, baseDir);
    }
    return resolved;
  }

  return value;
}

/**
 * Index of shared v1 components (refs resolved within docs/specs/shared/) keyed by `kind:name`.
 */
export async function buildSharedV1Index(): Promise<Map<string, CanonicalSharedEntry>> {
  const index = new Map<string, CanonicalSharedEntry>();

  for (const fileName of listSharedV1Files()) {
    const filePath = path.join(SPECS_SHARED_DIR, fileName);
    const doc = parse(fs.readFileSync(filePath, 'utf8')) as {
      components?: Partial<Record<ComponentKind, Record<string, unknown>>>;
    };
    const components = doc.components;

    if (!components) {
      continue;
    }

    for (const kind of ['schemas', 'parameters', 'headers', 'responses'] as ComponentKind[]) {
      const section = components[kind];
      if (!section) {
        continue;
      }

      for (const [name, definition] of Object.entries(section)) {
        const key = `${kind}:${name}`;
        index.set(key, {
          kind,
          name,
          fileName,
          ref: `${SHARED_SPECS_BASE_PLACEHOLDER}/${fileName}#/components/${kind}/${name}`,
          canonical: resolveSharedInternalRefs(definition)
        });
      }
    }
  }

  const correlationHeader = index.get('parameters:CorrelationIdHeader');
  if (correlationHeader) {
    index.set('parameters:correlationId', {
      ...correlationHeader,
      name: 'correlationId',
      ref: `${SHARED_SPECS_BASE_PLACEHOLDER}/CorrelationIdHeader_v1.yaml#/components/parameters/CorrelationIdHeader`
    });
  }

  return index;
}

export type ErrorSchemaVariant = 'v1' | 'v2' | 'v3' | 'other' | 'absent';

let cachedErrorV2: unknown | undefined;
let cachedErrorV3: unknown | undefined;

export async function loadErrorVariantSchemas(): Promise<void> {
  for (const file of ['Error_v2.yaml', 'Error_v3.yaml']) {
    const filePath = path.join(SPECS_SHARED_DIR, file);
    if (!fs.existsSync(filePath)) {
      continue;
    }
    const doc = parse(fs.readFileSync(filePath, 'utf8')) as {
      components?: { schemas?: { Error?: unknown } };
    };
    const error = doc.components?.schemas?.Error;
    if (file === 'Error_v2.yaml') {
      cachedErrorV2 = error;
    } else {
      cachedErrorV3 = error;
    }
  }
}

export function classifyErrorSchema(
  errorDefinition: unknown,
  index: Map<string, CanonicalSharedEntry>
): ErrorSchemaVariant {
  if (!errorDefinition || typeof errorDefinition !== 'object') {
    return 'absent';
  }

  const v1 = index.get('schemas:Error')?.canonical;

  if (v1 && structurallyEqual(errorDefinition, v1)) {
    return 'v1';
  }
  if (cachedErrorV2 && structurallyEqual(errorDefinition, cachedErrorV2)) {
    return 'v2';
  }
  if (cachedErrorV3 && structurallyEqual(errorDefinition, cachedErrorV3)) {
    return 'v3';
  }
  return 'other';
}

export function isStandardErrorResponseName(name: string): boolean {
  return STANDARD_ERROR_RESPONSE_SET.has(name);
}

/**
 * Whether this component should stay inline (Error v2/v3 family and their standard responses).
 */
export function keepsInlineErrorFamily(
  errorVariant: ErrorSchemaVariant,
  kind: ComponentKind,
  name: string
): boolean {
  if (errorVariant !== 'v2' && errorVariant !== 'v3') {
    return false;
  }

  if (kind === 'schemas' && name === 'Error') {
    return true;
  }

  if (kind === 'responses' && isStandardErrorResponseName(name)) {
    return true;
  }

  return false;
}

/**
 * Resolve a shared v1 $ref for a component, or null to keep inline.
 */
export function resolveSharedV1Replacement(
  kind: ComponentKind,
  name: string,
  definition: unknown,
  index: Map<string, CanonicalSharedEntry>,
  errorVariant: ErrorSchemaVariant
): string | null {
  if (isOnlyExternalSharedRef(definition)) {
    return normalizeSharedRef((definition as { $ref: string }).$ref);
  }

  if (keepsInlineErrorFamily(errorVariant, kind, name)) {
    return null;
  }

  if (kind === 'schemas' && name === 'Error') {
    if (errorVariant === 'v1') {
      return index.get('schemas:Error')?.ref ?? sharedRef('schemas', 'Error', 1);
    }
    return null;
  }

  if (kind === 'responses' && isStandardErrorResponseName(name)) {
    if (errorVariant === 'v1') {
      const entry = index.get(`responses:${name}`);
      if (entry && structurallyEqual(definition, entry.canonical)) {
        return entry.ref;
      }
    }
    return null;
  }

  const key = `${kind}:${name}`;
  const entry = index.get(key);
  if (!entry) {
    return null;
  }

  if (structurallyEqual(definition, entry.canonical)) {
    return entry.ref;
  }

  return null;
}

function isOnlyExternalSharedRef(definition: unknown): boolean {
  if (!definition || typeof definition !== 'object') {
    return false;
  }
  const keys = Object.keys(definition as object);
  if (keys.length !== 1 || keys[0] !== '$ref') {
    return false;
  }
  const ref = (definition as { $ref: string }).$ref;
  return ref.includes('shared/') || ref.includes(SHARED_SPECS_BASE_PLACEHOLDER);
}

function normalizeSharedRef(ref: string): string {
  if (ref.includes(SHARED_SPECS_BASE_PLACEHOLDER)) {
    return ref;
  }
  const match = ref.match(/\/([^/]+_v\d+\.ya?ml#\/components\/(?:schemas|parameters|headers|responses)\/[A-Za-z0-9_]+)$/);
  if (match) {
    return `${SHARED_SPECS_BASE_PLACEHOLDER}/${match[1]}`;
  }
  return ref;
}

export function applySharedReplacements(
  api: Record<string, unknown>,
  index: Map<string, CanonicalSharedEntry>
): { api: Record<string, unknown>; replaced: number } {
  const components = (api.components ?? {}) as Partial<
    Record<ComponentKind, Record<string, unknown>>
  >;

  const errorSection = components.schemas;
  const errorVariant = classifyErrorSchema(errorSection?.Error, index);

  let replaced = 0;
  const nextComponents: Partial<Record<ComponentKind, Record<string, unknown>>> = {};

  for (const kind of ['schemas', 'parameters', 'headers', 'responses'] as ComponentKind[]) {
    const section = components[kind];
    if (!section) {
      continue;
    }

    nextComponents[kind] = {};

    for (const [name, definition] of Object.entries(section)) {
      const sharedRef = resolveSharedV1Replacement(kind, name, definition, index, errorVariant);
      if (sharedRef) {
        nextComponents[kind]![name] = { $ref: sharedRef };
        replaced++;
      } else {
        nextComponents[kind]![name] = definition;
      }
    }
  }

  return {
    api: {
      ...api,
      components: {
        ...(api.components as Record<string, unknown>),
        ...nextComponents
      }
    },
    replaced
  };
}
