/* global browser */

const activeTabs = new Set();
const awaitingTabs = new Map();
let regexPatterns;
let isBlacklistMode;
let storage;

async function getRegexPatterns() {
  const patterns = [];
  const rawPatterns = await storage.get("string", "matchers", "");

  rawPatterns.split("\n").forEach((line) => {
    line = line.trim();
    if (line) {
      try {
        patterns.push(new RegExp(line));
      } catch (error) {
        console.error("Regex error:", error);
      }
    }
  });
  return patterns;
}

function isUrlMatched(url) {
  return regexPatterns.some((pattern) => pattern.test(url));
}

function handleTabRemoval(tabId) {
  activeTabs.delete(tabId);
  awaitingTabs.delete(tabId);
}

async function handleTabActivation({ tabId }) {
  if (!activeTabs.has(tabId)) {
    activeTabs.add(tabId);
    const urlToRedirect = awaitingTabs.get(tabId);
    if (urlToRedirect) {
      awaitingTabs.delete(tabId);
      await browser.tabs.update(tabId, { url: urlToRedirect });
    }
  }
}

async function handleBeforeRequest({ tabId, url }) {
  if (!activeTabs.has(tabId)) {
    const matches = isUrlMatched(url);

    if (
      (isBlacklistMode && matches) || // blacklist mode: matches are disallowed
      (!isBlacklistMode && !matches) // whitelist mode: non-matches are disallowed
    ) {
      awaitingTabs.set(tabId, url);
      return { cancel: true };
    }
    activeTabs.add(tabId);
  }
}

async function handleStorageChange() {
  // Shutdown listeners
  browser.tabs.onActivated.removeListener(handleTabActivation);
  browser.webRequest.onBeforeRequest.removeListener(handleBeforeRequest);
  browser.tabs.onRemoved.removeListener(handleTabRemoval);

  activeTabs.clear();
  awaitingTabs.clear();

  updateBrowserAction("off", [115, 0, 0, 115]);

  // Startup process
  const isDisabledManually = await storage.get(
    "boolean",
    "manually_disabled",
    false,
  );

  if (!isDisabledManually) {
    isBlacklistMode = await storage.get("boolean", "mode", false);
    regexPatterns = await getRegexPatterns();

    const allTabs = await browser.tabs.query({});
    allTabs.forEach((tab) => activeTabs.add(tab.id));

    updateBrowserAction("on", [0, 115, 0, 115]);

    browser.tabs.onRemoved.addListener(handleTabRemoval);
    browser.tabs.onActivated.addListener(handleTabActivation);
    browser.webRequest.onBeforeRequest.addListener(
      handleBeforeRequest,
      { urls: ["<all_urls>"], types: ["main_frame"] },
      ["blocking"],
    );
  }
}

function updateBrowserAction(status, color) {
  browser.browserAction.setBadgeText({ text: status });
  browser.browserAction.setBadgeBackgroundColor({ color });
}

(async () => {
  storage = await import("./storage.js");
  await handleStorageChange();

  browser.browserAction.onClicked.addListener(async () => {
    const currentState = await storage.get(
      "boolean",
      "manually_disabled",
      false,
    );
    storage.set("manually_disabled", !currentState);
  });

  browser.storage.onChanged.addListener((changes) => {
    // ignore unrelated keys (e.g. the welcome flag) so tab state isn't reset
    if (changes.matchers || changes.mode || changes.manually_disabled) {
      handleStorageChange();
    }
  });
})();

// open the options page with a welcome message on first install
browser.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason === "install") {
    const stored = await browser.storage.local.get(["mode", "matchers"]);
    await browser.storage.local.set({
      show_welcome: true,
      mode: typeof stored.mode === "boolean" ? stored.mode : false,
      matchers: typeof stored.matchers === "string" ? stored.matchers : "",
    });
  }
});
