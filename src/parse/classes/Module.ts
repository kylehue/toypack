import { ScriptModule } from "./ScriptModule";
import { StyleModule } from "./StyleModule";
import { ResourceModule } from "./ResourceModule";

export type ModuleType = "script" | "style" | "resource";

export class Module {
   constructor(public type: ModuleType) {}

   isScript(): this is ScriptModule {
      return this.type == "script";
   }

   isStyle(): this is StyleModule {
      return this.type == "style";
   }

   isResource(): this is ResourceModule {
      return this.type == "resource";
   }
}