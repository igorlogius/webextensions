/* global browser */

import * as storage from "./storage.js";
import { getTabsInfos, copyToClipboardAsHTML, iconBlink } from "./tabsinfos.js";
import { saveToFile } from "./helper.js";

async function onCommand(cmd) {
  const shortcutconfig = await storage.get("object", "shortcutconfig", null);

  const cfg = shortcutconfig === null ? undefined : shortcutconfig[cmd];

  // ignore shortcuts that were never (fully) configured
  if (!cfg || !cfg.format || !cfg.scope || !cfg.action) {
    return;
  }

  const out = await getTabsInfos(cfg.scope, cfg.format);

  try {
    switch (cfg.action) {
      case "ct":
        await navigator.clipboard.writeText(out);
        break;
      case "ch":
        await copyToClipboardAsHTML(out);
        break;
      case "s":
        saveToFile(out, "");
        break;
    }
    iconBlink();
  } catch (error) {
    console.error(error);
  }
}

async function onInstalled(details) {
  let tmp;
  if (details.reason === "install") {
    tmp = await storage.get("object", "formatStrings", []);
    if (tmp.length < 1) {
      tmp = await fetch("formatStrings.json");
      tmp = await tmp.json();
      await storage.set("formatStrings", tmp);
    }
  }
}

browser.browserAction.setBadgeBackgroundColor({ color: "#00000000" });

browser.commands.onCommand.addListener(onCommand);
browser.runtime.onInstalled.addListener(onInstalled);
// EOF
