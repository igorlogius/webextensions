/* global browser */

import { onChange } from "./form.js";

["styles"].map((id) => {
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
  el.addEventListener("input", onChange);
});

// The popup-mode radios share one storage key ("popupMode") rather than
// each having their own, so they're handled separately from the generic
// per-id loop above.
browser.storage.local
  .get("popupMode")
  .then((obj) => {
    const mode = obj.popupMode === "toolbar" ? "toolbar" : "window"; // default
    document.querySelector(`input[name="popupMode"][value="${mode}"]`).checked =
      true;
  })
  .catch(console.error);

document.querySelectorAll('input[name="popupMode"]').forEach((el) => {
  el.addEventListener("change", (evt) => {
    if (evt.target.checked) {
      browser.storage.local
        .set({ popupMode: evt.target.value })
        .catch(console.error);
    }
  });
});

document.getElementById("reset").addEventListener("click", async () => {
  if (
    !confirm(
      "Are you sure?\nThe current stylesheet data will be lost when you click on ok.",
    )
  ) {
    return;
  }

  let tmp = await fetch(browser.runtime.getURL("popup.css"));
  tmp = await tmp.text();
  let el = document.getElementById("styles");
  el.value = tmp;
  browser.storage.local.set({ styles: tmp });
});
