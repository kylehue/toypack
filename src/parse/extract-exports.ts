import { NodePath, Scope, TraverseOptions, Visitor } from "@babel/traverse";
import {
   Identifier,
   VariableDeclarator,
   ExportAllDeclaration,
   Expression,
   FunctionDeclaration,
   ClassDeclaration,
   isExpression,
   ExportSpecifier,
   ExportNamedDeclaration,
   ExportNamespaceSpecifier,
   ExportDefaultDeclaration,
   isVariableDeclaration,
   isClassDeclaration,
   isFunctionDeclaration,
   isIdentifier,
   ImportSpecifier,
   ImportDefaultSpecifier,
   ImportNamespaceSpecifier,
   Program,
} from "@babel/types";

export function getBindingDeclaration(scope: Scope, name: string) {
   const binding = scope.getBinding(name);
   if (!binding) return;
   const path = binding.path;
   if (
      path.isFunctionDeclaration() ||
      path.isClassDeclaration() ||
      path.isVariableDeclarator() ||
      path.isImportSpecifier() ||
      path.isImportDefaultSpecifier() ||
      path.isImportNamespaceSpecifier()
   ) {
      return path;
   }
}

let uid = 0;
export function extractExports(traverser: (opts: TraverseOptions) => void) {
   const exports: GroupedExports = {
      aggregatedAll: {},
      aggregatedName: {},
      aggregatedNamespace: {},
      declaredDefault: {},
      declaredDefaultExpression: {},
      declared: {},
   };

   const visitor: Visitor = {
      ExportAllDeclaration(path) {
         const { node } = path;
         const source = node.source?.value;
         uid++;
         exports.aggregatedAll[uid] = {
            id: `$${uid}`,
            type: "aggregatedAll",
            path,
            source,
         };
      },
      ExportNamedDeclaration(path) {
         const { node } = path;
         const { declaration } = node;

         if (node.source) {
            const source = node.source.value;
            // Aggregated exports
            for (const specifier of node.specifiers) {
               if (specifier.type == "ExportNamespaceSpecifier") {
                  /**
                   * For namespace exports e.g.
                   * export * as foo from "module.js";
                   */
                  const name = specifier.exported.name;
                  exports.aggregatedNamespace[name] = {
                     id: `$${uid++}`,
                     type: "aggregatedNamespace",
                     specifier,
                     source,
                     path,
                     name,
                     local: name,
                  };
               } else if (specifier.type == "ExportSpecifier") {
                  /**
                   * For named exports e.g.
                   * export { foo, bar as greet } from "module.js";
                   */
                  const { exported } = specifier;
                  const name =
                     exported.type == "Identifier"
                        ? exported.name
                        : exported.value;
                  exports.aggregatedName[name] = {
                     id: `$${uid++}`,
                     type: "aggregatedName",
                     specifier,
                     source,
                     path,
                     name,
                     local: specifier.local.name,
                  };
               }
            }
         } else {
            // Declared exports
            if (isVariableDeclaration(declaration)) {
               const ids = Object.values(path.getBindingIdentifiers());
               ids.forEach((id) => {
                  const declPath = getBindingDeclaration(path.scope, id.name);

                  if (!declPath) {
                     throw new Error(`No declaration found for "${id.name}"`);
                  }

                  const name = id.name;
                  exports.declared[id.name] = {
                     id: `$${uid++}`,
                     type: "declared",
                     path,
                     declaration: declPath,
                     identifier: id,
                     name,
                     local: name,
                     isExportDeclared: true,
                  };
               });
            } else {
               if (
                  isFunctionDeclaration(declaration) ||
                  isClassDeclaration(declaration)
               ) {
                  /**
                   * For declared class/function exports e.g.
                   * export function functionName() {}
                   */
                  // declaration.id should be guaranteed here
                  const id = declaration.id!;
                  const declPath = getBindingDeclaration(path.scope, id.name);

                  if (!declPath) {
                     throw new Error(`No declaration found for "${id.name}"`);
                  }

                  const name = id.name;
                  exports.declared[id.name] = {
                     id: `$${uid++}`,
                     type: "declared",
                     path,
                     declaration: declPath,
                     identifier: id,
                     name,
                     local: name,
                     isExportDeclared: true,
                  };
               } else {
                  for (const specifier of node.specifiers) {
                     if (specifier.type != "ExportSpecifier") continue;
                     /**
                      * For exports declared above e.g.
                      * const PI = 3.14;
                      * class Book {}
                      * function getAuthor() {}
                      * export { PI as foo, Book as bar, getAuthor as author };
                      */
                     const { exported, local } = specifier;
                     const name =
                        exported.type == "Identifier"
                           ? exported.name
                           : exported.value;
                     const declPath = getBindingDeclaration(
                        path.scope,
                        local.name
                     );

                     if (!declPath) {
                        throw new Error(
                           `No declaration found for "${local.name}"`
                        );
                     }

                     exports.declared[name] = {
                        id: `$${uid++}`,
                        type: "declared",
                        path,
                        declaration: declPath,
                        identifier: local,
                        name,
                        local: specifier.local.name,
                        isExportDeclared: false,
                     };
                  }
               }
            }
         }
      },
      ExportDefaultDeclaration(path) {
         const { node } = path;
         const { declaration } = node;
         if (
            isFunctionDeclaration(declaration) ||
            isClassDeclaration(declaration)
         ) {
            /**
             * For default-declared exports e.g.
             * export default function() {}
             * export default class {}
             */

            const declPath = path.get("declaration");

            if (
               !declPath.isFunctionDeclaration() &&
               !declPath.isClassDeclaration()
            ) {
               throw new TypeError("Invalid declaration.");
            }

            exports.declaredDefault["default"] = {
               id: `$${uid++}`,
               type: "declaredDefault",
               path,
               declaration: declPath,
               name: "default",
               isExportDeclared: true,
            };
         } else if (isIdentifier(node.declaration)) {
            /**
             * For default exports declared above e.g.
             * const foo = "foo";
             * export default foo;
             */
            const name = node.declaration.name;
            const declPath = getBindingDeclaration(path.scope, name);

            if (!declPath) {
               throw new Error(`No declaration found for "${name}"`);
            }

            exports.declaredDefault["default"] = {
               id: `$${uid++}`,
               type: "declaredDefault",
               path,
               declaration: declPath,
               identifier: node.declaration,
               name: "default",
               local: node.declaration.name,
               isExportDeclared: false,
            };
         } else if (isExpression(node.declaration)) {
            /**
             * For default expression exports e.g.
             * export default {};
             * export default 200;
             * export default "Hello";
             */

            const declPath = path.get("declaration");
            if (!isExpression(declPath.node)) {
               throw new TypeError("Invalid declaration.");
            }

            exports.declaredDefaultExpression["default"] = {
               id: `$${uid++}`,
               type: "declaredDefaultExpression",
               path,
               declaration: declPath as NodePath<Expression>,
               name: "default",
            };
         }
      },
   };

   traverser.call(null, visitor);

   return exports;
}

