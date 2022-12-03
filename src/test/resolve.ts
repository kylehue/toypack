import resolve from "resolve";

setTimeout(() => {
	try {
		console.log("Resolved file: ");
		console.log(
			resolve.sync("./App", {
				basedir: "src",
				extensions: [".js", ".json", ".vue"],
			})
		);
	} catch (error) {
		console.warn(error);
	}

}, 1000);