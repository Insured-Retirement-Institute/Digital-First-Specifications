/**
 * Data Dictionary Generator
 *
 * Parses an OpenAPI 3.x specification and generates a per-endpoint
 * field instance data dictionary with JSON and Excel outputs.
 */

import SwaggerParser from '@apidevtools/swagger-parser';
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Types
interface FieldInstance {
  operationId: string;
  method: string;
  path: string;
  tags: string;
  summary: string;
  location: string;
  httpStatus: string;
  mediaType: string;
  schemaName: string;
  fieldPath: string;
  fieldName: string;
  type: string;
  itemType: string;
  format: string;
  required: string;
  nullable: string;
  deprecated: string;
  readOnly: string;
  writeOnly: string;
  description: string;
  constraints: string;
  example: string;
  default: string;
  sourceRef: string;
  issues: string;
}

interface EndpointSummary {
  method: string;
  path: string;
  operationId: string;
  tags: string;
  summary: string;
  description: string;
  requestMediaTypes: string;
  responseCodesAndMediaTypes: string;
  parameterCount: number;
}

interface SchemaSummary {
  name: string;
  type: string;
  description: string;
  propertyCount: number;
  required: string;
}

interface OpenAPISpec {
  openapi: string;
  info: {
    title: string;
    version: string;
    description?: string;
  };
  paths: Record<string, PathItem>;
  components?: {
    schemas?: Record<string, Schema>;
    parameters?: Record<string, Parameter>;
  };
}

interface PathItem {
  get?: Operation;
  post?: Operation;
  put?: Operation;
  patch?: Operation;
  delete?: Operation;
  parameters?: Parameter[];
}

interface Operation {
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  parameters?: Parameter[];
  requestBody?: RequestBody;
  responses?: Record<string, Response>;
  deprecated?: boolean;
}

interface Parameter {
  name: string;
  in: 'query' | 'header' | 'path' | 'cookie';
  description?: string;
  required?: boolean;
  deprecated?: boolean;
  schema?: Schema;
}

interface RequestBody {
  required?: boolean;
  description?: string;
  content?: Record<string, MediaTypeObject>;
}

interface Response {
  description?: string;
  content?: Record<string, MediaTypeObject>;
}

interface MediaTypeObject {
  schema?: Schema;
}

interface Schema {
  type?: string;
  format?: string;
  description?: string;
  properties?: Record<string, Schema>;
  items?: Schema;
  required?: string[];
  enum?: (string | number)[];
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  minItems?: number;
  maxItems?: number;
  nullable?: boolean;
  deprecated?: boolean;
  readOnly?: boolean;
  writeOnly?: boolean;
  example?: unknown;
  default?: unknown;
  allOf?: Schema[];
  oneOf?: Schema[];
  anyOf?: Schema[];
  const?: unknown;
  $ref?: string;
  title?: string;
  additionalProperties?: boolean | Schema;
}

// Context for flattening schemas
interface FlattenContext {
  operationId: string;
  method: string;
  path: string;
  tags: string;
  summary: string;
  location: string;
  httpStatus: string;
  mediaType: string;
  sourceRef: string;
  requiredFields: Set<string>;
}

// Schema tracker for naming
const schemaNameCache = new WeakMap<Schema, string>();

function getSchemaName(schema: Schema, refPath?: string): string {
  if (schemaNameCache.has(schema)) {
    return schemaNameCache.get(schema)!;
  }

  if (refPath) {
    const parts = refPath.split('/');
    const name = parts[parts.length - 1];
    schemaNameCache.set(schema, name);
    return name;
  }

  if (schema.title) {
    schemaNameCache.set(schema, schema.title);
    return schema.title;
  }

  schemaNameCache.set(schema, 'inline/anonymous');
  return 'inline/anonymous';
}

function buildConstraints(schema: Schema): string {
  const constraints: string[] = [];

  if (schema.pattern) constraints.push(`pattern=${schema.pattern}`);
  if (schema.minLength !== undefined) constraints.push(`minLength=${schema.minLength}`);
  if (schema.maxLength !== undefined) constraints.push(`maxLength=${schema.maxLength}`);
  if (schema.minimum !== undefined) constraints.push(`minimum=${schema.minimum}`);
  if (schema.maximum !== undefined) constraints.push(`maximum=${schema.maximum}`);
  if (schema.minItems !== undefined) constraints.push(`minItems=${schema.minItems}`);
  if (schema.maxItems !== undefined) constraints.push(`maxItems=${schema.maxItems}`);
  if (schema.enum) constraints.push(`enum=[${schema.enum.join(', ')}]`);
  if (schema.const !== undefined) constraints.push(`const=${schema.const}`);

  return constraints.join('; ');
}

