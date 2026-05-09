# Adventure Jar

A one-page GitHub Pages site for tracking adventures over a year. Each adventure becomes an image ball that drops into a lavender jar.

## Files

- `index.html` - app markup and dialogs
- `styles.css` - responsive layout, jar styling, and modal styling
- `script.js` - login, saved jars, image handling, and Matter.js physics

## Run Locally

Open `index.html` in a browser, or run a small static server from this folder:

```bash
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

## GitHub Pages

In the repo settings, enable GitHub Pages for this branch and use the repository root as the publishing source.

## Login Note

GitHub Pages cannot run a private backend by itself. The username/password system here is intentionally simple and stores each jar in the browser's local storage. It is useful for personal tracking on the same device and browser, but it is not secure account authentication or cross-device syncing.
