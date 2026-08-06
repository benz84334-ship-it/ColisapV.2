import { execFileSync, spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function clearStaleVitePorts() {
  if (process.platform !== 'win32') return;

  const ports = ['5173', '5174', '5179'];
  const pids = new Set();

  try {
    const output = execFileSync('netstat', ['-ano'], { encoding: 'utf8' });
    for (const line of output.split(/\r?\n/)) {
      if (!line.includes('LISTENING')) continue;
      if (!ports.some((port) => line.includes(`:${port}`))) continue;
      const match = line.trim().match(/(\d+)$/);
      if (match) pids.add(match[1]);
    }
  } catch {
    return;
  }

  if (!pids.size) return;

  try {
    execFileSync(
      'powershell.exe',
      ['-NoProfile', '-Command', `Stop-Process -Id ${Array.from(pids).join(',')} -Force -ErrorAction SilentlyContinue`],
      { stdio: 'ignore' },
    );
    console.log(`Cleared stale Vite process${pids.size > 1 ? 'es' : ''} on ports 5173/5174/5179.`);
  } catch {
    // Let Vite report any remaining port conflict.
  }
}

clearStaleVitePorts();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const child = process.platform === 'win32'
  ? spawn(
      'cmd.exe',
      ['/c', path.join(__dirname, '..', 'node_modules', '.bin', 'vite.cmd'), '--port', '5173', '--strictPort'],
      {
        stdio: 'inherit',
        shell: false,
      },
    )
  : spawn(
      path.join(__dirname, '..', 'node_modules', '.bin', 'vite'),
      ['--port', '5173', '--strictPort'],
      {
        stdio: 'inherit',
        shell: false,
      },
    );

child.on('exit', (code) => {
  if (code && code !== 0) {
    process.exitCode = code;
  }
});
