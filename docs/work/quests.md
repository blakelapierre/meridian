# Quests

The design lives in [docs/quests](../quests/README.md). There is no quest UI, and there will not be one.

## In the build

Nothing on the status line is an objective. The atoll paper is lore only. The character keeps a short notebook of sentences their skills can support. Another player nearby can be told a sentence, and can keep it only if they can read it.

Using a wall pins your latest told sentence onto it. Salvaging that wall drops the sentence as a slip on the same cell.

## This pass

A salvaged slip keeps the signature that was pinned on the wall.

## Proves

`test/slice.test.js` covers the signature on the slip.

## Next

The slip does not check that signature. Not in this build.

## Later

A paper you can pick up and read because it is an object. A sentence someone else wrote into the world.
