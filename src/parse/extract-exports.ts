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
   importDeclaration,
   importNamespaceSpecifier,
   exportNamedDeclaration,
   exportSpecifier,
   stringLiteral,
   cloneNode,
   ImportSpecifier,
   ImportDefaultSpecifier,
   ImportNamespaceSpecifier,
} from "@babel/types";
import traverse from "@babel/traverse";

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
export function extractExports(
   ast: Node,
   traverseFn?: (options: TraverseOptions) => void
) {
   const exports: Exports = {
      aggregatedAll: [],
      others: {},
   };
   const options: TraverseOptions = {
      ExportAllDeclaration(path) {
         const { node } = path;
         const source = node.source?.value;
         exports.aggregatedAll.push({
            id: `$${uid++}`,
            type: "aggregatedAll",
            path,
            source,
         });
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
                  exports.others[name] = {
                     id: `$${uid++}`,
                     type: "aggregatedNamespace",
                     specifier,
                     source,
                     path,
                     name,
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
                  exports.others[name] = {
                     id: `$${uid++}`,
                     type: "aggregatedName",
                     specifier,
                     source,
                     path,
                     name,
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
                  exports.others[id.name] = {
                     id: `$${uid++}`,
                     type: "declared",
                     path,
                     declaration: declPath,
                     identifier: id,
                     name,
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
                  exports.others[id.name] = {
                     id: `$${uid++}`,
                     type: "declared",
                     path,
                     declaration: declPath,
                     identifier: id,
                     name,
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

                     exports.others[name] = {
                        id: `$${uid++}`,
                        type: "declared",
                        path,
                        declaration: declPath,
                        identifier: local,
                        name,
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

            exports.others["default"] = {
               id: `$${uid++}`,
               type: "declaredDefault",
               path,
               declaration: declPath,
               name: "default",
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

            exports.others["default"] = {
               id: `$${uid++}`,
               type: "declaredDefault",
               path,
               declaration: declPath,
               identifier: node.declaration,
               name: "default",
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

            exports.others["default"] = {
               id: `$${uid++}`,
               type: "declaredDefaultExpression",
               path,
               declaration: declPath as NodePath<Expression>,
               name: "default",
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

interface ExportBase {
   id: string;
   name: string;
}

export interface AggregatedNameExport extends ExportBase {
   type: "aggregatedName";
   source: string;
   specifier: ExportSpecifier;
   path: NodePath<ExportNamedDeclaration>;
}

export interface AggregatedNamespaceExport extends ExportBase {
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

export interface DeclaredExport extends ExportBase {
   type: "declared";
   identifier: Identifier;
   path: NodePath<ExportNamedDeclaration>;
   declaration:
      | NodePath<ClassDeclaration>
      | NodePath<FunctionDeclaration>
      | NodePath<VariableDeclarator>
      | NodePath<ImportSpecifier>
      | NodePath<ImportDefaultSpecifier>
      | NodePath<ImportNamespaceSpecifier>;
}

export interface DeclaredDefaultExport extends ExportBase {
   type: "declaredDefault";
   path: NodePath<ExportDefaultDeclaration>;
   identifier?: Identifier;
   declaration:
      | NodePath<ClassDeclaration>
      | NodePath<FunctionDeclaration>
      | NodePath<VariableDeclarator>
      | NodePath<ImportSpecifier>
      | NodePath<ImportDefaultSpecifier>
      | NodePath<ImportNamespaceSpecifier>;
}

export interface DeclaredDefaultExpressionExport extends ExportBase {
   type: "declaredDefaultExpression";
   path: NodePath<ExportDefaultDeclaration>;
   declaration: NodePath<Expression>;
   identifier?: Identifier;
}

export interface Exports {
   aggregatedAll: AggregatedAllExport[];
   others: Record<
      string,
      | AggregatedNameExport
      | AggregatedNamespaceExport
      | DeclaredExport
      | DeclaredDefaultExport
      | DeclaredDefaultExpressionExport
   >;
}

export type ExportInfo =
   | AggregatedAllExport
   | AggregatedNameExport
   | AggregatedNamespaceExport
   | DeclaredExport
   | DeclaredDefaultExport
   | DeclaredDefaultExpressionExport;
