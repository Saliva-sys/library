const path = require('path');
const express = require('express');
const sqlite3 = require('sqlite3').verbose(); // Importujeme SQLite3
const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Nastavenie, aby server vedel spracovať formuláre a JSON dáta
app.use(express.urlencoded({ extended: true }));
app.use(express.json({ limit: '10kb' }));

app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    next();
});

// --- Demo Basic Auth middleware (enabled only when DEMO_AUTH=true) ---
// To enable demo auth set DEMO_AUTH=true. Credentials can be set via
// DEMO_USER and DEMO_PASS. This is for presentation/demo use only.
if (process.env.DEMO_AUTH === 'true') {
    const demoUser = process.env.DEMO_USER || 'demo';
    const demoPass = process.env.DEMO_PASS || 'demo123';

    app.use((req, res, next) => {
        const auth = req.headers.authorization;
        if (!auth) {
            res.setHeader('WWW-Authenticate', 'Basic realm="Demo"');
            return res.status(401).send('Auth required');
        }

        const parts = auth.split(' ');
        if (parts.length !== 2 || parts[0] !== 'Basic') {
            res.setHeader('WWW-Authenticate', 'Basic realm="Demo"');
            return res.status(401).send('Auth required');
        }

        const token = parts[1];
        let creds = '';
        try {
            creds = Buffer.from(token, 'base64').toString('utf8');
        } catch (e) {
            res.setHeader('WWW-Authenticate', 'Basic realm="Demo"');
            return res.status(401).send('Invalid auth token');
        }

        const [user, pass] = creds.split(':');
        if (user === demoUser && pass === demoPass) return next();

        res.setHeader('WWW-Authenticate', 'Basic realm="Demo"');
        return res.status(401).send('Invalid credentials');
    });
}

app.use(express.static('public'));

// 1. Pripojenie k databáze (ak súbor neexistuje, SQLite ho automaticky vytvorí)
const db = new sqlite3.Database('./kniznica.db', (err) => {
    if (err) {
        console.error('Chyba pri pripájaní k databáze:', err.message);
    } else {
        console.log('Pripojené k SQLite databáze (súbor kniznica.db).');
    }
});

db.run('PRAGMA foreign_keys = ON');

// 2. Vytvorenie tabuliek podľa zadania SunSoftu
db.serialize(() => {
    // Tabuľka 1: Knihy
    db.run(`CREATE TABLE IF NOT EXISTS books (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        author TEXT NOT NULL,
        is_borrowed INTEGER DEFAULT 0
    )`);

    // Tabuľka 2: Čitatelia (Číslo OP je hlavný kľúč - TEXT, lebo môže obsahovať písmená)
    db.run(`CREATE TABLE IF NOT EXISTS readers (
        op_number TEXT PRIMARY KEY,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        birth_date TEXT NOT NULL
    )`);

    // Tabuľka 3: Výpožičky a vrátenia
    db.run(`CREATE TABLE IF NOT EXISTS borrows (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        op_number TEXT,
        book_id INTEGER,
        borrow_date TEXT,
        return_date TEXT,
        FOREIGN KEY (op_number) REFERENCES readers (op_number),
        FOREIGN KEY (book_id) REFERENCES books (id)
    )`);
});

// Testovacia cesta
//app.get('/', (req, res) => {
    //res.send('Aplikácia Knižnica pre SunSoft úspešne beží a databáza je pripravená!');
//});

// Hlavná cesta - načíta náš frontend (index.html)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Spustenie servera na porte 3000/3001
app.listen(PORT, () => {
    console.log(`Server štartuje! Otvor si v prehliadači: http://localhost:${PORT}`);
});

// ==========================================
// 3. API ENDPOINTY (Cesty pre komunikáciu s frontendom)
// ==========================================

// Pridanie novej knihy do databázy
app.post('/api/books', (req, res) => {
    const { title, author } = req.body;

    // Kontrola, či používateľ vyplnil obe políčka
    if (!title || !author) {
        return res.status(400).json({ error: 'Názov knihy a autor sú povinné údaje!' });
    }

    const t = title.trim();
    const a = author.trim();
    if (t.length === 0 || a.length === 0) {
        return res.status(400).json({ error: 'Názov knihy a autor musia obsahovať platné znaky.' });
    }
    if (t.length > 200 || a.length > 200) {
        return res.status(400).json({ error: 'Názov alebo autor sú príliš dlhí (max 200 znakov).' });
    }

    const sql = `INSERT INTO books (title, author) VALUES (?, ?)`;
    db.run(sql, [t, a], function(err) {
        if (err) {
            console.error('Chyba pri ukladaní knihy:', err.message);
            return res.status(500).json({ error: 'Chyba servera pri ukladaní knihy.' });
        }
        res.status(201).json({ message: 'Kniha bola úspešne pridaná!', bookId: this.lastID });
    });
});

