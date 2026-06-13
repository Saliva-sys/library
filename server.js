const path = require('path');
const express = require('express');
const sqlite3 = require('sqlite3').verbose(); // Importujeme SQLite3
const app = express();
const PORT = 3000;

// Nastavenie, aby server vedel spracovať formuláre a JSON dáta
app.use(express.urlencoded({ extended: true }));
app.use(express.json({ limit: '10kb' }));

app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    next();
});

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

// Spustenie servera na porte 3000
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

    const sql = `INSERT INTO books (title, author) VALUES (?, ?)`;
    
    db.run(sql, [title, author], function(err) {
        if (err) {
            console.error('Chyba pri ukladaní knihy:', err.message);
            return res.status(500).json({ error: 'Chyba servera pri ukladaní knihy.' });
        }
        
        // Ak všetko prebehlo v poriadku, pošleme webu späť úspešnú odpoveď a ID novej knihy
        res.status(201).json({ 
            message: 'Kniha bola úspešne pridaná!',
            bookId: this.lastID 
        });
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

    const sqlCheckReader = `SELECT op_number FROM readers WHERE op_number = ?`;
    db.get(sqlCheckReader, [op_number], (readerErr, readerRow) => {
        if (readerErr) {
            console.error('Chyba pri overovaní čitateľa:', readerErr.message);
            return res.status(500).json({ error: 'Chyba servera pri overení čitateľa.' });
        }
        if (!readerRow) {
            return res.status(404).json({ error: 'Vybraný čitateľ sa nenašiel.' });
        }

        const sqlCheckBook = `SELECT is_borrowed FROM books WHERE id = ?`;
        db.get(sqlCheckBook, [parsedBookId], (checkErr, row) => {
            if (checkErr) {
                console.error('Chyba pri kontrole stavu knihy:', checkErr.message);
                return res.status(500).json({ error: 'Chyba servera pri overení knihy.' });
            }
            if (!row) {
                return res.status(404).json({ error: 'Vybraná kniha sa nenašla.' });
            }
            if (row.is_borrowed === 1) {
                return res.status(400).json({ error: 'Táto kniha je už požičaná.' });
            }

            const sqlBorrow = `INSERT INTO borrows (op_number, book_id, borrow_date) VALUES (?, ?, ?)`;
            db.run(sqlBorrow, [op_number, parsedBookId, borrow_date], function(err) {
                if (err) {
                    console.error('Chyba pri zápise výpožičky:', err.message);
                    return res.status(500).json({ error: 'Chyba servera pri vytváraní výpožičky.' });
                }

                const sqlUpdateBook = `UPDATE books SET is_borrowed = 1 WHERE id = ?`;
                db.run(sqlUpdateBook, [parsedBookId], (updateErr) => {
                    if (updateErr) {
                        console.error('Chyba pri aktualizácii stavu knihy:', updateErr.message);
                        return res.status(500).json({ error: 'Chyba servera pri aktualizácii stavu knihy.' });
                    }
                    res.status(201).json({ message: 'Kniha bola úspešne požičaná!' });
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

        db.run(`DELETE FROM borrows WHERE id = ?`, [borrowId], (delErr) => {
            if (delErr) {
                console.error('Chyba pri mazaní výpožičky:', delErr.message);
                return res.status(500).json({ error: 'Chyba pri vracaní knihy.' });
            }

            db.run(`UPDATE books SET is_borrowed = 0 WHERE id = ?`, [bookId], (upErr) => {
                if (upErr) {
                    console.error('Chyba pri aktualizácii stavu knihy po vrátení:', upErr.message);
                    return res.status(500).json({ error: 'Chyba servera pri uvoľňovaní knihy.' });
                }
                res.json({ message: 'Kniha bola úspešne vrátená do knižnice!' });
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