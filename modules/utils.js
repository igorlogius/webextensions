/* global browser */

const isNumeric = (str) => {
  if (typeof str !== "string") {
    return false;
  } // we only process strings!
  return (
    !isNaN(str) && // use type coercion to parse the _entirety_ of the string (`parseFloat` alone does not do this)...
    !isNaN(parseInt(str))
  ); // ...and ensure strings of whitespace fail
};

// e.g. 2026-10-04_12-30-05
const getTimeStampStr = () => {
  const d = new Date();
  let ts = "";
  [
    d.getFullYear(),
    d.getMonth() + 1,
    d.getDate(),
    d.getHours(),
    d.getMinutes(),
    d.getSeconds(),
  ].forEach((t, i) => {
    ts = ts + (i !== 3 ? "-" : "_") + (t < 10 ? "0" : "") + t;
  });
  return ts.substring(1);
};

const getExtensionName = () => browser.runtime.getManifest().name;

const isLoadedTemporary = () => browser.runtime.id.endsWith("@temporary-addon");

const log = (level, msg) => {
  level = level.trim().toLowerCase();
  if (
    ["error", "warn"].includes(level) ||
    (isLoadedTemporary() && ["debug", "info", "log"].includes(level))
  ) {
    console[level](
      getExtensionName() + "::" + level.toUpperCase() + "::" + msg,
    );
  }
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const getRandomElementFromArray = (arr) =>
  arr[Math.floor(Math.random() * arr.length)];

const makeId = (length) => {
  const characters = "0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
};

const escapeHtml = (str) =>
  String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

// 999 -> "999", 12345 -> "12k", 123456 -> "1hk", 1234567 -> "1m"
const shortTextForNumber = (number) => {
  if (number < 1000) {
    return number.toString();
  } else if (number < 100000) {
    return Math.floor(number / 1000).toString() + "k";
  } else if (number < 1000000) {
    return Math.floor(number / 100000).toString() + "hk";
  } else {
    return Math.floor(number / 1000000).toString() + "m";
  }
};

const NOTIFY_DEFAULTS = { iconUrl: "icon-96.png", msToClose: 3500 };

// no-op when the optional "notifications" permission has not been granted
const notify = async (title, message = "", aux = {}) => {
  if (!browser.notifications) {
    return;
  }
  const { iconUrl, msToClose } = { ...NOTIFY_DEFAULTS, ...aux };
  try {
    const nid = await browser.notifications.create("" + Date.now(), {
      type: "basic",
      iconUrl,
      title,
      message,
    });
    if (msToClose > 0) {
      setTimeout(() => browser.notifications.clear(nid), msToClose);
    }
  } catch (e) {
    log("warn", "notification failed: " + e);
  }
};

// interface
export {
  getTimeStampStr,
  getExtensionName,
  log,
  sleep,
  isNumeric,
  getRandomElementFromArray,
  makeId,
  isLoadedTemporary,
  escapeHtml,
  notify,
  shortTextForNumber,
};
