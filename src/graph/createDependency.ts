import { RawSourceMap } from "source-map-js";
import { IParsedAsset, IParsedScript, IParsedStyle } from "./parseAsset.js";
import { IAssetResource, IAssetText } from "../asset.js";

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
}

interface IDependencyTextBase {
   map?: RawSourceMap;
   dependencyMap: Record<string, string>;
   asset: IAssetText;
   parsed: IParsedAsset;
}

export interface IDependencyScript extends IDependencyTextBase {
   type: "script";
}

export interface IDependencyStyle extends IDependencyTextBase {
   type: "style";
}

export type IDependency<T extends IDependencyType = any> = T extends "resource"
   ? IDependencyResource
   : T extends "script"
   ? IDependencyScript
   : T extends "style"
   ? IDependencyStyle
   : IDependencyResource | IDependencyScript | IDependencyStyle;

type IDependencyType = "script" | "style" | "resource";
