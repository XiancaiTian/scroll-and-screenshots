<img src="assets/scrollshot-icon-512.png" alt="ScrollShot icon" width="96" height="96">

# scroll-and-screenshots

English | [简体中文](README.zh-CN.md)

A Chrome extension that scrolls a webpage from the top and saves its content as sequential, non-overlapping PNG screenshots.

**Current version: 1.0.6.** The extension is displayed as **ScrollShot · 连续滚动截图** in Chrome. The project directory and repository name remain `scroll-and-screenshots`. The interface defaults to English. Click **中文** in the popup to switch to Simplified Chinese, or **English** to switch back. Your choice is remembered, including after restarting Chrome.

## Features

- Capture a supported webpage from top to bottom with one click.
- Save separate PNG images, cropping the overlapping part of the last screen instead of repeating it.
- Create a new, title-based folder for every capture run. Repeated titles receive increasing suffixes, and every run starts with `0001.png`.
- Detect a large internal scrolling panel when the document itself does not scroll, and capture only that panel.
- Temporarily hide small fixed overlays, let sticky elements scroll with the content, and pause CSS animations and transitions.
- Show saved-image progress, allow manual stopping, and continue after the popup is closed.
- Switch between English and Simplified Chinese with one click, including during capture.
- Process and save screenshots locally, without an account, API key, backend, or analytics.

## Requirements

- Chrome 116 or later, as declared in the extension manifest. Browser tests have used Chrome for Testing 151; compatibility with every Chrome version or Chromium-based browser has not been verified.
- A supported HTTP/HTTPS webpage, or a local HTML file with file access enabled for the extension.

Node.js and Python are **not required to install or use** the extension.

## Installation

### From source

1. Download or clone this repository to a local folder.
2. Open `chrome://extensions` in Chrome.
3. Enable **Developer mode**.
4. Click **Load unpacked** and select the repository's `extension` folder, which contains `manifest.json`. Do not select the repository root.
5. Open Chrome's extensions menu and pin **ScrollShot · 连续滚动截图** to the toolbar.

No build step is required. Keep the loaded folder in place while the extension is installed.

### From a packaged ZIP

1. Extract `scroll-and-screenshots-v1.0.6.zip` produced by this project.
2. Open `chrome://extensions` and enable **Developer mode**.
3. Click **Load unpacked** and select the extracted `scroll-and-screenshots` folder containing `manifest.json`.

The ZIP is not installed by dragging it onto a webpage. It must be extracted and loaded as an unpacked extension.

### Updating

Replace files in the folder already loaded by Chrome with the new version, then click the extension's **Reload** button on `chrome://extensions`. Refresh the webpage before capturing again. Reloading the same extension preserves its saved settings and directory records; uninstalling it removes its extension-local data.

## Usage

1. Open the target webpage and wait for its content to load.
2. Click the extension icon, select a scroll wait and screenshot limit, then click **Start capture**.
3. Keep the target tab selected. Do not scroll, resize, zoom, refresh, or minimize the target window during capture.
4. You may close the popup. Reopen it to check progress or click **Stop capture**.
5. When finished, click **Show in folder**, or open Chrome's configured download folder.

| Control | Options / behavior |
|---|---|
| Scroll wait | 0.8 seconds by default; 1.5, 3, or 5 seconds for slower-loading pages. Image/font checks and bottom-of-page checks may add waiting time. |
| Image limit | 1,000 by default; adjustable from 1 to 5,000. Reaching the limit stops the run and keeps saved images. |
| Saved-image count | Increases only after Chrome reports that an image download has completed. |

The **中文 / English** button switches all interface labels and built-in status messages immediately without restarting the capture. The webpage title and output folder name retain their original content. Chrome-provided technical error details may remain in their original language.

The extension tries to restore the original scroll position and temporary style changes after completion, stopping, or an error. Switching away from the target tab, navigating, resizing, zooming, or minimizing can stop the run. A window-focus change alone does not stop it.

## Output and naming

Images are saved below **Chrome's configured download folder**, not an arbitrary filesystem location chosen by the extension:

```text
Chrome download folder/
├── Example Page/
│   ├── 0001.png
│   ├── 0002.png
│   └── 0003.png
├── Example Page (1)/
│   ├── 0001.png
│   └── 0002.png
└── Example Page (2)/
    └── 0001.png
```

