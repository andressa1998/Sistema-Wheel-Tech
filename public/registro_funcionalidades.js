// ============================================================
// REGISTRO DE FUNCIONALIDADES — o que é usado, o que não é, o que quebra
// ============================================================
// COLETOR (roda para todo mundo logado, sem aparecer):
// - Cliques em botões/links/abas, campos preenchidos, downloads
//   (Excel, PDF, arquivos) e telas abertas viram "usos".
// - Tudo que aparece na tela entra num catálogo — assim dá pra saber
//   o que existe e NUNCA foi clicado.
// - Erros (erro de JavaScript, aviso vermelho de erro, falha de
//   comunicação com o banco) são ligados ao botão clicado logo antes.
// - Os dados vão em lote a cada 20 s numa única chamada ao banco.
//   Nenhum valor digitado é guardado, só QUE o campo foi usado.
//
// PAINEL (só administradores): funcionalidades sem uso no período,
// erros do sistema, entradas pendentes há muito tempo e uso por pessoa.
//
// Tabelas/funções: registro_funcionalidades.sql (rodar no Supabase).
// ============================================================

(function () {
    'use strict';

    const ADMINS = ['andressamiotto', 'ronald'];
    const ID_TELA = 'registroFuncionalidadesSystem';
    const RPC_LOTE = 'func_registrar_lote';
    const INTERVALO_ENVIO_MS = 20 * 1000;
    const JANELA_ERRO_CLIQUE_MS = 10 * 1000;   // erro até 10 s depois do clique = culpa do clique
    const MAX_CATALOGO_POR_ENVIO = 400;
    const DIAS_ELEMENTO_SUMIU = 30;            // não visto há 30 dias = saiu do sistema
    const CHAVE_FILA = 'wt_rf_fila';
    const CHAVE_VISTOS = 'wt_rf_vistos';
    const CHAVE_AVISO_DIA = 'wt_rf_aviso_dia';

    const NOMES_TELA = {
        menuSystem: 'Menu Principal',
        menuLateral: 'Menu lateral',
        mainSystem: 'Ordem de Serviço',
        salesSystem: 'Vendas ML',
        reembolsosSystem: 'Reclamações',
        caixaSystem: 'Conferência Caixa',
        precificacaoSystem: 'Precificação',
        precificacaoInteligenteSystem: 'Precificação inteligente',
        feedbackSystem: 'Feedback',
        reviewsSystem: 'Avaliações',
        folgasSystem: 'Calendário',
        shippingSystem: 'Gerenciar Frete',
        perguntasSystem: 'Perguntas ML',
        nfeSystem: 'Emissão NF-e',
        entradasSystem: 'Entradas',
        fullSystem: 'Full',
        estoqueGestaoSystem: 'Gestão de Estoque',
        gerenciamentoAnunciosSystem: 'Full - Gerenciamento',
        promocoesSystem: 'Promoções em Lote',
        chamadosSystem: 'Chamados',
        reclamacoesSystem: 'Reclamações ML',
        historicoAcessosScreen: 'Histórico de Acessos',
        metaRonaldSystem: 'Meta Ronald',
        devolucoesSystem: 'Devoluções',
        reclamacoesClientesSystem: 'Reclamações de Clientes',
        atividadesSystem: 'Controle de Atividades',
        projetosSystem: 'Projetos / Tarefas',
        patrimoniosSystem: 'Patrimônios WT',
        pedidosSystem: 'Pedidos',
        sugestoesSystem: 'Sugestões de Melhoria',
        horasExtrasSystem: 'Horas Extras',
        vendasVendedoresSystem: 'Vendas Vendedores',
        regrasAlertaEstoqueSystem: 'Regras de Alerta de Estoque'
    };

    // Onde procurar coisas "paradas". Status/colunas conferidos em cada módulo.
    const FONTES_PENDENCIA = [
        { id: 'entradas_pendentes', nome: 'Entradas pendentes', tabela: 'entradas_cards', status: ['pendente'], data: 'criado_em', dias: 3, abrir: 'abrirSistemaEntradas' },
        { id: 'entradas_a_caminho', nome: 'Entradas a caminho', tabela: 'entradas_cards', status: ['a_caminho'], data: 'criado_em', dias: 15, abrir: 'abrirSistemaEntradas' },
        { id: 'ordens_servico', nome: 'Ordens de Serviço em aberto', tabela: 'ordens_service', status: ['pendente', 'andamento', 'a_verificar'], data: 'data_criacao', dias: 5, abrir: 'abrirSistemaOS' },
        { id: 'chamados', nome: 'Chamados em aberto', tabela: 'chamados', status: ['aberto', 'em_andamento', 'aguardando', 'aguardando_teste'], data: 'criado_em', dias: 5, abrir: 'abrirSistemaChamados' },
        { id: 'reclamacoes_clientes', nome: 'Reclamações de clientes em aberto', tabela: 'reclamacoes_clientes', status: ['aberta', 'em_andamento'], data: 'criado_em', dias: 3, abrir: 'abrirSistemaReclamacoesClientes' },
        { id: 'sugestoes', nome: 'Sugestões aguardando resposta', tabela: 'feedback_sugestoes', status: ['aguardando'], data: 'data_criacao', dias: 7, abrir: 'abrirSistemaSugestoes' },
        { id: 'projetos', nome: 'Projetos / tarefas em aberto', tabela: 'projetos_tarefas', status: ['pendente_prazo', 'em_andamento'], data: 'criado_em', dias: 30, abrir: 'abrirSistemaProjetos' }
    ];
    const CAMPOS_IDENTIFICACAO = ['numero_entrada', 'code', 'codigo', 'titulo', 'assunto', 'nome_produto', 'produto', 'cliente_nome', 'nome', 'descricao'];
    const CAMPOS_RESPONSAVEL = ['responsavel', 'designado_para', 'criado_por', 'created_by', 'createdBy', 'usuario_nome', 'autor_nome', 'fornecedor_nome'];
    const CAMPOS_DATA = ['criado_em', 'data_criacao', 'created_at'];

    const SEL_CLIQUE = 'button, a[href], a[onclick], [onclick], [role="button"], [role="tab"], [role="menuitem"], ' +
        'input[type="button"], input[type="submit"], input[type="checkbox"], input[type="radio"], input[type="file"], summary, .btn, .wt-nav-item';
    const SEL_CAMPO = 'input:not([type="button"]):not([type="submit"]):not([type="checkbox"]):not([type="radio"])' +
        ':not([type="file"]):not([type="hidden"]), select, textarea';

    function sb() { return window.supabaseClient || null; }
    function usuario() { return String(window.currentUser?.username || '').trim().toLowerCase(); }
    function ehAdmin() { return ADMINS.includes(usuario()); }
    function esc(v) {
        return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function toast(msg, tipo) { if (typeof window.showToast === 'function') window.showToast(msg, tipo || 'info'); }
    function erroDeTabela(erro) {
        return /does not exist|schema cache|relation|could not find the function/i.test(String(erro?.message || erro || ''));
    }
    function diaLocal(d) {
        const x = d || new Date();
        return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
    }
    function lerLocal(chave, padrao) {
        try { const v = JSON.parse(localStorage.getItem(chave) || 'null'); return v == null ? padrao : v; }
        catch (_) { return padrao; }
    }
    function gravarLocal(chave, valor) {
        try { localStorage.setItem(chave, JSON.stringify(valor)); } catch (_) { /* sem storage */ }
    }

    // ============================================================
    // COLETOR — identificar elementos
    // ============================================================

    function prettificarId(id) {
        const s = String(id || '').replace(/(System|Screen)$/, '').replace(/([a-z0-9])([A-Z])/g, '$1 $2');
        return s.charAt(0).toUpperCase() + s.slice(1);
    }
    function nomeTela(id) { return NOMES_TELA[id] || prettificarId(id); }

    function normalizar(t) {
        return String(t || '').replace(/\s+/g, ' ').trim().replace(/\d+([.,:\/-]\d+)*/g, '#');
    }

    function visivel(el) {
        if (!el || el.classList?.contains('hidden')) return false;
        return el.getClientRects().length > 0;
    }

    function telaVisivel() {
        let menu = null;
        for (const el of document.querySelectorAll('[id$="System"], [id$="Screen"]')) {
            if (el.id === 'loginScreen' || !visivel(el)) continue;
            if (el.id === 'menuSystem') { menu = el; continue; }
            return el;
        }
        return menu;
    }

    function nomeFuncao(el) {
        const oc = el.getAttribute && el.getAttribute('onclick');
        if (!oc) return '';
        const re = /([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*\(/g;
        let m;
        while ((m = re.exec(oc))) {
            const nome = m[1].replace(/^window\./, '');
            if (!/^(if|return|event|this|confirm|alert|function)$/.test(nome) && !/^(event|this)\./.test(nome)) return nome.slice(0, 60);
        }
        return '';
    }

    function icone(el) {
        const i = el.querySelector && el.querySelector('i[class*="fa-"]');
        if (!i) return '';
        const m = i.className.match(/fa-(?!solid\b|regular\b|brands\b|fw\b|lg\b|spin\b)([a-z0-9-]+)/);
        return m ? m[1] : '';
    }

    function rotuloCampo(el) {
        let t = '';
        try {
            if (el.id) {
                const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
                if (l) t = l.textContent;
            }
        } catch (_) { /* id estranho */ }
        if (!t) { const l = el.closest('label'); if (l) t = l.textContent; }
        if (!t) t = el.getAttribute('aria-label') || el.getAttribute('placeholder') || '';
        if (!t) {
            const g = el.closest('.form-group, .mb-3, .mb-2');
            const l = g && g.querySelector('label');
            if (l) t = l.textContent;
        }
        t = normalizar(t);
        if (!t) t = normalizar(el.name || (el.id ? '#' + el.id : ''));
        return t.length > 60 ? t.slice(0, 57) + '…' : t;
    }

    function rotuloClique(el) {
        const tag = el.tagName;
        const ehBotao = tag === 'BUTTON' || tag === 'A' || tag === 'INPUT' || tag === 'SUMMARY' ||
            el.classList.contains('btn') || !!el.getAttribute('role');
        let t = el.getAttribute('aria-label') || '';
        if (!t) {
            if (tag === 'INPUT') t = (el.type === 'checkbox' || el.type === 'radio') ? rotuloCampo(el) : (el.value || '');
            else t = el.textContent || '';
        }
        t = normalizar(t);
        if (!t) t = normalizar(el.getAttribute('title') || '');
        // Linha de tabela/cartão inteiro clicável: o texto muda a cada item.
        if (t.length > 60 && !ehBotao) t = '';
        if (t.length > 60) t = t.slice(0, 57) + '…';
        if (!t) { const i = icone(el); if (i) t = 'ícone ' + i; }
        if (!t) { const fn = nomeFuncao(el); if (fn) t = 'ação ' + fn; }
        if (!t && el.id) t = '#' + normalizar(el.id);
        return t;
    }

    function tituloJanela(modal) {
        const h = modal.querySelector('.modal-title, h2, h3, h4, h5');
        const t = normalizar(h ? h.textContent : '');
        return t && t.length <= 50 ? t : prettificarId(modal.id);
    }

    function containerDe(el) {
        if (el.closest('.wt-sidebar')) return { id: 'menuLateral', nome: 'Menu lateral' };
        if (el.closest('#loginScreen, #' + ID_TELA + ', .toast')) return null;
        const tela = el.closest('[id$="System"], [id$="Screen"]');
        const janela = el.closest('.modal, [role="dialog"], [id^="modal"], [id$="Modal"]');
        if (janela && janela.id && (!tela || tela.contains(janela))) {
            const base = tela ? nomeTela(tela.id) : null;
            const titulo = tituloJanela(janela);
            return { id: janela.id, nome: base ? `${base} › ${titulo}` : `Janela: ${titulo}` };
        }
        if (tela) return { id: tela.id, nome: nomeTela(tela.id) };
        const vis = telaVisivel();
        return vis ? { id: vis.id, nome: nomeTela(vis.id) } : { id: 'global', nome: 'Outros' };
    }

    function infoDoElemento(el, tipo) {
        const c = containerDe(el);
        if (!c) return null;
        const rotulo = tipo === 'campo' ? rotuloCampo(el) : rotuloClique(el);
        if (!rotulo) return null;
        const fn = tipo === 'clique' ? nomeFuncao(el) : '';
        return {
            chave: `${c.id}|${tipo}|${rotulo}|${fn}`.slice(0, 300),
            tela: c.nome, tela_id: c.id, rotulo, tipo
        };
    }

    // ============================================================
    // COLETOR — fila local e envio
    // ============================================================

    let desativado = false;          // tabelas ainda não criadas
    let enviando = false;
    let seqClique = 0;
    let ultimoClique = null;
    let telaAtualId = null;
    const cliquesComErroEnviado = new Set();
    const fila = { catalogo: new Map(), usos: new Map(), erros: [] };

    (function restaurarFila() {
        const salva = lerLocal(CHAVE_FILA, null);
        if (!salva) return;
        (salva.catalogo || []).forEach(c => fila.catalogo.set(c.chave, c));
        (salva.usos || []).forEach(u => fila.usos.set(`${u.dia}¦${u.chave}¦${u.usuario}`, u));
        fila.erros = (salva.erros || []).slice(-50);
        try { localStorage.removeItem(CHAVE_FILA); } catch (_) { /* segue */ }
    })();

    function persistirFila() {
        if (!fila.catalogo.size && !fila.usos.size && !fila.erros.length) {
            try { localStorage.removeItem(CHAVE_FILA); } catch (_) { /* segue */ }
            return;
        }
        gravarLocal(CHAVE_FILA, {
            catalogo: [...fila.catalogo.values()].slice(0, MAX_CATALOGO_POR_ENVIO),
            usos: [...fila.usos.values()],
            erros: fila.erros
        });
    }

    let vistos = null;
    function vistosHoje() {
        const hoje = diaLocal();
        if (!vistos || vistos.dia !== hoje) {
            const salvo = lerLocal(CHAVE_VISTOS, null);
            vistos = salvo && salvo.dia === hoje ? { dia: hoje, chaves: new Set(salvo.chaves || []) } : { dia: hoje, chaves: new Set() };
        }
        return vistos;
    }
    function marcarVistos(chaves) {
        const v = vistosHoje();
        chaves.forEach(c => v.chaves.add(c));
        gravarLocal(CHAVE_VISTOS, { dia: v.dia, chaves: [...v.chaves] });
    }

    // true = entrou agora na fila
    function registrarCatalogo(info) {
        if (desativado || !info) return false;
        if (fila.catalogo.has(info.chave) || vistosHoje().chaves.has(info.chave)) return false;
        fila.catalogo.set(info.chave, info);
        return true;
    }

    function registrarUso(info) {
        const u = usuario();
        if (!u || desativado || !info) return;
        const dia = diaLocal();
        const k = `${dia}¦${info.chave}¦${u}`;
        const agora = new Date().toISOString();
        const atual = fila.usos.get(k);
        if (atual) { atual.qtd++; atual.em = agora; }
        else fila.usos.set(k, { ...info, dia, usuario: u, qtd: 1, em: agora });
    }

    async function enviar() {
        if (enviando || desativado || !sb() || !usuario()) return;
        const catalogo = [...fila.catalogo.values()].slice(0, MAX_CATALOGO_POR_ENVIO);
        const usos = [...fila.usos.values()];
        const erros = fila.erros.slice();
        if (!catalogo.length && !usos.length && !erros.length) return;

        enviando = true;
        catalogo.forEach(c => fila.catalogo.delete(c.chave));
        fila.usos.clear();
        fila.erros = [];
        try {
            const { error } = await sb().rpc(RPC_LOTE, {
                p_catalogo: catalogo,
                p_usos: usos,
                p_erros: erros.map(e => {
                    const { _clique, _em, ...resto } = e;
                    return resto;
                })
            });
            if (error) throw error;
            marcarVistos(catalogo.map(c => c.chave));
            erros.forEach(e => { if (e._clique) cliquesComErroEnviado.add(e._clique); });
        } catch (err) {
            if (erroDeTabela(err)) { desativado = true; return; }
            // Sem conexão: devolve tudo pra fila e tenta no próximo ciclo.
            catalogo.forEach(c => fila.catalogo.set(c.chave, c));
            usos.forEach(u => {
                const k = `${u.dia}¦${u.chave}¦${u.usuario}`;
                const atual = fila.usos.get(k);
                if (atual) atual.qtd += u.qtd; else fila.usos.set(k, u);
            });
            fila.erros = erros.concat(fila.erros).slice(-50);
        } finally {
            enviando = false;
        }
    }

    setInterval(enviar, INTERVALO_ENVIO_MS);
    window.addEventListener('pagehide', persistirFila);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') { persistirFila(); enviar(); }
    });

    // ============================================================
    // COLETOR — cliques, campos, telas
    // ============================================================

    document.addEventListener('click', (e) => {
        if (!usuario() || desativado) return;
        const alvo = e.target && e.target.closest && e.target.closest(SEL_CLIQUE);
        if (!alvo) return;
        const info = infoDoElemento(alvo, 'clique');
        if (!info) return;
        registrarCatalogo(info);
        registrarUso(info);
        ultimoClique = { ...info, em: Date.now(), id: ++seqClique };
        if (alvo.tagName === 'A' && alvo.hasAttribute('download')) registrarDownload(alvo.getAttribute('download') || alvo.href, 'Arquivo');
        agendarVarredura();
    }, true);

    document.addEventListener('change', (e) => {
        if (!usuario() || desativado) return;
        const el = e.target;
        if (!el || !el.matches || !el.matches(SEL_CAMPO)) return;
        const info = infoDoElemento(el, 'campo');
        if (!info) return;
        registrarCatalogo(info);
        registrarUso(info);
    }, true);

    function verificarTela() {
        if (!usuario() || desativado) return;
        const t = telaVisivel();
        const id = t ? t.id : null;
        if (!id || id === telaAtualId) return;
        telaAtualId = id;
        if (id === ID_TELA) return;
        const info = { chave: `tela|${id}`, tela: nomeTela(id), tela_id: id, rotulo: nomeTela(id), tipo: 'tela' };
        registrarCatalogo(info);
        registrarUso(info);
        agendarVarredura();
    }
    setInterval(verificarTela, 2000);

    // Cataloga o que está visível — é assim que se descobre o que NUNCA é clicado.
    let temporizadorVarredura = null;
    let ultimaVarredura = 0;
    function agendarVarredura() {
        clearTimeout(temporizadorVarredura);
        const espera = Math.max(2500, 8000 - (Date.now() - ultimaVarredura));
        temporizadorVarredura = setTimeout(() => {
            const rodar = () => { ultimaVarredura = Date.now(); varrer(); };
            if (window.requestIdleCallback) window.requestIdleCallback(rodar, { timeout: 3000 }); else rodar();
        }, espera);
    }

    function varrer() {
        if (!usuario() || desativado) return;
        let novos = 0;
        for (const el of document.querySelectorAll(SEL_CLIQUE + ', ' + SEL_CAMPO)) {
            if (novos >= MAX_CATALOGO_POR_ENVIO) break;
            if (!visivel(el)) continue;
            const tipo = el.matches(SEL_CAMPO) ? 'campo' : 'clique';
            if (registrarCatalogo(infoDoElemento(el, tipo))) novos++;
        }
    }

    function registrarTelasConhecidas() {
        const ids = new Set(Object.keys(NOMES_TELA).filter(id => id !== 'menuLateral'));
        document.querySelectorAll('[id$="System"], [id$="Screen"]').forEach(el => ids.add(el.id));
        ids.delete('loginScreen');
        ids.delete(ID_TELA);
        ids.forEach(id => registrarCatalogo({ chave: `tela|${id}`, tela: nomeTela(id), tela_id: id, rotulo: nomeTela(id), tipo: 'tela' }));
    }

    // ============================================================
    // COLETOR — downloads (Excel, PDF, arquivos gerados, impressão)
    // ============================================================

    let gerandoArquivo = 0;
    function registrarDownload(nomeArquivo, formato) {
        if (!usuario() || desativado) return;
        const t = telaVisivel();
        const id = t ? t.id : 'global';
        if (id === ID_TELA) return;
        let nome = String(nomeArquivo || 'arquivo').split(/[\\/]/).pop().split('?')[0];
        if (/^blob:|^data:/.test(String(nomeArquivo))) nome = 'arquivo gerado';
        const rotulo = `${formato}: ${normalizar(nome).slice(0, 80)}`;
        const info = { chave: `${id}|download|${rotulo}`.slice(0, 300), tela: nomeTela(id), tela_id: id, rotulo, tipo: 'download' };
        registrarCatalogo(info);
        registrarUso(info);
    }

    function envolverGerador(obj, metodo, formato, pegarNome) {
        if (!obj || typeof obj[metodo] !== 'function' || obj[metodo].__wtRf) return false;
        const original = obj[metodo];
        const envolvido = function () {
            try { registrarDownload(pegarNome.apply(this, arguments), formato); } catch (_) { /* nunca atrapalha */ }
            gerandoArquivo++;
            try { return original.apply(this, arguments); }
            finally { setTimeout(() => { gerandoArquivo = Math.max(0, gerandoArquivo - 1); }, 0); }
        };
        envolvido.__wtRf = true;
        obj[metodo] = envolvido;
        return true;
    }

    function instalarGeradores() {
        if (typeof XLSX !== 'undefined') envolverGerador(XLSX, 'writeFile', 'Excel', (wb, nome) => nome);
        const jspdf = window.jspdf && window.jspdf.jsPDF;
        if (jspdf && jspdf.API) envolverGerador(jspdf.API, 'save', 'PDF', nome => nome || 'documento.pdf');
    }

    // <a download> criado por código e clicado via .click()
    const clickAncoraOriginal = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
        try {
            if (!gerandoArquivo && this.hasAttribute('download')) registrarDownload(this.getAttribute('download') || this.href, 'Arquivo');
        } catch (_) { /* segue */ }
        return clickAncoraOriginal.apply(this, arguments);
    };

    const printOriginal = window.print;
    window.print = function () {
        try { registrarDownload('impressão da tela', 'Impressão'); } catch (_) { /* segue */ }
        return printOriginal.apply(this, arguments);
    };

    // ============================================================
    // COLETOR — erros
    // ============================================================

    const RUIDO_ERRO = /ResizeObserver loop|^Script error\.?$|extension:\/\/|Non-Error promise rejection captured|AbortError|The user aborted/i;
    const PARECE_SISTEMA = /erro|error|falha|falhou|failed|não foi possível|nao foi possivel|exception|undefined|null|cannot|is not|timeout|tempo esgotado|network|fetch|json|column|relation|violates|permission|denied|\b5\d\d\b|inesperad/i;

    function textoDe(v) {
        if (v == null) return '';
        if (v instanceof Error) return v.message || String(v);
        if (typeof v === 'object') {
            if (v.message) return String(v.message);
            try { return JSON.stringify(v).slice(0, 300); } catch (_) { return String(v); }
        }
        return String(v);
    }
    function limparTexto(html) {
        const d = document.createElement('div');
        d.innerHTML = String(html || '');
        return (d.textContent || '').replace(/\s+/g, ' ').trim();
    }

    function registrarErro(tipoErro, mensagem, detalhe, provavelSistema, somenteComClique) {
        if (!usuario() || desativado) return;
        mensagem = String(mensagem || '').replace(/\s+/g, ' ').trim().slice(0, 500);
        detalhe = String(detalhe || '').slice(0, 1500);
        if (!mensagem || RUIDO_ERRO.test(mensagem) || RUIDO_ERRO.test(detalhe)) return;

        const agora = Date.now();
        const clique = ultimoClique && agora - ultimoClique.em <= JANELA_ERRO_CLIQUE_MS ? ultimoClique : null;
        if (somenteComClique && !clique) return;

        if (clique) {
            if (cliquesComErroEnviado.has(clique.id)) return;
            const existente = fila.erros.find(x => x._clique === clique.id);
            if (existente) {
                // Vários sinais do mesmo clique viram um erro só; o aviso
                // mostrado na tela é a mensagem mais clara, fica como principal.
                if (tipoErro === 'toast' && existente.tipo_erro !== 'toast') {
                    existente.detalhe = `${existente.mensagem}\n${existente.detalhe || ''}`.slice(0, 2000);
                    existente.mensagem = mensagem;
                    existente.tipo_erro = 'toast';
                } else if (!String(existente.detalhe || '').includes(mensagem)) {
                    existente.detalhe = `${existente.detalhe || ''}\n${mensagem}${detalhe ? '\n' + detalhe : ''}`.trim().slice(0, 2000);
                }
                existente.provavel_sistema = existente.provavel_sistema || !!provavelSistema;
                return;
            }
        } else if (fila.erros.some(x => x.mensagem === mensagem && agora - x._em < 60000)) {
            return;
        }

        const t = telaVisivel();
        fila.erros.push({
            _clique: clique ? clique.id : null,
            _em: agora,
            chave: clique ? clique.chave : null,
            tela: clique ? clique.tela : (t ? nomeTela(t.id) : 'Outros'),
            rotulo: clique ? clique.rotulo : null,
            usuario: usuario(),
            tipo_erro: tipoErro,
            mensagem,
            detalhe,
            provavel_sistema: !!provavelSistema,
            url: (location.pathname + location.hash).slice(0, 300),
            criado_em: new Date().toISOString()
        });
        if (fila.erros.length > 50) fila.erros.shift();
    }

    window.addEventListener('error', (e) => {
        if (!e || e.target !== window && e.target && e.target.tagName) return; // erro de imagem/script carregando
        if (e.filename && /extension:\/\//.test(e.filename)) return;
        const onde = e.filename ? `${String(e.filename).split('/').pop()}:${e.lineno}` : '';
        registrarErro('js', e.message || textoDe(e.error), [onde, e.error && e.error.stack].filter(Boolean).join('\n'), true, false);
    });

    window.addEventListener('unhandledrejection', (e) => {
        const r = e && e.reason;
        registrarErro('promessa', textoDe(r), r && r.stack ? r.stack : '', true, false);
    });

    const consoleErrorOriginal = console.error;
    console.error = function () {
        try {
            const partes = [...arguments].map(textoDe).filter(Boolean);
            const pilha = [...arguments].find(a => a && a.stack);
            // Só conta se veio logo depois de um clique — o resto é ruído de fundo.
            registrarErro('console', partes.join(' ').slice(0, 500), pilha ? pilha.stack : '', true, true);
        } catch (_) { /* nunca atrapalha */ }
        return consoleErrorOriginal.apply(this, arguments);
    };

    function instalarToast() {
        if (typeof window.showToast !== 'function' || window.showToast.__wtRf) return;
        const original = window.showToast;
        const envolvido = function (mensagem, tipo) {
            try {
                if (tipo === 'error') {
                    const texto = limparTexto(mensagem);
                    registrarErro('toast', texto, '', PARECE_SISTEMA.test(texto), false);
                }
            } catch (_) { /* segue */ }
            return original.apply(this, arguments);
        };
        envolvido.__wtRf = true;
        window.showToast = envolvido;
    }

    function resumoUrl(url) {
        try {
            const u = new URL(url, location.href);
            const rest = u.pathname.match(/\/rest\/v1\/(?:rpc\/)?([^/?]+)/);
            if (rest) return `banco (${rest[1]})`;
            return u.host + u.pathname.split('/').slice(0, 3).join('/');
        } catch (_) { return String(url).slice(0, 80); }
    }

    if (typeof window.fetch === 'function') {
        const fetchOriginal = window.fetch;
        window.fetch = async function (input, init) {
            const url = typeof input === 'string' ? input : (input && input.url) || String(input || '');
            const proprio = /\/rpc\/func_/.test(url);
            try {
                const resp = await fetchOriginal.apply(this, arguments);
                if (!proprio) {
                    const s = resp.status;
                    const banco = /\/rest\/v1\//.test(url);
                    if (s >= 500 || (banco && (s === 400 || s === 403 || s === 409))) {
                        registrarErro('rede', `Falha HTTP ${s} em ${resumoUrl(url)}`, '', true, true);
                    }
                }
                return resp;
            } catch (err) {
                if (!proprio && err && err.name !== 'AbortError' && navigator.onLine !== false) {
                    registrarErro('rede', `Sem resposta de ${resumoUrl(url)}: ${err.message || err}`, '', true, true);
                }
                throw err;
            }
        };
    }

    // Coisas que carregam depois deste arquivo (showToast, XLSX, jsPDF).
    let tentativasInstalacao = 0;
    const instalador = setInterval(() => {
        tentativasInstalacao++;
        instalarToast();
        instalarGeradores();
        if (tentativasInstalacao > 60) clearInterval(instalador);
    }, 1000);

    // Primeira varredura quando alguém estiver logado.
    let iniciouSessao = false;
    setInterval(() => {
        if (!usuario()) { iniciouSessao = false; return; }
        if (iniciouSessao) return;
        iniciouSessao = true;
        registrarTelasConhecidas();
        verificarTela();
        agendarVarredura();
        setTimeout(enviar, 5000);
        if (ehAdmin()) setTimeout(verificarAlertasAoEntrar, 20000);
    }, 1500);

    // ============================================================
    // PAINEL — dados
    // ============================================================

    const estado = {
        aba: 'geral',
        dias: 7,
        catalogo: [],
        usos: [],          // {chave, usuario, qtd, ultimo_em} somados no período
        erros: [],
        pendencias: [],    // [{fonte, itens:[], erro}]
        config: null,
        carregando: false,
        buscaCatalogo: '',
        filtroTela: '',
        mostrarIgnorados: false,
        errosTodos: false,
        errosResolvidos: false
    };

    async function paginar(montar) {
        const todos = [];
        for (let de = 0; de < 50000; de += 1000) {
            const { data, error } = await montar().range(de, de + 999);
            if (error) throw error;
            todos.push(...(data || []));
            if (!data || data.length < 1000) break;
        }
        return todos;
    }

    function configPadrao() {
        const prazos = {};
        FONTES_PENDENCIA.forEach(f => { prazos[f.id] = f.dias; });
        return { dias_sem_uso: 7, prazos, fontes_desligadas: [] };
    }

    async function carregarConfig() {
        const padrao = configPadrao();
        try {
            const { data } = await sb().from('func_config').select('valor').eq('chave', 'geral').maybeSingle();
            const v = (data && data.valor) || {};
            return { ...padrao, ...v, prazos: { ...padrao.prazos, ...(v.prazos || {}) } };
        } catch (_) { return padrao; }
    }

    async function salvarConfig() {
        const { error } = await sb().from('func_config').upsert({
            chave: 'geral', valor: estado.config,
            atualizado_em: new Date().toISOString(), atualizado_por: usuario()
        });
        if (error) toast('❌ Não foi possível salvar: ' + error.message, 'error');
    }

    function valorDe(linha, campos) {
        for (const c of campos) if (linha[c] != null && linha[c] !== '') return linha[c];
        return null;
    }

    async function carregarPendencias(config) {
        const agora = Date.now();
        return Promise.all(FONTES_PENDENCIA.map(async (f) => {
            if ((config.fontes_desligadas || []).includes(f.id)) return { fonte: f, itens: [], desligada: true };
            const prazo = Number(config.prazos[f.id]) || f.dias;
            const corte = new Date(agora - prazo * 86400000).toISOString();
            let linhas;
            try {
                const { data, error } = await sb().from(f.tabela).select('*')
                    .in('status', f.status).lt(f.data, corte)
                    .order(f.data, { ascending: true }).limit(200);
                if (error) throw error;
                linhas = data || [];
            } catch (_) {
                // Coluna de data com outro nome: busca sem filtro e calcula aqui.
                try {
                    const { data, error } = await sb().from(f.tabela).select('*').in('status', f.status).limit(500);
                    if (error) throw error;
                    linhas = data || [];
                } catch (e2) {
                    return { fonte: f, itens: [], erro: e2.message || String(e2) };
                }
            }
            const itens = linhas.map(l => {
                const data = l[f.data] || valorDe(l, CAMPOS_DATA);
                const dias = data ? Math.floor((agora - new Date(data).getTime()) / 86400000) : null;
                return {
                    id: l.id,
                    identificacao: valorDe(l, CAMPOS_IDENTIFICACAO) || (l.id != null ? `#${l.id}` : '—'),
                    responsavel: valorDe(l, CAMPOS_RESPONSAVEL),
                    status: l.status,
                    data, dias
                };
            }).filter(i => i.dias != null && i.dias >= prazo)
              .sort((a, b) => b.dias - a.dias);
            return { fonte: f, prazo, itens };
        }));
    }

    async function carregarTudo() {
        const config = await carregarConfig();
        const dias = Number(config.dias_sem_uso) || 7;
        const desde = new Date(Date.now() - dias * 86400000);
        const desdeErros = new Date(Date.now() - 30 * 86400000).toISOString();

        const [catalogo, usos, erros, pendencias] = await Promise.all([
            paginar(() => sb().from('func_catalogo').select('*').order('chave')),
            paginar(() => sb().rpc('func_resumo_uso', { p_desde: diaLocal(desde) }).order('chave').order('usuario')),
            paginar(() => sb().from('func_erros').select('*').gte('criado_em', desdeErros).order('criado_em', { ascending: false })),
            carregarPendencias(config)
        ]);
        return { config, dias, catalogo, usos, erros, pendencias };
    }

    // ============================================================
    // PAINEL — cálculos
    // ============================================================

    function calcular(d) {
        const agora = Date.now();
        const corte = agora - d.dias * 86400000;
        const sumiuAntes = agora - DIAS_ELEMENTO_SUMIU * 86400000;
        const inicioColeta = d.catalogo.reduce((min, c) => Math.min(min, new Date(c.primeiro_visto).getTime()), agora);

        const usosPorChave = new Map();
        d.usos.forEach(u => usosPorChave.set(u.chave, (usosPorChave.get(u.chave) || 0) + Number(u.qtd || 0)));

        const ativos = d.catalogo.filter(c => new Date(c.ultimo_visto).getTime() >= sumiuAntes);
        const semUso = ativos.filter(c =>
            !c.ignorado &&
            new Date(c.primeiro_visto).getTime() <= corte &&
            (!c.ultimo_uso || new Date(c.ultimo_uso).getTime() < corte)
        );
        const errosSistemaAbertos = d.erros.filter(e => !e.resolvido && e.provavel_sistema &&
            new Date(e.criado_em).getTime() >= corte);
        const pendenciasAtrasadas = d.pendencias.reduce((s, p) => s + p.itens.length, 0);

        return { corte, inicioColeta, usosPorChave, ativos, semUso, errosSistemaAbertos, pendenciasAtrasadas };
    }

    function totalAlertas(d, c) {
        return c.semUso.length + c.errosSistemaAbertos.length + c.pendenciasAtrasadas;
    }

    // ============================================================
    // PAINEL — formatação
    // ============================================================

    function fmtDataHora(iso) {
        if (!iso) return '—';
        return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
    }
    function fmtData(iso) {
        if (!iso) return '—';
        const s = String(iso);
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) { const [a, m, di] = s.split('-'); return `${di}/${m}/${a}`; }
        return new Date(iso).toLocaleDateString('pt-BR');
    }
    function haQuanto(iso) {
        if (!iso) return 'nunca';
        const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
        if (dias <= 0) return 'hoje';
        if (dias === 1) return 'ontem';
        return `há ${dias} dias`;
    }
    const ROTULO_TIPO = {
        clique: '<span class="rf-tipo rf-tipo-clique">Botão</span>',
        campo: '<span class="rf-tipo rf-tipo-campo">Campo</span>',
        download: '<span class="rf-tipo rf-tipo-download">Download</span>',
        tela: '<span class="rf-tipo rf-tipo-tela">Tela</span>'
    };
    function nomeUsuario(u) {
        const lista = window.SYSTEM_USERS || null;
        if (Array.isArray(lista)) {
            const achado = lista.find(x => String(x.username || '').toLowerCase() === String(u || '').toLowerCase());
            if (achado && achado.name) return achado.name;
        }
        return u || '—';
    }

    // ============================================================
    // PAINEL — telas
    // ============================================================

    function cssPainel() {
        if (document.getElementById('rfEstilos')) return;
        const s = document.createElement('style');
        s.id = 'rfEstilos';
        s.textContent = `
            #${ID_TELA} .rf-kpis { display:grid; grid-template-columns:repeat(auto-fit,minmax(190px,1fr)); gap:12px; margin-bottom:16px; }
            #${ID_TELA} .rf-kpi { background:#fff; border:1px solid #e6e1f0; border-radius:12px; padding:14px 16px; cursor:pointer; text-align:left; transition:box-shadow .15s; }
            #${ID_TELA} .rf-kpi:hover { box-shadow:0 4px 14px rgba(75,0,130,.12); }
            #${ID_TELA} .rf-kpi .rf-kpi-num { font-size:28px; font-weight:700; line-height:1.1; }
            #${ID_TELA} .rf-kpi .rf-kpi-txt { font-size:13px; color:#555; margin-top:4px; }
            #${ID_TELA} .rf-kpi.rf-ruim .rf-kpi-num { color:#c62828; }
            #${ID_TELA} .rf-kpi.rf-ok .rf-kpi-num { color:#2e7d32; }
            #${ID_TELA} .rf-abas { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:14px; border-bottom:2px solid #eee; }
            #${ID_TELA} .rf-aba { background:none; border:none; padding:9px 14px; font-weight:600; color:#666; border-bottom:3px solid transparent; margin-bottom:-2px; cursor:pointer; }
            #${ID_TELA} .rf-aba.ativa { color:#4B0082; border-bottom-color:#8A2BE2; }
            #${ID_TELA} .rf-aba .rf-cont { display:inline-block; min-width:20px; padding:0 6px; border-radius:10px; background:#eee; font-size:12px; margin-left:4px; }
            #${ID_TELA} .rf-aba .rf-cont.rf-alerta { background:#c62828; color:#fff; }
            #${ID_TELA} .rf-grupo { border:1px solid #eee; border-radius:10px; margin-bottom:12px; overflow:hidden; }
            #${ID_TELA} .rf-grupo > summary { padding:10px 14px; background:#faf8fd; font-weight:600; cursor:pointer; list-style:none; }
            #${ID_TELA} .rf-grupo > summary::-webkit-details-marker { display:none; }
            #${ID_TELA} .rf-grupo table { margin:0; }
            #${ID_TELA} .rf-tipo { display:inline-block; font-size:11px; padding:2px 8px; border-radius:10px; font-weight:600; }
            #${ID_TELA} .rf-tipo-clique { background:#ede7f6; color:#4B0082; }
            #${ID_TELA} .rf-tipo-campo { background:#e3f2fd; color:#0d47a1; }
            #${ID_TELA} .rf-tipo-download { background:#e8f5e9; color:#1b5e20; }
            #${ID_TELA} .rf-tipo-tela { background:#fff3e0; color:#e65100; }
            #${ID_TELA} .rf-aviso { background:#fff8e1; border:1px solid #ffe082; border-radius:10px; padding:10px 14px; margin-bottom:14px; font-size:14px; }
            #${ID_TELA} .rf-vazio { text-align:center; color:#777; padding:28px 10px; }
            #${ID_TELA} .rf-detalhe { white-space:pre-wrap; font-size:12px; color:#666; max-width:520px; max-height:160px; overflow:auto; margin-top:4px; }
            #${ID_TELA} .rf-barra { height:8px; background:#8A2BE2; border-radius:4px; min-width:2px; }
            #${ID_TELA} .rf-filtros { display:flex; flex-wrap:wrap; gap:8px; align-items:center; margin-bottom:12px; }
            #${ID_TELA} .rf-filtros label { font-size:13px; display:flex; gap:6px; align-items:center; margin:0; }
            #${ID_TELA} table td, #${ID_TELA} table th { vertical-align:middle; }
            .wt-nav-item .rf-badge-menu { background:#c62828; color:#fff; border-radius:10px; font-size:11px; padding:1px 7px; margin-left:auto; font-weight:700; }
            @media (max-width: 640px) { #${ID_TELA} .rf-kpi .rf-kpi-num { font-size:22px; } }
        `;
        document.head.appendChild(s);
    }

    function montarTela() {
        let tela = document.getElementById(ID_TELA);
        if (tela) return tela;
        cssPainel();
        tela = document.createElement('div');
        tela.id = ID_TELA;
        tela.className = 'hidden';
        tela.innerHTML = `
            <header class="main-header">
                <div class="container">
                    <div class="header-content">
                        <h1 style="display:flex; align-items:center; gap:10px;">
                            <img src="logo.png" alt="Wheel Tech" style="height:35px; width:auto;">
                            Registro de Funcionalidades
                        </h1>
                    </div>
                </div>
            </header>
            <div class="container">
                <div class="card mb-3">
                    <div class="d-flex justify-content-between align-items-center flex-wrap gap-2">
                        <div>
                            <h3 style="margin:0;"><i class="fas fa-clipboard-check"></i> Uso do sistema</h3>
                            <div id="rfSubtitulo" class="text-muted" style="font-size:13px; margin-top:4px;"></div>
                        </div>
                        <div class="d-flex gap-2 flex-wrap align-items-center">
                            <label style="font-size:13px; margin:0;">Sem uso há
                                <select id="rfDias" class="form-control form-control-sm" style="display:inline-block; width:auto;">
                                    <option value="3">3 dias</option>
                                    <option value="7">7 dias</option>
                                    <option value="15">15 dias</option>
                                    <option value="30">30 dias</option>
                                </select>
                            </label>
                            <button class="btn btn-secondary" type="button" data-rf="voltar"><i class="fas fa-arrow-left"></i> Voltar</button>
                            <button class="btn btn-info" type="button" data-rf="atualizar"><i class="fas fa-sync-alt"></i> Atualizar</button>
                            <button class="btn btn-outline-primary" type="button" data-rf="exportar"><i class="fas fa-file-excel"></i> Exportar Excel</button>
                        </div>
                    </div>
                </div>
                <div id="rfKpis" class="rf-kpis"></div>
                <div class="card">
                    <div id="rfAbas" class="rf-abas"></div>
                    <div id="rfConteudo"></div>
                </div>
            </div>
        `;
        document.body.appendChild(tela);

        tela.addEventListener('click', aoClicarNoPainel);
        tela.addEventListener('change', aoMudarNoPainel);
        tela.addEventListener('input', (e) => {
            if (e.target.id === 'rfBuscaCatalogo') { estado.buscaCatalogo = e.target.value; renderConteudo(); focarBusca(); }
        });
        return tela;
    }

    function focarBusca() {
        const b = document.getElementById('rfBuscaCatalogo');
        if (b) { b.focus(); b.setSelectionRange(b.value.length, b.value.length); }
    }

    let dados = null;
    let calc = null;

    function render() {
        if (!dados) return;
        calc = calcular(dados);
        const sel = document.getElementById('rfDias');
        if (sel) sel.value = String(dados.dias);

        const sub = document.getElementById('rfSubtitulo');
        if (sub) sub.textContent = `Monitorando desde ${fmtData(new Date(calc.inicioColeta).toISOString())} · ${calc.ativos.length} funcionalidades conhecidas`;

        const usuariosAtivos = new Set(dados.usos.map(u => u.usuario)).size;
        const kpi = (aba, num, txt, ruim) => `
            <button type="button" class="rf-kpi ${num > 0 && ruim ? 'rf-ruim' : 'rf-ok'}" data-rf-aba="${aba}">
                <div class="rf-kpi-num">${num}</div><div class="rf-kpi-txt">${txt}</div>
            </button>`;
        document.getElementById('rfKpis').innerHTML =
            kpi('sem_uso', calc.semUso.length, `funcionalidades sem uso há ${dados.dias}+ dias`, true) +
            kpi('erros', calc.errosSistemaAbertos.length, `erros do sistema em aberto (${dados.dias} dias)`, true) +
            kpi('pendencias', calc.pendenciasAtrasadas, 'entradas pendentes além do prazo', true) +
            kpi('equipe', usuariosAtivos, `pessoas usaram o sistema (${dados.dias} dias)`, false);

        const abas = [
            ['geral', 'Visão geral', 0],
            ['sem_uso', 'Sem uso', calc.semUso.length],
            ['erros', 'Erros', calc.errosSistemaAbertos.length],
            ['pendencias', 'Pendências paradas', calc.pendenciasAtrasadas],
            ['equipe', 'Uso da equipe', 0],
            ['catalogo', 'Todas as funcionalidades', 0]
        ];
        document.getElementById('rfAbas').innerHTML = abas.map(([id, nome, n]) => `
            <button type="button" class="rf-aba ${estado.aba === id ? 'ativa' : ''}" data-rf-aba="${id}">
                ${nome}${n ? `<span class="rf-cont rf-alerta">${n}</span>` : ''}
            </button>`).join('');

        renderConteudo();
        atualizarBadgeMenu(totalAlertas(dados, calc));
    }

    function renderConteudo() {
        const alvo = document.getElementById('rfConteudo');
        if (!alvo || !dados) return;
        const fn = { geral: htmlGeral, sem_uso: htmlSemUso, erros: htmlErros, pendencias: htmlPendencias, equipe: htmlEquipe, catalogo: htmlCatalogo }[estado.aba] || htmlGeral;
        alvo.innerHTML = fn();
    }

    function avisoColetaCurta() {
        const diasColeta = Math.floor((Date.now() - calc.inicioColeta) / 86400000);
        if (diasColeta >= dados.dias) return '';
        return `<div class="rf-aviso"><i class="fas fa-hourglass-half"></i> O monitoramento começou há ${diasColeta} dia(s).
            Os alertas de <strong>sem uso</strong> só aparecem para o que já existe há pelo menos ${dados.dias} dias —
            até lá o sistema vai conhecendo cada botão conforme a equipe navega.</div>`;
    }

    function htmlGeral() {
        const semUsoPorTela = agrupar(calc.semUso, c => c.tela || 'Outros');
        const telasSemUso = calc.semUso.filter(c => c.tipo === 'tela');
        const topSemUso = [...semUsoPorTela.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 8);
        const errosPorFunc = agrupar(calc.errosSistemaAbertos, e => `${e.tela || 'Outros'} › ${e.rotulo || 'sem clique'}`);
        const topErros = [...errosPorFunc.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 8);
        const pend = dados.pendencias.filter(p => p.itens.length);

        const bloco = (titulo, corpo, aba) => `
            <div style="margin-bottom:18px;">
                <div class="d-flex justify-content-between align-items-center"><h5 style="margin:0 0 8px;">${titulo}</h5>
                ${aba ? `<button type="button" class="btn btn-sm btn-link" data-rf-aba="${aba}">ver tudo →</button>` : ''}</div>
                ${corpo}
            </div>`;

        return avisoColetaCurta() +
            bloco('<i class="fas fa-door-closed"></i> Telas que ninguém abriu', telasSemUso.length
                ? `<ul>${telasSemUso.map(t => `<li><strong>${esc(t.rotulo)}</strong> — última vez ${haQuanto(t.ultimo_uso)}${t.ultimo_uso_por ? ` (${esc(nomeUsuario(t.ultimo_uso_por))})` : ''}</li>`).join('')}</ul>`
                : '<div class="text-muted">Todas as telas foram abertas no período. 👍</div>', 'sem_uso') +
            bloco('<i class="fas fa-eye-slash"></i> Onde mais tem coisa sem uso', topSemUso.length
                ? tabela(['Tela', 'Sem uso'], topSemUso.map(([t, l]) => [esc(t), `<strong>${l.length}</strong>`]))
                : '<div class="text-muted">Nada sem uso no período.</div>', 'sem_uso') +
            bloco('<i class="fas fa-bug"></i> Funcionalidades com erro', topErros.length
                ? tabela(['Onde', 'Erros', 'Último'], topErros.map(([k, l]) => [esc(k), `<strong>${l.length}</strong>`, `${fmtDataHora(l[0].criado_em)} · ${esc(nomeUsuario(l[0].usuario))}<div class="rf-detalhe">${esc(l[0].mensagem)}</div>`]))
                : '<div class="text-muted">Nenhum erro do sistema no período. 👍</div>', 'erros') +
            bloco('<i class="fas fa-clock"></i> Pendências paradas', pend.length
                ? tabela(['Onde', 'Atrasadas', 'Mais antiga'], pend.map(p => [esc(p.fonte.nome), `<strong>${p.itens.length}</strong>`, `${esc(p.itens[0].identificacao)} · ${p.itens[0].dias} dias`]))
                : '<div class="text-muted">Nada parado além do prazo. 👍</div>', 'pendencias');
    }

    function agrupar(lista, chaveFn) {
        const m = new Map();
        lista.forEach(i => { const k = chaveFn(i); if (!m.has(k)) m.set(k, []); m.get(k).push(i); });
        return m;
    }

    function tabela(cabecalho, linhas) {
        return `<div class="table-responsive"><table class="table table-hover table-sm">
            <thead><tr>${cabecalho.map(c => `<th>${c}</th>`).join('')}</tr></thead>
            <tbody>${linhas.map(l => `<tr>${l.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody>
        </table></div>`;
    }

    function htmlSemUso() {
        const base = estado.mostrarIgnorados ? calc.ativos.filter(c => c.ignorado) : calc.semUso;
        const telas = [...new Set(base.map(c => c.tela || 'Outros'))].sort();
        const lista = estado.filtroTela ? base.filter(c => (c.tela || 'Outros') === estado.filtroTela) : base;
        const grupos = [...agrupar(lista, c => c.tela || 'Outros').entries()].sort((a, b) => b[1].length - a[1].length);
        const totalPorTela = agrupar(calc.ativos.filter(c => !c.ignorado), c => c.tela || 'Outros');

        const filtros = `
            <div class="rf-filtros">
                <select id="rfFiltroTela" class="form-control form-control-sm" style="width:auto; min-width:220px;">
                    <option value="">Todas as telas</option>
                    ${telas.map(t => `<option value="${esc(t)}" ${t === estado.filtroTela ? 'selected' : ''}>${esc(t)}</option>`).join('')}
                </select>
                <label><input type="checkbox" id="rfMostrarIgnorados" ${estado.mostrarIgnorados ? 'checked' : ''}> Ver os que marquei para ignorar</label>
            </div>
            <div class="text-muted" style="font-size:13px; margin-bottom:10px;">
                ${estado.mostrarIgnorados
                    ? 'Itens que você pediu para não monitorar.'
                    : `Existem há pelo menos ${dados.dias} dias e ninguém usou nesse período. Se for algo de uso raro de propósito (ex.: "Excluir"), clique em <strong>Ignorar</strong>.`}
            </div>`;

        if (!grupos.length) return avisoColetaCurta() + filtros + `<div class="rf-vazio">${estado.mostrarIgnorados ? 'Nenhum item ignorado.' : 'Tudo foi usado no período. 👍'}</div>`;

        return avisoColetaCurta() + filtros + grupos.map(([tela, itens]) => `
            <details class="rf-grupo" ${grupos.length <= 3 ? 'open' : ''}>
                <summary>${esc(tela)} — <span style="color:#c62828;">${itens.length}</span> de ${(totalPorTela.get(tela) || []).length} sem uso</summary>
                ${tabela(['Tipo', 'Funcionalidade', 'Último uso', 'Existe desde', ''], itens
                    .sort((a, b) => (a.tipo === 'tela' ? -1 : 0) - (b.tipo === 'tela' ? -1 : 0) || String(a.rotulo).localeCompare(String(b.rotulo)))
                    .map(c => [
                        ROTULO_TIPO[c.tipo] || esc(c.tipo),
                        `<strong>${esc(c.rotulo)}</strong>`,
                        c.ultimo_uso ? `${fmtData(c.ultimo_uso)} · ${esc(nomeUsuario(c.ultimo_uso_por))}` : '<span style="color:#c62828;">nunca usado</span>',
                        fmtData(c.primeiro_visto),
                        c.ignorado
                            ? `<button type="button" class="btn btn-sm btn-outline-primary" data-rf-ignorar="${esc(c.chave)}" data-valor="0">Voltar a monitorar</button>`
                            : `<button type="button" class="btn btn-sm btn-outline-secondary" data-rf-ignorar="${esc(c.chave)}" data-valor="1">Ignorar</button>`
                    ]))}
            </details>`).join('');
    }

    function htmlErros() {
        const corte = calc.corte;
        let lista = dados.erros.filter(e => new Date(e.criado_em).getTime() >= corte);
        if (!estado.errosTodos) lista = lista.filter(e => e.provavel_sistema);
        if (!estado.errosResolvidos) lista = lista.filter(e => !e.resolvido);

        const filtros = `
            <div class="rf-filtros">
                <label><input type="checkbox" id="rfErrosTodos" ${estado.errosTodos ? 'checked' : ''}> Incluir avisos de validação (ex.: "preencha o campo")</label>
                <label><input type="checkbox" id="rfErrosResolvidos" ${estado.errosResolvidos ? 'checked' : ''}> Mostrar resolvidos</label>
            </div>
            <div class="text-muted" style="font-size:13px; margin-bottom:10px;">
                Erros nos últimos ${dados.dias} dias. "Botão clicado" é o que a pessoa clicou até 10 s antes do erro.
            </div>`;
        if (!lista.length) return filtros + '<div class="rf-vazio">Nenhum erro no período. 👍</div>';

        const ORIGEM = { js: 'Erro no código', promessa: 'Erro no código', toast: 'Aviso de erro na tela', console: 'Erro registrado', rede: 'Falha de comunicação' };
        return filtros + tabela(['Quando', 'Quem', 'Tela', 'Botão clicado', 'Erro', ''], lista.map(e => [
            fmtDataHora(e.criado_em),
            esc(nomeUsuario(e.usuario)),
            esc(e.tela || '—'),
            e.rotulo ? `<strong>${esc(e.rotulo)}</strong>` : '<span class="text-muted">— (sem clique)</span>',
            `<span class="text-muted" style="font-size:12px;">${ORIGEM[e.tipo_erro] || esc(e.tipo_erro)}${e.provavel_sistema ? '' : ' · validação'}</span><br>${esc(e.mensagem)}
             ${e.detalhe ? `<details><summary style="font-size:12px; cursor:pointer;">detalhes técnicos</summary><div class="rf-detalhe">${esc(e.detalhe)}</div></details>` : ''}`,
            e.resolvido
                ? `<span class="text-muted" style="font-size:12px;">resolvido por ${esc(nomeUsuario(e.resolvido_por))}</span>`
                : `<button type="button" class="btn btn-sm btn-outline-success" data-rf-resolver="${e.id}">Resolvido</button>`
        ]));
    }

    function htmlPendencias() {
        return `<div class="text-muted" style="font-size:13px; margin-bottom:10px;">
                Itens que estão no mesmo status há mais tempo que o prazo. Ajuste o prazo de cada tipo no campo "dias".
            </div>` + dados.pendencias.map(p => {
            const f = p.fonte;
            const prazo = dados.config.prazos[f.id] || f.dias;
            const cab = `
                <summary>
                    ${esc(f.nome)} — ${p.desligada ? '<span class="text-muted">desligado</span>' : p.erro ? '<span class="text-muted">não foi possível ler</span>' : `<span style="color:${p.itens.length ? '#c62828' : '#2e7d32'};">${p.itens.length} atrasada(s)</span>`}
                    <span class="text-muted" style="font-weight:400; font-size:13px;"> · prazo ${prazo} dias</span>
                </summary>
                <div class="rf-filtros" style="padding:8px 14px 0;">
                    <label>Avisar quando parado há mais de
                        <input type="number" min="1" max="365" value="${prazo}" data-rf-prazo="${f.id}" class="form-control form-control-sm" style="width:70px;"> dias</label>
                    <label><input type="checkbox" data-rf-fonte="${f.id}" ${p.desligada ? '' : 'checked'}> monitorar</label>
                </div>`;
            if (p.desligada) return `<details class="rf-grupo">${cab}</details>`;
            if (p.erro) return `<details class="rf-grupo">${cab}<div class="rf-vazio">${esc(p.erro)}</div></details>`;
            if (!p.itens.length) return `<details class="rf-grupo">${cab}<div class="rf-vazio">Nada parado além de ${prazo} dias. 👍</div></details>`;
            return `<details class="rf-grupo" open>${cab}
                ${tabela(['Identificação', 'Status', 'Responsável', 'Criado em', 'Parado há'], p.itens.slice(0, 100).map(i => [
                    `<strong>${esc(i.identificacao)}</strong>`,
                    esc(String(i.status || '').replace(/_/g, ' ')),
                    esc(i.responsavel || '—'),
                    fmtData(i.data),
                    `<strong style="color:${i.dias >= prazo * 2 ? '#c62828' : '#e65100'};">${i.dias} dias</strong>`
                ]))}
                ${p.itens.length > 100 ? `<div class="text-muted" style="padding:8px 14px;">+${p.itens.length - 100} itens</div>` : ''}
                ${f.abrir ? `<div style="padding:8px 14px;"><button type="button" class="btn btn-sm btn-primary" data-rf-abrir="${f.abrir}">Abrir ${esc(f.nome.split(' ')[0])}</button></div>` : ''}
            </details>`;
        }).join('');
    }

    function htmlEquipe() {
        const porChave = new Map(dados.catalogo.map(c => [c.chave, c]));
        const porPessoa = new Map();
        dados.usos.forEach(u => {
            const p = porPessoa.get(u.usuario) || { usuario: u.usuario, acoes: 0, telas: new Set(), funcs: new Set(), downloads: 0, ultimo: null, erros: 0 };
            const c = porChave.get(u.chave);
            p.acoes += Number(u.qtd || 0);
            p.funcs.add(u.chave);
            if (c && c.tipo === 'tela') p.telas.add(c.rotulo);
            if (c && c.tipo === 'download') p.downloads += Number(u.qtd || 0);
            if (!p.ultimo || u.ultimo_em > p.ultimo) p.ultimo = u.ultimo_em;
            porPessoa.set(u.usuario, p);
        });
        calc.errosSistemaAbertos.forEach(e => { const p = porPessoa.get(e.usuario); if (p) p.erros++; });
        const pessoas = [...porPessoa.values()].sort((a, b) => b.acoes - a.acoes);
        const max = Math.max(1, ...pessoas.map(p => p.acoes));

        const porTela = new Map();
        dados.usos.forEach(u => {
            const c = porChave.get(u.chave);
            const t = (c && c.tela) || 'Outros';
            const x = porTela.get(t) || { tela: t, acoes: 0, pessoas: new Set() };
            x.acoes += Number(u.qtd || 0);
            x.pessoas.add(u.usuario);
            porTela.set(t, x);
        });
        const telas = [...porTela.values()].sort((a, b) => b.acoes - a.acoes);
        const maxT = Math.max(1, ...telas.map(t => t.acoes));

        if (!pessoas.length) return '<div class="rf-vazio">Ainda não há uso registrado no período.</div>';
        return `<h5>Por pessoa (últimos ${dados.dias} dias)</h5>` +
            tabela(['Pessoa', 'Ações', '', 'Telas usadas', 'Funcionalidades diferentes', 'Downloads', 'Erros', 'Última atividade'], pessoas.map(p => [
                `<strong>${esc(nomeUsuario(p.usuario))}</strong>`,
                p.acoes.toLocaleString('pt-BR'),
                `<div class="rf-barra" style="width:${Math.round(p.acoes / max * 120)}px"></div>`,
                `<span title="${esc([...p.telas].join(', '))}">${p.telas.size}</span>`,
                p.funcs.size,
                p.downloads,
                p.erros ? `<span style="color:#c62828;">${p.erros}</span>` : '0',
                fmtDataHora(p.ultimo)
            ])) +
            `<h5 style="margin-top:18px;">Por tela</h5>` +
            tabela(['Tela', 'Ações', '', 'Quem usou'], telas.map(t => [
                esc(t.tela),
                t.acoes.toLocaleString('pt-BR'),
                `<div class="rf-barra" style="width:${Math.round(t.acoes / maxT * 120)}px"></div>`,
                esc([...t.pessoas].map(nomeUsuario).join(', '))
            ]));
    }

    function htmlCatalogo() {
        const termo = estado.buscaCatalogo.trim().toLowerCase();
        let lista = calc.ativos;
        if (termo) lista = lista.filter(c => `${c.tela} ${c.rotulo} ${c.tipo}`.toLowerCase().includes(termo));
        lista = [...lista].sort((a, b) => String(a.tela).localeCompare(String(b.tela)) || String(a.rotulo).localeCompare(String(b.rotulo)));
        const mostrar = lista.slice(0, 500);
        return `
            <div class="rf-filtros">
                <input type="text" id="rfBuscaCatalogo" class="form-control form-control-sm" style="max-width:360px;" placeholder="🔍 Buscar tela ou funcionalidade..." value="${esc(estado.buscaCatalogo)}">
                <span class="text-muted" style="font-size:13px;">${lista.length} funcionalidade(s)${lista.length > 500 ? ' — mostrando 500' : ''}</span>
            </div>` +
            tabela(['Tela', 'Tipo', 'Funcionalidade', `Usos (${dados.dias}d)`, 'Total', 'Último uso', 'Situação'], mostrar.map(c => {
                const n = calc.usosPorChave.get(c.chave) || 0;
                const semUso = calc.semUso.includes(c);
                return [
                    esc(c.tela),
                    ROTULO_TIPO[c.tipo] || esc(c.tipo),
                    esc(c.rotulo),
                    n ? `<strong>${n}</strong>` : '0',
                    Number(c.total_usos || 0).toLocaleString('pt-BR'),
                    c.ultimo_uso ? `${fmtData(c.ultimo_uso)} · ${esc(nomeUsuario(c.ultimo_uso_por))}` : 'nunca',
                    c.ignorado ? '<span class="text-muted">ignorado</span>' : semUso ? '<span style="color:#c62828;">sem uso</span>' : '<span style="color:#2e7d32;">ok</span>'
                ];
            }));
    }

    // ============================================================
    // PAINEL — ações
    // ============================================================

    async function aoClicarNoPainel(e) {
        const b = e.target.closest('button, [data-rf-aba]');
        if (!b) return;
        if (b.dataset.rfAba) { estado.aba = b.dataset.rfAba; render(); return; }
        if (b.dataset.rf === 'voltar') { window.voltarParaMenu && window.voltarParaMenu(); return; }
        if (b.dataset.rf === 'atualizar') { carregarERenderizar(); return; }
        if (b.dataset.rf === 'exportar') { exportarExcel(); return; }
        if (b.dataset.rfAbrir) {
            const fn = window[b.dataset.rfAbrir];
            if (typeof fn === 'function') fn(); else toast('Não achei esse módulo.', 'warning');
            return;
        }
        if (b.dataset.rfIgnorar) {
            const ignorar = b.dataset.valor === '1';
            const { error } = await sb().from('func_catalogo').update({
                ignorado: ignorar,
                ignorado_por: ignorar ? usuario() : null,
                ignorado_em: ignorar ? new Date().toISOString() : null
            }).eq('chave', b.dataset.rfIgnorar);
            if (error) { toast('❌ Não foi possível salvar: ' + error.message, 'error'); return; }
            const item = dados.catalogo.find(c => c.chave === b.dataset.rfIgnorar);
            if (item) item.ignorado = ignorar;
            render();
            return;
        }
        if (b.dataset.rfResolver) {
            const id = Number(b.dataset.rfResolver);
            const { error } = await sb().from('func_erros').update({
                resolvido: true, resolvido_por: usuario(), resolvido_em: new Date().toISOString()
            }).eq('id', id);
            if (error) { toast('❌ Não foi possível salvar: ' + error.message, 'error'); return; }
            const item = dados.erros.find(x => x.id === id);
            if (item) { item.resolvido = true; item.resolvido_por = usuario(); }
            render();
        }
    }

    async function aoMudarNoPainel(e) {
        const el = e.target;
        if (el.id === 'rfDias') {
            dados.config.dias_sem_uso = Number(el.value) || 7;
            await salvarConfig();
            carregarERenderizar();
            return;
        }
        if (el.id === 'rfFiltroTela') { estado.filtroTela = el.value; renderConteudo(); return; }
        if (el.id === 'rfMostrarIgnorados') { estado.mostrarIgnorados = el.checked; estado.filtroTela = ''; renderConteudo(); return; }
        if (el.id === 'rfErrosTodos') { estado.errosTodos = el.checked; renderConteudo(); return; }
        if (el.id === 'rfErrosResolvidos') { estado.errosResolvidos = el.checked; renderConteudo(); return; }
        if (el.dataset.rfPrazo) {
            dados.config.prazos[el.dataset.rfPrazo] = Math.max(1, Number(el.value) || 1);
            await salvarConfig();
            carregarERenderizar();
            return;
        }
        if (el.dataset.rfFonte) {
            const lista = new Set(dados.config.fontes_desligadas || []);
            if (el.checked) lista.delete(el.dataset.rfFonte); else lista.add(el.dataset.rfFonte);
            dados.config.fontes_desligadas = [...lista];
            await salvarConfig();
            carregarERenderizar();
        }
    }

    async function carregarERenderizar() {
        if (estado.carregando) return;
        estado.carregando = true;
        const alvo = document.getElementById('rfConteudo');
        if (alvo && !dados) alvo.innerHTML = '<div class="rf-vazio"><div class="spinner"></div> Carregando...</div>';
        try {
            await enviar();   // inclui o que acabou de acontecer neste navegador
            dados = await carregarTudo();
            render();
        } catch (err) {
            if (alvo) {
                alvo.innerHTML = erroDeTabela(err)
                    ? '<div class="rf-vazio" style="color:#c62828;">As tabelas do Registro de Funcionalidades ainda não existem. Rode o arquivo <strong>registro_funcionalidades.sql</strong> no Supabase (SQL Editor).</div>'
                    : `<div class="rf-vazio" style="color:#c62828;">Erro ao carregar: ${esc(err.message || err)}</div>`;
            }
        } finally {
            estado.carregando = false;
        }
    }

    function exportarExcel() {
        if (!dados || typeof XLSX === 'undefined') return;
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(calc.semUso.map(c => ({
            Tela: c.tela, Tipo: c.tipo, Funcionalidade: c.rotulo,
            'Último uso': c.ultimo_uso ? fmtDataHora(c.ultimo_uso) : 'nunca',
            'Usado por': c.ultimo_uso_por ? nomeUsuario(c.ultimo_uso_por) : '',
            'Existe desde': fmtData(c.primeiro_visto)
        }))), 'Sem uso');
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dados.erros.map(e => ({
            Quando: fmtDataHora(e.criado_em), Quem: nomeUsuario(e.usuario), Tela: e.tela,
            'Botão clicado': e.rotulo || '', Erro: e.mensagem, Tipo: e.tipo_erro,
            'Erro do sistema': e.provavel_sistema ? 'sim' : 'provável validação',
            Resolvido: e.resolvido ? 'sim' : 'não'
        }))), 'Erros');
        const pend = [];
        dados.pendencias.forEach(p => p.itens.forEach(i => pend.push({
            Onde: p.fonte.nome, Identificação: i.identificacao, Status: i.status,
            Responsável: i.responsavel || '', 'Criado em': fmtData(i.data), 'Dias parado': i.dias
        })));
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(pend), 'Pendências');
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(calc.ativos.map(c => ({
            Tela: c.tela, Tipo: c.tipo, Funcionalidade: c.rotulo,
            [`Usos (${dados.dias} dias)`]: calc.usosPorChave.get(c.chave) || 0,
            'Total de usos': Number(c.total_usos || 0),
            'Último uso': c.ultimo_uso ? fmtDataHora(c.ultimo_uso) : 'nunca',
            Ignorado: c.ignorado ? 'sim' : 'não'
        }))), 'Todas');
        XLSX.writeFile(wb, `registro_funcionalidades_${diaLocal()}.xlsx`);
    }

    // ============================================================
    // PAINEL — abrir, menu e aviso ao entrar
    // ============================================================

    window.abrirRegistroFuncionalidades = async function () {
        if (!ehAdmin()) {
            toast('🔒 Só Andressa e Ronald acessam o Registro de Funcionalidades.', 'warning');
            return;
        }
        const tela = montarTela();
        if (typeof window.esconderTodosOsSistemas === 'function') window.esconderTodosOsSistemas(ID_TELA);
        document.getElementById('menuSystem')?.classList.add('hidden');
        tela.classList.remove('hidden');
        window.scrollTo(0, 0);
        await carregarERenderizar();
    };

    function atualizarBadgeMenu(n) {
        document.querySelectorAll('[data-menu-visual-key="registro_funcionalidades"]').forEach(b => {
            let badge = b.querySelector('.rf-badge-menu');
            if (!n) { if (badge) badge.remove(); return; }
            if (!badge) { badge = document.createElement('span'); badge.className = 'rf-badge-menu'; b.appendChild(badge); }
            badge.textContent = n > 99 ? '99+' : String(n);
            b.title = `${n} alerta(s) no Registro de Funcionalidades`;
        });
    }
    let ultimoBadge = 0;

    function garantirBotoesMenu() {
        document.querySelectorAll('.wt-module-nav').forEach(nav => {
            const existente = nav.querySelector('[data-menu-visual-key="registro_funcionalidades"]');
            if (!ehAdmin()) { if (existente) existente.remove(); return; }
            if (existente) return;
            const ancora = nav.querySelector('[data-menu-visual-key="historico_de_acessos"]');
            if (!ancora) return;
            const b = document.createElement('button');
            b.className = 'wt-nav-item';
            b.type = 'button';
            b.setAttribute('data-menu-visual-key', 'registro_funcionalidades');
            b.innerHTML = '<i class="fas fa-clipboard-check"></i><span>Registro de Funcionalidades</span>';
            b.addEventListener('click', () => window.abrirRegistroFuncionalidades());
            ancora.insertAdjacentElement('afterend', b);
            if (ultimoBadge) atualizarBadgeMenu(ultimoBadge);
        });
    }

    async function verificarAlertasAoEntrar() {
        if (!ehAdmin() || desativado || !sb()) return;
        try {
            await enviar();
            const d = await carregarTudo();
            const c = calcular(d);
            const n = totalAlertas(d, c);
            ultimoBadge = n;
            atualizarBadgeMenu(n);
            if (!dados) dados = d;
            const hoje = diaLocal();
            if (n && lerLocal(CHAVE_AVISO_DIA, '') !== hoje) {
                gravarLocal(CHAVE_AVISO_DIA, hoje);
                const partes = [];
                if (c.semUso.length) partes.push(`${c.semUso.length} sem uso`);
                if (c.errosSistemaAbertos.length) partes.push(`${c.errosSistemaAbertos.length} erro(s)`);
                if (c.pendenciasAtrasadas) partes.push(`${c.pendenciasAtrasadas} pendência(s) parada(s)`);
                toast(`📋 Registro de Funcionalidades: ${partes.join(' · ')}`, 'warning');
            }
        } catch (_) { /* tabelas ainda não criadas — sem aviso */ }
    }

    setInterval(() => { if (window.currentUser) garantirBotoesMenu(); }, 1500);
})();
