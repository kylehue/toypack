import { NodePath, TraverseOptions } from "@babel/traverse";
import * as t from "@babel/types";
import { traverse } from "@babel/core";

export function extractImports(
   ast: t.Node,
   traverseFn?: (options: TraverseOptions) => void
) {
   const imports: Record<string, ImportInfo> = {};
   let sideEffectId = 0;
   const options: TraverseOptions = {
      ImportDeclaration(path) {
         const { node } = path;
         const source = node.source.value;

         /**
          * For side-effect imports e.g.
          * import "./module.js";
          */
         if (!node.specifiers.length) {
            imports[sideEffectId++] = {
               type: "sideEffect",
               path,
               source,
            };
         }

         for (const specifier of node.specifiers) {
            if (specifier.type == "ImportDefaultSpecifier") {
               /**
                * For default imports e.g.
                * import foo from "./module.js";
                */
               imports[specifier.local.name] = {
                  type: "default",
                  source,
                  path,
                  specifier
               };
            } else if (specifier.type == "ImportNamespaceSpecifier") {
               /**
                * For namespace imports e.g.
                * import * as foo from "./module.js";
                */
               imports[specifier.local.name] = {
                  type: "namespace",
                  source,
                  path,
                  specifier,
               };
            } else {
               /**
                * For specified imports e.g.
                * import { foo, bar } from "./module.js";
                */
               imports[specifier.local.name] = {
                  type: "specifier",
                  source,
                  path,
                  specifier,
               };
            }
         }
      },
   };

   if (traverseFn) {
      traverseFn(options);
   } else {
      traverse(ast, options);
   }

   return imports;
}

interface ImportBase {
   source: string;
   path: NodePath<t.ImportDeclaration>;
}

export interface ImportDefault extends ImportBase {
   type: "default";
   specifier: t.ImportDefaultSpecifier;
}

export interface ImportSpecifier extends ImportBase {
   type: "specifier";
   specifier: t.ImportSpecifier;
}

export interface ImportNamespace extends ImportBase {
   type: "namespace";
   specifier: t.ImportNamespaceSpecifier;
}

export interface ImportSideEffect {
   type: "sideEffect";
   source: string;
   path: NodePath<t.ImportDeclaration>;
}

export type ImportInfo =
   | ImportDefault
   | ImportNamespace
   | ImportSpecifier
   | ImportSideEffect;