"""Tesseract is optional: without it every caller gets None, with one clear warning.

The lookup honours TESSERACT_CMD (a full path to tesseract.exe), then the PATH, then the default Windows folders.
"""
from __future__ import annotations

import pytest

from scanpipe import tess


@pytest.fixture(autouse=True)
def _fresh_lookup():
    tess.reset()
    yield
    tess.reset()


def test_tesseract_cmd_pointing_nowhere_means_no_ocr_and_a_warning(monkeypatch, capsys):
    monkeypatch.setenv("TESSERACT_CMD", r"C:\Program Files\Tesseract-OCR\missing.exe")
    assert tess.find() is None and not tess.available()
    assert tess.run(["--version"]) is None
    err = capsys.readouterr().err
    assert "TESSERACT_CMD is set to" in err and "Tesseract OCR was not found" in err


def test_tesseract_cmd_is_honoured(monkeypatch, tmp_path):
    fake = tmp_path / "tesseract.exe"
    fake.write_text("", encoding="utf-8")
    monkeypatch.setenv("TESSERACT_CMD", f'"{fake}"')          # quotes, as a PowerShell user may paste them
    assert tess.find() == str(fake)


def test_windows_default_folder_is_found_without_path(monkeypatch, tmp_path):
    exe = tmp_path / "Tesseract-OCR" / "tesseract.exe"
    exe.parent.mkdir()
    exe.write_text("", encoding="utf-8")
    monkeypatch.delenv("TESSERACT_CMD", raising=False)
    monkeypatch.setenv("PATH", "")
    monkeypatch.setenv("ProgramFiles", str(tmp_path))
    monkeypatch.setattr(tess, "_on_windows", lambda: True)
    assert tess.find() == str(exe)
