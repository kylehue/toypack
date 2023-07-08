export interface SpecifierOptions {
   name: string;
   alias?: string;
   isNamespace?: boolean;
   isDefault?: boolean;
}

function constructSpecifiers(
   specifiers: (string | SpecifierOptions)[],
   aliasAssignmentChar: string
) {
   let spec = "";
   for (const cur of specifiers) {
      const name = typeof cur == "object" ? cur.name : cur;
      if (typeof cur == "object" && (cur.isDefault || cur.isNamespace))
         continue;
      if (typeof cur == "object" && cur.alias) {
         spec += `${name} ${aliasAssignmentChar} ${cur.alias},`;
      } else {
         spec += name + ",";
      }
   }

   return spec.replace(/,$/, "").trim();
}

export function getImportCode(
   moduleType: "esm" | "cjs",
   request: string,
   specifiers?: (string | SpecifierOptions)[]
) {
   let code = "";
   if (moduleType == "esm") {
      if (specifiers?.length) {
         const spec = constructSpecifiers(specifiers, "as");
         if (spec.length) {
            code = `import { ${spec} } from "${request}";`;
         }

         for (const spec of specifiers) {
            if (typeof spec == "string") continue;
            if (spec.isDefault) {
               code += `\nimport ${spec.name} from "${request}";`;
            }
            if (spec.isNamespace) {
               code += `\nimport * as ${spec.name} from "${request}";`;
            }
         }
      } else {
         code = `import "${request}";`;
      }
   } else {
      if (specifiers?.length) {
         const spec = constructSpecifiers(specifiers, ":");
         if (spec.length) {
            code = `const { ${spec} } = require("${request}");`;
         }
         
         for (const spec of specifiers) {
            if (typeof spec == "string") continue;
            if (spec.isDefault) {
               code += `\nconst ${spec.name} = require("${request}").default;`;
            }
            if (spec.isNamespace) {
               code += `\nconst ${spec.name} = require("${request}");`;
            }
         }
      } else {
         code = `require("${request}");`;
      }
   }

   return code;
}
