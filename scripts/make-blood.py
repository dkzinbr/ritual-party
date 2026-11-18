import numpy as np
from PIL import Image, ImageFilter

W, H = 1600, 2200
rng = np.random.default_rng(41)


def layer(down: int, blur: float) -> np.ndarray:
    small = rng.random((max(3, H // down), max(3, W // down))).astype(np.float32)
    img = Image.fromarray((small * 255).astype(np.uint8), mode="L")
    img = img.resize((W, H), Image.Resampling.BICUBIC)
    if blur > 0:
        img = img.filter(ImageFilter.GaussianBlur(blur))
    return np.asarray(img).astype(np.float32) / 255.0


def soften(field: np.ndarray, radius: float) -> np.ndarray:
    img = Image.fromarray(np.clip(field * 255, 0, 255).astype(np.uint8), mode="L")
    img = img.filter(ImageFilter.GaussianBlur(radius))
    return np.asarray(img).astype(np.float32) / 255.0


wash = layer(70, 48)
drift = layer(36, 28)
grain = rng.random((H, W)).astype(np.float32)

pools = soften(np.clip((0.46 - layer(55, 8)) * 3.4, 0, 1), 26)
streaks = soften(np.clip((layer(24, 6) - 0.72) * 6, 0, 1), 6)
wet = soften(np.clip((wash - 0.62) * 3.5, 0, 1), 18)

red = 168 + wash * 36 + drift * 16
green = 22 + wash * 14
blue = 24 + wash * 10

red = red * (1 - pools * 0.58) * (1 - streaks * 0.45) + wet * 28
green = green * (1 - pools * 0.62) * (1 - streaks * 0.5) + wet * 6
blue = blue * (1 - pools * 0.55) * (1 - streaks * 0.4) + wet * 5

fiber = layer(5, 0.7)
fiber_dark = np.clip((0.55 - fiber) * 1.4, 0, 1)
red = red * (1 - fiber_dark * 0.16) + (grain - 0.5) * 7
green = green * (1 - fiber_dark * 0.2) + (grain - 0.5) * 3
blue = blue * (1 - fiber_dark * 0.16) + (grain - 0.5) * 3

yy, xx = np.mgrid[0:H, 0:W]
nx = (xx / W - 0.48)
ny = (yy / H - 0.5)
edge = np.clip((nx * nx * 1.1 + ny * ny) ** 0.9, 0, 1)
red = red * (1 - edge * 0.38) 
green = green * (1 - edge * 0.45)
blue = blue * (1 - edge * 0.42)

rgb = np.dstack([
    np.clip(red, 0, 255),
    np.clip(green, 0, 255),
    np.clip(blue, 0, 255),
]).astype(np.uint8)

Image.fromarray(rgb, "RGB").save("public/blood-field.jpg", quality=88, optimize=True)

crack = soften(streaks, 1)
crack = np.clip((crack - 0.25) * 4, 0, 1)
Image.fromarray((crack * 255).astype(np.uint8), "L").resize((640, 880), Image.Resampling.BICUBIC).save(
    "public/cracks.png", optimize=True
)
print("mean", rgb.mean(axis=(0, 1)), "streaks", float(streaks.mean()), "pools", float(pools.mean()))
