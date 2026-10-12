/**
 * ShareText - Client Application Logic
 */

// Application State
const state = {
  cards: [],
  currentShare: null,
  activeTab: 'view-create',
  theme: localStorage.getItem('sharetext_theme') || 'dark',
  history: JSON.parse(localStorage.getItem('sharetext_history') || '[]')
};

// DOM Element References
const elements = {
  body: document.body,
  themeToggle: document.getElementById('btn-theme-toggle'),
  tabs: document.querySelectorAll('.nav-tab'),
  views: document.querySelectorAll('.app-view'),
  historyCounter: document.getElementById('history-counter'),

  // Create View
  inputCollectionTitle: document.getElementById('input-collection-title'),
  selectExpiry: document.getElementById('select-expiry'),
  inputCustomPin: document.getElementById('input-custom-pin'),
  cardsContainer: document.getElementById('cards-container'),
  activeCardCount: document.getElementById('active-card-count'),
  btnAddCard: document.getElementById('btn-add-card'),
  btnPasteClipboard: document.getElementById('btn-paste-clipboard'),
  btnClearAll: document.getElementById('btn-clear-all'),
  btnPublish: document.getElementById('btn-publish'),

  // PIN View
  pinDigitBoxes: document.querySelectorAll('.pin-digit-box'),
  btnPastePin: document.getElementById('btn-paste-pin'),
  btnSubmitPin: document.getElementById('btn-submit-pin'),
  quickRecentsList: document.getElementById('quick-recents-list'),
  recentsChipsContainer: document.getElementById('recents-chips-container'),

  // Board View
  boardPinVal: document.getElementById('board-pin-val'),
  boardPinBadge: document.getElementById('board-pin-badge'),
  boardCardsBadge: document.getElementById('board-cards-badge'),
  boardCreatedBadge: document.getElementById('board-created-badge'),
  boardExpiryBadge: document.getElementById('board-expiry-badge'),
  boardViewsBadge: document.getElementById('board-views-badge'),
  boardCollectionTitle: document.getElementById('board-collection-title'),
  boardGridCards: document.getElementById('board-grid-cards'),
  btnCopyAll: document.getElementById('btn-copy-all'),
  btnDownloadAllTxt: document.getElementById('btn-download-all-txt'),
  btnDownloadAllMd: document.getElementById('btn-download-all-md'),
  btnShowShareQr: document.getElementById('btn-show-share-qr'),
  btnNewCollection: document.getElementById('btn-new-collection'),

  // Modals
  modalSuccess: document.getElementById('modal-success'),
  btnCloseSuccess: document.getElementById('btn-close-success'),
  modalPinNumber: document.getElementById('modal-pin-number'),
  btnModalCopyPin: document.getElementById('btn-modal-copy-pin'),
  copyPinText: document.getElementById('copy-pin-text'),
  modalQrImage: document.getElementById('modal-qr-image'),
  modalShareLink: document.getElementById('modal-share-link'),
  btnModalCopyLink: document.getElementById('btn-modal-copy-link'),
  btnModalViewNow: document.getElementById('btn-modal-view-now'),

  modalHistory: document.getElementById('modal-history'),
  btnCloseHistory: document.getElementById('btn-close-history'),
  historyItemsContainer: document.getElementById('history-items-container'),
  btnClearHistory: document.getElementById('btn-clear-history'),

  modalFocus: document.getElementById('modal-focus'),
  btnCloseFocus: document.getElementById('btn-close-focus'),
  focusCardType: document.getElementById('focus-card-type'),
  focusCardTitle: document.getElementById('focus-card-title'),
  focusCardStats: document.getElementById('focus-card-stats'),
  focusContentPre: document.getElementById('focus-content-pre'),
  btnFocusCopy: document.getElementById('btn-focus-copy'),
  focusCopyLabel: document.getElementById('focus-copy-label'),
  btnFocusDownload: document.getElementById('btn-focus-download'),

  toastContainer: document.getElementById('toast-container'),
  footerNewLink: document.getElementById('footer-new-link'),
  footerPinLink: document.getElementById('footer-pin-link'),
  brandLogo: document.getElementById('brand-logo')
};

