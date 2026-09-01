// ============================================================
// NOTIFICAÇÕES DA CENTRAL DE CHAMADOS
// WHEEL TECH
// Arquivo: notificacoes_chamados.js
//
// VERSÃO ATUALIZADA
//
// - Sino aparece sempre no menu
// - Fica antes da engrenagem
// - Badge vermelho aparece SEM precisar clicar
// - Consulta automática a cada 3 segundos
// - Tenta usar Supabase Realtime
// - Atualiza ao voltar para a aba do navegador
// - Persiste até a notificação ser lida
// - Clique abre diretamente o chamado
// ============================================================

(function () {

    'use strict';


    // ========================================================
    // CONFIGURAÇÃO
    // ========================================================

    const NOTIF_CHAMADOS_CONFIG = {

        tabela:
            'chamados_notificacoes',

        // Fallback caso Realtime não esteja habilitado
        intervaloAtualizacao:
            3000,

        limiteLista:
            30

    };


    // ========================================================
    // ESTADO
    // ========================================================

    let notificacoesChamadosCache =
        [];


    let timerNotificacoesChamados =
        null;


    let usuarioNotificacaoAtual =
        null;


    let carregandoNotificacoesChamados =
        false;


    let totalNaoLidasChamados =
        0;


    // ========================================================
    // REALTIME
    // ========================================================

    let canalRealtimeNotificacoesChamados =
        null;


    let usuarioRealtimeNotificacoesChamados =
        null;


    // ========================================================
    // AUXILIARES
    // ========================================================

    function sbNotificacoesChamados() {

        if (
            window.supabaseClient
        ) {

            return (
                window.supabaseClient
            );

        }


        // Fallback para o supabaseClient global
        // existente no script.js
        try {

            if (
                typeof supabaseClient !==
                    'undefined' &&
                supabaseClient
            ) {

                return (
                    supabaseClient
                );

            }

        } catch (
            erro
        ) {

            // ignora

        }


        return null;

    }


    // ========================================================
    // USUÁRIO ATUAL
    // ========================================================

    function usuarioAtualNotificacoes() {

        // Primeiro tenta window.currentUser
        if (
            window.currentUser
        ) {

            return (
                window.currentUser
            );

        }


        // Fallback pela sessão salva
        try {

            const salvo =
                localStorage.getItem(
                    'wheeltech_user'
                );


            if (
                salvo
            ) {

                const usuario =
                    JSON.parse(
                        salvo
                    );


                if (
                    usuario &&
                    (
                        usuario.username ||
                        usuario.name
                    )
                ) {

                    return usuario;

                }

            }

        } catch (
            erro
        ) {

            console.warn(
                '⚠️ Não foi possível recuperar usuário para o sino:',
                erro
            );

        }


        return null;

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


        if (
            !usuario
        ) {

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


    // ========================================================
    // ESCAPE
    // ========================================================

    function escaparNotif(
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
    // DATA
    // ========================================================

    function formatarDataNotif(
        valor
    ) {

        if (
            !valor
        ) {

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


    // ========================================================
    // NÚMERO DO CHAMADO
    // ========================================================

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


    // ========================================================
    // ÍCONES
    // ========================================================

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
    // ========================================================

    function obterAdminsNotificacoesChamados() {

        let admins =
            [];


        // ================================================
        // PRIMEIRO:
        // SYSTEM_USERS
        // ================================================

        try {

            if (
                typeof SYSTEM_USERS !==
                    'undefined' &&
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

                                    role ===
                                        'admin'

                                    ||

                                    role ===
                                        'administrador'

                                    ||

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

        } catch (
            erro
        ) {

            console.warn(
                '⚠️ SYSTEM_USERS não disponível para notificações:',
                erro
            );

        }


        // ================================================
        // FALLBACK:
        // CFG_CHAMADOS
        // ================================================

        if (
            !admins.length
        ) {

            try {

                if (
                    window.CFG_CHAMADOS &&
                    Array.isArray(
                        window.CFG_CHAMADOS
                            .admins
                    )
                ) {

                    admins =
                        window.CFG_CHAMADOS
                            .admins

                            .map(
                                normalizarUsuarioNotificacao
                            )

                            .filter(
                                Boolean
                            );

                }

            } catch (
                erro
            ) {

                console.warn(
                    '⚠️ CFG_CHAMADOS não disponível:',
                    erro
                );

            }

        }


        // ================================================
        // ÚLTIMO FALLBACK
        // ================================================

        if (
            !admins.length
        ) {

            admins = [

                'andressamiotto',
                'ronald',
                'leticia'

            ];

        }


        return [
            ...new Set(
                admins
            )
        ];

    }


    // ========================================================
    // CRIAR UMA NOTIFICAÇÃO
    //
    // USADA PELO chamados.js
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


            if (
                !sb
            ) {

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


            // ================================================
            // NÃO CRIA NOTIFICAÇÃO PARA A PRÓPRIA PESSOA
            // ================================================

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


                if (
                    error
                ) {

                    throw error;

                }


                console.log(
                    '🔔 Notificação criada para:',
                    destinatario
                );


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

                display: inline-flex !important;

                align-items: center;

                flex-shrink: 0;

            }


            /* =============================================
               SINO
            ============================================= */

            #btnNotificacoesChamados {

                position: relative;

                width: 34px;
                min-width: 34px;

                height: 34px;
                min-height: 34px;

                padding: 0 !important;

                margin: 0 !important;

                border-radius: 8px;

                display: inline-flex !important;

                align-items: center;

                justify-content: center;

                cursor: pointer;

            }


            #btnNotificacoesChamados i {

                font-size: 15px !important;

                line-height: 1;

            }


            /* =============================================
               CONTADOR VERMELHO
            ============================================= */

            #contadorNotificacoesChamados {

                position: absolute;

                top: -6px;
                right: -7px;

                min-width: 18px;

                height: 18px;

                padding: 0 5px;

                border-radius: 10px;

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

                z-index: 5;

                pointer-events: none;

            }


            #contadorNotificacoesChamados.vazio {

                display: none !important;

            }


            /* =============================================
               ANIMAÇÃO
            ============================================= */

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

                top:
                    calc(
                        100% + 8px
                    );

                right: 0;

                width: 390px;

                max-width:
                    calc(
                        100vw - 25px
                    );

                background: white;

                border:
                    1px solid
                    #dee2e6;

                border-radius:
                    10px;

                box-shadow:
                    0 10px 30px
                    rgba(
                        0,
                        0,
                        0,
                        .20
                    );

                overflow: hidden;

                z-index: 100000;

            }


            #dropdownNotificacoesChamados.notif-hidden {

                display: none !important;

            }


            /* =============================================
               CABEÇALHO
            ============================================= */

            .notif-ch-head {

                display: flex;

                align-items: center;

                justify-content:
                    space-between;

                gap: 10px;

                padding:
                    12px 14px;

                border-bottom:
                    1px solid
                    #e9ecef;

                background:
                    #fff;

            }


            .notif-ch-head strong {

                font-size:
                    14px;

            }


            .notif-ch-marcar {

                border: 0;

                background:
                    transparent;

                color:
                    #00ADEE;

                font-size:
                    11px;

                cursor:
                    pointer;

                padding:
                    4px;

            }


            .notif-ch-marcar:hover {

                text-decoration:
                    underline;

            }


            /* =============================================
               LISTA
            ============================================= */

            #listaNotificacoesChamados {

                max-height:
                    430px;

                overflow-y:
                    auto;

                background:
                    white;

            }


            .notif-ch-item {

                width:
                    100%;

                border:
                    0;

                border-bottom:
                    1px solid
                    #f0f1f3;

                background:
                    white;

                padding:
                    11px 13px;

                display:
                    flex;

                gap:
                    10px;

                cursor:
                    pointer;

                text-align:
                    left;

                transition:
                    background
                    .15s;

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

                flex-shrink:
                    0;

                width:
                    34px;

                height:
                    34px;

                border-radius:
                    50%;

                background:
                    #f1f3f5;

                display:
                    flex;

                align-items:
                    center;

                justify-content:
                    center;

                font-size:
                    16px;

            }


            .notif-ch-item.nao-lida
            .notif-ch-icone {

                background:
                    #d9f2fc;

            }


            .notif-ch-conteudo {

                min-width:
                    0;

                flex:
                    1;

            }


            .notif-ch-titulo {

                font-size:
                    12px;

                font-weight:
                    700;

                color:
                    #343a40;

                margin-bottom:
                    2px;

            }


            .notif-ch-mensagem {

                font-size:
                    11px;

                color:
                    #6c757d;

                line-height:
                    1.4;

                overflow:
                    hidden;

                display:
                    -webkit-box;

                -webkit-line-clamp:
                    2;

                -webkit-box-orient:
                    vertical;

            }


            .notif-ch-meta {

                margin-top:
                    5px;

                font-size:
                    10px;

                color:
                    #adb5bd;

                display:
                    flex;

                align-items:
                    center;

                gap:
                    5px;

            }


            .notif-ch-bolinha {

                width:
                    7px;

                height:
                    7px;

                border-radius:
                    50%;

                background:
                    #00ADEE;

                flex-shrink:
                    0;

            }


            .notif-ch-vazio {

                padding:
                    35px 15px;

                text-align:
                    center;

                color:
                    #868e96;

                font-size:
                    12px;

            }


            .notif-ch-vazio i {

                display:
                    block;

                font-size:
                    28px !important;

                color:
                    #ced4da;

                margin-bottom:
                    8px;

            }


            /* =============================================
               RODAPÉ
            ============================================= */

            .notif-ch-footer {

                padding:
                    9px;

                background:
                    #f8f9fa;

                border-top:
                    1px solid
                    #e9ecef;

                text-align:
                    center;

            }


            .notif-ch-footer button {

                border:
                    0;

                background:
                    transparent;

                color:
                    #00ADEE;

                font-size:
                    11px;

                font-weight:
                    600;

                cursor:
                    pointer;

            }


            /* =============================================
               MOBILE
            ============================================= */

            @media (
                max-width: 500px
            ) {

                #dropdownNotificacoesChamados {

                    width:
                        calc(
                            100vw - 25px
                        );

                    right:
                        -60px;

                }

            }

        `;


        document.head.appendChild(
            style
        );

    }


    // ========================================================
    // LOCALIZA O CABEÇALHO DO MENU
    // ========================================================

    function obterUserInfoMenuChamados() {

        const menuSystem =
            document.getElementById(
                'menuSystem'
            );


        if (
            !menuSystem
        ) {

            return null;

        }


        return (

            menuSystem.querySelector(
                '.main-header .user-info'
            )

            ||

            menuSystem.querySelector(
                '.user-info'
            )

        );

    }


    // ========================================================
    // CRIA O SINO
    // ========================================================

    function criarSinoChamados() {

        // ================================================
        // JÁ EXISTE
        // ================================================

        const existente =
            document.getElementById(
                'chamadosNotificacaoWrap'
            );


        if (
            existente
        ) {

            // Garante que não ficou oculto
            existente.style.display =
                'inline-flex';


            return true;

        }


        const userInfo =
            obterUserInfoMenuChamados();


        if (
            !userInfo
        ) {

            return false;

        }


        // ================================================
        // CRIA
        // ================================================

        const wrap =
            document.createElement(
                'div'
            );


        wrap.id =
            'chamadosNotificacaoWrap';


        wrap.style.position =
            'relative';


        wrap.style.display =
            'inline-flex';


        wrap.style.alignItems =
            'center';


        wrap.style.flexShrink =
            '0';


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
                    event.stopPropagation();
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
                            marcarTodasNotificacoesChamadosLidas();
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

                        <i
                            class="
                                far
                                fa-bell
                            "
                        ></i>

                        Nenhuma notificação.

                    </div>

                </div>


                <div
                    class="notif-ch-footer"
                >

                    <button
                        type="button"

                        onclick="
                            abrirCentralChamadosPeloSino();
                        "
                    >
                        Abrir Central de Chamados
                    </button>

                </div>

            </div>

        `;


        // ================================================
        // POSIÇÃO:
        //
        // SINO | ENGRENAGEM | AVATAR
        // ================================================

        const engrenagem =
            document.getElementById(
                'menuConfigVisualizacaoWrap'
            );


        if (
            engrenagem &&
            engrenagem.parentElement ===
                userInfo
        ) {

            userInfo.insertBefore(
                wrap,
                engrenagem
            );

        } else {

            userInfo.insertBefore(
                wrap,
                userInfo.firstChild
            );

        }


        console.log(
            '✅ Sino de chamados criado.'
        );


        // Se já temos dados carregados,
        // aplica o contador imediatamente
        atualizarBadgeNotificacoesChamados(
            totalNaoLidasChamados
        );


        return true;

    }


    // ========================================================
    // GARANTE QUE O SINO EXISTA
    // ========================================================

    function garantirSinoChamados() {

        const criado =
            criarSinoChamados();


        if (
            !criado
        ) {

            return false;

        }


        const wrap =
            document.getElementById(
                'chamadosNotificacaoWrap'
            );


        if (
            wrap
        ) {

            wrap.style.display =
                'inline-flex';

        }


        return true;

    }


    // ========================================================
    // ABRIR / FECHAR DROPDOWN
    // ========================================================

    window.toggleNotificacoesChamados =
        async function() {

            garantirSinoChamados();


            const dropdown =
                document.getElementById(
                    'dropdownNotificacoesChamados'
                );


            if (
                !dropdown
            ) {

                return;

            }


            const vaiAbrir =
                dropdown.classList.contains(
                    'notif-hidden'
                );


            if (
                vaiAbrir
            ) {

                // ========================================
                // FECHA ENGRENAGEM
                // ========================================

                const menuEngrenagem =
                    document.getElementById(
                        'menuConfiguracoesDropdown'
                    );


                if (
                    menuEngrenagem
                ) {

                    menuEngrenagem
                        .classList
                        .add(
                            'hidden-menu-config'
                        );

                }


                // ========================================
                // ABRE NOTIFICAÇÕES
                // ========================================

                dropdown
                    .classList
                    .remove(
                        'notif-hidden'
                    );


                // Recarrega por garantia.
                // MAS o contador não depende deste clique.
                await carregarNotificacoesChamados();


            } else {

                dropdown
                    .classList
                    .add(
                        'notif-hidden'
                    );

            }

        };


    window.fecharDropdownNotificacoesChamados =
        function() {

            const dropdown =
                document.getElementById(
                    'dropdownNotificacoesChamados'
                );


            if (
                !dropdown
            ) {

                return;

            }


            dropdown
                .classList
                .add(
                    'notif-hidden'
                );

        };


    // ========================================================
    // CARREGAR NOTIFICAÇÕES
    //
    // ESTA É A FUNÇÃO QUE ATUALIZA O VERMELHINHO SEM CLIQUE.
    // ========================================================

    async function carregarNotificacoesChamados() {

        if (
            carregandoNotificacoesChamados
        ) {

            return;

        }


        // O sino deve existir mesmo antes
        // de conseguirmos consultar o banco.
        garantirSinoChamados();


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

            // ================================================
            // LISTA
            // ================================================

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


            if (
                error
            ) {

                throw error;

            }


            const quantidadeAnterior =
                totalNaoLidasChamados;


            notificacoesChamadosCache =
                data ||
                [];


            // ================================================
            // CONTAGEM EXATA DE NÃO LIDAS
            // ================================================

            let quantidadeNaoLidas =
                notificacoesChamadosCache
                    .filter(
                        notificacao =>
                            !notificacao.lida
                    )
                    .length;


            try {

                const {
                    count,
                    error:
                        erroCount
                } =
                    await sb

                        .from(
                            NOTIF_CHAMADOS_CONFIG
                                .tabela
                        )

                        .select(
                            'id',
                            {

                                count:
                                    'exact',

                                head:
                                    true

                            }
                        )

                        .eq(
                            'destinatario_username',
                            username
                        )

                        .eq(
                            'lida',
                            false
                        );


                if (
                    !erroCount &&
                    count !== null &&
                    count !== undefined
                ) {

                    quantidadeNaoLidas =
                        Number(
                            count
                        );

                }

            } catch (
                erroContagem
            ) {

                console.warn(
                    '⚠️ Usando contagem local das notificações:',
                    erroContagem
                );

            }


            totalNaoLidasChamados =
                quantidadeNaoLidas;


            // ================================================
            // RENDERIZA LISTA
            // ================================================

            renderizarNotificacoesChamados();


            // ================================================
            // ATUALIZA O BADGE VERMELHO
            // ================================================

            atualizarBadgeNotificacoesChamados(
                quantidadeNaoLidas
            );


            // ================================================
            // CHEGOU NOVA
            // ================================================

            if (
                quantidadeNaoLidas >
                quantidadeAnterior
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
    // BADGE VERMELHO
    // ========================================================

    function atualizarBadgeNotificacoesChamados(
        quantidadeForcada = null
    ) {

        garantirSinoChamados();


        const badge =
            document.getElementById(
                'contadorNotificacoesChamados'
            );


        if (
            !badge
        ) {

            return;

        }


        let qtd;


        if (
            quantidadeForcada !== null &&
            quantidadeForcada !== undefined
        ) {

            qtd =
                Number(
                    quantidadeForcada
                );


        } else {

            qtd =
                notificacoesChamadosCache
                    .filter(
                        notificacao =>
                            !notificacao.lida
                    )
                    .length;

        }


        if (
            !Number.isFinite(
                qtd
            ) ||
            qtd < 0
        ) {

            qtd =
                0;

        }


        totalNaoLidasChamados =
            qtd;


        badge.textContent =
            qtd > 99
                ? '99+'
                : String(
                    qtd
                );


        if (
            qtd > 0
        ) {

            badge
                .classList
                .remove(
                    'vazio'
                );


            badge.style.display =
                'flex';


        } else {

            badge
                .classList
                .add(
                    'vazio'
                );


            badge.style.display =
                'none';

        }

    }


    // ========================================================
    // ANIMAR SINO
    // ========================================================

    function animarSinoChamados() {

        const btn =
            document.getElementById(
                'btnNotificacoesChamados'
            );


        if (
            !btn
        ) {

            return;

        }


        btn
            .classList
            .remove(
                'tem-nova'
            );


        // Reinicia a animação
        void btn.offsetWidth;


        btn
            .classList
            .add(
                'tem-nova'
            );


        setTimeout(
            () => {

                btn
                    .classList
                    .remove(
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


        if (
            !lista
        ) {

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
                    notificacao => {

                        const icone =
                            iconeTipoNotificacao(
                                notificacao.tipo
                            );


                        return `

                            <button
                                type="button"

                                class="
                                    notif-ch-item

                                    ${
                                        !notificacao.lida
                                            ? 'nao-lida'
                                            : ''
                                    }
                                "

                                onclick="
                                    abrirNotificacaoChamados(
                                        ${Number(
                                            notificacao.id
                                        )},

                                        ${Number(
                                            notificacao.chamado_id
                                        )}
                                    );
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
                                            notificacao.titulo ||
                                            'Atualização no chamado'
                                        )}

                                    </div>


                                    ${
                                        notificacao.mensagem

                                            ? `

                                                <div
                                                    class="notif-ch-mensagem"
                                                >

                                                    ${escaparNotif(
                                                        notificacao.mensagem
                                                    )}

                                                </div>

                                            `

                                            : ''
                                    }


                                    <div
                                        class="notif-ch-meta"
                                    >

                                        ${
                                            !notificacao.lida

                                                ? `

                                                    <span
                                                        class="notif-ch-bolinha"
                                                    ></span>

                                                `

                                                : ''
                                        }


                                        #${numeroChamadoNotif(
                                            notificacao.chamado_id
                                        )}

                                        •

                                        ${escaparNotif(
                                            formatarDataNotif(
                                                notificacao.criado_em
                                            )
                                        )}

                                    </div>

                                </div>

                            </button>

                        `;

                    }
                )

                .join(
                    ''
                );

    }


    // ========================================================
    // MARCAR UMA COMO LIDA
    // ========================================================

    async function marcarNotificacaoChamadosLida(
        id
    ) {

        const sb =
            sbNotificacoesChamados();


        const username =
            usernameAtualNotificacao();


        if (
            !sb ||
            !username
        ) {

            return false;

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
                        'id',
                        id
                    )

                    .eq(
                        'destinatario_username',
                        username
                    );


            if (
                error
            ) {

                throw error;

            }


            // ================================================
            // ATUALIZA LOCAL
            // ================================================

            const local =
                notificacoesChamadosCache
                    .find(
                        notificacao =>

                            Number(
                                notificacao.id
                            ) ===
                            Number(
                                id
                            )
                    );


            if (
                local
            ) {

                local.lida =
                    true;


                local.lida_em =
                    agora;

            }


            totalNaoLidasChamados =
                Math.max(
                    0,
                    totalNaoLidasChamados -
                    1
                );


            atualizarBadgeNotificacoesChamados(
                totalNaoLidasChamados
            );


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


                if (
                    error
                ) {

                    throw error;

                }


                notificacoesChamadosCache
                    .forEach(
                        notificacao => {

                            notificacao.lida =
                                true;


                            notificacao.lida_em =
                                agora;

                        }
                    );


                totalNaoLidasChamados =
                    0;


                atualizarBadgeNotificacoesChamados(
                    0
                );


                renderizarNotificacoesChamados();


            } catch (
                error
            ) {

                console.error(
                    '❌ Erro marcando notificações como lidas:',
                    error
                );

            }

        };


    // ========================================================
    // ABRIR UMA NOTIFICAÇÃO
    // ========================================================

    window.abrirNotificacaoChamados =
        async function(
            notificacaoId,
            chamadoId
        ) {

            // Marca somente esta como lida
            await marcarNotificacaoChamadosLida(
                notificacaoId
            );


            window
                .fecharDropdownNotificacoesChamados();


            // ================================================
            // ABRE CENTRAL DE CHAMADOS
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


            // Atualiza contador do sino
            await carregarNotificacoesChamados();

        };


    // ========================================================
    // ABRIR CENTRAL PELO RODAPÉ DO SINO
    // ========================================================

    window.abrirCentralChamadosPeloSino =
        async function() {

            window
                .fecharDropdownNotificacoesChamados();


            if (
                typeof window
                    .abrirSistemaChamados ===
                'function'
            ) {

                await window
                    .abrirSistemaChamados();

            }

        };


    // ========================================================
    // REMOVER REALTIME
    // ========================================================

    async function removerRealtimeNotificacoesChamados() {

        if (
            !canalRealtimeNotificacoesChamados
        ) {

            usuarioRealtimeNotificacoesChamados =
                null;


            return;

        }


        const sb =
            sbNotificacoesChamados();


        try {

            if (
                sb &&
                typeof sb.removeChannel ===
                    'function'
            ) {

                await sb.removeChannel(
                    canalRealtimeNotificacoesChamados
                );

            }

        } catch (
            erro
        ) {

            console.warn(
                '⚠️ Erro removendo Realtime do sino:',
                erro
            );

        }


        canalRealtimeNotificacoesChamados =
            null;


        usuarioRealtimeNotificacoesChamados =
            null;

    }


    // ========================================================
    // INSTALAR REALTIME
    // ========================================================

    async function instalarRealtimeNotificacoesChamados(
        username
    ) {

        const sb =
            sbNotificacoesChamados();


        if (
            !sb ||
            !username
        ) {

            return;

        }


        // ================================================
        // SUPABASE CLIENT SEM REALTIME?
        // Tudo bem. Polling continuará funcionando.
        // ================================================

        if (
            typeof sb.channel !==
            'function'
        ) {

            return;

        }


        // ================================================
        // JÁ INSTALADO PARA ESTE USUÁRIO
        // ================================================

        if (
            canalRealtimeNotificacoesChamados &&
            usuarioRealtimeNotificacoesChamados ===
                username
        ) {

            return;

        }


        await removerRealtimeNotificacoesChamados();


        usuarioRealtimeNotificacoesChamados =
            username;


        try {

            canalRealtimeNotificacoesChamados =
                sb

                    .channel(
                        `notificacoes-chamados-${username}-${Date.now()}`
                    )

                    // ========================================
                    // INSERT
                    // ========================================

                    .on(
                        'postgres_changes',

                        {

                            event:
                                'INSERT',

                            schema:
                                'public',

                            table:
                                NOTIF_CHAMADOS_CONFIG
                                    .tabela,

                            filter:
                                `destinatario_username=eq.${username}`

                        },

                        async payload => {

                            console.log(
                                '🔔 Nova notificação recebida:',
                                payload.new
                            );


                            // Força atualização imediata
                            await carregarNotificacoesChamados();

                        }
                    )

                    // ========================================
                    // UPDATE
                    // ========================================

                    .on(
                        'postgres_changes',

                        {

                            event:
                                'UPDATE',

                            schema:
                                'public',

                            table:
                                NOTIF_CHAMADOS_CONFIG
                                    .tabela,

                            filter:
                                `destinatario_username=eq.${username}`

                        },

                        async payload => {

                            console.log(
                                '🔔 Notificação atualizada:',
                                payload.new
                            );


                            await carregarNotificacoesChamados();

                        }
                    )

                    .subscribe(
                        status => {

                            console.log(
                                '🔔 Realtime notificações:',
                                status
                            );

                        }
                    );


        } catch (
            erro
        ) {

            console.warn(
                '⚠️ Realtime do sino indisponível. O polling de 3 segundos continuará funcionando:',
                erro
            );


            canalRealtimeNotificacoesChamados =
                null;

        }

    }


    // ========================================================
    // VERIFICAR LOGIN / TROCA DE USUÁRIO
    // ========================================================

    async function verificarUsuarioNotificacoes() {

        // Sino deve existir independentemente
        // de haver ou não notificações.
        garantirSinoChamados();


        const atual =
            usernameAtualNotificacao();


        // ================================================
        // NÃO LOGADO
        // ================================================

        if (
            !atual
        ) {

            if (
                usuarioNotificacaoAtual
            ) {

                usuarioNotificacaoAtual =
                    null;


                notificacoesChamadosCache =
                    [];


                totalNaoLidasChamados =
                    0;


                atualizarBadgeNotificacoesChamados(
                    0
                );


                await removerRealtimeNotificacoesChamados();

            }


            return;

        }


        // ================================================
        // LOGIN NOVO / USUÁRIO DIFERENTE
        // ================================================

        if (
            atual !==
            usuarioNotificacaoAtual
        ) {

            console.log(
                '🔔 Iniciando notificações para:',
                atual
            );


            usuarioNotificacaoAtual =
                atual;


            notificacoesChamadosCache =
                [];


            totalNaoLidasChamados =
                0;


            // Primeiro consulta imediatamente
            await carregarNotificacoesChamados();


            // Depois instala Realtime
            await instalarRealtimeNotificacoesChamados(
                atual
            );


            return;

        }


        // ================================================
        // GARANTE REALTIME
        // ================================================

        if (
            !canalRealtimeNotificacoesChamados
        ) {

            await instalarRealtimeNotificacoesChamados(
                atual
            );

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
    // VOLTOU PARA A ABA DO NAVEGADOR
    // ========================================================

    document.addEventListener(
        'visibilitychange',
        async () => {

            if (
                document.visibilityState !==
                'visible'
            ) {

                return;

            }


            garantirSinoChamados();


            await verificarUsuarioNotificacoes();


            if (
                usernameAtualNotificacao()
            ) {

                await carregarNotificacoesChamados();

            }

        }
    );


    // ========================================================
    // JANELA GANHOU FOCO
    // ========================================================

    window.addEventListener(
        'focus',
        async () => {

            garantirSinoChamados();


            await verificarUsuarioNotificacoes();


            if (
                usernameAtualNotificacao()
            ) {

                await carregarNotificacoesChamados();

            }

        }
    );


    // ========================================================
    // INICIALIZAÇÃO
    // ========================================================

    function iniciarNotificacoesChamados() {

        console.log(
            '🔔 Inicializando notificações de chamados...'
        );


        // ================================================
        // CSS
        // ================================================

        injetarCSSNotificacoesChamados();


        // ================================================
        // SINO
        // ================================================

        garantirSinoChamados();


        // ================================================
        // PRIMEIRA VERIFICAÇÃO
        // ================================================

        verificarUsuarioNotificacoes();


        // ================================================
        // POLLING
        //
        // Atualiza automaticamente sem clicar.
        // ================================================

        if (
            timerNotificacoesChamados
        ) {

            clearInterval(
                timerNotificacoesChamados
            );

        }


        timerNotificacoesChamados =
            setInterval(
                async () => {

                    try {

                        // Se por algum motivo o sino foi
                        // removido/recriado, coloca novamente.
                        garantirSinoChamados();


                        await verificarUsuarioNotificacoes();


                        if (
                            usernameAtualNotificacao()
                        ) {

                            await carregarNotificacoesChamados();

                        }


                    } catch (
                        erro
                    ) {

                        console.warn(
                            '⚠️ Erro na atualização automática do sino:',
                            erro
                        );

                    }

                },
                NOTIF_CHAMADOS_CONFIG
                    .intervaloAtualizacao
            );


        // ================================================
        // TENTATIVAS EXTRAS
        //
        // Caso o cabeçalho tenha sido criado depois.
        // ================================================

        setTimeout(
            async () => {

                garantirSinoChamados();

                await verificarUsuarioNotificacoes();


                if (
                    usernameAtualNotificacao()
                ) {

                    await carregarNotificacoesChamados();

                }

            },
            300
        );


        setTimeout(
            async () => {

                garantirSinoChamados();

                await verificarUsuarioNotificacoes();


                if (
                    usernameAtualNotificacao()
                ) {

                    await carregarNotificacoesChamados();

                }

            },
            800
        );


        setTimeout(
            async () => {

                garantirSinoChamados();

                await verificarUsuarioNotificacoes();


                if (
                    usernameAtualNotificacao()
                ) {

                    await carregarNotificacoesChamados();

                }

            },
            1500
        );


        setTimeout(
            async () => {

                garantirSinoChamados();

                await verificarUsuarioNotificacoes();


                if (
                    usernameAtualNotificacao()
                ) {

                    await carregarNotificacoesChamados();

                }

            },
            3000
        );

    }


    // ========================================================
    // START
    // ========================================================

    if (
        document.readyState ===
        'loading'
    ) {

        document.addEventListener(
            'DOMContentLoaded',
            () => {

                setTimeout(
                    iniciarNotificacoesChamados,
                    150
                );

            }
        );


    } else {

        setTimeout(
            iniciarNotificacoesChamados,
            100
        );

    }


    // ========================================================
    // FUNÇÃO PARA ATUALIZAR O SINO IMEDIATAMENTE
    //
    // Pode ser chamada por qualquer outro módulo.
    // ========================================================

    window.atualizarSinoChamadosAgora =
        async function() {

            garantirSinoChamados();


            await verificarUsuarioNotificacoes();


            if (
                usernameAtualNotificacao()
            ) {

                await carregarNotificacoesChamados();

            }

        };


    // ========================================================
    // EXPÕE FUNÇÕES
    // ========================================================

    window.carregarNotificacoesChamados =
        carregarNotificacoesChamados;


    window.obterAdminsNotificacoesChamados =
        obterAdminsNotificacoesChamados;


    window.criarSinoChamados =
        criarSinoChamados;


    window.garantirSinoChamados =
        garantirSinoChamados;


    console.log(
        '✅ notificacoes_chamados.js carregado.'
    );

})();