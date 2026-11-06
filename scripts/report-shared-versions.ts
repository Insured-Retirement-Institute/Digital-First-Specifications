/**
 * Reports which shared component file versions (_vN) each src spec references.
 *
 * Modified by Cursor
 */

import * as fs from 'fs';
import { parse } from 'yaml';
import { listSourceSpecFiles, sourceSpecPath } from './spec-paths.js';
import {
  DEFAULT_SHARED_COMPONENT_VERSION,
  getSharedComponentVersion,
  listRegistryVersions,
  makeSharedComponentPin,
  shouldUseSharedComponent,
  SPEC_SHARED_VERSIONS,
  type ComponentKind
} from './shared-component-registry.js';

const SHARED_REF_PATTERN =
  /\$\{SHARED_SPECS_BASE\}\/([A-Za-z0-9_]+)_v(\d+)\.ya?ml#\/components\/(schemas|parameters|headers|responses)\/([A-Za-z0-9_]+)/g;

interface ParsedSharedRef {
  fileBase: string;
  version: number;
  kind: ComponentKind;
  name: string;
}

function parseSharedRefs(content: string): ParsedSharedRef[] {
  const refs: ParsedSharedRef[] = [];
  for (const match of content.matchAll(SHARED_REF_PATTERN)) {
    refs.push({
      fileBase: match[1],
      version: Number(match[2]),
      kind: match[3] as ComponentKind,
      name: match[4]
    });
  }
  return refs;
}

function reportSpec(specFile: string): void {
  const path = sourceSpecPath(specFile);
  const content = fs.readFileSync(path, 'utf8');
  const refs = parseSharedRefs(content);

  console.log(specFile);

  if (refs.length === 0) {
    console.log('  (no ${SHARED_SPECS_BASE} component refs)');
    console.log('');
    return;
  }

  const byComponent = new Map<string, Set<number>>();
  for (const ref of refs) {
    const key = `${ref.kind}:${ref.name}`;
    const versions = byComponent.get(key) ?? new Set<number>();
    versions.add(ref.version);
    byComponent.set(key, versions);
  }

  for (const [key, versions] of [...byComponent.entries()].sort()) {
    const [kind, name] = key.split(':') as [ComponentKind, string];
    const listed = listRegistryVersions(kind, name);
    const used = [...versions].sort((a, b) => a - b);
    const pin = SPEC_SHARED_VERSIONS[specFile]?.[makeSharedComponentPin(kind, name)];
    const automationDefault = shouldUseSharedComponent(specFile, kind, name)
      ? getSharedComponentVersion(specFile, kind, name)
      : null;
    const latest = listed.length > 0 ? Math.max(...listed) : DEFAULT_SHARED_COMPONENT_VERSION;
    const behind = used.some(v => v < latest) ? ` (registry latest: v${latest})` : '';

    console.log(
      `  ${key}  src: v${used.join(', v')}${behind}` +
        (pin !== undefined ? `  pin: v${pin}` : '') +
        (automationDefault !== null ? `  apply-default: v${automationDefault}` : '')
    );
  }

  console.log('');
}

function main(): void {
  const specFiles = listSourceSpecFiles();
  console.log(`Shared version usage in ${specFiles.length} src spec(s)\n`);

  for (const specFile of specFiles) {
    reportSpec(specFile);
  }
}

main();
