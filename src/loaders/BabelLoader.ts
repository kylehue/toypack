// import { Loader, Toypack } from "src/Toypack.js";
// import { IDependency } from "src/graph.js";
// import { parse as getAST, ParserOptions } from "@babel/parser";
// import traverseAST, { TraverseOptions, Node } from "@babel/traverse";
// import {
//    transformFromAst,
//    transform,
//    availablePlugins,
//    availablePresets,
// } from "@babel/standalone";

// console.log(availablePlugins, availablePresets);

// export class BabelLoader implements Loader {
//    public name = "BabelLoader";
//    public test: RegExp = /\.([jt]sx?|[cm]js)$/;

//    constructor(public bundler: Toypack) {
//       bundler.extensions.application.push(
//          ...[".js", ".mjs", ".cjs", ".jsx", ".ts", ".tsx"]
//       );
//    }

//    public parse(dep: IDependency) {
//       const result = {
//          dependencies: [] as string[]
//       };

//       if (typeof dep.asset.content != "string") {
//          console.error("BabelLoader only supports string content");
//          // TODO: trigger "BabelLoader only supports string content" error
//          return result;
//       }

//       const format = this.bundler.options.bundleOptions.format;

//       const AST = getAST(dep.asset.content, {
//          sourceType: format == "esm" ? "module" : "script",
//          sourceFilename: dep.asset.source,
//       });

//       dep.asset.metadata.set("AST", AST);

//       if (format == "esm") {
//          traverseAST(AST, {
//             ImportDeclaration({ node }) {
//                result.dependencies.push(node.source.value);
//             },
//             ExportAllDeclaration({ node }) {
//                result.dependencies.push(node.source.value);
//             },
//             ExportNamedDeclaration({ node }) {
//                if (node.source) {
//                   result.dependencies.push(node.source.value);
//                }
//             },
//          });
//       } else {
//          traverseAST(AST, {
//             CallExpression(dir) {
//                let argNode = dir.node.arguments[0];
//                let callee = dir.node.callee;
//                if (
//                   ((callee.type == "Identifier" && callee.name == "require") ||
//                      callee.type == "Import") &&
//                   argNode.type == "StringLiteral"
//                ) {
//                   result.dependencies.push(argNode.value);
//                }
//             },
//          });
//       }

//       return result;
//    }

//    public compile(dep: IDependency) {
//       const result = {
//          content: "",
//       };

//       if (typeof dep.asset.content != "string") {
//          console.error("BabelLoader only supports string content");
//          // TODO: trigger "BabelLoader only supports string content" error
//          return result;
//       }

//       const AST = dep.asset.metadata.get("AST");

//       if (!AST) {
//          console.error("failed to get asset AST: " + dep.asset.source);
//          // TODO: trigger "failed to get AST" error
//          return result;
//       }

//       const transformOptions = {
//          sourceType: "module",
//          compact: false,
//          comments: false,
//          presets: ["es2017"],
//          plugins: [
//             [
//                "transform-runtime",
//                {
                  

//                },
//             ],
//          ],
//          sourceFileName: dep.asset.source,
//          filename: dep.asset.source,
//          sourceMaps: this.bundler.options.bundleOptions.sourceMap,
//          envName: this.bundler.options.bundleOptions.mode,
//       };

//       traverseAST(AST, {
//          ImportDeclaration(_path) {
//             //_path.remove();
//          },
//          ExportAllDeclaration({ node }) {
//             //_path
//          },
//          ExportNamedDeclaration({ node }) {
            
//          },
//          CallExpression(dir) {
//             /* let argNode = dir.node.arguments[0];
//             let callee = dir.node.callee;
//             if (
//                ((callee.type == "Identifier" && callee.name == "require") ||
//                   callee.type == "Import") &&
//                argNode.type == "StringLiteral"
//             ) {
//                result.dependencies.push(argNode.value);
//             } */
//          },
//       });

//       // const transpiled: any = transformFromAst(
//       //    AST,
//       //    undefined,
//       //    transformOptions
//       // );
      
//       // console.log(transpiled.code);
      

//       return result;
//    }
// }
