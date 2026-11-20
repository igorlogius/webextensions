/* global browser */

import * as permissions from "./permissions.js";
import * as utils from "./utils.js";
import * as storage from "./storage.js";

const extname = utils.getExtensionName();

const NL = "\n";
const BR = "<br/>";
const DEFAULT_BOOKMARK_FOLDER = "unfiled_____";
const WEB_PROTOCOLS = ["http:", "https:", "ftp:"];
const PLACEHOLDER_RE =
  /%(url_proto|url_host|url_port|url_path|url_params|url_origin|url|text|nl)/g;

// maps a command / menu action to the optional permission it needs
const PERMISSION_FOR = { bookmark: "bookmarks", download: "downloads" };

// runs inside the page: returns the links touched by the current selection
const SELECTION_LINKS_CODE = `(() => {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed) { return []; }
  return [...document.links]
    .filter((a) => sel.containsNode(a, true))
    .map((a) => ({
      url: a.href,
      text: (a.innerText || a.textContent || "").trim().replace(/\\s+/g, " ")
        || a.title || (a.querySelector("img") || {}).alt || "",
    }));
})()`;

let formats = [];
let separator = NL;
let bookmarkFolderId = DEFAULT_BOOKMARK_FOLDER;
let ready = loadSettings();
let menuBuild = 0;

/* ---------- settings ---------- */

async function loadSettings() {
  const rows = await storage.get("object", "selectors", []);
  formats = Array.isArray(rows)
    ? rows.filter(
        (r) => r && typeof r.name === "string" && typeof r.format === "string",
      )
    : [];
  const sep = await storage.get("string", "separator", "");
  separator = (sep === "" ? NL : sep).replaceAll("%nl", NL);
  bookmarkFolderId =
    (await storage.get("string", "bookmarkFolderId", "")) ||
    DEFAULT_BOOKMARK_FOLDER;
}

/* ---------- helpers ---------- */

const say = (msg) => utils.notify(extname, msg);
const countLinks = (n) => n + " Link" + (n === 1 ? "" : "s");

function isWebUrl(str) {
  try {
    return WEB_PROTOCOLS.includes(new URL(str).protocol);
  } catch (e) {
    return false;
  }
}

function dedupeLinks(links) {
  const seen = new Set();
  return links.filter((l) => {
    if (!l || typeof l.url !== "string" || seen.has(l.url)) {
      return false;
    }
    seen.add(l.url);
    return true;
  });
}

async function getActiveTab() {
  const [tab] = await browser.tabs.query({
    active: true,
    lastFocusedWindow: true,
  });
  return tab;
}

// frameId undefined -> all frames
async function getSelectedLinks(tabId, frameId) {
  const details = { code: SELECTION_LINKS_CODE };
  if (typeof frameId === "number") {
    details.frameId = frameId;
  } else {
    details.allFrames = true;
  }
  try {
    const results = await browser.tabs.executeScript(tabId, details);
    return results.flat().filter(Boolean);
  } catch (e) {
    utils.log("warn", "cannot read selection: " + e);
    return [];
  }
}

// links from a text selection; falls back to the right-clicked link
async function getLinks(info, tab) {
  let links = [];
  if (info.selectionText && tab) {
    links = await getSelectedLinks(tab.id, info.frameId);
  }
  if (links.length === 0 && info.linkUrl) {
    links = [{ url: info.linkUrl, text: info.linkText || "" }];
  }
  return dedupeLinks(links);
}

/* ---------- actions ---------- */

async function openInTabs(links, tab, discarded) {
  const urls = links.filter((l) => isWebUrl(l.url));
  let created = 0;
  for (const [i, link] of urls.entries()) {
    const props = { url: link.url, active: false };
    if (tab) {
      props.openerTabId = tab.id;
      props.index = tab.index + 1 + i;
    }
    if (discarded) {
      props.discarded = true;
      props.title = link.text || link.url;
    }
    try {
      await browser.tabs.create(props);
      created++;
    } catch (e) {
      utils.log("warn", "cannot open " + link.url + ": " + e);
    }
  }
  say("Created " + created + " Tab" + (created === 1 ? "" : "s"));
}

async function openInWindow(links) {
  const urls = links.filter((l) => isWebUrl(l.url)).map((l) => l.url);
  if (urls.length === 0) {
    say("No openable links found");
    return;
  }
  await browser.windows.create({ url: urls });
  say("Created new Window with " + urls.length + " Tabs");
}

