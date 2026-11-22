K670: layout-editor per-zone `card: [w, h]` overriding the screen card size in drawing, `cardFit` and `layoutWarnings` (`zoneCard(zone, screen)`); Zone panel gets "Card px here" (w, h, Clear). Bad values are ignored with a `card` warning. No `card` = unchanged.

Tests: `K670 per-zone card size drives fit and warnings` (portrait 270x378 screen, landscape 378x270 zone, 440x616 zone, bad value) and `K670 a zone without card behaves as before`; e2e line for the new inputs. On main the first test cannot pass: `zoneCard` does not exist and the override is ignored (not run locally: no heavy tests on Windows; CI is the proof).

Departures: none.
