/**
 * Rebuilds docs/specs/src/ from top-level published specs in docs/specs/.
 * Replaces inline components with direct ${SHARED_SPECS_BASE} $refs when they
 * match shared *_v1.yaml fragments. Error_v2 / Error_v3 shapes stay inline; only
 * README Error_v1 may be externalized to Error_v1.yaml.
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
import {
  listPublishedSpecFiles,
  publishedSpecPath,
  sourceSpecPath,
  SPECS_SRC_DIR
} from './spec-paths.js';

const ERROR_TODO = '# TODO: align to shared Error_v1 — see ERROR-SCHEMA-DEBT.md';

async function rebuildOne(
  specFile: string,
  index: Awaited<ReturnType<typeof buildSharedV1Index>>
): Promise<number> {
  const inputPath = publishedSpecPath(specFile);
  const outputPath = sourceSpecPath(specFile);

  const apiBundled = (await SwaggerParser.bundle(inputPath)) as Record<string, unknown>;
  const { api: withRefs, replaced } = applySharedReplacements(apiBundled, index);

  const components = withRefs.components as { schemas?: { Error?: unknown } } | undefined;
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

  const yaml = stringify(withRefs, {
    lineWidth: 0,
    defaultKeyType: 'PLAIN',
    defaultStringType: 'QUOTE_DOUBLE'
  });

  fs.mkdirSync(SPECS_SRC_DIR, { recursive: true });
  fs.writeFileSync(outputPath, `${header}\n${yaml.endsWith('\n') ? yaml : `${yaml}\n`}`);

  return replaced;
}

async function main(): Promise<void> {
  await loadErrorVariantSchemas();
  const index = await buildSharedV1Index();
  const specFiles = listPublishedSpecFiles();

  if (specFiles.length === 0) {
    console.log('No published specs found in docs/specs/.');
    return;
  }

  let totalReplaced = 0;

  for (const specFile of specFiles) {
    const replaced = await rebuildOne(specFile, index);
    totalReplaced += replaced;
    console.log(`REBUILT  ${specFile}  (${replaced} shared $ref(s))`);
  }

  console.log(`\nRebuilt ${specFiles.length} source spec(s); ${totalReplaced} shared component(s) externalized.`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch(error => {
    console.error('Rebuild failed:', error);
    process.exit(1);
  });
}
