// The SEA entry point. Node's single-executable-application feature only
// supports a CommonJS main script (no top-level import/export), so this file
// stays plain CJS and reaches for dynamic import() once the real, extracted
// ESM sources are on disk.
const { mkdir, writeFile, rename, rm } = require("node:fs/promises");
const { existsSync } = require("node:fs");
const { createHash } = require("node:crypto");
const { dirname, join, basename } = require("node:path");
const { pathToFileURL } = require("node:url");
const sea = require("node:sea");

async function extractAssets(dir, keys) {
	const tmp = `${dir}.tmp-${process.pid}`;
	await rm(tmp, { recursive: true, force: true });
	for (const key of keys) {
		const dest = join(tmp, ...key.split("/"));
		await mkdir(dirname(dest), { recursive: true });
		await writeFile(dest, Buffer.from(sea.getAsset(key)));
	}
	await mkdir(dirname(dir), { recursive: true });
	await rename(tmp, dir);
}

(async () => {
	const keys = sea.getAssetKeys().sort();

	// Content hash of the asset set, so a rebuilt binary gets a fresh
	// extraction dir instead of silently reusing a stale one.
	const hash = createHash("sha256");
	for (const key of keys) {
		hash.update(key).update(Buffer.from(sea.getAsset(key)));
	}
	const digest = hash.digest("hex").slice(0, 16);

	// Mirrors Deno's own `deno compile --self-extracting` convention: a
	// hidden, hash-named directory next to the executable.
	const exeDir = dirname(process.execPath);
	const exeName = basename(process.execPath);
	const extractDir = join(exeDir, `.${exeName}`, digest);

	if (!existsSync(extractDir)) {
		await extractAssets(extractDir, keys);
	}

	// Node strips the TypeScript types itself (>= 22.18), no loader needed.
	process.chdir(extractDir);
	await import(pathToFileURL(join(extractDir, "source/main.ts")).href);
})();
