import { Binding, Scope } from "@babel/traverse";
import { camelCase } from "lodash-es";

export class UidGenerator {
   private _idCountMap: Record<string, number> = {};
   private _reservedVars = new Set<string>();
   private generate(name = "temp") {
      name = camelCase(name);
      let generated = name;
      this._idCountMap[generated] ??= 0;
      if (this._idCountMap[generated] >= 0) {
         generated = name + "_" + this._idCountMap[generated]++;
      }

      return generated;
   }

   public isConflicted(name: string) {
      return this._reservedVars.has(name);
   }

   public addReservedVars(...vars: string[]) {
      this._reservedVars = new Set([...this._reservedVars, ...vars]);
   }

   public generateBasedOnScope(scope: Scope, name?: string, binding?: Binding) {
      let generated = this.generate(name);

      const isTaken = () =>
         scope.hasBinding(generated) ||
         this.isConflicted(generated) ||
         !!binding?.referencePaths.find((x) => x.scope.hasBinding(generated));
      
      while (isTaken()) {
         generated = this.generate(name);
      }

      this._reservedVars.add(generated);

      return generated;
   }

   public reset() {
      this._idCountMap = {};
      this._reservedVars = new Set();
   }
}
