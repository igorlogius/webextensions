/* global browser */

const SVG_NS = "http://www.w3.org/2000/svg";

function svgEl(tag, attrs) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    el.setAttribute(k, v);
  }
  return el;
}

// icon builders return a fresh <svg> node (DOM, not markup) each call
const ICON_BUILDERS = {
  play: () => {
    const s = svgEl("svg", { viewBox: "0 0 24 24" });
    s.appendChild(
      svgEl("polygon", { points: "6,4 20,12 6,20", fill: "currentColor" }),
    );
    return s;
  },
  pause: () => {
    const s = svgEl("svg", { viewBox: "0 0 24 24" });
    s.appendChild(
      svgEl("rect", {
        x: 5,
        y: 4,
        width: 5,
        height: 16,
        rx: 1,
        fill: "currentColor",
      }),
    );
    s.appendChild(
      svgEl("rect", {
        x: 14,
        y: 4,
        width: 5,
        height: 16,
        rx: 1,
        fill: "currentColor",
      }),
    );
    return s;
  },
  volume: () => {
    const s = svgEl("svg", {
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": 2,
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
    });
    s.appendChild(
      svgEl("path", {
        d: "M4 9v6h4l5 4V5L8 9H4z",
        fill: "currentColor",
        stroke: "none",
      }),
    );
    s.appendChild(svgEl("path", { d: "M16.5 8.5a5 5 0 0 1 0 7" }));
    s.appendChild(svgEl("path", { d: "M19 6a8.5 8.5 0 0 1 0 12" }));
    return s;
  },
  mute: () => {
    const s = svgEl("svg", {
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": 2,
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
    });
    s.appendChild(
      svgEl("path", {
        d: "M4 9v6h4l5 4V5L8 9H4z",
        fill: "currentColor",
        stroke: "none",
      }),
    );
    s.appendChild(svgEl("path", { d: "M16 9l5 6" }));
    s.appendChild(svgEl("path", { d: "M21 9l-5 6" }));
    return s;
  },
  focus: () => {
    const s = svgEl("svg", {
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": 2,
      "stroke-linecap": "round",
    });
    s.appendChild(svgEl("circle", { cx: 12, cy: 12, r: 7 }));
    s.appendChild(svgEl("path", { d: "M12 2v4M12 18v4M2 12h4M18 12h4" }));
    return s;
  },
  chevron: () => {
    const s = svgEl("svg", {
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": 2,
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
    });
    s.appendChild(svgEl("path", { d: "M6 9l6 6 6-6" }));
    return s;
  },
  back: () => {
    const s = svgEl("svg", {
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": 2,
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
    });
    s.appendChild(svgEl("path", { d: "M15 6l-6 6 6 6" }));
    return s;
  },
  forward: () => {
    const s = svgEl("svg", {
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": 2,
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
    });
    s.appendChild(svgEl("path", { d: "M9 6l6 6-6 6" }));
    return s;
  },
  grid: () => {
    const s = svgEl("svg", { viewBox: "0 0 24 24" });
    [
      [4, 4],
      [13, 4],
      [4, 13],
      [13, 13],
    ].forEach(([x, y]) => {
      s.appendChild(
        svgEl("rect", {
          x,
          y,
          width: 7,
          height: 7,
          rx: 1.5,
          fill: "currentColor",
        }),
      );
    });
    return s;
  },
  expand: () => {
    const s = svgEl("svg", {
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": 2,
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
    });
    s.appendChild(
      svgEl("path", { d: "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" }),
    );
    return s;
  },
  collapse: () => {
    const s = svgEl("svg", {
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": 2,
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
    });
    s.appendChild(
      svgEl("path", { d: "M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" }),
    );
    return s;
  },
  detach: () => {
    const s = svgEl("svg", {
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": 2,
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
    });
    s.appendChild(svgEl("path", { d: "M14 4h6v6" }));
    s.appendChild(svgEl("path", { d: "M20 4l-9 9" }));
    s.appendChild(
      svgEl("path", {
        d: "M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5",
      }),
    );
    return s;
  },
};

// replaces a button's content with an icon (+ optional text label), using
// real DOM nodes throughout instead of innerHTML/outerHTML string assignment
function setButtonIcon(btn, name, label) {
  btn.replaceChildren(ICON_BUILDERS[name]());
  if (label) {
    let span = document.createElement("span");
    span.textContent = label;
    btn.appendChild(span);
  }
}

function formatTime(sec) {
  if (isNaN(sec) || sec < 0) {
    return "--:--";
  }
  sec = Math.floor(sec);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m + ":" + String(s).padStart(2, "0");
}

// live streams report a duration with no real end: the spec says Infinity,
// but plenty of real players hand back NaN or a huge placeholder number
// instead — any of which renders as a nonsense "very large" end time if fed
// straight into formatTime. Treat anything past a few days as "no real end"
// rather than a genuine duration.
const LIVE_DURATION_THRESHOLD = 60 * 60 * 24 * 3; // 3 days, in seconds

function isLiveDuration(duration) {
  return !isFinite(duration) || duration > LIVE_DURATION_THRESHOLD;
}

// the "elapsed / total" label used everywhere a time display shows up —
// collapses to a plain "LIVE" indicator instead of a bogus end time
function formatTimeLabel(value, duration) {
  if (isLiveDuration(duration)) {
    return "LIVE";
  }
  return formatTime(value) + " / " + formatTime(duration);
}

// ---- preview frames ----
// posters arrive as JPEG Blobs; show one via an object URL and revoke the
// previous one so frames don't pile up in memory (one new URL per poll)
function setPoster(rec, blob, key) {
  const url = URL.createObjectURL(blob);
  const old = rec.posterObjectUrl;
  rec.posterObjectUrl = url;
  rec.posterKey = key || "";
  rec.previewImg.src = url;
  rec.previewImg.classList.remove("audioIcon");
  if (old) {
    URL.revokeObjectURL(old);
  }
}

