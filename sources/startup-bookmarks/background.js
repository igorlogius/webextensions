/* global browser */

import * as storage from "./storage.js";

const manifest = browser.runtime.getManifest();
const extname = manifest.name;

async function getURLsFromBMFolder(bmId) {
  return new Set(
    (await browser.bookmarks.getChildren(bmId))
      .filter((child) => child.url) // ignore sub folders
      .map((child) => child.url),
  );
}

async function openSubFolderWindows(bmId) {
  (await browser.bookmarks.getChildren(bmId)).forEach(async (child) => {
    if (!child.url) {
      let titlePreface = child.title + ": ";
      let tmp = await browser.windows.create({ titlePreface });
      const urls = await getURLsFromBMFolder(child.id);
      if (urls.size > 0) {
        //console.debug(titlePreface, tmp, urls);
        await openURLsInWindow(tmp.id, urls);
      }
    }
  });
}

async function openURLsInWindow(winId, urls) {
  for (const url of urls) {
    try {
      const tmpurl = new URL(url);
      await browser.tabs.create({
        windowId: winId,
        pinned: url.endsWith("#pin"),
        url: tmpurl.toString().split("#pin")[0],
        active: false,
      });
    } catch (e) {
      // ignore invalid urls and
      // about: pages can not be created
    }
  }
}

async function openStartupBookmarks() {
  let tmp;
  const bmId = await storage.get("string", "folder", "");
  if (bmId === "") {
    return;
  }

  const urls = await getURLsFromBMFolder(bmId);

  //let already_open_urls = new Set();

  tmp = await browser.windows.getCurrent({ populate: false });
  //already_open_urls = new Set((await browser.tabs.query({})).map((t) => t.url));

  let first = true;
  for (const url of urls) {
    //if (!already_open_urls.has(url.split("#pin")[0])) {
    try {
      const tmpurl = new URL(url);
      await browser.tabs.create({
        windowId: tmp.id,
        pinned: url.endsWith("#pin"),
        url: tmpurl.toString().split("#pin")[0],
        active: first,
      });
      first = false;
    } catch (e) {
      // ignore invalid urls and
      // about: pages can not be created
    }
    //}
  }

  await openSubFolderWindows(bmId);
}

browser.runtime.onStartup.addListener(openStartupBookmarks);

browser.runtime.onMessage.addListener((req /*,sender, sendRes*/) => {
  if (req.cmd === "test") {
    openStartupBookmarks();
  }
});
