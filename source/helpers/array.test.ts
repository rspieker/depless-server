import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { findLast, includes, last } from "./array.ts";

describe("helpers/array.ts", () => {
	describe("last", () => {
		test("returns the last element", () => {
			assert.equal(last([1, 2, 3]), 3);
		});

		test("returns undefined for an empty array", () => {
			assert.equal(last([]), undefined);
		});
	});

	describe("findLast", () => {
		test("returns the last element matching the predicate", () => {
			assert.equal(
				findLast([1, 2, 3, 4], (n) => n % 2 === 0),
				4,
			);
		});

		test("returns undefined when nothing matches", () => {
			assert.equal(
				findLast([1, 3, 5], (n) => n % 2 === 0),
				undefined,
			);
		});
	});

	describe("includes", () => {
		test("returns true when the item is in the array", () => {
			assert.equal(includes([1, 2, 3], 2), true);
		});

		test("returns false when the item is not in the array", () => {
			assert.equal(includes([1, 2, 3], 4), false);
		});

		test("returns false for non-array input", () => {
			assert.equal(includes(null as unknown as Array<unknown>, "x"), false);
		});
	});
});
