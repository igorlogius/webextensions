/* global browser */

// Background hook shared by all addons: shows the welcome page once, right
// after the addon was installed (not on updates or browser restarts).
//
// Needs no imports, so it can simply be listed first in the manifest's
// background "scripts" (works for classic and module backgrounds alike).
// The listener has to be registered synchronously at top level.
browser.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    browser.tabs.create({
      url: browser.runtime.getURL("welcome.html?install"),
    });
  }
});
