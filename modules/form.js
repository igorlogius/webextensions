/* global browser */

// Generic "save on input" handler for options pages: stores the value of the
// changed <input>/<textarea>/<select> in browser.storage.local, using the
// element id as the storage key. Empty values are ignored and number inputs
// are clamped to their min attribute.
//
// usage: el.addEventListener("input", onChange);
function onChange(evt) {
  let id = evt.target.id;
  let el = document.getElementById(id);

  let value = el.type === "checkbox" ? el.checked : el.value;
  let obj = {};

  if (value === "") {
    return;
  }
  if (el.type === "number") {
    try {
      value = parseInt(value);
      if (isNaN(value)) {
        value = el.min;
      }
      if (value < el.min) {
        value = el.min;
      }
    } catch (e) {
      value = el.min;
    }
  }

  obj[id] = value;

  browser.storage.local.set(obj).catch(console.error);
}

// interface
export { onChange };
