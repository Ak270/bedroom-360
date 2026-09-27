"""Stitch six overscanned cube faces into an equirectangular panorama.

usage: stitch360.py <dir> <spot> <fovDeg> <headingDeg> <out.jpg>
Face images <dir>/<spot>_<face>.png were rendered with the camera forward/up
listed in FACES (same as capture360.mjs) and a square FOV of fovDeg. The
panorama's centre column looks along `heading` (compass: 0 north = -Z,
90 east = +X), so viewers open facing the intended view.
"""
import sys
import numpy as np
from PIL import Image

FACES = {
    'px': ((1, 0, 0), (0, 1, 0)),
    'nx': ((-1, 0, 0), (0, 1, 0)),
    'pz': ((0, 0, 1), (0, 1, 0)),
    'nz': ((0, 0, -1), (0, 1, 0)),
    'py': ((0, 1, 0), (0, 0, -1)),
    'ny': ((0, -1, 0), (0, 0, 1)),
}
W, H = 4096, 2048


def main():
    d, spot, fov, heading, out = sys.argv[1], sys.argv[2], float(sys.argv[3]), float(sys.argv[4]), sys.argv[5]
    half = np.tan(np.radians(fov / 2))
    u = (np.arange(W) + 0.5) / W
    v = (np.arange(H) + 0.5) / H
    lon = np.radians(heading) + (u - 0.5) * 2 * np.pi
    lat = (0.5 - v) * np.pi
    lon, lat = np.meshgrid(lon, lat)
    # compass -> world: heading 0 = -Z, 90 = +X
    dirs = np.stack([np.sin(lon) * np.cos(lat), np.sin(lat), -np.cos(lon) * np.cos(lat)], axis=-1)
    out_img = np.zeros((H, W, 3), dtype=np.float32)
    best = np.full((H, W), -np.inf)
    for name, (f, up) in FACES.items():
        f = np.array(f, dtype=np.float64)
        up = np.array(up, dtype=np.float64)
        r = np.cross(f, up)
        img = np.asarray(Image.open(f'{d}/{spot}_{name}.png').convert('RGB'), dtype=np.float32)
        n = img.shape[0]
        dz = dirs @ f
        x = (dirs @ r) / np.maximum(dz, 1e-6)
        y = (dirs @ up) / np.maximum(dz, 1e-6)
        # Use each face only where it is the most frontal (its own 90 deg cell).
        use = (dz > best) & (dz > 0)
        col = ((x / half + 1) / 2 * n - 0.5).clip(0, n - 1.001)
        row = ((1 - y / half) / 2 * n - 0.5).clip(0, n - 1.001)
        c0 = np.floor(col).astype(int)
        r0 = np.floor(row).astype(int)
        fc = (col - c0)[..., None]
        fr = (row - r0)[..., None]
        s = (img[r0, c0] * (1 - fc) * (1 - fr) + img[r0, c0 + 1] * fc * (1 - fr)
             + img[r0 + 1, c0] * (1 - fc) * fr + img[r0 + 1, c0 + 1] * fc * fr)
        out_img[use] = s[use]
        best = np.where(use, dz, best)
    Image.fromarray(out_img.clip(0, 255).astype(np.uint8)).save(out, quality=84, optimize=True, progressive=True)
    print('saved', out)


main()
