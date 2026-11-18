"""Trace a crop of a scan (icon, emblem, logo, map region) to SVG; retrace an SVG; proof sheet; B&W render.

Game tracing scripts folded into one tool: mask by threshold or
colour quantise, clean, upscale, smooth, potrace, stack the layers. Nothing about a game lives here: colours, boxes
and paths come from arguments. potracer (pure Python potrace), PyMuPDF (SVG and PDF rasteriser) and vtracer (engine vtracer) are
imported when used."""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import re
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

Image.MAX_IMAGE_PIXELS = None
INK = "#231f20"


def load_rgb(path_or_img) -> np.ndarray:
    """RGB uint8 array; alpha is composited on white."""
    im = path_or_img if isinstance(path_or_img, Image.Image) else Image.open(path_or_img)
    im = im.convert("RGBA")
    bg = Image.new("RGBA", im.size, (255, 255, 255, 255))
    bg.alpha_composite(im)
    return np.asarray(bg.convert("RGB"))


def prepare(rgb, box=None, upscale=4, blur=0.0) -> np.ndarray:
    """Crop (x0, y0, x1, y1, right/bottom exclusive), Lanczos upscale, Gaussian blur (sigma in source pixels)."""
    im = Image.fromarray(rgb)
    if box:
        im = im.crop(tuple(box))
    if upscale != 1:
        im = im.resize((round(im.width * upscale), round(im.height * upscale)), Image.LANCZOS)
    a = np.asarray(im).astype(float)
    return ndi.gaussian_filter(a, (blur * upscale, blur * upscale, 0)) if blur else a


def lum(a):
    return a[..., 0] * 0.299 + a[..., 1] * 0.587 + a[..., 2] * 0.114


def otsu(values) -> int:
    v = np.clip(np.asarray(values).astype(int), 0, 255).ravel()
    hist = np.bincount(v, minlength=256).astype(float)
    total, s_all = v.size, (np.arange(256) * hist).sum()
    best, t_best, w0, s0 = -1.0, 128, 0.0, 0.0
    for t in range(256):
        w0 += hist[t]
        if w0 == 0 or w0 == total:
            continue
        s0 += t * hist[t]
        b = w0 * (total - w0) * (s0 / w0 - (s_all - s0) / (total - w0)) ** 2
        if b > best:
            best, t_best = b, t
    return t_best


def clean(mask, min_area=0, drop_border=False):
    """Drop connected components smaller than min_area pixels (and, with drop_border, those touching the edge)."""
    lab, n = ndi.label(mask)
    if not n:
        return mask
    keep = np.zeros(n + 1, bool)
    keep[1:] = ndi.sum(mask, lab, np.arange(1, n + 1)) >= min_area
    if drop_border:
        keep[np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))] = False
    return keep[lab]


def threshold_mask(a, level=None, invert=False):
    """True = ink. Dark pixels are ink unless invert; level None = Otsu."""
    L = lum(a) if a.ndim == 3 else a
    t = otsu(L) if level is None else level
    return (L > t) if invert else (L <= t)


def quantise(a, k, seed=1):
    """k-means colours of an RGB array: (labels HxW, centres kx3 sorted dark to light)."""
    import cv2
    px = a.reshape(-1, 3).astype(np.float32)
    cv2.setRNGSeed(seed)
    _, lab, cen = cv2.kmeans(px, k, None, (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 20, 0.5), 3,
                             cv2.KMEANS_PP_CENTERS)
    order = np.argsort(lum(cen))
    rank = np.empty(k, int)
    rank[order] = np.arange(k)
    return rank[lab.reshape(a.shape[:2])], cen[order]


def hexc(c):
    return "#%02x%02x%02x" % tuple(int(round(v)) for v in np.clip(c, 0, 255))


def is_light(hexcol, floor=235):
    h = hexcol.lstrip("#")
    return len(h) == 6 and all(int(h[i:i + 2], 16) >= floor for i in (0, 2, 4))


