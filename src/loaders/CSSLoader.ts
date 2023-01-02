import Toypack from "@toypack/core/Toypack";
import {
   IAsset,
   CompiledAsset,
   ToypackLoader,
   ParsedAsset,
} from "@toypack/core/types";
import { cleanStr } from "@toypack/utils";
import postcss, { AcceptedPlugin, ProcessOptions } from "postcss";
import valueParser from "postcss-value-parser";
import { parse as parseCSS } from "postcss";
import { dirname } from "path-browserify";
import { minimizeStr } from "@toypack/utils";
import { cloneDeep, merge } from "lodash-es";
const URLFunctionRegex = /url\s*\("?(?![a-z]+:)/;

function getTemplate(id: string | number) {
   return minimizeStr(`
var _head = document.head || document.getElementsByTagName("head")[0];
_style = document.createElement("style");
_style.dataset.toypackId = "asset-${id}";
_style.setAttribute("type", "text/css");
_head.appendChild(_style);
if (_style.styleSheet){
  _style.styleSheet.cssText = __styleContent__;
} else {
  _style.appendChild(document.createTextNode(__styleContent__));
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

interface CSSLoaderOptions {
   postcssConfig?: PostCSSConfig;
}

export default class CSSLoader implements ToypackLoader {
   public name = "CSSLoader";
   public test = /\.css$/;

   constructor(public options?: CSSLoaderOptions) {
      this.options = merge(cloneDeep(defaultOptions), options);
   }

   public parse(asset: IAsset, bundler: Toypack, options?) {
      if (typeof asset.content != "string") {
         let error = new Error("CSS Parse Error: Content must be string.");
         throw error;
      }

      const AST = parseCSS(asset.content, this.options?.postcssConfig?.options);

      const result: ParsedAsset = {
         dependencies: [],
         metadata: { AST, URLDependencies: [] },
      };

      AST.walk((node: any) => {
         if (node.type == "atrule" && node.name == "import") {
            let parsedValue = valueParser(node.params);
            parsedValue.walk((valueNode: any) => {
               let dependencyId: any = null;
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
                  result.dependencies.push(dependencyId);

                  // Remove from AST
                  if (typeof options?.checkAtRules == "function") {
                     options.checkAtRules(node, dependencyId);
                  } else {
                     node.remove();
                  }
               }
            });
         } else if (node.type == "decl") {
            const isURLFunction = URLFunctionRegex.test(node.value);
            if (isURLFunction) {
               let parsedValue = valueParser(node.value);
               parsedValue.walk(async (valueNode: any) => {
                  if (
                     valueNode.type === "function" &&
                     valueNode.value === "url" &&
                     valueNode.nodes.length &&
                     !valueNode.nodes[0].value.startsWith("#")
                  ) {
                     let source = valueNode.nodes[0]?.value;
                     if (!source.startsWith("data:")) {
                        result.dependencies.push(source);

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

      let processedContent =
         asset.loaderData?.parse?.metadata?.AST?.toString() || asset.content;

      // Process
      if (!asset.isExternal) {
         const plugins = this.options?.postcssConfig?.plugins;
         const options = this.options?.postcssConfig?.options;
         processedContent = postcss(plugins).process(
            processedContent,
            options
         ).css;
      }

      let styleContent = 'var __styleContent__ = ("")';
      for (let line of processedContent.split("\n")) {
         line = line.replaceAll("`", "\\`");
         styleContent += `.concat(\`${line}\`)`;
      }

      styleContent += ";";

      // For dummy source map
      result.content.update(0, result.content.length(), styleContent);
      result.content.append(getTemplate(asset.id));

      // Avoid style duplicates
      result.content.prepend(`if (!_style) {`).append("}");
      result.content.prepend(
         `var _style = document.querySelector("[data-toypack-id~='asset-${asset.id}']");`
      );

      // Imports
      for (let dependency in asset.dependencyMap) {
         result.content.prepend(
            `var ${cleanStr(dependency)} = require("${dependency}");`
         );
      }

      return result;
   }
}
