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
      include: ["@vue/compiler-sfc", "sass.js"],
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