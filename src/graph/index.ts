import path from "path-browserify";
import { Asset, ResourceAsset, TextAsset } from "../utils/create-asset.js";
import {
   invalidEntryError,
   entryNotFoundError,
   resolveFailureError,
   assetNotFoundError,
} from "../utils/errors.js";
import { Toypack } from "../Toypack.js";
import { RawSourceMap } from "source-map-js";
import { parseScriptAsset } from "./parse-script-chunk.js";
import { parseStyleAsset } from "./parse-style-chunk.js";
import { LoadBuildHook, LoadResult } from "../plugin/hook-types.js";
import { loadChunk } from "./load-chunk.js";
import { Node } from "@babel/traverse";
import { CssNode } from "css-tree";
import { parseURL } from "../utils/parse-url.js";
import { PartialContext } from "../plugin/PluginManager.js";

/**
 * Recursively get the dependency graph of an asset.
 * @returns An array of dependency objects.
 */
async function getGraphRecursive(this: Toypack, entry: TextAsset) {
   const graph: DependencyGraph = {};

   const recurse = async (rawSource: string, _prev?: string) => {
      if (graph[rawSource]) return;
      const isEntry = rawSource === entry.source;

      const loaded = await loadChunk.call(this, rawSource, isEntry, {
         bundler: this,
         graph,
         importer: _prev,
      });

      // No need to parse resources
      if (loaded.type == "resource") {
         if (loaded.asset) {
            graph[rawSource] = {
               type: "resource",
               asset: loaded.asset,
               source: rawSource,
            };
         }

         return;
      }

      const parsed =
         loaded.type == "script"
            ? await parseScriptAsset.call(this, rawSource, loaded.content)
            : await parseStyleAsset.call(this, rawSource, loaded.content);

      const dependency: ScriptDependency | StyleDependency = {
         asset: loaded.asset,
         source: rawSource,
         ast: parsed.ast,
         dependencyMap: {},
         map: loaded.map,
         // @ts-ignore
         c: loaded.content,
         isEntry: isEntry,
         type: loaded.type,
      };

      graph[rawSource] = dependency;

      // Scan dependency's dependencies
      for (const depSource of parsed.dependencies) {
         let resolved: string = depSource;
         // Resolve source with plugins
         await this._pluginManager.triggerHook(
            "resolve",
            () => [resolved],
            (result) => {
               resolved = result;
            },
            {
               bundler: this,
               graph,
               importer: rawSource,
            }
         );

         // If not a virtual module, resolve source with bundler
         if (!resolved.startsWith("virtual:")) {
            let nonVirtualResolution = this.resolve(resolved, {
               baseDir: path.dirname(rawSource),
            });

            if (!nonVirtualResolution) {
               this._trigger(
                  "onError",
                  resolveFailureError(
                     depSource,
                     loaded.asset?.source || rawSource
                  )
               );

               continue;
            }

            resolved = nonVirtualResolution;
         }

         // Fix query's order to avoid duplicates
         const parsed = parseURL(depSource);
         resolved = resolved.split("?")[0] + parsed.query;

         dependency.dependencyMap[depSource] = resolved;
         await recurse(resolved, rawSource);
      }
   };

   await recurse(entry.source);
   return graph;
}

/**
 * Get the dependency graph of the bundler starting from the entry point.
 */
export async function getDependencyGraph(this: Toypack) {
   let graph: DependencyGraph = {};
   const config = this.getConfig();
   const entrySource = config.bundle.entry
      ? this.resolve(path.join("/", config.bundle.entry))
      : this.resolve("/");

   const entryAsset = entrySource ? this.getAsset(entrySource) : null;

   if (!entryAsset) {
      this._trigger("onError", entryNotFoundError());
      return graph;
   }

   if (entryAsset.type != "text") {
      this._trigger("onError", invalidEntryError(entryAsset.source));
      return graph;
   }

   graph = await getGraphRecursive.call(this, entryAsset);

   return graph;
}

interface DependencyBase {
   type: "script" | "style" | "resource";
   source: string;
}

export interface ScriptDependency extends DependencyBase {
   type: "script";
   ast: Node;
   dependencyMap: Record<string, string>;
   asset: Asset;
   map?: RawSourceMap | null;
   isEntry: boolean;
}

export interface StyleDependency extends DependencyBase {
   type: "style";
   ast: CssNode;
   dependencyMap: Record<string, string>;
   asset: Asset;
   map?: RawSourceMap | null;
   isEntry: boolean;
}

export interface ResourceDependency extends DependencyBase {
   type: "resource";
   asset: ResourceAsset;
}

export type Dependency =
   | ScriptDependency
   | StyleDependency
   | ResourceDependency;

export type DependencyGraph = Record<string, Dependency>;
