import type { ScriptModule } from "src/types";

export function getModulesMap(scriptModules: ScriptModule[]) {
   const modulesMap = scriptModules.reduce((acc, cur) => {
      acc[cur.source] = cur;
      return acc;
   }, {} as Record<string, ScriptModule>);

   return modulesMap;
}