# NEON//NOTES

A full-stack, no-build note workspace that turns raw notes into structured pages and spaced-repetition flashcards. It uses Express, better-sqlite3, and a vanilla HTML/CSS/JS frontend.

## Setup

```bash
npm install
cp .env.example .env
npm start
```

Open http://localhost:3000. On Windows PowerShell, use `Copy-Item .env.example .env`.

To enable AI cards, add an Anthropic API key to `.env`:

```env
ANTHROPIC_API_KEY=sk-ant-your-key
PORT=3000
```

The key remains server-side. The first run seeds a sample note. SQLite data is stored in `notes.db`; note versions and card progress persist across restarts. Upload `.txt`, `.md`, or `.docx` files, then use **Build Page**. Themes, export, study mode, search, restore, AI preview, and offline-safe autosave are included.

## Folder tree

```text
notes-app/
├── server.js
├── db.js
├── package.json
├── .env.example
├── .gitignore
├── README.md
└── public/
    ├── index.html
    ├── styles.css
    ├── app.js
    ├── parser.js
    ├── flashcards.js
    └── sound.js
```

## Ideas for extending

Add authentication and per-user databases, collaborative editing, richer Markdown parsing, image attachments, a service worker for true offline sync, and analytics for long-term retention.
