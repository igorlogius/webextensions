/*global browser */

import { shortTextForNumber } from "./utils.js";

const browserStartTimestamp = Date.now();

const filter = {
  url: [{ schemes: ["http", "https"] }],
};

let tabLoadTimes = {};

// helper functions

function getIconImageData(rank) {
  const imageWidth = 42;
  const imageHeight = 42;
  //const markerSize = 8;
  const font = "bold 18pt 'Arial'";
  const color = "#000000";
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const addText = function (ctx, text, centerX, centerY) {
    // yellow fill
    ctx.fillStyle = getHexColorStringForNumber(rank); // '#ff6';
    ctx.fillRect(0, 0, imageWidth, imageHeight);

    // text / number
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    var maxWidth = imageWidth;
    ctx.fillText(text, centerX, centerY, maxWidth);
  };
  const textOffset = 2; // trying to align text beautifully here
  const text = rank !== null ? shortTextForNumber(rank) : "n/a";
  addText(ctx, text, imageWidth / 2, imageHeight / 2 + textOffset);
  return ctx.getImageData(0, 0, imageWidth, imageHeight);
}

function getHexColorStringForNumber(number) {
  if (number < 1000) {
    return "green"; // green
  } else if (number < 2500) {
    return "yellow"; // yellow
  } else if (number < 5000) {
    return "orange"; // orange
  } else {
    return "red"; // red
  }
}

// callback functions

async function onMessage(data /*, sender*/) {
  if (data.currentWindow === true) {
    const tabsdata = (await browser.tabs.query(data)).map((t) => {
      const loadTime = tabLoadTimes[t.id];
      return {
        index: t.index,
        url: t.url,
        loadtime:
          loadTime && loadTime > 0 && loadTime < browserStartTimestamp
            ? loadTime
            : "n/a",
      };
    });
    return Promise.resolve(tabsdata);
  }
  return false;
}

function onBefore(details) {
  if (details.frameId === 0) {
    // is top-level frame
    tabLoadTimes[details.tabId] = details.timeStamp;
  }
}

function onCompleted(details) {
  if (details.frameId === 0) {
    // is top-level frame

    tabLoadTimes[details.tabId] =
      details.timeStamp - tabLoadTimes[details.tabId];
    const loadTime = tabLoadTimes[details.tabId];

    if (loadTime && loadTime > 0 && loadTime < browserStartTimestamp) {
      browser.pageAction.setIcon({
        tabId: details.tabId,
        imageData: getIconImageData(loadTime),
      });
      browser.pageAction.setTitle({
        tabId: details.tabId,
        title: "Load Time: " + loadTime + " ms",
      });
      browser.pageAction.show(details.tabId);
    }
  }
}

function onRemoved(tabId) {
  if (typeof tabLoadTimes[tabId] !== "undefined") {
    tabLoadTimes[tabId] = undefined;
    delete tabLoadTimes[tabId];
  }
}

// register callback functions

browser.runtime.onMessage.addListener(onMessage);
browser.tabs.onRemoved.addListener(onRemoved);
browser.webNavigation.onBeforeNavigate.addListener(onBefore, filter);
browser.webNavigation.onCompleted.addListener(onCompleted, filter);
browser.webNavigation.onErrorOccurred.addListener(onCompleted); // also calc the time for navigation errors
