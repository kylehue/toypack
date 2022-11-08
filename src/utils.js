export function traverseHTMLAST(AST, callback) {
  function traverse(nodes) {
    for (let node of nodes) {
      callback(node);
      if (node.children) {
        traverse(node.children);
      }
    }
  }

  traverse(AST);
}

export function trim(str) {
  const lines = str.split("\n").filter(Boolean);
  const padLength = lines[0].length - lines[0].trimLeft().length;
  const regex = new RegExp(`^\\s{${padLength}}`);
  return lines.map(line => line.replace(regex, "")).join("\n");
}
