import { normalizeLanguage, text, translateMessage } from "./i18n.js";

const $ = id => document.getElementById(id);
let tab, state, starting = false, language = "en", notice;

function render(capture = state) {
  state = capture;
  document.documentElement.lang = language;
  for (const element of document.querySelectorAll("[data-i18n]")) {
    element.textContent = text(element.dataset.i18n, language);
  }
  $("language").textContent = language === "en" ? "中文" : "English";
  $("language").title = text("switchLanguage", language);
  $("language").setAttribute("aria-label", text("switchLanguage", language));
  if ($("maxPages").validity.customError) $("maxPages").setCustomValidity(text("invalidLimit", language));
  const running = Boolean(capture?.running);
  $("start").hidden = running;
  $("stop").hidden = !running;
  $("delay").disabled = running;
  $("maxPages").disabled = running;
  const count = capture?.count || 0;
  $("count").textContent = text(count === 1 ? "countOne" : "count", language, { count });
  $("status").textContent = notice?.key ? text(notice.key, language) : translateMessage(notice?.message || capture?.message, language);
  $("folder").textContent = capture?.folder ? text("folder", language, { folder: capture.folder }) : text("defaultFolder", language);
  $("show").hidden = !capture?.lastDownload;
  $("title").textContent = tab?.title || text("untitled", language);
  $("title").title = tab?.title || "";
}

$("language").addEventListener("click", async () => {
  language = language === "en" ? "zh-CN" : "en";
  render();
  try { await chrome.storage.local.set({ language }); }
  catch (error) { notice = { message: error.message }; render(); }
});

$("maxPages").addEventListener("input", () => $("maxPages").setCustomValidity(""));
$("start").addEventListener("click", async () => {
  if (starting) return;
  $("maxPages").setCustomValidity("");
  if (!$("maxPages").validity.valid) {
    $("maxPages").setCustomValidity(text("invalidLimit", language));
    $("maxPages").reportValidity();
    return;
  }
  starting = true;
  $("start").disabled = true;
  notice = { key: "starting" };
  render();
  try {
    const options = { delay: Number($("delay").value), maxPages: Number($("maxPages").value) };
    await chrome.storage.local.set({ options });
    const response = await chrome.runtime.sendMessage({ type: "START", tabId: tab.id, options });
    if (!response?.ok) throw new Error(response?.error || "无法开始截图。");
    notice = null;
    render((await chrome.storage.session.get("capture")).capture);
  } catch (error) {
    notice = { message: error.message };
    render();
  } finally {
    starting = false;
    $("start").disabled = false;
  }
});

$("stop").addEventListener("click", async () => {
  $("stop").disabled = true;
  try {
    const response = await chrome.runtime.sendMessage({ type: "STOP" });
    if (!response?.ok) throw new Error(response?.error || "未知请求。");
  } catch (error) { notice = { message: error.message }; render(); }
  finally { $("stop").disabled = false; }
});
$("show").addEventListener("click", () => chrome.downloads.show(state.lastDownload));
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.language) {
    language = normalizeLanguage(changes.language.newValue);
    render();
  }
  if (area === "session" && changes.capture) {
    notice = null;
    render(changes.capture.newValue);
  }
});

try {
  const { options, language: preference } = await chrome.storage.local.get(["options", "language"]);
  language = normalizeLanguage(preference);
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (options) { $("delay").value = options.delay; $("maxPages").value = options.maxPages; }
  render((await chrome.storage.session.get("capture")).capture);
  $("start").disabled = false;
} catch (error) { notice = { message: error.message }; render(); }
