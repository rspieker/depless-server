// The subset of node:http's ServerResponse that response.ts actually uses —
// satisfied by a real ServerResponse, but also by lightweight fakes (tests,
// Server#inject()) without pretending to be the real class.
export type ResponseLike = {
	statusCode: number;
	setHeader(name: string, value: string | number): void;
	getHeader(name: string): string | number | Array<string> | undefined;
	end(data?: string | Buffer): void;
};

export type Pending = {
	data?: string | Buffer;
	status?: number;
};

const sentMap = new WeakMap<ResponseLike, boolean>();
const pendingMap = new WeakMap<ResponseLike, Pending>();
const restaging = new WeakSet<ResponseLike>();

export function isSent(res: ResponseLike): boolean {
	return sentMap.get(res) === true;
}

// Read-only peek at what a handler/hook has staged so far — lets a
// before-response hook (e.g. an error normaliser) inspect and replace it.
export function pending(res: ResponseLike): Pending | undefined {
	return pendingMap.get(res);
}

// Runs fn with the first-write-wins guard relaxed for res, so before-response
// hooks can read what was staged (via pending()) and overwrite it. Used by
// dispatch() to scope this to exactly the before-response hook loop.
export async function withRestaging(
	res: ResponseLike,
	fn: () => void | Promise<void>,
): Promise<void> {
	restaging.add(res);
	try {
		await fn();
	} finally {
		restaging.delete(res);
	}
}

function canStage(res: ResponseLike): boolean {
	return !isSent(res) || restaging.has(res);
}

function stage(res: ResponseLike, data: Pending): void {
	sentMap.set(res, true);
	pendingMap.set(res, data);
}

export function send(
	res: ResponseLike,
	data: string | Buffer,
	status?: number,
): void {
	if (!canStage(res)) return;
	const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
	res.setHeader("Content-Length", buf.byteLength);
	stage(res, { data: buf, status });
}

export function json(res: ResponseLike, data: unknown, status?: number): void {
	if (!canStage(res)) return;
	const payload = JSON.stringify(data);
	res.setHeader("Content-Type", "application/json");
	send(res, payload, status);
}

export function empty(res: ResponseLike, status = 204): void {
	if (!canStage(res)) return;
	stage(res, { status });
}

// Flushes whatever is staged to the socket. Called exactly once per request
// by dispatch(), after all before-response hooks have run.
export function flush(res: ResponseLike): void {
	const result = pendingMap.get(res);
	if (result?.status !== undefined) res.statusCode = result.status;
	res.end(result?.data);
}
