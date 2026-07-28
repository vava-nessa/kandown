# kandown-burndown

The canonical reference extension for kandown. It exercises every contribution
point:

- **field** `points`, a story-points number stored under `plugins.burndown.points`,
  with a card badge.
- **web panel** `chart`, a collapsible Burndown progress view in the task editor.
- **gate** that blocks any move to `Done` until the task has points.
- **command** `kandown burndown` that prints done vs total points.

## Install

```bash
kandown extension install ./examples/extensions/burndown
kandown extension enable burndown
```

## Try it

```bash
kandown create "Ship the thing"          # t1, no points yet
kandown move t1 Done                     # blocked: needs story points
# Add Story points from the web task editor, or write:
# plugins:
#   burndown:
#     points: 3
kandown move t1 Done                     # allowed
kandown burndown                         # Burndown: 3/3 points done, 0 remaining.
```

Open the task in the web UI to verify the Story points field, `🔺 3` card badge
and collapsible Burndown panel. `index.js` is the self-contained distribution
entry used by standalone browsers; `web.js` exports the panel component.

See [`docs/EXTENSIONS.md`](../../../docs/EXTENSIONS.md) for the full extension
reference.