// -----------------------------------------------------------------------------
// Toast Notification Utility
// -----------------------------------------------------------------------------
function showToast(message, type = 'info', duration = 3000) {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  let iconSvg = '';
  if (type === 'success') {
    iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`;
  } else if (type === 'error') {
    iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`;
  } else {
    iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;
  }

  toast.innerHTML = `
    ${iconSvg}
    <span>${escapeHtml(message)}</span>
  `;

  elements.toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// -----------------------------------------------------------------------------
// Theme Management
// -----------------------------------------------------------------------------
function applyTheme(theme) {
  state.theme = theme;
  localStorage.setItem('sharetext_theme', theme);
  if (theme === 'light') {
    elements.body.classList.add('light-theme');
    elements.body.classList.remove('dark-theme');
  } else {
    elements.body.classList.remove('light-theme');
    elements.body.classList.add('dark-theme');
  }
}

elements.themeToggle.addEventListener('click', () => {
  const newTheme = state.theme === 'light' ? 'dark' : 'light';
  applyTheme(newTheme);
});

// -----------------------------------------------------------------------------
// Tab & View Switching
// -----------------------------------------------------------------------------
function switchTab(viewId) {
  // If target is modal-history, open modal instead of hiding main views
  if (viewId === 'modal-history') {
    openHistoryModal();
    return;
  }

  state.activeTab = viewId;

  elements.tabs.forEach(tab => {
    if (tab.getAttribute('data-target') === viewId) {
      tab.classList.add('active');
    } else {
      tab.classList.remove('active');
    }
  });

  elements.views.forEach(view => {
    if (view.id === viewId) {
      view.classList.add('active');
    } else {
      view.classList.remove('active');
    }
  });

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

elements.tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    const target = tab.getAttribute('data-target');
    switchTab(target);
  });
});

if (elements.footerNewLink) {
  elements.footerNewLink.addEventListener('click', () => switchTab('view-create'));
}
if (elements.footerPinLink) {
  elements.footerPinLink.addEventListener('click', () => switchTab('view-pin'));
}
if (elements.brandLogo) {
  elements.brandLogo.addEventListener('click', () => switchTab('view-create'));
}

// -----------------------------------------------------------------------------
// Card Editor Management (View Create)
// -----------------------------------------------------------------------------
let cardIdCounter = 1;

function createCardState(initialData = {}) {
  return {
    id: 'card-' + cardIdCounter++,
    title: initialData.title || '',
    content: initialData.content || '',
    language: initialData.language || 'plaintext',
    isMono: true
  };
}

function updateActiveCardCount() {
  const count = state.cards.length;
  elements.activeCardCount.textContent = `${count} Kartu`;
}

