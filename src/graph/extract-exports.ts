import { NodePath, TraverseOptions } from "@babel/traverse";
import * as t from "@babel/types";
import { traverse } from "@babel/core";


export function getBindingDeclaration(path: NodePath, id: string) {
   const binding = path.scope.getBinding(id);
   if (!binding) return;
   if (
      t.isVariableDeclarator(binding.path.node) &&
      t.isVariableDeclaration(binding.path.parent)
   ) {
      return binding.path.parent;
   } else if (
      t.isClassDeclaration(binding.path.node) ||
      t.isFunctionDeclaration(binding.path.node)
   ) {
      return binding.path.node;
   }
}

// function getVariableDeclarator() {
// for (const declarator of declaration.declarations) {
//    const { id } = declarator;
//    if (id.type == "Identifier") {
//       /**
//        * For variable exports e.g.
//        * export var foo = "foo", bar = "bar";
//        */
//       exports[id.name] = {
//          type: "declared",
//          name: id.name,
//          path,
//          declaration,
//       };
//    } else if (id.type == "ObjectPattern") {
//       /**
//        * For destructured object exports e.g.
//        * export var { foo, bar } = object;
//        */
//       for (const prop of id.properties) {
//          if (prop.type != "ObjectProperty") continue;
//          if (prop.value.type != "Identifier") continue;
//          let name = prop.value.name;
//          exports[name] = {
//             type: "declared",
//             name,
//             path,
//             declaration,
//          };
//       }
//    } else if (id.type == "ArrayPattern") {
//       /**
//        * For destructured array exports e.g.
//        * export var [ foo, bar ] = array;
//        */
//       for (const el of id.elements) {
//          if (el?.type != "Identifier") continue;
//          exports[el.name] = {
//             type: "declared",
//             name: el.name,
//             path,
//             declaration,
//          };
//       }
//    }
// }
// }

export function extractExports(
   ast: t.Node,
   traverseFn?: (options: TraverseOptions) => void
) {
   const exports: Record<string, ExportInfo> = {};
   let id = 0;
   const options: TraverseOptions = {
      ExportAllDeclaration(path) {
         const { node } = path;
         const source = node.source?.value;
         exports[id++] = {
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
                     type: "aggregatedName",
                     specifier,
                     source,
                     path,
                  };
               }
            }
         } else {
            // Declared exports
            if (t.isVariableDeclaration(declaration)) {
               for (const declarator of declaration.declarations) {
                  const { id } = declarator;
                  if (id.type == "Identifier") {
                     /**
                      * For variable exports e.g.
                      * export var foo = "foo", bar = "bar";
                      */
                     exports[id.name] = {
                        type: "declared",
                        identifier: id,
                        path,
                        declaration,
                     };
                  } else if (id.type == "ObjectPattern") {
                     /**
                      * For destructured object exports e.g.
                      * export var { foo, bar } = object;
                      */
                     for (const prop of id.properties) {
                        if (prop.type != "ObjectProperty") continue;
                        if (prop.value.type != "Identifier") continue;
                        exports[prop.value.name] = {
                           type: "declared",
                           path,
                           declaration,
                           identifier: prop.value,
                        };
                     }
                  } else if (id.type == "ArrayPattern") {
                     /**
                      * For destructured array exports e.g.
                      * export var [ foo, bar ] = array;
                      */
                     for (const el of id.elements) {
                        if (el?.type != "Identifier") continue;
                        exports[el.name] = {
                           type: "declared",
                           path,
                           declaration,
                           identifier: el,
                        };
                     }
                  }
               }
            } else {
               if (
                  t.isFunctionDeclaration(declaration) ||
                  t.isClassDeclaration(declaration)
               ) {
                  /**
                   * For declared class/function exports e.g.
                   * export function functionName() {}
                   */
                  // declaration.id should be guaranteed here
                  const identifier = declaration.id!;
                  exports[identifier.name] = {
                     type: "declared",
                     path,
                     declaration,
                     identifier
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
                        type: "declared",
                        path,
                        declaration,
                        identifier: local
                     };
                  }
               }
            }
         }
      },
      ExportDefaultDeclaration(path) {
         const { node } = path;
         if (t.isDeclaration(node.declaration)) {
            /**
             * For default-declared exports e.g.
             * export default function() {}
             * export default class {}
             */
            const { declaration } = node;
            if (t.isTSDeclareFunction(declaration)) return;
            exports["default"] = {
               type: "declaredDefault",
               path,
               declaration,
            };
         } else if (t.isIdentifier(node.declaration)) {
            /**
             * For default exports declared above e.g.
             * const foo = "foo";
             * export default foo;
             */
            const name = node.declaration.name;
            const declaration = getBindingDeclaration(path, name);
            if (!declaration) return;
            exports["default"] = {
               type: "declaredDefault",
               path,
               declaration,
            };
         } else if (t.isExpression(node.declaration)) {
            /**
             * For default expression exports e.g.
             * export default {};
             * export default 200;
             * export default "Hello";
             */
            const { declaration } = node;
            exports["default"] = {
               type: "declaredDefaultExpression",
               path,
               declaration,
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
   type: "aggregatedName";
   source: string;
   specifier: t.ExportSpecifier;
   path: NodePath<t.ExportNamedDeclaration>;
}

export interface AggregatedNamespaceExport {
   type: "aggregatedNamespace";
   source: string;
   specifier: t.ExportNamespaceSpecifier;
   path: NodePath<t.ExportNamedDeclaration>;
}

export interface AggregatedAllExport {
   type: "aggregatedAll";
   source: string;
   path: NodePath<t.ExportAllDeclaration>;
}

export interface DeclaredExport {
   type: "declared";
   identifier: t.Identifier;
   path: NodePath<t.ExportNamedDeclaration>;
   declaration:
      | t.VariableDeclaration
      | t.ClassDeclaration
      | t.FunctionDeclaration;
}

export interface DeclaredDefaultExport {
   type: "declaredDefault";
   path: NodePath<t.ExportDefaultDeclaration>;
   declaration:
      | t.VariableDeclaration
      | t.ClassDeclaration
      | t.FunctionDeclaration;
}

export interface DeclaredDefaultExpressionExport {
   type: "declaredDefaultExpression";
   path: NodePath<t.ExportDefaultDeclaration>;
   declaration: t.Expression;
}

export type ExportInfo =
   | AggregatedAllExport
   | AggregatedNameExport
   | AggregatedNamespaceExport
   | DeclaredExport
   | DeclaredDefaultExport
   | DeclaredDefaultExpressionExport;