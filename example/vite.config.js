import { defineConfig } from "vite";
import path from "path";
import { NodeGlobalsPolyfillPlugin } from "@esbuild-plugins/node-globals-polyfill";

export default defineConfig({
   resolve: {
      alias: {
         path: "path-browserify",
         "@test": path.resolve(__dirname, "./src-test"),
      },
   },
   optimizeDeps: {
      esbuildOptions: {
         define: {
            global: "globalThis",
         },
         plugins: [
            NodeGlobalsPolyfillPlugin({
               buffer: true,
            }),
         ],
      },
      include: ["@vue/compiler-sfc"],
   },
});