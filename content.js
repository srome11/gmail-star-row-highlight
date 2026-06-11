(function () {
  "use strict";

  // Guard against double-injection (Safari/Chrome can re-inject on SPA reloads).
  if (window.__gsrhInjected) {
    return;
  }
  window.__gsrhInjected = true;

  const HIGHLIGHT_CLASS = "gsrh-starred-row";

  // Elements that reliably live inside an email row. We never use :has() in a
  // querySelector because it throws on browsers that don't support it and would
  // take the whole script down. Instead we find these anchors and climb to the
  // enclosing <tr>.
  const ROW_ANCHOR_SELECTORS = [
    "span[data-thread-id]",
    "span[data-legacy-thread-id]",
    '[role="checkbox"][aria-label]',
    "td.apU",
    "td.apW",
  ];

  // The star control. aria-label covers "Star"/"Starred"/"Not starred" across
  // locales reasonably well; data-tooltip is the Gmail fallback.
  const STAR_SELECTORS = [
    '[role="checkbox"][aria-label*="tar"]',
    '[role="checkbox"][aria-label*="TAR"]',
    '[data-tooltip*="tar"]',
    "span.T-KT",
    "td.apU span[role]",
  ].join(", ");

  function safeQueryAll(root, selector) {
    try {
      return Array.from((root || document).querySelectorAll(selector));
    } catch (e) {
      return [];
    }
  }

  function safeClosest(node, selector) {
    try {
      if (node && typeof node.closest === "function") {
        return node.closest(selector);
      }
    } catch (e) {
      /* ignore */
    }
    return null;
  }

  function collectRows() {
    const rows = new Set();
    for (const selector of ROW_ANCHOR_SELECTORS) {
      const anchors = safeQueryAll(document, selector);
      for (const anchor of anchors) {
        const row = safeClosest(anchor, "tr");
        if (row) {
          rows.add(row);
        }
      }
    }
    // Last-resort class-based pass (brittle, only used if nothing else matched).
    if (rows.size === 0) {
      for (const row of safeQueryAll(document, "tr.zA")) {
        rows.add(row);
      }
    }
    return rows;
  }

  function findStarControl(row) {
    const controls = safeQueryAll(row, STAR_SELECTORS);
    return controls.length ? controls[0] : null;
  }

  function isStarred(row) {
    const star = findStarControl(row);

    if (star) {
      const ariaChecked = star.getAttribute("aria-checked");
      if (ariaChecked === "true") return true;
      if (ariaChecked === "false") return false;

      const ariaPressed = star.getAttribute("aria-pressed");
      if (ariaPressed === "true") return true;
      if (ariaPressed === "false") return false;

      const label = (
        star.getAttribute("aria-label") ||
        star.getAttribute("data-tooltip") ||
        star.getAttribute("title") ||
        ""
      ).toLowerCase();
      if (label) {
        // Check "not starred"/"unstar" before "starred"/"star" since the
        // negative strings contain the positive ones as substrings.
        if (label.indexOf("not starred") !== -1) return false;
        if (label.indexOf("unstar") !== -1) return false;
        if (label.indexOf("starred") !== -1) return true;
      }
    }

    // Generic icon-state fallback anywhere in the row.
    const starredIcon = safeQueryAll(
      row,
      '[title="Starred"], [aria-label="Starred"], img[alt="Starred"]'
    );
    if (starredIcon.length) return true;

    return false;
  }

  // Tracks an optimistic, intended star state for a row right after the user
  // clicks its star, so we can flip the highlight instantly instead of waiting
  // for Gmail to update its attributes. Held until the real DOM catches up.
  const rowPending = new WeakMap();
  const PENDING_TTL = 2500;

  function desiredState(row) {
    const domState = isStarred(row);
    const pending = rowPending.get(row);
    if (pending) {
      if (Date.now() - pending.at > PENDING_TTL || domState === pending.value) {
        // DOM caught up (or we waited long enough): trust the DOM from now on.
        rowPending.delete(row);
        return domState;
      }
      return pending.value;
    }
    return domState;
  }

  function updateRow(row) {
    if (!row || !row.classList) return;
    try {
      row.classList.toggle(HIGHLIGHT_CLASS, desiredState(row));
    } catch (e) {
      /* ignore */
    }
  }

  function scanAll() {
    collectRows().forEach(updateRow);
  }

  // Debounce scans, but with a hard ceiling so continuous DOM churn (e.g. while
  // Gmail streams the inbox in on load) can never starve the scan indefinitely.
  let scanTimer = null;
  let firstPendingAt = 0;
  const MAX_SCAN_WAIT = 500;
  function scheduleScan(delay) {
    const wait = typeof delay === "number" ? delay : 80;
    const now = Date.now();
    if (!scanTimer) {
      firstPendingAt = now;
    } else {
      if (now - firstPendingAt >= MAX_SCAN_WAIT) {
        clearTimeout(scanTimer);
        scanTimer = null;
        scanAll();
        return;
      }
      clearTimeout(scanTimer);
    }
    scanTimer = setTimeout(function () {
      scanTimer = null;
      scanAll();
    }, wait);
  }

  // When a star is toggled, Gmail flips its state slightly after the click and
  // may even re-render the whole row. We re-check the specific row over a short
  // window AND trigger a full rescan as a fallback in case the original <tr>
  // node was replaced (which would leave our cached reference detached).
  function refreshRowFromTarget(target) {
    const row = safeClosest(target, "tr");
    const ticks = [0, 60, 150, 300, 600, 1000];
    ticks.forEach(function (t) {
      setTimeout(function () {
        if (row && row.isConnected) {
          updateRow(row);
        } else {
          scanAll();
        }
      }, t);
    });
  }

  document.addEventListener(
    "click",
    function (event) {
      const star = safeClosest(event.target, STAR_SELECTORS);
      if (star) {
        // A star click always toggles, so optimistically flip the highlight
        // immediately (no waiting on Gmail to update its attributes), then
        // reconcile against the real DOM over the next second.
        const row = safeClosest(star, "tr");
        if (row) {
          rowPending.set(row, { value: !isStarred(row), at: Date.now() });
          updateRow(row);
        }
        refreshRowFromTarget(star);
      }
    },
    true
  );

  // Keyboard shortcut "s" stars the focused/selected conversation.
  document.addEventListener(
    "keydown",
    function (event) {
      if (event.key === "s" || event.key === "S") {
        scheduleScan(150);
      }
    },
    true
  );

  let observer = null;
  function startObserver() {
    if (observer) return;
    try {
      observer = new MutationObserver(function (mutations) {
        let shouldScan = false;
        for (const mutation of mutations) {
          if (mutation.type === "attributes") {
            const row = safeClosest(mutation.target, "tr");
            if (row) {
              updateRow(row);
            } else {
              shouldScan = true;
            }
          } else if (mutation.type === "childList") {
            shouldScan = true;
          }
          if (shouldScan) break;
        }
        if (shouldScan) {
          scheduleScan();
        }
      });

      // Observe the whole document so we survive Gmail swapping out its main
      // container during navigation. attributeFilter keeps this cheap.
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["aria-checked", "aria-label", "title", "data-tooltip"],
      });
    } catch (e) {
      /* ignore */
    }
  }

  // Re-scan on SPA navigation and when the tab becomes visible again. Use the
  // ramp here too because navigation triggers progressive re-hydration just
  // like a fresh load.
  window.addEventListener("hashchange", function () {
    rampScansSafe();
  });
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) {
      rampScansSafe();
    }
  });

  // Forward declaration guard: rampScans is defined below; wrap so these
  // listeners work regardless of declaration order.
  function rampScansSafe() {
    if (typeof rampScans === "function") {
      rampScans();
    } else {
      scheduleScan(150);
    }
  }

  // Safety-net: a cheap periodic rescan guarantees correctness even if the
  // observer ever misses a mutation. 1.5s is imperceptible and low-cost.
  setInterval(scanAll, 1500);

  // Ramped scans after load/navigation: Gmail hydrates stars progressively, so
  // a dense burst early then tapering off catches late-rendered rows fast
  // without polling forever.
  function rampScans() {
    [0, 150, 400, 800, 1500, 2500, 4000, 6000].forEach(function (t) {
      setTimeout(scanAll, t);
    });
  }

  function start() {
    startObserver();
    rampScans();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
  // Also re-ramp once everything (including async chunks) has loaded.
  window.addEventListener("load", rampScans);
})();
