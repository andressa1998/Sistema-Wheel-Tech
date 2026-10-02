/* ============================================================
   WHEEL TECH · Conferência de estoque
   ------------------------------------------------------------
   1) CONFERÊNCIA DIÁRIA COM O MERCADO LIVRE (só andressamiotto / ronald)
      - Uma vez por dia, em segundo plano, confere 200 produtos (rodízio
        por id: cada dia continua de onde parou o anterior).
      - Para cada anúncio/variação, calcula quanto DEVERIA estar no ML
        (mesmas regras da sincronização: SKU primo, kits, prefixo de
        quantidade, estoque máximo, raios) usando
        sincronizarEstoqueML(produto, { somenteConferir: true }) — que
        NÃO envia nada e não abre modal. FULL puro é ignorado; FULL com
        estoque próprio (convivência) é conferido só na parte própria.
      - Divergências aparecem na tela inicial; a pessoa decide o que
        fazer (abrir anúncio, sincronizar, reconferir, marcar resolvida).
        O sistema não corrige nada sozinho.
      - Estado e divergências ficam em configuracoes_sistema:
          'conferencia_estoque_ml'                (andamento do dia)
          'conferencia_estoque_ml_divergencias'   (lista em aberto)

   2) VERIFICAÇÃO DE ESTOQUE FÍSICO (todos os usuários)
      - Botão na coluna Ações: registra quem, dia e horário.
      - Aparece no Histórico do produto (seção separada das movimentações).
      - Aviso na Gestão: produtos sem verificação física há mais de
        DIAS_ALERTA_FISICO dias.

   SQL (rodar uma vez no Supabase):

   create table if not exists public.estoque_verificacoes_fisicas (
       id bigserial primary key,
       produto_id bigint not null,
       sku text,
       produto_nome text,
       quantidade_sistema integer,
       verificado_por text not null,
       verificado_em timestamptz not null default now()
   );
   create index if not exists estoque_verificacoes_fisicas_produto_idx
       on public.estoque_verificacoes_fisicas (produto_id, verificado_em desc);
   ============================================================ */
