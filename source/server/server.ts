import { EventEmitter } from "node:events";
import { createServer, type Server as HTTPServer } from "node:http";

import { type Context, createContext } from "./context.ts";
import { Reply } from "./reply.ts";
import { parseUrl, type RequestLike } from "./request.ts";
import {
	empty,
	flush,
	isSent,
	json,
	type ResponseLike,
	send,
	withRestaging,
} from "./response.ts";
import { createRouter, type RouteOptions } from "./router.ts";

type Router = ReturnType<typeof createRouter>;

export type Cleanup = () => void | Promise<void>;

export type RequestHookFn = (ctx: Context) => void | Promise<void>;
export type ShutdownHookFn = () => void | Promise<void>;
type HookFn = RequestHookFn | ShutdownHookFn;

type RequestHookStage = "before-handler" | "before-response";
type HookStage = RequestHookStage | "shutdown";

// Dependency is a Proxy over a plugin's exposed object — see mintProxy().
// expose is constrained to object | undefined because Proxy needs an object
// target; a plugin exposing a single primitive should wrap it, e.g.
// `{ value: 42 }`.
export type Dependency<T extends object = object> = Readonly<T>;

export type HookRegistrar = {
	(stage: "before-handler" | "before-response", fn: RequestHookFn): void;
	(stage: "shutdown", fn: ShutdownHookFn): void;
	before(stage: RequestHookStage, dep: Dependency, fn: RequestHookFn): void;
	after(stage: RequestHookStage, dep: Dependency, fn: RequestHookFn): void;
};

type HookEntry = {
	owner: object;
	fn: HookFn;
};

type Hooks = Record<HookStage, Array<HookEntry>>;

export type PluginResult<T extends object = object> = {
	expose?: T;
	cleanup?: Cleanup;
};

export type Plugin<T extends object = object> = {
	name: string;
	dependencies?: Array<string>;
	register: (
		server: Server,
		...deps: Array<Dependency>
	) => PluginResult<T> | void | Promise<PluginResult<T> | void>;
};

type PendingPlugin = {
	name: string;
	dependencies: Array<string>;
	register: Plugin["register"];
	plugin: Plugin;
};

export type InjectOptions = {
	method: string;
	path: string;
	headers?: Record<string, string>;
	body?: unknown;
};

export type InjectResult = {
	status: number;
	headers: Record<string, string | number>;
	json<T = unknown>(): T;
	text(): string;
};

export function formatBootDisplay(
	plugins: Array<string>,
	routes: { method: string; path: string }[],
): string {
	const lines = ["[plugins]", ...plugins.map((name) => `  ✓ ${name}`)];

	lines.push("[routes]");
	for (const route of routes) {
		lines.push(`  ${route.method.padEnd(6)} ${route.path}`);
	}

	return lines.join("\n");
}

function mintProxy<T extends object>(target: T): Dependency<T> {
	return new Proxy(target, {
		get(t, prop) {
			return Reflect.get(t, prop);
		},
		set() {
			return false;
		},
		defineProperty() {
			return false;
		},
		deleteProperty() {
			return false;
		},
		setPrototypeOf() {
			return false;
		},
	}) as Dependency<T>;
}

function dispatchReply(res: ResponseLike, reply: Reply): void {
	for (const [name, value] of Object.entries(reply.headers)) {
		res.setHeader(name, value);
	}
	const { data, status } = reply;
	if (typeof data === "string" || Buffer.isBuffer(data)) {
		send(res, data, status);
	} else {
		if (!res.getHeader("Content-Type"))
			res.setHeader("Content-Type", "application/json");
		send(res, JSON.stringify(data), status);
	}
}

function stageFailure(res: ResponseLike, err: unknown): void {
	if (!isSent(res)) {
		json(res, { error: "Internal Server Error" }, 500);
	}
	console.error(err);
}

