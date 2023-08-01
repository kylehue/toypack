import { isLocal } from "../utils/is-local.js";
import { Plugin } from "../types.js";

/**
 * This plugin simply resolves the paths of the node module imports
 * so that the bundler can recognize them as local files.
 */
export default function (): Plugin {
   return {
      name: "bundle-deps-plugin",
      resolve(id) {
         if (isLocal(id)) return;
         if (this.bundler.config.bundle.mode == "development") return;
         const resolved = this.bundler.resolve(id);
         if (!resolved) return;
         return resolved;
      },
   };
}
