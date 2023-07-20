import { NodePath, Scope, TraverseOptions } from "@babel/traverse";
import {
   Node,
   Identifier,
   VariableDeclaration,
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
   isVariableDeclarator,
   isVariableDeclaration,
   isClassDeclaration,
   isFunctionDeclaration,
   isDeclaration,
   isTSDeclareFunction,
   isIdentifier,
   variableDeclaration,
   variableDeclarator,
   identifier,
   exportDefaultDeclaration,
} from "@babel/types";
import { traverse } from "@babel/core";

export function getBindingDeclaration(scope: Scope, name: string) {
   const binding = scope.getBinding(name);
   if (!binding) return;
   const path = binding.path;
   if (
      path.type == "FunctionDeclaration" ||
      path.type == "ClassDeclaration" ||
      path.type == "VariableDeclarator"
   ) {
      return binding.path as
         | NodePath<ClassDeclaration>
         | NodePath<FunctionDeclaration>
         | NodePath<VariableDeclarator>;
   }
}

let uid = 0;
export function extractExports(
   ast: Node,
   traverseFn?: (options: TraverseOptions) => void
) {
   const exports: Record<string, ExportInfo> = {};
   const options: TraverseOptions = {
      ExportAllDeclaration(path) {
         const { node } = path;
         const source = node.source?.value;
         exports[uid++] = {
            id: `$${uid}`,
            type: "aggregatedAll",
            path,
            source,
         };
      },
      ExportNamedDeclaration(path) {
         const { node } = path;
         const { declaration } = node;
         const source = node.source?.value;

         if (source) {
            // Aggregated exports
            for (const specifier of node.specifiers) {
               if (specifier.type == "ExportNamespaceSpecifier") {
                  /**
                   * For namespace exports e.g.
                   * export * as foo from "module.js";
                   */
                  exports[specifier.exported.name] = {
                     id: `$${uid++}`,
                     type: "aggregatedNamespace",
                     specifier,
                     source,
                     path,
                  };
               } else if (specifier.type == "ExportSpecifier") {
                  /**
                   * For named exports e.g.
                   * export { foo, bar as greet } from "module.js";
                   */
                  const { exported } = specifier;
                  const exportedName =
                     exported.type == "Identifier"
                        ? exported.name
                        : exported.value;
                  exports[exportedName] = {
                     id: `$${uid++}`,
                     type: "aggregatedName",
                     specifier,
                     source,
                     path,
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

                  exports[id.name] = {
                     id: `$${uid++}`,
                     type: "declared",
                     path,
                     declaration: declPath,
                     identifier: id,
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
                  const identifier = declaration.id!;
                  const declPath = getBindingDeclaration(
                     path.scope,
                     identifier.name
                  );

                  if (!declPath) {
                     throw new Error(
                        `No declaration found for "${identifier.name}"`
                     );
                  }

                  exports[identifier.name] = {
                     id: `$${uid++}`,
                     type: "declared",
                     path,
                     declaration: declPath,
                     identifier,
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
                     const exportedName =
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

                     exports[exportedName] = {
                        id: `$${uid++}`,
                        type: "declared",
                        path,
                        declaration: declPath,
                        identifier: local,
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
               !isFunctionDeclaration(declPath.node) &&
               !isClassDeclaration(declPath.node)
            ) {
               throw new TypeError("Invalid declaration.");
            }

            exports["default"] = {
               id: `$${uid++}`,
               type: "declaredDefault",
               path,
               declaration: declPath as
                  | NodePath<ClassDeclaration>
                  | NodePath<FunctionDeclaration>,
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

            exports["default"] = {
               id: `$${uid++}`,
               type: "declaredDefault",
               path,
               declaration: declPath,
               identifier: node.declaration,
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

            exports["default"] = {
               id: `$${uid++}`,
               type: "declaredDefaultExpression",
               path,
               declaration: declPath as NodePath<Expression>,
            };
         }
      },
   };

   if (traverseFn) {
      traverseFn(options);
   } else {
      traverse(ast, options);
   }

   return exports;
}

export interface AggregatedNameExport {
   id: string;
   type: "aggregatedName";
   source: string;
   specifier: ExportSpecifier;
   path: NodePath<ExportNamedDeclaration>;
}

export interface AggregatedNamespaceExport {
   id: string;
   type: "aggregatedNamespace";
   source: string;
   specifier: ExportNamespaceSpecifier;
   path: NodePath<ExportNamedDeclaration>;
}

export interface AggregatedAllExport {
   id: string;
   type: "aggregatedAll";
   source: string;
   path: NodePath<ExportAllDeclaration>;
}

export interface DeclaredExport {
   id: string;
   type: "declared";
   identifier: Identifier;
   path: NodePath<ExportNamedDeclaration>;
   declaration:
      | NodePath<ClassDeclaration>
      | NodePath<FunctionDeclaration>
      | NodePath<VariableDeclarator>;
}

export interface DeclaredDefaultExport {
   id: string;
   type: "declaredDefault";
   path: NodePath<ExportDefaultDeclaration>;
   identifier?: Identifier;
   declaration:
      | NodePath<ClassDeclaration>
      | NodePath<FunctionDeclaration>
      | NodePath<VariableDeclarator>;
}

export interface DeclaredDefaultExpressionExport {
   id: string;
   type: "declaredDefaultExpression";
   path: NodePath<ExportDefaultDeclaration>;
   declaration: NodePath<Expression>;
}

export type ExportInfo =
   | AggregatedAllExport
   | AggregatedNameExport
   | AggregatedNamespaceExport
   | DeclaredExport
   | DeclaredDefaultExport
   | DeclaredDefaultExpressionExport;