async function dispatch(
	router: Router,
	rawReq: RequestLike,
	rawRes: ResponseLike,
	baseUrl: string,
	hooks: Hooks,
): Promise<void> {
	const url = parseUrl(rawReq, baseUrl);
	const params: Record<string, string> = {};
	const ctx = createContext(rawReq, rawRes, params, url);

	try {
		for (const entry of hooks["before-handler"]) {
			await (entry.fn as RequestHookFn)(ctx);
			if (isSent(rawRes)) break;
		}

		if (!isSent(rawRes)) {
			const match = router.match(rawReq.method ?? "GET", url.pathname);
			if (match) {
				Object.assign(params, match.params);
				const result = await match.handler(ctx);
				if (!isSent(rawRes)) {
					if (result === undefined) empty(rawRes);
					else if (result instanceof Reply) dispatchReply(rawRes, result);
					else if (typeof result === "string") send(rawRes, result);
					else json(rawRes, result);
				}
			} else {
				json(rawRes, { error: "Not Found" }, 404);
			}
		}
	} catch (err) {
		stageFailure(rawRes, err);
	}

	try {
		await withRestaging(rawRes, async () => {
			for (const entry of hooks["before-response"]) {
				await (entry.fn as RequestHookFn)(ctx);
			}
		});
	} catch (err) {
		stageFailure(rawRes, err);
	}

	flush(rawRes);
}

export class Server {
	#router = createRouter();
	#http: HTTPServer | null = null;

	#pending: Array<PendingPlugin> = [];
	#resolvedNames = new Set<string>();
	#resolvedOrder: Array<string> = [];
	#dependencyProxies = new Map<string, Dependency>();
	#proxyOwner = new WeakMap<object, string>();
	#currentPlugin: object | null = null;

