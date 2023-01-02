import Toypack from "./Toypack";
import path from "path-browserify";
import MagicString from "magic-string";
import { parse as parsePackageName } from "parse-package-name";
import { parse as getAST } from "@babel/parser";
import { isLocal } from "@toypack/utils";

const packageProviders = {
   "esm.sh": "https://esm.sh/",
   skypack: "https://cdn.skypack.dev/",
};

export type PackageProvider = keyof typeof packageProviders;

interface Dependency {
   content: string;
   source: string;
}

function getCoreModuleSubpath(source: string) {
   return source.split("/").splice(3).join("/");
}

export default class PackageManager {
   public provider: string;
   public providerRegex: RegExp;
   public dependencies: Object = {};
   private _cache: Map<string, Dependency[]> = new Map();
   constructor(public bundler: Toypack) {
      this.provider =
         packageProviders[bundler.options.packageProvider as string];
      this.providerRegex = new RegExp(this.provider.replace(/\./g, "\\."));
   }

   private async _createGraph(name: string, entryURL: string) {
      const graph: Dependency[] = [];
      const bundlerAssets = Object.fromEntries(this.bundler.assets);
      const bundlerAssetSources = Object.keys(bundlerAssets);
      const init = async (url: string) => {
         let dependencies: string[] = [];
         let designatedSource = url
            .replace(this.providerRegex, "")
            .replace(/^\//, "");

         // Dedupe if same source
         for (let source of bundlerAssetSources) {
            // Skip if not a core module
            if (!source.startsWith("/node_modules/")) continue;

            let subpath = getCoreModuleSubpath(source);
            let isSameSource = subpath === designatedSource;

            if (isSameSource) {
               let target = source.replace("/node_modules/", "");
               let content = `export * from "${target}";\nexport {default} from "${target}";`;
               graph.push({
                  content,
                  source: designatedSource,
               } as Dependency);

               return;
            }
         }

         // Fetch
         let fetchResponse = await fetch(url);
         if (!fetchResponse.ok) {
            throw new Error(`Failed to fetch ${url}.`);
         }

         let content = await fetchResponse.text();

         // Try parsing content
         let AST: any = null;
         try {
            if (!/\.(css|json)$/.test(url)) {
               AST = getAST(content, {
                  sourceType: "module",
                  sourceFilename: designatedSource,
               });
            }
         } catch (error) {
            //
         }

         // Get dependencies if there's an AST
         if (AST) {
            let chunk = new MagicString(content);
            let imports = this.bundler._getASTImports(AST);

            for (let node of imports) {
               let imported = node.id;

               let from = designatedSource;
               let to = imported.replace(this.providerRegex, "");

               let fromBaseDir = path.dirname(from);
               let relative = path.relative(fromBaseDir, to);
               let absolute = path.resolve(fromBaseDir, relative);

               if (isLocal(imported) && !imported.startsWith("/")) {
                  absolute = path.resolve(fromBaseDir, imported);
               }

               if (!dependencies.some((ex) => ex == absolute)) {
                  dependencies.push(absolute);
               }

               chunk.update(node.start, node.end, `"${name}${absolute}"`);
            }

            content = chunk.toString();
         }

         // Add to graph
         graph.push({
            content,
            source: designatedSource,
         } as Dependency);

         // Scan dependency's dependencies
         for (let dependency of dependencies) {
            let dep = dependency.replace(/^\//, "");
            if (!graph.some((v) => v.source === dep)) {
               let url = `${this.provider}${dep}`;
               await init(url);
            }
         }
      };

      await init(entryURL);

      return graph;
   }

   /**
    * Adds a package to the bundler.
    *
    * @param {string} source The package source. Format is `<name>@<version><subpath>`
    * @example
    *
    * install("bootstrap");
    * install("bootstrap@5.2");
    * install("bootstrap@5.2/dist/css/bootstrap.min.css");
    */
   public async install(source: string) {
      let pkg = parsePackageName(source);
      let name = pkg.name;
      let version = pkg.version;
      let subpath = pkg.path;

      // Fetch
      let target = `${name}@${version}${subpath}`;

      // Dev mode
      if (this.provider == packageProviders["esm.sh"]) {
         if (this.bundler.options.bundleOptions?.mode === "development") {
            target += "?dev";
         } else {
            target += "?prod";
         }
      }

      let url = `${this.provider}${target}`;

      if (this.bundler.options.bundleOptions?.logs) {
         console.log(
            `%cInstalling: %c${name + subpath}`,
            "font-weight: bold; color: white;",
            "color: #cfd0d1;"
         );
      }

      // Get graph
      let graph: Dependency[] | null = null;
      let cached = this._cache.get(target);
      if (cached) {
         graph = cached;
      } else {
         graph = await this._createGraph(pkg.name, url);
      }

      // Fix entry's source
      if (subpath) {
         let extension = path.extname(subpath);
         if (extension) {
            graph[0].source = subpath;
         } else {
            graph[0].source = path.join(subpath, "index.js");
         }
      } else {
         graph[0].source = "index.js";
      }

      // Add to bundler assets
      for (let asset of graph) {
         let coreSource = path.join("node_modules", name, asset.source);
         await this.bundler.addAsset(coreSource, asset.content);
      }

      // Update dependencies
      let versionTag = version == "latest" ? version : "^" + version;
      this.dependencies[name] = versionTag;

      // Update package.json
      let assetPackage = this.bundler.assets.get("/package.json");
      if (typeof assetPackage?.content == "string") {
         let assetPackageParsed = JSON.parse(assetPackage.content);

         if (typeof assetPackageParsed.dependencies != "object") {
            assetPackageParsed.dependencies = {};
         }

         assetPackageParsed.dependencies = this.dependencies;
         await this.bundler.addAsset(
            "/package.json",
            JSON.stringify(assetPackageParsed)
         );
      } else {
         let newPackage = JSON.stringify({
            dependencies: this.dependencies,
         });

         await this.bundler.addAsset("/package.json", newPackage);
      }

      if (this.bundler.options.bundleOptions?.logs) {
         console.log(
            `%cSuccessfully installed: %c${name + subpath} (added ${
               graph.length
            } packages)`,
            "font-weight: bold; color: white;",
            "color: #cfd0d1;"
         );
      }

      // Cache
      this._cache.set(target, graph);
   }
}
