import { ScriptDependency } from "src/parse";

export function getModulesMap(scriptModules: ScriptDependency[]) {
   const modulesMap = scriptModules.reduce((acc, cur) => {
      acc[cur.source] = cur;
      return acc;
   }, {} as Record<string, ScriptDependency>);

   return modulesMap;
}