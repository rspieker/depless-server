import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { compile } from "./route.ts";

describe("server/route.ts", () => {
	describe("compile", () => {
		const foo = "foo";
		const bar = "bar";
		const baz = "baz";
		const qux = "qux";
		const config = [
			{
				path: "/foo/bar/baz/qux",
				score: [0.97, 0.97, 0.97, 0.97],
				params: {},
			},
			{
				path: "/foo/bar/baz/{qux}",
				score: [0.97, 0.97, 0.97, 0.1],
				params: { qux },
			},
			{
				path: "/foo/bar/{baz}/qux",
				score: [0.97, 0.97, 0.1, 0.97],
				params: { baz },
			},
			{
				path: "/foo/bar/{baz}/{qux}",
				score: [0.97, 0.97, 0.1, 0.1],
				params: { baz, qux },
			},
			{
				path: "/foo/{bar}/baz/qux",
				score: [0.97, 0.1, 0.97, 0.97],
				params: { bar },
			},
			{
				path: "/foo/{bar}/baz/{qux}",
				score: [0.97, 0.1, 0.97, 0.1],
				params: { bar, qux },
			},
			{
				path: "/foo/{bar}/{baz}/qux",
				score: [0.97, 0.1, 0.1, 0.97],
				params: { bar, baz },
			},
			{
				path: "/foo/{bar}/{baz}/{qux}",
				score: [0.97, 0.1, 0.1, 0.1],
				params: { bar, baz, qux },
			},
			{
				path: "/{foo}/bar/baz/qux",
				score: [0.1, 0.97, 0.97, 0.97],
				params: { foo },
			},
			{
				path: "/{foo}/bar/baz/{qux}",
				score: [0.1, 0.97, 0.97, 0.1],
				params: { foo, qux },
			},
			{
				path: "/{foo}/bar/{baz}/qux",
				score: [0.1, 0.97, 0.1, 0.97],
				params: { foo, baz },
			},
			{
				path: "/{foo}/{bar}/baz/qux",
				score: [0.1, 0.1, 0.97, 0.97],
				params: { foo, bar },
			},
			{
				path: "/{foo}/{bar}/baz/{qux}",
				score: [0.1, 0.1, 0.97, 0.1],
				params: { foo, bar, qux },
			},
			{
				path: "/{foo}/{bar}/{baz}/qux",
				score: [0.1, 0.1, 0.1, 0.97],
				params: { foo, bar, baz },
			},
			{
				path: "/{foo}/{bar}/{baz}/{qux}",
				score: [0.1, 0.1, 0.1, 0.1],
				params: { foo, bar, baz, qux },
			},
			{
				path: "/foo/bar/baz/*",
				score: [0.97, 0.97, 0.97, 0],
				params: {},
			},
			{
				path: "/foo/bar/*",
				score: [0.97, 0.97, 0],
				params: {},
			},
			{
				path: "/foo/*",
				score: [0.97, 0],
				params: {},
			},
			{
				path: "/*",
				score: [0],
				params: {},
			},
			{
				path: "/{foo}-{bar}/{baz}/{qux}",
				score: [0.39, 0.1, 0.1],
				params: { foo, bar, baz, qux },
			},
		];

		describe("compiles", () => {
			// arrange
			const routes = config.map(({ path }) => path);

			// act
			const actual = routes.map(compile);

			// assert
			for (const { path, score } of actual) {
				test(`${path} compiles`, () => {
					const found = config.find((cfg) => cfg.path === path);
					assert.deepEqual(
						score,
						found?.score,
						`${path} score is "${JSON.stringify(found?.score)}"`,
					);
				});
			}
		});
	});
});
