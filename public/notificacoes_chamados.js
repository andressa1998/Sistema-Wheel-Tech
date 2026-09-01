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


    function usuarioAtualNotificacoes() {
    try {
        if (
            typeof currentUser !== 'undefined' &&
            currentUser
        ) {
            return currentUser;
        }
    } catch (error) {
        // currentUser pode não estar disponível neste arquivo.
    }

    if (window.currentUser) {
        return window.currentUser;
    }

    try {
        const usuarioSalvo =
            localStorage.getItem('currentUser') ||
            sessionStorage.getItem('currentUser');

        if (usuarioSalvo) {
            return JSON.parse(usuarioSalvo);
        }
    } catch (error) {
        console.warn(
            '⚠️ Não foi possível recuperar o usuário logado:',
            error
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

    if (!usuario) {
        return '';
    }

    return normalizarUsuarioNotificacao(
        usuario.username ||
        usuario.login ||
        usuario.usuario ||
        usuario.name ||
        ''
    );
}


    function nomeAtualNotificacao() {
    const usuario =
        usuarioAtualNotificacoes();

    if (!usuario) {
        return 'Usuário';
    }

    return (
        usuario.name ||
        usuario.nome ||
        usuario.username ||
        usuario.login ||
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


    function obterAdminsNotificacoesChamados() {
    // Somente Andressa recebe notificações de todos os chamados.
    return ['andressamiotto'];
}


    window.criarNotificacaoChamado =
    async function ({
        chamadoId,
        destinatarioUsername,
        tipo,
        titulo,
        mensagem = '',
        permitirNotificarProprioUsuario = false
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

        if (!destinatario) {
            console.warn(
                '⚠️ Destinatário da notificação não informado.'
            );

            return false;
        }

        const autorUsername =
            usernameAtualNotificacao();

        if (
            !permitirNotificarProprioUsuario &&
            destinatario === autorUsername
        ) {
            return true;
        }

        const chamadoIdNormalizado =
            Number(chamadoId);

        if (
            !Number.isFinite(chamadoIdNormalizado) ||
            chamadoIdNormalizado <= 0
        ) {
            console.warn(
                '⚠️ ID inválido para criar notificação:',
                chamadoId
            );

            return false;
        }

        try {
            const {
                error
            } = await sb
                .from(
                    NOTIF_CHAMADOS_CONFIG.tabela
                )
                .insert({
                    chamado_id:
                        chamadoIdNormalizado,

                    destinatario_username:
                        destinatario,

                    autor_username:
                        autorUsername ||
                        null,

                    autor_nome:
                        nomeAtualNotificacao(),

                    tipo:
                        tipo ||
                        'atualizacao',

                    titulo:
                        titulo ||
                        `Atualização no chamado ${chamadoIdNormalizado}`,

                    mensagem:
                        mensagem ||
                        null,

                    lida:
                        false
                });

            if (error) {
                throw error;
            }

            if (
                destinatario ===
                usernameAtualNotificacao()
            ) {
                await carregarNotificacoesChamados();
            }

            return true;

        } catch (error) {
            console.error(
                '❌ Erro criando notificação do chamado:',
                error
            );

            return false;
        }
    };


    window.notificarAdminsChamado =
    async function ({
        chamadoId,
        tipo,
        titulo,
        mensagem = ''
    }) {
        const destinatarios =
            obterAdminsNotificacoesChamados();

        const usuarioAtual =
            usernameAtualNotificacao();

        const resultados =
            await Promise.allSettled(
                destinatarios
                    .filter(Boolean)
                    .filter(
                        destinatario =>
                            destinatario !==
                            usuarioAtual
                    )
                    .map(
                        destinatario =>
                            window.criarNotificacaoChamado({
                                chamadoId:
                                    chamadoId,

                                destinatarioUsername:
                                    destinatario,

                                tipo:
                                    tipo ||
                                    'novo_chamado',

                                titulo:
                                    titulo ||
                                    `Novo chamado ${chamadoId}`,

                                mensagem:
                                    mensagem
                            })
                    )
            );

        return resultados.every(
            resultado =>
                resultado.status ===
                    'fulfilled' &&
                resultado.value !== false
        );
    };

    window.notificarNovoChamadoCriado =
    async function (chamado) {
        if (!chamado) {
            return false;
        }

        const chamadoId =
            chamado.id ||
            chamado.chamado_id;

        if (!chamadoId) {
            console.warn(
                '⚠️ Chamado sem ID. A notificação não foi criada.',
                chamado
            );

            return false;
        }

        const numeroChamado =
            chamado.codigo ||
            chamado.numero ||
            numeroChamadoNotif(
                chamadoId
            );

        const assunto =
            chamado.assunto ||
            chamado.titulo ||
            chamado.motivo ||
            'Novo chamado';

        return await window.notificarAdminsChamado({
            chamadoId:
                chamadoId,

            tipo:
                'novo_chamado',

            titulo:
                `🎫 Novo chamado ${numeroChamado}`,

            mensagem:
                assunto
        });
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


    async function carregarNotificacoesChamados() {
    if (carregandoNotificacoesChamados) {
        return;
    }

    const sb =
        sbNotificacoesChamados();

    const username =
        usernameAtualNotificacao();

    const usuarioAtual =
        usuarioAtualNotificacoes();

    if (
        !sb ||
        !username
    ) {
        return;
    }

    carregandoNotificacoesChamados =
        true;

    try {
        const normalizarNome = valor => {
            return String(valor || '')
                .trim()
                .toLowerCase()
                .normalize('NFD')
                .replace(
                    /[\u0300-\u036f]/g,
                    ''
                );
        };

        const nomesUsuario = [
            username,
            usuarioAtual?.name,
            usuarioAtual?.nome,
            usuarioAtual?.username,
            usuarioAtual?.login,
            usuarioAtual?.usuario
        ]
            .map(normalizarNome)
            .filter(Boolean);

        const anterioresNaoLidas =
            notificacoesChamadosCache
                .filter(
                    notificacao =>
                        !notificacao.lida
                )
                .length;

        /*
         * Busca notificações dos chamados.
         */
        const consultaChamados =
            sb
                .from(
                    NOTIF_CHAMADOS_CONFIG.tabela
                )
                .select('*')
                .eq(
                    'destinatario_username',
                    username
                )
                .order(
                    'criado_em',
                    {
                        ascending: false
                    }
                )
                .limit(
                    NOTIF_CHAMADOS_CONFIG
                        .limiteLista
                );

        /*
         * Busca todas as OS que ainda não foram
         * notificadas. O filtro do usuário é feito
         * depois para aceitar nomes com ou sem acento.
         */
        const consultaOS =
            sb
                .from(
                    'ordens_service'
                )
                .select(`
                    id,
                    codigo,
                    produto_nome,
                    responsavel,
                    user_notified,
                    data_criacao,
                    etapa_fluxo,
                    fluxo_renovacao
                `)
                .or(
                    'user_notified.eq.false,user_notified.is.null'
                )
                .order(
                    'data_criacao',
                    {
                        ascending: false
                    }
                )
                .limit(100);

        const [
            resultadoChamados,
            resultadoOS
        ] = await Promise.all([
            consultaChamados,
            consultaOS
        ]);

        if (resultadoChamados.error) {
            throw resultadoChamados.error;
        }

        if (resultadoOS.error) {
            throw resultadoOS.error;
        }

        const notificacoesDeChamados =
            (
                resultadoChamados.data ||
                []
            ).map(notificacao => ({
                ...notificacao,

                origem:
                    'chamado',

                chave_notificacao:
                    `chamado-${notificacao.id}`
            }));

        const osDoUsuario =
            (
                resultadoOS.data ||
                []
            ).filter(os => {
                const responsavel =
                    normalizarNome(
                        os.responsavel
                    );

                return nomesUsuario.some(
                    nomeUsuario => {
                        return (
                            responsavel ===
                                nomeUsuario ||
                            responsavel.includes(
                                nomeUsuario
                            )
                        );
                    }
                );
            });

        const notificacoesDeOS =
            osDoUsuario.map(os => {
                const etapa =
                    normalizarNome(
                        os.etapa_fluxo
                    );

                let mensagemEtapa =
                    'Uma nova OS foi atribuída a você.';

                if (
                    etapa.includes(
                        'leticia'
                    )
                ) {
                    mensagemEtapa =
                        'Verifique se o anúncio não possui vendas nos últimos meses.';
                } else if (
                    etapa.includes(
                        'ronald'
                    )
                ) {
                    mensagemEtapa =
                        'Confira se a foto da bike corresponde à gancheira.';
                } else if (
                    etapa.includes(
                        'elaine'
                    )
                ) {
                    mensagemEtapa =
                        'A OS foi aprovada e está pronta para tirar ou editar a foto.';
                }

                return {
                    id:
                        os.id,

                    os_id:
                        os.id,

                    chamado_id:
                        null,

                    origem:
                        'os',

                    chave_notificacao:
                        `os-${os.id}`,

                    tipo:
                        'nova_os',

                    titulo:
                        `Nova OS atribuída: ${
                            os.codigo ||
                            `OS-${os.id}`
                        }`,

                    mensagem:
                        `${
                            os.produto_nome ||
                            'Ordem de serviço'
                        } — ${mensagemEtapa}`,

                    criado_em:
                        os.data_criacao,

                    lida:
                        os.user_notified ===
                        true,

                    responsavel:
                        os.responsavel,

                    etapa_fluxo:
                        os.etapa_fluxo,

                    fluxo_renovacao:
                        os.fluxo_renovacao
                };
            });

        notificacoesChamadosCache = [
            ...notificacoesDeChamados,
            ...notificacoesDeOS
        ]
            .sort((a, b) => {
                return (
                    new Date(
                        b.criado_em ||
                        0
                    ).getTime() -
                    new Date(
                        a.criado_em ||
                        0
                    ).getTime()
                );
            })
            .slice(
                0,
                NOTIF_CHAMADOS_CONFIG
                    .limiteLista
            );

        const novasNaoLidas =
            notificacoesChamadosCache
                .filter(
                    notificacao =>
                        !notificacao.lida
                )
                .length;

        renderizarNotificacoesChamados();
        atualizarBadgeNotificacoesChamados();

        if (
            novasNaoLidas >
            anterioresNaoLidas
        ) {
            animarSinoChamados();
        }

        console.log(
            '🔔 Notificações unificadas:',
            {
                usuario:
                    username,

                chamados:
                    notificacoesDeChamados
                        .filter(n => !n.lida)
                        .length,

                ordensServico:
                    notificacoesDeOS
                        .filter(n => !n.lida)
                        .length,

                total:
                    novasNaoLidas
            }
        );

    } catch (error) {
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
            <div class="notif-ch-vazio">
                <i class="far fa-bell"></i>
                Nenhuma notificação.
            </div>
        `;

        return;
    }

    lista.innerHTML =
        notificacoesChamadosCache
            .map(notificacao => {
                const ehOS =
                    notificacao.origem ===
                    'os';

                const icone =
                    ehOS
                        ? '📋'
                        : iconeTipoNotificacao(
                            notificacao.tipo
                        );

                const id =
                    Number(
                        notificacao.id
                    );

                const chamadoId =
                    notificacao.chamado_id
                        ? Number(
                            notificacao.chamado_id
                        )
                        : 0;

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
                            abrirNotificacaoUnificada(
                                '${ehOS ? 'os' : 'chamado'}',
                                ${id},
                                ${chamadoId}
                            )
                        "
                    >
                        <div class="notif-ch-icone">
                            ${icone}
                        </div>

                        <div class="notif-ch-conteudo">
                            <div class="notif-ch-titulo">
                                ${escaparNotif(
                                    notificacao.titulo ||
                                    (
                                        ehOS
                                            ? 'Nova ordem de serviço'
                                            : 'Atualização no chamado'
                                    )
                                )}
                            </div>

                            ${
                                notificacao.mensagem
                                    ? `
                                        <div class="notif-ch-mensagem">
                                            ${escaparNotif(
                                                notificacao.mensagem
                                            )}
                                        </div>
                                    `
                                    : ''
                            }

                            <div class="notif-ch-meta">
                                ${
                                    !notificacao.lida
                                        ? `
                                            <span
                                                class="notif-ch-bolinha"
                                            ></span>
                                        `
                                        : ''
                                }

                                ${
                                    ehOS
                                        ? escaparNotif(
                                            notificacao
                                                .etapa_fluxo ||
                                            'Ordem de serviço'
                                        )
                                        : `#${numeroChamadoNotif(
                                            notificacao.chamado_id
                                        )}`
                                }

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
            })
            .join('');
}


    async function marcarNotificacaoChamadosLida(
    id,
    origem = 'chamado'
) {
    const sb =
        sbNotificacoesChamados();

    if (!sb) {
        return false;
    }

    try {
        const agora =
            new Date().toISOString();

        if (origem === 'os') {
            const {
                error
            } = await sb
                .from(
                    'ordens_service'
                )
                .update({
                    user_notified:
                        true
                })
                .eq(
                    'id',
                    id
                );

            if (error) {
                throw error;
            }

        } else {
            const {
                error
            } = await sb
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
                    usernameAtualNotificacao()
                );

            if (error) {
                throw error;
            }
        }

        const notificacaoLocal =
            notificacoesChamadosCache
                .find(notificacao => {
                    return (
                        String(
                            notificacao.id
                        ) ===
                            String(id) &&
                        notificacao.origem ===
                            origem
                    );
                });

        if (notificacaoLocal) {
            notificacaoLocal.lida =
                true;

            notificacaoLocal.lida_em =
                agora;
        }

        atualizarBadgeNotificacoesChamados();
        renderizarNotificacoesChamados();

        return true;

    } catch (error) {
        console.error(
            '❌ Erro marcando notificação como lida:',
            error
        );

        return false;
    }
}

window.abrirNotificacaoUnificada =
    async function (
        origem,
        notificacaoId,
        chamadoId = 0
    ) {
        await marcarNotificacaoChamadosLida(
            notificacaoId,
            origem
        );

        window
            .fecharDropdownNotificacoesChamados();

        if (origem === 'os') {
            /*
             * Abre a aba de OS usando as funções disponíveis
             * no sistema.
             */
            if (
                typeof window.showSystem ===
                'function'
            ) {
                const possiveisIds = [
                    'mainSystem',
                    'osSystem',
                    'ordemServicoSystem',
                    'ordensServiceSystem'
                ];

                for (
                    const idSistema of
                    possiveisIds
                ) {
                    if (
                        document.getElementById(
                            idSistema
                        )
                    ) {
                        window.showSystem(
                            idSistema
                        );

                        break;
                    }
                }
            }

            if (
                typeof window
                    .openOrderDetails ===
                'function'
            ) {
                window.openOrderDetails(
                    notificacaoId
                );
            }

            return;
        }

        if (
            typeof window
                .abrirSistemaChamados ===
            'function'
        ) {
            await window
                .abrirSistemaChamados();
        }

        if (
            chamadoId &&
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


    window.marcarTodasNotificacoesChamadosLidas =
    async function () {
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
                new Date().toISOString();

            const idsOS =
                notificacoesChamadosCache
                    .filter(
                        notificacao =>
                            notificacao.origem ===
                                'os' &&
                            !notificacao.lida
                    )
                    .map(
                        notificacao =>
                            notificacao.id
                    )
                    .filter(Boolean);

            const idsChamados =
                notificacoesChamadosCache
                    .filter(
                        notificacao =>
                            notificacao.origem !==
                                'os' &&
                            !notificacao.lida
                    )
                    .map(
                        notificacao =>
                            notificacao.id
                    )
                    .filter(Boolean);

            const atualizacoes =
                [];

            if (idsChamados.length) {
                atualizacoes.push(
                    sb
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
                        .in(
                            'id',
                            idsChamados
                        )
                );
            }

            if (idsOS.length) {
                atualizacoes.push(
                    sb
                        .from(
                            'ordens_service'
                        )
                        .update({
                            user_notified:
                                true
                        })
                        .in(
                            'id',
                            idsOS
                        )
                );
            }

            const resultados =
                await Promise.all(
                    atualizacoes
                );

            const erro =
                resultados.find(
                    resultado =>
                        resultado.error
                )?.error;

            if (erro) {
                throw erro;
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

            renderizarNotificacoesChamados();
            atualizarBadgeNotificacoesChamados();

        } catch (error) {
            console.error(
                '❌ Erro marcando todas as notificações:',
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