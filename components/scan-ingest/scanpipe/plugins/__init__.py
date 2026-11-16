"""Project plug-ins. Each one says what a project's items are and where their crops go. They live in the game."""
from __future__ import annotations

from importlib import import_module

from .base import Plugin


def get(spec: str) -> Plugin:
    mod, _, cls = spec.partition(":")
    try:
        return getattr(import_module(mod), cls)()
    except (ImportError, AttributeError, ValueError) as e:
        raise SystemExit(f"Cannot load plug-in {spec!r} (give module:Class): {e}") from None