// Načítanie všetkých kníh z databázy (vrátane informácie o tom, kto ju má požičanú)
app.get('/api/books', (req, res) => {
    // Tento SQL dotaz vytiahne knihy a ak je kniha požičaná, pripojí k nej meno čitateľa z tabuľky borrows a readers
    const sql = `
        SELECT k.*, 
               b.op_number, 
               c.first_name, 
               c.last_name
        FROM books k
        LEFT JOIN borrows b ON k.id = b.book_id
        LEFT JOIN readers c ON b.op_number = c.op_number
    `;
    
    db.all(sql, [], (err, rows) => {
        if (err) {
            console.error('Chyba pri načítaní kníh:', err.message);
            return res.status(500).json({ error: 'Chyba servera pri načítaní kníh.' });
        }
        res.json(rows);
    });
});

// Pridanie nového čitateľa do databázy
app.post('/api/readers', (req, res) => {
    let { op_number, first_name, last_name, birth_date } = req.body;

    // Kontrola, či sú vyplnené všetky políčka
    if (!op_number || !first_name || !last_name || !birth_date) {
        return res.status(400).json({ error: 'Všetky údaje o čitateľovi sú povinné!' });
    }

    // 2. KONTROLA FORMÁTU OP (Očakávame 2 písmená a 6 číslic)
    // Trim odstráni náhodné medzery na začiatku/konci a ToUpperCase vynúti veľké písmená
    op_number = op_number.trim().toUpperCase(); 
    const opRegex = /^[A-Z]{2}\d{6}$/; // Regulárny výraz: 2 písmená (A-Z) a presne 6 čísel (\d{6})
    
    if (!opRegex.test(op_number)) {
        return res.status(400).json({ error: 'Nesprávny formát OP! Musí obsahovať 2 písmená a 6 čísiel (napr. EA123456).' });
    }

    // 3. AUTOMATICKÉ VEĽKÉ PÍSMENÁ pre meno a priezvisko
    // Vezme prvé písmeno, dá ho na veľké + pridá zvyšok slova na malé
    const formatName = (name) => name.trim().charAt(0).toUpperCase() + name.trim().slice(1).toLowerCase();
    
    first_name = formatName(first_name);
    last_name = formatName(last_name);

    // Birth date validation (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(birth_date) || Number.isNaN(Date.parse(birth_date))) {
        return res.status(400).json({ error: 'Neplatný formát dátumu narodenia. Použite YYYY-MM-DD.' });
    }

    if (first_name.length > 100 || last_name.length > 100) {
        return res.status(400).json({ error: 'Meno alebo priezvisko sú príliš dlhé (max 100 znakov).' });
    }

    const sql = `INSERT INTO readers (op_number, first_name, last_name, birth_date) VALUES (?, ?, ?, ?)`;
    db.run(sql, [op_number, first_name, last_name, birth_date], function(err) {
        if (err) {
            console.error('Chyba pri ukladaní čitateľa:', err.message);
            // Ak zadáme číslo OP, ktoré už v databáze je, SQLite vyhodí chybu (lebo op_number je PRIMARY KEY)
            if (err.message.includes('UNIQUE')) {
                return res.status(400).json({ error: 'Čitateľ s týmto číslom OP už je zaevidovaný!' });
            }
            return res.status(500).json({ error: 'Chyba servera pri ukladaní čitateľa.' });
        }
        res.status(201).json({ message: 'Čitateľ bol úspešne zaevidovaný!' });
    });
});

// Načítanie všetkých čitateľov z databázy
app.get('/api/readers', (req, res) => {
    const sql = `SELECT * FROM readers`;
    
    db.all(sql, [], (err, rows) => {
        if (err) {
            console.error('Chyba pri načítaní čitateľov:', err.message);
            return res.status(500).json({ error: 'Chyba servera pri načítaní čitateľov.' });
        }
        res.json(rows);
    });
});

