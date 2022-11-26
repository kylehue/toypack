const chars = "abcdefghijklmnopqrstuvwxyz1234567890";
const collection = [];
export default function generateId() {
	let id = "";
	for (let index = 0; index < 8; index++) {
		id += chars[Math.floor(Math.random() * chars.length)];
	}

	if (collection.includes(id)) {
		id = generateId();
   } else {
      collection.push(id);
		return id;
	}
}