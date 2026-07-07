import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { Reply } from './reply.ts';

describe('server/reply.ts', () => {
	describe('Reply', () => {
		test('stores data', () => {
			assert.deepEqual(new Reply({ hello: 'world' }).data, { hello: 'world' });
		});

		test('defaults to status 200', () => {
			assert.equal(new Reply(null).status, 200);
		});

		test('defaults to no headers', () => {
			assert.deepEqual(new Reply(null).headers, {});
		});

		test('code() sets the status', () => {
			assert.equal(new Reply(null).code(201).status, 201);
		});

		test('code() returns this for chaining', () => {
			const r = new Reply(null);
			assert.equal(r.code(201), r);
		});

		test('header() sets a header', () => {
			assert.equal(new Reply(null).header('X-Foo', 'bar').headers['X-Foo'], 'bar');
		});

		test('header() returns this for chaining', () => {
			const r = new Reply(null);
			assert.equal(r.header('X-Foo', 'bar'), r);
		});

		test('type() sets Content-Type', () => {
			assert.equal(new Reply(null).type('text/plain').headers['Content-Type'], 'text/plain');
		});

		test('headers getter returns a copy — mutation does not affect the reply', () => {
			const r = new Reply(null).header('X-Foo', 'original');
			r.headers['X-Foo'] = 'mutated';
			assert.equal(r.headers['X-Foo'], 'original');
		});

		test('chaining: code().header().type()', () => {
			const r = new Reply('body').code(201).header('X-A', '1').type('text/plain');
			assert.equal(r.status, 201);
			assert.equal(r.data, 'body');
			assert.equal(r.headers['X-A'], '1');
			assert.equal(r.headers['Content-Type'], 'text/plain');
		});
	});
});
