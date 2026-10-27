// Disposable UI fixture only: no database, authentication, billing mutations or AI calls.
import express from 'express';
import { fileURLToPath } from 'node:url';
const capacity = Number(process.argv.find(arg => arg.startsWith('--capacity='))?.split('=')[1] || 3);
if (![1, 3].includes(capacity)) throw Error('UI fixture capacity must be 1 or 3.');
const app = express();
app.get('/api/team', (_req, res) => res.json({ divisions: [], agents: [], divisionCapacity: capacity }));
app.get('/api/config', (_req, res) => res.json({ demo: false, needsCode: false }));
app.get('/dashboard/billing', (_req, res) => res.send('<h1>UI TEST · Halaman langganan tujuan</h1><p>Fixture saja. Tidak ada pembelian atau perubahan paket.</p>'));
app.use('/api', (_req, res) => res.status(503).json({ error: 'UI fixture only' }));
app.use(express.static(fileURLToPath(new URL('../dist/', import.meta.url))));
const server = app.listen(5225, '127.0.0.1', () => console.log(`UI TEST only: http://127.0.0.1:5225/office.html?tenant=1 ; capacity=${capacity}; no DB/provider. Send stop to close.`));
process.stdin.on('data', value => { if (String(value).trim() === 'stop') { server.close(); server.closeAllConnections(); process.stdin.pause(); } });
