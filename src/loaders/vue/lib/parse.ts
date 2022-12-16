import { ParsedAsset } from "@toypack/loaders/types";
import { ALLOWED_MODULE_IMPORTS_PATTERN } from "@toypack/core/globals";
import { extname } from "path";
import {
	parse as parseSFC,
	compileScript,
	compileStyleAsync,
	rewriteDefault,
	compileTemplate,
	SFCDescriptor,
	SFCTemplateCompileOptions,
	SFCScriptCompileOptions,
} from "@vue/compiler-sfc";
import MagicString from "magic-string";
import { uuid } from "@toypack/utils";
import * as test from "@vue/compiler-sfc";
import { createSourceMap as createSourceMap } from "@toypack/core/SourceMap";
const COMP_NAME = "__sfc__";

function getScript(descriptor: SFCDescriptor, scopeId: string, source: string) {
	const TEMPLATE_OPTIONS: SFCTemplateCompileOptions = {
		filename: descriptor.filename,
		id: scopeId,
		source: descriptor.template?.content || "",
		isProd: false,
		slotted: descriptor.slotted,
		scoped: descriptor.styles.some((s) => s.scoped)
	};

	const SCRIPT_OPTIONS: SFCScriptCompileOptions = {
		id: scopeId,
		inlineTemplate: true,
		reactivityTransform: true,
		templateOptions: TEMPLATE_OPTIONS,
		isProd: false,
		babelParserPlugins: ["typescript", "jsx"],
		sourceMap: true,
	};

	// [1] - Compile script
	let parsedScript = compileScript(descriptor, SCRIPT_OPTIONS);
	//console.log("%c Parsed Script: ", "color: yellow;");
	//console.log(parsedScript);
	let sourceMap = createSourceMap(parsedScript.map);

	// [2] - Instantiate the script code
	let scriptCode = new MagicString(parsedScript.content);

	// Manage bindings
	if (parsedScript.bindings) {
		scriptCode.prepend(
			`/* Analyzed bindings: ${JSON.stringify(
				parsedScript.bindings,
				null,
				4
			)} */\n`
		);

		TEMPLATE_OPTIONS.compilerOptions = {
			prefixIdentifiers: true,
			bindingMetadata: parsedScript.bindings,
		};
	}

	// [3] - Append the parsed script into script code
	scriptCode.update(
		0,
		scriptCode.length(),
		rewriteDefault(parsedScript.content, COMP_NAME)
	);

	// Only compile template if there is no script setup
	if (descriptor.template && descriptor.script && !descriptor.scriptSetup) {
		const parsedTemplate = compileTemplate(TEMPLATE_OPTIONS);
		//console.log("%c Parsed Template: ", "color: yellow;");
		//console.log(parsedTemplate);

		if (parsedTemplate.code) {
			// ?[4] - Append parsed template script into script code
			scriptCode.append("\n");
			scriptCode.append(
				parsedTemplate.code.replace(
					/\nexport (function|const) (render|ssrRender)/,
					`function render`
				)
			);

			// Append renderer function to SFC instance
			scriptCode.append("\n");
			scriptCode.append(`${COMP_NAME}.render = render;`);
		}
	}

	// [5] - Append scope id to SFC instance
	scriptCode.append(`\n${COMP_NAME}.__scopeId = "data-v-${scopeId}";`);

	// [5] - Append scope id to SFC instance
	scriptCode.append(`\n${COMP_NAME}.__file = "${source}";`);

	// [6] - Export the SFC instance
	scriptCode.append(`\nexport default ${COMP_NAME};`);

	//console.log("%c Output: ", "color: red;");
	//console.log(scriptCode.toString());

	let scriptContent = scriptCode.toString();
	let scriptMap = scriptCode.generateMap({
		file: source,
		source: source,
		hires: true,
		includeContent: true,
	});

	return {
		content: scriptContent,
		map: sourceMap.mergeWith(scriptMap),
	};
}

function getStyles(descriptor: SFCDescriptor, scopeId: string, source: string) {
	for (let style of descriptor.styles) {
		
	}
}

function parse(content: string | Uint8Array, source: string) {
	if (typeof content != "string") {
		let error = new Error("Content must be string.");
		error.stack = "Vue Parse Error: ";
		throw error;
	}

	console.log(`%c -------------- ${source} -------------`, "color: green;");
	const SCOPE_ID = uuid();

	const { descriptor, errors } = parseSFC(content, {
		sourceMap: true,
		filename: source,
	});

	console.log(`%c Descriptor: `, "color: green;", descriptor);

	if (errors.length) {
		console.error(errors[0]);
	}

	// Get script
	let script = getScript(descriptor, SCOPE_ID, source);

	// Get styles
	let styles = getStyles(descriptor, SCOPE_ID, source);

	const AST = null;

	const result: ParsedAsset = {
		AST,
		dependencies: [],

		// For compilation
		metadata: {
			content: script,
			styles: [],
		},
	};

	console.log(`%c Result: `, "color: red;", result);

	return result;
}

export default parse;