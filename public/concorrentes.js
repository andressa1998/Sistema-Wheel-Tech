/* Aba Concorrentes — copie este arquivo como concorrentes.js ao publicar.
   Persistência compartilhada no Supabase. Execute concorrentes_supabase.sql. Endpoint opcional:
   GET /api/concorrentes/consultar?nickname=NOME
   Resposta: { nickname, ativo, total_negociacoes, anuncios_ativos, nivel }.
   Configure window.CONCORRENTES_API_URL antes deste script para outra rota.
*/
(() => {
  'use strict';
  const db = () => {
    if (typeof supabaseClient !== 'undefined' && supabaseClient) return supabaseClient;
    if (typeof initSupabase === 'function') initSupabase();
    if (typeof supabaseClient !== 'undefined' && supabaseClient) return supabaseClient;
    throw new Error('Conexão com o Supabase indisponível.');
  };
  const $ = (selector, root = document) => root.querySelector(selector);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt = value => Number(value || 0).toLocaleString('pt-BR');
  const date = value => new Date(value).toLocaleString('pt-BR');
  const state = { competitors: [], selected: null };
  const panelId = 'concorrentesSystem';
  const parseCount = value => {
    if (typeof value === 'number') return Number.isSafeInteger(value) && value >= 0 ? value : null;
    const raw = String(value ?? '').trim();
    if (!/^\d[\d.]*$/.test(raw)) return null;
    const n = Number(raw.replace(/\./g, ''));
    return Number.isSafeInteger(n) && n >= 0 ? n : null;
  };
  async function load() {
    const client = db();
    const [competitors, snapshots] = await Promise.all([
      client.from('concorrentes_ml').select('id,nickname').order('nickname'),
      client.from('concorrentes_ml_historico').select('id,concorrente_id,coletado_em,ativo,total_negociacoes,anuncios_ativos,nivel,origem').order('coletado_em', {ascending:true})
    ]);
    if (competitors.error) throw competitors.error;
    if (snapshots.error) throw snapshots.error;
    const byId = new Map((competitors.data || []).map(row => [row.id, {id:row.id,nickname:row.nickname,history:[]}]));
    for (const row of snapshots.data || []) {
      byId.get(row.concorrente_id)?.history.push({at:row.coletado_em, ativo:row.ativo,
        total:row.total_negociacoes, anuncios:row.anuncios_ativos, nivel:row.nivel, source:row.origem});
    }
    state.competitors = [...byId.values()];
    render();
  }
  async function refresh() {
    try { await load(); setMessage('Dados atualizados.'); }
    catch (error) { setMessage('Erro ao carregar concorrentes: ' + error.message); }
  }
  function selected() { return state.competitors.find(x => x.id === state.selected); }
  function latest(c) { return c.history[c.history.length - 1]; }
  function delta(current, previous) {
    if (!previous) return '—';
    const difference = current - previous;
    const pct = previous ? ' (' + (difference / previous * 100).toLocaleString('pt-BR', {maximumFractionDigits: 1}) + '%)' : '';
    return (difference > 0 ? '+' : '') + fmt(difference) + pct;
  }
  function setMessage(message) { $('#concorrentesMessage').textContent = message; }
  function render() {
    const rows = state.competitors.map(c => {
      const h = latest(c), prev = c.history[c.history.length - 2];
      return `<tr><td><button type="button" class="btn btn-link p-0" data-action="select" data-id="${esc(c.id)}">${esc(c.nickname)}</button></td>
        <td>${h ? (h.ativo ? 'Ativo' : 'Inativo') : '—'}</td><td>${h ? fmt(h.total) : '—'}</td>
        <td>${h ? esc(delta(h.total, prev?.total)) : '—'}</td><td>${h ? fmt(h.anuncios) : '—'}</td>
        <td>${h ? esc(delta(h.anuncios, prev?.anuncios)) : '—'}</td><td>${h ? esc(h.nivel) : '—'}</td>
        <td>${h ? date(h.at) : '—'}</td><td><button type="button" class="btn btn-sm btn-outline-danger" data-action="remove" data-id="${esc(c.id)}">Excluir</button></td></tr>`;
    }).join('');
    $('#concorrentesRows').innerHTML = rows || '<tr><td colspan="9">Nenhum concorrente cadastrado.</td></tr>';
    const c = selected();
    $('#concorrentesSelected').textContent = c ? c.nickname : 'Selecione um concorrente';
    $('#concorrentesSnapshot').hidden = !c;
    $('#concorrentesHistory').innerHTML = c ? c.history.slice().reverse().map((h, index, reversed) => {
      const previous = reversed[index + 1];
      return `<tr><td>${date(h.at)}</td><td>${h.ativo ? 'Ativo' : 'Inativo'}</td>
        <td>${fmt(h.total)}</td><td>${esc(delta(h.total, previous?.total))}</td>
        <td>${fmt(h.anuncios)}</td><td>${esc(delta(h.anuncios, previous?.anuncios))}</td>
        <td>${esc(h.nivel)}</td><td>${esc(h.source)}</td></tr>`;
    }).join('') || '<tr><td colspan="8">Nenhum registro no histórico.</td></tr>' : '';
    if (c) {
      const h = latest(c);
      $('#concorrentesAtivo').value = h ? String(h.ativo) : 'true';
      $('#concorrentesTotal').value = h?.total ?? '';
      $('#concorrentesAnuncios').value = h?.anuncios ?? '';
      $('#concorrentesNivel').value = h?.nivel ?? '';
    }
  }
  async function addSnapshot(c, input, source) {
    const total = parseCount(input.total), anuncios = parseCount(input.anuncios);
    if (total === null || anuncios === null || !['Prata','Ouro','Platinum','Sem nível'].includes(input.nivel)) {
      throw new Error('Informe números inteiros não negativos e selecione o nível.');
    }
    const next = {at: new Date().toISOString(), ativo: input.ativo === true, total, anuncios, nivel: input.nivel, source};
    const old = latest(c);
    if (old && old.ativo === next.ativo && old.total === total && old.anuncios === anuncios && old.nivel === next.nivel) {
      setMessage('Sem mudança desde o último registro; o histórico foi preservado.'); return;
    }
    const {error} = await db().from('concorrentes_ml_historico').insert({
      concorrente_id:c.id, ativo:next.ativo, total_negociacoes:total,
      anuncios_ativos:anuncios, nivel:next.nivel, origem:source
    });
    if (error) throw error;
    await load();
    setMessage('Registro salvo no histórico.');
  }
  async function consult(c) {
    const url = window.CONCORRENTES_API_URL || '/api/concorrentes/consultar';
    const target = url + (url.includes('?') ? '&' : '?') + 'nickname=' + encodeURIComponent(c.nickname);
    const response = await fetch(target, {credentials:'same-origin', headers:{Accept:'application/json'}});
    if (!response.ok) throw new Error('Consulta indisponível (HTTP ' + response.status + '). Você pode registrar uma medição manual.');
    const data = await response.json();
    const body = data.data || data;
    if (body.nickname && body.nickname.toLowerCase() !== c.nickname.toLowerCase()) throw new Error('A API retornou outro vendedor.');
    if (typeof body.ativo !== 'boolean') throw new Error('A API não informou uma situação válida.');
    const nivel = ({silver:'Prata', gold:'Ouro', platinum:'Platinum', none:'Sem nível'})[String(body.nivel).toLowerCase()] || body.nivel;
    await addSnapshot(c, {ativo:body.ativo, total:body.total_negociacoes, anuncios:body.anuncios_ativos, nivel}, 'API');
  }
  function init() {
    if ($('#' + panelId)) return;
    const style = document.createElement('style');
    style.textContent = '#concorrentesSystem{max-width:none;margin:0;padding:0}#concorrentesSystem .cc-content{padding-bottom:30px}#concorrentesSystem .main-header{margin-bottom:30px}#concorrentesSystem .cc-grid{display:grid;grid-template-columns:1fr 1fr;gap:18px}#concorrentesSystem .cc-card{background:#fff;border:1px solid #dce2eb;border-radius:12px;padding:20px;margin-bottom:18px}#concorrentesSystem .cc-table{overflow-x:auto}#concorrentesSystem table{width:100%;min-width:850px}#concorrentesSystem th,#concorrentesSystem td{padding:9px;border-bottom:1px solid #eee;text-align:left}#concorrentesSystem .cc-fields{display:grid;grid-template-columns:repeat(4,minmax(120px,1fr));gap:12px}@media(max-width:850px){#concorrentesSystem .cc-grid{grid-template-columns:1fr}#concorrentesSystem .cc-fields{grid-template-columns:1fr 1fr}}';
    document.head.appendChild(style);
    const root = document.createElement('div');
    root.id = panelId;
    root.className = 'hidden';
    root.innerHTML = `<header class="main-header"><div class="container"><div class="header-content"><h1 style="display:flex;align-items:center;gap:10px"><img src="logo.png" alt="Wheel Tech" style="height:35px;width:auto"> Concorrentes</h1><button type="button" class="btn btn-outline-secondary btn-sm" id="concorrentesBack"><i class="fas fa-arrow-left"></i> Voltar ao início</button></div></div></header>
      <div class="container cc-content"><div class="cc-card"><h3><i class="fas fa-chart-line"></i> Acompanhamento de concorrentes</h3><p>Cadastre vendedores pelo nome de usuário no Mercado Livre, acompanhe medições e compare a evolução entre registros.</p>
      <p style="color:#666">Histórico compartilhado no sistema. Consulta automática depende da rota do servidor configurada para o Mercado Livre.</p>
      <button type="button" class="btn btn-outline-primary btn-sm" id="concorrentesRefresh">Atualizar lista</button>
      <div id="concorrentesMessage" role="status" aria-live="polite"></div></div>
      <div class="cc-card"><form id="concorrentesAdd"><label>Nome do vendedor no Mercado Livre <input class="form-control" name="nickname" maxlength="80" required placeholder="Ex.: LOJA_EXEMPLO"></label>
      <button class="btn btn-primary" type="submit" style="margin-top:10px">Adicionar concorrente</button></form></div>
      <div class="cc-card cc-table"><h3>Comparação atual</h3><table><thead><tr><th>Vendedor</th><th>Situação</th><th>Negociações</th><th>Variação</th><th>Anúncios ativos</th><th>Variação</th><th>Nível</th><th>Último registro</th><th>Ações</th></tr></thead><tbody id="concorrentesRows"></tbody></table></div>
      <div class="cc-card"><h3>Histórico: <span id="concorrentesSelected">Selecione um concorrente</span></h3>
      <div id="concorrentesSnapshot" hidden><form id="concorrentesForm"><div class="cc-fields">
      <label>Situação<select id="concorrentesAtivo" class="form-control"><option value="true">Ativo</option><option value="false">Inativo</option></select></label>
      <label>Total de negociações<input id="concorrentesTotal" class="form-control" inputmode="numeric" required></label>
      <label>Anúncios ativos<input id="concorrentesAnuncios" class="form-control" inputmode="numeric" required></label>
      <label>Nível<select id="concorrentesNivel" class="form-control" required><option value="">Selecione</option><option>Prata</option><option>Ouro</option><option>Platinum</option><option>Sem nível</option></select></label>
      </div><button type="submit" class="btn btn-primary" style="margin-top:12px">Salvar medição</button>
      <button type="button" id="concorrentesConsult" class="btn btn-outline-primary" style="margin-top:12px">Consultar Mercado Livre</button></form>
      <div class="cc-table" style="margin-top:18px"><table><thead><tr><th>Data</th><th>Situação</th><th>Negociações</th><th>Variação</th><th>Anúncios</th><th>Variação</th><th>Nível</th><th>Origem</th></tr></thead><tbody id="concorrentesHistory"></tbody></table></div></div></div></div>`;
    document.body.appendChild(root);
    $('#concorrentesRefresh').onclick = refresh;
    $('#concorrentesBack').onclick = () => typeof window.voltarParaMenu === 'function' ? window.voltarParaMenu() : (root.classList.add('hidden'), $('#menuSystem')?.classList.remove('hidden'));
    $('#concorrentesAdd').onsubmit = async event => {
      event.preventDefault();
      const nickname = new FormData(event.currentTarget).get('nickname').trim();
      if (!/^[\w.-]{3,80}$/.test(nickname)) return setMessage('Use o nome de usuário do vendedor (3 a 80 caracteres, letras, números, ponto, hífen ou _).');
      const found = state.competitors.find(c => c.nickname.toLowerCase() === nickname.toLowerCase());
      if (found) { state.selected = found.id; render(); return setMessage('Este vendedor já está cadastrado.'); }
      try {
        const {data,error} = await db().from('concorrentes_ml').insert({nickname}).select('id').single();
        if (error) throw error;
        state.selected = data.id; event.currentTarget.reset(); await load(); setMessage('Concorrente adicionado.');
      } catch (error) { setMessage('Erro ao adicionar: ' + error.message); }
    };
    $('#concorrentesRows').onclick = async event => {
      const button = event.target.closest('button[data-action]'); if (!button) return;
      const c = state.competitors.find(x => x.id === button.dataset.id); if (!c) return;
      if (button.dataset.action === 'select') { state.selected = c.id; render(); return; }
      if (!confirm('Excluir ' + c.nickname + ' e todo o histórico?')) return;
      try {
        const {error} = await db().from('concorrentes_ml').delete().eq('id', c.id);
        if (error) throw error;
        if (state.selected === c.id) state.selected = null;
        await load(); setMessage('Concorrente excluído.');
      } catch (error) { setMessage('Erro ao excluir: ' + error.message); }
    };
    $('#concorrentesForm').onsubmit = async event => {
      event.preventDefault(); const c = selected(); if (!c) return;
      try { await addSnapshot(c, {ativo:$('#concorrentesAtivo').value === 'true', total:$('#concorrentesTotal').value, anuncios:$('#concorrentesAnuncios').value, nivel:$('#concorrentesNivel').value}, 'Manual'); }
      catch (error) { setMessage('Erro ao salvar: ' + error.message); }
    };
    $('#concorrentesConsult').onclick = async event => {
      const c = selected(); if (!c) return;
      event.currentTarget.disabled = true; setMessage('Consultando ' + c.nickname + '...');
      try { await consult(c); } catch (error) { setMessage(error.message); }
      finally { event.currentTarget.disabled = false; }
    };
    render();
  }
  window.abrirSistemaConcorrentes = function () {
    init();
    if (typeof window.voltarParaMenu === 'function') window.voltarParaMenu();
    document.querySelectorAll('body > div[id$="System"], body > div[id$="Screen"]').forEach(node => {
      if (node.id !== panelId && node.id !== 'loginScreen') node.classList.add('hidden');
    });
    $('#menuSystem')?.classList.add('hidden');
    $('#' + panelId).classList.remove('hidden');
    document.body.classList.add('wt-global-sidebar-active');
    window.scrollTo({top:0,behavior:'instant'});
    refresh();
  };
})();