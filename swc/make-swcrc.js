import fs from "fs";
import { merge } from "lodash-es";
import common from "./swc-common.json" assert { type: "json" };
import dev from "./swc-dev.json" assert { type: "json" };
import prod from "./swc-prod.json" assert { type: "json" };
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

let fullConfig;
if (process.env.NODE_ENV == "production") {
   fullConfig = merge(common, prod);
} else {
   fullConfig = merge(common, dev);
}

fs.writeFileSync(resolve(__dirname, "./.swcrc"), JSON.stringify(fullConfig), {
   encoding: "utf-8",
});
