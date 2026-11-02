import { text } from "./i18n.js";
import { cropRegion, folderName, imageName, nextFolderName } from "./core.js";

let job = null;
let lastCapture = 0;
let stepInFlight = false;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function publish(patch) {
  Object.assign(job, patch);
  await chrome.storage.session.set({ capture: job });
  await chrome.action.setBadgeText({ text: job.running ? String(job.count) : "" });
  await chrome.action.setBadgeBackgroundColor({ color: "#2563eb" });
}

async function currentJob() {
  if (!job) job = (await chrome.storage.session.get("capture")).capture || null;
  return job;
}

async function assertActive() {
  if (job.cancelReason) throw new Error(job.cancelReason);
  const [tab] = await chrome.tabs.query({ active: true, windowId: job.windowId });
  const window = await chrome.windows.get(job.windowId);
  if (tab?.id !== job.tabId) throw new Error("目标标签页已切换，截图已停止。");
  // 工具栏弹窗/应用切换会改变窗口焦点；捕获目标由 windowId 和活动标签页确定。
  if (window.state === "minimized") throw new Error("目标窗口已最小化，截图已停止。");
  if (tab.status === "loading") throw new Error("网页正在跳转或重新加载，截图已停止。");
}

async function pageMessage(type, extra = {}) {
  const response = await chrome.tabs.sendMessage(job.tabId, { type, id: job.id, ...extra }, { frameId: 0 });
  if (!response?.ok) throw new Error(response?.error || "无法访问网页，请刷新后重试。");
  return response;
}

async function downloadPng(url, filename) {
  const id = await chrome.downloads.download({ url, filename, saveAs: false, conflictAction: "uniquify" });
  job.pendingDownload = id;
  const deadline = Date.now() + 60000;
  // download() 返回只说明下载已发起，必须等到 complete 才计入进度。
  while (Date.now() < deadline) {
    const [item] = await chrome.downloads.search({ id });
    if (item?.state === "complete") {
      job.pendingDownload = null;
      return { id, filename: item.filename };
    }
    if (!item || item.state === "interrupted") {
      throw new Error("图片下载失败：" + (item?.error || "下载记录丢失"));
    }
    if (job.cancelReason) {
      await chrome.downloads.cancel(id).catch(() => {});
      throw new Error(job.cancelReason);
    }
    await sleep(250);
  }
  await chrome.downloads.cancel(id).catch(() => {});
  throw new Error("图片下载超过 60 秒，请检查 Chrome 下载设置与磁盘空间。");
}

async function croppedPng(dataUrl, metrics) {
  const bitmap = await createImageBitmap(await (await fetch(dataUrl)).blob());
  try {
    const scale = metrics.dpr;
    if (Math.abs(bitmap.height - Math.round(metrics.windowHeight * scale)) > 1) {
      throw new Error("浏览器截图比例与网页不一致，截图已停止。");
    }
    if (job.scale && Math.abs(scale - job.scale) > 0.001) throw new Error("屏幕缩放发生变化，截图已停止。");
    job.scale = scale;
    const region = cropRegion(metrics, job.covered, scale);
    if (!region) return null;
    if (region.y < 0 || region.y + region.height > bitmap.height || region.x < 0 || region.x + region.width > bitmap.width) {
      throw new Error("截图尺寸与网页不一致，请保持窗口尺寸和缩放不变。");
    }
    const canvas = new OffscreenCanvas(region.width, region.height);
    const context = canvas.getContext("2d");
    context.drawImage(bitmap, region.x, region.y, region.width, region.height, 0, 0, region.width, region.height);
    const bytes = new Uint8Array(await (await canvas.convertToBlob({ type: "image/png" })).arrayBuffer());
    let binary = "";
    for (let i = 0; i < bytes.length; i += 32768) binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
    return { url: "data:image/png;base64," + btoa(binary), end: region.end };
  } finally {
    bitmap.close();
  }
}

async function captureStep(message, sender) {
  await currentJob();
  if (!job?.running || sender.tab?.id !== job.tabId || message.id !== job.id || sender.frameId !== 0) {
    throw new Error("截图任务已结束。");
  }
  if (stepInFlight) throw new Error("上一张图片仍在处理中。");
  stepInFlight = true;
  try {
    await assertActive();
    const metrics = message.metrics;
    if (metrics.windowWidth !== job.width || metrics.windowHeight !== job.height || metrics.dpr !== job.dpr) {
      throw new Error("窗口尺寸或网页缩放发生变化，截图已停止。");
    }
    await sleep(Math.max(0, 650 - (Date.now() - lastCapture)));
    await assertActive();
    await pageMessage("VERIFY", { metrics });
    lastCapture = Date.now();
    const data = await chrome.tabs.captureVisibleTab(job.windowId, { format: "png" });
    await assertActive();
    await pageMessage("VERIFY", { metrics });
    const image = await croppedPng(data, metrics);
    if (!image) return { ok: true, count: job.count, covered: job.covered };
    if (job.cancelReason) throw new Error(job.cancelReason);
    const saved = await downloadPng(image.url, `${job.folder}/${imageName(job.sequence)}`);
    await publish({ count: job.count + 1, sequence: job.sequence + 1, covered: image.end,
      lastDownload: saved.id, lastFilename: saved.filename, message: `已保存 ${job.count + 1} 张图片` });
    return { ok: true, count: job.count, covered: job.covered };
  } finally {
    stepInFlight = false;
  }
}

