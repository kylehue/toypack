export default function isLocal(moduleId: string) {
   return /^\.*\/.*/.test(moduleId);
}