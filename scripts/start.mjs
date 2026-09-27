/**
 * npm start — builds the app and runs the full SignSphere (app + backend) on one address:
 *   http://localhost:8787   and   http://<this computer's IP>:8787 for other devices on the Wi-Fi
 */
import { execSync, spawn } from 'node:child_process';
import { networkInterfaces } from 'node:os';

const port = process.env.PORT ?? '8787';
if (!process.argv.includes('--no-build')) {
  console.log('Building the app…');
  execSync('npm run build --workspace @signsphere/web', { stdio: 'inherit', env: { ...process.env, VITE_API_URL: '/api' } });
}
const lan = Object.values(networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);
const server = spawn(process.execPath, ['services/api/src/server.mjs'], { stdio: 'inherit', env: { ...process.env, PORT: port } });
setTimeout(() => {
  for (const ip of lan) console.log(`  → on your Wi-Fi: http://${ip}:${port}  (camera needs HTTPS on other devices; everything else works)`);
}, 1500);
server.on('exit', (code) => process.exit(code ?? 0));
process.on('SIGINT', () => server.kill());
