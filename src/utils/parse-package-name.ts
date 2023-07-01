const RE_SCOPED = /^(@[^\/]+\/[^@\/]+)(?:@([^\/]+))?(\/.*)?$/;
const RE_NON_SCOPED = /^([^@\/]+)(?:@([^\/]+))?(\/.*)?$/;

/**
 * Parses the given package name and extracts its components.
 * @returns An object containing the name, version, and path.
 * 
 * https://github.com/egoist/parse-package-name
 */
export function parsePackageName(input: string) {
   const m = RE_SCOPED.exec(input) || RE_NON_SCOPED.exec(input);

   if (!m) {
      throw new Error(`[parse-package-name] invalid package name: ${input}`);
   }

   return {
      name: m[1] || "",
      version: m[2] || "latest",
      subpath: m[3] || "",
   };
}
