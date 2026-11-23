// Tutor de Português — all state is local (localStorage). The only network call is to Gemini, one per learner turn.
const TURNS = 6;            // learner turns per ~5 min lesson => 6 API calls per lesson
const HISTORY_SENT = 6;     // only the last N messages are sent, to keep tokens tiny
const $app = document.getElementById('app');
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { localStorage.setItem(k, JSON.stringify(v)); }
};
const cfg = () => ({ key: '', model: 'gemini-flash-lite-latest', budget: 400, ...store.get('cfg', {}) });
const progress = () => store.get('progress', { done: [], notes: [] });
const today = () => new Date().toISOString().slice(0, 10);
const usage = () => { const u = store.get('usage', {}); return u.d === today() ? u.n : 0; };
const bump = () => store.set('usage', { d: today(), n: usage() + 1 });
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------- speech ----------
let ptVoice = null;
function pickVoice() {
  const vs = speechSynthesis.getVoices();
  ptVoice = vs.find(v => v.lang === 'pt-BR' && /luciana|felipe|enhanced|premium/i.test(v.name)) || vs.find(v => v.lang === 'pt-BR') || null;
}
if ('speechSynthesis' in window) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
function speak(text, rate = 0.9) {
  if (!('speechSynthesis' in window)) return;
  if (!ptVoice) pickVoice();
  if (speechSynthesis.speaking || speechSynthesis.pending) speechSynthesis.cancel();
  speechSynthesis.resume();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'pt-BR'; u.rate = rate; u.volume = 1; if (ptVoice) u.voice = ptVoice;
  u.onerror = e => { if (e.error !== 'canceled' && e.error !== 'interrupted') window.__ttsErr = e.error; };
  speechSynthesis.speak(u);
}
// iOS only allows speech after one utterance started from a tap; call this inside tap handlers.
function unlockAudio() {
  if (!('speechSynthesis' in window)) return;
  const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u);
}
const IOS_STANDALONE = navigator.standalone === true;
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

// ---------- home ----------
function home() {
  const p = progress(), c = cfg();
  const act = store.get('active', null);
  const next = (act && LESSONS.find(l => l.id === act.id)) || LESSONS.find(l => !p.done.includes(l.id)) || LESSONS[LESSONS.length - 1];
  $app.innerHTML = `
  <header><h1>🇧🇷 Português</h1><button class="ghost" id="gear">⚙️</button></header>
  <div class="prog"><i style="width:${p.done.length / LESSONS.length * 100}%"></i></div>
  <div class="pad">
    <div class="card"><div class="small">${act ? 'Em andamento' : 'Próxima lição'} · ${next.level}</div><h2 style="margin:4px 0">${esc(next.title)}</h2>
      <div class="small">${esc(next.scenario)}</div><br><button class="primary" id="go">${act ? `Continuar (${act.turn}/${TURNS})` : 'Começar (~5 min)'}</button>${act ? ' <button id="restart">Recomeçar</button>' : ''}</div>
    <div class="small">Chamadas hoje: ${usage()} / ${c.budget} · uma lição ≈ ${TURNS} chamadas</div>
    ${!c.key ? '<div class="card">⚠️ Add your free Gemini API key in ⚙️ first.</div>' : ''}
    ${(() => { const h = store.get('history', []); return h.length ? `<h2>Conversas anteriores</h2>${h.map((x, i) => `<div class="lesson hist" data-i="${i}"><span>💬 ${esc(x.title)}</span><span class="small">${esc(x.date)}</span></div>`).reverse().join('')}` : ''; })()}
    <h2>Todas as lições</h2>
    ${LESSONS.map(l => `<div class="lesson ${p.done.includes(l.id) ? 'done' : ''}" data-id="${l.id}"><span>${p.done.includes(l.id) ? '✅' : '▶️'} ${l.id}. ${esc(l.title)}</span><span class="small">${l.level}</span></div>`).join('')}
    ${p.notes.length ? `<h2>Para revisar</h2>${p.notes.slice(-8).reverse().map(n => `<div class="card small">${esc(n)}</div>`).join('')}` : ''}
  </div>`;
  document.getElementById('go').onclick = () => { unlockAudio(); lesson(next); };
  document.getElementById('restart')?.addEventListener('click', () => { localStorage.removeItem('active'); unlockAudio(); lesson(next); });
  document.getElementById('gear').onclick = settings;
  document.querySelectorAll('.hist').forEach(el => el.onclick = () => review(store.get('history', [])[el.dataset.i]));
  document.querySelectorAll('.lesson:not(.hist)').forEach(el => el.onclick = () => {
    // a lesson you already completed opens its saved conversation first
    const hs = store.get('history', []).filter(x => x.id == el.dataset.id && !(act && act.id == x.id));
    if (hs.length) return review(hs[hs.length - 1], true);
    unlockAudio(); if (act && act.id != el.dataset.id) localStorage.removeItem('active'); lesson(LESSONS.find(l => l.id == el.dataset.id)); });
}

