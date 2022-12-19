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
			},
		],
	},
   moduleNameMapper: {
      "^@toypack(.*)$": "<rootDir>/src$1"
   },
};
