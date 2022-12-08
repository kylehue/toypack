import { ParsedAsset } from "@toypack/loaders/types";
import { ALLOWED_MODULE_IMPORTS_PATTERN } from "@toypack/core/globals";
import { extname } from "path";
import {
	parse as parseSFC,
	compileScript,
	compileStyleAsync,
	rewriteDefault,
	compileTemplate,
	MagicString,
	SFCDescriptor,
	SFCTemplateCompileOptions,
	SFCScriptCompileOptions,
} from "@vue/compiler-sfc";
import { uuid } from "@toypack/utils";
import * as test from "@vue/compiler-sfc";
const COMP_NAME = "__sfc__";
function getScript(descriptor: SFCDescriptor, scopeId: string) {
	let scriptDescriptor = descriptor.script
		? descriptor.script
		: descriptor.scriptSetup;

	const TEMPLATE_OPTIONS: SFCTemplateCompileOptions = {
		filename: descriptor.filename,
		id: scopeId,
		source: descriptor.template?.content || "",
		isProd: false,
		slotted: descriptor.slotted,
		scoped: descriptor.styles.some((s) => s.scoped),
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

	// [2] - Instantiate the script code
	let scriptCode = new MagicString("");

	// Manage bindings
	if (parsedScript.bindings) {
		scriptCode.append(
			`\n/* Analyzed bindings: ${JSON.stringify(
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
	scriptCode.append("\n");
	scriptCode.append(rewriteDefault(parsedScript.content, COMP_NAME));

	// Only compile template if there is no script setup
	if (descriptor.template && !descriptor.scriptSetup) {
		const parsedTemplate = compileTemplate(TEMPLATE_OPTIONS);

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
	scriptCode.append("\n");
	scriptCode.append(`${COMP_NAME}.__scopeId = "data-v-${scopeId}";`);

	// [6] - Export the SFC instance
	scriptCode.append("\n");
	scriptCode.append(`export default ${COMP_NAME};`);

	//console.log(scriptCode.toString());
}

export default function parse(content: string, source: string) {
	const SCOPE_ID = uuid();

	const { descriptor, errors } = parseSFC(content, {
		sourceMap: true,
		filename: source,
	});

	if (errors.length) {
		console.error(errors[0]);
	}

	// Get script
	let script = getScript(descriptor, SCOPE_ID);

	const AST = null;

	const result: ParsedAsset = {
		AST,
		dependencies: [],

		// For compilation
		data: {
			content: "",
			styles: [],
		},
	};

	return result;
}
