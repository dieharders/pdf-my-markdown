const headless = process.argv.includes("--headless");

// Spawn the HTTP server in a worker thread (webview must run on the main thread)
const worker = new Worker(new URL("./server-worker.ts", import.meta.url).href);

// Wait for the server to report it is ready
const serverReady = new Promise<number>((resolve, reject) => {
  const timeout = setTimeout(() => {
    reject(new Error("Server failed to start within 10 seconds"));
  }, 10_000);

  worker.onmessage = (event) => {
    if (event.data?.type === "ready") {
      clearTimeout(timeout);
      resolve(event.data.port as number);
    }
  };

  worker.onerror = (event) => {
    clearTimeout(timeout);
    reject(new Error(`Worker error: ${event.message}`));
  };
});

const port = await serverReady;
const url = `http://localhost:${port}`;

if (headless) {
  // Headless mode — just run the server without a window
  console.log(`\n  Markdown-to-PDF converter running at:\n`);
  console.log(`  → ${url}\n`);
} else {
  // Try to open a native webview window; fall back to headless
  try {
    const { Webview } = await import("webview-bun");

    const webview = new Webview();
    webview.title = "Markdown to PDF";
    webview.size = { width: 1024, height: 768, hint: 0 };
    webview.navigate(url);

    console.log(`Markdown-to-PDF converter opened (server on port ${port})`);

    // Blocks until the window is closed
    webview.run();

    // Window closed — shut down
    worker.terminate();
    process.exit(0);
  } catch (err) {
    // Webview unavailable — fall back to browser mode
    console.log(`\n  Markdown-to-PDF converter running at:\n`);
    console.log(`  → ${url}\n`);
    console.log(`  (Native window unavailable, open the URL above in your browser)\n`);
  }
}
