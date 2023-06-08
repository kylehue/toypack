import { TransformOptions, BabelFileResult } from "@babel/core";
import { transformFromAst } from "@babel/standalone";
import traverseAST, { TraverseOptions, Node, NodePath } from "@babel/traverse";
import babelMinify from "babel-minify";
import MapConverter from "convert-source-map";
import * as CSSTree from "css-tree";
import path from "path-browserify";
import {
   SourceMapConsumer,
   SourceMapGenerator,
   RawSourceMap,
} from "source-map-js";
import { CodeComposer } from "./CodeComposer.js";
import { IDependency, IDependencyMap } from "./graph.js";
import * as rt from "./runtime.js";
import { Toypack } from "./Toypack.js";
import {
   JSONToBlob,
   findCodePosition,
   getHash,
   mergeSourceMaps,
} from "./utils.js";

export type ITraverseFunction<T> = (
   path: NodePath<Extract<Node, { type: T }>>,
   node: Node
) => void;

export type ITraverseOptions = {
   [Type in Node["type"]]?: ITraverseFunction<Type>;
};

export type ITraverseOptionGroups = {
   [Type in Node["type"]]?: ITraverseFunction<Type>[];
};

function groupTraverseOptions(array: ITraverseOptions[]) {
   const groups: ITraverseOptionGroups = {};

   for (const opts of array) {
      let key: Node["type"];
      for (key in opts) {
         let group = groups[key] as ITraverseFunction<typeof key>[];

         // Create group if it doesn't exist
         if (!group) {
            group = [] as ITraverseFunction<typeof key>[];
            (groups as any)[key] = group;
         }

         group.push((opts as any)[key]);
      }
   }

   return groups;
}

function createTraverseOptionsFromGroup(groups: ITraverseOptionGroups) {
   const options: ITraverseOptions = {};

   for (const [key, group] of Object.entries(groups)) {
      options[key as Node["type"]] = (scope, node) => {
         for (const fn of group) {
            (fn as ITraverseFunction<typeof key>)(scope, node);
         }
      };
   }

   return options as TraverseOptions;
}

/**
 * Transpile a Babel AST.
 */
async function transpileAST(
   this: Toypack,
   source: string,
   AST: Node,
   depMap: IDependencyMap,
   inputSourceMap?: RawSourceMap
) {
   const format = this.options.bundleOptions.module;
   const mode = this.options.bundleOptions.mode;

   const getSafeName = (relativeSource: string) => {
      const absoluteSource = depMap[relativeSource].absolute;
      return getHash(absoluteSource);
   };

   const traverseOptionsArray: ITraverseOptions[] = [];

   const modifyTraverseOptions = (traverseOptions: ITraverseOptions) => {
      traverseOptionsArray.push(traverseOptions);
   };

   await this.hooks.trigger("onTranspile", {
      AST,
      traverse: modifyTraverseOptions,
      source,
   });

   const isStyleSource = (relativeSource: string) => {
      const absoluteSource = depMap[relativeSource].absolute;
      if (this.hasExtension("style", absoluteSource)) {
         return true;
      }

      return false;
   };

   // Rename `import` or `require` paths to be compatible with the `require` function's algorithm
   if (format == "esm") {
      modifyTraverseOptions({
         ImportDeclaration(scope) {
            if (isStyleSource(scope.node.source.value)) {
               scope.remove();
            } else {
               scope.node.source.value = getSafeName(scope.node.source.value);
            }
         },
         ExportAllDeclaration(scope) {
            if (isStyleSource(scope.node.source.value)) {
               scope.remove();
            } else {
               scope.node.source.value = getSafeName(scope.node.source.value);
            }
         },
         ExportNamedDeclaration(scope) {
            if (scope.node.source?.type != "StringLiteral") return;

            if (isStyleSource(scope.node.source.value)) {
               scope.remove();
            } else {
               scope.node.source.value = getSafeName(scope.node.source.value);
            }
         },
      });
   } else {
      modifyTraverseOptions({
         CallExpression(scope) {
            const argNode = scope.node.arguments[0];
            const callee = scope.node.callee;
            const isRequire =
               callee.type == "Identifier" && callee.name == "require";
            const isDynamicImport = callee.type == "Import";
            if (
               (isRequire || isDynamicImport) &&
               argNode.type == "StringLiteral"
            ) {
               if (isStyleSource(argNode.value)) {
                  scope.remove();
               } else {
                  argNode.value = getSafeName(argNode.value);
               }
            }
         },
      });
   }

   const traverseOptions = createTraverseOptionsFromGroup(
      groupTraverseOptions(traverseOptionsArray)
   );

   traverseAST(AST, traverseOptions);

   const userBabelOptions = this.options.babelOptions.transform;

   const importantBabelOptions = {
      sourceType: format == "esm" ? "module" : "script",
      presets: [
         "env",
         ...(userBabelOptions.presets?.filter((v) => v != "env") || []),
      ],
      plugins: userBabelOptions.plugins,
      sourceFileName: source,
      filename: source,
      sourceMaps: !!this.options.bundleOptions.sourceMap,
      envName: mode,
      minified: false,
      comments: mode == "development",
      inputSourceMap: inputSourceMap,
      cloneInputAst: false,
   } as TransformOptions;

   const transpiled = transformFromAst(AST, undefined, {
      ...userBabelOptions,
      ...importantBabelOptions,
   }) as any as BabelFileResult;

   const result = {
      code: transpiled.code || "",
      map: MapConverter.fromObject(transpiled.map).toObject() as RawSourceMap,
   };

   return result;
}

