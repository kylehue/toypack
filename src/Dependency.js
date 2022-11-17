import { getDependency } from "./utils";

export default class Dependency {
	constructor(name, version = "latest") {
		if (!name) throw new Error("Dependency name is not defined.")
		this.dependencies = {};

		getDependency(name, version).then(pkg => {
			// Scan dependency's dependencies
			for (let dependency in pkg.package.dependencies) {
				console.log(dependency);
			}
		});
	}

	bundle() {

	}


}
