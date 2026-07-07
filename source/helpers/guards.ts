type Guard<T> = (input: unknown) => input is T;

function is<T>(...types: [string, ...Array<string>]): Guard<T> {
	return (input: unknown): input is T => types.includes(typeof input);
}

type Constructor<T = unknown> = new (...args: ReadonlyArray<unknown>) => T;

function isInstanceOf<T>(ctor: Constructor<T>): Guard<T> {
	return (input: unknown): input is T => input instanceof ctor;
}

export const isString = is<string>("string");
export const isNumber = is<number>("number");
export const isBoolean = is<boolean>("boolean");

export function isNULL(input: unknown): input is null {
	return input === null;
}

export function isArray(input: unknown): input is Array<unknown> {
	return Array.isArray(input);
}

type PlainObject = Record<string | symbol, unknown>;

export const isObject = all<object>(is("object"), not(isNULL, isArray));

export function isInteger(input: unknown): input is number {
	return Number.isInteger(input);
}

export function isPlainObject(input: unknown): input is PlainObject {
	return Object.prototype.toString.call(input) === "[object Object]";
}

export function isStruct<T extends PlainObject>(
	struct: { [K in keyof T]: Guard<T[K]> },
): Guard<T> {
	const guards = Object.keys(struct).map(
		(key) => (input: Partial<T>) => struct[key](input[key]),
	);

	return (input: unknown): input is T =>
		isObject(input) && guards.every((guard) => guard(input));
}

export const isStringPrimitiveOrObject = any<string | String>(
	isString,
	isInstanceOf(String),
);
export const isNumberPrimitiveOrObject = any<number | Number>(
	isNumber,
	isInstanceOf(Number),
);
export const isBooleanPrimitiveOrObject = any<boolean | Boolean>(
	isBoolean,
	isInstanceOf(Boolean),
);

export function isNodeJSArrayBufferView(
	input: unknown,
): input is NodeJS.ArrayBufferView {
	return ArrayBuffer.isView(input);
}

export function any<T>(...guards: [Guard<T>, ...Array<Guard<T>>]): Guard<T> {
	return (input: unknown): input is T => guards.some((guard) => guard(input));
}

export function all<T>(...guards: [Guard<T>, ...Array<Guard<T>>]): Guard<T> {
	return (input: unknown): input is T => guards.every((guard) => guard(input));
}

export function not<T>(
	...guards: [Guard<unknown>, ...Array<Guard<unknown>>]
): Guard<T> {
	const some = any(...guards);

	return (input: unknown): input is T => !some(input);
}