/**
 * Convert a resource asset to a CommonJS module.
 */
async function resourceToCJSModule(
   this: Toypack,
   source: string
) {
   let exportStr = "";

   const mode = this.options.bundleOptions.mode;

   if (mode == "production") {
      exportStr = "./" + getHash(source) + path.extname(source);
   } else {
      const asset = this.getAsset(source);

      if (asset && asset.contentURL) {
         exportStr = asset.contentURL;
      }
   }

   const result = rt.moduleWrap(source, `module.exports = "${exportStr}";`);

   return result;
}

/**
 * Merge a source map to the bundle.
 */
function mergeMapToBundle(
   this: Toypack,
   targetMap: SourceMapGenerator,
   sourceMap: RawSourceMap,
   source: string,
   originalContent: string,
   generatedContent: string,
   bundleContent: string
) {
   if (!targetMap) return;
   const position = findCodePosition(bundleContent, generatedContent);

   if (position.line == -1) {
      if (this.options.logLevel == "error" || this.options.logLevel == "warn") {
         console.warn(
            `Warning: Source map discrepancy for '${source}'. The mappings may be inaccurate because the generated code's position could not be found in the bundle code.`
         );
      }
   }

   const sourceMapOption = this.options.bundleOptions.sourceMap;
   if (sourceMapOption != "nosources") {
      targetMap.setSourceContent(source, originalContent);
   }

   const smc = new SourceMapConsumer(sourceMap);
   smc.eachMapping((map) => {
      if (map.originalLine === null) return;

      targetMap.addMapping({
         source: source,
         original: {
            line: map.originalLine,
            column: map.originalColumn,
         },
         generated: {
            line: map.generatedLine + position.line,
            column: map.generatedColumn + position.column,
         },
         name: map.name,
      });
   });
}

/**
 * Get the script bundle from graph.
 */
