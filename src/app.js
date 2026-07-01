const state = {
  library: { collections: [], items: [] },
  selectedCollection: 'all',
  selectedSpecial: null,
  selectedTag: null,
  selectedItemId: null,
  detailTab: 'info',
  query: '',
  sort: 'year-desc',
  sourceName: 'data/library.yaml',
  sourcePath: '',
  canPersist: false,
  saveTimer: null,
  saveState: 'idle',
};

const els = {
  allCount: document.querySelector('#all-count'),
  recentCount: document.querySelector('#recent-count'),
  unfiledCount: document.querySelector('#unfiled-count'),
  collections: document.querySelector('#collections'),
  tags: document.querySelector('#tags'),
  itemList: document.querySelector('#item-list'),
  detail: document.querySelector('#detail'),
  emptyState: document.querySelector('#empty-state'),
  search: document.querySelector('#search'),
  sort: document.querySelector('#sort'),
  file: document.querySelector('#yaml-file'),
  copyCitation: document.querySelector('#copy-citation'),
  sourceStatus: document.querySelector('#source-status'),
  detailTabs: document.querySelector('.detail-tabs'),
};

const collator = new Intl.Collator('en', { sensitivity: 'base' });
const tauriInvoke = window.__TAURI__?.core?.invoke;

async function loadDefaultLibrary() {
  try {
    if (tauriInvoke) {
      const payload = await tauriInvoke('load_library_yaml');
      setLibrary(parseLibrary(payload.yaml), 'library.yaml', {
        path: payload.path,
        canPersist: true,
      });
      return;
    }

    const response = await fetch('./data/library.yaml');
    if (!response.ok) throw new Error(`Failed to load YAML: ${response.status}`);
    const yamlText = await response.text();
    setLibrary(parseLibrary(yamlText), 'data/library.yaml', {
      path: 'data/library.yaml',
      canPersist: false,
    });
  } catch (error) {
    renderError(error, 'YAML load failed');
  }
}

function parseLibrary(yamlText) {
  const parsed = window.jsyaml.load(yamlText);
  const root = parsed?.library ?? parsed;
  if (!root || !Array.isArray(root.items)) {
    throw new Error('YAML must contain a library.items array.');
  }

  return {
    collections: normalizeCollections(root.collections),
    items: root.items.map(normalizeItem),
  };
}

function normalizeCollections(collections = []) {
  if (!Array.isArray(collections)) return [];
  return collections
    .filter((collection) => collection?.id || collection?.name)
    .map((collection) => ({
      id: String(collection.id ?? slugify(collection.name)),
      name: String(collection.name ?? collection.id),
      parent: collection.parent ? String(collection.parent) : '',
    }));
}

function normalizeItem(item, index) {
  const collections = toArray(item.collections ?? item.collection);
  return {
    id: String(item.id ?? `item-${index + 1}`),
    type: item.type ?? 'reference',
    title: item.title ?? 'Untitled',
    authors: toArray(item.authors ?? item.creators),
    year: item.year ?? inferYear(item.date),
    date: formatScalar(item.date),
    dateAdded: formatScalar(item.dateAdded ?? item.added),
    venue: item.venue ?? item.publicationTitle ?? item.journal ?? item.conference ?? '',
    publisher: item.publisher ?? '',
    volume: item.volume ?? '',
    issue: item.issue ?? '',
    pages: item.pages ?? '',
    collection: collections[0] ?? '',
    collections,
    tags: toArray(item.tags),
    abstract: item.abstract ?? item.summary ?? '',
    doi: item.doi ?? '',
    isbn: item.isbn ?? '',
    url: item.url ?? '',
    notes: toArray(item.notes),
    attachments: Array.isArray(item.attachments) ? item.attachments : [],
  };
}

function toArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean).map(String);
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  return [];
}

function inferYear(value) {
  const match = String(value ?? '').match(/\b(18|19|20)\d{2}\b/);
  return match ? match[0] : '';
}

function formatScalar(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value ?? '';
}

