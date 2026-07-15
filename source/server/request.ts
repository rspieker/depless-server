import type { IncomingHttpHeaders } from "node:http";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

// A real Readable, plus the bits of IncomingMessage request.ts actually
// uses. Satisfied directly by IncomingMessage; fakes (tests, Server#inject())
// build a plain Readable rather than pretending to be the real class —
// streaming (file uploads, early request inspection) needs real pipe()/
// destroy() semantics, not just data/end/error events.
export type RequestLike = Readable & {
	url?: string;
	method?: string;
	headers: IncomingHttpHeaders;
};

const bodyCache = new WeakMap<RequestLike, Promise<unknown>>();

// Small on purpose: this is a floor against unauthenticated memory
// exhaustion on the shared body-reading path, not a cap sized for every
// legitimate payload. Routes that need more override it explicitly via
// RouteOptions.maxBodySize — the 413 response states how.
export const DEFAULT_MAX_BODY_SIZE = 16 * 1024;

export function parseUrl(raw: RequestLike, base: string): URL {
	try {
		return new URL(raw.url ?? "/", base);
	} catch {
		return new URL("/", base);
	}
}

function pathOnly(url: string | undefined): string {
	if (!url) return "/";
	const query = url.indexOf("?");
	return query === -1 ? url : url.slice(0, query);
}

export function body<T = unknown>(
	raw: RequestLike,
	maxBodySize: number = DEFAULT_MAX_BODY_SIZE,
): Promise<T> {
	if (!bodyCache.has(raw)) bodyCache.set(raw, readBody(raw, maxBodySize));
	return bodyCache.get(raw) as Promise<T>;
}

function bodyTooLarge(maxBodySize: number, raw: RequestLike): Error & { status: number } {
	const error = new Error(
		`Body exceeds ${maxBodySize} byte limit for ${raw.method ?? "GET"} ${pathOnly(raw.url)}. Increase via route option maxBodySize.`,
	) as Error & { status: number };
	error.status = 413;
	return error;
}

// A Transform that errors once accumulated bytes cross maxBodySize. Piping
// through it (rather than counting in a "data" listener) means an overflow
// tears the whole pipeline down via pipeline()'s cleanup — including
// destroying `raw` — instead of leaving the source draining passively.
function limiter(maxBodySize: number, raw: RequestLike): Transform {
	let size = 0;
	return new Transform({
		transform(chunk: Buffer, _encoding, callback) {
			size += chunk.length;
			if (size > maxBodySize) {
				callback(bodyTooLarge(maxBodySize, raw));
				return;
			}
			callback(null, chunk);
		},
	});
}

async function readBody(raw: RequestLike, maxBodySize: number): Promise<unknown> {
	const contentType = raw.headers["content-type"] ?? "";
	if (!String(contentType).includes("application/json")) {
		raw.resume(); // drain to avoid stalling keep-alive connections
		return undefined;
	}

	const chunks: Array<Buffer> = [];
	await pipeline(raw, limiter(maxBodySize, raw), async (source) => {
		for await (const chunk of source) chunks.push(chunk as Buffer);
	});

	try {
		return JSON.parse(Buffer.concat(chunks).toString("utf-8"));
	} catch {
		throw new Error("Invalid JSON body");
	}
}
