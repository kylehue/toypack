import { merge } from "lodash-es";
import { getFetchUrlFromProvider } from "../package-manager/utils.js";
import { fetchVersion } from "../package-manager/fetch-version.js";
import { Plugin } from "../types.js";
import { parsePackageName, isLocal, isUrl } from "../utils/index.js";
import { Node } from "node-html-parser";

export default function (): Plugin {
   const importMaps = new Map<string, string>();
   return {
      name: "auto-deps-plugin",
      resolve: {
         async: true,
         async handler(id) {
            if (isLocal(id) || isUrl(id)) return;
            if (this.bundler.config.bundle.mode == "production") {
               const pkg = await this.bundler.installPackage(id);
               if (pkg) {
                  return pkg.assets.find((x) => x.isEntry)?.source;
               }
            } else {
               if (importMaps.get(id)) return;
               const provider = this.bundler.getPackageProviders()[0];
               if (!provider) return;

               const {
                  name,
                  subpath,
                  version: _version,
               } = parsePackageName(id);
               const version = await fetchVersion(name, _version);
               const url = getFetchUrlFromProvider(
                  provider,
                  name,
                  version,
                  subpath
               );

               importMaps.set(id, url);
            }
         },
      },
      transformHtml() {
         const objectImportMap = {
            imports: Object.entries(Object.fromEntries(importMaps)).reduce(
               (acc, [id, url]) => {
                  const resolved = this.bundler.resolve(id, {
                     includeCoreModules: true
                  });
                  if (!resolved) acc[id] = url;
                  return acc;
               },
               {} as Record<string, string>
            ),
         };

         let importMapNode: Node;
         return {
            HtmlElement() {
               this.traverse({
                  ScriptElement(node) {
                     if (
                        node.attributes["type"]?.toLowerCase() !== "importmap"
                     ) {
                        return;
                     }
                     importMapNode = node;
                     this.stop();
                  },
               });
            },
            HeadElement(node) {
               if (importMapNode) {
                  // edit the import map if it exists
                  const json = JSON.parse(importMapNode.textContent);
                  merge(json, objectImportMap);
                  importMapNode.textContent = JSON.stringify(
                     json,
                     undefined,
                     2
                  );
               } else {
                  // add the import map if it doesn't exist
                  const stringifiedImportMap = JSON.stringify(
                     objectImportMap,
                     undefined,
                     2
                  );
                  node.insertAdjacentHTML(
                     "afterbegin",
                     `<script type="importmap">${stringifiedImportMap}</script>`
                  );
               }

               node.removeWhitespace();
               this.stop();
            },
         };
      },
   };
}
