import { parse, join, sep } from "path";

export default function formatPath(from: string, to: string) {
	let parsed = parse(from);
	let result = to;
	for (let [property, value] of Object.entries(parsed)) {
		if (to.indexOf(`[${property}]`) === -1) continue;
		let propertyStr = `\\[${property}\\]`;
		let propertyRegex = new RegExp(propertyStr, "g");

		if (property == "root" || property == "dir") {
			value = `${sep}${value}${sep}`;
		}

		result = result.replace(propertyRegex, value);
	}

	result = join(result);

	return result;
}