function settings() {
  const c = cfg();
  $app.innerHTML = `<header><h1>Settings</h1><button class="ghost" id="back">✕</button></header><div class="pad">
    <p class="small">Free key: aistudio.google.com/apikey (stored only on this phone).</p>
    <p>Gemini API key</p><input id="key" type="password" value="${esc(c.key)}" autocomplete="off">
    <p>Model <span class="small">(Flash-Lite has the biggest free daily allowance)</span></p><input id="model" value="${esc(c.model)}">
    <p>Daily call budget <span class="small">(app stops before your free limit; check your limit at aistudio.google.com)</span></p><input id="budget" type="number" value="${c.budget}">
    <br><br><button class="primary" id="save">Save</button> <button id="reset">Reset progress</button></div>`;
  document.getElementById('back').onclick = home;
  document.getElementById('save').onclick = () => {
    store.set('cfg', { key: key.value.trim(), model: model.value.trim() || 'gemini-flash-lite-latest', budget: +budget.value || 400 }); home();
  };
  document.getElementById('reset').onclick = () => { if (confirm('Reset all progress?')) { store.set('progress', { done: [], notes: [] }); home(); } };
}

// ---------- Gemini ----------
const SCHEMA = {
  type: 'OBJECT',
  properties: {
    reply: { type: 'STRING' }, hint_en: { type: 'STRING' },
    corrections: { type: 'ARRAY', items: { type: 'OBJECT', properties: { said: { type: 'STRING' }, better: { type: 'STRING' }, why: { type: 'STRING' } }, required: ['said', 'better', 'why'] } },
    pronunciation: { type: 'STRING' },
    summary: { type: 'STRING' }
  },
  required: ['reply', 'hint_en', 'corrections']
};

function systemPrompt(l, turn) {
  return `You are a warm, patient Brazilian Portuguese (pt-BR, never European) speaking tutor for an English speaker.
Learner level: ${l.level} — ${LEVELS[l.level]}.
Lesson: "${l.title}". Role-play: ${l.scenario} Target phrases: ${l.phrases.join(' | ') || 'free'}. Grammar focus: ${l.grammar}.
Each turn: (1) "reply": 1–2 short pt-BR sentences in character, at the learner's level, ending with a question or prompt that makes them speak; weave in a target phrase. (2) "hint_en": English translation, under 15 words. (3) "corrections": 0–2 of the learner's most important errors in their LAST message (grammar, wrong word, unnatural phrasing); each "why" under 15 words, English. Empty array if fine. The input is a speech-to-text transcript: ignore punctuation, capitalization and accents. (4) "pronunciation": only if the transcript suggests a mispronounced word (recognizer wrote a different word than the likely intended one) or a classic pt-BR pitfall in what they said (nasal vowels ão/ãe, r/rr as h, d/t before i = dj/tch, lh, final l = w); one tip under 20 words; else omit.
This is learner turn ${turn} of ${TURNS}.${turn >= TURNS ? ' FINAL turn: say a brief goodbye in "reply" and fill "summary": one English line with what they did well, the top 2 things to practice, and 3 new words (word=meaning).' : ''}`;
}