def path_d(mask, scale=1.0, ox=0.0, oy=0.0, turdsize=4, alphamax=1.0, opttolerance=0.25, prec=2) -> str:
    """potrace of a boolean raster (True = drawn) as one SVG path; (x + ox) / scale."""
    import potrace
    curves = potrace.Bitmap(~np.asarray(mask, bool)).trace(
        turdsize=turdsize, alphamax=alphamax, opticurve=True, opttolerance=opttolerance)
    f = lambda p: f"{(p.x + ox) / scale:.{prec}f} {(p.y + oy) / scale:.{prec}f}"  # noqa: E731
    out = []
    for c in curves:
        out.append("M" + f(c.start_point))
        for s in c.segments:
            out.append(f"L{f(s.c)}L{f(s.end_point)}" if s.is_corner else f"C{f(s.c1)} {f(s.c2)} {f(s.end_point)}")
        out.append("Z")
    return "".join(out)


def trim(masks, pad=0):
    u = np.zeros_like(masks[0])
    for m in masks:
        u = u | m
    ys, xs = np.nonzero(u)
    if not len(ys):
        return 0, 0, u.shape[1], u.shape[0]
    return (max(xs.min() - pad, 0), max(ys.min() - pad, 0), min(xs.max() + 1 + pad, u.shape[1]),
            min(ys.max() + 1 + pad, u.shape[0]))


def svg_doc(layers, w, h, title=None, off=None) -> str:
    """layers: [(fill colour, path d)] bottom to top."""
    body = "".join(f'<path fill="{c}" fill-rule="evenodd" d="{d}"/>' for c, d in layers if d)
    t = f"<title>{title}</title>" if title else ""
    o = f' data-offset="{off[0]} {off[1]}"' if off else ""
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}"{o}>{t}{body}</svg>\n'


def emit(layer_masks, scale, fit=True, pad=2, **kw) -> str:
    """layer_masks: [(colour, mask)] bottom to top. fit: the viewBox is trimmed to the union of the masks (+pad px)."""
    h0, w0 = layer_masks[0][1].shape
    x0, y0, x1, y1 = trim([m for _, m in layer_masks], round(pad * scale)) if fit else (0, 0, w0, h0)
    layers = [(c, path_d(m[y0:y1, x0:x1], scale, **kw)) for c, m in layer_masks]
    return svg_doc(layers, round((x1 - x0) / scale, 2), round((y1 - y0) / scale, 2),
                   off=(round(x0 / scale, 2), round(y0 / scale, 2)) if fit else None)


def symmetrise(L, valid, cx, cy, n, mirror=True):
    """Average a map over the n rotations (and mirrors) about (cx, cy), weighted by where it is visible (valid)."""
    H, W = L.shape
    Y, X = np.mgrid[0:H, 0:W].astype(float)

    def sample(a, xs, ys):
        x0, y0 = np.floor(xs).astype(int), np.floor(ys).astype(int)
        fx, fy = xs - x0, ys - y0
        ok = (x0 >= 0) & (y0 >= 0) & (x0 < W - 1) & (y0 < H - 1)
        xc, yc = np.clip(x0, 0, W - 2), np.clip(y0, 0, H - 2)
        v = (a[yc, xc] * (1 - fx) * (1 - fy) + a[yc, xc + 1] * fx * (1 - fy) + a[yc + 1, xc] * (1 - fx) * fy
             + a[yc + 1, xc + 1] * fx * fy)
        return np.where(ok, v, 0)

    def tr(a, ang, m):
        dx, dy = X - cx, Y - cy
        if m:
            dx = -dx
        c, s = np.cos(ang), np.sin(ang)
        return sample(a, cx + c * dx - s * dy, cy + s * dx + c * dy)

    V = np.asarray(valid, float)
    num, den = np.zeros(L.shape), np.zeros(L.shape)
    for k in range(n):
        for m in ([False, True] if mirror else [False]):
            num += tr(L * V, 2 * np.pi * k / n, m)
            den += tr(V, 2 * np.pi * k / n, m)
    return np.where(den > 0.5, num / np.maximum(den, 1e-6), 0)


