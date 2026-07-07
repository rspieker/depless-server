import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { describe, test } from "node:test";

import { body, parseUrl, type RequestLike } from "./request.ts";

function mockRequest(
	options: {
		url?: string;
		headers?: Record<string, string>;
		body?: string;
		emitError?: Error;
	} = {},
): RequestLike {
	const ee = new EventEmitter();
	const emitter: RequestLike = Object.assign(ee, {
		url: options.url ?? "/",
		headers: options.headers ?? {},
		resume() {},
	});

	if (options.emitError) {
		const error = options.emitError;
		setImmediate(() => ee.emit("error", error));
	} else if (options.body !== undefined) {
		setImmediate(() => {
			ee.emit("data", Buffer.from(options.body!));
			ee.emit("end");
		});
	}

	return emitter;
}

describe("server/request.ts", () => {
	describe("parseUrl()", () => {
		test("parses pathname and search params", () => {
			const url = parseUrl(
				mockRequest({ url: "/users/1?foo=bar" }),
				"http://localhost",
			);
			assert.equal(url.pathname, "/users/1");
			assert.equal(url.searchParams.get("foo"), "bar");
		});

		test("falls back to / for a missing url", () => {
			const url = parseUrl(mockRequest({ url: undefined }), "http://localhost");
			assert.equal(url.pathname, "/");
		});

		test("resolves OPTIONS * form to /* without throwing", () => {
			const url = parseUrl(mockRequest({ url: "*" }), "http://localhost");
			assert.equal(url.pathname, "/*");
		});
	});

	describe("body()", () => {
		test("returns undefined for a non-JSON content type", async () => {
			const req = mockRequest({ headers: { "content-type": "text/plain" } });
			assert.equal(await body(req), undefined);
		});

		test("returns undefined when content-type is absent", async () => {
			const req = mockRequest();
			assert.equal(await body(req), undefined);
		});

		test("parses a JSON body", async () => {
			const req = mockRequest({
				headers: { "content-type": "application/json" },
				body: '{"name":"Alice"}',
			});
			assert.deepEqual(await body(req), { name: "Alice" });
		});

		test("returns the same Promise on concurrent calls", () => {
			const req = mockRequest({
				headers: { "content-type": "application/json" },
				body: "1",
			});
			assert.equal(body(req), body(req));
		});

		test("rejects on invalid JSON", async () => {
			const req = mockRequest({
				headers: { "content-type": "application/json" },
				body: "not-json",
			});
			await assert.rejects(() => body(req), /Invalid JSON body/);
		});

		test("rejects on a stream error", async () => {
			const req = mockRequest({
				headers: { "content-type": "application/json" },
				emitError: new Error("socket hang up"),
			});
			await assert.rejects(() => body(req));
		});
	});
});
