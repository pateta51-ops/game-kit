import { createElement, useId, type ReactNode } from "react";
import { useZoomEscape } from "../card-zoom/ui.ts";
import type { LookedAtMemory, Peek } from "./index.ts";

export interface LookedAtProps {
  cards: LookedAtMemory;
  renderCard: (peek: Peek) => ReactNode;
  onClose: () => void;
  words?: { title?: string; close?: string; reopen?: string };
  open?: boolean;
  onReopen?: () => void;
  zoneLabel?: (zone: string) => string | undefined;
}

export function LookedAt({ cards, renderCard, onClose, words, open = true, onReopen, zoneLabel }: LookedAtProps) {
  const titleId = useId();
  useZoomEscape(onClose, cards.length > 0 && open);
  if (!cards.length) return null;
  if (!open)
    return onReopen
      ? createElement(
          "button",
          { type: "button", className: "kla-reopen", onClick: onReopen },
          words?.reopen ?? "Show the cards again",
        )
      : null;

  return createElement(
    "div",
    {
      className: "kla-overlay",
      onClick: (event) => {
        if (event.target === event.currentTarget) onClose();
      },
    },
    createElement(
      "div",
      { className: "kla-panel", role: "dialog", "aria-labelledby": titleId },
      createElement("h2", { id: titleId }, words?.title ?? "Remembered cards"),
      createElement(
        "button",
        { type: "button", onClick: onClose },
        words?.close ?? "Close",
      ),
      createElement(
        "ul",
        { className: "kla-cards" },
        cards.map((peek) =>
          createElement(
            "li",
            { key: peek.cardId, className: "kla-card" },
            renderCard(peek),
            zoneLabel?.(peek.zone)
              ? createElement("span", { className: "kla-zone" }, zoneLabel(peek.zone))
              : null,
          ),
        ),
      ),
    ),
  );
}
