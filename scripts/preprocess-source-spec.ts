/**
 * Preprocess modular source specs: expand ${SHARED_SPECS_BASE}, apply x-df-enumOverrides, then parse/bundle.
 *
 * Modified by Cursor
 */

import * as fs from 'fs';
import * as path from 'path';
import { applyEnumOverridesToYamlContent } from './apply-enum-overrides.js';
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
  const withSharedBase = resolveSharedSpecRefs(content, SPECS_SRC_DIR);
  const { yaml: preprocessed, issues } = applyEnumOverridesToYamlContent(
    withSharedBase,
    specFile,
    SPECS_SRC_DIR
  );

  if (issues.length > 0) {
    const details = issues.map(i => `${i.componentPath}: ${i.message}`).join('\n');
    throw new Error(`Enum override errors in ${specFile}:\n${details}`);
  }

  fs.writeFileSync(outputPath, preprocessed);

  return outputPath;
}
