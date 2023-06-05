declare module "merge-source-map" {
   export interface SourceMap {
      version: string;
      sources: string[];
      names: string[];
      sourceRoot?: string;
      sourcesContent?: string[];
      mappings: string;
      file?: string;
   }
   
   export default function (oldMap: SourceMap, newMap: SourceMap): SourceMap;
}
