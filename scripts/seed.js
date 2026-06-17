// Connect to the library database with verbose error logging
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./kniznica.db');

// Run SQL commands strictly in sequence
db.serialize(() => {

  // Define sample data arrays for books and readers
  // Insert sample books
  const books = [
    ['Da Vinciho kód', 'Dan Brown'],
    ['Malý princ', 'Antoine de Saint-Exupéry'],
    ['Pýcha a predsudok', 'Jane Austen']
  ];

  // Insert sample readers
  const readers = [
    ['EA123456', 'Ján', 'Novák', '1990-01-01'],
    ['AB111111', 'Mária', 'Kováčová', '1985-05-12']
  ];

// Prepare and execute SQL to insert sample books
  const insertBook = db.prepare('INSERT INTO books (title, author) VALUES (?, ?)');
  books.forEach(b => insertBook.run(b[0], b[1]));
  insertBook.finalize();

  // Prepare and execute SQL to insert sample readers (ignoring duplicates)
  const insertReader = db.prepare('INSERT OR IGNORE INTO readers (op_number, first_name, last_name, birth_date) VALUES (?, ?, ?, ?)');
  readers.forEach(r => insertReader.run(r[0], r[1], r[2], r[3]));
  insertReader.finalize();

  console.log('Seed data inserted.');
  db.close();
});
