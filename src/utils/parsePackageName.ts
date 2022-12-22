export interface ParsedPackage {
	name: string;
	version: string;
}

export default function parsePackageName(str: string) {
	// Get core module name (no versions)
	let split = str.split("@");
	let isScoped = str.startsWith("@");
	let packageName = "";
	let packageVersion;

	// Check if module is scoped
	if (isScoped) {
		packageName = "@" + split[1];
		packageVersion = split[2];
	} else {
		packageName = split[0];
		packageVersion = split[1];
	}

	let result: ParsedPackage = {
		name: packageName,
		version: packageVersion || "",
	};

	return result;
}
