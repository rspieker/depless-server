export class Reply {
	#data: unknown;
	#status = 200;
	#headers: Record<string, string> = {};

	constructor(data: unknown) {
		this.#data = data;
	}

	code(status: number): this {
		this.#status = status;
		return this;
	}

	header(name: string, value: string): this {
		this.#headers[name] = value;
		return this;
	}

	type(contentType: string): this {
		return this.header('Content-Type', contentType);
	}

	get data(): unknown { return this.#data; }
	get status(): number { return this.#status; }
	get headers(): Record<string, string> { return { ...this.#headers }; }
}
