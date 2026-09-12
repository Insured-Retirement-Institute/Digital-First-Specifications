#!/usr/bin/env node
/**
 * IRI spec strictness harness.
 *
 * Loads an OpenAPI 3.1 spec, optionally injects `additionalProperties: false`
 * or `unevaluatedProperties: false` into its schemas, then validates a folder
 * of JSON bodies against each variant so you can compare the results
 * side by side.
 *
 * Usage:
 *   node harness/run.mjs --spec docs/specs/fundtransfer_1.0.1.yaml \
 *                        --schema FundTransferRequest \
 *                        --cases harness/cases/fundtransfer
 *
 * See harness/README.md for all flags.
 */
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import Ajv2020 from 'ajv/dist/2020.js';

const SCHEMA_KEYWORD = ['not', 'if', 'then', 'else', 'contains', 'propertyNames', 'items', 'additionalItems', 'additionalProperties', 'unevaluatedProperties', 'unevaluatedItems'];
const SCHEMA_MAP_KEYWORD = ['properties', 'patternProperties', 'dependentSchemas', '$defs', 'definitions'];
const SCHEMA_LIST_KEYWORD = ['allOf', 'anyOf', 'oneOf', 'prefixItems'];

const CONDITIONAL_KEYWORD = new Set(['if', 'then', 'else', 'not']);
const COMPOSITION_KEYWORD = new Set(['allOf', 'anyOf', 'oneOf', 'if', 'then', 'else', 'not']);
const ALL_MODES = ['baseline', 'additionalProperties', 'unevaluatedProperties'];
const MODE_LABEL = {
  baseline: 'baseline (as written)',
  additionalProperties: 'additionalProperties: false',
  unevaluatedProperties: 'unevaluatedProperties: false',
};

// ---------------------------------------------------------------- args ----

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq > -1) args[a.slice(2, eq)] = a.slice(eq + 1);
      else if (argv[i + 1] && !argv[i + 1].startsWith('--')) args[a.slice(2)] = argv[++i];
      else args[a.slice(2)] = true;
    } else args._.push(a);
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));

if (args.help || args.h) {
  console.log(fs.readFileSync(new URL('./README.md', import.meta.url), 'utf8'));
  process.exit(0);
}

const specPath = args.spec;
if (!specPath) die('--spec is required (path to an OpenAPI yaml file)');

const spec = yaml.load(fs.readFileSync(specPath, 'utf8'));
const schemas = spec?.components?.schemas;
if (!schemas) die(`No components.schemas found in ${specPath}`);

if (args.list) {
  console.log(`Schemas in ${path.basename(specPath)}:\n`);
  for (const name of Object.keys(schemas).sort()) {
    const s = schemas[name];
    const bits = [];
    if (s.type) bits.push(s.type);
    if (s.allOf) bits.push(`allOf[${s.allOf.length}]`);
    if (s.oneOf) bits.push(`oneOf[${s.oneOf.length}]`);
    if (s.anyOf) bits.push(`anyOf[${s.anyOf.length}]`);
    if (s.properties) bits.push(`${Object.keys(s.properties).length} props`);
    console.log(`  ${name.padEnd(34)} ${bits.join(' ')}`);
  }
  process.exit(0);
}

if (args.suggest) {
  const u = classifyUsage();
  const objectish = (n) => {
    const x = schemas[n];
    return x && (x.type === 'object' || x.properties || x.allOf || x.oneOf || x.anyOf);
  };
  const close = [...u.whole, ...u.unreferenced].filter(objectish).sort();
  console.log(`\nUsage classification for ${path.basename(specPath)}\n`);
  console.log(`CLOSE these - whole-object schemas (${close.length}):`);
  for (const n of close) console.log(`   ${n}`);
  console.log(`\nLEAVE OPEN - composition fragments (${u.fragment.length}):`);
  for (const n of u.fragment.sort()) console.log(`   ${n}`);
  if (u.dual.length) {
    console.log(`\nNEEDS A HUMAN - used both ways (${u.dual.length}):`);
    for (const n of u.dual.sort()) console.log(`   ${n}`);
  }
  console.log(`\nRun it:  --apply suggested\n`);
  process.exit(0);
}

