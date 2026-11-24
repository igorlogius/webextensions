/* global browser */

import * as storage from "./storage.js";

function openImportTab() {
  browser.tabs.create({
    url: "import.html",
    active: true,
  });
}

browser.browserAction.onClicked.addListener(openImportTab);
browser.runtime.onInstalled.addListener(async (details) => {
  const extractregex =
    "https?:\\/\\/(www\\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\\.[a-zA-Z][a-zA-Z0-9]{0,5}\\b[-a-zA-Z0-9@:%_+\\.~#?&//=]*";
  if (details.reason === "install") {
    await storage.set("extractregex", extractregex);
  } else if (details.reason === "update") {
    // Only seed the default regex if the user hasn't customized it yet.
    // Previously this overwrote a user's saved regex on every update.
    const existing = await storage.get("string", "extractregex", undefined);
    if (typeof existing === "undefined") {
      await storage.set("extractregex", extractregex);
    }
  }
});
