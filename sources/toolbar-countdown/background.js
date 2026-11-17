/* global browser */

(async () => {
  let storage = await import("./storage.js");
  const utils = await import("./utils.js");

  //const temporary = browser.runtime.id.endsWith('@temporary-addon'); // debugging?
  const manifest = browser.runtime.getManifest();
  const extname = manifest.name;

  let enddate = NaN;
  let enddatestr = "";
  let enddatename = "";
  let tid;

  const second = 1000;
  const minute = 60 * second;
  const hour = 60 * minute;
  const day = 24 * hour;
  //const week = 7*day;

  const valarr = [/* week,*/ day, hour, minute, second];

  const value_postfix = new Map();
  //value_postfix.set(week, "w");
  value_postfix.set(day, "d");
  value_postfix.set(hour, "h");
  value_postfix.set(minute, "m");
  value_postfix.set(second, "s");

  async function notify(message = "", iconUrl = "icon.png") {
    try {
      await browser.notifications.create("" + Date.now(), {
        type: "basic",
        iconUrl,
        title: extname,
        message,
      });
    } catch (e) {
      // noop
    }
  }

  async function onStorageChanged(/*changes, area*/) {
    let storeid, tmp;
    try {
      enddatestr = await storage.get("string", "enddate", "");
      enddate = Date.parse(enddatestr);
      updateBadge();
    } catch (e) {
      console.error(e);
      enddate = -1;
    }
    enddatename = await storage.get("string", "name", "");
  }

  function updateBadge() {
    let now = Date.now();
    //console.log(enddate < now, enddate);

    if (enddate < 0 || isNaN(enddate) || enddate < now) {
      browser.browserAction.setTitle({
        title: "Name:" + enddatename + "\nDatetime: " + enddatestr,
      });
      browser.browserAction.setBadgeText({ text: "" });
      browser.browserAction.setIcon({
        imageData: getIconImageData(0),
      });
      clearTimeout(tid);
      return;
    }

    let diffsecs = enddate - now;

    let match = false;
    for (let i = 0; i < valarr.length; i++) {
      const k = valarr[i];
      const v = value_postfix.get(k);
      const tmp = Math.floor(diffsecs / k);
      //console.log('tmp', tmp);
      if (tmp > 0) {
        browser.browserAction.setBadgeText({ text: v });
        clearTimeout(tid);
        let remain = now % k;
        if (remain > 1000) {
          tid = setTimeout(updateBadge, remain);
        } else {
          const wait = tmp > 1 ? k : i < valarr.length - 1 ? valarr[i + 1] : k;
          tid = setTimeout(updateBadge, wait);
        }
        browser.browserAction.setTitle({
          title: "Name:" + enddatename + "\nDatetime: " + enddatestr,
        });
        browser.browserAction.setIcon({
          imageData: getIconImageData(tmp),
        });
        match = true;
        break;
      }
    }
    if (!match) {
      browser.browserAction.setBadgeText({ text: "" });
      browser.browserAction.setIcon({
        imageData: getIconImageData(0),
      });
      clearTimeout(tid);
      notify("Countdown " + enddatename + " ended");
    }
  }

  /**/
  function getIconImageData(rank) {
    const imageWidth = 42;
    const imageHeight = 42;
    //const markerSize = 8;
    const font = "bold 24pt 'Arial'";
    const color = "#000000";
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const addText = function (ctx, text, centerX, centerY) {
      // yellow fill
      ctx.fillStyle = "#fa6";
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
    const text = rank !== null ? utils.shortTextForNumber(rank) : "n/a";
    addText(ctx, text, imageWidth / 2, imageHeight / 2 + textOffset);
    return ctx.getImageData(0, 0, imageWidth, imageHeight);
  }
  /**/

  onStorageChanged();
  browser.storage.onChanged.addListener(onStorageChanged);

  updateBadge();

  browser.browserAction.setBadgeBackgroundColor({ color: "#fff00050" });
})();
