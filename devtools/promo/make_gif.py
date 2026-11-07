"""Builds promo/deckyhub.gif (800x500) from the screenshots/ JPGs, with short cross-fades:
  python devtools/promo/make_gif.py
Run devtools/deck/screenshots.mjs and screenshots_to_jpg.py first."""

from pathlib import Path

from PIL import Image

root = Path(__file__).resolve().parent.parent.parent
SIZE = (800, 500)
# (screenshot, how long it stays, in ms)
SCENES = [
    ("menu", 2200),
    ("discover", 1800),
    ("all-plugins", 1600),
    ("manage", 2600),
    ("scan-report", 2600),
    ("updates", 1500),
    ("installed", 1600),
    ("search", 1900),
    ("settings", 1800),
]
FADE_STEPS, FADE_MS = 2, 90

shots = [
    Image.open(root / "screenshots" / f"{name}.jpg").convert("RGB").resize(SIZE, Image.LANCZOS) for name, _ in SCENES
]
frames, durations = [], []
for index, (shot, (_, hold)) in enumerate(zip(shots, SCENES)):
    frames.append(shot)
    durations.append(hold)
    following = shots[(index + 1) % len(shots)]
    for step in range(1, FADE_STEPS + 1):
        frames.append(Image.blend(shot, following, step / (FADE_STEPS + 1)))
        durations.append(FADE_MS)
palette = [frame.quantize(colors=64, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE) for frame in frames]
palette[0].save(
    root / "promo" / "deckyhub.gif",
    save_all=True,
    append_images=palette[1:],
    duration=durations,
    loop=0,
    optimize=True,
    disposal=1,
)
print(
    "wrote promo/deckyhub.gif", (root / "promo" / "deckyhub.gif").stat().st_size // 1024, "KB,", len(frames), "frames"
)
