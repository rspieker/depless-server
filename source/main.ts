import { language } from "./plugins/language.ts";
import { logger } from "./plugins/logger.ts";
import { routeStatistics } from "./plugins/route-statistics.ts";
import { tokenAuth } from "./plugins/token-auth.ts";
import { users } from "./plugins/users.ts";
import { Server } from "./server/server.ts";

const server = new Server({
	"token-auth": { secret: process.env.AUTH_SECRET ?? "dev-secret" },
});

await server.register(logger);
await server.register(users);
await server.register(language);
await server.register(tokenAuth);
await server.register(routeStatistics);

server.route({
	method: "GET",
	path: "/",
	handler: () => ({ name: "depless-server" }),
});

await server.start(3000);
