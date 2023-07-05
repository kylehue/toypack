import { Node } from "@babel/traverse";
import { codeFrameColumns } from "@babel/code-frame";
import { CssNode, Url } from "css-tree";
import path from "path-browserify";
import { RawSourceMap } from "source-map-js";
import Toypack from "../Toypack.js";
import { TextAsset, Asset, ResourceAsset, ModuleTypeConfig } from "../types.js";
import { ERRORS, escapeRegex, indexToPosition, parseURL } from "../utils";
import { LoadChunkResource, LoadChunkResult, loadChunk } from "./load-chunk.js";
import { ParsedScriptResult, parseScriptAsset } from "./parse-script-chunk.js";
import { ParsedStyleResult, parseStyleAsset } from "./parse-style-chunk.js";
import { ParseInfo } from "../plugin/hook-types.js";

function getImportPosition(
   content: string,
   importSource: string,
   moduleType: ModuleTypeConfig
) {
   let index: number | null = null;
   if (moduleType == "esm") {
      const esmImportRegex = new RegExp(
         `(?:import|export).*(?:from)?.*(["']${escapeRegex(importSource)}["'])`,
         "dg"
      );
      index = esmImportRegex.exec(content)?.indices?.[1][0] || null;
   } else {
      const cjsRequireRegex = new RegExp(
         `require\\s*\\(\\s*(["']${escapeRegex(importSource)}["'])\\s*\\)`,
         "dg"
      );
      index = cjsRequireRegex.exec(content)?.indices?.[1][0] || null;
   }

   if (!index) return null;
   return indexToPosition(content, index);
}

function getImportCodeFrame(
   this: Toypack,
   source: string,
   importSource: string
) {
   const asset = this.getAsset(source);
   let codeFrame = "";
   if (asset?.type == "text") {
      const pos = getImportPosition(
         asset.content,
         importSource,
         this.getConfig().bundle.moduleType
      );
      codeFrame = !pos
         ? ""
         : codeFrameColumns(asset.content, {
              start: pos,
           });
   }

   return codeFrame;
}

/**
 * Recursively get the dependency graph of an asset.
 */
async function getGraphRecursive(this: Toypack, entry: TextAsset) {
   const graph: DependencyGraph = {};

   await this._pluginManager.triggerHook({
      name: "buildStart",
      args: [],
      context: {
         bundler: this,
         graph,
         importer: undefined,
      },
   });

   const config = this.getConfig();
   const bundleMode = config.bundle.mode;

   const loadAndParse = async (
      source: string,
      isEntry: boolean,
      importer?: string
   ) => {
      let loaded, parsed;
      const cached = this._cachedDeps.parsed.get(source + "." + bundleMode);
      if (cached && !cached.asset.modified) {
         loaded = cached.loaded;
         parsed = cached.parsed;
      } else {
         loaded = await loadChunk.call(this, source, isEntry, {
            bundler: this,
            graph,
            importer,
         });
         parsed =
            loaded.type == "script"
               ? await parseScriptAsset.call(this, source, loaded.content)
               : loaded.type == "style"
               ? await parseStyleAsset.call(this, source, loaded.content)
               : null;
         this._cachedDeps.parsed.set(source + "." + bundleMode, {
            asset: loaded.asset,
            parsed,
            loaded,
         });
      }

      return { loaded, parsed };
   };

   const recurse = async (rawSource: string, _importer?: string) => {
      if (graph[rawSource]) {
         if (_importer && !graph[rawSource].importers.includes(_importer)) {
            graph[rawSource].importers.push(_importer);
         }

         return;
      }

      const isEntry = rawSource === entry.source;
      const { loaded, parsed } = await loadAndParse(
         rawSource,
         isEntry,
         _importer
      );

      let chunk;
      if (loaded.type == "resource") {
         chunk = createChunk(rawSource, loaded, undefined, _importer, isEntry);
         graph[rawSource] = chunk;
         /**
          * Resources doesn't have dependencies so we can skip all
          * the procedures below.
          */
         return;
      } else {
         /**
          * `parsed` can't possibly be falsy if it's not a resource
          * but we do this anyway to make typescript happy.
          */
         if (!parsed) return;
         chunk = createChunk(rawSource, loaded, parsed, _importer, isEntry);
         graph[rawSource] = chunk;
      }

      // Trigger parsed hook
      this._pluginManager.triggerHook({
         name: "parsed",
         context: {
            bundler: this,
            graph,
            importer: _importer,
         },
         args: [
            {
               type: loaded.type,
               parsed,
               chunk,
            } as ParseInfo,
         ],
      });

      // Scan dependency's dependencies recursively
      for (const depSource of parsed.dependencies) {
         let resolved: string = depSource;
         // Resolve source with plugins
         await this._pluginManager.triggerHook({
            name: "resolve",
            args: () => [resolved],
            context: {
               bundler: this,
               graph,
               importer: rawSource,
            },
            callback(result) {
               if (result) resolved = result;
            },
         });

         // If not a virtual module, resolve source with bundler
         if (!resolved.startsWith("virtual:")) {
            const nonVirtualResolution = this.resolve(resolved, {
               baseDir: path.dirname(rawSource),
            });

            if (!nonVirtualResolution) {
               const errorSource = loaded.asset.source || rawSource;
               this._trigger(
                  "onError",
                  ERRORS.resolveFailure(
                     depSource,
                     errorSource,
                     getImportCodeFrame.call(this, errorSource, depSource)
                  )
               );
            } else {
               resolved = nonVirtualResolution;
            }
         }

         // Fix query's order to avoid duplicates
         const parsed = parseURL(depSource);
         resolved = resolved.split("?")[0] + parsed.query;

         chunk.dependencyMap[depSource] = resolved;
         await recurse(resolved, rawSource);
      }
   };

   await recurse(entry.source);
   return graph;
}

