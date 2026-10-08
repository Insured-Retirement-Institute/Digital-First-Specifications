/**
 * Audits src specs for inline components that the registry would replace with shared $refs.
 *
 * Modified by Cursor
 */

import * as fs from 'fs';
import { parse } from 'yaml';
import {
  resolveSharedRef,
  type ComponentKind
} from './shared-component-registry.js';
import { listSourceSpecFiles, sourceSpecPath } from './spec-paths.js';

function isSharedRef(value: unknown): boolean {
  return (
    !!value &&
    typeof value === 'object' &&
    '$ref' in value &&
    typeof (value as { $ref: unknown }).$ref === 'string' &&
    (value as { $ref: string }).$ref.includes('${SHARED_SPECS_BASE}')
  );
}

function auditSpec(specFile: string): string[] {
  const raw = fs.readFileSync(sourceSpecPath(specFile), 'utf8');
  const doc = parse(raw) as {
    components?: Partial<Record<ComponentKind, Record<string, unknown>>>;
  };
  const gaps: string[] = [];

  for (const kind of ['schemas', 'parameters', 'headers', 'responses'] as ComponentKind[]) {
    const section = doc.components?.[kind];
    if (!section) continue;

    for (const [name, definition] of Object.entries(section)) {
      const expectedRef = resolveSharedRef(specFile, kind, name);
      if (!expectedRef) continue;
      if (isSharedRef(definition)) continue;
      gaps.push(`${kind}:${name} (expected ${expectedRef.replace('${SHARED_SPECS_BASE}', '…')})`);
    }
  }

  return gaps;
}

function main(): void {
  const specFiles = listSourceSpecFiles();
  let totalGaps = 0;

  console.log('Shared ref coverage audit (src specs)\n');

  for (const specFile of specFiles) {
    const gaps = auditSpec(specFile);
    if (gaps.length === 0) continue;
    totalGaps += gaps.length;
    console.log(`${specFile}`);
    for (const gap of gaps) {
      console.log(`  MISSING  ${gap}`);
    }
    console.log('');
  }

  if (totalGaps === 0) {
    console.log('All registry-eligible components use shared $refs.');
  } else {
    console.log(`Total gaps: ${totalGaps}. Run: npm run apply:shared`);
    process.exitCode = 1;
  }
}

main();
