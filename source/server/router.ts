import { isArray } from "../helpers/guards.ts";
import type { Context } from "./context.ts";
import { compile, type Route } from "./route.ts";

export type Handler = (
	ctx: Context,
) => undefined | unknown | Promise<undefined | unknown>;

export type RouteOptions = {
	method: string | Array<string>;
	path: string;
	handler: Handler;
	maxBodySize?: number;
};

type CompiledRoute = {
	pattern: RegExp;
	score: Array<number>;
	handler: Handler;
	maxBodySize: number | undefined;
};

type RegisteredRoute = {
	route: Route;
	method: string;
	handler: Handler;
	maxBodySize: number | undefined;
};

function subtract(a: number = 0, b: number = 0): number {
	return a - b;
}

function compare(a: Array<number>, b: Array<number>): number {
	const length = Math.max(a.length, b.length);

	for (let i = 0; i < length; i++) {
		const delta = subtract(b[i], a[i]);

		if (delta) return delta;
	}

	return 0;
}

function filterByPath(
	registry: Array<RegisteredRoute>,
	path: string,
): Array<RegisteredRoute> {
	return registry.filter(({ route }) => route.path === path);
}

function add(
	registry: Array<RegisteredRoute>,
	methods: Array<string>,
	path: string,
	handler: Handler,
	maxBodySize: number | undefined,
): void {
	const atPath = filterByPath(registry, path);
	const route = atPath[0]?.route ?? compile(path);

	for (const method of methods) {
		const existing = atPath.find((registered) => registered.method === method);

		if (existing) {
			existing.handler = handler;
			existing.maxBodySize = maxBodySize;
		} else {
			const created = { route, method, handler, maxBodySize };
			registry.push(created);
			atPath.push(created);
		}
	}
}

function remove(
	registry: Array<RegisteredRoute>,
	methods: Array<string>,
	path: string,
	handler: Handler,
): void {
	const atPath = filterByPath(registry, path);

	for (const method of methods) {
		const existing = atPath.find(
			(registered) =>
				registered.method === method && registered.handler === handler,
		);
		if (existing) registry.splice(registry.indexOf(existing), 1);
	}
}

function normalizeMethods(method: string | Array<string>): Array<string> {
	return (isArray(method) ? method : [method]).map((m) => m.toUpperCase());
}

export function createRouter() {
	const registry: Array<RegisteredRoute> = [];
	let byMethod = new Map<string, Array<CompiledRoute>>();
	let wildcard: Array<CompiledRoute> = [];
	let dirty = false;

	function rebuild(): void {
		byMethod = new Map();
		wildcard = [];

		const sorted = [...registry].sort((a, b) =>
			compare(a.route.score, b.route.score),
		);

		for (const { method, route, handler, maxBodySize } of sorted) {
			const compiled: CompiledRoute = {
				pattern: route.pattern,
				score: route.score,
				handler,
				maxBodySize,
			};

			if (method === "*") {
				wildcard.push(compiled);
				continue;
			}

			const list = byMethod.get(method);
			if (list) list.push(compiled);
			else byMethod.set(method, [compiled]);
		}

		dirty = false;
	}

	function addRoute(options: RouteOptions): void {
		add(
			registry,
			normalizeMethods(options.method),
			options.path,
			options.handler,
			options.maxBodySize,
		);
		dirty = true;
	}

	function removeRoute(options: RouteOptions): void {
		remove(
			registry,
			normalizeMethods(options.method),
			options.path,
			options.handler,
		);
		dirty = true;
	}

	function list(): Array<{ method: string; path: string }> {
		return registry.map(({ method, route }) => ({ method, path: route.path }));
	}

	function match(
		method: string,
		pathname: string,
	): {
		handler: Handler;
		params: Record<string, string>;
		maxBodySize: number | undefined;
	} | null {
		if (dirty) rebuild();

		const upper = method.toUpperCase();

		for (const route of byMethod.get(upper) ?? []) {
			const found = pathname.match(route.pattern);
			if (found) {
				return {
					handler: route.handler,
					params: found.groups ?? {},
					maxBodySize: route.maxBodySize,
				};
			}
		}

		for (const route of wildcard) {
			const found = pathname.match(route.pattern);
			if (found) {
				return {
					handler: route.handler,
					params: found.groups ?? {},
					maxBodySize: route.maxBodySize,
				};
			}
		}

		return null;
	}

	return { add: addRoute, remove: removeRoute, match, list };
}
