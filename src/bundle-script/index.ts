import generate, { GeneratorOptions } from "@babel/generator";
import { Statement, program, removeComments } from "@babel/types";
import template from "@babel/template";
import {
   EncodedSourceMap,
   GenMapping,
   toEncodedMap,
} from "@jridgewell/gen-mapping";
import MapConverter from "convert-source-map";
import { deconflict } from "./link/deconflict.js";
import { transformToVars } from "./link/top-level-var.js";
import { bindModules } from "./link/bind-modules.js";
import { createNamespace } from "./utils/create-namespace.js";
import { beginRename } from "./utils/renamer.js";
import { formatEsm } from "./formats/esm.js";
import {
   ERRORS,
   mergeSourceMapToBundle,
   mergeSourceMaps,
   shouldProduceSourceMap,
} from "../utils/index.js";
import runtime from "./runtime.js";
import type {
   Toypack,
   DependencyGraph,
   ScriptModule,
   NamespaceImport,
   AggregatedNamespaceExport,
   ModeConfig,
} from "src/types";

// TODO: remove
import { codeFrameColumns } from "@babel/code-frame";
(window as any).getCode = function (ast: any) {
   return codeFrameColumns(
      typeof ast == "string"
         ? ast
         : generate(ast, {
              comments: false,
           })?.code,
      {
         start: {
            line: 0,
         },
      },
      {
         forceColor: true,
         highlightCode: true,
         linesAbove: 0,
         linesBelow: 999,
      }
   );
};

export function getModules(graph: DependencyGraph) {
   return Object.values(Object.fromEntries(graph))
      .filter((g): g is ScriptModule => g.isScript())
      .reverse();
}

function getNamespacedModules(modules: ScriptModule[]) {
   const needsNamespace = new Set<string>();
   const scan = (
      module: ScriptModule,
      ports: (NamespaceImport | AggregatedNamespaceExport)[]
   ) => {
      for (const portInfo of ports) {
         const resolved = module.dependencyMap.get(portInfo.source)!;
         needsNamespace.add(resolved);
      }
   };

   for (const module of modules) {
      scan(module, module.getImports(["namespace"]));
      scan(module, module.getExports(["aggregatedNamespace"]));
   }

   return needsNamespace;
}

export async function bundleScript(this: Toypack, graph: DependencyGraph) {
   const scriptModules = getModules(graph);
   this._uidGenerator.addReservedVars(...Object.keys(runtime));
   this._uidTracker.assignWithModules(this._uidGenerator, scriptModules);
   this._uidGenerator.addReservedVars(...this._uidTracker.getAllNamespaces());

   // const resultAst = file(program([]));
   const chunks: CompilationChunks = {
      header: [],
      runtime: new Set(),
      namespace: new Map(),
      module: new Map(),
      footer: [],
   };

   try {
      const unrenamedModules = new Set<string>();
      let caches = 0,
         binds = 0;
      for (const module of scriptModules) {
         const isCached = !!this._getCache(module.source)?.module;
         if (!isCached || module.asset.modified) {
            // order matters here
            transformToVars.call(this, module);
            deconflict.call(this, module);
            bindModules.call(this, graph, module);
            unrenamedModules.add(module.source);

            this._setCache(module.source, {
               module,
            });
            binds++;
         } else {
            caches++;
         }
      }

      this._pushToDebugger(
         "verbose",
         `[binding] Bound ${binds} assets and cached ${caches} assets.`
      );

      // Format
      formatEsm.call(this, chunks, scriptModules);

      // Begin renaming
      for (const module of scriptModules) {
         if (!unrenamedModules.has(module.source)) continue;
         beginRename(module);
      }

      // Modules
      for (const module of scriptModules) {
         const cached = this._getCache(module.source);
         if (!cached?.module?.ast) continue;
         chunks.module.set(module.source, cached.module.ast.program.body);
      }

      // Namespaces
      const needsNamespace = getNamespacedModules(scriptModules);
      for (const module of scriptModules) {
         if (!needsNamespace.has(module.source)) continue;
         const statements = createNamespace.call(this, module);
         const arr = Array.isArray(statements) ? statements : [statements];
         chunks.namespace.set(module.source, arr);
         chunks.runtime.add("__export");
      }
   } catch (error: any) {
      this._pushToDebugger("error", ERRORS.bundle(error));
   }

   const bundle = bundleChunks.call(this, chunks, graph);

   console.log(getCode(bundle.code));

   return {
      content: bundle.code,
      map: bundle.map ? MapConverter.fromObject(bundle.map) : null,
   };
}

function removeTopLevelComments(body: Statement[]) {
   body.forEach((node) => {
      removeComments(node);
   });
}

