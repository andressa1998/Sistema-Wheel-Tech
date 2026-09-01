// ============================================================
// GERENCIAMENTO DE VISUALIZAÇÃO DO MENU
// WHEEL TECH
//
// FUNCIONALIDADES:
// - Ordena todas as abas alfabeticamente
// - Reordena também abas adicionadas dinamicamente
// - Mostra engrenagem apenas para administradores
// - Administrador escolhe quais abas cada usuário vê
// - Configuração salva no Supabase
// - Usuário sem configuração vê todas as abas permitidas
//
// IMPORTANTE:
// Esta função controla a VISUALIZAÇÃO do menu.
// Regras de permissão específicas que já existem no sistema
// continuam funcionando normalmente.
// ============================================================

(function () {

    'use strict';


    // ========================================================
    // CONFIGURAÇÃO
    // ========================================================

    const MENU_VIS_CONFIG = {

        tabela:
            'menu_visualizacao_usuarios',

        classeOculta:
            'menu-card-oculto-visualizacao',

        intervaloUsuario:
            700

    };


    // ========================================================
    // ESTADO
    // ========================================================

    let usuarioAtualCarregado =
        null;


    let configUsuarioAtual =
        null;


    let configUsuarioAtualExiste =
        false;


    let usuarioGerenciado =
        null;


    let observerMenu =
        null;


    let timerOrdenacao =
        null;


    let carregandoConfigAtual =
        false;


    // ========================================================
    // SUPABASE
    // ========================================================

    function obterSupabaseMenuVisualizacao() {

        if (
            window.supabaseClient
        ) {

            return window.supabaseClient;

        }


        // No seu script.js o supabaseClient pode estar
        // declarado como variável global lexical.
        try {

            if (
                typeof supabaseClient !==
                    'undefined' &&
                supabaseClient
            ) {

                return supabaseClient;

            }

        } catch (
            error
        ) {

            // ignora

        }


        return null;

    }


    // ========================================================
    // USUÁRIO ATUAL
    // ========================================================

    function obterUsuarioAtualMenu() {

        return (
            window.currentUser ||
            null
        );

    }


    function normalizarTextoMenu(
        valor
    ) {

        return String(
            valor ||
            ''
        )
            .trim()
            .toLowerCase()
            .normalize(
                'NFD'
            )
            .replace(
                /[\u0300-\u036f]/g,
                ''
            );

    }


    function obterUsernameMenu(
        usuario =
            obterUsuarioAtualMenu()
    ) {

        if (!usuario) {
            return '';
        }


        return normalizarTextoMenu(
            usuario.username ||
            usuario.user ||
            usuario.login ||
            usuario.name ||
            ''
        );

    }


    // ========================================================
    // ADMINISTRADOR
    // ========================================================

    function usuarioEhAdminMenu(
        usuario =
            obterUsuarioAtualMenu()
    ) {

        if (!usuario) {
            return false;
        }


        const role =
            normalizarTextoMenu(
                usuario.role ||
                ''
            );


        // Seu sistema usa "Administrador".
        return (
            role === 'admin' ||
            role === 'administrador' ||
            role.includes(
                'administrador'
            )
        );

    }


    // ========================================================
    // TOAST
    // ========================================================

    function toastMenuVisualizacao(
        mensagem,
        tipo =
            'info'
    ) {

        if (
            typeof window.showToast ===
            'function'
        ) {

            window.showToast(
                mensagem,
                tipo
            );

            return;
        }


        console.log(
            `[${tipo}] ${mensagem}`
        );

    }


    // ========================================================
    // ESCAPE HTML
    // ========================================================

    function escaparHtmlMenu(
        valor
    ) {

        return String(
            valor ??
            ''
        )
            .replace(
                /&/g,
                '&amp;'
            )
            .replace(
                /</g,
                '&lt;'
            )
            .replace(
                />/g,
                '&gt;'
            )
            .replace(
                /"/g,
                '&quot;'
            )
            .replace(
                /'/g,
                '&#039;'
            );

    }


    // ========================================================
    // TÍTULO REAL DO CARD
    //
    // Pega somente o texto do H3.
    //
    // Isso é importante para "Chamados", porque dentro
    // do H3 existe também o contador vermelho.
    // ========================================================

    function obterTituloCardMenu(
        card
    ) {

        if (!card) {
            return '';
        }


        const h3 =
            card.querySelector(
                'h3'
            );


        if (!h3) {

            return (
                card.textContent ||
                ''
            )
                .trim();

        }


        // Pega apenas os nós de texto diretos.
        // Ignora spans como o contador de Chamados.
        const textosDiretos =
            Array
                .from(
                    h3.childNodes
                )
                .filter(
                    node =>
                        node.nodeType ===
                        Node.TEXT_NODE
                )
                .map(
                    node =>
                        (
                            node.textContent ||
                            ''
                        ).trim()
                )
                .filter(
                    Boolean
                );


        if (
            textosDiretos.length
        ) {

            return textosDiretos
                .join(
                    ' '
                )
                .trim();

        }


        return (
            h3.textContent ||
            ''
        )
            .trim();

    }


    // ========================================================
    // CRIA UMA CHAVE ESTÁVEL PARA CADA ABA
    // ========================================================

    function criarChaveAbaMenu(
        titulo
    ) {

        return normalizarTextoMenu(
            titulo
        )
            .replace(
                /[^a-z0-9]+/g,
                '_'
            )
            .replace(
                /^_+|_+$/g,
                ''
            );

    }


    function obterChaveCardMenu(
        card
    ) {

        if (!card) {
            return '';
        }


        // Se já geramos uma chave, reutiliza.
        if (
            card.dataset.menuVisualKey
        ) {

            return (
                card.dataset
                    .menuVisualKey
            );

        }


        const titulo =
            obterTituloCardMenu(
                card
            );


        const chave =
            criarChaveAbaMenu(
                titulo
            );


        card.dataset.menuVisualKey =
            chave;


        return chave;

    }


    // ========================================================
    // PEGAR GRID DO MENU
    // ========================================================

    function obterGridMenu() {

        return document.querySelector(
            '#menuSystem .menu-grid'
        );

    }


    function obterCardsMenu() {

        const grid =
            obterGridMenu();


        if (!grid) {
            return [];
        }


        return Array.from(
            grid.children
        )
            .filter(
                elemento =>
                    elemento.classList
                        ?.contains(
                            'menu-card'
                        )
            );

    }


    // ========================================================
    // ORDENAR MENU ALFABETICAMENTE
    // ========================================================

    function ordenarMenuAlfabeticamente() {

        const grid =
            obterGridMenu();


        if (!grid) {
            return;
        }


        const cards =
            obterCardsMenu();


        if (
            cards.length <=
            1
        ) {

            return;

        }


        const ordenados =
            [
                ...cards
            ]
                .sort(
                    (
                        a,
                        b
                    ) => {

                        const tituloA =
                            obterTituloCardMenu(
                                a
                            );


                        const tituloB =
                            obterTituloCardMenu(
                                b
                            );


                        return tituloA.localeCompare(
                            tituloB,
                            'pt-BR',
                            {
                                sensitivity:
                                    'base',

                                numeric:
                                    true
                            }
                        );

                    }
                );


        // Verifica se realmente precisa mexer no DOM.
        // Isso evita loop infinito com MutationObserver.
        const jaEstaOrdenado =
            cards.every(
                (
                    card,
                    index
                ) =>
                    card ===
                    ordenados[
                        index
                    ]
            );


        if (
            jaEstaOrdenado
        ) {

            return;

        }


        ordenados.forEach(
            card => {

                grid.appendChild(
                    card
                );

            }
        );

    }


    function agendarOrdenacaoMenu() {

        if (
            timerOrdenacao
        ) {

            clearTimeout(
                timerOrdenacao
            );

        }


        timerOrdenacao =
            setTimeout(
                () => {

                    ordenarMenuAlfabeticamente();

                    aplicarVisualizacaoUsuarioAtual();

                },
                80
            );

    }


    // ========================================================
    // OBSERVA NOVAS ABAS
    //
    // Entradas e Chamados são adicionados por JS.
    // Quando aparecerem, serão automaticamente ordenados.
    // ========================================================

    function instalarObserverMenu() {

        const grid =
            obterGridMenu();


        if (
            !grid
        ) {

            return false;

        }


        if (
            observerMenu
        ) {

            observerMenu.disconnect();

        }


        observerMenu =
            new MutationObserver(
                mutations => {

                    const houveMudanca =
                        mutations.some(
                            mutation =>
                                mutation.type ===
                                    'childList' &&
                                (
                                    mutation
                                        .addedNodes
                                        .length >

                                        0

                                    ||

                                    mutation
                                        .removedNodes
                                        .length >

                                        0
                                )
                        );


                    if (
                        houveMudanca
                    ) {

                        agendarOrdenacaoMenu();

                    }

                }
            );


        observerMenu.observe(
            grid,
            {
                childList:
                    true
            }
        );


        return true;

    }


    // ========================================================
    // CSS
    // ========================================================

    function injetarCssMenuVisualizacao() {

        if (
            document.getElementById(
                'menuVisualizacaoCSS'
            )
        ) {

            return;

        }


        const style =
            document.createElement(
                'style'
            );


        style.id =
            'menuVisualizacaoCSS';


        style.textContent = `

            /*
             * IMPORTANTE:
             * somente cards escondidos por ESTE sistema.
             * Não interfere nas outras regras de permissão.
             */
            .menu-card-oculto-visualizacao {
                display: none !important;
            }


            /* ============================
               BOTÃO ENGRENAGEM
            ============================ */

            #menuConfigVisualizacaoWrap {
                position: relative;
                display: inline-flex;
                align-items: center;
            }


            #btnMenuConfiguracoes {
                width: 34px;
                height: 34px;
                padding: 0 !important;
                border-radius: 8px;
                justify-content: center;
            }


            #btnMenuConfiguracoes i {
                font-size: 15px !important;
            }


            /* ============================
               MENU DA ENGRENAGEM
            ============================ */

            #menuConfiguracoesDropdown {
                position: absolute;
                top: calc(100% + 7px);
                right: 0;

                width: 220px;

                background: white;

                border:
                    1px solid
                    #dee2e6;

                border-radius:
                    9px;

                box-shadow:
                    0 8px 25px
                    rgba(0, 0, 0, .16);

                overflow: hidden;

                z-index: 10050;
            }


            #menuConfiguracoesDropdown.hidden-menu-config {
                display: none !important;
            }


            .menu-config-item {
                width: 100%;

                display: flex;

                align-items: center;

                gap: 9px;

                border: none;

                background: white;

                padding: 11px 13px;

                cursor: pointer;

                font-size: 13px;

                color: #343a40;

                text-align: left;
            }


            .menu-config-item:hover {
                background: #f5f7fa;
            }


            .menu-config-item i {
                color: #00ADEE;
            }


            /* ============================
               MODAL
            ============================ */

            #modalGerenciarVisualizacaoMenu {
                position: fixed;

                inset: 0;

                background:
                    rgba(0,0,0,.55);

                z-index: 100000;

                display: flex;

                align-items: center;

                justify-content: center;

                padding: 20px;
            }


            #modalGerenciarVisualizacaoMenu.hidden-menu-visual {
                display: none !important;
            }


            .menu-visual-modal {
                width: min(
                    760px,
                    96vw
                );

                max-height: 92vh;

                background: white;

                border-radius: 13px;

                overflow: hidden;

                box-shadow:
                    0 25px 70px
                    rgba(0,0,0,.30);

                display: flex;

                flex-direction: column;
            }


            .menu-visual-head {
                display: flex;

                align-items: center;

                justify-content: space-between;

                gap: 10px;

                padding: 17px 20px;

                border-bottom:
                    1px solid
                    #e9ecef;
            }


            .menu-visual-head h3 {
                margin: 0;

                font-size:
                    18px !important;
            }


            .menu-visual-fechar {
                border: none;

                background: transparent;

                color: #6c757d;

                font-size: 25px;

                cursor: pointer;

                line-height: 1;
            }


            .menu-visual-body {
                padding: 20px;

                overflow-y: auto;
            }


            .menu-visual-footer {
                padding: 14px 20px;

                border-top:
                    1px solid
                    #e9ecef;

                display: flex;

                justify-content: flex-end;

                gap: 8px;

                background: white;
            }


            .menu-visual-usuario-info {
                display: flex;

                align-items: center;

                gap: 10px;

                margin-top: 10px;

                padding: 10px 12px;

                background: #f8f9fa;

                border-radius: 8px;

                border:
                    1px solid
                    #e9ecef;
            }


            .menu-visual-avatar {
                width: 34px;

                height: 34px;

                border-radius: 50%;

                display: flex;

                align-items: center;

                justify-content: center;

                background: #00ADEE;

                color: white;

                font-weight: 700;
            }


            .menu-visual-acoes {
                display: flex;

                gap: 7px;

                margin:
                    16px 0 10px;

                flex-wrap: wrap;
            }


            .menu-visual-lista {
                display: grid;

                grid-template-columns:
                    repeat(
                        2,
                        minmax(0, 1fr)
                    );

                gap: 8px;
            }


            .menu-visual-checkbox {
                display: flex;

                align-items: center;

                gap: 10px;

                padding: 10px 11px;

                background: #fff;

                border:
                    1px solid
                    #dee2e6;

                border-radius: 8px;

                cursor: pointer;

                transition:
                    all .15s ease;
            }


            .menu-visual-checkbox:hover {
                border-color: #00ADEE;

                background: #f4fbfe;
            }


            .menu-visual-checkbox input {
                width: 17px;

                height: 17px;

                cursor: pointer;
            }


            .menu-visual-checkbox-info {
                min-width: 0;

                flex: 1;
            }


            .menu-visual-checkbox-titulo {
                font-size: 13px;

                font-weight: 700;

                color: #343a40;
            }


            .menu-visual-checkbox-chave {
                font-size: 10px;

                color: #adb5bd;

                margin-top: 2px;
            }


            .menu-visual-carregando {
                padding: 30px;

                text-align: center;

                color: #6c757d;
            }


            @media (
                max-width: 650px
            ) {

                .menu-visual-lista {
                    grid-template-columns:
                        1fr;
                }

            }

        `;


        document.head.appendChild(
            style
        );

    }


    // ========================================================
    // CRIAR BOTÃO ENGRENAGEM
    // ========================================================

    function criarBotaoConfiguracaoMenu() {

        const userInfo =
            document.querySelector(
                '#menuSystem .user-info'
            );


        if (!userInfo) {
            return false;
        }


        let wrap =
            document.getElementById(
                'menuConfigVisualizacaoWrap'
            );


        if (!wrap) {

            wrap =
                document.createElement(
                    'div'
                );


            wrap.id =
                'menuConfigVisualizacaoWrap';


            wrap.innerHTML = `

                <button
                    type="button"
                    id="btnMenuConfiguracoes"
                    class="btn btn-sm btn-secondary"
                    title="Configurações"
                    onclick="
                        event.stopPropagation();
                        toggleMenuConfiguracoesVisualizacao();
                    "
                >
                    <i
                        class="
                            fas
                            fa-cog
                        "
                    ></i>
                </button>


                <div
                    id="menuConfiguracoesDropdown"
                    class="
                        hidden-menu-config
                    "
                    onclick="
                        event.stopPropagation()
                    "
                >

                    <button
                        type="button"
                        class="menu-config-item"
                        onclick="
                            abrirGerenciarVisualizacaoMenu();
                        "
                    >

                        <i
                            class="
                                fas
                                fa-eye
                            "
                        ></i>

                        Gerenciar visualização

                    </button>

                </div>

            `;


            // Coloca no começo da área do usuário,
            // antes dos dados/Sair.
            userInfo.insertBefore(
                wrap,
                userInfo.firstChild
            );

        }


        atualizarVisibilidadeEngrenagem();


        return true;

    }


    function atualizarVisibilidadeEngrenagem() {

        const wrap =
            document.getElementById(
                'menuConfigVisualizacaoWrap'
            );


        if (!wrap) {
            return;
        }


        wrap.style.display =
            usuarioEhAdminMenu()
                ? 'inline-flex'
                : 'none';

    }


    window.toggleMenuConfiguracoesVisualizacao =
        function() {

            if (
                !usuarioEhAdminMenu()
            ) {

                return;

            }


            const dropdown =
                document.getElementById(
                    'menuConfiguracoesDropdown'
                );


            if (!dropdown) {
                return;
            }


            dropdown.classList.toggle(
                'hidden-menu-config'
            );

        };


    function fecharDropdownMenuVisualizacao() {

        document
            .getElementById(
                'menuConfiguracoesDropdown'
            )
            ?.classList
            .add(
                'hidden-menu-config'
            );

    }


    // ========================================================
    // USUÁRIOS DO SISTEMA
    // ========================================================

    function obterUsuariosSistemaMenu() {

        try {

            if (
                typeof SYSTEM_USERS !==
                    'undefined' &&
                Array.isArray(
                    SYSTEM_USERS
                )
            ) {

                return SYSTEM_USERS

                    .map(
                        user => ({

                            username:
                                normalizarTextoMenu(
                                    user.username
                                ),

                            name:
                                user.name ||
                                user.username,

                            avatar:
                                user.avatar ||
                                (
                                    user.name ||
                                    user.username ||
                                    'U'
                                )
                                    .charAt(
                                        0
                                    )
                                    .toUpperCase(),

                            role:
                                user.role ||
                                ''

                        })
                    )

                    .filter(
                        user =>
                            user.username
                    )

                    .sort(
                        (
                            a,
                            b
                        ) =>
                            a.name.localeCompare(
                                b.name,
                                'pt-BR',
                                {
                                    sensitivity:
                                        'base'
                                }
                            )
                    );

            }

        } catch (
            error
        ) {

            console.warn(
                'Não foi possível acessar SYSTEM_USERS:',
                error
            );

        }


        return [];

    }


    // ========================================================
    // MODAL GERENCIAR VISUALIZAÇÃO
    // ========================================================

    function criarModalGerenciarVisualizacao() {

        if (
            document.getElementById(
                'modalGerenciarVisualizacaoMenu'
            )
        ) {

            return;

        }


        const modal =
            document.createElement(
                'div'
            );


        modal.id =
            'modalGerenciarVisualizacaoMenu';


        modal.className =
            'hidden-menu-visual';


        modal.onclick =
            function (
                event
            ) {

                if (
                    event.target ===
                    modal
                ) {

                    window
                        .fecharGerenciarVisualizacaoMenu();

                }

            };


        modal.innerHTML = `

            <div
                class="menu-visual-modal"
            >

                <div
                    class="menu-visual-head"
                >

                    <h3>

                        <i
                            class="
                                fas
                                fa-eye
                            "
                        ></i>

                        Gerenciar visualização

                    </h3>


                    <button
                        type="button"
                        class="menu-visual-fechar"
                        onclick="
                            fecharGerenciarVisualizacaoMenu()
                        "
                    >
                        ×
                    </button>

                </div>


                <div
                    class="menu-visual-body"
                >

                    <label
                        style="
                            font-weight:700;
                            display:block;
                            margin-bottom:6px;
                        "
                    >
                        Usuário
                    </label>


                    <select
                        id="menuVisualUsuarioSelect"
                        class="form-control"
                        onchange="
                            carregarVisualizacaoUsuarioSelecionado()
                        "
                    >
                    </select>


                    <div
                        id="menuVisualUsuarioInfo"
                    >
                    </div>


                    <div
                        class="menu-visual-acoes"
                    >

                        <button
                            type="button"
                            class="
                                btn
                                btn-sm
                                btn-secondary
                            "
                            onclick="
                                selecionarTodasAbasMenu()
                            "
                        >
                            <i
                                class="
                                    fas
                                    fa-check-double
                                "
                            ></i>

                            Selecionar todas
                        </button>


                        <button
                            type="button"
                            class="
                                btn
                                btn-sm
                                btn-secondary
                            "
                            onclick="
                                desmarcarTodasAbasMenu()
                            "
                        >
                            <i
                                class="
                                    fas
                                    fa-times
                                "
                            ></i>

                            Desmarcar todas
                        </button>

                    </div>


                    <div
                        style="
                            margin-bottom:9px;
                            color:#6c757d;
                            font-size:12px;
                        "
                    >

                        Marque as abas que deverão aparecer
                        no menu principal desse usuário.

                    </div>


                    <div
                        id="menuVisualListaAbas"
                    >
                    </div>

                </div>


                <div
                    class="menu-visual-footer"
                >

                    <button
                        type="button"
                        class="
                            btn
                            btn-secondary
                        "
                        onclick="
                            fecharGerenciarVisualizacaoMenu()
                        "
                    >
                        Cancelar
                    </button>


                    <button
                        type="button"
                        id="btnSalvarMenuVisual"
                        class="
                            btn
                            btn-primary
                        "
                        onclick="
                            salvarVisualizacaoUsuarioMenu()
                        "
                    >

                        <i
                            class="
                                fas
                                fa-save
                            "
                        ></i>

                        Salvar visualização

                    </button>

                </div>

            </div>

        `;


        document.body.appendChild(
            modal
        );

    }


    window.abrirGerenciarVisualizacaoMenu =
        async function() {

            if (
                !usuarioEhAdminMenu()
            ) {

                toastMenuVisualizacao(
                    '🔒 Apenas administradores podem gerenciar a visualização.',
                    'warning'
                );

                return;

            }


            fecharDropdownMenuVisualizacao();


            criarModalGerenciarVisualizacao();


            const modal =
                document.getElementById(
                    'modalGerenciarVisualizacaoMenu'
                );


            const select =
                document.getElementById(
                    'menuVisualUsuarioSelect'
                );


            const usuarios =
                obterUsuariosSistemaMenu();


            if (
                !usuarios.length
            ) {

                toastMenuVisualizacao(
                    '❌ Não foi possível localizar a lista SYSTEM_USERS.',
                    'error'
                );

                return;

            }


            select.innerHTML =
                usuarios

                    .map(
                        user => `

                            <option
                                value="${
                                    escaparHtmlMenu(
                                        user.username
                                    )
                                }"
                            >
                                ${
                                    escaparHtmlMenu(
                                        user.name
                                    )
                                }
                                — ${
                                    escaparHtmlMenu(
                                        user.role
                                    )
                                }
                            </option>

                        `
                    )

                    .join(
                        ''
                    );


            modal.classList.remove(
                'hidden-menu-visual'
            );


            // Abre inicialmente no próprio usuário
            // se ele estiver na lista.
            const atual =
                obterUsernameMenu();


            const existeAtual =
                usuarios.some(
                    u =>
                        u.username ===
                        atual
                );


            if (
                existeAtual
            ) {

                select.value =
                    atual;

            }


            await window
                .carregarVisualizacaoUsuarioSelecionado();

        };


    window.fecharGerenciarVisualizacaoMenu =
        function() {

            document
                .getElementById(
                    'modalGerenciarVisualizacaoMenu'
                )
                ?.classList
                .add(
                    'hidden-menu-visual'
                );


            usuarioGerenciado =
                null;

        };


    // ========================================================
    // DESENHAR INFORMAÇÕES DO USUÁRIO
    // ========================================================

    function renderizarInfoUsuarioGerenciado(
        usuario
    ) {

        const box =
            document.getElementById(
                'menuVisualUsuarioInfo'
            );


        if (!box) {
            return;
        }


        if (!usuario) {

            box.innerHTML =
                '';

            return;

        }


        box.innerHTML = `

            <div
                class="menu-visual-usuario-info"
            >

                <div
                    class="menu-visual-avatar"
                >
                    ${
                        escaparHtmlMenu(
                            usuario.avatar ||
                            'U'
                        )
                    }
                </div>


                <div>

                    <div
                        style="
                            font-weight:700;
                        "
                    >
                        ${
                            escaparHtmlMenu(
                                usuario.name
                            )
                        }
                    </div>


                    <div
                        style="
                            color:#6c757d;
                            font-size:11px;
                        "
                    >
                        ${
                            escaparHtmlMenu(
                                usuario.username
                            )
                        }

                        •

                        ${
                            escaparHtmlMenu(
                                usuario.role
                            )
                        }
                    </div>

                </div>

            </div>

        `;

    }


    // ========================================================
    // CARREGAR CONFIGURAÇÃO DO USUÁRIO SELECIONADO
    // ========================================================

    window.carregarVisualizacaoUsuarioSelecionado =
        async function() {

            if (
                !usuarioEhAdminMenu()
            ) {

                return;

            }


            const select =
                document.getElementById(
                    'menuVisualUsuarioSelect'
                );


            const lista =
                document.getElementById(
                    'menuVisualListaAbas'
                );


            if (
                !select ||
                !lista
            ) {

                return;

            }


            const username =
                normalizarTextoMenu(
                    select.value
                );


            if (!username) {
                return;
            }


            const usuarios =
                obterUsuariosSistemaMenu();


            usuarioGerenciado =
                usuarios.find(
                    u =>
                        u.username ===
                        username
                ) ||
                null;


            renderizarInfoUsuarioGerenciado(
                usuarioGerenciado
            );


            lista.innerHTML = `

                <div
                    class="menu-visual-carregando"
                >

                    <span
                        class="spinner"
                    ></span>

                    <div
                        style="
                            margin-top:8px;
                        "
                    >
                        Carregando configuração...
                    </div>

                </div>

            `;


            const sb =
                obterSupabaseMenuVisualizacao();


            if (!sb) {

                lista.innerHTML = `

                    <div
                        class="menu-visual-carregando"
                        style="
                            color:#dc3545;
                        "
                    >
                        Supabase não disponível.
                    </div>

                `;

                return;

            }


            try {

                const {
                    data,
                    error
                } =
                    await sb

                        .from(
                            MENU_VIS_CONFIG
                                .tabela
                        )

                        .select(
                            'username, abas_visiveis'
                        )

                        .eq(
                            'username',
                            username
                        )

                        .maybeSingle();


                if (error) {

                    throw error;

                }


                // Sem configuração salva =
                // todas as abas aparecem.
                const existeConfig =
                    !!data;


                const selecionadas =
                    existeConfig

                        ? Array.isArray(
                            data.abas_visiveis
                        )
                            ? data.abas_visiveis
                            : []

                        : obterCardsMenu()
                            .map(
                                obterChaveCardMenu
                            );


                renderizarChecklistAbasMenu(
                    selecionadas,
                    existeConfig
                );


            } catch (
                error
            ) {

                console.error(
                    '❌ Erro carregando visualização:',
                    error
                );


                lista.innerHTML = `

                    <div
                        class="menu-visual-carregando"
                        style="
                            color:#dc3545;
                        "
                    >

                        Erro ao carregar:

                        <br>

                        ${
                            escaparHtmlMenu(
                                error.message
                            )
                        }

                    </div>

                `;

            }

        };


    // ========================================================
    // CHECKLIST DAS ABAS
    // ========================================================

    function renderizarChecklistAbasMenu(
        selecionadas
    ) {

        const lista =
            document.getElementById(
                'menuVisualListaAbas'
            );


        if (!lista) {
            return;
        }


        const selecionadasSet =
            new Set(
                selecionadas ||
                []
            );


        const cards =
            obterCardsMenu()

                .map(
                    card => ({

                        titulo:
                            obterTituloCardMenu(
                                card
                            ),

                        chave:
                            obterChaveCardMenu(
                                card
                            )

                    })
                )

                .filter(
                    item =>
                        item.titulo &&
                        item.chave
                )

                .sort(
                    (
                        a,
                        b
                    ) =>
                        a.titulo
                            .localeCompare(
                                b.titulo,
                                'pt-BR',
                                {
                                    sensitivity:
                                        'base'
                                }
                            )
                );


        if (
            !cards.length
        ) {

            lista.innerHTML = `

                <div
                    class="menu-visual-carregando"
                >
                    Nenhuma aba localizada.
                </div>

            `;

            return;

        }


        lista.innerHTML = `

            <div
                class="menu-visual-lista"
            >

                ${
                    cards

                        .map(
                            item => `

                                <label
                                    class="menu-visual-checkbox"
                                >

                                    <input
                                        type="checkbox"
                                        class="menu-visual-aba-check"
                                        value="${
                                            escaparHtmlMenu(
                                                item.chave
                                            )
                                        }"
                                        ${
                                            selecionadasSet
                                                .has(
                                                    item.chave
                                                )
                                                ? 'checked'
                                                : ''
                                        }
                                    >


                                    <div
                                        class="menu-visual-checkbox-info"
                                    >

                                        <div
                                            class="menu-visual-checkbox-titulo"
                                        >
                                            ${
                                                escaparHtmlMenu(
                                                    item.titulo
                                                )
                                            }
                                        </div>


                                        <div
                                            class="menu-visual-checkbox-chave"
                                        >
                                            ${
                                                escaparHtmlMenu(
                                                    item.chave
                                                )
                                            }
                                        </div>

                                    </div>

                                </label>

                            `
                        )

                        .join(
                            ''
                        )
                }

            </div>

        `;

    }


    // ========================================================
    // SELECIONAR / DESMARCAR TODAS
    // ========================================================

    window.selecionarTodasAbasMenu =
        function() {

            document
                .querySelectorAll(
                    '.menu-visual-aba-check'
                )
                .forEach(
                    input => {

                        input.checked =
                            true;

                    }
                );

        };


    window.desmarcarTodasAbasMenu =
        function() {

            document
                .querySelectorAll(
                    '.menu-visual-aba-check'
                )
                .forEach(
                    input => {

                        input.checked =
                            false;

                    }
                );

        };


    // ========================================================
    // SALVAR CONFIGURAÇÃO
    // ========================================================

    window.salvarVisualizacaoUsuarioMenu =
        async function() {

            if (
                !usuarioEhAdminMenu()
            ) {

                toastMenuVisualizacao(
                    '🔒 Apenas administradores podem salvar essa configuração.',
                    'warning'
                );

                return;

            }


            if (
                !usuarioGerenciado
            ) {

                toastMenuVisualizacao(
                    '⚠️ Selecione um usuário.',
                    'warning'
                );

                return;

            }


            const sb =
                obterSupabaseMenuVisualizacao();


            if (!sb) {

                toastMenuVisualizacao(
                    '❌ Supabase não disponível.',
                    'error'
                );

                return;

            }


            const selecionadas =
                Array
                    .from(
                        document
                            .querySelectorAll(
                                '.menu-visual-aba-check:checked'
                            )
                    )

                    .map(
                        input =>
                            input.value
                    )

                    .filter(
                        Boolean
                    );


            const btn =
                document.getElementById(
                    'btnSalvarMenuVisual'
                );


            const htmlOriginal =
                btn?.innerHTML;


            if (btn) {

                btn.disabled =
                    true;


                btn.innerHTML = `

                    <i
                        class="
                            fas
                            fa-spinner
                            fa-spin
                        "
                    ></i>

                    Salvando...

                `;

            }


            try {

                const usernameAdmin =
                    obterUsernameMenu();


                const {
                    error
                } =
                    await sb

                        .from(
                            MENU_VIS_CONFIG
                                .tabela
                        )

                        .upsert(
                            {

                                username:
                                    usuarioGerenciado
                                        .username,

                                abas_visiveis:
                                    selecionadas,

                                atualizado_por:
                                    usernameAdmin,

                                atualizado_em:
                                    new Date()
                                        .toISOString()

                            },
                            {

                                onConflict:
                                    'username'

                            }
                        );


                if (error) {

                    throw error;

                }


                toastMenuVisualizacao(
                    `✅ Visualização de ${usuarioGerenciado.name} salva.`,
                    'success'
                );


                // Se o admin estiver editando o próprio usuário,
                // aplica imediatamente.
                if (
                    usuarioGerenciado
                        .username ===
                    obterUsernameMenu()
                ) {

                    configUsuarioAtual =
                        selecionadas;


                    configUsuarioAtualExiste =
                        true;


                    aplicarVisualizacaoUsuarioAtual();

                }


            } catch (
                error
            ) {

                console.error(
                    '❌ Erro salvando visualização:',
                    error
                );


                toastMenuVisualizacao(
                    '❌ Erro ao salvar: ' +
                    error.message,
                    'error'
                );


            } finally {

                if (btn) {

                    btn.disabled =
                        false;


                    btn.innerHTML =
                        htmlOriginal;

                }

            }

        };


    // ========================================================
    // CARREGAR CONFIGURAÇÃO DO USUÁRIO LOGADO
    // ========================================================

    async function carregarConfigUsuarioAtual() {

        if (
            carregandoConfigAtual
        ) {

            return;

        }


        const usuario =
            obterUsuarioAtualMenu();


        if (!usuario) {

            usuarioAtualCarregado =
                null;


            configUsuarioAtual =
                null;


            configUsuarioAtualExiste =
                false;


            limparRestricoesVisualizacaoMenu();


            atualizarVisibilidadeEngrenagem();


            return;

        }


        const username =
            obterUsernameMenu(
                usuario
            );


        if (!username) {
            return;
        }


        carregandoConfigAtual =
            true;


        try {

            const sb =
                obterSupabaseMenuVisualizacao();


            if (!sb) {

                // Supabase ainda inicializando.
                return;

            }


            const {
                data,
                error
            } =
                await sb

                    .from(
                        MENU_VIS_CONFIG
                            .tabela
                    )

                    .select(
                        'username, abas_visiveis'
                    )

                    .eq(
                        'username',
                        username
                    )

                    .maybeSingle();


            if (error) {

                throw error;

            }


            usuarioAtualCarregado =
                username;


            configUsuarioAtualExiste =
                !!data;


            configUsuarioAtual =
                data &&
                Array.isArray(
                    data.abas_visiveis
                )
                    ? data.abas_visiveis
                    : null;


            aplicarVisualizacaoUsuarioAtual();


            atualizarVisibilidadeEngrenagem();


        } catch (
            error
        ) {

            console.error(
                '❌ Erro carregando configuração do menu:',
                error
            );


            // Em caso de erro NÃO esconde as abas.
            configUsuarioAtualExiste =
                false;


            configUsuarioAtual =
                null;


            aplicarVisualizacaoUsuarioAtual();


        } finally {

            carregandoConfigAtual =
                false;

        }

    }


    // ========================================================
    // APLICAR CONFIGURAÇÃO
    // ========================================================

    function aplicarVisualizacaoUsuarioAtual() {

        const cards =
            obterCardsMenu();


        if (
            !cards.length
        ) {

            return;

        }


        // Nenhuma configuração cadastrada:
        // não interfere no menu.
        if (
            !configUsuarioAtualExiste
        ) {

            cards.forEach(
                card => {

                    card.classList.remove(
                        MENU_VIS_CONFIG
                            .classeOculta
                    );

                }
            );


            return;

        }


        const visiveis =
            new Set(
                Array.isArray(
                    configUsuarioAtual
                )
                    ? configUsuarioAtual
                    : []
            );


        cards.forEach(
            card => {

                const chave =
                    obterChaveCardMenu(
                        card
                    );


                const deveAparecer =
                    visiveis.has(
                        chave
                    );


                card.classList.toggle(
                    MENU_VIS_CONFIG
                        .classeOculta,

                    !deveAparecer
                );

            }
        );

    }


    function limparRestricoesVisualizacaoMenu() {

        document
            .querySelectorAll(
                `.${
                    MENU_VIS_CONFIG
                        .classeOculta
                }`
            )
            .forEach(
                card => {

                    card.classList.remove(
                        MENU_VIS_CONFIG
                            .classeOculta
                    );

                }
            );

    }


    // ========================================================
    // DETECTAR LOGIN / TROCA DE USUÁRIO
    //
    // Isso evita precisar modificar handleLogin().
    // ========================================================

    function verificarUsuarioLogadoMenu() {

        const usuario =
            obterUsuarioAtualMenu();


        const username =
            usuario
                ? obterUsernameMenu(
                    usuario
                )
                : '';


        if (!username) {

            if (
                usuarioAtualCarregado
            ) {

                usuarioAtualCarregado =
                    null;


                configUsuarioAtual =
                    null;


                configUsuarioAtualExiste =
                    false;


                limparRestricoesVisualizacaoMenu();

            }


            atualizarVisibilidadeEngrenagem();


            return;

        }


        if (
            username !==
            usuarioAtualCarregado
        ) {

            carregarConfigUsuarioAtual();

        }


        atualizarVisibilidadeEngrenagem();

    }


    // ========================================================
    // INICIALIZAÇÃO
    // ========================================================

    function inicializarMenuVisualizacao() {

        injetarCssMenuVisualizacao();


        criarModalGerenciarVisualizacao();


        // Tenta criar engrenagem.
        criarBotaoConfiguracaoMenu();


        ordenarMenuAlfabeticamente();


        instalarObserverMenu();


        verificarUsuarioLogadoMenu();


        // Algumas abas são criadas depois por outros JS.
        setTimeout(
            () => {

                criarBotaoConfiguracaoMenu();

                ordenarMenuAlfabeticamente();

                instalarObserverMenu();

                verificarUsuarioLogadoMenu();

            },
            500
        );


        setTimeout(
            () => {

                criarBotaoConfiguracaoMenu();

                ordenarMenuAlfabeticamente();

                instalarObserverMenu();

                verificarUsuarioLogadoMenu();

            },
            1500
        );


        setTimeout(
            () => {

                criarBotaoConfiguracaoMenu();

                ordenarMenuAlfabeticamente();

                instalarObserverMenu();

                verificarUsuarioLogadoMenu();

            },
            3000
        );


        // Detecta login/logout e troca de usuário.
        setInterval(
            verificarUsuarioLogadoMenu,
            MENU_VIS_CONFIG
                .intervaloUsuario
        );

    }


    // ========================================================
    // FECHAR DROPDOWN CLICANDO FORA
    // ========================================================

    document.addEventListener(
        'click',
        function (
            event
        ) {

            const wrap =
                document.getElementById(
                    'menuConfigVisualizacaoWrap'
                );


            if (
                wrap &&
                !wrap.contains(
                    event.target
                )
            ) {

                fecharDropdownMenuVisualizacao();

            }

        }
    );


    // ========================================================
    // ESC
    // ========================================================

    document.addEventListener(
        'keydown',
        function (
            event
        ) {

            if (
                event.key !==
                'Escape'
            ) {

                return;

            }


            fecharDropdownMenuVisualizacao();


            document
                .getElementById(
                    'modalGerenciarVisualizacaoMenu'
                )
                ?.classList
                .add(
                    'hidden-menu-visual'
                );

        }
    );


    // ========================================================
    // START
    // ========================================================

    if (
        document.readyState ===
        'loading'
    ) {

        document.addEventListener(
            'DOMContentLoaded',
            function () {

                setTimeout(
                    inicializarMenuVisualizacao,
                    200
                );

            }
        );

    } else {

        setTimeout(
            inicializarMenuVisualizacao,
            100
        );

    }


    // ========================================================
    // EXPOR FUNÇÕES ÚTEIS
    // ========================================================

    window.ordenarMenuAlfabeticamente =
        ordenarMenuAlfabeticamente;


    window.aplicarVisualizacaoUsuarioAtual =
        aplicarVisualizacaoUsuarioAtual;


    window.recarregarVisualizacaoMenu =
        carregarConfigUsuarioAtual;


})();