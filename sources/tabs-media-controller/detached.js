/* global browser */

// This is a deliberately self-contained sibling of popup.js: it duplicates
// the handful of small helpers and the media-control wiring rather than
// sharing state with the popup, because a detached window has no notion of
// "all sites" / "back" / "next" — it exists to control exactly one media
// element, independent of everything else the popup shows.

const SVG_NS = "http://www.w3.org/2000/svg";

function svgEl(tag, attrs) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    el.setAttribute(k, v);
  }
  return el;
}

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
};

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

const LIVE_DURATION_THRESHOLD = 60 * 60 * 24 * 3; // 3 days, in seconds

function isLiveDuration(duration) {
  return !isFinite(duration) || duration > LIVE_DURATION_THRESHOLD;
}

function formatTimeLabel(value, duration) {
  if (isLiveDuration(duration)) {
    return "LIVE";
  }
  return formatTime(value) + " / " + formatTime(duration);
}

// ---- preview quality: compact vs. maximized ----
// the compact preview is a small, cheap thumbnail (see DEFAULT_THUMB in
// content.js). Once the preview is maximized it's shown much larger, so ask
// the page for a frame at the box's real on-screen pixel size (hi-dpi aware)
// instead of stretching the small one. The JPEG quality used for that is
// adjustable per media element via the slider on the maximized preview; the
// content script never upscales past the video's native resolution.
const DEFAULT_PREVIEW_QUALITY = 0.8;

// remembered per media element so the chosen quality survives the row/detail
// view being rebuilt (the element id is stable for the page's lifetime)
const previewQualityByMedia = new Map();

function previewQualityKey(tabId, frameId, eid) {
  return tabId + ":" + frameId + ":" + eid;
}

// how long the maximized preview's quality slider stays visible without any
// mouse movement before it fades out
const QUALITY_IDLE_MS = 2000;

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

function getPosterOpts(rec) {
  if (!rec.previewMaximized) {
    return undefined; // content script falls back to its compact defaults
  }
  // The window can be resized at any time while maximized, and resizing must
  // only rescale the picture on screen (plain CSS), never change what gets
  // captured. So the capture size doesn't look at the window at all: it is
  // the largest the preview could ever be shown on this screen. The content
  // script never upscales past the video's native resolution, so smaller
  // videos are simply captured at their own size.
  const dpr = window.devicePixelRatio || 1;
  return {
    maxW: Math.round(screen.width * dpr),
    maxH: Math.round(screen.height * dpr),
    quality: rec.previewQuality,
  };
}

// fetch one fresh frame right away (used when toggling maximize or releasing
// the quality slider, so the picture changes immediately instead of on the
// next poll)
async function refreshPreview(rec, tabId, frameId, eid) {
  const wasMax = rec.previewMaximized;
  try {
    const res = await sendToFrame(tabId, frameId, {
      cmd: "preview",
      id: eid,
      posterOpts: getPosterOpts(rec),
    });
    // user may have toggled again while this was in flight
    if (res && res.poster && rec.previewMaximized === wasMax) {
      setPoster(rec, res.poster, res.posterKey);
    }
  } catch (e) {
    // page went away; the regular poll will sort it out
  }
}

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

function setPending(buttons, pending) {
  buttons.forEach((b) => {
    b.disabled = pending;
    b.classList.toggle("btnPending", pending);
  });
}

// this window only ever shows one element, so it's always "the open one" —
// unlike the popup, there's no collapsed/expanded state to gate poster and
// volume updates on
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

  applyPoster(rec, data);
  if (
    typeof data.volume === "number" &&
    document.activeElement !== rec.volBtn
  ) {
    rec.volBtn.value = data.volume * 100;
    rec.volLabel.textContent = Math.round(data.volume * 100) + "%";
  }

  if (rec.lastInteraction >= requestedAt) {
    return;
  }
  if (typeof data.muted === "boolean") {
    rec.muteCmd = data.muted ? "unmute" : "mute";
  }
  if (typeof data.playing === "boolean") {
    rec.playCmd = data.playing ? "pause" : "play";
  }
  rec.detailNode
    .querySelectorAll(".elementMuteBtn")
    .forEach((b) =>
      setButtonIcon(b, rec.muteCmd === "mute" ? "mute" : "volume"),
    );
  rec.detailNode
    .querySelectorAll(".elementPlayPauseBtn")
    .forEach((b) => setButtonIcon(b, rec.playCmd));
}

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

