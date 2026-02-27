/**
 * Minimal Chrome DevTools Protocol (CDP) client for PDF generation.
 * Avoids Puppeteer/Playwright which have bun build --compile issues.
 */

import { existsSync } from "node:fs";

// ---- Chrome Finder ----

const CHROME_PATHS: Record<string, string[]> = {
  darwin: [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
  ],
  linux: [
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/snap/bin/chromium",
    "/usr/bin/microsoft-edge",
    "/usr/bin/brave-browser",
  ],
  win32: [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe",
  ],
};

function findChrome(): string {
  const platform = process.platform;
  const paths = CHROME_PATHS[platform] || [];

  for (const p of paths) {
    if (existsSync(p)) return p;
  }

  throw new Error(
    `Chrome/Chromium not found. Install Google Chrome or set CHROME_PATH env var.\n` +
    `Searched: ${paths.join(", ")}`
  );
}

// ---- CDP Client ----

let nextId = 1;

interface CDPResponse {
  id: number;
  result?: Record<string, unknown>;
  error?: { message: string; code?: number };
}

function cdpSend(
  ws: WebSocket,
  method: string,
  params: Record<string, unknown> = {}
): Promise<CDPResponse["result"]> {
  return new Promise((resolve, reject) => {
    const id = nextId++;

    const handler = (event: MessageEvent) => {
      const msg: CDPResponse = JSON.parse(event.data as string);
      if (msg.id !== id) return;
      ws.removeEventListener("message", handler);
      if (msg.error) {
        reject(new Error(`CDP ${method}: ${msg.error.message}`));
      } else {
        resolve(msg.result);
      }
    };

    ws.addEventListener("message", handler);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

function waitForEvent(
  ws: WebSocket,
  eventName: string,
  timeout = 30000
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.removeEventListener("message", handler);
      reject(new Error(`Timeout waiting for ${eventName}`));
    }, timeout);

    const handler = (event: MessageEvent) => {
      const msg = JSON.parse(event.data as string);
      if (msg.method === eventName) {
        clearTimeout(timer);
        ws.removeEventListener("message", handler);
        resolve(msg.params);
      }
    };

    ws.addEventListener("message", handler);
  });
}

// ---- Chrome Launcher ----

interface ChromeInstance {
  process: ReturnType<typeof Bun.spawn>;
  wsEndpoint: string;
}

async function launchChrome(): Promise<ChromeInstance> {
  const chromePath = process.env.CHROME_PATH || findChrome();
  const port = 9222 + Math.floor(Math.random() * 1000);

  const proc = Bun.spawn([
    chromePath,
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--disable-extensions",
    `--remote-debugging-port=${port}`,
    "--remote-debugging-address=127.0.0.1",
    "about:blank",
  ], {
    stdout: "ignore",
    stderr: "pipe",
  });

  // Wait for Chrome to start and get the WebSocket endpoint
  const maxRetries = 30;
  let wsEndpoint = "";

  for (let i = 0; i < maxRetries; i++) {
    await new Promise((r) => setTimeout(r, 200));
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      const data = await res.json() as { webSocketDebuggerUrl: string };
      wsEndpoint = data.webSocketDebuggerUrl;
      break;
    } catch {
      // Chrome not ready yet
    }
  }

  if (!wsEndpoint) {
    proc.kill();
    throw new Error("Failed to connect to Chrome. Is it installed correctly?");
  }

  return { process: proc, wsEndpoint };
}

// ---- PDF Generation ----

export async function generatePdf(htmlContent: string): Promise<Buffer> {
  const chrome = await launchChrome();

  try {
    const ws = new WebSocket(chrome.wsEndpoint);
    await new Promise<void>((resolve, reject) => {
      ws.addEventListener("open", () => resolve());
      ws.addEventListener("error", (e) => reject(new Error(`WebSocket error: ${e}`)));
    });

    // Create a new target (tab)
    const target = await cdpSend(ws, "Target.createTarget", {
      url: "about:blank",
    });
    const targetId = target!.targetId as string;

    // Attach to the target to get a session
    const session = await cdpSend(ws, "Target.attachToTarget", {
      targetId,
      flatten: true,
    });
    const sessionId = session!.sessionId as string;

    // Helper to send commands to the specific session
    const sessionSend = (
      method: string,
      params: Record<string, unknown> = {}
    ): Promise<CDPResponse["result"]> => {
      return new Promise((resolve, reject) => {
        const id = nextId++;

        const handler = (event: MessageEvent) => {
          const msg = JSON.parse(event.data as string);
          if (msg.id !== id) return;
          ws.removeEventListener("message", handler);
          if (msg.error) {
            reject(new Error(`CDP ${method}: ${msg.error.message}`));
          } else {
            resolve(msg.result);
          }
        };

        ws.addEventListener("message", handler);
        ws.send(
          JSON.stringify({ id, method, params, sessionId })
        );
      });
    };

    // Wait for session events on the target
    const waitForSessionEvent = (
      eventName: string,
      timeout = 30000
    ): Promise<Record<string, unknown>> => {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          ws.removeEventListener("message", handler);
          reject(new Error(`Timeout waiting for ${eventName}`));
        }, timeout);

        const handler = (event: MessageEvent) => {
          const msg = JSON.parse(event.data as string);
          if (msg.method === eventName && msg.sessionId === sessionId) {
            clearTimeout(timer);
            ws.removeEventListener("message", handler);
            resolve(msg.params);
          }
        };

        ws.addEventListener("message", handler);
      });
    };

    // Enable page events
    await sessionSend("Page.enable");

    // Set the HTML content
    // First get the frame tree to find the frameId
    const frameTree = await sessionSend("Page.getFrameTree");
    const frameId = (frameTree!.frameTree as { frame: { id: string } }).frame.id;

    await sessionSend("Page.setDocumentContent", {
      frameId,
      html: htmlContent,
    });

    // Wait for network to settle (images loading)
    await sessionSend("Page.enable");
    await sessionSend("Network.enable");

    // Give time for images to load
    await new Promise((r) => setTimeout(r, 2000));

    // Emulate screen media for background colors
    await sessionSend("Emulation.setEmulatedMedia", {
      media: "screen",
    });

    // Generate PDF
    const pdfResult = await sessionSend("Page.printToPDF", {
      printBackground: true,
      paperWidth: 8.5,
      paperHeight: 11,
      marginTop: 0.75,
      marginRight: 0.75,
      marginBottom: 1,
      marginLeft: 0.75,
      displayHeaderFooter: true,
      headerTemplate: "<div></div>",
      footerTemplate: `<div style="width: 100%; height: 100%; position: relative; font-size: 9px; font-family: Inter, Helvetica, Arial, sans-serif; color: #aaa;">
        <span style="position: absolute; bottom: 0.2in; left: 0; right: 0; text-align: center;">
          <span class="pageNumber"></span> of <span class="totalPages"></span>
        </span>
      </div>`,
    });

    const pdfData = pdfResult!.data as string;
    const pdfBuffer = Buffer.from(pdfData, "base64");

    // Cleanup
    await cdpSend(ws, "Target.closeTarget", { targetId });
    ws.close();

    return pdfBuffer;
  } finally {
    chrome.process.kill();
  }
}
