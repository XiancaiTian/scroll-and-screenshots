(() => {
  if (globalThis.__continuousCapture) return;
  globalThis.__continuousCapture = true;
  let session = null;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const root = () => document.scrollingElement || document.documentElement;
  const scroller = () => session?.scroller || root();
  function scrollTo(top, left = 0) {
    if (scroller() === root()) window.scrollTo({ top, left, behavior: "instant" });
    else scroller().scrollTo({ top, left, behavior: "instant" });
  }
  function metrics() {
    const element = scroller();
    const panel = element !== root();
    const rect = panel ? element.getBoundingClientRect() : null;
    const windowHeight = window.visualViewport?.height || innerHeight;
    return {
      top: element.scrollTop, height: element.scrollHeight, panel,
      viewportHeight: panel ? element.clientHeight : windowHeight,
      viewportWidth: innerWidth, windowHeight, windowWidth: innerWidth,
      contentWidth: panel ? element.clientWidth : document.documentElement.clientWidth,
      left: panel ? rect.left + element.clientLeft : 0,
      viewportTop: panel ? rect.top + element.clientTop : 0,
      dpr: devicePixelRatio
    };
  }

  function chooseScroller() {
    if (root().scrollHeight > innerHeight + 1) return root();
    let best = root(), largest = 0;
    for (const element of document.querySelectorAll("*")) {
      const rect = element.getBoundingClientRect();
      if (rect.width < innerWidth * 0.5 || rect.height < innerHeight * 0.4 ||
          element.scrollHeight <= element.clientHeight + 2 || !/auto|scroll/.test(getComputedStyle(element).overflowY)) continue;
      if (rect.left < -0.5 || rect.top < -0.5 || rect.right > innerWidth + 0.5 || rect.bottom > innerHeight + 0.5) continue;
      const area = element.clientWidth * element.clientHeight;
      if (area > largest) { best = element; largest = area; }
    }
    return best;
  }

  function change(element, property, value) {
    session.changes.push([element, property, element.style.getPropertyValue(property), element.style.getPropertyPriority(property)]);
    element.style.setProperty(property, value, "important");
  }

  function normalizeElements() {
    for (const element of document.querySelectorAll("*")) {
      if (session.seen.has(element)) continue;
      session.seen.add(element);
      const style = getComputedStyle(element);
      if (style.position === "sticky") {
        change(element, "position", "relative");
        for (const property of ["top", "right", "bottom", "left"]) change(element, property, "auto");
      }
      if (style.position === "fixed") {
        const rect = element.getBoundingClientRect();
        // 保留占据整屏的应用外壳，普通悬浮工具/页眉页脚不重复截取。
        if (!element.contains(scroller()) && rect.width * rect.height < innerWidth * innerHeight * 0.7) change(element, "visibility", "hidden");
      }
    }
  }

  function check() {
    if (!session || session.cancelReason) throw new Error(session?.cancelReason || "任务已结束。");
    if (innerWidth !== session.width || innerHeight !== session.height || devicePixelRatio !== session.dpr) {
      throw new Error("窗口尺寸或网页缩放发生变化，截图已停止。");
    }
    if (location.href !== session.url) throw new Error("网页地址已变化，截图已停止。");
    if (!scroller().isConnected) throw new Error("网页已替换滚动区域，截图已停止。");
    const view = metrics();
    if (view.left < -0.5 || view.viewportTop < -0.5 || view.left + view.contentWidth > innerWidth + 0.5 ||
        view.viewportTop + view.viewportHeight > view.windowHeight + 0.5) throw new Error("主体滚动区域不再完整可见，截图已停止。");
  }

  function verify(expected) {
    check();
    const actual = metrics();
    if (Math.abs(actual.top - expected.top) > 0.5 || actual.height !== expected.height || scroller().scrollLeft !== 0 ||
        ["left", "viewportTop", "viewportHeight", "contentWidth"].some(key => Math.abs(actual[key] - expected[key]) > 0.5)) {
      throw new Error("网页内容或滚动位置在截图时发生变化，请等待加载完成后重试。");
    }
  }

  async function settle(wait) {
    await sleep(wait);
    check();
    normalizeElements();
    // 给字体、懒加载图片与布局变化留出时间，但不无限等待网络。
    const images = [...document.images].filter(image => {
      const rect = image.getBoundingClientRect();
      return !image.complete && rect.bottom > 0 && rect.top < innerHeight;
    });
    await Promise.race([
      Promise.all([document.fonts.ready, ...images.map(image => image.decode().catch(() => {}))]),
      sleep(Math.max(wait, 1200))
    ]);
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    check();
  }

  function restore() {
    if (!session || session.restored) return;
    session.restored = true;
    document.removeEventListener("wheel", interrupt, true);
    document.removeEventListener("touchstart", interrupt, true);
    document.removeEventListener("keydown", interrupt, true);
    // 先恢复滚动，再恢复原有 smooth/snap 行为。
    scrollTo(session.originalTop, session.originalLeft);
    for (const [element, property, value, priority] of session.changes.reverse()) {
      if (value) element.style.setProperty(property, value, priority);
      else element.style.removeProperty(property);
    }
    session.style.remove();
  }

  function interrupt(event) {
    if (event.type === "keydown" && !["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " ", "Escape"].includes(event.key)) return;
    session.cancelReason = "检测到手动操作，截图已停止。";
  }

  async function run(id, delay, maxPages) {
    let status = "complete", message = "已到达网页底部。";
    try {
      let covered = 0, count = 0;
      for (;;) {
        check();
        const before = metrics();
        scrollTo(covered);
        const expectedTop = scroller().scrollTop;
        await settle(delay);
        let view = metrics();
        // 到达底部后再等待一次，允许触底加载追加内容。
        if (view.top + view.viewportHeight >= view.height - 0.5) {
          await settle(Math.max(1200, delay));
          view = metrics();
        }
        if (Math.abs(view.top - expectedTop) > 0.75) throw new Error("网页滚动位置自动变化，截图已停止。");
        if (covered > view.top + view.viewportHeight + 0.75) throw new Error("网页无法继续向下滚动，截图已停止。");
        if (view.top > covered + 0.75) throw new Error("页面自动跳过内容，截图已停止。");
        if (Math.min(view.top + view.viewportHeight, view.height) > covered + 0.001) {
          const result = await chrome.runtime.sendMessage({ type: "STEP", id, metrics: view });
          if (!result?.ok) throw new Error(result?.error || "截图服务无法响应。");
          covered = result.covered;
          count = result.count;
        }
        check();
        const after = metrics();
        if (after.height < covered - 0.75) throw new Error("页面内容已缩短，无法保证截图连续。");
        if (covered >= after.height - 0.001) {
          // 下载时也可能追加内容，最终再触底探测一次。
          scrollTo(after.height);
          await settle(Math.max(1200, delay));
          if (metrics().height <= covered + 0.001) break;
        }
        if (count >= maxPages) { status = "stopped"; message = `已达到 ${maxPages} 张安全上限，已保存图片保留。`; break; }
        if (after.top === before.top && covered < after.height && covered > after.top + after.viewportHeight + 0.75) {
          throw new Error("页面无法继续向下滚动，截图已停止。");
        }
      }
    } catch (error) {
      status = session?.cancelReason ? "stopped" : "error";
      message = error.message;
    } finally {
      restore();
      await chrome.runtime.sendMessage({ type: "FINISH", id, status, message }).catch(() => {});
      session = null;
    }
  }

  chrome.runtime.onMessage.addListener((request, _sender, respond) => {
    try {
      if (request.type === "PREPARE") {
        if (session) throw new Error("网页上已有截图任务。");
        session = { id: request.id, url: location.href, scroller: root(), originalTop: root().scrollTop,
          originalLeft: root().scrollLeft, width: innerWidth, height: innerHeight, dpr: devicePixelRatio,
          changes: [], seen: new WeakSet(), style: document.createElement("style") };
        session.style.textContent = "html,body{scroll-behavior:auto!important;scroll-snap-type:none!important;overflow-anchor:none!important}*{animation-play-state:paused!important;transition:none!important;caret-color:transparent!important}";
        (document.head || document.documentElement).append(session.style);
        session.scroller = chooseScroller();
        session.originalTop = scroller().scrollTop;
        session.originalLeft = scroller().scrollLeft;
        normalizeElements();
        for (const element of new Set([root(), document.documentElement, document.body, scroller()].filter(Boolean))) {
          change(element, "scroll-behavior", "auto");
          change(element, "scroll-snap-type", "none");
          change(element, "overflow-anchor", "none");
        }
        scrollTo(0);
        for (const event of ["wheel", "touchstart", "keydown"]) document.addEventListener(event, interrupt, { capture: true, passive: true });
        respond({ ok: true, metrics: metrics() });
      } else if (request.id !== session?.id) {
        respond({ ok: false, error: "截图任务不存在。" });
      } else if (request.type === "RUN") {
        session.running = true;
        respond({ ok: true });
        void run(request.id, request.delay, request.maxPages);
      } else if (request.type === "VERIFY") {
        verify(request.metrics); respond({ ok: true });
      } else if (request.type === "ABORT") {
        session.cancelReason = request.reason || "截图已停止。";
        // 正在运行时由 finally 恢复，避免恢复滚动后仍下载一张错误截图。
        if (!session.running) { restore(); session = null; }
        respond({ ok: true });
      }
    } catch (error) {
      if (request.type === "PREPARE") { restore(); session = null; }
      respond({ ok: false, error: error.message });
    }
  });
})();