interface ExportBase {
   id: string;
   name: string;
}

export interface AggregatedNameExport extends ExportBase {
   type: "aggregatedName";
   source: string;
   specifier: ExportSpecifier;
   path: NodePath<ExportNamedDeclaration>;
   local: string;
}

export interface AggregatedNamespaceExport extends ExportBase {
   type: "aggregatedNamespace";
   source: string;
   specifier: ExportNamespaceSpecifier;
   path: NodePath<ExportNamedDeclaration>;
   local: string;
}

export interface AggregatedAllExport {
   id: string;
   type: "aggregatedAll";
   source: string;
   path: NodePath<ExportAllDeclaration>;
}

export interface DeclaredExport extends ExportBase {
   type: "declared";
   identifier: Identifier;
   path: NodePath<ExportNamedDeclaration>;
   local: string;
   declaration:
      | NodePath<ClassDeclaration>
      | NodePath<FunctionDeclaration>
      | NodePath<VariableDeclarator>
      | NodePath<ImportSpecifier>
      | NodePath<ImportDefaultSpecifier>
   | NodePath<ImportNamespaceSpecifier>;
   isExportDeclared: boolean;
}

export interface DeclaredDefaultExport extends ExportBase {
   type: "declaredDefault";
   path: NodePath<ExportDefaultDeclaration>;
   identifier?: Identifier;
   local?: string;
   declaration:
      | NodePath<ClassDeclaration>
      | NodePath<FunctionDeclaration>
      | NodePath<VariableDeclarator>
      | NodePath<ImportSpecifier>
      | NodePath<ImportDefaultSpecifier>
      | NodePath<ImportNamespaceSpecifier>;
   isExportDeclared: boolean;
}

export interface DeclaredDefaultExpressionExport extends ExportBase {
   type: "declaredDefaultExpression";
   path: NodePath<ExportDefaultDeclaration>;
   declaration: NodePath<Expression>;
   identifier?: Identifier;
}

export interface GroupedExports {
   aggregatedAll: Record<number, AggregatedAllExport>;
   aggregatedName: Record<string, AggregatedNameExport>;
   aggregatedNamespace: Record<string, AggregatedNamespaceExport>;
   declared: Record<string, DeclaredExport>;
   declaredDefault: Record<string, DeclaredDefaultExport>;
   declaredDefaultExpression: Record<string, DeclaredDefaultExpressionExport>;
}

export type ExportInfo =
   | AggregatedAllExport
   | AggregatedNameExport
   | AggregatedNamespaceExport
   | DeclaredExport
   | DeclaredDefaultExport
   | DeclaredDefaultExpressionExport;
