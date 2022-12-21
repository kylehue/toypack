import isURL from "./isURL";

export default function isLocal(pathStr: string) {
	return (
		/^(?:\.\.?(?:\/|$)|\/|([A-Za-z]:)?[/\\])/.test(pathStr) && !isURL(pathStr)
	);
}
