"""Project plug-ins. Each one says what a project's items are and where their crops go. They live in the game."""
from __future__ import annotations

from importlib import import_module

from .base import Plugin


def get(spec: str) -> Plugin:
    mod, _, cls = spec.partition(":")
    try:
        c = getattr(import_module(mod), cls)
    except (ImportError, AttributeError, ValueError) as e:
        raise SystemExit(f"Cannot load plug-in {spec!r} (give module:Class): {e}") from None
    if not (isinstance(c, type) and issubclass(c, Plugin)):
        raise SystemExit(f"Plug-in {spec!r} is not a subclass of scanpipe.plugins.base.Plugin")
    try:
        return c()
    except Exception as e:
        raise SystemExit(f"Plug-in {spec!r} could not be created: {type(e).__name__}: {e}") from None