function renderEditorCard(card, index) {
  const cardEl = document.createElement('div');
  cardEl.className = 'editor-card';
  cardEl.id = card.id;

  cardEl.innerHTML = `
    <div class="card-topbar">
      <div class="card-topbar-left">
        <span class="card-index-pill">#${index + 1}</span>
        <input type="text" class="card-title-input" placeholder="Judul Teks / Keterangan (Opsional)" value="${escapeHtml(card.title)}">
      </div>
      <div class="card-topbar-right">
        <select class="lang-select">
          <option value="plaintext" ${card.language === 'plaintext' ? 'selected' : ''}>Teks Biasa</option>
          <option value="code" ${card.language === 'code' ? 'selected' : ''}>Kode Sumber</option>
          <option value="markdown" ${card.language === 'markdown' ? 'selected' : ''}>Markdown</option>
          <option value="json" ${card.language === 'json' ? 'selected' : ''}>JSON</option>
          <option value="sql" ${card.language === 'sql' ? 'selected' : ''}>SQL</option>
          <option value="env" ${card.language === 'env' ? 'selected' : ''}>ENV / Config</option>
        </select>
        <button type="button" class="card-action-icon-btn btn-duplicate" title="Duplikasi Kartu">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect width="13" height="13" x="9" y="9" rx="2" ry="2"/>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
          </svg>
        </button>
        <button type="button" class="card-action-icon-btn danger btn-delete" title="Hapus Kartu">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
          </svg>
        </button>
      </div>
    </div>
    <div class="card-body">
      <textarea class="card-textarea ${card.isMono ? '' : 'font-sans'}" placeholder="Tulis atau tempel teks di sini...">${escapeHtml(card.content)}</textarea>
    </div>
    <div class="card-bottom-bar">
      <div class="card-stats">
        <span class="stat-chars">0 karakter</span>
        <span>•</span>
        <span class="stat-words">0 kata</span>
        <span>•</span>
        <span class="stat-lines">0 baris</span>
      </div>
      <button type="button" class="font-switch-btn">${card.isMono ? 'Ganti Font: Sans' : 'Ganti Font: Monospace'}</button>
    </div>
  `;

  // Event Listeners for this card
  const titleInput = cardEl.querySelector('.card-title-input');
  const langSelect = cardEl.querySelector('.lang-select');
  const textarea = cardEl.querySelector('.card-textarea');
  const btnDuplicate = cardEl.querySelector('.btn-duplicate');
  const btnDelete = cardEl.querySelector('.btn-delete');
  const fontSwitchBtn = cardEl.querySelector('.font-switch-btn');
  const statChars = cardEl.querySelector('.stat-chars');
  const statWords = cardEl.querySelector('.stat-words');
  const statLines = cardEl.querySelector('.stat-lines');

  function updateStats() {
    const text = textarea.value;
    const chars = text.length;
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    const lines = text ? text.split('\n').length : 0;

    statChars.textContent = `${chars} karakter`;
    statWords.textContent = `${words} kata`;
    statLines.textContent = `${lines} baris`;
    card.content = text;
  }

  titleInput.addEventListener('input', () => {
    card.title = titleInput.value;
  });

  langSelect.addEventListener('change', () => {
    card.language = langSelect.value;
  });

  textarea.addEventListener('input', () => {
    updateStats();
    autoResizeTextarea(textarea);
  });

  fontSwitchBtn.addEventListener('click', () => {
    card.isMono = !card.isMono;
    if (card.isMono) {
      textarea.classList.remove('font-sans');
      fontSwitchBtn.textContent = 'Ganti Font: Sans';
    } else {
      textarea.classList.add('font-sans');
      fontSwitchBtn.textContent = 'Ganti Font: Monospace';
    }
  });

  btnDuplicate.addEventListener('click', () => {
    const newCard = createCardState({
      title: card.title ? `${card.title} (Salinan)` : '',
      content: card.content,
      language: card.language
    });
    const currIndex = state.cards.findIndex(c => c.id === card.id);
    state.cards.splice(currIndex + 1, 0, newCard);
    renderAllEditorCards();
    showToast('Kartu berhasil diduplikasi', 'info');
  });

  btnDelete.addEventListener('click', () => {
    if (state.cards.length <= 1) {
      showToast('Minimal harus ada 1 kartu teks.', 'error');
      return;
    }
    state.cards = state.cards.filter(c => c.id !== card.id);
    renderAllEditorCards();
    showToast('Kartu dihapus', 'info');
  });

  updateStats();
  return cardEl;
}

function autoResizeTextarea(textarea) {
  textarea.style.height = 'auto';
  textarea.style.height = Math.min(Math.max(textarea.scrollHeight, 160), 500) + 'px';
}

function renderAllEditorCards() {
  elements.cardsContainer.innerHTML = '';
  state.cards.forEach((card, idx) => {
    const el = renderEditorCard(card, idx);
    elements.cardsContainer.appendChild(el);
  });
  updateActiveCardCount();
}

function addNewCard(initialData = {}, focus = false) {
  const newCard = createCardState(initialData);
  state.cards.push(newCard);
  renderAllEditorCards();

  if (focus) {
    const lastCardEl = elements.cardsContainer.lastElementChild;
    if (lastCardEl) {
      const textarea = lastCardEl.querySelector('.card-textarea');
      if (textarea) textarea.focus();
    }
  }
}

elements.btnAddCard.addEventListener('click', () => {
  addNewCard({}, true);
  window.scrollTo({
    top: elements.btnAddCard.offsetTop - 200,
    behavior: 'smooth'
  });
});

// Paste from Clipboard to card
elements.btnPasteClipboard.addEventListener('click', async () => {
  try {
    const text = await navigator.clipboard.readText();
    if (!text || !text.trim()) {
      showToast('Clipboard kosong atau tidak berisi teks.', 'info');
      return;
    }
    addNewCard({
      title: `Teks Tempelan #${state.cards.length + 1}`,
      content: text
    }, true);
    showToast('Teks dari clipboard berhasil ditambahkan ke kartu baru!', 'success');
  } catch (err) {
    showToast('Tidak dapat mengakses clipboard. Izinkan akses clipboard peramban.', 'error');
  }
});

// Clear All Cards
elements.btnClearAll.addEventListener('click', () => {
  if (confirm('Apakah Anda yakin ingin mengosongkan semua kartu teks?')) {
    state.cards = [];
    elements.inputCollectionTitle.value = '';
    elements.inputCustomPin.value = '';
    addNewCard();
    showToast('Formulir berhasil direset.', 'info');
  }
});

