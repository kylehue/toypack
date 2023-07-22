import runtime from "../runtime";

let _idCountMap: Record<string, number> = {};
let _reservedVars = new Set<string>();
export function generateUid(name = "temp") {
   _idCountMap[name] ??= 0;
   let generated = name + "_" + _idCountMap[name]++;
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