/**
 * npm run dev — starts the SignSphere backend server and the app together.
 *   App:  http://localhost:5173   (API calls go to the server through /api)
 * Works on Windows, macOS and Linux. Ctrl+C stops both.
 */
import { spawn } from 'node:child_process';

const children = [];
const run = (label, command, args, env = {}) => {
  const child = spawn(command, args, { stdio: 'inherit', env: { ...process.env, ...env }, shell: process.platform === 'win32' });
  child.on('exit', (code) => {
    if (code && code !== 0) console.error(`\n[${label}] stopped (exit ${code}).`);
    for (const other of children) if (other !== child) other.kill();
    process.exit(code ?? 0);
  });
  children.push(child);
};

run('server', process.execPath, ['services/api/src/server.mjs']);
run('app', 'npm', ['run', 'dev', '--workspace', '@signsphere/web'], { VITE_API_URL: '/api' });

const stop = () => {
  for (const child of children) child.kill();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
