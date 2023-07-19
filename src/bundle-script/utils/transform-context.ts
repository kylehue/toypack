import { File, Statement, file, program } from "@babel/types";
import runtime from "../runtime";
type RuntimeName = keyof typeof runtime;

export interface TransformContext {
   addRuntime: (...names: RuntimeName[]) => void;
   unshiftAst: (statement: Statement | Statement[], source?: string) => void;
}

export function createTransformContext() {
   const runtimesUsed = new Set<RuntimeName>();
   const otherAsts: { source: string; ast: File }[] = [];
   const context: TransformContext = {
      addRuntime: (...names: RuntimeName[]) => {
         for (const name of names) {
            runtimesUsed.add(name);
         }
      },
      unshiftAst: (statement: Statement | Statement[], source?: string) => {
         source ??= "";
         const statements = Array.isArray(statement) ? statement : [statement];
         const ast = file(program(statements));
         otherAsts.push({ source, ast });
      },
   };

   return { context, runtimesUsed, otherAsts };
}
