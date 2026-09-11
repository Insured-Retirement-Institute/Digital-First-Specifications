/**
 * Resolves ${SHARED_SPECS_BASE} placeholders in modular OpenAPI sources.
 *
 * - This repo (default): local path ../shared → absolute path under docs/specs/shared
 * - Working-group repos: set SHARED_SPECS_BASE to a published URL, e.g.
 *   https://specs.dfa.irionline.org/specs/shared
 *
 * Modified by Cursor
 */

import * as path from 'path';
import { SPECS_SRC_DIR } from './spec-paths.js';

/** Placeholder used in docs/specs/src/*.yaml $ref values. */
export const SHARED_SPECS_BASE_PLACEHOLDER = '${SHARED_SPECS_BASE}';

const DEFAULT_SHARED_BASE = '../shared';

const PLACEHOLDER_PATTERN = /\$\{SHARED_SPECS_BASE\}/g;

/** Published GitHub Pages base for shared fragments (documented default for other repos). */
export const PUBLISHED_SHARED_SPECS_BASE =
  'https://specs.dfa.irionline.org/specs/shared';

function normalizeBase(base: string): string {
  return base.replace(/\/+$/, '');
}

/**
 * Raw base from SHARED_SPECS_BASE, or ../shared when unset.
 */
export function getSharedSpecsBase(): string {
  const fromEnv = process.env.SHARED_SPECS_BASE?.trim();
  return normalizeBase(fromEnv && fromEnv.length > 0 ? fromEnv : DEFAULT_SHARED_BASE);
}

/**
 * Base string written into $ref values before SwaggerParser resolves them.
 * Relative bases are resolved from docs/specs/src/.
 */
export function resolveSharedSpecsBaseForRefs(
  specsSrcDir: string = SPECS_SRC_DIR
): string {
  const base = getSharedSpecsBase();

  if (base.startsWith('http://') || base.startsWith('https://')) {
    return base;
  }

  return path.resolve(specsSrcDir, base).split(path.sep).join('/');
}

export function resolveSharedSpecRefs(
  content: string,
  specsSrcDir: string = SPECS_SRC_DIR
): string {
  const resolvedBase = resolveSharedSpecsBaseForRefs(specsSrcDir);
  return content.replace(PLACEHOLDER_PATTERN, resolvedBase);
}

export function describeSharedSpecsBase(specsSrcDir: string = SPECS_SRC_DIR): string {
  const raw = getSharedSpecsBase();
  const resolved = resolveSharedSpecsBaseForRefs(specsSrcDir);

  if (raw === resolved) {
    return raw;
  }

  return `${raw} → ${resolved}`;
}