function revokePoster(rec) {
  if (rec.posterObjectUrl) {
    URL.revokeObjectURL(rec.posterObjectUrl);
    rec.posterObjectUrl = "";
  }
}

// applies the poster field of a query reply. "" means "skipped, unchanged,
// or not available" (keep what's showing), a string is the static audio
// icon, anything else is a captured frame
function applyPoster(rec, data) {
  if (!data.poster) {
    return;
  }
  if (typeof data.poster === "string") {
    if (rec.previewImg.getAttribute("src") !== data.poster) {
      rec.previewImg.src = data.poster;
      rec.previewImg.classList.add("audioIcon");
    }
    return;
  }
  setPoster(rec, data.poster, data.posterKey);
}

const tablist = document.getElementById("tabs");

// every control message needs to reach the exact frame the media element
// lives in — a bare tabs.sendMessage only reliably reaches the top frame,
// so anything living in an iframe would otherwise be uncontrollable
function sendToFrame(tabId, frameId, msg) {
  const opts = typeof frameId === "number" ? { frameId } : undefined;
  return browser.tabs.sendMessage(tabId, msg, opts);
}

function addDataListToRange(numberArray, rangeEl, attachEl) {
  const datalistid =
    "rangeSteps" + Date.now() + Math.random().toString(16).slice(2);

  rangeEl.setAttribute("list", datalistid);
  let datalistEl = document.createElement("datalist");
  datalistEl.setAttribute("id", datalistid);

  numberArray.forEach((val) => {
    let opt = document.createElement("option");
    opt.innerText = val;
    datalistEl.appendChild(opt);
  });

  attachEl.appendChild(datalistEl);
}

// ---- full-popup detail view, built once and reused for whichever media
// element is currently open ----
const detailView = document.createElement("div");
detailView.id = "detailView";
detailView.hidden = true;
document.body.appendChild(detailView);

const detailHeader = document.createElement("div");
detailHeader.classList.add("detailHeader");
detailView.appendChild(detailHeader);

const detailBackBtn = document.createElement("button");
detailBackBtn.classList.add("detailBackBtn");
setButtonIcon(detailBackBtn, "back", "Back");
detailHeader.appendChild(detailBackBtn);

// always available — a quick way back to the top-level list. Shown next to
// "Back" when the site has multiple media elements (so both this site's
// overview and the full list are one tap away), or alone when it doesn't
// (that site never had an overview page to go "back" to in the first place)
const detailAllSitesBtn = document.createElement("button");
detailAllSitesBtn.classList.add("detailBackBtn", "detailAllSitesBtn");
setButtonIcon(detailAllSitesBtn, "grid", "All sites");
detailAllSitesBtn.onclick = () => {
  selectedOrigin = null;
  renderView();
};
detailHeader.appendChild(detailAllSitesBtn);

const detailTitle = document.createElement("span");
detailTitle.classList.add("detailTitle");
detailHeader.appendChild(detailTitle);

// pops this element's controls out into their own standalone browser
// window — that window has no notion of "all sites" or any of the site
// list, it just controls this one element by tab/frame/id on its own,
// so it works the same regardless of how many elements the site has
// (the button that triggers this lives in each detail view's action row,
// see buildMediaElement)
async function detachRecord(rec) {
  const params = new URLSearchParams({
    tabId: String(rec.tabId),
    eid: rec.eid,
  });
  if (typeof rec.frameId === "number") {
    params.set("frameId", String(rec.frameId));
  }
  await browser.windows.create({
    url: browser.runtime.getURL("detached.html?" + params.toString()),
    type: "popup",
    // wide enough for the doubled (600px) preview plus padding and scrollbar
    width: 650,
    height: 600,
  });
  window.close();
}

const detailNextBtn = document.createElement("button");
detailNextBtn.classList.add("detailBackBtn", "detailNextBtn");
detailNextBtn.setAttribute("title", "next media element");
let detailNextLabel = document.createElement("span");
detailNextLabel.textContent = "Next";
detailNextBtn.appendChild(detailNextLabel);
detailNextBtn.appendChild(ICON_BUILDERS.forward());
detailHeader.appendChild(detailNextBtn);

const detailContent = document.createElement("div");
detailContent.classList.add("detailContent");
detailView.appendChild(detailContent);

let openRecord = null;

function openDetail(record) {
  openRecord = record;
  detailTitle.textContent = record.title;
  detailContent.replaceChildren(record.detailNode);
  detailNextBtn.disabled = mediaRegistry.length < 2;
  detailView.hidden = false;
  tablist.hidden = true;

  // a site with only one media element never gets an intermediate overview
  // page (see renderSiteList), so there's nothing for "Back" to go back to
  // — hide it and leave only the always-available All-sites button
  const siteEntries = lastSiteGroups.get(record.origin) || [];
  const siteMediaCount = siteEntries.reduce(
    (sum, entry) => sum + entry.res.length,
    0,
  );
  detailBackBtn.hidden = siteMediaCount <= 1;

  // remember this element so the next time the popup opens, if it's still
  // around, we can jump straight back into its detail view instead of the
  // site list
  browser.storage.local
    .set({
      lastOpenedMedia: {
        tabId: record.tabId,
        frameId: record.frameId,
        eid: record.eid,
      },
    })
    .catch(() => {});
}

function closeDetail() {
  openRecord = null;
  detailView.hidden = true;
  tablist.hidden = false;
}

detailBackBtn.onclick = () => closeDetail();
detailNextBtn.onclick = () => {
  if (!openRecord || mediaRegistry.length < 2) {
    return;
  }
  const idx = mediaRegistry.indexOf(openRecord);
  const nextIdx = idx === -1 ? 0 : (idx + 1) % mediaRegistry.length;
  openDetail(mediaRegistry[nextIdx]);
};

