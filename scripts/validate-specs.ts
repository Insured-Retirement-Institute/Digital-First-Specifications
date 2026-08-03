/**
 * OpenAPI Spec Validator
 *
 * Validates every spec in docs/specs against the OpenAPI schema and exits
 * non-zero if any fail.
 *
 * Reports every failing spec rather than stopping at the first, so one run
 * shows all the work.
 */

import SwaggerParser from '@apidevtools/swagger-parser';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function validateSpecs(): Promise<void> {
  const specsDir = path.join(__dirname, '..', 'docs', 'specs');

  const specFiles = fs.readdirSync(specsDir)
    .filter(f => f.endsWith('.yaml') || f.endsWith('.yml'))
    .sort();

  if (specFiles.length === 0) {
    console.error(`No YAML spec files found in ${specsDir}`);
    process.exit(1);
  }

  const failures: string[] = [];

  for (const specFile of specFiles) {
    try {
      // validate() parses, resolves $refs, and checks the document against
      // the OpenAPI schema. It mutates its input, so pass the path and let
      // it read its own copy.
      await SwaggerParser.validate(path.join(specsDir, specFile));
      console.log(`PASS  ${specFile}`);
    } catch (error) {
      failures.push(specFile);
      console.log(`FAIL  ${specFile}`);
      const message = error instanceof Error ? error.message : String(error);
      for (const line of message.split('\n')) {
        console.log(`        ${line}`);
      }
    }
  }

  console.log(`\n${specFiles.length - failures.length}/${specFiles.length} specs valid`);

  if (failures.length > 0) {
    console.error(`\nValidation failed for ${failures.length} spec(s): ${failures.join(', ')}`);
    process.exit(1);
  }
}

validateSpecs().catch(error => {
  console.error('Error validating specs:', error);
  process.exit(1);
});
