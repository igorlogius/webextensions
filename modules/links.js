/* global browser */

// Shared by welcome.js and help.js: where to get help / report issues,
// plus the small inline icons used for the buttons.

const REPO_URL = "https://github.com/igorlogius/webextensions";

// issue templates live in .github/ISSUE_TEMPLATE/ (help.yml, bug.yml, suggestion.yml)
// the title is prefilled to match the templates' "{{extension name}} + {{your title}}"
const newIssueUrl = (template) =>
  REPO_URL +
  "/issues/new?template=" +
  template +
  ".yml&title=" +
  encodeURIComponent(browser.runtime.getManifest().name + " + ");

const helpUrl = () => newIssueUrl("help");
const bugUrl = () => newIssueUrl("bug");
const suggestionUrl = () => newIssueUrl("suggestion");

const SVG_NS = "http://www.w3.org/2000/svg";

// 24x24 stroke icons, colored via currentColor
const ICON_PATHS = {
  help: [
    "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z",
    "M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7",
    "M12 17h.01",
  ],
  bug: [
    "M9 7.5a3 3 0 0 1 6 0",
    "M8 9h8v6a4 4 0 0 1-8 0z",
    "M12 9v10",
    "M4 12h4M16 12h4M5 6l3 2M19 6l-3 2M5 19l3-2.5M19 19l-3-2.5",
  ],
  idea: [
    "M9 18h6M10 21h4",
    "M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z",
  ],
};

// returns a fresh <svg> element (DOM, not markup)
const createIcon = (name, size = 18) => {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", size);
  svg.setAttribute("height", size);
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  for (const d of ICON_PATHS[name] || []) {
    const p = document.createElementNS(SVG_NS, "path");
    p.setAttribute("d", d);
    svg.appendChild(p);
  }
  return svg;
};

// interface
export { REPO_URL, helpUrl, bugUrl, suggestionUrl, createIcon };
