// ============================================================
// NOTIFICAÇÕES DA CENTRAL DE CHAMADOS
// WHEEL TECH
// Arquivo: notificacoes_chamados.js
// ============================================================

(function () {

    'use strict';


    // ========================================================
    // CONFIGURAÇÃO
    // ========================================================

    const NOTIF_CHAMADOS_CONFIG = {

        tabela:
            'chamados_notificacoes',

        intervaloAtualizacao:
            15000,

        limiteLista:
            30

    };


    // ========================================================
    // ESTADO
    // ========================================================

    let notificacoesChamadosCache = [];

    let timerNotificacoesChamados = null;

    let usuarioNotificacaoAtual = null;

    let carregandoNotificacoesChamados = false;


    // ========================================================
    // AUXILIARES
    // ========================================================

    function sbNotificacoesChamados() {

        if (
            window.supabaseClient
        ) {

            return window.supabaseClient;

        }


        try {

            if (
                typeof supabaseClient !== 'undefined' &&
                supabaseClient
            ) {

                return supabaseClient;

            }

        } catch (e) {
            // ignora
        }


        return null;

    }


    function usuarioAtualNotificacoes() {

        return (
            window.currentUser ||
            null
        );

    }


    function normalizarUsuarioNotificacao(
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


    function usernameAtualNotificacao() {

        const usuario =
            usuarioAtualNotificacoes();


        if (!usuario) {
            return '';
        }


        return normalizarUsuarioNotificacao(

            usuario.username ||
            usuario.name ||
            ''

        );

    }


    function nomeAtualNotificacao() {

        const usuario =
            usuarioAtualNotificacoes();


        return (
            usuario?.name ||
            usuario?.username ||
            usernameAtualNotificacao() ||
            'Usuário'
        );

    }


    function escaparNotif(
        valor
    ) {

        return String(
            valor ??
            ''
        )
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');

    }


    function formatarDataNotif(
        valor
    ) {

        if (!valor) {
            return '';
        }


        const data =
            new Date(
                valor
            );


        if (
            Number.isNaN(
                data.getTime()
            )
        ) {

            return '';

        }


        return data.toLocaleString(
            'pt-BR',
            {

                timeZone:
                    'America/Sao_Paulo',

                day:
                    '2-digit',

                month:
                    '2-digit',

                hour:
                    '2-digit',

                minute:
                    '2-digit'

            }
        );

    }


    function numeroChamadoNotif(
        id
    ) {

        return `CH-${String(
            Number(
                id ||
                0
            )
        ).padStart(
            6,
            '0'
        )}`;

    }


    function iconeTipoNotificacao(
        tipo
    ) {

        switch (
            tipo
        ) {

            case 'nova_mensagem':

                return '💬';


            case 'status':

                return '🔄';


            case 'novo_chamado':

                return '🎫';


            case 'resposta_usuario':

                return '↩️';


            default:

                return '🔔';

        }

    }


    // ========================================================
    // ADMINISTRADORES
    //
    // Procura usuários com role administrador/admin.
    // Caso SYSTEM_USERS não esteja disponível, usa a lista
    // de CFG_CHAMADOS como fallback.
    // ========================================================

    function obterAdminsNotificacoesChamados() {

        let admins = [];


        try {

            if (
                typeof SYSTEM_USERS !== 'undefined' &&
                Array.isArray(
                    SYSTEM_USERS
                )
            ) {

                admins =
                    SYSTEM_USERS

                        .filter(
                            usuario => {

                                const role =
                                    normalizarUsuarioNotificacao(
                                        usuario.role
                                    );


                                return (

                                    role === 'admin' ||

                                    role ===
                                        'administrador' ||

                                    role.includes(
                                        'administrador'
                                    )

                                );

                            }
                        )

                        .map(
                            usuario =>
                                normalizarUsuarioNotificacao(
                                    usuario.username
                                )
                        )

                        .filter(
                            Boolean
                        );

            }

        } catch (e) {

            console.warn(
                '⚠️ SYSTEM_USERS não disponível para notificações:',
                e
            );

        }


        // ================================================
        // FALLBACK
        // ================================================

        if (
            !admins.length
        ) {

            try {

                if (
                    window.CFG_CHAMADOS &&
                    Array.isArray(
                        window.CFG_CHAMADOS.admins
                    )
                ) {

                    admins =
                        window.CFG_CHAMADOS.admins

                            .map(
                                normalizarUsuarioNotificacao
                            )

                            .filter(
                                Boolean
                            );

                }

            } catch (e) {
                // ignora
            }

        }


        return [
            ...new Set(
                admins
            )
        ];

    }


    // ========================================================
    // CRIAR NOTIFICAÇÃO
    //
    // Esta função será usada também pelo chamados.js.
    // ========================================================

    window.criarNotificacaoChamado =
        async function ({
            chamadoId,
            destinatarioUsername,
            tipo,
            titulo,
            mensagem = ''
        }) {

            const sb =
                sbNotificacoesChamados();


            if (!sb) {

                console.warn(
                    '⚠️ Supabase indisponível para criar notificação.'
                );

                return false;

            }


            const destinatario =
                normalizarUsuarioNotificacao(
                    destinatarioUsername
                );


            if (
                !destinatario
            ) {

                return false;

            }


            // Não notifica a própria pessoa sobre uma ação dela mesma
            if (
                destinatario ===
                usernameAtualNotificacao()
            ) {

                return false;

            }


            try {

                const {
                    error
                } =
                    await sb

                        .from(
                            NOTIF_CHAMADOS_CONFIG
                                .tabela
                        )

                        .insert({

                            chamado_id:
                                Number(
                                    chamadoId
                                ),

                            destinatario_username:
                                destinatario,

                            autor_username:
                                usernameAtualNotificacao(),

                            autor_nome:
                                nomeAtualNotificacao(),

                            tipo:
                                tipo,

                            titulo:
                                titulo,

                            mensagem:
                                mensagem ||
                                null,

                            lida:
                                false

                        });


                if (error) {

                    throw error;

                }


                return true;


            } catch (
                error
            ) {

                console.error(
                    '❌ Erro criando notificação:',
                    error
                );


                return false;

            }

        };


    // ========================================================
    // NOTIFICAR TODOS OS ADMINS
    // ========================================================

    window.notificarAdminsChamado =
        async function ({
            chamadoId,
            tipo,
            titulo,
            mensagem = ''
        }) {

            const admins =
                obterAdminsNotificacoesChamados();


            const atual =
                usernameAtualNotificacao();


            const promises =
                admins

                    .filter(
                        admin =>
                            admin !==
                            atual
                    )

                    .map(
                        admin =>
                            window
                                .criarNotificacaoChamado({

                                    chamadoId:
                                        chamadoId,

                                    destinatarioUsername:
                                        admin,

                                    tipo:
                                        tipo,

                                    titulo:
                                        titulo,

                                    mensagem:
                                        mensagem

                                })
                    );


            await Promise.allSettled(
                promises
            );

        };


    // ========================================================
    // CSS
    // ========================================================

    function injetarCSSNotificacoesChamados() {

        if (
            document.getElementById(
                'cssNotificacoesChamados'
            )
        ) {

            return;

        }


        const style =
            document.createElement(
                'style'
            );


        style.id =
            'cssNotificacoesChamados';


        style.textContent = `

            /* =============================================
               CONTAINER
            ============================================= */

            #chamadosNotificacaoWrap {
                position: relative;
                display: inline-flex;
                align-items: center;
            }


            /* =============================================
               SINO
            ============================================= */

            #btnNotificacoesChamados {
                position: relative;

                width: 34px;
                height: 34px;

                padding: 0 !important;

                border-radius: 8px;

                display: inline-flex;

                align-items: center;

                justify-content: center;
            }


            #btnNotificacoesChamados i {
                font-size: 15px !important;
            }


            #contadorNotificacoesChamados {

                position: absolute;

                top: -6px;
                right: -7px;

                min-width: 18px;
                height: 18px;

                padding: 0 5px;

                border-radius: 9px;

                background: #dc3545;

                color: white;

                border: 2px solid white;

                display: flex;

                align-items: center;

                justify-content: center;

                font-size: 9px;

                font-weight: 700;

                line-height: 1;

                box-sizing: border-box;
            }


            #contadorNotificacoesChamados.vazio {
                display: none;
            }


            /* Anima quando chega nova */
            @keyframes sinoChamadosAnimar {

                0% {
                    transform: rotate(0deg);
                }

                20% {
                    transform: rotate(15deg);
                }

                40% {
                    transform: rotate(-15deg);
                }

                60% {
                    transform: rotate(10deg);
                }

                80% {
                    transform: rotate(-10deg);
                }

                100% {
                    transform: rotate(0deg);
                }

            }


            #btnNotificacoesChamados.tem-nova i {
                animation:
                    sinoChamadosAnimar
                    .6s ease;
            }


            /* =============================================
               DROPDOWN
            ============================================= */

            #dropdownNotificacoesChamados {

                position: absolute;

                top: calc(100% + 8px);
                right: 0;

                width: 390px;

                max-width:
                    calc(100vw - 25px);

                background: white;

                border:
                    1px solid
                    #dee2e6;

                border-radius: 10px;

                box-shadow:
                    0 10px 30px
                    rgba(0,0,0,.20);

                overflow: hidden;

                z-index: 100000;
            }


            #dropdownNotificacoesChamados.notif-hidden {
                display: none !important;
            }


            .notif-ch-head {

                display: flex;

                align-items: center;

                justify-content: space-between;

                gap: 10px;

                padding: 12px 14px;

                border-bottom:
                    1px solid
                    #e9ecef;

                background:
                    #fff;
            }


            .notif-ch-head strong {
                font-size: 14px;
            }


            .notif-ch-marcar {

                border: 0;

                background: transparent;

                color: #00ADEE;

                font-size: 11px;

                cursor: pointer;

                padding: 4px;
            }


            .notif-ch-marcar:hover {
                text-decoration: underline;
            }


            /* =============================================
               LISTA
            ============================================= */

            #listaNotificacoesChamados {

                max-height: 430px;

                overflow-y: auto;

                background: white;
            }


            .notif-ch-item {

                width: 100%;

                border: 0;

                border-bottom:
                    1px solid
                    #f0f1f3;

                background: white;

                padding: 11px 13px;

                display: flex;

                gap: 10px;

                cursor: pointer;

                text-align: left;

                transition:
                    background .15s;
            }


            .notif-ch-item:hover {
                background:
                    #f7fafc;
            }


            .notif-ch-item.nao-lida {
                background:
                    #eef9fd;
            }


            .notif-ch-item.nao-lida:hover {
                background:
                    #e2f5fc;
            }


            .notif-ch-icone {

                flex-shrink: 0;

                width: 34px;
                height: 34px;

                border-radius: 50%;

                background:
                    #f1f3f5;

                display: flex;

                align-items: center;

                justify-content: center;

                font-size: 16px;
            }


            .notif-ch-item.nao-lida
            .notif-ch-icone {

                background:
                    #d9f2fc;
            }


            .notif-ch-conteudo {

                min-width: 0;

                flex: 1;
            }


            .notif-ch-titulo {

                font-size: 12px;

                font-weight: 700;

                color: #343a40;

                margin-bottom: 2px;
            }


            .notif-ch-mensagem {

                font-size: 11px;

                color: #6c757d;

                line-height: 1.4;

                overflow: hidden;

                display:
                    -webkit-box;

                -webkit-line-clamp:
                    2;

                -webkit-box-orient:
                    vertical;
            }


            .notif-ch-meta {

                margin-top: 5px;

                font-size: 10px;

                color: #adb5bd;

                display: flex;

                align-items: center;

                gap: 5px;
            }


            .notif-ch-bolinha {

                width: 7px;
                height: 7px;

                border-radius: 50%;

                background:
                    #00ADEE;

                flex-shrink: 0;
            }


            .notif-ch-vazio {

                padding: 35px 15px;

                text-align: center;

                color: #868e96;

                font-size: 12px;
            }


            .notif-ch-vazio i {

                display: block;

                font-size: 28px !important;

                color: #ced4da;

                margin-bottom: 8px;
            }


            /* =============================================
               FOOTER
            ============================================= */

            .notif-ch-footer {

                padding: 9px;

                background:
                    #f8f9fa;

                border-top:
                    1px solid
                    #e9ecef;

                text-align: center;
            }


            .notif-ch-footer button {

                border: 0;

                background: transparent;

                color: #00ADEE;

                font-size: 11px;

                font-weight: 600;

                cursor: pointer;
            }


            @media (
                max-width: 500px
            ) {

                #dropdownNotificacoesChamados {

                    width:
                        calc(100vw - 25px);

                    right: -60px;

                }

            }

        `;


        document.head.appendChild(
            style
        );

    }


    // ========================================================
    // CRIA O SINO
    // ========================================================

    function criarSinoChamados() {

        if (
            document.getElementById(
                'chamadosNotificacaoWrap'
            )
        ) {

            return true;

        }


        const userInfo =
            document.querySelector(
                '#menuSystem .user-info'
            );


        if (!userInfo) {

            return false;

        }


        const wrap =
            document.createElement(
                'div'
            );


        wrap.id =
            'chamadosNotificacaoWrap';


        wrap.innerHTML = `

            <button
                type="button"
                id="btnNotificacoesChamados"
                class="
                    btn
                    btn-sm
                    btn-secondary
                "
                title="Notificações"
                onclick="
                    event.stopPropagation();
                    toggleNotificacoesChamados();
                "
            >

                <i
                    class="
                        fas
                        fa-bell
                    "
                ></i>


                <span
                    id="contadorNotificacoesChamados"
                    class="vazio"
                >
                    0
                </span>

            </button>


            <div
                id="dropdownNotificacoesChamados"
                class="notif-hidden"
                onclick="
                    event.stopPropagation()
                "
            >

                <div
                    class="notif-ch-head"
                >

                    <strong>
                        🔔 Notificações
                    </strong>


                    <button
                        type="button"
                        class="notif-ch-marcar"
                        onclick="
                            marcarTodasNotificacoesChamadosLidas()
                        "
                    >
                        Marcar todas como lidas
                    </button>

                </div>


                <div
                    id="listaNotificacoesChamados"
                >

                    <div
                        class="notif-ch-vazio"
                    >
                        Carregando...
                    </div>

                </div>


                <div
                    class="notif-ch-footer"
                >

                    <button
                        type="button"
                        onclick="
                            abrirSistemaChamados();
                            fecharDropdownNotificacoesChamados();
                        "
                    >
                        Abrir Central de Chamados
                    </button>

                </div>

            </div>

        `;


        // ================================================
        // ENGRENAGEM
        // ================================================

        const engrenagem =
            document.getElementById(
                'menuConfigVisualizacaoWrap'
            );


        /*
         * Se existe engrenagem:
         *
         * SINO | ENGRENAGEM | AVATAR
         */
        if (
            engrenagem &&
            engrenagem.parentNode ===
            userInfo
        ) {

            userInfo.insertBefore(
                wrap,
                engrenagem
            );

        } else {

            // Se não existe engrenagem,
            // coloca antes do primeiro elemento da área do usuário.

            userInfo.insertBefore(
                wrap,
                userInfo.firstChild
            );

        }


        return true;

    }


    // ========================================================
    // ABRIR / FECHAR DROPDOWN
    // ========================================================

    window.toggleNotificacoesChamados =
        async function() {

            const dropdown =
                document.getElementById(
                    'dropdownNotificacoesChamados'
                );


            if (!dropdown) {
                return;
            }


            const vaiAbrir =
                dropdown.classList.contains(
                    'notif-hidden'
                );


            if (
                vaiAbrir
            ) {

                // Fecha engrenagem se estiver aberta
                document
                    .getElementById(
                        'menuConfiguracoesDropdown'
                    )
                    ?.classList
                    .add(
                        'hidden-menu-config'
                    );


                dropdown.classList.remove(
                    'notif-hidden'
                );


                await carregarNotificacoesChamados();

            } else {

                dropdown.classList.add(
                    'notif-hidden'
                );

            }

        };


    window.fecharDropdownNotificacoesChamados =
        function() {

            document
                .getElementById(
                    'dropdownNotificacoesChamados'
                )
                ?.classList
                .add(
                    'notif-hidden'
                );

        };


    // ========================================================
    // CARREGAR NOTIFICAÇÕES
    // ========================================================

    async function carregarNotificacoesChamados() {

        if (
            carregandoNotificacoesChamados
        ) {

            return;

        }


        const sb =
            sbNotificacoesChamados();


        const username =
            usernameAtualNotificacao();


        if (
            !sb ||
            !username
        ) {

            return;

        }


        carregandoNotificacoesChamados =
            true;


        try {

            const {
                data,
                error
            } =
                await sb

                    .from(
                        NOTIF_CHAMADOS_CONFIG
                            .tabela
                    )

                    .select('*')

                    .eq(
                        'destinatario_username',
                        username
                    )

                    .order(
                        'criado_em',
                        {
                            ascending:
                                false
                        }
                    )

                    .limit(
                        NOTIF_CHAMADOS_CONFIG
                            .limiteLista
                    );


            if (error) {

                throw error;

            }


            const anterioresNaoLidas =
                notificacoesChamadosCache
                    .filter(
                        n =>
                            !n.lida
                    )
                    .length;


            notificacoesChamadosCache =
                data ||
                [];


            const novasNaoLidas =
                notificacoesChamadosCache
                    .filter(
                        n =>
                            !n.lida
                    )
                    .length;


            renderizarNotificacoesChamados();


            atualizarBadgeNotificacoesChamados();


            // Anima o sino se aumentou a quantidade
            if (
                novasNaoLidas >
                anterioresNaoLidas
            ) {

                animarSinoChamados();

            }


        } catch (
            error
        ) {

            console.error(
                '❌ Erro carregando notificações:',
                error
            );


        } finally {

            carregandoNotificacoesChamados =
                false;

        }

    }


    // ========================================================
    // BADGE
    // ========================================================

    function atualizarBadgeNotificacoesChamados() {

        const badge =
            document.getElementById(
                'contadorNotificacoesChamados'
            );


        if (!badge) {
            return;
        }


        const qtd =
            notificacoesChamadosCache
                .filter(
                    notif =>
                        !notif.lida
                )
                .length;


        badge.textContent =
            qtd > 99
                ? '99+'
                : qtd;


        badge.classList.toggle(
            'vazio',
            qtd === 0
        );

    }


    function animarSinoChamados() {

        const btn =
            document.getElementById(
                'btnNotificacoesChamados'
            );


        if (!btn) {
            return;
        }


        btn.classList.remove(
            'tem-nova'
        );


        // força reinício da animação
        void btn.offsetWidth;


        btn.classList.add(
            'tem-nova'
        );


        setTimeout(
            () => {

                btn.classList.remove(
                    'tem-nova'
                );

            },
            800
        );

    }


    // ========================================================
    // RENDERIZA LISTA
    // ========================================================

    function renderizarNotificacoesChamados() {

        const lista =
            document.getElementById(
                'listaNotificacoesChamados'
            );


        if (!lista) {
            return;
        }


        if (
            !notificacoesChamadosCache.length
        ) {

            lista.innerHTML = `

                <div
                    class="notif-ch-vazio"
                >

                    <i
                        class="
                            far
                            fa-bell
                        "
                    ></i>

                    Nenhuma notificação.

                </div>

            `;


            return;

        }


        lista.innerHTML =
            notificacoesChamadosCache

                .map(
                    notif => {

                        const icone =
                            iconeTipoNotificacao(
                                notif.tipo
                            );


                        return `

                            <button
                                type="button"
                                class="
                                    notif-ch-item
                                    ${
                                        !notif.lida
                                            ? 'nao-lida'
                                            : ''
                                    }
                                "
                                onclick="
                                    abrirNotificacaoChamados(
                                        ${Number(notif.id)},
                                        ${Number(notif.chamado_id)}
                                    )
                                "
                            >

                                <div
                                    class="notif-ch-icone"
                                >
                                    ${icone}
                                </div>


                                <div
                                    class="notif-ch-conteudo"
                                >

                                    <div
                                        class="notif-ch-titulo"
                                    >

                                        ${escaparNotif(
                                            notif.titulo ||
                                            'Atualização no chamado'
                                        )}

                                    </div>


                                    ${
                                        notif.mensagem

                                            ? `

                                                <div
                                                    class="notif-ch-mensagem"
                                                >
                                                    ${escaparNotif(
                                                        notif.mensagem
                                                    )}
                                                </div>

                                            `

                                            : ''
                                    }


                                    <div
                                        class="notif-ch-meta"
                                    >

                                        ${
                                            !notif.lida

                                                ? `
                                                    <span
                                                        class="notif-ch-bolinha"
                                                    ></span>
                                                `

                                                : ''
                                        }


                                        #${numeroChamadoNotif(
                                            notif.chamado_id
                                        )}

                                        •

                                        ${escaparNotif(
                                            formatarDataNotif(
                                                notif.criado_em
                                            )
                                        )}

                                    </div>

                                </div>

                            </button>

                        `;

                    }
                )

                .join('');

    }


    // ========================================================
    // MARCAR UMA COMO LIDA
    // ========================================================

    async function marcarNotificacaoChamadosLida(
        id
    ) {

        const sb =
            sbNotificacoesChamados();


        if (!sb) {
            return false;
        }


        try {

            const {
                error
            } =
                await sb

                    .from(
                        NOTIF_CHAMADOS_CONFIG
                            .tabela
                    )

                    .update({

                        lida:
                            true,

                        lida_em:
                            new Date()
                                .toISOString()

                    })

                    .eq(
                        'id',
                        id
                    )

                    .eq(
                        'destinatario_username',
                        usernameAtualNotificacao()
                    );


            if (error) {

                throw error;

            }


            const local =
                notificacoesChamadosCache
                    .find(
                        notif =>
                            Number(
                                notif.id
                            ) ===
                            Number(
                                id
                            )
                    );


            if (local) {

                local.lida =
                    true;


                local.lida_em =
                    new Date()
                        .toISOString();

            }


            atualizarBadgeNotificacoesChamados();


            renderizarNotificacoesChamados();


            return true;


        } catch (
            error
        ) {

            console.error(
                '❌ Erro marcando notificação como lida:',
                error
            );


            return false;

        }

    }


    // ========================================================
    // MARCAR TODAS COMO LIDAS
    // ========================================================

    window.marcarTodasNotificacoesChamadosLidas =
        async function() {

            const sb =
                sbNotificacoesChamados();


            const username =
                usernameAtualNotificacao();


            if (
                !sb ||
                !username
            ) {

                return;

            }


            try {

                const agora =
                    new Date()
                        .toISOString();


                const {
                    error
                } =
                    await sb

                        .from(
                            NOTIF_CHAMADOS_CONFIG
                                .tabela
                        )

                        .update({

                            lida:
                                true,

                            lida_em:
                                agora

                        })

                        .eq(
                            'destinatario_username',
                            username
                        )

                        .eq(
                            'lida',
                            false
                        );


                if (error) {

                    throw error;

                }


                notificacoesChamadosCache
                    .forEach(
                        notif => {

                            notif.lida =
                                true;


                            notif.lida_em =
                                agora;

                        }
                    );


                renderizarNotificacoesChamados();


                atualizarBadgeNotificacoesChamados();


            } catch (
                error
            ) {

                console.error(
                    '❌ Erro marcando notificações:',
                    error
                );

            }

        };


    // ========================================================
    // ABRIR NOTIFICAÇÃO
    // ========================================================

    window.abrirNotificacaoChamados =
        async function(
            notificacaoId,
            chamadoId
        ) {

            await marcarNotificacaoChamadosLida(
                notificacaoId
            );


            window
                .fecharDropdownNotificacoesChamados();


            // ================================================
            // ABRE A CENTRAL
            // ================================================

            if (
                typeof window
                    .abrirSistemaChamados ===
                'function'
            ) {

                await window
                    .abrirSistemaChamados();

            }


            // ================================================
            // ABRE DIRETAMENTE O CHAMADO
            // ================================================

            if (
                typeof window
                    .abrirDetalhesChamado ===
                'function'
            ) {

                await window
                    .abrirDetalhesChamado(
                        chamadoId
                    );

            }

        };


    // ========================================================
    // VERIFICA MUDANÇA DE USUÁRIO
    // ========================================================

    function verificarUsuarioNotificacoes() {

        const atual =
            usernameAtualNotificacao();


        if (!atual) {

            usuarioNotificacaoAtual =
                null;


            notificacoesChamadosCache =
                [];


            atualizarBadgeNotificacoesChamados();


            return;

        }


        if (
            atual !==
            usuarioNotificacaoAtual
        ) {

            usuarioNotificacaoAtual =
                atual;


            notificacoesChamadosCache =
                [];


            carregarNotificacoesChamados();

        }

    }


    // ========================================================
    // FECHAR CLICANDO FORA
    // ========================================================

    document.addEventListener(
        'click',
        event => {

            const wrap =
                document.getElementById(
                    'chamadosNotificacaoWrap'
                );


            if (
                wrap &&
                !wrap.contains(
                    event.target
                )
            ) {

                window
                    .fecharDropdownNotificacoesChamados();

            }

        }
    );


    // ========================================================
    // ESC
    // ========================================================

    document.addEventListener(
        'keydown',
        event => {

            if (
                event.key ===
                'Escape'
            ) {

                window
                    .fecharDropdownNotificacoesChamados();

            }

        }
    );


    // ========================================================
    // INICIALIZAÇÃO
    // ========================================================

    function iniciarNotificacoesChamados() {

        injetarCSSNotificacoesChamados();


        criarSinoChamados();


        verificarUsuarioNotificacoes();


        if (
            timerNotificacoesChamados
        ) {

            clearInterval(
                timerNotificacoesChamados
            );

        }


        timerNotificacoesChamados =
            setInterval(
                () => {

                    criarSinoChamados();

                    verificarUsuarioNotificacoes();


                    if (
                        usernameAtualNotificacao()
                    ) {

                        carregarNotificacoesChamados();

                    }

                },
                NOTIF_CHAMADOS_CONFIG
                    .intervaloAtualizacao
            );


        // Algumas áreas do menu aparecem depois do login
        setTimeout(
            criarSinoChamados,
            500
        );


        setTimeout(
            criarSinoChamados,
            1500
        );


        setTimeout(
            () => {

                criarSinoChamados();

                verificarUsuarioNotificacoes();

                carregarNotificacoesChamados();

            },
            3000
        );

    }


    if (
        document.readyState ===
        'loading'
    ) {

        document.addEventListener(
            'DOMContentLoaded',
            () => {

                setTimeout(
                    iniciarNotificacoesChamados,
                    300
                );

            }
        );

    } else {

        setTimeout(
            iniciarNotificacoesChamados,
            200
        );

    }


    // ========================================================
    // EXPÕE FUNÇÕES
    // ========================================================

    window.carregarNotificacoesChamados =
        carregarNotificacoesChamados;


    window.obterAdminsNotificacoesChamados =
        obterAdminsNotificacoesChamados;

})();