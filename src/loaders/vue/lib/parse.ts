import { ParsedAsset } from "@toypack/loaders/types";
import {
	parse as parseSFC,
} from "@vue/compiler-sfc";
import { LOADERS } from "@toypack/core/Toypack";

function parse(content: string | Uint8Array, source: string) {
	if (typeof content != "string") {
		let error = new Error("Vue Parse Error: Content must be string.");
		throw error;
	}

	console.log(`%c -------------- ${source} -------------`, "color: green;");

	const { descriptor, errors } = parseSFC(content, {
		sourceMap: true,
		filename: source,
	});

	console.log(`%c Descriptor: `, "color: green;", descriptor);

	if (errors.length) {
		console.error(errors[0]);
	}

	const AST = null;

	const result: ParsedAsset = {
		AST,
		dependencies: [],

		// For compilation
		metadata: {
			descriptor,
		},
	};

	// Get babel loader for parsing
	let BabelLoader = LOADERS.find(ldr => ldr.name === "BabelLoader");

	if (BabelLoader) {
		// Get dependencies of script setup
		if (descriptor.scriptSetup) {
			let parsed = BabelLoader.use.parse(descriptor.scriptSetup.content, source);

			console.log(parsed);
			
		}
	} else {
		let error = new Error(
			"Vue Parse Error: Babel parser is required to parse Vue files."
		);

		throw error;
	}

	console.log(`%c Result: `, "color: red;", result);

	return result;
}

export default parse;