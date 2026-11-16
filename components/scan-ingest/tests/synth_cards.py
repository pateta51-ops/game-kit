"""Synthetic flatbed scans of Imperium-like items, for testing the ingestion pipeline.

Everything here is original: generic shapes and made-up words, no real card art or text.

* Standard cards: plain 63 x 88 mm rectangles with rounded corners. The front has a title banner, full-bleed
  "art", a dark text box, a suit disc at the bottom centre and the printed code (CMP-01, e.g. ``1ROM14/23``) in
  the bottom-left strip. ``pale`` fronts have near-white sky and a white banner reaching the top edge (like a
  Civilised card), so on a white lid their top edge has almost no contrast.
* Backs: one shared design per box, with a word at the top so it has a way up.
* Bot State cards: 80 x 120 mm, landscape when upright: a dark name band on the left and a table of rows.
* Backings: ``dark`` (black cloth: dark, slightly textured, vignetted) or ``white`` (a scanner lid: near-white,
  uneven, with a faint fibre texture and a soft shadow along one edge; cards cast a thin shadow on one side).

Side B is side A with every item flipped in place like a page: the same place, the tilt mirrored, plus jitter.
Ground truth gives each item's centre, size and tilt in pixels, the clockwise turn (0/90/180/270) that makes each
side's crop upright, and the code printed on the front.
"""
from __future__ import annotations

import math
import random
from dataclasses import dataclass, field
from typing import Optional

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

MM = 1 / 25.4
CARD_W, CARD_H = 63.0, 88.0      # mm, the plan's standard card (V-02 placeholder)
CHART_W, CHART_H = 80.0, 120.0   # mm, short x long side of a Bot State card (V-02 placeholder)
CODE_H_MM = 1.7                  # cap height of the printed code
WORDS = ["gain", "draw", "card", "market", "token", "acquire", "play", "region", "history", "discard", "exile",
         "each", "other", "player", "may", "then", "put", "this", "into", "your", "deck", "top", "bottom", "spend"]


@dataclass
class Truth:
    kind: str           # card | chart
    cx: float
    cy: float
    w: float            # short side, px
    h: float            # long side, px
    angle: float        # tilt of the long axis from vertical, degrees, cv2 convention (counter-clockwise as displayed)
    rotate: int         # clockwise turn that makes this side's crop upright
    face: str           # front | back | S | flip
    code: Optional[str] = None
    pale: bool = False
    extra: dict = field(default_factory=dict)


def font(px: float) -> ImageFont.FreeTypeFont:
    return ImageFont.load_default(size=max(6, int(round(px))))


def _rounded_alpha(w: int, h: int, r: int) -> np.ndarray:
    a = np.zeros((h, w), np.uint8)
    cv2.rectangle(a, (r, 0), (w - 1 - r, h - 1), 255, cv2.FILLED)
    cv2.rectangle(a, (0, r), (w - 1, h - 1 - r), 255, cv2.FILLED)
    for cx, cy in ((r, r), (w - 1 - r, r), (r, h - 1 - r), (w - 1 - r, h - 1 - r)):
        cv2.circle(a, (cx, cy), r, 255, cv2.FILLED, cv2.LINE_AA)
    return a


def _sentence(rng: random.Random, n: int = 6) -> str:
    return " ".join(rng.choice(WORDS) for _ in range(n)).capitalize() + "."


# ----------------------------------------------------------------------------------------- faces


