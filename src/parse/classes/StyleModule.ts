import { Asset } from "src/types";
import { Module } from "./Module";
import { CssNode, Url } from "css-tree";
import { EncodedSourceMap } from "@jridgewell/gen-mapping";
import { Importers } from "..";

export class StyleModule extends Module {
   public type = "style" as const;
   public dependencyMap = new Map<string, string>();
   constructor(
      public asset: Asset,
      public source: string,
      public content: string,
      public lang: string,
      public importers: Importers,
      public ast: CssNode,
      public isEntry: boolean = false,
      public urlNodes: Url[],
      public map?: EncodedSourceMap | null
   ) {
      super("style");
   }
}