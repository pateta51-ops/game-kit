// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Segmented, Slider, TextField, Toggle } from "./ui.ts";

afterEach(cleanup);
const rect = (el: HTMLElement) => { el.getBoundingClientRect = () => ({ left: 0, width: 100, top: 0, height: 10, right: 100, bottom: 10, x: 0, y: 0, toJSON: () => ({}) }); };

it("Segmented click picks an option and marks the selected one", () => {
  const f = vi.fn();
  render(<Segmented label="Mode" value="a" onChange={f} options={[{ value: "a", label: "A" }, { value: "b", label: "B" }]} />);
  expect(screen.getByRole("radio", { name: "A" }).getAttribute("aria-checked")).toBe("true");
  expect(screen.getByRole("radio", { name: "B" }).getAttribute("aria-checked")).toBe("false");
  fireEvent.click(screen.getByRole("radio", { name: "B" }));
  expect(f).toHaveBeenCalledWith("b");
});

it("Toggle click flips the value; disabled does not", () => {
  const f = vi.fn();
  const { rerender } = render(<Toggle checked={false} onChange={f}>Sound</Toggle>);
  fireEvent.click(screen.getByRole("checkbox", { name: "Sound" }));
  expect(f).toHaveBeenCalledWith(true);
  rerender(<Toggle checked onChange={f} disabled>Sound</Toggle>);
  fireEvent.click(screen.getByRole("checkbox"));
  expect(f).toHaveBeenCalledTimes(1);
});

it("Slider arrow, Home and End keys step and clamp; step 0.1 gives 0.3", () => {
  const f = vi.fn();
  render(<Slider label="Vol" min={0} max={1} step={0.1} value={0.2} onChange={f} />);
  const s = screen.getByRole("slider");
  fireEvent.keyDown(s, { key: "ArrowRight" });
  expect(f).toHaveBeenLastCalledWith(0.3);
  fireEvent.keyDown(s, { key: "ArrowLeft" });
  expect(f).toHaveBeenLastCalledWith(0.1);
  fireEvent.keyDown(s, { key: "Home" });
  expect(f).toHaveBeenLastCalledWith(0);
  fireEvent.keyDown(s, { key: "End" });
  expect(f).toHaveBeenLastCalledWith(1);
});

it("Slider pointer down and drag set the value from the position", () => {
  const f = vi.fn();
  render(<Slider label="Vol" min={0} max={10} step={1} value={0} onChange={f} />);
  const s = screen.getByRole("slider");
  rect(s);
  fireEvent.pointerDown(s, { clientX: 30, pointerId: 1 });
  expect(f).toHaveBeenLastCalledWith(3);
  fireEvent.pointerMove(s, { clientX: 70, buttons: 1 });
  expect(f).toHaveBeenLastCalledWith(7);
  fireEvent.pointerMove(s, { clientX: 90, buttons: 0 });
  expect(f).toHaveBeenLastCalledWith(7);
  expect(f).toHaveBeenCalledTimes(2);
});

it("Slider disabled ignores keys and pointer", () => {
  const f = vi.fn();
  render(<Slider label="Vol" min={0} max={10} step={1} value={5} onChange={f} disabled />);
  const s = screen.getByRole("slider");
  rect(s);
  fireEvent.keyDown(s, { key: "ArrowRight" });
  fireEvent.pointerDown(s, { clientX: 30, pointerId: 1 });
  expect(f).not.toHaveBeenCalled();
});

it("TextField types and passes native props", () => {
  const f = vi.fn();
  render(<TextField aria-label="Seed" value="" onChange={(e) => { f(e.target.value); }} />);
  fireEvent.change(screen.getByLabelText("Seed"), { target: { value: "x1" } });
  expect(f).toHaveBeenCalledWith("x1");
  expect(screen.getByLabelText("Seed").getAttribute("data-part")).toBe("text-field");
});

it("Slider stays put at the ends and a pointer past either edge clamps", () => {
  const f = vi.fn();
  const { rerender } = render(<Slider label="Vol" min={0} max={10} step={1} value={10} onChange={f} />);
  const s = screen.getByRole("slider");
  rect(s);
  fireEvent.keyDown(s, { key: "ArrowRight" });
  expect(f).toHaveBeenLastCalledWith(10);
  rerender(<Slider label="Vol" min={0} max={10} step={1} value={0} onChange={f} />);
  fireEvent.keyDown(s, { key: "ArrowLeft" });
  expect(f).toHaveBeenLastCalledWith(0);
  fireEvent.pointerDown(s, { clientX: 500, pointerId: 1 });
  expect(f).toHaveBeenLastCalledWith(10);
  fireEvent.pointerDown(s, { clientX: -500, pointerId: 1 });
  expect(f).toHaveBeenLastCalledWith(0);
});

it("Slider steps 0.25 and 5 land on the grid", () => {
  const f = vi.fn();
  const { rerender } = render(<Slider label="A" min={0} max={1} step={0.25} value={0.25} onChange={f} />);
  fireEvent.keyDown(screen.getByRole("slider"), { key: "ArrowRight" });
  expect(f).toHaveBeenLastCalledWith(0.5);
  rerender(<Slider label="A" min={0} max={100} step={5} value={95} onChange={f} />);
  rect(screen.getByRole("slider"));
  fireEvent.pointerDown(screen.getByRole("slider"), { clientX: 52, pointerId: 1 });
  expect(f).toHaveBeenLastCalledWith(50);
  fireEvent.keyDown(screen.getByRole("slider"), { key: "ArrowRight" });
  expect(f).toHaveBeenLastCalledWith(100);
});

it("Slider min 0.05 step 0.1 max 0.95 stays on the grid and never exceeds max", () => {
  const f = vi.fn();
  render(<Slider label="A" min={0.05} max={0.95} step={0.1} value={0.85} onChange={f} />);
  const s = screen.getByRole("slider");
  rect(s);
  fireEvent.keyDown(s, { key: "ArrowRight" });
  expect(f).toHaveBeenLastCalledWith(0.95);
  fireEvent.keyDown(s, { key: "End" });
  expect(f).toHaveBeenLastCalledWith(0.95);
  fireEvent.pointerDown(s, { clientX: 100, pointerId: 1 });
  expect(f).toHaveBeenLastCalledWith(0.95);
  fireEvent.pointerDown(s, { clientX: 48, pointerId: 1 });
  expect(f).toHaveBeenLastCalledWith(0.45);
  fireEvent.keyDown(s, { key: "Home" });
  expect(f).toHaveBeenLastCalledWith(0.05);
});

it("Slider copes with a tiny step", () => {
  const f = vi.fn();
  render(<Slider label="A" min={0} max={1e-6} step={1e-7} value={2e-7} onChange={f} />);
  fireEvent.keyDown(screen.getByRole("slider"), { key: "ArrowRight" });
  expect(f).toHaveBeenLastCalledWith(3e-7);
});
