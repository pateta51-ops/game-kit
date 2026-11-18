import json
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

from scanpipe import vector as v

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "vtrace.py"


def disc_ring(path=None, size=120):
    im = Image.new("RGB", (size, size), "white")
    d = ImageDraw.Draw(im)
    d.ellipse((20, 20, 100, 100), fill="black")
    d.ellipse((45, 45, 75, 75), fill="white")
    d.rectangle((2, 2, 8, 8), fill="black")  # a speck
    if path:
        im.save(path)
    return im


def test_threshold_trace_overlaps_shape():
    im = disc_ring()
    svg = v.trace_array(v.prepare(np.asarray(im), upscale=4), scale=4, min_area=0.002, fit=False)
    assert svg.count("<path") == 1
    r = v.render_svg(svg, 120)
    assert v.iou(v.ink_mask(im), v.ink_mask(r)) > 0.93
    assert v.fidelity(im, svg)[1] > 0.93


def test_speck_dropped_and_trim_shrinks_viewbox():
    svg = v.trace_array(v.prepare(np.asarray(disc_ring()), upscale=4), scale=4, min_area=0.01)
    w = float(svg.split('width="')[1].split('"')[0])
    assert w < 90


def test_quantise_two_colours():
    im = Image.new("RGB", (100, 100), "white")
    d = ImageDraw.Draw(im)
    d.rectangle((10, 10, 50, 90), fill=(200, 30, 30))
    d.rectangle((60, 10, 90, 90), fill=(20, 40, 200))
    svg = v.trace_array(v.prepare(np.asarray(im), upscale=2), mode="quantise", k=3, scale=2, fit=False)
    assert svg.count("<path") == 2  # the white paper layer is dropped
    assert v.iou(v.ink_mask(im), v.ink_mask(v.render_svg(svg, 100))) > 0.93


def test_retrace_changes_point_count():
    im = Image.new("RGB", (100, 100), "white")
    ImageDraw.Draw(im).ellipse((10, 10, 90, 90), fill="black")
    svg = v.trace_array(v.prepare(np.asarray(im), upscale=4), scale=4, opttolerance=0.01, alphamax=1.3, fit=False)
    new = v.retrace_svg(svg, res=8, opttolerance=3.0, alphamax=0.0)
    assert v.svg_points(new) != v.svg_points(svg)
    assert v.iou(v.ink_mask(v.render_svg(svg, 100)), v.ink_mask(v.render_svg(new, 100))) > 0.9


def test_symmetrise_fills_a_hole():
    a = np.zeros((101, 101))
    a[10:30, 45:55] = 1  # a bar above the centre
    s = v.symmetrise(a, a > 0, 50, 50, 4, False)
    assert s[70:90, 45:55].mean() > 0.8 and s[45:55, 10:30].mean() > 0.8


def test_cli_trace_retrace_proof_bw(tmp_path):
    src, svgs, new = tmp_path / "crops", tmp_path / "svg", tmp_path / "re"
    src.mkdir()
    disc_ring(src / "ring.png")

    def run(*a):
        return subprocess.run([sys.executable, str(SCRIPT), *map(str, a)], capture_output=True, text=True, check=True).stdout

    run("trace", src / "ring.png", "--out", svgs, "--no-trim")
    assert (svgs / "ring.svg").exists()
    run("retrace", svgs / "ring.svg", "--out", new / "ring.svg", "--tolerance", "2")
    assert (new / "ring.svg").exists()
    run("proof", src, svgs, "--out", tmp_path / "proof.png", "--report", tmp_path / "r.json")
    assert Image.open(tmp_path / "proof.png").width >= 512
    assert json.loads((tmp_path / "r.json").read_text())["ring"]["iou"] > 0.9
    run("bw", src / "ring.png", "--out", tmp_path / "bw")
    a = np.asarray(Image.open(tmp_path / "bw" / "ring-bw.png"))
    assert set(np.unique(a)) <= {0, 255} and (a == 0).any() and (a == 255).any()


def test_trimmed_trace_fidelity_uses_offset():
    im = disc_ring()
    svg = v.trace_array(v.prepare(np.asarray(im), upscale=4), scale=4, min_area=0.01)
    assert "data-offset" in svg and v.fidelity(im, svg)[1] > 0.9


def test_vtracer_engine(tmp_path):
    im = Image.new("RGB", (100, 100), "white")
    d = ImageDraw.Draw(im)
    d.rectangle((10, 10, 50, 90), fill=(200, 30, 30))
    d.ellipse((55, 20, 95, 80), fill=(20, 40, 200))
    svg = v.trace_vtracer(v.prepare(np.asarray(im), upscale=2), scale=2)
    assert svg.count("<path") >= 2
    assert v.fidelity(im, svg)[1] > 0.9
    im.save(tmp_path / "c.png")
    subprocess.run([sys.executable, str(SCRIPT), "trace", str(tmp_path / "c.png"), "--engine", "vtracer", "--out",
                    str(tmp_path / "o.svg")], capture_output=True, text=True, check=True)
    assert (tmp_path / "o.svg").exists()
