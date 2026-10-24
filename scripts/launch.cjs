const { spawn } = require('node:child_process');
const path = require('node:path');
const environment = { ...process.env };
delete environment.ELECTRON_RUN_AS_NODE;
const target = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(__dirname, '..');
const desktop = spawn(require('electron').trim(), [target], { stdio: 'inherit', windowsHide: true, env: environment });
desktop.on('error', error => { console.error(error.message); process.exitCode = 1; });
desktop.on('exit', code => process.exit(code || 0));
