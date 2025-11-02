// Importar configuración (se debe cargar config.js antes que este archivo)
const API_BASE_URL = window.CONFIG?.API_BASE_URL || 'http://localhost:3000';

// Guardia de autenticación
let token = localStorage.getItem('accessToken');
let refreshToken = localStorage.getItem('refreshToken');

// If token is the string 'undefined' or null, treat as unauthenticated
if (!token || token === 'undefined') {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    window.location.href = 'index.html';
}

// --- Silent proactive refresh ---
let refreshTimeoutId = null;

function parseJwt(tokenStr) {
    try {
        const parts = tokenStr.split('.');
        if (parts.length < 2) return null;
        const payload = parts[1];
        const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
        return JSON.parse(decodeURIComponent(escape(json)));
    } catch (e) {
        try { return JSON.parse(atob(tokenStr.split('.')[1])); } catch (err) { return null; }
    }
}

function decodeDisplayName(name) {
    if (!name) return name;
    try {
        // If the string looks percent-encoded, decode it
        if (/%[0-9A-Fa-f]{2}/.test(name)) {
            try { name = decodeURIComponent(name); } catch (e) { /* ignore */ }
        }
        // Normalize unicode to NFC for consistent accent rendering
        if (typeof name.normalize === 'function') name = name.normalize('NFC');
        return name;
    } catch (err) {
        return name;
    }
}

function clearScheduledRefresh() {
    if (refreshTimeoutId) {
        clearTimeout(refreshTimeoutId);
        refreshTimeoutId = null;
    }
}

function logoutRedirect() {
    clearScheduledRefresh();
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    window.location.href = 'index.html';
}

async function doSilentRefresh() {
    const rToken = localStorage.getItem('refreshToken');
    if (!rToken) return logoutRedirect();
    try {
        const resp = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken: rToken })
        });
        if (!resp.ok) {
            return logoutRedirect();
        }
        const j = await resp.json();
        const newAccess = j?.session?.access_token || j?.access_token || null;
        const newRefresh = j?.session?.refresh_token || j?.refresh_token || null;
        if (newAccess) {
            localStorage.setItem('accessToken', newAccess);
            if (newRefresh) localStorage.setItem('refreshToken', newRefresh);
            token = newAccess;
            refreshToken = newRefresh;
            // Reschedule next refresh
            scheduleSilentRefresh();
        } else {
            logoutRedirect();
        }
    } catch (err) {
        console.error('Silent refresh failed:', err);
        logoutRedirect();
    }
}

function scheduleSilentRefresh() {
    clearScheduledRefresh();
    const t = localStorage.getItem('accessToken');
    if (!t) return;
    const payload = parseJwt(t);
    if (!payload || !payload.exp) return;
    const expMs = payload.exp * 1000;
    const now = Date.now();
    const timeToExpiry = expMs - now;
    // Refresh 60 seconds before expiry, minimum 5s from now
    let delay = timeToExpiry - 60000;
    if (delay < 5000) delay = 5000;
    // If token already expired or very close to expiry, refresh immediately
    if (timeToExpiry <= 2000) {
        doSilentRefresh();
        return;
    }
    refreshTimeoutId = setTimeout(() => {
        doSilentRefresh();
    }, delay);
    console.debug('Silent refresh scheduled in', delay, 'ms');
}

// Schedule initial refresh
try { scheduleSilentRefresh(); } catch (e) { console.warn('Could not schedule silent refresh', e); }