// -----------------------------------------------------------------------------
// Publish Flow & API Integration
// -----------------------------------------------------------------------------
elements.btnPublish.addEventListener('click', async () => {
  const title = elements.inputCollectionTitle.value.trim();
  const expiryHours = Number(elements.selectExpiry.value);
  const customPin = elements.inputCustomPin.value.trim().toUpperCase();

  // Validate cards
  const validCards = state.cards.filter(c => c && (c.content.trim() || c.title.trim()));
  if (validCards.length === 0) {
    showToast('Harap isi setidaknya satu kartu teks sebelum menerbitkan.', 'error');
    return;
  }

  // Set loading UI
  const btnLabel = elements.btnPublish.querySelector('.btn-label');
  const btnLoader = elements.btnPublish.querySelector('.btn-loader');
  elements.btnPublish.disabled = true;
  btnLabel.style.display = 'none';
  btnLoader.style.display = 'inline-flex';

  try {
    const response = await fetch('/api/shares', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: title || 'Koleksi Teks',
        expiryHours,
        pinCode: customPin || undefined,
        cards: state.cards.map((c, i) => ({
          title: c.title.trim() || `Teks #${i + 1}`,
          content: c.content,
          language: c.language
        }))
      })
    });

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.message || 'Gagal membuat sesi');
    }

    const data = result.data;

    // Save to Local Storage History
    addToHistory({
      pin: data.pin,
      title: data.title,
      cardCount: data.cardCount,
      createdAt: data.createdAt,
      expiresAt: data.expiresAt,
      shareUrl: data.shareUrl
    });

    // Show Success Modal
    openSuccessModal(data);
    showToast('Teks berhasil diterbitkan!', 'success');

  } catch (err) {
    showToast(err.message || 'Terjadi kesalahan sistem.', 'error');
  } finally {
    elements.btnPublish.disabled = false;
    btnLabel.style.display = 'inline-flex';
    btnLoader.style.display = 'none';
  }
});

// Success Modal Logic
function openSuccessModal(data) {
  elements.modalPinNumber.textContent = formatPinDisplay(data.pin);
  elements.modalShareLink.value = data.shareUrl;
  elements.modalQrImage.src = data.qrCode;

  elements.copyPinText.textContent = 'Salin PIN';
  elements.modalSuccess.classList.add('active');

  elements.btnModalViewNow.onclick = () => {
    elements.modalSuccess.classList.remove('active');
    loadShareByPin(data.pin);
  };
}

elements.btnCloseSuccess.addEventListener('click', () => {
  elements.modalSuccess.classList.remove('active');
});

elements.btnModalCopyPin.addEventListener('click', async () => {
  const rawPin = elements.modalPinNumber.textContent.replace(/\s+/g, '');
  try {
    await navigator.clipboard.writeText(rawPin);
    elements.copyPinText.textContent = 'Tersalin! ✅';
    showToast(`PIN ${rawPin} disalin ke clipboard!`, 'success');
    setTimeout(() => {
      elements.copyPinText.textContent = 'Salin PIN';
    }, 2500);
  } catch (err) {
    showToast('Gagal menyalin PIN', 'error');
  }
});

elements.btnModalCopyLink.addEventListener('click', async () => {
  const link = elements.modalShareLink.value;
  try {
    await navigator.clipboard.writeText(link);
    showToast('Tautan langsung berhasil disalin!', 'success');
  } catch (err) {
    showToast('Gagal menyalin tautan', 'error');
  }
});

function formatPinDisplay(pin) {
  if (!pin) return '';
  if (pin.length === 6) {
    return `${pin.slice(0, 3)} ${pin.slice(3)}`;
  }
  return pin;
}

// -----------------------------------------------------------------------------
// PIN Input Lookup View
// -----------------------------------------------------------------------------
elements.pinDigitBoxes.forEach((box, idx) => {
  box.addEventListener('input', (e) => {
    const val = box.value.toUpperCase();
    box.value = val;

    if (val && idx < elements.pinDigitBoxes.length - 1) {
      elements.pinDigitBoxes[idx + 1].focus();
    }

    checkAutoSubmitPin();
  });

  box.addEventListener('keydown', (e) => {
    if (e.key === 'Backspace' && !box.value && idx > 0) {
      elements.pinDigitBoxes[idx - 1].focus();
    } else if (e.key === 'Enter') {
      submitPinForm();
    }
  });

  box.addEventListener('paste', (e) => {
    e.preventDefault();
    const pasteData = (e.clipboardData || window.clipboardData).getData('text');
    handlePastedPin(pasteData);
  });
});