async function bookmarkLinks(links, parentId) {
  const urls = links.filter((l) => isWebUrl(l.url));
  if (urls.length === 0) {
    say("No bookmarkable links found");
    return;
  }
  let folder = parentId || bookmarkFolderId;
  try {
    await browser.bookmarks.get(folder);
  } catch (e) {
    folder = DEFAULT_BOOKMARK_FOLDER; // configured folder was deleted
  }
  let created = 0;
  for (const link of urls) {
    try {
      await browser.bookmarks.create({
        parentId: folder,
        title: link.text || link.url,
        url: link.url,
      });
      created++;
    } catch (e) {
      utils.log("warn", "cannot bookmark " + link.url + ": " + e);
    }
  }
  say("Created " + created + " Bookmark" + (created === 1 ? "" : "s"));
}

async function downloadLinks(links) {
  const urls = links.filter((l) => isWebUrl(l.url));
  let started = 0;
  for (const link of urls) {
    try {
      await browser.downloads.download({
        url: link.url,
        saveAs: false,
        conflictAction: "uniquify",
      });
      started++;
    } catch (e) {
      utils.log("warn", "cannot download " + link.url + ": " + e);
    }
  }
  say("Started " + started + " Download" + (started === 1 ? "" : "s"));
}

// single pass, so substituted values are never re-scanned for placeholders
function formatLink(fmt, link, escape) {
  let url;
  try {
    url = new URL(link.url);
  } catch (e) {
    return null;
  }
  const values = {
    url_proto: url.protocol,
    url_host: url.hostname,
    url_port: url.port,
    url_path: url.pathname,
    url_params: url.search,
    url_origin: url.origin,
    url: url.href,
    text: link.text || "",
  };
  return fmt.replace(PLACEHOLDER_RE, (_, key) =>
    key === "nl" ? NL : escape(values[key]),
  );
}

async function writeClipboard(text, html) {
  if (html !== null && typeof ClipboardItem !== "undefined") {
    await navigator.clipboard.write([
      new ClipboardItem({
        "text/plain": new Blob([text], { type: "text/plain" }),
        "text/html": new Blob([html], { type: "text/html" }),
      }),
    ]);
  } else {
    await navigator.clipboard.writeText(text);
  }
}

async function copyLinks(links, row) {
  const plain = [];
  const html = [];
  for (const link of links) {
    const p = formatLink(row.format, link, (s) => s);
    if (p === null) {
      continue;
    }
    plain.push(p);
    if (row.html === true) {
      html.push(formatLink(row.format, link, utils.escapeHtml));
    }
  }
  if (plain.length === 0) {
    say("No valid links found");
    return;
  }
  const text = plain.map((s) => s + separator).join("");
  const markup =
    row.html === true
      ? "<span>" +
        html
          .map((s) => s + separator)
          .join("")
          .replaceAll(NL, BR) +
        "</span>"
      : null;
  await writeClipboard(text, markup);
  say("Copied " + countLinks(plain.length) + " (" + row.name + ")");
}

// action: open_tabs | open_unloaded | open_window | bookmark | download | copy:<n>
async function perform(action, links, tab, parentId) {
  const needed = PERMISSION_FOR[action];
  if (needed && !(await permissions.hasPermission(needed))) {
    say('Permission "' + needed + '" is not granted. Opening options.');
    await browser.runtime.openOptionsPage();
    return;
  }
  if (action.startsWith("copy:")) {
    const row = formats[parseInt(action.slice(5), 10)];
    if (!row) {
      say("No copy format configured for this slot");
      return;
    }
    if (links.length === 0) {
      say("No links found");
      return;
    }
    return copyLinks(links, row);
  }
  if (links.length === 0) {
    say("No links found. Select text that contains links first.");
    return;
  }
  switch (action) {
    case "open_tabs":
      return openInTabs(links, tab, false);
    case "open_unloaded":
      return openInTabs(links, tab, true);
    case "open_window":
      return openInWindow(links);
    case "bookmark":
      return bookmarkLinks(links, parentId);
    case "download":
      return downloadLinks(links);
  }
}

/* ---------- context menu ---------- */

