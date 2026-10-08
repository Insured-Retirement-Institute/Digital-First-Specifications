/**
 * Groups schema definitions by normalized structure across published specs.
 *
 * Modified by Cursor
 */

import SwaggerParser from '@apidevtools/swagger-parser';
import { listPublishedSpecFiles, publishedSpecPath } from './spec-paths.js';

function stripDescriptions(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripDescriptions);
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (key === 'description' || key === 'summary' || key === 'example' || key === 'examples') {
        continue;
      }
      out[key] = stripDescriptions(val);
    }
    return out;
  }
  return value;
}

function normalizeComponent(value: unknown): string {
  return JSON.stringify(stripDescriptions(value));
}

async function analyze(name: string): Promise<void> {
  const refs: { specFile: string; normalized: string }[] = [];

  for (const specFile of listPublishedSpecFiles()) {
    const api = (await SwaggerParser.parse(publishedSpecPath(specFile))) as {
      components?: { schemas?: Record<string, unknown> };
    };
    const definition = api.components?.schemas?.[name];
    if (!definition || (typeof definition === 'object' && '$ref' in definition)) {
      continue;
    }
    refs.push({ specFile, normalized: normalizeComponent(definition) });
  }

  const groups = new Map<string, string[]>();
  for (const ref of refs) {
    const list = groups.get(ref.normalized) ?? [];
    list.push(ref.specFile);
    groups.set(ref.normalized, list);
  }

  console.log(`=== ${name} (${refs.length} specs) ===`);
  let index = 1;
  for (const files of groups.values()) {
    console.log(`variant ${index} (${files.length}): ${files.join(', ')}`);
    index++;
  }
  console.log('');
}

async function main(): Promise<void> {
  for (const name of process.argv.slice(2)) {
    await analyze(name);
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
