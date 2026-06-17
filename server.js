// ==========================================
// 1. SERVER CONFIGURATION & SECURITY
// ==========================================

// Import core Node.js path module for working with file paths
const path = require('path');

// Import Express framework to create our web server
const express = require('express');

// Import SQLite3 database library with verbose error logging
const sqlite3 = require('sqlite3').verbose(); // Importujeme SQLite3

// Initialize the Express application
const app = express();

// Define the server port (use environment variable or default to 3000)
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Middleware to parse incoming form data and URL-encoded payloads
app.use(express.urlencoded({ extended: true }));
// Middleware to parse incoming JSON data with a 10kb size limit for security
app.use(express.json({ limit: '10kb' }));

// Middleware to set HTTP security headers to protect against common web vulnerabilities
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    next();
});

// --- Demo Basic Auth middleware (enabled only when DEMO_AUTH=true) ---
// Check if demo authentication is explicitly enabled in environment variables
if (process.env.DEMO_AUTH === 'true') {
    // Set default credentials if not provided by the system
    const demoUser = process.env.DEMO_USER || 'demo';
    const demoPass = process.env.DEMO_PASS || 'demo123';

    app.use((req, res, next) => {
        const auth = req.headers.authorization;
        // If no credentials are provided, prompt the browser for authentication
        if (!auth) {
            res.setHeader('WWW-Authenticate', 'Basic realm="Demo"');
            return res.status(401).send('Auth required');
        }

        // Split the authorization header into scheme and token
        const parts = auth.split(' ');
        if (parts.length !== 2 || parts[0] !== 'Basic') {
            res.setHeader('WWW-Authenticate', 'Basic realm="Demo"');
            return res.status(401).send('Auth required');
        }

        // Decode the base64 encoded credentials token
        const token = parts[1];
        let creds = '';
        try {
            creds = Buffer.from(token, 'base64').toString('utf8');
        } catch (e) {
            res.setHeader('WWW-Authenticate', 'Basic realm="Demo"');
            return res.status(401).send('Invalid auth token');
        }

        // Extract username and password and verify them against allowed credentials
        const [user, pass] = creds.split(':');
        if (user === demoUser && pass === demoPass) return next();

        // If credentials do not match, deny access
        res.setHeader('WWW-Authenticate', 'Basic realm="Demo"');
        return res.status(401).send('Invalid credentials');
    });
}

// Serve static files (HTML, CSS, Frontend JS) from the 'public' folder
app.use(express.static('public'));

// Connect to the SQLite database (creates the file automatically if it doesn't exist)
const db = new sqlite3.Database('./kniznica.db', (err) => {
    if (err) {
        // Log an error if the database connection fails
        console.error('Chyba pri pripájaní k databáze:', err.message);
    } else {
        // Log a success message upon successful connection
        console.log('Pripojené k SQLite databáze (súbor kniznica.db).');
    }
});

// Enable foreign key constraints to enforce database relationships
db.run('PRAGMA foreign_keys = ON');
    