// Helper: unified fetch with automatic token refresh on 401
async function apiFetch(input, init = {}, retry = true) {
    const headers = (init.headers && typeof init.headers === 'object') ? {...init.headers} : {};
    const currentToken = localStorage.getItem('accessToken');
    if (currentToken) headers['Authorization'] = `Bearer ${currentToken}`;
    const opts = {...init, headers};

    let resp = await fetch(input, opts);
    if (resp.status === 401 && retry) {
        // Try refresh
        const rToken = localStorage.getItem('refreshToken');
        if (!rToken) {
            localStorage.removeItem('accessToken');
            localStorage.removeItem('refreshToken');
            window.location.href = 'index.html';
            throw new Error('No refresh token');
        }

        try {
            const refreshResp = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ refreshToken: rToken })
            });

            if (refreshResp.ok) {
                const j = await refreshResp.json();
                const newAccess = j?.session?.access_token || j?.access_token || null;
                const newRefresh = j?.session?.refresh_token || j?.refresh_token || null;
                if (newAccess) {
                    localStorage.setItem('accessToken', newAccess);
                    if (newRefresh) localStorage.setItem('refreshToken', newRefresh);
                    // schedule proactive refresh for the freshly obtained access token
                    try { scheduleSilentRefresh(); } catch (e) { /* ignore */ }
                    // retry original request once
                    headers['Authorization'] = `Bearer ${newAccess}`;
                    const retryOpts = {...init, headers};
                    resp = await fetch(input, retryOpts);
                    return resp;
                }
            }

            // Refresh failed: clear and redirect to login
            localStorage.removeItem('accessToken');
            localStorage.removeItem('refreshToken');
            window.location.href = 'index.html';
            throw new Error('Refresh failed');
        } catch (err) {
            console.error('Error refreshing token:', err);
            localStorage.removeItem('accessToken');
            localStorage.removeItem('refreshToken');
            window.location.href = 'index.html';
            throw err;
        }
    }

    return resp;
}

// Documents list: fetch and render user's documents
async function getDocumentPublicUrl(documentId) {
    try {
        const resp = await apiFetch(`${API_BASE_URL}/api/documents/${documentId}/url`, {
            method: 'GET'
        });
        if (!resp.ok) {
            if (resp.status === 401 || resp.status === 403) {
                localStorage.removeItem('accessToken');
                window.location.href = 'index.html';
                return null;
            }
            return null;
        }
        const j = await resp.json();
        return j.url || j.publicUrl || null;
    } catch (err) {
        console.error('Error fetching document URL:', err);
        return null;
    }
}

