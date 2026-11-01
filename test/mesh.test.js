import assert from "node:assert/strict";
import test from "node:test";
import { PLAYER_DEGREE, ringNeighbors } from "../src/net/mesh.js";

const nine = ["a", "b", "c", "d", "e", "f", "g", "h", "i"];
const ten = [...nine, "j"];

function graph(ids) {
  const edges = new Map(ids.map((id) => [id, new Set(ringNeighbors(ids, id))]));
  for (const [id, want] of edges) {
    assert.equal(want.has(id), false, `${id} links to itself`);
    for (const other of want) assert.equal(edges.get(other).has(id), true, `${id} → ${other} is one way`);
  }
  return edges;
}

test("two players link to each other, in either input order", () => {
  assert.deepEqual(ringNeighbors(["b", "a"], "a"), ["b"]);
  assert.deepEqual(ringNeighbors(["a", "b"], "b"), ["a"]);
  assert.deepEqual(ringNeighbors(["a"], "a"), []);
  assert.deepEqual(ringNeighbors(["a", "b"], "c"), []);
});

test("nine players is the complete graph, so nobody is dropped to make room", () => {
  assert.equal(PLAYER_DEGREE, 8);
  const edges = graph(nine);
  for (const id of nine) {
    assert.deepEqual([...edges.get(id)].sort(), nine.filter((other) => other !== id).sort());
  }
});

test("a tenth player is wanted by eight peers, and the rest of the ring stays mutual", () => {
  const before = new Map(nine.map((id) => [id, new Set(ringNeighbors(nine, id))]));
  const after = graph(ten);
  for (const id of ten) assert.equal(after.get(id).size, PLAYER_DEGREE);
  const lookingAtJoiner = nine.filter((id) => after.get(id).has("j"));
  assert.equal(lookingAtJoiner.length, PLAYER_DEGREE);
  for (const id of nine) {
    const dropped = [...before.get(id)].filter((other) => !after.get(id).has(other));
    const added = [...after.get(id)].filter((other) => !before.get(id).has(other));
    if (after.get(id).has("j")) {
      assert.deepEqual(added, ["j"]);
      assert.equal(dropped.length, 1);
    } else {
      assert.deepEqual(added, []);
      assert.deepEqual(dropped, []);
    }
  }
});

test("fifty players each keep eight neighbors, and the choice does not depend on input order", () => {
  const ids = Array.from({ length: 50 }, (_, i) => `p-${String(i).padStart(2, "0")}`);
  const edges = graph(ids);
  for (const id of ids) assert.equal(edges.get(id).size, PLAYER_DEGREE);
  const shuffled = [...ids].reverse();
  for (const id of ids) assert.deepEqual(ringNeighbors(shuffled, id), ringNeighbors(ids, id));
});
