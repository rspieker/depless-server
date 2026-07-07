import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { createRouter } from "./router.ts";

const noop = () => {};

describe("server/router.ts", () => {
	describe("match()", () => {
		test("returns null when no routes are registered", () => {
			assert.equal(createRouter().match("GET", "/"), null);
		});

		test("returns null when no route matches the path", () => {
			const router = createRouter();
			router.add({ method: "GET", path: "/a", handler: noop });
			assert.equal(router.match("GET", "/b"), null);
		});

		test("matches a static route", () => {
			const router = createRouter();
			router.add({ method: "GET", path: "/users", handler: noop });
			assert.ok(router.match("GET", "/users"));
		});

		test("returns null for a wrong method", () => {
			const router = createRouter();
			router.add({ method: "GET", path: "/users", handler: noop });
			assert.equal(router.match("POST", "/users"), null);
		});

		test("method matching is case-insensitive", () => {
			const router = createRouter();
			router.add({ method: "get", path: "/x", handler: noop });
			assert.ok(router.match("GET", "/x"));
		});

		test("matches any method in an array", () => {
			const router = createRouter();
			router.add({ method: ["GET", "POST"], path: "/x", handler: noop });
			assert.ok(router.match("GET", "/x"));
			assert.ok(router.match("POST", "/x"));
			assert.equal(router.match("DELETE", "/x"), null);
		});

		test("extracts a single path param", () => {
			const router = createRouter();
			router.add({ method: "GET", path: "/users/{id}", handler: noop });
			assert.equal(router.match("GET", "/users/42")?.params.id, "42");
		});

		test("extracts multiple path params", () => {
			const router = createRouter();
			router.add({
				method: "GET",
				path: "/users/{uid}/posts/{pid}",
				handler: noop,
			});
			const match = router.match("GET", "/users/1/posts/99");
			assert.equal(match?.params.uid, "1");
			assert.equal(match?.params.pid, "99");
		});

		test("literal segment beats param segment for the same path", () => {
			const router = createRouter();
			const paramHandler = () => "param";
			const literalHandler = () => "literal";
			router.add({ method: "GET", path: "/users/{id}", handler: paramHandler });
			router.add({ method: "GET", path: "/users/me", handler: literalHandler });
			assert.equal(router.match("GET", "/users/me")?.handler, literalHandler);
		});

		test("longer path beats shorter path", () => {
			const router = createRouter();
			const short = () => "short";
			const long = () => "long";
			router.add({ method: "GET", path: "/{a}", handler: short });
			router.add({ method: "GET", path: "/{a}/{b}", handler: long });
			assert.equal(router.match("GET", "/x/y")?.handler, long);
		});

		test("* matches any method", () => {
			const router = createRouter();
			router.add({ method: "*", path: "/x", handler: noop });
			assert.ok(router.match("GET", "/x"));
			assert.ok(router.match("DELETE", "/x"));
			assert.ok(router.match("PATCH", "/x"));
		});

		test("specific method beats * for the same path", () => {
			const router = createRouter();
			const specific = () => "specific";
			const wildcard = () => "wildcard";
			router.add({ method: "*", path: "/x", handler: wildcard });
			router.add({ method: "GET", path: "/x", handler: specific });
			assert.equal(router.match("GET", "/x")?.handler, specific);
			assert.equal(router.match("POST", "/x")?.handler, wildcard);
		});

		test("routes added after the first match are still sorted correctly", () => {
			const router = createRouter();
			const param = () => "param";
			const literal = () => "literal";
			router.add({ method: "GET", path: "/users/{id}", handler: param });
			router.match("GET", "/users/foo"); // triggers first sort
			router.add({ method: "GET", path: "/users/me", handler: literal });
			assert.equal(router.match("GET", "/users/me")?.handler, literal);
		});

		test("tolerates a trailing slash", () => {
			const router = createRouter();
			router.add({ method: "GET", path: "/users", handler: noop });
			assert.ok(router.match("GET", "/users/"));
		});
	});

	describe("add()", () => {
		test("re-adding the same path, method and handler is a no-op", () => {
			const router = createRouter();
			router.add({ method: "GET", path: "/x", handler: noop });
			router.add({ method: "GET", path: "/x", handler: noop });
			assert.deepEqual(router.list(), [{ method: "GET", path: "/x" }]);
		});

		test("re-adding the same path and method with a new handler steals it from the old owner", () => {
			const router = createRouter();
			const first = () => "first";
			const second = () => "second";
			router.add({ method: "GET", path: "/x", handler: first });
			router.add({ method: "GET", path: "/x", handler: second });
			assert.equal(router.match("GET", "/x")?.handler, second);
			assert.deepEqual(router.list(), [{ method: "GET", path: "/x" }]);
		});

		test("stealing one method leaves the old owner's other methods intact", () => {
			const router = createRouter();
			const first = () => "first";
			const second = () => "second";
			router.add({ method: ["GET", "POST"], path: "/x", handler: first });
			router.add({ method: "GET", path: "/x", handler: second });
			assert.equal(router.match("GET", "/x")?.handler, second);
			assert.equal(router.match("POST", "/x")?.handler, first);
			assert.deepEqual(router.list(), [
				{ method: "GET", path: "/x" },
				{ method: "POST", path: "/x" },
			]);
		});
	});

	describe("remove()", () => {
		test("removes a registered route", () => {
			const router = createRouter();
			router.add({ method: "GET", path: "/x", handler: noop });
			router.remove({ method: "GET", path: "/x", handler: noop });
			assert.equal(router.match("GET", "/x"), null);
			assert.deepEqual(router.list(), []);
		});

		test("removes only the given method, leaving others registered", () => {
			const router = createRouter();
			router.add({ method: ["GET", "POST"], path: "/x", handler: noop });
			router.remove({ method: "GET", path: "/x", handler: noop });
			assert.equal(router.match("GET", "/x"), null);
			assert.ok(router.match("POST", "/x"));
		});

		test("is a no-op when the handler does not match the registered one", () => {
			const router = createRouter();
			const registered = () => "registered";
			const other = () => "other";
			router.add({ method: "GET", path: "/x", handler: registered });
			router.remove({ method: "GET", path: "/x", handler: other });
			assert.equal(router.match("GET", "/x")?.handler, registered);
		});

		test("is a no-op when the path was never registered", () => {
			const router = createRouter();
			assert.doesNotThrow(() =>
				router.remove({ method: "GET", path: "/x", handler: noop }),
			);
		});
	});

	describe("list()", () => {
		test("returns method and path for each registered route", () => {
			const router = createRouter();
			router.add({ method: "GET", path: "/users", handler: noop });
			router.add({
				method: ["GET", "DELETE"],
				path: "/users/{id}",
				handler: noop,
			});
			assert.deepEqual(router.list(), [
				{ method: "GET", path: "/users" },
				{ method: "GET", path: "/users/{id}" },
				{ method: "DELETE", path: "/users/{id}" },
			]);
		});

		test("returns an empty array when no routes are registered", () => {
			assert.deepEqual(createRouter().list(), []);
		});
	});
});
