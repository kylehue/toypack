import { ArrayPattern, Identifier, ObjectPattern } from "@babel/types";

function getArrayPatternIds(id: ArrayPattern) {
   const result: Identifier[] = [];
   for (const el of id.elements) {
      if (!el) continue;
      if (el.type == "ArrayPattern") {
         result.push(...getArrayPatternIds(el));
      } else if (el.type == "ObjectPattern") {
         result.push(...getObjectPatternIds(el));
      } else if (el.type == "Identifier") {
         result.push(el);
      }
   }

   return result;
}

function getObjectPatternIds(id: ObjectPattern) {
   const result: Identifier[] = [];
   for (const prop of id.properties) {
      if (prop.type != "ObjectProperty") continue;
      if (prop.value.type == "ArrayPattern") {
         result.push(...getArrayPatternIds(prop.value));
      } else if (prop.value.type == "ObjectPattern") {
         result.push(...getObjectPatternIds(prop.value));
      } else if (prop.value.type == "Identifier") {
         result.push(prop.value);
      }
   }

   return result;
}

export function getPatternIds(id: Identifier | ObjectPattern | ArrayPattern) {
   const result: Identifier[] = [];

   if (id.type == "ArrayPattern") {
      result.push(...getArrayPatternIds(id));
   } else if (id.type == "ObjectPattern") {
      result.push(...getObjectPatternIds(id));
   } else {
      result.push(id);
   }

   return result;
}
