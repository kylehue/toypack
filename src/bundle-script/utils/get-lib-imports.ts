import { ScriptDependency } from "src/parse";
import { ImportInfo } from "src/parse/extract-imports";
import { isLocal } from "../../utils";

export function getLibImports(scriptModules: ScriptDependency[]) {
   const imports: Record<string, ImportInfo[]> = {};
   for (const module of scriptModules) {
      [
         ...Object.values(module.imports.default),
         ...Object.values(module.imports.dynamic),
         ...Object.values(module.imports.namespace),
         ...Object.values(module.imports.sideEffect),
         ...Object.values(module.imports.specifier),
      ].forEach((importInfo) => {
         const source = importInfo.source;
         if (isLocal(source)) return;
         imports[source] ??= [];
         imports[source].push(importInfo);
      });
   }

   return imports;
}