function handlePastedPin(rawText) {
  if (!rawText) return;
  const cleaned = rawText.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  for (let i = 0; i < elements.pinDigitBoxes.length; i++) {
    elements.pinDigitBoxes[i].value = cleaned[i] || '';
  }
  const nextEmpty = [...elements.pinDigitBoxes].find(b => !b.value);
  if (nextEmpty) {
    nextEmpty.focus();
  } else {
    elements.pinDigitBoxes[elements.pinDigitBoxes.length - 1].focus();
    submitPinForm();
  }
}

elements.btnPastePin.addEventListener('click', async () => {
  try {
    const text = await navigator.clipboard.readText();
    handlePastedPin(text);
  } catch (err) {
    showToast('Tidak dapat membaca clipboard.', 'error');
  }
});

function getEnteredPin() {
  let pin = '';
  elements.pinDigitBoxes.forEach(b => {
    pin += b.value.trim().toUpperCase();
  });
  return pin;
}

function checkAutoSubmitPin() {
  const pin = getEnteredPin();
  if (pin.length === elements.pinDigitBoxes.length) {
    submitPinForm();
  }
}

function submitPinForm() {
  const pin = getEnteredPin();
  if (pin.length < 4) {
    showToast('Masukkan minimal 4 karakter PIN', 'error');
    return;
  }
  loadShareByPin(pin);
}

elements.btnSubmitPin.addEventListener('click', submitPinForm);

// -----------------------------------------------------------------------------
// Load Share By PIN (Viewer / Board)
// -----------------------------------------------------------------------------
async function loadShareByPin(pin) {
  const cleanPin = pin.trim().toUpperCase();
  if (!cleanPin) return;

  // Visual Loading
  const btnLabel = elements.btnSubmitPin.querySelector('.btn-label');
  const btnLoader = elements.btnSubmitPin.querySelector('.btn-loader');
  if (btnLabel && btnLoader) {
    elements.btnSubmitPin.disabled = true;
    btnLabel.style.display = 'none';
    btnLoader.style.display = 'inline-flex';
  }

  try {
    const res = await fetch(`/api/shares/${encodeURIComponent(cleanPin)}`);
    const result = await res.json();

    if (!result.success) {
      throw new Error(result.message || 'Teks tidak ditemukan atau sudah kedaluwarsa.');
    }

    state.currentShare = result.data;
    renderBoardView(result.data);

    // Save to history as recently viewed
    addToHistory({
      pin: result.data.pin,
      title: result.data.title,
      cardCount: result.data.cards.length,
      createdAt: result.data.createdAt,
      expiresAt: result.data.expiresAt,
      shareUrl: result.data.shareUrl
    });

    // Update URL hash/query without reload
    const url = new URL(window.location);
    url.searchParams.set('pin', cleanPin);
    window.history.pushState({}, '', url);

    switchTab('view-board');
    showToast('Berhasil memuat koleksi teks!', 'success');

  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    if (btnLabel && btnLoader) {
      elements.btnSubmitPin.disabled = false;
      btnLabel.style.display = 'inline-flex';
      btnLoader.style.display = 'none';
    }
  }
}

// -----------------------------------------------------------------------------
// Board Viewer Rendering
// -----------------------------------------------------------------------------
function renderBoardView(shareData) {
  elements.boardPinVal.textContent = formatPinDisplay(shareData.pin);
  elements.boardCollectionTitle.textContent = shareData.title || 'Koleksi Teks';

  elements.boardCardsBadge.textContent = `${shareData.cards.length} Kartu Teks`;
  elements.boardCreatedBadge.textContent = `Dibuat: ${formatRelativeTime(shareData.createdAt)}`;
  elements.boardViewsBadge.textContent = `${shareData.viewsCount}x Dilihat`;

  if (shareData.expiresAt > 0) {
    const remainingMs = shareData.expiresAt - Date.now();
    if (remainingMs > 0) {
      elements.boardExpiryBadge.textContent = `Aktif s/d: ${new Date(shareData.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}, ${new Date(shareData.expiresAt).toLocaleDateString()}`;
    } else {
      elements.boardExpiryBadge.textContent = 'Kedaluwarsa';
    }
  } else {
    elements.boardExpiryBadge.textContent = 'Permanen (Tidak Kedaluwarsa)';
  }

  // Click on PIN badge to copy
  elements.boardPinBadge.onclick = async () => {
    try {
      await navigator.clipboard.writeText(shareData.pin);
      showToast(`PIN ${shareData.pin} berhasil disalin!`, 'success');
    } catch {
      showToast('Gagal menyalin PIN', 'error');
    }
  };

  // Render cards
  elements.boardGridCards.innerHTML = '';
  shareData.cards.forEach((card, idx) => {
    const cardEl = renderDisplayCard(card, idx);
    elements.boardGridCards.appendChild(cardEl);
  });
}