// 1. Vytvorenie novej výpožičky
app.post('/api/borrows', (req, res) => {
    const { op_number, book_id } = req.body;

    if (!op_number || !book_id) {
        return res.status(400).json({ error: 'Musíte vybrať čitateľa aj knihu!' });
    }

    const parsedBookId = parseInt(book_id, 10);
    if (Number.isNaN(parsedBookId)) {
        return res.status(400).json({ error: 'Neplatné ID knihy.' });
    }

    const borrow_date = new Date().toISOString().split('T')[0]; // Dnešný dátum v tvare YYYY-MM-DD
    // Použijeme transakciu, aby sme zabránili nekonzistentnému stavu
    db.run('BEGIN TRANSACTION', (beginErr) => {
        if (beginErr) {
            console.error('Chyba pri začatí transakcie:', beginErr.message);
            return res.status(500).json({ error: 'Chyba servera.' });
        }

        db.get(`SELECT op_number FROM readers WHERE op_number = ?`, [op_number], (readerErr, readerRow) => {
            if (readerErr) {
                console.error('Chyba pri overovaní čitateľa:', readerErr.message);
                db.run('ROLLBACK', () => {});
                return res.status(500).json({ error: 'Chyba servera pri overení čitateľa.' });
            }
            if (!readerRow) {
                db.run('ROLLBACK', () => {});
                return res.status(404).json({ error: 'Vybraný čitateľ sa nenašiel.' });
            }

            db.get(`SELECT is_borrowed FROM books WHERE id = ?`, [parsedBookId], (checkErr, row) => {
                if (checkErr) {
                    console.error('Chyba pri kontrole stavu knihy:', checkErr.message);
                    db.run('ROLLBACK', () => {});
                    return res.status(500).json({ error: 'Chyba servera pri overení knihy.' });
                }
                if (!row) {
                    db.run('ROLLBACK', () => {});
                    return res.status(404).json({ error: 'Vybraná kniha sa nenašla.' });
                }
                if (row.is_borrowed === 1) {
                    db.run('ROLLBACK', () => {});
                    return res.status(400).json({ error: 'Táto kniha je už požičaná.' });
                }

                db.run(`INSERT INTO borrows (op_number, book_id, borrow_date) VALUES (?, ?, ?)`, [op_number, parsedBookId, borrow_date], function(insertErr) {
                    if (insertErr) {
                        console.error('Chyba pri zápise výpožičky:', insertErr.message);
                        db.run('ROLLBACK', () => {});
                        return res.status(500).json({ error: 'Chyba servera pri vytváraní výpožičky.' });
                    }

                    db.run(`UPDATE books SET is_borrowed = 1 WHERE id = ?`, [parsedBookId], function(updateErr) {
                        if (updateErr) {
                            console.error('Chyba pri aktualizácii stavu knihy:', updateErr.message);
                            db.run('ROLLBACK', () => {});
                            return res.status(500).json({ error: 'Chyba servera pri aktualizácii stavu knihy.' });
                        }

                        db.run('COMMIT', (commitErr) => {
                            if (commitErr) {
                                console.error('Chyba pri commit transakcie:', commitErr.message);
                                db.run('ROLLBACK', () => {});
                                return res.status(500).json({ error: 'Chyba servera pri ukladaní výpožičky.' });
                            }
                            res.status(201).json({ message: 'Kniha bola úspešne požičaná!' });
                        });
                    });
                });
            });
        });
    });
});

// 2. Načítanie všetkých aktívnych výpožičiek (spájame 3 tabuľky cez JOIN)
app.get('/api/borrows', (req, res) => {
    const sql = `
        SELECT b.id as borrow_id, b.borrow_date, b.op_number,
               k.title as book_title, k.id as book_id,
               c.first_name, c.last_name
        FROM borrows b
        JOIN books k ON b.book_id = k.id
        JOIN readers c ON b.op_number = c.op_number
    `;

    db.all(sql, [], (err, rows) => {
        if (err) {
            console.error('Chyba pri načítaní výpožičiek:', err.message);
            return res.status(500).json({ error: 'Chyba servera pri načítaní prehľadu.' });
        }
        res.json(rows);
    });
});

