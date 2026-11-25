/* global browser */

const manifest = browser.runtime.getManifest();
const extname = manifest.name;

let tempData = new Map();

const DEFAULT_SETTINGS = {
  soundEnabled: true,
  customSound: null, // data URL string, or null to use the bundled default
  // "auto": draw straight from the video (fast, works even when the
  // video is scrolled out of view) unless the video is DRM/restricted,
  // in which case fall back to a screenshot anyway.
  // "screenshot": always use the screenshot fallback, even for ordinary
  // videos — slower and requires the video to be visible in the
  // viewport, but captures whatever is actually on screen, including
  // subtitle overlays and custom player UI that a direct canvas draw
  // can't see (canvas.drawImage only reads the video's own decoded
  // pixels, not other DOM/CSS layers on top of it).
  captureMethod: "auto",
};

const MAX_POPUP_SCREEN_RATIO = 0.9;

async function getSettings() {
  const stored = await browser.storage.local.get(DEFAULT_SETTINGS);
  return { ...DEFAULT_SETTINGS, ...stored };
}

async function playShutter() {
  const settings = await getSettings();
  if (!settings.soundEnabled) {
    return;
  }
  const src = settings.customSound || "shutter.mp3";
  const audioElement = new Audio(src);
  // release the decoded audio once playback finishes instead of leaving
  // the element (and its buffer) around for the GC to eventually collect
  audioElement.addEventListener("ended", () => {
    audioElement.src = "";
  });
  try {
    await audioElement.play();
  } catch (e) {
    console.error(e);
  }
}

// tabId => dataURI

async function show_error(message = "") {
  browser.windows.create({
    url: "show.html?error=" + encodeURIComponent(message),
    type: "popup",
    width: 640,
    height: 240,
  });
}

function newInvocationId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `cvf-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// The DOM snippet that shows a brief white flash over `vidElExpr` (a JS
// expression, as source text, referring to the video element in scope).
// Factored out so both the inline (direct-draw) and deferred
// (restricted/screenshot) capture paths can use identical code.
function flashCode(vidElExpr) {
  return `
  {
    const rect = (${vidElExpr}).getBoundingClientRect();
    const flash = document.createElement("div");
    flash.style.cssText =
      "position:fixed;left:" + rect.left + "px;top:" + rect.top +
      "px;width:" + rect.width + "px;height:" + rect.height +
      "px;background:#fff;opacity:0.85;pointer-events:none;" +
      "z-index:2147483647;transition:opacity 220ms ease-out;";
    // a fullscreen element (and its descendants) renders in the
    // browser's "top layer", above every other node regardless of
    // z-index — appending the flash to document.documentElement while
    // a video is fullscreen would put it behind the video, invisible.
    // If the page is fullscreen, append inside that element instead so
    // the flash is part of the same top-layer subtree. This only works
    // when the fullscreen element is a wrapper around the video (the
    // common case for custom players); if a bare <video> itself is the
    // fullscreen element, no DOM overlay can render on top of its
    // decoded frame — a fundamental browser limitation, not fixable
    // here.
    const flashContainer = document.fullscreenElement || document.documentElement;
    flashContainer.appendChild(flash);
    // Force a synchronous layout so the browser has definitely
    // committed and painted the initial (visible) opacity before we
    // switch it to 0. A single requestAnimationFrame isn't a hard
    // guarantee of that — under load, the browser can coalesce the
    // "appear" and "fade out" style changes into the same paint, which
    // skips the visible flash entirely. That's exactly what tends to
    // happen when capturing several frames from the same video back to
    // back, since there's less idle time between captures for a paint
    // to land on its own. Reading a layout property forces the
    // reflow/paint synchronously, so this is reliable regardless of
    // timing or how quickly captures repeat.
    void flash.offsetWidth;
    flash.style.opacity = "0";
    setTimeout(() => flash.remove(), 300);
  }
`;
}

// Restricted/fallback path only: restores a video's controls AND fires
// the capture flash, once it's safe to do so — i.e. only after
// captureVisibleTab has already taken its screenshot. Firing the flash
// any earlier would risk it still being visible (mid fade-out) when the
// screenshot is taken, baking a white overlay into the captured image.
// Called without awaiting (the caller doesn't need to block on this),
// but any failure (e.g. the frame navigated away) is handled internally
// instead of being left as an unhandled rejection.
async function finishRestrictedCapture(tabId, frameId, invocationId) {
  try {
    await browser.tabs.executeScript(tabId, {
      frameId,
      code: `
