"""Turns screenshots.mjs's PNGs into the JPGs of screenshots/ (1280x800):
  python devtools/deck/screenshots_to_jpg.py <png-dir>
The menu is the main screen behind it with the Quick Access panel (its own window) put on the right."""
import sys
from pathlib import Path
from PIL import Image

src = Path(sys.argv[1])
out = Path(__file__).resolve().parent.parent.parent / "screenshots"
SIZE = (1280, 800)
for name in ("discover", "all-plugins", "manage", "updates", "installed", "search", "settings", "scan-report"):
    Image.open(src / f"{name}.png").convert("RGB").resize(SIZE, Image.LANCZOS).save(out / f"{name}.jpg", quality=88)

menu = Image.open(src / "menu-background.png").convert("RGB").resize(SIZE, Image.LANCZOS)
panel = Image.open(src / "menu-panel.png").convert("RGB")
scale = SIZE[0] / panel.width
panel = panel.resize((SIZE[0], round(panel.height * scale)), Image.LANCZOS)
# The rail and cards fill the panel's left 487 of 1197 px; below the status bar, above the footer.
width = round(487 * scale)
menu.paste(panel.crop((0, 0, width, 680)), (SIZE[0] - width, 60))
menu.save(out / "menu.jpg", quality=88)
