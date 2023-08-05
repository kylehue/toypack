import { Binding, Scope } from "@babel/traverse";
import { camelCase } from "lodash-es";
import { reservedWords } from "./reserved-words";

function removeLeadingNums(str: string) {
   if (!/^[0-9]/.test(str)) return str;
   const split = str.split(/^[0-9]+/);
   return split[split.length - 1];
}

function formatVar(str: string) {
   str = removeLeadingNums(str);
   return /^[\w$]+$/.test(str) ? str : camelCase(str);
}

export class UidGenerator {
   private _idCountMap: Record<string, number> = {};
   private _reservedVars = new Set<string>([...reservedWords]);
   public generate(name = "temp") {
      name = formatVar(name);
      let generated = name || "_";
      this._idCountMap[name] ??= -1;
      if (this._idCountMap[name] >= 0) {
         generated = name + "_" + this._idCountMap[name];
      }
      this._idCountMap[name]++;

      return generated;
   }

   public isConflicted(name: string) {
      return this._reservedVars.has(name);
   }

   public addReservedVars(...vars: string[]) {
      this._reservedVars = new Set([...this._reservedVars, ...vars]);
   }

   public generateBasedOnScope(scope: Scope, name = "temp", binding?: Binding) {
      let generated = formatVar(name);

      const isTaken = () => {
         const _binding = scope.getBinding(generated);
         const hasBinding =
            (!binding && !!_binding && generated !== name) ||
            (!!binding && !!_binding && binding !== _binding);
         const isConflicted = this.isConflicted(generated);
         const isConflictedInOtherScope = !![
            ...(binding?.referencePaths || []),
            ...(binding?.constantViolations || []),
         ].find((x) => x.scope.hasBinding(generated));
         return hasBinding || isConflicted || isConflictedInOtherScope;
      };

      while (isTaken()) {
         generated = this.generate(name);
      }

      this.addReservedVars(generated);

      return generated;
   }

   public reset() {
      this._idCountMap = {};
      this._reservedVars = new Set([...reservedWords]);
   }
}
