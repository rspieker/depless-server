# depless

A dependency-free HTTP server for Node and Deno, with a hapi-inspired plugin
system: named plugins with declared dependencies, a router with specificity-
based matching, and a universal request/response hook pipeline.

No framework dependency, no bundler, no build step. `node:http` under Node,
the same module under Deno. Meant to run behind a real reverse proxy (nginx,
Caddy, whatever you already have) — depless doesn't do TLS, HTTP/2, or
anything past plain HTTP/1.1.

## Why

Most Node frameworks either drag in a dependency tree to get a decent plugin
system (hapi) or give you routing and nothing else (raw `http`). depless
takes the parts of hapi's plugin model worth keeping — named plugins,
declared dependencies, an `expose`d API surface for other plugins to consume,
`server.inject()` for socket-free testing — and rebuilds them on top of
nothing but the standard library, small enough to read in one sitting.

## Quick start

```ts
import { Server } from "./source/server/server.ts";

const server = new Server();

server.route({
	method: "GET",
	path: "/",
	handler: () => ({ name: "depless-server" }),
});

await server.start(3000);
```

```
npm start          # runs source/main.ts
npm test           # unit + integration tests
npm run coverage   # tests with coverage
```

Or, under Deno: `deno task test` / `deno task coverage`.

## Routing

Routes are `{ method, path, handler }`. `path` uses hapi-style `{param}`
segments:

```ts
server.route({
	method: "GET",
	path: "/users/{id}",
	handler: ({ params }) => ({ id: params.id }),
});
```

- `method` can be a single verb, an array (`["GET", "DELETE"]`), or `"*"` to
  catch any method not otherwise matched at that path.
- A parameter can constrain its shape with `{name:format}`, where `format` is
  a regex fragment, e.g. `{id:\d+}`.
- A bare `*` segment matches the rest of the path.
- Overlapping routes are ranked by **specificity**, most specific first:
  literal segments outrank params, which outrank wildcards, with a further
  per-segment tiebreak so `/users/me` is tried before `/users/{id}` even
  though both would match `/users/me`. Registration order only matters once
  specificity ties.
- Matching is first-match-wins against the sorted list; params are extracted
  via named capture groups compiled from the path template.

## Plugins

A plugin is `{ name, dependencies?, register }`. `register(server, ...deps)`
runs once its declared dependencies have resolved — not necessarily in the
order `server.register()` was called, so a plugin registered before its
dependency simply waits.

```ts
export const users: Plugin = {
	name: "users",
	dependencies: ["logger"],
	register: (server, logger) => {
		server.route({ method: "GET", path: "/users", handler: () => [] });

		return { expose: { count: () => 0 } };
	},
};
```

- `register` may return `{ expose?, cleanup? }`. `expose` is handed to
  dependents as a read-only `Dependency` proxy — the second `register()`
  argument, in dependency-declaration order. `cleanup` runs on `server.stop()`,
  in reverse resolution order, and its errors are collected into an
  `AggregateError` rather than aborting shutdown early.
- Registering two plugins under the same `name`, or starting the server while
  a plugin's dependencies never resolved, throws — no silent misconfiguration.
- `server.register(plugin, { as })` registers under an override name instead
  of the plugin's own `name` — useful when a third-party plugin's self-chosen
  name collides with another's (several loggers all calling themselves
  `"logger"`, say). Only the identity other plugins depend on changes; the
  plugin's own declared `dependencies` are unaffected.
- `server.start(port)` prints a boot display listing resolved plugins and
  registered routes, so wiring is visible without reading `main.ts`.

## Config

`new Server(config)` takes a system-wide config object keyed by plugin name,
e.g. `new Server({ "token-auth": { secret } })`. Inside `register()`, a
plugin reads its own resolved config with `server.options()`:

```ts
register: (server) => {
	const { secret } = server.options<{ secret: string }>();
	...
},
```

The config passed to a given plugin is assembled from three layers, each
overriding the last:

```
{
	...server.config[plugin.name],
	...server.config[as],       // only differs from the above when aliased
	...registrationOptions.config,
}
```

