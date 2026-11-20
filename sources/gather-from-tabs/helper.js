/* global browser */

import { getTimeStampStr } from "./utils.js";

const manifest = browser.runtime.getManifest();
const extname = manifest.name;

function getDocElById(id) {
  return document.getElementById(id);
}

function translateScopes(scope) {
  switch (scope) {
    case "AllTabs":
      return "Current Windows";
    case "AllTabsAllWindows":
      return "All Windows";
    case "SelectedTabsAllWindows":
      return "Selected All Windows";
    case "SelectedTabs":
      return "Selected Current Windows";
  }
}

function translateActions(action) {
  switch (action) {
    case "ct":
      return "Copy Text";
    case "ch":
      return "Copy HTML";
    case "s":
      return "Save to File";
    case "dn":
      return "Ignore Output";
  }
}

async function getTabs(scope) {
  let queryObject = {};
  switch (scope) {
    case "AllTabs":
      queryObject = {
        url: "<all_urls>",
        hidden: false,
        currentWindow: true,
      };
      break;
    case "AllTabsAllWindows":
      queryObject = {
        url: "<all_urls>",
        hidden: false,
      };
      break;
    case "SelectedTabsAllWindows":
      queryObject = {
        url: "<all_urls>",
        hidden: false,
        highlighted: true,
      };
      break;
    case "SelectedTabs":
      queryObject = {
        url: "<all_urls>",
        hidden: false,
        highlighted: true,
        currentWindow: true,
      };
      break;
  }

  const tabAttrReplacers = [
    "url",
    "protocol",
    "search",
    "port",
    "origin",
    "pathname",
    "hostname",
    "title",
  ];

  return browser.tabs.query(queryObject);
}

function saveToFile(out, saveFilename) {
  //const nblines = out.split('\n').length -1;
  let a = document.createElement("a");
  if (saveFilename === "") {
    a.download = getTimeStampStr() + " " + extname + ".txt";
  } else {
    a.download = saveFilename + ".txt";
  }
  a.setAttribute(
    "href",
    "data:text/plain;charset=utf-8," + encodeURIComponent(out),
  );
  a.click();
  a.remove();
}

async function downloadAsFiles(urls) {
  for (const url of urls) {
    try {
      await browser.downloads.download({
        url,
        conflictAction: "uniquify",
        saveAs: false,
      });
    } catch (e) {
      console.error(e);
    }
  }
}

async function openWindow(urlOrurlsArray) {
  browser.windows.create({
    url: urlOrurlsArray,
  });
}

// interface
export {
  getDocElById,
  translateScopes,
  translateActions,
  getTabs,
  saveToFile,
  downloadAsFiles,
  openWindow,
};