(() => {
  const state = window.__cvf_state && window.__cvf_state.get(${JSON.stringify(invocationId)});
  if (state) {
${flashCode("state.vidEl")}
    if (state.controlsStatus === true) {
      state.vidEl.controls = true;
    }
    window.__cvf_state.delete(${JSON.stringify(invocationId)});
  }
})();
`,
    });
  } catch (e) {
    console.error(e);
  }
}

// Builds the script injected into the page to identify a video element,
// hide its controls, and try to draw it to a canvas. `getVidElExpr` is a
// JS expression (source text, not a value) that evaluates to the target
// <video> element, or a falsy value if none was found — in which case
// `noVideoMessage` becomes the error shown to the user. On the direct
// (non-restricted) success path this also fires the capture flash
// inline, since by then the canvas has already read the video's pixels
// and the flash can't affect that — see finishRestrictedCapture() for
// why the restricted path defers its flash instead. When
// `forceScreenshot` is true, the canvas-draw attempt is skipped
// entirely and the capture always takes the restricted/screenshot path
// — canvas.drawImage(video) only reads the video's own decoded pixels,
// not any DOM/CSS layers rendered on top of it (subtitle overlays,
// custom player controls, etc.), so a real screenshot is the only way
// to capture those.
function makeCaptureCode(
  getVidElExpr,
  invocationId,
  noVideoMessage,
  forceScreenshot,
) {
  return `
