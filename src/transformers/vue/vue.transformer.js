import {
	parse as parseSFC,
	compileScript,
	compileStyleAsync,
	rewriteDefault,
	compileTemplate,
	MagicString,
} from "@vue/compiler-sfc";
import uuid from "../../core/utils/uuid";
import JSTransformer from "../js/js.transformer";
import postcssScss from "postcss-scss";
import postcssSass from "postcss-sass";
import Sass from "sass.js";
let sample = `
<template>
   <span>{{t}}</span>
</template>
<script lang="ts" setup>
import {ref} from "vue";
let t = ref(0);
let s:string = "test";
</script>
<style lang="sass" scoped>
@import "/sass/test.scss"
$g: green

body 
  color: $g

</style>
`;

/* Sass.importer((test) => {
	console.log(test);
}); */

import fs from "fs";
fs.mkdirSync("sass", {recursive: true});
fs.writeFileSync("/sass/test.scss", `
$hello: yellow;

span {
	color: $hello;
}
`);
console.log(process.stdout);
console.log(Sass.compile("sass/test.scss"));

const COMP_NAME = "__sfc__";
const SUPPORTED_SCRIPT_LANGS = [
	{
		ext: "ts",
		babelParserPlugin: "typescript",
		babelTransformerPlugin: "transform-typescript",
	},
];

const SUPPORTED_STYLE_LANGS = [
	{
		ext: "scss",
		postCSSParserPlugin: postcssScss,
		postCSSTransformerPlugin: "scss",
	},
	{
		ext: "sass",
		postCSSParserPlugin: postcssSass,
		postCSSTransformerPlugin: "sass",
	},
];
//import assets from "../../core/AssetManager"
/* Sass.importer((test) => {
	console.log(test);
	//test = assets.resolve();
}) */


export default class VueTransformer {
	constructor() {
		this.errors = [];
		this._jsTransformer = new JSTransformer();
	}

	async _doCompileStyle(scopeId, descriptor) {
		try {
			let styles = [];
			for (let style of descriptor.styles) {
				if (style.lang && style.lang != "css") {
					let error = `${style.lang} is not yet supported.`;
					console.warn(error);
					this.errors.push(error);
				}

				/* const parsedStyle = await compileStyleAsync({
					filename: "/sass/test.scss",
					source: style.content,
					id: scopeId,
					scoped: style.scoped,
					postcssOptions: {
						syntax: postcssScss,
					},
				});

				console.log(fs.readFileSync("/sass/test.scss", "utf8"));

				console.log(Sass);
				
				console.log(parsedStyle); */

				/* Sass.importer((test) => {
					console.log(test);
				}, (test) => {
					console.log(test);
				}) */

				/* Sass.compile(
					parsedStyle.code,
					{
						indentedSyntax: true,
						importer: (test) => {
							console.log(test);
						},
					},
					(res) => {
						console.log(res);
					}
				); */

				/* styles.push({
					content: parsedStyle.code,
				}); */
			}

			return styles;
		} catch (error) {
			console.warn(error);
			this.errors.push(error);
		}
	}

	async _doCompileScript(scopeId, descriptor) {
		try {
			let scriptDescriptor = descriptor.script
				? descriptor.script
				: descriptor.scriptSetup;
			// Only accept supported langs
			const dedicatedLang = SUPPORTED_SCRIPT_LANGS.find(
				(lang) => lang.ext === scriptDescriptor.lang
			);

			if (!scriptDescriptor.lang || dedicatedLang) {
				const templateOptions = {
					id: scopeId,
					source: descriptor.template.content,
					isProd: false,
					slotted: descriptor.slotted,
					scoped: descriptor.styles.some((s) => s.scoped),
				};

				// [1] - Compile script
				const parsedScript = compileScript(descriptor, {
					id: scopeId,
					inlineTemplate: true,
					reactivityTransform: true,
					templateOptions,
					isProd: false,
					babelParserPlugins: [dedicatedLang?.babelParserPlugin],
				});

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

					templateOptions.compilerOptions = {
						prefixIdentifiers: true,
						bindingMetadata: parsedScript.bindings,
					};
				}

				// [3] - Append the parsed script into script code
				scriptCode.append("\n");
				scriptCode.append(rewriteDefault(parsedScript.content, COMP_NAME));

				// Only compile template if there is no script setup
				if (descriptor.template && !descriptor.scriptSetup) {
					const parsedTemplate = compileTemplate(templateOptions);

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

				return {
					lang: dedicatedLang,
					content: scriptCode.toString(),
				};
			} else {
				let error = `${parsedScript.lang} is not yet supported.`;
				console.warn(error);
				this.errors.push(error);
			}
		} catch (error) {
			console.warn(error);
			this.errors.push(error);
		}
	}

	async apply(asset) {
		this.errors = [];
		const { descriptor, errors } = parseSFC(sample);

		// Handle errors
		if (errors.length) {
			for (let error of errors) {
				console.warn(error);
			}

			this.errors.push(...errors);
		}

		const scopeId = uuid();

		// [1] - Compile SFC's script
		const script = await this._doCompileScript(scopeId, descriptor);

		if (script) {
			// [2] - Transform SFC script
			await this._jsTransformer.apply(script, {
				babelTransformerOptions: {
					presets: ["es2015-loose"],
					compact: false,
					plugins: [script.lang?.babelTransformerPlugin],
				},
				babelParserOptions: {
					allowImportExportEverywhere: true,
					sourceType: "module",
					errorRecovery: true,
					plugins: [script.lang?.babelParserPlugin],
				},
			});

			this.js = {
				AST: this._jsTransformer.js.AST,
				dependencies: this._jsTransformer.js.dependencies,
				content: this._jsTransformer.js.content,
			};
		}

		// [3] - Compile SFC's style
		const style = this._doCompileStyle(scopeId, descriptor);

		if (style) {
		}
		console.log(this);
	}
}
