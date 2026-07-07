import { isArray } from "./guards.ts";

export function last<T>(array: Array<T>): T | undefined {
	return array.at(-1);
}

export function findLast<T>(
	array: Array<T>,
	predicate: (item: T) => boolean,
): T | undefined {
	return array.findLast(predicate);
}

export function includes<T = unknown>(array: Array<T>, item: T): boolean {
	return isArray(array) && array.includes(item);
}
