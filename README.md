# library
Small app for library administration

## Table of contents

- [Overview](#overview)
  - [Modernization suggestions](#modernization-suggestions)
- [How To](#how-to)
  - [Run & test](#run--test)
  - [Quick API checks (examples)](#quick-api-checks-examples)
  - [Start / Stop the server](#start--stop-the-server)
- [Run different modes](#run-different-modes)
  - [Demo auth mode](#demo-auth-mode)
  - [Run demo mode](#run-demo-mode)
  - [Run normal mode without auth on a different port](#run-normal-mode-without-auth-on-a-different-port)
  - [Environment variables](#environment-variables)
  - [Browser note](#browser-note)

## Overview

- Small app for library administration

### Modernization suggestions

- Consider using a templating layer or frontend framework for larger apps: e.g. EJS, Pug, React, Vue, or Svelte.
- Add authentication and CSRF protection for any real production use.
- Validate all input server-side and deploy behind HTTPS if the app becomes public-facing.

## How to

### Run & test

Start the app locally and open it in your browser:

```bash
npm install
npm start
# then open http://localhost:3000
```

### Quick API checks (examples):

**PowerShell:**
```bash
# Add a book
curl -X POST -H "Content-Type: application/json" -d '{"title":"Test","author":"Autor"}' http://localhost:3001/api/books

# Add a reader
curl -X POST -H "Content-Type: application/json" -d '{"op_number":"EA123456","first_name":"Ján","last_name":"Novák","birth_date":"1990-01-01"}' http://localhost:3001/api/readers

# Borrow a book (use actual bookId from response)
curl -X POST -H "Content-Type: application/json" -d '{"op_number":"EA123456","book_id":1}' http://localhost:3001/api/borrows
```

**CMD (if PowerShell syntax doesn't work, use this instead):**
```bash
# Add a book
curl -X POST -H "Content-Type: application/json" -d "{\"title\":\"Test\",\"author\":\"Autor\"}" http://localhost:3001/api/books

# Add a reader
curl -X POST -H "Content-Type: application/json" -d "{\"op_number\":\"EA123456\",\"first_name\":\"Ján\",\"last_name\":\"Novák\",\"birth_date\":\"1990-01-01\"}" http://localhost:3001/api/readers

# Borrow a book (use actual bookId from response)
curl -X POST -H "Content-Type: application/json" -d "{\"op_number\":\"EA123456\",\"book_id\":1}" http://localhost:3001/api/borrows
```

Notes:
- For presentation via Teams, run the app locally and share the browser window or use a tunnel (ngrok) if remote access is needed.
- Do not commit `kniznica.db` to version control (it's ignored by `.gitignore`).

### Start / Stop the server

Yes — if the server is stopped you'll need to start it again to use the app. Typical commands:

```bash
# install deps (only first time)
npm install

# start the server normally on port 3000
npm start

# stop the server: press Ctrl+C in the terminal where it's running

# seed demo data (optional)
npm run seed

# run automated e2e test (optional)
npm run test:e2e
```

If you start the server in one terminal and close that terminal, the server will stop — restart with `npm start`.

## Run different modes

### Demo auth mode

The app now supports an optional demo authentication mode: the middleware is enabled only when `DEMO_AUTH=true`.

### Run demo mode

```bash
# run demo mode on port 3000 with default credentials
$env:DEMO_AUTH='true'
$env:DEMO_USER='demo'
$env:DEMO_PASS='demo123'
$env:PORT='3000'
npm start
```

### Run normal mode without auth on a different port

```bash
Remove-Item Env:\DEMO_AUTH -ErrorAction SilentlyContinue
$env:PORT='3001'
npm start
```

Yes — môžete mať spustené obe verzie naraz, ale každá musí bežať na inom porte. Napríklad demo verzia na `http://localhost:3000` a normálna verzia na `http://localhost:3001`.

### Environment variables

- `DEMO_AUTH=true` — zapne demo Basic Auth
- `DEMO_USER` — demo užívateľ (predvolené `demo`)
- `DEMO_PASS` — demo heslo (predvolené `demo123`)
- `PORT` — port, na ktorom server beží (predvolené `3000`)

### Browser note

Ak prehliadač po otvorení stránky vyžaduje prihlasovanie, zadajte používateľa a heslo podľa `DEMO_USER` a `DEMO_PASS`.

Napríklad pre predvolené hodnoty použite:

- používateľ: `demo`
- heslo: `demo123`

