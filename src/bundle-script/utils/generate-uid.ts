let idCountMap: Record<string, number> = {};
export function generateUid(name = "temp") {
   idCountMap[name] ??= 0;
   let generated = name + "_" + idCountMap[name]++;
   return generated;
}

export function resetIdCounter() {
   idCountMap = {};
}