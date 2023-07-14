import { NodePath, TraverseOptions } from "@babel/traverse";
import * as t from "@babel/types";
import generate from "@babel/generator";
import { traverse } from "@babel/core";

function astToString(ast: t.Node) {
   return generate(ast, {
      comments: false,
   })?.code;
}

(window as any).astToString = astToString;

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

export function extractExports(
   ast: t.Node,
   traverseFn?: (options: TraverseOptions) => void
) {
   const exports: Record<string, Export> = {};
   const options: TraverseOptions = {
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
                  const { exported } = specifier;
                  exports[exported.name] = {
                     type: "aggregatedNamespace",
                     name: exported.name,
                     imported: exported.name,
                     source,
                     path,
                  };
               } else if (specifier.type == "ExportSpecifier") {
                  /**
                   * For named exports e.g.
                   * export { foo, bar as greet } from "module.js";
                   */
                  const { exported, local } = specifier;
                  const exportedName =
                     exported.type == "Identifier"
                        ? exported.name
                        : exported.value;
                  exports[exportedName] = {
                     type: "aggregatedName",
                     name: exportedName,
                     imported: local.name,
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
                        name: id.name,
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
                        let name = prop.value.name;
                        exports[name] = {
                           type: "declared",
                           name,
                           path,
                           declaration,
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
                           name: el.name,
                           path,
                           declaration,
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
                  const name = declaration.id!.name;
                  exports[name] = {
                     type: "declared",
                     name,
                     path,
                     declaration,
                  };
               } else {
                  for (const specifier of node.specifiers) {
                     if (specifier.type != "ExportSpecifier") continue;
                     /**
                      * For hoisted exports e.g.
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
                        name: exportedName,
                        path,
                        declaration,
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
               name: "default",
               path,
               declaration,
            };
         } else if (t.isIdentifier(node.declaration)) {
            /**
             * For default hoisted exports e.g.
             * const foo = "foo";
             * export default foo;
             */
            const name = node.declaration.name;
            const declaration = getBindingDeclaration(path, name);
            if (!declaration) return;
            exports["default"] = {
               type: "declaredDefault",
               name: "default",
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
               name: "default",
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

interface ExportBase {
   name: string;
   path: NodePath;
}

interface AggregatedExport extends ExportBase {
   type: "aggregatedName" | "aggregatedNamespace";
   source: string;
   imported: string;
   path: NodePath<t.ExportNamedDeclaration>;
}

interface DeclaredExport extends ExportBase {
   type: "declared";
   path: NodePath<t.ExportNamedDeclaration>;
   declaration:
      | t.VariableDeclaration
      | t.ClassDeclaration
      | t.FunctionDeclaration;
}

interface DeclaredDefaultExport extends ExportBase {
   type: "declaredDefault";
   path: NodePath<t.ExportDefaultDeclaration>;
   declaration:
      | t.VariableDeclaration
      | t.ClassDeclaration
      | t.FunctionDeclaration;
}

interface DeclaredDefaultExpressionExport extends ExportBase {
   type: "declaredDefaultExpression";
   path: NodePath<t.ExportDefaultDeclaration>;
   declaration: t.Expression;
}

export type Export =
   | AggregatedExport
   | DeclaredExport
   | DeclaredDefaultExport
   | DeclaredDefaultExpressionExport;
