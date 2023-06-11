import { build } from "esbuild";
build({
   entryPoints: ["./src/Toypack.ts"],
   bundle: true,
   sourcemap: true,
   outdir: "./browser",
   format: "iife",
   globalName: "Toypack",
   platform: "browser",
   external: [
      "fs",
      "assert",
      "process",
      "path",
      "@babel/plugin-syntax-unicode-sets-regex",
      "@babel/types",
   ],
   logLevel: "info",
}).catch(() => process.exit());
