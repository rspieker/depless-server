import { describe, test, before } from "node:test";
import assert from "node:assert/strict";

import { Server } from "./server.ts";

describe("server/server.ts", () => {
	// Tests that bind a real socket (start()/stop() against node:http) live in
	// test/server.test.ts — this file stays network-free.
	describe("start() / stop()", () => {
		test("port is null before start", () => {
			assert.equal(new Server().port, null);
		});

		test("stop() is safe to call before start", async () => {
			await new Server().stop();
		});
	});

	describe("routing (via inject())", () => {
		const server = new Server();

		before(() => {
			server.route({ method: "GET", path: "/", handler: () => ({ ok: true }) });
			server.route({ method: "GET", path: "/text", handler: () => "hello" });
			server.route({
				method: "GET",
				path: "/users/{id}",
				handler: ({ params }) => params,
			});
			server.route({
				method: "GET",
				path: "/users/me",
				handler: () => ({ id: "me" }),
			});
			server.route({
				method: "POST",
				path: "/echo",
				handler: async ({ body, reply }) => reply(await body()).code(201),
			});
			server.route({
				method: "DELETE",
				path: "/gone",
				handler: () => undefined,
			});
			server.route({
				method: "*",
				path: "/wild",
				handler: ({ method }) => ({ method }),
			});
		});

		test("plain object return → 200 JSON", async () => {
			const res = await server.inject({ method: "GET", path: "/" });
			assert.equal(res.status, 200);
			assert.deepEqual(res.json(), { ok: true });
		});

		test("string return → 200 text", async () => {
			const res = await server.inject({ method: "GET", path: "/text" });
			assert.equal(res.status, 200);
			assert.equal(res.text(), "hello");
		});

		test("path params are extracted", async () => {
			const res = await server.inject({ method: "GET", path: "/users/42" });
			assert.deepEqual(res.json(), { id: "42" });
		});

		test("literal route beats param route", async () => {
			const res = await server.inject({ method: "GET", path: "/users/me" });
			assert.deepEqual(res.json(), { id: "me" });
		});

		test("reply().code() sets the status", async () => {
			const res = await server.inject({
				method: "POST",
				path: "/echo",
				body: { x: 1 },
			});
			assert.equal(res.status, 201);
			assert.deepEqual(res.json(), { x: 1 });
		});

		test("undefined return → 204 no content", async () => {
			const res = await server.inject({ method: "DELETE", path: "/gone" });
			assert.equal(res.status, 204);
		});

		test("* route matches any method", async () => {
			const res = await server.inject({ method: "PATCH", path: "/wild" });
			assert.deepEqual(res.json(), { method: "PATCH" });
		});

		test("unknown route → 404", async () => {
			const res = await server.inject({ method: "GET", path: "/nothing" });
			assert.equal(res.status, 404);
		});
	});

	describe("inject()", () => {
		test("throws the same dependency error as start(), without binding a port", async () => {
			const server = new Server();
			await server.register({
				name: "metrics",
				dependencies: ["logger"],
				register: () => ({}),
			});
			await assert.rejects(
				() => server.inject({ method: "GET", path: "/" }),
				/Cannot inject: unresolved plugin dependencies/,
			);
			assert.equal(server.port, null);
		});

		test("works without ever calling start()", async () => {
			const server = new Server();
			server.route({ method: "GET", path: "/", handler: () => ({ ok: true }) });
			const res = await server.inject({ method: "GET", path: "/" });
			assert.equal(res.status, 200);
			assert.equal(server.port, null);
		});
	});

	describe("register()", () => {
		test("plugin receives the server instance", async () => {
			const server = new Server();
			let received: Server | null = null;
			await server.register({
				name: "a",
				register: (s) => {
					received = s;
					return {};
				},
			});
			assert.equal(received, server);
		});

		test("async plugin is awaited before resolving", async () => {
			const server = new Server();
			let done = false;
			await server.register({
				name: "a",
				register: async () => {
					await new Promise((r) => setImmediate(r));
					done = true;
					return {};
				},
			});
			assert.equal(done, true);
		});

		test("resolves immediately when a plugin has no dependencies", async () => {
			const server = new Server();
			let ran = false;
			await server.register({
				name: "a",
				register: () => {
					ran = true;
					return {};
				},
			});
			assert.equal(ran, true);
		});

		test("resolves immediately when its dependency was already registered", async () => {
			const server = new Server();
			const order: Array<string> = [];
			await server.register({
				name: "a",
				register: () => {
					order.push("a");
					return {};
				},
			});
			await server.register({
				name: "b",
				dependencies: ["a"],
				register: () => {
					order.push("b");
					return {};
				},
			});
			assert.deepEqual(order, ["a", "b"]);
		});

		test("a plugin registered before its dependency stays pending until resolved", async () => {
			const server = new Server();
			const order: Array<string> = [];
			await server.register({
				name: "b",
				dependencies: ["a"],
				register: () => {
					order.push("b");
					return {};
				},
			});
			assert.equal(order.length, 0);

			await server.register({
				name: "a",
				register: () => {
					order.push("a");
					return {};
				},
			});
			assert.deepEqual(order, ["a", "b"]);
		});

		test("registering the same plugin name twice throws", async () => {
			const server = new Server();
			await server.register({ name: "a", register: () => ({}) });
			await assert.rejects(
				() => server.register({ name: "a", register: () => ({}) }),
				/already registered/,
			);
		});

		test("registering a name already pending throws", async () => {
			const server = new Server();
			await server.register({
				name: "a",
				dependencies: ["x"],
				register: () => ({}),
			});
			await assert.rejects(
				() => server.register({ name: "a", register: () => ({}) }),
				/already registered/,
			);
		});

		test("dependent plugins receive a Dependency proxy forwarding the exposed properties", async () => {
			const server = new Server();
			const logger = { log: (msg: string) => `logged:${msg}` };
			await server.register({
				name: "logger",
				register: () => ({ expose: logger }),
			});
			let received: any;
			await server.register({
				name: "api",
				dependencies: ["logger"],
				register: (_s, log) => {
					received = log;
					return {};
				},
			});
			// not the same reference — it's a Proxy minted by the Server — but
			// property access is forwarded transparently.
			assert.notEqual(received, logger);
			assert.equal(received.log("hi"), "logged:hi");
		});

		test("multiple dependencies are passed in registration order", async () => {
			const server = new Server();
			await server.register({
				name: "a",
				register: () => ({ expose: { value: "a-value" } }),
			});
			await server.register({
				name: "b",
				register: () => ({ expose: { value: "b-value" } }),
			});
			const received: unknown[] = [];
			await server.register({
				name: "c",
				dependencies: ["a", "b"],
				register: (_s, ...deps) => {
					received.push(...deps.map((d: any) => d.value));
					return {};
				},
			});
			assert.deepEqual(received, ["a-value", "b-value"]);
		});

		test("async plugin exports are awaited", async () => {
			const server = new Server();
			await server.register({
				name: "async-plugin",
				register: async () => {
					await new Promise((r) => setImmediate(r));
					return { expose: { ready: true } };
				},
			});
			let received: any;
			await server.register({
				name: "consumer",
				dependencies: ["async-plugin"],
				register: (_s, dep) => {
					received = dep;
					return {};
				},
			});
			assert.equal(received.ready, true);
		});

		test("plugin returning undefined does not store export", async () => {
			const server = new Server();
			await server.register({
				name: "no-export",
				register: () => ({}),
			});
			let received: unknown = "sentinel";
			await server.register({
				name: "consumer",
				dependencies: ["no-export"],
				register: (_s, dep) => {
					received = dep;
					return {};
				},
			});
			// still a usable (empty) Proxy, not undefined — anchorable for
			// .before/.after even with no exposed properties.
			assert.notEqual(received, undefined);
			assert.equal((received as any).anything, undefined);
		});
	});

	describe("register(plugin, as)", () => {
		test("defaults to plugin.name when no override is given", async () => {
			const server = new Server();
			await server.register({
				name: "logger",
				register: () => ({ expose: { ok: true } }),
			});
			let received: any;
			await server.register({
				name: "consumer",
				dependencies: ["logger"],
				register: (_s, dep) => {
					received = dep;
					return {};
				},
			});
			assert.equal(received.ok, true);
		});

		test("registers the plugin under the override name instead of its own", async () => {
			const server = new Server();
			await server.register(
				{ name: "acme-logger", register: () => ({ expose: { from: "acme" } }) },
				{ as: "logger" },
			);
			let received: any;
			await server.register({
				name: "consumer",
				dependencies: ["logger"],
				register: (_s, dep) => {
					received = dep;
					return {};
				},
			});
			assert.equal(received.from, "acme");
		});

		test("the same plugin object can be registered twice under different names", async () => {
			let calls = 0;
			const plugin = {
				name: "logger",
				register: () => ({ expose: { id: ++calls } }),
			};
			const server = new Server();
			await server.register(plugin, { as: "logger-a" });
			await server.register(plugin, { as: "logger-b" });

			let a: any;
			let b: any;
			await server.register({
				name: "consumer",
				dependencies: ["logger-a", "logger-b"],
				register: (_s, depA, depB) => {
					a = depA;
					b = depB;
					return {};
				},
			});
			assert.equal(a.id, 1);
			assert.equal(b.id, 2);
		});

		test("two different plugins registered under the same override name collide", async () => {
			const server = new Server();
			await server.register(
				{ name: "acme-logger", register: () => ({}) },
				{ as: "logger" },
			);
			await assert.rejects(
				() =>
					server.register(
						{ name: "pino-logger", register: () => ({}) },
						{ as: "logger" },
					),
				/"logger" is already registered/,
			);
		});

		test("a plugin's own dependencies are unaffected by the caller's override name", async () => {
			const server = new Server();
			const order: Array<string> = [];
			await server.register({
				name: "config",
				register: () => {
					order.push("config");
					return {};
				},
			});
			await server.register(
				{
					name: "acme-logger",
					dependencies: ["config"],
					register: () => {
						order.push("acme-logger");
						return {};
					},
				},
				{ as: "logger" },
			);
			assert.deepEqual(order, ["config", "acme-logger"]);
		});
	});

	describe("Dependency proxy", () => {
		async function makeDependency() {
			const server = new Server();
			await server.register({
				name: "a",
				register: () => ({ expose: { value: 1 } }),
			});
			let dep: any;
			await server.register({
				name: "b",
				dependencies: ["a"],
				register: (_s, d) => {
					dep = d;
					return {};
				},
			});
			return dep;
		}

		test("set throws TypeError", async () => {
			const dep = await makeDependency();
			assert.throws(() => {
				dep.value = 2;
			}, TypeError);
		});

		test("Object.defineProperty throws TypeError", async () => {
			const dep = await makeDependency();
			assert.throws(() => {
				Object.defineProperty(dep, "value", { value: 2 });
			}, TypeError);
		});

		test("delete throws TypeError", async () => {
			const dep = await makeDependency();
			assert.throws(() => {
				delete dep.value;
			}, TypeError);
		});
	});

	describe("hooks", () => {
		describe("before-handler", () => {
			test("fires in registration order", async () => {
				const server = new Server();
				const order: Array<string> = [];
				await server.register({
					name: "a",
					register: (s) => {
						s.hook("before-handler", () => {
							order.push("a");
						});
						return {};
					},
				});
				await server.register({
					name: "b",
					dependencies: ["a"],
					register: (s) => {
						s.hook("before-handler", () => {
							order.push("b");
						});
						return {};
					},
				});
				server.route({ method: "GET", path: "/", handler: () => ({}) });
				await server.inject({ method: "GET", path: "/" });
				assert.deepEqual(order, ["a", "b"]);
			});

			test("fires for unmatched routes", async () => {
				const server = new Server();
				let fired = false;
				await server.register({
					name: "auth",
					register: (s) => {
						s.hook("before-handler", () => {
							fired = true;
						});
						return {};
					},
				});
				const res = await server.inject({ method: "GET", path: "/nope" });
				assert.equal(fired, true);
				assert.equal(res.status, 404);
			});

			test("short-circuits the handler when it stages a response", async () => {
				const server = new Server();
				let handlerRan = false;
				await server.register({
					name: "auth",
					register: (s) => {
						s.hook("before-handler", (ctx) => {
							ctx.json({ error: "Unauthorized" }, 401);
						});
						return {};
					},
				});
				server.route({
					method: "GET",
					path: "/secret",
					handler: () => {
						handlerRan = true;
						return { secret: true };
					},
				});
				const res = await server.inject({ method: "GET", path: "/secret" });
				assert.equal(res.status, 401);
				assert.equal(handlerRan, false);
			});

			test("later before-handler hooks do not run once a response is staged", async () => {
				const server = new Server();
				const order: Array<string> = [];
				await server.register({
					name: "a",
					register: (s) => {
						s.hook("before-handler", (ctx) => {
							order.push("a");
							ctx.json({}, 403);
						});
						return {};
					},
				});
				await server.register({
					name: "b",
					dependencies: ["a"],
					register: (s) => {
						s.hook("before-handler", () => {
							order.push("b");
						});
						return {};
					},
				});
				server.route({ method: "GET", path: "/", handler: () => ({}) });
				await server.inject({ method: "GET", path: "/" });
				assert.deepEqual(order, ["a"]);
			});
		});

		describe("before-response", () => {
			test("fires after a before-handler short-circuit", async () => {
				const server = new Server();
				let fired = false;
				await server.register({
					name: "auth",
					register: (s) => {
						s.hook("before-handler", (ctx) => {
							ctx.json({ error: "Unauthorized" }, 401);
						});
						s.hook("before-response", () => {
							fired = true;
						});
						return {};
					},
				});
				server.route({ method: "GET", path: "/secret", handler: () => ({}) });
				const res = await server.inject({ method: "GET", path: "/secret" });
				assert.equal(res.status, 401);
				assert.equal(fired, true);
			});

			test("fires for unmatched-route 404s", async () => {
				const server = new Server();
				let fired = false;
				await server.register({
					name: "logger",
					register: (s) => {
						s.hook("before-response", () => {
							fired = true;
						});
						return {};
					},
				});
				const res = await server.inject({ method: "GET", path: "/nope" });
				assert.equal(res.status, 404);
				assert.equal(fired, true);
			});

			test("fires when the handler throws", async () => {
				const server = new Server();
				let fired = false;
				await server.register({
					name: "logger",
					register: (s) => {
						s.hook("before-response", () => {
							fired = true;
						});
						return {};
					},
				});
				server.route({
					method: "GET",
					path: "/boom",
					handler: () => {
						throw new Error("boom");
					},
				});
				const res = await server.inject({ method: "GET", path: "/boom" });
				assert.equal(res.status, 500);
				assert.equal(fired, true);
			});

			test("can add headers regardless of how the response was staged", async () => {
				const server = new Server();
				await server.register({
					name: "cors",
					register: (s) => {
						s.hook("before-response", (ctx) => {
							ctx.res.setHeader("X-Test", "yes");
						});
						return {};
					},
				});
				server.route({
					method: "GET",
					path: "/boom",
					handler: () => {
						throw new Error("boom");
					},
				});
				const res = await server.inject({ method: "GET", path: "/boom" });
				assert.equal(res.headers["x-test"], "yes");
			});

			test("can read what was staged via ctx.staged and replace it", async () => {
				const server = new Server();
				await server.register({
					name: "error-normalizer",
					register: (s) => {
						s.hook("before-response", (ctx) => {
							if (ctx.staged?.status === 422) {
								ctx.json({ error: "validation failed" }, 422);
							}
						});
						return {};
					},
				});
				server.route({
					method: "POST",
					path: "/validate",
					handler: ({ reply }) =>
						reply({ field: "name", message: "required" }).code(422),
				});
				const res = await server.inject({ method: "POST", path: "/validate" });
				assert.equal(res.status, 422);
				assert.deepEqual(res.json(), { error: "validation failed" });
			});
		});

		describe("server.hook.before / .after", () => {
			test(".after splices after the dependency's last hook entry at that stage", async () => {
				const server = new Server();
				const order: Array<string> = [];
				await server.register({
					name: "auth",
					register: (s) => {
						s.hook("before-handler", () => {
							order.push("auth-1");
						});
						s.hook("before-handler", () => {
							order.push("auth-2");
						});
						return {};
					},
				});
				await server.register({
					name: "rate-limit",
					dependencies: ["auth"],
					register: (s, auth) => {
						s.hook.after("before-handler", auth, () => {
							order.push("rate-limit");
						});
						return {};
					},
				});
				server.route({ method: "GET", path: "/", handler: () => ({}) });
				await server.inject({ method: "GET", path: "/" });
				assert.deepEqual(order, ["auth-1", "auth-2", "rate-limit"]);
			});

			test(".before splices before the dependency's first hook entry at that stage", async () => {
				const server = new Server();
				const order: Array<string> = [];
				await server.register({
					name: "auth",
					register: (s) => {
						s.hook("before-handler", () => {
							order.push("auth-1");
						});
						s.hook("before-handler", () => {
							order.push("auth-2");
						});
						return {};
					},
				});
				await server.register({
					name: "decorate",
					dependencies: ["auth"],
					register: (s, auth) => {
						s.hook.before("before-handler", auth, () => {
							order.push("decorate");
						});
						return {};
					},
				});
				server.route({ method: "GET", path: "/", handler: () => ({}) });
				await server.inject({ method: "GET", path: "/" });
				assert.deepEqual(order, ["decorate", "auth-1", "auth-2"]);
			});

			test("throws when the dependency registered no hook at that stage", async () => {
				const server = new Server();
				await server.register({ name: "auth", register: () => ({}) });
				await assert.rejects(
					() =>
						server.register({
							name: "rate-limit",
							dependencies: ["auth"],
							register: (s, auth) => {
								s.hook.after("before-handler", auth, () => {});
								return {};
							},
						}),
					/registered no hook at stage/,
				);
			});
		});

		test("server.hook() throws when called outside register()", () => {
			const server = new Server();
			assert.throws(
				() => server.hook("before-handler", () => {}),
				/inside a plugin's register/,
			);
		});

		describe("shutdown", () => {
			test("server.hook('shutdown', fn) runs in reverse registration order", async () => {
				const server = new Server();
				const order: Array<string> = [];
				await server.register({
					name: "a",
					register: (s) => {
						s.hook("shutdown", () => {
							order.push("a");
						});
						return {};
					},
				});
				await server.register({
					name: "b",
					register: (s) => {
						s.hook("shutdown", () => {
							order.push("b");
						});
						return {};
					},
				});
				await server.stop();
				assert.deepEqual(order, ["b", "a"]);
			});
		});

		test("concurrent requests do not share per-request state when using the WeakMap pattern", async () => {
			const server = new Server();
			const store = new WeakMap<object, string>();
			await server.register({
				name: "tracker",
				register: (s) => {
					s.hook("before-handler", async (ctx) => {
						store.set(ctx, ctx.query.get("id") ?? "");
						await new Promise((r) => setImmediate(r));
					});
					s.hook("before-response", (ctx) => {
						ctx.res.setHeader("X-Tracked", store.get(ctx) ?? "missing");
					});
					return {};
				},
			});
			server.route({ method: "GET", path: "/", handler: () => ({}) });

			const [a, b] = await Promise.all([
				server.inject({ method: "GET", path: "/?id=a" }),
				server.inject({ method: "GET", path: "/?id=b" }),
			]);
			assert.equal(a.headers["x-tracked"], "a");
			assert.equal(b.headers["x-tracked"], "b");
		});
	});

	describe("start() dependency validation", () => {
		test("throws a descriptive error when a dependency was never registered", async () => {
			const server = new Server();
			await server.register({
				name: "metrics",
				dependencies: ["logger"],
				register: () => ({}),
			});
			await assert.rejects(
				() => server.start(0),
				/"metrics" is missing: "logger"/,
			);
			assert.equal(server.port, null);
		});

		test("throws on a circular dependency", async () => {
			const server = new Server();
			await server.register({
				name: "a",
				dependencies: ["b"],
				register: () => ({}),
			});
			await server.register({
				name: "b",
				dependencies: ["a"],
				register: () => ({}),
			});
			await assert.rejects(
				() => server.start(0),
				/unresolved plugin dependencies/,
			);
			assert.equal(server.port, null);
		});
	});

	describe("stop() cleanups", () => {
		// Cleanups run regardless of whether start() was ever called, so these
		// don't need a real socket — see test/server.test.ts for the cleanup
		// case that's entangled with actually closing one.
		test("runs cleanups in reverse resolution order", async () => {
			const server = new Server();
			const order: Array<string> = [];
			await server.register({
				name: "a",
				register: () => ({
					cleanup: () => {
						order.push("a");
					},
				}),
			});
			await server.register({
				name: "b",
				register: () => ({
					cleanup: () => {
						order.push("b");
					},
				}),
			});
			await server.stop();
			assert.deepEqual(order, ["b", "a"]);
		});

		test("runs every cleanup even when an earlier one throws", async () => {
			const server = new Server();
			let secondRan = false;
			await server.register({
				name: "a",
				register: () => ({
					cleanup: () => {
						throw new Error("boom");
					},
				}),
			});
			await server.register({
				name: "b",
				register: () => ({
					cleanup: () => {
						secondRan = true;
					},
				}),
			});
			await assert.rejects(() => server.stop(), AggregateError);
			assert.equal(secondRan, true);
		});

		test("cleanup sugar runs as a shutdown hook alongside server.hook('shutdown', ...) entries, reverse-ordered", async () => {
			const server = new Server();
			const order: Array<string> = [];
			await server.register({
				name: "a",
				register: () => ({
					cleanup: () => {
						order.push("a");
					},
				}),
			});
			await server.register({
				name: "b",
				register: (s) => {
					s.hook("shutdown", () => {
						order.push("b");
					});
					return {};
				},
			});
			await server.stop();
			assert.deepEqual(order, ["b", "a"]);
		});
	});
});