// every media element currently rendered, so the poll loop can update state
// without caring whether the row is collapsed or its detail view is open
let mediaRegistry = [];

// results of the last full queryTabs() pass, kept around so switching
// between the site list and a site's media doesn't require re-querying
// every tab again
let lastSiteOrder = [];
let lastSiteGroups = new Map();

// origin of the site the user picked from the top-level list, or null while
// the list itself is showing. Media elements are only ever rendered (and
// only ever polled, via mediaRegistry) for this one site at a time.
let selectedOrigin = null;

// tried at most once per popup session: on the very first queryTabs() pass,
// look up whichever element's detail view was last opened and, if it's
// still around, jump straight back into it instead of showing the site list
let autoReopenChecked = false;

// wires up a set of mute buttons (list row + detail view) that all reflect
// and control the same underlying media element
// disables a set of buttons and gives them a pulsing "in progress" look while
// their command's round-trip to the page is still in flight
function setPending(buttons, pending) {
  buttons.forEach((b) => {
    b.disabled = pending;
    b.classList.toggle("btnPending", pending);
  });
}

// applies a play/pause/mute/volume state update to a record's UI, whether
// it came from a poll round-trip or a live push notification from the page
function applyPlaybackState(rec, data, requestedAt) {
  if (typeof data.hasAudio === "boolean" && data.hasAudio !== rec.hasAudio) {
    rec.hasAudio = data.hasAudio;
    if (rec.paintMute) {
      rec.paintMute();
    }
    if (rec.paintVolume) {
      rec.paintVolume();
    }
  }

  if (openRecord === rec) {
    applyPoster(rec, data);
    // don't yank a slider out from under the user while they're dragging it
    if (
      typeof data.volume === "number" &&
      document.activeElement !== rec.volBtn
    ) {
      rec.volBtn.value = data.volume * 100;
      rec.volLabel.textContent = Math.round(data.volume * 100) + "%";
    }
  }

  // don't clobber a just-clicked button with an update that predates the click
  if (rec.lastInteraction >= requestedAt) {
    return;
  }
  if (typeof data.muted === "boolean") {
    rec.muteCmd = data.muted ? "unmute" : "mute";
  }
  if (typeof data.playing === "boolean") {
    rec.playCmd = data.playing ? "pause" : "play";
  }
  rec.row
    .querySelectorAll(".elementMuteBtn")
    .forEach((b) =>
      setButtonIcon(b, rec.muteCmd === "mute" ? "mute" : "volume"),
    );
  rec.row
    .querySelectorAll(".elementPlayPauseBtn")
    .forEach((b) => setButtonIcon(b, rec.playCmd));
  if (rec.detailNode) {
    rec.detailNode
      .querySelectorAll(".elementMuteBtn")
      .forEach((b) =>
        setButtonIcon(b, rec.muteCmd === "mute" ? "mute" : "volume"),
      );
    rec.detailNode
      .querySelectorAll(".elementPlayPauseBtn")
      .forEach((b) => setButtonIcon(b, rec.playCmd));
  }
  // buttons wired in from outside the compact row/detail view (the
  // site-list row's mute/pause buttons, for a site with a single media
  // element) aren't reachable by the querySelectorAll calls above since
  // they don't live inside rec.row or rec.detailNode
  (rec.extraMuteButtons || []).forEach((b) =>
    setButtonIcon(b, rec.muteCmd === "mute" ? "mute" : "volume"),
  );
  (rec.extraPlayButtons || []).forEach((b) => setButtonIcon(b, rec.playCmd));
}

// content.js pushes state changes (play/pause/mute/rate) the instant they
// happen on the page, so the popup doesn't have to wait for the next poll
// tick to reflect someone using the site's own controls
browser.runtime.onMessage.addListener((msg) => {
  if (!msg || msg.cmd !== "mediaStateChanged") {
    return;
  }
  const rec = mediaRegistry.find((r) => r.eid === msg.id);
  if (!rec) {
    return;
  }
  applyPlaybackState(rec, msg, Date.now());
});

function wireMuteButtons(record, tab, eid, buttons, frameId) {
  const paint = () => {
    const disabled = record.hasAudio === false;
    buttons.forEach((b) => {
      setButtonIcon(b, record.muteCmd === "mute" ? "mute" : "volume");
      b.disabled = disabled;
      b.title = disabled ? "no audio track detected" : "mute / unmute element";
    });
  };
  paint();
  record.paintMute = paint;
  buttons.forEach((b) => {
    b.onclick = async (evt) => {
      evt.stopPropagation();
      const cmdToSend = record.muteCmd;
      // the icon flips immediately so the click always feels instant; the
      // lock just stops a second click racing this one before it's actually
      // reached the page
      setPending(buttons, true);
      record.muteCmd = record.muteCmd === "mute" ? "unmute" : "mute";
      paint();
      record.lastInteraction = Date.now();
      try {
        await sendToFrame(tab.id, frameId, { cmd: cmdToSend, ids: [eid] });
      } catch (e) {
        // the next poll will reconcile the icon if this didn't actually land
      } finally {
        setPending(buttons, false);
      }
    };
  });
}

function wirePlayPauseButtons(record, tab, eid, buttons, frameId) {
  const paint = () => buttons.forEach((b) => setButtonIcon(b, record.playCmd));
  paint();
  buttons.forEach((b) => {
    b.setAttribute("title", "play / pause element");
    b.onclick = async (evt) => {
      evt.stopPropagation();
      const cmdToSend = record.playCmd;
      setPending(buttons, true);
      record.playCmd = record.playCmd === "play" ? "pause" : "play";
      paint();
      record.lastInteraction = Date.now();
      try {
        await sendToFrame(tab.id, frameId, { cmd: cmdToSend, ids: [eid] });
      } catch (e) {
        // the next poll will reconcile the icon if this didn't actually land
      } finally {
        setPending(buttons, false);
      }
    };
  });
}

