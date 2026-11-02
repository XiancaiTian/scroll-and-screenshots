import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join, basename } from "node:path";
import { homedir } from "node:os";
import { folderName } from "../extension/core.js";

const require = createRequire(import.meta.url);
const runtime = process.env.TEST_NODE_MODULES || join(homedir(), ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules");
function dependency(name) {
  try { return require(name); }
  catch (error) { if (error.code !== "MODULE_NOT_FOUND") throw error; return require(join(runtime, name)); }
}
const { chromium } = process.env.PLAYWRIGHT_MODULE ? require(process.env.PLAYWRIGHT_MODULE) : dependency("playwright");
const { PNG } = dependency("pngjs");
const output = resolve("test-output");
const testedDpr = Number(process.env.TEST_DPR || 1);
let executablePath = process.env.CHROMIUM_PATH || join(homedir(), "Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
try { await access(executablePath); } catch { executablePath = chromium.executablePath(); }
const runDir = join(output, "runs", new Date().toISOString().replace(/[:.]/g, "-"));
await mkdir(runDir, { recursive: true });

function fixture(url) {
  const params = new URL(url, "http://localhost").searchParams;
  const height = Number(params.get("height") || 1750);
  const title = params.get("title") || "连续截图测试";
  const mode = params.get("mode") || "normal";
  const panel = mode.startsWith("panel");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title.replaceAll("<", "&lt;")}</title>
    <style>html,body{margin:0;padding:0}canvas{display:block}#fixed{position:fixed;top:0;left:0;height:60px;width:100%;background:#ff00ff;z-index:10}#sticky{position:sticky;top:0;height:40px;background:#44dd99}#panel{height:100vh;overflow:auto}${mode === "panel-offset" ? '#panel{position:fixed;top:60px;left:80px;width:700px;height:600px;border:3px solid #333}' : ''}</style></head><body>
    ${mode === "sticky" ? '<div id="sticky">粘性标题</div>' : ""}
    ${mode === "fixed" ? '<div id="fixed">应临时隐藏的悬浮栏</div>' : ""}
    ${panel ? '<div id="panel">' : ""}<canvas id="rows"></canvas>${panel ? "</div>" : ""}
    <script>
      const canvas = document.getElementById('rows');canvas.width=${panel ? 650 : 900};canvas.height=${height};
      const ctx=canvas.getContext('2d');
      for(let y=0;y<canvas.height;y++){ctx.fillStyle='rgb('+y%251+','+Math.floor(y/251)%251+',123)';ctx.fillRect(0,y,900,1);}
      if('${mode}'==='lazy'||'${mode}'==='infinite'){
        let appended=0;
        addEventListener('scroll',()=>{if(scrollY+innerHeight>=document.documentElement.scrollHeight-2 && (appended<2||'${mode}'==='infinite')){
          appended++;setTimeout(()=>{const extra=document.createElement('div');extra.style.height='550px';extra.style.background='#2255aa';document.body.append(extra);},200);
        }});
      }
    </script></body></html>`;
}

const server = createServer((request, response) => {
  response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  response.end(fixture(request.url));
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const results = [];
let context;
let browserVersion;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const persist = async () => {
  const data = JSON.stringify({ browser: browserVersion, dpr: testedDpr, runDir, results }, null, 2);
  const label = process.env.TEST_RUN_LABEL ? `-${process.env.TEST_RUN_LABEL}` : "";
  await writeFile(join(output, `e2e-dpr-${testedDpr}${label}.json`), data);
  await writeFile(join(runDir, "results.json"), data);
};

try {
  const extension = resolve("extension");
  await mkdir(join(runDir, "browser-profile", "Default"), { recursive: true });
  await writeFile(join(runDir, "browser-profile", "Default", "Preferences"), JSON.stringify({
    download: { default_directory: join(runDir, "downloads"), prompt_for_download: false }
  }));
  context = await chromium.launchPersistentContext(join(runDir, "browser-profile"), {
    executablePath,
    headless: process.env.HEADED !== "1", viewport: { width: 1000, height: 800 },
    deviceScaleFactor: testedDpr, acceptDownloads: true, locale: "zh-CN",
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`, "--enable-unsafe-extension-debugging", `--force-device-scale-factor=${testedDpr}`]
  });
  const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
  const id = worker.url().split("/")[2];
  const cdp = await context.browser().newBrowserCDPSession();
  // CDP allow 模式会覆盖扩展的目录/文件名建议，必须测试 Chrome 原生默认行为。
  await cdp.send("Browser.setDownloadBehavior", { behavior: "default", eventsEnabled: true });
  const page = context.pages()[0];
  const version = await cdp.send("Browser.getVersion");
  browserVersion = version.product;
  console.log("浏览器:", version.product);
  const getState = () => worker.evaluate(async () => (await chrome.storage.session.get("capture")).capture);
  async function waitState(predicate, timeout = 45000) {
    const deadline = Date.now() + timeout;
    let state;
    while (Date.now() < deadline) {
      state = await getState();
      if (predicate(state)) return state;
      await pause(150);
    }
    throw new Error("等待截图任务超时：" + JSON.stringify(state));
  }

  // 弹窗是 CDP 的 other target，使用其原始会话操作正式弹窗页面。
  let requestId = 0;
  const pending = new Map();
  cdp.on("Target.receivedMessageFromTarget", event => {
    const data = JSON.parse(event.message);
    const key = event.sessionId + ":" + data.id;
    if (!pending.has(key)) return;
    const { resolve, reject } = pending.get(key); pending.delete(key);
    if (data.error) reject(new Error(data.error.message)); else resolve(data.result);
  });
  function send(sessionId, method, params = {}) {
    const rid = ++requestId;
    return new Promise((resolve, reject) => {
      const key = sessionId + ":" + rid;
      const timer = setTimeout(() => { pending.delete(key); reject(new Error("弹窗调试操作超时：" + method)); }, 15000);
      pending.set(key, { resolve: result => { clearTimeout(timer); resolve(result); }, reject: error => { clearTimeout(timer); reject(error); } });
      cdp.send("Target.sendMessageToTarget", { sessionId, message: JSON.stringify({ id: rid, method, params }) }).catch(reject);
    });
  }
  async function evaluatePopup(expression, screenshotName) {
    const targets = await cdp.send("Target.getTargets");
    const target = targets.targetInfos.find(t => t.url === `chrome-extension://${id}/popup.html`);
    assert.ok(target, "真实工具栏弹窗存在：" + JSON.stringify(targets));
    const { sessionId } = await cdp.send("Target.attachToTarget", { targetId: target.targetId, flatten: false });
    try {
      const result = await send(sessionId, "Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
      if (screenshotName) {
        const screenshot = await send(sessionId, "Page.captureScreenshot", { format: "png" });
        await writeFile(join(output, screenshotName), Buffer.from(screenshot.data, "base64"));
      }
      return result.result.value;
    } finally { await cdp.send("Target.detachFromTarget", { sessionId }).catch(() => {}); }
  }
  async function openPopup() {
    await page.bringToFront();
    const targets = await cdp.send("Target.getTargets", { filter: [{ type: "tab", exclude: false }] });
    const target = targets.targetInfos.find(t => t.url === page.url());
    assert.ok(target, "存在网页的 tab target");
    await cdp.send("Extensions.triggerAction", { id, targetId: target.targetId });
    for (let i = 0; i < 50; i++) {
      const contexts = await worker.evaluate(() => chrome.runtime.getContexts({ contextTypes: ["POPUP"] }));
      if (contexts.length) { await pause(100); return; }
      await pause(100);
    }
    throw new Error("真实工具栏弹窗未加载");
  }
  let reference;
  let originalTop;
  let viewportHeight;
  async function begin(params, options = {}) {
    const query = new URLSearchParams(params);
    await page.goto(`${origin}/?${query}`);
    await page.evaluate(() => { const panel = document.getElementById('panel'); if (panel) panel.scrollTo(0,123); else scrollTo(0, 123); });
    originalTop = await page.evaluate(() => document.getElementById('panel')?.scrollTop ?? scrollY);
    viewportHeight = await page.evaluate(() => document.getElementById('panel')?.clientHeight ?? innerHeight);
    reference = params.mode ? null : PNG.sync.read(await page.screenshot({ fullPage: true, scale: "device" }));
    await openPopup();
    const previous = await getState();
    const response = await evaluatePopup(`(async () => {
      const [tab] = await chrome.tabs.query({active:true,currentWindow:true});
      return chrome.runtime.sendMessage({type:'START',tabId:tab.id,options:${JSON.stringify({ delay: 300, maxPages: 100, ...options })}});
    })()`);
    if (!response.ok) return { response, state: await getState() };
    await waitState(s => s?.id !== previous?.id);
    return { response };
  }

  async function completed(params, expectedHeight, options) {
    const start = await begin(params, options);
    assert.equal(start.response.ok, true, JSON.stringify(start));
    const state = await waitState(s => s && !s.running);
    assert.equal(state.status, "complete", JSON.stringify(state));
    assert.ok(Math.abs(state.covered - expectedHeight) < 0.001, "覆盖到文档底部（允许浏览器浮点误差）");
    const history = await worker.evaluate(async folder => (await chrome.downloads.search({ limit: 0 })).filter(d => d.filename.includes('/'+folder+'/')).map(d => ({ id:d.id, filename:d.filename, state:d.state })), state.folder);
    assert.ok(history.length, "已找到网页标题目录中的真实下载记录");
    const images = [];
    for (const item of history.sort((a, b) => a.filename.localeCompare(b.filename))) {
      assert.equal(item.state, "complete");
      const bytes = await readFile(item.filename);
      const png = PNG.sync.read(bytes);
      images.push({ png, filename: item.filename });
    }
    const dpr = await page.evaluate(() => devicePixelRatio);
    assert.equal(images.reduce((sum, image) => sum + image.png.height, 0), Math.round(expectedHeight * dpr));
    if (!["sticky", "lazy"].includes(params.mode)) {
      // 验证每一物理像素行的内容，而不只检查总高度。
      let totalRows = 0;
      for (const { png } of images) {
        for (let y = 0; y < png.height; y++) {
          const offset = (y * png.width + 10) * 4;
          const cssRow = Math.floor((totalRows + 0.5) / dpr);
          if (dpr === 1 && cssRow < Number(params.height)) {
            assert.equal(png.data[offset], cssRow % 251, `第 ${totalRows} 行红色编码连续`);
            assert.equal(png.data[offset + 1], Math.floor(cssRow / 251) % 251, `第 ${totalRows} 行绿色编码连续`);
            assert.equal(png.data[offset + 2], 123);
          }
          if (reference && totalRows < reference.height && cssRow < Number(params.height)) {
            const baseline = (totalRows * reference.width + 10) * 4;
            for (let channel = 0; channel < 3; channel++) {
              assert.ok(Math.abs(png.data[offset + channel] - reference.data[baseline + channel]) <= 1,
                `第 ${totalRows} 行通道 ${channel} 与整页参考一致：${png.data[offset + channel]} / ${reference.data[baseline + channel]}`);
            }
          }
          if (reference && totalRows >= reference.height && cssRow < Number(params.height)) {
            const red = cssRow % 251;
            if (red > 1 && red < 249) assert.ok(Math.abs(png.data[offset] - red) <= 1, `缩放尾段第 ${totalRows} 行编码连续`);
            assert.equal(png.data[offset + 2], 123);
          }
          totalRows++;
        }
      }
    }
    const restored = await page.evaluate(() => ({ top: document.getElementById('panel')?.scrollTop ?? scrollY, fixed: document.getElementById("fixed")?.style.visibility, sticky: document.getElementById("sticky")?.style.position }));
    assert.equal(restored.top, originalTop);
    if (params.mode === "fixed") assert.equal(restored.fixed, "");
    if (params.mode === "sticky") assert.equal(restored.sticky, "");
    return { folder: state.folder, count: state.count, covered: state.covered, dimensions: images.map(({ png, filename }) => ({ name: basename(filename), width: png.width, height: png.height })), dpr, referenceRows: reference?.height };
  }

  async function scenario(name, callback) {
    if (process.env.TEST_FILTER && !new RegExp(process.env.TEST_FILTER).test(name)) return;
    console.log("开始:", name);
    const started = Date.now();
    try {
      const details = await callback();
      results.push({ name, passed: true, durationMs: Date.now() - started, details });
      console.log("通过:", name, JSON.stringify(details));
    } catch (error) {
      results.push({ name, passed: false, durationMs: Date.now() - started, error: error.stack });
      await persist();
      throw error;
    }
    await persist();
  }

  const popupUI = () => evaluatePopup(`({
    language:document.documentElement.lang, browserLanguage:navigator.language,
    switch:document.getElementById('language').textContent,
    start:document.getElementById('start').textContent, stop:document.getElementById('stop').textContent,
    status:document.getElementById('status').textContent, count:document.getElementById('count').textContent,
    title:document.getElementById('title').textContent, folder:document.getElementById('folder').textContent,
    validation:document.getElementById('maxPages').validationMessage,
    overflowing:document.documentElement.scrollWidth > innerWidth
  })`);
  async function switchLanguage() {
    await evaluatePopup("document.getElementById('language').click()");
    await pause(150);
    return popupUI();
  }
  await scenario("语言默认英文且一键切换并记住选择", async () => {
    await worker.evaluate(async () => {
      await chrome.storage.local.remove('language');
      await chrome.storage.session.remove('capture');
    });
    await page.goto(`${origin}/?title=中文网页标题`);
    await openPopup();
    const english = await popupUI();
    assert.equal(english.browserLanguage, 'zh-CN');
    assert.equal(english.language, 'en'); assert.equal(english.switch, '中文');
    assert.equal(english.start, 'Start capture'); assert.equal(english.status, 'Ready');
    assert.equal(english.count, '0 images'); assert.equal(english.title, '中文网页标题');
    assert.equal(english.overflowing, false);
    await evaluatePopup('true', 'popup-english-v1.0.6.png');
    const chinese = await switchLanguage();
    assert.equal(chinese.language, 'zh-CN'); assert.equal(chinese.switch, 'English');
    assert.equal(chinese.start, '开始截图'); assert.equal(chinese.status, '准备就绪');
    assert.equal(chinese.overflowing, false);
    await evaluatePopup('true', 'popup-chinese-v1.0.6.png');
    assert.equal(await worker.evaluate(async()=> (await chrome.storage.local.get('language')).language), 'zh-CN');
    assert.equal(await worker.evaluate(()=>chrome.action.getTitle({})), 'ScrollShot · 连续滚动截图');
    await evaluatePopup('window.close()');
    await openPopup();
    assert.equal((await popupUI()).language, 'zh-CN');
    await switchLanguage();
    await evaluatePopup('window.close()');
    await openPopup();
    assert.equal((await popupUI()).language, 'en');
    assert.equal(await worker.evaluate(()=>chrome.action.getTitle({})), 'ScrollShot · Continuous screenshots');
    return { english, chinese, persistedAcrossReopen: true };
  });
  await scenario("截图中切换语言不重启任务且停止提示双语", async () => {
    assert.equal((await begin({height:'10000',title:'实时语言切换'}, {delay:1500})).response.ok, true);
    const before = await waitState(s=>s?.count >= 1);
    const english = await popupUI();
    assert.match(english.status, /^Saved \d+ images?$/);
    const chinese = await switchLanguage();
    assert.equal(chinese.stop,'停止截图'); assert.match(chinese.status,/^已保存 \d+ 张图片$/);
    const after = await getState();
    assert.equal(after.id,before.id); assert.ok(after.count >= before.count); assert.equal(after.running,true);
    await switchLanguage();
    await evaluatePopup("document.getElementById('stop').click()");
    const stopped = await waitState(s=>s && !s.running);
    await pause(150);
    assert.equal(stopped.id,before.id);
    assert.equal((await popupUI()).status,'Capture stopped. Saved images were kept.');
    assert.equal((await switchLanguage()).status,'已手动停止。');
    await switchLanguage();
    return { idUnchanged:true, count:stopped.count, stoppedMessage:stopped.message };
  });
  await scenario("完成和安全上限提示随语言切换", async () => {
    await completed({height:'1750',title:'双语完成提示'},1750);
    await pause(150);
    assert.equal((await popupUI()).status,'Reached the bottom of the page.');
    assert.equal((await switchLanguage()).status,'已到达网页底部。');
    await switchLanguage();
    assert.equal((await begin({height:'1750',title:'双语安全上限',mode:'infinite'},{maxPages:2})).response.ok,true);
    await waitState(s=>s && !s.running);
    await pause(150);
    const english = await popupUI();
    assert.equal(english.status,'Reached the 2-image limit. Saved images were kept.');
    const chinese = await switchLanguage();
    assert.equal(chinese.status,'已达到 2 张安全上限，已保存图片保留。');
    await switchLanguage();
    return {english:english.status,chinese:chinese.status};
  });
  await scenario("错误和输入校验按当前语言显示", async () => {
    await page.goto('chrome://version');
    await openPopup();
    await evaluatePopup("document.getElementById('start').click()");
    await pause(200);
    const english = await popupUI();
    assert.match(english.status,/Open a regular webpage/);
    const chinese = await switchLanguage();
    assert.match(chinese.status,/请在普通网页中使用/);
    await evaluatePopup("document.getElementById('maxPages').value='0';document.getElementById('start').click()");
    assert.equal((await popupUI()).validation,'请输入 1 到 5000 之间的整数。');
    const validation = await switchLanguage();
    assert.equal(validation.validation,'Enter a whole number from 1 to 5,000.');
    return {english:english.status,chinese:chinese.status,validation:validation.validation};
  });

  await scenario("长页末页裁切与逐像素行连续", () => completed({ height: "1750", title: "长页连续性" }, 1750));
  await scenario("正好两屏没有多余截图", () => completed({ height: "1600", title: "正好两屏" }, 1600));
  await scenario("短页仅一张", () => completed({ height: "350", title: "短页" }, 800));
  await scenario("隐藏固定栏并恢复原样", () => completed({ height: "1750", title: "固定页眉", mode: "fixed" }, 1750));
  await scenario("粘性标题只随正文出现一次", () => completed({ height: "1750", title: "粘性标题", mode: "sticky" }, 1790));
  await scenario("触底追加加载继续截图", () => completed({ height: "1750", title: "触底加载", mode: "lazy" }, 2850));
  await scenario("同名任务独立目录且每次从 0001 开始", async () => {
    const runs = [];
    for (let i = 0; i < 3; i++) {
      const details = await completed({ height: "1750", title: "独立任务目录" }, 1750);
      assert.equal(details.folder, i ? `独立任务目录 (${i})` : "独立任务目录");
      assert.deepEqual(details.dimensions.map(image => image.name), ['0001.png','0002.png','0003.png']);
      runs.push(details);
    }
    return { runs };
  });
  await scenario("无限滚动安全上限", async () => {
    assert.equal((await begin({ height: "1750", title: "无限滚动", mode: "infinite" }, { maxPages: 2 })).response.ok, true);
    const state = await waitState(s => s && !s.running);
    assert.equal(state.status, "stopped"); assert.equal(state.count, 2);
    assert.match(state.message, /安全上限/);
    return { count: state.count, message: state.message };
  });
  await scenario("手动停止恢复滚动位置", async () => {
    assert.equal((await begin({ height: "10000", title: "手动停止" })).response.ok, true);
    await waitState(s => s?.count >= 1);
    await evaluatePopup("chrome.runtime.sendMessage({type:'STOP'})");
    const state = await waitState(s => s && !s.running);
    assert.equal(state.status, "stopped");
    assert.equal(await page.evaluate(() => scrollY), 123);
    return { count: state.count, message: state.message };
  });
  await scenario("内部滚动面板连续截图并恢复", () => completed({ height: "1750", title: "内部面板", mode: "panel" }, 1750));
  await scenario("带偏移边框的固定滚动面板", () => completed({ height: "1750", title: "偏移内部面板", mode: "panel-offset" }, 1750));
  await scenario("切换标签页停止", async () => {
    assert.equal((await begin({ height: "10000", title: "切换标签页" })).response.ok, true);
    await waitState(s => s?.count >= 1);
    const other = await context.newPage();
    await other.bringToFront();
    const state = await waitState(s => s && !s.running);
    assert.equal(state.status, "stopped");
    assert.match(state.message, /标签页|前台/);
    await other.close();
    return { count: state.count, message: state.message };
  });
  await scenario("窗口尺寸变化停止", async () => {
    assert.equal((await begin({ height: "10000", title: "窗口调整" })).response.ok, true);
    await waitState(s => s?.count >= 1);
    await page.setViewportSize({ width: 1010, height: 800 });
    const state = await waitState(s => s && !s.running);
    assert.match(state.message, /尺寸|缩放/);
    await page.setViewportSize({ width: 1000, height: 800 });
    return { count: state.count, message: state.message };
  });
  await scenario("网页 110% 缩放仍能触底完成", async () => {
    await page.goto(`${origin}/?title=缩放准备`);
    await worker.evaluate(async () => {
      const [tab] = await chrome.tabs.query({active:true,currentWindow:true});
      await chrome.tabs.setZoom(tab.id, 1.1);
    });
    try {
      const details = await completed({ height: "1750", title: "网页缩放110" }, 1750);
      assert.ok(Math.abs(details.dpr - testedDpr * 1.1) < 0.001, "已实际启用网页缩放");
      return details;
    }
    finally {
      await worker.evaluate(async () => {
        const [tab] = await chrome.tabs.query({active:true,currentWindow:true});
        await chrome.tabs.setZoom(tab.id, 1);
      });
    }
  });
  await scenario("弹窗按钮与关闭弹窗后继续", async () => {
    await page.goto(`${origin}/?height=10000&title=弹窗按钮`);
    await openPopup();
    const old = await getState();
    await evaluatePopup("document.getElementById('start').click()", "popup-preview.png");
    await waitState(s => s?.id !== old?.id && s?.count >= 1);
    await evaluatePopup("window.close()");
    await waitState(s => s?.id !== old?.id && s?.count >= 2);
    await openPopup();
    await evaluatePopup("document.getElementById('stop').click()");
    const state = await waitState(s => s && !s.running);
    assert.equal(state.status, "stopped");
    assert.ok(state.count >= 2);
    return { count: state.count, message: state.message };
  });
  await scenario("插件弹窗失焦不应阻止截图", async () => {
    await worker.evaluate(() => {
      globalThis.__originalWindowGet = chrome.windows.get;
      chrome.windows.get = async (...args) => ({ ...await globalThis.__originalWindowGet(...args), focused: false });
    });
    try { return await completed({ height: "1750", title: "弹窗焦点回归" }, 1750); }
    finally {
      await worker.evaluate(() => { chrome.windows.get = globalThis.__originalWindowGet; delete globalThis.__originalWindowGet; });
    }
  });
  await scenario("隐藏双向格式字符的飞书式标题", () => completed({
    height: "1750",
    title: "\u202e\u200b\u2066".repeat(25) + "1-bit KV Cache 压缩方法预研：Fisher Anchor KV Cache" + "\u202c\u2069"
  }, 1750));
  await scenario("Unicode 非字符与首尾波浪号目录", () => completed({
    height: "1750", title: "~中文标题\u0085\ufdd0\ufffe\u{1ffff}~"
  }, 1750));
  await scenario("纯隐藏字符标题使用默认目录", () => completed({
    height: "1750", title: "\u200b\u202e\u2066\u202c\u2069"
  }, 1750));
  await scenario("超长中文标题截断后可下载", () => completed({
    height: "1750", title: "\u202e".repeat(80) + "中文长标题".repeat(40) + "~"
  }, 1750));
  await scenario("清除下载历史后仍使用新目录", async () => {
    const first = await completed({ height: "1750", title: "清除历史目录" }, 1750);
    await worker.evaluate(async folder => {
      const items = await chrome.downloads.search({ limit: 0 });
      for (const item of items.filter(item => item.filename.includes('/'+folder+'/'))) await chrome.downloads.erase({id:item.id});
    }, first.folder);
    const second = await completed({ height: "1750", title: "清除历史目录" }, 1750);
    assert.equal(second.folder, "清除历史目录 (1)");
    assert.equal(second.dimensions[0].name, "0001.png");
    const original = PNG.sync.read(await readFile(join(runDir, 'downloads', first.folder, '0001.png')));
    assert.equal(original.height, 800);
    return { first: first.folder, second: second.folder, firstImage: second.dimensions[0].name, originalPreserved: true };
  });
  await scenario("避让旧版本已下载目录并重置图片编号", async () => {
    const png = new PNG({width:1,height:1}); png.data.fill(255);
    const url = 'data:image/png;base64,' + PNG.sync.write(png).toString('base64');
    const oldId = await worker.evaluate(url => chrome.downloads.download({url, filename:'旧版目录/0018.png',saveAs:false}), url);
    for (let i=0; i<100; i++) {
      const item = await worker.evaluate(async id => (await chrome.downloads.search({id}))[0], oldId);
      if (item.state === 'complete') break;
      await pause(100);
    }
    const details = await completed({height:'1750',title:'旧版目录'},1750);
    assert.equal(details.folder,'旧版目录 (1)');
    assert.equal(details.dimensions[0].name,'0001.png');
    assert.equal(PNG.sync.read(await readFile(join(runDir,'downloads','旧版目录','0018.png'))).height,1);
    return { folder:details.folder, firstImage:details.dimensions[0].name, oldImagePreserved:true };
  });
  if (process.env.TEST_PAGE_URL) await scenario("NsightCompute 官方文档实际截图", async () => {
    await page.goto(process.env.TEST_PAGE_URL, { waitUntil: "load", timeout: 60000 });
    const title = await page.title();
    await openPopup();
    const previous = await getState();
    await evaluatePopup("document.getElementById('maxPages').value = '2'; document.getElementById('delay').value = '1500'; document.getElementById('start').click()");
    const state = await waitState(s => s?.id !== previous?.id && s && !s.running, 60000);
    assert.equal(state.count, 2, JSON.stringify(state));
    assert.equal(state.folder, folderName(title));
    const files = await worker.evaluate(async folder => (await chrome.downloads.search({limit:0})).filter(d => d.filename.includes('/'+folder+'/')).map(d => ({ filename:d.filename, state:d.state })), state.folder);
    assert.equal(files.length, 2);
    const sizes = [];
    for (const file of files) {
      assert.equal(file.state, 'complete');
      const png = PNG.sync.read(await readFile(file.filename));
      assert.ok(png.width > 0 && png.height > 0);
      sizes.push({ name: basename(file.filename), width: png.width, height: png.height });
    }
    return { url: process.env.TEST_PAGE_URL, title, count:state.count, message:state.message, dimensions:sizes };
  });
  await scenario("插件图标资源与弹窗一致", async () => {
    const manifest = await worker.evaluate(() => chrome.runtime.getManifest());
    for (const size of [16,32,48,128]) {
      assert.equal(manifest.icons[size],`icons/icon${size}.png`);
      const png = PNG.sync.read(await readFile(resolve('extension',manifest.icons[size])));
      assert.equal(png.width,size); assert.equal(png.height,size);
      assert.equal(png.data[3],0,'圆角外保留透明背景');
    }
    assert.equal(manifest.action.default_icon['16'],'icons/icon16.png');
    assert.equal(manifest.action.default_icon['32'],'icons/icon32.png');
    await page.goto(`${origin}/?title=图标预览`);
    await openPopup();
    const image = await evaluatePopup(`(async()=>{
      const img=document.querySelector('header img');await img.decode();
      return {src:img.getAttribute('src'),width:img.naturalWidth,height:img.naturalHeight,displayedWidth:img.getBoundingClientRect().width};
    })()`, 'popup-icon-preview.png');
    assert.equal(image.src,'icons/icon128.png');
    assert.equal(image.width,128);assert.equal(image.height,128);assert.equal(image.displayedWidth,42);
    return {version:manifest.version, sizes:[16,32,48,128], popup:image};
  });
  console.log(`全部 ${results.length} 个浏览器场景通过。`);
} finally {
  await persist();
  await context?.close();
  await new Promise(resolve => server.close(resolve));
}
