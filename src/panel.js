import { agentById as defaultAgent, agentsOf as defaultAgents, divisionById as defaultDivision } from '../shared/roster.js';
import { renderMarkdown } from './md.js';
import { getHistory, setHistory, clearHistory, streamChat, prepareChat, tenantOffice, getChatScope } from './chat.js';
import { persistentChat, getConversations, getConversationId, prepareConversation, changeConversation, loadOlderChat, hasOlderMessages, hasOlderConversations } from './chat.js';
import { getChatModels, getConversationModel, selectConversationModel, canSelectChatModel } from './chat.js';

const $ = (id) => document.getElementById(id);
const initials = (name) => name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();

export function createPanel({ onSelect, onClose, onStatus, onNeedCode, isDemo, jobs, roster }) {
  const agentById = roster ? (id) => roster.agents.find((a) => a.id === id) : defaultAgent;
  const agentsOf = roster ? (id) => roster.agents.filter((a) => a.division === id) : defaultAgents;
  const divisionById = roster ? (id) => roster.divisions.find((d) => d.id === id) : defaultDivision;
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

  function renderConversations() {
    const tools = $('conversation-tools');
    if (!tools) return;
    tools.hidden = !persistentChat() || preparing || Boolean(chatError);
    if (tools.hidden) { $('chat-list').innerHTML = ''; $('chat-title').value = ''; return; }
    const list = $('chat-list'), id = getConversationId(currentId);
    list.innerHTML = '';
    const empty = document.createElement('option'); empty.value = ''; empty.textContent = 'Chat baru'; list.appendChild(empty);
    for (const conversation of getConversations(currentId)) {
      const option = document.createElement('option'); option.value = conversation.id; option.textContent = conversation.title; list.appendChild(option);
    }
    list.value = id || '';
    $('chat-title').value = getConversations(currentId).find((item) => item.id === id)?.title || '';
    const modelSelect = $('chat-model'), modelId = getConversationModel(currentId);
    $('chat-model-field').hidden = !canSelectChatModel();
    $('chat-model-info').hidden = !canSelectChatModel();
    modelSelect.innerHTML = '';
    const defaultModel = document.createElement('option'); defaultModel.value = ''; defaultModel.textContent = 'Ikuti model default agen'; modelSelect.appendChild(defaultModel);
    const options = getChatModels();
    for (const model of options) { const option = document.createElement('option'); option.value = model.id; option.textContent = model.label; modelSelect.appendChild(option); }
    if (modelId && !options.some((model) => model.id === modelId)) { const removed = document.createElement('option'); removed.value = modelId; removed.textContent = `${modelId} — tidak tersedia`; modelSelect.appendChild(removed); }
    modelSelect.value = modelId || '';
    $('chat-model-info').textContent = `${options.find((model) => model.id === modelId)?.description || (modelId ? 'Model ini tidak lagi diizinkan server. Pilih model lain.' : 'Mengikuti konfigurasi model agen.')} Tarif rupiah belum tersedia; belum ada pemotongan Saldo AI. Berlaku untuk pesan berikutnya.`;
    const disabled = preparing || live.has(currentId) || Boolean(chatError);
    for (const key of ['chat-new', 'chat-list', 'chat-title', 'chat-archive', 'chat-more', 'chat-older', 'chat-model']) $(key).disabled = disabled || (['chat-title', 'chat-archive'].includes(key) && !id);
    $('chat-title-form').hidden = !id;
    $('chat-more').hidden = !hasOlderConversations(currentId);
    $('chat-older').hidden = !hasOlderMessages(currentId);
  }

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
    const greeting = document.createElement('b'); greeting.textContent = `Halo, gue ${first}`;
    const detail = document.createElement('span'); detail.textContent = `${agent.role}. Tanya soal ${agent.focus}.`;
    e.appendChild(greeting); e.appendChild(detail);
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
        const icon = document.createElement('i'); icon.textContent = initials(m.name);
        b.appendChild(icon);
        const label = document.createElement('span'); label.textContent = m.name.split(' ')[0]; b.appendChild(label);
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
      const message = m.role === 'user' ? bubble('user', '', { text: m.content }) : bubble('assistant', renderMarkdown(m.content));
      if (m.role === 'assistant' && m.modelId) { const label = document.createElement('small'); label.className = 'message-model'; label.textContent = m.modelId; message.appendChild(label); }
      els.messages.appendChild(message);
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
    renderConversations();
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
      setHistory(id, [...sent, { role: 'assistant', content: full, ...(sent.at(-1).modelId ? { modelId: sent.at(-1).modelId } : {}) }], scope);
      live.delete(id);
      renderConversations();
      if (l.el && currentId === id && getChatScope() === scope) l.el.querySelector('.bubble').innerHTML = renderMarkdown(full);
      if (l.el && sent.at(-1).modelId) { const label = document.createElement('small'); label.className = 'message-model'; label.textContent = sent.at(-1).modelId; l.el.appendChild(label); }
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
  $('chat-new')?.addEventListener('click', () => { if (currentId && !preparing && !live.has(currentId)) return openAgent(currentId, null); });
  $('chat-list')?.addEventListener('change', (event) => { if (currentId && !preparing && !live.has(currentId)) return openAgent(currentId, event.target.value || null); });
  async function conversationAction(action, nextChoice) {
    if (!currentId || preparing || live.has(currentId)) return;
    const id = currentId, version = ++openVersion;
    prepareController?.abort(); prepareController = new AbortController();
    preparing = true; renderConversations(); syncSend();
    try {
      await action(id, prepareController.signal);
      if (version !== openVersion) return;
      preparing = false;
      if (nextChoice !== undefined) return openAgent(id, nextChoice);
      render(id);
    } catch (error) { if (version === openVersion) { preparing = false; chatError = error.message; render(id); } }
  }
  $('chat-title-form')?.addEventListener('submit', (event) => {
    event.preventDefault(); const title = $('chat-title').value.trim();
    if (!title || title.length > 100) return;
    return conversationAction((id, signal) => changeConversation(id, { title }, signal), getConversationId(currentId));
  });
  $('chat-archive')?.addEventListener('click', () => conversationAction((id, signal) => changeConversation(id, { archive: true }, signal), null));
  $('chat-more')?.addEventListener('click', () => conversationAction((id, signal) => loadOlderChat(id, 'conversations', signal)));
  $('chat-older')?.addEventListener('click', () => conversationAction((id, signal) => loadOlderChat(id, 'messages', signal)));
  $('chat-model')?.addEventListener('change', (event) => {
    const modelId = event.target.value || null;
    return conversationAction((id, signal) => selectConversationModel(id, modelId, signal));
  });
  els.reset.addEventListener('click', () => {
    if (!currentId) return;
    live.get(currentId)?.abort.abort();
    live.delete(currentId);
    clearHistory(currentId);
    if (tenantOffice) return openAgent(currentId, persistentChat() ? null : undefined);
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

  async function openAgent(agentId, conversationId) {
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
        if (version !== openVersion) return;
        await prepareConversation(agentId, prepareController.signal, conversationId);
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
