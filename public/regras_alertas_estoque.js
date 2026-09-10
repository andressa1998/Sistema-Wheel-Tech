/* =========================================================
 * REGRAS DE ALERTA DE ESTOQUE / EXPOSIÇÃO  (Clássico x Premium)
 *
 * Tela dedicada onde o usuário monta as próprias regras.
 *
 * Modelo:
 *  - Lista ORDENADA de regras. A 1ª cujas condições casam vence.
 *  - Listas de MLB fixo (Clássico/Premium) continuam ACIMA de tudo
 *    (tratadas no nfe_manager, aqui só refletidas no fato lista_fixa).
 *  - Se NENHUMA regra casar  -> NENHUM alerta de exposição.
 *  - Resultado de uma regra: 'classico' | 'premium' | 'nao_alertar'.
 *
 * Armazenamento: configuracoes_sistema, chave 'regras_alertas_estoque_v1'
 *  valor = { ativo: bool, regras: [ ... ] }
 *
 * O motor é usado por nfe_manager.js -> obterAlertasExposicaoVendaNFE().
 * ========================================================= */

(function () {
    'use strict';

    const CONFIG_CHAVE = 'regras_alertas_estoque_v1';
    const LS_CHAVE = 'wt_regras_alertas_estoque_v1';

    // ---- estado em memória ----
    let estado = {
        ativo: false,
        regras: []
    };
    let carregado = false;

    // =====================================================
    // CATÁLOGO DE CAMPOS / OPERADORES  (dirige a UI e o motor)
    // =====================================================

    const CAMPOS = {
        exposicao_atual: {
            rotulo: 'Exposição atual do anúncio',
            tipo: 'opcao',
            opcoes: [
                ['classico', 'Clássico'],
                ['premium', 'Premium'],
                ['nenhuma', 'Não identificada']
            ]
        },
        lista_fixa: {
            rotulo: 'Está numa lista fixa de MLB',
            tipo: 'opcao',
            opcoes: [
                ['classico', 'Lista Clássico'],
                ['premium', 'Lista Premium'],
                ['nenhuma', 'Nenhuma lista']
            ]
        },
        tem_variacoes: { rotulo: 'Anúncio tem variações', tipo: 'booleano' },
        full_ativo: { rotulo: 'Anúncio está no FULL', tipo: 'booleano' },
        local_ativo: { rotulo: 'Anúncio tem estoque local (ME)', tipo: 'booleano' },

        num_variacoes: { rotulo: 'Quantidade de variações', tipo: 'numero' },
        estoque_total: { rotulo: 'Estoque total do anúncio (base da exposição)', tipo: 'numero' },
        estoque_full: { rotulo: 'Estoque total no FULL', tipo: 'numero' },
        estoque_local: { rotulo: 'Estoque total local (ME)', tipo: 'numero' },
        estoque_variacao_vendida: { rotulo: 'Estoque restante na variação vendida', tipo: 'numero' },
        soma_variacoes: { rotulo: 'Soma do estoque de todas as variações', tipo: 'numero' },
        min_variacoes: { rotulo: 'Menor estoque entre as variações', tipo: 'numero' },
        max_variacoes: { rotulo: 'Maior estoque entre as variações', tipo: 'numero' },

        variacoes: {
            rotulo: 'Cada variação (regra sobre as variações)',
            tipo: 'agregacao'
        }
    };

    const OPERADORES_NUMERO = [
        ['igual', 'é igual a'],
        ['diferente', 'é diferente de'],
        ['maior', 'é maior que'],
        ['maior_igual', 'é maior ou igual a'],
        ['menor', 'é menor que'],
        ['menor_igual', 'é menor ou igual a'],
        ['entre', 'está entre']
    ];

    const OPERADORES_OPCAO = [
        ['igual', 'é'],
        ['diferente', 'não é']
    ];

    const OPERADORES_BOOL = [
        ['verdadeiro', 'sim'],
        ['falso', 'não']
    ];

    const ATRIBUTOS_VARIACAO = [
        ['estoque', 'estoque (anúncio)'],
        ['estoque_full', 'estoque no FULL'],
        ['estoque_local', 'estoque local (ME)']
    ];

    const AGREGACOES = [
        ['todas', 'TODAS as variações'],
        ['alguma', 'PELO MENOS UMA variação'],
        ['nenhuma', 'NENHUMA variação'],
        ['contar', 'CONTAR quantas variações']
    ];

    const RESULTADOS = [
        ['classico', 'Deveria ser CLÁSSICO'],
        ['premium', 'Deveria ser PREMIUM'],
        ['nao_alertar', 'Está correto — NÃO alertar']
    ];

    // =====================================================
    // MOTOR
    // =====================================================

    function comparar(op, a, b, b2) {
        a = Number(a);
        if (!Number.isFinite(a)) return false;

        switch (op) {
            case 'igual': return a === Number(b);
            case 'diferente': return a !== Number(b);
            case 'maior': return a > Number(b);
            case 'maior_igual': return a >= Number(b);
            case 'menor': return a < Number(b);
            case 'menor_igual': return a <= Number(b);
            case 'entre': {
                const lo = Math.min(Number(b), Number(b2));
                const hi = Math.max(Number(b), Number(b2));
                return a >= lo && a <= hi;
            }
            default: return false;
        }
    }

    function valorAtributoVariacao(variacao, atributo) {
        if (!variacao) return null;
        if (atributo === 'estoque_full') return numeroOuNull(variacao.estoque_full);
        if (atributo === 'estoque_local') return numeroOuNull(variacao.estoque_local);
        return numeroOuNull(variacao.estoque);
    }

    function numeroOuNull(v) {
        if (v === null || v === undefined || v === '') return null;
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
    }

    function avaliarCondicao(cond, fatos) {
        if (!cond || !cond.campo) return false;

        const catalogo = CAMPOS[cond.campo];
        if (!catalogo) return false;

        // ---- agregação sobre variações ----
        if (cond.campo === 'variacoes') {
            const lista = Array.isArray(fatos.variacoes) ? fatos.variacoes : [];
            if (lista.length === 0) return false;

            const casa = (v) => {
                const valor = valorAtributoVariacao(v, cond.atributo || 'estoque');
                if (valor === null) return false;
                return comparar(cond.operador, valor, cond.valor, cond.valor2);
            };

            if (cond.agregacao === 'todas') return lista.every(casa);
            if (cond.agregacao === 'alguma') return lista.some(casa);
            if (cond.agregacao === 'nenhuma') return !lista.some(casa);
            if (cond.agregacao === 'contar') {
                const qtd = lista.filter(casa).length;
                return comparar(
                    cond.contagem_operador || 'igual',
                    qtd,
                    cond.contagem_valor,
                    cond.contagem_valor2
                );
            }
            return false;
        }

        // ---- booleano ----
        if (catalogo.tipo === 'booleano') {
            const alvo = cond.operador === 'verdadeiro';
            return Boolean(fatos[cond.campo]) === alvo;
        }

        // ---- opção (string) ----
        if (catalogo.tipo === 'opcao') {
            const atual = String(fatos[cond.campo] ?? 'nenhuma').toLowerCase();
            const esperado = String(cond.valor ?? '').toLowerCase();
            if (cond.operador === 'diferente') return atual !== esperado;
            return atual === esperado;
        }

        // ---- número ----
        const valor = numeroOuNull(fatos[cond.campo]);
        if (valor === null) return false;
        return comparar(cond.operador, valor, cond.valor, cond.valor2);
    }

    function avaliarRegra(regra, fatos) {
        const conds = Array.isArray(regra.condicoes) ? regra.condicoes : [];
        if (conds.length === 0) return false;

        if (regra.combinacao === 'qualquer') {
            return conds.some((c) => avaliarCondicao(c, fatos));
        }
        return conds.every((c) => avaliarCondicao(c, fatos));
    }

    /**
     * Avalia a lista de regras contra os fatos de um anúncio.
     * Retorna { casou, resultado, regra_id, regra_nome } .
     *   resultado: 'classico' | 'premium' | 'nao_alertar' | null
     */
    function avaliar(fatos) {
        if (!estado.ativo) {
            return { casou: false, resultado: null, motivo: 'motor_inativo' };
        }
        const regras = Array.isArray(estado.regras) ? estado.regras : [];
        for (const regra of regras) {
            if (!regra || regra.ativa === false) continue;
            try {
                if (avaliarRegra(regra, fatos)) {
                    return {
                        casou: true,
                        resultado: regra.resultado || 'nao_alertar',
                        regra_id: regra.id,
                        regra_nome: regra.nome || 'Regra sem nome'
                    };
                }
            } catch (e) {
                console.warn('⚠️ [REGRAS ESTOQUE] Falha avaliando regra', regra?.nome, e);
            }
        }
        return { casou: false, resultado: null, motivo: 'nenhuma_regra' };
    }

    // =====================================================
    // PERSISTÊNCIA
    // =====================================================

    function normalizar(bruto) {
        const obj = (bruto && typeof bruto === 'object') ? bruto : {};
        const regras = Array.isArray(obj.regras) ? obj.regras : [];
        return {
            ativo: obj.ativo === true,
            regras: regras
                .filter((r) => r && typeof r === 'object')
                .map((r, i) => ({
                    id: r.id || ('r_' + Date.now().toString(36) + '_' + i),
                    nome: String(r.nome || 'Regra ' + (i + 1)),
                    ativa: r.ativa !== false,
                    combinacao: r.combinacao === 'qualquer' ? 'qualquer' : 'todas',
                    resultado: ['classico', 'premium', 'nao_alertar'].includes(r.resultado)
                        ? r.resultado
                        : 'nao_alertar',
                    condicoes: Array.isArray(r.condicoes)
                        ? r.condicoes.filter((c) => c && c.campo)
                        : []
                }))
        };
    }

    async function carregar(forcar) {
        if (carregado && !forcar) return estado;

        // localStorage primeiro (rápido / offline)
        try {
            const local = localStorage.getItem(LS_CHAVE);
            if (local) estado = normalizar(JSON.parse(local));
        } catch (e) {}

        try {
            if (window.supabaseClient) {
                const { data, error } = await window.supabaseClient
                    .from('configuracoes_sistema')
                    .select('valor')
                    .eq('chave', CONFIG_CHAVE)
                    .single();

                if (!error && data && data.valor) {
                    let valor = data.valor;
                    if (typeof valor === 'string') valor = JSON.parse(valor);
                    estado = normalizar(valor);
                    try { localStorage.setItem(LS_CHAVE, JSON.stringify(estado)); } catch (e) {}
                }
            }
        } catch (e) {
            console.warn('⚠️ [REGRAS ESTOQUE] Não foi possível carregar do Supabase:', e);
        }

        carregado = true;
        return estado;
    }

    async function salvar() {
        estado = normalizar(estado);

        try { localStorage.setItem(LS_CHAVE, JSON.stringify(estado)); } catch (e) {}

        try {
            if (window.supabaseClient) {
                const { error } = await window.supabaseClient
                    .from('configuracoes_sistema')
                    .upsert(
                        {
                            chave: CONFIG_CHAVE,
                            valor: JSON.stringify(estado),
                            atualizado_em: new Date().toISOString(),
                            atualizado_por:
                                (window.currentUser && window.currentUser.name) || 'sistema'
                        },
                        { onConflict: 'chave' }
                    );
                if (error) throw error;
            }
        } catch (e) {
            console.error('❌ [REGRAS ESTOQUE] Erro salvando:', e);
            if (typeof showToast === 'function') {
                showToast('Erro ao salvar as regras de alerta: ' + (e.message || e), 'error');
            }
            return false;
        }

        try {
            window.dispatchEvent(new CustomEvent('wt-regras-alertas-estoque-atualizadas'));
        } catch (e) {}

        return true;
    }

    // =====================================================
    // API PÚBLICA
    // =====================================================

    window.RegrasAlertasEstoque = {
        carregar,
        salvar,
        avaliar,
        estaAtivo: () => estado.ativo === true,
        obterEstado: () => estado,
        CAMPOS,
        RESULTADOS,
        abrirTela: abrirTela
    };

    // Pré-carrega assim que possível
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => carregar().catch(() => {}));
    } else {
        carregar().catch(() => {});
    }

    /* =================================================================
     * INTERFACE  (tela dedicada em overlay de tela cheia)
     * ================================================================= */

    let telaEl = null;
    let rascunho = null; // cópia editável do estado enquanto a tela está aberta

    function css() {
        if (document.getElementById('wtRegrasAlertasCss')) return;
        const s = document.createElement('style');
        s.id = 'wtRegrasAlertasCss';
        s.textContent = `
        #wtRegrasAlertasTela{position:fixed;inset:0;z-index:100000;background:#eef1f6;
            display:flex;flex-direction:column;font-family:inherit;color:#1c2733}
        #wtRegrasAlertasTela *{box-sizing:border-box}
        .wtra-top{display:flex;align-items:center;gap:14px;padding:14px 22px;background:#001a45;color:#fff;flex:0 0 auto}
        .wtra-top h2{margin:0;font-size:18px;font-weight:700;flex:1}
        .wtra-top button{border:0;border-radius:8px;padding:8px 14px;font-weight:600;cursor:pointer;font-size:13px}
        .wtra-fechar{background:rgba(255,255,255,.14);color:#fff}
        .wtra-fechar:hover{background:rgba(255,255,255,.26)}
        .wtra-body{flex:1;overflow-y:auto;padding:22px;max-width:1040px;width:100%;margin:0 auto}
        .wtra-master{display:flex;align-items:center;gap:12px;background:#fff;border:1px solid #d8dee8;
            border-radius:12px;padding:16px 18px;margin-bottom:16px}
        .wtra-master strong{font-size:15px}
        .wtra-master small{color:#5b6b7d;display:block;margin-top:2px}
        .wtra-switch{position:relative;width:52px;height:28px;flex:0 0 auto}
        .wtra-switch input{opacity:0;width:0;height:0}
        .wtra-slider{position:absolute;inset:0;background:#c3ccd8;border-radius:999px;transition:.15s;cursor:pointer}
        .wtra-slider:before{content:"";position:absolute;height:22px;width:22px;left:3px;top:3px;background:#fff;border-radius:50%;transition:.15s}
        .wtra-switch input:checked + .wtra-slider{background:#1a9c4a}
        .wtra-switch input:checked + .wtra-slider:before{transform:translateX(24px)}
        .wtra-barra{display:flex;align-items:center;gap:10px;margin-bottom:14px}
        .wtra-barra h3{margin:0;font-size:15px;flex:1}
        .wtra-add{background:#0a66c2;color:#fff;border:0;border-radius:8px;padding:9px 16px;font-weight:600;cursor:pointer}
        .wtra-add:hover{background:#0954a0}
        .wtra-vazio{background:#fff;border:1px dashed #c3ccd8;border-radius:12px;padding:34px;text-align:center;color:#5b6b7d}
        .wtra-regra{background:#fff;border:1px solid #d8dee8;border-radius:12px;margin-bottom:12px;overflow:hidden}
        .wtra-regra.inativa{opacity:.55}
        .wtra-regra-cab{display:flex;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid #eef1f6}
        .wtra-ordem{display:flex;flex-direction:column;gap:2px}
        .wtra-ordem button{border:1px solid #d0d7e2;background:#f5f7fb;border-radius:5px;width:26px;height:20px;cursor:pointer;line-height:1;font-size:11px}
        .wtra-ordem button:disabled{opacity:.35;cursor:default}
        .wtra-regra-nome{flex:1;font-weight:600;font-size:14px}
        .wtra-badge{font-size:11px;font-weight:700;padding:3px 8px;border-radius:999px;text-transform:uppercase;letter-spacing:.3px}
        .wtra-badge.classico{background:#e5f0ff;color:#0a4da3}
        .wtra-badge.premium{background:#efe3ff;color:#6b21a8}
        .wtra-badge.nao_alertar{background:#e3f6e8;color:#186c39}
        .wtra-regra-cab .wtra-acao{border:0;background:none;cursor:pointer;color:#5b6b7d;font-size:13px;padding:4px 6px;border-radius:6px}
        .wtra-regra-cab .wtra-acao:hover{background:#eef1f6;color:#0a66c2}
        .wtra-regra-corpo{padding:14px}
        .wtra-linha{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:8px}
        .wtra-linha select,.wtra-linha input[type=number],.wtra-linha input[type=text]{
            border:1px solid #cdd5e0;border-radius:7px;padding:7px 9px;font-size:13px;background:#fff}
        .wtra-linha input[type=number]{width:90px}
        .wtra-cond-lista{border:1px solid #eef1f6;border-radius:9px;padding:10px;background:#fafbfd;margin:8px 0}
        .wtra-cond{display:flex;flex-wrap:wrap;gap:6px;align-items:center;padding:6px 0;border-bottom:1px dashed #e3e8f0}
        .wtra-cond:last-child{border-bottom:0}
        .wtra-cond .rm{border:0;background:#ffe8e8;color:#c0392b;border-radius:6px;width:26px;height:26px;cursor:pointer;font-weight:700}
        .wtra-cond-add{border:1px dashed #9db4d4;background:#eef4fc;color:#0a66c2;border-radius:7px;padding:6px 12px;cursor:pointer;font-weight:600;font-size:12px}
        .wtra-mini{font-size:12px;color:#5b6b7d}
        .wtra-editor-rodape{display:flex;gap:10px;margin-top:12px}
        .wtra-salvar-regra{background:#1a9c4a;color:#fff;border:0;border-radius:8px;padding:9px 18px;font-weight:600;cursor:pointer}
        .wtra-cancelar-regra{background:#eef1f6;border:0;border-radius:8px;padding:9px 18px;font-weight:600;cursor:pointer}
        .wtra-resumo{font-size:12.5px;color:#42505f;padding:0 14px 12px}
        .wtra-teste{background:#fff;border:1px solid #d8dee8;border-radius:12px;padding:16px;margin-top:20px}
        .wtra-teste h3{margin:0 0 10px;font-size:14px}
        .wtra-teste .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:8px}
        .wtra-teste label{font-size:12px;display:flex;flex-direction:column;gap:3px}
        .wtra-teste-resultado{margin-top:12px;font-weight:700;font-size:14px}
        `;
        document.head.appendChild(s);
    }

    function opt(pares, sel) {
        return pares
            .map(([v, r]) => `<option value="${v}"${String(v) === String(sel) ? ' selected' : ''}>${r}</option>`)
            .join('');
    }

    function abrirTela() {
        css();
        carregar().then(() => {
            rascunho = JSON.parse(JSON.stringify(normalizar(estado)));
            if (!telaEl) {
                telaEl = document.createElement('div');
                telaEl.id = 'wtRegrasAlertasTela';
                document.body.appendChild(telaEl);
            }
            telaEl.style.display = 'flex';
            renderTela();
        });
    }

    function fecharTela() {
        if (telaEl) telaEl.style.display = 'none';
    }

    function renderTela() {
        if (!telaEl) return;
        const regras = rascunho.regras;

        telaEl.innerHTML = `
        <div class="wtra-top">
            <h2>Regras de Alerta de Estoque — Clássico × Premium</h2>
            <button class="wtra-fechar" id="wtraFechar">Fechar</button>
            <button class="wtra-add" id="wtraSalvarTudo" style="background:#1a9c4a">Salvar tudo</button>
        </div>
        <div class="wtra-body">
            <div class="wtra-master">
                <label class="wtra-switch">
                    <input type="checkbox" id="wtraMaster" ${rascunho.ativo ? 'checked' : ''}>
                    <span class="wtra-slider"></span>
                </label>
                <div>
                    <strong>Usar minhas regras</strong>
                    <small>
                        Ligado: o alerta de exposição na NF-e passa a seguir SÓ as regras abaixo
                        (mais as listas de MLB fixo Clássico/Premium, que continuam no topo).
                        Se nenhuma regra casar, não aparece alerta de exposição.<br>
                        Desligado: mantém o comportamento atual (1 un = Clássico, 2+ = Premium).
                    </small>
                </div>
            </div>

            <div class="wtra-barra">
                <h3>Minhas regras (a 1ª que casar vence — arraste a ordem pelas setas)</h3>
                <button class="wtra-add" id="wtraNova">+ Nova regra</button>
            </div>

            <div id="wtraLista">
                ${regras.length === 0
                    ? `<div class="wtra-vazio">Nenhuma regra ainda. Clique em <strong>+ Nova regra</strong>.</div>`
                    : regras.map((r, i) => cardRegra(r, i, regras.length)).join('')}
            </div>

            ${blocoTeste()}
        </div>
        `;

        telaEl.querySelector('#wtraFechar').onclick = () => {
            if (JSON.stringify(rascunho) !== JSON.stringify(normalizar(estado))) {
                if (!confirm('Há alterações não salvas. Fechar mesmo assim?')) return;
            }
            fecharTela();
        };
        telaEl.querySelector('#wtraSalvarTudo').onclick = salvarTudo;
        telaEl.querySelector('#wtraMaster').onchange = (e) => { rascunho.ativo = e.target.checked; };
        telaEl.querySelector('#wtraNova').onclick = () => {
            rascunho.regras.push({
                id: 'r_' + Date.now().toString(36),
                nome: 'Nova regra',
                ativa: true,
                combinacao: 'todas',
                resultado: 'classico',
                condicoes: [],
                _editando: true
            });
            renderTela();
        };

        regras.forEach((r, i) => ligarCard(r, i));
        ligarTeste();
    }

    function cardRegra(r, i, total) {
        if (r._editando) return editorRegra(r, i);
        const resumo = r.condicoes.length === 0
            ? '<em>sem condições</em>'
            : r.condicoes.map(descreverCondicao).join(
                r.combinacao === 'qualquer' ? ' <strong>OU</strong> ' : ' <strong>E</strong> ');
        return `
        <div class="wtra-regra ${r.ativa ? '' : 'inativa'}" data-i="${i}">
            <div class="wtra-regra-cab">
                <div class="wtra-ordem">
                    <button data-act="up" ${i === 0 ? 'disabled' : ''}>▲</button>
                    <button data-act="down" ${i === total - 1 ? 'disabled' : ''}>▼</button>
                </div>
                <span class="wtra-regra-nome">${escapar(r.nome)}</span>
                <span class="wtra-badge ${r.resultado}">${rotuloResultado(r.resultado)}</span>
                <label class="wtra-mini"><input type="checkbox" data-act="ativa" ${r.ativa ? 'checked' : ''}> ativa</label>
                <button class="wtra-acao" data-act="edit">✏️ editar</button>
                <button class="wtra-acao" data-act="dup">⧉ duplicar</button>
                <button class="wtra-acao" data-act="del">🗑️</button>
            </div>
            <div class="wtra-resumo">SE ${resumo}</div>
        </div>`;
    }

    function editorRegra(r, i) {
        return `
        <div class="wtra-regra" data-i="${i}">
            <div class="wtra-regra-corpo">
                <div class="wtra-linha">
                    <input type="text" data-f="nome" value="${escapar(r.nome)}" style="flex:1;min-width:220px" placeholder="Nome da regra">
                </div>
                <div class="wtra-linha">
                    <span class="wtra-mini">Casar quando</span>
                    <select data-f="combinacao">
                        <option value="todas"${r.combinacao === 'todas' ? ' selected' : ''}>TODAS as condições</option>
                        <option value="qualquer"${r.combinacao === 'qualquer' ? ' selected' : ''}>QUALQUER condição</option>
                    </select>
                    <span class="wtra-mini">forem verdadeiras</span>
                </div>

                <div class="wtra-cond-lista" data-cond-lista>
                    ${r.condicoes.map((c, ci) => linhaCondicao(c, ci)).join('')}
                    <button class="wtra-cond-add" data-act="cond-add">+ condição</button>
                </div>

                <div class="wtra-linha">
                    <span class="wtra-mini">Então o resultado é</span>
                    <select data-f="resultado">${opt(RESULTADOS, r.resultado)}</select>
                </div>

                <div class="wtra-editor-rodape">
                    <button class="wtra-salvar-regra" data-act="ok">OK</button>
                    <button class="wtra-cancelar-regra" data-act="cancel">Cancelar</button>
                </div>
            </div>
        </div>`;
    }

    function linhaCondicao(c, ci) {
        const cat = CAMPOS[c.campo] || {};
        let extra = '';

        if (c.campo === 'variacoes') {
            extra = `
                <select data-c="agregacao">${opt(AGREGACOES, c.agregacao || 'todas')}</select>
                <span class="wtra-mini">com</span>
                <select data-c="atributo">${opt(ATRIBUTOS_VARIACAO, c.atributo || 'estoque')}</select>
                <select data-c="operador">${opt(OPERADORES_NUMERO, c.operador || 'igual')}</select>
                <input type="number" data-c="valor" value="${c.valor ?? ''}">
                ${(c.operador === 'entre') ? `<span class="wtra-mini">e</span><input type="number" data-c="valor2" value="${c.valor2 ?? ''}">` : ''}
                ${(c.agregacao === 'contar') ? `
                    <span class="wtra-mini">→ quantidade</span>
                    <select data-c="contagem_operador">${opt(OPERADORES_NUMERO, c.contagem_operador || 'igual')}</select>
                    <input type="number" data-c="contagem_valor" value="${c.contagem_valor ?? ''}">
                ` : ''}
            `;
        } else if (cat.tipo === 'booleano') {
            extra = `<select data-c="operador">${opt(OPERADORES_BOOL, c.operador || 'verdadeiro')}</select>`;
        } else if (cat.tipo === 'opcao') {
            extra = `
                <select data-c="operador">${opt(OPERADORES_OPCAO, c.operador || 'igual')}</select>
                <select data-c="valor">${opt(cat.opcoes || [], c.valor || (cat.opcoes && cat.opcoes[0][0]))}</select>
            `;
        } else {
            extra = `
                <select data-c="operador">${opt(OPERADORES_NUMERO, c.operador || 'igual')}</select>
                <input type="number" data-c="valor" value="${c.valor ?? ''}">
                ${(c.operador === 'entre') ? `<span class="wtra-mini">e</span><input type="number" data-c="valor2" value="${c.valor2 ?? ''}">` : ''}
            `;
        }

        return `
        <div class="wtra-cond" data-ci="${ci}">
            <select data-c="campo">
                ${Object.entries(CAMPOS).map(([k, v]) =>
                    `<option value="${k}"${k === c.campo ? ' selected' : ''}>${v.rotulo}</option>`).join('')}
            </select>
            ${extra}
            <button class="rm" data-act="cond-del">×</button>
        </div>`;
    }

    function ligarCard(r, i) {
        const el = telaEl.querySelector(`.wtra-regra[data-i="${i}"]`);
        if (!el) return;

        if (r._editando) {
            const corpo = el.querySelector('.wtra-regra-corpo');

            corpo.querySelectorAll('[data-f]').forEach((inp) => {
                inp.onchange = () => {
                    const f = inp.getAttribute('data-f');
                    r[f] = inp.value;
                    if (f === 'combinacao') renderTela();
                };
            });

            const lista = corpo.querySelector('[data-cond-lista]');
            lista.querySelector('[data-act="cond-add"]').onclick = () => {
                r.condicoes.push({ campo: 'estoque_total', operador: 'igual', valor: 1 });
                renderTela();
            };

            lista.querySelectorAll('.wtra-cond').forEach((cel) => {
                const ci = Number(cel.getAttribute('data-ci'));
                cel.querySelectorAll('[data-c]').forEach((inp) => {
                    inp.onchange = () => {
                        const key = inp.getAttribute('data-c');
                        let val = inp.value;
                        if (inp.type === 'number') val = val === '' ? '' : Number(val);
                        r.condicoes[ci][key] = val;
                        if (key === 'campo') {
                            r.condicoes[ci] = { campo: val, operador: 'igual', valor: 1 };
                            if (val === 'variacoes') {
                                Object.assign(r.condicoes[ci], { agregacao: 'todas', atributo: 'estoque' });
                            }
                            const cat = CAMPOS[val];
                            if (cat && cat.tipo === 'booleano') r.condicoes[ci] = { campo: val, operador: 'verdadeiro' };
                            if (cat && cat.tipo === 'opcao') r.condicoes[ci] = { campo: val, operador: 'igual', valor: cat.opcoes[0][0] };
                        }
                        renderTela();
                    };
                });
                cel.querySelector('[data-act="cond-del"]').onclick = () => {
                    r.condicoes.splice(ci, 1);
                    renderTela();
                };
            });

            corpo.querySelector('[data-act="ok"]').onclick = () => {
                delete r._editando;
                if (!r.nome || !r.nome.trim()) r.nome = 'Regra sem nome';
                renderTela();
            };
            corpo.querySelector('[data-act="cancel"]').onclick = () => {
                // se era recém-criada e vazia, remove
                if (r.nome === 'Nova regra' && r.condicoes.length === 0) {
                    rascunho.regras.splice(i, 1);
                } else {
                    delete r._editando;
                }
                renderTela();
            };
            return;
        }

        el.querySelector('[data-act="up"]').onclick = () => mover(i, -1);
        el.querySelector('[data-act="down"]').onclick = () => mover(i, 1);
        el.querySelector('[data-act="ativa"]').onchange = (e) => { r.ativa = e.target.checked; renderTela(); };
        el.querySelector('[data-act="edit"]').onclick = () => { r._editando = true; renderTela(); };
        el.querySelector('[data-act="dup"]').onclick = () => {
            const copia = JSON.parse(JSON.stringify(r));
            copia.id = 'r_' + Date.now().toString(36);
            copia.nome = r.nome + ' (cópia)';
            delete copia._editando;
            rascunho.regras.splice(i + 1, 0, copia);
            renderTela();
        };
        el.querySelector('[data-act="del"]').onclick = () => {
            if (confirm('Excluir a regra "' + r.nome + '"?')) {
                rascunho.regras.splice(i, 1);
                renderTela();
            }
        };
    }

    function mover(i, dir) {
        const j = i + dir;
        if (j < 0 || j >= rascunho.regras.length) return;
        const arr = rascunho.regras;
        [arr[i], arr[j]] = [arr[j], arr[i]];
        renderTela();
    }

    async function salvarTudo() {
        rascunho.regras.forEach((r) => delete r._editando);
        estado = normalizar(rascunho);
        const ok = await salvar();
        if (ok) {
            carregado = true;
            if (typeof showToast === 'function') showToast('Regras de alerta salvas.', 'success');
            rascunho = JSON.parse(JSON.stringify(estado));
            renderTela();
        }
    }

    // ---- descrições legíveis ----

    function rotuloResultado(v) {
        const p = RESULTADOS.find(([k]) => k === v);
        return p ? p[1] : v;
    }

    function descreverCondicao(c) {
        const cat = CAMPOS[c.campo] || { rotulo: c.campo };
        if (c.campo === 'variacoes') {
            const ag = (AGREGACOES.find(([k]) => k === c.agregacao) || [, c.agregacao])[1];
            const at = (ATRIBUTOS_VARIACAO.find(([k]) => k === c.atributo) || [, c.atributo])[1];
            const op = (OPERADORES_NUMERO.find(([k]) => k === c.operador) || [, c.operador])[1];
            let base = `${ag} onde ${at} ${op} ${c.valor}${c.operador === 'entre' ? ' e ' + c.valor2 : ''}`;
            if (c.agregacao === 'contar') {
                const cop = (OPERADORES_NUMERO.find(([k]) => k === c.contagem_operador) || [, 'igual'])[1];
                base += ` (contagem ${cop} ${c.contagem_valor})`;
            }
            return base;
        }
        if (cat.tipo === 'booleano') {
            return `${cat.rotulo}: ${c.operador === 'verdadeiro' ? 'sim' : 'não'}`;
        }
        if (cat.tipo === 'opcao') {
            const rot = (cat.opcoes.find(([k]) => k === c.valor) || [, c.valor])[1];
            return `${cat.rotulo} ${c.operador === 'diferente' ? '≠' : '='} ${rot}`;
        }
        const op = (OPERADORES_NUMERO.find(([k]) => k === c.operador) || [, c.operador])[1];
        return `${cat.rotulo} ${op} ${c.valor}${c.operador === 'entre' ? ' e ' + c.valor2 : ''}`;
    }

    function escapar(s) {
        return String(s ?? '').replace(/[&<>"']/g, (m) => (
            { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m]
        ));
    }

    // ---- painel de teste ----

    const CAMPOS_TESTE = [
        'exposicao_atual', 'tem_variacoes', 'full_ativo', 'local_ativo',
        'num_variacoes', 'estoque_total', 'estoque_full', 'estoque_local',
        'estoque_variacao_vendida'
    ];

    function blocoTeste() {
        return `
        <div class="wtra-teste">
            <h3>Testar (simule os números de um anúncio)</h3>
            <div class="grid">
                ${CAMPOS_TESTE.map((k) => {
                    const cat = CAMPOS[k];
                    if (cat.tipo === 'booleano') {
                        return `<label>${cat.rotulo}
                            <select data-teste="${k}"><option value="">-</option><option value="1">sim</option><option value="0">não</option></select></label>`;
                    }
                    if (cat.tipo === 'opcao') {
                        return `<label>${cat.rotulo}
                            <select data-teste="${k}"><option value="">-</option>${opt(cat.opcoes, '')}</select></label>`;
                    }
                    return `<label>${cat.rotulo}
                        <input type="number" data-teste="${k}"></label>`;
                }).join('')}
                <label>Estoque de cada variação (vírgula)
                    <input type="text" data-teste="variacoes_lista" placeholder="ex: 1,1,1"></label>
            </div>
            <div class="wtra-teste-resultado" id="wtraTesteRes">—</div>
        </div>`;
    }

    function ligarTeste() {
        const inputs = telaEl.querySelectorAll('[data-teste]');
        const rodar = () => {
            const f = {};
            inputs.forEach((inp) => {
                const k = inp.getAttribute('data-teste');
                if (inp.value === '') return;
                if (k === 'variacoes_lista') {
                    f.variacoes = inp.value.split(',').map((x) => ({ estoque: Number(x.trim()) }))
                        .filter((v) => Number.isFinite(v.estoque));
                    return;
                }
                const cat = CAMPOS[k];
                if (cat && cat.tipo === 'booleano') f[k] = inp.value === '1';
                else if (cat && cat.tipo === 'opcao') f[k] = inp.value;
                else f[k] = Number(inp.value);
            });
            if (Array.isArray(f.variacoes)) {
                f.tem_variacoes = f.tem_variacoes ?? f.variacoes.length > 0;
                f.num_variacoes = f.num_variacoes ?? f.variacoes.length;
                const nums = f.variacoes.map((v) => v.estoque);
                f.soma_variacoes = f.soma_variacoes ?? nums.reduce((a, b) => a + b, 0);
                f.min_variacoes = f.min_variacoes ?? Math.min(...nums);
                f.max_variacoes = f.max_variacoes ?? Math.max(...nums);
            }

            // avalia contra o rascunho (não o salvo)
            const salvoAtivo = estado.ativo;
            const salvoRegras = estado.regras;
            estado = { ativo: true, regras: rascunho.regras.filter((r) => !r._editando) };
            const r = avaliar(f);
            estado = normalizar({ ativo: salvoAtivo, regras: salvoRegras });

            const box = telaEl.querySelector('#wtraTesteRes');
            if (r.casou) {
                box.textContent = `➡️ ${rotuloResultado(r.resultado)}  (regra: ${r.regra_nome})`;
                box.style.color = r.resultado === 'nao_alertar' ? '#186c39'
                    : (r.resultado === 'premium' ? '#6b21a8' : '#0a4da3');
            } else {
                box.textContent = '➡️ Nenhuma regra casou → nenhum alerta de exposição';
                box.style.color = '#5b6b7d';
            }
        };
        inputs.forEach((inp) => { inp.oninput = rodar; inp.onchange = rodar; });
    }

})();
