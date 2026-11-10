# CyberHack (working title)

A real-time hacking game set in 2050, where AI runs the net. Spiritual successor to Decker (2001). Work in progress.

## Play

Latest version from `main`: https://mjkorszun.github.io/HackingGame/

## Run locally

```
npm install
npm run dev       # dev server with live reload, open the printed URL
npm test          # unit tests (Vitest)
npm run build     # type check + production build into dist/
```

## Layout

- `src/sim/` pure game simulation (no DOM): tick clock, network, game state. Tested.
- `src/ui/` browser UI: console (left), network view and context menu (right).
- `src/data/` hand-made content for now (one test system).

## Controls (skeleton)

- Click a neighbouring node to connect to it. Click a node on the minimap to travel there hop by hop.
- Right-click any node for its actions.
- Space: pause / resume. 1-9: connect to the numbered neighbour. Esc: stop after the current hop. Enter: focus the console.
- M: sound on / off. Volume slider in the top bar.
- Console commands: `help`, `connect <node>`, `look [node]`, `map`, `pause`, `resume`, `stop`, `mute`, `clear`. Tab completes commands and node names; Tab twice lists the options.
- Every mouse action and shortcut runs the matching console command and shows it in the console.

## Credits

Sound effects: [Kenney](https://kenney.nl), CC0.
