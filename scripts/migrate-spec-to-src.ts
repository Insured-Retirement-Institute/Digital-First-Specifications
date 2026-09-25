/**
 * Migrates a hand-authored published spec to docs/specs/src/ with shared $refs.
 *
 * Modified by Cursor
 */

import SwaggerParser from '@apidevtools/swagger-parser';
import * as fs from 'fs';
import { pathToFileURL } from 'url';
import { stringify } from 'yaml';
import {
  ERROR_DEBT_SPEC_FILES,
  shouldUseSharedComponent,
  resolveSharedRef
} from './shared-component-registry.js';
import { publishedSpecPath, sourceSpecPath, SPECS_SRC_DIR } from './spec-paths.js';

type ComponentKind = 'schemas' | 'parameters' | 'headers' | 'responses';

const ERROR_TODO = '# TODO: align to shared Error_v1 — see ERROR-SCHEMA-DEBT.md';

function applySharedRefs(specFile: string, api: Record<string, unknown>): Record<string, unknown> {
  const components = (api.components ?? {}) as Partial<
    Record<ComponentKind, Record<string, unknown>>
  >;
  const nextComponents: Partial<Record<ComponentKind, Record<string, unknown>>> = {};

  for (const kind of ['schemas', 'parameters', 'headers', 'responses'] as ComponentKind[]) {
    const section = components[kind];
    if (!section) continue;

    nextComponents[kind] = {};
    for (const [name, definition] of Object.entries(section)) {
      if (shouldUseSharedComponent(specFile, kind, name)) {
        const ref = resolveSharedRef(specFile, kind, name);
        if (ref) {
          nextComponents[kind]![name] = { $ref: ref };
        }
        continue;
      }

      nextComponents[kind]![name] = definition;
    }
  }

  return {
    ...api,
    components: {
      ...(api.components as Record<string, unknown>),
      ...nextComponents
    }
  };
}

export async function migrateSpecToSrc(specFile: string): Promise<void> {
  const inputPath = publishedSpecPath(specFile);
  const outputPath = sourceSpecPath(specFile);

  if (!fs.existsSync(inputPath)) {
    throw new Error(`Published spec not found: ${inputPath}`);
  }

  const api = (await SwaggerParser.parse(inputPath)) as Record<string, unknown>;
  const migrated = applySharedRefs(specFile, api);

  const header = [
    '# Modified by Cursor: source spec — bundled to docs/specs/' + specFile,
    ERROR_DEBT_SPEC_FILES.has(specFile) ? ERROR_TODO : '',
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