function renderDisplayCard(card, index) {
  const cardEl = document.createElement('div');
  cardEl.className = 'display-card';

  const chars = card.content ? card.content.length : 0;
  const words = card.content ? card.content.trim().split(/\s+/).filter(Boolean).length : 0;
  const lines = card.content ? card.content.split('\n').length : 0;

  cardEl.innerHTML = `
    <div class="display-card-header">
      <div class="display-card-title-group">
        <h3 class="display-card-title" title="${escapeHtml(card.title)}">${escapeHtml(card.title || `Teks #${index + 1}`)}</h3>
        <span class="display-card-meta">${words} kata • ${chars} karakter • ${lines} baris</span>
      </div>
      <div class="display-card-tools">
        <span class="badge-tag">${card.language || 'Plain'}</span>
      </div>
    </div>
    <div class="display-card-body">
      <pre class="text-viewer-pre">${escapeHtml(card.content)}</pre>
    </div>
    <div class="display-card-footer">
      <button type="button" class="btn-card-copy" title="Salin isi teks kartu ini">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect width="14" height="14" x="8" y="8" rx="2" ry="2"/>
          <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
        </svg>
        <span class="copy-text-label">Salin</span>
      </button>
      <div style="display: flex; gap: 0.4rem;">
        <button type="button" class="btn-subtle btn-card-download" title="Unduh file teks (.txt)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
        </button>
        <button type="button" class="btn-subtle btn-card-focus" title="Layar Penuh / Tampilan Fokus">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="15 3 21 3 21 9"/>
            <polyline points="9 21 3 21 3 15"/>
            <line x1="21" y1="3" x2="14" y2="10"/>
            <line x1="3" y1="21" x2="10" y2="14"/>
          </svg>
        </button>
      </div>
    </div>
  `;

  // Card Event Listeners
  const btnCopy = cardEl.querySelector('.btn-card-copy');
  const copyLabel = cardEl.querySelector('.copy-text-label');
  const btnDownload = cardEl.querySelector('.btn-card-download');
  const btnFocus = cardEl.querySelector('.btn-card-focus');

  btnCopy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(card.content);
      btnCopy.classList.add('copied');
      copyLabel.textContent = 'Disalin! ✅';
      showToast(`Teks "${card.title || 'Teks #' + (index + 1)}" disalin!`, 'success');
      setTimeout(() => {
        btnCopy.classList.remove('copied');
        copyLabel.textContent = 'Salin';
      }, 2000);
    } catch {
      showToast('Gagal menyalin teks', 'error');
    }
  });

  btnDownload.addEventListener('click', () => {
    const filename = `${sanitizeFilename(card.title || `teks-${index + 1}`)}.txt`;
    downloadStringAsFile(card.content, filename, 'text/plain;charset=utf-8');
    showToast(`Mengunduh ${filename}`, 'info');
  });

  btnFocus.addEventListener('click', () => {
    openFocusModal(card);
  });

  return cardEl;
}

// -----------------------------------------------------------------------------
// Master Board Actions (Copy All, Download TXT/MD, Share QR, New Collection)
// -----------------------------------------------------------------------------
elements.btnCopyAll.addEventListener('click', async () => {
  if (!state.currentShare || !state.currentShare.cards.length) return;

  const combined = state.currentShare.cards.map((c, i) => {
    const header = `=== ${c.title || `Teks #${i + 1}`} ===`;
    return `${header}\n${c.content}\n`;
  }).join('\n----------------------------------------\n\n');

  try {
    await navigator.clipboard.writeText(combined);
    showToast('Semua kartu teks berhasil disalin ke clipboard!', 'success');
  } catch {
    showToast('Gagal menyalin semua teks', 'error');
  }
});

elements.btnDownloadAllTxt.addEventListener('click', () => {
  if (!state.currentShare) return;

  const combined = [
    `KOLEKSI TEKS: ${state.currentShare.title}`,
    `KODE PIN: ${state.currentShare.pin}`,
    `DIBUAT: ${new Date(state.currentShare.createdAt).toLocaleString()}`,
    `JUMLAH KARTU: ${state.currentShare.cards.length}`,
    '='.repeat(50),
    '',
    ...state.currentShare.cards.map((c, i) => (
      `[#${i + 1}] ${c.title || `Teks #${i + 1}`} (${c.language || 'plaintext'})\n` +
      '-'.repeat(40) + '\n' +
      c.content + '\n'
    ))
  ].join('\n');

  const filename = `${sanitizeFilename(state.currentShare.title || 'koleksi-teks')}.txt`;
  downloadStringAsFile(combined, filename, 'text/plain;charset=utf-8');
  showToast(`Mengunduh ${filename}`, 'info');
});

