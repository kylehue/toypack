import { defineConfig } from "vite";
import path from "path";
import { nodePolyfills } from "vite-plugin-node-polyfills";
export default defineConfig({
   resolve: {
      alias: {
         "@test": path.resolve(__dirname, "./src-test"),
      },
   },
   optimizeDeps: {
      esbuildOptions: {
         define: {
            global: "globalThis",
         },
      },
      include: [
         "@vue/compiler-sfc",
         "sass.js",
         `monaco-editor/esm/vs/language/json/json.worker`,
         `monaco-editor/esm/vs/language/css/css.worker`,
         `monaco-editor/esm/vs/language/html/html.worker`,
         `monaco-editor/esm/vs/language/typescript/ts.worker`,
         `monaco-editor/esm/vs/editor/editor.worker`,
      ],
   },
   plugins: [
      nodePolyfills({
         globals: {
            Buffer: true, // can also be 'build', 'dev', or false
            global: true,
            process: true,
         },
      }),
   ],
});