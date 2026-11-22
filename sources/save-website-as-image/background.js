/* global browser, JSZip, DEFAULT_SETTINGS, playSound, buildFilename, getTimeStampStr */

const STEP_HEIGHT = 10000;
const BADGE_FRAMES = "▖▘▝▗";

const EXT_NAME = "Save Website as Image";
const BADGE_IDLE_COLOR = "lightgray";
const BADGE_OK = { text: "✓", color: "#1a7f37" };
const BADGE_FAIL = { text: "✕", color: "#d70022" };

// conservative estimate for “bytes per pixel” for the capture pipeline
// (JPEG encoding doesn’t help with the underlying render surface size)
const BYTES_PER_PIXEL_EST = 4;

// Firefox canvas limits (per-dimension + total allocated bytes)
const MAX_CANVAS_DIM = 32766; // keep safely below 32767
const MAX_ALLOCATED_BYTES = 500_000_000; // limit

function needsCbzFallback(width, height) {
  const tooBigByDimension = width > MAX_CANVAS_DIM || height > MAX_CANVAS_DIM;

  const tooBigByAllocatedSize =
    width * height * BYTES_PER_PIXEL_EST > MAX_ALLOCATED_BYTES;

  return tooBigByDimension || tooBigByAllocatedSize;
}

let processingIntervalId = null;

async function clearTabAction(tabId) {
  // removes the tab specific badge text/color/title -> global values apply again
  try {
    await browser.browserAction.setBadgeText({ tabId, text: null });
    await browser.browserAction.setBadgeBackgroundColor({ tabId, color: null });
    await browser.browserAction.setTitle({ tabId, title: null });
  } catch {
    /* tab is gone */
  }
}

function startProcessing(tabId) {
  browser.browserAction.disable();
  if (processingIntervalId) {
    clearInterval(processingIntervalId);
  }

  // animate on the capturing tab (a previous result badge would hide a global one)
  browser.browserAction
    .setBadgeBackgroundColor({ tabId, color: BADGE_IDLE_COLOR })
    .then(() =>
      browser.browserAction.setBadgeText({ tabId, text: BADGE_FRAMES[0] }),
    )
    .catch(() => {});

  const id = setInterval(async () => {
    try {
      const txt = await browser.browserAction.getBadgeText({ tabId });
      if (processingIntervalId !== id) return; // stopped meanwhile
      const idx = BADGE_FRAMES.indexOf(txt);
      const next =
        idx >= 0 && idx < BADGE_FRAMES.length - 1
          ? BADGE_FRAMES[idx + 1]
          : BADGE_FRAMES[0];
      await browser.browserAction.setBadgeText({ tabId, text: next });
    } catch {
      /* tab is gone */
    }
  }, 500);
  processingIntervalId = id;
}

async function stopProcessing(tabId) {
  if (processingIntervalId) {
    clearInterval(processingIntervalId);
  }
  processingIntervalId = null;
  browser.browserAction.enable();
  await clearTabAction(tabId);
}

// ---- per tab result of the last capture (badge + title) ----

const tabStatus = new Map(); // tabId -> { pageKey, ok }

// same page = same URL, ignoring the #fragment
function pageKey(url) {
  try {
    const u = new URL(url);
    u.hash = "";
    return u.href;
  } catch {
    return url || "";
  }
}

async function setCaptureStatus(tabId, startUrl, ok, message) {
  let currentUrl;
  try {
    currentUrl = (await browser.tabs.get(tabId)).url;
  } catch {
    return; // tab is gone
  }
  // the user navigated away while we were working: the result is not for this page
  if (pageKey(currentUrl) !== pageKey(startUrl)) return;

  tabStatus.set(tabId, { pageKey: pageKey(startUrl), ok });

  const badge = ok ? BADGE_OK : BADGE_FAIL;
  const time = new Date().toLocaleTimeString();
  const title = ok
    ? `${EXT_NAME} - last capture of this page succeeded (${time})`
    : `${EXT_NAME} - last capture of this page failed: ${message} (${time})`;

  try {
    await browser.browserAction.setBadgeBackgroundColor({
      tabId,
      color: badge.color,
    });
    await browser.browserAction.setBadgeText({ tabId, text: badge.text });
    await browser.browserAction.setTitle({ tabId, title });
  } catch {
    /* tab is gone */
  }
}

// Firefox resets tab specific values on page loads, but not for in-page (history API)
// navigations, so reset the result explicitly when the URL of the tab changes.
browser.tabs.onUpdated.addListener(
  (tabId, changeInfo) => {
    const status = tabStatus.get(tabId);
    if (!status || !changeInfo.url) return;
    if (pageKey(changeInfo.url) === status.pageKey) return;
    tabStatus.delete(tabId);
    clearTabAction(tabId);
  },
  { properties: ["url"] },
);

