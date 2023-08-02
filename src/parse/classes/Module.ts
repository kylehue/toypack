import { ScriptModule } from "./ScriptModule";
import { StyleModule } from "./StyleModule";
import { ResourceModule } from "./ResourceModule";

export type ModuleType = "script" | "style" | "resource";

export class Module {
   constructor(public type: ModuleType) {}

   isScriptModule(): this is ScriptModule {
      return this.type == "script";
   }

   isStyleModule(): this is StyleModule {
      return this.type == "style";
   }

   isResourceModule(): this is ResourceModule {
      return this.type == "resource";
   }
}