so a system-wide default (keyed by the plugin's own name), an alias-specific
override (useful when the same plugin is registered twice under different
names), and a one-off override passed directly to `server.register(plugin, {
config })` all compose instead of fighting each other. `server.options()`
throws when called outside `register()`; `server.config` is the raw,
unmerged map passed to the constructor.

## Hooks

Plugins intercept the request/response cycle via `server.hook`, rather than
notification-style events — a hook can inspect and short-circuit, not just
observe:

```
[before-handler hooks] → route match → handler → [before-response hooks] → flush
shutdown hooks run in reverse on stop(), always awaited
```

```ts
server.hook("before-handler", (ctx) => {
	console.log(ctx.method, ctx.url.pathname);
});

server.hook("before-response", (ctx) => {
	console.log(ctx.res.statusCode);
});

server.hook("shutdown", () => pool.close());
```

- `before-handler` fires for every request, even ones no route matches — an
  auth hook can reject before route existence is even checked.
- `before-response` fires for every response, whatever staged it: a normal
  handler return, a `before-handler` short-circuit, an unmatched-route 404,
  or a handler that threw (500).
- `server.hook.before(stage, dep, fn)` / `.after(stage, dep, fn)` anchor a
  hook immediately before/after another plugin's existing entries at that
  stage — `dep` is the `Dependency` proxy received via the calling plugin's
  own `dependencies`, so anchoring against a plugin you didn't declare a
  dependency on isn't possible.
- Responses are **staged**, not written immediately — `ctx.send/json/empty`
  buffer the result so `before-response` hooks still run and can add headers
  (or replace the body) before anything hits the socket. One `flush()` call
  per request, always last.

## Request / response ergonomics

Handlers receive a `Context` (`ctx`) and may return a value, a `Reply`, or
nothing:

```ts
handler: async (ctx) => {
	const data = await ctx.body<{ name: string }>();
	if (!data?.name) return ctx.reply({ error: "name required" }).code(400);
	return { id: uuid(), name: data.name }; // plain return → 200 JSON
};
```

- Returning `undefined` → empty response (204).
- Returning a string → sent as-is; anything else is JSON-serialized.
- `ctx.reply(data)` returns a chainable `Reply` for setting status/headers:
  `reply(data).code(201).header("Location", "/users/1")`.
- `ctx` also exposes `params`, `query` (`URLSearchParams`), `headers`, `sent`,
  and arbitrary read/write properties for hooks and handlers to pass data to
  each other within one request.
- `ctx.body()` enforces a request body size limit while streaming — counted
  bytes, not the (spoofable, sometimes-absent) `Content-Length` header. The
  default is a deliberately small **16KB**: it's a floor against an
  unauthenticated client exhausting memory on the shared body-reading path,
  not a cap sized for every legitimate payload. Routes that need more raise
  it explicitly:
  ```ts
  server.route({
  	method: "POST",
  	path: "/uploads",
  	maxBodySize: 1024 * 1024, // 1MB, this route only
  	handler: async (ctx) => { ... },
  });
  ```
  Exceeding the limit rejects with a `413` naming the limit and how to
  override it, before the handler's own logic ever sees the body.

## Testing without a socket

`server.inject()` dispatches a request through the full router/hook/handler
pipeline without binding a port — useful for fast, isolated route tests:

```ts
const res = await server.inject({ method: "GET", path: "/users" });
assert.equal(res.status, 200);
assert.deepEqual(res.json(), []);
```

## Prebuilt binaries

`git clone` + `npm start` (or `deno task test`) is still the recommended way
to run depless. As an experiment, self-contained `node:sea` and
`deno compile` binaries for Linux, macOS, and Windows are also built,
verified, and attached to [releases](../../releases) — single-file
executables that unpack their own embedded source on first run. See
[BINARIES.md](./BINARIES.md) for how that works, the honest size numbers,
and how to verify or reproduce a build yourself.

## Project layout

```
source/
  server/       core server, router, route compiler, context, request/response, plugin & hook system
  plugins/      example plugins (logger, users, language)
  helpers/      small stdlib-only utilities used across the codebase
  main.ts       demo wiring the pieces together
test/           integration tests (real socket)
sea/            node:sea entry point + build script (see BINARIES.md)
plan/           design notes for in-progress and completed work
```
