import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { includes } from './string.ts';

describe('helpers/string.ts', () => {
	describe('includes', () => {
		test('returns true when the substring is found', () => {
			assert.equal(includes('hello world', 'world'), true);
		});

		test('returns false when the substring is not found', () => {
			assert.equal(includes('hello world', 'xyz'), false);
		});

		test('returns false for non-string input', () => {
			assert.equal(includes(null as unknown as string, 'x'), false);
		});
	});
});
