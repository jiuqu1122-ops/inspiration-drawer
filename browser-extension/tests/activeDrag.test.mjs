import assert from 'node:assert/strict';
import test from 'node:test';

import { ActiveDragStore } from '../src/background/activeDrag.js';

test('a new drag replaces the previous active drag', () => {
  const store = new ActiveDragStore();
  store.begin({ dragId: 'drag-one', image: { imageUrl: 'https://example.com/1.png' } }, 100);
  const previous = store.begin({ dragId: 'drag-two', image: { imageUrl: 'https://example.com/2.png' } }, 200);
  assert.equal(previous.dragId, 'drag-one');
  assert.equal(store.current(200).dragId, 'drag-two');
});

test('dragend only clears the matching active drag', () => {
  const store = new ActiveDragStore();
  store.begin({ dragId: 'drag-current', image: {} }, 100);
  assert.equal(store.clear('drag-other'), null);
  assert.equal(store.current(100).dragId, 'drag-current');
  assert.equal(store.clear('drag-current').dragId, 'drag-current');
  assert.equal(store.current(100), null);
});

test('active drag expires after the configured timeout', () => {
  const store = new ActiveDragStore(30_000);
  store.begin({ dragId: 'drag-expiring', image: {} }, 1000);
  assert.equal(store.current(30_999).dragId, 'drag-expiring');
  assert.equal(store.current(31_001), null);
});