(() => {
  window.__cvf_state = window.__cvf_state || new Map();
  const vidEl = ${getVidElExpr};
  if (!vidEl) {
    throw new Error(${JSON.stringify(noVideoMessage)});
  }

  const controlsStatus = vidEl.controls;
  if (controlsStatus === true) {
    vidEl.controls = false;
  }
  // getElBRect.js (used on the restricted/DRM fallback path) expects to
  // find these as bare globals in this frame's content-script scope, so
  // mirror them onto window in addition to the invocation-keyed map below
  window.vidEl = vidEl;
  window.controlsStatus = controlsStatus;
  // stash a reference to this element + its original controls state,
  // keyed by invocation id, in case we need to restore it later from a
  // second executeScript call (restricted/fallback path only)
  window.__cvf_state.set(${JSON.stringify(invocationId)}, { vidEl, controlsStatus });

  let restricted = ${JSON.stringify(Boolean(forceScreenshot))} || vidEl.mediaKeys !== null;
  let dataURI = null;

  if (!restricted) {
    try {
      const canvas = document.createElement("canvas");
      canvas.width = vidEl.videoWidth;
      canvas.height = vidEl.videoHeight;
      const context = canvas.getContext("2d");
      context.drawImage(vidEl, 0, 0, vidEl.videoWidth, vidEl.videoHeight);
      dataURI = canvas.toDataURL();
      // safe here: the canvas already has its pixel data, so the flash
      // overlay (added to the page after this point) can't taint it
${flashCode("vidEl")}
      if (controlsStatus === true) {
        vidEl.controls = true;
      }
      window.__cvf_state.delete(${JSON.stringify(invocationId)});
    } catch (e) {
      restricted = true;
    }
  }

  return { restricted, dataURI, width: vidEl.videoWidth, height: vidEl.videoHeight };
})();
`;
}

// Runs the full capture flow — inject the capture script, fall back to
// captureVisibleTab for restricted/DRM videos, then deliver the result
// via clipboard or a popup window — against whatever video element
// `getVidElExpr` resolves to in the given tab/frame. `noVideoMessage` is
// shown to the user if that expression finds no video.
async function captureFromTab(
  tab,
  frameId,
  getVidElExpr,
  noVideoMessage = "No video found on this page.",
) {
  const invocationId = newInvocationId();
  const settings = await getSettings();
  const forceScreenshot = settings.captureMethod === "screenshot";

  // 1. identify the video element, hide its controls for a clean
  //    capture, and try to draw it straight to a canvas.
  // 2. if that throws (DRM, cross-origin taint, etc.), report
  //    "restricted" so we fall back to captureVisibleTab below.
  // The whole thing runs as one script and RETURNS its result directly,
  // rather than using runtime.sendMessage — that avoids a race where the
  // background script could read tempData before a message finished
  // round-tripping.
  const result = (
    await browser.tabs.executeScript(tab.id, {
      frameId,
      code: makeCaptureCode(
        getVidElExpr,
        invocationId,
        noVideoMessage,
        forceScreenshot,
      ),
    })
  )[0];

  if (result.restricted) {
    // FALLBACK:
    // since the content is restricted we could give up and show an
    // error, but since we are already here, lets try and give the user
    // at least something. If thats not what he wants, he can discard it
    // just as an error message

    // get video coords + size (x,y,width,height)
    let elBrect = await browser.tabs.executeScript(tab.id, {
      frameId,
      file: "getElBRect.js",
    });
    elBrect = elBrect[0];

    // capture + crop the visible area of the video in one call
    // (Firefox's captureVisibleTab supports a `rect` option, unlike
    // Chrome's — see extensionTypes.ImageDetails)
    const dataURI = await browser.tabs.captureVisibleTab(tab.windowId, {
      rect: elBrect,
    });

    tempData.set(tab.id, {
      data: dataURI,
      width: elBrect.width,
      height: elBrect.height,
    });

    // restore controls, and fire the deferred capture flash, for *this*
    // invocation only, looked up by id rather than relying on whatever
    // the page globals currently hold; not awaited since the rest of
    // the flow doesn't depend on it, but finishRestrictedCapture()
    // handles its own errors internally
    finishRestrictedCapture(tab.id, frameId, invocationId);
  } else {
    tempData.set(tab.id, {
      data: result.dataURI,
      width: result.width,
      height: result.height,
    });
  }

  // if we have the clipboardWrite permission, we copy into the clipboard
  if (
    await browser.permissions.contains({
      permissions: ["clipboardWrite"],
    })
  ) {
    const blob = await (await fetch(tempData.get(tab.id).data)).blob();
    await navigator.clipboard.write([
      new ClipboardItem({
        "image/png": blob,
      }),
    ]);
  } else {
    // if we dont have the clipbordWrite permission, we open the image in
    // a window. The short delay lets the context menu finish closing and
    // the shutter sound start before a new window steals focus.
    setTimeout(() => {
      const data = tempData.get(tab.id);
      // cap the popup at 90% of the screen so a large/full-screen video
      // doesn't spawn a window bigger than the display; the image itself
      // scales down to fit (see show.html)
      const maxWidth = Math.floor(
        (screen.availWidth || 1920) * MAX_POPUP_SCREEN_RATIO,
      );
      const maxHeight = Math.floor(
        (screen.availHeight || 1080) * MAX_POPUP_SCREEN_RATIO,
      );
      browser.windows.create({
        url: "show.html?tabId=" + tab.id,
        type: "popup",
        width: Math.min(parseInt(data.width + 0.5), maxWidth),
        height: Math.min(parseInt(data.height + 0.5), maxHeight),
      });
    }, 750);
  }
  // success feedback
  playShutter();
}

browser.menus.create({
  title: extname,
  contexts: ["video"],
  onclick: async (info, tab) => {
    try {
      await captureFromTab(
        tab,
        info.frameId,
        `browser.menus.getTargetElement(${info.targetElementId})`,
        "Couldn't find that video element. Try right-clicking it again.",
      );
    } catch (e) {
      console.error(e);
      show_error(e.toString());
    }
  },
});

// Keyboard-shortcut entry point (see manifest.json "commands"). There's
// no context-menu click to identify a specific element here, so we
// resolve one in the page itself: whichever video the mouse currently
// sits over, else the first one that's playing, else the first video in
// the document. Only reaches videos in the tab's top-level frame — the
// activeTab permission this command grants doesn't extend into
// cross-origin iframes.
browser.commands.onCommand.addListener(async (command) => {
  if (command !== "copy-video-frame") {
    return;
  }
  try {
    const [tab] = await browser.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (!tab) {
      return;
    }
    await captureFromTab(
      tab,
      0,
      "document.querySelector('video:hover') || " +
        "document.querySelector('video:not([paused])') || " +
        "document.querySelector('video')",
      "No video found. Hover a video (or right-click it) and try again.",
    );
  } catch (e) {
    console.error(e);
    show_error(e.toString());
  }
});

// Picks the first <video> in the top-level document that's actually
// rendered — not just geometrically overlapping the viewport, but also
// not hidden via visibility/opacity/display, which a purely geometric
// check misses (a `visibility:hidden` or `opacity:0` element still
// reports a normal, non-zero bounding rect). That distinction matters
// here: unlike the context menu or the hover-aware shortcut, the
// toolbar button has no notion of "which video" from the user's click,
// since the click lands on the browser chrome, not the page — so it's
// easy for a hidden preload/background <video> earlier in the DOM to
// get picked ahead of the one actually on screen if we only check
// geometry. checkVisibility() (where available; Firefox 122+) covers
// the full ancestor chain in one call.
const FIRST_VISIBLE_VIDEO_EXPR = `
(() => {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const videos = Array.from(document.querySelectorAll("video"));
  return (
    videos.find((v) => {
      if (
        typeof v.checkVisibility === "function" &&
        !v.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
      ) {
        return false;
      }
      const r = v.getBoundingClientRect();
      return (
        r.width > 0 &&
        r.height > 0 &&
        r.bottom > 0 &&
        r.right > 0 &&
        r.top < vh &&
        r.left < vw
      );
    }) || null
  );
})()
`;

// Toolbar-button entry point (see manifest.json "browser_action"). Only
// reaches videos in the tab's top-level frame, same limitation as the
// keyboard shortcut.
browser.browserAction.onClicked.addListener(async (tab) => {
  try {
    await captureFromTab(
      tab,
      0,
      FIRST_VISIBLE_VIDEO_EXPR,
      "No video currently visible on this page.",
    );
  } catch (e) {
    console.error(e);
    show_error(e.toString());
  }
});

browser.runtime.onMessage.addListener((data) => {
  if (data.tabId) {
    return Promise.resolve(tempData.get(data.tabId));
  }
  return false;
});

browser.tabs.onRemoved.addListener((tabId) => {
  if (tempData.has(tabId)) {
    tempData.delete(tabId);
  }
});
