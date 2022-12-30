import traverseAST, { Node } from "@babel/traverse";

interface ImportNode {
	id: string;
	start: number;
	end: number;
	specifiers: string[];
}

export default function getModuleImports(AST: Node | Node[]) {
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
	// Specifiers are needed for babel loader so that we can check if specific specifiers are already imported. It will be used to auto import react pragmas
	traverseAST(AST, {
		ImportDeclaration({ node }) {
			let specifiers: string[] = [];
			if (node.specifiers) {
				for (let spec of node.specifiers) {
					specifiers.push(spec.local.name);
				}
			}

			addImported(
				node.source.value,
				node.source.start,
				node.source.end,
				specifiers
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
		CallExpression(dir) {
			let argNode = dir.node.arguments[0];
			let callee = dir.node.callee;
			if (
				callee.type === "Identifier" &&
				callee.name == "require" &&
				argNode.type == "StringLiteral"
			) {
				let specifiers: string[] = [];
				let parent = dir.parent;
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
				}

				addImported(argNode.value, argNode.start, argNode.end, specifiers);
			}
		},
	});

	return imports;
}