function wireFocusButtons(tab, eid, buttons, frameId) {
  buttons.forEach((b) => {
    setButtonIcon(b, "focus");
    b.setAttribute("title", "scroll element into view");
    b.onclick = async (evt) => {
      evt.stopPropagation();
      setPending(buttons, true);
      try {
        await browser.windows.update(tab.windowId, { focused: true });
        await browser.tabs.highlight({
          windowId: tab.windowId,
          tabs: [tab.index],
        });
        await sendToFrame(tab.id, frameId, { cmd: "focus", id: eid });
      } catch (e) {
        // ignore — nothing to reconcile for a one-shot action
      } finally {
        setPending(buttons, false);
      }
    };
  });
}

// keeps the detail view's seek slider in sync with the media element's real
// position/duration, and mirrors the current position into any read-only
// labels (e.g. the compact row's time display) that aren't themselves draggable
function wireTimeControls(
  record,
  tab,
  eid,
  interactiveSliders,
  passiveLabels,
  initialCurrentTime,
  initialDuration,
  frameId,
) {
  record.knownDuration = initialDuration;

  function applyDurationAndValue(input, label, value, duration) {
    if (!isLiveDuration(duration) && duration > 0) {
      const durInt = Math.floor(duration);
      if (Number(input.max) !== durInt) {
        input.max = durInt;
      }
      input.disabled = false;
    } else {
      input.disabled = true;
    }
    if (document.activeElement !== input) {
      input.value = value;
    }
    label.textContent = formatTimeLabel(value, duration);
  }

  function syncAll(value, duration, skipInput) {
    record.knownDuration = duration;
    interactiveSliders.forEach(({ input, label }) => {
      if (input === skipInput) {
        // the slider the user is actively dragging keeps its own live value;
        // just keep its label current
        label.textContent = formatTimeLabel(value, duration);
        return;
      }
      applyDurationAndValue(input, label, value, duration);
    });
    passiveLabels.forEach((label) => {
      label.textContent = formatTimeLabel(value, duration);
    });
  }

  interactiveSliders.forEach(({ input, label }) => {
    applyDurationAndValue(input, label, initialCurrentTime, initialDuration);
    input.addEventListener("input", (evt) => {
      const t = parseInt(evt.target.value, 10);
      sendToFrame(tab.id, frameId, {
        cmd: "currentTime",
        id: eid,
        currentTime: t,
      });
      syncAll(t, record.knownDuration, input);
    });
  });
  passiveLabels.forEach((label) => {
    label.textContent = formatTimeLabel(initialCurrentTime, initialDuration);
  });

  record.syncTime = syncAll;
}

