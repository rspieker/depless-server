import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { describe, test } from "node:test";

import { createContext } from "./context.ts";
import { Reply } from "./reply.ts";
import type { RequestLike } from "./request.ts";
import { isSent, type ResponseLike } from "./response.ts";

function mockReq(
	options: {
		method?: string;
		url?: string;
		headers?: Record<string, string>;
	} = {},
): RequestLike {
	return Object.assign(new EventEmitter(), {
		method: options.method ?? "GET",
		url: options.url ?? "/",
		headers: options.headers ?? {},
		resume() {},
	});
}

function mockRes(): ResponseLike {
	const headers: Record<string, string | number> = {};
	let statusCode = 200;
	return {
		get statusCode() {
			return statusCode;
		},
		set statusCode(v: number) {
			statusCode = v;
		},
		setHeader(name: string, value: string | number) {
			headers[name.toLowerCase()] = value;
		},
		getHeader(name: string) {
			return headers[name.toLowerCase()];
		},
		end() {},
	};
}

function makeContext(options: { method?: string; url?: string } = {}) {
	const req = mockReq(options);
	const res = mockRes();
	const url = new URL(options.url ?? "/", "http://localhost");
	const ctx = createContext(req, res, { id: "42" }, url);
	return { ctx, req, res };
}

describe("server/context.ts", () => {
	describe("built-in properties", () => {
		test("exposes req and res", () => {
			const { ctx, req, res } = makeContext();
			assert.equal(ctx.req, req);
			assert.equal(ctx.res, res);
		});

		test("exposes params", () => {
			const { ctx } = makeContext();
			assert.equal(ctx.params.id, "42");
		});

		test("exposes method from the raw request", () => {
			const { ctx } = makeContext({ method: "POST" });
			assert.equal(ctx.method, "POST");
		});

		test("exposes url as a URL instance", () => {
			const { ctx } = makeContext({ url: "/users?foo=bar" });
			assert.equal(ctx.url.pathname, "/users");
		});

		test("exposes query as URLSearchParams", () => {
			const { ctx } = makeContext({ url: "/x?foo=bar" });
			assert.equal(ctx.query.get("foo"), "bar");
		});

		test("sent reflects the response sent state", () => {
			const { ctx } = makeContext();
			assert.equal(ctx.sent, false);
			ctx.json({ ok: true });
			assert.equal(ctx.sent, true);
		});

		test("staged is undefined before anything is staged", () => {
			const { ctx } = makeContext();
			assert.equal(ctx.staged, undefined);
		});

		test("staged reflects what was staged via json()", () => {
			const { ctx } = makeContext();
			ctx.json({ ok: true }, 201);
			assert.equal(ctx.staged?.status, 201);
			assert.equal(ctx.staged?.data?.toString(), '{"ok":true}');
		});
	});

	describe("shadow layer", () => {
		test("middleware can set arbitrary properties", () => {
			const { ctx } = makeContext();
			(ctx as any).user = { id: 1 };
			assert.deepEqual((ctx as any).user, { id: 1 });
		});

		test("shadow properties do not appear on the raw req", () => {
			const { ctx, req } = makeContext();
			(ctx as any).user = { id: 1 };
			assert.equal((req as any).user, undefined);
		});

		test("shadow takes precedence over base properties", () => {
			const { ctx } = makeContext({ method: "GET" });
			(ctx as any).method = "OVERRIDDEN";
			assert.equal(ctx.method, "OVERRIDDEN");
		});
	});

	describe("convenience methods", () => {
		test("reply() returns a Reply instance", () => {
			const { ctx } = makeContext();
			assert.ok(ctx.reply({ x: 1 }) instanceof Reply);
		});

		test("json() marks the response as sent", () => {
			const { ctx, res } = makeContext();
			ctx.json({ ok: true });
			assert.equal(isSent(res), true);
		});

		test("empty() marks the response as sent", () => {
			const { ctx, res } = makeContext();
			ctx.empty();
			assert.equal(isSent(res), true);
		});

		test("send() marks the response as sent", () => {
			const { ctx, res } = makeContext();
			ctx.send("hello");
			assert.equal(isSent(res), true);
		});
	});
});