- Each capture run gets a separate folder. Image numbering restarts at `0001.png` for every run.
- Folder names come from the page title. Unsafe path characters are replaced, hidden formatting characters are removed, and overly long titles are shortened. An empty result uses `未命名网页` (Untitled webpage).
- Suffixes increase beyond the largest known suffix; missing numbers are not reused. A run that fails before saving an image may still reserve a suffix.
- Existing names are checked against extension-local directory records and Chrome's download history. Clearing download history alone does not erase the extension's records.
- The download API cannot enumerate arbitrary folders. Manually created folders absent from both records cannot be detected. If an image filename unexpectedly conflicts, Chrome adds a filename suffix instead of overwriting it.

Images preserve the captured pixel density. The final image can be shorter than the others. Output is a set of separate images, **not a stitched full-page image**. Only the visible content width is captured; horizontal overflow is excluded. For an internal panel, surrounding sidebars and toolbars are excluded.

## Supported pages and limitations

The extension works best on stable pages with normal document scrolling. Internal-panel detection requires a scrollable panel fully inside the viewport, at least half the window width and 40% of its height; the largest eligible panel is selected.

Known limitations include:

- Chrome internal pages, the Chrome Web Store, Chrome's built-in PDF viewer, and other pages that do not permit script injection.
- Cross-origin iframe or Shadow DOM scrolling regions, competing panels, transformed or obscured content.
- Virtualized lists, content that shifts after capture begins, and live canvas/video content. These can produce incomplete or inconsistent results.
- Infinite-scroll pages have no guaranteed endpoint. Capture stops when no new content appears during the bottom checks, the limit is reached, or you stop it. Content that loads later than the wait period can be missed.
- Fixed overlays are temporarily hidden, so they may not appear in the images. Sticky elements and animations are temporarily adjusted, which can change the page's appearance.

Saved images remain on disk when a run is stopped or fails.

## Permissions and privacy

| Permission | Purpose |
|---|---|
| `activeTab` | Temporary access to the tab where you invoke the extension, including capturing its visible area. |
| `scripting` | Scroll the page, inspect its dimensions, and temporarily adjust page styles. |
| `downloads` | Save PNG files, confirm downloads have completed, inspect download records to avoid directory-name collisions, and show saved files in their folder. |
| `storage` | Remember the interface language, capture settings, assigned directory names, and the current run's progress. |

The extension requests no persistent access to all websites. It does not upload screenshots or webpage content, use analytics, or call an external screenshot service. Screenshots are saved through Chrome; settings and directory records stay in extension-local storage. Webpages may still make their normal network requests when scrolling triggers lazy loading.

## Troubleshooting

| Problem | What to check |
|---|---|
| Capture stops before saving an image | Read the status message. Keep the target tab selected and the window unminimized, then reload the extension and refresh the webpage if you recently updated it. |
| `Invalid filename` | Use the current version, which removes hidden formatting characters from titles. Include the status message and a shareable example page in a bug report if it persists. |
| A local HTML file cannot be captured | Enable **Allow access to file URLs** on the extension's details page. |
| Images or lower sections are missing | Wait for the page to settle and try a 3- or 5-second scroll wait. Check whether the page uses virtualization or an unsupported scrolling region. |
| Files appear elsewhere or Chrome asks for a location | Check Chrome's download settings and other download-management extensions. This extension does not change global download settings. |

## Development

These commands are for a **source checkout**, not the extracted installation ZIP. Use Node.js 20+ for development and Python 3 for packaging.

Core and translation tests use Node's built-in test runner and need no third-party packages:

```sh
npm test
```

For browser tests and rebuilding icons, install the optional development dependencies:

```sh
npm install --no-save playwright pngjs sharp
npx playwright install chromium
npm run test:e2e
```

Browser tests use a separate profile and save artifacts under `test-output/`. `CHROMIUM_PATH` can select a browser executable; `TEST_DPR`, `TEST_FILTER`, and `TEST_RUN_LABEL` control pixel ratio, scenario selection, and result naming. The browser must support the extension-debugging commands used by the test script; the extension's minimum supported version is not the test runner's minimum.

```sh
npm run icons     # Rebuild PNG icons from the SVG source
npm run package   # Build the installation ZIP in dist/; requires Python 3
```

```text
extension/   Chrome extension files — load this folder
assets/      Editable icon source and preview
scripts/     Icon export and ZIP packaging
tests/      Core, translation, and browser tests
```

## Contributing

Bug reports should include your Chrome version, operating system, reproduction steps, the popup's status message, and a public example page when possible. Keep changes focused; run core tests, and run browser tests when changing capture or download behavior. For icon changes, also check the 16-pixel appearance and packaged asset paths.

## License

Released under the [MIT License](LICENSE).