browser.tabs.onRemoved.addListener((tabId) => tabStatus.delete(tabId));

async function getSettings() {
  try {
    return await browser.storage.local.get(DEFAULT_SETTINGS);
  } catch {
    return DEFAULT_SETTINGS;
  }
}

async function captureTab(tabId, y, width, height, format, quality) {
  const config = {
    format,
    rect: { x: 0, y, width, height },
  };
  // quality only has meaning for jpeg
  if (format === "jpeg") {
    config.quality = quality;
  }
  return browser.tabs.captureTab(tabId, config);
}

function startDownload(url, filename) {
  return browser.downloads.download({
    url,
    filename,
    conflictAction: "uniquify",
  });
}

// Resolves once the download has been started. `onInterrupted(errorCode)` is called
// if the download later fails or is cancelled.
async function saveAs(
  tabTitle,
  tabURL,
  linkURL,
  extension,
  onInterrupted,
  settings,
) {
  let downloadId;
  try {
    downloadId = await startDownload(
      linkURL,
      buildFilename(tabTitle, tabURL, extension, settings),
    );
  } catch (err) {
    // last resort: a plain timestamp name cannot be invalid
    console.warn("download with generated filename failed, retrying", err);
    try {
      downloadId = await startDownload(
        linkURL,
        `${getTimeStampStr()}.${extension}`,
      );
    } catch (err2) {
      URL.revokeObjectURL(linkURL);
      throw err2;
    }
  }

  let done = false;
  const finish = (state, error) => {
    if (done || (state !== "complete" && state !== "interrupted")) return;
    done = true;
    browser.downloads.onChanged.removeListener(onChanged);
    URL.revokeObjectURL(linkURL);
    if (state === "interrupted" && onInterrupted) onInterrupted(error);
  };
  const onChanged = (delta) => {
    if (delta.id !== downloadId || !delta.state?.current) return;
    finish(delta.state.current, delta.error?.current);
  };
  browser.downloads.onChanged.addListener(onChanged);

  // the download may already be finished before the listener was attached
  const [item] = await browser.downloads.search({ id: downloadId });
  if (item) finish(item.state, item.error);
}

async function getPageSize(tabId) {
  const res = await browser.tabs.executeScript(tabId, {
    code: `
      (() => {
        const doc = document.documentElement;
        const body = document.body;

        const scrollWidth = Math.max(doc.scrollWidth, body ? body.scrollWidth : 0);
        const scrollHeight = Math.max(doc.scrollHeight, body ? body.scrollHeight : 0);

        const clientWidth = doc.clientWidth || (body ? body.clientWidth : 0);
        const clientHeight = doc.clientHeight || (body ? body.clientHeight : 0);

        const offsetWidth = doc.offsetWidth || (body ? body.offsetWidth : 0);
        const offsetHeight = doc.offsetHeight || (body ? body.offsetHeight : 0);

        const width = Math.max(scrollWidth, clientWidth, offsetWidth);
        const height = Math.max(scrollHeight, clientHeight, offsetHeight);

        return { width, height };
      })()
    `,
  });

  const payload = Array.isArray(res) ? res[0] : res;

  if (
    !payload ||
    typeof payload.width !== "number" ||
    typeof payload.height !== "number"
  ) {
    throw new Error("failed to get page dimensions");
  }

  return payload;
}

async function dataURIToBlob(dataURI) {
  // Works for data: URIs returned by captureTab in most versions.
  const res = await fetch(dataURI);
  return res.blob();
}

async function captureChunkToBlob(
  tabId,
  y,
  width,
  chunkHeight,
  format,
  quality,
) {
  const dataURI = await captureTab(
    tabId,
    y,
    width,
    chunkHeight,
    format,
    quality,
  );
  return dataURIToBlob(dataURI);
}

function getChunking(height, width) {
  // Max chunk height allowed by the Firefox “allocated bytes” heuristic
  const maxByBytes = Math.floor(
    MAX_ALLOCATED_BYTES / (width * BYTES_PER_PIXEL_EST),
  );

  // Also respect the per-dimension cap
  const maxByDim = MAX_CANVAS_DIM - 1;

  const maxChunkHeight = Math.max(1, Math.min(maxByBytes, maxByDim));

  // Number of segments needed
  const segments = Math.ceil(height / maxChunkHeight);

  // Equal-ish chunk height (some chunks may be 1px taller)
  const chunkHeight = Math.ceil(height / segments);

  return { segments, chunkHeight };
}

