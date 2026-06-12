const express = require('express');
const sqlite3 = require('sqlite3').verbose(); // Importujeme SQLite3
const app = express();
const PORT = 3000;

// Nastavenie, aby server vedel spracovať formuláre a JSON dáta
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public'));

// 1. Pripojenie k databáze (ak súbor neexistuje, SQLite ho automaticky vytvorí)
const db = new sqlite3.Database('./kniznica.db', (err) => {
    if (err) {
        console.error('Chyba pri pripájaní k databáze:', err.message);
    } else {
        console.log('Pripojené k SQLite databáze (súbor kniznica.db).');
    }
});

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
app.get('/', (req, res) => {
    res.send('Aplikácia Knižnica pre SunSoft úspešne beží a databáza je pripravená!');
});

// Spustenie servera na porte 3000
app.listen(PORT, () => {
    console.log(`Server štartuje! Otvor si v prehliadači: http://localhost:${PORT}`);
});