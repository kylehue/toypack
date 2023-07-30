import { isLocal } from "../utils/is-local.js";
import { Plugin, Toypack } from "../types.js";
import {
   ExportAllDeclaration,
   ExportNamedDeclaration,
   ImportDeclaration,
} from "@babel/types";
import { NodePath } from "@babel/traverse";

function resolve(
   bundler: Toypack,
   path: NodePath<
      ImportDeclaration | ExportAllDeclaration | ExportNamedDeclaration
   >
) {
   const { node } = path;
   if (!node.source) return;
   const request = node.source.value;
   if (isLocal(request)) return;
   const resolved = bundler.resolve(request);
   if (!resolved) return;
   node.source.value = resolved;
}

/**
 * This plugin simply resolves the paths of the node module imports
 * so that the bundler can recognize them as local files.
 */
export default function (): Plugin {
   return {
      name: "bundle-deps-plugin",
      transform(context) {
         if (context.type != "script") return;
         if (this.bundler.config.bundle.mode != "production") return;
         context.traverse({
            ImportDeclaration: (path) => resolve(this.bundler, path),
            ExportAllDeclaration: (path) => resolve(this.bundler, path),
            ExportNamedDeclaration: (path) => resolve(this.bundler, path),
         });
      },
   };
}
