import generate, { GeneratorOptions } from "@babel/generator";
import { Statement, program } from "@babel/types";
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
import { UidGenerator } from "./link/UidGenerator.js";
import { UidTracker } from "./link/UidTracker.js";
import { createNamespace } from "./utils/create-namespace.js";
import {
   ModuleTransformer,
   getModuleTransformersFromGraph,
} from "../utils/module-transformer.js";
import { finalizeModule } from "./utils/finalize-module.js";
import { formatEsm } from "./formats/esm.js";
import {
   ERRORS,
   isLocal,
   mergeSourceMapToBundle,
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
   DynamicImport,
} from "src/types";

// TODO: remove
import { codeFrameColumns } from "@babel/code-frame";
window.getHighlightedCode = function (ast: any) {
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

function getNamespacedModules(this: Toypack, modules: ScriptModule[]) {
   const needsNamespace = new Set<string>();
   const scan = (
      module: ScriptModule,
      ports: (NamespaceImport | DynamicImport | AggregatedNamespaceExport)[]
   ) => {
      for (const portInfo of ports) {
         const resolved = module.dependencyMap.get(portInfo.source)!;
         needsNamespace.add(resolved);
      }
   };

   for (const module of modules) {
      scan(module, module.getImports(["namespace", "dynamic"]));
      scan(module, module.getExports(["aggregatedNamespace"]));

      // Modules that has aggregated export from external sources
      const exports = module.getExports([
         "aggregatedAll",
         "aggregatedName",
         "aggregatedNamespace",
      ]);
      if (exports.some((x) => !isLocal(x.source))) {
         needsNamespace.add(module.source);
      }

      // Also the external modules that has been exported aggregatedly
      for (const exportInfo of exports) {
         const source = exportInfo.source;
         if (isLocal(source)) continue;
         const resolved = this.resolve(source);
         if (!resolved) continue;
         needsNamespace.add(resolved);
      }
   }

   return needsNamespace;
}

export async function bundleScript(this: Toypack, graph: DependencyGraph) {
   const moduleTransformers = (await getModuleTransformersFromGraph.call(
      this,
      "script",
      graph
   )) as ModuleTransformer<ScriptModule>[];
   const modules = moduleTransformers.map((x) => x.module);

   const uidGenerator = new UidGenerator();
   const uidTracker = new UidTracker(this, uidGenerator);
   uidTracker.assignWithModules(modules);
   uidGenerator.addReservedVars(...Object.keys(runtime));
   uidGenerator.addReservedVars(...uidTracker.getAllNamespaces());
   console.log(uidTracker);

   const chunks: CompilationChunks = {
      header: [],
      runtime: new Set(),
      namespace: new Map(),
      module: new Map(),
      footer: [],
   };

   try {
      for (const moduleTransformer of moduleTransformers) {
         if (!moduleTransformer.needsChange()) continue;
         // order matters here
         transformToVars.call(this, moduleTransformer);
         deconflict.call(this, uidTracker, moduleTransformer);
         bindModules.call(this, uidTracker, graph, moduleTransformer);
      }

      // Format to esm
      formatEsm.call(this, uidTracker, chunks, moduleTransformers);

      // finalize
      for (const moduleTransformer of moduleTransformers) {
         if (!moduleTransformer.needsChange()) continue;
         finalizeModule(moduleTransformer);
      }

      // chunks.module
      for (const moduleTransformer of moduleTransformers) {
         const { module } = moduleTransformer;
         chunks.module.set(module.source, moduleTransformer);
      }

      // chunks.namespace
      const needsNamespace = getNamespacedModules.call(this, modules);
      for (const moduleTransformer of moduleTransformers) {
         const { module } = moduleTransformer;
         if (!needsNamespace.has(module.source)) continue;
         const statements = createNamespace.call(
            this,
            chunks.runtime,
            uidTracker,
            module
         );
         const arr = Array.isArray(statements) ? statements : [statements];
         chunks.namespace.set(module.source, arr);
      }
   } catch (error: any) {
      this._pushToDebugger("error", ERRORS.bundle(error));
   }

   const bundle = bundleChunks.call(this, chunks);

   return {
      content: bundle.content,
      map: bundle.map ? MapConverter.fromObject(bundle.map) : null,
   };
}

const cachedRuntimeGens = new Map<
   `${keyof typeof runtime}-${ModeConfig}`,
   string
>();

function bundleChunks(this: Toypack, chunks: CompilationChunks) {
   const config = this.config;
   const bundle = {
      content: "",
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
      bundle.content += header;
      bundle.content += lineChar.repeat(2);
   }

   bundle.content = bundle.content.trimEnd();
   if (header) bundle.content += lineChar.repeat(2);

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

      bundle.content += code;
      bundle.content += lineChar.repeat(2);
   }

   bundle.content = bundle.content.trimEnd();
   if (header || chunks.runtime.size) bundle.content += lineChar.repeat(2);

   // Namespaces
   for (const [source, body] of chunks.namespace) {
      if (!body.length) continue;
      const generated = generate(program(body), generatorOpts);

      if (!generated.code.length) continue;
      bundle.content += getSourceComment(source);
      bundle.content += generated.code;
      bundle.content += lineChar.repeat(2);
   }

   bundle.content = bundle.content.trimEnd();
   if (header || chunks.runtime.size || chunks.namespace.size) {
      bundle.content += lineChar.repeat(2);
   }

   // Modules
   let addedModules = 0;
   for (const [source, moduleTransformer] of chunks.module) {
      const shouldMap = shouldProduceSourceMap(source, config.bundle.sourceMap);
      const generated = moduleTransformer.generate();

      if (!generated.content.trim().length) continue;
      addedModules++;

      bundle.content += getSourceComment(source);
      const linePos = bundle.content.split("\n").length;
      bundle.content += generated.content;
      if (bundle.content.length) bundle.content += lineChar.repeat(2);

      if (generated.map && shouldMap) {
         mergeSourceMapToBundle(sourceMap, generated.map, {
            line: linePos,
            column: 0,
         });
      }
   }

   bundle.content = bundle.content.trimEnd();
   if (header || chunks.runtime.size || chunks.namespace.size || addedModules) {
      bundle.content += lineChar.repeat(2);
   }

   // Footer
   const footer = generate(program(chunks.footer), generatorOpts).code;
   if (footer) {
      bundle.content += footer;
   }

   bundle.content = bundle.content.trimEnd();
   bundle.map = bundle.content.length ? toEncodedMap(sourceMap) : null;

   return bundle;
}

export interface CompilationChunks {
   header: Statement[];
   runtime: Set<keyof typeof runtime>;
   namespace: Map<string, Statement[]>;
   module: Map<string, ModuleTransformer>;
   footer: Statement[];
}