// builds one media element: a compact always-visible row plus a detached
// "detail" panel that gets moved into the full-popup overlay when opened
function buildMediaElement(tab, url, e, frameId) {
  const record = {
    tabId: tab.id,
    frameId: frameId,
    eid: e.id,
    origin: url.origin,
    type: e.type,
    hasAudio: e.hasAudio !== false,
    muteCmd: e.muted ? "unmute" : "mute",
    playCmd: e.playing ? "pause" : "play",
    lastInteraction: 0,
    title:
      (e.type === "video" ? "Video" : "Audio") +
      " — " +
      url.hostname.replace(/^www\./, ""),
  };

  // ---- compact row ----
  let elementRow = document.createElement("div");
  elementRow.classList.add("elementDiv");
  elementRow.setAttribute("eid", e.id);
  elementRow.setAttribute("tid", tab.id);

  let summary = document.createElement("div");
  summary.classList.add("elementSummary");
  summary.setAttribute("title", "open full controls");
  summary.onclick = () => openDetail(record);
  elementRow.appendChild(summary);

  let actionRowEl = document.createElement("div");
  actionRowEl.classList.add("elementActionRow");
  summary.appendChild(actionRowEl);

  let focusbtn = document.createElement("button");
  focusbtn.classList.add("elementFocusBtn");
  actionRowEl.appendChild(focusbtn);

  let mutebtn = document.createElement("button");
  mutebtn.classList.add("elementMuteBtn");
  actionRowEl.appendChild(mutebtn);

  let playpausebtn = document.createElement("button");
  playpausebtn.classList.add("elementPlayPauseBtn");
  actionRowEl.appendChild(playpausebtn);

  let info = document.createElement("span");
  info.classList.add("elementInfo");
  info.textContent = e.type === "video" ? "video" : "audio";
  summary.appendChild(info);
  record.infoSpan = info;

  let quickTimeLabel = document.createElement("span");
  quickTimeLabel.classList.add("quickTimeLabel");
  summary.appendChild(quickTimeLabel);

  let chevron = document.createElement("span");
  chevron.classList.add("openChevron");
  chevron.appendChild(ICON_BUILDERS.chevron());
  summary.appendChild(chevron);

  // ---- detail panel (not attached anywhere until opened) ----
  let detailWrap = document.createElement("div");
  detailWrap.classList.add("detailBody");

  let previewBox = document.createElement("div");
  previewBox.classList.add("previewBox", "previewBoxLarge");
  previewBox.setAttribute("title", "picture-in-picture");
  detailWrap.appendChild(previewBox);

  let previewImg = document.createElement("img");
  previewImg.src =
    typeof e.poster === "string" && e.poster ? e.poster : "audio.png";
  previewImg.classList.add("audioIcon"); // removed again once a frame arrives
  previewImg.classList.add("previewImg");
  previewBox.appendChild(previewImg);
  previewBox.onclick = async () => {
    await sendToFrame(tab.id, frameId, { cmd: "pip", ids: [e.id] });
  };
  // size the box itself to the media's real aspect ratio (from the loaded
  // thumbnail's natural dimensions) instead of always being a fixed shape —
  // object-fit alone only letterboxes inside whatever shape the box already is
  previewImg.addEventListener("load", () => {
    if (
      previewImg.naturalWidth &&
      previewImg.naturalHeight &&
      !detailWrap.classList.contains("previewFullscreen")
    ) {
      previewBox.style.aspectRatio =
        previewImg.naturalWidth + " / " + previewImg.naturalHeight;
    }
  });
  record.previewImg = previewImg;
  record.posterKey = "";
  record.posterObjectUrl = "";
  if (e.poster && typeof e.poster !== "string") {
    setPoster(record, e.poster, e.posterKey);
  }

  let detailActionRow = document.createElement("div");
  detailActionRow.classList.add("elementActionRow", "detailActionRow");
  detailWrap.appendChild(detailActionRow);

  let dFocus = document.createElement("button");
  dFocus.classList.add("elementFocusBtn");
  detailActionRow.appendChild(dFocus);

  let dMute = document.createElement("button");
  dMute.classList.add("elementMuteBtn");
  detailActionRow.appendChild(dMute);

  let dPlay = document.createElement("button");
  dPlay.classList.add("elementPlayPauseBtn");
  detailActionRow.appendChild(dPlay);

  // opens this element in its own window (which also has the large preview
  // mode). Icon-only, so it adds little to the row
  let dDetach = document.createElement("button");
  dDetach.classList.add("elementDetachBtn");
  setButtonIcon(dDetach, "detach");
  dDetach.setAttribute("title", "open in its own window");
  dDetach.onclick = () => detachRecord(record);
  detailActionRow.appendChild(dDetach);

  wireFocusButtons(tab, e.id, [focusbtn, dFocus], frameId);
  wireMuteButtons(record, tab, e.id, [mutebtn, dMute], frameId);
  wirePlayPauseButtons(record, tab, e.id, [playpausebtn, dPlay], frameId);

  let controls = document.createElement("div");
  controls.classList.add("elementControlsDiv", "detailControlsDiv");
  detailWrap.appendChild(controls);

  // playback rate
  let rateRow = document.createElement("div");
  rateRow.classList.add("sliderRow");
  controls.appendChild(rateRow);

  let playbackRatebtn = document.createElement("input");
  playbackRatebtn.setAttribute("type", "range");
  playbackRatebtn.setAttribute("min", "25");
  playbackRatebtn.setAttribute("max", "175");
  playbackRatebtn.setAttribute("step", "1");
  playbackRatebtn.setAttribute("value", e.playbackRate * 100);
  playbackRatebtn.classList.add("elementPlaybackRateBtn");
  playbackRatebtn.setAttribute("title", "playback rate");
  addDataListToRange(
    [25, 50, 75, 100, 125, 150, 175],
    playbackRatebtn,
    rateRow,
  );
  rateRow.appendChild(playbackRatebtn);

  let rateLabel = document.createElement("span");
  rateLabel.classList.add("sliderLabel");
  rateLabel.textContent = e.playbackRate.toFixed(2) + "x";
  rateRow.appendChild(rateLabel);

  playbackRatebtn.addEventListener("input", (evt) => {
    const rate = evt.target.value / 100;
    sendToFrame(tab.id, frameId, {
      cmd: "playbackRate",
      id: e.id,
      playbackRate: rate,
    });
    rateLabel.textContent = rate.toFixed(2) + "x";
  });

  // volume
  let volRow = document.createElement("div");
  volRow.classList.add("sliderRow");
  controls.appendChild(volRow);

  let volumebtn = document.createElement("input");
  volumebtn.setAttribute("type", "range");
  volumebtn.setAttribute("min", "0");
  volumebtn.setAttribute("max", "100");
  volumebtn.setAttribute("step", "1");
  volumebtn.setAttribute("value", e.volume * 100);
  volumebtn.classList.add("elementVolumeBtn");
  addDataListToRange([0, 25, 50, 75, 100], volumebtn, volRow);
  volRow.appendChild(volumebtn);
  record.volBtn = volumebtn;
  // a slider that changes the volume of a track that isn't there is just
  // as pointless as a mute button for the same element
  const paintVolume = () => {
    const disabled = record.hasAudio === false;
    volumebtn.disabled = disabled;
    volumebtn.title = disabled ? "no audio track detected" : "volume";
  };
  paintVolume();
  record.paintVolume = paintVolume;

  let volLabel = document.createElement("span");
  volLabel.classList.add("sliderLabel");
  volLabel.textContent = Math.round(e.volume * 100) + "%";
  volRow.appendChild(volLabel);
  record.volLabel = volLabel;

  volumebtn.addEventListener("input", (evt) => {
    const vol = evt.target.value / 100;
    sendToFrame(tab.id, frameId, { cmd: "volume", id: e.id, volume: vol });
    volLabel.textContent = Math.round(vol * 100) + "%";
  });

  // current time
  let timeRow = document.createElement("div");
  timeRow.classList.add("sliderRow");
  controls.appendChild(timeRow);

  let currentTimebtn = document.createElement("input");
  currentTimebtn.setAttribute("type", "range");
  currentTimebtn.setAttribute("min", "0");
  currentTimebtn.setAttribute("step", "1");
  currentTimebtn.classList.add("elementTimeBtn");
  currentTimebtn.setAttribute("title", "playback position");
  addDataListToRange(
    isLiveDuration(e.duration)
      ? []
      : [
          0,
          parseInt(e.duration) / 4,
          parseInt(e.duration) / 2,
          (parseInt(e.duration) / 4) * 3,
          parseInt(e.duration),
        ],
    currentTimebtn,
    timeRow,
  );
  timeRow.appendChild(currentTimebtn);

  let timeLabel = document.createElement("span");
  timeLabel.classList.add("sliderLabel");
  timeRow.appendChild(timeLabel);

  // the compact row's time label mirrors this slider, but only the detail
  // view's slider is actually draggable
  wireTimeControls(
    record,
    tab,
    e.id,
    [{ input: currentTimebtn, label: timeLabel }],
    [quickTimeLabel],
    e.currentTime,
    e.duration,
    frameId,
  );

  record.detailNode = detailWrap;
  record.row = elementRow;
  elementRow._record = record;
  mediaRegistry.push(record);
  return elementRow;
}

