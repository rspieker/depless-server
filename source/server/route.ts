export type Route = {
	path: string;
	pattern: RegExp;
	score: Array<number>;
};

const param = /\{(?<name>[^}:]+)(?::(?<format>[^}]+))?\}/g;
const meta = /[.*+?^${}()|[\]\\]/g;

function express(text: string): string {
	return text.replace(meta, "\\$&");
}

function segmentSpecificity(segment: string): number {
	const normalized = segment.replace(/\{[^}]+\}/g, "\x00");
	const { length } = normalized;
	let score = 0;

	for (let i = 0; i < length; i++) {
		if (normalized[i] !== "\x00") score += 1 - (i / length) * 0.1;
	}

	return Number((0.1 + 0.9 * (score / length)).toFixed(3));
}

export function compile(path: string): Route {
	const normal = path.startsWith("/") ? path.slice(1) : path;
	const segments = normal.split("/").filter(Boolean);
	const score: Array<number> = [];
	const parts = segments.map((segment) => {
		if (segment === "*") {
			score.push(0);
			return ".*";
		}

		let pattern = "";
		let cursor = 0;

		for (const match of segment.matchAll(param)) {
			const { name, format = "[^\\/]+" } = match.groups!;
			pattern +=
				express(segment.slice(cursor, match.index)) + `(?<${name}>${format})`;
			cursor = match.index + match[0].length;
		}

		pattern += express(segment.slice(cursor));

		score.push(segmentSpecificity(segment));

		return pattern;
	});

	const pattern = parts.join("\\/");

	return {
		path,
		score,
		pattern: new RegExp(`^\/${pattern}\/?$`),
	};
}
