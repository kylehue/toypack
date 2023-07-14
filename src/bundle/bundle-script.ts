import babelMinify from "babel-minify";
import MapConverter from "convert-source-map";
import { DependencyGraph, ScriptDependency } from "../graph";
import { Toypack } from "../Toypack.js";
import { extractExports, getUsableResourcePath } from "../utils";
import { mergeSourceMaps } from "../utils/merge-source-maps.js";
import { compileScript } from "./compile-script.js";
import { requireFunction, requireCall, getModuleWrapper } from "./runtime.js";
import { BundleGenerator } from "../utils/BundleGenerator.js";
import { traverse, transformFromAstSync, BabelFileResult } from "@babel/core";
import { Export } from "src/utils/extract-exports.js";

export async function bundleScript(this: Toypack, graph: DependencyGraph) {
   const config = this.getConfig();
   const bundleGenerator = new BundleGenerator();

   const moduleWrapper = getModuleWrapper();
   bundleGenerator.setupModuleWrapper(moduleWrapper.head, moduleWrapper.foot);

   const globalName = config.bundle.globalName;
   bundleGenerator.setupWrapper(
      `${globalName ? `var ${globalName} = ` : ""}(function (){`,
      `})();`
   );

   bundleGenerator.add(requireFunction(), {
      excludeWrap: true,
   });

   this._pluginManager.triggerHook({
      name: "generateBundle",
      args: [
         {
            type: "script",
            generator: bundleGenerator,
         },
      ],
      context: {
         bundler: this,
      },
   });

   let returnCode = "null";

   // compile entry
   const entry = Object.values(graph).find(
      (m): m is ScriptDependency => m.type == "script" && m.isEntry
   );
   if (!entry) {
      throw new Error("Failed to bundle the graph: Entry point not found.");
   }
   const bundled = await bundleFromEntryPoint.call(this, entry, graph);
   console.log(bundled);

   // for (const source in graph) {
   //    const chunk = graph[source];
   //    if (chunk.type == "script") {
   //       const compiled = await compileScript.call(this, chunk, graph);
   //       console.log(compiled);

   //       traverse(compiled.ast!, {
   //          ImportDeclaration
   //       });

   //       // bundleGenerator.add(compiled.content, {
   //       //    map: compiled.map,
   //       //    moduleWrapperTemplates: {
   //       //       source: chunk.source,
   //       //       dependencyMap: JSON.stringify(chunk.dependencyMap)
   //       //    }
   //       // });
   //       if (chunk.isEntry) returnCode = requireCall(chunk.source);
   //    } else if (chunk.type == "resource") {
   //       bundleGenerator.add(
   //          `module.exports = "${getUsableResourcePath(
   //             this,
   //             chunk.asset.source
   //          )}";`,
   //          {
   //             moduleWrapperTemplates: {
   //                source: chunk.source,
   //                dependencyMap: "{}", // resources doesn't have deps
   //             },
   //          }
   //       );
   //    }
   // }

   bundleGenerator.add(`\nreturn ${returnCode}`, {
      excludeWrap: true,
   });

   const bundle = bundleGenerator.generate();
   const result = {
      content: bundle.content,
      map: bundle.map ? MapConverter.fromObject(bundle.map) : null,
   };

   if (config.bundle.mode == "production") {
      let { code, map } = babelMinify(
         result.content,
         {
            builtIns: false,
            ...config.babel.minify,
         },
         {
            sourceMaps: true,
            comments: false,
         }
      );

      if (result.map && map) {
         map = mergeSourceMaps(result.map.toObject(), map);
      }

      result.content = code;
      result.map = MapConverter.fromObject(map);
   }

   return result;
}

async function getAllCompiledScript(this: Toypack, graph: DependencyGraph) {
   const result: Record<
      string,
      {
         chunk: ScriptDependency;
         compiled: BabelFileResult;
         extractedExports: Record<string, Export>;
      }
   > = {};

   for (const chunk of Object.values(graph)) {
      if (chunk.type != "script") continue;
      const { compiled, extractedExports } = await compileScript.call(
         this,
         chunk,
         graph
      );

      result[chunk.source] = {
         chunk,
         compiled,
         extractedExports,
      };
   }

   return result;
}

async function bundleFromEntryPoint(
   this: Toypack,
   entry: ScriptDependency,
   graph: DependencyGraph
) {
   let result = "";

   const compilations = await getAllCompiledScript.call(this, graph);
   const compiledEntry = compilations[entry.source];
   console.log(compiledEntry);
   
   // const recurse = async (entry: ScriptDependency) => {
   //    const compiled = await compileScript.call(this, entry, graph);
   //    const ast = compiled.ast!;

   //    traverse(ast, {
   //       ImportDeclaration(path) {
   //          const { node } = path;
   //          const request = node.source.value;
   //          const resolvedRequest = entry.dependencyMap[request];
   //          const resolvedModule = graph[resolvedRequest];
   //          console.log(resolvedRequest);
   //          // TODO: acknowledge styles and resources
   //          if (resolvedModule.type != "script") return;
   //          path.traverse({
   //             ImportSpecifier(path) {},
   //             ImportDefaultSpecifier(_path) {
   //                // [1] get the default export from `resolvedModule`
   //                // [2]
   //             },
   //             ImportNamespaceSpecifier() {},
   //          });
   //          console.log(path.remove());
   //       },
   //       Identifier() {},
   //    });

   //    const generated = transformFromAstSync(ast, entry.content, {
   //       comments: false,
   //    });
   //    console.log(generated);
   // };

   // await recurse(entry);

   return result;
}
