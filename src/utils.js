import * as path from "path";
import untar from "js-untar";
import pako from "pako";
export async function getDependency(name, version = "latest") {
	if (!name) throw new Error("Dependency name is not defined.");
	const host = "registry.npmjs.org";
  const targetURL = "https://" + path.join(host, name);
  
  const registryData = await (await fetch(targetURL))?.json();
  const distVersion = registryData?.["dist-tags"]?.[version];
  const tgzURLl = registryData?.versions?.[distVersion]?.dist?.tarball;
  if (tgzURLl) {
    const tarCompressed = await (await fetch(tgzURLl))?.arrayBuffer();
    const tarBuffer = pako.inflate(tarCompressed).buffer;
    const files = await untar(tarBuffer);

    const pkgObject = {
      name,
			files,
		};

		for (let file of files) {
			file.name = file.name.substr("package/".length);
			if (file.name == "package.json") {
        let pkgContent = await file.blob.text();
        let pkgJSON = JSON.parse(pkgContent);
				pkgObject.package = pkgJSON;
				pkgObject.entry = pkgJSON.main;
			}
    }
    
    return pkgObject;
  }
}

export function traverseHTMLAST(AST, callback) {
	function traverse(nodes) {
		for (let node of nodes) {
			callback(node);
			if (node.children) {
				traverse(node.children);
			}
		}
	}

	traverse(AST);
}

export function trim(str) {
	const lines = str.split("\n").filter(Boolean);
	const padLength = lines[0].length - lines[0].trimLeft().length;
	const regex = new RegExp(`^\\s{${padLength}}`);
	return lines.map((line) => line.replace(regex, "")).join("\n");
}

export function isExternal(url) {
	var match = url.match(
		/^([^:\/?#]+:)?(?:\/\/([^\/?#]*))?([^?#]+)?(\?[^#]*)?(#.*)?/
	);
	if (
		typeof match[1] === "string" &&
		match[1].length > 0 &&
		match[1].toLowerCase() !== location.protocol
	)
		return true;
	if (
		typeof match[2] === "string" &&
		match[2].length > 0 &&
		match[2].replace(
			new RegExp(
				":(" + { "http:": 80, "https:": 443 }[location.protocol] + ")?$"
			),
			""
		) !== location.host
	)
		return true;
	return false;
}

export function isCoreModule(pathStr) {
	return (
		!pathStr.startsWith("/") &&
		!pathStr.startsWith("./") &&
		!pathStr.startsWith("../")
	);
}
