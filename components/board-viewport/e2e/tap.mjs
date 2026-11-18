// Run in WSL (starts its own vite): export NODE_PATH=$HOME/codex/base/node_modules; node components/board-viewport/e2e/tap.mjs (from the kit root)
import { createRequire } from "node:module";
import { join } from "node:path";
const req = createRequire(import.meta.url);
const { chromium } = req("playwright");
const { createServer } = req("vite");
const root = process.cwd();
const modules = process.env.NODE_PATH.split(":")[0];
const server = await createServer({
  root,
  configFile: false,
  logLevel: "error",
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: {
      react: join(modules, "react"),
      "react-dom": join(modules, "react-dom"),
    },
  },
  server: { port: 5199, strictPort: false, host: "127.0.0.1" },
});
await server.listen();
const url = `http://127.0.0.1:${server.config.server.port}/components/board-viewport/fake/index.html`;
const browser = await chromium.launch();
let failed = 0;
const check = (name, ok) => {
  console.log(ok ? "PASS" : "FAIL", name);
  if (!ok) failed++;
};
const selected = (page) =>
  page
    .locator("output")
    .innerText()
    .then((t) => t === "Cell selected");
async function open(options) {
  const ctx = await browser.newContext(options);
  const page = await ctx.newPage();
  await page.goto(url);
  await page.waitForSelector("#cell");
  await page.waitForTimeout(200);
  return page;
}
const center = async (page) => {
  const b = await page.locator("#cell").boundingBox();
  return [b.x + b.width / 2, b.y + b.height / 2];
};

const phone = await open({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
});
let [x, y] = await center(phone);
await phone.touchscreen.tap(x, y);
await phone.waitForTimeout(300);
check("phone: tap activates cell", await selected(phone));
const cdp = await phone.context().newCDPSession(phone);
const touch = (type, pts) =>
  cdp.send("Input.dispatchTouchEvent", { type, touchPoints: pts });
[x, y] = await center(phone);
await touch("touchStart", [{ x, y }]);
await touch("touchMove", [{ x: x - 30, y }]);
await touch("touchEnd", []);
await phone.waitForTimeout(600);
check("phone: touch drag does not click", await selected(phone));

const desk = await open({ viewport: { width: 1280, height: 800 } });
[x, y] = await center(desk);
await desk.mouse.click(x, y);
check("desktop: mouse click activates cell", await selected(desk));
await desk.mouse.move(x, y);
await desk.mouse.down();
await desk.mouse.move(x + 40, y + 5, { steps: 5 });
await desk.mouse.up();
check("desktop: mouse drag does not click", await selected(desk));
await browser.close();
await server.close();
process.exit(failed ? 1 : 0);
