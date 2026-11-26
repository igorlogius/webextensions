/* global browser */

import * as storage from "./storage.js";

let closeThreshold = 7;
let saveFolder = "unfiled_____";
const ALARM_PREFIX = "tabCleanUp_";
// per-rule save folder marker meaning "close without bookmarking"
const SAVE_FOLDER_NONE = "__none__";
// alarm name -> rule parameters
let intervalRules = new Map();
let autostart = false;
let ignoreRules = [];

const asyncFilter = async (arr, predicate) => {
  const results = await Promise.all(arr.map(predicate));
  return arr.filter((_v, index) => results[index]);
};

function updateBadge(text, color) {
  browser.browserAction.setBadgeText({
    text,
  });
  browser.browserAction.setBadgeBackgroundColor({
    color,
  });
}

// Does a tab's container (cn, null = not in a container) satisfy a rule?
// - not in a container: only if the rule has "no container" enabled
// - in a container: only if the rule has a container name regex and it matches
// Both can be enabled at the same time for one rule.
function containerMatches(cn, containerNameMatcher, matchNoContainer) {
  if (cn === null) {
    return matchNoContainer;
  }
  return containerNameMatcher !== null && containerNameMatcher.test(cn);
}

// Per-rule "also match tabs outside of containers" flag, one line per rule:
// "1" = yes, "0" = no. A missing/unknown line comes from a config saved by an
// older version, where an empty container pattern meant "no container only"
// and a non-empty one meant "containers only".
function parseNoContainerFlag(line, containerRegexStr) {
  const v = (line || "").trim();
  if (v === "1") {
    return true;
  }
  if (v === "0") {
    return false;
  }
  return containerRegexStr === "";
}

async function rebuildIgnoreRules(
  ignorerulesStr_container_regexs,
  ignorerulesStr_url_regexs,
  ignorerulesStr_no_container,
) {
  ignoreRules = [];

  const container_regexs = ignorerulesStr_container_regexs.split("\n");
  const url_regexs = ignorerulesStr_url_regexs.split("\n");
  const no_container_flags = (ignorerulesStr_no_container || "").split("\n");

  for (let i = 0; i < container_regexs.length && i < url_regexs.length; i++) {
    try {
      let left = container_regexs[i].trim();
      let right = url_regexs[i].trim();

      if (!left.startsWith("#") && !right.startsWith("#")) {
        const containerNameMatcher = left === "" ? null : new RegExp(left);
        const urlMatcher = right === "" ? null : new RegExp(right);
        const matchNoContainer = parseNoContainerFlag(
          no_container_flags[i],
          left,
        );
        if (
          urlMatcher !== null &&
          (containerNameMatcher !== null || matchNoContainer)
        ) {
          ignoreRules.push({
            containerNameMatcher,
            matchNoContainer,
            urlMatcher,
          });
        }
      }
    } catch (e) {
      console.error(e);
    }
  }
}

async function clearIntervalAlarms() {
  const alarms = await browser.alarms.getAll();
  for (const a of alarms) {
    if (a.name.startsWith(ALARM_PREFIX)) {
      await browser.alarms.clear(a.name);
    }
  }
  intervalRules.clear();
}

async function rebuildIntervalHandlers(
  intervalrulesStr_time_ms_and_container_regexs,
  intervalrulesStr_url_regexs,
  intervalrulesStr_save_folders,
  intervalrulesStr_no_container,
) {
  // now lets rebuild and start the new alarms

  const time_ms_and_container_regexs =
    intervalrulesStr_time_ms_and_container_regexs.split("\n");
  const url_regexs = intervalrulesStr_url_regexs.split("\n");
  // one line per rule (same line index as the other two lists).
  // "" = use the default folder, SAVE_FOLDER_NONE = don't save, else a folder id.
  // Missing lines (config saved by an older version) mean "use the default".
  const save_folders = (intervalrulesStr_save_folders || "").split("\n");
  // "1"/"0" per rule: also match tabs that are not in a container
  const no_container_flags = (intervalrulesStr_no_container || "").split("\n");

  for (
    let i = 0;
    i < time_ms_and_container_regexs.length && i < url_regexs.length;
    i++
  ) {
    try {
      let left = time_ms_and_container_regexs[i].trim();
      let right = url_regexs[i].trim();

      if (
        !left.startsWith("#") &&
        !right.startsWith("#") &&
        right !== "" &&
        left !== ""
      ) {
        let left_parts = left.split(",");
        if (left_parts.length < 2) {
          continue;
        }

        const minIdleTimeMilliSecs = parseInt(left_parts[0].trim());
        if (
          !Number.isFinite(minIdleTimeMilliSecs) ||
          minIdleTimeMilliSecs <= 0
        ) {
          continue;
        }

        left = left_parts.slice(1).join(",");

        const containerNameMatcher = left === "" ? null : new RegExp(left);
        const urlMatcher = right === "" ? null : new RegExp(right);
        const matchNoContainer = parseNoContainerFlag(
          no_container_flags[i],
          left,
        );

        // a rule that matches neither container tabs nor non-container tabs
        // can never close anything
        if (containerNameMatcher === null && !matchNoContainer) {
          continue;
        }

        const name = ALARM_PREFIX + i;
        intervalRules.set(name, {
          minIdleTimeMilliSecs,
          containerNameMatcher,
          matchNoContainer,
          urlMatcher,
          saveFolder: (save_folders[i] || "").trim(),
          //consider_hasText,
        });

        const periodInMinutes = minIdleTimeMilliSecs / 60000;
        browser.alarms.create(name, {
          // first run after one period, like setInterval did
          delayInMinutes: periodInMinutes,
          periodInMinutes,
        });
      }
    } catch (e) {
      console.error(e);
    }
  }
}

