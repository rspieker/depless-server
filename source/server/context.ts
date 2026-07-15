import { Reply } from "./reply.ts";
import { body, DEFAULT_MAX_BODY_SIZE, type RequestLike } from "./request.ts";
import {
	empty,
	isSent,
	json,
	type Pending,
	pending,
	type ResponseLike,
	send,
} from "./response.ts";

export type Context = {
	readonly req: RequestLike;
	readonly res: ResponseLike;
	readonly params: Record<string, string>;
	readonly method: string;
	readonly url: URL;
	readonly headers: RequestLike["headers"];
	readonly query: URLSearchParams;
	readonly sent: boolean;
	readonly staged: Pending | undefined;
	// Set by dispatch() once a route has matched, from that route's
	// RouteOptions.maxBodySize; body() falls back to DEFAULT_MAX_BODY_SIZE
	// when unset.
	maxBodySize?: number;
	body<T = unknown>(): Promise<T>;
	send(data: string | Buffer, status?: number): void;
	json(data: unknown, status?: number): void;
	empty(status?: number): void;
	reply(data: unknown): Reply;
	[key: string]: unknown;
};

export function createContext(
	req: RequestLike,
	res: ResponseLike,
	params: Record<string, string>,
	url: URL,
): Context {
	const shadow = new Map<string | symbol, unknown>();

	const base: Context = {
		req,
		res,
		params,
		url,
		get method() {
			return req.method ?? "GET";
		},
		get headers() {
			return req.headers;
		},
		get query() {
			return url.searchParams;
		},
		get sent() {
			return isSent(res);
		},
		get staged() {
			return pending(res);
		},
		body: <T>() =>
			body<T>(req, (shadow.get("maxBodySize") as number) ?? DEFAULT_MAX_BODY_SIZE),
		send: (data: string | Buffer, status?: number) => send(res, data, status),
		json: (data: unknown, status?: number) => json(res, data, status),
		empty: (status?: number) => empty(res, status),
		reply: (data: unknown) => new Reply(data),
	};

	return new Proxy(base, {
		get(target, prop) {
			return shadow.has(prop)
				? shadow.get(prop)
				: Reflect.get(target, prop, target);
		},
		set(_target, prop, value) {
			shadow.set(prop, value);

			return true;
		},
		has(target, prop) {
			return shadow.has(prop) || Reflect.has(target, prop);
		},
	});
}