async function callGemini(l, turn, msgs, withThinking = true) {
  const c = cfg();
  if (usage() >= c.budget) throw new Error('Daily budget reached. Come back tomorrow or raise it in ⚙️.');
  const body = {
    systemInstruction: { parts: [{ text: systemPrompt(l, turn) }] },
    contents: msgs.slice(-HISTORY_SENT).map(m => ({ role: m.role === 'ai' ? 'model' : 'user', parts: [{ text: m.text }] })),
    generationConfig: { responseMimeType: 'application/json', responseSchema: SCHEMA, temperature: 0.7, maxOutputTokens: 400,
      ...(withThinking ? { thinkingConfig: { thinkingBudget: 0 } } : {}) }
  };
  let r;
  for (let attempt = 0; attempt < 4; attempt++) { // 503/500/504 = Google temporarily overloaded: retry quietly
    r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(c.model)}:generateContent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': c.key }, body: JSON.stringify(body)
    });
    if (![500, 503, 504].includes(r.status)) break;
    await new Promise(res => setTimeout(res, 1500 * (attempt + 1)));
  }
  if ([500, 503, 504].includes(r.status)) throw new Error('Google\'s server is busy right now. Your message is kept — tap ➤ to try again.');
  if (r.status === 429) throw new Error('Free-tier limit hit (429). Try again later or tomorrow.');
  if (r.status === 400 && withThinking) return callGemini(l, turn, msgs, false);
  if (!r.ok) throw new Error(`API error ${r.status}: ${(await r.text()).slice(0, 200)}`);
  bump();
  const j = await r.json();
  return JSON.parse(j.candidates[0].content.parts.map(p => p.text || '').join(''));
}

