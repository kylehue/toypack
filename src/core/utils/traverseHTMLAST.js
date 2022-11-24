export default function (AST, callback) {
	function traverse(_AST) {
		for (let node of _AST) {
         if (typeof node == "object" && !Array.isArray(node)) {
            callback(node);
            if (node.content?.length) {
               traverse(node.content);
            }
			}
		}
	}

	traverse(AST);
}
