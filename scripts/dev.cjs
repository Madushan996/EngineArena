const { spawn } = require('node:child_process');
const http = require('node:http');
const path = require('node:path');
const vite = spawn(process.execPath, [path.join(path.dirname(require.resolve('vite/package.json')), 'bin', 'vite.js'), '--host', '127.0.0.1'], { stdio: 'inherit', windowsHide: true });
let desktop;
const timer = setInterval(() => {
  http.get('http://127.0.0.1:5173', res => {
    res.resume();
    clearInterval(timer);
    desktop = spawn(require('electron').trim(), [path.resolve(__dirname, '..')], { stdio: 'inherit', windowsHide: true, env: { ...process.env, ARENA_DEV: '1' } });
    desktop.on('exit', () => { vite.kill(); process.exit(); });
  }).on('error', () => {});
}, 500);
process.on('SIGINT', () => { clearInterval(timer); desktop?.kill(); vite.kill(); process.exit(); });
