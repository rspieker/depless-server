import { isString } from './guards.ts';

type Transformer<I, O> = (input: I) => O;

type Transform<I, O> = {
	encode: Transformer<I, O>;
	decode: Transformer<O, I>;
};

function encoding<I, O = I>(
	encode: Transformer<I, O>,
	decode: Transformer<O, I>,
): Transform<I, O> {
	return { encode, decode };
}

export const base64 = encoding<string>(btoa, atob);

export const base64url = encoding<string>(
	(input: string) =>
		btoa(input).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, ""),
	(input: string) => atob(input.replace(/-/g, "+").replace(/_/g, "/")),
);

export const hex = encoding<string>(
	(input: string) => Buffer.from(input).toString("hex"),
	(input: string) => Buffer.from(input, "hex").toString(),
);

export const text = encoding<string, Uint8Array>(
	(input: string) => new TextEncoder().encode(input),
	(input: Uint8Array) => new TextDecoder().decode(input),
);

export function toUTF8(input: string | Uint8Array, encoding: string): string {
	return new TextDecoder(encoding).decode(
		isString(input) ? Buffer.from(input, 'binary') : input,
	);
}