def trace_array(a, mode="threshold", level=None, invert=False, colours=None, k=4, fill=INK, min_area=0.002,
                drop_border=False, drop_light=True, sym=None, centre=None, scale=1.0, fit=True, **kw) -> str:
    """Trace an upscaled float RGB array (see prepare) to SVG text.

    threshold: one layer in `fill` (ink = dark pixels, or light with invert). quantise: k colours by k-means, one
    layer per colour (the cluster's colour, or `colours` listed dark to light), the lightest dropped when it is
    paper white and drop_light. sym (n, mirror): average the ink map over that symmetry group about centre (x, y in
    array px; default middle). min_area: fraction of the image below which a speck is dropped. kw goes to path_d
    (turdsize, alphamax, opttolerance, prec)."""
    area = min_area * a.shape[0] * a.shape[1]
    if mode == "threshold":
        m = threshold_mask(a, level, invert)
        if sym:
            cx, cy = centre or (a.shape[1] / 2, a.shape[0] / 2)
            m = symmetrise(m.astype(float), np.ones(m.shape), cx, cy, sym[0], sym[1]) > 0.5
        return emit([(fill, clean(m, area, drop_border))], scale, fit, **kw)
    lab, cen = quantise(a, k)
    cols = list(colours) if colours else [hexc(c) for c in cen]
    layers = []
    for i, col in enumerate(cols[:k]):
        if drop_light and i == k - 1 and is_light(col, 200):
            continue
        layers.append((col, clean(lab == i, area, drop_border)))
    return emit(layers, scale, fit, **kw)


def trace_vtracer(a, scale=1.0, speckle=8, color_precision=6, layer_difference=12, corner_threshold=60,
                  length_threshold=3.5, splice_threshold=45, prec=2, drop_light=True) -> str:
    """Colour trace of an upscaled RGB array by vtracer (stacked layers, splines): keeps subtle gradients that
    k-means loses. The SVG is scaled back to source pixels (viewBox in array px); with drop_light, paths filled
    near-white (the paper) are removed."""
    import vtracer
    buf = io.BytesIO()
    Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).save(buf, "PNG")
    svg = vtracer.convert_raw_image_to_svg(
        buf.getvalue(), img_format="png", colormode="color", hierarchical="stacked", mode="spline",
        filter_speckle=speckle, color_precision=color_precision, layer_difference=layer_difference,
        corner_threshold=corner_threshold, length_threshold=length_threshold, splice_threshold=splice_threshold,
        path_precision=prec)
    h, w = a.shape[:2]
    svg = re.sub(r'width="\d+" height="\d+"', f'width="{round(w / scale, 2)}" height="{round(h / scale, 2)}" viewBox="0 0 {w} {h}"', svg, count=1)
    if drop_light:
        svg = re.sub(r'<path\b[^>]*fill="#(?:[EFef][0-9a-fA-F]){3}"[^>]*/>\s*', "", svg)
    return svg


def render_svg(svg, width=None, scale=None, bg="white") -> Image.Image:
    """Rasterise SVG text (PyMuPDF) to RGB over a background; width px, or scale of the SVG's own size."""
    import pymupdf
    p = pymupdf.open(stream=svg.encode("utf-8"), filetype="svg")[0]
    z = scale or (width / p.rect.width if width else 1.0)
    pm = p.get_pixmap(matrix=pymupdf.Matrix(z, z), alpha=True)
    im = Image.open(io.BytesIO(pm.tobytes("png"))).convert("RGBA")
    base = Image.new("RGBA", im.size, bg)
    base.alpha_composite(im)
    return base.convert("RGB")


def ink_mask(img, floor=200):
    return np.asarray(img.convert("RGB")).min(axis=2) < floor


def iou(a, b) -> float:
    return float((a & b).sum() / max(1, (a | b).sum()))


