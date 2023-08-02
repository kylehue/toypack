import { ResourceAsset } from "src/types";
import { Module } from "./Module";
import { Importers } from "..";

export class ResourceModule extends Module {
   public type = "resource" as const;
   constructor(
      public asset: ResourceAsset,
      public source: string,
      public lang: string,
      public importers: Importers
   ) {
      super("resource");
   }
}
