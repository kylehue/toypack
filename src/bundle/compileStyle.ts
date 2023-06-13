import MapConverter from "convert-source-map";
import * as CSSTree from "css-tree";
import { SourceMapGenerator, RawSourceMap } from "source-map-js";
import { Toypack } from "../Toypack.js";
import { mergeSourceMaps } from "../utils.js";
import { IDependencyGraph } from "../graph/index.js";

export function compileStyle(
   this: Toypack,
   source: string,
   graph: IDependencyGraph
) {
   const style = graph[source];
   if (style.type != "style") {
      throw new Error("The source to compile must be a valid style.");
   }

   const { AST, map: inputSourceMap } = style;

   const sourceMapOption = this.config.bundle.sourceMap;

   const compiled = CSSTree.generate(AST, {
      sourceMap: !!sourceMapOption,
   }) as any as CSSTreeGeneratedResult;

   const result = {
      source,
      content: "",
      map: null as RawSourceMap | null,
   };

   if (typeof compiled == "string") {
      result.content = compiled;
   } else {
      result.content = compiled.css;
      result.map = !!sourceMapOption
         ? MapConverter.fromJSON(compiled.map.toString()).toObject()
         : null;
   }

   if (result.map && inputSourceMap) {
      result.map = mergeSourceMaps(inputSourceMap, result.map);
   }

   return result;
}

export type CSSTreeGeneratedResult =
   | {
        css: string;
        map: SourceMapGenerator;
     }
   | string;