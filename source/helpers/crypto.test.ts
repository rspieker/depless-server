import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { hmac, isHashable, sha256, sha512 } from "./crypto.ts";

describe("helpers/crypto.ts", () => {
	describe("isHashable", () => {
		test("returns true for strings", () => {
			assert.equal(isHashable("hello"), true);
		});

		test("returns true for ArrayBufferView types", () => {
			assert.equal(isHashable(new Uint8Array([1, 2, 3])), true);
			assert.equal(isHashable(Buffer.from("hello")), true);
		});

		test("returns false for plain objects, arrays, and primitives", () => {
			assert.equal(isHashable({}), false);
			assert.equal(isHashable([1, 2, 3]), false);
			assert.equal(isHashable(42), false);
			assert.equal(isHashable(null), false);
		});
	});

	describe("sha256", () => {
		test("throws for non-hashable input", () => {
			assert.throws(() => (sha256 as (...args: Array<unknown>) => string)(42));
		});

		test("returns a 64-character hex string", () => {
			assert.match(sha256("hello"), /^[0-9a-f]{64}$/);
		});

		test("is deterministic", () => {
			assert.equal(sha256("hello"), sha256("hello"));
		});

		test("variadic inputs concatenate: sha256(a, b) === sha256(ab)", () => {
			assert.equal(sha256("hel", "lo"), sha256("hello"));
		});
	});

	describe("sha512", () => {
		test("returns a 128-character hex string", () => {
			assert.match(sha512("hello"), /^[0-9a-f]{128}$/);
		});

		test("is deterministic", () => {
			assert.equal(sha512("hello"), sha512("hello"));
		});

		test("variadic inputs concatenate: sha512(a, b) === sha512(ab)", () => {
			assert.equal(sha512("hel", "lo"), sha512("hello"));
		});
	});

	describe("hmac", () => {
		const sign = hmac("secret");

		test("returns a 64-character hex string by default (sha256)", () => {
			assert.match(sign("message"), /^[0-9a-f]{64}$/);
		});

		test("is deterministic", () => {
			assert.equal(sign("message"), sign("message"));
		});

		test("variadic inputs concatenate: hmac(a, b) === hmac(ab)", () => {
			assert.equal(sign("mes", "sage"), sign("message"));
		});

		test("different keys produce different results", () => {
			assert.notEqual(hmac("key-a")("message"), hmac("key-b")("message"));
		});

		test("supports alternative algorithms", () => {
			assert.match(hmac("secret", "sha512")("message"), /^[0-9a-f]{128}$/);
		});

		test("throws for non-hashable input", () => {
			assert.throws(() => (sign as (...args: Array<unknown>) => string)(42));
		});
	});
});