async function fetchDocuments() {
    const listEl = document.getElementById('documents-list');
    if (!listEl) return;
    listEl.innerHTML = '<div class="loading">Cargando documentos...</div>';

    try {
        // Read filters from UI
        const searchEl = document.getElementById('documents-search');
        const statusEl = document.getElementById('documents-status-filter');
        const sortEl = document.getElementById('documents-sort');
        const q = searchEl ? searchEl.value.trim() : '';
        const status = statusEl ? statusEl.value : '';
        const sort = sortEl ? sortEl.value : '';

        const params = new URLSearchParams();
        if (q) params.append('q', q);
        if (status) params.append('status', status);
        if (sort) params.append('sort', sort);

        const resp = await apiFetch(`${API_BASE_URL}/api/documents?${params.toString()}`, {
            method: 'GET'
        });
        if (!resp.ok) {
            // If unauthorized, clear token and redirect to login
            if (resp.status === 401 || resp.status === 403) {
                localStorage.removeItem('accessToken');
                window.location.href = 'index.html';
                return;
            }
            // Try to show server-provided message for diagnostics
            let body = '';
            try { body = await resp.text(); } catch (e) { /* ignore */ }
            listEl.innerHTML = `<div class="error">No se pudieron cargar los documentos. ${body ? 'Detalles: ' + body : ''}</div>`;
            return;
        }

        const data = await resp.json();

        // Client-side normalize status and apply filter because server-side filters may use different values
        let docs = Array.isArray(data) ? data.slice() : [];
        const statusFilter = status ? String(status).toLowerCase() : '';
        function getDisplayStatus(d) {
            const s = (d.status || '').toLowerCase();
            if (s.includes('pend') || s.includes('pending')) return 'pendiente';
            if (s.includes('err') || s.includes('error') || s.includes('fail')) return 'error';
            return 'listo';
        }
        if (statusFilter && !statusFilter.match(/all|todos/)) {
            docs = docs.filter(d => {
                const ds = getDisplayStatus(d);
                return ds === statusFilter || statusFilter.includes(ds) || ds.includes(statusFilter);
            });
        }

        if (!Array.isArray(docs) || docs.length === 0) {
            listEl.innerHTML = '<div class="empty">No hay documentos subidos aún.</div>';
            return;
        }

        listEl.innerHTML = '';
        docs.forEach(doc => {
            const item = document.createElement('div');
            item.className = 'doc-item';
            // Icon
            const icon = document.createElement('div');
            icon.className = 'doc-icon';
            const ext = (doc.file_name || '').split('.').pop() || 'DOC';
            icon.textContent = (ext || 'DOC').toUpperCase().slice(0,3);

            // Meta
            const meta = document.createElement('div');
            meta.className = 'doc-meta';

            // Header row: document name + toggle for expandable details
            const nameRow = document.createElement('div');
            nameRow.className = 'doc-head';

            const name = document.createElement('div');
            name.className = 'doc-name';
            // Ensure proper unicode rendering for accents and attempt decode
            const displayName = decodeDisplayName(doc.file_name || `Documento ${doc.id}`);
            name.textContent = displayName;
            // provide full-name tooltip while keeping card heights uniform
            name.setAttribute('title', displayName);

            // Toggle button to expand/collapse details inside the card
            const toggleBtn = document.createElement('button');
            toggleBtn.type = 'button';
            toggleBtn.className = 'doc-toggle-details';
            toggleBtn.setAttribute('aria-expanded', 'false');
            toggleBtn.setAttribute('aria-controls', `details-${doc.id}`);
            toggleBtn.title = 'Mostrar detalles';
            toggleBtn.innerHTML = 'Detalles ▾';

            nameRow.appendChild(name);

            const info = document.createElement('div');
            info.className = 'doc-info';
            // The uploaded info will be placed in an expand/collapse panel inside the card
            const uploaded = doc.uploaded_at ? new Date(doc.uploaded_at).toLocaleString() : '';

            // Expandable details container (initially collapsed)
            const details = document.createElement('div');
            details.className = 'doc-details';
            details.id = `details-${doc.id}`;
            details.setAttribute('aria-hidden', 'true');
            details.innerHTML = `<div class="detail-row">${uploaded ? `Subido: ${uploaded}` : ''}</div>`;

            meta.appendChild(nameRow);
            meta.appendChild(info);
            meta.appendChild(details);

            // Toggle behavior: show a floating popup (do not expand the card)
            function closeAllPopups() {
                document.querySelectorAll('.doc-popup').forEach(p => p.remove());
                document.removeEventListener('click', onDocClickOutside);
                window.removeEventListener('keydown', onDocKeydown);
                window.removeEventListener('resize', closeAllPopups);
                window.removeEventListener('scroll', closeAllPopups, true);
            }

            function onDocClickOutside(ev) {
                if (!ev.target) return;
                const inside = ev.target.closest('.doc-popup') || ev.target.closest('.doc-toggle-details');
                if (!inside) closeAllPopups();
            }

            function onDocKeydown(ev) {
                if (ev.key === 'Escape') closeAllPopups();
            }

            function showPopupForToggle(btn, doc) {
                closeAllPopups();
                const uploadedText = doc.uploaded_at ? new Date(doc.uploaded_at).toLocaleString() : 'Sin fecha';
                const popup = document.createElement('div');
                popup.className = 'doc-popup';
                popup.setAttribute('role', 'dialog');
                popup.setAttribute('aria-label', `Detalles: ${doc.file_name || doc.id}`);
                popup.innerHTML = `<div class="pop-row" style="font-weight:700;margin-bottom:0.25rem;">Subido</div><div class="pop-row">${uploadedText}</div>`;
                document.body.appendChild(popup);

                // Position popup near the button (prefer above the button)
                requestAnimationFrame(() => {
                    const rect = btn.getBoundingClientRect();
                    const popRect = popup.getBoundingClientRect();
                    const docLeft = window.scrollX || window.pageXOffset;
                    const docTop = window.scrollY || window.pageYOffset;
                    const margin = 8;
                    let top = rect.top + docTop - popRect.height - margin;
                    let left = rect.left + docLeft;
                    // Clamp to viewport
                    const viewportPad = 8;
                    if (left + popRect.width > window.innerWidth - viewportPad + docLeft) {
                        left = window.innerWidth - popRect.width - viewportPad + docLeft;
                    }
                    if (left < viewportPad + docLeft) left = viewportPad + docLeft;
                    // If not enough space above, place below
                    if (top < docTop + viewportPad) {
                        top = rect.bottom + docTop + margin;
                    }
                    popup.style.left = `${Math.round(left)}px`;
                    popup.style.top = `${Math.round(top)}px`;
                    // animate in
                    requestAnimationFrame(() => popup.classList.add('show'));
                });

                // Setup global listeners
                setTimeout(() => {
                    document.addEventListener('click', onDocClickOutside);
                    window.addEventListener('keydown', onDocKeydown);
                    window.addEventListener('resize', closeAllPopups);
                    window.addEventListener('scroll', closeAllPopups, true);
                }, 0);
            }

            toggleBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const alreadyOpen = !!document.querySelector('.doc-popup');
                if (alreadyOpen) { closeAllPopups(); return; }
                showPopupForToggle(toggleBtn, doc);
            });

            // Footer (toggle on left + actions on right)
            const footer = document.createElement('div');
            footer.className = 'doc-footer';
            const status = document.createElement('div');
            status.className = 'doc-status';
            const st = (doc.status || '').toLowerCase();
            if (st.includes('pend')) { status.classList.add('pending'); status.textContent = 'Pendiente'; }
            else if (st.includes('err')) { status.classList.add('error'); status.textContent = 'Error'; }
            else { status.classList.add('ready'); status.textContent = 'Listo'; }

            const actions = document.createElement('div');
            actions.className = 'doc-actions';
            const viewBtn = document.createElement('button');
            viewBtn.type = 'button';
            viewBtn.className = 'secondary';
            viewBtn.textContent = 'Ver';
            viewBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                viewBtn.disabled = true;
                const url = await getDocumentPublicUrl(doc.id);
                if (url) {
                    window.open(url, '_blank', 'noopener');
                } else {
                    alert('No se pudo obtener la URL pública del documento.');
                }
                viewBtn.disabled = false;
            });

            actions.appendChild(viewBtn);
            // Summarize button
            const sumBtn = document.createElement('button');
            sumBtn.type = 'button';
                sumBtn.className = 'primary';
            sumBtn.textContent = 'Resumir';
            sumBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                sumBtn.disabled = true;
                // open modal and show loading
                const sumModal = document.getElementById('summarize-modal');
                const sumContent = document.getElementById('summarize-content');
                // Remove any existing copy button while we generate a new summary
                const existingCopy = document.getElementById('summarize-copy-btn');
                if (existingCopy) existingCopy.remove();
                if (sumModal) sumModal.setAttribute('aria-hidden', 'false');
                if (sumContent) sumContent.textContent = 'Generando resumen...';

                try {
                    const resp = await apiFetch(`${API_BASE_URL}/api/documents/${doc.id}/summarize`, { method: 'POST' });
                    if (resp.ok) {
                        const j = await resp.json();
                        const text = j.summary || 'No se generó resumen.';
                        // simple rendering: split lines into bullets if newlines
                        if (sumContent) {
                            sumContent.innerHTML = '';
                            const ul = document.createElement('ul');
                            ul.style.paddingLeft = '1rem';
                            const parts = text.split(/\n+/).map(s => s.trim()).filter(Boolean);
                            parts.forEach(p => {
                                const li = document.createElement('li');
                                li.textContent = p;
                                ul.appendChild(li);
                            });
                            if (parts.length === 0) sumContent.textContent = text;
                            else sumContent.appendChild(ul);
                            // Ensure copy button is available when a summary is shown
                            try { ensureSummaryCopyButton(sumModal, sumContent); } catch (err) { /* ignore */ }
                        }
                    } else {
                        const txt = await resp.text().catch(() => null);
                        if (sumContent) sumContent.textContent = `Error al generar resumen: ${txt || resp.status}`;
                    }
                } catch (err) {
                    console.error('Summarize error:', err);
                    if (sumContent) sumContent.textContent = 'Error de conexión al generar resumen.';
                } finally {
                    sumBtn.disabled = false;
                }
            });
            actions.appendChild(sumBtn);

            // Put the toggle button in the footer on the left
            toggleBtn.classList.add('in-footer');
            toggleBtn.title = 'Mostrar detalles';
            toggleBtn.setAttribute('aria-expanded', 'false');

            // ensure status is static (we'll position it top-right of the card)
            status.setAttribute('aria-hidden', 'true');
            status.style.pointerEvents = 'none';

            // footer layout: toggle (left) + actions (right)
            footer.appendChild(toggleBtn);
            footer.appendChild(actions);

            // Position status at top-right inside the card
            const badgeWrap = document.createElement('div');
            badgeWrap.className = 'doc-badge';
            badgeWrap.appendChild(status);
            // append badge to item (absolute positioned via CSS)
            item.appendChild(badgeWrap);

            // Place the footer inside the meta container so we can pin actions to the
            // bottom of the card (meta will be a column flex container).
            meta.appendChild(footer);

            item.appendChild(icon);
            item.appendChild(meta);
            listEl.appendChild(item);
        });

        // Hook up controls events
        const searchEl2 = document.getElementById('documents-search');
        const statusEl2 = document.getElementById('documents-status-filter');
        const sortEl2 = document.getElementById('documents-sort');
        const refreshBtn = document.getElementById('documents-refresh');
        if (searchEl2) {
            searchEl2.oninput = () => { clearTimeout(window._docSearchTimer); window._docSearchTimer = setTimeout(fetchDocuments, 450); };
            searchEl2.onkeypress = (e) => { if (e.key === 'Enter') fetchDocuments(); };
        }
        if (statusEl2) statusEl2.onchange = fetchDocuments;
        if (sortEl2) sortEl2.onchange = fetchDocuments;
        if (refreshBtn) refreshBtn.onclick = fetchDocuments;

    } catch (err) {
        console.error('Error fetching documents:', err);
        const listEl2 = document.getElementById('documents-list');
        if (listEl2) listEl2.innerHTML = '<div class="error">Error al cargar documentos.</div>';
    }
}

