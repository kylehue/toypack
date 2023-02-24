import traverseAST, { Node, TraverseOptions, VisitNode } from "@babel/traverse";

export interface ImportNode {
   id: string;
   start: number;
   end: number;
   specifiers: string[];
}

export interface Options {
   traverse?: Omit<
      TraverseOptions,
      | "ImportDeclaration"
      | "ExportAllDeclaration"
      | "ExportNamedDeclaration"
      | "CallExpression"
   >;
}

function traverseArrayAST(AST, traverseOptions) {
   for (let node of AST) {
      if (node.type in traverseOptions) {
         traverseOptions[node.type]({node});
      }
   }
}

export default function getModuleImports(
   AST: Node | Node[],
   options?: Options
) {
   let imports: ImportNode[] = [];

   function addImported(id: string, start, end, specifiers: string[] = []) {
      imports.push({
         id,
         start,
         end,
         specifiers,
      } as ImportNode);
   }

   // Ids are needed for dependency graphs
   // Start and end positions are needed for changing the imported ids to fixed paths so that they can properly be resolved when graphing
   let traverseOptions: TraverseOptions = {
      ...options?.traverse,
      ImportDeclaration({ node }) {
         /* let specifiers: string[] = [];
			if (node.specifiers) {
				for (let spec of node.specifiers) {
					specifiers.push(spec.local.name);
				}
			} */

         addImported(
            node.source.value,
            node.source.start,
            node.source.end
            /*, specifiers */
         );
      },
      ExportAllDeclaration({ node }) {
         addImported(node.source.value, node.source.start, node.source.end);
      },
      ExportNamedDeclaration({ node }) {
         if (node.source) {
            addImported(node.source.value, node.source.start, node.source.end);
         }
      },
      // For CJS require() and dynamic imports
      CallExpression(dir) {
         let argNode = dir.node.arguments[0];
         let callee = dir.node.callee;
         if (
            ((callee.type == "Identifier" && callee.name == "require") ||
               callee.type == "Import") &&
            argNode.type == "StringLiteral"
         ) {
            let parent = dir.parent;

            // Extract specifiers
            /* let specifiers: string[] = [];
				if (parent.type == "VariableDeclarator") {
					if (parent.id.type == "Identifier") {
						specifiers.push(parent.id.name);
					}

					// For destructured identifiers
					if (parent.id.type == "ObjectPattern") {
						for (let prop of parent.id.properties) {
							if (
								prop.type == "ObjectProperty" &&
								prop.value.type == "Identifier"
							) {
								specifiers.push(prop.value.name);
							}
						}
					}
				} */

            addImported(
               argNode.value,
               argNode.start,
               argNode.end /* , specifiers */
            );
         }
      },
   };

   if (Array.isArray(AST)) {
      traverseArrayAST(AST, traverseOptions);
   } else {
      traverseAST(AST, traverseOptions);
   }

   return imports;
}