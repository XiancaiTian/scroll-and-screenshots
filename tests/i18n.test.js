import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { normalizeLanguage, text, translateMessage } from "../extension/i18n.js";

test("没有语言偏好时默认英文，不跟随浏览器中文语言", () => {
  for (const value of [undefined, null, "", "zh", "fr"]) {
    assert.equal(normalizeLanguage(value), "en");
    assert.equal(text("start", value), "Start capture");
  }
  assert.equal(normalizeLanguage("zh-CN"), "zh-CN");
  assert.equal(text("start", "zh-CN"), "开始截图");
});

test("HTML 所有可翻译控件均有完整双语文本", async () => {
  const html = await readFile(new URL("../extension/popup.html", import.meta.url), "utf8");
  for (const [, key] of html.matchAll(/data-i18n="(\w+)"/g)) {
    assert.ok(text(key, "en"));
    assert.ok(text(key, "zh-CN"));
  }
  assert.equal(text("folder", "en", { folder: "中文 / Example {count}" }), "Save to: Downloads / 中文 / Example {count} /");
});

test("进度和安全上限按当前选择翻译，保留历史中文消息", () => {
  assert.equal(translateMessage("已保存 1 张图片"), "Saved 1 image");
  assert.equal(translateMessage("已保存 123 张图片"), "Saved 123 images");
  assert.equal(translateMessage("已达到 1000 张安全上限，已保存图片保留。"), "Reached the 1000-image limit. Saved images were kept.");
  assert.equal(translateMessage("已保存 123 张图片", "zh-CN"), "已保存 123 张图片");
  assert.equal(translateMessage("图片下载失败：下载记录丢失"), "Image download failed: download record missing");
  assert.equal(translateMessage("图片下载失败：NETWORK_FAILED"), "Image download failed: NETWORK_FAILED");
});

test("全部已有截图状态和错误均可显示为英文", async () => {
  for (const filename of ["background.js", "content.js", "core.js", "popup.js"]) {
    const source = await readFile(new URL(`../extension/${filename}`, import.meta.url), "utf8");
    for (const [, message] of source.matchAll(/"([^"\n]*[\u4e00-\u9fff][^"\n]*)"/g)) {
      if (["未命名网页", "图片下载失败：", "下载记录丢失", "中文"].includes(message)) continue;
      assert.doesNotMatch(translateMessage(message), /[\u4e00-\u9fff]/, `${filename}: ${message}`);
      assert.equal(translateMessage(message, "zh-CN"), message);
    }
  }
});

test("浏览器错误保留诊断信息，文件名错误支持中文", () => {
  assert.equal(translateMessage("Invalid filename", "zh-CN"), "文件名无效。");
  assert.equal(translateMessage("Could not establish connection. Receiving end does not exist."), "Could not establish connection. Receiving end does not exist.");
  assert.equal(translateMessage(undefined), "Ready");
  assert.equal(translateMessage(undefined, "zh-CN"), "准备就绪");
});