// Fetch documents at startup
try { fetchDocuments(); } catch (e) { }

// Lógica de cerrar sesión con confirmación
const logoutBtn = document.getElementById('logout-button');
if (logoutBtn) {
    logoutBtn.addEventListener('click', (e) => {
        e.preventDefault();
        // Open the logout confirmation modal
        const logoutModal = document.getElementById('logout-modal');
        if (logoutModal) logoutModal.setAttribute('aria-hidden', 'false');
    });
}

// Logout modal buttons
const logoutModal = document.getElementById('logout-modal');
const logoutConfirmBtn = document.getElementById('logout-confirm');
const logoutCancelBtn = document.getElementById('logout-cancel');
const logoutModalClose = document.getElementById('logout-modal-close');

function closeLogoutModal() {
    const m = document.getElementById('logout-modal');
    if (m) m.setAttribute('aria-hidden', 'true');
}

if (logoutCancelBtn) logoutCancelBtn.addEventListener('click', (e) => { e.preventDefault(); closeLogoutModal(); });
if (logoutModalClose) logoutModalClose.addEventListener('click', (e) => { e.preventDefault(); closeLogoutModal(); });

if (logoutConfirmBtn) logoutConfirmBtn.addEventListener('click', (e) => {
    e.preventDefault();
    // Perform logout actions
    clearScheduledRefresh();
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    closeLogoutModal();
    window.location.href = 'index.html';
});

