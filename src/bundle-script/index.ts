import generate, { GeneratorOptions } from "@babel/generator";
import { Statement, program, removeComments } from "@babel/types";
import template from "@babel/template";
import {
   EncodedSourceMap,
   GenMapping,
   toEncodedMap,
} from "@jridgewell/gen-mapping";
import MagicString from "magic-string";
import MapConverter from "convert-source-map";
import { deconflict } from "./link/deconflict.js";
import { transformToVars } from "./link/top-level-var.js";
import { bindModules } from "./link/bind-modules.js";
import { createNamespace } from "./utils/create-namespace.js";
import {
   ModuleDescriptor,
   getModuleDescriptors,
} from "./utils/module-descriptor.js";
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
   DynamicImport,
} from "src/types";

// TODO: remove
import { codeFrameColumns } from "@babel/code-frame";
import { UidGenerator } from "./link/UidGenerator.js";
import { UidTracker } from "./link/UidTracker.js";
import { removePorts } from "./utils/remove-ports.js";
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
   }

   return needsNamespace;
}

export async function bundleScript(this: Toypack, graph: DependencyGraph) {
   const moduleDescriptors = getModuleDescriptors(graph);
   const modules = moduleDescriptors.map((x) => x.module);
   const uidGenerator = new UidGenerator();
   const uidTracker = new UidTracker(uidGenerator);
   uidTracker.instantiateModules(modules);
   uidTracker.assignWithModules(modules);
   uidGenerator.addReservedVars(...Object.keys(runtime));
   uidGenerator.addReservedVars(...uidTracker.getAllNamespaces());

   const chunks: CompilationChunks = {
      header: [],
      runtime: new Set(),
      namespace: new Map(),
      module: new Map(),
      footer: [],
   };

   try {
      for (const moduleDesc of moduleDescriptors) {
         // order matters here
         transformToVars(moduleDesc);
         deconflict(uidTracker, moduleDesc);
         bindModules(uidTracker, graph, moduleDesc);
      }

      // Format
      formatEsm(uidTracker, chunks, moduleDescriptors);
      removePorts(moduleDescriptors);

      // Modules
      for (const moduleDescriptor of moduleDescriptors) {
         const { module } = moduleDescriptor;
         chunks.module.set(module.source, moduleDescriptor);
      }

      // Namespaces
      const needsNamespace = getNamespacedModules(modules);
      for (const moduleDescriptor of moduleDescriptors) {
         const { module } = moduleDescriptor;
         if (!needsNamespace.has(module.source)) continue;
         const statements = createNamespace(uidTracker, module);
         const arr = Array.isArray(statements) ? statements : [statements];
         chunks.namespace.set(module.source, arr);
         chunks.runtime.add("__export");
      }
   } catch (error: any) {
      this._pushToDebugger("error", ERRORS.bundle(error));
   }

   const bundle = bundleChunks.call(this, chunks, graph);

   return {
      content: bundle.content,
      map: bundle.map ? MapConverter.fromObject(bundle.map) : null,
   };
}

function removeTopLevelComments(moduleDescriptor: ModuleDescriptor) {
   const { module } = moduleDescriptor;
   module.ast.comments?.forEach((comment) => {
      moduleDescriptor.update(comment.start!, comment.end!, "");
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
   for (const [source, moduleDescriptor] of chunks.module) {
      const { module } = moduleDescriptor;
      const shouldMap = shouldProduceSourceMap(source, config.bundle.sourceMap);
      removeTopLevelComments(moduleDescriptor);
      let generated = { content: "", map: null as EncodedSourceMap | null };
      const cached = this._getCache(module.source);
      if (cached?.content && !module.asset.modified) {
         generated = {
            content: cached.content,
            map: cached.map as EncodedSourceMap | null,
         };
      } else {
         generated = moduleDescriptor.generate();
         this._setCache(module.source, generated);
      }

      if (!generated.content.trim().length) continue;
      addedModules++;

      const loadedMap =
         (module.asset.type == "text" ? module.asset.map : null) || module.map;
      if (loadedMap) {
         generated.map = !generated.map
            ? loadedMap
            : mergeSourceMaps(generated.map, loadedMap);
      }

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
   bundle.map = toEncodedMap(sourceMap);

   return bundle;
}

export interface CompilationChunks {
   header: Statement[];
   runtime: Set<keyof typeof runtime>;
   namespace: Map<string, Statement[]>;
   module: Map<string, ModuleDescriptor>;
   footer: Statement[];
}
