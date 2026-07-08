// Builds a Node single-executable-application binary that embeds this
// project's own source tree as extractable assets. See BINARIES.md
// for why this exists and how it compares to `deno compile --self-extracting`.
//
// The one external tool involved is postject, pinned below — it's the
// official mechanism (per Node's own SEA docs) for splicing the prepared
// blob into a copy of the `node` binary. It's invoked via npx, never added
// to package.json/node_modules.
//
// Usage: node sea/build.mjs <output-path>
import { execFileSync } from "node:child_process";
import {
	mkdir,
	copyFile,
	chmod,
	readdir,
	writeFile,
	rm,
} from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const POSTJECT_VERSION = "1.0.0-alpha.6";
const SENTINEL_FUSE = "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

const output = process.argv[2];
if (!output) {
	console.error("usage: node sea/build.mjs <output-path>");
	process.exit(1);
}

async function walk(dir) {
	const entries = await readdir(dir, { withFileTypes: true });
	const files = [];
	for (const entry of entries) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) files.push(...(await walk(full)));
		else files.push(full);
	}
	return files;
}

async function gatherAssets() {
	const files = [
		...(await walk(join(repoRoot, "source"))),
		...(await walk(join(repoRoot, "test"))),
		join(repoRoot, "hooks.js"),
		join(repoRoot, "package.json"),
		join(repoRoot, "tsconfig.json"),
		join(repoRoot, "deno.json"),
		join(repoRoot, "README.md"),
	];

	const assets = {};
	for (const file of files) {
		const key = relative(repoRoot, file)
			.split(/[\\/]+/)
			.join("/");
		assets[key] = file;
	}
	return assets;
}

async function main() {
	const assets = await gatherAssets();

	const work = join(tmpdir(), `depless-sea-build-${process.pid}`);
	await rm(work, { recursive: true, force: true });
	await mkdir(work, { recursive: true });

	const blobPath = join(work, "sea-prep.blob");
	const configPath = join(work, "sea-config.json");
	await writeFile(
		configPath,
		JSON.stringify(
			{
				main: join(repoRoot, "sea/bootstrap.cjs"),
				output: blobPath,
				disableExperimentalSEAWarning: true,
				assets,
			},
			null,
			2,
		),
	);

	console.log(
		`[build] generating blob from ${Object.keys(assets).length} assets`,
	);
	execFileSync(process.execPath, ["--experimental-sea-config", configPath], {
		stdio: "inherit",
	});

	await mkdir(dirname(output), { recursive: true });
	await copyFile(process.execPath, output);
	await chmod(output, 0o755);

	if (process.platform === "darwin") {
		try {
			execFileSync("codesign", ["--remove-signature", output], {
				stdio: "inherit",
			});
		} catch {
			// fine if there was no signature to remove
		}
	}

	const postjectArgs = [
		"--yes",
		`postject@${POSTJECT_VERSION}`,
		output,
		"NODE_SEA_BLOB",
		blobPath,
		"--sentinel-fuse",
		SENTINEL_FUSE,
	];
	if (process.platform === "darwin") {
		postjectArgs.push("--macho-segment-name", "NODE_SEA");
	}
	// shell: true because on Windows `npx` resolves to npx.cmd, which
	// execFileSync can't run directly without going through a shell.
	execFileSync("npx", postjectArgs, { stdio: "inherit", shell: true });

	if (process.platform === "darwin") {
		execFileSync("codesign", ["--sign", "-", output], { stdio: "inherit" });
	}

	await rm(work, { recursive: true, force: true });
	console.log(`[build] wrote ${output}`);
}

if (!existsSync(join(repoRoot, "sea/bootstrap.cjs"))) {
	throw new Error("sea/bootstrap.cjs is missing");
}

await main();