const rootSchemaName = args.schema;
if (!rootSchemaName) die('--schema is required (e.g. --schema FundTransferRequest). Use --list to see options.');
if (!schemas[rootSchemaName]) die(`Schema "${rootSchemaName}" not found. Use --list to see options.`);

const modes = (args.modes ? String(args.modes).split(',') : ALL_MODES).map((m) => m.trim());
for (const m of modes) if (!ALL_MODES.includes(m)) die(`Unknown mode "${m}". Valid: ${ALL_MODES.join(', ')}`);

// Which named schemas get the strictness keyword. Default: all of them.
const suggested = args.apply === 'suggested';
const usage = suggested ? classifyUsage() : null;
const applyTo =
  !args.apply || args.apply === 'all'
    ? null
    : suggested
      ? new Set([...usage.whole, ...usage.unreferenced])
      : new Set(String(args.apply).split(',').map((s) => s.trim()));

// 'deep'  = the named schema and every object subschema nested inside it (default)
// 'named' = only the top node of each named schema
const scope = args.scope || 'deep';
if (!['deep', 'named'].includes(scope)) die(`--scope must be 'deep' or 'named'`);

// By default we do NOT inject into subschemas sitting under if/then/else/not,
// because that silently rewrites business rules rather than tightening a shape.
const includeConditionals = !!args['include-conditionals'];

// ------------------------------------------------------- schema rewrite ----


/**
 * Collect every property name a schema declares, following $ref and composition.
 * Used to decide whether a composition sibling would contribute properties that
 * a closed schema could not account for.
 */
function propNames(node, seen = new Set()) {
  const out = new Set();
  if (!node || typeof node !== 'object') return out;
  if (typeof node.$ref === 'string') {
    const n = node.$ref.startsWith('#/components/schemas/') ? node.$ref.slice(21) : null;
    if (n && !seen.has(n) && schemas[n]) {
      seen.add(n);
      for (const k of propNames(schemas[n], seen)) out.add(k);
    }
  }
  if (node.properties) for (const k of Object.keys(node.properties)) out.add(k);
  if (node.patternProperties) out.add('*pattern*');
  for (const kw of ['allOf', 'anyOf', 'oneOf']) {
    if (Array.isArray(node[kw])) for (const b of node[kw]) for (const k of propNames(b, seen)) out.add(k);
  }
  for (const kw of ['if', 'then', 'else']) {
    if (node[kw]) for (const k of propNames(node[kw], seen)) out.add(k);
  }
  return out;
}

/**
 * Classify every component schema by how it is USED.
 *
 *   fragment     - referenced from a composition keyword ALONGSIDE something
 *                  that contributes properties it does not itself declare.
 *                  Closing it is wrong: it cannot see what its co-applicators
 *                  evaluated.
 *   whole-object - referenced from a value position (properties/items/
 *                  additionalProperties/patternProperties), used as a request or
 *                  response body, or composed only alongside constraint-only
 *                  branches (required / not / enum) that contribute no
 *                  properties. This is where the keyword belongs.
 *   dual         - both. Cannot be closed on its definition; needs a human.
 *
 * The hazard is not "appears inside an allOf". It is "appears inside an allOf
 * next to properties it does not declare" - and that is decidable.
 */
