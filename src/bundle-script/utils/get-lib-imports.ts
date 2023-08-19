import { isLocal } from "../../utils";
import type {
   ScriptModule,
   ImportInfo,
   AggregatedAllExport,
   AggregatedNameExport,
   AggregatedNamespaceExport,
} from "src/types";

export function getLibImports(scriptModules: ScriptModule[]) {
   const imports: Record<
      string,
      {
         portInfo:
            | ImportInfo
            | AggregatedAllExport
            | AggregatedNameExport
            | AggregatedNamespaceExport;
         module: ScriptModule;
      }[]
   > = {};
   for (const module of scriptModules) {
      [
         ...module.getImports(),
         ...module.getExports([
            "aggregatedAll",
            "aggregatedName",
            "aggregatedNamespace",
         ]),
      ].forEach((portInfo) => {
         const resolved = module.dependencyMap.get(portInfo.source);
         if (isLocal(portInfo.source) || !!resolved) return;
         imports[portInfo.source] ??= [];
         imports[portInfo.source].push({
            portInfo: portInfo,
            module,
         });
      });
   }

   return imports;
}
