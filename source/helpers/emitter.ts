export type Event<T extends string> = {
	type: T;
	[key: string]: unknown;
};
export type Emitter<T extends Event<string>> = {
	on(type: T["type"], handler: (event: T) => void): () => void;
	once(type: T["type"], handler: (event: T) => void): () => void;
	off(type: T["type"], handler: (event: T) => void): void;
	emit(event: T): void;
};
export type Listener<T extends Event<string>> = Omit<Emitter<T>, "emit">;
type Registered<T extends Event<string>> = {
	type: T["type"];
	limit: number;
	handler: (event: T) => void;
};

export function emitter<T extends Event<string>>(): Emitter<T> {
	const registered: Array<Registered<T>> = [];
	const purge = (...regs: Array<Registered<T>>) => {
		for (const reg of regs) {
			registered.splice(registered.indexOf(reg), 1);
		}
	};

	return {
		on(type: T["type"], handler: (event: T) => void): () => void {
			const reg = { type, limit: Infinity, handler };
			registered.push(reg);

			return () => purge(reg);
		},
		once(type: T["type"], handler: (event: T) => void): () => void {
			const reg = { type, limit: 1, handler };
			registered.push(reg);

			return () => purge(reg);
		},
		off(type: T["type"], handler: (event: T) => void): void {
			const found = registered.find(
				(reg) => reg.type === type && reg.handler === handler,
			);
			found && purge(found);
		},
		emit(event: T): void {
			registered
				.filter((reg) => reg.type === event.type)
				.forEach((reg) => {
					if (--reg.limit <= 0) purge(reg);
					setTimeout(() => reg.handler(event), 0);
				});
		},
	};
}

export function extend<
	E extends Event<string>,
	T extends new (
		...args: Array<any>
	) => object,
>(ctor: T): T & Listener<E> {
	const emttr = emitter<E>();

	class Mixed extends ctor implements Listener<E> {
		on(...args: Parameters<Emitter<E>["on"]>): ReturnType<Emitter<E>["on"]> {
			return emttr.on(...args);
		}

		once(
			...args: Parameters<Emitter<E>["once"]>
		): ReturnType<Emitter<E>["once"]> {
			return emttr.once(...args);
		}

		off(...args: Parameters<Emitter<E>["off"]>): ReturnType<Emitter<E>["off"]> {
			return emttr.off(...args);
		}

		protected emit(event: E): void {
			emttr.emit(event);
		}
	}

	return Mixed as T & Listener<E>;
}
