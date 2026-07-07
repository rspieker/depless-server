import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { clone, groupBy, includes } from "./object.ts";

describe("helpers/object.ts", () => {
	describe("clone", () => {
		test("deep clones nested objects", () => {
			const original = { a: { b: 1 } };
			const copy = clone(original);
			copy.a.b = 2;
			assert.equal(original.a.b, 1);
		});

		test("clones Maps correctly (unlike spread)", () => {
			const original = new Map([["key", "value"]]);
			const copy = clone(original);
			copy.set("key", "changed");
			assert.equal(original.get("key"), "value");
		});
	});

	describe("groupBy", () => {
		const items = [
			{ type: "fruit", name: "apple" },
			{ type: "veggie", name: "carrot" },
			{ type: "fruit", name: "banana" },
		];

		test("groups items under the correct key", () => {
			const grouped = groupBy(items, (item) => item.type);
			assert.equal(grouped.fruit?.length, 2);
			assert.equal(grouped.veggie?.length, 1);
		});

		test("preserves item order within groups", () => {
			const grouped = groupBy(items, (item) => item.type);
			assert.equal(grouped.fruit?.[0].name, "apple");
			assert.equal(grouped.fruit?.[1].name, "banana");
		});
	});

	describe('includes', () => {
		test('returns true when the value exists in the object', () => {
			assert.equal(includes({ a: 1, b: 2 }, 2), true);
		});

		test('returns false when the value does not exist', () => {
			assert.equal(includes({ a: 1, b: 2 }, 3), false);
		});

		test('returns false for non-object input', () => {
			assert.equal(includes(null as unknown as Record<string, unknown>, 'x'), false);
		});
	});
});
