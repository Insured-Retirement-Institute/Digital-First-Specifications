/**
 * Applies shared component $refs to existing docs/specs/src/ files.
 *
 * Modified by Cursor
 */

import * as fs from 'fs';
import { pathToFileURL } from 'url';
import { parse, stringify } from 'yaml';
import {
  resolveSharedRef,
  type ComponentKind
} from './shared-component-registry.js';
import { listSourceSpecFiles, sourceSpecPath } from './spec-paths.js';

function applySharedRefs(specFile: string, doc: Record<string, unknown>): number {
  const components = doc.components as Partial<
    Record<ComponentKind, Record<string, unknown>>
  > | undefined;

  if (!components) {
    return 0;
  }

  let replaced = 0;

  for (const kind of ['schemas', 'parameters', 'headers', 'responses'] as ComponentKind[]) {
    const section = components[kind];
    if (!section) continue;

    for (const name of Object.keys(section)) {
      const ref = resolveSharedRef(specFile, kind, name);
      if (!ref) {
        continue;
      }

      section[name] = { $ref: ref };
      replaced++;
    }
  }

  return replaced;
}

export function applySharedComponentsToSrc(specFile?: string): void {
  const specFiles = specFile ? [specFile] : listSourceSpecFiles();

  for (const file of specFiles) {
    const path = sourceSpecPath(file);
    const raw = fs.readFileSync(path, 'utf8');
    const doc = parse(raw) as Record<string, unknown>;
    const replaced = applySharedRefs(file, doc);

    if (replaced === 0) {
      console.log(`SKIP     ${file} (no shared replacements)`);
      continue;
    }

    const yaml = stringify(doc, {
      lineWidth: 0,
      defaultKeyType: 'PLAIN',
      defaultStringType: 'QUOTE_DOUBLE'
    });

    fs.writeFileSync(path, raw.startsWith('#') ? preserveHeader(raw, yaml) : yaml);
    console.log(`UPDATED  ${file} (${replaced} shared ref(s))`);
  }
}

function preserveHeader(original: string, body: string): string {
  const lines = original.split('\n');
  const headerLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith('#')) {
      headerLines.push(line);
      continue;
    }
    if (line.trim() === '') {
      headerLines.push(line);
      continue;
    }
    break;
  }

  const header = headerLines.join('\n');
  const trimmedBody = body.endsWith('\n') ? body : `${body}\n`;
  return header.endsWith('\n') ? `${header}${trimmedBody}` : `${header}\n${trimmedBody}`;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  applySharedComponentsToSrc(process.argv[2]);
}
