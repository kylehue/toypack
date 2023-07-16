import { NodePath } from "@babel/traverse";
import * as t from "@babel/types";

export function getVarKind(decl: NodePath<t.Node> | null) {
   if (!decl) return "var";
   if (!t.isVariableDeclaration(decl.node)) return "var";
   const kind =
      decl.node.kind != "await using" && decl.node.kind != "using"
         ? decl.node.kind
         : "var";

   return kind;
}
