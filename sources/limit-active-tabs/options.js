/* global browser */

import { onChange } from "./form.js";

["maxactivtabs", "includepins", "listmatchers"].map((id) => {
  browser.storage.local
    .get(id)
    .then((obj) => {
      let el = document.getElementById(id);
      let val = obj[id];

      if (typeof val !== "undefined") {
        if (el.type === "checkbox") {
          el.checked = val;
        } else {
          el.value = val;
        }
      }
    })
    .catch(console.error);

  let el = document.getElementById(id);
  el.addEventListener("click", onChange);
  el.addEventListener("keyup", onChange);
  /*el.addEventListener("keypress", function allowOnlyNumbers(event) {
    if (event.key.length === 1 && /\D/.test(event.key)) {
      event.preventDefault();
    }
  });*/
});
