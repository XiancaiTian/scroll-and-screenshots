"""打包可直接解压加载的插件，不包含测试文件和浏览器配置。"""
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile
import json

root = Path(__file__).resolve().parents[1]
version = json.loads((root / "extension" / "manifest.json").read_text())["version"]
project_name = json.loads((root / "package.json").read_text())["name"]
prefix = project_name + "/"
target = root / "dist" / f"{project_name}-v{version}.zip"
target.parent.mkdir(exist_ok=True)
with ZipFile(target, "w", ZIP_DEFLATED) as archive:
    for source in sorted((root / "extension").rglob("*")):
        if source.is_file() and source.name != ".DS_Store":
            archive.write(source, prefix + source.relative_to(root / "extension").as_posix())
    archive.write(root / "README.md", prefix + "README.md")
    archive.write(root / "README.zh-CN.md", prefix + "README.zh-CN.md")
    archive.write(root / "assets" / "scrollshot-icon-512.png", prefix + "assets/scrollshot-icon-512.png")
    archive.write(root / "LICENSE", prefix + "LICENSE")
print(target)
