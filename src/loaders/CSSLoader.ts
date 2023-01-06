import Toypack from "@toypack/core/Toypack";
import {
   IAsset,
   CompiledAsset,
   ToypackLoader,
   ParsedAsset,
} from "@toypack/core/types";
import { cleanStr } from "@toypack/utils";
import postcss, {
   parse as parseCSS,
   AcceptedPlugin,
   ProcessOptions,
   ChildNode,
   AtRule,
   Declaration,
   Root,
} from "postcss";
import valueParser from "postcss-value-parser";
import { dirname } from "path-browserify";
import { minimizeStr } from "@toypack/utils";
import { cloneDeep, merge } from "lodash-es";

const urlFunctionRegex = /url\s*\("?(?![a-z]+:)/;
const styleTagIdentifier = "__style__";
const stylesheetIdentifier = "__stylesheet__";
function getTemplate(id: string | number) {
   return minimizeStr(`
var _head = document.head || document.getElementsByTagName("head")[0];
${styleTagIdentifier} = document.createElement("style");
${styleTagIdentifier}.dataset.toypackId = "asset-${id}";
${styleTagIdentifier}.setAttribute("type", "text/css");
_head.appendChild(${styleTagIdentifier});
if (${styleTagIdentifier}.styleSheet){
  ${styleTagIdentifier}.styleSheet.cssText = ${stylesheetIdentifier};
} else {
  ${styleTagIdentifier}.appendChild(document.createTextNode(${stylesheetIdentifier}));
}
`);
}

const defaultOptions: CSSLoaderOptions = {
   postcssConfig: {
      options: {},
      plugins: [],
   },
};

export interface PostCSSConfig {
   /**
    * PostCSS plugins.
    */
   plugins?: AcceptedPlugin[];
   /**
    * PostCSS processing options.
    */
   options?: ProcessOptions;
}

export interface CSSLoaderOptions {
   postcssConfig?: PostCSSConfig;
}

export interface ParseOptions extends CSSLoaderOptions {
   keepAtImportRules?: boolean;
}

interface ParseMetadata {
   AST: Root;
   atImportRuleNodes: AtRule[];
   urlDeclarationNodes: Declaration[];
}

export default class CSSLoader implements ToypackLoader {
   public name = "CSSLoader";
   public test = /\.css$/;

   constructor(public options?: CSSLoaderOptions) {
      this.options = merge(cloneDeep(defaultOptions), options);
   }

   public parse(asset: IAsset, bundler: Toypack, options?: ParseOptions) {
      if (typeof asset.content != "string") {
         let error = new Error("CSS Parse Error: Content must be string.");
         throw error;
      }

      const AST = parseCSS(
         asset.content,
         options?.postcssConfig?.options || this.options?.postcssConfig?.options
      );

      let parseMetadata: ParseMetadata = {
         AST,
         atImportRuleNodes: [],
         urlDeclarationNodes: [],
      };

      const result: ParsedAsset = {
         dependencies: [],
         metadata: parseMetadata,
      };

      AST.walk((node) => {
         if (node.type == "atrule" && node.name == "import") {
            // @import
            let parsedValue = valueParser(node.params);
            parsedValue.walk((valueNode) => {
               let dependencyId: string | null = null;
               if (
                  valueNode.type == "function" &&
                  valueNode.value == "url" &&
                  valueNode.nodes.length
               ) {
                  dependencyId = valueNode.nodes[0]?.value;
               } else if (valueNode.value && !valueNode.nodes?.length) {
                  dependencyId = valueNode.value;
               }

               if (dependencyId) {
                  result.dependencies.push({
                     source: dependencyId,
                  });

                  // Save
                  parseMetadata.atImportRuleNodes.push(node);
               }
            });
         } else if (node.type == "decl") {
            // css-property: url(...)
            const isURLFunction = urlFunctionRegex.test(node.value);
            if (isURLFunction) {
               let parsedValue = valueParser(node.value);
               parsedValue.walk(async (valueNode) => {
                  if (
                     valueNode.type === "function" &&
                     valueNode.value === "url" &&
                     valueNode.nodes.length &&
                     !valueNode.nodes[0].value.startsWith("#")
                  ) {
                     let source: string = valueNode.nodes[0].value;
                     if (!source.startsWith("data:")) {
                        result.dependencies.push({
                           source: source,
                        });

                        parseMetadata.urlDeclarationNodes.push(node);

                        // Require asset
                        let dependencyAbsolutePath = await bundler.resolve(
                           source,
                           {
                              baseDir: dirname(asset.source),
                           }
                        );

                        let cached = bundler.assets.get(dependencyAbsolutePath);

                        if (cached) {
                           node.value = `url("\${${cleanStr(source)}}")`;
                           
                        }
                     }
                  }
               });
            }
         }
      });

      return result;
   }

   public compile(asset: IAsset, bundler: Toypack) {
      if (typeof asset.content != "string") {
         let error = new Error("CSS Compile Error: Content must be string.");
         throw error;
      }

      const result: CompiledAsset = {
         content: bundler._createMagicString(asset.content),
      };

      let parseMetadata: ParseMetadata = asset.loaderData.parse?.metadata;
      let content: string | Root = asset.content;

      // Reuse AST if it exists
      if (parseMetadata?.AST) {
         content = parseMetadata.AST;

         // Remove import nodes
         for (let node of parseMetadata.atImportRuleNodes) {
            node.remove();
         }
      }

      // Process
      let processedContent: string = asset.content;
      if (!asset.isExternal) {
         const plugins = this.options?.postcssConfig?.plugins;
         const options = this.options?.postcssConfig?.options;

         processedContent = postcss(plugins).process(content, options).css;
      }

      let styleContent = `var ${stylesheetIdentifier} = (\`${processedContent.replace(
         /`/g,
         "\\`"
      )}\`);`;

      result.content?.update(0, result.content.length(), styleContent);
      result.content?.append(getTemplate(asset.id));

      // Avoid style duplicates
      result.content?.prepend(`if (!${styleTagIdentifier}) {`).append("}");
      result.content?.prepend(
         `var ${styleTagIdentifier} = document.querySelector("[data-toypack-id~='asset-${asset.id}']");`
      );

      // Imports
      let deps = asset.loaderData.parse?.dependencies;
      if (deps) {
         for (let dep of deps) {
            result.content?.prepend(
               `var ${cleanStr(dep.source)} = require("${dep.source}");`
            );
         }
      }

      return result;
   }
}
