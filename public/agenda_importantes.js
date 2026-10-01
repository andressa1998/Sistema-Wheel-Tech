// ============================================================
// AGENDA SEMANAL — TÍTULOS IMPORTANTES (preferência por usuário)
// ============================================================
// Cada pessoa marca quais títulos do calendário (ex.: "Entrada",
// "Vendas canceladas") são importantes pra ela. Na tela dela, todo
// item da Agenda Semanal com esse título aparece destacado.
// Preferência salva em agenda_titulos_importantes (1 linha por usuário).
// ============================================================

(function () {
    'use strict';

    const TABELA = 'agenda_titulos_importantes';

    let importantes = new Set();      // títulos normalizados
    let usuarioCarregado = null;

    function norm(t) {
        return String(t || '').trim().toLowerCase().replace(/\s+/g, ' ');
    }
    function esc(v) {
        return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function username() {
        return String(window.currentUser?.username || '').trim().toLowerCase();
    }
    function sb() { return window.supabaseClient || null; }

    // Quem pode definir os importantes de outra pessoa: { editor: [usuários-alvo] }
    const PODE_EDITAR_DE = {
        leticia: [{ username: 'ronald', nome: 'Ronald' }]
    };
    function alvosEditaveis() {
        return PODE_EDITAR_DE[username()] || [];
    }

    async function lerTitulosDe(u) {
        const { data, error } = await sb().from(TABELA).select('titulos').eq('username', u).maybeSingle();
        if (error) throw error;
        const lista = Array.isArray(data?.titulos) ? data.titulos : [];
        return new Set(lista.map(norm).filter(Boolean));
    }

    // usado por folgas.js na hora de desenhar cada item da agenda
    window.agendaTituloImportante = function (titulo) {
        return importantes.size > 0 && importantes.has(norm(titulo));
    };

    function repintarAgenda() {
        try {
            if (typeof renderizarAgendaSemanal === 'function') renderizarAgendaSemanal();
        } catch (e) { /* agenda ainda não montada */ }
        atualizarContadorBotao();
    }

    function atualizarContadorBotao() {
        const el = document.getElementById('agendaImportantesQtd');
        if (!el) return;
        el.textContent = importantes.size ? String(importantes.size) : '';
        el.style.display = importantes.size ? 'inline-block' : 'none';
    }

    async function carregarPreferencia() {
        const u = username();
        if (!u || !sb()) return;
        try {
            importantes = await lerTitulosDe(u);
            usuarioCarregado = u;
            repintarAgenda();
        } catch (e) {
            console.warn('[agenda-importantes] não foi possível carregar:', e.message || e);
        }
    }

    // ---------- estilo ----------
    function garantirEstilo() {
        if (document.getElementById('agendaImportantesEstilo')) return;
        const st = document.createElement('style');
        st.id = 'agendaImportantesEstilo';
        st.textContent = `
            .agenda-item.agenda-item-importante{background:#f3e8ff !important;box-shadow:0 0 0 2px #7c3aed;}
            .agenda-item.agenda-item-importante strong::before{content:"⭐ ";}
            #agendaImportantesQtd{background:#7c3aed;color:#fff;border-radius:999px;font-size:10px;padding:1px 6px;margin-left:4px;}
            #modalAgendaImportantes .aimp-linha{display:flex;align-items:center;gap:8px;padding:7px 8px;border-radius:8px;cursor:pointer;margin:0;font-weight:400;}
            #modalAgendaImportantes .aimp-linha:hover{background:#f3f4f6;}
            #modalAgendaImportantes .aimp-linha small{color:#94a3b8;margin-left:auto;}
        `;
        document.head.appendChild(st);
    }

    // ---------- botão na barra da agenda ----------
    function garantirBotao() {
        if (document.getElementById('btnAgendaImportantes')) return;
        const nav = document.querySelector('#agendaSemanalCard .agenda-week-nav');
        if (!nav) return;
        garantirEstilo();
        const b = document.createElement('button');
        b.type = 'button';
        b.id = 'btnAgendaImportantes';
        b.className = 'btn btn-outline-primary btn-sm';
        b.title = 'Escolha quais atividades são importantes pra você';
        b.innerHTML = '<i class="fas fa-star"></i> Importantes <span id="agendaImportantesQtd" style="display:none"></span>';
        b.onclick = abrirModal;
        nav.insertBefore(b, nav.firstChild);
        atualizarContadorBotao();
    }

    // ---------- títulos existentes no calendário ----------
    async function buscarTitulos(marcados) {
        const mapa = new Map(); // norm -> { titulo, qtd }
        for (let inicio = 0; inicio < 6000; inicio += 1000) {
            const { data, error } = await sb().from('agenda_eventos')
                .select('titulo, tipo')
                .neq('tipo', 'recado')
                .order('data_inicio', { ascending: false })
                .range(inicio, inicio + 999);
            if (error) throw error;
            (data || []).forEach(e => {
                const k = norm(e.titulo);
                if (!k) return;
                const atual = mapa.get(k);
                if (atual) atual.qtd++;
                else mapa.set(k, { titulo: String(e.titulo).trim(), qtd: 1 });
            });
            if (!data || data.length < 1000) break;
        }
        // títulos já marcados que não aparecem mais no calendário continuam na lista
        marcados.forEach(k => { if (!mapa.has(k)) mapa.set(k, { titulo: k, qtd: 0 }); });
        return Array.from(mapa.entries())
            .map(([k, v]) => ({ chave: k, ...v }))
            .sort((a, b) => a.titulo.localeCompare(b.titulo, 'pt-BR', { sensitivity: 'base' }));
    }

    // ---------- modal ----------
    function garantirModal() {
        let m = document.getElementById('modalAgendaImportantes');
        if (m) return m;
        m = document.createElement('div');
        m.id = 'modalAgendaImportantes';
        m.className = 'modal hidden';
        m.innerHTML = `
            <div class="modal-content" style="max-width:520px;">
                <h3 style="margin-top:0;"><i class="fas fa-star" style="color:#7c3aed;"></i> <span id="aimpTitulo">Atividades importantes pra mim</span></h3>
                <p style="font-size:13px;color:#64748b;margin:0 0 10px;">
                    Marque os títulos importantes. Na agenda da pessoa, todos os itens com esses títulos ficam destacados e no topo do dia.
                </p>
                <div id="aimpParaLinha" style="display:none;margin-bottom:8px;">
                    <label for="aimpPara" style="font-size:13px;font-weight:600;margin-bottom:4px;display:block;">Definir importantes para:</label>
                    <select id="aimpPara" class="form-control"></select>
                </div>
                <input type="text" id="aimpBusca" class="form-control" placeholder="🔍 Buscar título..." style="margin-bottom:8px;">
                <div id="aimpLista" style="max-height:340px;overflow-y:auto;border:1px solid #e2e8f0;border-radius:8px;padding:4px;"></div>
                <div class="d-flex justify-content-between align-items-center mt-3">
                    <small id="aimpContagem" class="text-muted"></small>
                    <div class="d-flex gap-2">
                        <button type="button" class="btn btn-secondary" id="aimpCancelar">Cancelar</button>
                        <button type="button" class="btn btn-primary" id="aimpSalvar"><i class="fas fa-save"></i> Salvar</button>
                    </div>
                </div>
            </div>`;
        document.body.appendChild(m);
        m.querySelector('#aimpCancelar').addEventListener('click', fecharModal);
        m.addEventListener('click', e => { if (e.target === m) fecharModal(); });
        return m;
    }
    function fecharModal() {
        document.getElementById('modalAgendaImportantes')?.classList.add('hidden');
    }

    async function abrirModal() {
        if (!username()) { window.showToast?.('Faça login primeiro.', 'warning'); return; }
        garantirEstilo();
        const m = garantirModal();
        const lista = m.querySelector('#aimpLista');
        const busca = m.querySelector('#aimpBusca');
        const contagem = m.querySelector('#aimpContagem');
        const paraLinha = m.querySelector('#aimpParaLinha');
        const paraSel = m.querySelector('#aimpPara');
        const tituloEl = m.querySelector('#aimpTitulo');
        const btnSalvar = m.querySelector('#aimpSalvar');
        busca.value = '';
        m.classList.remove('hidden');

        // Seletor "para quem" — só aparece pra quem pode editar de outra pessoa
        const alvos = alvosEditaveis();
        paraLinha.style.display = alvos.length ? 'block' : 'none';
        paraSel.innerHTML = `<option value="${esc(username())}">Eu mesma(o)</option>` +
            alvos.map(a => `<option value="${esc(a.username)}">${esc(a.nome)}</option>`).join('');
        paraSel.value = username();

        let alvo = username();
        let titulos = [];
        let selecionados = new Set();

        async function carregarAlvo() {
            alvo = paraSel.value || username();
            const ehEu = alvo === username();
            const nomeAlvo = alvos.find(a => a.username === alvo)?.nome || alvo;
            tituloEl.textContent = ehEu ? 'Atividades importantes pra mim' : `Atividades importantes para ${nomeAlvo}`;
            lista.innerHTML = '<div class="text-center text-muted" style="padding:20px;">Carregando…</div>';
            btnSalvar.disabled = true;
            try {
                const marcados = ehEu ? new Set(importantes) : await lerTitulosDe(alvo);
                titulos = await buscarTitulos(marcados);
                selecionados = marcados;
                btnSalvar.disabled = false;
                desenhar();
                atualizarContagem();
            } catch (e) {
                console.error('[agenda-importantes] carregar:', e);
                lista.innerHTML = '<div class="text-center text-muted" style="padding:20px;">Não foi possível carregar os títulos.</div>';
            }
        }
        paraSel.onchange = carregarAlvo;

        function atualizarContagem() {
            contagem.textContent = `${selecionados.size} selecionado(s)`;
        }
        function desenhar() {
            const termo = norm(busca.value);
            const visiveis = titulos.filter(t => !termo || t.chave.includes(termo));
            lista.innerHTML = visiveis.length ? visiveis.map(t => `
                <label class="aimp-linha">
                    <input type="checkbox" data-chave="${esc(t.chave)}" ${selecionados.has(t.chave) ? 'checked' : ''}>
                    <span>${esc(t.titulo)}</span>
                    ${t.qtd ? `<small>${t.qtd}×</small>` : ''}
                </label>`).join('')
                : '<div class="text-center text-muted" style="padding:20px;">Nenhum título encontrado.</div>';
        }
        lista.onchange = e => {
            const chave = e.target?.dataset?.chave;
            if (!chave) return;
            if (e.target.checked) selecionados.add(chave); else selecionados.delete(chave);
            atualizarContagem();
        };
        busca.oninput = desenhar;
        btnSalvar.onclick = async () => {
            const btn = btnSalvar;
            const ehEu = alvo === username();
            if (!ehEu && !alvos.some(a => a.username === alvo)) return;
            btn.disabled = true;
            try {
                const { error } = await sb().from(TABELA).upsert({
                    username: alvo,
                    titulos: Array.from(selecionados),
                    atualizado_em: new Date().toISOString()
                }, { onConflict: 'username' });
                if (error) throw error;
                if (ehEu) importantes = new Set(selecionados);
                fecharModal();
                repintarAgenda();
                const nomeAlvo = alvos.find(a => a.username === alvo)?.nome;
                window.showToast?.(ehEu ? '⭐ Importantes salvos!' : `⭐ Importantes de ${nomeAlvo} salvos!`, 'success');
            } catch (err) {
                console.error('[agenda-importantes] salvar:', err);
                window.showToast?.('Erro ao salvar: ' + (err.message || err), 'error');
            } finally {
                btn.disabled = false;
            }
        };

        await carregarAlvo();
    }
    window.abrirImportantesAgenda = abrirModal;

    // ---------- inicialização ----------
    setInterval(() => {
        garantirBotao();
        const u = username();
        if (u && sb() && usuarioCarregado !== u) {
            usuarioCarregado = u; // evita disparar duas vezes em paralelo
            carregarPreferencia();
        }
        if (!u) { usuarioCarregado = null; importantes = new Set(); }
    }, 1500);
})();