function slugify(value) {
  return String(value ?? 'collection')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function serializeLibrary() {
  return window.jsyaml.dump(
    {
      library: {
        collections: state.library.collections.map((collection) => omitEmpty(collection)),
        items: state.library.items.map(serializeItem),
      },
    },
    { lineWidth: 100, noRefs: true, sortKeys: false },
  );
}

function serializeItem(item) {
  return omitEmpty({
    id: item.id,
    type: item.type,
    title: item.title,
    authors: item.authors,
    year: item.year,
    date: item.date,
    dateAdded: item.dateAdded,
    venue: item.venue,
    publisher: item.publisher,
    volume: item.volume,
    issue: item.issue,
    pages: item.pages,
    collections: item.collections,
    tags: item.tags,
    doi: item.doi,
    isbn: item.isbn,
    url: item.url,
    abstract: item.abstract,
    attachments: item.attachments,
    notes: item.notes,
  });
}

function omitEmpty(record) {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => {
      if (Array.isArray(value)) return value.length > 0;
      return value !== '' && value !== null && value !== undefined;
    }),
  );
}

function scheduleSave() {
  if (!state.canPersist || !tauriInvoke) {
    renderSourceStatus();
    return;
  }

  window.clearTimeout(state.saveTimer);
  state.saveState = 'saving';
  renderSourceStatus();
  state.saveTimer = window.setTimeout(saveLibraryNow, 500);
}

async function saveLibraryNow() {
  try {
    const payload = await tauriInvoke('save_library_yaml', { yaml: serializeLibrary() });
    state.sourcePath = payload.path;
    state.saveState = 'saved';
    renderSourceStatus();
  } catch (error) {
    state.saveState = 'error';
    renderError(error);
  }
}

function setLibrary(library, sourceName, options = {}) {
  state.library = library;
  state.sourceName = sourceName;
  state.sourcePath = options.path ?? sourceName;
  state.canPersist = Boolean(options.canPersist);
  state.saveState = 'idle';
  state.selectedCollection = 'all';
  state.selectedSpecial = null;
  state.selectedTag = null;
  state.detailTab = 'info';
  state.selectedItemId = getVisibleItems()[0]?.id ?? null;
  render();
}

function render() {
  renderSourceStatus();
  renderCollections();
  renderTags();
  renderItems();
  renderDetailTabs();
  renderDetail();
}

function renderSourceStatus() {
  const mode = state.canPersist ? 'synced YAML' : 'read-only preview';
  const saving =
    state.saveState === 'saving'
      ? ' - saving...'
      : state.saveState === 'saved'
        ? ' - saved'
        : state.saveState === 'error'
          ? ' - save failed'
          : '';
  els.sourceStatus.textContent = `${state.library.items.length} items from ${state.sourceName} (${mode})${saving}`;
  els.sourceStatus.title = state.sourcePath;
}

function renderCollections() {
  els.allCount.textContent = state.library.items.length;
  els.recentCount.textContent = getRecentItems().length;
  els.unfiledCount.textContent = state.library.items.filter((item) => !item.collections.length).length;

  document
    .querySelector('[data-collection="all"]')
    .classList.toggle('is-active', state.selectedCollection === 'all' && !state.selectedSpecial);

  for (const button of document.querySelectorAll('[data-special]')) {
    button.classList.toggle('is-active', state.selectedSpecial === button.dataset.special);
  }

  els.collections.innerHTML = '';
  for (const collection of state.library.collections) {
    const count = state.library.items.filter((item) => item.collections.includes(collection.id)).length;
    const button = document.createElement('button');
    button.className = 'nav-item';
    button.type = 'button';
    button.dataset.collection = collection.id;
    button.classList.toggle('is-active', state.selectedCollection === collection.id && !state.selectedSpecial);
    button.innerHTML = `<span>${escapeHtml(collection.name)}</span><strong>${count}</strong>`;
    button.addEventListener('click', () => selectCollection(collection.id));
    els.collections.append(button);
  }
}

function renderTags() {
  const tags = [...new Set(state.library.items.flatMap((item) => item.tags))].sort(collator.compare);
  els.tags.innerHTML = '';
  for (const tag of tags) {
    const button = document.createElement('button');
    button.className = 'tag-chip';
    button.type = 'button';
    button.textContent = tag;
    button.classList.toggle('is-active', state.selectedTag === tag);
    button.addEventListener('click', () => {
      state.selectedTag = state.selectedTag === tag ? null : tag;
      ensureSelectedItem();
      render();
    });
    els.tags.append(button);
  }
}

