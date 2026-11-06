/**
 * OpenAPI Spec Validator
 *
 * Validates modular sources in docs/specs/src/ and published specs at
 * docs/specs/*.yaml (excluding src/ and shared/). Exits non-zero if any fail.
 *
 * Modified by Cursor
 */

import SwaggerParser from '@apidevtools/swagger-parser';
import { preprocessSourceSpecToFile } from './preprocess-source-spec.js';
import { describeSharedSpecsBase } from './shared-ref-base.js';
import {
  listPublishedSpecFiles,
  listSourceSpecFiles,
  publishedSpecPath,
  SPECS_ROOT,
  SPECS_SRC_DIR
} from './spec-paths.js';

async function validateFile(label: string, filePath: string): Promise<boolean> {
  try {
    await SwaggerParser.validate(filePath);
    console.log(`PASS  ${label}`);
    return true;
  } catch (error) {
    console.log(`FAIL  ${label}`);
    const message = error instanceof Error ? error.message : String(error);
    for (const line of message.split('\n')) {
      console.log(`        ${line}`);
    }
    return false;
  }
}

async function validateSpecs(): Promise<void> {
  const sourceFiles = listSourceSpecFiles();
  const publishedFiles = listPublishedSpecFiles();
  const failures: string[] = [];

  if (sourceFiles.length === 0 && publishedFiles.length === 0) {
    console.error(`No YAML spec files found under ${SPECS_ROOT}`);
    process.exit(1);
  }

  if (sourceFiles.length > 0) {
    console.log(`Validating source specs in ${SPECS_SRC_DIR}:`);
    console.log(`Using SHARED_SPECS_BASE: ${describeSharedSpecsBase()}\n`);
    for (const specFile of sourceFiles) {
      const ok = await validateFile(`src/${specFile}`, preprocessSourceSpecToFile(specFile));
      if (!ok) {
        failures.push(`src/${specFile}`);
      }
    }
    console.log('');
  }

  if (publishedFiles.length > 0) {
    console.log(`Validating published specs in ${SPECS_ROOT}:`);
    for (const specFile of publishedFiles) {
      const ok = await validateFile(specFile, publishedSpecPath(specFile));
      if (!ok) {
        failures.push(specFile);
      }
    }
  }

  const total = sourceFiles.length + publishedFiles.length;
  console.log(`\n${total - failures.length}/${total} specs valid`);

  if (failures.length > 0) {
    console.error(`\nValidation failed for ${failures.length} spec(s): ${failures.join(', ')}`);
    process.exit(1);
  }
}

validateSpecs().catch(error => {
  console.error('Error validating specs:', error);
  process.exit(1);
});
