import { spawn } from 'node:child_process';

const api = spawn(process.execPath, ['server/index.js'], { stdio: 'inherit' });
const web = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1'], { stdio: 'inherit' });
for (const task of [api, web]) task.on('exit', () => process.exit());
process.on('SIGINT', () => { api.kill(); web.kill(); });