// Execute database operations sequentially to ensure tables are created in the correct order
db.serialize(() => {
    // Table 1: Books schema with borrowing status tracker
    db.run(`CREATE TABLE IF NOT EXISTS books (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        author TEXT NOT NULL,
        is_borrowed INTEGER DEFAULT 0
    )`);

    // Table 2: Readers schema (ID card number used as TEXT primary key because it contains letters)
    db.run(`CREATE TABLE IF NOT EXISTS readers (
        op_number TEXT PRIMARY KEY,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        birth_date TEXT NOT NULL
    )`);

    // Table 3: Borrowings schema linking readers and books with foreign key constraints
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

// ==========================================
// 2. SERVER START (LISTEN FOR REQUESTS)
// ==========================================

// Main root route - serves the frontend home page (index.html) to the browser
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start the server and listen for incoming requests on the specified port
app.listen(PORT, () => {
    console.log(`Server štartuje! Otvor si v prehliadači: http://localhost:${PORT}`);
});

// ==========================================
// 3. API ENDPOINTS - BOOKS MANAGEMENT (GET, POST)
// ==========================================

// Route to add a new book to the database
app.post('/api/books', (req, res) => {
    const { title, author } = req.body;

    // Control 1: Check if required fields are provided
    if (!title || !author) {
        return res.status(400).json({ error: 'Názov knihy a autor sú povinné údaje!' });
    }

    // Control 2: Trim whitespace and check for empty strings
    const t = title.trim();
    const a = author.trim();
    if (t.length === 0 || a.length === 0) {
        return res.status(400).json({ error: 'Názov knihy a autor musia obsahovať platné znaky.' });
    }

    // Control 3: Enforce maximum length constraints to protect the database
    if (t.length > 200 || a.length > 200) {
        return res.status(400).json({ error: 'Názov alebo autor sú príliš dlhí (max 200 znakov).' });
    }

    // Secure SQL execution using parameterized queries (?, ?) to prevent SQL Injection
    const sql = `INSERT INTO books (title, author) VALUES (?, ?)`;
    db.run(sql, [t, a], function(err) {
        if (err) {
            console.error('Chyba pri ukladaní knihy:', err.message);
            return res.status(500).json({ error: 'Chyba servera pri ukladaní knihy.' });
        }
        res.status(201).json({ message: 'Kniha bola úspešne pridaná!', bookId: this.lastID });
    });
});

// Route to fetch all books along with information about who has them borrowed
app.get('/api/books', (req, res) => {
    // SQL query using LEFT JOINs to link books with active borrowings and reader details
    const sql = `
        SELECT k.*, 
               b.op_number, 
               c.first_name, 
               c.last_name
        FROM books k
        LEFT JOIN borrows b ON k.id = b.book_id
        LEFT JOIN readers c ON b.op_number = c.op_number
    `;
    
    // Execute the query to retrieve all matching rows from the database
    db.all(sql, [], (err, rows) => {
        // Check if the database query encountered an operational error
        if (err) {
            console.error('Chyba pri načítaní kníh:', err.message);
            return res.status(500).json({ error: 'Chyba servera pri načítaní kníh.' });
        }

        // Send the complete dataset back to the frontend in JSON format
        res.json(rows);
    });
});

// ==========================================
// 4. API ENDPOINTS - READERS MANAGEMENT
// ==========================================

// Route to register a new reader in the database
app.post('/api/readers', (req, res) => {
    let { op_number, first_name, last_name, birth_date } = req.body;

    // Control 1: Ensure all required fields are filled out
    if (!op_number || !first_name || !last_name || !birth_date) {
        return res.status(400).json({ error: 'Všetky údaje o čitateľovi sú povinné!' });
    }

    // Control 2: Format and validate national ID (OP) format (Expected: 2 letters, 6 digits)
    op_number = op_number.trim().toUpperCase(); 
    const opRegex = /^[A-Z]{2}\d{6}$/; // Regulárny výraz: 2 písmená (A-Z) a presne 6 čísel (\d{6})
    
    if (!opRegex.test(op_number)) {
        return res.status(400).json({ error: 'Nesprávny formát OP! Musí obsahovať 2 písmená a 6 čísiel (napr. EA123456).' });
    }

    // Helper function to enforce proper title case formatting (e.g., "jOHN" -> "John")
    const formatName = (name) => name.trim().charAt(0).toUpperCase() + name.trim().slice(1).toLowerCase();
    
    first_name = formatName(first_name);
    last_name = formatName(last_name);

    // Control 3: Validate the birth date structure (YYYY-MM-DD) and check physical existence
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(birth_date) || Number.isNaN(Date.parse(birth_date))) {
        return res.status(400).json({ error: 'Neplatný formát dátumu narodenia. Použite YYYY-MM-DD.' });
    }

    // Control 4: Enforce maximum text lengths to preserve database performance
    if (first_name.length > 100 || last_name.length > 100) {
        return res.status(400).json({ error: 'Meno alebo priezvisko sú príliš dlhé (max 100 znakov).' });
    }

    // Secure database insertion utilizing parameterized inputs to prevent injection exploits
    const sql = `INSERT INTO readers (op_number, first_name, last_name, birth_date) VALUES (?, ?, ?, ?)`;
    db.run(sql, [op_number, first_name, last_name, birth_date], function(err) {
        if (err) {
            console.error('Chyba pri ukladaní čitateľa:', err.message);

            // Handle primary key conflict if the ID card number already exists in the system
            if (err.message.includes('UNIQUE')) {
                return res.status(400).json({ error: 'Čitateľ s týmto číslom OP už je zaevidovaný!' });
            }
            return res.status(500).json({ error: 'Chyba servera pri ukladaní čitateľa.' });
        }
        res.status(201).json({ message: 'Čitateľ bol úspešne zaevidovaný!' });
    });
});

// Route to fetch all registered readers from the database
app.get('/api/readers', (req, res) => {
    const sql = `SELECT * FROM readers`;
    
    // Execute the query to select all records from the readers table
    db.all(sql, [], (err, rows) => {
        if (err) {
            console.error('Chyba pri načítaní čitateľov:', err.message);
            return res.status(500).json({ error: 'Chyba servera pri načítaní čitateľov.' });
        }

        // Return the full array of readers to the frontend as a JSON payload
        res.json(rows);
    });
});

// ==========================================
// 5. API ENDPOINTS - BORROWS MANAGEMENT
// ==========================================

// Route to create a new book borrowing record
app.post('/api/borrows', (req, res) => {
    const { op_number, book_id } = req.body;

    // Control 1: Ensure both reader ID and book ID are selected
    if (!op_number || !book_id) {
        return res.status(400).json({ error: 'Musíte vybrať čitateľa aj knihu!' });
    }

    // Convert string ID from frontend payload into an integer
    const parsedBookId = parseInt(book_id, 10);
    if (Number.isNaN(parsedBookId)) {
        return res.status(400).json({ error: 'Neplatné ID knihy.' });
    }

    // Generate today's date automatically in YYYY-MM-DD format
    const borrow_date = new Date().toISOString().split('T')[0]; 

    // DATABASE TRANSACTION BLOCK: Protect data integrity and consistency
    db.run('BEGIN TRANSACTION', (beginErr) => {
        if (beginErr) {
            console.error('Chyba pri začatí transakcie:', beginErr.message);
            return res.status(500).json({ error: 'Chyba servera.' });
        }

        // Step 1: Verify if the requested reader exists in the database
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

            // Step 2: Check the availability status of the requested book
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

                // Step 3: Insert the logging record into the borrows table
                db.run(`INSERT INTO borrows (op_number, book_id, borrow_date) VALUES (?, ?, ?)`, [op_number, parsedBookId, borrow_date], function(insertErr) {
                    if (insertErr) {
                        console.error('Chyba pri zápise výpožičky:', insertErr.message);
                        db.run('ROLLBACK', () => {});
                        return res.status(500).json({ error: 'Chyba servera pri vytváraní výpožičky.' });
                    }

                    // Step 4: Update the book status flag to borrowed (1)
                    db.run(`UPDATE books SET is_borrowed = 1 WHERE id = ?`, [parsedBookId], function(updateErr) {
                        if (updateErr) {
                            console.error('Chyba pri aktualizácii stavu knihy:', updateErr.message);
                            db.run('ROLLBACK', () => {});
                            return res.status(500).json({ error: 'Chyba servera pri aktualizácii stavu knihy.' });
                        }

                        // Success: Commit all operations to the database safely
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

// ==========================================
// 6. API ENDPOINTS - ADVANCED DATA RELATIONS & RECORD UPDATES
// ==========================================

// Route to fetch all active borrowings by joining books, readers, and borrows tables
app.get('/api/borrows', (req, res) => {
    const sql = `
        SELECT b.id as borrow_id, b.borrow_date, b.op_number,
               k.title as book_title, k.id as book_id,
               c.first_name, c.last_name
        FROM borrows b
        JOIN books k ON b.book_id = k.id
        JOIN readers c ON b.op_number = c.op_number
    `;

    // Execute the relational query to get all active borrow logs
    db.all(sql, [], (err, rows) => {
        if (err) {
            console.error('Chyba pri načítaní výpožičiek:', err.message);
            return res.status(500).json({ error: 'Chyba servera pri načítaní prehľadu.' });
        }
        res.json(rows);
    });
});

// Route to handle returning a book (deletes borrow log and releases the book status)
app.delete('/api/borrows/:id', (req, res) => {

    // Extract the target borrow record ID from the URL parameters
    const borrowId = parseInt(req.params.id, 10);
    if (Number.isNaN(borrowId)) {
        return res.status(400).json({ error: 'Neplatné ID výpožičky.' });
    }

    // Fetch the borrow record first to identify which book is being returned
    db.get(`SELECT book_id FROM borrows WHERE id = ?`, [borrowId], (err, row) => {
        if (err) {
            console.error('Chyba pri získavaní výpožičky:', err.message);
            return res.status(500).json({ error: 'Chyba servera pri spracovaní požiadavky.' });
        }
        if (!row) {
            return res.status(404).json({ error: 'Výpožička sa nenašla.' });
        }

        const bookId = row.book_id;

        /// START TRANSACTION: Ensure both delete and update execute atomically
        db.run('BEGIN TRANSACTION', (beginErr) => {
            if (beginErr) {
                console.error('Chyba pri začatí transakcie (vrátenie):', beginErr.message);
                return res.status(500).json({ error: 'Chyba servera.' });
            }

            // Step 1: Remove the active log row from the borrows table
            db.run(`DELETE FROM borrows WHERE id = ?`, [borrowId], function(delErr) {
                if (delErr) {
                    console.error('Chyba pri mazaní výpožičky:', delErr.message);
                    db.run('ROLLBACK', () => {});
                    return res.status(500).json({ error: 'Chyba pri vracaní knihy.' });
                }

                // Step 2: Reset the book's borrowing status flag back to available (0)
                db.run(`UPDATE books SET is_borrowed = 0 WHERE id = ?`, [bookId], function(upErr) {
                    if (upErr) {
                        console.error('Chyba pri aktualizácii stavu knihy po vrátení:', upErr.message);
                        db.run('ROLLBACK', () => {});
                        return res.status(500).json({ error: 'Chyba servera pri uvoľňovaní knihy.' });
                    }

                    // Success: Finalize the transaction and persist changes safely
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

// Route to delete a reader from the database
app.delete('/api/readers/:op', (req, res) => {
    const opNumber = req.params.op;

    // DATA INTEGRITY CHECK: Ensure the reader does not have any active borrowings before deletion
    db.get(`SELECT id FROM borrows WHERE op_number = ?`, [opNumber], (err, row) => {
        if (err) {
            console.error('Chyba pri kontrole výpožičiek:', err.message);
            return res.status(500).json({ error: 'Chyba servera pri overení čitateľa.' });
        }
        if (row) {
            return res.status(400).json({ error: 'Nemožno vymazať čitateľa, ktorý má aktuálne požičanú knihu!' });
        }

        // Safe deletion execution if no active borrowing record is found
        db.run(`DELETE FROM readers WHERE op_number = ?`, [opNumber], (delErr) => {
            if (delErr) {
                return res.status(500).json({ error: 'Chyba servera pri mazaní čitateľa.' });
            }
            res.json({ message: 'Čitateľ bol úspešne odstránený zo systému.' });
        });
    });
});

// Route to update/edit an existing book entry via PUT request
app.put('/api/books/:id', (req, res) => {
    const bookId = parseInt(req.params.id, 10);
    const { title, author } = req.body;

    // Control 1: Validate payload parameters and URL parameters
    if (Number.isNaN(bookId) || !title || !author) {
        return res.status(400).json({ error: 'Potrebujete ID knihy a nové údaje (názov + autor).' });
    }

    // Secure parameterized SQL update execution
    const sql = `UPDATE books SET title = ?, author = ? WHERE id = ?`;
    db.run(sql, [title.trim(), author.trim(), bookId], function(err) {
        if (err) {
            console.error('Chyba pri editácii knihy:', err.message);
            return res.status(500).json({ error: 'Chyba servera pri aktualizácii knihy.' });
        }

        // Check if the query matched and modified any rows in the database
        if (this.changes === 0) {
            return res.status(404).json({ error: 'Kniha sa nenašla.' });
        }
        res.json({ message: 'Kniha bola úspešne upravená.' });
    });
});

// Route to update/edit an existing reader entry via PUT request
app.put('/api/readers/:op', (req, res) => {
    const opNumber = req.params.op;
    let { first_name, last_name, birth_date } = req.body;

    // Control 1: Ensure all input fields are filled out
    if (!first_name || !last_name || !birth_date) {
        return res.status(400).json({ error: 'Všetky údaje o čitateľovi sú povinné!' });
    }

    // Data formatting helper block for title-casing strings
    const formatName = (name) => name.trim().charAt(0).toUpperCase() + name.trim().slice(1).toLowerCase();
    first_name = formatName(first_name);
    last_name = formatName(last_name);

    // Control 2: Validate birth date formatting and physical constraints
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(birth_date) || Number.isNaN(Date.parse(birth_date))) {
        return res.status(400).json({ error: 'Neplatný formát dátumu narodenia. Použite YYYY-MM-DD.' });
    }

    // Control 3: Enforce data length limitations
    if (first_name.length > 100 || last_name.length > 100) {
        return res.status(400).json({ error: 'Meno alebo priezvisko sú príliš dlhé (max 100 znakov).' });
    }

    // Secure parameterized SQL update execution
    const sql = `UPDATE readers SET first_name = ?, last_name = ?, birth_date = ? WHERE op_number = ?`;
    db.run(sql, [first_name, last_name, birth_date, opNumber], function(err) {
        if (err) {
            console.error('Chyba pri editácii čitateľa:', err.message);
            return res.status(500).json({ error: 'Chyba servera pri aktualizácii čitateľa.' });
        }

        // Verify database row modifications
        if (this.changes === 0) {
            return res.status(404).json({ error: 'Čitateľ sa nenašiel.' });
        }
        res.json({ message: 'Čitateľ bol úspešne upravený.' });
    });
});