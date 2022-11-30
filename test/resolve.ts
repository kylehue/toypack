import resolve from "resolve";
try {
	console.log(
		resolve.sync("Wonder", {
			basedir: "src/",
			extensions: [".js", ".json", ".vue"],
		})
	);
} catch (error) {
	console.warn("resolve failed");
}
