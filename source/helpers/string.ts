import { isString } from './guards.ts';

export function includes(string: string, substring: string): boolean {
	return isString(string) && string.includes(substring);
}
