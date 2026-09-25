/**
 * Inventories OpenAPI components across published specs and classifies duplicates.
 *
 * Modified by Cursor
 */

import SwaggerParser from '@apidevtools/swagger-parser';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { listPublishedSpecFiles, publishedSpecPath, SPECS_ROOT } from './spec-paths.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

type ComponentKind = 'schemas' | 'parameters' | 'headers' | 'responses';

interface ComponentRef {
  kind: ComponentKind;
  name: string;
  specFile: string;
  normalized: string;
}

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

async function inventorySpecs(): Promise<void> {
  const specFiles = listPublishedSpecFiles();
  const components: ComponentRef[] = [];

  for (const specFile of specFiles) {
    const specPath = publishedSpecPath(specFile);
    const api = await SwaggerParser.parse(specPath) as {
      components?: Partial<Record<ComponentKind, Record<string, unknown>>>;
    };

    for (const kind of ['schemas', 'parameters', 'headers', 'responses'] as ComponentKind[]) {
      const section = api.components?.[kind];
      if (!section) continue;

      for (const [name, definition] of Object.entries(section)) {
        if (definition && typeof definition === 'object' && '$ref' in definition) {
          continue;
        }
        components.push({
          kind,
          name,
          specFile,
          normalized: normalizeComponent(definition)
        });
      }
    }
  }

  const byKey = new Map<string, ComponentRef[]>();
  for (const ref of components) {
    const key = `${ref.kind}:${ref.name}`;
    const list = byKey.get(key) ?? [];
    list.push(ref);
    byKey.set(key, list);
  }

  const duplicates = [...byKey.entries()]
    .filter(([, refs]) => refs.length >= 2)
    .sort(([a], [b]) => a.localeCompare(b));

  console.log(`Inventory: ${specFiles.length} published specs under ${SPECS_ROOT}`);
  console.log(`Duplicate component names (2+ specs): ${duplicates.length}\n`);

  let identical = 0;
  let conflicting = 0;

  for (const [key, refs] of duplicates) {
    const uniqueNormalized = new Set(refs.map(r => r.normalized));
    const status = uniqueNormalized.size === 1 ? 'IDENTICAL' : 'CONFLICTING';
    if (status === 'IDENTICAL') identical++;
    else conflicting++;

    console.log(`${status}  ${key}  (${refs.length} specs)`);
    if (status === 'CONFLICTING') {
      console.log(`         files: ${refs.map(r => r.specFile).join(', ')}`);
      console.log(`         variants: ${uniqueNormalized.size}`);
    }
  }

  console.log(`\nSummary: ${identical} identical duplicate groups, ${conflicting} conflicting duplicate groups`);
}

inventorySpecs().catch(error => {
  console.error('Inventory failed:', error);
  process.exit(1);
});
