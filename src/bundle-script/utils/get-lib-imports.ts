import { ScriptDependency } from "src/parse";
import { ImportInfo } from "src/parse/extract-imports";
import { isLocal } from "../../utils";

export function getLibImports(scriptModules: ScriptDependency[]) {
   const imports: Record<string, ImportInfo[]> = {};
   for (const module of scriptModules) {
      const moduleImports = module.imports.others;
      const sideEffectImports = module.imports.sideEffect;

      [...Object.values(moduleImports), ...sideEffectImports].forEach(
         (importInfo) => {
            const source = importInfo.source;
            if (isLocal(source)) return;
            imports[source] ??= [];
            imports[source].push(importInfo);
         }
      );
   }

   return imports;
}