elements.btnDownloadAllMd.addEventListener('click', () => {
  if (!state.currentShare) return;

  const mdLines = [
    `# ${state.currentShare.title}`,
    `> **PIN:** \`${state.currentShare.pin}\`  `,
    `> **Dibuat:** ${new Date(state.currentShare.createdAt).toLocaleString()}  `,
    `> **Jumlah Teks:** ${state.currentShare.cards.length} kartu  `,
    '',
    '---',
    ''
  ];

  state.currentShare.cards.forEach((c, i) => {
    mdLines.push(`## ${i + 1}. ${c.title || `Teks #${i + 1}`}`);
    const langCode = c.language === 'code' ? 'text' : (c.language || '');
    mdLines.push(`\`\`\`${langCode}`);
    mdLines.push(c.content);
    mdLines.push('```\n');
  });

  const filename = `${sanitizeFilename(state.currentShare.title || 'koleksi-teks')}.md`;
  downloadStringAsFile(mdLines.join('\n'), filename, 'text/markdown;charset=utf-8');
  showToast(`Mengunduh ${filename}`, 'info');
});

elements.btnShowShareQr.addEventListener('click', () => {
  if (!state.currentShare) return;
  openSuccessModal(state.currentShare);
});

elements.btnNewCollection.addEventListener('click', () => {
  switchTab('view-create');
});

// -----------------------------------------------------------------------------
// Focus / Fullscreen Modal Logic
// -----------------------------------------------------------------------------
let currentFocusCard = null;

function openFocusModal(card) {
  currentFocusCard = card;
  elements.focusCardTitle.textContent = card.title || 'Teks Kartu';
  elements.focusCardType.textContent = card.language || 'Plain';
  
  const chars = card.content ? card.content.length : 0;
  const words = card.content ? card.content.trim().split(/\s+/).filter(Boolean).length : 0;
  elements.focusCardStats.textContent = `${words} kata • ${chars} karakter`;
  elements.focusContentPre.textContent = card.content;
  elements.focusCopyLabel.textContent = 'Salin Teks';

  elements.modalFocus.classList.add('active');
}

elements.btnCloseFocus.addEventListener('click', () => {
  elements.modalFocus.classList.remove('active');
});

elements.btnFocusCopy.addEventListener('click', async () => {
  if (!currentFocusCard) return;
  try {
    await navigator.clipboard.writeText(currentFocusCard.content);
    elements.focusCopyLabel.textContent = 'Disalin! ✅';
    showToast('Teks disalin ke clipboard!', 'success');
    setTimeout(() => {
      elements.focusCopyLabel.textContent = 'Salin Teks';
    }, 2000);
  } catch {
    showToast('Gagal menyalin teks', 'error');
  }
});

elements.btnFocusDownload.addEventListener('click', () => {
  if (!currentFocusCard) return;
  const filename = `${sanitizeFilename(currentFocusCard.title || 'teks')}.txt`;
  downloadStringAsFile(currentFocusCard.content, filename, 'text/plain;charset=utf-8');
  showToast(`Mengunduh ${filename}`, 'info');
});

// -----------------------------------------------------------------------------
// Local Storage History Management
// -----------------------------------------------------------------------------
function addToHistory(item) {
  // Remove duplicate by pin
  state.history = state.history.filter(h => h.pin !== item.pin);
  state.history.unshift(item);
  if (state.history.length > 30) state.history.pop();

  localStorage.setItem('sharetext_history', JSON.stringify(state.history));
  updateHistoryBadge();
  renderHistoryChips();
}

function updateHistoryBadge() {
  elements.historyCounter.textContent = state.history.length;
}

function openHistoryModal() {
  renderHistoryList();
  elements.modalHistory.classList.add('active');
}

elements.btnCloseHistory.addEventListener('click', () => {
  elements.modalHistory.classList.remove('active');
});

function renderHistoryList() {
  elements.historyItemsContainer.innerHTML = '';

  if (state.history.length === 0) {
    elements.historyItemsContainer.innerHTML = `
      <div class="history-empty-placeholder">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin-bottom: 0.5rem; opacity: 0.4;">
          <circle cx="12" cy="12" r="10"/>
          <polyline points="12 6 12 12 16 14"/>
        </svg>
        <p>Belum ada riwayat sesi yang dibuat di peramban ini.</p>
      </div>
    `;
    return;
  }

  state.history.forEach(item => {
    const itemEl = document.createElement('div');
    itemEl.className = 'history-item';
    itemEl.innerHTML = `
      <div class="history-item-left">
        <span class="history-pin">${formatPinDisplay(item.pin)}</span>
        <div class="history-details">
          <span class="history-item-title">${escapeHtml(item.title || 'Koleksi Teks')}</span>
          <span class="history-item-date">${item.cardCount || 1} kartu • ${formatRelativeTime(item.createdAt)}</span>
        </div>
      </div>
      <div class="history-item-actions">
        <button type="button" class="btn-action primary btn-history-open" title="Buka Sesi">
          <span>Buka</span>
        </button>
        <button type="button" class="btn-subtle btn-history-del" title="Hapus dari Riwayat">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
    `;

    itemEl.querySelector('.btn-history-open').addEventListener('click', () => {
      elements.modalHistory.classList.remove('active');
      loadShareByPin(item.pin);
    });

    itemEl.querySelector('.btn-history-del').addEventListener('click', () => {
      state.history = state.history.filter(h => h.pin !== item.pin);
      localStorage.setItem('sharetext_history', JSON.stringify(state.history));
      updateHistoryBadge();
      renderHistoryList();
      renderHistoryChips();
      showToast('Item riwayat dihapus.', 'info');
    });

    elements.historyItemsContainer.appendChild(itemEl);
  });
}

function renderHistoryChips() {
  if (state.history.length === 0) {
    elements.quickRecentsList.style.display = 'none';
    return;
  }

  elements.quickRecentsList.style.display = 'block';
  elements.recentsChipsContainer.innerHTML = '';

  state.history.slice(0, 4).forEach(item => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip-btn';
    chip.innerHTML = `
      <span>PIN: ${item.pin}</span>
      <span style="opacity: 0.6;">(${escapeHtml(item.title ? (item.title.slice(0, 15) + (item.title.length > 15 ? '...' : '')) : 'Koleksi')})</span>
    `;
    chip.addEventListener('click', () => {
      loadShareByPin(item.pin);
    });
    elements.recentsChipsContainer.appendChild(chip);
  });
}

