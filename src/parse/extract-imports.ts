import { NodePath, Visitor } from "@babel/traverse";
import {
   ImportDeclaration,
   ImportDefaultSpecifier,
   ImportSpecifier,
   ImportNamespaceSpecifier,
   CallExpression,
   Program,
} from "@babel/types";

let uid = 0;
export function extractImports(programPath: NodePath<Program>) {
   const imports: GroupedImports = {
      sideEffect: {},
      dynamic: {},
      default: {},
      namespace: {},
      specifier: {},
   };

   const visitor: Visitor = {
      ImportDeclaration(path) {
         const { node } = path;
         const source = node.source.value;

         /**
          * For side-effect imports e.g.
          * import "./module.js";
          */
         if (!node.specifiers.length) {
            uid++;
            imports.sideEffect[uid] = {
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
               imports.default[specifier.local.name] = {
                  id: `$${uid++}`,
                  type: "default",
                  source,
                  path,
                  specifier,
                  local: specifier.local.name,
               };
            } else if (specifier.type == "ImportNamespaceSpecifier") {
               /**
                * For namespace imports e.g.
                * import * as foo from "./module.js";
                */
               imports.namespace[specifier.local.name] = {
                  id: `$${uid++}`,
                  type: "namespace",
                  source,
                  path,
                  specifier,
                  local: specifier.local.name,
               };
            } else if (specifier.type == "ImportSpecifier") {
               /**
                * For specified imports e.g.
                * import { foo, bar } from "./module.js";
                */
               imports.specifier[specifier.local.name] = {
                  id: `$${uid++}`,
                  type: "specifier",
                  source,
                  path,
                  specifier,
                  local: specifier.local.name,
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
            uid++;
            imports.dynamic[uid] = {
               id: `$${uid}`,
               type: "dynamic",
               path,
               source,
            };
         }
      },
   };

   programPath.traverse(visitor);

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
   local: string;
}

export interface SpecifierImport extends BaseImport {
   type: "specifier";
   specifier: ImportSpecifier;
   path: NodePath<ImportDeclaration>;
   local: string;
}

export interface NamespaceImport extends BaseImport {
   type: "namespace";
   specifier: ImportNamespaceSpecifier;
   path: NodePath<ImportDeclaration>;
   local: string;
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

export interface GroupedImports {
   sideEffect: Record<number, SideEffectImport>;
   dynamic: Record<number, DynamicImport>;
   namespace: Record<string, NamespaceImport>;
   specifier: Record<string, SpecifierImport>;
   default: Record<string, DefaultImport>;
}

export type ImportInfo =
   | DefaultImport
   | DynamicImport
   | NamespaceImport
   | SpecifierImport
   | SideEffectImport;