async function queryTabs() {
  const tabs = await browser.tabs.query({
    url: ["<all_urls>"],
    discarded: false,
    status: "complete",
  });

  // lets move the audible tabs to the front/top
  tabs.sort((a, b) => {
    if (a.audible && !b.audible) {
      return -1;
    }
    if (b.audible && !a.audible) {
      return 1;
    }
    return 0;
  });

  // first pass: find out which tabs actually have media, keeping the
  // audible-first order established above. Each tab may have media in more
  // than one frame (a same- or cross-origin <iframe> embed), so every frame
  // is queried individually — a bare tabs.sendMessage only ever reaches one
  // frame's response, silently dropping the rest.
  let tabEntries = [];
  for (const tab of tabs) {
    let frames;
    try {
      frames = await browser.webNavigation.getAllFrames({ tabId: tab.id });
    } catch (e) {
      frames = null;
    }
    if (!frames || frames.length === 0) {
      frames = [{ frameId: 0, url: tab.url }];
    }

    for (const frame of frames) {
      let frameUrl;
      try {
        frameUrl = new URL(frame.url);
      } catch (e) {
        continue; // about:blank, data:, etc. — not usable as a grouping key
      }
      if (frameUrl.protocol !== "http:" && frameUrl.protocol !== "https:") {
        continue;
      }

      try {
        const res = await sendToFrame(tab.id, frame.frameId, {
          cmd: "queryAll",
        });
        if (res && res.length > 0) {
          res.sort((a, b) => {
            if (a.playing && !b.playing) {
              return -1;
            }
            if (b.playing && !a.playing) {
              return 1;
            }
            if (a.playing && b.playing) {
              if (!a.muted && b.muted) {
                return -1;
              }
              if (a.muted && !b.muted) {
                return 1;
              }
            }
            return 0;
          });
          tabEntries.push({
            tab,
            frameId: frame.frameId,
            res,
            url: frameUrl,
          });
        }
      } catch (e) {
        // no content script reachable in this frame (blocked, sandboxed,
        // or torn down mid-query) — skip just this frame, not the whole tab
      }
    }
  }

  // once per popup session: see if the element last viewed in detail is
  // still present, and if so pre-select its site so it opens straight up
  let autoReopenTarget = null;
  if (!autoReopenChecked) {
    autoReopenChecked = true;
    try {
      const stored = await browser.storage.local.get("lastOpenedMedia");
      const last = stored.lastOpenedMedia;
      if (last) {
        for (const entry of tabEntries) {
          if (entry.tab.id === last.tabId && entry.frameId === last.frameId) {
            if (entry.res.some((r) => r.id === last.eid)) {
              autoReopenTarget = last;
              selectedOrigin = entry.url.origin;
            }
            break;
          }
        }
      }
    } catch (e) {
      // storage errors just mean we fall back to the normal site list
    }
  }

  // group tabs by origin, preserving the audible-first order they were found in
  let siteOrder = [];
  let siteGroups = new Map();
  for (const entry of tabEntries) {
    const origin = entry.url.origin;
    if (!siteGroups.has(origin)) {
      siteGroups.set(origin, []);
      siteOrder.push(origin);
    }
    siteGroups.get(origin).push(entry);
  }

  lastSiteOrder = siteOrder;
  lastSiteGroups = siteGroups;

  // if the site the user had drilled into no longer has any media (tab
  // closed, page navigated away, playback ended and was cleaned up), fall
  // back to the site list instead of showing a stale/empty detail view
  if (selectedOrigin && !siteGroups.has(selectedOrigin)) {
    selectedOrigin = null;
  }

  renderView();

  if (autoReopenTarget) {
    const target = mediaRegistry.find(
      (r) =>
        r.tabId === autoReopenTarget.tabId &&
        r.frameId === autoReopenTarget.frameId &&
        r.eid === autoReopenTarget.eid,
    );
    if (target) {
      openDetail(target);
    }
  }
}

// redraws #tabs from the last queryTabs() results: either the top-level
// list of sites, or (once one is picked) that site's media elements
function renderView() {
  for (const r of mediaRegistry) {
    revokePoster(r);
  }
  mediaRegistry = [];
  closeDetail();
  tablist.textContent = "";

  if (lastSiteOrder.length === 0) {
    let empty = document.createElement("div");
    empty.classList.add("emptyState");
    empty.textContent = "No media playing right now";
    tablist.appendChild(empty);
    tablist.focus();
    return;
  }

  if (selectedOrigin) {
    renderSiteDetail(selectedOrigin);
  } else {
    renderSiteList();
  }

  tablist.focus();
}

