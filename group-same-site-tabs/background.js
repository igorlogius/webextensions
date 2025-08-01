/* global browser */

let collapsed = true;

async function grpTabsBySite(all_tabs, sites) {
  sites.forEach(async (site) => {
    const tabIds = all_tabs
      .filter((t) => {
        const turl = new URL(t.url);
        return turl.hostname === site;
      })
      .map((t) => t.id);

    const grpId = await browser.tabs.group({ tabIds });

    site = site.startsWith("www.") ? site.slice(4) : site;
    browser.tabGroups.update(grpId, {
      title: site,
      collapsed,
    });
  });
}

async function grpSingleSite(site) {
  const all_tabs = await browser.tabs.query({
    currentWindow: true,
    pinned: false,
    hidden: false,
  });
  grpTabsBySite(all_tabs, [site]);
}

async function grpSelectedSites() {
  const all_tabs = await browser.tabs.query({
    currentWindow: true,
    pinned: false,
    hidden: false,
  });

  const sites = new Set(
    all_tabs.filter((t) => t.highlighted).map((t) => new URL(t.url).hostname),
  );

  grpTabsBySite(all_tabs, [...sites]);
}

async function grpAllSites() {
  const all_tabs = await browser.tabs.query({
    currentWindow: true,
    pinned: false,
    hidden: false,
  });

  const hostname_tabIds_map = new Map(); // str => set(ints)

  all_tabs.forEach((t) => {
    if (typeof t.url !== "string" || !t.url.startsWith("http")) {
      return;
    }

    const t_urlobj = new URL(t.url);
    const t_hostname = t_urlobj.hostname;

    tmp = hostname_tabIds_map.get(t_hostname);

    if (!tmp) {
      tmp = new Set();
    }
    tmp.add(t.id);

    //
    hostname_tabIds_map.set(t_hostname, tmp);
  });

  // create the groups and move the tabs
  for (let [k, v] of hostname_tabIds_map) {
    const grpId = await browser.tabs.group({
      tabIds: [...v],
    });

    k = k.startsWith("www.") ? k.slice(4) : k;
    browser.tabGroups.update(grpId, {
      title: k,
      collapsed,
    });
  }
}

browser.menus.create({
  title: "Selected Sites",
  contexts: ["tab"],
  onclick: async (clickdata, atab) => {
    if (clickdata.button === 1) {
      collapsed = false;
    } else {
      collapsed = true;
    }
    if (!atab.highlighted) {
      grpSingleSite(new URL(atab.url).hostname);
    } else {
      grpSelectedSites();
    }
  },
});

browser.menus.create({
  title: "All Sites",
  contexts: ["tab"],
  onclick: async (clickdata, tab) => {
    if (clickdata.button === 1) {
      collapsed = false;
    } else {
      collapsed = true;
    }
    grpAllSites();
  },
});

browser.browserAction.onClicked.addListener((tab, clickdata) => {
  if (clickdata.button === 1) {
    collapsed = false;
  } else {
    collapsed = true;
  }
  grpAllSites();
});

browser.commands.onCommand.addListener((cmd) => {
  switch (cmd) {
    case "group-all":
      collapsed = true;
      grpAllSites();
      break;
    case "group-selected":
      collapsed = true;
      grpSelectedSites();
      break;
    case "group-all-uncollapsed":
      collapsed = false;
      grpAllSites();
      break;
    case "group-selected-uncollapsed":
      collapsed = false;
      grpSelectedSites();
      break;
    default:
      break;
  }
});
