import { NodePath, TraverseOptions } from "@babel/traverse";
import {
   Node,
   ImportDeclaration,
   ImportDefaultSpecifier,
   ImportSpecifier,
   ImportNamespaceSpecifier,
   CallExpression,
} from "@babel/types";
import { traverse } from "@babel/core";

let uid = 0;
export function extractImports(
   ast: Node,
   traverseFn?: (options: TraverseOptions) => void
) {
   const imports: Imports = {
      sideEffect: [],
      dynamic: [],
      others: {},
   };

   const options: TraverseOptions = {
      ImportDeclaration(path) {
         const { node } = path;
         const source = node.source.value;

         /**
          * For side-effect imports e.g.
          * import "./module.js";
          */
         if (!node.specifiers.length) {
            imports.sideEffect.push({
               id: `$${uid++}`,
               type: "sideEffect",
               path,
               source,
            });
         }

         for (const specifier of node.specifiers) {
            if (specifier.type == "ImportDefaultSpecifier") {
               /**
                * For default imports e.g.
                * import foo from "./module.js";
                */
               imports.others[specifier.local.name] = {
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
               imports.others[specifier.local.name] = {
                  id: `$${uid++}`,
                  type: "namespace",
                  source,
                  path,
                  specifier,
               };
            } else if (specifier.type == "ImportSpecifier") {
               /**
                * For specified imports e.g.
                * import { foo, bar } from "./module.js";
                */
               imports.others[specifier.local.name] = {
                  id: `$${uid++}`,
                  type: "specifier",
                  source,
                  path,
                  specifier,
               };
            }
         }
      },
      CallExpression(path) {
         const argNode = path.node.arguments[0];
         const callee = path.node.callee;
         const isDynamicImport = callee.type == "Import";
         if (isDynamicImport && argNode.type == "StringLiteral") {
            const source = argNode.value;
            imports.dynamic.push({
               id: `$${uid++}`,
               type: "dynamic",
               path,
               source,
            });
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
}

export interface DefaultImport extends BaseImport {
   type: "default";
   specifier: ImportDefaultSpecifier;
   path: NodePath<ImportDeclaration>;
}

export interface SpecifierImport extends BaseImport {
   type: "specifier";
   specifier: ImportSpecifier;
   path: NodePath<ImportDeclaration>;
}

export interface NamespaceImport extends BaseImport {
   type: "namespace";
   specifier: ImportNamespaceSpecifier;
   path: NodePath<ImportDeclaration>;
}

export interface DynamicImport extends BaseImport {
   type: "dynamic";
   path: NodePath<CallExpression>;
}

export interface SideEffectImport {
   id: string;
   type: "sideEffect";
   source: string;
   path: NodePath<ImportDeclaration>;
}

export interface Imports {
   sideEffect: SideEffectImport[];
   dynamic: DynamicImport[];
   others: Record<string, NamespaceImport | SpecifierImport | DefaultImport>;
}

export type ImportInfo =
   | DefaultImport
   | DynamicImport
   | NamespaceImport
   | SpecifierImport
   | SideEffectImport;
