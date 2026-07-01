# Akira Library

Akira Library is a lightweight Zotero-style reference manager prototype that uses
YAML as its data source. It runs as a static web app and loads
`data/library.yaml` by default.

## Run

Install dependencies:

```bash
npm install
```

Run the Tauri desktop app in development:

```bash
npm run dev
```

Build the desktop app:

```bash
npm run build
```

The Linux bundles are written under `src-tauri/target/release/bundle/`.

## Release

GitHub Actions builds and publishes releases when a version tag matching `v*` is
pushed:

```bash
git tag v0.1.0
git push origin v0.1.0
```

The release workflow builds Linux, Windows, macOS Apple Silicon, and macOS Intel
bundles, creates the GitHub Release for that tag, and uploads the generated
Tauri assets.

For browser-only preview of the frontend:

```bash
npm run preview:web
```

Then visit `http://localhost:5173`.

## Data Source

The bundled starter library is `data/library.yaml`. In Tauri mode the app copies
that starter file into the writable app data directory as `library.yaml`, then
loads and saves that file through Tauri commands.

The UI is bound directly to the in-memory library state. Editing fields in the
right detail panel updates the list, filters, tags, and collection counts
immediately, then writes the normalized YAML back to disk after a short debounce.
Loading another `.yaml` file imports it into the current writable Tauri library.

Browser preview mode still loads `data/library.yaml`, but it is read-only because
the browser cannot write local files without the Tauri backend.

## DOI Tools

When an item has a DOI, the Info panel exposes DOI actions:

- Normalize: strips `https://doi.org/`, `http://dx.doi.org/`, or `doi:` prefixes.
- Fetch Metadata: looks up the DOI through the DOI resolver's CSL JSON endpoint,
  with Crossref as a fallback, and applies returned title, authors, year,
  publication, publisher, volume, issue, pages, URL, type, and abstract fields.
- Open DOI: opens the resolver URL at `https://doi.org/{doi}`.

Fetched or normalized values use the same two-way YAML sync as manual edits.

## YAML Shape

The app expects this shape:

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
      date: 2017-06-12
      dateAdded: 2026-06-30
      venue: NeurIPS
      publisher: Example Publisher
      volume: 1
      issue: 2
      pages: 1-12
      collections:
        - ai
      tags:
        - transformer
      doi: 10.48550/arXiv.1706.03762
      url: https://arxiv.org/abs/1706.03762
      abstract: Foundational transformer paper.
      attachments:
        - label: PDF
          url: https://example.com/paper.pdf
      notes:
        - Important for sequence modeling.
```

Use the toolbar button in the app to load another local `.yaml` or `.yml` file
without changing the repository file.

Items may use either `collection: ai` or `collections: [ai, systems]`. Common
Zotero-like fields such as `type`, `authors`, `date`, `dateAdded`, `venue`,
`publisher`, `volume`, `issue`, `pages`, `doi`, `isbn`, `url`, `tags`, `notes`,
and `attachments` are rendered when present.
