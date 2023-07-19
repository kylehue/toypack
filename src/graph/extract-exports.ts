import { NodePath, TraverseOptions } from "@babel/traverse";
import {
   Node,
   Identifier,
   VariableDeclaration,
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

export function getBindingDeclaration(path: NodePath, id: string) {
   const binding = path.scope.getBinding(id);
   if (!binding) return;
   if (
      isVariableDeclarator(binding.path.node) &&
      isVariableDeclaration(binding.path.parent)
   ) {
      return binding.path.parent;
   } else if (
      isClassDeclaration(binding.path.node) ||
      isFunctionDeclaration(binding.path.node)
   ) {
      return binding.path.node;
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
               ids.forEach(id => {
                  exports[id.name] = {
                     id: `$${uid++}`,
                     type: "declared",
                     path,
                     declaration,
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
                  exports[identifier.name] = {
                     id: `$${uid++}`,
                     type: "declared",
                     path,
                     declaration,
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
                     const declaration = getBindingDeclaration(
                        path,
                        local.name
                     );
                     if (!declaration) continue;
                     exports[exportedName] = {
                        id: `$${uid++}`,
                        type: "declared",
                        path,
                        declaration,
                        identifier: local,
                     };
                  }
               }
            }
         }
      },
      ExportDefaultDeclaration(path) {
         const { node } = path;
         if (isDeclaration(node.declaration)) {
            /**
             * For default-declared exports e.g.
             * export default function() {}
             * export default class {}
             */
            const { declaration } = node;
            if (isTSDeclareFunction(declaration)) return;
            if (!declaration.id) {
               declaration.id = identifier(path.scope.generateUid("default"));
            }

            exports["default"] = {
               id: `$${uid++}`,
               type: "declaredDefault",
               path,
               declaration,
               identifier: declaration.id,
            };
         } else if (isIdentifier(node.declaration)) {
            /**
             * For default exports declared above e.g.
             * const foo = "foo";
             * export default foo;
             */
            const name = node.declaration.name;
            const declaration = getBindingDeclaration(path, name);
            if (!declaration) return;
            exports["default"] = {
               id: `$${uid++}`,
               type: "declaredDefault",
               path,
               declaration,
               identifier: node.declaration,
            };
         } else if (isExpression(node.declaration)) {
            /**
             * For default expression exports e.g.
             * export default {};
             * export default 200;
             * export default "Hello";
             */

            /**
             * Transform it so that it can have an identifier e.g.
             *
             * input:
             * export default {};
             *
             * output:
             * const id = {};
             * export default id;
             */
            const newIdentifier = identifier(path.scope.generateUid("default"));
            const [newDeclaration] = path.insertBefore(
               variableDeclaration("const", [
                  variableDeclarator(newIdentifier, node.declaration),
               ])
            );

            path.replaceWith(exportDefaultDeclaration(newIdentifier));
            path.scope.registerDeclaration(newDeclaration);

            exports["default"] = {
               id: `$${uid++}`,
               type: "declaredDefault",
               path,
               declaration: newDeclaration.node,
               identifier: newIdentifier,
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
   declaration: VariableDeclaration | ClassDeclaration | FunctionDeclaration;
}

export interface DeclaredDefaultExport {
   id: string;
   type: "declaredDefault";
   path: NodePath<ExportDefaultDeclaration>;
   identifier: Identifier;
   declaration: VariableDeclaration | ClassDeclaration | FunctionDeclaration;
}

export type ExportInfo =
   | AggregatedAllExport
   | AggregatedNameExport
   | AggregatedNamespaceExport
   | DeclaredExport
   | DeclaredDefaultExport;
