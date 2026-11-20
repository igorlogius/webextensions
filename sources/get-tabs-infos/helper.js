/* global browser */

import { getTimeStampStr } from "./utils.js";

function getDocElById(id) {
  return document.getElementById(id);
}

function saveToFile(out, saveFilename) {
  //const nblines = out.split('\n').length -1;
  let a = document.createElement("a");
  if (saveFilename === "") {
    a.download = getTimeStampStr() + " Get Tabs Infos.txt";
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

// interface
export { getDocElById, saveToFile };
