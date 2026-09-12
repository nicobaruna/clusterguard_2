import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSosCategory, createSosEvent, isFallbackRequired } from './sos.ts';

test('parseSosCategory accepts valid emergency categories', () => {
  assert.equal(parseSosCategory('MEDIS'), 'MEDIS');
  assert.equal(parseSosCategory('BENCANA'), 'BENCANA');
  assert.equal(parseSosCategory('KEAMANAN'), 'KEAMANAN');
});

test('parseSosCategory rejects invalid categories', () => {
  assert.throws(() => parseSosCategory('FIRE'), /Invalid category/i);
});

test('fallback is required when a pending alert reaches 30 seconds', () => {
  const event = createSosEvent('MEDIS', 'user-1');
  const startedAt = Date.now() - 31_000;
  assert.equal(isFallbackRequired(event, startedAt), true);
});
