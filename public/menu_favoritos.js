// ============================================================
// FIXAR ITENS DO MENU LATERAL (FAVORITOS)
// WHEEL TECH
//
// Deixa a pessoa fixar os módulos que mais usa: passa o mouse
// sobre um item do menu lateral, aparece um ícone de alfinete,
// clica e o item sobe para o topo da lista. A preferência é
// salva por usuário no Supabase (segue a conta, não o aparelho).
//
// IMPORTANTE:
// A ordenação alfabética em si continua sendo feita por
// ordenarMenuAlfabeticamente() (menu_visualizacao.js) — esta
// função só decide QUEM fica na frente (os fixados). Se este
// arquivo também reordenasse o mesmo menu por conta própria, o
// observer de mutação de um desfaria o trabalho do outro a cada
// ciclo. Por isso, para o menu do dashboard (#menuSystem), só
// chamamos window.ordenarMenuAlfabeticamente() de novo depois de
// fixar/desafixar — quem decide a ordem final é sempre aquela
// função (agora ciente dos fixados).
//
// Já a barra lateral global (#wtGlobalSidebar, visível dentro de
// qualquer aba) é um clone que nada mais reordena — aqui a gente
// espelha a ordem do menu original nela, item por item.
// ============================================================

(function () {

    'use strict';


    const CONFIG = {

        tabela:
            'menu_itens_fixados_usuarios',

        seletorItem:
            '.wt-nav-item[data-menu-visual-key]',

        intervaloEspelho:
            700

    };


    let itensFixados =
        [];


    let usernameCarregado =
        null;


    let carregando =
        false;


    let timerSalvar =
        null;


    // ========================================================
    // SUPABASE / USUÁRIO
    // ========================================================

    function obterSupabase() {

        if (window.supabaseClient) {
            return window.supabaseClient;
        }

        try {
            if (typeof supabaseClient !== 'undefined' && supabaseClient) {
                return supabaseClient;
            }
        } catch (error) {
            // ignora
        }

        return null;

    }


    function obterUsername() {

        const usuario =
            window.currentUser;

        if (!usuario) {
            return '';
        }

        return String(
            usuario.username ||
            usuario.user ||
            usuario.login ||
            usuario.name ||
            ''
        )
            .trim()
            .toLowerCase();

    }


    // ========================================================
    // CSS
    // ========================================================

    function injetarCss() {

        if (document.getElementById('menuFavoritosCSS')) {
            return;
        }

        const style =
            document.createElement('style');

        style.id =
            'menuFavoritosCSS';

        style.textContent = `
            .wt-nav-item { position: relative; }

            .wt-pin-btn {
                position: absolute;
                right: 6px;
                top: 50%;
                width: 22px;
                height: 22px;
                display: flex;
                align-items: center;
                justify-content: center;
                border: 0;
                border-radius: 6px;
                background: transparent;
                color: rgba(255,255,255,.55);
                opacity: 0;
                visibility: hidden;
                transition: opacity .12s ease, background .12s ease, color .12s ease, transform .12s ease;
                cursor: pointer;
                font-size: 11px;
                z-index: 2;
                transform: translateY(-50%);
            }

            .wt-nav-item:hover .wt-pin-btn,
            .wt-nav-item.wt-pinned .wt-pin-btn {
                opacity: 1;
                visibility: visible;
            }

            .wt-pin-btn:hover {
                background: rgba(255,255,255,.18);
                color: #fff;
            }

            .wt-nav-item.wt-pinned .wt-pin-btn {
                color: #ffd166;
                transform: translateY(-50%) rotate(45deg);
            }

            /* Na barra lateral global colapsada (68px, só ícones) o
               alfinete fica escondido — só aparece quando a barra
               expande no hover, igual ao texto dos itens. */
            #wtGlobalSidebar .wt-pin-btn {
                opacity: 0 !important;
                visibility: hidden !important;
            }

            #wtGlobalSidebar:hover .wt-nav-item:hover .wt-pin-btn,
            #wtGlobalSidebar:hover .wt-nav-item.wt-pinned .wt-pin-btn,
            #wtGlobalSidebar:focus-within .wt-nav-item.wt-pinned .wt-pin-btn {
                opacity: 1 !important;
                visibility: visible !important;
            }
        `;

        document.head.appendChild(style);

    }


    // ========================================================
    // INJETAR OS BOTÕES DE ALFINETE NOS ITENS DO MENU
    // ========================================================

    function injetarBotoesFixar() {

        document
            .querySelectorAll(
                `#menuSystem > .wt-sidebar ${CONFIG.seletorItem}, #wtGlobalSidebar ${CONFIG.seletorItem}`
            )
            .forEach(
                item => {

                    if (item.querySelector('.wt-pin-btn')) {
                        return;
                    }

                    const chave =
                        item.dataset.menuVisualKey;

                    if (!chave) {
                        return;
                    }

                    const botao =
                        document.createElement('button');

                    botao.type = 'button';
                    botao.className = 'wt-pin-btn';
                    botao.title = 'Fixar no topo do menu';
                    botao.innerHTML = '<i class="fas fa-thumbtack"></i>';

                    botao.addEventListener('click', function (evento) {
                        evento.preventDefault();
                        evento.stopPropagation();
                        window.alternarFixarItemMenu(chave);
                    });

                    item.appendChild(botao);

                }
            );

    }


    // ========================================================
    // MARCAR VISUALMENTE OS ITENS FIXADOS
    // ========================================================

    function atualizarClassesPinadas() {

        document
            .querySelectorAll(
                `#menuSystem > .wt-sidebar ${CONFIG.seletorItem}, #wtGlobalSidebar ${CONFIG.seletorItem}`
            )
            .forEach(
                item => {

                    const chave =
                        item.dataset.menuVisualKey;

                    const fixado =
                        itensFixados.includes(chave);

                    item.classList.toggle('wt-pinned', fixado);

                    const botao =
                        item.querySelector('.wt-pin-btn');

                    if (botao) {

                        botao.title =
                            fixado
                                ? 'Desafixar do topo do menu'
                                : 'Fixar no topo do menu';

                    }

                }
            );

    }


    // ========================================================
    // ESPELHAR A ORDEM DO MENU ORIGINAL NA BARRA LATERAL GLOBAL
    //
    // #wtGlobalSidebar é um clone estático (feito uma vez, em
    // script.js). Nada mais reordena os itens dele — então aqui a
    // gente simplesmente copia a ordem atual dos itens do menu
    // original (#menuSystem), que é quem decide a ordem de
    // verdade (ordenarMenuAlfabeticamente, já ciente dos fixados).
    // ========================================================

    function espelharOrdemNaBarraGlobal() {

        const original =
            document.querySelector('#menuSystem > .wt-sidebar .wt-module-nav');

        const clone =
            document.querySelector('#wtGlobalSidebar .wt-module-nav');

        if (!original || !clone) {
            return;
        }

        const ordemChaves =
            Array
                .from(original.querySelectorAll(`:scope > ${CONFIG.seletorItem}`))
                .map(item => item.dataset.menuVisualKey);

        const itensPorChave =
            new Map(
                Array
                    .from(clone.querySelectorAll(`:scope > ${CONFIG.seletorItem}`))
                    .map(item => [item.dataset.menuVisualKey, item])
            );

        const ordemAlvo =
            ordemChaves
                .map(chave => itensPorChave.get(chave))
                .filter(Boolean);

        if (!ordemAlvo.length) {
            return;
        }

        const atual =
            Array.from(clone.querySelectorAll(`:scope > ${CONFIG.seletorItem}`));

        const jaNaOrdem =
            atual.length === ordemAlvo.length &&
            atual.every((item, indice) => item === ordemAlvo[indice]);

        if (jaNaOrdem) {
            return;
        }

        ordemAlvo.forEach(item => clone.appendChild(item));

    }


    // ========================================================
    // CARREGAR / SALVAR NO SUPABASE
    // ========================================================

    async function carregarFixadosUsuario() {

        const username =
            obterUsername();

        if (!username) {
            itensFixados = [];
            usernameCarregado = null;
            atualizarClassesPinadas();
            return;
        }

        if (username === usernameCarregado || carregando) {
            return;
        }

        const sb =
            obterSupabase();

        if (!sb) {
            return;
        }

        carregando = true;

        try {

            const { data, error } =
                await sb
                    .from(CONFIG.tabela)
                    .select('itens_fixados')
                    .eq('username', username)
                    .maybeSingle();

            if (error) {
                throw error;
            }

            itensFixados =
                Array.isArray(data?.itens_fixados)
                    ? data.itens_fixados
                    : [];

            usernameCarregado = username;

            if (typeof window.ordenarMenuAlfabeticamente === 'function') {
                window.ordenarMenuAlfabeticamente();
            }

            atualizarClassesPinadas();
            espelharOrdemNaBarraGlobal();

        } catch (error) {

            console.warn('⚠️ [menu favoritos] Erro ao carregar itens fixados:', error);

        } finally {

            carregando = false;

        }

    }


    function salvarFixadosUsuario() {

        const username =
            obterUsername();

        if (!username) {
            return;
        }

        const sb =
            obterSupabase();

        if (!sb) {
            return;
        }

        clearTimeout(timerSalvar);

        const itensParaSalvar =
            itensFixados.slice();

        timerSalvar =
            setTimeout(
                async () => {

                    try {

                        const { error } =
                            await sb
                                .from(CONFIG.tabela)
                                .upsert(
                                    {
                                        username,
                                        itens_fixados: itensParaSalvar,
                                        atualizado_em: new Date().toISOString()
                                    },
                                    { onConflict: 'username' }
                                );

                        if (error) {
                            throw error;
                        }

                    } catch (error) {

                        console.warn('⚠️ [menu favoritos] Erro ao salvar itens fixados:', error);

                    }

                },
                400
            );

    }


    // ========================================================
    // ALTERNAR FIXAR / DESAFIXAR
    // ========================================================

    window.alternarFixarItemMenu = function (chave) {

        if (!chave) {
            return;
        }

        const indice =
            itensFixados.indexOf(chave);

        if (indice === -1) {
            itensFixados.push(chave);
        } else {
            itensFixados.splice(indice, 1);
        }

        if (typeof window.ordenarMenuAlfabeticamente === 'function') {
            window.ordenarMenuAlfabeticamente();
        }

        atualizarClassesPinadas();
        espelharOrdemNaBarraGlobal();
        salvarFixadosUsuario();

    };


    window.obterOrdemFixadosMenu = function () {
        return itensFixados.slice();
    };


    // ========================================================
    // INICIALIZAÇÃO / POLLING
    //
    // Segue o mesmo padrão de menu_visualizacao.js: a barra
    // lateral global e alguns módulos são criados dinamicamente
    // por outros arquivos, então repetimos a tentativa algumas
    // vezes e depois mantemos um intervalo leve.
    // ========================================================

    let usuarioAnterior =
        null;

    function ciclo() {

        injetarCss();
        injetarBotoesFixar();
        atualizarClassesPinadas();
        espelharOrdemNaBarraGlobal();

        const usernameAtual =
            obterUsername();

        if (usernameAtual !== usuarioAnterior) {

            usuarioAnterior = usernameAtual;
            usernameCarregado = null;
            carregarFixadosUsuario();

        }

    }

    function inicializar() {

        ciclo();

        [200, 500, 1500, 3000].forEach(
            atraso => setTimeout(ciclo, atraso)
        );

        setInterval(ciclo, CONFIG.intervaloEspelho);

    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', inicializar);
    } else {
        inicializar();
    }

})();