// top-level view: one row per site that currently has media, so the user
// picks a site before any of its media elements are built/shown
function renderSiteList() {
  for (const origin of lastSiteOrder) {
    const entries = lastSiteGroups.get(origin);
    const firstUrl = entries[0].url;
    const hostname = firstUrl.hostname.replace(/^www\./, "");
    const mediaCount = entries.reduce(
      (sum, entry) => sum + entry.res.length,
      0,
    );
    const isAudible = entries.some((entry) =>
      entry.res.some((m) => m.playing && !m.muted),
    );

    let siteDiv = document.createElement("div");
    siteDiv.classList.add("siteDiv", "siteListRow");
    tablist.appendChild(siteDiv);

    // ---- top line: favicon, site-wide actions, hostname — always on its
    // own line so it stays readable no matter how long a tab title below it is
    let headerRow = document.createElement("div");
    headerRow.classList.add("tabHeaderRow");
    siteDiv.appendChild(headerRow);

    const favIconUrl = entries[0].tab.favIconUrl || "";
    if (favIconUrl) {
      let favImg = document.createElement("img");
      favImg.classList.add("tabFavImg");
      favImg.src = favIconUrl;
      favImg.setAttribute("title", hostname);
      headerRow.appendChild(favImg);
    }

    // quick site-wide actions, right here in the list — no need to enter
    // the site just to mute/pause everything it's playing
    let muteSiteBtn = document.createElement("button");
    setButtonIcon(muteSiteBtn, "mute");
    muteSiteBtn.classList.add("siteMuteBtn");
    muteSiteBtn.setAttribute("title", "mute media on every tab from this site");
    muteSiteBtn.onclick = (evt) => {
      evt.stopPropagation();
      for (const entry of entries) {
        sendToFrame(entry.tab.id, entry.frameId, { cmd: "muteAll" });
      }
    };
    headerRow.appendChild(muteSiteBtn);

    let pauseSiteBtn = document.createElement("button");
    setButtonIcon(pauseSiteBtn, "pause");
    pauseSiteBtn.classList.add("sitePauseBtn");
    pauseSiteBtn.setAttribute(
      "title",
      "pause media on every tab from this site",
    );
    pauseSiteBtn.onclick = (evt) => {
      evt.stopPropagation();
      for (const entry of entries) {
        sendToFrame(entry.tab.id, entry.frameId, { cmd: "pauseAll" });
      }
    };
    headerRow.appendChild(pauseSiteBtn);

    let hostSpan = document.createElement("span");
    hostSpan.classList.add("siteLabel");
    hostSpan.textContent = hostname;
    hostSpan.setAttribute("title", hostname);
    headerRow.appendChild(hostSpan);

    // ---- second line: either this site's one media element (title +
    // short info), or the item count for multiple — plus the entry chevron
    let secondRow = document.createElement("div");
    secondRow.classList.add("tabHeaderRow", "siteSecondRow");
    siteDiv.appendChild(secondRow);

    if (mediaCount === 1) {
      // only one media element on the whole site — skip the intermediate
      // per-tab list entirely: show its info right here and go straight
      // to the full detail view on click
      const onlyEntry = entries[0];
      const onlyElement = onlyEntry.res[0];
      const elementRow = buildMediaElement(
        onlyEntry.tab,
        onlyEntry.url,
        onlyElement,
        onlyEntry.frameId,
      );
      const record = elementRow._record;

      // for a single element, mute/pause on the site row are just this
      // element's own controls — wire them into the same toggle group as
      // the compact row and detail view's buttons, rather than leaving
      // them as blanket mute-all/pause-all commands
      const muteButtons = Array.from(
        record.row.querySelectorAll(".elementMuteBtn"),
      ).concat(
        Array.from(record.detailNode.querySelectorAll(".elementMuteBtn")),
      );
      muteButtons.push(muteSiteBtn);
      wireMuteButtons(
        record,
        onlyEntry.tab,
        record.eid,
        muteButtons,
        onlyEntry.frameId,
      );
      record.extraMuteButtons = [muteSiteBtn];

      const playButtons = Array.from(
        record.row.querySelectorAll(".elementPlayPauseBtn"),
      ).concat(
        Array.from(record.detailNode.querySelectorAll(".elementPlayPauseBtn")),
      );
      playButtons.push(pauseSiteBtn);
      wirePlayPauseButtons(
        record,
        onlyEntry.tab,
        record.eid,
        playButtons,
        onlyEntry.frameId,
      );
      record.extraPlayButtons = [pauseSiteBtn];

      // one-shot "jump to this tab" action, right next to mute/pause —
      // wired together with the compact row/detail view's own focus
      // buttons so they all show the same pending state while it runs
      let focusSiteBtn = document.createElement("button");
      focusSiteBtn.classList.add("siteFocusBtn");
      headerRow.insertBefore(focusSiteBtn, hostSpan);

      const focusButtons = Array.from(
        record.row.querySelectorAll(".elementFocusBtn"),
      ).concat(
        Array.from(record.detailNode.querySelectorAll(".elementFocusBtn")),
      );
      focusButtons.push(focusSiteBtn);
      wireFocusButtons(
        onlyEntry.tab,
        record.eid,
        focusButtons,
        onlyEntry.frameId,
      );

      let titleWrap = document.createElement("span");
      titleWrap.classList.add("siteTabTitleWrap");
      secondRow.appendChild(titleWrap);

      let titleText = document.createElement("span");
      titleText.classList.add("siteTabTitleText");
      titleText.textContent = onlyEntry.tab.title || "";
      titleText.setAttribute("title", onlyEntry.tab.title || "");
      titleWrap.appendChild(titleText);

      // only scroll it if it's actually too long to fit — a short title
      // just sits still like any other label (the title attribute above
      // still lets it be read in full on hover either way)
      const overflowPx = titleText.scrollWidth - titleWrap.clientWidth;
      if (overflowPx > 4) {
        titleText.style.setProperty("--marquee-shift", -overflowPx + "px");
        titleText.classList.add("marqueeAnimate");
      }

      let infoSpan = document.createElement("span");
      infoSpan.classList.add("siteMediaCount", "siteMediaCountFixed");
      infoSpan.textContent =
        (onlyElement.type === "video" ? "video" : "audio") +
        " · " +
        formatTimeLabel(onlyElement.currentTime, onlyElement.duration);
      secondRow.appendChild(infoSpan);

      siteDiv.setAttribute("title", "open media controls");
      siteDiv.onclick = () => openDetail(record);
    } else {
      let countSpan = document.createElement("span");
      countSpan.classList.add("siteMediaCount");
      countSpan.textContent =
        mediaCount +
        (mediaCount === 1 ? " item" : " items") +
        (isAudible ? " · playing" : "");
      secondRow.appendChild(countSpan);

      siteDiv.setAttribute("title", "show media from this site");
      siteDiv.onclick = () => {
        selectedOrigin = origin;
        renderView();
      };
    }

    let chevron = document.createElement("span");
    chevron.classList.add("openChevron");
    chevron.appendChild(ICON_BUILDERS.chevron());
    secondRow.appendChild(chevron);
  }
}

