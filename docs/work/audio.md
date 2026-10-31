# Audio

## In the build

The beach makes short tones with the Web Audio oscillator. No samples are shipped. Quiet clients, including the AI frames, stay silent.

| Cue | When |
|---|---|
| step | The body has traveled far enough. A sprint asks for a longer stride. Each step also trains tracking |
| dig | The bit opens sand |
| fill | The bit closes a hole |
| shot | The line fires |
| place | A wall, hearth, or fin finishes |
| salvage | A wall comes down |
| hurt | The dummy drops you |
| bind | You bind the hearth |
| recall | You wake |

K toggles the listener. The line says `muted` while it is off. The first cue also resumes the audio context, which browsers block until a key or a click.

A shot behind you is half as loud. It is not silent. Distance falloff is unchanged.

## This pass

The sea cue is half as loud at noon. It is not silent.

## Proves

`test/slice.test.js` covers the noon gain.

## Next

The sea drops to 0.3 at night (0.5 at noon). Sounds from other players (shots, digs, steps) are placed by distance and side through the hearing sense (`hearAt` in `src/sim/perception.js`). Ambient sources are not in this build.

## Later

A shot that cracks only inside its range. No music bed.

## Ambient soundscape (batch 3)

`src/audio/ambient.js` schedules surf, gusts, birds, gulls, insects, rustle, distant activity and rare sounds with jittered gaps and non-repeating variants. Precise sources go through an HRTF PannerNode, others through a StereoPanner (`src/audio/play.js`).
