import { agentById, agentsOf, divisionById } from '../shared/roster.js';
import { renderMarkdown } from './md.js';
import { getHistory, setHistory, clearHistory, streamChat, prepareChat, tenantOffice, getChatScope } from './chat.js';

const $ = (id) => document.getElementById(id);
const initials = (name) => name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();

export function createPanel({ onSelect, onClose, onStatus, onNeedCode, isDemo, jobs }) {
  const els = {
    avatar: $('avatar'),
    name: $('who-name'),
    role: $('who-role'),
    mates: $('mates'),
    messages: $('messages'),
    quick: $('quick'),
    form: $('composer'),
    input: $('input'),
    send: $('btn-send'),
    reset: $('btn-reset'),
    close: $('btn-close'),
  };

  let currentId = null;
  let preparing = false;
  let chatError = '';
  let prepareController = null;
  let openVersion = 0;
  const live = new Map(); // agentId -> { text, el, abort }

  const scrollDown = (force = false) => {
    const m = els.messages;
    const near = m.scrollHeight - m.scrollTop - m.clientHeight < 140;
    if (force || near) m.scrollTop = m.scrollHeight;
  };

  function bubble(role, html, { text } = {}) {
    const wrap = document.createElement('div');
    wrap.className = `msg ${role}`;
    const b = document.createElement('div');
    b.className = 'bubble';
    if (role === 'user') b.textContent = text;
    else b.innerHTML = html;
    wrap.appendChild(b);
    if (role === 'assistant') {
      const tools = document.createElement('div');
      tools.className = 'tools';
      tools.innerHTML = '<button type="button" data-copy>Salin</button>';
      wrap.appendChild(tools);
    }
    return wrap;
  }

  const typingHtml = '<span class="typing" aria-label="Sedang mengetik"><i></i><i></i><i></i></span>';

  function paint(l) {
    if (!l.el) return;
    const b = l.el.querySelector('.bubble');
    b.innerHTML = l.text ? renderMarkdown(l.text) : typingHtml;
    scrollDown();
  }

  function renderEmpty(agent) {
    const first = agent.name.split(' ')[0];
    const e = document.createElement('div');
    e.className = 'empty';
    e.innerHTML = `<b>Halo, gue ${first}</b>${agent.role}. Tanya soal ${agent.focus}.`;
    els.messages.appendChild(e);
    els.quick.innerHTML = '';
    for (const q of agent.quick) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'q';
      btn.textContent = q;
      btn.addEventListener('click', () => submit(q));
      els.quick.appendChild(btn);
    }
  }

  function render(agentId, notice = chatError || (preparing ? 'Memeriksa sesi dan workspace…' : '')) {
    const agent = agentById(agentId);
    const div = divisionById(agent.division);
    document.body.style.setProperty('--c', div.color);
    els.avatar.style.setProperty('--c', div.color);
    els.avatar.textContent = initials(agent.name);
    els.name.textContent = agent.name;
    els.role.textContent = `${agent.role} · ${div.name}`;

    // rekan satu divisi
    els.mates.innerHTML = '';
    const team = agentsOf(agent.division);
    if (team.length > 1) {
      for (const m of team) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'mate';
        b.style.setProperty('--c', div.color);
        b.setAttribute('aria-current', String(m.id === agentId));
        b.innerHTML = `<i>${initials(m.name)}</i>${m.name.split(' ')[0]}`;
        b.addEventListener('click', () => onSelect(m.id));
        els.mates.appendChild(b);
      }
    }

    els.messages.innerHTML = '';
    els.quick.innerHTML = '';
    // Agent identity is independent of service availability. Never show old content
    // while session/workspace validation is pending or has failed.
    if (notice) {
      els.messages.textContent = notice;
      scrollDown(true);
      syncSend();
      return;
    }
    const history = getHistory(agentId);
    const l = live.get(agentId);
    if (!history.length && !l) renderEmpty(agent);
    for (const m of history) {
      els.messages.appendChild(m.role === 'user' ? bubble('user', '', { text: m.content }) : bubble('assistant', renderMarkdown(m.content)));
    }
    if (l) {
      l.el = bubble('assistant', typingHtml);
      els.messages.appendChild(l.el);
      paint(l);
    }
    scrollDown(true);
    syncSend();
  }

  function syncSend() {
    const busy = live.has(currentId);
    els.input.disabled = preparing || Boolean(chatError);
    els.send.disabled = preparing || Boolean(chatError) || busy || !els.input.value.trim();
    els.input.placeholder = busy ? `${agentById(currentId).name.split(' ')[0]} lagi ngetik…` : 'Tulis pesan…';
  }

  async function submit(text) {
    const id = currentId;
    text = (text || '').trim();
    if (!id || !text || preparing || chatError || live.has(id)) return;

    const history = getHistory(id);
    const scope = getChatScope();
    const sent = [...history, { role: 'user', content: text }];
    setHistory(id, sent, scope);

    els.messages.querySelector('.empty')?.remove();
    els.quick.innerHTML = '';
    els.messages.appendChild(bubble('user', '', { text }));
    els.input.value = '';
    autosize();

    const l = { text: '', el: null, abort: new AbortController(), previousHistory: history, scope };
    live.set(id, l);
    l.el = bubble('assistant', typingHtml);
    els.messages.appendChild(l.el);
    scrollDown(true);
    onStatus(id, 'working');
    syncSend();

    try {
      const full = await streamChat(id, sent, {
        signal: l.abort.signal,
        onText: (_t, all) => {
          if (tenantOffice && getChatScope() !== scope) { l.abort.abort(); return; }
          l.text = all;
          if (!l.raf) {
            l.raf = requestAnimationFrame(() => {
              l.raf = 0;
              paint(l);
            });
          }
        },
      });
      if (live.get(id) !== l) return;
      setHistory(id, [...sent, { role: 'assistant', content: full }], scope);
      live.delete(id);
      if (l.el && currentId === id && getChatScope() === scope) l.el.querySelector('.bubble').innerHTML = renderMarkdown(full);
      onStatus(id, 'done');
    } catch (err) {
      if (live.get(id) !== l) return;
      live.delete(id);
      onStatus(id, 'idle');
      if (err.name === 'AbortError') {
        if (!err.resetHistory) setHistory(id, sent.slice(0, -1), scope);
      } else {
        // kembalikan teks ke kolom input supaya bisa dikirim ulang
        if (!err.resetHistory) setHistory(id, sent.slice(0, -1), scope);
        else { stopLive(); chatError = err.message; if (currentId) render(currentId); }
        if (currentId === id) {
          l.el?.remove();
          const e = bubble('assistant', '');
          e.classList.add('error');
          e.querySelector('.bubble').textContent = err.message;
          e.querySelector('.tools')?.remove();
          els.messages.appendChild(e);
          els.input.value = text;
          autosize();
          scrollDown(true);
        }
        if (err.code === 401 && !tenantOffice) onNeedCode();
      }
    } finally {
      if (l.raf) cancelAnimationFrame(l.raf);
      if (currentId === id) syncSend();
    }
  }

  function autosize() {
    els.input.style.height = 'auto';
    els.input.style.height = `${Math.min(els.input.scrollHeight, 140)}px`;
  }

  // ---------- event ----------
  els.form.addEventListener('submit', (e) => {
    e.preventDefault();
    return submit(els.input.value);
  });
  els.input.addEventListener('input', () => {
    autosize();
    syncSend();
  });
  els.input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      submit(els.input.value);
    }
  });
  els.close.addEventListener('click', () => onClose());
  els.reset.addEventListener('click', () => {
    if (!currentId) return;
    live.get(currentId)?.abort.abort();
    live.delete(currentId);
    clearHistory(currentId);
    if (tenantOffice) return openAgent(currentId);
    render(currentId);
  });
  els.messages.addEventListener('click', (e) => {
    const copyCode = e.target.closest('.copy');
    const copyMsg = e.target.closest('[data-copy]');
    const flash = (btn, t) => {
      const old = btn.textContent;
      btn.textContent = t;
      setTimeout(() => { btn.textContent = old; }, 1200);
    };
    const write = async (text, btn) => {
      try {
        await navigator.clipboard.writeText(text);
        flash(btn, 'Tersalin');
      } catch {
        flash(btn, 'Gagal');
      }
    };
    if (copyCode) write(copyCode.parentElement.querySelector('code').textContent, copyCode);
    else if (copyMsg) write(copyMsg.closest('.msg').querySelector('.bubble').innerText, copyMsg);
  });

  // ---------- tab Chat | Perintah ----------
  const panelEl = $('panel');
  const tabBtns = [...document.querySelectorAll('#tabs [data-tab]')];
  function setTab(tab) {
    panelEl.dataset.tab = tab;
    tabBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tab === tab)));
    if (tab === 'chat' && matchMedia('(hover: hover)').matches) els.input.focus({ preventScroll: true });
  }
  tabBtns.forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));

  function stopLive() {
    for (const [id, active] of live) {
      active.abort.abort();
      if (active.raf) cancelAnimationFrame(active.raf);
      setHistory(id, active.previousHistory, active.scope);
    }
    live.clear();
  }

  async function openAgent(agentId) {
    if (!agentById(agentId)) return;
    prepareController?.abort();
    if (tenantOffice) stopLive();
    if (currentId !== agentId) { els.input.value = ''; autosize(); }
    currentId = agentId;
    const version = ++openVersion;
    chatError = '';
    preparing = tenantOffice;
    // Update avatar/name/role/team immediately, including on the very first click.
    render(agentId);
    setTab('chat');
    jobs?.setAgent(agentId);
    if (tenantOffice) {
      prepareController = new AbortController();
      try {
        await prepareChat(prepareController.signal);
      } catch (error) {
        if (version !== openVersion) return;
        preparing = false;
        chatError = error.message;
        render(agentId);
        return;
      }
      if (version !== openVersion) return;
      preparing = false;
    }
    render(agentId);
    if (isDemo()) document.getElementById('banner').hidden = false;
    setTimeout(() => {
      if (version === openVersion && matchMedia('(hover: hover)').matches) els.input.focus({ preventScroll: true });
    }, 350);
  }

  return {
    setTab,
    open: openAgent,
    close() {
      openVersion += 1;
      prepareController?.abort();
      if (tenantOffice) stopLive();
      currentId = null;
    },
    get current() {
      return currentId;
    },
  };
}