// Close logout modal when clicking overlay
if (logoutModal) {
    logoutModal.addEventListener('click', (e) => {
        if (e.target === logoutModal) closeLogoutModal();
    });
}

// Summarize modal handlers
const summarizeModal = document.getElementById('summarize-modal');
const summarizeClose = document.getElementById('summarize-close');
const summarizeModalClose = document.getElementById('summarize-modal-close');

function closeSummarizeModal() {
    const m = document.getElementById('summarize-modal');
    if (m) m.setAttribute('aria-hidden', 'true');
}

if (summarizeClose) summarizeClose.addEventListener('click', (e) => { e.preventDefault(); closeSummarizeModal(); });
if (summarizeModalClose) summarizeModalClose.addEventListener('click', (e) => { e.preventDefault(); closeSummarizeModal(); });
if (summarizeModal) {
    summarizeModal.addEventListener('click', (e) => { if (e.target === summarizeModal) closeSummarizeModal(); });
}

// Helper: copy text to clipboard with fallback
async function copyTextToClipboard(text) {
    if (!text) return false;
    try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(text);
            return true;
        }
    } catch (e) {
        // fall through to legacy
    }
    // fallback using textarea
    try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        return !!ok;
    } catch (e) {
        return false;
    }
}

// Ensure a copy button appears in the summarize modal. idempotent.
function ensureSummaryCopyButton(modalEl, contentEl) {
    if (!modalEl || !contentEl) return;
    // if button already exists, make sure it's enabled
    let copyBtn = document.getElementById('summarize-copy-btn');
    if (!copyBtn) {
        copyBtn = document.createElement('button');
        copyBtn.type = 'button';
        copyBtn.id = 'summarize-copy-btn';
        copyBtn.className = 'secondary';
        copyBtn.textContent = 'Copiar resumen';
        copyBtn.style.marginLeft = '0.5rem';
        copyBtn.addEventListener('click', async (ev) => {
            ev.preventDefault();
            // disable immediately to prevent double clicks
            copyBtn.disabled = true;
            const text = contentEl.innerText || contentEl.textContent || '';
            const ok = await copyTextToClipboard(text);
            if (ok) {
                // keep disabled permanently after a successful copy
                copyBtn.textContent = 'Copiado';
                copyBtn.setAttribute('aria-pressed', 'true');
            } else {
                // if copy failed, allow retry
                copyBtn.textContent = 'Error';
                // re-enable so user can try again
                setTimeout(() => { if (copyBtn) { copyBtn.textContent = 'Copiar resumen'; copyBtn.disabled = false; } }, 1400);
            }
        });

        // try to add into modal actions container first
        const actions = modalEl.querySelector('.modal-actions');
        if (actions) actions.appendChild(copyBtn);
        else {
            // fallback: append to modal dialog
            const dialog = modalEl.querySelector('.modal-dialog') || modalEl;
            dialog.appendChild(copyBtn);
        }
    }
}

