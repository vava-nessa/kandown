# kandown-burndown

The canonical reference extension for kandown. It exercises every CLI-visible
contribution point:

- **field** `points`, a story-points number stored under `plugins.burndown.points`,
  with a card badge.
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
# add points (today: edit the task file; soon: the web field editor)
#   plugins:
#     burndown:
#       points: 3
kandown move t1 Done                     # allowed
kandown burndown                         # Burndown: 3/3 points done, 0 remaining.
```

See [`docs/EXTENSIONS.md`](../../../docs/EXTENSIONS.md) for the full extension
reference.
