/**
 * Bundles modular OpenAPI sources in docs/specs/src/ into single-file YAML
 * specs at docs/specs/ for publishing (Swagger UI, data dictionary, etc.).
 *
 * Edit sources under docs/specs/src/ and shared fragments under docs/specs/shared/.
 * Run `npm run bundle:specs` before validate/build, or rely on CI to bundle first.
 *
 * Modified by Cursor
 */

import SwaggerParser from '@apidevtools/swagger-parser';
import * as fs from 'fs';
import { stringify } from 'yaml';
import { preprocessSourceSpecToFile } from './preprocess-source-spec.js';
import { describeSharedSpecsBase } from './shared-ref-base.js';
import {
  listSourceSpecFiles,
  publishedSpecPath,
  SPECS_SRC_DIR
} from './spec-paths.js';

async function bundleSpecs(): Promise<void> {
  const sourceFiles = listSourceSpecFiles();

  if (sourceFiles.length === 0) {
    console.log(`No source specs found in ${SPECS_SRC_DIR}; nothing to bundle.`);
    return;
  }

  console.log(`Using SHARED_SPECS_BASE: ${describeSharedSpecsBase()}\n`);

  for (const specFile of sourceFiles) {
    const outputPath = publishedSpecPath(specFile);

    try {
      const inputPath = preprocessSourceSpecToFile(specFile);
      const bundled = await SwaggerParser.bundle(inputPath);
      const yaml = stringify(bundled, {
        lineWidth: 0,
        defaultKeyType: 'PLAIN',
        defaultStringType: 'QUOTE_DOUBLE'
      });

      const header = [
        '# Modified by Cursor: generated file — edit docs/specs/src/' + specFile + ' instead.',
        '# Regenerate with: npm run bundle:specs',
        ''
      ].join('\n');

      fs.writeFileSync(outputPath, header + (yaml.endsWith('\n') ? yaml : `${yaml}\n`));
      console.log(`BUNDLED  ${specFile}  ->  specs/${specFile}`);
    } catch (error) {
      console.error(`FAIL     ${specFile}`);
      const message = error instanceof Error ? error.message : String(error);
      for (const line of message.split('\n')) {
        console.error(`         ${line}`);
      }
      process.exitCode = 1;
    }
  }

  if (process.exitCode === 1) {
    console.error('\nBundling failed for one or more source specs.');
    process.exit(1);
  }

  console.log(`\nBundled ${sourceFiles.length} source spec(s).`);
}

bundleSpecs().catch(error => {
  console.error('Error bundling specs:', error);
  process.exit(1);
});
