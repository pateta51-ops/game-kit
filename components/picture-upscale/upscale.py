"""picture-upscale: enlarge pictures 2-4x with a super-resolution model (spandrel) on the GPU, in tiles. GPU only.

  python3 upscale.py run --in <file|folder> --out <dir> [--model <name>] [--scale 2..4 | --width <px>]
  python3 upscale.py check --in <file|folder> [--model <name>] [--scale N | --width N] [--verify]
  python3 upscale.py status
  python3 upscale.py fetch [model ...]

Exit codes: 0 done, 2 refused (arguments, unknown model, no licence line, weights missing), 3 no CUDA (no output, no CPU fallback)."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import time
import urllib.request
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
HOME = Path(os.environ.get("PICTURE_UPSCALE_HOME", Path.home() / "picture-upscale"))
EXTS = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff"}


def die(msg: str, code: int = 2):
    print(f"picture-upscale: {msg}", file=sys.stderr)
    sys.exit(code)


def load_registry(path: str | None) -> dict:
    return json.loads(Path(path or HERE / "models.json").read_text(encoding="utf-8"))


def model_entry(reg: dict, name: str | None, allow_nc: bool) -> tuple[str, dict]:
    name = name or reg["default"]
    e = reg["models"].get(name)
    if e is None:
        die(f"unknown model '{name}'; known: {', '.join(reg['models'])}")
    if not str(e.get("licence", "")).strip():
        die(f"model '{name}' has no licence line in models.json: refused")
    if e.get("optIn") and not allow_nc:
        die(f"model '{name}' is {e['licence']} (opt-in): add --allow-noncommercial to use it")
    return name, e


def weights_path(e: dict, mdir: str | None) -> Path:
    return Path(mdir) / e["file"] if mdir else HOME / "models" / e["file"]


def sha256(p: Path) -> str:
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()


def target_size(w: int, h: int, scale: int | None, width: int | None) -> tuple[int, int]:
    if width:
        return width, max(1, round(h * width / w))
    return w * scale, h * scale


def tile_starts(n: int, tile: int, overlap: int) -> list[int]:
    """Start of each tile along a length n: stride tile - overlap, the last tile pushed back so it ends at n."""
    if n <= tile:
        return [0]
    stride = tile - overlap
    s = list(range(0, n - tile, stride))
    s.append(n - tile)
    return s


def ramp(length: int, left: int, right: int):
    """1D blend weights, never zero: rising over `left` samples, falling over `right`."""
    import numpy as np
    w = np.ones(length, dtype=np.float32)
    for i in range(min(left, length)):
        w[i] = min(w[i], (i + 1) / (left + 1))
    for i in range(min(right, length)):
        w[length - 1 - i] = min(w[length - 1 - i], (i + 1) / (right + 1))
    return w


def blend_tiles(img, model_fn, scale: int, tile: int, overlap: int):
    """img float32 HxWxC; model_fn(tile) returns the tile enlarged `scale` times. Tiles overlap and are blended with
    linear ramps, then divided by the summed weights."""
    import numpy as np
    H, W, C = img.shape
    out = np.zeros((H * scale, W * scale, C), dtype=np.float32)
    acc = np.zeros((H * scale, W * scale, 1), dtype=np.float32)
    for y in tile_starts(H, tile, overlap):
        for x in tile_starts(W, tile, overlap):
            t = img[y:y + tile, x:x + tile]
            th, tw = t.shape[:2]
            r = np.asarray(model_fn(t), dtype=np.float32)
            wy = ramp(th * scale, overlap * scale if y > 0 else 0, overlap * scale if y + th < H else 0)
            wx = ramp(tw * scale, overlap * scale if x > 0 else 0, overlap * scale if x + tw < W else 0)
            w = (wy[:, None] * wx[None, :])[:, :, None]
            ys, xs = y * scale, x * scale
            out[ys:ys + th * scale, xs:xs + tw * scale] += r * w
            acc[ys:ys + th * scale, xs:xs + tw * scale] += w
    return out / acc


def cuda_or_exit():
    if os.environ.get("PICTURE_UPSCALE_NO_CUDA") == "1":
        die("CUDA is not available (forced). Pictures are upscaled on the GPU only: there is no CPU fallback.", 3)
    try:
        import torch
    except ImportError:
        die("torch is not installed, so there is no CUDA. Run install/install.sh. No CPU fallback.", 3)
    if not torch.cuda.is_available():
        die("CUDA is not available. Pictures are upscaled on the GPU only: there is no CPU fallback.", 3)
    return torch


def gather(src: str) -> list[Path]:
    p = Path(src)
    if p.is_dir():
        return sorted(f for f in p.iterdir() if f.suffix.lower() in EXTS)
    if p.is_file():
        return [p]
    die(f"input not found: {src}")


def common(a, need_out: bool):
    sc = a.scale if a.scale is not None else (None if a.width else 4)
    if sc is not None and not 2 <= sc <= 4:
        die("--scale must be 2, 3 or 4")
    if a.width is not None and a.width < 1:
        die("--width must be a positive number of pixels")
    if a.tile < 64 or a.overlap < 0 or a.overlap * 2 >= a.tile:
        die("--tile must be 64 or more and --overlap under half of it")
    reg = load_registry(a.registry)
    name, e = model_entry(reg, a.model, a.allow_noncommercial)
    files = gather(a.inp)
    if not files:
        die(f"no pictures in {a.inp}")
    return name, e, files, sc


def cmd_check(a) -> int:
    name, e, files, sc = common(a, False)
    p = weights_path(e, a.models_dir)
    if not p.is_file():
        die(f"model '{name}' is not fetched ({p}): run install/install.sh {name}")
    if a.verify and sha256(p) != e["sha256"]:
        die(f"model '{name}' fails its sha256: fetch it again")
    print(f"ok: {len(files)} picture(s), model {name} ({e['licence']}), scale {'width ' + str(a.width) if a.width else sc}")
    return 0


def cmd_run(a) -> int:
    name, e, files, sc = common(a, True)
    torch = cuda_or_exit()
    from PIL import Image
    import numpy as np
    p = weights_path(e, a.models_dir)
    if not p.is_file():
        die(f"model '{name}' is not fetched ({p}): run install/install.sh {name}")
    from spandrel import ModelLoader
    torch.set_num_threads(2)
    m = ModelLoader().load_from_file(str(p))
    m.cuda().eval()
    ms = int(m.scale)

    def fn(t):
        x = torch.from_numpy(np.ascontiguousarray(t)).permute(2, 0, 1)[None].cuda()
        with torch.inference_mode():
            y = m(x)
        return y.clamp(0, 1)[0].permute(1, 2, 0).cpu().numpy()

    out_dir = Path(a.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    entries = []
    mshas = sha256(p) if not e.get("sha256") else e["sha256"]
    for f in files:
        torch.cuda.reset_peak_memory_stats()
        t0 = time.time()
        im = Image.open(f)
        im.load()
        alpha = im.getchannel("A") if im.mode in ("RGBA", "LA", "PA") or "transparency" in im.info else None
        rgb = im.convert("RGB")
        w, h = rgb.size
        tw, th = target_size(w, h, sc, a.width)
        arr = np.asarray(rgb, dtype=np.float32) / 255.0
        big = blend_tiles(arr, fn, ms, a.tile, a.overlap)
        res = Image.fromarray((big * 255.0 + 0.5).astype(np.uint8))
        if res.size != (tw, th):
            res = res.resize((tw, th), Image.LANCZOS)
        if alpha is not None:
            res.putalpha(alpha.resize((tw, th), Image.LANCZOS))
        res.save(out_dir / (f.stem + ".png"))
        sec = round(time.time() - t0, 2)
        vram = round(torch.cuda.max_memory_allocated() / 2**20)
        print(f"{f.name}: {w}x{h} -> {tw}x{th} with {name} in {sec}s, peak VRAM {vram} MiB")
        entries.append({
            "source": f.name, "sourceSha256": sha256(f), "output": f.stem + ".png", "model": name,
            "modelSha256": mshas, "licence": e["licence"], "scale": round(tw / w, 4), "modelScale": ms,
            "sizeIn": [w, h], "sizeOut": [tw, th], "tile": a.tile, "overlap": a.overlap,
            "seconds": sec, "peakVramMiB": vram,
        })
    (out_dir / "manifest.json").write_text(json.dumps({"pictures": entries}, indent=2), encoding="utf-8")
    return 0


def cmd_status(a) -> int:
    print("python", sys.version.split()[0])
    try:
        import torch
        ok = torch.cuda.is_available()
        print("torch", torch.__version__, "CUDA", "yes: " + torch.cuda.get_device_name(0) if ok else "NO (runs exit 3)")
    except ImportError:
        print("torch: not installed")
    try:
        import spandrel
        print("spandrel", getattr(spandrel, "__version__", "installed"))
    except ImportError:
        print("spandrel: not installed")
    reg = load_registry(a.registry)
    for n, e in reg["models"].items():
        p = weights_path(e, a.models_dir)
        print(f"  {n}: {'fetched' if p.is_file() else 'missing'}  {e.get('licence') or 'NO LICENCE'}{'  (opt-in)' if e.get('optIn') else ''}")
    return 0


def download(url: str, dest: Path):
    tmp = dest.with_suffix(dest.suffix + ".part")
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "picture-upscale"})) as r, open(tmp, "wb") as f:
        while b := r.read(1 << 20):
            f.write(b)
    return tmp


def cmd_fetch(a) -> int:
    reg = load_registry(a.registry)
    names = a.names or [n for n, e in reg["models"].items() if not e.get("optIn")]
    for n in names:
        _, e = model_entry(reg, n, True)
        p = weights_path(e, a.models_dir)
        p.parent.mkdir(parents=True, exist_ok=True)
        if p.is_file() and sha256(p) == e["sha256"]:
            print(f"{n}: already fetched")
            continue
        print(f"{n}: downloading ({e['licence']})")
        tmp = download(e["url"], p)
        if e.get("member"):
            if sha256(tmp) != e["zipSha256"]:
                die(f"{n}: downloaded zip fails its sha256")
            with zipfile.ZipFile(tmp) as z, open(p, "wb") as out:
                out.write(z.read(e["member"]))
            tmp.unlink()
        else:
            tmp.replace(p)
        if sha256(p) != e["sha256"]:
            p.unlink()
            die(f"{n}: downloaded file fails its sha256 and was removed")
        print(f"{n}: ok")
    return 0


def parser() -> argparse.ArgumentParser:
    ap = argparse.ArgumentParser(prog="upscale.py", description=__doc__.split("\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)

    def base(sp, pics):
        sp.add_argument("--registry", help="models.json to use (default: the one next to this file)")
        sp.add_argument("--models-dir", help="folder of weights (default ~/picture-upscale/models)")
        if pics:
            sp.add_argument("--in", dest="inp", required=True)
            sp.add_argument("--model")
            sp.add_argument("--scale", type=int)
            sp.add_argument("--width", type=int)
            sp.add_argument("--tile", type=int, default=512)
            sp.add_argument("--overlap", type=int, default=32)
            sp.add_argument("--allow-noncommercial", action="store_true")

    r = sub.add_parser("run")
    base(r, True)
    r.add_argument("--out", required=True)
    c = sub.add_parser("check")
    base(c, True)
    c.add_argument("--verify", action="store_true")
    s = sub.add_parser("status")
    base(s, False)
    f = sub.add_parser("fetch")
    base(f, False)
    f.add_argument("names", nargs="*")
    return ap


def main(argv=None) -> int:
    a = parser().parse_args(argv)
    if getattr(a, "scale", None) is not None and getattr(a, "width", None) is not None:
        die("give --scale or --width, not both")
    return {"run": cmd_run, "check": cmd_check, "status": cmd_status, "fetch": cmd_fetch}[a.cmd](a)


if __name__ == "__main__":
    sys.exit(main())
