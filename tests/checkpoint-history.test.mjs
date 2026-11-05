import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

// Match Checkpoint's json.dumps(ensure_ascii=False, sort_keys=True, separators=(',', ':')).
function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' +
    Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  return JSON.stringify(value);
}
const digest = value => createHash('sha256').update(canonical(value), 'utf8').digest('hex');
const current = JSON.parse(readFileSync('chatflow-0.3.tsm.json', 'utf8'));
const events = readFileSync('chatflow-0.3.tsm.history.jsonl', 'utf8')
  .split(/\r?\n/).filter(Boolean).map(JSON.parse);

test('Checkpoint history is cryptographically continuous and matches its document', () => {
  let active = [], redo = [], mutations = 0;
  for (const [i, event] of events.entries()) {
    if (event.type === 'mutation') {
      mutations += 1;
      assert.equal(event.id, 'm' + String(mutations).padStart(6, '0'), 'mutation id at ' + i);
      assert.equal(event.before_hash, digest(event.before), 'before hash at ' + i);
      assert.equal(event.after_hash, digest(event.after), 'after hash at ' + i);
      if (active.length) {
        assert.equal(event.before_hash, active.at(-1).after_hash, 'chain at ' + i);
        assert.deepEqual(event.before, active.at(-1).after, 'snapshot at ' + i);
      }
      active.push(event);
      redo = [];
    } else if (event.type === 'undo') {
      assert.equal(active.at(-1)?.id, event.target, 'undo at ' + i);
      redo.push(active.pop());
    } else if (event.type === 'redo') {
      assert.equal(redo.at(-1)?.id, event.target, 'redo at ' + i);
      active.push(redo.pop());
    } else {
      assert.fail('Unknown Checkpoint event at ' + i);
    }
  }
  assert.ok(active.length, 'checkpoint must have an active mutation');
  assert.equal(digest(current), active.at(-1).after_hash);
  assert.deepEqual(current, active.at(-1).after);
});
