import assert from "node:assert/strict";
import test from "node:test";
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
  const win = (search, coarse, points = 0) => ({ location: { search }, matchMedia: () => ({ matches: coarse }), navigator: { maxTouchPoints: points } });
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
