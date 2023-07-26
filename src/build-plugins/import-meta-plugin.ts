import { Plugin } from "../types.js";
import { NodePath } from "@babel/traverse";
import {
   stringLiteral,
   MemberExpression,
   Statement,
   isCallExpression,
} from "@babel/types";
import { smart } from "@babel/template";

export default function (): Plugin {
   return {
      name: "import-meta-plugin",
      transform(context) {
         if (context.type != "script") return;
         let test;
         context.traverse({
            MemberExpression(path) {
               const { node } = path;
               if (
                  node.object.type != "MetaProperty" ||
                  node.object.meta.name != "import" ||
                  node.object.property.name != "meta" ||
                  node.property.type != "Identifier"
               ) {
                  return;
               }

               if (node.property.name == "url") {
                  path.replaceWith(
                     stringLiteral(`file://${context.chunk.source}`)
                  );
               }
               test = 3;
               

               // if (
               //    node.property.name == "resolve"
               // ) {
               //    path.replaceWith(smart.ast`require.resolve` as Statement);
               // }
            },
         });

      },
   };
}
