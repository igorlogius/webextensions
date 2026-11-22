/*global browser */

import { onChange } from "./form.js";

["scope", "mode", "listmatchers"].map((id) => {
  browser.storage.local
    .get(id)
    .then((obj) => {
      const el = document.getElementById(id);
      let val = obj[id];

      if (typeof val !== "undefined") {
        if (el.type === "checkbox") {
          el.checked = val;
        } else {
          el.value = val;
        }
      }
    })
    .catch((/*err*/) => {});

  let el = document.getElementById(id);
  el.addEventListener("click", onChange);
  el.addEventListener("keyup", onChange);
});