elements.btnClearHistory.addEventListener('click', () => {
  if (confirm('Hapus seluruh riwayat tersimpan di peramban ini?')) {
    state.history = [];
    localStorage.removeItem('sharetext_history');
    updateHistoryBadge();
    renderHistoryList();
    renderHistoryChips();
    showToast('Semua riwayat telah dihapus.', 'info');
  }
});

// Close modals when clicking outside card
[elements.modalSuccess, elements.modalHistory, elements.modalFocus].forEach(modal => {
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.classList.remove('active');
    }
  });
});

// Escape key to close any active modal
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    elements.modalSuccess.classList.remove('active');
    elements.modalHistory.classList.remove('active');
    elements.modalFocus.classList.remove('active');
  }
});

// -----------------------------------------------------------------------------
// Helper Utilities
// -----------------------------------------------------------------------------
function sanitizeFilename(name) {
  return name.replace(/[^a-z0-9_\-\. ]/gi, '_').trim().slice(0, 50) || 'file';
}

function downloadStringAsFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function formatRelativeTime(timestamp) {
  if (!timestamp) return '-';
  const now = Date.now();
  const diffSec = Math.floor((now - timestamp) / 1000);

  if (diffSec < 60) return 'Baru saja';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} menit yang lalu`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} jam yang lalu`;
  return new Date(timestamp).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
}

// -----------------------------------------------------------------------------
// Initialization
// -----------------------------------------------------------------------------
function initApp() {
  applyTheme(state.theme);
  updateHistoryBadge();
  renderHistoryChips();

  // Initial card in editor
  addNewCard();

  // Check URL query parameters for ?pin=XXXXXX
  const urlParams = new URLSearchParams(window.location.search);
  const pinParam = urlParams.get('pin');
  if (pinParam) {
    loadShareByPin(pinParam);
  }
}

// Run app
document.addEventListener('DOMContentLoaded', initApp);
