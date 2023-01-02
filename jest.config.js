module.exports = {
   testEnvironment: "jsdom",
   /* preset: "ts-jest",
	transform: {
		"^.+\\.tsx?$": [
			"ts-jest",
			{
				tsconfig: require("./tsconfig.json").compilerOptions,
				diagnostics: {
					exclude: ["**"],
				},
			},
		],
	},
	moduleNameMapper: {
		"^@toypack(.*)$": "<rootDir>/src$1",
	}, */
   roots: ["<rootDir>/lib", "<rootDir>/test"],
   setupFiles: ["<rootDir>/test/jest.stub.js"],
};
