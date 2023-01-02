export default function minimizeStr(str: string) {
   return str.replace(/[\n\t]/g, "").replace(/\s+/g, " ");
}
