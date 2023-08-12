import { ResourceAsset } from "src/types";
import { Module } from "./Module";
import { Importers } from "..";

export class ResourceModule extends Module {
   public type = "resource" as const;
   constructor(
      asset: ResourceAsset,
      public source: string,
      public importers: Importers
   ) {
      super("resource", asset);
   }
}