let selectedFile = null;

// Setup dropzone and preview
const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('file-input');
const browseBtn = document.getElementById('browse-btn');
const filePreview = document.getElementById('file-preview');
const uploadModal = document.getElementById('upload-modal');
const openUploadBtn = document.getElementById('open-upload-btn');
const closeUploadBtn = document.getElementById('close-upload-btn');
const uploadMessageEl = document.getElementById('upload-message');

function renderFilePreview(file) {
    filePreview.innerHTML = '';
    if (!file) return;

    const card = document.createElement('div');
    card.className = 'file-card';

    const ext = (file.name.split('.').pop() || '').toUpperCase();
    const icon = document.createElement('div');
    icon.className = 'file-icon';
    icon.textContent = ext.slice(0, 3);

    const meta = document.createElement('div');
    meta.className = 'file-meta';
    const name = document.createElement('div');
    name.className = 'file-name';
    name.textContent = file.name;
    meta.appendChild(name);

    const remove = document.createElement('button');
    remove.className = 'file-remove';
    remove.type = 'button';
    remove.textContent = 'Eliminar';
    remove.addEventListener('click', (e) => {
        e.preventDefault();
        selectedFile = null;
        try {
            const dt = new DataTransfer();
            fileInput.files = dt.files;
        } catch (err) {
            console.warn('Could not clear file input programmatically', err);
            fileInput.value = '';
        }
        filePreview.innerHTML = '';
    });

    card.appendChild(icon);
    card.appendChild(meta);
    card.appendChild(remove);
    filePreview.appendChild(card);
}

