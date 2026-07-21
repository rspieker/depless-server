// Integration tests — these bind a real socket via node:http, unlike
// source/server/server.test.ts which stays network-free. Under Deno this
// suite needs --allow-net and --allow-env; under Node there's no extra ceremony.
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { Server } from "../source/server/server.ts";

describe("server/server.ts (real socket)", () => {
	describe("start() / stop()", () => {
		test("throws if started twice", async () => {
			const server = new Server();
			await server.start(0);
			await assert.rejects(() => server.start(0), /already running/);
			await server.stop();
		});

		test("port is set after start", async () => {
			const server = new Server();
			await server.start(0);
			assert.ok(typeof server.port === "number" && server.port > 0);
			await server.stop();
		});
	});

	describe("stop() cleanups", () => {
		test("still closes the socket even if a cleanup throws", async () => {
			const server = new Server();
			await server.register({
				name: "a",
				register: () => ({
					cleanup: () => {
						throw new Error("boom");
					},
				}),
			});
			await server.start(0);
			await assert.rejects(() => server.stop(), AggregateError);
			assert.equal(server.port, null);
		});
	});
});
