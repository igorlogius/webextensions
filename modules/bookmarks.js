// Returns a Map of all bookmark folders (id -> { depth, title }) found in the
// given bookmark tree node, e.g. the result of browser.bookmarks.getTree()[0].
// The virtual root folder is skipped.
function recGetFolders(node, depth = 0) {
  let out = new Map();
  if (typeof node.url !== "string") {
    if (node.id !== "root________") {
      out.set(node.id, { depth: depth, title: node.title });
    }
    if (node.children) {
      for (let child of node.children) {
        out = new Map([...out, ...recGetFolders(child, depth + 1)]);
      }
    }
  }
  return out;
}

// interface
export { recGetFolders };