def fidelity(src: Image.Image, svg: str):
    """(mean abs difference, ink IoU) of the SVG rendered at the source's size against the source (a trace made
    by this tool, trimmed or not, is placed by its data-offset; any other SVG is stretched to the source)."""
    m = re.search(r'data-offset="([-\d.]+) ([-\d.]+)"', svg)
    if m:  # a trimmed trace says where it sits in the crop
        r = Image.new("RGB", src.size, "white")
        r.paste(render_svg(svg, scale=1.0), (round(float(m.group(1))), round(float(m.group(2)))))
    else:
        r = render_svg(svg, src.width).resize(src.size, Image.LANCZOS)
    a, b = np.asarray(src.convert("RGB"), float), np.asarray(r, float)
    return round(float(np.abs(a - b).mean()), 2), round(iou(ink_mask(src), ink_mask(r)), 3)


def svg_points(svg) -> int:
    """Number of coordinate pairs in the SVG's path data (a measure of how simplified it is)."""
    return sum(len(re.findall(r"-?\d+\.?\d*\s+-?\d+\.?\d*", d)) for d in re.findall(r' d="([^"]*)"', svg))


def retrace_svg(svg, res=8, **kw) -> str:
    """Rasterise each fill colour of an SVG alone at res px per unit and trace it again (kw to path_d: turdsize,
    alphamax, opttolerance, prec). Layer order, colours and the viewBox are kept."""
    head = re.search(r"<svg\b[^>]*>", svg).group(0)
    paths = re.findall(r"<path\b[^>]*?/>", svg)
    order = []
    for p in paths:
        m = re.search(r'fill="([^"]+)"', p)
        if m and m.group(1) != "none" and m.group(1) not in order:
            order.append(m.group(1))
    vb = re.search(r'viewBox="([^"]+)"', head)
    x0, y0, vw, vh = [float(v) for v in vb.group(1).replace(",", " ").split()]
    body = ""
    for col in order:
        only = "".join(re.sub(r'\bfill="[^"]*"', 'fill="#000000"', p) for p in paths if f'fill="{col}"' in p)
        im = render_svg(head + only + "</svg>", width=round(vw * res))
        d = path_d(np.asarray(im.convert("L")) < 128, res, x0 * res, y0 * res, **kw)
        if d:
            body += f'<path fill="{col}" fill-rule="evenodd" d="{d}"/>'
    return head + body + "</svg>\n"


