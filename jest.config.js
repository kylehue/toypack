module.exports = {
	testEnvironment: "jsdom",
	preset: "ts-jest",
	transform: {
		"^.+\\.tsx?$": [
			"ts-jest",
			{
				tsconfig: {
					target: "esnext",
					sourceMap: true,
				},
				diagnostics: {
					exclude: ["**"],
				},
			},
		],
	},
	moduleNameMapper: {
		"^@toypack(.*)$": "<rootDir>/src$1",
	},
	roots: ["<rootDir>/src", "<rootDir>/test"],
};
