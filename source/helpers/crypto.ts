import { type BinaryToTextEncoding, createHash, createHmac, type Hash, type Hmac } from "node:crypto";
import { any, isNodeJSArrayBufferView, isString } from "./guards.ts";

export type Hashable = string | NodeJS.ArrayBufferView;

export const isHashable = any<Hashable>(isString, isNodeJSArrayBufferView);

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

		return inputs
			.reduce((hash: Hash, input) => hash.update(input), createHash(algorithm))
			.digest(encoding);
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
