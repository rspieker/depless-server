import type { Context } from "../server/context.ts";
import type { Plugin } from "../server/server.ts";

export const logger: Plugin = {
	name: "logger",
	register: (server) => {
		const hrtime: WeakMap<
			Context,
			ReturnType<typeof process.hrtime>
		> = new WeakMap();

		server.hook("before-handler", (context) => {
			console.log(`${context.method.toUpperCase()} ${context.url}`);
			hrtime.set(context, process.hrtime());
		});

		server.hook("before-response", (context) => {
			let duration: string | undefined;

			if (hrtime.has(context)) {
				const delta = process.hrtime(hrtime.get(context));
				hrtime.delete(context);

				duration = (delta[0] * 1e3 + delta[1] / 1e6).toFixed(2) + "ms";
			}

			console.log(
				`${context.method.toUpperCase()} ${context.url} - ${context.res.statusCode} - ${duration}`,
			);
		});

		console.log("logger: ready");
	},
};