// ---------- lesson ----------
// every word is tappable for a definition
const wordsHtml = t => String(t ?? '').split(/([\p{L}\p{M}'-]+)/u).map((p, i) => i % 2 ? `<span class="w">${esc(p)}</span>` : esc(p)).join('');
function entryHtml(e, showHint = false) {
  if (e.k === 'ai') return `<div class="msg ai"><span class="pt">${wordsHtml(e.text)}</span> <button class="ghost" data-s="${esc(e.text)}">🔊</button><button class="ghost" data-slow="${esc(e.text)}">🐢</button><div class="en" style="display:${showHint ? 'block' : 'none'}">${esc(e.hint)}</div></div>`;
  if (e.k === 'me') return `<div class="msg me">${wordsHtml(e.text)}</div>`;
  if (e.k === 'fix') return `<div class="fix"><b>✏️ ${esc(e.said)}</b> → ${esc(e.better)}<br><span class="small">${esc(e.why)}</span></div>`;
  if (e.k === 'tip') return `<div class="fix tip">🗣️ ${esc(e.text)}</div>`;
  return '';
}
// ---------- dictionary (Wiktionary, free, no AI quota; falls back to one optional AI call) ----------
const strip = h => h.replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
async function lookup(word) {
  const w = word.toLowerCase(), cache = store.get('dict', {});
  if (cache[w]) return cache[w];
  const r = await fetch('https://en.wiktionary.org/api/rest_v1/page/definition/' + encodeURIComponent(w));
  if (!r.ok) return null;
  const pt = (await r.json()).pt;
  if (!pt) return null;
  const out = pt.slice(0, 3).map(s => ({ pos: s.partOfSpeech, defs: s.definitions.map(d => strip(d.definition)).filter(Boolean).slice(0, 3) }));
  cache[w] = out; store.set('dict', cache);
  return out;
}
async function aiDefine(word, sentence) {
  const c = cfg();
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(c.model)}:generateContent`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': c.key },
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: `Brazilian Portuguese word "${word}" in the sentence: "${sentence}". Give the English meaning and, if it is a verb form, the infinitive. Max 20 words.` }] }], generationConfig: { maxOutputTokens: 80 } })
  });
  if (!r.ok) throw new Error('AI error ' + r.status);
  bump();
  return (await r.json()).candidates[0].content.parts.map(p => p.text || '').join('');
}
async function showDef(word, sentence) {
  $app.querySelector('.dict')?.remove();
  $app.insertAdjacentHTML('beforeend', `<div class="dict"><div><b>${esc(word)}</b> <button class="ghost" data-s="${esc(word)}">🔊</button><button class="ghost" id="dx" style="float:right">✕</button></div><div id="dbody" class="small">…</div></div>`);
  const box = $app.querySelector('.dict'), body = box.querySelector('#dbody');
  box.querySelector('#dx').onclick = () => box.remove();
  box.querySelector('[data-s]').onclick = () => speak(word, 0.7);
  speak(word, 0.7);
  let defs = null;
  try { defs = await lookup(word); } catch {}
  if (defs?.length) body.innerHTML = defs.map(s => `<i>${esc(s.pos)}</i><ul>${s.defs.map(d => `<li>${esc(d)}</li>`).join('')}</ul>`).join('');
  else {
    body.innerHTML = `No dictionary entry. <button id="ask">Ask AI (1 call)</button>`;
    box.querySelector('#ask').onclick = async () => { body.textContent = '…'; try { body.textContent = await aiDefine(word, sentence); } catch (e) { body.textContent = e.message; } };
  }
}

function wireChat(chat) {
  chat.onclick = e => {
    const w = e.target.closest('.w');
    if (w) return showDef(w.textContent, w.closest('.msg').textContent);
    const b = e.target.closest('button');
    if (b?.dataset.s) return speak(b.dataset.s);
    if (b?.dataset.slow) return speak(b.dataset.slow, 0.55);
    const m = e.target.closest('.ai'); if (m) { const en = m.querySelector('.en'); en.style.display = en.style.display === 'none' ? 'block' : 'none'; }
  };
}
function review(h, offerRetry) {
  $app.innerHTML = `<header><button class="ghost" id="back">←</button><div><b>${esc(h.title)}</b> <span class="small">${esc(h.date)}</span></div><span></span></header>
    <div class="chat" id="chat">${h.log.map(e => entryHtml(e, true)).join('')}${h.summary ? `<div class="card"><b>📘 Resumo</b><br><span class="small">${esc(h.summary)}</span></div>` : ''}
    <div class="card"><button class="primary" id="again">Praticar de novo</button></div></div>`;
  wireChat(document.getElementById('chat'));
  document.getElementById('back').onclick = home;
  document.getElementById('again').onclick = () => { unlockAudio(); localStorage.removeItem('active'); lesson(LESSONS.find(l => l.id === h.id)); };
}

function lesson(l) {
  const c = cfg();
  if (!c.key) return settings();
  const opener = l.phrases[0] ? `Oi! Vamos praticar: "${l.phrases[0]}"` : 'Oi! Sobre o que você quer conversar hoje?';
  // an unfinished lesson is restored exactly where you left it (also after iOS reloads the app)
  const act = store.get('active', null), resumed = act && act.id === l.id ? act : null;
  const msgs = resumed ? resumed.msgs : [{ role: 'ai', text: opener, hint: l.title + ' — ' + l.scenario }];
  let turn = resumed ? resumed.turn : 0, busy = false, rec = null;
  $app.innerHTML = `<header><button class="ghost" id="quit">←</button><div><b>${esc(l.title)}</b> <span class="small" id="tn"></span></div><span></span></header>
    <div class="chat" id="chat"></div>
    <div class="bar"><input id="txt" placeholder="Digite ou fale…" autocomplete="off"><button id="send">➤</button>${SR && !IOS_STANDALONE ? '<button class="mic" id="mic">🎤</button>' : ''}</div>`;
  const chat = document.getElementById('chat'), txt = document.getElementById('txt');
  const add = html => { chat.insertAdjacentHTML('beforeend', html); chat.scrollTop = chat.scrollHeight; };
  const log = resumed ? resumed.log : [], sid = resumed ? resumed.sid : Date.now();
  const saveActive = () => store.set('active', { id: l.id, sid, msgs, turn, log });
  // saved after every turn, so a conversation is never lost even if you leave early
  const persist = summary => {
    if (log.length < 2) return;
    const h = store.get('history', []).filter(x => x.sid !== sid);
    h.push({ sid, id: l.id, title: l.title, level: l.level, date: new Date().toLocaleDateString(), summary: summary || '', log });
    store.set('history', h.slice(-60));
  };
  const addEntry = e => { log.push(e); add(entryHtml(e)); };
  const aiBubble = m => addEntry({ k: 'ai', text: m.text, hint: m.hint });
  wireChat(chat);
  // whenever the chat area changes size (keyboard opening/closing), keep the newest message in view
  if (window.ResizeObserver) new ResizeObserver(() => { if (document.activeElement === txt) chat.scrollTop = chat.scrollHeight; }).observe(chat);
  document.getElementById('quit').onclick = () => { speechSynthesis.cancel(); rec?.abort?.(); home(); };
  const tn = () => document.getElementById('tn').textContent = `${turn}/${TURNS}`;
  tn();
  if (resumed) { chat.insertAdjacentHTML('beforeend', log.map(e => entryHtml(e)).join('')); chat.scrollTop = chat.scrollHeight; }
  else { aiBubble(msgs[0]); speak(opener); saveActive(); } // speak: user-gesture-initiated, unlocks iOS audio
  if (turn >= TURNS) add(`<div class="card"><button class="primary" id="fin0">Concluir</button></div>`), document.getElementById('fin0').onclick = () => { localStorage.removeItem('active'); home(); };
  if (IOS_STANDALONE) add(`<div class="small">🎤 To speak: tap the text box, then the microphone key on your keyboard (set to Portuguese). If you hear nothing, check the ringer switch and volume.</div>`);
  setTimeout(() => { if (window.__ttsErr) add(`<div class="small">🔇 Voice error: ${esc(window.__ttsErr)}</div>`); }, 1500);

  async function submit(said, conf) {
    said = said.trim(); if (!said || busy || turn >= TURNS) return;
    busy = true; txt.value = '';
    msgs.push({ role: 'user', text: said }); turn++; tn();
    const meEntry = { k: 'me', text: said }; addEntry(meEntry);
    add(`<div class="small" id="wait">…</div>`);
    try {
      const r = await callGemini(l, turn, msgs.map(m => ({ role: m.role, text: m.text })));
      document.getElementById('wait')?.remove();
      (r.corrections || []).forEach(x => addEntry({ k: 'fix', said: x.said, better: x.better, why: x.why }));
      if (r.pronunciation) addEntry({ k: 'tip', text: r.pronunciation });
      const m = { role: 'ai', text: r.reply, hint: r.hint_en }; msgs.push(m); aiBubble(m); speak(r.reply);
      const p = progress();
      (r.corrections || []).forEach(x => p.notes.push(`${x.said} → ${x.better}`));
      store.set('progress', p);
      persist(); saveActive();
      if (turn >= TURNS) finish(r.summary);
    } catch (e) {
      document.getElementById('wait')?.remove(); turn--; msgs.pop(); tn();
      log.splice(log.indexOf(meEntry), 1); // the failed message is removed from history and put back in the box
      [...chat.querySelectorAll('.msg.me')].pop()?.remove();
      add(`<div class="fix">⚠️ ${esc(e.message)}</div>`); txt.value = said; saveActive();
    }
    busy = false;
  }
  function finish(summary) {
    const p = progress(); if (!p.done.includes(l.id)) p.done.push(l.id);
    if (summary) p.notes.push('📘 ' + l.title + ': ' + summary);
    store.set('progress', p);
    persist(summary);
    localStorage.removeItem('active');
    add(`<div class="card"><b>🎉 Lição completa!</b><br><span class="small">${esc(summary || '')}</span><br><br><button class="primary" id="fin">Concluir</button></div>`);
    document.getElementById('fin').onclick = home;
  }
  document.getElementById('send').onclick = () => submit(txt.value);
  txt.onkeydown = e => { if (e.key === 'Enter') submit(txt.value); };
  const mic = document.getElementById('mic');
  if (mic) mic.onclick = () => {
    if (rec) { rec.stop(); return; }
    speechSynthesis.cancel();
    rec = new SR(); rec.lang = 'pt-BR'; rec.interimResults = false; rec.maxAlternatives = 1;
    mic.classList.add('rec');
    rec.onresult = e => submit(e.results[0][0].transcript, e.results[0][0].confidence);
    rec.onerror = e => { add(`<div class="small">Mic: ${esc(e.error)} — use the keyboard's 🎤 dictation key instead.</div>`); };
    rec.onend = () => { mic.classList.remove('rec'); rec = null; };
    rec.start();
  };
}

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
{ // reopening the app drops you back into an unfinished lesson
  const act = store.get('active', null), l = act && LESSONS.find(x => x.id === act.id);
  if (l && cfg().key) lesson(l); else home();
}

// keep the input bar pinned above the iOS keyboard
function fitViewport() {
  const vv = window.visualViewport, s = document.documentElement.style;
  s.setProperty('--vh', (vv?.height || innerHeight) + 'px');
  s.setProperty('--vt', (vv?.offsetTop || 0) + 'px');
  scrollChat();
}
// when the keyboard opens, jump to the newest message
function scrollChat() {
  const chat = document.getElementById('chat');
  if (chat) requestAnimationFrame(() => { chat.scrollTop = chat.scrollHeight; chat.lastElementChild?.scrollIntoView({ block: 'end' }); });
}
document.addEventListener('focusin', e => { if (e.target.id === 'txt') { scrollChat(); setTimeout(scrollChat, 150); setTimeout(scrollChat, 400); } });
if (window.visualViewport) { visualViewport.addEventListener('resize', fitViewport); visualViewport.addEventListener('scroll', fitViewport); }
fitViewport();
