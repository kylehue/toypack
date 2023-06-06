import { build } from "esbuild";
build({
   entryPoints: ["./src/Toypack.ts"],
   bundle: true,
   sourcemap: true,
   outdir: "./browser",
   format: "esm",
   globalName: "Toypack",
   platform: "browser",
   external: [
      "fs",
      "assert",
      "path",
      "@babel/plugin-syntax-unicode-sets-regex",
   ],
   logLevel: "info"
}).catch(() => process.exit());
