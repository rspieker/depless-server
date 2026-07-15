import assert from "node:assert/strict";
import { Readable } from "node:stream";
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
	const readable = new Readable({ read() {} }) as RequestLike;
	readable.url = options.url ?? "/";
	readable.headers = options.headers ?? {};

	if (options.emitError) {
		setImmediate(() => readable.destroy(options.emitError));
	} else if (options.body !== undefined) {
		setImmediate(() => {
			readable.push(Buffer.from(options.body!));
			readable.push(null);
		});
	} else {
		setImmediate(() => readable.push(null));
	}

	return readable;
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

		test("resolves under the default limit", async () => {
			const req = mockRequest({
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ name: "Alice" }),
			});
			assert.deepEqual(await body(req), { name: "Alice" });
		});

		test("rejects with a 413-tagged error once the default limit is exceeded", async () => {
			const req = mockRequest({
				url: "/users",
				headers: { "content-type": "application/json" },
				body: "x".repeat(16 * 1024 + 1),
			});
			await assert.rejects(
				() => body(req),
				(err: Error & { status: number }) => {
					assert.equal(err.status, 413);
					assert.match(err.message, /Body exceeds 16384 byte limit for GET \/users/);
					assert.match(err.message, /maxBodySize/);
					return true;
				},
			);
		});

		test("respects an explicit maxBodySize override", async () => {
			const req = mockRequest({
				headers: { "content-type": "application/json" },
				body: '{"name":"Alice"}',
			});
			await assert.rejects(
				() => body(req, 5),
				/Body exceeds 5 byte limit/,
			);
		});

		test("a body exactly at the limit is not rejected", async () => {
			const payload = JSON.stringify({ n: 1 });
			const req = mockRequest({
				headers: { "content-type": "application/json" },
				body: payload,
			});
			assert.deepEqual(await body(req, Buffer.byteLength(payload)), { n: 1 });
		});
	});
});
