/**
 * Materializes x-df-enumOverrides on shared $ref components into inline schemas.
 *
 * Modified by Cursor
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'node:url';
import { parse, stringify } from 'yaml';
import { resolveSharedInternalRefs } from './shared-ref-resolve.js';
import { SPECS_SHARED_DIR, SPECS_SRC_DIR } from './spec-paths.js';

export const ENUM_OVERRIDE_EXTENSION = 'x-df-enumOverrides';

export type ComponentKind = 'schemas' | 'parameters' | 'headers' | 'responses';

export interface EnumOverrideRule {
  pointer: string;
  add?: (string | number)[];
  remove?: (string | number)[];
  set?: (string | number)[];
}

export interface EnumOverrideIssue {
  specFile: string;
  componentPath: string;
  message: string;
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function getJsonPointer(doc: unknown, pointer: string): unknown {
  const parts = pointer.replace(/^#\//, '').replace(/^\//, '').split('/').filter(Boolean);
  let current: unknown = doc;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

export function setJsonPointer(doc: unknown, pointer: string, value: unknown): void {
  const parts = pointer.replace(/^#\//, '').replace(/^\//, '').split('/').filter(Boolean);
  if (parts.length === 0) {
    throw new Error('Empty JSON Pointer');
  }

  let current: unknown = doc;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (current === null || typeof current !== 'object') {
      throw new Error(`Cannot traverse pointer ${pointer} at segment ${part}`);
    }
    const obj = current as Record<string, unknown>;
    if (!(part in obj)) {
      obj[part] = {};
    }
    current = obj[part];
  }

  const last = parts[parts.length - 1];
  if (current === null || typeof current !== 'object') {
    throw new Error(`Cannot set pointer ${pointer}`);
  }
  (current as Record<string, unknown>)[last] = value;
}

export function mergeEnumValues(
  baseEnum: (string | number)[],
  rule: EnumOverrideRule
): (string | number)[] {
  if (rule.set !== undefined) {
    if (rule.set.length === 0) {
      throw new Error('enum override "set" must be a non-empty array');
    }
    return [...rule.set];
  }

  const removeSet = new Set(rule.remove ?? []);
  let result = baseEnum.filter(v => !removeSet.has(v));

  for (const r of rule.remove ?? []) {
    if (!baseEnum.includes(r)) {
      throw new Error(`cannot remove enum value not in shared definition: ${String(r)}`);
    }
  }

  for (const a of rule.add ?? []) {
    if (!result.includes(a)) {
      result.push(a);
    }
  }

  return result;
}

export function parseEnumOverrideRules(value: unknown): EnumOverrideRule[] {
  if (!Array.isArray(value)) {
    throw new Error(`${ENUM_OVERRIDE_EXTENSION} must be an array`);
  }

  return value.map((entry, index) => {
    if (!entry || typeof entry !== 'object') {
      throw new Error(`${ENUM_OVERRIDE_EXTENSION}[${index}] must be an object`);
    }
    const obj = entry as Record<string, unknown>;
    if (typeof obj.pointer !== 'string' || obj.pointer.length === 0) {
      throw new Error(`${ENUM_OVERRIDE_EXTENSION}[${index}] requires non-empty "pointer"`);
    }

    const rule: EnumOverrideRule = { pointer: obj.pointer };
    if (obj.add !== undefined) {
      rule.add = normalizeEnumList(obj.add, 'add', index);
    }
    if (obj.remove !== undefined) {
      rule.remove = normalizeEnumList(obj.remove, 'remove', index);
    }
    if (obj.set !== undefined) {
      rule.set = normalizeEnumList(obj.set, 'set', index);
    }

    if (rule.add === undefined && rule.remove === undefined && rule.set === undefined) {
      throw new Error(
        `${ENUM_OVERRIDE_EXTENSION}[${index}] requires at least one of add, remove, or set`
      );
    }

    return rule;
  });
}

function normalizeEnumList(
  value: unknown,
  field: string,
  index: number
): (string | number)[] {
  if (!Array.isArray(value)) {
    throw new Error(`${ENUM_OVERRIDE_EXTENSION}[${index}].${field} must be an array`);
  }
  return value as (string | number)[];
}

export function resolveExternalRef(
  ref: string,
  specsSrcDir: string = SPECS_SRC_DIR
): unknown {
  const hashIndex = ref.indexOf('#');
  const filePart = hashIndex >= 0 ? ref.slice(0, hashIndex) : ref;
  const pointer = hashIndex >= 0 ? ref.slice(hashIndex) : '#/';

  let filePath = filePart;
  if (filePart.startsWith('file://')) {
    filePath = fileURLToPathSafe(filePart);
  } else if (!path.isAbsolute(filePart)) {
    filePath = path.resolve(specsSrcDir, filePart);
  } else if (!fs.existsSync(filePath)) {
    const underShared = path.join(SPECS_SHARED_DIR, path.basename(filePart));
    if (fs.existsSync(underShared)) {
      filePath = underShared;
    }
  }

  if (!fs.existsSync(filePath)) {
    throw new Error(`Shared fragment not found for $ref: ${ref}`);
  }

  const doc = parse(fs.readFileSync(filePath, 'utf8')) as unknown;
  const target = getJsonPointer(doc, pointer);
  if (target === undefined) {
    throw new Error(`JSON Pointer ${pointer} not found in ${filePath}`);
  }

  return resolveSharedInternalRefs(deepClone(target));
}

function fileURLToPathSafe(url: string): string {
  return fileURLToPath(url);
}

function extractEnumFromNode(node: unknown): (string | number)[] | undefined {
  if (!node || typeof node !== 'object') {
    return undefined;
  }
  const obj = node as Record<string, unknown>;
  if (Array.isArray(obj.enum)) {
    return obj.enum as (string | number)[];
  }
  return undefined;
}

export function applyEnumOverrideRules(
  component: unknown,
  rules: EnumOverrideRule[]
): unknown {
  const merged = deepClone(component);

  for (const rule of rules) {
    const targetNode = getJsonPointer(merged, rule.pointer);
    if (targetNode === undefined) {
      throw new Error(`enum override pointer does not resolve: ${rule.pointer}`);
    }

    const baseEnum = extractEnumFromNode(targetNode);
    if (!baseEnum) {
      throw new Error(`enum override pointer has no enum: ${rule.pointer}`);
    }

    const finalEnum = mergeEnumValues(baseEnum, rule);
    const nodeObj = targetNode as Record<string, unknown>;
    nodeObj.enum = finalEnum;
  }

  return merged;
}

function isRefWithEnumOverrides(entry: unknown): entry is {
  $ref: string;
  [ENUM_OVERRIDE_EXTENSION]: unknown;
} {
  if (!entry || typeof entry !== 'object') {
    return false;
  }
  const obj = entry as Record<string, unknown>;
  return typeof obj.$ref === 'string' && obj[ENUM_OVERRIDE_EXTENSION] !== undefined;
}

export function applyEnumOverridesToOpenApiDoc(
  doc: Record<string, unknown>,
  specFile: string,
  specsSrcDir: string = SPECS_SRC_DIR
): { doc: Record<string, unknown>; applied: number; issues: EnumOverrideIssue[] } {
  const issues: EnumOverrideIssue[] = [];
  const components = doc.components as Partial<Record<ComponentKind, Record<string, unknown>>> | undefined;
  if (!components) {
    return { doc, applied: 0, issues };
  }

  let applied = 0;

  for (const kind of ['schemas', 'parameters', 'headers', 'responses'] as ComponentKind[]) {
    const section = components[kind];
    if (!section) {
      continue;
    }

    for (const [name, entry] of Object.entries(section)) {
      if (!isRefWithEnumOverrides(entry)) {
        continue;
      }

      const componentPath = `components.${kind}.${name}`;

      try {
        const rules = parseEnumOverrideRules(entry[ENUM_OVERRIDE_EXTENSION]);
        const resolved = resolveExternalRef(entry.$ref, specsSrcDir);
        const inlined = applyEnumOverrideRules(resolved, rules);
        section[name] = inlined;
        applied++;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        issues.push({ specFile, componentPath, message });
      }
    }
  }

  return { doc, applied, issues };
}

export function applyEnumOverridesToYamlContent(
  content: string,
  specFile: string,
  specsSrcDir: string = SPECS_SRC_DIR
): { yaml: string; applied: number; issues: EnumOverrideIssue[] } {
  const doc = parse(content) as Record<string, unknown>;
  const { doc: next, applied, issues } = applyEnumOverridesToOpenApiDoc(doc, specFile, specsSrcDir);

  const yaml = stringify(next, {
    lineWidth: 0,
    defaultKeyType: 'PLAIN',
    defaultStringType: 'QUOTE_DOUBLE'
  });

  return { yaml, applied, issues };
}
