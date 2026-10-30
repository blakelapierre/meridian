import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { BUTTONS, isTap, stickKeys, wantsTouch } from "../src/app/touch.js";

test("the stick holds the movement keys the keymap uses", () => {
  assert.deepEqual([...stickKeys(0, 0)], []);
  assert.deepEqual([...stickKeys(5, -5)], []);
  assert.deepEqual([...stickKeys(0, -40)], ["KeyW"]);
  assert.deepEqual([...stickKeys(0, 40)], ["KeyS"]);
  assert.deepEqual([...stickKeys(-40, 0)], ["KeyZ"]);
  assert.deepEqual([...stickKeys(40, 0)], ["KeyC"]);
  assert.ok(stickKeys(0, -60).has("ShiftLeft"));
  assert.ok(!stickKeys(0, 60).has("ShiftLeft"));
});

test("a tap is short and still", () => {
  assert.ok(isTap(120, 3));
  assert.ok(!isTap(400, 3));
  assert.ok(!isTap(120, 40));
});

test("touch mounts only on a coarse pointer (not a touch laptop with a mouse) or ?touch=1", () => {
  const win = (search, coarse, points = 0) => ({ location: { search }, matchMedia: (q) => ({ matches: q === "(any-pointer: fine)" ? !coarse : coarse }), navigator: { maxTouchPoints: points } });
  assert.equal(wantsTouch(win("", false)), false);
  assert.equal(wantsTouch(win("", true)), true);
  assert.equal(wantsTouch(win("", false, 5)), false);
  assert.equal(wantsTouch(win("?touch=1", false)), true);
  assert.equal(wantsTouch(win("?touch=0", true)), false);
});

test("buttons cover the keymap actions", () => {
  const codes = BUTTONS.map((button) => button.code);
  for (const code of ["Space", "KeyE", "KeyB", "Digit1", "Digit3", "Escape"]) assert.ok(codes.includes(code), code);
});

test("a touch surface with no fine pointer mounts even if the primary pointer reads fine", () => {
  const win = (fine, extra = {}) => ({ location: { search: "" }, matchMedia: (q) => ({ matches: q === "(any-pointer: fine)" ? fine : false }), navigator: { maxTouchPoints: 0 }, ...extra });
  assert.equal(wantsTouch(win(false, { navigator: { maxTouchPoints: 5 } })), true);
  assert.equal(wantsTouch(win(false, { ontouchstart: null })), true);
  assert.equal(wantsTouch(win(true, { navigator: { maxTouchPoints: 10 } })), false);
});

test("the view and touch modules are cache-busted so a cached build without touch is not reused", () => {
  const main = readFileSync(new URL("../src/app/main.js", import.meta.url), "utf8");
  const view = readFileSync(new URL("../tools/view/index.html", import.meta.url), "utf8");
  assert.match(main, /from "\.\/touch\.js\?v=\d+"/);
  assert.match(view, /src="\.\.\/\.\.\/src\/app\/main\.js\?v=\d+"/);
});
