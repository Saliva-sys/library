# library
Small app for library administration

## Modernization suggestions
- Move frontend JavaScript into a separate file (`public/app.js`) instead of keeping it inline in `public/index.html`.
- Consider using a templating layer or frontend framework for larger apps: e.g. EJS, Pug, React, Vue, or Svelte.
- Add authentication and CSRF protection for any real production use.
- Validate all input server-side and deploy behind HTTPS if the app becomes public-facing.

