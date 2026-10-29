# Audio

## In the build

The beach makes short tones with the Web Audio oscillator. No samples are shipped. Quiet clients, including the AI frames, stay silent.

| Cue | When |
|---|---|
| step | The body has traveled far enough. A sprint asks for a longer stride |
| dig | The bit opens sand |
| fill | The bit closes a hole |
| shot | The line fires |
| place | A wall, hearth, or fin finishes |
| salvage | A wall comes down |
| hurt | The dummy drops you |
| bind | You bind the hearth |
| recall | You wake |

K toggles the listener. The line says `muted` while it is off. The first cue also resumes the audio context, which browsers block until a key or a click.

## This pass

A shot is panned by the direction it left. Night is still quieter. There is still no music.

## Proves

`test/audio.test.js` for the cue table and the stride gate. The context itself is not required in Node.

## Later

Distance and side. The sea. A shot that cracks only inside its range. The night side quieter than noon. No music bed.