function handleFile(incoming) {
    const file = (incoming instanceof File) ? incoming : (incoming && incoming[0]) ? incoming[0] : null;
    if (!file) return;
    selectedFile = file;
    // Keep file input in sync
    try {
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        fileInput.files = dataTransfer.files;
    } catch (err) {
        console.warn('Could not set file input programmatically', err);
    }
    renderFilePreview(selectedFile);
}

if (browseBtn) {
    browseBtn.addEventListener('click', (e) => {
        e.preventDefault();
        fileInput.click();
    });
}

// Modal open/close handlers
function openUploadModal() {
    if (!uploadModal) return;
    uploadModal.setAttribute('aria-hidden', 'false');
}

function closeUploadModal() {
    if (!uploadModal) return;
    uploadModal.setAttribute('aria-hidden', 'true');
    // clear messages and preview when closing
    if (uploadMessageEl) {
        uploadMessageEl.textContent = '';
        uploadMessageEl.className = 'upload-message';
    }
    if (filePreview) filePreview.innerHTML = '';
    selectedFile = null;
    try { fileInput.value = ''; } catch(e){}
}

if (openUploadBtn) openUploadBtn.addEventListener('click', (e) => { e.preventDefault(); openUploadModal(); });
if (closeUploadBtn) closeUploadBtn.addEventListener('click', (e) => { e.preventDefault(); closeUploadModal(); });

// close modal on overlay click
if (uploadModal) {
    uploadModal.addEventListener('click', (e) => {
        if (e.target === uploadModal) closeUploadModal();
    });
}

function setUploadMessage(text, type = 'info') {
    if (!uploadMessageEl) {
        alert(text);
        return;
    }
    uploadMessageEl.textContent = text;
    uploadMessageEl.className = 'upload-message';
    if (type === 'success') uploadMessageEl.classList.add('success');
    if (type === 'error') uploadMessageEl.classList.add('error');
}

if (fileInput) {
    fileInput.addEventListener('change', (e) => {
        const f = e.target.files[0];
        if (f) handleFile(f);
    });
}

if (dropzone) {
    dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.classList.add('dragover');
    });

    dropzone.addEventListener('dragleave', (e) => {
        dropzone.classList.remove('dragover');
    });

    dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('dragover');
        const f = e.dataTransfer.files[0];
        if (f) handleFile(f);
    });
}