async function onMenuShow(info) {
  if (
    !info.contexts.some((c) => ["link", "selection", "bookmark"].includes(c))
  ) {
    return;
  }
  const build = ++menuBuild; // a newer build supersedes this one
  await ready;
  const [canBookmark, canDownload] = await Promise.all([
    permissions.hasPermission("bookmarks"),
    permissions.hasPermission("downloads"),
  ]);
  if (build !== menuBuild) {
    return;
  }
  await browser.menus.removeAll();
  if (build !== menuBuild) {
    return;
  }

  const contexts = ["link", "selection"];

  if (canBookmark) {
    browser.menus.create({
      id: "bookmark",
      title: "Bookmark Links",
      contexts: [...contexts, "bookmark"],
    });
  }

  browser.menus.create({
    id: "open_actions",
    title: "Open Links",
    contexts,
  });
  browser.menus.create({
    id: "open_tabs",
    parentId: "open_actions",
    title: "in Tabs",
    contexts,
  });
  browser.menus.create({
    id: "open_unloaded",
    parentId: "open_actions",
    title: "in unloaded Tabs",
    contexts,
  });
  browser.menus.create({
    id: "open_window",
    parentId: "open_actions",
    title: "in new Window",
    contexts,
  });

  if (canDownload) {
    browser.menus.create({ id: "download", title: "Download Links", contexts });
  }

  browser.menus.create({ type: "separator", contexts });

  browser.menus.create({
    id: "copy_actions",
    title: "Copy Links as…",
    contexts,
  });
  if (formats.length === 0) {
    browser.menus.create({
      id: "copy_none",
      parentId: "copy_actions",
      title: "No formats configured",
      enabled: false,
      contexts,
    });
  }
  formats.forEach((row, i) => {
    browser.menus.create({
      id: "copy:" + i,
      parentId: "copy_actions",
      title: row.name.replaceAll("&", "&&"), // a single & would become an access key
      contexts,
    });
  });
  browser.menus.create({
    type: "separator",
    parentId: "copy_actions",
    contexts,
  });
  browser.menus.create({
    id: "configure",
    parentId: "copy_actions",
    title: "Configure",
    contexts,
  });

  browser.menus.refresh();
}

async function onMenuClicked(info, tab) {
  await ready;
  const id = String(info.menuItemId);

  if (id === "configure") {
    return browser.runtime.openOptionsPage();
  }

  // clicked on a bookmark (folder): bookmark the links selected in the active tab into it
  if (id === "bookmark" && info.bookmarkId) {
    const [node] = await browser.bookmarks.get(info.bookmarkId);
    const parentId = node.type === "folder" ? node.id : node.parentId;
    const activeTab = await getActiveTab();
    const links = activeTab ? await getSelectedLinks(activeTab.id) : [];
    return perform("bookmark", dedupeLinks(links), activeTab, parentId);
  }

  return perform(id, await getLinks(info, tab), tab);
}

/* ---------- keyboard shortcuts ---------- */

const COMMAND_ACTIONS = {
  open: "open_tabs",
  open_unloaded: "open_unloaded",
  bookmark: "bookmark",
  download: "download",
};

async function onCommand(name, tab) {
  await ready;
  const action = name.startsWith("action_")
    ? "copy:" + name.slice(7)
    : COMMAND_ACTIONS[name];
  if (!action) {
    return;
  }
  tab = tab || (await getActiveTab());
  if (!tab) {
    return;
  }
  const links = dedupeLinks(await getSelectedLinks(tab.id));
  return perform(action, links, tab);
}

/* ---------- lifecycle ---------- */

async function handleInstalled(details) {
  if (details.reason !== "install") {
    return;
  }
  try {
    const res = await fetch("initial_config.json");
    await storage.set("selectors", await res.json());
  } catch (e) {
    utils.log("error", "cannot load initial config: " + e);
  }
}

const guard =
  (fn) =>
  async (...args) => {
    try {
      await fn(...args);
    } catch (e) {
      utils.log("error", e && e.message ? e.message : e);
      say("Error: " + (e && e.message ? e.message : e));
    }
  };

// listeners are registered synchronously at top level (required for event pages)
browser.runtime.onInstalled.addListener(guard(handleInstalled));
browser.browserAction.onClicked.addListener(() =>
  browser.runtime.openOptionsPage(),
);
browser.storage.onChanged.addListener(() => {
  ready = loadSettings();
});
browser.menus.onShown.addListener(guard(onMenuShow));
browser.menus.onClicked.addListener(guard(onMenuClicked));
browser.commands.onCommand.addListener(guard(onCommand));
