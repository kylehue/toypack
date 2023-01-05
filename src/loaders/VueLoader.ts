import Toypack from "@toypack/core/Toypack";
import {
   IAsset,
   CompiledAsset,
   ToypackLoader,
   ParsedAsset,
   DependencyData,
} from "@toypack/core/types";
import {
   parse as parseSFC,
   compileScript,
   compileStyle,
   compileTemplate,
   SFCDescriptor,
   SFCTemplateCompileOptions,
   SFCScriptCompileOptions,
   SFCScriptBlock,
} from "@vue/compiler-sfc";
import * as shortid from "shortid";
import { getASTImports } from "@toypack/utils";
import { Node } from "@babel/traverse";
import SourceMap from "@toypack/core/SourceMap";
shortid.characters("1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ$_");

function extractDeps(AST?: Node | Node[]) {
   const deps: DependencyData[] = [];
   if (AST) {
      let imports = getASTImports(AST);

      for (let dep of imports) {
         let isAdded = deps.some((d) => d.source === dep.id);

         if (!isAdded) {
            deps.push({
               source: dep.id,
            });
         }
      }
   }

   return deps;
}

const compIdentifier = "__sfc__";
export default class VueLoader implements ToypackLoader {
   public name = "VueLoader";
   public test = /\.vue$/;

   public parse(asset: IAsset, bundler: Toypack) {
      if (typeof asset.content != "string") {
         throw new Error("Vue Parse Error: Asset content must be string.");
      }

      // Create scope id
      const scopeId = shortid.generate();

      let result: ParsedAsset = {
         dependencies: [],
         metadata: {
            scopeId,
         },
         use: {},
      };

      // Parse SFC
      let parsedSFC = parseSFC(asset.content, {
         sourceMap: !!bundler.options.bundleOptions?.output?.sourceMap,
         filename: asset.source,
      });

      // Throw errors
      if (parsedSFC.errors.length) {
         for (let err of parsedSFC.errors) {
            throw err;
         }
      }

      // Descriptor
      let descriptor = parsedSFC.descriptor;
      result.metadata.descriptor = descriptor;

      // Compile script
      const templateCompileOptions: SFCTemplateCompileOptions = {
         id: scopeId,
         filename: descriptor.filename,
         source: descriptor.template?.content || "",
         isProd: bundler.options.bundleOptions?.mode == "production",
         slotted: descriptor.slotted,
         scoped: descriptor.styles.some((s) => s.scoped),
      };
      result.metadata.templateCompileOptions = templateCompileOptions;

      const scriptCompileOptions: SFCScriptCompileOptions = {
         id: scopeId,
         inlineTemplate: true,
         reactivityTransform: true,
         templateOptions: templateCompileOptions,
         isProd: bundler.options.bundleOptions?.mode == "production",
         babelParserPlugins: ["typescript", "jsx"],
         sourceMap: !!bundler.options.bundleOptions?.output?.sourceMap,
      };
      result.metadata.scriptCompileOptions = scriptCompileOptions;

      let scriptCompilation = compileScript(descriptor, scriptCompileOptions);
      result.metadata.scriptCompilation = scriptCompilation;

      // Extract script dependencies
      result.dependencies.push(...extractDeps(scriptCompilation.scriptAst));
      result.dependencies.push(
         ...extractDeps(scriptCompilation.scriptSetupAst)
      );

      // Parse style
      for (let style of descriptor.styles) {
         if (!result.use) continue;

         let lang = style.lang ? style.lang : "css";

         if (!result.use[lang]) {
            result.use[lang] = [];
         }

         result.use[lang].push({
            content: style.content,
         });
      }

      return result;
   }

   public compile(asset: IAsset, bundler: Toypack) {
      if (typeof asset.content != "string") {
         throw new Error("Vue Compile Error: Asset content must be string.");
      }

      let metadata = asset.loaderData.parse?.metadata;

      if (!metadata) {
         throw new Error("Vue Compile Error: Asset's metadata is empty.");
      }

      let descriptor: SFCDescriptor = metadata.descriptor;
      let templateCompileOptions: SFCTemplateCompileOptions =
         metadata.templateCompileOptions;
      let scriptCompilation: SFCScriptBlock = metadata.scriptCompilation;

      let content = bundler._createMagicString(scriptCompilation.content);

      // Rewrite `export default` to comp identifier
      content.replace("export default", `var ${compIdentifier} = `);

      // Manage bindings
      if (scriptCompilation.bindings) {
         content.prepend(
            `/* Analyzed bindings: ${JSON.stringify(
               scriptCompilation.bindings,
               null,
               4
            )} */\n`
         );

         templateCompileOptions.compilerOptions = {
            prefixIdentifiers: true,
            bindingMetadata: scriptCompilation.bindings,
         };
      }

      // Only compile template if there is no script setup
      if (descriptor.template && descriptor.script && !descriptor.scriptSetup) {
         // TODO: Merge template's source map
         let parsedTemplate = compileTemplate(templateCompileOptions);
         //console.log("%c Parsed Template: ", "color: yellow;");
         //console.log(parsedTemplate);

         if (parsedTemplate.code) {
            // ?[4] - Append parsed template script into script code
            content.append("\n");
            content.append(
               parsedTemplate.code.replace(
                  /\nexport (function|const) (render|ssrRender)/,
                  `function render`
               )
            );

            // Append renderer function to SFC instance
            content.append("\n");
            content.append(`${compIdentifier}.render = render;`);
         }
      }

      // Append scope id to SFC instance
      content.append(
         `\n${compIdentifier}.__scopeId = "data-v-${metadata.scopeId}";`
      );

      // Filename
      content.append(`\n${compIdentifier}.__file = "${asset.source}";`);

      // Export the SFC instance
      content.append(`\nexport default ${compIdentifier};`);

      // Out
      let result: CompiledAsset = {
         content: bundler._createMagicString(""),
         map: new SourceMap(scriptCompilation.map).mergeWith(
            content.generateMap({
               source: asset.source,
               hires: bundler._sourceMapConfig?.[1] == "hires",
            })
         ),
         use: {
            [scriptCompilation.lang || "js"]: [
               {
                  content: content.toString(),
               },
            ],
         },
      };

      // Compile styles
      for (let style of descriptor.styles) {
         if (!result.use) continue;

         let lang = style.lang ? style.lang : "css";

         if (!result.use[lang]) {
            result.use[lang] = [];
         }

         let styleCompilation = compileStyle({
            id: metadata.scopeId,
            filename: asset.source,
            source: style.content,
            scoped: style.scoped
         });

         result.use[lang].push({
            content: styleCompilation.code,
         });
      }

      return result;
   }
}