function classifyUsage() {
  const uses = {};
  const note = (name, kind) => {
    (uses[name] ||= { fragment: 0, whole: 0 });
    uses[name][kind]++;
  };
  const refName = (node) =>
    typeof node?.$ref === 'string' && node.$ref.startsWith('#/components/schemas/')
      ? node.$ref.slice('#/components/schemas/'.length)
      : null;

  /** Every applicator the parent lands on the SAME instance location. */
  const coApplicators = (parent) => {
    const list = [];
    if (parent.properties || parent.patternProperties) {
      list.push({ properties: parent.properties, patternProperties: parent.patternProperties });
    }
    for (const kw of ['allOf', 'anyOf', 'oneOf']) if (Array.isArray(parent[kw])) list.push(...parent[kw]);
    for (const kw of ['if', 'then', 'else']) if (parent[kw]) list.push(parent[kw]);
    return list;
  };

  const walk = (node, fromComposition, parent) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach((v) => walk(v, fromComposition, parent));

    const r = refName(node);
    if (r) {
      if (!fromComposition) note(r, 'whole');
      else {
        const mine = propNames(node);
        let hazard = false;
        for (const sib of coApplicators(parent || {})) {
          if (sib === node) continue;
          for (const k of propNames(sib)) if (!mine.has(k)) { hazard = true; break; }
          if (hazard) break;
        }
        note(r, hazard ? 'fragment' : 'whole');
      }
    }

    for (const kw of SCHEMA_KEYWORD) {
      if (kw in node && typeof node[kw] === 'object') {
        walk(node[kw], CONDITIONAL_KEYWORD.has(kw), node);
      }
    }
    for (const kw of SCHEMA_MAP_KEYWORD) {
      const m = node[kw];
      if (m && typeof m === 'object' && !Array.isArray(m)) {
        for (const v of Object.values(m)) walk(v, false, v);
      }
    }
    for (const kw of SCHEMA_LIST_KEYWORD) {
      if (Array.isArray(node[kw])) node[kw].forEach((v) => walk(v, COMPOSITION_KEYWORD.has(kw), node));
    }
  };

  for (const schema of Object.values(schemas)) walk(schema, false, null);

  for (const item of Object.values(spec.paths || {})) {
    for (const op of Object.values(item || {})) {
      if (!op || typeof op !== 'object') continue;
      const bodies = [op.requestBody, ...Object.values(op.responses || {})];
      for (const b of bodies) {
        for (const media of Object.values(b?.content || {})) {
          const r = refName(media?.schema);
          if (r) note(r, 'whole');
        }
      }
    }
  }

  const out = { whole: [], fragment: [], dual: [], unreferenced: [] };
  for (const name of Object.keys(schemas)) {
    const u = uses[name];
    if (!u) out.unreferenced.push(name);
    else if (u.fragment && u.whole) out.dual.push(name);
    else if (u.fragment) out.fragment.push(name);
    else out.whole.push(name);
  }
  return out;
}

const clone = (o) => JSON.parse(JSON.stringify(o));

/** Is this node a schema that declares an object shape we'd want to close? */
function isClosableObject(node) {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return false;
  if ('additionalProperties' in node || 'unevaluatedProperties' in node) return false;
  if (node.type && node.type !== 'object') return false;
  return Boolean(node.type === 'object' || node.properties || node.allOf || node.oneOf || node.anyOf);
}

/**
 * Walk a schema tree, injecting `keyword: false` at every closable object node.
 * Returns the list of JSON-pointer-ish paths that were touched.
 */