def proof_sheet(pairs, out, cell=256, cols=4, label=True) -> Path:
    """pairs: [(name, source image path, svg path)]. Each cell: the source crop beside its SVG, on white."""
    tiles = []
    for name, src, svg in pairs:
        s = Image.open(src).convert("RGB")
        s.thumbnail((cell, cell))
        v = render_svg(Path(svg).read_text(encoding="utf-8"), width=cell)
        v.thumbnail((cell, cell))
        t = Image.new("RGB", (cell * 2 + 12, cell + 16), "white")
        t.paste(s, (0, 16))
        t.paste(v, (cell + 12, 16))
        if label:
            ImageDraw.Draw(t).text((2, 2), name, fill="black")
        tiles.append(t)
    cols = max(1, min(cols, len(tiles)))
    rows = (len(tiles) + cols - 1) // cols
    tw, th = tiles[0].size if tiles else (1, 1)
    sheet = Image.new("RGB", (tw * cols, th * rows), "#dddddd")
    for i, t in enumerate(tiles):
        sheet.paste(t, ((i % cols) * tw, (i // cols) * th))
    out = Path(out)
    out.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out)
    return out


def render_bw(src, out, level=None, dpi=300, pages=None, invert=False) -> list:
    """Black and white (every pixel 0 or 255) PNG of an image, or of each page of a PDF at dpi. A source.sha256
    stamp (source, dpi, level, pages) in the out folder skips a render that is current."""
    src, out = Path(src), Path(out)
    out.mkdir(parents=True, exist_ok=True)
    pdf = src.suffix.lower() == ".pdf"
    if pdf:
        import pymupdf
        doc = pymupdf.open(src)
        names = [(f"page-{p}.png", p) for p in pages or range(1, len(doc) + 1)]
    else:
        names = [(src.stem + "-bw.png", None)]
    files = [out / n for n, _ in names]
    stamp = f"{hashlib.sha256(src.read_bytes()).hexdigest()} {dpi} {level} {invert} {' '.join(map(str, pages or []))}\n"
    marker = out / "source.sha256"
    if marker.exists() and marker.read_text() == stamp and all(f.exists() for f in files):
        return files

    def save(rgb, dest):
        ink = threshold_mask(rgb, level, invert)
        Image.fromarray(np.where(ink, 0, 255).astype(np.uint8), "L").save(dest)

    for n, p in names:
        if pdf:
            pm = doc[p - 1].get_pixmap(dpi=dpi, alpha=False, colorspace=pymupdf.csRGB)
            save(np.frombuffer(pm.samples, np.uint8).reshape(pm.height, pm.width, 3), out / n)
        else:
            save(load_rgb(src), out / n)
    marker.write_text(stamp)
    return files


def _box(s):
    return tuple(int(v) for v in s.split(","))


def _common(p):
    p.add_argument("--tolerance", type=float, default=0.25, help="potrace opttolerance (higher = fewer points)")
    p.add_argument("--alphamax", type=float, default=1.0, help="potrace corner threshold (0 = all corners)")
    p.add_argument("--turdsize", type=int, default=4, help="potrace: drop specks of this many pixels or fewer")
    p.add_argument("--precision", type=int, default=2, help="decimals in path coordinates")


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="vtrace", description="Trace scan crops to SVG; retrace; proof sheet; B&W render.")
    sub = ap.add_subparsers(dest="cmd", required=True)
    t = sub.add_parser("trace", help="trace image(s) to SVG; --out is an .svg file (one input) or a folder")
    t.add_argument("inputs", nargs="+")
    t.add_argument("--out", required=True)
    t.add_argument("--box", type=_box, help="crop x0,y0,x1,y1 in source pixels")
    t.add_argument("--engine", choices=["potrace", "vtracer"], default="potrace",
                   help="vtracer: colour trace that keeps gradients (ignores --mode, -k, --level, --sym, --tolerance...)")
    t.add_argument("--speckle", type=int, default=8, help="vtracer: drop specks this many pixels or smaller")
    t.add_argument("--color-precision", type=int, default=6, help="vtracer: significant bits per colour channel")
    t.add_argument("--layer-difference", type=int, default=12, help="vtracer: colour step between layers")
    t.add_argument("--corner-threshold", type=int, default=60, help="vtracer: corner angle in degrees")
    t.add_argument("--length-threshold", type=float, default=3.5, help="vtracer: smallest segment")
    t.add_argument("--mode", choices=["threshold", "quantise"], default="threshold")
    t.add_argument("--level", type=int, help="threshold 0-255 (default Otsu)")
    t.add_argument("--invert", action="store_true", help="light pixels are the ink")
    t.add_argument("--colours", help="quantise: layer fills dark to light, comma separated (default: cluster colours)")
    t.add_argument("-k", type=int, default=4, help="quantise: number of colours")
    t.add_argument("--fill", default=INK, help="threshold: fill colour")
    t.add_argument("--upscale", type=float, default=4)
    t.add_argument("--blur", type=float, default=0.0, help="Gaussian sigma in source pixels before tracing")
    t.add_argument("--min-area", type=float, default=0.002, help="drop specks below this fraction of the image")
    t.add_argument("--drop-border", action="store_true", help="drop shapes touching the crop's edge")
    t.add_argument("--keep-light", action="store_true", help="quantise: keep the lightest layer (paper)")
    t.add_argument("--no-trim", action="store_true", help="keep the full crop as the viewBox")
    t.add_argument("--sym", help="symmetry N or Nm (with mirrors), averaged about --centre before tracing")
    t.add_argument("--centre", help="x,y in crop pixels (default middle)")
    _common(t)
    r = sub.add_parser("retrace", help="trace SVG(s) again at a new tolerance")
    r.add_argument("inputs", nargs="+")
    r.add_argument("--out", required=True)
    r.add_argument("--res", type=float, default=8, help="raster pixels per SVG unit")
    _common(r)
    pr = sub.add_parser("proof", help="sheet of every source crop beside its SVG (same file stems)")
    pr.add_argument("src_dir")
    pr.add_argument("svg_dir")
    pr.add_argument("--out", required=True)
    pr.add_argument("--cell", type=int, default=256)
    pr.add_argument("--cols", type=int, default=4)
    pr.add_argument("--report", help="write each pair's fidelity (mad, iou) to this json")
    b = sub.add_parser("bw", help="black and white (0/255) PNG of an image, or of PDF pages")
    b.add_argument("input")
    b.add_argument("--out", required=True, help="folder")
    b.add_argument("--level", type=int)
    b.add_argument("--dpi", type=int, default=300)
    b.add_argument("--pages", type=int, nargs="*")
    b.add_argument("--invert", action="store_true", help="light pixels are the ink")
    a = ap.parse_args(argv)
    if a.cmd in ("trace", "retrace"):
        kw = dict(turdsize=a.turdsize, alphamax=a.alphamax, opttolerance=a.tolerance, prec=a.precision)
        outp, many = Path(a.out), len(a.inputs) > 1 or not a.out.lower().endswith(".svg")
    if a.cmd == "trace":
        sym = (int(a.sym.rstrip("mM")), a.sym[-1] in "mM") if a.sym else None
        centre = tuple(float(v) * a.upscale for v in a.centre.split(",")) if a.centre else None
        for f in a.inputs:
            arr = prepare(load_rgb(f), a.box, a.upscale, a.blur)
            if a.engine == "vtracer":
                svg = trace_vtracer(arr, a.upscale, a.speckle, a.color_precision, a.layer_difference, a.corner_threshold,
                                    a.length_threshold, prec=a.precision, drop_light=not a.keep_light)
            else:
                svg = trace_array(arr, a.mode, a.level, a.invert, a.colours.split(",") if a.colours else None, a.k, a.fill,
                              a.min_area, a.drop_border, not a.keep_light, sym, centre, a.upscale, not a.no_trim, **kw)
            dest = outp / (Path(f).stem + ".svg") if many else outp
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_text(svg, encoding="utf-8")
            print(f"{dest}: {svg_points(svg)} points")
    elif a.cmd == "retrace":
        for f in a.inputs:
            old = Path(f).read_text(encoding="utf-8")
            new = retrace_svg(old, a.res, **kw)
            dest = outp / Path(f).name if many else outp
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_text(new, encoding="utf-8")
            print(f"{dest}: {svg_points(old)} -> {svg_points(new)} points")
    elif a.cmd == "proof":
        pairs, rep = [], {}
        for s in sorted(Path(a.src_dir).iterdir()):
            v = Path(a.svg_dir) / (s.stem + ".svg")
            if s.suffix.lower() in (".png", ".jpg", ".jpeg", ".tif", ".tiff", ".webp") and v.exists():
                pairs.append((s.stem, s, v))
                rep[s.stem] = dict(zip(("mad", "iou"), fidelity(Image.open(s).convert("RGB"), v.read_text(encoding="utf-8"))))
        print(proof_sheet(pairs, a.out, a.cell, a.cols), len(pairs), "pairs")
        if a.report:
            Path(a.report).write_text(json.dumps(rep, indent=1), encoding="utf-8")
    else:
        for f in render_bw(a.input, a.out, a.level, a.dpi, a.pages, a.invert):
            print(f)
    return 0


if __name__ == "__main__":
    sys.exit(main())
