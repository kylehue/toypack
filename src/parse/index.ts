import { codeFrameColumns } from "@babel/code-frame";
import path from "path-browserify";
import type { TextAsset, Toypack } from "src/types";
import {
   ERRORS,
   escapeRegex,
   indexToPosition,
   isLocal,
   isUrl,
   parseURL,
} from "../utils/index.js";
import { ParseInfo } from "../plugin/hook-types.js";
import { LoadChunkResource, LoadChunkResult, loadChunk } from "./load-chunk.js";
import { ParsedScriptResult, parseScriptAsset } from "./parse-script-chunk.js";
import { ParsedStyleResult, parseStyleAsset } from "./parse-style-chunk.js";
import { ResourceModule } from "./classes/ResourceModule.js";
import { ScriptModule } from "./classes/ScriptModule.js";
import { StyleModule } from "./classes/StyleModule.js";

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
 * Re-orders graph when needed. It assures that the imported module's
 * position in the graph is before the importer's position.
 */
function maintainImportOrder(
   graph: DependencyGraph,
   importer: ScriptModule | StyleModule,
   importedSource: string
) {
   const current = graph.get(importedSource)!;
   const arr = Object.values(Object.fromEntries(graph));
   const indexOfImporter = arr.indexOf(importer);
   const indexOfCurrent = arr.indexOf(current);
   if (indexOfImporter > indexOfCurrent) {
      arr.splice(indexOfCurrent, 1);
      arr.splice(indexOfImporter, 0, current);

      graph.clear();
      for (const dep of arr) {
         graph.set(dep.source, dep);
      }
   }
}

/**
 * Recursively get the dependency graph of an asset.
 */
async function getGraphRecursive(this: Toypack, entry: TextAsset) {
   const graph: DependencyGraph = new Map();

   const importersMap: Record<string, Importers> = {};
   const recurse = async (
      rawSource: string,
      previous: ScriptModule | StyleModule | null
   ) => {
      importersMap[rawSource] ??= {};
      if (previous) {
         importersMap[rawSource][previous.source] = previous;
      }

      const importers = importersMap[rawSource];

      if (graph.has(rawSource)) {
         /**
          * If it's already in the graph, we have to skip BUT we also have
          * to re-order.
          */
         if (!previous) return;
         maintainImportOrder(graph, previous, rawSource);
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

      let chunk: ScriptModule | StyleModule | ResourceModule;
      if (loaded.type == "resource") {
         chunk = createModule(rawSource, loaded, importers, undefined, isEntry);
         graph.set(rawSource, chunk);
         /**
          * Resources doesn't have dependencies so we can skip all
          * the procedures below.
          */
         return;
      }

      if (!parsed) {
         throw new Error(`Failed to parse '${rawSource}'.`);
      }

      chunk = createModule(rawSource, loaded, importers, parsed, isEntry);
      graph.set(rawSource, chunk);

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
      /**
       * We need to reverse the deps so that we can get the proper order
       * of import hierarchy.
       */
      const orderedDeps = [...parsed.dependencies].reverse();
      for (const depSource of orderedDeps) {
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
                  resolved = result;
               }
            },
         });

         // skip externals
         if (!isLocal(resolved) || isUrl(resolved)) {
            continue;
         }

         // If not a virtual module, resolve source with bundler
         if (!resolved.startsWith("virtual:")) {
            const nonVirtualResolution = this.resolve(resolved, {
               baseDir: path.dirname(rawSource.replace(/^virtual:/, "")),
               includeCoreModules: false,
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
         chunk.dependencyMap.set(
            depSource,
            resolved.split("?")[0] + parsed.query
         );
         await recurse(
            resolved.split("?")[0] + (rawQuery ? "?" + rawQuery : ""),
            chunk
         );
      }
   };

   await recurse(entry.source, null);
   return graph;
}

function createModule<
   T extends LoadChunkResult,
   K extends ParsedScriptResult | ParsedStyleResult,
   R extends T extends LoadChunkResource
      ? ResourceModule
      : K extends ParsedScriptResult
      ? ScriptModule
      : StyleModule
>(
   source: string,
   loaded: T,
   importers: Importers,
   parsed?: K,
   isEntry?: boolean
): R {
   let chunk: ScriptModule | StyleModule | ResourceModule;

   if (loaded.type == "resource") {
      chunk = new ResourceModule(loaded.asset, source, loaded.lang, importers);
      return chunk as R;
   }

   if (!parsed) {
      throw new Error(
         "Parsed object can't be falsy if chunk is not a resource."
      );
   }

   if (parsed.type == "script") {
      chunk = new ScriptModule(
         loaded.asset,
         source,
         loaded.content,
         loaded.lang,
         importers,
         parsed.ast,
         isEntry,
         parsed.exports,
         parsed.imports,
         parsed.programPath,
         loaded.map
      );
   } else {
      chunk = new StyleModule(
         loaded.asset,
         source,
         loaded.content,
         loaded.lang,
         importers,
         parsed.ast,
         isEntry,
         parsed.urlNodes,
         loaded.map
      );
   }

   return chunk as R;
}

/**
 * Get the dependency graph of the bundler starting from the entry point.
 */
export async function getDependencyGraph(this: Toypack) {
   await this._pluginManager.triggerHook({
      name: "buildStart",
      args: [],
   });

   const config = this.getConfig();
   const entrySource = config.bundle.entry
      ? this.resolve(path.join("/", config.bundle.entry))
      : this.resolve("/");

   const entryAsset = entrySource ? this.getAsset(entrySource) : null;

   const dummyGraph: DependencyGraph = new Map();
   if (!entryAsset) {
      this._pushToDebugger("error", ERRORS.entryNotFound());
      return dummyGraph;
   }

   if (entryAsset.type != "text") {
      this._pushToDebugger("error", ERRORS.invalidEntry(entryAsset.source));
      return dummyGraph;
   }

   return await getGraphRecursive.call(this, entryAsset);
}

export type Importers = Record<string, ScriptModule | StyleModule>;
export type Dependency = ScriptModule | StyleModule | ResourceModule;
export type DependencyGraph = Map<string, Dependency>;
