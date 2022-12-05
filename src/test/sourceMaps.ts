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

let ddd = new MagicString(
	// prettier-ignore
	`
console.log(123);
console.log(123);
console.log(123);
console.log(123);
`
);

let helloContent = bundle.addSource({
	filename: "hello.js",
	content: ddd,
});

ddd.update(0, ddd.length(), "console.log(444)");
// prettier-ignore

bundle.append("\n//# sourceMappingURL=" + bundle.generateMap().toUrl());

console.log(bundle.toString());
