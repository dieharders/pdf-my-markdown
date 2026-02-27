import MarkdownIt from "markdown-it";
import markdownItFootnote from "markdown-it-footnote";
import { generatePdf } from "./pdf";

// ---- Embedded Assets (bundled into the compiled binary) ----

import indexHtmlPath from "./public/index.html" with { type: "file" };
import styleCssPath from "./public/style.css" with { type: "file" };
import appJsPath from "./public/app.js" with { type: "file" };
import pdfStyleCssPath from "./pdf-style.css" with { type: "file" };

// ---- Markdown-it Setup ----

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
  breaks: false,
});

md.use(markdownItFootnote);

// ---- Custom Video Link Renderer ----

const VIDEO_EXTENSIONS = [".mp4", ".webm", ".mov", ".avi", ".mkv", ".ogv"];

function isVideoUrl(href: string): boolean {
  try {
    const url = new URL(href, "http://placeholder");
    const pathname = url.pathname.toLowerCase();
    return VIDEO_EXTENSIONS.some((ext) => pathname.endsWith(ext));
  } catch {
    return false;
  }
}

const defaultLinkOpen =
  md.renderer.rules.link_open ||
  function (tokens, idx, options, _env, self) {
    return self.renderToken(tokens, idx, options);
  };

const defaultLinkClose =
  md.renderer.rules.link_close ||
  function (tokens, idx, options, _env, self) {
    return self.renderToken(tokens, idx, options);
  };

md.renderer.rules.link_open = function (tokens, idx, options, env, self) {
  const hrefIndex = tokens[idx].attrIndex("href");
  const href = hrefIndex >= 0 ? tokens[idx].attrs![hrefIndex][1] : "";

  if (isVideoUrl(href)) {
    env.__isVideoLink = true;
    return `<a href="${md.utils.escapeHtml(href)}" class="video-card" target="_blank" rel="noopener">
      <span class="video-card__icon">&#9654;</span>
      <span class="video-card__content">
        <span class="video-card__label">Video</span>
        <span class="video-card__title">`;
  }

  tokens[idx].attrSet("target", "_blank");
  return defaultLinkOpen(tokens, idx, options, env, self);
};

md.renderer.rules.link_close = function (tokens, idx, options, env, self) {
  if (env.__isVideoLink) {
    env.__isVideoLink = false;
    return `</span>
        <span class="video-card__url">Click to watch video</span>
      </span>
    </a>`;
  }
  return defaultLinkClose(tokens, idx, options, env, self);
};

// ---- Color Palette Generator ----

function hexToHsl(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;

  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, s = 0;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }

  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

function generatePalette(hex: string): string {
  const [h, s, l] = hexToHsl(hex);
  return `:root {
    --color-primary: ${hex};
    --color-primary-h: ${h};
    --color-primary-s: ${s}%;
    --color-primary-l: ${l}%;
    --color-primary-light: hsl(${h}, ${Math.min(s + 10, 100)}%, 95%);
    --color-primary-lighter: hsl(${h}, ${Math.min(s + 5, 100)}%, 97%);
    --color-primary-medium: hsl(${h}, ${Math.max(s - 15, 20)}%, ${Math.min(l + 5, 55)}%);
    --color-primary-dark: hsl(${h}, ${Math.max(s - 20, 20)}%, ${Math.max(l - 20, 20)}%);
    --color-primary-border: hsl(${h}, ${Math.min(s, 80)}%, 78%);
  }`;
}

// ---- Video Tag → Card Converter ----

const VIDEO_TAG_RE = /<video[^>]*>[\s\S]*?<\/video>/gi;

function convertVideoTags(html: string): string {
  return html.replace(VIDEO_TAG_RE, (match) => {
    // Extract src from <source> child or from <video src="...">
    const srcMatch =
      match.match(/<source\s+[^>]*src="([^"]*)"/) ||
      match.match(/<video\s+[^>]*src="([^"]*)"/);
    const posterMatch = match.match(/<video\s+[^>]*poster="([^"]*)"/);

    const src = srcMatch?.[1] || "";
    const poster = posterMatch?.[1];
    const escapedSrc = md.utils.escapeHtml(src);
    const filename = src.split("/").pop() || "Video";

    const thumbnailHtml = poster
      ? `<img src="${md.utils.escapeHtml(poster)}" class="video-card__poster" alt="Video thumbnail">`
      : `<span class="video-card__icon">&#9654;</span>`;

    return `<a href="${escapedSrc}" class="video-card" target="_blank" rel="noopener">
      ${thumbnailHtml}
      <span class="video-card__content">
        <span class="video-card__label">Video</span>
        <span class="video-card__title">${md.utils.escapeHtml(filename)}</span>
        <span class="video-card__url">${escapedSrc}</span>
      </span>
    </a>`;
  });
}

