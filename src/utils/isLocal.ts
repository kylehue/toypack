import isURL from "./isURL";

export default function isLocal(moduleId: string) {
   return /^\.*\/.*/.test(moduleId) && !isURL(moduleId);
}