export {};

const TARGETS = [
  { name: "darwin-arm64", target: "bun-darwin-arm64", ext: "" },
  { name: "darwin-x64", target: "bun-darwin-x64", ext: "" },
  { name: "windows-x64", target: "bun-windows-x64", ext: ".exe" },
  { name: "linux-x64", target: "bun-linux-x64", ext: "" },
  { name: "linux-arm64", target: "bun-linux-arm64", ext: "" },
] as const;

const args = process.argv.slice(2);
const buildAll = args.includes("--all");
const targetArg = args.find((a) => a.startsWith("--target="))?.split("=")[1];

async function buildTarget(outfile: string, target?: string) {
  const result = await Bun.build({
    entrypoints: ["./server.ts", "./server-worker.ts"],
    compile: {
      outfile,
      ...(target ? { target: target as any } : {}),
    },
    minify: true,
    sourcemap: "linked",
  });

  if (!result.success) {
    for (const log of result.logs) console.error(log);
    throw new Error("Build failed");
  }
}

if (buildAll || targetArg) {
  // Cross-compilation mode — output to dist/
  const { mkdirSync } = await import("fs");
  mkdirSync("dist", { recursive: true });

  const selected = buildAll
    ? TARGETS
    : TARGETS.filter((t) => t.name === targetArg);

  if (selected.length === 0) {
    console.error(
      `Unknown target: ${targetArg}\nAvailable: ${TARGETS.map((t) => t.name).join(", ")}`
    );
    process.exit(1);
  }

  for (const { name, target, ext } of selected) {
    const outfile = `dist/markdown-to-pdf-${name}${ext}`;
    console.log(`Building for ${name}...`);
    try {
      await buildTarget(outfile, target);
      console.log(`  → ${outfile}`);
    } catch {
      console.error(`  ✗ Failed to build for ${name}`);
      process.exit(1);
    }
  }

  console.log("\nDone!");
} else {
  // Default: build for current platform
  try {
    await buildTarget("./markdown-to-pdf");
    console.log("Build successful!");
    console.log(`  → ./markdown-to-pdf`);
    console.log("\nRun with: ./markdown-to-pdf");
  } catch {
    process.exit(1);
  }
}

// Create macOS .app bundle if a darwin binary was built
if (buildAll || targetArg?.startsWith("darwin-") || (!buildAll && !targetArg)) {
  const { mkdirSync, writeFileSync, chmodSync, copyFileSync, existsSync } =
    await import("fs");

  // Determine which binary to bundle
  let binaryPath: string;
  if (targetArg?.startsWith("darwin-")) {
    binaryPath = `dist/markdown-to-pdf-${targetArg}`;
  } else if (buildAll) {
    // Use arm64 as the default for .app when building all
    binaryPath = "dist/markdown-to-pdf-darwin-arm64";
  } else {
    binaryPath = "./markdown-to-pdf";
  }

  if (existsSync(binaryPath)) {
    const appDir = buildAll || targetArg
      ? "dist/Markdown to PDF.app"
      : "Markdown to PDF.app";
    const contentsDir = `${appDir}/Contents`;
    const macosDir = `${contentsDir}/MacOS`;
    const resourcesDir = `${contentsDir}/Resources`;

    mkdirSync(macosDir, { recursive: true });
    mkdirSync(resourcesDir, { recursive: true });

    // Copy binary
    copyFileSync(binaryPath, `${macosDir}/markdown-to-pdf`);
    chmodSync(`${macosDir}/markdown-to-pdf`, 0o755);

    // Info.plist
    writeFileSync(
      `${contentsDir}/Info.plist`,
      `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key>
  <string>Markdown to PDF</string>
  <key>CFBundleDisplayName</key>
  <string>Markdown to PDF</string>
  <key>CFBundleIdentifier</key>
  <string>com.pdf-my-markdown.app</string>
  <key>CFBundleVersion</key>
  <string>1.0</string>
  <key>CFBundleExecutable</key>
  <string>markdown-to-pdf</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>LSMinimumSystemVersion</key>
  <string>11.0</string>
  <key>NSHighResolutionCapable</key>
  <true/>
</dict>
</plist>`
    );

    console.log(`\nmacOS app bundle created:`);
    console.log(`  → ${appDir}`);
  }
}
