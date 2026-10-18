// Starts the dev server and opens the app in a browser once it's ready,
// like `flutter run -d chrome`. Usage: node scripts/dev.mjs [msedge|chrome]
import { spawn } from "node:child_process";

const browser = process.argv[2] ?? "msedge";
const DEFAULT_URL = "http://localhost:3000";

function openBrowser(url) {
  console.log(`\n  Opening ${url} in ${browser}…\n`);
  spawn("cmd", ["/c", "start", "", browser, url], { stdio: "ignore", detached: true }).unref();
}

async function isUp(url) {
  try {
    await fetch(url, { signal: AbortSignal.timeout(3000) });
    return true;
  } catch {
    return false;
  }
}

// Only one dev server can run per project folder. If it's already running, just open it.
if (await isUp(DEFAULT_URL)) {
  console.log(`  FairShare is already running at ${DEFAULT_URL}.`);
  openBrowser(DEFAULT_URL);
  process.exit(0);
}

const server = spawn("npx", ["next", "dev"], { stdio: ["inherit", "pipe", "inherit"], shell: true });

let url = DEFAULT_URL;
let opened = false;

server.stdout.on("data", async (chunk) => {
  const text = chunk.toString();
  process.stdout.write(text);

  // Next prints "Local: http://localhost:3000" (or another port if 3000 is busy), then "Ready".
  const local = text.match(/Local:\s+(http:\/\/localhost:\d+)/);
  if (local) url = local[1];

  if (!opened && text.includes("Ready")) {
    opened = true;
    if (await isUp(url)) openBrowser(url);
    else console.log(`\n  The server said "Ready" but ${url} isn't answering. Check the messages above.\n`);
  }
});

server.on("exit", (code) => process.exit(code ?? 0));
