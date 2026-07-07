import { includes as arrayIncludes } from "./array.ts";
import { isArray, isObject, isString } from "./guards.ts";
import { includes as objectIncludes } from "./object.ts";
import { includes as stringIncludes } from "./string.ts";

type Collection<T> = Array<T> | Record<string, T> | string;

export function includes<T>(collection: Collection<T>, item: unknown): boolean {
	if (isArray(collection)) return arrayIncludes(collection, item);
	if (isObject(collection)) return objectIncludes(collection, item);

	return isString(collection) && isString(item)
		? stringIncludes(collection, item)
		: false;
}
