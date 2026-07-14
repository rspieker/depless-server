import { safeEqual, sha512 } from "../helpers/crypto.ts";
import type { Context } from "../server/context.ts";
import type { Handler } from "../server/router.ts";
import type { Plugin } from "../server/server.ts";

type ProtectOptions = {
	secret?: string | Buffer;
	header?: string;
};

export const tokenAuth: Plugin = {
	name: "token-auth",
	register: (server) => {
		const defaults = server.options<ProtectOptions>();

		return {
			expose: {
				protect(handler: Handler, options: ProtectOptions = {}): Handler {
					const { secret, header = "x-auth-token" } = {
						...defaults,
						...options,
					};

					if (!secret) {
						throw new Error(
							'token-auth: no "secret" configured for protect()',
						);
					}

					const digest = sha512(secret);

					return (ctx: Context) => {
						const { [header]: token } = ctx.headers;

						if (!(token && safeEqual(sha512(token), digest))) {
							return ctx.empty(401);
						}

						return handler(ctx);
					};
				},
			},
		};
	},
};
