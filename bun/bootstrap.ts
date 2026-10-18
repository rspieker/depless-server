// The entry point for `bun build --compile`. Bun embeds the files passed via
// --asset, but only the bundled module graph is importable from inside the
// binary — so, like sea/bootstrap.cjs, this extracts the embedded assets to
// real disk and imports the unmodified sources from there.
import { mkdir, rename, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { basename, dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

// Asset names are the relative paths given to --asset, normalised to forward
// slashes so the hash below is identical across platforms.
const files = [...Bun.embeddedFiles]
	.map((blob) => ({ key: blob.name.split(/[\\/]+/).join("/"), blob }))
	.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

async function extractAssets(dir: string) {
	const tmp = `${dir}.tmp-${process.pid}`;
	await rm(tmp, { recursive: true, force: true });
	for (const { key, blob } of files) {
		await Bun.write(join(tmp, ...key.split("/")), blob);
	}
	await mkdir(dirname(dir), { recursive: true });
	await rename(tmp, dir);
}

// Content hash of the asset set, so a rebuilt binary gets a fresh extraction
// dir instead of silently reusing a stale one.
const hash = createHash("sha256");
for (const { key, blob } of files) {
	hash.update(key).update(new Uint8Array(await blob.arrayBuffer()));
}
const digest = hash.digest("hex").slice(0, 16);

// Same convention as the Node SEA and `deno compile --self-extracting`: a
// hidden, hash-named directory next to the executable.
const exeDir = dirname(process.execPath);
const exeName = basename(process.execPath);
const extractDir = join(exeDir, `.${exeName}`, digest);

if (!existsSync(extractDir)) {
	await extractAssets(extractDir);
}

process.chdir(extractDir);
await import(pathToFileURL(join(extractDir, "source/main.ts")).href);