const cachedRuntimeGens = new Map<
   `${keyof typeof runtime}-${ModeConfig}`,
   string
>();

function bundleChunks(
   this: Toypack,
   chunks: CompilationChunks,
   graph: DependencyGraph
) {
   const config = this.config;
   const bundle = {
      code: "",
      map: null as EncodedSourceMap | null,
   };

   const sourceMap = new GenMapping();
   const generatorOpts: GeneratorOptions = {
      sourceMaps: false,
      minified: config.bundle.mode == "production",
      comments: config.bundle.mode == "development",
   };

   const getSourceComment = (source: string) => {
      if (config.bundle.mode == "production") return "";
      return `// ${source.replace(/^\//, "")}\n`;
   };

   const lineChar = config.bundle.mode == "production" ? "" : "\n";

   // Header
   const header = generate(program(chunks.header), generatorOpts).code;
   if (header) {
      bundle.code += header;
      bundle.code += lineChar.repeat(2);
   }

   bundle.code = bundle.code.trimEnd();
   if (header) bundle.code += lineChar.repeat(2);

   // Runtimes
   for (const key of chunks.runtime) {
      const ast = template.ast(runtime[key]);
      let code = cachedRuntimeGens.get(`${key}-${config.bundle.mode}`);
      if (!code) {
         code = generate(
            program(Array.isArray(ast) ? ast : [ast]),
            generatorOpts
         ).code;
         cachedRuntimeGens.set(`${key}-${config.bundle.mode}`, code);
      }

      bundle.code += code;
      bundle.code += lineChar.repeat(2);
   }

   bundle.code = bundle.code.trimEnd();
   if (header || chunks.runtime.size) bundle.code += lineChar.repeat(2);

   // Namespaces
   for (const [source, body] of chunks.namespace) {
      if (!body.length) continue;
      const generated = generate(program(body), generatorOpts);

      if (!generated.code.length) continue;
      bundle.code += getSourceComment(source);
      bundle.code += generated.code;
      bundle.code += lineChar.repeat(2);
   }

   bundle.code = bundle.code.trimEnd();
   if (header || chunks.runtime.size || chunks.namespace.size) {
      bundle.code += lineChar.repeat(2);
   }

   // Modules
   let compiles = 0;
   let caches = 0;
   let addedModules = 0;
   for (const [source, body] of chunks.module) {
      if (!body.length) continue;
      const module = graph.get(source) as ScriptModule;
      const cached = this._getCache(source);
      const shouldMap = shouldProduceSourceMap(source, config.bundle.sourceMap);
      let code: string;
      let map: EncodedSourceMap | null = null;
      if (cached && cached.content && !module.asset.modified) {
         code = cached.content || "";
         map = cached.map as EncodedSourceMap | null;
         caches++;
      } else {
         compiles++;
         removeTopLevelComments(body);
         const generated = generate(
            program(body),
            {
               ...generatorOpts,
               sourceMaps: shouldMap,
               sourceFileName: module.asset.source,
            },
            module.content as string
         );

         code = generated.code;
         map = generated.map as EncodedSourceMap | null;

         const loadedMap =
            (module.asset.type == "text" ? module.asset.map : null) ||
            module.map;
         if (loadedMap) {
            map = !map ? loadedMap : mergeSourceMaps(map, loadedMap);
         }

         this._setCache(source, {
            content: code,
            map,
         });
      }

      if (!code.length) continue;
      addedModules++;
      bundle.code += getSourceComment(source);
      const linePos = bundle.code.split("\n").length;
      bundle.code += code;
      if (bundle.code.length) bundle.code += lineChar.repeat(2);

      if (map && shouldMap) {
         mergeSourceMapToBundle(sourceMap, map, {
            line: linePos,
            column: 0,
         });
      }
   }

   bundle.code = bundle.code.trimEnd();
   if (header || chunks.runtime.size || chunks.namespace.size || addedModules) {
      bundle.code += lineChar.repeat(2);
   }

   // Footer
   const footer = generate(program(chunks.footer), generatorOpts).code;
   if (footer) {
      bundle.code += footer;
   }

   bundle.code = bundle.code.trimEnd();
   bundle.map = toEncodedMap(sourceMap);

   this._pushToDebugger(
      "verbose",
      `[compiling] Compiled ${compiles} assets and cached ${caches} assets.`
   );

   return bundle;
}

export interface CompilationChunks {
   header: Statement[];
   runtime: Set<keyof typeof runtime>;
   namespace: Map<string, Statement[]>;
   module: Map<string, Statement[]>;
   footer: Statement[];
}
