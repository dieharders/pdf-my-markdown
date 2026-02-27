const result = await Bun.build({
  entrypoints: ["./server.ts"],
  compile: {
    outfile: "./markdown-to-pdf",
  },
  minify: true,
  sourcemap: "linked",
});

if (!result.success) {
  console.error("Build failed:");
  for (const log of result.logs) {
    console.error(log);
  }
  process.exit(1);
}

console.log("Build successful!");
console.log(`  → ./markdown-to-pdf`);
console.log("\nRun with: ./markdown-to-pdf");