def card_front(w: int, h: int, code: str, rng: random.Random, pale: bool = False) -> np.ndarray:
    """BGR front of a standard card, upright (portrait)."""
    im = Image.new("RGB", (w, h))
    d = ImageDraw.Draw(im)
    if pale:  # near-white sky down to the art, white banner at the very top
        for y in range(int(0.45 * h)):
            t = y / (0.45 * h)
            d.line([(0, y), (w, y)], fill=(int(250 - 30 * t), int(251 - 25 * t), int(253 - 10 * t)))
        art_top = int(0.45 * h)
    else:
        art_top = 0
    base = (rng.randint(40, 170), rng.randint(60, 170), rng.randint(40, 150))
    for y in range(art_top, h):
        t = (y - art_top) / max(1, h - art_top)
        d.line([(0, y), (w, y)], fill=tuple(int(c * (1.0 - 0.45 * t)) for c in base))
    for _ in range(6):  # some shapes in the art
        x0, y0 = rng.randint(0, w), rng.randint(max(art_top, int(0.15 * h)), int(0.7 * h))
        rr = rng.randint(w // 12, w // 5)
        d.ellipse([x0 - rr, y0 - rr, x0 + rr, y0 + rr], fill=tuple(rng.randint(30, 200) for _ in range(3)))
    banner_y0, banner_y1 = (0, int(0.085 * h)) if pale else (int(0.03 * h), int(0.10 * h))
    d.rectangle([0, banner_y0, w, banner_y1], fill=(246, 246, 244) if pale else (rng.randint(20, 120), 30, 30))
    title = " ".join(rng.choice(WORDS) for _ in range(2)).upper()
    d.text((w // 2, (banner_y0 + banner_y1) // 2), title, font=font(0.045 * h), anchor="mm",
           fill=(40, 40, 40) if pale else (240, 240, 240))
    # text box with three lines
    tb = [int(0.10 * w), int(0.66 * h), int(0.90 * w), int(0.85 * h)]
    d.rounded_rectangle(tb, radius=int(0.02 * w), fill=(18, 18, 18))
    for k in range(3):
        d.text((w // 2, tb[1] + int((k + 0.75) * (tb[3] - tb[1]) / 3.5)), _sentence(rng, 5), font=font(0.03 * h),
               anchor="mm", fill=(235, 235, 235))
    # suit disc, VP badge
    d.ellipse([int(0.43 * w), int(0.88 * h), int(0.57 * w), int(0.88 * h) + int(0.14 * w)], fill=(230, 220, 120),
              outline=(30, 30, 30), width=2)
    d.ellipse([int(0.80 * w), int(0.89 * h), int(0.94 * w), int(0.89 * h) + int(0.14 * w)], fill=(220, 180, 40))
    # the printed code, bottom left, on a darker strip (as on most real cards)
    cap = h / CARD_H * CODE_H_MM
    f = font(cap * 1.35)
    x, y = int(0.17 * w), int(0.935 * h)
    box = d.textbbox((x, y), code, font=f, anchor="lm")
    d.rectangle([box[0] - 3, box[1] - 3, box[2] + 3, box[3] + 3], fill=(35, 35, 35))
    d.text((x, y), code, font=f, anchor="lm", fill=(225, 225, 225))
    return cv2.cvtColor(np.array(im), cv2.COLOR_RGB2BGR)


def card_back(w: int, h: int, design: str = "classics") -> np.ndarray:
    """BGR shared back design, upright. Deterministic per design, so every copy hashes alike."""
    rng = random.Random(design)
    base = (rng.randint(90, 140), rng.randint(30, 60), rng.randint(20, 50))
    im = Image.new("RGB", (w, h), base)
    d = ImageDraw.Draw(im)
    for k in range(0, h, max(4, h // 40)):
        d.line([(0, k), (w, k + h // 10)], fill=tuple(min(255, c + 18) for c in base), width=1)
    d.rounded_rectangle([int(0.06 * w), int(0.04 * h), int(0.94 * w), int(0.96 * h)], radius=int(0.05 * w),
                        outline=(200, 170, 90), width=max(2, w // 90))
    d.text((w // 2, int(0.14 * h)), design.upper(), font=font(0.07 * h), anchor="mm", fill=(230, 200, 120))
    d.ellipse([int(0.25 * w), int(0.38 * h), int(0.75 * w), int(0.38 * h) + int(0.5 * w)], outline=(230, 200, 120),
              width=max(3, w // 60))
    d.polygon([(w // 2, int(0.45 * h)), (int(0.62 * w), int(0.62 * h)), (int(0.38 * w), int(0.62 * h))],
              fill=(230, 200, 120))
    return cv2.cvtColor(np.array(im), cv2.COLOR_RGB2BGR)


def chart_face(long_px: int, short_px: int, rng: random.Random, side: str, name: str = "KESHITES") -> np.ndarray:
    """BGR face of a Bot State card, upright (landscape): name band on the left, a table of rows."""
    w, h = long_px, short_px
    im = Image.new("RGB", (w, h), (238, 226, 200))
    d = ImageDraw.Draw(im)
    band = int(0.11 * w)
    d.rectangle([0, 0, band, h], fill=(30, 28, 30))
    tmp = Image.new("RGB", (int(0.8 * h), band), (30, 28, 30))
    ImageDraw.Draw(tmp).text((tmp.width // 2, tmp.height // 2), name, font=font(0.5 * band), anchor="mm",
                             fill=(240, 240, 240))
    im.paste(tmp.rotate(90, expand=True), (0, int(0.1 * h)))
    if side == "S":
        d.ellipse([int(0.02 * w), int(0.88 * h), int(0.02 * w) + int(0.07 * h), int(0.95 * h)], outline=(240, 240, 240),
                  width=2)
    top = int(0.07 * h)
    d.rectangle([band + 8, int(0.02 * h), w - 8, top], fill=(150, 110, 60))
    d.text((band + 20, (int(0.02 * h) + top) // 2), "TRIGGER    EFFECT", font=font(0.035 * h), anchor="lm",
           fill=(250, 250, 250))
    rows = 9
    rh = (h - top - int(0.03 * h)) / rows
    for r in range(rows):
        y0 = top + r * rh
        d.line([(band + 8, int(y0)), (w - 8, int(y0))], fill=(150, 110, 60), width=2)
        d.text((band + 20, int(y0 + rh / 2)), rng.choice(["Other", "Glory", "Conquer", "Advance"]) if r else "Unrest",
               font=font(0.035 * h), anchor="lm", fill=(40, 30, 20))
        d.text((band + int(0.17 * w), int(y0 + rh / 2)), _sentence(rng, 9), font=font(0.035 * h), anchor="lm",
               fill=(20, 20, 20))
    return cv2.cvtColor(np.array(im), cv2.COLOR_RGB2BGR)


# ------------------------------------------------------------------------------------ backings


def backing(H: int, W: int, rng: np.random.Generator, kind: str = "dark") -> np.ndarray:
    if kind == "dark":
        base = np.full((H, W, 3), 14, np.float32)
        base += rng.normal(0, 2.0, (H, W, 1)).astype(np.float32)  # sensor noise
        tex = cv2.GaussianBlur(rng.normal(0, 3.0, (H // 8, W // 8)).astype(np.float32), (0, 0), 1.0)
        base += cv2.resize(tex, (W, H))[:, :, None]  # soft cloth texture
        yy, xx = np.mgrid[0:H, 0:W]
        vign = 1.0 - 0.15 * (((xx - W / 2) / W) ** 2 + ((yy - H / 2) / H) ** 2)
        return np.clip(base * vign[:, :, None], 0, 255).astype(np.uint8)
    # A white scanner lid: near-white, a little warm, uneven, faint fibres, a soft shadow along the hinge edge.
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    base = np.empty((H, W, 3), np.float32)
    base[..., 0], base[..., 1], base[..., 2] = 236.0, 240.0, 242.0  # BGR
    base += (3.0 * (xx / W - 0.5) - 2.5 * (yy / H - 0.5) ** 2)[:, :, None]           # unevenness
    fibres = cv2.GaussianBlur(rng.normal(0, 4.0, (H // 3, W // 3)).astype(np.float32), (0, 0), sigmaX=4.0, sigmaY=0.6)
    base += cv2.resize(fibres, (W, H))[:, :, None] * 0.6                                # lid texture
    base += rng.normal(0, 1.2, (H, W, 1)).astype(np.float32)                           # sensor noise
    shadow = np.clip(1.0 - xx / (12 * W / 216.0), 0, 1) ** 2                            # 12 mm soft hinge shadow
    base -= (18.0 * shadow)[:, :, None]
    return np.clip(base, 0, 255).astype(np.uint8)


# ------------------------------------------------------------------------------------ placement


def _paste(canvas: np.ndarray, face: np.ndarray, alpha: np.ndarray, cx: float, cy: float, angle: float,
           shadow: float = 0.0) -> None:
    """Composite a face (BGR + alpha) at a centre and tilt. ``shadow`` darkens a thin band below/right of it."""
    h, w = face.shape[:2]
    diag = int(math.ceil(math.hypot(w, h))) + 8
    pad = np.zeros((diag, diag, 4), np.uint8)
    oy, ox = (diag - h) // 2, (diag - w) // 2
    pad[oy:oy + h, ox:ox + w, :3] = face
    pad[oy:oy + h, ox:ox + w, 3] = alpha
    M = cv2.getRotationMatrix2D((diag / 2, diag / 2), angle, 1.0)
    rot = cv2.warpAffine(pad, M, (diag, diag), flags=cv2.INTER_LINEAR, borderValue=(0, 0, 0, 0))
    x0, y0 = int(round(cx - diag / 2)), int(round(cy - diag / 2))
    H, W = canvas.shape[:2]
    xs0, ys0 = max(0, x0), max(0, y0)
    xs1, ys1 = min(W, x0 + diag), min(H, y0 + diag)
    sub = rot[ys0 - y0:ys1 - y0, xs0 - x0:xs1 - x0]
    a = sub[:, :, 3:4].astype(np.float32) / 255.0
    region = canvas[ys0:ys1, xs0:xs1].astype(np.float32)
    if shadow > 0:  # the lid casts a thin shadow along the card's lower and right edges
        k = max(2, int(round(0.35 * W / 216.0)))  # 0.35 mm (the bed is 216 mm wide)
        sh = cv2.GaussianBlur(np.roll(np.roll(a[:, :, 0], k, axis=0), k, axis=1), (0, 0), k * 0.6)
        region *= (1.0 - shadow * np.clip(sh - a[:, :, 0], 0, 1))[:, :, None]
    canvas[ys0:ys1, xs0:xs1] = np.clip(region * (1 - a) + sub[:, :, :3] * a, 0, 255).astype(np.uint8)


def crop_turn(up: tuple, long_axis: tuple) -> int:
    """Clockwise turn that makes the crop upright, from the item's 'up' and long-axis vectors (image coordinates).

    Mirrors ``detect.portrait_corners``: the crop's 'down' axis is the item's long axis, pointing to +y (or +x
    when exactly horizontal); 'right' = (down.y, -down.x).
    """
    dx, dy = long_axis
    if dy < -1e-3 or (abs(dy) <= 1e-3 and dx < 0):
        dx, dy = -dx, -dy
    rx, ry = dy, -dx
    ux, uy = up
    cr, cd = ux * rx + uy * ry, ux * dx + uy * dy  # 'up' in crop coordinates (right, down)
    if cd < -0.7:
        return 0
    if cd > 0.7:
        return 180
    return 270 if cr > 0 else 90


def _rot_vec(v: tuple, angle_ccw: float) -> tuple:
    a = math.radians(angle_ccw)
    x, y = v
    # cv2 angle is counter-clockwise as displayed (y down): rotate accordingly
    return (x * math.cos(a) + y * math.sin(a), -x * math.sin(a) + y * math.cos(a))


@dataclass
class Item:
    kind: str                # card | chart
    code: Optional[str]
    upside_down: bool = False
    pale: bool = False
    landscape_on_glass: bool = False   # a card lying sideways, or a chart lying upright (long side horizontal)


DECKS = [("1ROM", 23), ("1PER", 23), ("1CIV", 15), ("1UNC", 22), ("1REG", 14), ("1TRI", 11), ("1UNR", 12), ("1FAM", 9)]


def random_code(rng: random.Random) -> str:
    deck, total = rng.choice(DECKS)
    n = rng.randint(1, total)
    suffix = rng.choice(["", "", "", "", "X"]) if deck in ("1REG", "1UNC", "1CIV") else ""
    return f"{deck}{n}{suffix}/{total}"


def layout_items(layout: str, rng: random.Random) -> tuple[list[Item], int, int]:
    """Items and the grid (cols, rows) for a layout."""
    if layout == "cards9":
        items = [Item("card", random_code(rng), upside_down=(k in (2, 6))) for k in range(9)]
        return items, 3, 3
    if layout == "pale9":
        items = [Item("card", random_code(rng), upside_down=(k in (4,)), pale=(k % 2 == 0)) for k in range(9)]
        return items, 3, 3
    if layout == "mixed":
        items = [Item("card", random_code(rng), upside_down=(k == 1), pale=(k == 3)) for k in range(6)]
        items.append(Item("chart", None, landscape_on_glass=True))
        return items, 3, 3
    if layout == "charts2":
        return [Item("chart", None, landscape_on_glass=True), Item("chart", None, upside_down=True, landscape_on_glass=True)], 1, 2
    raise ValueError(layout)


def make_sheet(seed: int = 1, dpi: int = 300, layout: str = "cards9", backing_kind: str = "dark",
               edge_shadow: float = 0.0, items: Optional[list[Item]] = None):
    """Return (side_a, side_b, truths_a, truths_b) on an A4-size bed (216 x 297 mm)."""
    rnd = random.Random(seed)
    nrng = np.random.default_rng(seed)
    W, H = int(216 * dpi * MM), int(297 * dpi * MM)
    side_a, side_b = backing(H, W, nrng, backing_kind), backing(H, W, nrng, backing_kind)
    px = dpi * MM
    if items is None:
        items, cols, _rows = layout_items(layout, rnd)
    else:
        cols = 3
    truths_a, truths_b = [], []
    placed: list = []
    radius = int(round(3.0 * px))

    def free(foot, body) -> bool:
        pts = cv2.boxPoints(body)
        m = 3 * px  # clear of the glass edges (the protocol asks 5 mm; a full 3 x 3 sheet of tilted cards gets close)
        if pts[:, 0].min() < m or pts[:, 1].min() < m or pts[:, 0].max() > W - m or pts[:, 1].max() > H - m:
            return False
        return all(cv2.rotatedRectangleIntersection(foot, o)[0] == cv2.INTERSECT_NONE for o in placed)

    # charts take a full row at the bottom (mixed) or one row each (charts2)
    cards = [it for it in items if it.kind == "card"]
    charts = [it for it in items if it.kind == "chart"]
    card_rows = -(-len(cards) // cols) if cards else 0
    total_rows = card_rows + len(charts)
    row_h = [CARD_H] * card_rows + [CHART_W] * len(charts)
    gap = (297 - sum(row_h)) / (total_rows + 1)
    centres = []
    y = gap
    for r in range(total_rows):
        centres.append(y + row_h[r] / 2)
        y += row_h[r] + gap
    positions = []
    xgap = (216 - cols * CARD_W) / (cols + 1)
    for k, it in enumerate(cards):
        r, c = divmod(k, cols)
        positions.append((it, xgap + CARD_W / 2 + c * (CARD_W + xgap), centres[r]))
    for j, it in enumerate(charts):
        positions.append((it, 108.0, centres[card_rows + j]))

    for it, cx_mm, cy_mm in positions:
        if it.kind == "card":
            sw, lw = int(round(CARD_W * px)), int(round(CARD_H * px))
            front = card_front(sw, lw, it.code, rnd, pale=it.pale)
            back = card_back(sw, lw, "classics")
        else:
            sw, lw = int(round(CHART_W * px)), int(round(CHART_H * px))
            front = chart_face(lw, sw, rnd, "S")
            back = chart_face(lw, sw, rnd, "flip")
        alpha = _rounded_alpha(front.shape[1], front.shape[0], radius)
        base_turn = 0.0
        if it.kind == "card" and it.landscape_on_glass:
            base_turn = 90.0
        if it.upside_down:
            base_turn += 180.0
        for attempt in range(400):
            shrink = (1.0, 0.5, 0.25, 0.1)[attempt // 100]
            cx = cx_mm * px + rnd.uniform(-2.0, 2.0) * px * shrink
            cy = cy_mm * px + rnd.uniform(-2.0, 2.0) * px * shrink
            tilt = rnd.choice([-1, 1]) * rnd.uniform(1.0, 1.0 + 2.0 * shrink)
            fw, fh = front.shape[1], front.shape[0]
            ang = base_turn + tilt
            body = ((cx, cy), (fw, fh), -ang)
            foot = ((cx, cy), (fw + 4 * px, fh + 4 * px), -ang)
            if free(foot, body):
                placed.append(foot)
                break
        else:
            raise RuntimeError(f"could not place a {it.kind}")
        _paste(side_a, front, alpha, cx, cy, ang, shadow=edge_shadow)
        portrait = front.shape[0] >= front.shape[1]
        short_px, long_px = min(front.shape[:2]), max(front.shape[:2])
        turn_a = crop_turn(_rot_vec((0.0, -1.0), ang), _rot_vec((0.0, 1.0) if portrait else (1.0, 0.0), ang))
        truths_a.append(Truth(it.kind, cx, cy, short_px, long_px, ang if portrait else ang + 90.0, turn_a,
                              "front" if it.kind == "card" else "S", code=it.code, pale=it.pale))
        # Flip in place like a page: same place (plus jitter), tilt mirrored, top edge stays on top.
        bcx, bcy = cx + rnd.uniform(-1.5, 1.5) * px, cy + rnd.uniform(-1.5, 1.5) * px
        bang = -ang + rnd.uniform(-0.5, 0.5)
        _paste(side_b, back, alpha, bcx, bcy, bang, shadow=edge_shadow)
        turn_b = crop_turn(_rot_vec((0.0, -1.0), bang), _rot_vec((0.0, 1.0) if portrait else (1.0, 0.0), bang))
        truths_b.append(Truth(it.kind, bcx, bcy, short_px, long_px, bang if portrait else bang + 90.0, turn_b,
                              "back" if it.kind == "card" else "flip", pale=False))
    return side_a, side_b, truths_a, truths_b


def code_face(code: str, dpi: int, seed: int) -> np.ndarray:
    """One upright card front at ``dpi`` carrying ``code``, with mild scan noise and blur."""
    rng = random.Random(seed)
    px = dpi * MM
    img = card_front(int(round(CARD_W * px)), int(round(CARD_H * px)), code, rng, pale=rng.random() < 0.3)
    nrng = np.random.default_rng(seed)
    img = cv2.GaussianBlur(img, (0, 0), 0.4 + 0.4 * rng.random())
    img = np.clip(img.astype(np.float32) + nrng.normal(0, 3.0, img.shape), 0, 255).astype(np.uint8)
    return img
