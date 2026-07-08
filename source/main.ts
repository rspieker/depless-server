import { language } from "./plugins/language.ts";
import { logger } from "./plugins/logger.ts";
import { users } from "./plugins/users.ts";
import { Server } from "./server/server.ts";

const server = new Server();

await server.register(logger);
await server.register(users);
await server.register(language, "lang");

server.route({
	method: "GET",
	path: "/",
	handler: () => ({ name: "depless-server" }),
});

await server.start(3000);
