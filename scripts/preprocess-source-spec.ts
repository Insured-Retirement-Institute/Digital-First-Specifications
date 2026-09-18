/**
 * Preprocess modular source specs: expand ${SHARED_SPECS_BASE} before parse/bundle.
 *
 * Modified by Cursor
 */

import * as fs from 'fs';
import * as path from 'path';
import { resolveSharedSpecRefs } from './shared-ref-base.js';
import { sourceSpecPath, SPECS_SRC_DIR } from './spec-paths.js';

const BUILD_DIR = path.join(SPECS_SRC_DIR, '.build');

export function getPreprocessedSourcePath(specFile: string): string {
  return path.join(BUILD_DIR, specFile);
}

/**
 * Writes a preprocessed copy of a source spec for SwaggerParser to read.
 */
export function preprocessSourceSpecToFile(specFile: string): string {
  const inputPath = sourceSpecPath(specFile);
  const outputPath = getPreprocessedSourcePath(specFile);

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  const content = fs.readFileSync(inputPath, 'utf8');
  const preprocessed = resolveSharedSpecRefs(content, SPECS_SRC_DIR);
  fs.writeFileSync(outputPath, preprocessed);

  return outputPath;
}
