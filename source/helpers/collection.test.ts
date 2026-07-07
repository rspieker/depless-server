import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { includes } from './collection.ts';

describe('helpers/collection.ts', () => {
	describe('includes', () => {
		test('finds an item in an array', () => {
			assert.equal(includes([1, 2, 3], 2), true);
			assert.equal(includes([1, 2, 3], 4), false);
		});

		test('finds a substring in a string', () => {
			assert.equal(includes('hello world', 'world'), true);
			assert.equal(includes('hello world', 'xyz'), false);
		});

		test('finds a value in an object', () => {
			assert.equal(includes({ a: 1, b: 2 }, 2), true);
			assert.equal(includes({ a: 1, b: 2 }, 3), false);
		});

		test('returns false for non-collection input', () => {
			assert.equal(includes(null as unknown as string, 'x'), false);
		});
	});
});
