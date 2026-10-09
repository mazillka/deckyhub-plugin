"""Build the GitHub Pages site into OUT (default _site).

Copies docs/ and registry/apps.json, writes the bundled catalog into index.html
so crawlers see it without JavaScript, and makes WebP screenshots plus a JPEG
link-preview image from screenshots/. Needs Pillow (CI-only, not a plugin dependency).
"""
import json
import shutil
import sys
from html import escape
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
out = Path(sys.argv[1] if len(sys.argv) > 1 else "_site")

shutil.copytree(ROOT / "docs", out, dirs_exist_ok=True)
shutil.copytree(ROOT / "registry", out / "registry", dirs_exist_ok=True)

apps = json.loads((ROOT / "registry" / "apps.json").read_text(encoding="utf-8"))["apps"]
cards = "\n".join(
    f'<a class="app" href="https://github.com/{escape(a["repo"])}"><small>{escape(a["category"])}</small>'
    f'<strong>{escape(a["name"])}</strong><p>{escape(a.get("description", ""))}</p><code>{escape(a["repo"])}</code></a>'
    for a in apps
)
index = out / "index.html"
page = index.read_text(encoding="utf-8")
if "<!-- catalog -->" not in page:
    sys.exit("docs/index.html is missing the <!-- catalog --> placeholder")
index.write_text(page.replace("<!-- catalog -->", cards), encoding="utf-8")

img = out / "img"
img.mkdir(exist_ok=True)
for shot in (ROOT / "screenshots").glob("*.jpg"):
    image = Image.open(shot)
    image.save(img / f"{shot.stem}.webp", quality=78, method=6)
    image.resize((640, round(image.height * 640 / image.width)), Image.LANCZOS).save(img / f"{shot.stem}-640.webp", quality=78, method=6)
shutil.copy(ROOT / "screenshots" / "discover.jpg", img / "og.jpg")