// detail view for one site: a "back to sites" row, then the same
// site-wide mute/pause header and per-tab media groups as before
function renderSiteDetail(origin) {
  const entries = lastSiteGroups.get(origin);
  const firstUrl = entries[0].url;

  let backRow = document.createElement("div");
  backRow.classList.add("siteBackRow");
  tablist.appendChild(backRow);

  let backBtn = document.createElement("button");
  backBtn.classList.add("detailBackBtn");
  setButtonIcon(backBtn, "back", "All sites");
  backBtn.onclick = () => {
    selectedOrigin = null;
    renderView();
  };
  backRow.appendChild(backBtn);

  let siteDiv = document.createElement("div");
  siteDiv.classList.add("siteDiv");
  tablist.appendChild(siteDiv);

  // site header: favicon, then site-wide actions, then the hostname
  let headerRow = document.createElement("div");
  headerRow.classList.add("tabHeaderRow");
  siteDiv.appendChild(headerRow);

  const favIconUrl = entries[0].tab.favIconUrl || "";
  if (favIconUrl) {
    let favImg = document.createElement("img");
    favImg.classList.add("tabFavImg");
    favImg.src = favIconUrl;
    headerRow.appendChild(favImg);
  }

  let muteSiteBtn = document.createElement("button");
  setButtonIcon(muteSiteBtn, "mute");
  muteSiteBtn.classList.add("siteMuteBtn");
  muteSiteBtn.setAttribute("title", "mute media on every tab from this site");
  headerRow.appendChild(muteSiteBtn);
  muteSiteBtn.onclick = () => {
    for (const entry of entries) {
      sendToFrame(entry.tab.id, entry.frameId, { cmd: "muteAll" });
    }
  };

  let pauseSiteBtn = document.createElement("button");
  setButtonIcon(pauseSiteBtn, "pause");
  pauseSiteBtn.classList.add("sitePauseBtn");
  pauseSiteBtn.setAttribute("title", "pause media on every tab from this site");
  headerRow.appendChild(pauseSiteBtn);
  pauseSiteBtn.onclick = () => {
    for (const entry of entries) {
      sendToFrame(entry.tab.id, entry.frameId, { cmd: "pauseAll" });
    }
  };

  let hostSpan = document.createElement("span");
  hostSpan.classList.add("siteLabel");
  hostSpan.textContent = firstUrl.hostname.replace(/^www\./, "");
  headerRow.appendChild(hostSpan);

  // one sub-group per tab (or frame within a tab) on this site
  for (const entry of entries) {
    const { tab, frameId, res, url } = entry;

    let tabGroup = document.createElement("div");
    tabGroup.classList.add("tabGroup");
    siteDiv.appendChild(tabGroup);

    let tabRow = document.createElement("div");
    tabRow.classList.add("tabSubRow");
    tabGroup.appendChild(tabRow);

    let tablink = document.createElement("button");
    tablink.classList.add("tabFocusBtn", "tabSubFocusBtn");
    tablink.setAttribute("title", "focus tab");
    let tablinkLabel = document.createElement("span");
    tablinkLabel.textContent = "#" + tab.index + " " + tab.title;
    tablink.appendChild(tablinkLabel);
    tablink.onclick = () => {
      browser.tabs.highlight({ windowId: tab.windowId, tabs: [tab.index] });
    };
    tabRow.appendChild(tablink);

    for (const e of res) {
      tabGroup.appendChild(buildMediaElement(tab, url, e, frameId));
    }
  }
}

(async () => {
  const storage = await import("./storage.js");
  // default.css is the single source of truth for the default look;
  // a user-edited stylesheet in storage (set via the options page) overrides it.
  let cssText = await storage.get("string", "styles", null);
  if (!cssText) {
    const resp = await fetch(browser.runtime.getURL("default.css"));
    cssText = await resp.text();
  }
  let styleSheet = document.createElement("style");
  styleSheet.innerText = cssText;
  document.head.appendChild(styleSheet);

  queryTabs();

  let pollRunning = false;
  setInterval(async () => {
    if (pollRunning) {
      return;
    }
    pollRunning = true;
    try {
      for (const rec of mediaRegistry) {
        // capture this *before* the round-trip: a response only reflects
        // state as of when we asked, so if a click landed after that, this
        // reply is stale with respect to that click and must be dropped —
        // regardless of how long the round-trip itself took
        const requestedAt = Date.now();
        let newdata;
        try {
          newdata = await sendToFrame(rec.tabId, rec.frameId, {
            cmd: "query",
            id: rec.eid,
            // no point decoding a video frame for a row that isn't even open
            skipPoster: openRecord !== rec,
            // lets the page skip re-encoding a frame we already have
            posterKey: rec.posterKey,
          });
        } catch (e) {
          continue;
        }
        if (!newdata) {
          // element vanished from the page (SPA re-render, player torn
          // down) — nothing to sync until the next full queryTabs pass
          continue;
        }

        // the quick-seek slider is visible in the compact row too, so this
        // needs to stay current whether or not the detail view is open
        rec.syncTime(newdata.currentTime, newdata.duration);

        applyPlaybackState(rec, newdata, requestedAt);
      }
    } finally {
      pollRunning = false;
    }
  }, 150);
})();
