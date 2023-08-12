import { EncodedSourceMap } from "@jridgewell/gen-mapping";
import { NodePath } from "@babel/traverse";
import { File, Program } from "@babel/types";
import { Module } from "./Module";
import { Importers } from "../index";
import { GroupedExports } from "../extract-exports";
import { GroupedImports } from "../extract-imports";
import type { Asset, ExportInfo, ImportInfo } from "src/types";

export class ScriptModule extends Module {
   public type = "script" as const;
   public dependencyMap = new Map<string, string>();
   constructor(
      asset: Asset,
      public source: string,
      public content: string,
      public importers: Importers,
      public ast: File,
      public isEntry: boolean = false,
      public exports: GroupedExports,
      public imports: GroupedImports,
      public programPath: NodePath<Program>,
      public map?: EncodedSourceMap | null
   ) {
      super("script", asset);
   }

   public getExports<T extends ExportInfo["type"][]>(
      filter?: T
   ): Extract<ExportInfo, { type: T[number] }>[] {
      const _filter: ExportInfo["type"][] = [];
      if (!filter) {
         _filter.push(
            "aggregatedAll",
            "aggregatedName",
            "aggregatedNamespace",
            "declared",
            "declaredDefault",
            "declaredDefaultExpression"
         );
      } else {
         _filter.push(...filter);
      }
      const exports = [];
      for (const type of new Set(_filter)) {
         exports.push(...Object.values(this.exports[type]));
      }

      return exports;
   }

   public getImports<T extends ImportInfo["type"][]>(
      filter?: T
   ): Extract<ImportInfo, { type: T[number] }>[] {
      const _filter: ImportInfo["type"][] = [];
      if (!filter) {
         _filter.push(
            "default",
            "dynamic",
            "namespace",
            "sideEffect",
            "specifier"
         );
      } else {
         _filter.push(...filter);
      }
      const imports = [];
      for (const type of new Set(_filter)) {
         imports.push(...Object.values(this.imports[type]));
      }

      return imports;
   }
}
