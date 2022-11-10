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

export function isExternal(url) {
  var match = url.match(/^([^:\/?#]+:)?(?:\/\/([^\/?#]*))?([^?#]+)?(\?[^#]*)?(#.*)?/);
  if (typeof match[1] === "string" && match[1].length > 0 && match[1].toLowerCase() !== location.protocol) return true;
  if (typeof match[2] === "string" && match[2].length > 0 && match[2].replace(new RegExp(":(" + { "http:": 80, "https:": 443 } [location.protocol] + ")?$"), "") !== location.host) return true;
  return false;
}

import * as path from "path";
import untar from "js-untar";
import pako from "pako";
export function getDependency(name, version) {
  return new Promise((resolve, reject) => {
    try {
      const host = "registry.npmjs.org";
      const targetURL = "https://" + path.join(host, name);

      fetch(targetURL)
        .then(response => response.text()).catch(error => {
          reject(error);
        })
        .then(pkg => {
          let pkgJSON = JSON.parse(pkg);
          let pkgDist = pkgJSON["dist-tags"][version];
          let tgzURL = pkgJSON.versions[pkgDist]?.dist?.tarball;

          if (tgzURL) {
            fetch(tgzURL)
              .then(response => response.arrayBuffer())
              .then(pako.inflate)
              .then(array => array.buffer)
              .then(untar)
              .then(files => {
								const pkgObject = {
									name,
									files
								};

								for (let file of files) {
									file.name = file.name.substr("package/".length);
									if (file.name == "package.json") {
										file.blob.text().then(pkgText => {
											let pkgJSON = JSON.parse(pkgText);
											pkgObject.package = pkgJSON;
											pkgObject.entry = pkgJSON.main;
			                resolve(pkgObject);
										});
									}
								}
              });
          } else {
            reject("Package not found.");
          }
        }).catch(error => {
          reject(error);
        });
    } catch (error) {
      reject(error);
    }
  });
}

// export function bundleDependency() {
// 	return new Promise(() => {
//
// 	});
// }