function inject(node, keyword, pointer, touched, opts) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    node.forEach((v, i) => inject(v, keyword, `${pointer}/${i}`, touched, opts));
    return;
  }

  if (!opts.inConditional && isClosableObject(node)) {
    node[keyword] = false;
    touched.push(pointer || '(root)');
  }

  if (opts.topOnly) return;

  for (const kw of SCHEMA_KEYWORD) {
    if (kw in node && typeof node[kw] === 'object') {
      const blocked = opts.skipComposition ? COMPOSITION_KEYWORD.has(kw) : (!includeConditionals && CONDITIONAL_KEYWORD.has(kw));
      inject(node[kw], keyword, `${pointer}/${kw}`, touched, { ...opts, inConditional: opts.inConditional || blocked });
    }
  }
  for (const kw of SCHEMA_MAP_KEYWORD) {
    const map = node[kw];
    if (map && typeof map === 'object' && !Array.isArray(map)) {
      for (const [k, v] of Object.entries(map)) {
        inject(v, keyword, `${pointer}/${kw}/${k}`, touched, opts);
      }
    }
  }
  for (const kw of SCHEMA_LIST_KEYWORD) {
    const list = node[kw];
    if (Array.isArray(list)) {
      list.forEach((v, i) => {
        const blocked = opts.skipComposition ? COMPOSITION_KEYWORD.has(kw) : (!includeConditionals && kw === 'not');
        inject(v, keyword, `${pointer}/${kw}/${i}`, touched, { ...opts, inConditional: opts.inConditional || blocked });
      });
    }
  }
}

function buildVariant(mode) {
  const copy = clone(schemas);
  const touched = [];
  if (mode !== 'baseline') {
    for (const [name, schema] of Object.entries(copy)) {
      if (applyTo && !applyTo.has(name)) continue;
      const marks = [];
      inject(schema, mode, '', marks, { inConditional: false, topOnly: scope === 'named', skipComposition: suggested });
      for (const m of marks) touched.push(`${name}${m === '(root)' ? '' : m}`);
    }
  }
  return { schemas: copy, touched };
}

// ------------------------------------------------------------ validate ----

const BASE = 'https://iri.org/harness/spec.json';

function compile(variantSchemas) {
  const ajv = new Ajv2020({
    strict: false,
    allErrors: true,
    validateFormats: false, // formats are orthogonal to what this harness demonstrates
    discriminator: false,
  });
  ajv.addSchema({ $id: BASE, components: { schemas: variantSchemas } });
  return ajv.compile({ $ref: `${BASE}#/components/schemas/${rootSchemaName}` });
}

function summarizeErrors(errors, verbose) {
  if (!errors) return [];
  const lines = errors.map((e) => {
    const where = e.instancePath || '(root)';
    let what = e.message;
    if (e.params?.additionalProperty) what = `unknown property "${e.params.additionalProperty}"`;
    if (e.params?.unevaluatedProperty) what = `unevaluated property "${e.params.unevaluatedProperty}"`;
    return `${where}: ${what} [${e.keyword}]`;
  });
  const seen = new Set();
  const deduped = lines.filter((l) => (seen.has(l) ? false : (seen.add(l), true)));
  return verbose ? deduped : deduped.slice(0, 6);
}

// --------------------------------------------------------------- cases ----

function loadCases() {
  if (args.case) {
    const p = args.case;
    return [readCase(p)];
  }
  const dir = args.cases;
  if (!dir) die('--cases <dir> or --case <file.json> is required');
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => readCase(path.join(dir, f)));
}

function readCase(file) {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const meta = raw.$case || {};
  const body = { ...raw };
  delete body.$case;
  return {
    file,
    id: path.basename(file, '.json'),
    name: meta.name || path.basename(file, '.json'),
    note: meta.note || '',
    expect: meta.expect || null,
    body,
  };
}

const cases = loadCases();

// ----------------------------------------------------------------- run ----

const variants = {};
for (const mode of modes) {
  const v = buildVariant(mode);
  v.validate = compile(v.schemas);
  variants[mode] = v;
}

const results = cases.map((c) => {
  const row = { case: c, outcomes: {} };
  for (const mode of modes) {
    const v = variants[mode];
    const ok = v.validate(c.body);
    row.outcomes[mode] = {
      pass: ok,
      errors: ok ? [] : summarizeErrors(v.validate.errors, !!args.verbose),
      errorCount: ok ? 0 : v.validate.errors.length,
    };
  }
  return row;
});

// -------------------------------------------------------------- report ----

const out = [];
const p = (s = '') => out.push(s);

