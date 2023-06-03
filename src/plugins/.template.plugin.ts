import { IPlugin, Toypack } from "../Toypack.js";

export class TemplatePlugin implements IPlugin {
   public name = "TemplatePlugin";

   apply(bundler: Toypack) {}
}
