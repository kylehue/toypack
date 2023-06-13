import { IDependencyGraph } from "../graph/index.js";
import { Toypack } from "../Toypack.js";
import { bundleStyle } from "./bundleStyle.js";
import { bundleScript } from "./bundleScript.js";
import * as rt from "./runtime.js";

let previousScriptUrl: string | undefined = undefined;
let previousLinkUrl: string | undefined = undefined;

export async function bundle(this: Toypack, graph: IDependencyGraph) {
   const outputFilename = "index";

   const result = {
      resources: [] as IResource[],
      js: {
         source: outputFilename + ".js",
         content: "",
      },
      css: {
         source: outputFilename + ".css",
         content: "",
      },
      html: {
         source: outputFilename + ".html",
         content: "",
      },
   };

   const mode = this.config.bundle.mode;
   const js = await bundleScript.call(this, graph);
   const css = await bundleStyle.call(this, graph);

   result.js.content = js.content;
   result.css.content = css.content;

   if (mode == "development") {
      if (js.map) {
         result.js.content += "\n\n" + js.map.toComment();
      }

      if (css.map) {
         result.css.content += "\n\n" + css.map.toComment();
      }

      if (previousScriptUrl) URL.revokeObjectURL(previousScriptUrl);
      if (previousLinkUrl) URL.revokeObjectURL(previousLinkUrl);
      previousScriptUrl = URL.createObjectURL(
         new Blob([result.js.content], {
            type: "application/javascript",
         })
      );
      previousLinkUrl = URL.createObjectURL(
         new Blob([result.css.content], {
            type: "text/css",
         })
      );

      result.html.content = rt.html(previousScriptUrl, previousLinkUrl);
   } else {
      // Extract resources from graph
      for (const source in graph) {
         const dep = graph[source];
         if (dep.type != "resource") continue;
         if (dep.chunkSource != source) continue;
         const useableSource = this.resourceSourceToUseableSource(
            dep.asset.source
         );
         if (!useableSource) continue;
         result.resources.push({
            source: useableSource.replace(/^\.*\//g, ""),
            content: dep.asset.content,
         });
      }

      const sourceMapURLMarker = "# sourceMappingURL=";

      // Put source maps in resources
      if (js.map) {
         const mapSource = result.js.source + ".map";
         result.js.content += `\n\n//${sourceMapURLMarker}${mapSource}`;
         result.resources.push({
            source: mapSource,
            content: new Blob([js.map.toJSON()], { type: "application/json" }),
         });
      }
      if (css.map) {
         const mapSource = result.css.source + ".map";
         result.css.content += `\n\n/*${sourceMapURLMarker}${mapSource} */`;
         result.resources.push({
            source: mapSource,
            content: new Blob([css.map.toJSON()], { type: "application/json" }),
         });
      }

      result.html.content = rt.html(
         "./" + result.js.source,
         "./" + result.css.source
      );
   }

   return result;
}

export interface IResource {
   source: string;
   content: Blob;
}