// Captures one tab and starts its download. Never throws, the outcome is
// returned and shown later with reportResult().
async function captureAndSave(tab, settings, playSoundNow) {
  const tabId = tab.id;
  const result = {
    tabId,
    startUrl: tab.url,
    captured: false,
    errorMessage: "",
    pendingFailure: null, // download failure reported before the result was shown
    finalized: false,
  };
  result.onInterrupted = (code) => {
    const msg = `download failed (${code || "interrupted"})`;
    if (result.finalized) {
      setCaptureStatus(tabId, result.startUrl, false, msg);
    } else {
      result.pendingFailure = msg;
    }
  };

  try {
    if (tab.discarded) throw new Error("tab is not loaded (discarded)");

    const { format, quality } = settings;
    const imgExtension = format === "png" ? "png" : "jpg";

    const { width, height } = await getPageSize(tabId);

    if (!width || !height || width <= 0 || height <= 0)
      throw new Error("Invalid page dimensions");

    const needsSegmentation = needsCbzFallback(width, height);

    let extension;
    let blobOrObjUrl;

    if (!needsSegmentation) {
      extension = imgExtension;
      const dataURI = await captureTab(
        tabId,
        0,
        width,
        height,
        format,
        quality,
      );
      blobOrObjUrl = await dataURIToBlob(dataURI);
    } else {
      // CBZ path
      extension = "cbz";
      const zip = new JSZip();

      const { chunkHeight } = getChunking(height, width);

      let i = 1;
      for (let y = 0; y < height; y += chunkHeight) {
        const curHeight = Math.min(chunkHeight, height - y);

        const blob = await captureChunkToBlob(
          tabId,
          y,
          width,
          curHeight,
          format,
          quality,
        );

        zip.file(`${i}.${imgExtension}`, blob, { binary: true });
        i++;
      }

      blobOrObjUrl = await zip.generateAsync({ type: "blob" });
    }

    // the screenshot has been taken
    result.captured = true;
    if (playSoundNow && settings.soundEnabled) {
      playSound(settings).catch((e) => console.warn("could not play sound", e));
    }

    const objUrl = URL.createObjectURL(blobOrObjUrl);
    await saveAs(
      tab.title,
      tab.url,
      objUrl,
      extension,
      result.onInterrupted,
      settings,
    );
  } catch (err) {
    console.error(err);
    result.errorMessage = err?.message || String(err);
  }
  return result;
}

// Shows the outcome (badge + title) on the captured tab
async function reportResult(result) {
  const { tabId, startUrl } = result;
  const errorMessage = result.errorMessage || result.pendingFailure || "";
  await setCaptureStatus(tabId, startUrl, !errorMessage, errorMessage);
  result.finalized = true;
  // a download failure that arrived while the result was being shown
  if (!errorMessage && result.pendingFailure) {
    await setCaptureStatus(tabId, startUrl, false, result.pendingFailure);
  }
}

// The highlighted (multi-selected) tabs of the window if the clicked tab is
// one of them, otherwise just the clicked tab.
async function getTargetTabs(clickedTab) {
  try {
    const tabs = await browser.tabs.query({
      highlighted: true,
      windowId: clickedTab.windowId,
    });
    if (tabs.length > 1 && tabs.some((t) => t.id === clickedTab.id)) {
      return tabs.sort((a, b) => a.index - b.index);
    }
  } catch (err) {
    console.warn("could not query highlighted tabs", err);
  }
  return [clickedTab];
}

async function onBAClicked(tab) {
  const tabs = await getTargetTabs(tab);
  const multi = tabs.length > 1;

  // the progress is shown on the tab whose button was clicked
  startProcessing(tab.id);

  const results = [];
  try {
    const settings = await getSettings();

    // one tab after the other, to keep memory usage and load low
    for (const [i, t] of tabs.entries()) {
      if (multi) {
        browser.browserAction
          .setTitle({
            tabId: tab.id,
            title: `${EXT_NAME} - capturing tab ${i + 1} of ${tabs.length}...`,
          })
          .catch(() => {});
      }
      results.push(await captureAndSave(t, settings, !multi));
    }

    // several tabs: one sound when all screenshots have been taken
    if (multi && settings.soundEnabled && results.some((r) => r.captured)) {
      playSound(settings).catch((e) => console.warn("could not play sound", e));
    }
  } finally {
    await stopProcessing(tab.id);
  }

  for (const result of results) {
    await reportResult(result);
  }
}

browser.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === "install") {
    // flag read by options.js to show the welcome message once
    await browser.storage.local.set({ showWelcome: true });
  }
});

browser.browserAction.onClicked.addListener(onBAClicked);
browser.browserAction.setBadgeBackgroundColor({ color: BADGE_IDLE_COLOR });
browser.browserAction.setBadgeText({ text: "+" });
