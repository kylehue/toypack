import path from "path-browserify";
import { isLocal, isUrl, getUsableResourcePath } from "../utils";
import { ModuleTransformer } from "../utils/module-transformer";
import type { StyleModule, Toypack } from "src/types";

export function transformUrl(
   this: Toypack,
   moduleTransformer: ModuleTransformer<StyleModule>
) {
   const { module } = moduleTransformer;
   for (const node of module.urlNodes) {
      const start = node.loc!.start.offset;
      const end = node.loc!.end.offset;
      /**
       * We have to convert the path to relative path if
       * it doesn't begin with `./`, `../`, or `/` because
       * url() in css are always relative.
       * https://developer.mozilla.org/en-US/docs/Web/CSS/url
       */
      if (!isLocal(node.value) && !isUrl(node.value)) {
         moduleTransformer.insertAt(start, "./");
      }

      // Change to usable source
      const resourceUseableSource = getUsableResourcePath(
         this,
         node.value,
         path.dirname(module.source)
      );

      if (resourceUseableSource) {
         moduleTransformer.update(start, end, `url(${resourceUseableSource});`);
      }
   }
}
