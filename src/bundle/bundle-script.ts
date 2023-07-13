import babelMinify from "babel-minify";
import MapConverter from "convert-source-map";
import { DependencyGraph } from "../graph";
import { Toypack } from "../Toypack.js";
import { getUsableResourcePath } from "../utils";
import { mergeSourceMaps } from "../utils/merge-source-maps.js";
import { compileScript } from "./compile-script.js";
import { requireFunction, requireCall, getModuleWrapper } from "./runtime.js";
import { BundleGenerator } from "../utils/BundleGenerator.js";

export async function bundleScript(this: Toypack, graph: DependencyGraph) {
   const config = this.getConfig();
   const bundleGenerator = new BundleGenerator();

   const moduleWrapper = getModuleWrapper();
   bundleGenerator.setupModuleWrapper(
      moduleWrapper.head,
      moduleWrapper.foot
   );
   
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

   for (const source in graph) {
      const chunk = graph[source];
      if (chunk.type == "script") {
         const compiled = await compileScript.call(this, chunk, graph);
         bundleGenerator.add(compiled.content, {
            map: compiled.map,
            moduleWrapperTemplates: {
               source: chunk.source
            }
         });
         if (chunk.isEntry) returnCode = requireCall(chunk.source);
      } else if (chunk.type == "resource") {
         bundleGenerator.add(
            `module.exports = "${getUsableResourcePath(
               this,
               chunk.asset.source
            )}";`,
            {
               moduleWrapperTemplates: {
                  source: chunk.source,
               },
            }
         );
      }
   }

   bundleGenerator.add(`\nreturn ${returnCode}`, {
      excludeWrap: true
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
