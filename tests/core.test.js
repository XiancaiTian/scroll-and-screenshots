import test from "node:test";
import assert from "node:assert/strict";
import { cropRegion, folderName, imageName, nextFolderName } from "../extension/core.js";

const view = (top, height, viewportHeight = 800) => ({ top, height, viewportHeight, viewportWidth: 1200, contentWidth: 1185 });

test("末页只保存新增的 150 行，不重复上一屏", () => {
  assert.deepEqual(cropRegion(view(950, 1750), 1600, 1), { x: 0, y: 650, width: 1185, height: 150, end: 1750 });
});
test("单屏页面和正好整屏的末页", () => {
  assert.equal(cropRegion(view(0, 800), 0, 1).height, 800);
  assert.equal(cropRegion(view(800, 1600), 800, 2).height, 1600);
  assert.equal(cropRegion(view(800, 1600), 1600, 2), null);
});
test("不同像素比下所有切片总高度精确等于文档像素高度", () => {
  for (const scale of [1, 1.1, 1.25, 1.5, 1.75, 2, 2.5]) {
    for (const height of [800, 801, 1750, 4801, 8703]) {
      let covered = 0, pixels = 0;
      while (covered < height) {
        const top = Math.min(covered, Math.max(0, height - 800));
        const region = cropRegion(view(top, height), covered, scale);
        assert.ok(region && region.y >= 0);
        pixels += region.height;
        covered = region.end;
      }
      assert.equal(pixels, Math.round(height * scale));
    }
  }
});
test("滚动跳过内容时拒绝保存", () => {
  assert.throws(() => cropRegion(view(900, 3000), 800, 1), /遗漏/);
});
test("内部滚动面板只裁取正文矩形，保留末页新增区域", () => {
  const metrics = { ...view(1050, 1750, 700), left: 90, viewportTop: 60, contentWidth: 810 };
  assert.deepEqual(cropRegion(metrics, 1400, 1), { x: 90, y: 410, width: 810, height: 350, end: 1750 });
});
test("标题可用于单层目录，保留中文，清理路径和保留字", () => {
  assert.equal(folderName("深圳徒步｜记录"), "深圳徒步｜记录");
  assert.equal(folderName("../a/b\\c:*?\n"), "__a_b_c____");
  assert.equal(folderName(" .. "), "_");
  assert.equal(folderName("CON"), "_CON");
  assert.equal(folderName(""), "未命名网页");
  assert.ok(new TextEncoder().encode(folderName("中".repeat(300))).length <= 160);
});
test("新任务目录遇到同名时按最大后缀递增", () => {
  assert.equal(nextFolderName("网页", []), "网页");
  assert.equal(nextFolderName("网页", ["网页", "网页 (1)", "网页 (3)", "其他 (100)"]), "网页 (4)");
  assert.equal(nextFolderName("网页", ["网页 (2)"]), "网页 (3)");
});
test("目录重名比较兼容大小写、Unicode 规范化和括号标题", () => {
  assert.equal(nextFolderName("Report", ["REPORT", "report (1)"]), "Report (2)");
  assert.equal(nextFolderName("Café", ["Cafe\u0301"]), "Café (1)");
  assert.equal(nextFolderName("报告 (1)", ["报告 (1)", "报告 (1) (2)"]), "报告 (1) (3)");
  const base = folderName("中".repeat(100));
  assert.ok(new TextEncoder().encode(nextFolderName(base, [base])).length < 255);
});
test("每个任务的图片名从 0001 开始", () => {
  assert.equal(imageName(1), "0001.png");
  assert.equal(imageName(7), "0007.png");
  assert.equal(imageName(10001), "10001.png");
});
test("网页标题中的不可见格式字符不进入目录或消耗标题字节预算", () => {
  const title = "\u202e\u200b\u2066".repeat(25) + "1-bit KV Cache 压缩方法预研：Fisher Anchor KV Cache" + "\u202c\u2069";
  const name = folderName(title);
  assert.equal(name, "1-bit KV Cache 压缩方法预研：Fisher Anchor KV Cache");
  assert.doesNotMatch(name, /[\p{Cf}\p{Cc}\p{Cs}]/u);
});
test("清理 C1 控制字符、Unicode 非字符、孤立代理与首尾波浪号", () => {
  assert.equal(folderName("\u200b\u2066\u202e"), "未命名网页");
  assert.equal(folderName("~中文标题~"), "中文标题");
  assert.equal(folderName("前\u0085后\ufdd0\ufffe\u{1ffff}\ud800"), "前_后");
  assert.equal(folderName("截图😀中文"), "截图😀中文");
});