function wireTimeControls(
  record,
  tab,
  eid,
  interactiveSliders,
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
        label.textContent = formatTimeLabel(value, duration);
        return;
      }
      applyDurationAndValue(input, label, value, duration);
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

  record.syncTime = syncAll;
}

// builds just the "detail panel" for one element — no compact row, no
// chevron, no click-to-expand, since this whole window already is the
// expanded view
function buildDetailPanel(tab, url, e, frameId) {
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
  record.previewBox = previewBox;
  record.previewMaximized = false;
  const qualityKey = previewQualityKey(tab.id, frameId, e.id);
  record.previewQuality =
    previewQualityByMedia.get(qualityKey) ?? DEFAULT_PREVIEW_QUALITY;
  record.posterKey = "";
  record.posterObjectUrl = "";
  if (e.poster && typeof e.poster !== "string") {
    setPoster(record, e.poster, e.posterKey);
  }

  let fullscreenBtn = document.createElement("button");
  fullscreenBtn.classList.add("previewFullscreenBtn");
  setButtonIcon(fullscreenBtn, "expand");
  fullscreenBtn.setAttribute("title", "fullscreen preview");
  fullscreenBtn.onclick = (evt) => {
    evt.stopPropagation();
    const isFull = !detailWrap.classList.contains("previewFullscreen");
    detailWrap.classList.toggle("previewFullscreen", isFull);
    if (isFull) {
      previewBox.dataset.prevAspectRatio = previewBox.style.aspectRatio || "";
      previewBox.style.aspectRatio = "unset";
      previewBox.style.width = "100%";
      previewBox.style.maxHeight = "none";
      previewBox.style.flex = "1 1 auto";
      previewBox.style.minHeight = "0";
      detailWrap.style.flex = "1 1 auto";
      detailWrap.style.minHeight = "0";
      previewImg.style.width = "100%";
      previewImg.style.height = "100%";
      previewImg.style.maxWidth = "100%";
      previewImg.style.maxHeight = "100%";
      detailWrap.style.gap = "0";
      detailActionRow.style.display = "none";
      controls.style.display = "none";
    } else {
      previewBox.style.aspectRatio = previewBox.dataset.prevAspectRatio || "";
      previewBox.style.width = "";
      previewBox.style.maxHeight = "";
      previewBox.style.flex = "";
      previewBox.style.minHeight = "";
      detailWrap.style.flex = "";
      detailWrap.style.minHeight = "";
      previewImg.style.width = "";
      previewImg.style.height = "";
      previewImg.style.maxWidth = "";
      previewImg.style.maxHeight = "";
      detailWrap.style.gap = "";
      detailActionRow.style.display = "";
      controls.style.display = "";
    }
    setButtonIcon(fullscreenBtn, isFull ? "collapse" : "expand");
    // sharper frame while maximized, compact one again afterwards (styles
    // are already applied above, so the box has its final size here)
    record.previewMaximized = isFull;
    refreshPreview(record, tab.id, frameId, e.id);
    if (isFull) {
      record.showQualitySlider(); // visible first, then fades after idling
    } else {
      record.stopQualityIdleTimer();
    }
    fullscreenBtn.setAttribute(
      "title",
      isFull ? "exit fullscreen preview" : "fullscreen preview",
    );
  };
  previewBox.appendChild(fullscreenBtn);

  // per-video quality slider, overlaid on the preview and only visible while
  // it's maximized (see .previewQualityBox in default.css)
  let qualityBox = document.createElement("div");
  qualityBox.classList.add("previewQualityBox");
  qualityBox.setAttribute("title", "preview quality (JPEG)");
  // don't let interacting with the slider also trigger picture-in-picture
  qualityBox.onclick = (evt) => evt.stopPropagation();

  let qualitySlider = document.createElement("input");
  qualitySlider.type = "range";
  qualitySlider.min = "10";
  qualitySlider.max = "100";
  qualitySlider.step = "5";
  qualitySlider.value = String(Math.round(record.previewQuality * 100));
  qualitySlider.classList.add("previewQualitySlider");

  let qualityLabel = document.createElement("span");
  qualityLabel.classList.add("sliderLabel");
  qualityLabel.textContent = qualitySlider.value + "%";

  qualitySlider.oninput = () => {
    record.previewQuality = Number(qualitySlider.value) / 100;
    previewQualityByMedia.set(qualityKey, record.previewQuality);
    qualityLabel.textContent = qualitySlider.value + "%";
  };
  qualitySlider.onchange = () => refreshPreview(record, tab.id, frameId, e.id);

  // vertical slider: a normal horizontal range rotated by CSS (works in every
  // Firefox version, unlike the native vertical range support). The wrapper
  // reserves the vertical space the rotated slider visually occupies
  let qualitySliderWrap = document.createElement("div");
  qualitySliderWrap.classList.add("previewQualitySliderWrap");
  qualitySliderWrap.appendChild(qualitySlider);
  qualityBox.appendChild(qualitySliderWrap);
  qualityBox.appendChild(qualityLabel);
  previewBox.appendChild(qualityBox);

  // auto-hide: fade the slider out after a short stretch without mouse
  // movement over the maximized preview, bring it back on the next movement
  let qualityIdleTimer = null;
  const showQualitySlider = () => {
    qualityBox.classList.remove("qualityIdle");
    clearTimeout(qualityIdleTimer);
    qualityIdleTimer = setTimeout(function hide() {
      // never hide while the pointer rests on it or a drag is in progress
      if (qualityBox.matches(":hover, :active")) {
        qualityIdleTimer = setTimeout(hide, QUALITY_IDLE_MS);
        return;
      }
      qualityBox.classList.add("qualityIdle");
    }, QUALITY_IDLE_MS);
  };
  record.showQualitySlider = showQualitySlider;
  record.stopQualityIdleTimer = () => {
    clearTimeout(qualityIdleTimer);
    qualityBox.classList.remove("qualityIdle");
  };
  detailWrap.addEventListener("mousemove", () => {
    if (record.previewMaximized) {
      showQualitySlider();
    }
  });
  // keyboard adjustments count as activity too
  qualitySlider.addEventListener("input", showQualitySlider);

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

  wireFocusButtons(tab, e.id, [dFocus], frameId);
  wireMuteButtons(record, tab, e.id, [dMute], frameId);
  wirePlayPauseButtons(record, tab, e.id, [dPlay], frameId);

  let controls = document.createElement("div");
  controls.classList.add("elementControlsDiv", "detailControlsDiv");
  detailWrap.appendChild(controls);

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

  wireTimeControls(
    record,
    tab,
    e.id,
    [{ input: currentTimebtn, label: timeLabel }],
    e.currentTime,
    e.duration,
    frameId,
  );

  record.detailNode = detailWrap;
  return record;
}

