(async () => {
  const storage = await import("./storage.js");
  const fallback_styles = (async () => {
    let tmp = await fetch(browser.runtime.getURL("popup.css"));
    return await tmp.text();
  })();

  const styles = await storage.get("string", "styles", fallback_styles);

  let styleSheet = document.createElement("style");
  styleSheet.innerText = styles;
  document.head.appendChild(styleSheet);

  const template = document.getElementById("li_template");
  const elements = new Set();
  // const collator = new Intl.Collator();
  const styleElementHidden = "none";
  const styleElementDisplay = "block";

  // ---- Keyboard navigation across the currently visible hits ----------
  // A "nav item" is either one specific hit line (li[data-match-text],
  // built by buildHitList — there can be several per tab) or, if a shown
  // tab-result has no individual hit lines, the tab-result entry itself.
  // This mirrors what a click can land on, so Enter can just replay a
  // real click on the selected item instead of duplicating the click
  // handler's logic.
  let navItems = [];
  let selectedIndex = -1;

  function computeNavItems() {
    const items = [];
    for (const li of document.getElementById("resultlist").children) {
      if (li.style.display === styleElementHidden) {
        continue;
      }
      const tab = li.__tab;
      const hitLis = li.querySelectorAll("li[data-match-text]");
      if (hitLis.length > 0) {
        hitLis.forEach((hitLi) => items.push({ tab, hitLi, el: hitLi }));
      } else {
        items.push({ tab, hitLi: null, el: li.querySelector("a") });
      }
    }
    return items;
  }

  function clearNavSelection() {
    document
      .querySelectorAll(".nav-selected")
      .forEach((e) => e.classList.remove("nav-selected"));
  }

  function resetNavSelection() {
    selectedIndex = -1;
    navItems = [];
    clearNavSelection();
  }

  function moveSelection(delta) {
    navItems = computeNavItems();
    if (navItems.length === 0) {
      selectedIndex = -1;
      clearNavSelection();
      return;
    }
    selectedIndex =
      selectedIndex === -1
        ? delta > 0
          ? 0
          : navItems.length - 1
        : (selectedIndex + delta + navItems.length) % navItems.length;

    clearNavSelection();
    const { el } = navItems[selectedIndex];
    el.classList.add("nav-selected");
    el.scrollIntoView({ block: "nearest" });
  }

  // Mouse hover moves the same selection cursor arrow keys control, so the
  // highlighted item and "Enter activates this" state always agree with
  // whatever the user is pointing at. No scrollIntoView here — the user is
  // already looking at this element.
  function selectNavItemByElement(el) {
    navItems = computeNavItems();
    const idx = navItems.findIndex((item) => item.el === el);
    if (idx === -1) {
      return;
    }
    selectedIndex = idx;
    clearNavSelection();
    el.classList.add("nav-selected");
  }

  async function activateSelection() {
    navItems = computeNavItems();
    if (navItems.length === 0) {
      return;
    }
    if (selectedIndex === -1 || selectedIndex >= navItems.length) {
      selectedIndex = 0; // Enter with no prior navigation: use the first hit
    }
    const { tab, hitLi } = navItems[selectedIndex];
    // Call directly (not via a synthetic dispatched click) so this stays
    // within the real, trusted Enter keydown event's call stack — see
    // activateHit's comment for why that matters.
    await activateHit(tab, hitLi);
  }

  let last_searchStr = "";

  // When opened as its own popup window (see background.js), "current
  // window" would just be this small popup window itself, which has no
  // other tabs to search. background.js passes the id of the browsing
  // window the button was actually clicked in via the URL; fall back to
  // currentWindow for the "Open in Tab" case, where this page runs inside
  // the browsing window itself and currentWindow is correct as-is.
  function getSourceWindowIdFromQuery() {
    const raw = new URLSearchParams(window.location.search).get("windowId");
    const id = raw === null ? NaN : parseInt(raw, 10);
    return Number.isNaN(id) ? null : id;
  }
  const sourceWindowId = getSourceWindowIdFromQuery();
  const isToolbarPopup =
    new URLSearchParams(window.location.search).get("mode") === "toolbar";
  const ownWindowId = (await browser.windows.getCurrent()).id;

  const tabs = await browser.tabs.query(
    sourceWindowId !== null
      ? {
          windowId: sourceWindowId,
          url: ["<all_urls>"],
          status: "complete",
          discarded: false,
        }
      : {
          currentWindow: true,
          url: ["<all_urls>"],
          status: "complete",
          discarded: false,
        },
  );

  function buildHitList(hits, regexmode, caseSensitive, searchedVal) {
    const ul = document.createElement("ul");
    ul.style.fontSize = "0.8em";
    hits.forEach((hit) => {
      const li = document.createElement("li");
      const matchText = regexmode
        ? hit.mid
        : caseSensitive
          ? searchedVal
          : searchedVal.toUpperCase();
      // The exact on-page position was computed by content.js in the same
      // pass that found this match, so jumping to it later needs no second
      // search of the page — just this stored rect.
      li.dataset.matchText = matchText;
      li.__matchRect = hit.rect || null;

      li.appendChild(document.createTextNode(hit.left));

      const mark = document.createElement("b");
      const span = document.createElement("span");
      span.className = "hit-mark";
      span.textContent = matchText;
      mark.appendChild(span);
      li.appendChild(mark);

      li.appendChild(document.createTextNode(hit.right));
      ul.appendChild(li);
    });
    return ul;
  }

  // Shared by mouse click and Enter/keyboard activation: activates the
  // hit's tab, brings its window to the foreground, jumps to/highlights
  // the specific hit line (if any), then brings focus back to this popup
  // window. Called directly (not via a synthetic dispatched event) from
  // both paths so the windows.update calls happen within the real,
  // trusted click/keydown event's call stack — a synthetic MouseEvent
  // dispatched from a keydown handler loses that trusted-user-action
  // context, and the final focus-back windows.update was silently
  // ignored as a result (mouse clicks worked, Enter didn't).
  async function activateHit(tab, hitLi) {
    try {
      await browser.tabs.update(tab.id, { active: true });
      await browser.windows.update(tab.windowId, { focused: true });
    } catch (e) {
      //console.warn(e);
    }

    if (hitLi) {
      const matchText = hitLi.dataset.matchText;
      const rect = hitLi.__matchRect;

      // Best-effort cosmetic pass: ask Firefox's native find to highlight
      // every occurrence on the page. This never blocks the jump below —
      // the exact position we scroll to comes from the rect content.js
      // computed directly when it found this match, not from correlating
      // it against this separate search.
      if (matchText) {
        browser.find
          .find(matchText, {
            tabId: tab.id,
            caseSensitive: document.getElementById("caseSensitive").checked,
            matchDiacritics: document.getElementById("accentSensitive").checked,
          })
          .then(() => browser.find.highlightResults({ tabId: tab.id }))
          .catch(() => {
            //console.warn(e);
          });
      }

      if (rect) {
        try {
          await browser.tabs.sendMessage(tab.id, {
            cmd: "scroll",
            yoffset: rect.top,
            rect,
          });
        } catch (e) {
          //console.warn(e);
        }
      }
    }

    if (isToolbarPopup) {
      // Classic anchored toolbar panel: it can't reliably keep keyboard
      // focus once another window is raised (that's exactly what forced
      // the move to a standalone window in the first place), so don't
      // even try — close as soon as the hit has been jumped to/
      // highlighted above.
      window.close();
      return;
    }

    // Bringing the hit's tab/window to the foreground above just moved OS
    // focus there. Since this popup is a real, independent window (not
    // the old embedded toolbar panel), we can reliably ask for it back
    // with a plain windows.update — no PanelMultiView quirks here — so
    // the search field stays usable right away.
    try {
      await browser.windows.update(ownWindowId, { focused: true });
    } catch (e) {
      //console.warn(e);
    }
    document.getElementById("searchField").focus();
  }

  async function createTabList() {
    //tabs.sort((a, b) => collator.compare(a.title, b.title));
    tabs.sort((a, b) => {
      return b.index - a.index;
    });

    let tabIdx = 1;
    for (const tab of tabs) {
      //
      const element = template.content.firstElementChild.cloneNode(true);

      // jump index
      tabIdx += 1;
      element.tabId = tab.id;
      element.__tab = tab;
      element.tabIndex = tabIdx;

      // first tab preview without search
      element.querySelector(".title").innerText = tab.title;
      //element.querySelector(".result").innerText = tab.url.slice(0, 80);

      const favicon = element.querySelector(".favicon");
      const fallbackIcon = browser.runtime.getURL("icon.png");
      favicon.src = tab.favIconUrl || fallbackIcon;
      favicon.addEventListener(
        "error",
        () => {
          favicon.src = fallbackIcon;
        },
        { once: true },
      );

      // handle click or arrow-keys
      element.addEventListener("keydown", async (event) => {
        if (event.key === "Enter") {
          event.target.querySelector("a").click();
        }
      });
      element.querySelector("a").title =
        "Click: activate tab & jump to the hit (popup stays open)";

      element.querySelector("a").addEventListener("click", async (event) => {
        // Only jump to a specific location if a result line exists for this
        // row: prefer the exact line clicked, falling back to the first hit
        // (e.g. when the title/favicon area was clicked rather than a
        // specific line).
        const hitLi =
          event.target.closest("li[data-match-text]") ||
          event.currentTarget.querySelector("li[data-match-text]");

        await activateHit(tab, hitLi);
      });

      elements.add(element);
      element.style.display = styleElementHidden; // hide all elements
    }
    document.getElementById("resultlist").append(...elements);
  }

  function createTextFieldEventListener() {
    setInterval(function () {
      handeInputChange();
    }, 500);
  }

  let last_searchField_value = "";
  let last_maxhits_value = "";
  let last_caseSensitive_value = "";
  let last_accentSensitive_value = "";
  let last_regexmode_value = "";

  async function handeInputChange(event) {
    let searchedVal = document.getElementById("searchField").value;
    let maxhits = parseInt(document.getElementById("maxhits").value, 10) || 3;
    let caseSensitive = document.getElementById("caseSensitive").checked;
    let accentSensitive = document.getElementById("accentSensitive").checked;
    let regexmode = document.getElementById("regexmode").checked;

    if (last_searchField_value !== searchedVal) {
      storage.set("lastsearch", searchedVal);
    }
    if (last_maxhits_value !== maxhits) {
      storage.set("lastmaxhits", maxhits);
    }
    if (last_caseSensitive_value !== caseSensitive) {
      storage.set("lastcaseSensitive", caseSensitive);
    }
    if (last_accentSensitive_value !== accentSensitive) {
      storage.set("lastaccentSensitive", accentSensitive);
    }
    if (last_regexmode_value !== regexmode) {
      storage.set("lastregexmode", regexmode);

      if (regexmode) {
        document.getElementById("accentSensitive").setAttribute("disabled", "");
        document.getElementById("caseSensitive").setAttribute("disabled", "");
      } else {
        document.getElementById("accentSensitive").removeAttribute("disabled");
        document.getElementById("caseSensitive").removeAttribute("disabled");
      }
    }

    if (
      last_searchField_value === searchedVal &&
      last_maxhits_value === maxhits &&
      last_caseSensitive_value === caseSensitive &&
      last_accentSensitive_value === accentSensitive &&
      last_regexmode_value === regexmode
    ) {
      return;
    }
    /*
    console.debug(
      "handeInputChange",
      searchedVal,
      maxhits,
      caseSensitive,
      accentSensitive,
      regexmode
    );
    */
    last_searchField_value = searchedVal;
    last_maxhits_value = maxhits;
    last_caseSensitive_value = caseSensitive;
    last_accentSensitive_value = accentSensitive;
    last_regexmode_value = regexmode;

    let noresult = true;
    let totalHits = 0;
    let tabsWithHits = 0;
    let tabIdx = 1;
    document.getElementById("searchprogress").setAttribute("max", tabs.length);
    let counter = 0;
    for (const tab of tabs) {
      document
        .getElementById("searchprogress")
        .setAttribute("value", (counter += 1));
      let response;
      if (searchedVal.length > 2) {
        try {
          response = await browser.tabs.sendMessage(tab.id, {
            cmd: regexmode ? "regexsearch" : "search",
            message: searchedVal,
            maxhits: maxhits,
            caseSensitive: caseSensitive,
            accentSensitive: accentSensitive,
          });
        } catch (e) {
          console.error(e);
        }
      }

      if (response && response.hits.length > 0) {
        totalHits += response.hits.length;
        tabsWithHits += 1;
      }

      elements.forEach((e) => {
        if (searchedVal.length < 3) {
          e.style.display = styleElementHidden; // hide elements
          return;
        }
        if (e.tabId !== tab.id) {
          return;
        }
        let show = false;
        const hasHits = Boolean(response && response.hits.length > 0);

        if (response) {
          if (!hasHits && searchedVal) {
            e.style.display = styleElementHidden;
          } else if (!hasHits && searchedVal.toString().length === 0) {
            e.style.display = styleElementDisplay;
            e.querySelector(".result").innerText = tab.url.slice(0, 80);
          } else {
            e.style.display = styleElementDisplay;
            if (searchedVal) {
              const resultEl = e.querySelector(".result");
              resultEl.replaceChildren(
                buildHitList(
                  response.hits,
                  regexmode,
                  caseSensitive,
                  searchedVal,
                ),
              );
              show = true;
              noresult = false;
            }
          }
          e.tabIndex = tabIdx;
          tabIdx += 1;
          if (!show) {
            e.style.display = styleElementHidden; // hide elements
          } else {
            e.style.display = styleElementDisplay;
          }
        }
      });
    }

    resetNavSelection();

    if (searchedVal.length < 3) {
      document.getElementById("note").innerText = "Type at least 3 characters";
    } else if (searchedVal.length > 2 && noresult) {
      document.getElementById("note").innerText = "No matches found";
    } else {
      const hitWord = totalHits === 1 ? "match" : "matches";
      const tabWord = tabsWithHits === 1 ? "tab" : "tabs";
      document.getElementById("note").innerText =
        `${totalHits} ${hitWord} in ${tabsWithHits} ${tabWord}`;
    }
  }

  /**/
  async function createDocumentListener() {
    // Three ways this page can be showing, and each needs different
    // layout/detach handling:
    //  - toolbar panel (isToolbarPopup): windows.getCurrent() reports the
    //    *hosting* browser window here (type "normal"), so it can't be
    //    told apart from a real tab by type alone — the explicit
    //    mode=toolbar query param is what tells them apart.
    //  - our own compact popup window (background.js, type "popup").
    //  - a normal browser tab (detach button / "Open in Tab", type
    //    "normal"): the only case with nothing left to detach to, and
    //    the only one that wants the wider "detached" layout.
    const currentWindow = await browser.windows.getCurrent();
    //const isNormalTab = !isToolbarPopup && currentWindow.type !== "popup";

    if (!isToolbarPopup) {
      // Real, independently-sized window (our compact popup window or a
      // normal tab) rather than a panel that auto-sizes to its content.
      document.body.classList.add("full-window");
    }
    /*if (isNormalTab) {
      document.getElementById("detach").style.display = "none";
      document.body.classList.add("detached");
    }*/

    // Delegated (not per-element) since the hit lines are rebuilt on every
    // search: hovering a hit line, or the entry itself when it has no hit
    // lines, selects it exactly like arrow-key navigation would.
    document.getElementById("resultlist").addEventListener(
      "mouseover",
      (event) => {
        const target =
          event.target.closest("li[data-match-text]") ||
          event.target.closest(".tab-result a");
        if (target) {
          selectNavItemByElement(target);
        }
      },
      false,
    );

    /*document.getElementById("detach").addEventListener(
      "click",
      async function (event) {
        // Carry the source window along so the detached tab searches the
        // same browsing window's tabs instead of falling back to
        // "currentWindow" (which, at the moment of this click, is still
        // this popup window).

  await browser.windows.create({
    url: `popup.html`,
    type: "popup",
    width: 520,
    height: 640,
  });
        window.close();
      },
      false,
    );*/
    // Arrow keys step the selection through the currently visible hits
    // (instead of moving the text cursor); Enter activates the selected
    // hit exactly like a click.
    document.getElementById("searchField").addEventListener(
      "keydown",
      function (event) {
        if (event.key === "ArrowUp") {
          event.preventDefault();
          event.stopPropagation();
          moveSelection(-1);
          return false;
        }
        if (event.key === "ArrowDown") {
          event.preventDefault();
          event.stopPropagation();
          moveSelection(1);
          return false;
        }
        if (event.key === "Enter") {
          event.preventDefault();
          event.stopPropagation();
          activateSelection();
          event.target.focus();
          return false;
        }
      },
      false,
    );
  }
  /**/

  /*
  function handleKeyDown(event) {
    for (const fe of document.querySelectorAll("[tabIndex]")) {
      if (
        fe.style.display !== styleElementHidden &&
        fe.tabIndex > document.activeElement.tabIndex
      ) {
        fe.focus();
        return;
      }
    }
  }

  function handleKeyUp(event) {
    for (const fe of Array.from(
      document.querySelectorAll("[tabIndex]")
    ).reverse()) {
      if (
        fe.style.display !== styleElementHidden &&
        fe.tabIndex < document.activeElement.tabIndex
      ) {
        fe.focus();
        return;
      }
    }
  }
*/

  //

  await createTabList();
  createTextFieldEventListener();
  createDocumentListener();

  last_searchStr = await storage.get("string", "lastsearch", "");
  if (last_searchStr !== "") {
    document.getElementById("searchField").value = last_searchStr;
  }
  let lastmaxhits = await storage.get("integer", "lastmaxhits", 3);
  document.getElementById("maxhits").value = lastmaxhits;

  if (await storage.get("boolean", "lastcaseSensitive", false)) {
    document.getElementById("caseSensitive").setAttribute("checked", "");
  } else {
    document.getElementById("caseSensitive").removeAttribute("checked");
  }

  if (await storage.get("boolean", "lastaccentSensitive", false)) {
    document.getElementById("accentSensitive").setAttribute("checked", "");
  } else {
    document.getElementById("accentSensitive").removeAttribute("checked");
  }

  if (await storage.get("boolean", "lastregexmode", false)) {
    document.getElementById("regexmode").setAttribute("checked", "");
    document.getElementById("accentSensitive").setAttribute("disabled", "");
    document.getElementById("caseSensitive").setAttribute("disabled", "");
  } else {
    document.getElementById("regexmode").removeAttribute("checked");
    document.getElementById("accentSensitive").removeAttribute("disabled");
    document.getElementById("caseSensitive").removeAttribute("disabled");
  }

  //
  setTimeout(() => {
    document.getElementById("searchField").focus();
    document.getElementById("searchField").select();
  }, 800);
})();
