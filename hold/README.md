# Ashen Hold

The shell is twice the previous vale. Bricks face the planet's heart. The star and the planet are stepped by the n-body integrator from `src/engine` (nbody-raycaster), so the globe spins and the sun crosses the sky. A knight's fall is that same pairwise pull. The ground stays fixed in the planet frame.

A snow-capped peak feeds a stream, a lake, and a river. A cave under the peak is veined with gems. A volcano stands on another meridian: ash, a magma throat, and cinders. Clouds drift, rain falls under a thick deck, and fog thickens with the shower. The frame is still the hold raytracer, not the Atoll picture. `?look=peak` and `?look=vent` frame those places from the title.

Solo works with no one else connected. A shared banner code is a WebRTC room; the browser that hosts the sim can leave, and another peer takes the warden seat. Carrier ravens and one pigeon fly notes and a sketch of the ground you are standing on between the Hold, the Mill, the Loom, the Camp, and captains in the same room.

**[Play on GitHub Pages](https://blakelapierre.github.io/meridian/hold/play/).** That copy is the committed static build in `play/`. Enter the Vale there. Hosting a banner will not find anyone, because Pages does not run the herald.

## Run

```sh
cd hold
npm install
npm run dev
```

Opens on port 8090 so it does not collide with `npm start` at the repository root (the Atoll server, port 8080). Auth is off (`hold/.grok/app-env.json`).

Wasd moves. A turns left, D turns right, and the body follows. Mouse right looks right. Space jumps. Enter the Vale from the menu. Pause spends attribute and skill points. The roost button loosens a raven: pick a town or a connected captain, write a note, and pin a map of the ground under you.

Resolution is in the pause ledger (Auto, or a locked long side from coarse to keen). The sheet is kept in local storage on this device.

## Pages

`npm run build:pages` writes a static client (no server, no `/api/rtc`). `PAGES_OUT=play` drops it in `play/`, which GitHub Pages already serves because the site root is the repository. The asset base is `/meridian/hold/play/`.
