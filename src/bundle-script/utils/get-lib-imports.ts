import { isLocal } from "../../utils";
import type { ScriptModule, ImportInfo } from "src/types";

export function getLibImports(scriptModules: ScriptModule[]) {
   const imports: Record<
      string,
      {
         importInfo: ImportInfo;
         module: ScriptModule;
      }[]
   > = {};
   for (const module of scriptModules) {
      module.getImports().forEach((importInfo) => {
         const resolved = module.dependencyMap.get(importInfo.source);
         if (isLocal(importInfo.source) || !!resolved) return;
         imports[importInfo.source] ??= [];
         imports[importInfo.source].push({
            importInfo,
         module,
      });
   });
   }

   return imports;
}
