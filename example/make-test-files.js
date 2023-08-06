import fs from "fs";
import path from "path";
import chokidar from "chokidar";
import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const resourceExtensions = [".gif", ".png", ".jpg", ".jpeg", ".mp4"];

const outputPath = "./src/generated/test-files.ts";
const outputPathDir = path.dirname(outputPath);
const targetPath = path.resolve(__dirname, "./test-files");

function getContent(fullPath) {
   const extname = path.extname(fullPath);
   if (resourceExtensions.includes(extname)) {
      return `await (await fetch(new URL("${fullPath}", import.meta.url).href)).blob()`;
   } else {
      return `(await import("${fullPath}?raw")).default`;
   }
}

function normalizePath(str) {
   return str.split(path.sep).join("/");
}

function getFilesInDir(dir, map = {}) {
   const entries = fs.readdirSync(dir, { withFileTypes: true });

   for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
         getFilesInDir(fullPath, map);
      } else if (entry.isFile()) {
         const relativePath = normalizePath(
            path.relative(path.join(process.cwd(), outputPathDir), fullPath)
         );
         const projectPath = normalizePath(fullPath.replace(targetPath, ""));
         map[projectPath] = getContent(relativePath);
      }
   }

   return map;
}

function getCode(obj) {
   let code = ``;

   for (const [key, value] of Object.entries(obj)) {
      code += `"${key}": ${value},\n`;
   }

   code = `export default {\n${code}\n}`;
   return code;
}

function init() {
   const obj = getFilesInDir(targetPath);
   const code = getCode(obj);
   fs.mkdirSync(outputPathDir, { recursive: true });
   fs.writeFileSync(path.resolve(__dirname, outputPath), code);
}

init();

const watcher = chokidar.watch(targetPath, {
   ignored: /^\./,
   persistent: true,
});

watcher.on("add", init);
watcher.on("unlink", init);
