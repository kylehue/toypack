import { RawSourceMap } from "source-map-js";
import { resolve, getType, getExtension } from "../package-manager/utils.js";
import { Plugin } from "../types.js";
import { getSourceMapUrl, isUrl, removeSourceMapUrl } from "../utils";
import path from "path-browserify";

const importUrlPlugin: Plugin = () => {
   const urls: Record<string, string> = {};
   return {
      name: "import-url-plugin",
      resolve(id) {
         if (isUrl(id)) {
            const virtualId = `virtual:${id}`;
            urls[virtualId] = id;
            return virtualId;
         }
      },
      load: {
         async: true,
         async handler(dep) {
            if (dep.source in urls) {
               const url = urls[dep.source];
               const response = await fetch(url);
               const content = await response.text();
               let map: RawSourceMap | null = null;
               
               if (!!this.bundler.getConfig().bundle.sourceMap) {
                  const mapUrl = getSourceMapUrl(content);
                  if (mapUrl) {
                     const root = new URL(url).origin + "/";
                     const sourceMap = await fetch(resolve(mapUrl, url, root));
                     if (sourceMap.ok) {
                        map = await sourceMap.json();
                     }
                  }
               }

               const type = getType(path.extname(url), response);
               if (!type) {
                  this.warn(`Could not determine the type of ${url}.`);
               }

               return {
                  type: type || "script",
                  content: removeSourceMapUrl(content),
                  map
               };
            }
         },
      },
   };
};

export default importUrlPlugin;
