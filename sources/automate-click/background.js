/* global browser */

console.debug("background.js");

// url_regex => {...}
let store = [];

// the last "real" (non-extension) tab the user was on, used as the
// target for the "Test" / "Run" buttons on the options page
let lastActiveTabId = null;

function isExtensionUrl(url) {
  return typeof url === "string" && url.startsWith(browser.runtime.getURL(""));
}

async function rememberIfRealTab(tabId) {
  try {
    const tab = await browser.tabs.get(tabId);
    if (tab && tab.url && !isExtensionUrl(tab.url)) {
      lastActiveTabId = tabId;
    }
  } catch (e) {
    // tab may already be gone, ignore
  }
}

browser.tabs.onActivated.addListener(({ tabId }) => rememberIfRealTab(tabId));
browser.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (tab.active) rememberIfRealTab(tabId);
});
(async () => {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  if (tabs[0]) rememberIfRealTab(tabs[0].id);
})();

async function findOptionsTab() {
  const pattern = browser.runtime.getURL("options.html") + "*";
  const tabs = await browser.tabs.query({ url: pattern });
  return tabs[0] || null;
}

async function focusTab(tab) {
  await browser.tabs.update(tab.id, { active: true });
  await browser.windows.update(tab.windowId, { focused: true });
}

async function openOptionsFor(url) {
  const existing = await findOptionsTab();

  if (existing) {
    await focusTab(existing);
    if (url) {
      // tell the already-open page to add the rule instead of reloading it,
      // so any unsaved edits already in the table are not lost
      browser.runtime.sendMessage({ type: "ac-add-rule", url }).catch(() => {});
    }
    return;
  }

  let target = "options.html";
  if (url) target += "?url=" + encodeURIComponent(url);
  browser.tabs.create({ url: target });
}

browser.browserAction.onClicked.addListener((tab) => {
  openOptionsFor(tab.url);
});

async function onStorageChanged() {
  var res = await browser.storage.local.get("selectors");
  store = res.selectors;
}

function onWebNavigationCompleted(details) {
  const tmp = new Set();
  if (store) {
    store.forEach((e) => {
      if (typeof e.enabled === "boolean" && e.enabled) {
        if (
          typeof e.urlregex === "string" &&
          new RegExp(e.urlregex).test(details.url)
        ) {
          tmp.add(e);
        }
      }
    });
  }
  if (tmp.size > 0) {
    browser.tabs.sendMessage(details.tabId, tmp);
  }
}

browser.storage.onChanged.addListener(onStorageChanged);
browser.webNavigation.onCompleted.addListener(onWebNavigationCompleted);

// Sends `message` to every frame of `tabId` individually (main page plus
// every iframe, at any nesting depth) and merges the results. Sending
// without a frameId would reach all frames too, but tabs.sendMessage only
// ever hands back ONE (arbitrary) frame's response - so a match living
// inside an iframe could be missed or double-guessed. Targeting each frame
// separately and summing the counts fixes that.
async function relayToAllFrames(tabId, message) {
  let frames;
  try {
    frames = await browser.webNavigation.getAllFrames({ tabId });
  } catch (e) {
    frames = [{ frameId: 0 }];
  }

  const responses = await Promise.all(
    frames.map((f) =>
      browser.tabs
        .sendMessage(tabId, message, { frameId: f.frameId })
        .catch(() => null),
    ),
  );

  let matched = false;
  let total = 0;
  let firstError = null;

  responses.forEach((res) => {
    if (res && res.ok) {
      matched = true;
      total += res.count || 0;
    } else if (res && !res.ok && !firstError) {
      firstError = res.error;
    }
  });

  if (!matched) {
    return { ok: false, error: firstError || "No response from the page" };
  }
  return { ok: true, count: total };
}

// messages coming from the options page or a content script
function onRuntimeMessage(message) {
  if (!message || typeof message !== "object") return;

  switch (message.type) {
    case "ac-relay-test":
    case "ac-relay-run": {
      if (!lastActiveTabId) {
        return Promise.resolve({
          ok: false,
          error: "No page tab found. Click on the page you want to test first.",
        });
      }
      const forward = message.type === "ac-relay-test" ? "ac-test" : "ac-run";
      return relayToAllFrames(lastActiveTabId, {
        type: forward,
        cssselector: message.cssselector,
      });
    }
    default:
      return undefined;
  }
}

browser.runtime.onMessage.addListener(onRuntimeMessage);

onStorageChanged();
