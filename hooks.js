import { register } from "node:module";
import { readFile } from "node:fs/promises";
import Module from "node:module";
import { isMainThread } from "node:worker_threads";

// if running from the main thread, register the hooks
// if you're adamant on using a separate register.js to do this:
//
// import { register } from "node:module";
// register("./hooks.js", import.meta.url);
if (isMainThread) {
	register(import.meta.url, import.meta.url);
}

// we know the stripTypeScriptTypes is experimental, we swallow those warnings
const warn = process.emitWarning.bind(process);
process.emitWarning = (warning, ...args) => {
	if (String(warning).includes("stripTypeScriptTypes")) return;
	warn(warning, ...args);
};

// the actual loader — Node's ESM resolver has no built-in format for .ts and
// would throw ERR_UNKNOWN_FILE_EXTENSION without this. We strip the types and
// explicitly declare the result as an ES module.
export async function load(url, context, next) {
	if (new URL(url).pathname.endsWith(".ts")) {
		const source = await readFile(new URL(url), "utf8");
		return {
			shortCircuit: true,
			source: Module.stripTypeScriptTypes(source),
			format: "module",
		};
	}
	return next(url, context);
}
