import { isLocal } from "../../utils";
import type { ScriptModule, ImportInfo } from "src/types";

export function getLibImports(scriptModules: ScriptModule[]) {
   const imports: Record<string, ImportInfo[]> = {};
   for (const module of scriptModules) {
      [
         ...Object.values(module.imports.default),
         ...Object.values(module.imports.dynamic),
         ...Object.values(module.imports.namespace),
         ...Object.values(module.imports.sideEffect),
         ...Object.values(module.imports.specifier),
      ].forEach((importInfo) => {
         const resolved = module.dependencyMap.get(importInfo.source);
         if (isLocal(importInfo.source) || !!resolved) return;
         imports[importInfo.source] ??= [];
         imports[importInfo.source].push(importInfo);
      });
   }

   return imports;
}
