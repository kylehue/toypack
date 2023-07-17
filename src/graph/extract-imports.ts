import { NodePath, TraverseOptions } from "@babel/traverse";
import {
   Node,
   ImportDeclaration,
   ImportDefaultSpecifier,
   ImportSpecifier,
   ImportNamespaceSpecifier,
} from "@babel/types";
import { traverse } from "@babel/core";

let uid = 0;
export function extractImports(
   ast: Node,
   traverseFn?: (options: TraverseOptions) => void
) {
   const imports: Record<string, ImportInfo> = {};
   const options: TraverseOptions = {
      ImportDeclaration(path) {
         const { node } = path;
         const source = node.source.value;

         /**
          * For side-effect imports e.g.
          * import "./module.js";
          */
         if (!node.specifiers.length) {
            imports[uid++] = {
               id: `$${uid}`,
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
                  id: `$${uid++}`,
                  type: "default",
                  source,
                  path,
                  specifier,
               };
            } else if (specifier.type == "ImportNamespaceSpecifier") {
               /**
                * For namespace imports e.g.
                * import * as foo from "./module.js";
                */
               imports[specifier.local.name] = {
                  id: `$${uid++}`,
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
                  id: `$${uid++}`,
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

interface BaseImport {
   id: string;
   source: string;
   path: NodePath<ImportDeclaration>;
}

export interface DefaultImport extends BaseImport {
   type: "default";
   specifier: ImportDefaultSpecifier;
}

export interface SpecifierImport extends BaseImport {
   type: "specifier";
   specifier: ImportSpecifier;
}

export interface NamespaceImport extends BaseImport {
   type: "namespace";
   specifier: ImportNamespaceSpecifier;
}

export interface SideEffectImport {
   id: string;
   type: "sideEffect";
   source: string;
   path: NodePath<ImportDeclaration>;
}

export type ImportInfo =
   | DefaultImport
   | NamespaceImport
   | SpecifierImport
   | SideEffectImport;
