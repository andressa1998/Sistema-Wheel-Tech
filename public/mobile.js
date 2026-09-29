// ============================================================
// VERSÃO MOBILE — complemento do mobile.css
// ============================================================
// Só age em telas de até 768px. Faz o que CSS sozinho não
// consegue, em TODAS as telas (inclusive as criadas via JS):
//   - barra superior com ☰ (abre o menu lateral como gaveta),
//     título da tela aberta e botão de voltar ao início;
//   - larguras fixas maiores que a tela (ex.: width: 900px)
//     passam a caber no celular;
//   - grades com muitas colunas passam a quebrar linha;
//   - tabelas ganham rolagem lateral no próprio bloco;
//   - telas "position: fixed" começam abaixo da barra.
// Ao voltar para tela grande, tudo o que foi alterado é desfeito.
// ============================================================
(function instalarVersaoMobile() {
    'use strict';

    const MQ = window.matchMedia('(max-width: 768px)');
    const ALTURA_BARRA = 54;
    const html = document.documentElement;

    // el -> { propriedade: [valorAnterior, prioridadeAnterior] }
    const alterados = new Map();
    let barra = null;
    let tituloBarra = null;
    let fundo = null;
    let agendado = null;
    let observador = null;

    // ---------- utilitários ----------
    function definir(el, prop, valor) {
        let reg = alterados.get(el);
        if (!reg) { reg = {}; alterados.set(el, reg); }
        if (!(prop in reg)) reg[prop] = [el.style.getPropertyValue(prop), el.style.getPropertyPriority(prop)];
        if (el.style.getPropertyValue(prop) !== valor || el.style.getPropertyPriority(prop) !== 'important') {
            el.style.setProperty(prop, valor, 'important');
        }
    }

    function restaurarTudo() {
        alterados.forEach((reg, el) => {
            Object.keys(reg).forEach(prop => {
                const [valor, prioridade] = reg[prop];
                if (valor) el.style.setProperty(prop, valor, prioridade);
                else el.style.removeProperty(prop);
            });
        });
        alterados.clear();
    }

    function limparDesconectados() {
        alterados.forEach((_, el) => { if (!el.isConnected) alterados.delete(el); });
    }

    function visivel(el) {
        return !!el && el.getClientRects().length > 0;
    }

    function larguraTela() {
        return window.innerWidth || html.clientWidth;
    }

    // ---------- barra superior + gaveta ----------
    function criarBarra() {
        if (barra) return;
        barra = document.createElement('div');
        barra.id = 'wtMobileBar';
        barra.innerHTML =
            '<button type="button" class="wt-m-btn" id="wtMobileMenuBtn" aria-label="Abrir menu"><i class="fas fa-bars"></i></button>' +
            '<div class="wt-m-title">Wheel Tech</div>' +
            '<button type="button" class="wt-m-btn" id="wtMobileHomeBtn" aria-label="Voltar ao início"><i class="fas fa-house"></i></button>';
        tituloBarra = barra.querySelector('.wt-m-title');

        fundo = document.createElement('div');
        fundo.id = 'wtMobileBackdrop';

        document.body.appendChild(barra);
        document.body.appendChild(fundo);

        barra.querySelector('#wtMobileMenuBtn').addEventListener('click', alternarGaveta);
        barra.querySelector('#wtMobileHomeBtn').addEventListener('click', () => {
            fecharGaveta();
            if (typeof window.voltarParaMenu === 'function') window.voltarParaMenu();
        });
        fundo.addEventListener('click', fecharGaveta);

        // Tocar num item do menu abre o módulo e fecha a gaveta
        document.addEventListener('click', (e) => {
            if (!html.classList.contains('wt-m-drawer-open')) return;
            if (e.target.closest('.wt-pin-btn')) return;
            if (e.target.closest('#wtGlobalSidebar .wt-nav-item, #menuSystem > .wt-sidebar .wt-nav-item, .wt-logout')) {
                fecharGaveta();
            }
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') fecharGaveta();
        });
    }

    function alternarGaveta() {
        const abrir = !html.classList.contains('wt-m-drawer-open');
        html.classList.toggle('wt-m-drawer-open', abrir);
        const botao = document.getElementById('wtMobileMenuBtn');
        if (botao) botao.setAttribute('aria-label', abrir ? 'Fechar menu' : 'Abrir menu');
    }

    function fecharGaveta() {
        html.classList.remove('wt-m-drawer-open');
        const botao = document.getElementById('wtMobileMenuBtn');
        if (botao) botao.setAttribute('aria-label', 'Abrir menu');
    }

    function usuarioLogado() {
        const login = document.getElementById('loginScreen');
        if (!login) return true;
        if (login.classList.contains('hidden')) return true;
        return getComputedStyle(login).display === 'none';
    }

    // Tela principal aberta (menu ou um dos módulos)
    function telaAberta() {
        const menu = document.getElementById('menuSystem');
        if (visivel(menu)) return menu;
        const candidatas = document.querySelectorAll('[id$="System"], [id$="Screen"]');
        for (const el of candidatas) {
            if (el.id === 'loginScreen' || el.classList.contains('modal')) continue;
            if (el.parentElement && el.parentElement.closest('[id$="System"]')) continue;
            if (visivel(el)) return el;
        }
        return null;
    }

    function atualizarTitulo(tela) {
        if (!tituloBarra) return;
        let texto = 'Wheel Tech';
        if (tela && tela.id === 'menuSystem') {
            texto = 'Início';
        } else if (tela) {
            const t = tela.querySelector('.main-header h1, .main-header .header-title, h1, h2');
            if (t && t.textContent.trim()) texto = t.textContent.replace(/\s+/g, ' ').trim();
        }
        if (tituloBarra.textContent !== texto) tituloBarra.textContent = texto;
        html.classList.toggle('wt-m-no-home', !tela || tela.id === 'menuSystem');
    }

    // Cabeçalhos que só tinham logo + título somem (o título já está na barra)
    function marcarCabecalhosVazios() {
        document.querySelectorAll('.main-header').forEach(header => {
            const titulos = header.querySelectorAll('h1, .header-title');
            let textoTitulos = 0;
            titulos.forEach(t => { textoTitulos += t.textContent.replace(/\s+/g, '').length; });
            const textoTotal = header.textContent.replace(/\s+/g, '').length;
            const temControles = Array.from(
                header.querySelectorAll('button, input, select, textarea, a, canvas, .user-info, .badge')
            ).some(el => !el.closest('h1, .header-title'));
            header.classList.toggle('wt-m-vazio', !temControles && textoTotal <= textoTitulos);
        });
    }

    // ---------- correções de layout ----------
    // Larguras fixas (inline) maiores que a tela
    function ajustarLarguras() {
        const limite = larguraTela() - 24;
        document.querySelectorAll('[style*="width"]').forEach(el => {
            if (/^(TABLE|THEAD|TBODY|TR|TH|TD|COL|COLGROUP|CANVAS|IMG|SVG|VIDEO|IFRAME)$/i.test(el.tagName)) return;
            if (el.closest('#wtMobileBar, #wtGlobalSidebar, #menuSystem > .wt-sidebar, td, th')) return;

            const w = el.style.width;
            const minW = el.style.minWidth;

            if (minW.endsWith('px') && parseFloat(minW) > limite) {
                definir(el, 'min-width', '0px');
            }

            if (w.endsWith('px') && parseFloat(w) > limite) {
                const posicao = el.style.position || '';
                if (posicao === 'fixed' || posicao === 'absolute') {
                    definir(el, 'width', 'calc(100vw - 16px)');
                    definir(el, 'max-width', 'calc(100vw - 16px)');
                    definir(el, 'left', '8px');
                    definir(el, 'right', 'auto');
                    const t = el.style.transform || '';
                    if (/translate\(\s*-50%\s*,\s*-50%\s*\)/.test(t)) definir(el, 'transform', 'translateY(-50%)');
                    else if (/translateX\(\s*-50%\s*\)|translate\(\s*-50%\s*\)/.test(t)) definir(el, 'transform', 'none');
                } else {
                    definir(el, 'width', '100%');
                    definir(el, 'max-width', '100%');
                }
            }
        });
    }

    // Conta as colunas de um grid-template-columns (repeat(n, ...) conta n)
    function analisarColunas(valor) {
        let nivel = 0, atual = '';
        const partes = [];
        for (const c of valor) {
            if (c === '(') nivel++;
            if (c === ')') nivel--;
            if (c === ' ' && nivel === 0) { if (atual) partes.push(atual); atual = ''; }
            else atual += c;
        }
        if (atual) partes.push(atual);

        let colunas = 0, pxFixos = 0, auto = false, minAuto = 0;
        partes.forEach(p => {
            const rep = p.match(/^repeat\(\s*([^,]+)\s*,(.*)\)$/);
            if (rep) {
                if (/auto-(fit|fill)/.test(rep[1])) {
                    auto = true;
                    const m = rep[2].match(/minmax\(\s*(\d+(?:\.\d+)?)px/);
                    if (m) minAuto = parseFloat(m[1]);
                    return;
                }
                const n = parseInt(rep[1], 10) || 1;
                colunas += n;
                const px = rep[2].trim().match(/^(\d+(?:\.\d+)?)px$/);
                if (px) pxFixos += n * parseFloat(px[1]);
                const mm = rep[2].match(/minmax\(\s*(\d+(?:\.\d+)?)px/);
                if (mm) pxFixos += n * parseFloat(mm[1]);
                return;
            }
            colunas++;
            const px = p.match(/^(\d+(?:\.\d+)?)px$/);
            if (px) pxFixos += parseFloat(px[1]);
            const mm = p.match(/^minmax\(\s*(\d+(?:\.\d+)?)px/);
            if (mm) pxFixos += parseFloat(mm[1]);
        });
        return { colunas, pxFixos, auto, minAuto };
    }

    function ajustarGrades() {
        const largura = larguraTela() - 32;
        document.querySelectorAll('[style*="grid-template-columns"]').forEach(el => {
            if (el.closest('#wtMobileBar, #wtGlobalSidebar, #menuSystem')) return;
            const reg = alterados.get(el);
            const original = reg && 'grid-template-columns' in reg
                ? reg['grid-template-columns'][0]
                : el.style.gridTemplateColumns;
            if (!original) return;

            const info = analisarColunas(original.trim());
            let novo = null;

            if (info.auto) {
                if (info.minAuto > largura) novo = '1fr';
            } else if (info.colunas === 7) {
                return; // calendários semanais: mantém as 7 colunas
            } else if (info.pxFixos > largura) {
                novo = /fr/.test(original) ? 'repeat(auto-fit, minmax(140px, 1fr))' : '1fr';
            } else if (info.colunas >= 3 && info.pxFixos === 0) {
                novo = 'repeat(auto-fit, minmax(140px, 1fr))';
            }

            if (novo) definir(el, 'grid-template-columns', novo);
        });
    }

    // Cada tabela precisa de um "pai" que role para o lado
    function ajustarTabelas() {
        document.querySelectorAll('table').forEach(tabela => {
            if (tabela.dataset.wtMTabela === '1') return;
            const pai = tabela.parentElement;
            if (!pai || /^(TD|TH)$/.test(pai.tagName)) return;

            let el = pai, jaRola = false;
            for (let i = 0; i < 3 && el && el !== document.body; i++, el = el.parentElement) {
                const ox = getComputedStyle(el).overflowX;
                if (ox === 'auto' || ox === 'scroll') { jaRola = true; break; }
            }
            if (!jaRola) {
                definir(pai, 'overflow-x', 'auto');
                definir(pai, 'max-width', '100%');
                pai.style.webkitOverflowScrolling = 'touch';
            }
            tabela.dataset.wtMTabela = '1';
        });
    }

    // Telas fixas em tela cheia (ex.: NF-e) começam abaixo da barra
    function ajustarTelasFixas() {
        document.querySelectorAll('[id$="System"], [id$="Screen"]').forEach(el => {
            if (el.id === 'loginScreen' || el.id === 'menuSystem') return;
            if (el.classList.contains('modal')) return;
            if (!visivel(el)) return;
            const cs = getComputedStyle(el);
            if (cs.position !== 'fixed') return;
            if (parseFloat(cs.top) < ALTURA_BARRA) {
                definir(el, 'top', ALTURA_BARRA + 'px');
                definir(el, 'bottom', '0px');
                definir(el, 'height', 'auto');
                definir(el, 'padding', '12px 10px');
            }
        });
    }

    // ---------- ciclo ----------
    function aplicar() {
        agendado = null;
        if (!MQ.matches) return;

        const logado = usuarioLogado();
        html.classList.toggle('wt-m-app', logado);
        if (!logado) fecharGaveta();

        try {
            if (logado) {
                const tela = telaAberta();
                atualizarTitulo(tela);
                marcarCabecalhosVazios();
                ajustarTelasFixas();
            }
            ajustarLarguras();
            ajustarGrades();
            ajustarTabelas();
            limparDesconectados();
        } catch (erro) {
            console.warn('[mobile] ajuste de layout falhou:', erro);
        }
    }

    function agendar() {
        if (agendado || !MQ.matches) return;
        agendado = setTimeout(() => requestAnimationFrame(aplicar), 150);
    }

    function ligar() {
        html.classList.add('wt-mobile');
        criarBarra();
        if (!observador) {
            observador = new MutationObserver(agendar);
            observador.observe(document.body, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['class', 'hidden']
            });
        }
        aplicar();
    }

    function desligar() {
        if (observador) { observador.disconnect(); observador = null; }
        if (agendado) { clearTimeout(agendado); agendado = null; }
        fecharGaveta();
        html.classList.remove('wt-mobile', 'wt-m-app', 'wt-m-no-home');
        document.querySelectorAll('[data-wt-m-tabela]').forEach(t => delete t.dataset.wtMTabela);
        document.querySelectorAll('.main-header.wt-m-vazio').forEach(h => h.classList.remove('wt-m-vazio'));
        restaurarTudo();
    }

    function sincronizarModo() {
        if (MQ.matches) ligar(); else desligar();
    }

    function iniciar() {
        sincronizarModo();
        if (MQ.addEventListener) MQ.addEventListener('change', sincronizarModo);
        else if (MQ.addListener) MQ.addListener(sincronizarModo);

        // Telas abertas via style.display não disparam o observador
        document.addEventListener('click', agendar, true);
        window.addEventListener('orientationchange', agendar);
        window.addEventListener('resize', agendar);
        window.addEventListener('wheeltech:user-ready', agendar);
    }

    window.wtMobile = { atualizar: aplicar, fecharGaveta };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
    else iniciar();
})();