async function bundleScript(this: Toypack, graph: IDependency[]) {
   const bundleContent = new CodeComposer(undefined, {
      indentSize: 4,
   });
   const sourceMapOption = this.options.bundleOptions.sourceMap;
   const bundleSourceMap = sourceMapOption ? new SourceMapGenerator() : null;

   /**
    * Add a Babel AST to the bundle.
    */
   const addBabelASTToBundle = async (
      source: string,
      AST: Node,
      depMap: IDependencyMap,
      inputSourceMap?: RawSourceMap
   ) => {
      let code, map;

      const cached = this.cachedDeps.compiled.get(source);
      if (cached && !this.getAsset(source)?.modified) {
         code = cached.code;
         map = cached.map;
         bundleContent.breakLine().append(cached.runtime);

         return { map, code };
      } else {
         const transpiled = await transpileAST.call(
            this,
            source,
            AST,
            depMap,
            inputSourceMap
         );

         code = transpiled.code;
         map = transpiled.map;
      }

      const wrappedModule = rt.moduleWrap(
         source,
         code,
         source === graph[0].source
      );

      bundleContent.breakLine().append(wrappedModule);

      this.cachedDeps.compiled.set(source, {
         code,
         map,
         runtime: wrappedModule,
      });

      return { map, code };
   };

   /**
    * Finalizes and stringifies the bundle content. It adds the
    * `require` function to the code and wraps the code in IIFE.
    */
   const finalizeBundleContent = () => {
      const bundleClone = bundleContent.clone();
      bundleClone.prepend(rt.requireFunction());
      bundleClone.wrap(`
      (function () {
         <CODE_BODY>
      })();
      `);

      return bundleClone.toString();
   };

   /* Modules */
   for (let i = graph.length - 1; i >= 0; i--) {
      const dep = graph[i];

      if (dep.type == "style" && !dep.chunks) continue;

      if (dep.type != "resource" && dep.chunks && !dep.AST) {
         /**
          * Add chunks to the bundle if it's a script or style
          * dependency without an AST.
          */
         for (const chunk of dep.chunks) {
            // Extract script chunks from the dependency
            if (chunk.type == "script") {
               const { map, code } = await addBabelASTToBundle(
                  chunk.source,
                  chunk.AST,
                  dep.dependencyMap,
                  chunk.map
               );

               // Source map
               if (bundleSourceMap && map) {
                  mergeMapToBundle.call(
                     this,
                     bundleSourceMap,
                     map,
                     dep.source,
                     dep.content,
                     code,
                     finalizeBundleContent()
                  );
               }
            }
         }
      } else if (dep.type == "script" && dep.AST && !dep.chunks?.length) {
         /**
          * If it's a script dependency that has an AST and no
          * chunks, add the dependency itself to the bundle.
          */
         const { map, code } = await addBabelASTToBundle(
            dep.source,
            dep.AST,
            dep.dependencyMap
         );

         // Source map
         if (bundleSourceMap && map) {
            mergeMapToBundle.call(
               this,
               bundleSourceMap,
               map,
               dep.source,
               dep.content,
               code,
               finalizeBundleContent()
            );
         }
      } else if (dep.type == "resource") {
         /**
          * If it's a resource, compile first, then add to the bundle.
          */
         const compiled = await resourceToCJSModule.call(
            this,
            dep.source
         );

         bundleContent.breakLine().append(compiled);
      } else {
         throw new Error(`Failed to compile '${dep.source}'.`);
      }
   }

   /* Finishing */
   const finalizedMap = bundleSourceMap
      ? MapConverter.fromJSON(bundleSourceMap.toString())
      : null;

   const result = {
      code: finalizeBundleContent(),
      map: finalizedMap,
   };

   const shouldMinify = this.options.bundleOptions.mode == "production";

   if (shouldMinify) {
      const { code, map } = babelMinify(
         result.code,
         {},
         {
            inputSourceMap: result.map?.toObject(),
            sourceMaps: true,
            comments: false,
         }
      );

      result.code = code;
      result.map = MapConverter.fromObject(map);
   }

   return result;
}

type CSSTreeGeneratedResult =
   | {
        css: string;
        map: SourceMapGenerator;
     }
   | string;

async function compileCSS(
   this: Toypack,
   AST: CSSTree.CssNode,
   inputSourceMap?: RawSourceMap
) {
   const sourceMapOption = this.options.bundleOptions.sourceMap;

   const compiled = CSSTree.generate(AST, {
      sourceMap: !!sourceMapOption,
   }) as any as CSSTreeGeneratedResult;

   const result = {
      code: "",
      map: null as RawSourceMap | null,
   };

   if (typeof compiled == "string") {
      result.code = compiled;
   } else {
      result.code = compiled.css;
      result.map = !!sourceMapOption
         ? MapConverter.fromJSON(compiled.map.toString()).toObject()
         : null;
   }

   if (result.map && inputSourceMap) {
      result.map = mergeSourceMaps(result.map, inputSourceMap);
   }

   return result;
}