	#hooks: Hooks = {
		"before-handler": [],
		"before-response": [],
		shutdown: [],
	};

	readonly hook: HookRegistrar;

	constructor() {
		const registrar = ((stage: HookStage, fn: HookFn) => {
			this.#addHook(stage, fn);
		}) as HookRegistrar;
		registrar.before = (stage, dep, fn) =>
			this.#splice(stage, dep, fn, "before");
		registrar.after = (stage, dep, fn) => this.#splice(stage, dep, fn, "after");
		this.hook = registrar;
	}

	#addHook(stage: HookStage, fn: HookFn): void {
		if (!this.#currentPlugin) {
			throw new Error(
				"server.hook() can only be called inside a plugin's register()",
			);
		}
		this.#hooks[stage].push({ owner: this.#currentPlugin, fn });
	}

	#splice(
		stage: RequestHookStage,
		dep: Dependency,
		fn: RequestHookFn,
		position: "before" | "after",
	): void {
		if (!this.#currentPlugin) {
			throw new Error(
				`server.hook.${position}() can only be called inside a plugin's register()`,
			);
		}

		const list = this.#hooks[stage];
		const indices: Array<number> = [];
		list.forEach((entry, i) => {
			if (entry.owner === dep) indices.push(i);
		});

		if (indices.length === 0) {
			const name = this.#proxyOwner.get(dep as object) ?? "unknown plugin";
			throw new Error(
				`Cannot register hook ${position} "${name}": it registered no hook at stage "${stage}"`,
			);
		}

		const index = position === "before" ? indices[0] : indices.at(-1)! + 1;
		list.splice(index, 0, { owner: this.#currentPlugin, fn });
	}

	route(options: RouteOptions): void {
		this.#router.add(options);
	}

	async register(plugin: Plugin, as: string = plugin.name): Promise<void> {
		if (
			this.#resolvedNames.has(as) ||
			this.#pending.some((p) => p.name === as)
		) {
			throw new Error(`Plugin "${as}" is already registered`);
		}

		this.#pending.push({
			name: as,
			dependencies: plugin.dependencies ?? [],
			register: plugin.register,
			plugin,
		});

		await this.#resolve();
	}

	async #resolve(): Promise<void> {
		let progressed = true;
		while (progressed) {
			progressed = false;
			for (const candidate of [...this.#pending]) {
				if (!candidate.dependencies.every((d) => this.#resolvedNames.has(d))) {
					continue;
				}

				this.#pending = this.#pending.filter((p) => p !== candidate);

				const target = {};
				const proxy = mintProxy(target);
				this.#proxyOwner.set(proxy, candidate.name);

				const depProxies = candidate.dependencies.map(
					(d) => this.#dependencyProxies.get(d)!,
				);

				this.#currentPlugin = proxy;
				const result = await candidate.register(this, ...depProxies);
				if (result?.expose !== undefined) {
					Object.assign(target, result.expose);
				}
				if (result?.cleanup) {
					this.#addHook("shutdown", result.cleanup);
				}
				this.#currentPlugin = null;

				this.#dependencyProxies.set(candidate.name, proxy);
				this.#resolvedNames.add(candidate.name);
				this.#resolvedOrder.push(
					candidate.name +
						(candidate.name !== candidate.plugin.name
							? ` (${candidate.plugin.name})`
							: ""),
				);
				progressed = true;
			}
		}
	}

	#assertResolved(action: string): void {
		if (this.#pending.length === 0) return;

		const lines = this.#pending.map((p) => {
			const missing = p.dependencies.filter((d) => !this.#resolvedNames.has(d));
			return `  - "${p.name}" is missing: ${missing
				.map((m) => `"${m}"`)
				.join(", ")}`;
		});
		throw new Error(
			`Cannot ${action}: unresolved plugin dependencies\n${lines.join("\n")}`,
		);
	}

	async start(port = 3000): Promise<void> {
		if (this.#http) throw new Error("Server is already running");
		this.#assertResolved("start");

		const baseUrl = `http://localhost:${port}`;

		const http = createServer((rawReq, rawRes) => {
			dispatch(this.#router, rawReq, rawRes, baseUrl, this.#hooks);
		});

		await new Promise<void>((resolve, reject) => {
			const onError = (err: Error) => reject(err);
			http.once("error", onError);
			http.listen(port, () => {
				http.off("error", onError);
				resolve();
			});
		});

		this.#http = http;

		console.log(formatBootDisplay(this.#resolvedOrder, this.#router.list()));
		console.log(`listening on http://localhost:${port}`);
	}

	async inject(options: InjectOptions): Promise<InjectResult> {
		this.#assertResolved("inject");

		const headers = { ...(options.headers ?? {}) };
		const emitter = new EventEmitter();
		const rawReq: RequestLike = Object.assign(emitter, {
			method: options.method,
			url: options.path,
			headers,
			resume() {},
		});

		let statusCode = 200;
		const resHeaders: Record<string, string | number> = {};
		let written: string | Buffer | undefined;

		const rawRes: ResponseLike = {
			get statusCode() {
				return statusCode;
			},
			set statusCode(value: number) {
				statusCode = value;
			},
			setHeader(name, value) {
				resHeaders[name.toLowerCase()] = value;
			},
			getHeader(name) {
				return resHeaders[name.toLowerCase()];
			},
			end(data) {
				written = data;
			},
		};

		if (options.body !== undefined) {
			headers["content-type"] ??= "application/json";
			const payload = JSON.stringify(options.body);
			setImmediate(() => {
				emitter.emit("data", Buffer.from(payload));
				emitter.emit("end");
			});
		} else {
			setImmediate(() => emitter.emit("end"));
		}

		await dispatch(
			this.#router,
			rawReq,
			rawRes,
			"http://localhost",
			this.#hooks,
		);

		return {
			status: statusCode,
			headers: resHeaders,
			json: <T = unknown>() => JSON.parse(String(written ?? "null")) as T,
			text: () => String(written ?? ""),
		};
	}

	get port(): number | null {
		const addr = this.#http?.address();
		return addr && typeof addr === "object" ? addr.port : null;
	}

	get routes(): Array<{ method: string; path: string }> {
		return this.#router.list();
	}

	async stop(): Promise<void> {
		const errors: Array<unknown> = [];

		for (const entry of [...this.#hooks.shutdown].reverse()) {
			try {
				await (entry.fn as ShutdownHookFn)();
			} catch (err) {
				errors.push(err);
			}
		}

		this.#resolvedOrder = [];
		this.#hooks.shutdown = [];

		const http = this.#http;
		if (http) {
			await new Promise<void>((resolve, reject) => {
				http.close((error?: Error) => (error ? reject(error) : resolve()));
			});
			this.#http = null;
		}

		if (errors.length > 0) {
			throw new AggregateError(errors, "One or more shutdown hooks failed");
		}
	}
}
