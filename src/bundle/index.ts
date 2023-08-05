import { TemplateConfig } from "src/config.js";
import { bundleScript } from "../bundle-script/index.js";
import { bundleStyle } from "../bundle-style/bundle-style.js";
import { getUsableResourcePath } from "../utils";
import type { DependencyGraph, ImportMapConfig, Toypack } from "src/types";

let previousScriptUrl: string | undefined = undefined;
let previousLinkUrl: string | undefined = undefined;

function getHtml(
   scriptSrc = "",
   linkHref = "",
   importMap?: ImportMapConfig,
   template?: TemplateConfig
) {
   template ??= {
      head: [],
      body: [],
      bodyAttributes: {},
   };

   const stringifiedAttrs = Object.entries(template.bodyAttributes)
      .map(([key, value]) => {
         return `${key}="${value}"`;
      })
      .join(" ");

   return [
      `<!DOCTYPE html>`,
      `<html lang="en">`,
      `  <head>`,
      ...template.head,
      `    <link rel="stylesheet" href="${linkHref}"></link>`,
      `    <script type="importmap">`,
      JSON.stringify(importMap || {}, undefined, 2),
      `    </script>`,
      `    <script type="module" src="${scriptSrc}"></script>`,
      `  </head>`,
      `  <body ${stringifiedAttrs}>`,
      ...template.body,
      `  </body>`,
      `</html>`,
   ].join("\n");
}

export async function bundle(this: Toypack, graph: DependencyGraph) {
   const outputFilename = "index";

   const result: BundleResult = {
      resources: [] as Resource[],
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

   const config = this.config;
   const sourceMapConfig = config.bundle.sourceMap;
   const mode = config.bundle.mode;
   const js = await bundleScript.call(this, graph);
   const css = await bundleStyle.call(this, graph);

   if (
      typeof sourceMapConfig == "object" &&
      sourceMapConfig.includeContent === false
   ) {
      if (js.map) js.map.sourcemap.sourcesContent = undefined;
      if (css.map) css.map.sourcemap.sourcesContent = undefined;
   }

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

      result.html.content = getHtml(
         previousScriptUrl,
         previousLinkUrl,
         config.bundle.importMap,
         config.bundle.template
      );
   } else {
      // Extract resources from graph
      for (const [_, chunk] of graph) {
         if (chunk.type != "resource") continue;
         const useableSource = getUsableResourcePath(this, chunk.asset.source);
         if (!useableSource) continue;
         result.resources.push({
            source: useableSource.replace(/^\.*\//g, "").split("?")[0],
            content: chunk.asset.content,
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

      result.html.content = getHtml(
         "./" + result.js.source,
         "./" + result.css.source,
         config.bundle.importMap,
         config.bundle.template
      );
   }

   await this._pluginManager.triggerHook({
      name: "buildEnd",
      args: [result],
   });

   return result;
}

export interface Resource {
   source: string;
   content: Blob;
}

export interface BundledAsset {
   source: string;
   content: string;
}

export interface BundleResult {
   resources: Resource[];
   js: BundledAsset;
   css: BundledAsset;
   html: BundledAsset;
}
