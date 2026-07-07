import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { base64, base64url, hex, text, toUTF8 } from './encoding.ts';

describe('helpers/encoding.ts', () => {
	describe('base64', () => {
		test('encodes a string to base64', () => {
			assert.equal(base64.encode('hello'), 'aGVsbG8=');
		});

		test('decodes a base64 string', () => {
			assert.equal(base64.decode('aGVsbG8='), 'hello');
		});

		test('round-trips correctly', () => {
			assert.equal(base64.decode(base64.encode('hello world')), 'hello world');
		});
	});

	describe('base64url', () => {
		test('produces URL-safe output (no +, /, =)', () => {
			assert.doesNotMatch(base64url.encode('hello world'), /[+/=]/);
		});

		test('round-trips correctly', () => {
			assert.equal(base64url.decode(base64url.encode('hello world')), 'hello world');
		});
	});

	describe('hex', () => {
		test('encodes a string to hex', () => {
			assert.equal(hex.encode('hello'), '68656c6c6f');
		});

		test('decodes hex to a string', () => {
			assert.equal(hex.decode('68656c6c6f'), 'hello');
		});

		test('round-trips correctly', () => {
			assert.equal(hex.decode(hex.encode('hello world')), 'hello world');
		});
	});

	describe('text', () => {
		test('encodes a string to Uint8Array', () => {
			assert.ok(text.encode('hello') instanceof Uint8Array);
			assert.deepEqual(text.encode('hi'), new Uint8Array([104, 105]));
		});

		test('decodes a Uint8Array to string', () => {
			assert.equal(text.decode(new Uint8Array([104, 105])), 'hi');
		});

		test('round-trips correctly', () => {
			assert.equal(text.decode(text.encode('hello world')), 'hello world');
		});
	});

	describe('toUTF8', () => {
		// ü in Windows-1252 is byte 0xFC
		const win1252Buffer = new Uint8Array([0xfc]);
		const win1252String = '\xfc';

		test('decodes a Uint8Array from a legacy encoding', () => {
			assert.equal(toUTF8(win1252Buffer, 'windows-1252'), 'ü');
		});

		test('decodes a binary string from a legacy encoding', () => {
			assert.equal(toUTF8(win1252String, 'windows-1252'), 'ü');
		});
	});
});
