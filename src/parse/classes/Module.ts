import { ScriptModule } from "./ScriptModule";
import { StyleModule } from "./StyleModule";
import { ResourceModule } from "./ResourceModule";
import { Asset } from "src/types";

export type ModuleType = "script" | "style" | "resource";

export class Module {
   public id: string;
   constructor(public type: ModuleType, public asset: Asset) {
      this.id = asset.id;
   }

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