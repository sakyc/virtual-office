// Isolated UI verification only. Never imports database/session/provider modules.
import express from 'express';
import { createServer } from 'vite';
const app = express();
app.use(express.json());
app.post('/api/account/password', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.body.currentPassword !== 'Lentera!9Kantor') return res.status(400).json({ code: 'CURRENT_PASSWORD_INCORRECT' });
  res.json({ next: '/login' });
});
app.get('/login', (_req, res) => res.send('<h1>UI FIXTURE: password-change success redirect</h1><p>No account or password was actually changed.</p>'));
app.get('/', async (_req, res) => res.type('html').send(await vite.transformIndexHtml('/', `<!doctype html><html><head><title>Password UI fixture</title></head><body style="margin:0;background:#f6f7fb;font-family:system-ui"><div id="fixture"></div><script type="module">
import React from 'react';
import { createRoot } from 'react-dom/client';
import { PasswordSettings } from '/src/react/password-settings.jsx';
import '/src/react/account-settings.css';
import '/src/react/dashboard-overview.css';
createRoot(document.getElementById('fixture')).render(React.createElement('main', {className:'reference-dashboard',style:{maxWidth:650,margin:'30px auto',padding:24,'--line':'#dce0eb','--ink':'#17223c','--bg':'#f6f7fb','--surface':'#fff','--mute':'#58657c','--soft':'#58657c','--onAccent':'#fff','--accent':'#6554df'}}, React.createElement('p',null,'UI FIXTURE — no database. Test old password: Lentera!9Kantor'),React.createElement('div',{className:'live-overview account-settings'},React.createElement(PasswordSettings))));
</script></body></html>`)));
const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' });
app.use(vite.middlewares);
const server = app.listen(5226, '127.0.0.1', () => console.log('Password UI fixture: http://127.0.0.1:5226 (no DB/provider calls)'));
async function close() { server.closeAllConnections(); server.close(); await vite.close(); process.exit(0); }
process.on('SIGINT', close); process.on('SIGTERM', close);