async function bundleStyle(this: Toypack, graph: IDependency[]) {
   const bundleContent = new CodeComposer(undefined, {
      indentSize: 4,
   });
   const sourceMapOption = this.options.bundleOptions.sourceMap;
   const bundleSourceMap = sourceMapOption ? new SourceMapGenerator() : null;

   const addPostCSSASTToBundle = async (
      source: string,
      AST: CSSTree.CssNode,
      inputSourceMap?: RawSourceMap
   ) => {
      let code, map;
      const cached = this.cachedDeps.compiled.get(source);
      if (cached && !this.getAsset(source)?.modified) {
         code = cached.code;
         map = cached.map;
      } else {
         const compiled = await compileCSS.call(this, AST, inputSourceMap);
         code = compiled.code;
         map = compiled.map;

         this.cachedDeps.compiled.set(source, {
            code,
            map,
            runtime: "",
         });
      }

      bundleContent.append(`/* ${source.replace(/^\//, "")} */`);
      bundleContent.append(code).breakLine();

      return { code, map };
   };

   const finalizeBundleContent = () => {
      return bundleContent.toString();
   };

   /* Modules */
   for (let i = 0; i < graph.length; i++) {
      const dep = graph[i];

      if (dep.type == "script" && !dep.chunks) continue;

      if (dep.type != "resource" && dep.chunks && !dep.AST) {
         /**
          * Add chunks to the bundle if it's a script or style
          * dependency without an AST.
          */
         for (const chunk of dep.chunks) {
            // Extract style chunks from the dependency
            if (chunk.type == "style") {
               const { code, map } = await addPostCSSASTToBundle(
                  chunk.source,
                  chunk.AST,
                  chunk.map
               );

               if (bundleSourceMap && map) {
                  if (sourceMapOption != "nosources") {
                     map.sourcesContent = [dep.content];
                  }

                  mergeMapToBundle.call(
                     this,
                     bundleSourceMap,
                     map,
                     dep.source,
                     dep.content,
                     code,
                     finalizeBundleContent()
                  );
               }
            }
         }
      } else if (dep.type == "style" && dep.AST && !dep.chunks?.length) {
         /**
          * If it's a style dependency that has an AST and no
          * chunks, add the dependency itself to the bundle.
          */
         const { code, map } = await addPostCSSASTToBundle(dep.source, dep.AST);

         if (bundleSourceMap && map) {
            if (sourceMapOption != "nosources") {
               map.sourcesContent = [dep.content];
            }

            mergeMapToBundle.call(
               this,
               bundleSourceMap,
               map,
               dep.source,
               dep.content,
               code,
               finalizeBundleContent()
            );
         }
      } else {
         if (dep.type != "resource") {
            throw new Error(`Failed to compile '${dep.source}'.`);
         }
      }
   }

   /* Finishing */
   const finalizedMap = bundleSourceMap
      ? MapConverter.fromJSON(bundleSourceMap.toString())
      : null;

   const result = {
      code: finalizeBundleContent(),
      map: finalizedMap,
   };

   return result;
}

export interface IResource {
   source: string;
   content: Blob;
}

export async function bundle(this: Toypack, graph: IDependency[]) {
   const result = {
      resources: [] as IResource[],
      script: {
         source: "index.js",
         content: "",
      },
      style: {
         source: "index.css",
         content: "",
      },
      html: {
         source: "index.html",
         content: "",
      },
   };

   const mode = this.options.bundleOptions.mode;
   const style = await bundleStyle.call(this, graph);
   const script = await bundleScript.call(this, graph);

   result.script.content = script.code;
   result.style.content = style.code;

   // Inline everything if in development mode
   if (mode == "development") {
      if (script.map) {
         result.script.content += `\n\n${script.map.toComment()}`;
      }
      if (style.map) {
         result.style.content += `\n${style.map.toComment({
            multiline: true,
         })}`;
      }

      result.html.content = rt.html(
         result.script.content,
         result.style.content
      );
   } else {
      // Extract resources from graph
      for (const dep of graph) {
         if (dep.type != "resource") continue;

         result.resources.push({
            source: getHash(dep.source) + path.extname(dep.source),
            content: dep.content,
         });
      }

      const sourceMapURLMarker = "# sourceMappingURL=";

      // Put source maps in resources
      if (script.map) {
         const mapSource = result.script.source + ".map";
         result.script.content += `\n\n//${sourceMapURLMarker}${mapSource}`;
         result.resources.push({
            source: mapSource,
            content: JSONToBlob(script.map.toJSON()),
         });
      }
      if (style.map) {
         const mapSource = result.style.source + ".map";
         result.style.content += `\n\n/*${sourceMapURLMarker}${mapSource} */`;
         result.resources.push({
            source: mapSource,
            content: JSONToBlob(style.map.toJSON()),
         });
      }

      result.html.content = rt.html(
         result.script.source,
         result.style.source,
         true
      );
   }

   return result;
}
