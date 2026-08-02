# Community workflow registry

Community workflow authors keep their source and capsule in an author-owned
GitHub repository. Kandown only maintains this approved index.

## Submission

Open a pull request that adds one entry to `workflows.json`. The entry must pin a
40-character commit SHA or a semantic release tag and include the SHA-256 digest
of the published Markdown capsule.

```json
{
  "id": "example-workflow",
  "name": "Example Workflow",
  "description": "What the workflow is for.",
  "author": "Author name",
  "repo": "owner/repository",
  "ref": "v1.0.0",
  "capsule": "dist/example-workflow.kandown-workflow.md",
  "sha256": "64 lowercase hexadecimal characters",
  "version": "1.0.0"
}
```

## Moderation gate

A registry change is accepted only when the package:

- loads with the current data-only validator;
- contains no runtime or executable payload;
- matches the declared id and version;
- downloads from the pinned GitHub ref;
- matches the declared checksum;
- installs into a temporary Kandown project;
- retains clear source attribution and licensing information.

Later releases remain opt-in. Kandown validates the new capsule and presents a
diff before the user confirms an update.
