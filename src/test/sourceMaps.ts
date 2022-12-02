import MagicString, {Bundle} from "magic-string";

let bundle = new Bundle();

bundle.addSource({
	filename: "cool.js",
	content: new MagicString(
		`const num1 = 12;
if (num1 == 12) {
	console.log(num1);
}
`
	),
});

bundle.addSource({
	filename: "hello.js",
	content: new MagicString(
		// prettier-ignore
		`
console.log(123);
console.log(123);
console.log(123);
console.log(123);
`
	)
});
// prettier-ignore

bundle.append("\n//# sourceMappingURL=" + bundle.generateMap().toUrl());

console.log(bundle.toString());
