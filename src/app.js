const state = {
  library: { collections: [], items: [] },
  selectedCollection: 'all',
  selectedTag: null,
  selectedItemId: null,
  query: '',
  sort: 'year-desc',
};

const els = {
  allCount: document.querySelector('#all-count'),
  collections: document.querySelector('#collections'),
  tags: document.querySelector('#tags'),
  itemList: document.querySelector('#item-list'),
  detail: document.querySelector('#detail'),
  emptyState: document.querySelector('#empty-state'),
  search: document.querySelector('#search'),
  sort: document.querySelector('#sort'),
  file: document.querySelector('#yaml-file'),
  copyCitation: document.querySelector('#copy-citation'),
};

const collator = new Intl.Collator('en', { sensitivity: 'base' });

async function loadDefaultLibrary() {
  try {
    const response = await fetch('./data/library.yaml');
    if (!response.ok) throw new Error(`Failed to load YAML: ${response.status}`);
    const yamlText = await response.text();
    setLibrary(parseLibrary(yamlText));
  } catch (error) {
    renderError(error);
  }
}

function parseLibrary(yamlText) {
  const parsed = window.jsyaml.load(yamlText);
  const root = parsed?.library ?? parsed;
  if (!root || !Array.isArray(root.items)) {
    throw new Error('YAML must contain a library.items array.');
  }

  return {
    collections: Array.isArray(root.collections) ? root.collections : [],
    items: root.items.map(normalizeItem),
  };
}

function normalizeItem(item, index) {
  return {
    id: String(item.id ?? `item-${index + 1}`),
    type: item.type ?? 'reference',
    title: item.title ?? 'Untitled',
    authors: toArray(item.authors),
    year: item.year ?? '',
    venue: item.venue ?? '',
    collection: item.collection ?? '',
    tags: toArray(item.tags),
    abstract: item.abstract ?? '',
    doi: item.doi ?? '',
    url: item.url ?? '',
    notes: toArray(item.notes),
    attachments: Array.isArray(item.attachments) ? item.attachments : [],
  };
}

function toArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  return [];
}

function setLibrary(library) {
  state.library = library;
  state.selectedCollection = 'all';
  state.selectedTag = null;
  state.selectedItemId = library.items[0]?.id ?? null;
  render();
}

function render() {
  renderCollections();
  renderTags();
  renderItems();
  renderDetail();
}

function renderCollections() {
  els.allCount.textContent = state.library.items.length;
  document
    .querySelector('[data-collection="all"]')
    .classList.toggle('is-active', state.selectedCollection === 'all');

  els.collections.innerHTML = '';
  for (const collection of state.library.collections) {
    const count = state.library.items.filter((item) => item.collection === collection.id).length;
    const button = document.createElement('button');
    button.className = 'nav-item';
    button.type = 'button';
    button.dataset.collection = collection.id;
    button.classList.toggle('is-active', state.selectedCollection === collection.id);
    button.innerHTML = `<span>${escapeHtml(collection.name)}</span><span>${count}</span>`;
    button.addEventListener('click', () => {
      state.selectedCollection = collection.id;
      state.selectedTag = null;
      ensureSelectedItem();
      render();
    });
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
      <div class="reference-title">
        <span>${escapeHtml(item.title)}</span>
        <span>${escapeHtml(String(item.year))}</span>
      </div>
      <div class="reference-meta">${escapeHtml(formatAuthors(item.authors))}${item.venue ? ` · ${escapeHtml(item.venue)}` : ''}</div>
      <div class="reference-tags">${item.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join('')}</div>
    `;
    button.addEventListener('click', () => {
      state.selectedItemId = item.id;
      renderItems();
      renderDetail();
    });
    els.itemList.append(button);
  }
}

function renderDetail() {
  const item = state.library.items.find((entry) => entry.id === state.selectedItemId);
  if (!item) {
    els.detail.innerHTML = '<p class="empty-state">Select a reference to view details.</p>';
    return;
  }

  els.detail.innerHTML = `
    <span class="detail-type">${escapeHtml(item.type)}</span>
    <h2>${escapeHtml(item.title)}</h2>
    <div class="detail-meta">
      ${escapeHtml(formatAuthors(item.authors))}<br />
      ${escapeHtml([item.venue, item.year].filter(Boolean).join(', '))}
      ${item.doi ? `<br />DOI: ${escapeHtml(item.doi)}` : ''}
      ${item.url ? `<br /><a href="${escapeAttr(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(item.url)}</a>` : ''}
    </div>
    ${renderSection('Abstract', item.abstract ? `<p>${escapeHtml(item.abstract)}</p>` : '')}
    ${renderSection('Tags', item.tags.length ? `<p>${item.tags.map(escapeHtml).join(', ')}</p>` : '')}
    ${renderSection('Notes', item.notes.length ? `<ul>${item.notes.map((note) => `<li>${escapeHtml(note)}</li>`).join('')}</ul>` : '')}
    ${renderSection('Attachments', renderAttachments(item.attachments))}
  `;
}

function renderSection(title, body) {
  if (!body) return '';
  return `<section class="detail-section"><h3>${title}</h3>${body}</section>`;
}

function renderAttachments(attachments) {
  if (!attachments.length) return '';
  const links = attachments
    .map((attachment) => {
      const label = attachment.label ?? attachment.url ?? 'Attachment';
      const url = attachment.url ?? '#';
      return `<li><a href="${escapeAttr(url)}" target="_blank" rel="noreferrer">${escapeHtml(label)}</a></li>`;
    })
    .join('');
  return `<ul class="attachment-list">${links}</ul>`;
}

function getVisibleItems() {
  const query = state.query.trim().toLowerCase();
  return state.library.items
    .filter((item) => state.selectedCollection === 'all' || item.collection === state.selectedCollection)
    .filter((item) => !state.selectedTag || item.tags.includes(state.selectedTag))
    .filter((item) => {
      if (!query) return true;
      const haystack = [item.title, item.venue, item.year, ...item.authors, ...item.tags]
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    })
    .sort(sortItems);
}

function sortItems(a, b) {
  if (state.sort === 'year-asc') return Number(a.year || 0) - Number(b.year || 0);
  if (state.sort === 'title-asc') return collator.compare(a.title, b.title);
  if (state.sort === 'author-asc') return collator.compare(a.authors[0] ?? '', b.authors[0] ?? '');
  return Number(b.year || 0) - Number(a.year || 0);
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
  const citation = `${formatAuthors(item.authors)} (${item.year}). ${item.title}. ${item.venue}.`
    .replace(/\s+\./g, '.')
    .trim();
  navigator.clipboard?.writeText(citation);
}

function renderError(error) {
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
  renderItems();
});

els.file.addEventListener('change', async (event) => {
  const [file] = event.target.files;
  if (!file) return;
  try {
    setLibrary(parseLibrary(await file.text()));
  } catch (error) {
    renderError(error);
  }
});

els.copyCitation.addEventListener('click', copyCitation);

document.querySelector('[data-collection="all"]').addEventListener('click', () => {
  state.selectedCollection = 'all';
  state.selectedTag = null;
  ensureSelectedItem();
  render();
});

loadDefaultLibrary();
