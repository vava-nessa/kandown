# kandown-labels

An example extension demonstrating a **select** field with a custom **badge**, and
a **gate that composes** with other extensions' gates. Enable it alongside
`burndown` and a task needs **both** story points **and** a label before it can
reach `Done` (gate composition).

## Install

```bash
kandown extension install ./examples/extensions/labels
kandown extension enable labels
```

## Try it (composition with burndown)

```bash
kandown extension install ./examples/extensions/burndown
kandown extension enable burndown
kandown create "Fix the bug"
kandown move t1 Done        # blocked: needs points AND a label
# add to the task file:
#   plugins:
#     burndown:
#       points: 2
#     labels:
#       label: bug
kandown move t1 Done        # allowed
```

See [`docs/EXTENSIONS.md`](../../../docs/EXTENSIONS.md) and
[`docs/EXTENSIONS-AUTHORING.md`](../../../docs/EXTENSIONS-AUTHORING.md).
