/* global browser */

async function setToStorage(id, value) {
  let obj = {};
  obj[id] = value;
  return browser.storage.local.set(obj);
}

/* input[ radio || checkbox ] */
["toolbarAction", "usecolors"].map((id) => {
  browser.storage.local
    .get(id)
    .then((obj) => {
      let val = obj[id];

      /* checkbox */
      if (Array.isArray(val)) {
        let els = document.getElementsByName(id);

        for (let el of els) {
          if (val.includes(el.value)) {
            el.checked = true;
          } else {
            el.checked = false;
          }

          el.addEventListener("click", (evt) => {
            const vals = Array.from(document.getElementsByName(evt.target.name))
              .filter((el) => el.checked)
              .map((el) => el.value);

            setToStorage(evt.target.name, vals);
          });
        }
      } else {
        /* radio group, only one active */
        let els = document.getElementsByName(id);

        for (let el of els) {
          if (el.value === val) {
            el.checked = true;
          } else {
            el.checked = false;
          }

          el.addEventListener("click", (evt) => {
            setToStorage(evt.target.name, evt.target.value);
          });
        }
      }
    })
    .catch(console.error);
});

/* cleanup delay (seconds) */
(() => {
  const el = document.getElementById("tcdeldelaysec");

  browser.storage.local
    .get("tcdeldelaysec")
    .then((obj) => {
      el.value = typeof obj.tcdeldelaysec === "number" ? obj.tcdeldelaysec : 5;
    })
    .catch(console.error);

  el.addEventListener("change", () => {
    let val = parseInt(el.value, 10);
    if (!Number.isFinite(val) || val < 1) {
      val = 5;
    }
    el.value = val;
    setToStorage("tcdeldelaysec", val);
  });
})();