function renderItems() {
  const items = getVisibleItems();
  els.itemList.innerHTML = '';
  els.emptyState.hidden = items.length > 0;

  for (const item of items) {
    const button = document.createElement('button');
    button.className = 'reference-row';
    button.type = 'button';
    button.classList.toggle('is-selected', state.selectedItemId === item.id);
    button.innerHTML = `
      <span class="cell title-cell">
        <strong>${escapeHtml(item.title)}</strong>
        <small>${escapeHtml(item.venue || item.publisher || 'No publication source')}</small>
      </span>
      <span class="cell">${escapeHtml(formatAuthors(item.authors))}</span>
      <span class="cell compact">${escapeHtml(String(item.year || ''))}</span>
      <span class="cell compact type-pill">${escapeHtml(item.type)}</span>
    `;
    button.addEventListener('click', () => {
      state.selectedItemId = item.id;
      renderItems();
      renderDetail();
    });
    els.itemList.append(button);
  }
}

function renderDetailTabs() {
  for (const button of els.detailTabs.querySelectorAll('button')) {
    button.classList.toggle('is-active', button.dataset.tab === state.detailTab);
  }
}

function renderDetail() {
  const item = state.library.items.find((entry) => entry.id === state.selectedItemId);
  if (!item) {
    els.detail.innerHTML = '<p class="empty-state">Select a reference to view details.</p>';
    return;
  }

  const header = `
    <div class="detail-heading">
      <span class="detail-type">${escapeHtml(item.type)}</span>
      <h2>${escapeHtml(item.title)}</h2>
      <p>${escapeHtml(formatAuthors(item.authors))}</p>
      <p class="sync-hint">${state.canPersist ? 'Edits sync to YAML automatically.' : 'Browser preview is read-only; Tauri mode writes YAML.'}</p>
    </div>
  `;

  if (state.detailTab === 'abstract') {
    els.detail.innerHTML = `${header}${renderSection('Abstract', editTextarea('abstract', item.abstract, 'Abstract'))}`;
    return;
  }

  if (state.detailTab === 'notes') {
    els.detail.innerHTML = `
      ${header}
      ${renderSection('Notes', editTextarea('notes', item.notes.join('\n'), 'One note per line', true))}
      ${renderSection('Tags', editInput('tags', item.tags.join(', '), 'Comma separated tags', true))}
    `;
    return;
  }

  if (state.detailTab === 'attachments') {
    els.detail.innerHTML = `
      ${header}
      ${renderSection('Attachments', editTextarea('attachments', formatAttachmentsForEdit(item.attachments), 'label | url, one per line', true))}
      ${renderSection('Links', renderLinks(item))}
    `;
    return;
  }

  els.detail.innerHTML = `
    ${header}
    <div class="edit-grid">
      ${editInput('title', item.title, 'Title')}
      ${editInput('authors', item.authors.join(', '), 'Authors', true)}
      ${editInput('type', item.type, 'Type')}
      ${editInput('year', item.year, 'Year')}
      ${editInput('date', item.date, 'Date')}
      ${editInput('venue', item.venue, 'Publication')}
      ${editInput('publisher', item.publisher, 'Publisher')}
      ${editInput('volume', item.volume, 'Volume')}
      ${editInput('issue', item.issue, 'Issue')}
      ${editInput('pages', item.pages, 'Pages')}
      ${editInput('doi', item.doi, 'DOI')}
      ${editInput('isbn', item.isbn, 'ISBN')}
      ${editInput('url', item.url, 'URL')}
      ${editInput('collections', item.collections.join(', '), 'Collection IDs', true)}
    </div>
    ${renderDoiTools(item)}
  `;
}

function renderDoiTools(item) {
  const normalized = normalizeDoi(item.doi);
  const canOpen = normalized ? '' : 'disabled';
  return `
    <section class="doi-tools" aria-label="DOI tools">
      <h3>DOI</h3>
      <div class="doi-actions">
        <button data-action="normalize-doi" type="button" ${item.doi ? '' : 'disabled'}>Normalize</button>
        <button data-action="fetch-doi" type="button" ${canOpen}>Fetch Metadata</button>
        <button data-action="open-doi" type="button" ${canOpen}>Open DOI</button>
      </div>
      <p>${normalized ? escapeHtml(doiUrl(normalized)) : 'Add a DOI to enable lookup.'}</p>
    </section>
  `;
}

function editInput(field, value, label, wide = false) {
  return `
    <label class="edit-field${wide ? ' is-wide' : ''}">
      <span>${escapeHtml(label)}</span>
      <input data-field="${escapeAttr(field)}" value="${escapeAttr(value)}" />
    </label>
  `;
}

function editTextarea(field, value, label, compact = false) {
  return `
    <label class="edit-field is-wide">
      <span>${escapeHtml(label)}</span>
      <textarea class="${compact ? 'is-compact' : ''}" data-field="${escapeAttr(field)}">${escapeHtml(value)}</textarea>
    </label>
  `;
}

