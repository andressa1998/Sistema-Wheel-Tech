/* Aba Concorrentes — acompanhamento de vendedores do Mercado Livre.
   Persistência compartilhada no Supabase: execute concorrentes_supabase.sql antes de usar.
   Coleta automática pela API do Mercado Livre usando o proxy do Worker (window.WORKER_URL)
   e o token de ml_token_manager.js (window.getValidToken).
*/
(() => {
  'use strict';
  const SITE = 'MLB';
  const AUTO_INTERVAL_MS = 12 * 3600e3;
  const RETRY_INTERVAL_MS = 3600e3;
  const DAY_MS = 864e5;
  const NIVEIS = ['Prata', 'Ouro', 'Platinum', 'Sem nível'];
  const NIVEL_ML = {silver: 'Prata', gold: 'Ouro', platinum: 'Platinum'};
  const NIVEL_COR = {Prata: '#6b7280', Ouro: '#b45309', Platinum: '#4338ca', 'Sem nível': '#9ca3af'};
  const PERIODS = [[7, '7 dias'], [30, '30 dias'], [90, '90 dias'], [180, '6 meses'], [365, '1 ano'], [0, 'Todo o histórico']];
  const COLORS = ['#2563eb', '#dc2626', '#16a34a', '#d97706', '#7c3aed', '#0891b2', '#db2777', '#65a30d', '#475569', '#ea580c'];

  const db = () => {
    if (typeof supabaseClient !== 'undefined' && supabaseClient) return supabaseClient;
    if (typeof initSupabase === 'function') initSupabase();
    if (typeof supabaseClient !== 'undefined' && supabaseClient) return supabaseClient;
    throw new Error('Conexão com o Supabase indisponível.');
  };
  const $ = (selector, root = document) => root.querySelector(selector);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const fmt = value => value === null || value === undefined ? '—' : Number(value).toLocaleString('pt-BR');
  const fmtDec = value => Number(value).toLocaleString('pt-BR', {maximumFractionDigits: 1});
  const date = value => value ? new Date(value).toLocaleString('pt-BR') : '—';
  const dayKey = value => { const d = new Date(value); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const dayLabel = key => key.split('-').reverse().join('/');
  const sameId = (a, b) => String(a) === String(b);
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const safe = async fn => { try { return await fn(); } catch { return null; } };
  const state = {competitors: [], selected: null, marked: new Set(), period: 30, metric: 'total', collecting: false, chart: null, timer: null};
  const panelId = 'concorrentesSystem';

  // ---------- Concorrentes marcados (comparação + histórico) ----------
  // Guardado no navegador, por usuário. Concorrente que ainda não era
  // conhecido entra marcado, para não sumir da comparação ao ser cadastrado.
  const markKey = () => 'wt_concorrentes_marcados_' + String(window.currentUser?.username || '').toLowerCase();
  function loadMarks() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(markKey()) || 'null'); } catch { saved = null; }
    const known = new Set((saved?.conhecidos || []).map(String));
    const marked = new Set((saved?.marcados || []).map(String));
    state.marked = new Set(state.competitors.map(c => String(c.id)).filter(id => marked.has(id) || !known.has(id)));
    saveMarks();
  }
  function saveMarks() {
    try {
      localStorage.setItem(markKey(), JSON.stringify({
        marcados: [...state.marked], conhecidos: state.competitors.map(c => String(c.id))
      }));
    } catch { /* sem localStorage: a seleção vale só nesta sessão */ }
  }
  const isMarked = c => state.marked.has(String(c.id));
  const markedCompetitors = () => state.competitors.filter(isMarked);
  const colorOf = c => COLORS[state.competitors.indexOf(c) % COLORS.length];

  const parseCount = value => {
    if (typeof value === 'number') return Number.isSafeInteger(value) && value >= 0 ? value : null;
    const raw = String(value ?? '').trim();
    if (!/^\d[\d.]*$/.test(raw)) return null;
    const n = Number(raw.replace(/\./g, ''));
    return Number.isSafeInteger(n) && n >= 0 ? n : null;
  };

  // ---------- Mercado Livre ----------
  async function mlToken() {
    if (typeof window.getValidToken !== 'function') return '';
    try { return (await window.getValidToken())?.access_token || ''; } catch { return ''; }
  }
  async function mlFetch(url, asText = false) {
    const token = await mlToken();
    const targets = [];
    if (window.WORKER_URL) targets.push({url: `${window.WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(url)}&token=${encodeURIComponent(token)}`, headers: {}});
    if (url.startsWith('https://api.mercadolibre.com/')) targets.push({url, headers: token ? {Authorization: 'Bearer ' + token} : {}});
    let lastError = new Error('Sem rota para consultar o Mercado Livre.');
    for (const target of targets) {
      try {
        const response = await fetch(target.url, {headers: target.headers});
        const body = await response.text();
        if (!response.ok) { lastError = new Error('Mercado Livre respondeu HTTP ' + response.status); continue; }
        if (asText) return body;
        const json = JSON.parse(body);
        if (json && Number(json.status) >= 400) { lastError = new Error(json.message || json.error || 'Mercado Livre respondeu HTTP ' + json.status); continue; }
        return json;
      } catch (error) { lastError = error; }
    }
    throw lastError;
  }
  function parseInput(raw) {
    const text = String(raw ?? '').trim();
    if (!text) return null;
    if (/^\d{3,15}$/.test(text)) return {userId: text};
    const cust = text.match(/_CustId_(\d+)/i);
    if (cust) return {userId: cust[1]};
    const perfil = text.match(/perfil\.mercadoli(?:vre|bre)\.com(?:\.br)?\/([^/?#\s]+)/i);
    if (perfil) return {nickname: decodeURIComponent(perfil[1].replace(/\+/g, ' ')).trim()};
    const item = text.match(/\bMLB-?(\d{6,})/i);
    if (item) return {itemId: 'MLB' + item[1]};
    if (/^[\w .+-]{3,80}$/.test(text)) return {nickname: text};
    return null;
  }
  async function findUserId(input) {
    if (input.userId) return String(input.userId);
    if (input.itemId) {
      const item = await mlFetch(`https://api.mercadolibre.com/items/${input.itemId}`);
      if (item?.seller_id) return String(item.seller_id);
      throw new Error('Não foi possível identificar o vendedor deste anúncio.');
    }
    const nick = input.nickname;
    const search = await safe(() => mlFetch(`https://api.mercadolibre.com/sites/${SITE}/search?nickname=${encodeURIComponent(nick)}&limit=1`));
    const fromSearch = search?.seller?.id || search?.results?.[0]?.seller?.id;
    if (fromSearch) return String(fromSearch);
    const html = await safe(() => mlFetch(`https://perfil.mercadolivre.com.br/${encodeURIComponent(nick).replace(/%20/g, '+')}`, true));
    if (html) {
      for (const re of [/_CustId_(\d+)/, /"seller_id"\s*:\s*"?(\d{3,})/, /"sellerId"\s*:\s*"?(\d{3,})/, /"user_id"\s*:\s*"?(\d{3,})/, /"userId"\s*:\s*"?(\d{3,})/]) {
        const match = html.match(re);
        if (match) return match[1];
      }
    }
    throw new Error(`Não foi possível localizar "${nick}" automaticamente. Informe o ID do vendedor ou cole o link de um anúncio dele.`);
  }
  async function fetchUser(id) {
    const user = await mlFetch(`https://api.mercadolibre.com/users/${encodeURIComponent(id)}`);
    if (!user || !user.id) throw new Error('Vendedor não encontrado no Mercado Livre.');
    return user;
  }
  async function resolveSeller(input) {
    const user = await fetchUser(await findUserId(input));
    if (input.nickname && user.nickname && user.nickname.toLowerCase() !== input.nickname.toLowerCase()) {
      throw new Error(`O Mercado Livre retornou outro vendedor (${user.nickname}). Informe o ID ou o link de um anúncio.`);
    }
    return user;
  }
  async function countListings(userId) {
    const api = await safe(() => mlFetch(`https://api.mercadolibre.com/sites/${SITE}/search?seller_id=${encodeURIComponent(userId)}&limit=1`));
    const apiTotal = Number(api?.paging?.total);
    return api?.paging && Number.isSafeInteger(apiTotal) && apiTotal >= 0 ? apiTotal : null;
  }

  // ---------- Dados ----------
  async function load() {
    const client = db();
    const [competitors, snapshots] = await Promise.all([
      client.from('concorrentes_ml').select('id,nickname,ml_user_id,permalink,ultima_consulta,ultimo_erro').order('nickname'),
      client.from('concorrentes_ml_historico').select('id,concorrente_id,coletado_em,ativo,total_negociacoes,anuncios_ativos,nivel,origem').order('coletado_em', {ascending: true})
    ]);
    for (const result of [competitors, snapshots]) {
      if (result.error) {
        if (['42P01', '42703', 'PGRST204', 'PGRST205'].includes(result.error.code)) throw new Error('estrutura do banco desatualizada. Execute concorrentes_supabase.sql no Supabase.');
        throw result.error;
      }
    }
    const byId = new Map((competitors.data || []).map(row => [String(row.id), {
      id: row.id, nickname: row.nickname, ml_user_id: row.ml_user_id ? String(row.ml_user_id) : null, permalink: row.permalink,
      ultima_consulta: row.ultima_consulta, ultimo_erro: row.ultimo_erro, history: []
    }]));
    for (const row of snapshots.data || []) {
      byId.get(String(row.concorrente_id))?.history.push({at: row.coletado_em, ativo: row.ativo,
        total: row.total_negociacoes, anuncios: row.anuncios_ativos, nivel: row.nivel, source: row.origem});
    }
    state.competitors = [...byId.values()];
    loadMarks();
    render();
  }
  async function refresh() {
    try { await load(); return true; }
    catch (error) { setMessage('Erro ao carregar concorrentes: ' + error.message); return false; }
  }
  function selected() { return state.competitors.find(x => sameId(x.id, state.selected)); }
  function latest(c) { return c.history[c.history.length - 1]; }
  function profileUrl(c) { return c.permalink || 'https://perfil.mercadolivre.com.br/' + encodeURIComponent(c.nickname).replace(/%20/g, '+'); }

  async function insertSnapshot(c, snap, source) {
    const old = latest(c);
    const same = old && old.ativo === snap.ativo && old.total === snap.total && (old.anuncios === snap.anuncios || snap.anuncios === null) && old.nivel === snap.nivel;
    if (same && (source === 'Manual' || Date.now() - Date.parse(old.at) < AUTO_INTERVAL_MS)) return false;
    const {error} = await db().from('concorrentes_ml_historico').insert({
      concorrente_id: c.id, ativo: snap.ativo, total_negociacoes: snap.total,
      anuncios_ativos: snap.anuncios, nivel: snap.nivel, origem: source
    });
    if (error) throw error;
    c.history.push({at: new Date().toISOString(), ...snap, source});
    return true;
  }
  async function updateCompetitor(c, fields) {
    const {data, error} = await db().from('concorrentes_ml').update(fields).eq('id', c.id).select('id');
    if (error) throw error;
    if (!data?.length) throw new Error('o Supabase bloqueou a atualização do concorrente. Execute concorrentes_supabase.sql no Supabase.');
    Object.assign(c, fields);
  }
  async function collect(c) {
    const now = new Date().toISOString();
    try {
      const user = c.ml_user_id ? await fetchUser(c.ml_user_id) : await resolveSeller(parseInput(c.nickname) || {nickname: c.nickname});
      const rep = user.seller_reputation || {};
      const total = parseCount(rep.transactions?.total ?? 0);
      if (total === null) throw new Error('O Mercado Livre não informou o total de negociações.');
      const snap = {
        ativo: String(user.status?.site_status || 'active').toLowerCase() === 'active',
        total,
        anuncios: await countListings(user.id),
        nivel: NIVEL_ML[String(rep.power_seller_status || '').toLowerCase()] || 'Sem nível'
      };
      await insertSnapshot(c, snap, 'API');
      await updateCompetitor(c, {ml_user_id: String(user.id), nickname: user.nickname || c.nickname, permalink: user.permalink || null, ultima_consulta: now, ultimo_erro: null});
    } catch (error) {
      await safe(() => updateCompetitor(c, {ultima_consulta: now, ultimo_erro: String(error.message || error).slice(0, 300)}));
      throw error;
    }
  }
  function isDue(c) {
    const lastApi = [...c.history].reverse().find(h => h.source === 'API');
    const last = Math.max(c.ultima_consulta ? Date.parse(c.ultima_consulta) : 0, lastApi ? Date.parse(lastApi.at) : 0);
    if (!last) return true;
    return Date.now() - last >= (c.ultimo_erro ? RETRY_INTERVAL_MS : AUTO_INTERVAL_MS);
  }
  async function collectAll(force = false, list = null) {
    if (state.collecting) return;
    const targets = (list || state.competitors).filter(c => force || isDue(c));
    if (!targets.length) { if (force) setMessage('Nenhum concorrente cadastrado.'); return; }
    state.collecting = true; toggleBusy(true);
    let ok = 0;
    const errors = [];
    try {
      for (const [index, c] of targets.entries()) {
        setMessage(`Consultando Mercado Livre (${index + 1}/${targets.length}): ${c.nickname}...`);
        try { await collect(c); ok++; } catch (error) { errors.push(`${c.nickname}: ${error.message || error}`); }
        if (index < targets.length - 1) await wait(350);
      }
      await refresh();
      setMessage(`Coleta concluída: ${ok} atualizado(s)` + (errors.length ? `, ${errors.length} com erro — ${errors.join(' | ')}` : '.'));
    } finally { state.collecting = false; toggleBusy(false); }
  }

  // ---------- Cálculos ----------
  function delta(current, previous) {
    if (current === null || current === undefined || previous === null || previous === undefined) return '—';
    const difference = current - previous;
    const pct = previous ? ' (' + (difference > 0 ? '+' : '') + fmtDec(difference / previous * 100) + '%)' : '';
    return (difference > 0 ? '+' : '') + fmt(difference) + pct;
  }
  function deltaCell(current, previous) {
    const text = delta(current, previous);
    const diff = current - previous;
    const color = text === '—' || !diff ? '#6b7280' : diff > 0 ? '#15803d' : '#b91c1c';
    return `<span style="color:${color};white-space:nowrap">${esc(text)}</span>`;
  }
  function periodStart(points, days) {
    if (!days) return points[0];
    const limit = Date.now() - days * DAY_MS;
    let start = null;
    for (const p of points) { if (Date.parse(p.at) <= limit) start = p; else break; }
    return start || points[0];
  }
  function growth(c, key, days) {
    const points = c.history.filter(h => h[key] !== null && h[key] !== undefined);
    if (!points.length) return null;
    const end = points[points.length - 1], start = periodStart(points, days);
    const diff = end[key] - start[key];
    const spanDays = (Date.parse(end.at) - Date.parse(start.at)) / DAY_MS;
    return {start, end, diff, pct: start[key] ? diff / start[key] * 100 : null, perDay: spanDays >= 1 ? diff / spanDays : null, spanDays};
  }
  function nivelBadge(nivel) {
    if (!nivel) return '—';
    return `<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:12px;font-weight:600;color:#fff;background:${NIVEL_COR[nivel] || '#6b7280'}">${esc(nivel)}</span>`;
  }
  function situacao(h) {
    if (!h) return '—';
    return h.ativo ? '<span style="color:#15803d;font-weight:600">Ativo</span>' : '<span style="color:#b91c1c;font-weight:600">Inativo</span>';
  }

  // ---------- Interface ----------
  function setMessage(message) { const el = $('#concorrentesMessage'); if (el) el.textContent = message; }
  function toggleBusy(busy) {
    document.querySelectorAll('#concorrentesSystem [data-busy]').forEach(button => { button.disabled = busy; });
  }
  function render() {
    renderCurrent();
    renderGrowth();
    renderSelected();
  }
  function listingsUrl(c) {
    return c.ml_user_id ? `https://lista.mercadolivre.com.br/_CustId_${encodeURIComponent(c.ml_user_id)}` : profileUrl(c);
  }
  function anunciosCells(c) {
    const known = c.history.filter(h => h.anuncios !== null && h.anuncios !== undefined);
    const last = known[known.length - 1], prev = known[known.length - 2];
    const edit = `<button type="button" class="btn btn-sm btn-link p-0 ms-1" data-action="anuncios" data-id="${esc(c.id)}" title="Informar anúncios ativos (abre a página de anúncios do vendedor)"><i class="fas fa-pen"></i></button>`;
    const when = last ? `<div style="font-size:11px;color:#888">em ${esc(new Date(last.at).toLocaleDateString('pt-BR'))}</div>` : '';
    return `<td style="white-space:nowrap">${last ? fmt(last.anuncios) : '—'}${edit}${when}</td><td>${last ? deltaCell(last.anuncios, prev?.anuncios) : '—'}</td>`;
  }
  async function informAnuncios(c) {
    window.open(listingsUrl(c), '_blank', 'noopener');
    const value = prompt(`Anúncios ativos de ${c.nickname}\n\nA página de anúncios do vendedor foi aberta em outra aba. Digite o número de "resultados" exibido lá:`);
    if (value === null) return;
    const anuncios = parseCount(value.replace(/\s*resultados?/i, ''));
    if (anuncios === null) return setMessage('Informe um número inteiro não negativo.');
    const h = latest(c);
    if (!h) return setMessage('Aguarde a primeira coleta automática deste concorrente antes de informar os anúncios.');
    try {
      const saved = await insertSnapshot(c, {ativo: h.ativo, total: h.total, anuncios, nivel: h.nivel}, 'Manual');
      await load();
      setMessage(saved ? `Anúncios ativos de ${c.nickname} registrados: ${fmt(anuncios)}.` : 'Sem mudança desde o último registro.');
    } catch (error) { setMessage('Erro ao salvar: ' + error.message); }
  }
  function renderCurrent() {
    const rows = state.competitors.map(c => {
      const h = latest(c), prev = c.history[c.history.length - 2];
      const warn = c.ultimo_erro ? ` <span title="${esc(c.ultimo_erro)}" style="color:#b45309;cursor:help">⚠</span>` : '';
      return `<tr${isMarked(c) ? ' style="background:#f1f5ff"' : ''}>
        <td><input type="checkbox" class="cc-mark" data-id="${esc(c.id)}"${isMarked(c) ? ' checked' : ''} title="Mostrar na comparação e no histórico"></td>
        <td><span class="cc-dot" style="background:${colorOf(c)}"></span><a href="${esc(profileUrl(c))}" target="_blank" rel="noopener">${esc(c.nickname)}</a>${c.ml_user_id ? `<div style="font-size:11px;color:#888">ID ${esc(c.ml_user_id)}</div>` : ''}</td>
        <td>${situacao(h)}</td><td>${h ? nivelBadge(h.nivel) : '—'}</td>
        <td>${h ? fmt(h.total) : '—'}</td><td>${h ? deltaCell(h.total, prev?.total) : '—'}</td>
        ${anunciosCells(c)}
        <td>${date(c.ultima_consulta || h?.at)}${warn}</td>
        <td style="white-space:nowrap"><button type="button" class="btn btn-sm btn-outline-primary" data-action="collect" data-busy data-id="${esc(c.id)}" title="Consultar agora"><i class="fas fa-sync-alt"></i></button>
        <button type="button" class="btn btn-sm btn-outline-secondary" data-action="select" data-id="${esc(c.id)}" title="ID do vendedor / medição manual"><i class="fas fa-pen"></i> Ajustar</button>
        <button type="button" class="btn btn-sm btn-outline-danger" data-action="remove" data-id="${esc(c.id)}">Excluir</button></td></tr>`;
    }).join('');
    $('#concorrentesRows').innerHTML = rows || '<tr><td colspan="10">Nenhum concorrente cadastrado.</td></tr>';
    const all = $('#concorrentesMarkAll');
    const total = state.competitors.length, marked = markedCompetitors().length;
    all.checked = total > 0 && marked === total;
    all.indeterminate = marked > 0 && marked < total;
    $('#concorrentesMarkCount').textContent = total ? `${marked} de ${total} marcado(s) para comparação e histórico` : '';
  }
  function renderGrowth() {
    const key = state.metric, days = state.period;
    const items = markedCompetitors().map(c => ({c, total: growth(c, 'total', days), anuncios: growth(c, 'anuncios', days)}))
      .filter(x => x.total || x.anuncios)
      .sort((a, b) => ((b[key]?.diff ?? -Infinity) - (a[key]?.diff ?? -Infinity)));
    const cell = (g, field) => {
      if (!g) return '<td>—</td><td>—</td><td>—</td>';
      const color = !g.diff ? '#6b7280' : g.diff > 0 ? '#15803d' : '#b91c1c';
      return `<td style="white-space:nowrap">${fmt(g.start[field])} → ${fmt(g.end[field])}</td>
        <td style="color:${color};white-space:nowrap">${g.diff > 0 ? '+' : ''}${fmt(g.diff)}${g.pct !== null ? ` (${g.pct > 0 ? '+' : ''}${fmtDec(g.pct)}%)` : ''}</td>
        <td>${g.perDay !== null ? (g.perDay > 0 ? '+' : '') + fmtDec(g.perDay) : '—'}</td>`;
    };
    $('#concorrentesGrowthRows').innerHTML = items.map((x, rank) => {
      const first = periodStart(x.c.history, days), last = latest(x.c);
      const nivel = first && last && first.nivel !== last.nivel ? `${nivelBadge(first.nivel)} → ${nivelBadge(last.nivel)}` : nivelBadge(last?.nivel);
      return `<tr><td>${rank + 1}º</td><td><span class="cc-dot" style="background:${colorOf(x.c)}"></span>${esc(x.c.nickname)}</td>
        ${cell(x.total, 'total')}${cell(x.anuncios, 'anuncios')}<td>${nivel}</td><td>${situacao(last)}</td></tr>`;
    }).join('') || `<tr><td colspan="10">${state.marked.size ? 'Sem dados suficientes para comparar. A comparação aparece após as coletas.' : 'Marque na tabela acima os concorrentes que quer comparar.'}</td></tr>`;
    renderChart();
  }
  function renderChart() {
    const canvas = $('#concorrentesChart');
    if (state.chart) { state.chart.destroy(); state.chart = null; }
    if (!canvas || typeof Chart === 'undefined') return;
    const key = state.metric, days = state.period;
    const series = markedCompetitors().map(c => {
      const points = c.history.filter(h => h[key] !== null && h[key] !== undefined);
      if (!points.length) return null;
      const start = periodStart(points, days);
      const byDay = new Map();
      for (const p of points.slice(points.indexOf(start))) byDay.set(dayKey(p.at), p[key]);
      return {c, byDay};
    }).filter(Boolean);
    const labels = [...new Set(series.flatMap(s => [...s.byDay.keys()]))].sort();
    $('#concorrentesChartEmpty').textContent = state.marked.size ? 'Sem dados no período.' : 'Nenhum concorrente marcado.';
    $('#concorrentesChartEmpty').style.display = labels.length ? 'none' : 'flex';
    if (!labels.length) return;
    state.chart = new Chart(canvas, {
      type: 'line',
      data: {
        labels: labels.map(dayLabel),
        datasets: series.map(s => ({
          label: s.c.nickname, data: labels.map(d => s.byDay.get(d) ?? null), spanGaps: true, tension: 0.25,
          borderColor: colorOf(s.c), backgroundColor: colorOf(s.c), pointRadius: 3
        }))
      },
      options: {
        responsive: true, maintainAspectRatio: false, interaction: {mode: 'index', intersect: false},
        plugins: {legend: {position: 'bottom'}, tooltip: {callbacks: {label: ctx => `${ctx.dataset.label}: ${fmt(ctx.parsed.y)}`}}},
        scales: {y: {ticks: {callback: value => fmt(value)}}}
      }
    });
  }
  function renderHistory() {
    const list = markedCompetitors();
    $('#concorrentesHistoryTitle').textContent = !list.length ? 'nenhum concorrente marcado'
      : list.length === 1 ? list[0].nickname : `${list.length} concorrentes marcados`;
    // Variação de cada registro é contra o registro anterior DO MESMO vendedor.
    const rows = list.flatMap(c => c.history.map((h, i) => ({c, h, previous: c.history[i - 1]})))
      .sort((a, b) => Date.parse(b.h.at) - Date.parse(a.h.at));
    $('#concorrentesHistory').innerHTML = rows.map(({c, h, previous}) => `<tr>
        <td><span class="cc-dot" style="background:${colorOf(c)}"></span>${esc(c.nickname)}</td>
        <td>${date(h.at)}</td><td>${situacao(h)}</td>
        <td>${fmt(h.total)}</td><td>${deltaCell(h.total, previous?.total)}</td>
        <td>${fmt(h.anuncios)}</td><td>${deltaCell(h.anuncios, previous?.anuncios)}</td>
        <td>${nivelBadge(h.nivel)}</td><td>${h.source === 'API' ? 'Automático' : esc(h.source)}</td></tr>`).join('')
      || `<tr><td colspan="9">${list.length ? 'Nenhum registro no histórico.' : 'Marque na tabela "Situação atual" os concorrentes que quer ver.'}</td></tr>`;
  }
  function renderSelected() {
    renderHistory();
    const c = selected();
    $('#concorrentesSelected').innerHTML = `<option value="">Selecione um concorrente</option>` +
      state.competitors.map(x => `<option value="${esc(x.id)}"${sameId(x.id, state.selected) ? ' selected' : ''}>${esc(x.nickname)}</option>`).join('');
    $('#concorrentesSnapshot').hidden = !c;
    if (!c) return;
    $('#concorrentesMlId').value = c.ml_user_id || '';
    const h = latest(c);
    $('#concorrentesAtivo').value = h ? String(h.ativo) : 'true';
    $('#concorrentesTotal').value = h?.total ?? '';
    $('#concorrentesAnuncios').value = h?.anuncios ?? '';
    $('#concorrentesNivel').value = h?.nivel ?? '';
  }

  async function addCompetitor(raw) {
    const input = parseInput(raw);
    if (!input) throw new Error('Informe o nome do vendedor no Mercado Livre, o link do perfil/anúncio ou o ID do vendedor.');
    setMessage('Localizando vendedor no Mercado Livre...');
    let user = null, lookupError = null;
    try { user = await resolveSeller(input); } catch (error) { lookupError = error; }
    if (!user && !input.nickname) throw lookupError;
    const nickname = user?.nickname || input.nickname;
    const found = state.competitors.find(c => (user && sameId(c.ml_user_id, user.id)) || c.nickname.toLowerCase() === nickname.toLowerCase());
    if (found) { state.selected = found.id; render(); setMessage('Este vendedor já está cadastrado.'); return; }
    const {data, error} = await db().from('concorrentes_ml').insert({
      nickname, ml_user_id: user ? String(user.id) : null, permalink: user?.permalink || null
    }).select('id').single();
    if (error) throw error;
    state.selected = data.id;
    await load();
    const c = selected();
    if (user && c) await collectAll(true, [c]);
    else setMessage(`Concorrente adicionado, mas não foi localizado automaticamente: ${lookupError?.message || ''}`);
  }

  function init() {
    if ($('#' + panelId)) return;
    const style = document.createElement('style');
    style.textContent = '#concorrentesSystem{max-width:none;margin:0;padding:0}#concorrentesSystem .cc-content{padding-bottom:30px}#concorrentesSystem .main-header{margin-bottom:30px}#concorrentesSystem .cc-card{background:#fff;border:1px solid #dce2eb;border-radius:12px;padding:20px;margin-bottom:18px}#concorrentesSystem .cc-table{overflow-x:auto}#concorrentesSystem table{width:100%;min-width:850px;border-collapse:collapse}#concorrentesSystem th,#concorrentesSystem td{padding:9px;border-bottom:1px solid #eee;text-align:left;vertical-align:middle}#concorrentesSystem th{font-size:13px;color:#475569;background:#f8fafc}#concorrentesSystem .cc-fields{display:grid;grid-template-columns:repeat(4,minmax(120px,1fr));gap:12px}#concorrentesSystem .cc-toolbar{display:flex;flex-wrap:wrap;gap:10px;align-items:center}#concorrentesSystem .cc-add{display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap}#concorrentesSystem .cc-add label{flex:1;min-width:260px}#concorrentesSystem .cc-chart{position:relative;height:320px;margin:14px 0}#concorrentesSystem details summary{cursor:pointer;color:#2563eb;margin:14px 0 8px}#concorrentesMessage{margin-top:10px;color:#334155;min-height:1.2em}#concorrentesSystem .cc-dot{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:6px}#concorrentesSystem .cc-mark,#concorrentesMarkAll{width:16px;height:16px;cursor:pointer}#concorrentesMarkCount{font-size:13px;color:#64748b;margin-bottom:8px}@media(max-width:850px){#concorrentesSystem .cc-fields{grid-template-columns:1fr 1fr}}';
    document.head.appendChild(style);
    const root = document.createElement('div');
    root.id = panelId;
    root.className = 'hidden';
    root.innerHTML = `<header class="main-header"><div class="container"><div class="header-content"><h1 style="display:flex;align-items:center;gap:10px"><img src="logo.png" alt="Wheel Tech" style="height:35px;width:auto"> Concorrentes</h1><button type="button" class="btn btn-outline-secondary btn-sm" id="concorrentesBack"><i class="fas fa-arrow-left"></i> Voltar ao início</button></div></div></header>
      <div class="container cc-content">
      <div class="cc-card"><h3><i class="fas fa-chart-line"></i> Acompanhamento de concorrentes</h3>
      <p>Cadastre vendedores pelo nome no Mercado Livre. Situação, total de negociações, anúncios ativos e nível são coletados automaticamente (a cada 12h ao abrir esta aba) e ficam salvos no histórico.</p>
      <div class="cc-toolbar"><button type="button" class="btn btn-primary btn-sm" id="concorrentesCollectAll" data-busy><i class="fas fa-sync-alt"></i> Atualizar todos agora</button>
      <button type="button" class="btn btn-outline-secondary btn-sm" id="concorrentesRefresh">Recarregar lista</button></div>
      <div id="concorrentesMessage" role="status" aria-live="polite"></div></div>
      <div class="cc-card"><form id="concorrentesAdd" class="cc-add"><label>Nome do vendedor no Mercado Livre <input class="form-control" name="nickname" maxlength="300" required placeholder="Ex.: LOJA_EXEMPLO (ou link do perfil/anúncio, ou ID)"></label>
      <button class="btn btn-primary" type="submit" data-busy>Adicionar concorrente</button></form></div>
      <div class="cc-card cc-table"><h3>Situação atual</h3><div id="concorrentesMarkCount"></div><table><thead><tr><th><input type="checkbox" id="concorrentesMarkAll" title="Marcar / desmarcar todos"></th><th>Vendedor</th><th>Situação</th><th>Nível</th><th>Negociações</th><th>Variação</th><th>Anúncios ativos</th><th>Variação</th><th>Última consulta</th><th>Ações</th></tr></thead><tbody id="concorrentesRows"></tbody></table></div>
      <div class="cc-card"><h3>Comparação de crescimento</h3>
      <div class="cc-toolbar"><label>Período <select id="concorrentesPeriod" class="form-control form-control-sm">${PERIODS.map(([d, label]) => `<option value="${d}"${d === state.period ? ' selected' : ''}>${label}</option>`).join('')}</select></label>
      <label>Métrica <select id="concorrentesMetric" class="form-control form-control-sm"><option value="total">Total de negociações</option><option value="anuncios">Anúncios ativos</option></select></label></div>
      <div class="cc-chart"><canvas id="concorrentesChart"></canvas><p id="concorrentesChartEmpty" style="position:absolute;inset:0;display:none;align-items:center;justify-content:center;color:#888">Sem dados no período.</p></div>
      <div class="cc-table"><table><thead><tr><th>#</th><th>Vendedor</th><th>Negociações (início → atual)</th><th>Crescimento</th><th>Média/dia</th><th>Anúncios (início → atual)</th><th>Crescimento</th><th>Média/dia</th><th>Nível</th><th>Situação</th></tr></thead><tbody id="concorrentesGrowthRows"></tbody></table></div></div>
      <div class="cc-card"><h3>Histórico: <span id="concorrentesHistoryTitle"></span></h3>
      <div class="cc-table"><table><thead><tr><th>Vendedor</th><th>Data</th><th>Situação</th><th>Negociações</th><th>Variação</th><th>Anúncios</th><th>Variação</th><th>Nível</th><th>Origem</th></tr></thead><tbody id="concorrentesHistory"></tbody></table></div></div>
      <div class="cc-card"><h3>Ajustes manuais</h3>
      <label style="max-width:360px;display:block">Concorrente <select id="concorrentesSelected" class="form-control"></select></label>
      <div id="concorrentesSnapshot" hidden>
      <details><summary>ID do vendedor no Mercado Livre (se não for localizado automaticamente)</summary>
      <form id="concorrentesIdForm" class="cc-add"><label>ID do vendedor, link do perfil ou link de um anúncio dele<input id="concorrentesMlId" class="form-control"></label>
      <button type="submit" class="btn btn-outline-primary" data-busy>Salvar e consultar</button></form></details>
      <details><summary>Registrar medição manual</summary>
      <form id="concorrentesForm"><div class="cc-fields">
      <label>Situação<select id="concorrentesAtivo" class="form-control"><option value="true">Ativo</option><option value="false">Inativo</option></select></label>
      <label>Total de negociações<input id="concorrentesTotal" class="form-control" inputmode="numeric" required></label>
      <label>Anúncios ativos<input id="concorrentesAnuncios" class="form-control" inputmode="numeric" required></label>
      <label>Nível<select id="concorrentesNivel" class="form-control" required><option value="">Selecione</option>${NIVEIS.map(n => `<option>${n}</option>`).join('')}</select></label>
      </div><button type="submit" class="btn btn-primary" style="margin-top:12px">Salvar medição</button></form></details>
      </div></div></div>`;
    document.body.appendChild(root);

    $('#concorrentesRefresh').onclick = async () => { if (await refresh()) setMessage('Lista recarregada.'); };
    $('#concorrentesCollectAll').onclick = () => collectAll(true);
    $('#concorrentesBack').onclick = () => typeof window.voltarParaMenu === 'function' ? window.voltarParaMenu() : (root.classList.add('hidden'), $('#menuSystem')?.classList.remove('hidden'));
    $('#concorrentesPeriod').onchange = event => { state.period = Number(event.target.value); renderGrowth(); };
    $('#concorrentesMetric').onchange = event => { state.metric = event.target.value; renderGrowth(); };
    $('#concorrentesAdd').onsubmit = async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const raw = new FormData(form).get('nickname');
      toggleBusy(true);
      try { await addCompetitor(raw); form.reset(); }
      catch (error) { setMessage('Erro ao adicionar: ' + error.message); }
      finally { toggleBusy(state.collecting); }
    };
    $('#concorrentesMarkAll').onchange = event => {
      state.marked = event.target.checked ? new Set(state.competitors.map(c => String(c.id))) : new Set();
      saveMarks(); render();
    };
    $('#concorrentesSelected').onchange = event => { state.selected = event.target.value || null; renderSelected(); };
    $('#concorrentesRows').onchange = event => {
      const box = event.target.closest('.cc-mark'); if (!box) return;
      if (box.checked) state.marked.add(String(box.dataset.id)); else state.marked.delete(String(box.dataset.id));
      saveMarks(); render();
    };
    $('#concorrentesRows').onclick = async event => {
      const button = event.target.closest('button[data-action]'); if (!button) return;
      const c = state.competitors.find(x => sameId(x.id, button.dataset.id)); if (!c) return;
      if (button.dataset.action === 'select') { state.selected = c.id; renderSelected(); $('#concorrentesSelected').scrollIntoView({behavior: 'smooth', block: 'center'}); return; }
      if (button.dataset.action === 'collect') { await collectAll(true, [c]); return; }
      if (button.dataset.action === 'anuncios') { await informAnuncios(c); return; }
      if (!confirm('Excluir ' + c.nickname + ' e todo o histórico?')) return;
      try {
        const hist = await db().from('concorrentes_ml_historico').delete().eq('concorrente_id', c.id);
        if (hist.error) throw hist.error;
        const {error} = await db().from('concorrentes_ml').delete().eq('id', c.id);
        if (error) throw error;
        if (sameId(state.selected, c.id)) state.selected = null;
        await load(); setMessage('Concorrente excluído.');
      } catch (error) { setMessage('Erro ao excluir: ' + error.message); }
    };
    $('#concorrentesIdForm').onsubmit = async event => {
      event.preventDefault(); const c = selected(); if (!c) return;
      const input = parseInput($('#concorrentesMlId').value);
      if (!input) return setMessage('Informe o ID numérico do vendedor ou um link do perfil/anúncio.');
      toggleBusy(true);
      try {
        setMessage('Localizando vendedor...');
        const user = await resolveSeller(input);
        const dup = state.competitors.find(x => !sameId(x.id, c.id) && sameId(x.ml_user_id, user.id));
        if (dup) throw new Error(`Este vendedor já está cadastrado como ${dup.nickname}.`);
        await updateCompetitor(c, {ml_user_id: String(user.id), nickname: user.nickname || c.nickname, permalink: user.permalink || null, ultimo_erro: null});
        toggleBusy(false);
        await collectAll(true, [c]);
      } catch (error) { setMessage('Erro: ' + error.message); }
      finally { toggleBusy(state.collecting); }
    };
    $('#concorrentesForm').onsubmit = async event => {
      event.preventDefault(); const c = selected(); if (!c) return;
      const total = parseCount($('#concorrentesTotal').value), anuncios = parseCount($('#concorrentesAnuncios').value), nivel = $('#concorrentesNivel').value;
      if (total === null || anuncios === null || !NIVEIS.includes(nivel)) return setMessage('Informe números inteiros não negativos e selecione o nível.');
      try {
        const saved = await insertSnapshot(c, {ativo: $('#concorrentesAtivo').value === 'true', total, anuncios, nivel}, 'Manual');
        await load();
        setMessage(saved ? 'Medição salva no histórico.' : 'Sem mudança desde o último registro; o histórico foi preservado.');
      } catch (error) { setMessage('Erro ao salvar: ' + error.message); }
    };
    render();
  }

  window.abrirSistemaConcorrentes = async function () {
    init();
    if (typeof window.voltarParaMenu === 'function') window.voltarParaMenu();
    document.querySelectorAll('body > div[id$="System"], body > div[id$="Screen"]').forEach(node => {
      if (node.id !== panelId && node.id !== 'loginScreen') node.classList.add('hidden');
    });
    $('#menuSystem')?.classList.add('hidden');
    $('#' + panelId).classList.remove('hidden');
    document.body.classList.add('wt-global-sidebar-active');
    window.scrollTo({top: 0, behavior: 'instant'});
    if (await refresh()) {
      setMessage('Dados carregados.');
      collectAll(false);
    }
    if (!state.timer) {
      state.timer = setInterval(() => {
        const panel = $('#' + panelId);
        if (panel && !panel.classList.contains('hidden')) collectAll(false);
      }, 30 * 60e3);
    }
  };
})();
