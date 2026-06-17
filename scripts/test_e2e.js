// Simple End-to-End (E2E) test utilizing the global fetch API (available in Node.js 18+)
// The test runs on port 3001 to prevent interfering with the live demo application running on port 3000
const base = 'http://localhost:3001';

/**
 * Helper asynchronous function to dispatch HTTP requests to the test environment.
 * Automatically processes the response stream and gracefully handles JSON parsing errors.
 */
async function req(path, opts) {
  const res = await fetch(base + path, opts);
  const body = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, body };
}

/**
 * Main execution scenario for the E2E test.
 * Sequentially simulates real-world user interactions: adding a book, registering a reader, and executing a borrow action.
 */
async function run() {
  console.log('Starting E2E test...');

  // --- STEP 1: Insert a new test book record ---
  let r = await req('/api/books', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'E2E Test Book', author: 'Tester' }) });
  console.log('Create book', r.status, r.body);

  // --- STEP 2: Register a new test reader record ---
  r = await req('/api/readers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op_number: 'ZZ000001', first_name: 'Eva', last_name: 'Testerova', birth_date: '1995-02-02' }) });
  console.log('Create reader', r.status, r.body);

  // --- STEP 3: Retrieve book catalog to verify the generated book ID ---
  r = await req('/api/books', { method: 'GET' });

  // Locating our specific test entry within the database payload array to capture its auto-incremented ID
  const book = r.body && r.body.find(b => b.title === 'E2E Test Book');
  if (!book) {
    console.error('Book not found');
    return process.exit(2);
  }

  // --- STEP 4: Instantiate a book borrow record ---
  // Mapping the extracted book ID to the test reader's identification key (op_number)
  r = await req('/api/borrows', { 
    method: 'POST', 
    headers: { 'Content-Type': 'application/json' }, 
    body: JSON.stringify({ op_number: 'ZZ000001', book_id: book.id }) });
  console.log('Borrow book', r.status, r.body);

  // --- STEP 5: Perform final sanity check on active borrows payload ---
  r = await req('/api/borrows', { method: 'GET' });
  console.log('Active borrows count:', Array.isArray(r.body) ? r.body.length : 0);

  // --- STEP 6: Return the book by extracting the dynamic borrow transaction ID ---
  const borrow = r.body && r.body.find(b => b.book_id === book.id);
  if (!borrow) {
    console.error('Borrow record not found');
    return process.exit(3);
  }

  // Execute the transaction deletion via DELETE endpoint using the borrow_id
  r = await req(`/api/borrows/${borrow.borrow_id}`, { method: 'DELETE' });
  console.log('Return book', r.status, r.body);

  console.log('E2E test finished successfully.');
}

// Global execution wrapper capturing top-level unhandled asynchronous rejections
run().catch(err => { 
  console.error(err); 
  process.exit(1); 
});