function showGone(message) {
  const content = document.getElementById("detachedContent");
  content.replaceChildren();
  let empty = document.createElement("div");
  empty.classList.add("emptyState");
  empty.textContent = message;
  content.appendChild(empty);
}

// resizes this window to exactly fit its actual content instead of
// whatever guessed size it was opened at — video vs. audio, and different
// aspect ratios, all need very different heights, so this is done once
// dynamically rather than picking one fixed number up front. Only ever
// runs once so it doesn't fight the user if they resize the window
// themselves afterward.
let hasAutoFitted = false;
async function fitWindowToContent() {
  if (hasAutoFitted) {
    return;
  }
  hasAutoFitted = true;
  try {
    const win = await browser.windows.getCurrent();
    const chromeOverhead = win.height - window.innerHeight;
    const desired =
      Math.ceil(document.documentElement.scrollHeight + chromeOverhead) + 4;
    await browser.windows.update(win.id, { height: Math.max(desired, 300) });
  } catch (e) {
    // best effort — an odd window state shouldn't break the controls
  }
}

(async () => {
  const storage = await import("./storage.js");
  // same theme the popup uses, from the same stored stylesheet
  let cssText = await storage.get("string", "styles", null);
  if (!cssText) {
    const resp = await fetch(browser.runtime.getURL("default.css"));
    cssText = await resp.text();
  }
  let styleSheet = document.createElement("style");
  styleSheet.innerText = cssText;
  document.head.appendChild(styleSheet);

  // the shared stylesheet assumes it's laying out a fixed-size toolbar
  // popup (body locked to 580px, #detailView doing the flex-column work).
  // This is a real, independently resizable window instead — appended
  // after the shared sheet so these plain-selector rules win on source
  // order without needing !important
  let overrideSheet = document.createElement("style");
  overrideSheet.innerText = `
    html, body {
      height: 100%;
    }
    body {
      width: auto;
      max-width: none;
      min-width: 280px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      box-sizing: border-box;
    }
    .detailContent {
      flex: 1 1 auto;
      min-height: 0;
      max-height: none;
    }
    /* the preview follows the window: it fills the available width and,
       when the window gets too short for the controls below it, shrinks
       (letterboxed) instead of pushing them out of view. This is pure
       on-screen scaling of the frame that was already captured. The static
       audio icon keeps its fixed size. */
    .detailBody {
      flex: 0 1 auto;
      min-height: 0;
    }
    .previewBoxLarge:has(> .previewImg:not(.audioIcon)) {
      width: 100%;
      max-width: 100%;
      max-height: none;
      min-height: 80px;
    }
    .previewBoxLarge > .previewImg:not(.audioIcon) {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      max-width: none;
      max-height: none;
    }
  `;
  document.head.appendChild(overrideSheet);

  const params = new URLSearchParams(location.search);
  const tabId = Number(params.get("tabId"));
  const frameIdRaw = params.get("frameId");
  const frameId =
    frameIdRaw === null || frameIdRaw === "" ? undefined : Number(frameIdRaw);
  const eid = params.get("eid");

  const content = document.getElementById("detachedContent");
  const titleEl = document.getElementById("detachedTitle");

  if (!tabId || !eid) {
    showGone("Nothing to show — this window wasn't opened correctly.");
    return;
  }

  let tab;
  try {
    tab = await browser.tabs.get(tabId);
  } catch (e) {
    showGone("That tab has been closed.");
    return;
  }

  let url;
  try {
    url = new URL(tab.url);
  } catch (e) {
    url = new URL("about:blank");
  }

  let initial;
  try {
    initial = await sendToFrame(tabId, frameId, {
      cmd: "query",
      id: eid,
      skipPoster: false,
    });
  } catch (e) {
    initial = null;
  }

  if (!initial) {
    showGone("This media element is no longer available.");
    return;
  }

  const record = buildDetailPanel(tab, url, initial, frameId);
  titleEl.textContent = record.title;
  content.replaceChildren(record.detailNode);

  // give the preview a moment to settle into its real aspect ratio (a
  // video may start out showing the audio-fallback icon before its first
  // frame is captured) before measuring and sizing the window to fit
  setTimeout(fitWindowToContent, 400);

  browser.runtime.onMessage.addListener((msg) => {
    if (!msg || msg.cmd !== "mediaStateChanged" || msg.id !== record.eid) {
      return;
    }
    applyPlaybackState(record, msg, Date.now());
  });

  let missCount = 0;
  setInterval(async () => {
    const requestedAt = Date.now();
    const askedMaximized = !!record.previewMaximized;
    let newdata;
    try {
      newdata = await sendToFrame(tabId, frameId, {
        cmd: "query",
        id: eid,
        skipPoster: false,
        posterOpts: getPosterOpts(record),
        // lets the page skip re-encoding a frame we already have
        posterKey: record.posterKey,
      });
    } catch (e) {
      newdata = null;
    }
    if (!newdata) {
      // give a transient hiccup (SPA re-render, brief navigation) a few
      // tries before concluding the element is really gone for good
      missCount += 1;
      if (missCount >= 5) {
        showGone("This media element is no longer available.");
      }
      return;
    }
    missCount = 0;
    // maximize was toggled mid-flight: this poster has the wrong quality
    if (askedMaximized !== !!record.previewMaximized) {
      newdata.poster = "";
    }
    record.syncTime(newdata.currentTime, newdata.duration);
    applyPlaybackState(record, newdata, requestedAt);
  }, 150);
})();
