/**
 * Migrates a published spec from docs/specs/ to docs/specs/src/ with shared v1 $refs.
 * Prefer `npm run rebuild:src` to refresh all src specs at once.
 *
 * Modified by Cursor
 */

import SwaggerParser from '@apidevtools/swagger-parser';
import * as fs from 'fs';
import { pathToFileURL } from 'url';
import { stringify } from 'yaml';
import {
  applySharedReplacements,
  buildSharedV1Index,
  classifyErrorSchema,
  loadErrorVariantSchemas
} from './shared-v1-match.js';
import { README_ERROR_DEBT_SPEC_FILES } from './shared-component-registry.js';
import { publishedSpecPath, sourceSpecPath, SPECS_SRC_DIR } from './spec-paths.js';

const ERROR_TODO = '# TODO: align to shared Error_v1 — see ERROR-SCHEMA-DEBT.md';

let cachedIndex: Awaited<ReturnType<typeof buildSharedV1Index>> | undefined;

async function getSharedIndex(): Promise<Awaited<ReturnType<typeof buildSharedV1Index>>> {
  if (!cachedIndex) {
    await loadErrorVariantSchemas();
    cachedIndex = await buildSharedV1Index();
  }
  return cachedIndex;
}

export async function migrateSpecToSrc(specFile: string): Promise<void> {
  const inputPath = publishedSpecPath(specFile);
  const outputPath = sourceSpecPath(specFile);

  if (!fs.existsSync(inputPath)) {
    throw new Error(`Published spec not found: ${inputPath}`);
  }

  const index = await getSharedIndex();
  const apiBundled = (await SwaggerParser.bundle(inputPath)) as Record<string, unknown>;
  const { api: migrated } = applySharedReplacements(apiBundled, index);

  const components = migrated.components as { schemas?: { Error?: unknown } } | undefined;
  const errorVariant = classifyErrorSchema(components?.schemas?.Error, index);
  const noteDebt =
    errorVariant === 'v2' ||
    errorVariant === 'v3' ||
    errorVariant === 'other' ||
    README_ERROR_DEBT_SPEC_FILES.has(specFile);

  const header = [
    '# Modified by Cursor: source spec — bundled to docs/specs/' + specFile,
    noteDebt ? ERROR_TODO : '',
    ''
  ]
    .filter(Boolean)
    .join('\n');

  const yaml = stringify(migrated, {
    lineWidth: 0,
    defaultKeyType: 'PLAIN',
    defaultStringType: 'QUOTE_DOUBLE'
  });

  fs.mkdirSync(SPECS_SRC_DIR, { recursive: true });
  fs.writeFileSync(outputPath, `${header}\n${yaml.endsWith('\n') ? yaml : `${yaml}\n`}`);
}

async function main(): Promise<void> {
  const specFiles = process.argv.slice(2);
  if (specFiles.length === 0) {
    console.error('Usage: tsx scripts/migrate-spec-to-src.ts <spec-file> [...]');
    process.exit(1);
  }

  for (const specFile of specFiles) {
    await migrateSpecToSrc(specFile);
    console.log(`MIGRATED  ${specFile}  ->  src/${specFile}`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch(error => {
    console.error('Migration failed:', error);
    process.exit(1);
  });
}
