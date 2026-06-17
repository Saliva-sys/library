const initApp = () => {
    // =========================================================
    // 1. DOM ELEMENT REFERENCES (Fetching elements from index.html)
    // =========================================================

    // Core HTML forms for data entry and manipulation
    const bookForm = document.getElementById('book-form');
    const readerForm = document.getElementById('reader-form');
    const borrowForm = document.getElementById('borrow-form');

    // Modals forms used for editing existing database records
    const editBookForm = document.getElementById('edit-book-form');
    const editReaderForm = document.getElementById('edit-reader-form');

    // =========================================================
    // 2. UI COMPONENTS & STATE INITIALIZATION (Bootstrap components)
    // =========================================================

    // Toast notification elements for dynamic user feedback
    const toastEl = document.getElementById('notification-toast');
    const toastBody = toastEl ? toastEl.querySelector('.toast-body') : null;

    // Component instances holding Bootstrap JavaScript objects
    let toast = null;
    let editBookModal = null;
    let editReaderModal = null;

    // =========================================================
    // 3. BOOTSTRAP COMPONENTS INITIALIZATION (With Defensive Error Handling)
    // =========================================================

    try {
        // Safe check: Initialize Toast notification module if Bootstrap and element are available
        if (window.bootstrap && toastEl) {
            toast = new bootstrap.Toast(toastEl, { autohide: true, delay: 3000 });
        }

        // Safe check: Initialize Modal modules for dynamic record editing
        if (window.bootstrap) {
            const editBookEl = document.getElementById('editBookModal');
            const editReaderEl = document.getElementById('editReaderModal');

            // Map native DOM elements into interactive Bootstrap JavaScript instances
            if (editBookEl) editBookModal = new bootstrap.Modal(editBookEl); 
            if (editReaderEl) editReaderModal = new bootstrap.Modal(editReaderEl);
        }
    } catch (err) {
        // Fallback mechanism: Prevent application crash if Bootstrap fails to load
        console.warn('Bootstrap initialization failed:', err);
        toast = toast || null;
        editBookModal = editBookModal || null;
        editReaderModal = editReaderModal || null;
    }

    // =========================================================
    // 4. UX HELPER - NATIVE DATE PICKER TRIGGER
    // =========================================================

    // Fetch the calendar trigger button and the respective date input field
    const birthPickerBtn = document.getElementById('edit-reader-birth-btn');
    const birthInput = editReaderForm ? editReaderForm.querySelector('input[name="birth_date"]') : null;

    // Attach listener to trigger the date selection calendar programmatically
    if (birthPickerBtn && birthInput) {
        birthPickerBtn.addEventListener('click', (e) => {
            // Feature detection: Prefer modern showPicker API, fallback to focus for older browsers
            if (typeof birthInput.showPicker === 'function') {
                birthInput.showPicker(); // Opens the visual calendar dropdown directly
            } else {
                birthInput.focus(); // Places the cursor into the field as a fallback
            }
        });
    }

    // =========================================================
    // 5. GLOBAL USER NOTIFICATION SYSTEM (Toast Alert Helper)
    // =========================================================

    const showToast = (message, type = 'success') => {
        // Primary flow: Use modern Bootstrap Toast UI if components loaded correctly
        if (toast && toastBody && toastEl) {
            toastBody.textContent = message; // Safe text insertion preventing XSS injection

            // Reset previous contextual status styles
            toastEl.classList.remove('text-bg-success', 'text-bg-danger', 'text-bg-warning');

            // Map the notification type to the appropriate Bootstrap color class
            toastEl.classList.add(type === 'error' ? 'text-bg-danger' : type === 'warning' ? 'text-bg-warning' : 'text-bg-success');
            toast.show(); // Trigger CSS visual slide-in animation
            return; // Terminate execution early if primary UI is fully functional
        }

        // Secondary fallback: Use browser native alert dialog if Bootstrap is missing
        if (typeof alert === 'function') {
            alert(message);
        } else {
            // Environment fallback: Log to developer console if headless or non-browser environment
            console.log(`[${type}] ${message}`);
        }
    };

    // =========================================================
    // 6. UTILITY HELPERS (Security, Formatting & DOM Management)
    // =========================================================

    // XSS Protection: replaces dangerous HTML characters with safe text entities
    const escapeHTML = (text) => String(text)
        .replace(/[&<>"']/g, (char) => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[char]));

    // Date formatting: converts YYYY-MM-DD into localized Slovak format (D. M. YYYY)
        const formatDate = (dateString) => new Date(dateString).toLocaleDateString('sk-SK');

    // Memory helper: replaces an element with its clone to strip away old event listeners
    const replaceWithCloned = (el) => {
        if (!el || !el.parentNode) return el;
        const clone = el.cloneNode(true);
        el.parentNode.replaceChild(clone, el);
        return clone;
    };

    // =========================================================
    // 7. MODAL UI POPULATORS & EDIT OPENERS
    // =========================================================

    // Form pre-filler: opens book modal and populates fields with existing record values
    const openBookEditor = (book) => {
        if (!editBookForm || !editBookModal) return;
        editBookForm.querySelector('input[name="id"]').value = book.id;
        editBookForm.querySelector('input[name="title"]').value = book.title;
        editBookForm.querySelector('input[name="author"]').value = book.author;
        editBookModal.show();
        };

        // Form pre-filler: opens reader modal and populates fields with existing record values
    const openReaderEditor = (reader) => {
        if (!editReaderForm || !editReaderModal) return;
        editReaderForm.querySelector('input[name="op_number"]').value = reader.op_number;
        editReaderForm.querySelector('#edit-reader-op-display').value = reader.op_number;
        editReaderForm.querySelector('input[name="first_name"]').value = reader.first_name;
        editReaderForm.querySelector('input[name="last_name"]').value = reader.last_name;
        editReaderForm.querySelector('input[name="birth_date"]').value = reader.birth_date;
        editReaderModal.show();
        };

        // =========================================================
    // 8. ASYNCHRONOUS DATA FETCHERS & DOM RENDERERS
    // =========================================================

    // Books view state: fetches books array from API and renders table rows and open selection dropdown
    const loadBooks = async () => {
        try {
            const response = await fetch('/api/books');
            const books = await response.json();
            
            const tbody = document.getElementById('books-table-body');
            tbody.innerHTML = '';

            if (books.length === 0) {
                tbody.innerHTML = `<tr><td colspan="5" class="text-muted text-center py-4 ps-4">V knižnici zatiaľ nie sú žiadne knihy.</td></tr>`;
                return;
            }

            // Iterate through books and display their actual database ID
            books.forEach((book) => {
                const tr = document.createElement('tr');
                
                let statusBadge = '';
                let readerInfo = '';

                if (book.is_borrowed === 1) {
                    statusBadge = '<span class="badge bg-danger">Požičaná</span>';
                    const readerName = book.first_name && book.last_name 
                        ? `${escapeHTML(book.first_name)} ${escapeHTML(book.last_name)}` 
                        : 'Neznámy čitateľ';
                    
                    readerInfo = `
                        <div class="fw-semibold text-dark">👤 ${readerName}</div>
                        <div class="text-muted small" style="font-size: 0.75rem;">(OP: ${escapeHTML(book.op_number)})</div>
                    `;
                } else {
                    statusBadge = '<span class="badge bg-success">Dostupná</span>';
                    readerInfo = '<span class="text-muted">—</span>';
                }

                // Render actual book.id here (previously using index caused numbering bugs)
                tr.innerHTML = `
                    <td class="ps-4 text-secondary fw-semibold">${book.id}</td>
                    <td class="fw-bold text-dark">${escapeHTML(book.title)}</td>
                    <td class="text-secondary">${escapeHTML(book.author)}</td>
                    <td>${statusBadge}</td>
                    <td class="pe-4">${readerInfo}</td>
                    <td class="text-center">
                        <button class="btn btn-sm btn-outline-primary edit-book-btn"
                            data-id="${book.id}"
                            data-title="${escapeHTML(book.title)}"
                            data-author="${escapeHTML(book.author)}">
                            ✏️ 
                        </button>
                    </td>
                `;
                tbody.appendChild(tr);
            });

            document.querySelectorAll('.edit-book-btn').forEach(button => {
                button.addEventListener('click', () => {
                    const book = {
                        id: button.getAttribute('data-id'),
                        title: button.getAttribute('data-title'),
                        author: button.getAttribute('data-author')
                    };
                    openBookEditor(book);
                });
            });

            // Aktualizácia rozbaľovacieho zoznamu (selectu) pre výpožičky
            const bookSelect = document.getElementById('borrow-book-select');
            bookSelect.innerHTML = '<option value="">-- Vyber voľnú knihu --</option>';
            
            books.forEach(book => {
                if (book.is_borrowed === 0) {
                    const option = document.createElement('option');
                    option.value = book.id;
                    option.textContent = `ID: ${book.id} - ${book.title} (Autor: ${book.author})`;
                    bookSelect.appendChild(option);
                }
            });

        } catch (error) {
            console.error('Chyba pri načítavaní kníh:', error);
            showToast('Nepodarilo sa načítať knihy zo servera.', 'error');
        }
    };

    // Readers view state: fetches readers from API, updates DOM table grid and borrowing selection logs
    async function loadReaders() {
        try {
            const response = await fetch('/api/readers');
            const readers = await response.json();
            const tbody = document.getElementById('readers-table-body');
            tbody.innerHTML = '';

            if (!Array.isArray(readers) || readers.length === 0) {
                tbody.innerHTML = `<tr><td colspan="4" class="text-muted text-center py-4 ps-4">Zatiaľ nie sú zaevidovaní žiadni čitatelia.</td></tr>`;
            } else {
                readers.forEach(reader => {
                    const tr = document.createElement('tr');
                    const formattedDate = formatDate(reader.birth_date);
                    const safeOp = escapeHTML(reader.op_number);
                    const safeFirst = escapeHTML(reader.first_name);
                    const safeLast = escapeHTML(reader.last_name);

                    tr.innerHTML = `
                        <td class="fw-bold text-dark ps-4">${safeOp}</td>
                        <td>${safeFirst} ${safeLast}</td>
                        <td class="text-secondary">${formattedDate}</td>
                        <td class="text-center">
                            <button class="btn btn-sm btn-outline-primary edit-reader-btn"
                                data-op="${safeOp}"
                                data-first="${safeFirst}"
                                data-last="${safeLast}"
                                data-birth="${reader.birth_date}">
                                ✏️ 
                            </button>
                            <button class="btn btn-sm btn-outline-danger delete-reader-btn" data-op="${safeOp}">
                                🗑️ 
                            </button>
                        </td>
                    `;
                    tbody.appendChild(tr);
                });
            }

            document.querySelectorAll('.edit-reader-btn').forEach(button => {
                button.addEventListener('click', () => {
                    const reader = {
                        op_number: button.getAttribute('data-op'),
                        first_name: button.getAttribute('data-first'),
                        last_name: button.getAttribute('data-last'),
                        birth_date: button.getAttribute('data-birth')
                    };
                    openReaderEditor(reader);
                });
            });

            const readerSelect = document.getElementById('borrow-reader-select');
            readerSelect.innerHTML = '<option value="">-- Vyber čitateľa zo zoznamu --</option>';

            readers.forEach(reader => {
                const option = document.createElement('option');
                option.value = reader.op_number;
                option.textContent = `${escapeHTML(reader.first_name)} ${escapeHTML(reader.last_name)} (OP: ${escapeHTML(reader.op_number)})`;
                readerSelect.appendChild(option);
            });

            document.querySelectorAll('.delete-reader-btn').forEach(button => {
                button.addEventListener('click', async (e) => {
                    const op = e.currentTarget.getAttribute('data-op');
                    if (confirm(`Naozaj chcete zrušiť čitateľa s OP: ${op}?`)) {
                        try {
                            const response = await fetch(`/api/readers/${op}`, { method: 'DELETE' });
                            const result = await response.json();

                            if (response.ok) {
                                showToast(result.message);
                                loadReaders();
                                loadBooks();
                            } else {
                                showToast(result.error || 'Chyba pri mazaní čitateľa.', 'error');
                            }
                        } catch (err) {
                            console.error('Chyba pri mazaní čitateľa:', err);
                            showToast('Nepodarilo sa spojiť so serverom.', 'error');
                        }
                    }
                });
            });
        } catch (error) {
            console.error('Chyba pri načítavaní čitateľov:', error);
            showToast('Chyba pri načítavaní čitateľov.', 'error');
        }
    }

    // Borrows view state: requests relational active borrowings logs and builds tracking table layout
    async function loadBorrows() {
        try {
            const response = await fetch('/api/borrows');
            const borrows = await response.json();
            const tbody = document.getElementById('borrows-table-body');
            tbody.innerHTML = '';

            if (!Array.isArray(borrows) || borrows.length === 0) {
                tbody.innerHTML = `<tr><td colspan="4" class="text-muted text-center py-4 ps-4">Žiadne aktívne výpožičky.</td></tr>`;
                return;
            }

            borrows.forEach(borrow => {
                const tr = document.createElement('tr');
                const formattedDate = formatDate(borrow.borrow_date);
                const safeBookTitle = escapeHTML(borrow.book_title);
                const safeFirst = escapeHTML(borrow.first_name);
                const safeLast = escapeHTML(borrow.last_name);
                const safeOp = escapeHTML(borrow.op_number);

                tr.innerHTML = `
                    <td class="fw-bold text-dark ps-4">📖 ${safeBookTitle}</td>
                    <td>${safeFirst} ${safeLast} <span class="text-muted small">(${safeOp})</span></td>
                    <td class="text-secondary">${formattedDate}</td>
                    <td class="text-center pe-4">
                        <button class="btn btn-sm btn-danger return-btn" data-id="${borrow.borrow_id}">
                            ↩️ Vrátiť knihu
                        </button>
                    </td>
                `;
                tbody.appendChild(tr);
            });

            document.querySelectorAll('.return-btn').forEach(button => {
                button.addEventListener('click', async (e) => {
                    const borrowId = e.currentTarget.getAttribute('data-id');
                    if (confirm('Naozaj chcete túto knihu vrátiť do knižnice?')) {
                        await returnBook(borrowId);
                    }
                });
            });
        } catch (error) {
            console.error('Chyba pri načítavaní výpožičiek:', error);
            showToast('Chyba pri načítavaní výpožičiek.', 'error');
        }
    }

    // Return processor: fires DELETE request to drop active borrowing log and free the target book state
    async function returnBook(borrowId) {
        try {
            const response = await fetch(`/api/borrows/${borrowId}`, { method: 'DELETE' });
            const result = await response.json();
            if (response.ok) {
                showToast('Kniha bola úspešne vrátená!');
                loadBooks();
                loadReaders();
                loadBorrows();
            } else {
                showToast(result.error || 'Chyba pri vracaní knihy.', 'error');
            }
        } catch (error) {
            console.error('Chyba pri vracaní knihy:', error);
            showToast('Chyba pri vracaní knihy.', 'error');
        }
    }

    // =========================================================
    // 9. EVENT LISTENERS - FORMS SUBMISSION HANDLERS
    // =========================================================

    // Creation event handler: serializes raw payload and POSTs new book record into system storage
    bookForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const titleInput = bookForm.querySelector('input[name="title"]');
        const authorInput = bookForm.querySelector('input[name="author"]');

        try {
            const response = await fetch('/api/books', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: titleInput.value.trim(), author: authorInput.value.trim() })
            });
            const result = await response.json();

            if (response.ok) {
                bookForm.reset();
                showToast(result.message || 'Kniha úspešne pridaná do databázy!');
                loadBooks();
            } else {
                showToast(result.error || 'Chyba pri pridávaní knihy.', 'error');
            }
        } catch (error) {
            console.error('Chyba pri pridávaní knihy:', error);
            showToast('Nepodarilo sa spojiť so serverom.', 'error');
        }
    });

    // Creation event handler: serializes reader payload and POSTs new reader account info into system storage
    readerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const opInput = readerForm.querySelector('input[name="op_number"]');
        const firstNameInput = readerForm.querySelector('input[name="first_name"]');
        const lastNameInput = readerForm.querySelector('input[name="last_name"]');
        const birthDateInput = readerForm.querySelector('input[name="birth_date"]');

        try {
            const response = await fetch('/api/readers', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    op_number: opInput.value.trim(),
                    first_name: firstNameInput.value.trim(),
                    last_name: lastNameInput.value.trim(),
                    birth_date: birthDateInput.value
                })
            });
            const result = await response.json();

            if (response.ok) {
                readerForm.reset();
                showToast(result.message || 'Čitateľ bol úspešne zaevidovaný!');
                loadReaders();
            } else {
                showToast(result.error || 'Chyba pri pridávaní čitateľa.', 'error');
            }
        } catch (error) {
            console.error('Chyba pri pridávaní čitateľa:', error);
            showToast('Nepodarilo sa spojiť so serverom.', 'error');
        }
    });

    // Modification event handler: updates specific fields on a book row via target parameters PUT call
    if (editBookForm) {
        editBookForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const id = editBookForm.querySelector('input[name="id"]').value;
            const title = editBookForm.querySelector('input[name="title"]').value.trim();
            const author = editBookForm.querySelector('input[name="author"]').value.trim();

            try {
                const response = await fetch(`/api/books/${id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ title, author })
                });
                const result = await response.json();
                if (response.ok) {
                    showToast(result.message || 'Kniha bola upravená.');
                    editBookModal?.hide();
                    loadBooks();
                } else {
                    showToast(result.error || 'Chyba pri editácii knihy.', 'error');
                }
            } catch (error) {
                console.error('Chyba pri editácii knihy:', error);
                showToast('Nepodarilo sa spojiť so serverom.', 'error');
            }
        });
    }

    // Modification event handler: updates specific fields on a reader row via target parameters PUT call
    if (editReaderForm) {
        editReaderForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const op = editReaderForm.querySelector('input[name="op_number"]').value;
            const first_name = editReaderForm.querySelector('input[name="first_name"]').value.trim();
            const last_name = editReaderForm.querySelector('input[name="last_name"]').value.trim();
            const birth_date = editReaderForm.querySelector('input[name="birth_date"]').value;

            try {
                const response = await fetch(`/api/readers/${op}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ first_name, last_name, birth_date })
                });
                const result = await response.json();
                if (response.ok) {
                    showToast(result.message || 'Čitateľ bol upravený.');
                    editReaderModal?.hide();
                    loadReaders();
                } else {
                    showToast(result.error || 'Chyba pri editácii čitateľa.', 'error');
                }
            } catch (error) {
                console.error('Chyba pri editácii čitateľa:', error);
                showToast('Nepodarilo sa spojiť so serverom.', 'error');
            }
        });
    }

    // Log creation event handler: posts pairing relation linking reader OP and book ID into borrows database table
    borrowForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const readerSelect = document.getElementById('borrow-reader-select');
        const bookSelect = document.getElementById('borrow-book-select');

        try {
            const response = await fetch('/api/borrows', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    op_number: readerSelect.value,
                    book_id: bookSelect.value
                })
            });
            const result = await response.json();

            if (response.ok) {
                borrowForm.reset();
                showToast(result.message || 'Kniha bola úspešne požičaná!');
                loadBooks();
                loadReaders();
                loadBorrows();
            } else {
                showToast(result.error || 'Chyba pri požičaní knihy.', 'error');
            }
        } catch (error) {
            console.error('Chyba pri požičaní knihy:', error);
            showToast('Nepodarilo sa spojiť so serverom.', 'error');
        }
        });

        // Initial grid state boot: loads database records data on application entry
        loadBooks();
        loadReaders();
        loadBorrows();
    };

    // Application bootstrapper: delays initApp call until entire document content tree executes safe rendering
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initApp);
    } else {
        initApp();
}