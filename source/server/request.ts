import type { IncomingHttpHeaders } from "node:http";

// The subset of node:http's IncomingMessage that request.ts actually uses —
// satisfied by a real IncomingMessage, but also by lightweight fakes (tests,
// Server#inject()) without pretending to be the real class.
export type RequestLike = {
	url?: string;
	method?: string;
	headers: IncomingHttpHeaders;
	resume(): void;
	on(event: "data", listener: (chunk: Buffer) => void): void;
	on(event: "end", listener: () => void): void;
	on(event: "error", listener: (err: Error) => void): void;
};

const bodyCache = new WeakMap<RequestLike, Promise<unknown>>();

export function parseUrl(raw: RequestLike, base: string): URL {
	try {
		return new URL(raw.url ?? "/", base);
	} catch {
		return new URL("/", base);
	}
}

export function body<T = unknown>(raw: RequestLike): Promise<T> {
	if (!bodyCache.has(raw)) bodyCache.set(raw, readBody(raw));
	return bodyCache.get(raw) as Promise<T>;
}

function readBody(raw: RequestLike): Promise<unknown> {
	const contentType = raw.headers["content-type"] ?? "";
	if (!String(contentType).includes("application/json")) {
		raw.resume(); // drain to avoid stalling keep-alive connections
		return Promise.resolve(undefined);
	}
	return new Promise((resolve, reject) => {
		const chunks: Array<Buffer> = [];
		raw.on("data", (chunk: Buffer) => chunks.push(chunk));
		raw.on("end", () => {
			try {
				resolve(JSON.parse(Buffer.concat(chunks).toString("utf-8")));
			} catch {
				reject(new Error("Invalid JSON body"));
			}
		});
		raw.on("error", reject);
	});
}
