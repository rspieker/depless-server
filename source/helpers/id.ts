const DEFAULT_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';

export function uuid(): string {
	return crypto.randomUUID();
}

export function nanoid(length = 21, alphabet = DEFAULT_ALPHABET): string {
	// Smallest bitmask that covers all indices — avoids modulo bias
	const mask = (2 << (31 - Math.clz32((alphabet.length - 1) | 1))) - 1;
	const step = Math.ceil((1.6 * mask * length) / alphabet.length);
	let id = '';
	while (id.length < length) {
		const bytes = crypto.getRandomValues(new Uint8Array(step));
		for (const byte of bytes) {
			const index = byte & mask;
			if (index < alphabet.length) {
				id += alphabet[index];
				if (id.length === length) break;
			}
		}
	}
	return id;
}
