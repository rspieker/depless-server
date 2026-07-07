import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
	all,
	any,
	isArray,
	isBoolean,
	isBooleanPrimitiveOrObject,
	isInteger,
	isNodeJSArrayBufferView,
	isNULL,
	isNumber,
	isNumberPrimitiveOrObject,
	isObject,
	isPlainObject,
	isString,
	isStringPrimitiveOrObject,
	isStruct,
	not,
} from "./guards.ts";

describe("helpers/guards.ts", () => {
	describe("isString", () => {
		test("returns true for string literals", () => {
			assert.equal(isString("hello"), true);
			assert.equal(isString(""), true);
		});

		test("returns false for non-strings", () => {
			assert.equal(isString(0), false);
			assert.equal(isString(null), false);
			assert.equal(isString(undefined), false);
			assert.equal(isString([]), false);
			assert.equal(isString({}), false);
			assert.equal(isString(true), false);
		});
	});

	describe("isNumber", () => {
		test("returns true for number primitives", () => {
			assert.equal(isNumber(0), true);
			assert.equal(isNumber(42), true);
			assert.equal(isNumber(NaN), true);
		});

		test("returns false for non-numbers", () => {
			assert.equal(isNumber("42"), false);
			assert.equal(isNumber(null), false);
			assert.equal(isNumber(new Number(42)), false);
		});
	});

	describe("isBoolean", () => {
		test("returns true for boolean primitives", () => {
			assert.equal(isBoolean(true), true);
			assert.equal(isBoolean(false), true);
		});

		test("returns false for non-booleans", () => {
			assert.equal(isBoolean(0), false);
			assert.equal(isBoolean(null), false);
			assert.equal(isBoolean(new Boolean(true)), false);
		});
	});

	describe("isNULL", () => {
		test("returns true for null", () => {
			assert.equal(isNULL(null), true);
		});

		test("returns false for non-null values including undefined", () => {
			assert.equal(isNULL(undefined), false);
			assert.equal(isNULL(0), false);
			assert.equal(isNULL(""), false);
		});
	});

	describe("isArray", () => {
		test("returns true for arrays", () => {
			assert.equal(isArray([]), true);
			assert.equal(isArray([1, 2, 3]), true);
		});

		test("returns false for non-arrays", () => {
			assert.equal(isArray({}), false);
			assert.equal(isArray(null), false);
			assert.equal(isArray("hello"), false);
		});
	});

	describe("isObject", () => {
		test("returns true for plain objects and class instances", () => {
			assert.equal(isObject({}), true);
			assert.equal(isObject(new Date()), true);
		});

		test("returns false for null, arrays, and primitives", () => {
			assert.equal(isObject(null), false);
			assert.equal(isObject([]), false);
			assert.equal(isObject("hello"), false);
			assert.equal(isObject(42), false);
		});
	});

	describe("isInteger", () => {
		test("returns true for integer numbers", () => {
			assert.equal(isInteger(0), true);
			assert.equal(isInteger(42), true);
			assert.equal(isInteger(-7), true);
		});

		test("returns false for floats, NaN, Infinity, and non-numbers", () => {
			assert.equal(isInteger(1.5), false);
			assert.equal(isInteger(NaN), false);
			assert.equal(isInteger(Infinity), false);
			assert.equal(isInteger("42"), false);
		});
	});

	describe("isPlainObject", () => {
		test("returns true for plain objects", () => {
			assert.equal(isPlainObject({}), true);
			assert.equal(isPlainObject({ a: 1 }), true);
		});

		test("returns false for class instances, arrays, null, and primitives", () => {
			assert.equal(isPlainObject(new Date()), false);
			assert.equal(isPlainObject([]), false);
			assert.equal(isPlainObject(null), false);
			assert.equal(isPlainObject("hello"), false);
		});
	});

	describe("isStruct", () => {
		type User = {
			id: number;
			name: string;
		};
		const isUser = isStruct<User>({
			id: isInteger,
			name: (input: unknown): input is string =>
				isString(input) && input.length >= 3,
		});
		type Message = {
			id: number;
			from: User;
			to: [User, ...Array<User>];
			message: string;
		};
		const isMessage = isStruct<Message>({
			id: isInteger,
			from: isUser,
			to: (input: unknown): input is [User, ...Array<User>] =>
				isArray(input) &&
				input.length >= 1 &&
				input.every((value) => isUser(value)),
			message: isString,
		});

		test("returns true for valid structures", () => {
			// arrange
			const alice: User = { id: 1, name: "Alice" };
			const bob: User = { id: 2, name: "Bob" };
			const initial: Message = {
				id: 1,
				from: alice,
				to: [bob],
				message: "hello",
			};
			const reply: Message = { id: 2, from: bob, to: [alice], message: "hi!" };

			// act
			// assert
			assert.ok(isUser(alice), `${alice} is User`);
			assert.ok(isUser(bob), `${bob} is User`);
			assert.ok(isMessage(initial), `${initial} is Message`);
			assert.ok(isMessage(reply), `${reply} is Message`);
		});

		test("returns false for invalid structures/values", () => {
			// assert
			assert.ok(!isUser({}), `{} is not User`);
			assert.ok(!isUser({ id: 3 }), `{id:3} is not User`);
			assert.ok(!isUser({ name: "Foo" }), `{name: 'Foo'} is not User`);
			assert.ok(
				!isUser({ id: 4, name: "Fo" }),
				`{id:3, name: 'Fo'} is not User`,
			);
			assert.ok(!isMessage({}), `{} is not Message`);
			assert.ok(!isMessage({ id: 3 }), `{id:3} is not Message`);
			assert.ok(
				!isMessage({ id: 4, message: "hi" }),
				`{id:3, message: 'hi'} is not Message`,
			);
			assert.ok(
				!isMessage({ id: 5, message: "hi", from: { id: 1, name: "Alice" } }),
				`{id:3, message: 'hi', from: { id: 1, name: "Alice" }} is not Message`,
			);
			assert.ok(
				!isMessage({ id: 6, message: "hi", to: [{ id: 2, name: "Bob" }] }),
				`{id:3, message: 'hi', to: [{ id: 2, name: "Bob" }]} is not Message`,
			);
			assert.ok(
				!isMessage({
					id: 7,
					message: "hi",
					from: { id: 1, name: "Alice" },
					to: [{ id: 2, name: "Bo" }],
				}),
				`{id:3, message: 'hi', from: {id:1,name:'Alice'}, to: [{ id: 2, name: "Bo" }]} is not Message`,
			);
		});
	});

	describe("isStringPrimitiveOrObject", () => {
		test("returns true for string primitives", () => {
			assert.equal(isStringPrimitiveOrObject("hello"), true);
		});

		test("returns true for String wrapper objects", () => {
			assert.equal(isStringPrimitiveOrObject(new String("hello")), true);
		});

		test("returns false for non-strings", () => {
			assert.equal(isStringPrimitiveOrObject(42), false);
			assert.equal(isStringPrimitiveOrObject(null), false);
		});
	});

	describe("isNumberPrimitiveOrObject", () => {
		test("returns true for number primitives and Number wrappers", () => {
			assert.equal(isNumberPrimitiveOrObject(42), true);
			assert.equal(isNumberPrimitiveOrObject(new Number(42)), true);
		});

		test("returns false for non-numbers", () => {
			assert.equal(isNumberPrimitiveOrObject("42"), false);
			assert.equal(isNumberPrimitiveOrObject(null), false);
		});
	});

	describe("isBooleanPrimitiveOrObject", () => {
		test("returns true for boolean primitives and Boolean wrappers", () => {
			assert.equal(isBooleanPrimitiveOrObject(true), true);
			assert.equal(isBooleanPrimitiveOrObject(new Boolean(false)), true);
		});

		test("returns false for non-booleans", () => {
			assert.equal(isBooleanPrimitiveOrObject(0), false);
			assert.equal(isBooleanPrimitiveOrObject(null), false);
		});
	});

	describe("isNodeJSArrayBufferView", () => {
		test("returns true for TypedArrays and Buffer", () => {
			assert.equal(isNodeJSArrayBufferView(new Uint8Array()), true);
			assert.equal(isNodeJSArrayBufferView(Buffer.from("hello")), true);
			assert.equal(
				isNodeJSArrayBufferView(new DataView(new ArrayBuffer(8))),
				true,
			);
		});

		test("returns false for non-ArrayBufferView types", () => {
			assert.equal(isNodeJSArrayBufferView("hello"), false);
			assert.equal(isNodeJSArrayBufferView(42), false);
			assert.equal(isNodeJSArrayBufferView({}), false);
			assert.equal(isNodeJSArrayBufferView(null), false);
		});
	});

	describe("any", () => {
		const isStringOrBuffer = any<string | NodeJS.ArrayBufferView>(
			isString,
			isNodeJSArrayBufferView,
		);

		test("returns true when at least one guard matches", () => {
			assert.equal(isStringOrBuffer("hello"), true);
			assert.equal(isStringOrBuffer(Buffer.from("hello")), true);
		});

		test("returns false when no guard matches", () => {
			assert.equal(isStringOrBuffer(42), false);
			assert.equal(isStringOrBuffer(null), false);
		});
	});

	describe("all", () => {
		const isNonEmptyString = all<string>(
			isString,
			(v): v is string => isString(v) && v.length > 0,
		);

		test("returns true when all guards match", () => {
			assert.equal(isNonEmptyString("hello"), true);
		});

		test("returns false when any guard fails", () => {
			assert.equal(isNonEmptyString(""), false);
			assert.equal(isNonEmptyString(42), false);
		});
	});

	describe("not", () => {
		const isNotString = not<unknown>(isString);

		test("returns true when no guard matches", () => {
			assert.equal(isNotString(42), true);
			assert.equal(isNotString(null), true);
		});

		test("returns false when a guard matches", () => {
			assert.equal(isNotString("hello"), false);
		});
	});
});
