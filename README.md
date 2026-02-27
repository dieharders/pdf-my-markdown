# Markdown to PDF

A simple drag-and-drop tool that converts markdown files to professionally styled PDFs. Built with Bun and compiles to a single standalone executable.

## Features

- Drag-and-drop `.md` files (or click to browse)
- Professional report-style PDF output with styled headings, code blocks, tables, blockquotes, and lists
- `.mp4` / `.webm` / `.mov` video links rendered as styled clickable cards
- Images embedded in the PDF
- Footnote support
- Multiple files combined into a single PDF
- Page numbers in the footer
- Compiles to a **58MB standalone binary** — no runtime dependencies

## Requirements

- [Bun](https://bun.sh) (for development and building)
- Google Chrome, Chromium, Edge, or Brave installed on the system (used for PDF rendering)

## Quick Start

```bash
# Install dependencies
bun install

# Start the dev server
bun run dev

# Open in your browser
open http://localhost:3000
```

## Build Standalone Executable

```bash
bun run build
```

This produces a `./markdown-to-pdf` binary. Run it from anywhere:

```bash
./markdown-to-pdf
```

## How It Works

1. You drop `.md` files onto the web UI
2. The server parses markdown with [markdown-it](https://github.com/markdown-it/markdown-it)
3. The parsed HTML is wrapped with a professional CSS theme
4. A headless Chrome instance (via Chrome DevTools Protocol) renders the HTML to PDF
5. The PDF is returned as a download

No Puppeteer or Playwright — a minimal CDP client (~150 lines) talks directly to Chrome over WebSocket, which avoids known `bun build --compile` bundling issues with those libraries.

## Configuration

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `PORT` | `3000` | Server port |
| `CHROME_PATH` | auto-detected | Path to Chrome/Chromium binary |

## Project Structure

```
server.ts        — Bun.serve() server, markdown parsing, conversion endpoint
pdf.ts           — Minimal CDP client, Chrome launcher, PDF generation
pdf-style.css    — Professional report theme for PDF content
public/
  index.html     — Drag-and-drop UI
  app.js         — Frontend logic
  style.css      — UI styling
build.ts         — Compile to standalone executable
```
