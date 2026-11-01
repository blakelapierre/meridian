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

A shot behind you is half as loud. It is not silent. Past 80 m the crack is silent. Inside that range the falloff is unchanged.

Ambient sources are scheduled: surf, gusts, birds, gulls, insects, rustle, distant activity, and rare sounds. There is no music bed.

## This pass

A shot cracks only inside its range. Farther than 80 m it is silent. Inside that range the old falloff is unchanged.

## Proves

`test/slice.test.js` covers the cutoff. `crackGain` at 80 m is still 0.25.

## Next

No music bed. Not in this build.

## Later

The design stops at cues.

## Ambient soundscape (batch 3)

`src/audio/ambient.js` schedules surf, gusts, birds, gulls, insects, rustle, distant activity and rare sounds with jittered gaps and non-repeating variants. Precise sources go through an HRTF PannerNode, others through a StereoPanner (`src/audio/play.js`).