function formatAttachmentsForEdit(attachments) {
  return attachments
    .map((attachment) => [attachment.label ?? attachment.title ?? '', attachment.url ?? attachment.path ?? ''].join(' | '))
    .join('\n');
}

function renderSection(title, body) {
  return `<section class="detail-section"><h3>${title}</h3>${body}</section>`;
}

function renderNotes(notes) {
  if (!notes.length) return '<p class="muted">No notes in YAML.</p>';
  return `<ul>${notes.map((note) => `<li>${escapeHtml(note)}</li>`).join('')}</ul>`;
}

function renderTagsInline(tags) {
  if (!tags.length) return '<p class="muted">No tags in YAML.</p>';
  return `<div class="reference-tags detail-tags">${tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join('')}</div>`;
}

function renderLinks(item) {
  const links = [
    item.doi ? { label: `DOI: ${item.doi}`, url: `https://doi.org/${item.doi}` } : null,
    item.url ? { label: item.url, url: item.url } : null,
  ].filter(Boolean);
  if (!links.length) return '<p class="muted">No external links in YAML.</p>';
  return `<ul class="attachment-list">${links.map(renderAttachmentLink).join('')}</ul>`;
}

function renderAttachments(attachments) {
  if (!attachments.length) return '<p class="muted">No files in YAML.</p>';
  return `<ul class="attachment-list">${attachments.map(renderAttachmentLink).join('')}</ul>`;
}

function renderAttachmentLink(attachment) {
  const label = attachment.label ?? attachment.title ?? attachment.url ?? 'Attachment';
  const url = attachment.url ?? attachment.path ?? '#';
  return `<li><a href="${escapeAttr(url)}" target="_blank" rel="noreferrer">${escapeHtml(label)}</a></li>`;
}

function bindField(field, value) {
  const item = state.library.items.find((entry) => entry.id === state.selectedItemId);
  if (!item) return;

  if (field === 'authors' || field === 'tags' || field === 'collections' || field === 'notes') {
    item[field] = splitList(value);
  } else if (field === 'attachments') {
    item.attachments = parseAttachments(value);
  } else if (field in item) {
    item[field] = value;
  }

  item.collection = item.collections[0] ?? '';
  renderCollections();
  renderTags();
  renderItems();
  renderSourceStatus();
  scheduleSave();
}

function splitList(value) {
  return String(value)
    .split(/[\n,]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseAttachments(value) {
  return String(value)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [label, ...urlParts] = line.split('|').map((part) => part.trim());
      const url = urlParts.join('|').trim();
      if (!url) return { label: label || 'Attachment' };
      return { label: label || url, url };
    });
}

function normalizeDoi(value) {
  return String(value ?? '')
    .trim()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')
    .replace(/^doi:\s*/i, '')
    .trim()
    .replace(/\s+/g, '');
}

function doiUrl(doi) {
  return `https://doi.org/${encodeURIComponent(doi)}`;
}

async function fetchDoiMetadata() {
  const item = state.library.items.find((entry) => entry.id === state.selectedItemId);
  const doi = normalizeDoi(item?.doi);
  if (!item || !doi) return;

  try {
    flashSourceStatus('Fetching DOI metadata...');
    const metadata = await lookupDoiMetadata(doi);
    applyDoiMetadata(item, metadata);
    render();
    scheduleSave();
    flashSourceStatus('DOI metadata applied');
  } catch (error) {
    renderError(error, 'DOI lookup failed');
  }
}

