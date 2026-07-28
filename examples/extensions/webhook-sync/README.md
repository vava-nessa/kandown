# kandown-webhook-sync

An example extension demonstrating the **sync** contribution point and the
**net** permission. When a task moves to `Done`, it POSTs a small JSON payload to
the URL in `KANDOWN_WEBHOOK_URL`.

## Install

```bash
kandown extension install ./examples/extensions/webhook-sync
kandown extension enable webhook-sync
export KANDOWN_WEBHOOK_URL=https://hookb.in/your-bin
```

## Try it

```bash
kandown webhook-sync        # test ping
# move any task to Done and the sync fires
```

See [`docs/EXTENSIONS.md`](../../../docs/EXTENSIONS.md) and
[`docs/EXTENSIONS-AUTHORING.md`](../../../docs/EXTENSIONS-AUTHORING.md).
