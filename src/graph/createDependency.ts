import { RawSourceMap } from "source-map-js";
import { IParsedAsset, IParsedScript, IParsedStyle } from "./parseAsset.js";
import { IAsset, IAssetResource, IAssetText } from "../asset.js";
import { CssNode } from "css-tree";
import { Node } from "@babel/traverse";

/**
 * Create a dependency object based on type.
 * @returns The dependency object.
 */
export function createDependency<T extends IDependencyType>(
   type: T,
   data: Omit<IDependency<T>, "type">
) {
   const dependency: IDependency<T> = {
      ...data,
      type
   } as IDependency<T>;
   return dependency;
}

export interface IDependencyResource {
   type: "resource";
   asset: IAssetResource;
   chunkSource: string;
}

interface IDependencyTextBase {
   chunkSource: string;
   content: string;
   AST: Node | CssNode
   dependencyMap: Record<string, string>;
   map?: RawSourceMap;
   rawChunkDependencies: string[];
   asset: IAsset;
}

export interface IDependencyScript extends IDependencyTextBase {
   type: "script";
   AST: Node;
   isEntry: boolean;
}

export interface IDependencyStyle extends IDependencyTextBase {
   type: "style";
   AST: CssNode;
}

export type IDependency<T extends IDependencyType = any> = T extends "resource"
   ? IDependencyResource
   : T extends "script"
   ? IDependencyScript
   : T extends "style"
   ? IDependencyStyle
   : IDependencyResource | IDependencyScript | IDependencyStyle;

type IDependencyType = "script" | "style" | "resource";
