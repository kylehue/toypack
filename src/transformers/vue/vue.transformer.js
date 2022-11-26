import {
	parse as parseSFC,
	compileScript,
	compileStyleAsync,
	rewriteDefault,
} from "@vue/compiler-sfc";
import uuid from "../../core/utils/uuid";
let sample = `
<template>
   <span>{{t}}</span>
</template>
<script setup>
import {ref} from "vue";
let t = ref(0);
</script>

<style lang="scss" scoped>
body {
   background: blue;
   span {
   color: green;
}
}
</style>
`;
const COMP_NAME = "__sfc__";
export default class VueTransformer {
	constructor() {}

	async apply(asset) {
		let id = uuid();
		let parsed = parseSFC(sample).descriptor;

		let compiledScript = compileScript(parsed, {
			id,
			inlineTemplate: true,
			reactivityTransform: true,
			templateOptions: {
				id,
				source: parsed.template.content,
				isProd: false,
				slotted: parsed.slotted,
				scoped: parsed.styles.some((s) => s.scoped),
			},
		});

		let scriptCode = "";
		if (compiledScript.bindings) {
			scriptCode += `\n/* Analyzed bindings: ${JSON.stringify(
				compiledScript.bindings,
				null,
				4
			)} */\n`;
		}

		scriptCode += rewriteDefault(compiledScript.content, COMP_NAME);
		scriptCode += `\n${COMP_NAME}.__scopeId = "data-v-${id}";`;
		scriptCode += `\nexport default ${COMP_NAME};`;

		/* let styles = {};
		for (let style of parsed.styles) {
			styles.push(
				await compileStyleAsync({
					source: style.content,
					id,
					scoped: style.scoped,
					modules: !!style.module,
				})
			);
		} */
	}
}
