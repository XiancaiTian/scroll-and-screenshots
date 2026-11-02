const strings = {
  en: {
    subtitle: "Scroll. Capture. Save.", currentPage: "Current page", loading: "Loading…",
    scrollWait: "Scroll wait", waitHint: "Allow images to load", imageLimit: "Image limit",
    delay800: "Standard · 0.8 s", delay1500: "Slower · 1.5 s", delay3000: "Slow · 3 s", delay5000: "Very slow · 5 s",
    ready: "Ready", starting: "Starting capture…", start: "Start capture", stop: "Stop capture",
    show: "Show in folder ↗", untitled: "Untitled page", switchLanguage: "Switch to Chinese",
    count: "{count} images", countOne: "1 image", folder: "Save to: Downloads / {folder} /",
    defaultFolder: "Save to: Downloads / Page title / 0001.png",
    note: "Keep the target tab selected. Do not scroll, minimize, or resize the window during capture. Closing this popup will not stop capture.",
    invalidLimit: "Enter a whole number from 1 to 5,000.", actionTitle: "ScrollShot · Continuous screenshots"
  },
  "zh-CN": {
    subtitle: "从顶部开始，一屏接一屏", currentPage: "当前网页", loading: "正在读取…",
    scrollWait: "滚动后等待", waitHint: "给图片留出加载时间", imageLimit: "最多截图张数",
    delay800: "标准 · 0.8 秒", delay1500: "较慢 · 1.5 秒", delay3000: "慢速 · 3 秒", delay5000: "很慢 · 5 秒",
    ready: "准备就绪", starting: "正在启动截图…", start: "开始截图", stop: "停止截图",
    show: "在文件夹中显示图片 ↗", untitled: "未命名网页", switchLanguage: "Switch to English",
    count: "{count} 张", countOne: "1 张", folder: "保存至：下载目录 / {folder} /",
    defaultFolder: "保存至：下载目录 / 网页标题 / 0001.png",
    note: "截图期间请保持目标标签页选中，不要滚动、最小化或调整窗口。关闭此弹窗不会中断截图。",
    invalidLimit: "请输入 1 到 5000 之间的整数。", actionTitle: "ScrollShot · 连续滚动截图"
  }
};

// Translate stored capture messages at display time, including jobs started before a language change.
const messages = {
  "目标标签页已切换，截图已停止。": "The target tab changed. Capture stopped.",
  "目标窗口已最小化，截图已停止。": "The target window was minimized. Capture stopped.",
  "网页正在跳转或重新加载，截图已停止。": "The page is navigating or reloading. Capture stopped.",
  "无法访问网页，请刷新后重试。": "Cannot access the page. Refresh it and try again.",
  "图片下载超过 60 秒，请检查 Chrome 下载设置与磁盘空间。": "The image download timed out after 60 seconds. Check Chrome download settings and available disk space.",
  "浏览器截图比例与网页不一致，截图已停止。": "The screenshot scale does not match the page. Capture stopped.",
  "屏幕缩放发生变化，截图已停止。": "The display scale changed. Capture stopped.",
  "截图尺寸与网页不一致，请保持窗口尺寸和缩放不变。": "The screenshot dimensions do not match the page. Keep the window size and zoom unchanged.",
  "截图任务已结束。": "The capture session has ended.",
  "上一张图片仍在处理中。": "The previous image is still being processed.",
  "窗口尺寸或网页缩放发生变化，截图已停止。": "The window size or page zoom changed. Capture stopped.",
  "已有截图任务进行中，请先停止。": "A capture is already running. Stop it first.",
  "请在普通网页中使用。Chrome 内部页面和扩展商店不支持滚动截图。": "Open a regular webpage. Chrome internal pages and the extension store do not support scrolling capture.",
  "请等待网页加载完成后再开始。": "Wait for the page to finish loading before starting.",
  "正在准备网页…": "Preparing the page…",
  "正在截取主体滚动区域…": "Capturing the main scrolling area…",
  "正在从顶部截图…": "Capturing from the top…",
  "正在停止，保留已保存的图片…": "Stopping… Saved images will be kept.",
  "已手动停止。": "Capture stopped. Saved images were kept.",
  "未知请求。": "Unknown request.",
  "切换标签页，截图已停止。": "The target tab changed. Capture stopped.",
  "目标网页已关闭，截图已停止。": "The target page was closed. Capture stopped.",
  "网页已跳转或刷新，截图已停止。": "The page navigated or refreshed. Capture stopped.",
  "任务已结束。": "The capture session has ended.",
  "网页地址已变化，截图已停止。": "The page address changed. Capture stopped.",
  "网页已替换滚动区域，截图已停止。": "The page replaced its scrolling area. Capture stopped.",
  "主体滚动区域不再完整可见，截图已停止。": "The main scrolling area is no longer fully visible. Capture stopped.",
  "网页内容或滚动位置在截图时发生变化，请等待加载完成后重试。": "The page content or scroll position changed during capture. Wait for loading to finish and try again.",
  "检测到手动操作，截图已停止。": "Manual scrolling or keyboard input detected. Capture stopped.",
  "已到达网页底部。": "Reached the bottom of the page.",
  "网页滚动位置自动变化，截图已停止。": "The page changed its scroll position. Capture stopped.",
  "网页无法继续向下滚动，截图已停止。": "The page cannot scroll any further. Capture stopped.",
  "页面自动跳过内容，截图已停止。": "The page skipped content while scrolling. Capture stopped.",
  "截图服务无法响应。": "The capture service is not responding.",
  "页面内容已缩短，无法保证截图连续。": "The page became shorter. Continuous capture cannot be guaranteed.",
  "页面无法继续向下滚动，截图已停止。": "The page cannot scroll any further. Capture stopped.",
  "网页上已有截图任务。": "A capture is already running on this page.",
  "截图任务不存在。": "The capture session could not be found.",
  "截图已停止。": "Capture stopped.",
  "页面滚动发生跳跃，已停止以免遗漏内容。": "The page jumped while scrolling. Capture stopped to avoid missing content.",
  "无法开始截图。": "Could not start capture."
};

export function normalizeLanguage(language) {
  return language === "zh-CN" ? "zh-CN" : "en";
}

export function text(key, language = "en", values = {}) {
  return strings[normalizeLanguage(language)][key].replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? ""));
}

export function translateMessage(message, language = "en") {
  if (!message) return text("ready", language);
  const chinese = normalizeLanguage(language) === "zh-CN";
  if (message === "Invalid filename") return chinese ? "文件名无效。" : "Invalid filename.";
  if (chinese) return message;
  if (messages[message]) return messages[message];
  let match = message.match(/^已保存 (\d+) 张图片$/);
  if (match) return `Saved ${match[1]} ${match[1] === "1" ? "image" : "images"}`;
  match = message.match(/^已达到 (\d+) 张安全上限，已保存图片保留。$/);
  if (match) return `Reached the ${match[1]}-image limit. Saved images were kept.`;
  if (message.startsWith("图片下载失败：")) {
    const detail = message.slice("图片下载失败：".length);
    return "Image download failed: " + (detail === "下载记录丢失" ? "download record missing" : detail);
  }
  return message;
}
