/**
 * Shared path helpers for OpenAPI spec source, shared fragments, and bundled output.
 *
 * Modified by Cursor
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const SPECS_ROOT = path.join(__dirname, '..', 'docs', 'specs');
export const SPECS_SRC_DIR = path.join(SPECS_ROOT, 'src');
export const SPECS_SHARED_DIR = path.join(SPECS_ROOT, 'shared');

const YAML_PATTERN = /\.ya?ml$/i;

export function isYamlFile(name: string): boolean {
  return YAML_PATTERN.test(name);
}

export function listSourceSpecFiles(): string[] {
  if (!fs.existsSync(SPECS_SRC_DIR)) {
    return [];
  }

  return fs.readdirSync(SPECS_SRC_DIR)
    .filter(isYamlFile)
    .sort();
}

/** Published specs: top-level YAML in docs/specs/ (not under src/ or shared/). */
export function listPublishedSpecFiles(): string[] {
  if (!fs.existsSync(SPECS_ROOT)) {
    return [];
  }

  return fs.readdirSync(SPECS_ROOT, { withFileTypes: true })
    .filter(entry => entry.isFile() && isYamlFile(entry.name))
    .map(entry => entry.name)
    .sort();
}

export function sourceSpecPath(fileName: string): string {
  return path.join(SPECS_SRC_DIR, fileName);
}

export function publishedSpecPath(fileName: string): string {
  return path.join(SPECS_ROOT, fileName);
}
