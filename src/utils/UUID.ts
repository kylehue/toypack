const chars = "abcdefghijklmnopqrstuvwxyz1234567890";
const collection: string[] = [];

function generate() {
	let id: string = "";
	for (let index = 0; index < 8; index++) {
		id += chars[Math.floor(Math.random() * chars.length)];
	}

	return id;
}

export default function uuid() {
	let id = generate();

	while (collection.some((c) => c === id)) {
		id = generate();
	}

	collection.push(id);
	return id;
}
