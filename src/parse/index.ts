import { File, Program } from "@babel/types";
import { codeFrameColumns } from "@babel/code-frame";
import { CssNode, Url } from "css-tree";
import path from "path-browserify";
import { EncodedSourceMap } from "@jridgewell/gen-mapping";
import Toypack from "../Toypack.js";
import { TextAsset, Asset, ResourceAsset } from "../types.js";
import {
   ERRORS,
   escapeRegex,
   indexToPosition,
   isLocal,
   parseURL,
} from "../utils/index.js";
import { LoadChunkResource, LoadChunkResult, loadChunk } from "./load-chunk.js";
import { ParsedScriptResult, parseScriptAsset } from "./parse-script-chunk.js";
import { ParsedStyleResult, parseStyleAsset } from "./parse-style-chunk.js";
import { ParseInfo } from "../plugin/hook-types.js";
import {
   AggregatedNameExport,
   AggregatedNamespaceExport,
   ExportInfo,
   Exports,
} from "src/parse/extract-exports.js";
import { ImportInfo, Imports } from "src/parse/extract-imports.js";
import { NodePath } from "@babel/traverse";

function getImportPosition(content: string, importSource: string) {
   let index: number | null = null;
   const esmImportRegex = new RegExp(
      `(?:import|export).*(?:from)?.*(["']${escapeRegex(importSource)}["'])`,
      "dg"
   );
   index = esmImportRegex.exec(content)?.indices?.[1][0] || null;

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
      const pos = getImportPosition(asset.content, importSource);
      codeFrame = !pos
         ? ""
         : codeFrameColumns(asset.content, {
              start: pos,
           });
   }

   return codeFrame;
}

async function loadAndParse(
   this: Toypack,
   graph: DependencyGraph,
   source: string,
   isEntry: boolean,
   importers: Importers
) {
   let loaded, parsed;
   let cached = this._getCache("parsed", source);

   if (cached && cached.loaded && !cached.loaded.asset.modified) {
      loaded = cached.loaded;
      parsed = cached.parsed;
   }

   if (!loaded) {
      try {
         this._pushToDebugger("verbose", `Loading "${source}"...`);
         loaded = await loadChunk.call(this, source, isEntry, graph, importers);
         this._setCache("parsed", source, {
            importers,
            loaded,
         });
      } catch (error: any) {
         this._pushToDebugger("error", ERRORS.parse(error.message || error));
      }
   }

   if (!parsed && loaded && loaded.type != "resource") {
      try {
         this._pushToDebugger("verbose", `Parsing "${source}"...`);
         parsed =
            loaded.type == "script"
               ? await parseScriptAsset.call(this, source, loaded.content)
               : await parseStyleAsset.call(this, source, loaded.content);
         this._setCache("parsed", source, {
            importers,
            parsed,
            loaded,
         });
      } catch (error: any) {
         this._pushToDebugger("error", ERRORS.parse(error.message || error));
      }
   }

   return { loaded, parsed };
}

/**
 * Recursively get the dependency graph of an asset.
 */
