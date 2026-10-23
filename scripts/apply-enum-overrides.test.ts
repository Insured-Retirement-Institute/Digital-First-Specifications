/**
 * Unit tests for enum override merge logic.
 *
 * Modified by Cursor
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  applyEnumOverrideRules,
  mergeEnumValues,
  type EnumOverrideRule
} from './apply-enum-overrides.js';

const baseSchema = {
  type: 'object',
  properties: {
    relationships: {
      type: 'array',
      items: {
        type: 'string',
        enum: ['A', 'B', 'C']
      }
    }
  }
};

test('mergeEnumValues remove', () => {
  const result = mergeEnumValues(['A', 'B', 'C'], { pointer: '/', remove: ['B'] });
  assert.deepEqual(result, ['A', 'C']);
});

test('mergeEnumValues add', () => {
  const result = mergeEnumValues(['A', 'B', 'C'], { pointer: '/', add: ['D'] });
  assert.deepEqual(result, ['A', 'B', 'C', 'D']);
});

test('mergeEnumValues remove invalid throws', () => {
  assert.throws(() => mergeEnumValues(['A', 'B'], { pointer: '/', remove: ['Z'] }));
});

test('applyEnumOverrideRules on nested pointer', () => {
  const rules: EnumOverrideRule[] = [
    { pointer: '/properties/relationships/items', remove: ['B'] }
  ];
  const out = applyEnumOverrideRules(baseSchema, rules) as typeof baseSchema;
  assert.deepEqual(out.properties.relationships.items.enum, ['A', 'C']);
});

test('applyEnumOverrideRules set replaces enum', () => {
  const rules: EnumOverrideRule[] = [
    { pointer: '/properties/relationships/items', set: ['X', 'Y'] }
  ];
  const out = applyEnumOverrideRules(baseSchema, rules) as typeof baseSchema;
  assert.deepEqual(out.properties.relationships.items.enum, ['X', 'Y']);
});
