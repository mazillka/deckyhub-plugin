"""Turns screenshots.mjs's PNGs into the JPGs of screenshots/ (1280x800):
  python devtools/deck/screenshots_to_jpg.py <png-dir>
  python devtools/deck/screenshots_to_jpg.py <png-dir> remote    (remote-screenshots.mjs's, for the Remote Install manual)
The menu is the main screen behind it with the Quick Access panel (its own window) put on the right."""

import sys
from pathlib import Path

from PIL import Image

src = Path(sys.argv[1])
out = Path(__file__).resolve().parent.parent.parent / "screenshots"
SIZE = (1280, 800)


def with_panel(background: Path, panel_file: Path) -> Image.Image:
    """The main screen with the Quick Access panel (its own window) on the right."""
    screen = Image.open(background).convert("RGB").resize(SIZE, Image.LANCZOS)
    panel = Image.open(panel_file).convert("RGB")
    scale = SIZE[0] / panel.width
    panel = panel.resize((SIZE[0], round(panel.height * scale)), Image.LANCZOS)
    # The rail and cards fill the panel's left 487 of 1197 px; below the status bar, above the footer.
    width = round(487 * scale)
    screen.paste(panel.crop((0, 0, width, 680)), (SIZE[0] - width, 60))
    return screen


if sys.argv[2:] == ["remote"]:
    for name in ("remote-pair-mode", "remote-pairing-request", "remote-request"):
        with_panel(src / f"{name}-background.png", src / f"{name}-panel.png").save(out / f"{name}.jpg", quality=88)
    for name in ("remote-paired-devices", "remote-send-to-device"):
        Image.open(src / f"{name}.png").convert("RGB").resize(SIZE, Image.LANCZOS).save(out / f"{name}.jpg", quality=88)
    sys.exit()

for name in ("discover", "all-plugins", "manage", "updates", "installed", "search", "settings", "scan-report"):
    Image.open(src / f"{name}.png").convert("RGB").resize(SIZE, Image.LANCZOS).save(out / f"{name}.jpg", quality=88)

with_panel(src / "menu-background.png", src / "menu-panel.png").save(out / "menu.jpg", quality=88)
