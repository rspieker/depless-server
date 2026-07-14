import { compile } from "../server/route.ts";
import type { Context } from "../server/context.ts";
import type { Plugin } from "../server/server.ts";

type Stats = {
	min: number;
	avg: number;
	max: number;
};

type RouteDescriptor = { method: string; path: string };

type RouteStats = RouteDescriptor & {
	count: number;
	statusCodes: Record<number, number>;
	input: Stats;
	output: Stats;
	duration: Stats;
	first?: Date;
	last?: Date;
};

function emptyStats(): Stats {
	return { min: 0, avg: 0, max: 0 };
}

function record(stat: Stats, value: number, count: number): void {
	stat.min = count === 1 ? value : Math.min(stat.min, value);
	stat.max = count === 1 ? value : Math.max(stat.max, value);
	stat.avg += (value - stat.avg) / count;
}

function findOrCreate(
	stats: Array<RouteStats>,
	method: string,
	path: string,
): RouteStats {
	const found = stats.find((s) => s.method === method && s.path === path);
	if (found) return found;

	const created: RouteStats = {
		method,
		path,
		count: 0,
		statusCodes: {},
		input: emptyStats(),
		output: emptyStats(),
		duration: emptyStats(),
	};
	stats.push(created);
	return created;
}

// Mirrors router.ts's specificity tie-break (highest score first) — the
// router doesn't expose which compiled route matched, so this recompiles
// from the public `server.routes` list instead of duplicating router state.
function subtract(a: number = 0, b: number = 0): number {
	return a - b;
}

function compareScore(a: Array<number>, b: Array<number>): number {
	const length = Math.max(a.length, b.length);
	for (let i = 0; i < length; i++) {
		const delta = subtract(b[i], a[i]);
		if (delta) return delta;
	}
	return 0;
}

function matchRoute(
	routes: Array<RouteDescriptor>,
	method: string,
	pathname: string,
): RouteDescriptor | undefined {
	const upper = method.toUpperCase();
	const compiled = routes.map((route) => ({ route, ...compile(route.path) }));

	const exact = compiled
		.filter(({ route }) => route.method === upper)
		.sort((a, b) => compareScore(a.score, b.score));
	for (const candidate of exact) {
		if (candidate.pattern.test(pathname)) return candidate.route;
	}

	const wildcard = compiled
		.filter(({ route }) => route.method === "*")
		.sort((a, b) => compareScore(a.score, b.score));
	for (const candidate of wildcard) {
		if (candidate.pattern.test(pathname)) return candidate.route;
	}

	return undefined;
}

function sizeOf(data: string | Buffer | undefined): number {
	return data ? Buffer.byteLength(data) : 0;
}

function sortRoutes(a: RouteStats, b: RouteStats): number {
	if (a.path !== b.path) return a.path < b.path ? -1 : 1;
	if (a.method !== b.method) return a.method < b.method ? -1 : 1;
	return 0;
}

export const routeStatistics: Plugin = {
	name: "route-statistics",
	dependencies: ["token-auth"],
	register: (server, { protect }) => {
		const stats: Array<RouteStats> = [];

		server.hook("before-handler", (ctx) => {
			ctx.statsStart = performance.now();
		});

		server.hook("before-response", (ctx) => {
			const matched = matchRoute(server.routes, ctx.method, ctx.url.pathname);
			if (!matched) return;

			const duration = performance.now() - (ctx.statsStart as number);
			const input = Number(ctx.headers["content-length"] ?? 0) || 0;
			const output = sizeOf(ctx.staged?.data);
			const status = ctx.staged?.status ?? 200;

			const stat = findOrCreate(stats, matched.method, matched.path);
			stat.count += 1;
			stat.statusCodes[status] = (stat.statusCodes[status] ?? 0) + 1;
			record(stat.duration, duration, stat.count);
			record(stat.input, input, stat.count);
			record(stat.output, output, stat.count);
			stat.first ??= new Date();
			stat.last = new Date();
		});

		server.route({
			method: "GET",
			path: "/api/routes",
			handler: protect((_context: Context) => {
				for (const { method, path } of server.routes) {
					findOrCreate(stats, method, path);
				}

				return [...stats].sort(sortRoutes);
			}),
		});
	},
};
