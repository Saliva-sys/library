// Simple end-to-end test using global fetch (Node 18+)
const base = 'http://localhost:3000';

async function req(path, opts) {
  const res = await fetch(base + path, opts);
  const body = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, body };
}

async function run() {
  console.log('Starting E2E test...');

  // Add a book
  let r = await req('/api/books', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'E2E Test Book', author: 'Tester' }) });
  console.log('Create book', r.status, r.body);

  // Add a reader
  r = await req('/api/readers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op_number: 'ZZ000001', first_name: 'Eva', last_name: 'Testerova', birth_date: '1995-02-02' }) });
  console.log('Create reader', r.status, r.body);

  // List books to find inserted book id
  r = await req('/api/books', { method: 'GET' });
  const book = r.body && r.body.find(b => b.title === 'E2E Test Book');
  if (!book) {
    console.error('Book not found');
    return process.exit(2);
  }

  // Borrow the book
  r = await req('/api/borrows', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op_number: 'ZZ000001', book_id: book.id }) });
  console.log('Borrow book', r.status, r.body);

  // List borrows
  r = await req('/api/borrows', { method: 'GET' });
  console.log('Active borrows count:', Array.isArray(r.body) ? r.body.length : 0);

  // Return the book: find borrow id
  const borrow = r.body && r.body.find(b => b.book_id === book.id);
  if (!borrow) {
    console.error('Borrow record not found');
    return process.exit(3);
  }

  r = await req(`/api/borrows/${borrow.borrow_id}`, { method: 'DELETE' });
  console.log('Return book', r.status, r.body);

  console.log('E2E test finished successfully.');
}

run().catch(err => { console.error(err); process.exit(1); });