// Submit handler uses selectedFile (or fileInput fallback)
const uploadFormEl = document.getElementById('upload-form');
if (uploadFormEl) {
    uploadFormEl.addEventListener('submit', async (e) => {
        e.preventDefault();

        // Debugging: report current state
        console.debug('Upload form submit, selectedFile:', selectedFile);

        const file = selectedFile || (fileInput && fileInput.files[0]);

        if (!file) {
            setUploadMessage('Selecciona un archivo.', 'error');
            return;
        }

    // Client-side validation: size and allowed mime types
    const MAX_SIZE = 10 * 1024 * 1024; // 10MB
    const allowedTypes = [
        'application/pdf',
        'text/plain',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];

    if (file.size > MAX_SIZE) {
        setUploadMessage('Archivo demasiado grande. El límite es 10MB.', 'error');
        return;
    }

    if (allowedTypes.indexOf(file.type) === -1) {
        // Allow some files that may not set proper MIME types by extension check fallback
        const ext = (file.name.split('.').pop() || '').toLowerCase();
        const allowedExt = ['pdf', 'txt', 'doc', 'docx'];
        if (allowedExt.indexOf(ext) === -1) {
            setUploadMessage('Tipo de archivo no permitido. Usa PDF, TXT, DOC o DOCX.', 'error');
            return;
        }
    }

    const formData = new FormData();
    formData.append('file', file);

        // disable submit to avoid double submits
        const submitBtn = uploadFormEl.querySelector('button[type="submit"]');
        if (submitBtn) submitBtn.disabled = true;

        try {
                const response = await apiFetch(`${API_BASE_URL}/api/documents`, {
                    method: 'POST',
                    body: formData
                });

            // Try parse JSON first, but fallback to text for diagnostics
            let respJson = null;
            let respText = null;
            try { respJson = await response.json(); } catch (e) { respText = await response.text().catch(() => null); }

            console.debug('Upload response', response.status, respJson || respText);

            if (response.status === 202) {
                setUploadMessage('Archivo subido. Se está procesando.', 'success');
                // small delay then close modal
                setTimeout(() => {
                    selectedFile = null;
                    try { fileInput.value = ''; } catch (e) {}
                    if (filePreview) filePreview.innerHTML = '';
                    closeUploadModal();
                    // Refresh documents list after a successful upload
                    try { fetchDocuments(); } catch (e) { console.warn('fetchDocuments failed', e); }
                }, 900);
            } else if (respJson && respJson.results) {
                const errors = respJson.results.filter(r => r.status === 'error');
                if (errors.length > 0) {
                    setUploadMessage(`Algunos archivos fallaron: ${errors.map(e => e.fileName).join(', ')}`, 'error');
                } else {
                    setUploadMessage('Archivos procesados.', 'success');
                }
            } else if (respJson && respJson.error) {
                // show backend-provided detail if available
                const detail = respJson.detail ? `: ${respJson.detail}` : '';
                setUploadMessage(respJson.error + detail, 'error');
            } else if (respText) {
                setUploadMessage(`Error al subir: ${respText}`, 'error');
            } else {
                setUploadMessage('Error al subir el archivo.', 'error');
            }
        } catch (error) {
            console.error('Error:', error);
            setUploadMessage('Error de conexión.', 'error');
        } finally {
            if (submitBtn) submitBtn.disabled = false;
        }
    });
}

// Lógica de búsqueda (RAG)
document.getElementById('search-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const query = document.getElementById('search-input').value.trim();
    if (!query) return;

    const chatWindow = document.getElementById('chat-window');

    // Mostrar la pregunta del usuario
    const userMessage = document.createElement('div');
    userMessage.className = 'message user';
    userMessage.textContent = query;
    chatWindow.appendChild(userMessage);

    // Limpiar el input
    document.getElementById('search-input').value = '';

    // Mostrar indicador de carga
    const loadingMessage = document.createElement('div');
    loadingMessage.className = 'message ai';
    loadingMessage.textContent = '...';
    chatWindow.appendChild(loadingMessage);

    // Scroll al final
    chatWindow.scrollTop = chatWindow.scrollHeight;

    try {
        const response = await apiFetch(`${API_BASE_URL}/api/v1/search`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query })
        });

        if (response.ok) {
            const data = await response.json();
            loadingMessage.textContent = data.answer;

            // If the backend returned sources, display them below the AI message
            if (data.sources && Array.isArray(data.sources) && data.sources.length > 0) {
                const sourcesContainer = document.createElement('div');
                sourcesContainer.className = 'source-list';

                const label = document.createElement('div');
                label.className = 'source-list-label';
                label.textContent = 'Fuentes:';
                sourcesContainer.appendChild(label);

                data.sources.forEach((s) => {
                    const item = document.createElement('div');
                    item.className = 'source-item';
                    // Only display the document name as requested (non-clickable)
                    const name = document.createElement('span');
                    name.className = 'source-name';
                    name.textContent = s.name || 'Documento';
                    item.appendChild(name);
                    sourcesContainer.appendChild(item);
                });

                chatWindow.appendChild(sourcesContainer);
            }
        } else {
            loadingMessage.textContent = 'Error al obtener respuesta.';
        }
    } catch (error) {
        console.error('Error:', error);
        loadingMessage.textContent = 'Error de conexión.';
    }

    // Scroll al final después de la respuesta
    chatWindow.scrollTop = chatWindow.scrollHeight;
});