// 3. Vrátenie knihy (vymazanie výpožičky a uvoľnenie knihy)
app.delete('/api/borrows/:id', (req, res) => {
    const borrowId = parseInt(req.params.id, 10);
    if (Number.isNaN(borrowId)) {
        return res.status(400).json({ error: 'Neplatné ID výpožičky.' });
    }

    db.get(`SELECT book_id FROM borrows WHERE id = ?`, [borrowId], (err, row) => {
        if (err) {
            console.error('Chyba pri získavaní výpožičky:', err.message);
            return res.status(500).json({ error: 'Chyba servera pri spracovaní požiadavky.' });
        }
        if (!row) {
            return res.status(404).json({ error: 'Výpožička sa nenašla.' });
        }

        const bookId = row.book_id;
        // Transakcia: odstránime záznam o výpožičke a zároveň uvoľníme knihu
        db.run('BEGIN TRANSACTION', (beginErr) => {
            if (beginErr) {
                console.error('Chyba pri začatí transakcie (vrátenie):', beginErr.message);
                return res.status(500).json({ error: 'Chyba servera.' });
            }

            db.run(`DELETE FROM borrows WHERE id = ?`, [borrowId], function(delErr) {
                if (delErr) {
                    console.error('Chyba pri mazaní výpožičky:', delErr.message);
                    db.run('ROLLBACK', () => {});
                    return res.status(500).json({ error: 'Chyba pri vracaní knihy.' });
                }

                db.run(`UPDATE books SET is_borrowed = 0 WHERE id = ?`, [bookId], function(upErr) {
                    if (upErr) {
                        console.error('Chyba pri aktualizácii stavu knihy po vrátení:', upErr.message);
                        db.run('ROLLBACK', () => {});
                        return res.status(500).json({ error: 'Chyba servera pri uvoľňovaní knihy.' });
                    }

                    db.run('COMMIT', (commitErr) => {
                        if (commitErr) {
                            console.error('Chyba pri commit transakcie (vrátenie):', commitErr.message);
                            db.run('ROLLBACK', () => {});
                            return res.status(500).json({ error: 'Chyba servera pri ukladani zmeny.' });
                        }
                        res.json({ message: 'Kniha bola úspešne vrátená do knižnice!' });
                    });
                });
            });
        });
    });
});

// Vymazanie čitateľa z databázy
app.delete('/api/readers/:op', (req, res) => {
    const opNumber = req.params.op;

    // Najprv skontrolujeme, či nemá čitateľ náhodou požičanú knihu
    db.get(`SELECT id FROM borrows WHERE op_number = ?`, [opNumber], (err, row) => {
        if (err) {
            console.error('Chyba pri kontrole výpožičiek:', err.message);
            return res.status(500).json({ error: 'Chyba servera pri overení čitateľa.' });
        }
        if (row) {
            return res.status(400).json({ error: 'Nemožno vymazať čitateľa, ktorý má aktuálne požičanú knihu!' });
        }

        // Ak nemá žiadnu výpožičku, bezpečne ho vymažeme
        db.run(`DELETE FROM readers WHERE op_number = ?`, [opNumber], (delErr) => {
            if (delErr) {
                return res.status(500).json({ error: 'Chyba servera pri mazaní čitateľa.' });
            }
            res.json({ message: 'Čitateľ bol úspešne odstránený zo systému.' });
        });
    });
});

// Úprava existujúcej knihy
app.put('/api/books/:id', (req, res) => {
    const bookId = parseInt(req.params.id, 10);
    const { title, author } = req.body;

    if (Number.isNaN(bookId) || !title || !author) {
        return res.status(400).json({ error: 'Potrebujete ID knihy a nové údaje (názov + autor).' });
    }

    const sql = `UPDATE books SET title = ?, author = ? WHERE id = ?`;
    db.run(sql, [title.trim(), author.trim(), bookId], function(err) {
        if (err) {
            console.error('Chyba pri editácii knihy:', err.message);
            return res.status(500).json({ error: 'Chyba servera pri aktualizácii knihy.' });
        }
        if (this.changes === 0) {
            return res.status(404).json({ error: 'Kniha sa nenašla.' });
        }
        res.json({ message: 'Kniha bola úspešne upravená.' });
    });
});

// Úprava existujúceho čitateľa
app.put('/api/readers/:op', (req, res) => {
    const opNumber = req.params.op;
    let { first_name, last_name, birth_date } = req.body;

    if (!first_name || !last_name || !birth_date) {
        return res.status(400).json({ error: 'Všetky údaje o čitateľovi sú povinné!' });
    }

    const formatName = (name) => name.trim().charAt(0).toUpperCase() + name.trim().slice(1).toLowerCase();
    first_name = formatName(first_name);
    last_name = formatName(last_name);
    // Validate birth_date format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(birth_date) || Number.isNaN(Date.parse(birth_date))) {
        return res.status(400).json({ error: 'Neplatný formát dátumu narodenia. Použite YYYY-MM-DD.' });
    }

    if (first_name.length > 100 || last_name.length > 100) {
        return res.status(400).json({ error: 'Meno alebo priezvisko sú príliš dlhé (max 100 znakov).' });
    }

    const sql = `UPDATE readers SET first_name = ?, last_name = ?, birth_date = ? WHERE op_number = ?`;
    db.run(sql, [first_name, last_name, birth_date, opNumber], function(err) {
        if (err) {
            console.error('Chyba pri editácii čitateľa:', err.message);
            return res.status(500).json({ error: 'Chyba servera pri aktualizácii čitateľa.' });
        }
        if (this.changes === 0) {
            return res.status(404).json({ error: 'Čitateľ sa nenašiel.' });
        }
        res.json({ message: 'Čitateľ bol úspešne upravený.' });
    });
});