(function () {
    'use strict';

    const USUARIOS_CONFERENCIA = ['andressamiotto', 'ronald'];
    const PRODUTOS_POR_DIA = 200;
    const CHAVE_ESTADO = 'conferencia_estoque_ml';
    const CHAVE_DIVERGENCIAS = 'conferencia_estoque_ml_divergencias';
    const PAUSA_ENTRE_PRODUTOS_MS = 1500;
    const TRAVA_MS = 3 * 60 * 1000;             // outra pessoa rodando há menos que isso → espera

    const TABELA_FISICO = 'estoque_verificacoes_fisicas';
    const DIAS_ALERTA_FISICO = 30;
    // Produto que nunca foi verificado conta a partir do início do controle.
    const INICIO_CONTROLE_FISICO = new Date('2026-10-01T00:00:00');
    const DIA_MS = 86400000;

    // ---------- helpers ----------
    function usuario() {
        return String((window.currentUser && window.currentUser.username) || '').trim().toLowerCase();
    }
    function podeConferir() { return USUARIOS_CONFERENCIA.includes(usuario()); }
    function sb() { return window.supabaseClient || null; }
    function esc(v) {
        return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function toast(msg, tipo) { if (window.showToast) window.showToast(msg, tipo || 'info'); }
    function produtos() {
        try { return (typeof produtosEstoque !== 'undefined' && produtosEstoque) || []; } catch (e) { return []; }
    }
    function produtoPorId(id) { return produtos().find(p => String(p.id) === String(id)) || null; }
    function hojeISO() {
        const d = new Date();
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }
    function fmtDataHora(iso) {
        if (!iso) return '—';
        const d = new Date(iso);
        return isNaN(d) ? '—' : d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    }
    function dormir(ms) { return new Promise(r => setTimeout(r, ms)); }
    function mlbsDoProduto(p) {
        let m = (p.dados_extra && p.dados_extra.mlb_codes) || p.mlb_codes || [];
        if (typeof m === 'string') m = m.split(',').map(s => s.trim()).filter(Boolean);
        return Array.isArray(m) ? m.filter(Boolean) : [];
    }
    function produtoAtivo(p) { return !(p && p.dados_extra && p.dados_extra.inativo === true); }
    function syncBloqueado(p) { return !!(p.bloquear_sync_ml || (p.dados_extra && p.dados_extra.bloquear_sync_ml)); }
    function telaVisivel(id) {
        const el = document.getElementById(id);
        return !!el && !el.classList.contains('hidden');
    }

    async function lerConfig(chave) {
        const { data, error } = await sb().from('configuracoes_sistema').select('valor').eq('chave', chave).maybeSingle();
        if (error) throw error;
        return (data && data.valor) || null;
    }
    async function salvarConfig(chave, valor) {
        const { error } = await sb().from('configuracoes_sistema').upsert({ chave, valor }, { onConflict: 'chave' });
        if (error) throw error;
    }

    // ==========================================================
    // 1) CONFERÊNCIA DIÁRIA COM O ML
    // ==========================================================
    let rodando = false;
    let cacheDivergencias = { itens: [], lido: 0 };
    let estadoCache = null;

    function idDivergencia(d) { return `${d.produto_id}|${d.mlb}|${d.variation_id || ''}`; }

    async function lerDivergencias() {
        const v = await lerConfig(CHAVE_DIVERGENCIAS);
        const itens = v && Array.isArray(v.itens) ? v.itens : [];
        cacheDivergencias = { itens, lido: Date.now() };
        return itens;
    }

    // Troca as divergências dos produtos conferidos (relê antes de gravar
    // para não apagar o que outra pessoa mudou enquanto isso).
    async function aplicarResultados(porProduto) {
        const atuais = await lerDivergencias();
        const ids = new Set(Object.keys(porProduto));
        const antigas = new Map(atuais.map(d => [idDivergencia(d), d]));
        const novas = atuais.filter(d => !ids.has(String(d.produto_id)));
        Object.values(porProduto).forEach(lista => lista.forEach(d => {
            const anterior = antigas.get(idDivergencia(d));
            novas.push({ ...d, detectado_em: anterior ? anterior.detectado_em : d.detectado_em });
        }));
        await salvarConfig(CHAVE_DIVERGENCIAS, { itens: novas, atualizado_em: new Date().toISOString() });
        cacheDivergencias = { itens: novas, lido: Date.now() };
        atualizarAvisoInicio();
        if (document.getElementById('wtcfModalDiv')) desenharModalDivergencias();
    }

    // Recarrega quantidade/dados do produto direto do banco (a lista em
    // memória pode estar velha) e confere de novo.
    async function atualizarProdutoDoBanco(p) {
        const { data } = await sb().from('produtos_estoque').select('quantidade, dados_extra').eq('id', p.id).maybeSingle();
        if (data) { p.quantidade = data.quantidade; p.dados_extra = data.dados_extra; }
    }

    // Confere UM produto. Retorna { ok, divergencias: [...] } ou { ok: false, erro }.
    async function conferirProduto(p, segundaTentativa) {
        if (typeof window.sincronizarEstoqueML !== 'function') return { ok: false, erro: 'sincronizacao indisponivel' };
        let r;
        try { r = await window.sincronizarEstoqueML(p, { somenteConferir: true }); }
        catch (e) { return { ok: false, erro: e.message || String(e) }; }
        const resultados = (r && r.results) || [];
        if (r && r.success === false && r.error) return { ok: false, erro: r.error };
        const comparados = resultados.filter(x => x.conferencia);
        const erros = resultados.filter(x => !x.conferencia && !x.ignorado && x.error);
        if (!comparados.length && erros.length) return { ok: false, erro: erros[0].error };

        const divergentes = comparados.filter(x => Number(x.esperado) !== Number(x.no_ml));
        // Antes de acusar, confirma com o estoque mais recente do banco
        // (uma venda/entrada no meio do caminho geraria alarme falso).
        if (divergentes.length && !segundaTentativa) {
            await atualizarProdutoDoBanco(p);
            await dormir(800);
            return conferirProduto(p, true);
        }
        const agora = new Date().toISOString();
        return {
            ok: true,
            divergencias: divergentes.map(x => ({
                produto_id: p.id,
                sku: p.sku,
                nome: p.nome,
                mlb: x.codigo,
                variation_id: x.variation_id || null,
                sku_anuncio: x.sku_anuncio || '',
                estoque_sistema: Number(p.quantidade) || 0,
                esperado: Number(x.esperado) || 0,
                no_ml: Number(x.no_ml) || 0,
                full_convivio: x.tipo === 'full_convivio',
                detectado_em: agora,
                conferido_em: agora
            }))
        };
    }

    function candidatosConferencia() {
        return produtos()
            .filter(p => produtoAtivo(p) && !syncBloqueado(p) && mlbsDoProduto(p).length)
            .sort((a, b) => Number(a.id) - Number(b.id));
    }

    async function tentarConferenciaDiaria() {
        if (rodando || !podeConferir() || !sb()) return;
        let token = null;
        try { token = localStorage.getItem('ml_access_token'); } catch (e) { /* sem storage */ }
        if (!token) return;

        let estado;
        try { estado = (await lerConfig(CHAVE_ESTADO)) || {}; } catch (e) { return; }
        estadoCache = estado;
        const hoje = hojeISO();
        const feitosHoje = estado.dia === hoje ? (Number(estado.feitos_hoje) || 0) : 0;
        if (feitosHoje >= PRODUTOS_POR_DIA) return;
        const batida = estado.batida_em ? new Date(estado.batida_em).getTime() : 0;
        if (estado.rodando_por && estado.rodando_por !== usuario() && Date.now() - batida < TRAVA_MS) return;

        rodando = true;
        try {
            if (!produtos().length && typeof window.carregarProdutosEstoque === 'function') {
                await window.carregarProdutosEstoque();
            }
            const lista = candidatosConferencia();
            if (!lista.length) return;

            let cursor = Number(estado.cursor_id) || 0;
            let feitos = feitosHoje;
            let semToken = 0;
            const pendentes = {};
            const salvarEstado = async (extra) => {
                estadoCache = {
                    ...estado, dia: hoje, feitos_hoje: feitos, cursor_id: cursor,
                    rodando_por: usuario(), batida_em: new Date().toISOString(), ...extra
                };
                await salvarConfig(CHAVE_ESTADO, estadoCache);
            };
            await salvarEstado({ iniciado_em: estado.dia === hoje && estado.iniciado_em ? estado.iniciado_em : new Date().toISOString() });

            // rodízio: começa depois do último id conferido e dá a volta
            const inicio = lista.findIndex(p => Number(p.id) > cursor);
            const ordem = inicio < 0 ? lista : lista.slice(inicio).concat(lista.slice(0, inicio));

            for (const p of ordem) {
                if (feitos >= PRODUTOS_POR_DIA) break;
                if (!podeConferir()) break;   // saiu / trocou de usuário
                const res = await conferirProduto(p);
                if (!res.ok) {
                    // token vencido / sem acesso: para e tenta de novo depois, sem avançar
                    if (/401|403|token/i.test(String(res.erro))) { if (++semToken >= 3) break; continue; }
                } else {
                    semToken = 0;
                    pendentes[String(p.id)] = res.divergencias;
                }
                cursor = Number(p.id);
                feitos++;
                if (feitos % 5 === 0) {
                    if (Object.keys(pendentes).length) {
                        await aplicarResultados(pendentes);
                        Object.keys(pendentes).forEach(k => delete pendentes[k]);
                    }
                    await salvarEstado({});
                }
                await dormir(PAUSA_ENTRE_PRODUTOS_MS);
            }
            if (Object.keys(pendentes).length) await aplicarResultados(pendentes);
            await salvarEstado(feitos >= PRODUTOS_POR_DIA
                ? { rodando_por: null, concluido_em: new Date().toISOString() }
                : { rodando_por: null });
            console.log(`✅ [conferencia-estoque] ${feitos} produto(s) conferidos hoje.`);
        } catch (e) {
            console.warn('[conferencia-estoque] conferência diária:', e.message || e);
        } finally {
            rodando = false;
        }
    }

    // ---------- aviso na tela inicial ----------
    function garantirEstiloConferencia() {
        if (document.getElementById('wtcfEstilo')) return;
        const st = document.createElement('style');
        st.id = 'wtcfEstilo';
        st.textContent = `
            .wtcf-aviso{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin:0 0 16px;padding:12px 16px;
                background:#fff7ed;border:1px solid #fed7aa;border-left:4px solid #f97316;border-radius:12px;color:#7c2d12;font-size:.85rem}
            .wtcf-aviso i{color:#f97316;font-size:1.1rem}
            .wtcf-aviso span{flex:1;min-width:200px}
            .wtcf-aviso button{border:0;border-radius:8px;padding:7px 14px;background:#f97316;color:#fff;font-weight:700;font-size:.78rem;cursor:pointer}
            .wtcf-modal{position:fixed;inset:0;background:rgba(15,23,42,.5);z-index:100000;display:flex;align-items:flex-start;justify-content:center;padding:40px 16px;overflow:auto}
            .wtcf-caixa{background:#fff;border-radius:12px;padding:18px;width:100%;max-width:1100px;box-shadow:0 20px 60px rgba(0,0,0,.3)}
            .wtcf-topo{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:10px}
            .wtcf-topo h3{margin:0;font-size:18px;color:#0f172a}
            .wtcf-sub{font-size:12px;color:#64748b;margin-top:4px}
            .wtcf-caixa table{font-size:13px;margin:0}
            .wtcf-caixa td{vertical-align:middle}
            .wtcf-num{font-weight:700;text-align:center}
            .wtcf-num.ruim{color:#dc2626}
            .wtcf-acoes{display:flex;flex-wrap:wrap;gap:4px}
            .wtcf-acoes .btn{padding:2px 8px;font-size:12px}
            .wtcf-fisico-aviso{margin:0 0 10px;padding:10px 14px;background:#fffbeb;border:1px solid #fde68a;border-left:4px solid #f59e0b;border-radius:7px;font-size:13px}
            .wtcf-fisico-aviso .wtcf-linha{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
            .wtcf-fisico-aviso .wtcf-linha span{flex:1;min-width:200px}
            .wtcf-fisico-lista{margin-top:10px;max-height:360px;overflow:auto;background:#fff;border-radius:6px}
            .wtcf-fisico-lista table{font-size:12px;margin:0}
            .btn-wtcf-fisico{background:#0f766e;color:#fff;border-color:#0f766e}
            .btn-wtcf-fisico.atrasado{background:#f59e0b;border-color:#f59e0b}
            .btn-wtcf-fisico:hover{filter:brightness(1.1);color:#fff}
            .wtcf-chip{position:fixed;right:16px;bottom:16px;z-index:100001;display:flex;align-items:center;gap:10px;max-width:calc(100vw - 32px);
                padding:10px 14px;background:#0f172a;color:#fff;border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,.25);font-size:13px}
            .wtcf-chip button{border:0;border-radius:6px;padding:4px 10px;background:#334155;color:#fff;font-size:12px;cursor:pointer}
            .wtcf-chip button[data-wtcf-chip-ver]{background:#f97316}
            .wtcf-hist{margin:0 0 18px;border:1px solid #ccfbf1;background:#f0fdfa;border-radius:8px;padding:12px 15px}
            .wtcf-hist h4{margin:0 0 8px;font-size:15px;color:#0f766e}
            .wtcf-hist table{font-size:12px;margin:0;background:#fff}
        `;
        document.head.appendChild(st);
    }

    function divergenciasAbertas() { return cacheDivergencias.itens || []; }

    async function atualizarAvisoInicio(forcarLeitura) {
        const menu = document.getElementById('menuSystem');
        let aviso = document.getElementById('wtcfAvisoInicio');
        if (!podeConferir() || !menu) { if (aviso) aviso.remove(); return; }
        if (forcarLeitura || Date.now() - cacheDivergencias.lido > 60000) {
            try { await lerDivergencias(); } catch (e) { return; }
        }
        const n = divergenciasAbertas().length;
        if (!n) { if (aviso) aviso.remove(); return; }
        garantirEstiloConferencia();
        if (!aviso) {
            const ancora = menu.querySelector('.wt-dashboard-search');
            if (!ancora) return;
            aviso = document.createElement('div');
            aviso.id = 'wtcfAvisoInicio';
            aviso.className = 'wtcf-aviso';
            ancora.insertAdjacentElement('beforebegin', aviso);
        }
        const produtosDiv = new Set(divergenciasAbertas().map(d => d.produto_id)).size;
        // Chamado a cada 2 s: só mexe no DOM quando o texto muda (reescrever
        // sempre forçava recálculo de estilo/layout da página inteira).
        const html = `<i class="fas fa-triangle-exclamation"></i>
            <span><strong>Divergência de estoque no Mercado Livre:</strong> ${n} anúncio(s) de ${produtosDiv} produto(s) com quantidade diferente do estoque real/regras.</span>
            <button type="button" id="wtcfBtnVerDiv">Ver divergências</button>`;
        if (aviso._wtcfHtml === html) return;
        aviso._wtcfHtml = html;
        aviso.innerHTML = html;
        aviso.querySelector('#wtcfBtnVerDiv').addEventListener('click', abrirModalDivergencias);
    }

    // ---------- modal de divergências ----------
    async function abrirModalDivergencias() {
        if (!podeConferir()) return;
        garantirEstiloConferencia();
        let ov = document.getElementById('wtcfModalDiv');
        if (!ov) {
            ov = document.createElement('div');
            ov.id = 'wtcfModalDiv';
            ov.className = 'wtcf-modal';
            ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
            document.body.appendChild(ov);
        }
        ov.innerHTML = '<div class="wtcf-caixa"><i class="fas fa-spinner fa-spin"></i> Carregando…</div>';
        try {
            await lerDivergencias();
            estadoCache = (await lerConfig(CHAVE_ESTADO)) || estadoCache;
        } catch (e) { /* mostra o que tem */ }
        if (!produtos().length && typeof window.carregarProdutosEstoque === 'function') {
            try { await window.carregarProdutosEstoque(); } catch (e) { /* segue */ }
        }
        desenharModalDivergencias();
    }

    function desenharModalDivergencias() {
        const ov = document.getElementById('wtcfModalDiv');
        if (!ov) return;
        const itens = divergenciasAbertas().slice()
            .sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR') || String(a.mlb).localeCompare(String(b.mlb)));
        const e = estadoCache || {};
        const info = e.dia
            ? `Conferência de hoje: ${e.dia === hojeISO() ? (e.feitos_hoje || 0) : 0} de ${PRODUTOS_POR_DIA} produtos${e.concluido_em && e.dia === hojeISO() ? ' (concluída)' : ''}. Anúncios só FULL não entram; FULL com estoque próprio é conferido só na parte própria.`
            : 'A conferência diária ainda não rodou.';
        const linhas = itens.map(d => {
            const id = esc(idDivergencia(d));
            const link = `https://www.mercadolivre.com.br/anuncios/${encodeURIComponent(d.mlb)}/modificar/`;
            return `<tr>
                <td><strong>${esc(d.nome)}</strong><br><small class="text-muted">SKU ${esc(d.sku)}</small></td>
                <td><a href="${link}" target="_blank" rel="noopener">${esc(d.mlb)}</a>${d.full_convivio ? ' <span class="badge" style="background:#fef3c7;color:#92400e;" title="Anúncio FULL com estoque próprio: o número é só da parte própria (fora do armazém do ML)">FULL · parte própria</span>' : ''}${d.variation_id ? `<br><small class="text-muted">variação ${esc(d.variation_id)}${d.sku_anuncio ? ' · ' + esc(d.sku_anuncio) : ''}</small>` : (d.sku_anuncio ? `<br><small class="text-muted">${esc(d.sku_anuncio)}</small>` : '')}</td>
                <td class="wtcf-num">${esc(d.estoque_sistema)}</td>
                <td class="wtcf-num">${esc(d.esperado)}</td>
                <td class="wtcf-num ruim">${esc(d.no_ml)}</td>
                <td><small>${esc(fmtDataHora(d.detectado_em))}</small></td>
                <td><div class="wtcf-acoes">
                    <a class="btn btn-outline-primary" href="${link}" target="_blank" rel="noopener" title="Abrir o anúncio no ML"><i class="fas fa-external-link-alt"></i></a>
                    <button type="button" class="btn btn-outline-secondary" data-wtcf-ver="${esc(d.sku)}" title="Abrir o produto na Gestão de Estoque"><i class="fas fa-box"></i></button>
                    <button type="button" class="btn btn-outline-dark" data-wtcf-reconf="${esc(d.produto_id)}" title="Conferir de novo agora"><i class="fas fa-rotate"></i> Reconferir</button>
                    <button type="button" class="btn btn-primary" data-wtcf-sync="${esc(d.produto_id)}" title="Enviar para o ML a quantidade calculada pelo sistema"><i class="fab fa-mercadolibre"></i> Sincronizar</button>
                    <button type="button" class="btn btn-success" data-wtcf-ok="${id}" title="Já resolvi — tirar da lista"><i class="fas fa-check"></i></button>
                </div></td>
            </tr>`;
        }).join('');

        ov.innerHTML = `<div class="wtcf-caixa">
            <div class="wtcf-topo">
                <div><h3><i class="fas fa-scale-unbalanced"></i> Divergências de estoque no Mercado Livre</h3>
                    <div class="wtcf-sub">${esc(info)} O sistema só avisa — nenhuma quantidade é alterada sozinha.</div></div>
                <div style="display:flex;gap:6px;align-items:flex-start;">
                    <button type="button" class="btn btn-sm btn-primary" data-wtcf-sync-todos ${itens.length && !sincronizandoTodos ? '' : 'disabled'} title="Sincroniza todos os produtos da lista em segundo plano e avisa quando terminar">
                        <i class="fas fa-${sincronizandoTodos ? 'spinner fa-spin' : 'rotate'}"></i> ${sincronizandoTodos ? 'Sincronizando…' : 'Sincronizar todos'}
                    </button>
                    <button type="button" class="btn btn-sm btn-outline-secondary" data-wtcf-fechar><i class="fas fa-times"></i></button>
                </div>
            </div>
            <div class="table-responsive"><table class="table table-sm table-bordered">
                <thead><tr><th>Produto</th><th>Anúncio</th><th title="Estoque real no sistema">Estoque real</th><th title="Quanto deveria estar no ML pelas regras">Deveria ter no ML</th><th>Está no ML</th><th>Detectado</th><th>Ações</th></tr></thead>
                <tbody>${linhas || '<tr><td colspan="7" class="text-center text-muted" style="padding:24px;">Nenhuma divergência em aberto. 🎉</td></tr>'}</tbody>
            </table></div>
        </div>`;

        ov.querySelector('[data-wtcf-fechar]').addEventListener('click', () => ov.remove());
        ov.querySelector('[data-wtcf-sync-todos]')?.addEventListener('click', sincronizarTodos);
        ov.querySelectorAll('[data-wtcf-ver]').forEach(b => b.addEventListener('click', () => {
            ov.remove();
            if (typeof window.pesquisarNoEstoqueDoMenuPrincipal === 'function') window.pesquisarNoEstoqueDoMenuPrincipal(b.dataset.wtcfVer);
        }));
        ov.querySelectorAll('[data-wtcf-reconf]').forEach(b => b.addEventListener('click', () => reconferir(b.dataset.wtcfReconf, b)));
        ov.querySelectorAll('[data-wtcf-sync]').forEach(b => b.addEventListener('click', async () => {
            if (!confirm('Enviar para o Mercado Livre a quantidade calculada pelo sistema para TODOS os anúncios deste produto?')) return;
            b.disabled = true;
            try { if (typeof window.sincronizarProdutoML === 'function') await window.sincronizarProdutoML(b.dataset.wtcfSync); } catch (e) { /* toast do próprio sync */ }
            await reconferir(b.dataset.wtcfSync, null);
        }));
        ov.querySelectorAll('[data-wtcf-ok]').forEach(b => b.addEventListener('click', () => marcarResolvida(b.dataset.wtcfOk)));
    }

    async function reconferir(produtoId, botao) {
        const p = produtoPorId(produtoId);
        if (!p) { toast('Produto não encontrado na lista do estoque.', 'warning'); return; }
        if (botao) { botao.disabled = true; botao.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; }
        try {
            await atualizarProdutoDoBanco(p);
            const res = await conferirProduto(p, true);
            if (!res.ok) { toast('Não deu para conferir: ' + res.erro, 'warning'); desenharModalDivergencias(); return; }
            await aplicarResultados({ [String(p.id)]: res.divergencias });
            toast(res.divergencias.length ? `⚠️ Continua com ${res.divergencias.length} divergência(s).` : '✅ Estoque no ML confere.', res.divergencias.length ? 'warning' : 'success');
        } catch (e) {
            toast('Erro ao reconferir: ' + (e.message || e), 'error');
            desenharModalDivergencias();
        }
    }

    // ---------- "Sincronizar todos" (segundo plano) ----------
    // Tira da lista na hora, sincroniza produto por produto sem toast/modal,
    // reconfere cada um e, no fim, avisa. O que continuar divergente
    // (ex.: anúncio FULL sem estoque próprio editável) volta para a lista.
    let sincronizandoTodos = false;

    function chipProgresso(html, fechar) {
        garantirEstiloConferencia();
        let chip = document.getElementById('wtcfChipSync');
        if (!chip) {
            chip = document.createElement('div');
            chip.id = 'wtcfChipSync';
            chip.className = 'wtcf-chip';
            document.body.appendChild(chip);
        }
        chip.innerHTML = html;
        chip.querySelector('[data-wtcf-chip-ver]')?.addEventListener('click', () => { chip.remove(); abrirModalDivergencias(); });
        chip.querySelector('[data-wtcf-chip-fechar]')?.addEventListener('click', () => chip.remove());
        if (fechar) setTimeout(() => chip.remove(), 30000);
    }

    async function sincronizarTodos() {
        if (sincronizandoTodos || !podeConferir()) return;
        const itens = divergenciasAbertas().slice();
        const ids = [...new Set(itens.map(d => String(d.produto_id)))];
        if (!ids.length) return;
        if (!confirm(`Sincronizar ${ids.length} produto(s) com o Mercado Livre em segundo plano?\n\nA lista é zerada agora e você recebe um aviso quando terminar.`)) return;

        sincronizandoTodos = true;
        try {
            // zera a lista (só o que estava nela agora)
            const tirar = new Set(itens.map(idDivergencia));
            const atuais = await lerDivergencias();
            const restantes = atuais.filter(d => !tirar.has(idDivergencia(d)));
            await salvarConfig(CHAVE_DIVERGENCIAS, { itens: restantes, atualizado_em: new Date().toISOString() });
            cacheDivergencias = { itens: restantes, lido: Date.now() };
        } catch (e) {
            sincronizandoTodos = false;
            toast('Erro ao zerar a lista: ' + (e.message || e), 'error');
            return;
        }
        document.getElementById('wtcfModalDiv')?.remove();
        atualizarAvisoInicio();
        toast(`🔄 Sincronizando ${ids.length} produto(s) em segundo plano…`, 'info');

        if (!produtos().length && typeof window.carregarProdutosEstoque === 'function') {
            try { await window.carregarProdutosEstoque(); } catch (e) { /* segue */ }
        }

        const aindaDivergentes = {};
        let ok = 0, comFalha = 0, naoAchados = 0;
        try {
            for (let i = 0; i < ids.length; i++) {
                chipProgresso(`<i class="fas fa-spinner fa-spin"></i> Sincronizando estoque ML: <strong>${i + 1}/${ids.length}</strong>`);
                const p = produtoPorId(ids[i]);
                if (!p) { naoAchados++; continue; }
                try {
                    await atualizarProdutoDoBanco(p);
                    await window.sincronizarEstoqueML(p, { silencioso: true });
                    await dormir(1500);   // o ML leva um instante para refletir
                    const res = await conferirProduto(p, true);
                    if (res.ok) {
                        aindaDivergentes[String(p.id)] = res.divergencias;
                        if (res.divergencias.length) comFalha++; else ok++;
                    } else {
                        // não deu para conferir: devolve os itens originais
                        aindaDivergentes[String(p.id)] = itens.filter(d => String(d.produto_id) === String(p.id));
                        comFalha++;
                    }
                } catch (e) {
                    console.warn('[conferencia-estoque] sincronizar todos:', p.sku, e);
                    aindaDivergentes[String(p.id)] = itens.filter(d => String(d.produto_id) === String(p.id));
                    comFalha++;
                }
                await dormir(800);
            }
            if (Object.keys(aindaDivergentes).length) await aplicarResultados(aindaDivergentes);
        } finally {
            sincronizandoTodos = false;
        }

        const restam = Object.values(aindaDivergentes).reduce((s, l) => s + l.length, 0);
        const msg = `✅ Sincronização concluída: ${ok} produto(s) ok` +
            (comFalha ? ` · ${comFalha} ainda com divergência` : '') +
            (naoAchados ? ` · ${naoAchados} não encontrado(s)` : '');
        toast(msg, comFalha ? 'warning' : 'success');
        chipProgresso(`<span>${esc(msg)}</span>
            ${restam ? '<button type="button" data-wtcf-chip-ver>Ver lista</button>' : ''}
            <button type="button" data-wtcf-chip-fechar title="Fechar"><i class="fas fa-times"></i></button>`, true);
    }

    async function marcarResolvida(id) {
        try {
            const atuais = await lerDivergencias();
            const novas = atuais.filter(d => idDivergencia(d) !== id);
            await salvarConfig(CHAVE_DIVERGENCIAS, { itens: novas, atualizado_em: new Date().toISOString() });
            cacheDivergencias = { itens: novas, lido: Date.now() };
            desenharModalDivergencias();
            atualizarAvisoInicio();
        } catch (e) {
            toast('Erro ao salvar: ' + (e.message || e), 'error');
        }
    }

    // item no menu Acessibilidade da Gestão (para abrir a lista de lá também)
    function garantirItemMenuDivergencias() {
        const atual = document.getElementById('menuAcessibilidadeEstoqueDropdown');
        const existente = document.getElementById('wtcfBtnDivergencias');
        if (!podeConferir()) { if (existente) existente.remove(); return; }
        if (atual && existente && existente.parentElement === atual) return;
        if (typeof window.garantirMenuAcessibilidadeEstoque !== 'function') return;
        const menu = window.garantirMenuAcessibilidadeEstoque();
        if (!menu) return;
        if (existente) { menu.appendChild(existente); return; }
        const b = document.createElement('button');
        b.id = 'wtcfBtnDivergencias';
        b.type = 'button';
        b.title = 'Anúncios com estoque no ML diferente do estoque real/regras';
        b.innerHTML = '<i class="fas fa-scale-unbalanced"></i> Divergências de estoque ML';
        b.addEventListener('click', abrirModalDivergencias);
        if (typeof window.estilizarItemMenuAcessibilidadeEstoque === 'function') window.estilizarItemMenuAcessibilidadeEstoque(b);
        menu.appendChild(b);
    }

    // ==========================================================
    // 2) VERIFICAÇÃO DE ESTOQUE FÍSICO
    // ==========================================================
    let ultimaVerificacao = new Map();   // produtoId -> { por, em }
    let fisicoCarregado = false;
    let carregandoFisico = null;
    let tabelaFisicoFaltando = false;
    let listaFisicoAberta = false;

    async function carregarVerificacoes() {
        if (carregandoFisico) return carregandoFisico;
        if (!sb()) return;
        carregandoFisico = (async () => {
            const mapa = new Map();
            try {
                for (let inicio = 0; ; inicio += 1000) {
                    const { data, error } = await sb().from(TABELA_FISICO)
                        .select('id, produto_id, verificado_por, verificado_em')
                        .order('verificado_em', { ascending: false })
                        .range(inicio, inicio + 999);
                    if (error) throw error;
                    (data || []).forEach(v => {
                        const k = String(v.produto_id);
                        if (!mapa.has(k)) mapa.set(k, { por: v.verificado_por, em: v.verificado_em });
                    });
                    if (!data || data.length < 1000) break;
                }
                ultimaVerificacao = mapa;
                fisicoCarregado = true;
                versaoVerificacoes++;
                tabelaFisicoFaltando = false;
            } catch (e) {
                tabelaFisicoFaltando = /does not exist|not find|42P01|PGRST205/i.test(String(e.message || e.code || ''));
                console.warn('[conferencia-estoque] verificações físicas:', e.message || e);
            }
        })().finally(() => { carregandoFisico = null; });
        await carregandoFisico;
    }

    function diasSemVerificar(p) {
        const v = ultimaVerificacao.get(String(p.id));
        const base = v ? new Date(v.em) : INICIO_CONTROLE_FISICO;
        return Math.max(0, Math.floor((Date.now() - base.getTime()) / DIA_MS));
    }

    function tituloBotaoFisico(p) {
        const v = ultimaVerificacao.get(String(p.id));
        if (!fisicoCarregado) return 'Verificado estoque físico';
        if (!v) return 'Verificado estoque físico — nunca verificado';
        const d = diasSemVerificar(p);
        return `Verificado estoque físico — última: ${fmtDataHora(v.em)} por ${v.por} (${d === 0 ? 'hoje' : d + ' dia' + (d > 1 ? 's' : '')})`;
    }

    function estiloBotao(b, p) {
        const titulo = tituloBotaoFisico(p);
        if (b.title !== titulo) b.title = titulo;
        b.classList.toggle('atrasado', fisicoCarregado && diasSemVerificar(p) >= DIAS_ALERTA_FISICO);
    }

    function injetarBotoesFisico() {
        const tbody = document.getElementById('produtosEstoqueBody');
        if (!tbody) return;
        const porId = new Map(produtos().map(p => [String(p.id), p]));
        tbody.querySelectorAll('tr').forEach(tr => {
            const chk = tr.querySelector('.check-produto-massa');
            if (!chk) return;
            const p = porId.get(String(chk.dataset.produtoId));
            if (!p) return;
            let b = tr.querySelector('.btn-wtcf-fisico');
            if (!b) {
                const tdAcoes = tr.querySelector('td[data-wtcol="acoes"]') || tr.lastElementChild;
                const caixa = tdAcoes && (tdAcoes.querySelector('.d-flex') || tdAcoes);
                if (!caixa) return;
                b = document.createElement('button');
                b.type = 'button';
                b.className = 'btn btn-sm btn-wtcf-fisico';
                b.dataset.wtcfFisico = String(p.id);
                b.innerHTML = '<i class="fas fa-clipboard-check"></i>';
                caixa.appendChild(b);
            }
            estiloBotao(b, p);
        });
    }

    async function registrarVerificacaoFisica(produtoId, botao) {
        const p = produtoPorId(produtoId);
        if (!p || !sb()) return;
        if (tabelaFisicoFaltando) {
            toast('⚠️ Tabela estoque_verificacoes_fisicas não existe — rode o SQL do topo de estoque_conferencia.js no Supabase.', 'warning');
            return;
        }
        const quem = usuario() || 'desconhecido';
        if (botao) botao.disabled = true;
        try {
            const { data, error } = await sb().from(TABELA_FISICO).insert([{
                produto_id: p.id,
                sku: p.sku,
                produto_nome: p.nome,
                quantidade_sistema: Number(p.quantidade) || 0,
                verificado_por: quem
            }]).select('verificado_em').maybeSingle();
            if (error) throw error;
            ultimaVerificacao.set(String(p.id), { por: quem, em: (data && data.verificado_em) || new Date().toISOString() });
            versaoVerificacoes++;
            toast(`✅ Estoque físico verificado: ${p.nome}`, 'success');
            injetarBotoesFisico();
            atualizarAvisoFisico();
        } catch (e) {
            console.error('[conferencia-estoque] registrar verificação:', e);
            toast('❌ Erro ao registrar verificação: ' + (e.message || e), 'error');
        } finally {
            if (botao) botao.disabled = false;
        }
    }

    // Roda a cada 2 s: filtrar + ordenar (localeCompare) a lista inteira de
    // produtos toda vez pesava. Recalcula só quando a lista/verificações
    // mudam, ou a cada 30 s (quantidade editada no lugar).
    let versaoVerificacoes = 0;
    let cacheAtrasados = { chave: '', lista: null, em: 0, produtos: null };
    function produtosAtrasados() {
        const lista = produtos();
        const chave = `${lista.length}|${versaoVerificacoes}|${fisicoCarregado}|${hojeISO()}`;
        if (cacheAtrasados.lista && cacheAtrasados.produtos === lista && cacheAtrasados.chave === chave &&
            Date.now() - cacheAtrasados.em < 30000) return cacheAtrasados.lista;
        cacheAtrasados = { chave, lista: calcularAtrasados(), em: Date.now(), produtos: lista };
        return cacheAtrasados.lista;
    }
    function calcularAtrasados() {
        return produtos()
            .filter(p => produtoAtivo(p) && diasSemVerificar(p) >= DIAS_ALERTA_FISICO)
            .map(p => ({ p, dias: diasSemVerificar(p), v: ultimaVerificacao.get(String(p.id)) }))
            .sort((a, b) => b.dias - a.dias || String(a.p.nome).localeCompare(String(b.p.nome), 'pt-BR'));
    }

    function atualizarAvisoFisico() {
        let aviso = document.getElementById('wtcfAvisoFisico');
        if (!fisicoCarregado || !telaVisivel('estoqueGestaoSystem')) return;
        const atrasados = produtosAtrasados();
        if (!atrasados.length) { if (aviso) aviso.remove(); return; }
        garantirEstiloConferencia();
        if (!aviso) {
            const tabela = document.getElementById('produtosEstoqueTable')?.closest('.table-responsive');
            if (!tabela) return;
            aviso = document.createElement('div');
            aviso.id = 'wtcfAvisoFisico';
            aviso.className = 'wtcf-fisico-aviso';
            tabela.insertAdjacentElement('beforebegin', aviso);
            aviso.addEventListener('click', e => {
                const t = e.target.closest('[data-wtcf-toggle]');
                if (t) { listaFisicoAberta = !listaFisicoAberta; atualizarAvisoFisico(); return; }
                const b = e.target.closest('[data-wtcf-fisico]');
                if (b) registrarVerificacaoFisica(b.dataset.wtcfFisico, b);
            });
        }
        // Chamado a cada 2 s: mesma lista (cache de produtosAtrasados) e
        // mesmo estado aberto/fechado = nada a redesenhar.
        if (aviso._wtcfFonte === atrasados && aviso._wtcfAberta === listaFisicoAberta) return;
        aviso._wtcfFonte = atrasados;
        aviso._wtcfAberta = listaFisicoAberta;
        const linhas = listaFisicoAberta ? atrasados.map(({ p, dias, v }) => `<tr>
                <td>${esc(p.nome)}</td><td><code>${esc(p.sku)}</code></td><td>${esc(p.quantidade)}</td>
                <td>${v ? esc(fmtDataHora(v.em)) + ' · ' + esc(v.por) : '<span class="text-muted">nunca</span>'}</td>
                <td><strong>${dias} dias</strong></td>
                <td><button type="button" class="btn btn-sm btn-wtcf-fisico" data-wtcf-fisico="${esc(p.id)}"><i class="fas fa-clipboard-check"></i> Verificado</button></td>
            </tr>`).join('') : '';
        aviso.innerHTML = `<div class="wtcf-linha"><i class="fas fa-clipboard-list" style="color:#f59e0b;"></i>
                <span><strong>${atrasados.length} produto(s)</strong> sem verificação de estoque físico há ${DIAS_ALERTA_FISICO} dias ou mais${atrasados[0] ? ` (o mais antigo: ${atrasados[0].dias} dias)` : ''}.</span>
                <button type="button" class="btn btn-sm btn-outline-warning" data-wtcf-toggle>${listaFisicoAberta ? 'Esconder lista' : 'Ver lista'}</button></div>
            ${listaFisicoAberta ? `<div class="wtcf-fisico-lista"><table class="table table-sm table-bordered">
                <thead><tr><th>Produto</th><th>SKU</th><th>Estoque</th><th>Última verificação</th><th>Sem verificar há</th><th></th></tr></thead>
                <tbody>${linhas}</tbody></table></div>` : ''}`;
    }

    // ---------- seção no Histórico do produto ----------
    async function injetarHistoricoFisico(produtoId) {
        const caixa = document.querySelector('#modalHistoricoEstoque .modal-content');
        if (!caixa || !sb()) return;
        let secao = caixa.querySelector('.wtcf-hist');
        if (!secao) {
            secao = document.createElement('div');
            secao.className = 'wtcf-hist';
            const ancora = caixa.children[1] || caixa.firstElementChild;
            if (ancora) ancora.insertAdjacentElement('afterend', secao); else caixa.appendChild(secao);
        }
        garantirEstiloConferencia();
        secao.innerHTML = '<h4><i class="fas fa-clipboard-check"></i> Verificações de estoque físico</h4><small class="text-muted">Carregando…</small>';
        try {
            const { data, error } = await sb().from(TABELA_FISICO)
                .select('verificado_por, verificado_em, quantidade_sistema')
                .eq('produto_id', produtoId)
                .order('verificado_em', { ascending: false })
                .limit(200);
            if (error) throw error;
            const lista = data || [];
            secao.innerHTML = `<h4><i class="fas fa-clipboard-check"></i> Verificações de estoque físico</h4>` + (lista.length
                ? `<div class="table-responsive" style="max-height:220px;overflow:auto;"><table class="table table-sm table-bordered">
                    <thead><tr><th>Data e hora</th><th>Quem verificou</th><th>Estoque no sistema na hora</th></tr></thead>
                    <tbody>${lista.map(v => `<tr><td>${esc(fmtDataHora(v.verificado_em))}</td><td>${esc(v.verificado_por)}</td><td>${esc(v.quantidade_sistema)}</td></tr>`).join('')}</tbody>
                </table></div>`
                : '<small class="text-muted">Nenhuma verificação física registrada ainda.</small>');
        } catch (e) {
            secao.innerHTML = '<h4><i class="fas fa-clipboard-check"></i> Verificações de estoque físico</h4><small class="text-muted">Não foi possível carregar (a tabela estoque_verificacoes_fisicas existe?).</small>';
        }
    }

    function instalarPatchHistorico() {
        if (window.__wtcfHistPatched || typeof window.verHistoricoMovimentacoes !== 'function') return;
        window.__wtcfHistPatched = true;
        const original = window.verHistoricoMovimentacoes;
        window.verHistoricoMovimentacoes = async function (produtoId) {
            const r = await original.apply(this, arguments);
            injetarHistoricoFisico(produtoId);
            return r;
        };
    }

    // ==========================================================
    // START
    // ==========================================================
    document.addEventListener('click', e => {
        const b = e.target.closest && e.target.closest('#produtosEstoqueBody [data-wtcf-fisico]');
        if (!b) return;
        e.preventDefault();
        registrarVerificacaoFisica(b.dataset.wtcfFisico, b);
    });

    let observer = null;
    function instalarObserver() {
        const tbody = document.getElementById('produtosEstoqueBody');
        if (!tbody || observer) return;
        let t = null;
        observer = new MutationObserver(() => { clearTimeout(t); t = setTimeout(injetarBotoesFisico, 80); });
        observer.observe(tbody, { childList: true });
    }

    let ultimoCarregamentoFisico = 0;
    setInterval(() => {
        if (!window.currentUser) return;
        instalarObserver();
        instalarPatchHistorico();
        if (telaVisivel('estoqueGestaoSystem')) {
            garantirEstiloConferencia();
            garantirItemMenuDivergencias();
            if (!fisicoCarregado || Date.now() - ultimoCarregamentoFisico > 10 * 60 * 1000) {
                if (!carregandoFisico) {
                    ultimoCarregamentoFisico = Date.now();
                    carregarVerificacoes().then(() => { injetarBotoesFisico(); atualizarAvisoFisico(); });
                }
            } else {
                injetarBotoesFisico();
                atualizarAvisoFisico();
            }
        }
        if (telaVisivel('menuSystem')) atualizarAvisoInicio();
    }, 2000);

    // conferência diária: tenta a cada minuto (só roda de fato 1x por dia, até 200 produtos)
    // DESLIGADA em 02/10/2026 para testar se ela é a causa da lentidão
    // nos computadores. Para religar: CONFERENCIA_AUTOMATICA = true.
    const CONFERENCIA_AUTOMATICA = false;
    if (CONFERENCIA_AUTOMATICA) {
        setTimeout(function ciclo() {
            tentarConferenciaDiaria().finally(() => setTimeout(ciclo, 60 * 1000));
        }, 30 * 1000);
    }

    window.WTConferenciaEstoque = {
        abrirDivergencias: abrirModalDivergencias,
        conferirAgora: tentarConferenciaDiaria,
        registrarVerificacaoFisica
    };
})();