async function getContainerNameFromCookieStoreId(csid) {
  try {
    const contextualIdentity = await browser.contextualIdentities.get(csid);
    return contextualIdentity.name;
  } catch (e) {
    // not inside a container
  }
  return null;
}

// Bookmarks the tab in the folder chosen by the rule. A rule can use the
// default folder (""), skip saving (SAVE_FOLDER_NONE) or name its own folder.
// If a rule's own folder no longer exists, fall back to the default folder
// so the tab is not lost.
async function saveTabAsBookmark(t, rule) {
  const ruleFolder = typeof rule.saveFolder === "string" ? rule.saveFolder : "";

  if (ruleFolder === SAVE_FOLDER_NONE) {
    return;
  }

  const candidates = [];
  if (ruleFolder !== "") {
    candidates.push(ruleFolder);
  }
  if (typeof saveFolder === "string" && saveFolder !== "") {
    if (!candidates.includes(saveFolder)) {
      candidates.push(saveFolder);
    }
  }

  for (const parentId of candidates) {
    try {
      await browser.bookmarks.create({
        title: t.title,
        url: t.url,
        parentId,
      });
      return;
    } catch (e) {
      console.error(e);
    }
  }
}

async function tabCleanUp(input) {
  if (!autostart) {
    return;
  }

  // to check idle time
  const epoch_now = new Date().getTime();

  let all_tabs = (
    await asyncFilter(
      await browser.tabs.query({
        // we dont want to suprise users and active tabs have no usable
        // lastAccessed time anyways
        active: false,
        // ignore audible
        audible: false,
        // ignore pinned
        pinned: false,
        // care only about normal windows
        windowType: "normal",
      }),
      async (t) => {
        // filter ignored tabs
        const cn = await getContainerNameFromCookieStoreId(t.cookieStoreId);
        for (const el of ignoreRules) {
          if (
            containerMatches(
              cn,
              el.containerNameMatcher,
              el.matchNoContainer,
            ) &&
            el.urlMatcher.test(t.url)
          ) {
            return false;
          }
        }
        return true;
      },
    )
  ).sort((a, b) => {
    return a.lastAccessed - b.lastAccessed;
  });

  //console.debug(all_tabs.map( t => t.cookieStoreId + "_" + t.url ));

  let max_nb_of_tabs_to_close = all_tabs.length - closeThreshold;

  if (max_nb_of_tabs_to_close < 1) {
    return;
  }

  for (const t of all_tabs) {
    // stop when we reach the closeThreshold
    if (max_nb_of_tabs_to_close < 1) {
      continue;
    }

    const cn = await getContainerNameFromCookieStoreId(t.cookieStoreId);
    // check the container
    if (
      !containerMatches(cn, input.containerNameMatcher, input.matchNoContainer)
    ) {
      continue;
    }

    // check the URL
    if (input.urlMatcher !== null) {
      if (!input.urlMatcher.test(t.url)) {
        continue;
      }
    }

    // check the idle aka. last accessed time of the tab
    const delta = epoch_now - t.lastAccessed;
    if (delta < input.minIdleTimeMilliSecs) {
      continue;
    }

    await saveTabAsBookmark(t, input);
    await browser.tabs.remove(t.id);
    max_nb_of_tabs_to_close--;
  }
}

async function onBAClicked(tab) {
  browser.runtime.openOptionsPage();
}

async function onStorageChanged() {
  autostart = await storage.get("boolean", "autostart", false);
  saveFolder = await storage.get("string", "saveFolder", "unfiled_____");
  closeThreshold = await storage.get(
    "number",
    "closeThreshold",
    closeThreshold,
  );

  // stop all running alarms (also when switching to "off")
  await clearIntervalAlarms();

  if (autostart) {
    updateBadge("on", "green");

    await rebuildIgnoreRules(
      await storage.get("string", "ignorerules_container_regex", ""),
      await storage.get("string", "ignorerules_url_regex", ""),
      await storage.get("string", "ignorerules_no_container", ""),
    );
    await rebuildIntervalHandlers(
      await storage.get(
        "string",
        "intervalrules_time_ms_and_container_regex",
        "",
      ),
      await storage.get("string", "intervalrules_url_regex", ""),
      await storage.get("string", "intervalrules_save_folder", ""),
      await storage.get("string", "intervalrules_no_container", ""),
    );
  } else {
    updateBadge("off", "red");
  }
}

// must be registered synchronously at top level
browser.alarms.onAlarm.addListener((alarm) => {
  const rule = intervalRules.get(alarm.name);
  if (rule) {
    tabCleanUp(rule);
  }
});

(async () => {
  await onStorageChanged();
  browser.browserAction.onClicked.addListener(onBAClicked);
  browser.runtime.onMessage.addListener((data, sender) => {
    if (data.cmd === "storageChanged") {
      onStorageChanged();
    }
  });
})();