async function lookupDoiMetadata(doi) {
  const doiResponse = await fetch(doiUrl(doi), {
    headers: { accept: 'application/vnd.citationstyles.csl+json' },
  });
  if (doiResponse.ok) return { source: 'csl', data: await doiResponse.json() };

  const crossrefResponse = await fetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}`);
  if (!crossrefResponse.ok) {
    throw new Error(`DOI lookup failed: ${doiResponse.status}/${crossrefResponse.status}`);
  }
  const payload = await crossrefResponse.json();
  return { source: 'crossref', data: payload.message ?? {} };
}

function applyDoiMetadata(item, metadata) {
  if (metadata.source === 'csl') {
    applyCslMetadata(item, metadata.data);
    return;
  }
  applyCrossrefMetadata(item, metadata.data);
}

function applyCslMetadata(item, message) {
  item.doi = normalizeDoi(message.DOI ?? message.doi ?? item.doi);
  item.title = message.title ?? item.title;
  item.authors = formatCslAuthors(message.author) || item.authors;
  item.year = String(cslYear(message) || item.year || '');
  item.date = cslDate(message) || item.date;
  item.venue = message['container-title'] ?? item.venue;
  item.publisher = message.publisher ?? item.publisher;
  item.volume = message.volume ?? item.volume;
  item.issue = message.issue ?? item.issue;
  item.pages = message.page ?? item.pages;
  item.url = message.URL ?? doiUrl(item.doi);
  item.type = mapCslType(message.type) || item.type;
  item.abstract = message.abstract ? stripTags(message.abstract) : item.abstract;
}

function applyCrossrefMetadata(item, message) {
  item.doi = normalizeDoi(message.DOI ?? item.doi);
  item.title = firstValue(message.title) || item.title;
  item.authors = formatCrossrefAuthors(message.author) || item.authors;
  item.year = String(crossrefYear(message) || item.year || '');
  item.date = crossrefDate(message) || item.date;
  item.venue = firstValue(message['container-title']) || firstValue(message['short-container-title']) || item.venue;
  item.publisher = message.publisher ?? item.publisher;
  item.volume = message.volume ?? item.volume;
  item.issue = message.issue ?? item.issue;
  item.pages = message.page ?? item.pages;
  item.url = message.URL ?? doiUrl(item.doi);
  item.type = mapCrossrefType(message.type) || item.type;
  item.abstract = message.abstract ? stripTags(message.abstract) : item.abstract;
}

function firstValue(value) {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

function formatCrossrefAuthors(authors) {
  if (!Array.isArray(authors) || !authors.length) return null;
  return authors
    .map((author) => [author.given, author.family].filter(Boolean).join(' ').trim())
    .filter(Boolean);
}

function formatCslAuthors(authors) {
  if (!Array.isArray(authors) || !authors.length) return null;
  return authors
    .map((author) => author.literal || [author.given, author.family].filter(Boolean).join(' ').trim())
    .filter(Boolean);
}

function crossrefYear(message) {
  return message.published?.['date-parts']?.[0]?.[0] ?? message.issued?.['date-parts']?.[0]?.[0] ?? '';
}

function crossrefDate(message) {
  const parts = message.published?.['date-parts']?.[0] ?? message.issued?.['date-parts']?.[0];
  return formatDateParts(parts);
}

function cslYear(message) {
  return message.issued?.['date-parts']?.[0]?.[0] ?? '';
}

function cslDate(message) {
  return formatDateParts(message.issued?.['date-parts']?.[0]);
}

function formatDateParts(parts) {
  if (!Array.isArray(parts) || !parts[0]) return '';
  const [year, month = 1, day = 1] = parts;
  return [year, String(month).padStart(2, '0'), String(day).padStart(2, '0')].join('-');
}

function mapCrossrefType(type) {
  const types = {
    'journal-article': 'article',
    'proceedings-article': 'paper',
    book: 'book',
    'book-chapter': 'chapter',
    report: 'report',
    dissertation: 'thesis',
  };
  return types[type] ?? type ?? '';
}

function mapCslType(type) {
  const types = {
    article: 'article',
    'article-journal': 'article',
    paper: 'paper',
    book: 'book',
    chapter: 'chapter',
    report: 'report',
    thesis: 'thesis',
  };
  return types[type] ?? type ?? '';
}

function stripTags(value) {
  const document = new DOMParser().parseFromString(String(value), 'text/html');
  return document.body.textContent?.trim() ?? '';
}

function getVisibleItems() {
  const query = state.query.trim().toLowerCase();
  return state.library.items
    .filter((item) => {
      if (state.selectedSpecial === 'recent') return getRecentItems().some((recent) => recent.id === item.id);
      if (state.selectedSpecial === 'unfiled') return !item.collections.length;
      return state.selectedCollection === 'all' || item.collections.includes(state.selectedCollection);
    })
    .filter((item) => !state.selectedTag || item.tags.includes(state.selectedTag))
    .filter((item) => matchesQuery(item, query))
    .sort(sortItems);
}

function matchesQuery(item, query) {
  if (!query) return true;
  const haystack = [
    item.title,
    item.venue,
    item.publisher,
    item.year,
    item.abstract,
    item.doi,
    item.isbn,
    ...item.authors,
    ...item.tags,
    ...item.notes,
  ]
    .join(' ')
    .toLowerCase();
  return haystack.includes(query);
}

function getRecentItems() {
  return [...state.library.items]
    .sort((a, b) => getTimeValue(b.dateAdded, b.year) - getTimeValue(a.dateAdded, a.year))
    .slice(0, Math.min(8, state.library.items.length));
}

function sortItems(a, b) {
  if (state.sort === 'year-asc') return Number(a.year || 0) - Number(b.year || 0);
  if (state.sort === 'title-asc') return collator.compare(a.title, b.title);
  if (state.sort === 'author-asc') return collator.compare(a.authors[0] ?? '', b.authors[0] ?? '');
  if (state.sort === 'added-desc') return getTimeValue(b.dateAdded, b.year) - getTimeValue(a.dateAdded, a.year);
  return Number(b.year || 0) - Number(a.year || 0);
}

function getTimeValue(dateValue, fallbackYear) {
  const parsed = Date.parse(dateValue);
  if (!Number.isNaN(parsed)) return parsed;
  return Number(fallbackYear || 0);
}

function selectCollection(collectionId) {
  state.selectedCollection = collectionId;
  state.selectedSpecial = null;
  state.selectedTag = null;
  ensureSelectedItem();
  render();
}

function selectSpecial(special) {
  state.selectedSpecial = special;
  state.selectedCollection = 'all';
  state.selectedTag = null;
  ensureSelectedItem();
  render();
}

function ensureSelectedItem() {
  const visible = getVisibleItems();
  state.selectedItemId = visible.some((item) => item.id === state.selectedItemId)
    ? state.selectedItemId
    : visible[0]?.id ?? null;
}

function formatAuthors(authors) {
  if (!authors.length) return 'Unknown author';
  if (authors.length <= 3) return authors.join(', ');
  return `${authors.slice(0, 3).join(', ')} et al.`;
}

function copyCitation() {
  const item = state.library.items.find((entry) => entry.id === state.selectedItemId);
  if (!item) return;
  const citation = `${formatAuthors(item.authors)} (${item.year || 'n.d.'}). ${item.title}. ${item.venue || item.publisher || ''}.`
    .replace(/\s+\./g, '.')
    .trim();
  navigator.clipboard?.writeText(citation);
  flashSourceStatus('Citation copied');
}

function flashSourceStatus(message) {
  const previous = els.sourceStatus.textContent;
  els.sourceStatus.textContent = message;
  window.setTimeout(() => {
    els.sourceStatus.textContent = previous;
  }, 1400);
}

function renderError(error, status = 'Operation failed') {
  els.sourceStatus.textContent = status;
  els.detail.innerHTML = `<p class="error-state">${escapeHtml(error.message)}</p>`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll('`', '&#096;');
}