async function getGraphRecursive(this: Toypack, entry: TextAsset) {
   const graph: DependencyGraph = {};

   const importersMap: Record<string, Importers> = {};
   const recurse = async (
      rawSource: string,
      previous: ScriptDependency | StyleDependency | null
   ) => {
      importersMap[rawSource] ??= {};
      if (previous) {
         importersMap[rawSource][previous.source] = previous;
      }

      const importers = importersMap[rawSource];

      if (graph[rawSource]) {
         return;
      }

      const isEntry = rawSource === entry.source;
      const { loaded, parsed } = await loadAndParse.call(
         this,
         graph,
         rawSource,
         isEntry,
         importers
      );

      if (!loaded) return;

      let chunk: ScriptDependency | StyleDependency | ResourceDependency;
      if (loaded.type == "resource") {
         chunk = createChunk(rawSource, loaded, importers, undefined, isEntry);
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
         chunk = createChunk(rawSource, loaded, importers, parsed, isEntry);
         graph[rawSource] = chunk;
      }

      // Trigger parsed hook
      await this._pluginManager.triggerHook({
         name: "parsed",
         context: {
            graph,
            importers,
            source: rawSource,
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
         const parsed = parseURL(depSource);
         let resolved: string = depSource;
         // Resolve source with plugins
         await this._pluginManager.triggerHook({
            name: "resolve",
            args: () => [resolved],
            context: {
               graph,
               importers: { [chunk.source]: chunk },
               source: resolved,
            },
            callback(result) {
               if (result) {
                  // Resync the imports/exports
                  if (chunk.type == "script") {
                     resyncSources(chunk, resolved, result);
                  }

                  resolved = result;
               }
            },
         });

         // skip externals
         if (!isLocal(resolved)) continue;

         // If not a virtual module, resolve source with bundler
         if (!resolved.startsWith("virtual:")) {
            const nonVirtualResolution = this.resolve(resolved, {
               baseDir: path.dirname(rawSource.replace(/^virtual:/, "")),
            });

            if (!nonVirtualResolution) {
               const errorSource = loaded.asset.source || rawSource;
               this._pushToDebugger(
                  "error",
                  ERRORS.resolveFailure(
                     depSource,
                     errorSource,
                     getImportCodeFrame.call(this, errorSource, depSource)
                  )
               );
            } else {
               resolved = nonVirtualResolution;
            }

            this._trigger("onResolve", {
               rawRequest: depSource,
               request: parsed.target,
               params: parsed.params,
               resolved,
               parent: chunk.source,
            });
         }

         /**
          * In dependency graph, we have to put the queries in order
          * to avoid duplicates.
          */
         const rawQuery = depSource.split("?")[1];
         chunk.dependencyMap[depSource] = resolved.split("?")[0] + parsed.query;
         await recurse(
            resolved.split("?")[0] + (rawQuery ? "?" + rawQuery : ""),
            chunk
         );
      }
   };

   await recurse(entry.source, null);
   return graph;
}

function resyncSources(
   module: ScriptDependency,
   oldSource: string,
   newSource: string
) {
   // Sync imports/exports
   const sourcedPorts = [
      ...Object.values(module.imports.default),
      ...Object.values(module.imports.dynamic),
      ...Object.values(module.imports.namespace),
      ...Object.values(module.imports.sideEffect),
      ...Object.values(module.imports.specifier),
      ...Object.values(module.exports.aggregatedAll),
      ...Object.values(module.exports.aggregatedName),
      ...Object.values(module.exports.aggregatedNamespace),
   ];

   for (const port of sourcedPorts) {
      if (port.source !== oldSource) continue;
      port.source = newSource;
   }
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
   importers: Importers,
   parsed?: K,
   isEntry?: boolean
): R {
   let chunk: ScriptDependency | StyleDependency | ResourceDependency;
   const allCommon = {
      source,
      importers,
      lang: loaded.lang,
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
         exports: parsed.exports,
         imports: parsed.imports,
         programPath: parsed.programPath,
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
   const graph: DependencyGraph = {};

   await this._pluginManager.triggerHook({
      name: "buildStart",
      args: [],
   });

   const config = this.getConfig();
   const entrySource = config.bundle.entry
      ? this.resolve(path.join("/", config.bundle.entry))
      : this.resolve("/");

   const entryAsset = entrySource ? this.getAsset(entrySource) : null;

   if (!entryAsset) {
      this._pushToDebugger("error", ERRORS.entryNotFound());
      return graph;
   }

   if (entryAsset.type != "text") {
      this._pushToDebugger("error", ERRORS.invalidEntry(entryAsset.source));
      return graph;
   }

   Object.assign(graph, await getGraphRecursive.call(this, entryAsset));
   return graph;
}

interface DependencyBase {
   type: "script" | "style" | "resource";
   source: string;
   importers: Importers;
   lang: string;
}

export type Importers = Record<string, ScriptDependency | StyleDependency>;

export interface ScriptDependency extends DependencyBase {
   type: "script";
   ast: File;
   content: string;
   dependencyMap: Record<string, string>;
   asset: Asset;
   map?: EncodedSourceMap | null;
   isEntry: boolean;
   exports: Exports;
   imports: Imports;
   programPath: NodePath<Program>;
}

export interface StyleDependency extends DependencyBase {
   type: "style";
   ast: CssNode;
   content: string;
   dependencyMap: Record<string, string>;
   asset: Asset;
   map?: EncodedSourceMap | null;
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
