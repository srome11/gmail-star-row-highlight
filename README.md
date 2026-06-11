# Gmail Star Row Highlight

A browser extension that highlights the **entire email row** in Gmail when its
star is selected. Works in **Chrome** (and other Chromium browsers) and
**Safari** on macOS.

## What it does

When you star an email in the Gmail list view, the whole row gets a soft gold
background and a single left accent bar. Unstarring removes it instantly.
Highlights survive page reloads, label switches, pagination, keyboard shortcuts
(`s`), and Gmail's single-page navigation.

## Files

| File | Purpose |
|------|---------|
| `manifest.json` | Manifest V3 extension definition (shared by Chrome & Safari) |
| `content.js` | Star detection + row highlighting logic |
| `styles.css` | Highlight styling (light + dark theme aware) |
| `build-safari.sh` | One-command build of the Safari macOS app |

## Why it's robust

- **No fragile `:has()` queries.** Rows are found via stable `data-thread-id`
  anchors and `closest('tr')`, so a browser without `:has()` support can't break it.
- **Every DOM query is wrapped in try/catch** — a selector change can never take
  the whole script down.
- **Star state comes from ARIA** (`aria-checked`, `aria-pressed`) with label/title
  fallbacks, which Google keeps stable for accessibility.
- **Instant feedback on click.** Star/unstar toggles the highlight optimistically
  the moment you click, then reconciles with Gmail's DOM once it catches up.
- **Self-healing:** a `MutationObserver`, ramped post-load scans, and a 1.5-second
  safety rescan keep highlights correct even if a mutation is ever missed.
- **Double-injection guarded**, so Safari/Chrome re-injections don't stack listeners.
- **Seamless row fill** — the highlight covers the full row with no darker lines
  between columns.

---

## Install in Chrome / Edge / Brave

1. Open `chrome://extensions`
2. Turn on **Developer mode** (top-right)
3. Click **Load unpacked**
4. Select this folder: `gmail-star-row-highlight`
5. Open [Gmail](https://mail.google.com) and star an email.

To update after editing the code: click the **refresh/reload** icon on the
extension card, then reload the Gmail tab.

---

## Install in Safari (macOS)

Safari extensions must be wrapped in a small macOS app. A build script does this
for you. **You need the full Xcode app installed** (not just Command Line Tools).

### Customize the bundle ID (optional)

Safari requires a unique app identifier. The default (`com.local.GmailStarRowHighlight`)
works for local testing. To use your own:

```bash
GSRH_BUNDLE_ID=com.yourname.GmailStarRowHighlight ./build-safari.sh
```

The part after the last dot must stay `GmailStarRowHighlight` (the app name).

### Option A — one command (recommended)

```bash
./build-safari.sh
```

This regenerates the Xcode project, builds the app (ad-hoc signed for local
use), and prints the path to the built `.app`. Then:

1. Run the printed command, e.g.
   `open "/Users/you/Library/Developer/Xcode/DerivedData/GmailStarRowHighlight-.../Build/Products/Debug/GmailStarRowHighlight.app"`
   Launching the app once registers the extension with Safari. You can quit the
   app afterward.
2. Open **Safari → Settings… → Extensions**.
3. Enable **Gmail Star Row Highlight**.
4. If Safari blocks it because it's unsigned, enable the Develop menu first:
   - **Safari → Settings → Advanced → “Show features for web developers.”**
   - Then **Develop → Allow Unsigned Extensions** (you may need to re-toggle
     this after each Safari restart for locally-built extensions).
5. The first time it runs on Gmail, click the extension's toolbar icon and
   **Allow** access to `mail.google.com`.
6. Open Gmail and star an email.

### Option B — build in Xcode (GUI)

```bash
./build-safari.sh --open
```

This opens the generated Xcode project. Press **Run (▶)**. The helper app
launches; then follow steps 2–6 above.

### Updating the Safari extension after code changes

Re-run `./build-safari.sh` (or rebuild in Xcode). The script re-copies
`manifest.json`, `content.js`, and `styles.css` into the project before building,
so your latest changes are always included.

> Note: the generated `safari/` folder and `build/` folder are build artifacts
> and are git-ignored. The source of truth is the three files at the repo root.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| No highlight in Chrome | Reload the extension on `chrome://extensions`, then reload Gmail. |
| Extension missing in Safari | Enable **Develop → Allow Unsigned Extensions**, re-open Safari Settings → Extensions. |
| Works then stops after Safari restart | Re-toggle **Allow Unsigned Extensions** (expected for unsigned local builds). |
| Highlight missing after reload | Wait ~1–2 seconds for Gmail to finish rendering; the extension re-scans automatically. If the star icon itself is wrong, Gmail may not have saved the change server-side yet. |
| Highlight color hard to see | Tweak the `#fdf3d3` / `#fcecb8` values in `styles.css`. |
| Want a permanent Safari install | Sign the app with an Apple Developer ID / distribute via the App Store. |

## Notes on stability

Gmail obfuscates its CSS class names and changes them frequently, so this
extension deliberately avoids class-based selectors except as a last-resort
fallback. If Gmail ever changes its accessibility attributes and highlighting
stops, the selectors to update live at the top of `content.js`
(`ROW_ANCHOR_SELECTORS` and `STAR_SELECTORS`).
