# Akira

Akira is a lightweight Zotero-style reference manager prototype that uses YAML as
its data source.

## Run

Serve the folder locally:

```bash
python3 -m http.server 5173
```

Then visit `http://localhost:5173`.

## Data Source

The default library is `data/library.yaml`. The app expects this shape:

```yaml
library:
  collections:
    - id: ai
      name: AI Research
  items:
    - id: attention-is-all-you-need
      type: paper
      title: Attention Is All You Need
      authors:
        - Ashish Vaswani
      year: 2017
      venue: NeurIPS
      collection: ai
      tags:
        - transformer
      abstract: Foundational transformer paper.
      attachments:
        - label: PDF
          url: https://example.com/paper.pdf
      notes:
        - Important for sequence modeling.
```

Use the toolbar button in the app to load another local `.yaml` or `.yml` file
without changing the repository file.
