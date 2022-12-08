import * as path from "path";
import untar from "js-untar";
import pako from "pako";
import { maxSatisfying } from "semver";

function getBrowserified() {

}

export async function getDependency(name: string, version = "latest") {
	//console.log(name, version);

	let host = "registry.npmjs.org";
	let targetURL = "https://" + path.join(host, name);

	let registryData = await (await fetch(targetURL))?.json();

	let distTags = registryData?.["dist-tags"];

	let targetVersion = maxSatisfying(Object.values(distTags), version);

	if (!targetVersion) {
		targetVersion = distTags.latest;
	}

	let tgzURL = registryData?.versions?.[targetVersion]?.dist?.tarball;

	if (tgzURL) {
		let tarCompressed = await (await fetch(tgzURL))?.arrayBuffer();
		let tarBuffer = pako.inflate(tarCompressed).buffer;
		let files = await untar(tarBuffer);

		let pkgObject: any = {
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
