import {
	type BinaryToTextEncoding,
	createHash,
	createHmac,
	type Hash,
	type Hmac,
	timingSafeEqual,
} from "node:crypto";
import {
	all,
	any,
	arrayOfSize,
	arrayOfType,
	isNodeJSArrayBufferView,
	isString,
} from "./guards.ts";

export type Hashable = string | NodeJS.ArrayBufferView;

export const isHashable = any<Hashable>(isString, isNodeJSArrayBufferView);
export const isHashableArray = all<[Hashable, ...Array<Hashable>]>(
	arrayOfSize(1, Number.MAX_SAFE_INTEGER),
	arrayOfType(isHashable),
);

/**
 * Create a hash object for a specific algorithm and apply updates to it using
 * any passed in value
 *
 * @param algorithm
 * @param encoding
 * @returns (...input: [Hashable, ...Array<Hashable>]) => string
 */
function hash(algorithm: string, ...values: Array<Hashable>): Hash {
	return values.reduce(
		(carry, value) => carry.update(value),
		createHash(algorithm),
	);
}

/**
 * Create a hashing function for a specific algorithm and digest method
 *
 * @param algorithm
 * @param encoding
 * @returns (...input: [Hashable, ...Array<Hashable>]) => string
 */
function hasher(algorithm: string, encoding: BinaryToTextEncoding) {
	return (...inputs: [Hashable, ...Array<Hashable>]): string => {
		if (!inputs.every(isHashable)) {
			throw new Error(`input cannot be hashed`);
		}

		return hash(algorithm, ...inputs).digest(encoding);
	};
}

export const sha256 = hasher("sha256", "hex");
export const sha512 = hasher("sha512", "hex");

export function hmac(key: Hashable, algorithm = "sha256") {
	return (...inputs: [Hashable, ...Array<Hashable>]): string => {
		if (!inputs.every(isHashable)) {
			throw new Error("input cannot be hashed");
		}

		return inputs
			.reduce((h: Hmac, input) => h.update(input), createHmac(algorithm, key))
			.digest("hex");
	};
}

/**
 * Create a hashing function for a specific algorithm and digest method
 *
 * @param algorithm
 * @param encoding
 * @returns (...input: [Hashable, ...Array<Hashable>]) => string
 */
export function safeEqual(a: Hashable, b: Hashable): boolean {
	return timingSafeEqual(
		hash("sha512", a).digest(),
		hash("sha512", b).digest(),
	);
}