function formatValue(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function yesNo(value: boolean | undefined): string {
  return value ? 'Yes' : 'No';
}

function mergeAllOfSchemas(schemas: Schema[]): { merged: Schema; issues: string[] } {
  const issues: string[] = [];
  const merged: Schema = {
    type: 'object',
    properties: {},
    required: []
  };

  for (const schema of schemas) {
    if (schema.type && schema.type !== 'object') {
      issues.push(`allOf contains non-object type: ${schema.type}`);
    }

    if (schema.properties) {
      merged.properties = { ...merged.properties, ...schema.properties };
    }

    if (schema.required) {
      merged.required = [...(merged.required || []), ...schema.required];
    }

    // Copy other relevant properties
    if (schema.description && !merged.description) {
      merged.description = schema.description;
    }
  }

  // Dedupe required
  merged.required = [...new Set(merged.required)];

  return { merged, issues };
}

function flattenSchema(
  schema: Schema,
  fieldPath: string,
  ctx: FlattenContext,
  parentSchemaName: string,
  variantLabel: string = '',
  visited: Set<Schema> = new Set()
): FieldInstance[] {
  const results: FieldInstance[] = [];
  const issues: string[] = [];

  // Prevent infinite recursion
  if (visited.has(schema)) {
    return results;
  }
  visited.add(schema);

  // Handle allOf
  if (schema.allOf && schema.allOf.length > 0) {
    const { merged, issues: mergeIssues } = mergeAllOfSchemas(schema.allOf);
    issues.push(...mergeIssues);

    const schemaName = getSchemaName(schema) || parentSchemaName;
    return flattenSchema(merged, fieldPath, ctx, schemaName, variantLabel, visited);
  }

  // Handle oneOf/anyOf - create variant rows
  if (schema.oneOf && schema.oneOf.length > 0) {
    schema.oneOf.forEach((variant, index) => {
      const variantName = getSchemaName(variant) || `variant${index + 1}`;
      const newVariantLabel = variantLabel ? `${variantLabel}|${variantName}` : variantName;
      results.push(...flattenSchema(variant, fieldPath, ctx, parentSchemaName, newVariantLabel, new Set(visited)));
    });
    return results;
  }

  if (schema.anyOf && schema.anyOf.length > 0) {
    schema.anyOf.forEach((variant, index) => {
      const variantName = getSchemaName(variant) || `variant${index + 1}`;
      const newVariantLabel = variantLabel ? `${variantLabel}|${variantName}` : variantName;
      results.push(...flattenSchema(variant, fieldPath, ctx, parentSchemaName, newVariantLabel, new Set(visited)));
    });
    return results;
  }

  // Handle arrays
  if (schema.type === 'array' && schema.items) {
    const itemSchema = schema.items;
    const arrayPath = fieldPath ? `${fieldPath}[]` : '[]';

    // If items is an object, flatten its properties
    if (itemSchema.type === 'object' || itemSchema.properties || itemSchema.allOf || itemSchema.oneOf || itemSchema.anyOf) {
      const itemSchemaName = getSchemaName(itemSchema) || parentSchemaName;
      return flattenSchema(itemSchema, arrayPath, ctx, itemSchemaName, variantLabel, visited);
    }

    // Primitive array items
    const fieldName = fieldPath.split('.').pop() || fieldPath || 'items';
    results.push({
      operationId: ctx.operationId,
      method: ctx.method,
      path: ctx.path,
      tags: ctx.tags,
      summary: ctx.summary,
      location: ctx.location,
      httpStatus: ctx.httpStatus,
      mediaType: ctx.mediaType,
      schemaName: parentSchemaName,
      fieldPath: arrayPath,
      fieldName: `${fieldName}[]`,
      type: 'array',
      itemType: itemSchema.type || '',
      format: itemSchema.format || '',
      required: yesNo(ctx.requiredFields.has(fieldName)),
      nullable: yesNo(schema.nullable),
      deprecated: yesNo(schema.deprecated),
      readOnly: yesNo(schema.readOnly),
      writeOnly: yesNo(schema.writeOnly),
      description: schema.description || itemSchema.description || '',
      constraints: buildConstraints(schema) || buildConstraints(itemSchema),
      example: formatValue(schema.example),
      default: formatValue(schema.default),
      sourceRef: ctx.sourceRef,
      issues: issues.join('; ')
    });

    return results;
  }

  // Handle object properties
  if (schema.type === 'object' || schema.properties) {
    const properties = schema.properties || {};
    const requiredFields = new Set(schema.required || []);

    for (const [propName, propSchema] of Object.entries(properties)) {
      const propPath = fieldPath ? `${fieldPath}.${propName}` : propName;
      const propSchemaName = getSchemaName(propSchema) || parentSchemaName;

      // Check if this property is a complex type that needs flattening
      if (propSchema.type === 'object' || propSchema.properties || propSchema.allOf || propSchema.oneOf || propSchema.anyOf) {
        // Create a context with updated required fields
        const newCtx = { ...ctx, requiredFields: new Set(propSchema.required || []) };

        // Add a row for the object field itself
        results.push({
          operationId: ctx.operationId,
          method: ctx.method,
          path: ctx.path,
          tags: ctx.tags,
          summary: ctx.summary,
          location: ctx.location,
          httpStatus: ctx.httpStatus,
          mediaType: ctx.mediaType,
          schemaName: propSchemaName,
          fieldPath: propPath,
          fieldName: propName,
          type: propSchema.type || 'object',
          itemType: '',
          format: propSchema.format || '',
          required: yesNo(requiredFields.has(propName)),
          nullable: yesNo(propSchema.nullable),
          deprecated: yesNo(propSchema.deprecated),
          readOnly: yesNo(propSchema.readOnly),
          writeOnly: yesNo(propSchema.writeOnly),
          description: propSchema.description || '',
          constraints: buildConstraints(propSchema),
          example: formatValue(propSchema.example),
          default: formatValue(propSchema.default),
          sourceRef: ctx.sourceRef,
          issues: variantLabel ? `variant: ${variantLabel}` : ''
        });

        // Flatten nested properties
        results.push(...flattenSchema(propSchema, propPath, newCtx, propSchemaName, variantLabel, new Set(visited)));
      } else if (propSchema.type === 'array' && propSchema.items) {
        // Handle array property
        const arrayPath = `${propPath}[]`;
        const itemSchema = propSchema.items;

        // Add row for the array field
        results.push({
          operationId: ctx.operationId,
          method: ctx.method,
          path: ctx.path,
          tags: ctx.tags,
          summary: ctx.summary,
          location: ctx.location,
          httpStatus: ctx.httpStatus,
          mediaType: ctx.mediaType,
          schemaName: propSchemaName,
          fieldPath: propPath,
          fieldName: propName,
          type: 'array',
          itemType: itemSchema.type || (itemSchema.properties ? 'object' : ''),
          format: propSchema.format || '',
          required: yesNo(requiredFields.has(propName)),
          nullable: yesNo(propSchema.nullable),
          deprecated: yesNo(propSchema.deprecated),
          readOnly: yesNo(propSchema.readOnly),
          writeOnly: yesNo(propSchema.writeOnly),
          description: propSchema.description || '',
          constraints: buildConstraints(propSchema),
          example: formatValue(propSchema.example),
          default: formatValue(propSchema.default),
          sourceRef: ctx.sourceRef,
          issues: variantLabel ? `variant: ${variantLabel}` : ''
        });

        // Flatten array items if they're objects
        if (itemSchema.type === 'object' || itemSchema.properties || itemSchema.allOf || itemSchema.oneOf || itemSchema.anyOf) {
          const itemSchemaName = getSchemaName(itemSchema) || propSchemaName;
          const newCtx = { ...ctx, requiredFields: new Set(itemSchema.required || []) };
          results.push(...flattenSchema(itemSchema, arrayPath, newCtx, itemSchemaName, variantLabel, new Set(visited)));
        }
      } else {
        // Primitive property
        results.push({
          operationId: ctx.operationId,
          method: ctx.method,
          path: ctx.path,
          tags: ctx.tags,
          summary: ctx.summary,
          location: ctx.location,
          httpStatus: ctx.httpStatus,
          mediaType: ctx.mediaType,
          schemaName: propSchemaName,
          fieldPath: propPath,
          fieldName: propName,
          type: propSchema.type || '',
          itemType: '',
          format: propSchema.format || '',
          required: yesNo(requiredFields.has(propName)),
          nullable: yesNo(propSchema.nullable),
          deprecated: yesNo(propSchema.deprecated),
          readOnly: yesNo(propSchema.readOnly),
          writeOnly: yesNo(propSchema.writeOnly),
          description: propSchema.description || '',
          constraints: buildConstraints(propSchema),
          example: formatValue(propSchema.example),
          default: formatValue(propSchema.default),
          sourceRef: ctx.sourceRef,
          issues: variantLabel ? `variant: ${variantLabel}` : ''
        });
      }
    }

    return results;
  }

  // Handle primitive schema at root level (unusual but possible)
  if (schema.type && !schema.properties && !schema.items) {
    const fieldName = fieldPath.split('.').pop() || fieldPath || 'value';
    results.push({
      operationId: ctx.operationId,
      method: ctx.method,
      path: ctx.path,
      tags: ctx.tags,
      summary: ctx.summary,
      location: ctx.location,
      httpStatus: ctx.httpStatus,
      mediaType: ctx.mediaType,
      schemaName: parentSchemaName,
      fieldPath: fieldPath,
      fieldName: fieldName,
      type: schema.type,
      itemType: '',
      format: schema.format || '',
      required: yesNo(ctx.requiredFields.has(fieldName)),
      nullable: yesNo(schema.nullable),
      deprecated: yesNo(schema.deprecated),
      readOnly: yesNo(schema.readOnly),
      writeOnly: yesNo(schema.writeOnly),
      description: schema.description || '',
      constraints: buildConstraints(schema),
      example: formatValue(schema.example),
      default: formatValue(schema.default),
      sourceRef: ctx.sourceRef,
      issues: issues.join('; ')
    });
  }

  return results;
}

function processParameter(
  param: Parameter,
  ctx: Omit<FlattenContext, 'location' | 'httpStatus' | 'mediaType' | 'sourceRef' | 'requiredFields'>
): FieldInstance[] {
  const results: FieldInstance[] = [];
  const locationMap: Record<string, string> = {
    query: 'query_param',
    header: 'header_param',
    path: 'path_param',
    cookie: 'cookie_param'
  };

  const location = locationMap[param.in] || param.in;
  const schema = param.schema || {};
  const schemaName = getSchemaName(schema);

  results.push({
    operationId: ctx.operationId,
    method: ctx.method,
    path: ctx.path,
    tags: ctx.tags,
    summary: ctx.summary,
    location: location,
    httpStatus: '',
    mediaType: '',
    schemaName: schemaName,
    fieldPath: param.name,
    fieldName: param.name,
    type: schema.type || '',
    itemType: schema.items?.type || '',
    format: schema.format || '',
    required: yesNo(param.required),
    nullable: yesNo(schema.nullable),
    deprecated: yesNo(param.deprecated),
    readOnly: yesNo(schema.readOnly),
    writeOnly: yesNo(schema.writeOnly),
    description: param.description || schema.description || '',
    constraints: buildConstraints(schema),
    example: formatValue(schema.example),
    default: formatValue(schema.default),
    sourceRef: `parameters.${param.name}`,
    issues: ''
  });

  return results;
}

function sanitizeOperationId(method: string, path: string): string {
  return `${method}_${path.replace(/[^a-zA-Z0-9]/g, '_')}`.replace(/_+/g, '_');
}

async function generateDataDictionary(): Promise<void> {
  const specsDir = path.join(__dirname, '..', 'docs', 'specs');
  const publicDir = path.join(__dirname, '..', 'docs');

  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }

  const specFiles = fs.readdirSync(specsDir)
    .filter(f => f.endsWith('.yaml') || f.endsWith('.yml'))
    .sort();

  if (specFiles.length === 0) {
    console.error(`No YAML spec files found in ${specsDir}`);
    process.exit(1);
  }

  const manifest: Array<{ key: string; title: string; version: string }> = [];

  for (const specFile of specFiles) {
    const specPath = path.join(specsDir, specFile);
    const key = path.basename(specFile, path.extname(specFile));

    console.log(`\nProcessing: ${specFile}`);

    const api = await SwaggerParser.dereference(specPath) as OpenAPISpec;
    console.log(`Parsed: ${api.info.title} v${api.info.version}`);

    const fieldInstances: FieldInstance[] = [];
    const endpoints: EndpointSummary[] = [];
    const schemas: SchemaSummary[] = [];

    // Process paths
    for (const [pathUrl, pathItem] of Object.entries(api.paths)) {
      const pathParams = pathItem.parameters || [];

      const methods = ['get', 'post', 'put', 'patch', 'delete'] as const;

      for (const method of methods) {
        const operation = pathItem[method];
        if (!operation) continue;

        const operationId = operation.operationId || sanitizeOperationId(method, pathUrl);
        const tags = (operation.tags || []).join(', ');
        const summary = operation.summary || '';
        const description = operation.description || '';

        // Collect request media types
        const requestMediaTypes: string[] = [];
        if (operation.requestBody?.content) {
          requestMediaTypes.push(...Object.keys(operation.requestBody.content));
        }

        // Collect response codes and media types
        const responseCodesAndMediaTypes: string[] = [];
        if (operation.responses) {
          for (const [code, response] of Object.entries(operation.responses)) {
            const mediaTypes = response.content ? Object.keys(response.content) : [];
            if (mediaTypes.length > 0) {
              responseCodesAndMediaTypes.push(`${code}: ${mediaTypes.join(', ')}`);
            } else {
              responseCodesAndMediaTypes.push(code);
            }
          }
        }

        // Count parameters
        const allParams = [...pathParams, ...(operation.parameters || [])];

        // Add endpoint summary
        endpoints.push({
          method: method.toUpperCase(),
          path: pathUrl,
          operationId,
          tags,
          summary,
          description,
          requestMediaTypes: requestMediaTypes.join(', '),
          responseCodesAndMediaTypes: responseCodesAndMediaTypes.join('; '),
          parameterCount: allParams.length
        });

        const baseCtx = {
          operationId,
          method: method.toUpperCase(),
          path: pathUrl,
          tags,
          summary
        };

        // Process parameters (path-level + operation-level)
        for (const param of allParams) {
          fieldInstances.push(...processParameter(param, baseCtx));
        }

        // Process request body
        if (operation.requestBody?.content) {
          for (const [mediaType, mediaTypeObj] of Object.entries(operation.requestBody.content)) {
            if (mediaTypeObj.schema) {
              const schemaName = getSchemaName(mediaTypeObj.schema);
              const ctx: FlattenContext = {
                ...baseCtx,
                location: 'request_body',
                httpStatus: '',
                mediaType,
                sourceRef: `requestBody.content.${mediaType}.schema`,
                requiredFields: new Set(mediaTypeObj.schema.required || [])
              };

              fieldInstances.push(...flattenSchema(mediaTypeObj.schema, '', ctx, schemaName));
            }
          }
        }

        // Process responses
        if (operation.responses) {
          for (const [statusCode, response] of Object.entries(operation.responses)) {
            if (response.content) {
              for (const [mediaType, mediaTypeObj] of Object.entries(response.content)) {
                if (mediaTypeObj.schema) {
                  const schemaName = getSchemaName(mediaTypeObj.schema);
                  const ctx: FlattenContext = {
                    ...baseCtx,
                    location: 'response_body',
                    httpStatus: statusCode,
                    mediaType,
                    sourceRef: `responses.${statusCode}.content.${mediaType}.schema`,
                    requiredFields: new Set(mediaTypeObj.schema.required || [])
                  };

                  fieldInstances.push(...flattenSchema(mediaTypeObj.schema, '', ctx, schemaName));
                }
              }
            }
          }
        }
      }
    }

    // Process component schemas for summary
    if (api.components?.schemas) {
      for (const [name, schema] of Object.entries(api.components.schemas)) {
        const propCount = schema.properties ? Object.keys(schema.properties).length : 0;
        schemas.push({
          name,
          type: schema.type || (schema.allOf ? 'allOf' : schema.oneOf ? 'oneOf' : schema.anyOf ? 'anyOf' : 'unknown'),
          description: schema.description || '',
          propertyCount: propCount,
          required: (schema.required || []).join(', ')
        });
      }
    }

    // Sort field instances deterministically
    fieldInstances.sort((a, b) => {
      const pathCmp = a.path.localeCompare(b.path);
      if (pathCmp !== 0) return pathCmp;

      const methodCmp = a.method.localeCompare(b.method);
      if (methodCmp !== 0) return methodCmp;

      const locationOrder = ['path_param', 'query_param', 'header_param', 'cookie_param', 'request_body', 'response_body'];
      const locCmp = locationOrder.indexOf(a.location) - locationOrder.indexOf(b.location);
      if (locCmp !== 0) return locCmp;

      const statusCmp = a.httpStatus.localeCompare(b.httpStatus);
      if (statusCmp !== 0) return statusCmp;

      return a.fieldPath.localeCompare(b.fieldPath);
    });

    // Sort endpoints
    endpoints.sort((a, b) => {
      const pathCmp = a.path.localeCompare(b.path);
      if (pathCmp !== 0) return pathCmp;
      return a.method.localeCompare(b.method);
    });

    // Sort schemas
    schemas.sort((a, b) => a.name.localeCompare(b.name));

    // Generate JSON output
    const jsonOutput = {
      generatedAt: new Date().toISOString(),
      source: specPath,
      apiInfo: {
        title: api.info.title,
        version: api.info.version,
        description: api.info.description
      },
      fieldInstances,
      endpoints,
      schemas
    };

    const jsonPath = path.join(publicDir, `data-dictionary-${key}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(jsonOutput, null, 2));
    console.log(`Generated: ${jsonPath} (${fieldInstances.length} field instances)`);

    // Generate Excel output
    const workbook = XLSX.utils.book_new();

    const fieldInstancesSheet = XLSX.utils.json_to_sheet(fieldInstances);
    XLSX.utils.book_append_sheet(workbook, fieldInstancesSheet, 'Field Instances');

    const endpointsSheet = XLSX.utils.json_to_sheet(endpoints);
    XLSX.utils.book_append_sheet(workbook, endpointsSheet, 'Endpoints');

    const schemasSheet = XLSX.utils.json_to_sheet(schemas);
    XLSX.utils.book_append_sheet(workbook, schemasSheet, 'Schemas');

    const xlsxPath = path.join(publicDir, `data-dictionary-${key}.xlsx`);
    XLSX.writeFile(workbook, xlsxPath);
    console.log(`Generated: ${xlsxPath}`);

    manifest.push({ key, title: api.info.title, version: api.info.version });
  }

  // Write manifest
  const manifestPath = path.join(publicDir, 'data-dictionary-manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`\nGenerated manifest: ${manifestPath} (${manifest.length} specs)`);

  // Generate HTML
  const publicHtmlPath = path.join(publicDir, 'data-dictionary.html');
  generateHtml(publicHtmlPath);
  console.log(`Generated: ${publicHtmlPath}`);

  console.log('\nData dictionary generation complete!');
}

function generateHtml(outputPath: string): void {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>API Data Dictionary</title>
  <link href="https://unpkg.com/tabulator-tables@5.5.0/dist/css/tabulator.min.css" rel="stylesheet">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="./css/custom.css">
  <link rel="icon" type="image/png" href="./favicon-32x32.png" sizes="32x32" />
  <link rel="icon" type="image/png" href="./favicon-16x16.png" sizes="16x16" />
  <style>
    :root {
      --navy: #001a3e;
      --navy-dark: #05244c;
      --blue-accent: #1485e0;
      --blue-light: #e8f4fc;
      --cyan: #00d084;
      --white: #ffffff;
      --gray-50: #f8fafc;
      --gray-100: #f1f6fa;
      --gray-200: #e2e8f0;
      --gray-300: #D2E2EF;
      --gray-500: #757575;
      --gray-600: #405368;
      --radius-sm: 8px;
      --radius-md: 12px;
      --radius-lg: 24px;
      --radius-full: 9999px;
      --shadow: 0 4px 6px -1px rgba(0, 26, 62, 0.1), 0 2px 4px -2px rgba(0, 26, 62, 0.1);
      --shadow-lg: 0 20px 40px -12px rgba(0, 26, 62, 0.15);
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: var(--gray-100);
      color: var(--gray-600);
      min-height: 100vh;
      line-height: 1.6;
      -webkit-font-smoothing: antialiased;
    }

    .page-wrapper {
      padding: 40px;
      max-width: 100%;
    }

    /* Header */
    .page-wrapper header {
      background: var(--navy);
      color: var(--white);
      padding: 48px;
      border-radius: var(--radius-lg) var(--radius-lg) 0 0;
      position: relative;
      overflow: hidden;
    }

    .page-wrapper header::before {
      content: '';
      position: absolute;
      top: 0;
      right: 0;
      width: 50%;
      height: 100%;
      background: linear-gradient(135deg, transparent 0%, rgba(20, 133, 224, 0.1) 100%);
      pointer-events: none;
    }

    .header-content {
      position: relative;
      z-index: 1;
    }

    .header-text h1 {
      font-size: 2.25rem;
      font-weight: 700;
      letter-spacing: -0.02em;
      margin-bottom: 20px;
      color: var(--white);
    }

    .meta {
      display: flex;
      gap: 24px;
      flex-wrap: wrap;
    }

    .meta-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 14px 20px;
      background: rgba(255, 255, 255, 0.1);
      backdrop-filter: blur(10px);
      border-radius: var(--radius-md);
      border: 1px solid rgba(255, 255, 255, 0.15);
    }

    .meta-item .icon {
      width: 40px;
      height: 40px;
      border-radius: var(--radius-sm);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.25rem;
      background: rgba(20, 133, 224, 0.3);
    }

    .meta-item .label {
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: rgba(255, 255, 255, 0.7);
      margin-bottom: 2px;
    }

    .meta-item .value {
      font-weight: 600;
      color: var(--white);
      font-size: 0.95rem;
    }

    .spec-selector-select {
      background: rgba(255, 255, 255, 0.15) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='white'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E") no-repeat right 10px center;
      background-size: 16px;
      border: 1px solid rgba(255, 255, 255, 0.3);
      border-radius: var(--radius-sm);
      color: var(--white);
      font-family: inherit;
      font-size: 0.9rem;
      font-weight: 600;
      padding: 6px 32px 6px 12px;
      cursor: pointer;
      appearance: none;
      min-width: 220px;
    }

    .spec-selector-select:focus {
      outline: none;
      border-color: rgba(255, 255, 255, 0.7);
    }

    .spec-selector-select option {
      background: var(--navy-dark);
      color: var(--white);
    }

    /* Main card */
    .main-card {
      background: var(--white);
      border-radius: 0 0 var(--radius-lg) var(--radius-lg);
      box-shadow: var(--shadow-lg);
      overflow: hidden;
    }

    /* Tab navigation */
    .tab-navigation {
      display: flex;
      gap: 8px;
      padding: 20px 32px;
      background: var(--gray-50);
      border-bottom: 1px solid var(--gray-200);
    }

    .tab-btn {
      padding: 12px 24px;
      border: none;
      background: transparent;
      color: var(--gray-500);
      font-family: inherit;
      font-size: 0.9rem;
      font-weight: 600;
      cursor: pointer;
      border-radius: var(--radius-full);
      transition: all 0.2s ease;
    }

    .tab-btn:hover {
      color: var(--navy-dark);
      background: var(--gray-200);
    }

    .tab-btn.active {
      color: var(--white);
      background: var(--blue-accent);
      box-shadow: 0 4px 12px rgba(20, 133, 224, 0.3);
    }

    /* Controls */
    .controls {
      padding: 24px 32px;
      display: flex;
      flex-wrap: wrap;
      gap: 16px;
      align-items: center;
      background: var(--white);
      border-bottom: 1px solid var(--gray-200);
    }

    .search-wrapper {
      position: relative;
      flex: 1;
      min-width: 280px;
      max-width: 400px;
    }

    .search-wrapper::before {
      content: '';
      position: absolute;
      left: 16px;
      top: 50%;
      transform: translateY(-50%);
      width: 20px;
      height: 20px;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23757575'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z'/%3E%3C/svg%3E");
      background-size: contain;
      pointer-events: none;
    }

    .controls input[type="text"] {
      width: 100%;
      padding: 14px 20px 14px 48px;
      background: var(--gray-50);
      border: 2px solid var(--gray-200);
      border-radius: var(--radius-full);
      color: var(--navy-dark);
      font-family: inherit;
      font-size: 0.95rem;
      transition: all 0.2s ease;
    }

    .controls input[type="text"]:focus {
      outline: none;
      border-color: var(--blue-accent);
      background: var(--white);
      box-shadow: 0 0 0 4px rgba(20, 133, 224, 0.1);
    }

    .controls input[type="text"]::placeholder {
      color: var(--gray-500);
    }

    .controls select {
      padding: 14px 44px 14px 18px;
      background: var(--gray-50) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23757575'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E") no-repeat right 14px center;
      background-size: 18px;
      border: 2px solid var(--gray-200);
      border-radius: var(--radius-full);
      color: var(--navy-dark);
      font-family: inherit;
      font-size: 0.9rem;
      font-weight: 500;
      cursor: pointer;
      min-width: 160px;
      appearance: none;
      transition: all 0.2s ease;
    }

    .controls select:focus {
      outline: none;
      border-color: var(--blue-accent);
      background-color: var(--white);
      box-shadow: 0 0 0 4px rgba(20, 133, 224, 0.1);
    }

    .controls select:hover {
      border-color: var(--gray-300);
    }

    .download-btn {
      background: var(--blue-accent);
      color: var(--white);
      border: none;
      padding: 14px 28px;
      border-radius: var(--radius-full);
      cursor: pointer;
      font-family: inherit;
      font-size: 0.9rem;
      font-weight: 600;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      gap: 10px;
      transition: all 0.2s ease;
      margin-left: auto;
    }

    .download-btn:hover {
      background: var(--navy);
      transform: translateY(-2px);
      box-shadow: 0 8px 20px rgba(0, 26, 62, 0.2);
    }

    .download-btn:active {
      transform: translateY(0);
    }

    .download-btn::before {
      content: '';
      width: 18px;
      height: 18px;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='white' stroke-width='2.5'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' d='M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4'/%3E%3C/svg%3E");
      background-size: contain;
    }

    /* Stats bar */
    .stats-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 14px 32px;
      background: var(--blue-light);
      border-bottom: 1px solid var(--gray-300);
      flex-wrap: wrap;
      gap: 12px;
    }

    .stats {
      font-size: 0.875rem;
      font-weight: 600;
      color: var(--navy-dark);
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .stats::before {
      content: '';
      width: 8px;
      height: 8px;
      background: var(--cyan);
      border-radius: 50%;
      animation: pulse 2s ease-in-out infinite;
    }

    .table-hint {
      font-size: 0.75rem;
      color: var(--gray-500);
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .table-hint::before {
      content: '';
      width: 16px;
      height: 16px;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23757575'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z'/%3E%3C/svg%3E");
      background-size: contain;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }

    /* Table container */
    .table-container {
      background: var(--white);
    }

    #data-table {
      font-size: 0.85rem;
    }

    /* Tabulator Theme Override */
    .tabulator {
      background: var(--white);
      border: none;
      font-family: 'Inter', sans-serif;
    }

    .tabulator .tabulator-header {
      background: var(--gray-50);
      border-bottom: 2px solid var(--gray-200);
    }

    .tabulator .tabulator-header .tabulator-col {
      background: transparent;
      border-right: 1px solid var(--gray-200);
    }

    .tabulator .tabulator-header .tabulator-col:last-child {
      border-right: none;
    }

    .tabulator .tabulator-header .tabulator-col .tabulator-col-content {
      padding: 16px;
    }

    .tabulator .tabulator-header .tabulator-col .tabulator-col-title {
      font-weight: 700;
      color: var(--navy-dark);
      font-size: 0.7rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }

    /* Column resize handle */
    .tabulator .tabulator-header .tabulator-col .tabulator-col-resize-handle {
      width: 8px;
      right: -4px;
      background: transparent;
      transition: background 0.15s ease;
    }

    .tabulator .tabulator-header .tabulator-col .tabulator-col-resize-handle:hover {
      background: var(--blue-accent);
      cursor: col-resize;
    }

    .tabulator .tabulator-header .tabulator-col.tabulator-col-resizing {
      background: var(--blue-light);
    }

    .tabulator .tabulator-header .tabulator-col.tabulator-col-resizing .tabulator-col-resize-handle {
      background: var(--blue-accent);
    }

    /* Resize guide line */
    .tabulator .tabulator-col-resize-guide {
      background: var(--blue-accent);
      width: 2px;
      opacity: 0.8;
    }

    .tabulator .tabulator-tableholder .tabulator-table {
      background: var(--white);
      color: var(--gray-600);
    }

    .tabulator-row {
      background: var(--white) !important;
      border-bottom: 1px solid var(--gray-200);
      transition: all 0.15s ease;
    }

    .tabulator-row:hover {
      background: var(--blue-light) !important;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
      position: relative;
      z-index: 1;
    }

    .tabulator-row.tabulator-row-even {
      background: var(--gray-50) !important;
    }

    .tabulator-row.tabulator-row-even:hover {
      background: var(--blue-light) !important;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
      position: relative;
      z-index: 1;
    }

    .tabulator-row .tabulator-cell {
      padding: 14px 16px;
      border-right: none;
      color: var(--gray-600);
    }

    .tabulator .tabulator-footer {
      background: var(--gray-50);
      border-top: 2px solid var(--gray-200);
      padding: 16px 20px;
    }

    .tabulator .tabulator-footer .tabulator-page {
      background: var(--white);
      border: 2px solid var(--gray-200);
      border-radius: var(--radius-sm);
      color: var(--gray-600);
      padding: 8px 14px;
      margin: 0 4px;
      font-weight: 600;
      font-family: inherit;
      transition: all 0.15s ease;
    }

    .tabulator .tabulator-footer .tabulator-page:hover {
      border-color: var(--blue-accent);
      color: var(--blue-accent);
    }

    .tabulator .tabulator-footer .tabulator-page.active {
      background: var(--blue-accent);
      border-color: var(--blue-accent);
      color: var(--white);
    }

    .tabulator .tabulator-header .tabulator-col .tabulator-header-filter input {
      background: var(--white);
      border: 2px solid var(--gray-200);
      border-radius: var(--radius-sm);
      padding: 8px 12px;
      font-size: 0.75rem;
      font-family: inherit;
      color: var(--navy-dark);
      transition: all 0.15s ease;
    }

    .tabulator .tabulator-header .tabulator-col .tabulator-header-filter input:focus {
      outline: none;
      border-color: var(--blue-accent);
      box-shadow: 0 0 0 3px rgba(20, 133, 224, 0.1);
    }

    .tabulator .tabulator-footer .tabulator-paginator {
      color: var(--gray-600);
      font-family: inherit;
    }

    /* Loading state */
    .loading {
      text-align: center;
      padding: 80px 40px;
      color: var(--gray-500);
    }

    .loading::before {
      content: '';
      display: block;
      width: 48px;
      height: 48px;
      margin: 0 auto 20px;
      border: 4px solid var(--gray-200);
      border-top-color: var(--blue-accent);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    /* Error state */
    .error {
      background: #fef2f2;
      color: #dc2626;
      padding: 24px;
      border-radius: var(--radius-md);
      margin: 24px;
      border: 2px solid #fecaca;
      font-weight: 600;
    }

    /* Responsive */
    @media (max-width: 1024px) {
      .page-wrapper {
        padding: 24px;
      }

      .page-wrapper header {
        padding: 32px;
      }

      .header-text h1 {
        font-size: 1.75rem;
      }

      .controls {
        padding: 20px 24px;
      }

      .tab-navigation {
        padding: 16px 24px;
        overflow-x: auto;
      }
    }

    @media (max-width: 768px) {
      .page-wrapper {
        padding: 16px;
      }

      .page-wrapper header {
        padding: 24px;
        border-radius: var(--radius-md) var(--radius-md) 0 0;
      }

      .header-text h1 {
        font-size: 1.5rem;
      }

      .meta {
        flex-direction: column;
        gap: 12px;
      }

      .main-card {
        border-radius: 0 0 var(--radius-md) var(--radius-md);
      }

      .search-wrapper {
        min-width: 100%;
        max-width: 100%;
      }

      .controls select {
        flex: 1;
        min-width: 0;
      }

      .download-btn {
        width: 100%;
        justify-content: center;
        margin-left: 0;
      }

      .tab-btn {
        padding: 10px 18px;
        font-size: 0.85rem;
      }
    }
  </style>
</head>
<body>
  <header class="site-header">
    <div class="container">
      <nav class="main-nav">
        <ul>
          <li><a href="index.html">API Documentation</a></li>
          <li><a href="data-dictionary.html" class="active">Data Dictionary</a></li>
          <li class="nav-dropdown">
            <a href="#" class="nav-dropdown-toggle">Working Groups</a>
            <ul class="nav-dropdown-menu">
              <li><a href="https://github.com/Insured-Retirement-Institute/Application-Status" target="_blank">Application Status</a></li>
              <li><a href="https://github.com/Insured-Retirement-Institute/Producer-Training" target="_blank">Producer Training</a></li>
              <li><a href="https://github.com/Insured-Retirement-Institute/Activated-Annuity-Income" target="_blank">Policy Income</a></li>
              <li><a href="https://github.com/Insured-Retirement-Institute/One-Time-Withdrawals" target="_blank">One-Time Withdrawals</a></li>
              <li><a href="https://github.com/Insured-Retirement-Institute/One-Time-Withdrawal-Quote" target="_blank">One-Time Withdrawal Quote</a></li>
              <li><a href="https://github.com/Insured-Retirement-Institute/Systematic-Program" target="_blank">Systematic Program</a></li>
            </ul>
          </li>
        </ul>
      </nav>
    </div>
  </header>

  <div class="page-wrapper">
    <header>
      <div class="header-content">
        <div class="header-text">
          <h1>API Data Dictionary</h1>
          <div class="meta">
            <div class="meta-item">
              <div class="icon">&#128203;</div>
              <div>
                <div class="label">Specification</div>
                <select id="spec-selector" class="spec-selector-select">
                  <option value="">Loading specs...</option>
                </select>
              </div>
            </div>
            <div class="meta-item">
              <div class="icon">&#128337;</div>
              <div>
                <div class="label">Generated</div>
                <div class="value" id="generated-at">—</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>

    <div class="main-card">
      <div class="tab-navigation">
        <button class="tab-btn active" data-tab="fields">Field Instances</button>
        <button class="tab-btn" data-tab="endpoints">Endpoints</button>
        <button class="tab-btn" data-tab="schemas">Schemas</button>
      </div>

      <div class="controls">
        <div class="search-wrapper">
          <input type="text" id="search" placeholder="Search all columns...">
        </div>
        <select id="filter-method">
          <option value="">All Methods</option>
          <option value="GET">GET</option>
          <option value="POST">POST</option>
          <option value="PUT">PUT</option>
          <option value="PATCH">PATCH</option>
          <option value="DELETE">DELETE</option>
        </select>
        <select id="filter-location">
          <option value="">All Locations</option>
          <option value="path_param">Path Parameter</option>
          <option value="query_param">Query Parameter</option>
          <option value="header_param">Header Parameter</option>
          <option value="request_body">Request Body</option>
          <option value="response_body">Response Body</option>
        </select>
        <select id="filter-status">
          <option value="">All Status Codes</option>
        </select>
        <a href="#" class="download-btn" download>Download Excel</a>
      </div>

      <div class="stats-row">
        <div class="stats" id="stats">Loading data...</div>
        <div class="table-hint">Drag column edges to resize &bull; Drag headers to reorder</div>
      </div>

      <div class="table-container">
        <div id="data-table"></div>
      </div>
    </div>
  </div>

  <script src="https://unpkg.com/tabulator-tables@5.5.0/dist/js/tabulator.min.js"></script>
  <script>
    let data = null;
    let table = null;
    let currentTab = 'fields';
    let currentManifest = [];
    let isAllSpecs = false;

    const specColumn = {title: "Specification", field: "specification", headerFilter: true, width: 220};

    const fieldColumns = [
      {title: "Operation ID", field: "operationId", headerFilter: true, width: 180},
      {title: "Method", field: "method", headerFilter: true, width: 80},
      {title: "Path", field: "path", headerFilter: true, width: 250},
      {title: "Location", field: "location", headerFilter: true, width: 120},
      {title: "HTTP Status", field: "httpStatus", headerFilter: true, width: 100},
      {title: "Field Path", field: "fieldPath", headerFilter: true, width: 200},
      {title: "Field Name", field: "fieldName", headerFilter: true, width: 150},
      {title: "Type", field: "type", headerFilter: true, width: 80},
      {title: "Item Type", field: "itemType", width: 80},
      {title: "Format", field: "format", width: 100},
      {title: "Required", field: "required", headerFilter: true, width: 80},
      {title: "Nullable", field: "nullable", width: 80},
      {title: "Description", field: "description", width: 300},
      {title: "Constraints", field: "constraints", width: 200},
      {title: "Example", field: "example", width: 150},
      {title: "Default", field: "default", width: 100},
      {title: "Schema Name", field: "schemaName", width: 150},
      {title: "Deprecated", field: "deprecated", width: 90},
      {title: "Read Only", field: "readOnly", width: 90},
      {title: "Write Only", field: "writeOnly", width: 90},
      {title: "Tags", field: "tags", width: 150},
      {title: "Source Ref", field: "sourceRef", width: 200},
      {title: "Issues", field: "issues", width: 150}
    ];

    const endpointColumns = [
      {title: "Method", field: "method", headerFilter: true, width: 80},
      {title: "Path", field: "path", headerFilter: true, width: 300},
      {title: "Operation ID", field: "operationId", headerFilter: true, width: 200},
      {title: "Tags", field: "tags", headerFilter: true, width: 150},
      {title: "Summary", field: "summary", width: 300},
      {title: "Description", field: "description", width: 400},
      {title: "Request Media Types", field: "requestMediaTypes", width: 200},
      {title: "Response Codes", field: "responseCodesAndMediaTypes", width: 250},
      {title: "Param Count", field: "parameterCount", width: 100}
    ];

    const schemaColumns = [
      {title: "Name", field: "name", headerFilter: true, width: 200},
      {title: "Type", field: "type", headerFilter: true, width: 100},
      {title: "Description", field: "description", width: 400},
      {title: "Property Count", field: "propertyCount", width: 120},
      {title: "Required Fields", field: "required", width: 300}
    ];

    async function loadManifest() {
      try {
        const response = await fetch('./data-dictionary-manifest.json');
        if (!response.ok) throw new Error('Failed to load spec manifest');
        const manifest = await response.json();

        currentManifest = manifest;
        const selector = document.getElementById('spec-selector');
        selector.innerHTML = '';

        const allOption = document.createElement('option');
        allOption.value = '__all__';
        allOption.textContent = 'All Specifications';
        selector.appendChild(allOption);

        manifest.forEach(spec => {
          const option = document.createElement('option');
          option.value = spec.key;
          option.textContent = \`\${spec.title} v\${spec.version}\`;
          selector.appendChild(option);
        });

        // Apply URL param if present
        const urlParams = new URLSearchParams(window.location.search);
        const specParam = urlParams.get('spec');
        if (specParam === '__all__' || (specParam && manifest.find(s => s.key === specParam))) {
          selector.value = specParam;
        }

        selector.addEventListener('change', () => {
          const key = selector.value;
          const url = new URL(window.location);
          url.searchParams.set('spec', key);
          window.history.pushState({}, '', url);
          loadData(key);
        });

        if (manifest.length > 0) {
          loadData(selector.value);
        }
      } catch (error) {
        document.getElementById('data-table').innerHTML =
          \`<div class="error">Error loading manifest: \${error.message}</div>\`;
      }
    }

    async function loadData(key) {
      try {
        if (key === '__all__') {
          isAllSpecs = true;
          const allFieldInstances = [];
          const allEndpoints = [];
          const allSchemas = [];
          let latestDate = null;

          await Promise.all(currentManifest.map(async (spec) => {
            const response = await fetch(\`./data-dictionary-\${spec.key}.json\`);
            if (!response.ok) return;
            const specData = await response.json();
            const specLabel = \`\${spec.title} v\${spec.version}\`;

            if (specData.generatedAt) {
              const d = new Date(specData.generatedAt);
              if (!latestDate || d > latestDate) latestDate = d;
            }

            specData.fieldInstances.forEach(row => {
              allFieldInstances.push({...row, specification: specLabel});
            });
            specData.endpoints.forEach(row => {
              allEndpoints.push({...row, specification: specLabel});
            });
            specData.schemas.forEach(row => {
              allSchemas.push({...row, specification: specLabel});
            });
          }));

          data = {
            fieldInstances: allFieldInstances,
            endpoints: allEndpoints,
            schemas: allSchemas,
            generatedAt: latestDate ? latestDate.toISOString() : null
          };

          // Hide download button for "All"
          const downloadBtn = document.querySelector('.download-btn');
          if (downloadBtn) downloadBtn.style.display = 'none';
        } else {
          isAllSpecs = false;
          const response = await fetch(\`./data-dictionary-\${key}.json\`);
          if (!response.ok) throw new Error('Failed to load data dictionary');
          data = await response.json();

          // Show download button
          const downloadBtn = document.querySelector('.download-btn');
          if (downloadBtn) {
            downloadBtn.style.display = '';
            downloadBtn.href = \`./data-dictionary-\${key}.xlsx\`;
          }
        }

        // Update header
        document.getElementById('generated-at').textContent =
          data.generatedAt ? \`Generated: \${new Date(data.generatedAt).toLocaleString()}\` : '—';

        // Repopulate status filter
        const statusSelect = document.getElementById('filter-status');
        statusSelect.innerHTML = '<option value="">All Status Codes</option>';
        const statusCodes = [...new Set(data.fieldInstances
          .map(f => f.httpStatus)
          .filter(s => s))];
        statusCodes.sort().forEach(code => {
          const option = document.createElement('option');
          option.value = code;
          option.textContent = code;
          statusSelect.appendChild(option);
        });

        renderTable();
      } catch (error) {
        document.getElementById('data-table').innerHTML =
          \`<div class="error">Error: \${error.message}</div>\`;
      }
    }

    function renderTable() {
      if (!data) return;

      let tableData, columns;
      switch (currentTab) {
        case 'fields':
          tableData = data.fieldInstances;
          columns = isAllSpecs ? [specColumn, ...fieldColumns] : fieldColumns;
          break;
        case 'endpoints':
          tableData = data.endpoints;
          columns = isAllSpecs ? [specColumn, ...endpointColumns] : endpointColumns;
          break;
        case 'schemas':
          tableData = data.schemas;
          columns = isAllSpecs ? [specColumn, ...schemaColumns] : schemaColumns;
          break;
      }

      if (table) {
        table.destroy();
      }

      table = new Tabulator("#data-table", {
        data: tableData,
        columns: columns,
        layout: "fitDataFill",
        pagination: "local",
        paginationSize: 50,
        paginationSizeSelector: [25, 50, 100, 200],
        movableColumns: true,
        resizableColumns: true,
        resizableColumnGuide: true,
        columnDefaults: {
          resizable: true,
          minWidth: 60
        },
        initialSort: currentTab === 'fields' ?
          [{column: "path", dir: "asc"}, {column: "method", dir: "asc"}] :
          [{column: "name", dir: "asc"}],
        placeholder: "No data available"
      });

      updateStats();
    }

    function updateStats() {
      if (!data || !table) return;

      const filtered = table.getDataCount("active");
      const total = table.getDataCount();

      let label;
      switch (currentTab) {
        case 'fields':
          label = 'field instances';
          break;
        case 'endpoints':
          label = 'endpoints';
          break;
        case 'schemas':
          label = 'schemas';
          break;
      }

      document.getElementById('stats').textContent =
        \`Showing \${filtered} of \${total} \${label}\`;
    }

    function applyFilters() {
      if (!table || currentTab !== 'fields') return;

      const filters = [];

      const search = document.getElementById('search').value;
      const method = document.getElementById('filter-method').value;
      const location = document.getElementById('filter-location').value;
      const status = document.getElementById('filter-status').value;

      if (method) filters.push({field: "method", type: "=", value: method});
      if (location) filters.push({field: "location", type: "=", value: location});
      if (status) filters.push({field: "httpStatus", type: "=", value: status});

      table.setFilter(filters);

      if (search) {
        table.addFilter(function(data) {
          const searchLower = search.toLowerCase();
          return Object.values(data).some(v =>
            String(v).toLowerCase().includes(searchLower)
          );
        });
      }

      updateStats();
    }

    // Event listeners
    document.getElementById('search').addEventListener('input', applyFilters);
    document.getElementById('filter-method').addEventListener('change', applyFilters);
    document.getElementById('filter-location').addEventListener('change', applyFilters);
    document.getElementById('filter-status').addEventListener('change', applyFilters);

    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', function() {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        currentTab = this.dataset.tab;
        renderTable();
      });
    });

    // Load manifest and data on page load
    loadManifest();

    // Working Groups dropdown
    const toggle = document.querySelector('.nav-dropdown-toggle');
    const menu = document.querySelector('.nav-dropdown-menu');
    if (toggle && menu) {
      toggle.addEventListener('click', function(e) {
        e.preventDefault();
        menu.classList.toggle('open');
      });
      document.addEventListener('click', function(e) {
        if (!e.target.closest('.nav-dropdown')) {
          menu.classList.remove('open');
        }
      });
    }
  </script>
</body>
</html>`;

  fs.writeFileSync(outputPath, html);
}

// Run the generator
generateDataDictionary().catch(error => {
  console.error('Error generating data dictionary:', error);
  process.exit(1);
});
