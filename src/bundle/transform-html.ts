import {
   parse,
   Node,
   HTMLElement,
   NodeType,
   Options,
   TextNode,
   CommentNode,
} from "node-html-parser";
import { camelCase } from "lodash-es";
import type { PascalCase } from "type-fest";
import type { Toypack } from "src/types";

const keys = {
   comment: "Comment",
   text: "Text",
   element: "Element",
} as const;

function createContext<T extends Node>(
   node: T,
   _opts = {
      onStop: () => {},
      onSkip: () => {},
   }
) {
   return {
      node,
      traverse: (opts: TraverseHtmlOptions) => {
         traverse(node, opts);
      },
      skip: () => _opts.onSkip(),
      stop: () => _opts.onStop(),
      parse: (data: string, options?: Options) => parse(data, options),
   };
}

type TraverseContext<T extends Node> = ReturnType<typeof createContext<T>>;
type TraverseBaseOption<T extends Node, U extends keyof typeof keys> = {
   [key in (typeof keys)[U]]?: (this: TraverseContext<T>, node: T) => void;
};

export type TraverseHtmlOptions =
   | {
        [key in `${PascalCase<string>}${(typeof keys)["element"]}`]?: (
           this: TraverseContext<HTMLElement>,
           node: HTMLElement
        ) => void;
     }
   | TraverseBaseOption<CommentNode, "comment">
   | TraverseBaseOption<TextNode, "text">
   | TraverseBaseOption<HTMLElement, "element">;

function toPascalCase<T extends string>(str: T) {
   const camelCased = camelCase(str);
   if (!camelCased.length) return "";
   const pascalCased = camelCased[0].toUpperCase() + camelCased.slice(1);
   return pascalCased as PascalCase<T>;
}

function getTraverseOptionTagKey<T extends string>(tagName: T) {
   return `${toPascalCase(tagName)}Element` as `${PascalCase<T>}Element`;
}

function getTraverseOption<T extends (typeof keys)[keyof typeof keys] | string>(
   options: TraverseHtmlOptions,
   key: T
): ((node: Node | CommentNode) => void) | undefined {
   const opts = options as any;
   if (key === keys.comment) {
      return opts[keys.comment];
   } else if (key === keys.text) {
      return opts[keys.text];
   } else if (key === keys.element) {
      return opts[keys.element];
   } else {
      return opts[getTraverseOptionTagKey(key)];
   }
}

export function isElementNode(ast: Node): ast is HTMLElement {
   return ast.nodeType === NodeType.ELEMENT_NODE;
}

export function isTextNode(ast: Node): ast is HTMLElement {
   return ast.nodeType === NodeType.TEXT_NODE;
}

export function isCommentNode(ast: Node): ast is HTMLElement {
   return ast.nodeType === NodeType.COMMENT_NODE;
}

export function traverse(ast: Node, options: TraverseHtmlOptions) {
   let doStop = false;
   const recurse = (ast: Node) => {
      if (!ast) return;
      if (doStop) return;

      let doSkip = false;
      const context = createContext(ast, {
         onSkip: () => {
            doSkip = true;
         },
         onStop: () => {
            doStop = true;
         },
      });

      if (isElementNode(ast)) {
         const tagSpecificTrigger = getTraverseOption(options, ast.tagName);
         const generalTrigger = getTraverseOption(options, keys.element);
         tagSpecificTrigger?.call(context, ast);
         generalTrigger?.call(context, ast);
      } else if (isTextNode(ast)) {
         const trigger = getTraverseOption(options, keys.text);
         trigger?.call(context, ast);
      } else if (isCommentNode(ast)) {
         const trigger = getTraverseOption(options, keys.comment);
         trigger?.call(context, ast);
      }

      if (doSkip) return;
      for (let node of ast.childNodes) {
         if (doStop) break;
         recurse(node);
      }
   };

   recurse(ast);
}

export async function transformHtml(
   this: Toypack,
   html: string,
   indexScriptUrl: string,
   indexStyleUrl: string
) {
   const parsed = parse(html, {
      comment: true,
   });

   await this._pluginManager.triggerHook({
      name: "transformHtml",
      args: () => [parsed.toString(), indexScriptUrl, indexStyleUrl],
      callback(result) {
         traverse(parsed, result);
      },
   });

   const transformed = parsed.toString();

   return transformed;
}
