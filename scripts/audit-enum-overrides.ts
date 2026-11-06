/**
 * Audits x-df-enumOverrides in src specs (pointers and remove ⊆ shared enum).
 *
 * Modified by Cursor
 */

import * as fs from 'fs';
import {
  applyEnumOverrideRules,
  ENUM_OVERRIDE_EXTENSION,
  parseEnumOverrideRules,
  resolveExternalRef,
  type ComponentKind,
  type EnumOverrideIssue
} from './apply-enum-overrides.js';
import { resolveSharedSpecRefs } from './shared-ref-base.js';
import { listSourceSpecFiles, sourceSpecPath, SPECS_SRC_DIR } from './spec-paths.js';
import { parse } from 'yaml';

function auditSpec(specFile: string): EnumOverrideIssue[] {
  const raw = fs.readFileSync(sourceSpecPath(specFile), 'utf8');
  const content = resolveSharedSpecRefs(raw, SPECS_SRC_DIR);
  const doc = parse(content) as Record<string, unknown>;
  const components = doc.components as Partial<Record<ComponentKind, Record<string, unknown>>> | undefined;
  const issues: EnumOverrideIssue[] = [];

  if (!components) {
    return issues;
  }

  for (const kind of ['schemas', 'parameters', 'headers', 'responses'] as ComponentKind[]) {
    const section = components[kind];
    if (!section) {
      continue;
    }

    for (const [name, entry] of Object.entries(section)) {
      if (!entry || typeof entry !== 'object') {
        continue;
      }
      const obj = entry as Record<string, unknown>;
      if (typeof obj.$ref !== 'string' || obj[ENUM_OVERRIDE_EXTENSION] === undefined) {
        continue;
      }

      const componentPath = `components.${kind}.${name}`;

      try {
        const rules = parseEnumOverrideRules(obj[ENUM_OVERRIDE_EXTENSION]);
        const resolved = resolveExternalRef(obj.$ref, SPECS_SRC_DIR);
        applyEnumOverrideRules(resolved, rules);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        issues.push({ specFile, componentPath, message });
      }
    }
  }

  return issues;
}

function main(): void {
  const specFiles = listSourceSpecFiles();
  const allIssues: EnumOverrideIssue[] = [];

  console.log('Enum override audit (src specs)\n');

  for (const specFile of specFiles) {
    const issues = auditSpec(specFile);
    if (issues.length === 0) {
      continue;
    }
    console.log(`${specFile}:`);
    for (const issue of issues) {
      console.log(`  ${issue.componentPath}: ${issue.message}`);
    }
    allIssues.push(...issues);
  }

  if (allIssues.length === 0) {
    console.log('All x-df-enumOverrides entries are valid.');
    return;
  }

  console.error(`\n${allIssues.length} enum override issue(s) found.`);
  process.exit(1);
}

main();
