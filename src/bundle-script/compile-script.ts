import traverseAST, { NodePath, Node, TraverseOptions } from "@babel/traverse";
import { EncodedSourceMap } from "@jridgewell/gen-mapping";
import { Toypack } from "../Toypack.js";
import { mergeTraverseOptions } from "../utils";
import { DependencyGraph, ScriptDependency } from "../types.js";

/**
 * 1. Transform with plugins.
 * 2. Deconflict the top-level vars of each chunk so they can be merged.
 * 3. Bind the imports and exports of each chunk.
 * 4. Remove the imports and exports.
 *
 */

export async function compileScript(
   this: Toypack,
   chunk: ScriptDependency,
   graph: DependencyGraph
) {
   const traverseOptionsArray: TraverseOptions[] = [];
   const traverse = (options: TraverseOptions) => {
      traverseOptionsArray.push(options);
   };

   console.log(chunk);

   traverseAST(chunk.ast, mergeTraverseOptions(traverseOptionsArray));
}

export interface CompiledScriptResult {
   source: string;
   content: string;
   map?: EncodedSourceMap | null;
}