p(`# Strictness harness report`);
p();
p(`- **Spec:** \`${specPath}\``);
p(`- **Root schema:** \`${rootSchemaName}\``);
p(`- **Applied to:** ${suggested ? `whole-object schemas only, computed from usage (${applyTo.size} of ${Object.keys(schemas).length})` : applyTo ? [...applyTo].join(', ') : 'all component schemas'} (scope: ${scope}, conditionals: ${includeConditionals ? 'included' : 'skipped'})`);
p(`- **Cases:** ${cases.length} from \`${args.case || args.cases}\``);
p();
for (const mode of modes) {
  if (mode === 'baseline') continue;
  p(`- \`${mode}: false\` injected at ${variants[mode].touched.length} schema location(s)`);
}
p();

// Matrix
p(`## Results`);
p();
const headers = ['Case', ...modes.map((m) => MODE_LABEL[m])];
p(`| ${headers.join(' | ')} |`);
p(`| ${headers.map(() => '---').join(' | ')} |`);
for (const row of results) {
  const cells = modes.map((m) => {
    const o = row.outcomes[m];
    let cell = o.pass ? 'PASS' : `FAIL (${o.errorCount})`;
    const exp = row.case.expect?.[m];
    if (exp) {
      const actual = o.pass ? 'pass' : 'fail';
      if (actual !== exp) cell += ` ** unexpected, expected ${exp} **`;
    }
    return cell;
  });
  p(`| ${row.case.name} | ${cells.join(' | ')} |`);
}
p();

// Per-case detail
p(`## Detail`);
for (const row of results) {
  p();
  p(`### ${row.case.name}`);
  p(`\`${row.case.file}\``);
  if (row.case.note) { p(); p(`> ${row.case.note}`); }
  for (const mode of modes) {
    const o = row.outcomes[mode];
    p();
    p(`**${MODE_LABEL[mode]}** — ${o.pass ? 'PASS' : `FAIL (${o.errorCount} error${o.errorCount === 1 ? '' : 's'})`}`);
    if (!o.pass) {
      p();
      for (const line of o.errors) p(`- ${line}`);
      if (!args.verbose && o.errorCount > o.errors.length) {
        p(`- _...${o.errorCount - o.errors.length} more (run with --verbose)_`);
      }
    }
  }
}
p();

const markdown = out.join('\n');

if (args['print-schema']) {
  const name = args['print-schema'];
  console.log(`\n--- ${name} per mode ---`);
  for (const mode of modes) {
    console.log(`\n## ${MODE_LABEL[mode]}`);
    console.log(yaml.dump(variants[mode].schemas[name], { lineWidth: 100 }));
  }
}

if (args['print-touched']) {
  for (const mode of modes) {
    if (mode === 'baseline') continue;
    console.log(`\n--- ${mode}: false injected at ---`);
    for (const t of variants[mode].touched) console.log(`  ${t}`);
  }
}

if (args.json) {
  const payload = results.map((r) => ({
    case: r.case.id,
    name: r.case.name,
    note: r.case.note,
    outcomes: Object.fromEntries(modes.map((m) => [m, r.outcomes[m]])),
  }));
  fs.writeFileSync(args.json === true ? 'harness-report.json' : args.json, JSON.stringify(payload, null, 2));
  console.error(`Wrote ${args.json === true ? 'harness-report.json' : args.json}`);
}

if (args.out) {
  fs.writeFileSync(args.out, markdown);
  console.error(`Wrote ${args.out}`);
}

console.log(markdown);

// Exit non-zero if any case's expectation was violated, so this can gate CI.
const violations = results.filter((r) =>
  modes.some((m) => r.case.expect?.[m] && (r.outcomes[m].pass ? 'pass' : 'fail') !== r.case.expect[m])
);
if (violations.length) {
  console.error(`\n${violations.length} case(s) did not match their declared $case.expect.`);
  process.exit(1);
}

function die(msg) {
  console.error(`error: ${msg}`);
  process.exit(2);
}