function createChunk<
   T extends LoadChunkResult,
   K extends ParsedScriptResult | ParsedStyleResult,
   R extends T extends LoadChunkResource
      ? ResourceDependency
      : K extends ParsedScriptResult
      ? ScriptDependency
      : StyleDependency
>(
   source: string,
   loaded: T,
   parsed?: K,
   importer?: string,
   isEntry?: boolean
): R {
   let chunk: ScriptDependency | StyleDependency | ResourceDependency;
   const allCommon = {
      source,
      importers: importer ? [importer] : [],
   };

   if (loaded.type == "resource") {
      chunk = {
         ...allCommon,
         type: "resource",
         asset: loaded.asset,
      };

      return chunk as R;
   }

   const textCommon = {
      ...allCommon,
      asset: loaded.asset,
      content: loaded.content,
      dependencyMap: {},
      map: loaded.map,
      isEntry: isEntry || false,
   };

   if (!parsed) {
      throw new Error(
         "Parsed object can't be falsy if chunk is not a resource."
      );
   }

   if (parsed.type == "script") {
      chunk = {
         ...textCommon,
         type: "script",
         ast: parsed.ast,
      };
   } else {
      chunk = {
         ...textCommon,
         type: "style",
         ast: parsed.ast,
         urlNodes: parsed.urlNodes,
      };
   }

   return chunk as R;
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
      this._trigger("onError", ERRORS.entryNotFound());
      return graph;
   }

   if (entryAsset.type != "text") {
      this._trigger("onError", ERRORS.invalidEntry(entryAsset.source));
      return graph;
   }

   graph = await getGraphRecursive.call(this, entryAsset);

   return graph;
}

interface DependencyBase {
   type: "script" | "style" | "resource";
   source: string;
   importers: string[];
}

export interface ScriptDependency extends DependencyBase {
   type: "script";
   ast: Node;
   content: string;
   dependencyMap: Record<string, string>;
   asset: Asset;
   map?: RawSourceMap | null;
   isEntry: boolean;
}

export interface StyleDependency extends DependencyBase {
   type: "style";
   ast: CssNode;
   content: string;
   dependencyMap: Record<string, string>;
   asset: Asset;
   map?: RawSourceMap | null;
   isEntry: boolean;
   urlNodes: Url[];
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
