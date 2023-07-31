import { DependencyGraph, ScriptDependency } from "src/parse";
import { isNodeModule } from "../../utils";

/**
 * Gets the sorted script modules in the dependency graph.
 * It sorts the modules by import hierarchy.
 */
export function getSortedScripts(graph: DependencyGraph) {
   return Object.values(graph)
      .filter((g): g is ScriptDependency => g.type == "script")
      .sort((a, b) => {
         if (a.importers[b.source] && !b.importers[a.source]) {
            return 1;
         } else if (b.importers[a.source] && !a.importers[b.source]) {
            return -1;
         }
         if (isNodeModule(a.source) && !isNodeModule(b.source)) {
            return 1;
         } else if (isNodeModule(b.source) && !isNodeModule(a.source)) {
            return -1;
         }
         return 0;
      });
}
