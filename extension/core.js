// 使用同一套绝对像素边界，避免缩放后逐张取整造成累计重叠。
export function cropRegion(metrics, covered, scale) {
  const { top, height, viewportHeight, viewportWidth, contentWidth } = metrics;
  if (top > covered + 0.75) throw new Error("页面滚动发生跳跃，已停止以免遗漏内容。");
  const end = Math.min(top + viewportHeight, height);
  const startPixel = Math.round(covered * scale);
  const endPixel = Math.round(end * scale);
  if (endPixel <= startPixel) return null;
  const x = Math.round((metrics.left || 0) * scale);
  return {
    x,
    y: Math.round((metrics.viewportTop || 0) * scale) + startPixel - Math.round(top * scale),
    width: Math.round(((metrics.left || 0) + Math.min(contentWidth, viewportWidth)) * scale) - x,
    height: endPixel - startPixel,
    end
  };
}

export function folderName(title) {
  let name = (title || "未命名网页").normalize("NFC")
    // Chrome 同时拒绝不可见格式字符和 Unicode 非字符；须在长度截断之前清理。
    .replace(/[\p{Cf}\p{Cs}\p{Noncharacter_Code_Point}]/gu, "")
    .replace(/[\p{Cc}<>:"/\\|?*]/gu, "_")
    .replace(/\.{2,}/g, "_").replace(/^[.\s~]+|[.\s~]+$/g, "");
  if (/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(name)) name = "_" + name;
  // 保留中文，按 UTF-8 字节限制长度，给下载目录路径留下余量。
  let safe = "";
  for (const char of name) {
    if (new TextEncoder().encode(safe + char).length > 160) break;
    safe += char;
  }
  return safe.replace(/[.\s~]+$/g, "") || "未命名网页";
}

export function imageName(index) {
  return String(index).padStart(4, "0") + ".png";
}

export function nextFolderName(base, folders) {
  const key = base.normalize("NFC").toLowerCase();
  let highest = -1;
  for (const folder of folders) {
    const name = folder.normalize("NFC").toLowerCase();
    if (name === key) highest = Math.max(highest, 0);
    else if (name.startsWith(key + " (") && name.endsWith(")")) {
      const suffix = name.slice(key.length + 2, -1);
      if (/^[1-9]\d*$/.test(suffix) && Number.isSafeInteger(Number(suffix))) {
        highest = Math.max(highest, Number(suffix));
      }
    }
  }
  return highest < 0 ? base : `${base} (${highest + 1})`;
}
