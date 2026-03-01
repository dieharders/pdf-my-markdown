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

/**
 * Patch a Windows PE executable so it runs as a GUI app (no console window).
 * Changes the Subsystem field from CONSOLE (3) to WINDOWS (2).
 *
 * This is the same technique used by Microsoft's `editbin /SUBSYSTEM:WINDOWS`
 * and by Bun's own `--windows-hide-console` internally. We do it manually
 * because Bun's flag is broken (oven-sh/bun#19916) and doesn't support
 * cross-compilation anyway.
 */
async function patchWindowsSubsystem(exePath: string) {
  const file = Bun.file(exePath);
  const buf = Buffer.from(await file.arrayBuffer());

  // DOS header must be at least 0x40 bytes to contain e_lfanew
  if (buf.length < 0x40) {
    throw new Error("File too small to be a valid PE executable");
  }

  // e_lfanew: offset to PE signature, stored at DOS header offset 0x3C
  const peOffset = buf.readUInt32LE(0x3c);

  // Subsystem is at optional-header offset 68 (0x44)
  // Optional header starts after PE sig (4) + COFF header (20)
  const subsystemOffset = peOffset + 4 + 20 + 68;

  // Ensure the file is large enough to contain the subsystem field
  if (subsystemOffset + 2 > buf.length) {
    throw new Error("PE file is truncated — subsystem field out of bounds");
  }

  // Verify PE signature ("PE\0\0")
  if (buf.toString("ascii", peOffset, peOffset + 4) !== "PE\0\0") {
    throw new Error("Not a valid PE file");
  }

  const current = buf.readUInt16LE(subsystemOffset);

  if (current === 3) {
    // IMAGE_SUBSYSTEM_WINDOWS_CUI → IMAGE_SUBSYSTEM_WINDOWS_GUI
    buf.writeUInt16LE(2, subsystemOffset);
    await Bun.write(exePath, buf);
    console.log(`  → Patched PE subsystem to GUI (no console window)`);
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
      `Unknown target: ${targetArg}\nAvailable: ${TARGETS.map((t) => t.name).join(", ")}`,
    );
    process.exit(1);
  }

  for (const { name, target, ext } of selected) {
    const outfile = `dist/markdown-to-pdf-${name}${ext}`;
    console.log(`Building for ${name}...`);
    try {
      await buildTarget(outfile, target);
      if (ext === ".exe") await patchWindowsSubsystem(outfile);
      console.log(`  → ${outfile}`);
    } catch {
      console.error(`  ✗ Failed to build for ${name}`);
      process.exit(1);
    }
  }

  console.log("\nDone!");
} else {
  // Default: build for current platform
  const ext = process.platform === "win32" ? ".exe" : "";
  const outfile = `./markdown-to-pdf${ext}`;
  try {
    await buildTarget(outfile);
    if (process.platform === "win32") await patchWindowsSubsystem(outfile);
    console.log("Build successful!");
    console.log(`  → ${outfile}`);
    console.log(`\nRun with: ${outfile}`);
  } catch (e) {
    console.error(e);
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
    const appDir =
      buildAll || targetArg
        ? "dist/Markdown to PDF-macos.app"
        : "Markdown to PDF-macos.app";
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
</plist>`,
    );

    console.log(`\nmacOS app bundle created:`);
    console.log(`  → ${appDir}`);
  }
}

// Create Linux .desktop file if a linux binary was built
if (buildAll || targetArg?.startsWith("linux-")) {
  const { writeFileSync, existsSync } = await import("fs");

  const linuxTargets = buildAll
    ? TARGETS.filter((t) => t.name.startsWith("linux-"))
    : TARGETS.filter((t) => t.name === targetArg);

  for (const { name } of linuxTargets) {
    const binaryPath = `dist/markdown-to-pdf-${name}`;
    if (!existsSync(binaryPath)) continue;

    const desktopFile = `dist/markdown-to-pdf-${name}.desktop`;
    const binaryAbsPath = require("path").resolve(binaryPath);
    writeFileSync(
      desktopFile,
      `[Desktop Entry]
Type=Application
Name=Markdown to PDF
Comment=Convert Markdown files to styled PDFs
Exec=${binaryAbsPath}
Icon=markdown-to-pdf
Terminal=false
Categories=Office;Utility;
MimeType=text/markdown;text/x-markdown;
`,
    );

    console.log(`\nLinux .desktop file created:`);
    console.log(`  → ${desktopFile}`);
  }
}
