import { uuid } from "../helpers/id.ts";
import type { Context } from "../server/context.ts";
import type { Plugin, PluginResult } from "../server/server.ts";

export const language: Plugin = {
	name: "language",
	dependencies: ["logger"],
	register: (s) => {
		const languages = [{ tag: "nl", region: ["NL", "BE"] }];

		// plain return → 200 JSON
		s.route({
			method: "GET",
			path: "/languages",
			handler: () => languages,
		});

		s.route({
			method: "GET",
			path: "/languages/{tag}",
			handler: ({ params: { tag } }) =>
				languages.find((lang) => lang.tag === tag),
		});

		return {};
	},
};
