# Quests

The design lives in [docs/quests](../quests/README.md). There is no quest UI, and there will not be one.

## In the build

Nothing on the status line is an objective. The atoll paper is lore only. The character keeps a short notebook of sentences their skills can support. Another player nearby can be told a sentence, and can keep it only if they can read it.

Using a wall pins your latest told sentence onto it. Salvaging that wall drops the sentence as a slip on the same cell. A slip with a signature checks that signature before the sentence is kept.

## This pass

The slip checks its signature.

## Proves

`test/slice.test.js` covers the check.

## Next

A paper you can pick up and read because it is an object. Not in this build.

## Later

A sentence someone else wrote into the world.