// ---- HTML Template Builder ----

// Read the PDF stylesheet from embedded file
const pdfCssContent = await Bun.file(pdfStyleCssPath).text();

function buildHtmlDocument(bodyHtml: string, title = "Document", primaryColor = "#2563eb"): string {
  const palette = generatePalette(primaryColor);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${md.utils.escapeHtml(title)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>${palette}\n${pdfCssContent}</style>
</head>
<body>
  <article class="document">
    ${bodyHtml}
  </article>
</body>
</html>`;
}

// ---- Shared Form Parsing ----

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB per file

async function buildHtmlFromForm(formData: FormData): Promise<{ html: string; title: string }> {
  const files = formData.getAll("files") as File[];
  const primaryColor = (formData.get("primaryColor") as string) || "#2563eb";

  if (!files || files.length === 0) {
    throw Object.assign(new Error("No files uploaded"), { status: 400 });
  }

  for (const file of files) {
    if (!file.name.toLowerCase().endsWith(".md")) {
      throw Object.assign(new Error(`File "${file.name}" is not a markdown file`), { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE) {
      throw Object.assign(new Error(`File "${file.name}" exceeds 10MB limit`), { status: 400 });
    }
  }

  const markdownParts: string[] = [];
  for (const file of files) {
    markdownParts.push(await file.text());
  }

  const combinedMarkdown = markdownParts.join("\n\n---\n\n");
  const env: Record<string, unknown> = {};
  const htmlBody = convertVideoTags(md.render(combinedMarkdown, env));
  const title = files[0].name.replace(/\.md$/i, "");
  const html = buildHtmlDocument(htmlBody, title, primaryColor);

  return { html, title };
}

// ---- Preview Endpoint ----

async function handlePreview(req: Request): Promise<Response> {
  try {
    const formData = await req.formData();
    const { html } = await buildHtmlFromForm(formData);
    return new Response(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (err: any) {
    const status = err.status || 500;
    const message = err instanceof Error ? err.message : "Failed to generate preview";
    return Response.json({ error: message }, { status });
  }
}

// ---- Conversion Endpoint ----

async function handleConvert(req: Request): Promise<Response> {
  try {
    const formData = await req.formData();
    const { html, title } = await buildHtmlFromForm(formData);
    const pdfBuffer = await generatePdf(html);

    const filename = `${title}.pdf`;
    return new Response(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
        "Content-Length": String(pdfBuffer.length),
      },
    });
  } catch (err: any) {
    console.error("Conversion error:", err);
    const status = err.status || 500;
    const message = err instanceof Error ? err.message : "Failed to convert markdown to PDF";
    return Response.json({ error: message }, { status });
  }
}

// ---- Static File Serving (embedded assets) ----

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
};

const staticFiles: Record<string, { path: string; contentType: string }> = {
  "/": { path: indexHtmlPath, contentType: MIME_TYPES[".html"] },
  "/index.html": { path: indexHtmlPath, contentType: MIME_TYPES[".html"] },
  "/style.css": { path: styleCssPath, contentType: MIME_TYPES[".css"] },
  "/app.js": { path: appJsPath, contentType: MIME_TYPES[".js"] },
};

// ---- Server ----

const PORT = Number(process.env.PORT) || 3000;

const server = Bun.serve({
  port: PORT,
  routes: {
    "/convert": {
      POST: handleConvert,
    },
    "/preview": {
      POST: handlePreview,
    },
  },
  async fetch(req) {
    const url = new URL(req.url);
    const entry = staticFiles[url.pathname];

    if (entry) {
      return new Response(Bun.file(entry.path), {
        headers: { "Content-Type": entry.contentType },
      });
    }

    return new Response("Not Found", { status: 404 });
  },
});

console.log(`\n  Markdown-to-PDF converter running at:\n`);
console.log(`  → http://localhost:${server.port}\n`);
