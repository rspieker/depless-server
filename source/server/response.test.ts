import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { empty, flush, isSent, json, pending, send, withRestaging } from './response.ts';

function mockResponse() {
	const headers: Record<string, string | number> = {};
	let statusCode = 200;
	let ended = false;
	let endedWith: Buffer | string | undefined;

	return {
		get statusCode() { return statusCode; },
		set statusCode(v: number) { statusCode = v; },
		setHeader(name: string, value: string | number) { headers[name.toLowerCase()] = value; },
		getHeader(name: string) { return headers[name.toLowerCase()]; },
		end(data?: Buffer | string) { ended = true; endedWith = data; },
		// inspection
		get _headers() { return headers; },
		get _ended() { return ended; },
		get _body() { return endedWith; },
		get _status() { return statusCode; },
	};
}

describe('server/response.ts', () => {
	describe('isSent()', () => {
		test('returns false before any send', () => {
			assert.equal(isSent(mockResponse()), false);
		});
	});

	describe('send()', () => {
		test('marks as sent, but does not flush to the socket', () => {
			const res = mockResponse();
			send(res, 'hello');
			assert.equal(isSent(res), true);
			assert.equal(res._ended, false);
		});

		test('sets Content-Length immediately', () => {
			const res = mockResponse();
			send(res, 'hello');
			assert.equal(res._headers['content-length'], 5);
		});

		test('stages the status code when provided', () => {
			const res = mockResponse();
			send(res, '', 201);
			flush(res);
			assert.equal(res._status, 201);
		});

		test('accepts a Buffer', () => {
			const res = mockResponse();
			send(res, Buffer.from('hi'));
			assert.equal(res._headers['content-length'], 2);
		});

		test('is idempotent — second call is ignored', () => {
			const res = mockResponse();
			send(res, 'first');
			send(res, 'second');
			flush(res);
			assert.equal(String(res._body), 'first');
		});
	});

	describe('json()', () => {
		test('sets Content-Type immediately', () => {
			const res = mockResponse();
			json(res, {});
			assert.equal(res._headers['content-type'], 'application/json');
		});

		test('stages the data as JSON', () => {
			const res = mockResponse();
			json(res, { x: 1 });
			flush(res);
			assert.equal(res._body?.toString(), '{"x":1}');
		});

		test('stages the status code when provided', () => {
			const res = mockResponse();
			json(res, null, 404);
			flush(res);
			assert.equal(res._status, 404);
		});

		test('is idempotent — second call is ignored', () => {
			const res = mockResponse();
			json(res, { n: 1 });
			json(res, { n: 2 });
			flush(res);
			assert.equal(res._body?.toString(), '{"n":1}');
		});
	});

	describe('empty()', () => {
		test('stages no body', () => {
			const res = mockResponse();
			empty(res);
			flush(res);
			assert.equal(res._body, undefined);
			assert.equal(res._ended, true);
		});

		test('defaults to status 204', () => {
			const res = mockResponse();
			empty(res);
			flush(res);
			assert.equal(res._status, 204);
		});

		test('accepts a custom status', () => {
			const res = mockResponse();
			empty(res, 304);
			flush(res);
			assert.equal(res._status, 304);
		});

		test('is idempotent — second call is ignored', () => {
			const res = mockResponse();
			empty(res, 204);
			empty(res, 500);
			flush(res);
			assert.equal(res._status, 204);
		});
	});

	describe('pending()', () => {
		test('returns undefined before anything is staged', () => {
			assert.equal(pending(mockResponse()), undefined);
		});

		test('reflects the most recently staged data and status', () => {
			const res = mockResponse();
			json(res, { ok: true }, 201);
			assert.equal(pending(res)?.status, 201);
			assert.equal(pending(res)?.data?.toString(), '{"ok":true}');
		});
	});

	describe('flush()', () => {
		test('writes the staged body and ends the response', () => {
			const res = mockResponse();
			send(res, 'hello');
			flush(res);
			assert.equal(res._ended, true);
			assert.equal(String(res._body), 'hello');
		});

		test('sets statusCode from the staged result', () => {
			const res = mockResponse();
			json(res, {}, 418);
			flush(res);
			assert.equal(res._status, 418);
		});

		test('leaves statusCode untouched when no status was staged', () => {
			const res = mockResponse();
			send(res, 'hello');
			flush(res);
			assert.equal(res._status, 200);
		});

		test('ends with no body when nothing was ever staged', () => {
			const res = mockResponse();
			flush(res);
			assert.equal(res._ended, true);
			assert.equal(res._body, undefined);
		});
	});

	describe('withRestaging()', () => {
		test('allows send/json/empty to overwrite an already-staged response', async () => {
			const res = mockResponse();
			json(res, { error: 'boom' }, 500);

			await withRestaging(res, () => {
				json(res, { error: 'Internal Server Error' }, 500);
			});

			flush(res);
			assert.equal(res._body?.toString(), '{"error":"Internal Server Error"}');
		});

		test('restaging is scoped to the callback — calls after it still no-op', async () => {
			const res = mockResponse();
			send(res, 'first');

			await withRestaging(res, () => {});
			send(res, 'second');

			flush(res);
			assert.equal(String(res._body), 'first');
		});

		test('restaging is lifted even if the callback throws', async () => {
			const res = mockResponse();
			send(res, 'first');

			await assert.rejects(
				withRestaging(res, () => {
					throw new Error('boom');
				}),
				/boom/,
			);

			send(res, 'second');
			flush(res);
			assert.equal(String(res._body), 'first');
		});
	});
});
