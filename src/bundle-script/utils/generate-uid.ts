import runtime from "../runtime";

let _idCountMap: Record<string, number> = {};
let _reservedVars = new Set<string>();
export function generateUid(name = "temp") {
   name = toCamelCase(name);
   _idCountMap[name] ??= 0;
   let generated = name;
   while (_reservedVars.has(generated) || generated in runtime) {
      generated = name + "_" + _idCountMap[name]++;
   }

   _reservedVars.add(generated);

   return generated;
}

export function addReservedVars(reservedVars: string | string[]) {
   if (!Array.isArray(reservedVars)) reservedVars = [reservedVars];
   _reservedVars = new Set([..._reservedVars, ...reservedVars]);
}

export function resetUidCache() {
   _idCountMap = {};
   _reservedVars = new Set();
}

// https://stackoverflow.com/a/57927739/16446474
function toCamelCase(text: string) {
   const a = text
      .toLowerCase()
      .replace(/[-_\s.]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ""));
   return a.substring(0, 1).toLowerCase() + a.substring(1);
}
