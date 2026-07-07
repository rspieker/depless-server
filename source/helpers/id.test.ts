import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { nanoid, uuid } from "./id.ts";

describe("helpers/id.ts", () => {
	describe("uuid", () => {
		test("returns a valid v4 UUID", () => {
			assert.match(
				uuid(),
				/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
			);
		});

		test("returns a unique value each call", () => {
			assert.notEqual(uuid(), uuid());
		});
	});

	describe("nanoid", () => {
		test("returns a string of the default length (21)", () => {
			assert.equal(nanoid().length, 21);
		});

		test("returns a string of a custom length", () => {
			assert.equal(nanoid(10).length, 10);
		});

		test("only contains characters from the default alphabet", () => {
			assert.match(nanoid(100), /^[A-Za-z0-9_-]+$/);
		});

		test("only contains characters from a custom alphabet", () => {
			const hex = "0123456789abcdef";
			assert.match(nanoid(32, hex), /^[0-9a-f]+$/);
		});

		test("returns unique values each call", () => {
			assert.notEqual(nanoid(), nanoid());
		});
	});
});
