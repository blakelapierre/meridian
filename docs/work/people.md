# People

## In the build

Other clients are bodies. Tab cycles them, and it also cycles Pell, Hask, and Nim, who stand in Southmere and do not walk. They are drawn as the same figure as a player, cloth in their own color. U speaks to one of them if you are within 3 m. The target plate names whatever you have selected. Esc, Backspace, or Clear drops it. Standing inside sense range raises friendliness by 1 a second, up to 100. What you trade depends on that score and on mapping, mining, building, and appraisal on both sides. The AI clients are the same view, driven only through player keys. Your own body can take a pilot too. Pilot, in the corner, lists six goals in the order a new body should meet the beach: survey, dig, raise, drill, hunt, speak. You leave on the ones you want. Run hands the body to them, one after another. Walking takes it back.

While you drag someone, they are drawn just ahead of you. Their client is sent one drag step on the control channel and takes it. They cannot refuse.

## This pass

Friendliness is not only a number. Each person keeps a record of what passed between you: lore they told you, and drags they refused. A refused drag also costs 5, never below 0. The line reads `acquaintance 14 · told 2 · refused 1`.

## This pass (helper)

Comma builds a helper beside you once building is at least 4. It spends 8 metal, 4 stone, and 1 fiber, and the making raises building. A higher building skill seeds a less clumsy helper. Period cycles the nearest one through follow, dig, haul, survey, and hold. U does the same to the helper you have identified. Digging raises its mining and is faster as that rises, until it is holding three stone. Hauling carries that stone, or a settled loose stone, back to the footing and raises hauling. Surveying walks a square and raises mapping and a little building. Follow and hold do not train. Shift+Comma dismisses the nearest and returns half the metal and stone. Three is the cap. The picture thread draws them from the stage. The sheet brings them back.

## Proves

`test/slice.test.js` covers the refusal. `test/batch12.test.js` covers the record. `test/pilot.test.js` covers the goals you leave on. `test/helper.test.js` covers the cost, the tasks, and the helper's own skills.

## This pass (record)

The record now stays on the device (`meridian-deeds`) and each new deed is sent to the person it is about. Selecting someone shows what they hold about you: "they hold told 2 refused 1".

## This pass (guard)

The record now changes how you answer: anyone who has refused you at least two more times than they have told you something gets no lore from you, until telling you things evens it out.

## This pass (told why)

The person you guard against sees it in the record line: "they hold refused 2 · no lore from them".

## This pass (fade)

Old refusals fade: one is forgiven for each day since the last refusal, applied when the saved record loads. A guard lifts on its own.

## Next

A record the AI people keep: `ai-` actors neither note deeds nor guard. Not in this build.

## Later

The score is still a number.
