const initApp = () => {
    const bookForm = document.getElementById('book-form');
    const readerForm = document.getElementById('reader-form');
    const borrowForm = document.getElementById('borrow-form');
    const editBookForm = document.getElementById('edit-book-form');
    const editReaderForm = document.getElementById('edit-reader-form');
    const toastEl = document.getElementById('notification-toast');
    const toastBody = toastEl ? toastEl.querySelector('.toast-body') : null;
    let toast = null;
    let editBookModal = null;
    let editReaderModal = null;

    try {
        if (window.bootstrap && toastEl) {
            toast = new bootstrap.Toast(toastEl, { autohide: true, delay: 3000 });
        }
        if (window.bootstrap) {
            const editBookEl = document.getElementById('editBookModal');
            const editReaderEl = document.getElementById('editReaderModal');
            if (editBookEl) editBookModal = new bootstrap.Modal(editBookEl);
            if (editReaderEl) editReaderModal = new bootstrap.Modal(editReaderEl);
        }
    } catch (err) {
        console.warn('Bootstrap initialization failed:', err);
        toast = toast || null;
        editBookModal = editBookModal || null;
        editReaderModal = editReaderModal || null;
    }

    const showToast = (message, type = 'success') => {
        if (toast && toastBody && toastEl) {
            toastBody.textContent = message;
            toastEl.classList.remove('text-bg-success', 'text-bg-danger', 'text-bg-warning');
            toastEl.classList.add(type === 'error' ? 'text-bg-danger' : type === 'warning' ? 'text-bg-warning' : 'text-bg-success');
            toast.show();
            return;
        }

        if (typeof alert === 'function') {
            alert(message);
        } else {
            console.log(`[${type}] ${message}`);
        }
    };

    const escapeHTML = (text) => String(text)
        .replace(/[&<>"']/g, (char) => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[char]));

    const formatDate = (dateString) => new Date(dateString).toLocaleDateString('sk-SK');

    const openBookEditor = (book) => {
        if (!editBookForm || !editBookModal) return;
        editBookForm.querySelector('input[name="id"]').value = book.id;
        editBookForm.querySelector('input[name="title"]').value = book.title;
        editBookForm.querySelector('input[name="author"]').value = book.author;
        editBookModal.show();
    };

    const openReaderEditor = (reader) => {
        if (!editReaderForm || !editReaderModal) return;
        editReaderForm.querySelector('input[name="op_number"]').value = reader.op_number;
        editReaderForm.querySelector('#edit-reader-op-display').value = reader.op_number;
        editReaderForm.querySelector('input[name="first_name"]').value = reader.first_name;
        editReaderForm.querySelector('input[name="last_name"]').value = reader.last_name;
        editReaderForm.querySelector('input[name="birth_date"]').value = reader.birth_date;
        editReaderModal.show();
    };

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

            // Prechádzame knihy a zobrazujeme ich skutočné ID z databázy
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

                // SEM SME DALI SKUTOČNÉ book.id (predtým tam bol index, čo robilo neplechu s číslami)
                tr.innerHTML = `
                    <td class="ps-4 text-secondary fw-semibold">${book.id}</td>
                    <td class="fw-bold text-dark">${escapeHTML(book.title)}</td>
                    <td class="text-secondary">${escapeHTML(book.author)}</td>
                    <td>${statusBadge}</td>
                    <td class="pe-4">${readerInfo}</td>
                    <td class="text-center pe-4">
                        <button class="btn btn-sm btn-outline-primary edit-book-btn"
                            data-id="${book.id}"
                            data-title="${escapeHTML(book.title)}"
                            data-author="${escapeHTML(book.author)}">
                            ✏️ Upraviť
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
                        <td class="text-center pe-4">
                            <button class="btn btn-sm btn-outline-primary edit-reader-btn"
                                data-op="${safeOp}"
                                data-first="${safeFirst}"
                                data-last="${safeLast}"
                                data-birth="${reader.birth_date}">
                                ✏️ Upraviť
                            </button>
                            <button class="btn btn-sm btn-outline-danger delete-reader-btn" data-op="${safeOp}">
                                🗑️ Zrušiť
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

    loadBooks();
    loadReaders();
    loadBorrows();
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}
