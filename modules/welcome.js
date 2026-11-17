/* global browser */

// Welcome / about page shared by all addons.
//  - "welcome.html?install" is opened once by install.js after a fresh install
//  - plain "welcome.html" serves as about/help page (and as the options page
//    of addons which have no settings of their own)
import { helpUrl, bugUrl, suggestionUrl, createIcon } from "./links.js";

const manifest = browser.runtime.getManifest();
const firstRun = new URLSearchParams(location.search).has("install");

const $ = (id) => document.getElementById(id);

document.title = (firstRun ? "Welcome - " : "") + manifest.name;
$("title").textContent = firstRun
  ? "Thanks for installing " + manifest.name + "!"
  : manifest.name;
$("subtitle").textContent = "Version " + manifest.version;
$("description").textContent = manifest.description || "";

// icon: use the biggest one of the manifest
const sizes = Object.keys(manifest.icons || {})
  .map(Number)
  .sort((a, b) => b - a);
if (sizes.length > 0) {
  $("icon").src = browser.runtime.getURL(manifest.icons[sizes[0]]);
  $("icon").hidden = false;
}

// a hint where to find the addon
if (firstRun && (manifest.browser_action || manifest.page_action)) {
  const where = manifest.browser_action
    ? "toolbar button"
    : "button in the address bar";
  $("tip").textContent =
    "You can find its " +
    where +
    " in the Extensions menu (puzzle piece icon). Pin it to keep it at hand.";
  $("tip").hidden = false;
}

// only addons with an own options page get the button
const optionsPage = manifest.options_ui && manifest.options_ui.page;
if (optionsPage && optionsPage !== "welcome.html") {
  $("settings").hidden = false;
  $("settings").addEventListener("click", () => {
    browser.runtime.openOptionsPage();
  });
}

const addLink = (href, label, icon) => {
  const a = document.createElement("a");
  a.href = href;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  a.append(createIcon(icon), label);
  $("links").appendChild(a);
};
addLink(helpUrl(), "Get help", "help");
addLink(bugUrl(), "Report an issue", "bug");
addLink(suggestionUrl(), "Make a suggestion", "idea");
