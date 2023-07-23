import { DependencyGraph } from "src/parse";
import { ExportInfo } from "src/parse/extract-exports";

/**
 * Retrieves the exported declaration.
 * @param graph The dependency graph.
 * @param exportName The name of the export to retrieve.
 * @param exportSource The source of the module that has the export.
 * @param importerSource The source of the module that needs the export.
 * @returns
 */
export function getExport(
   graph: DependencyGraph,
   exportName: string,
   exportSource: string,
   importerSource: string
): ExportInfo | null {
   const importer = graph[importerSource];
   if (importer?.type != "script") return null;
   const resolvedImportSource = importer.dependencyMap[exportSource];
   const importedModule = graph[resolvedImportSource];
   if (importedModule?.type != "script") return null;

   let exported: ExportInfo | null = importedModule.exports.others[exportName];
   if (!exported) {
      /**
       * If export is not found, try if it's in any of the
       * aggregated star exports e.g.
       * export * from "./module.js";
       */
      for (const exportInfo of importedModule.exports.aggregatedAll) {
         exported = getExport(
            graph,
            exportName,
            exportInfo.source,
            importedModule.source
         );
      }
   }

   if (exported && exported.type == "aggregatedName") {
      /**
       * Recurse until we get the exported declaration if it's aggregated.
       */
      return getExport(
         graph,
         exportName,
         exported.source,
         importedModule.source
      );
   }

   return exported;
}
