# Contributing to Meridian

Thanks for looking. Meridian is pre-alpha, and the specs in `docs/` are the contract: code is built against them, and a change to behavior starts as a change to the spec.

## Run it

```sh
npm install
npm test        # unit + browser tests (needs Chrome or Chromium)
npm start       # dev server on :8080, signaling on :8787
```

## What helps most right now

- Attacks on the quorum and op-log design in `docs/implementation-webrtc.md`. Open an issue describing the attack and which phase it breaks.
- Bug reports from the solo demo, with browser, device, and what you saw.
- Tests. Every slice rule in `docs/game.md` §18.3 should be a test someone can run.

## Pull requests

- Keep each PR to one topic, and add or update a test with it.
- `npm test` must pass.
- Follow the file layout in `docs/engineering.md`.
- By contributing you agree your work is released under the MIT license.

## Roadmap

Network phases P0 to P9 are tracked as issues labeled [`roadmap`](https://github.com/blakelapierre/meridian/labels/roadmap):

- [P0 Link](https://github.com/blakelapierre/meridian/issues/34)
- [P1 Predict](https://github.com/blakelapierre/meridian/issues/35)
- [P2 Witnessed hits](https://github.com/blakelapierre/meridian/issues/36)
- [P3 Op log](https://github.com/blakelapierre/meridian/issues/37)
- [P4 Handover](https://github.com/blakelapierre/meridian/issues/38)
- [P5 Strike scope](https://github.com/blakelapierre/meridian/issues/39)
- [P6 Aggregates](https://github.com/blakelapierre/meridian/issues/40)
- [P7 Archive](https://github.com/blakelapierre/meridian/issues/41)
- [P8 Crust](https://github.com/blakelapierre/meridian/issues/42)
- [P9 Dominion](https://github.com/blakelapierre/meridian/issues/43)

 Nothing later starts before the current phase's exit test is green.
