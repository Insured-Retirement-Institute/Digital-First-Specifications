/**
 * Resolves relative $ref inside docs/specs/shared/ fragment files.
 *
 * Modified by Cursor
 */

import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'yaml';
import { SPECS_SHARED_DIR } from './spec-paths.js';

export function getJsonPointer(doc: unknown, pointer: string): unknown {
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

export function resolveSharedInternalRefs(value: unknown, baseDir: string = SPECS_SHARED_DIR): unknown {
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