els.search.addEventListener('input', (event) => {
  state.query = event.target.value;
  ensureSelectedItem();
  renderItems();
  renderDetail();
});

els.sort.addEventListener('change', (event) => {
  state.sort = event.target.value;
  ensureSelectedItem();
  renderItems();
  renderDetail();
});

els.file.addEventListener('change', async (event) => {
  const [file] = event.target.files;
  if (!file) return;
  try {
    setLibrary(parseLibrary(await file.text()), file.name, {
      path: state.sourcePath || file.name,
      canPersist: Boolean(tauriInvoke),
    });
    scheduleSave();
  } catch (error) {
    renderError(error, 'YAML import failed');
  }
});

els.copyCitation.addEventListener('click', copyCitation);

document.querySelector('[data-collection="all"]').addEventListener('click', () => selectCollection('all'));

for (const button of document.querySelectorAll('[data-special]')) {
  button.addEventListener('click', () => selectSpecial(button.dataset.special));
}

els.detailTabs.addEventListener('click', (event) => {
  const button = event.target.closest('[data-tab]');
  if (!button) return;
  state.detailTab = button.dataset.tab;
  renderDetailTabs();
  renderDetail();
});

els.detail.addEventListener('input', (event) => {
  const field = event.target.dataset.field;
  if (!field) return;
  bindField(field, event.target.value);
});

els.detail.addEventListener('click', (event) => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const item = state.library.items.find((entry) => entry.id === state.selectedItemId);
  if (!item) return;

  if (button.dataset.action === 'normalize-doi') {
    item.doi = normalizeDoi(item.doi);
    item.url = item.url || doiUrl(item.doi);
    render();
    scheduleSave();
  }

  if (button.dataset.action === 'fetch-doi') {
    fetchDoiMetadata();
  }

  if (button.dataset.action === 'open-doi') {
    window.open(doiUrl(normalizeDoi(item.doi)), '_blank', 'noopener,noreferrer');
  }
});

loadDefaultLibrary();
