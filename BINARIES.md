# Prebuilt binaries

This documents an experiment, not a core feature: can depless — a project
whose entire pitch is "no dependencies, no bundler, no build step" — still
demonstrate what its host ecosystems offer for single-binary distribution,
without compromising that pitch for anyone who just wants to `git clone` and
run it?

`git clone` + `npm start` (or `deno task test`) remains the recommended way
to use depless. What follows is a secondary, opt-in artifact, built and
verified in CI (`.github/workflows/compile.yml`), attached to tagged
releases (`.github/workflows/release.yml`) alongside the source archive
GitHub already generates automatically for every tag.

## The core trick: self-extract to real disk, then reuse the real toolchain

Both Node's `node:sea` and Deno's `deno compile` let you embed arbitrary
files into a compiled binary as inert byte blobs — there's no built-in way to
make `import`/`require` resolve against them in memory. Rather than writing
a custom in-memory ESM resolver (a lot of surface area for a ~40-file, ~280KB
source tree), both binaries **extract their embedded files to a real
directory on disk, then run the project's existing, unmodified toolchain
from there.** No custom loader logic beyond what `hooks.js` already does.

Concretely, each binary boots by:
1. Reading its own embedded assets (`source/`, `test/`, `hooks.js`,
   `package.json`, `tsconfig.json`, `deno.json`, `README.md` — everything
   needed for a working checkout).
2. Extracting them to a hidden, content-hashed directory next to the
   executable (`.<binary-name>/<hash>/`), skipping re-extraction if that
   directory already exists.
3. Running the extracted, unmodified entry point exactly as if you'd cloned
   the repo and run `npm start` / `deno task test` yourself.

This means the binary is only "single file" up until first run — after
that, there's a real, readable, editable, testable copy of depless sitting
next to it. That's arguably more interesting than the binary itself: a
downloaded executable that unpacks into the exact source you'd get from
`git clone`.

## Node: `node:sea`

`sea/bootstrap.cjs` is the SEA's `main` script. Node's SEA feature
(at least through Node 22/24, our floor — this may change in a future Node
release) **only supports a CommonJS main script** — no top-level
`import`/`export`. So the bootstrap is plain CJS, wrapped in an async IIFE,
and reaches for dynamic `import()` once the real ESM sources are extracted
to disk. It then `register()`s the extracted (unmodified) `hooks.js` loader
before importing `source/main.ts` — the same loader, doing the same
TS-stripping, `hooks.js` already does for `npm start`.

`sea/build.mjs` does the actual build:
1. Gathers the file list into a `sea-config.json` `assets` dict.
2. Runs `node --experimental-sea-config` to produce a prepared blob.
3. Copies the running `node` binary and splices the blob into it via
   [`postject`](https://github.com/nodejs/postject) (invoked as
   `npx postject@<pinned-version>` — the one external tool in this whole
   pipeline; it's what Node's own SEA docs use, since Node core doesn't ship
   the injector itself). It's never added to `package.json`/`node_modules` —
   it only runs inside this build script.
4. On macOS, removes and re-applies an ad-hoc code signature
   (`codesign --sign -`) around the injection step, since postject
   invalidates the original signature.

**Known constraints, found by actually building and running this, not just
reading docs:**
- `mainFormat: "module"` (documented in newer Node releases) doesn't apply
  to Node 22/24 — confirmed by reproducing a literal
  `SyntaxError: Cannot use import statement outside a module` when trying
  it, then checking the version-specific docs.
- Inside a SEA, `process.argv` keeps the normal two-slot prefix
  (`[execPath, "script path"]`, the second slot just repeating the exe path
  since there's no separate script file) — argument parsing needs
  `argv.slice(2)`, not `slice(1)`.
- macOS binaries are ad-hoc signed — fine for the machine that built them,
  will not pass Gatekeeper on a different Mac without a real Developer ID.
  Windows binaries are unsigned entirely (no certificate available) —
  expect a SmartScreen warning. Verify via checksum instead (see below), not
  by trusting a signature that doesn't exist.

## Deno: `deno compile --self-extracting`

Deno has the same capability built in, stable, and far simpler — no
external tool, no CommonJS workaround, no argv gotchas:

```
deno compile --allow-net --allow-env --self-extracting \
  --include source --include test --include hooks.js \
  --include package.json --include tsconfig.json --include deno.json \
  --include README.md \
  --output depless-deno source/main.ts
```

`--self-extracting` is exactly the mechanism described above, built into
Deno itself. `--include` embeds files/directories beyond what the module
graph would reach on its own (needed here since `test/` and unused
`source/helpers/*` files aren't imported by `source/main.ts`). Deno also
extracts to a hidden, hash-named directory next to the binary — the exact
same convention `bootstrap.cjs` was written to mirror, on purpose, for a
fair side-by-side.

## The honest numbers

Measured on Node v22.22.3, Deno v2.8.3, macOS arm64 — sizes on Linux/Windows
will vary slightly but the shape holds:

| Variant | Size |
|---|---|
| Plain `node` binary alone | 108M |
| depless source tree (`source/` + `test/` + configs + README) | 212K |
| Node SEA binary, no embedded assets (baseline "hello world") | 107M |
| Node SEA binary, full 43-file source tree embedded | 107M (blob itself: 104K) |
| Deno compiled binary, full source tree embedded, self-extracting | ~70M |

The takeaway: **the embedded assets are essentially free** — both binaries
are almost entirely "a copy of the runtime," and the actual project adds a
rounding error's worth of bytes. Deno's binary is meaningfully smaller
because Deno's runtime distribution itself is smaller than Node's, not
because of anything specific to this project. Neither shrinks with
tree-shaking — you always ship the full runtime, whether your app uses 5%
of its APIs or 95%. That's the real limitation of "single executable" as a
distribution model for a project this size: the executable is enormously
larger than the software it contains, and the moment you're running under
something like pm2/nodemon/Kubernetes, you already have a runtime present
and the binary buys nothing over just running the source directly. The
compelling case is narrower: handing someone a single file who has neither
Node nor Deno installed at all.

## Verifying a downloaded binary

Released binaries ship next to a `SHA256SUMS.txt`. Verify before running
anything you didn't build yourself:

```
shasum -a 256 -c SHA256SUMS.txt
```

There is no code-signing trust chain here (see the signing caveats above) —
checksum verification against what CI actually built and tested is the
honest alternative on offer, not a substitute for one.

## Reproducing a build yourself

```
node sea/build.mjs dist/depless-node      # Node SEA
deno compile --allow-net --allow-env --self-extracting \
  --include source --include test --include hooks.js \
  --include package.json --include tsconfig.json --include deno.json \
  --include README.md \
  --output dist/depless-deno source/main.ts        # Deno
```

Both are exactly what `.github/workflows/compile.yml` runs in CI, on all
three OSes, verifying in each case that the binary boots, self-extracts,
and that `npm test` / `deno task test` passes from inside the extracted
directory — not just that the binary launched.