async function start(tabId, options) {
  await currentJob();
  if (job?.running) throw new Error("已有截图任务进行中，请先停止。");
  const tab = await chrome.tabs.get(tabId);
  if (!/^(https?:|file:)/.test(tab.url || "") || /^https:\/\/chrome(webstore\.google\.com|\.google\.com\/webstore)/.test(tab.url)) {
    throw new Error("请在普通网页中使用。Chrome 内部页面和扩展商店不支持滚动截图。");
  }
  if (tab.status === "loading") throw new Error("请等待网页加载完成后再开始。");
  const delay = Math.min(10000, Math.max(300, Number(options?.delay) || 800));
  const maxPages = Math.min(5000, Math.max(1, Math.floor(Number(options?.maxPages) || 1000)));
  job = { id: crypto.randomUUID(), tabId, windowId: tab.windowId, running: true, count: 0,
    covered: 0, folder: folderName(tab.title), sequence: 1, message: "正在准备网页…", delay, maxPages };
  await publish({});
  try {
    await assertActive();
    const [history, { captureFolders }] = await Promise.all([
      chrome.downloads.search({ limit: 0 }),
      chrome.storage.local.get({ captureFolders: [] })
    ]);
    const downloadedFolders = history.map(item => item.filename.replaceAll("\\", "/").split("/").at(-2)).filter(Boolean);
    job.folder = nextFolderName(job.folder, [...captureFolders, ...downloadedFolders]);
    // 持久记录任务目录；即使下载历史被清空，也不重新使用以前分配的目录。
    await chrome.storage.local.set({ captureFolders: [...captureFolders, job.folder] });
    await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
    const prepared = await pageMessage("PREPARE");
    await publish({ width: prepared.metrics.windowWidth, height: prepared.metrics.windowHeight,
      dpr: prepared.metrics.dpr, message: prepared.metrics.panel ? "正在截取主体滚动区域…" : "正在从顶部截图…" });
    await pageMessage("RUN", { delay, maxPages });
    return { ok: true };
  } catch (error) {
    await pageMessage("ABORT").catch(() => {});
    await publish({ running: false, status: "error", message: error.message });
    throw error;
  }
}

async function cancel(reason) {
  await currentJob();
  if (!job?.running) return;
  await publish({ cancelReason: reason, message: "正在停止，保留已保存的图片…" });
  try { await pageMessage("ABORT", { reason }); }
  catch { await publish({ running: false, status: "stopped", message: reason }); }
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  // 页面不能通过 window.postMessage 触发扩展操作；所有控制仅来自扩展弹窗。
  const fromExtension = !sender.tab && sender.url === chrome.runtime.getURL("popup.html");
  const handle = async () => {
    if (message.type === "START" && fromExtension) return start(message.tabId, message.options);
    if (message.type === "STOP" && fromExtension) {
      await cancel("已手动停止。"); return { ok: true };
    }
    if (message.type === "STEP") return captureStep(message, sender);
    if (message.type === "FINISH") {
      await currentJob();
      if (sender.tab?.id !== job?.tabId || message.id !== job?.id || sender.frameId !== 0) return { ok: false };
      await publish({ running: false, status: message.status,
        message: job.cancelReason || message.message });
      return { ok: true };
    }
    return { ok: false, error: "未知请求。" };
  };
  handle().then(respond, error => respond({ ok: false, error: error.message }));
  return true;
});

chrome.tabs.onActivated.addListener(info => {
  if (job?.running && info.windowId === job.windowId && info.tabId !== job.tabId) void cancel("切换标签页，截图已停止。");
});
chrome.windows.onBoundsChanged.addListener(window => {
  if (job?.running && window.id === job.windowId && window.state === "minimized") void cancel("目标窗口已最小化，截图已停止。");
});
chrome.tabs.onRemoved.addListener(id => {
  if (job?.running && id === job.tabId) void cancel("目标网页已关闭，截图已停止。");
});
chrome.tabs.onUpdated.addListener((id, change) => {
  if (job?.running && id === job.tabId && (change.status === "loading" || change.url)) void cancel("网页已跳转或刷新，截图已停止。");
});

async function updateActionTitle() {
  const { language } = await chrome.storage.local.get("language");
  await chrome.action.setTitle({ title: text("actionTitle", language) });
}
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.language) void updateActionTitle();
});
void updateActionTitle();
