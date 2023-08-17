import { HTMLPluginOptions } from "./html-plugin";

export interface BuiltInPluginsConfig {
   /**
    * If in production mode, it will auto-install packages, and if in
    * development mode, it will auto-add import-maps.
    */
   autoDeps?: boolean;
   /**
    * Plugin for parsing and compiling html files.
    */
   html?: boolean | HTMLPluginOptions;
   /**
    * This plugin simply resolves the paths of the `/node_modules` imports
    * so that the bundler can recognize them as local files, which will
    * cause them to be included in the bundle. For optimization purposes,
    * this will only work in production mode.
    */
   bundleDeps?: boolean;
   /**
    * Plugin for transforming `import.meta.url` and `import.meta.resolve()`.
    */
   importMeta?: boolean;
   /**
    * The job of this plugin is to fetch all url imports. Disabling this will
    * also disable the urls in `link` or `script` tags in html files.
    */
   importUrl?: boolean;
   /**
    * Plugin used to import and read JSON files.
    */
   json?: boolean;
   /**
    * Plugin to import `.txt` files.
    * 
    * It also allows you to import modules as text by adding the `raw`
    * query in the module requests e.g.
    * ```js
    * import text from "./module.js?raw";
    * console.log(text);
    * ```
    */
   raw?: boolean;
}
