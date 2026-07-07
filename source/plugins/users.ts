import { uuid } from "../helpers/id.ts";
import type { Context } from "../server/context.ts";
import type { Plugin } from "../server/server.ts";

export const users: Plugin = {
	name: "users",
	dependencies: ["logger"],
	register: (s) => {
		const users = [
			{ id: uuid(), name: "Alice" },
			{ id: uuid(), name: "Bob" },
		];

		// plain return → 200 JSON
		s.route({
			method: "GET",
			path: "/users",
			handler: () => users,
		});

		// reply() → chainable status + headers
		s.route({
			method: "POST",
			path: "/users",
			handler: async ({ body, reply }: Context) => {
				const data = await body<{ name: string }>();
				const user = { id: uuid(), name: data?.name ?? "Unknown" };
				users.push(user);
				return reply(user).code(201);
			},
		});

		// literal beats param — registered first, scores higher
		s.route({
			method: "GET",
			path: "/users/me",
			handler: () => ({ id: "me", name: "Current User" }),
		});

		s.route({
			method: ["GET", "DELETE"],
			path: "/users/{id}",
			handler: ({ params, method, reply }: Context) => {
				const user = users.find((u) => u.id === params.id);
				if (!user) return reply({ error: "User not found" }).code(404);
				if (method === "DELETE") {
					users.splice(users.indexOf(user), 1);
					return; // undefined → 204
				}
				return user;
			},
		});

		// '*' catches any method not matched above
		s.route({
			method: "*",
			path: "/users/{id}",
			handler: ({ method, reply }: Context) =>
				reply({ error: `Method ${method} not allowed` }).code(405),
		});

		return {};
	},
};
