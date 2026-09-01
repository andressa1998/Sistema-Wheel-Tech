// ============================================================
// CENTRAL DE CHAMADOS - WHEEL TECH
// Arquivo: chamados.js
// ============================================================

(() => {
    'use strict';

    // ========================================================
    // CONFIGURAÇÃO
    // ========================================================

    const CFG_CHAMADOS = {
        tabelaChamados: 'chamados',
        tabelaMensagens: 'chamados_mensagens',

        // Nome do bucket PUBLIC do Supabase Storage
        bucket: 'chamados',

        // Estes usuários enxergam TODOS os chamados
        // Além de qualquer usuário com role === "admin"
        admins: [
            'andressamiotto',
            'ronald'
        ],

        // Máximo 8 MB por imagem
        maxImagem: 8 * 1024 * 1024
    };


    const MODULOS_CHAMADOS = [
        'Ordem de Serviço',
        'Vendas',
        'NF-e',
        'Entradas',
        'Gestão de Estoque',
        'Estoque',
        'Promoções',
        'Perguntas',
        'Avaliações',
        'Fretes',
        'Caixa',
        'Precificação',
        'Reembolsos',
        'Folgas',
        'Feedback',
        'FULL',
        'Gerenciamento de Anúncios',
        'Login / Usuários',
        'Outro'
    ];


    const STATUS_CHAMADOS = {

        aberto: {
            texto: 'Aberto',
            icone: '🔴',
            classe: 'ch-status-aberto'
        },

        em_andamento: {
            texto: 'Em andamento',
            icone: '🟡',
            classe: 'ch-status-andamento'
        },

        aguardando: {
            texto: 'Aguardando',
            icone: '🔵',
            classe: 'ch-status-aguardando'
        },

        concluido: {
            texto: 'Concluído',
            icone: '🟢',
            classe: 'ch-status-concluido'
        }

    };


    const TIPOS_CHAMADOS = {

        erro: {
            texto: 'Erro / Bug',
            icone: '🐞',
            classe: 'ch-tipo-erro'
        },

        melhoria: {
            texto: 'Melhoria',
            icone: '🛠️',
            classe: 'ch-tipo-melhoria'
        },

        nova_funcionalidade: {
            texto: 'Nova funcionalidade',
            icone: '✨',
            classe: 'ch-tipo-nova'
        }

    };


    const PRIORIDADES_CHAMADOS = {

        normal: {
            texto: 'Normal',
            icone: '⚪',
            classe: 'ch-prio-normal'
        },

        importante: {
            texto: 'Importante',
            icone: '🟠',
            classe: 'ch-prio-importante'
        },

        urgente: {
            texto: 'Urgente',
            icone: '🔴',
            classe: 'ch-prio-urgente'
        }

    };


    // ========================================================
    // ESTADO
    // ========================================================

    let chamadosCache = [];

    let chamadoAberto = null;

    let mensagensCache = [];

    let printNovoChamado = null;

    let printNovaMensagem = null;

    let salvandoChamado = false;

    let salvandoMensagem = false;


    // ========================================================
    // AUXILIARES
    // ========================================================

    function sbChamados() {

        return window.supabaseClient || null;

    }


    function usuarioChamados() {

        return window.currentUser || null;

    }


    function normalizarUsuarioChamados(valor) {

        return (valor || '')
            .toString()
            .trim()
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '');

    }


    function usernameChamados() {

        const u =
            usuarioChamados();

        return normalizarUsuarioChamados(
            u?.username ||
            u?.name ||
            ''
        );

    }


    function ehAdminChamados() {

        const u =
            usuarioChamados();

        if (!u) {
            return false;
        }


        return (

            normalizarUsuarioChamados(
                u.role
            ) === 'admin'

            ||

            CFG_CHAMADOS.admins.includes(
                usernameChamados()
            )

        );

    }


    function toastChamados(
        msg,
        tipo = 'info'
    ) {

        if (
            typeof window.showToast ===
            'function'
        ) {

            window.showToast(
                msg,
                tipo
            );

        } else {

            console.log(
                `[${tipo}] ${msg}`
            );

            alert(
                msg
            );

        }

    }


    function escChamados(valor) {

        return (valor ?? '')
            .toString()
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;')
            .replace(/`/g, '&#096;');

    }


    function nlChamados(valor) {

        return escChamados(
            valor || ''
        ).replace(
            /\n/g,
            '<br>'
        );

    }


    function formatarDataChamados(
        valor
    ) {

        if (!valor) {
            return '-';
        }


        const d =
            new Date(
                valor
            );


        if (
            Number.isNaN(
                d.getTime()
            )
        ) {

            return '-';

        }


        return d.toLocaleString(
            'pt-BR',
            {

                timeZone:
                    'America/Sao_Paulo',

                day:
                    '2-digit',

                month:
                    '2-digit',

                year:
                    'numeric',

                hour:
                    '2-digit',

                minute:
                    '2-digit'

            }
        );

    }


    function numeroChamado(
        id
    ) {

        return `CH-${String(
            Number(
                id || 0
            )
        ).padStart(
            6,
            '0'
        )}`;

    }


    function cfgStatus(
        status
    ) {

        return (
            STATUS_CHAMADOS[
                status
            ]

            ||

            {
                texto:
                    status || '-',

                icone:
                    '⚪',

                classe:
                    ''
            }
        );

    }


    function cfgTipo(
        tipo
    ) {

        return (
            TIPOS_CHAMADOS[
                tipo
            ]

            ||

            {
                texto:
                    tipo || '-',

                icone:
                    '📌',

                classe:
                    ''
            }
        );

    }


    function cfgPrioridade(
        prio
    ) {

        return (
            PRIORIDADES_CHAMADOS[
                prio
            ]

            ||

            PRIORIDADES_CHAMADOS
                .normal
        );

    }


    function validarImagemChamados(
        file
    ) {

        if (!file) {

            return (
                'Nenhuma imagem selecionada.'
            );

        }


        if (
            ![
                'image/png',
                'image/jpeg',
                'image/jpg',
                'image/webp'
            ].includes(
                file.type
            )
        ) {

            return (
                'Use uma imagem PNG, JPG, JPEG ou WEBP.'
            );

        }


        if (
            file.size >
            CFG_CHAMADOS.maxImagem
        ) {

            return (
                'A imagem ultrapassa o limite de 8 MB.'
            );

        }


        return '';

    }


    function arquivoImagemClipboard(
        event
    ) {

        const items =
            event.clipboardData
                ?.items ||
            [];


        for (
            const item
            of items
        ) {

            if (
                item.type
                    ?.startsWith(
                        'image/'
                    )
            ) {

                return (
                    item.getAsFile()
                );

            }

        }


        return null;

    }


    function extensaoImagem(
        file
    ) {

        const nome =
            file?.name ||
            '';


        const ext =
            nome.includes('.')

                ? nome
                    .split('.')
                    .pop()
                    .toLowerCase()

                : '';


        if (
            ext &&
            /^[a-z0-9]+$/.test(
                ext
            )
        ) {

            return ext;

        }


        if (
            file?.type ===
            'image/webp'
        ) {

            return 'webp';

        }


        if (
            file?.type ===
            'image/jpeg'

            ||

            file?.type ===
            'image/jpg'
        ) {

            return 'jpg';

        }


        return 'png';

    }


    // ========================================================
    // UPLOAD DE PRINT
    // ========================================================

    async function uploadImagemChamados(
        file,
        chamadoId,
        pasta
    ) {

        if (!file) {
            return null;
        }


        const erro =
            validarImagemChamados(
                file
            );


        if (erro) {

            throw new Error(
                erro
            );

        }


        const sb =
            sbChamados();


        if (!sb) {

            throw new Error(
                'Supabase não conectado.'
            );

        }


        const nome =
            `${
                Date.now()
            }-${
                Math
                    .random()
                    .toString(36)
                    .slice(2, 9)
            }.${
                extensaoImagem(
                    file
                )
            }`;


        const caminho =
            `${
                pasta
            }/${
                usernameChamados() ||
                'usuario'
            }/${
                chamadoId
            }/${
                nome
            }`;


        const {
            error
        } =
            await sb.storage

                .from(
                    CFG_CHAMADOS.bucket
                )

                .upload(
                    caminho,
                    file,
                    {

                        cacheControl:
                            '3600',

                        upsert:
                            false,

                        contentType:
                            file.type

                    }
                );


        if (error) {

            throw new Error(
                `Erro ao enviar print: ${
                    error.message
                }`
            );

        }


        const {
            data
        } =
            sb.storage

                .from(
                    CFG_CHAMADOS.bucket
                )

                .getPublicUrl(
                    caminho
                );


        if (
            !data?.publicUrl
        ) {

            throw new Error(
                'Não foi possível obter a URL da imagem. Confirme se o bucket "chamados" é público.'
            );

        }


        return (
            data.publicUrl
        );

    }


    // ========================================================
    // ESTILOS
    // ========================================================

    function injetarCSSChamados() {

        if (
            document.getElementById(
                'cssChamados'
            )
        ) {

            return;

        }


        const style =
            document.createElement(
                'style'
            );


        style.id =
            'cssChamados';


        style.textContent = `

            #chamadosSystem {
                min-height: 100vh;
            }


            #chamadosSystem .ch-wrap {
                max-width: 1450px;
                margin: 0 auto;
                padding: 0 20px 40px;
            }


            #chamadosSystem .ch-topo {
                display: flex;
                justify-content: space-between;
                align-items: center;
                gap: 12px;
                flex-wrap: wrap;
            }


            #chamadosSystem .ch-resumo {
                display: grid;
                grid-template-columns:
                    repeat(
                        4,
                        minmax(130px, 1fr)
                    );

                gap: 12px;
                margin: 0 0 20px;
            }


            #chamadosSystem .ch-resumo-card {
                background: #fff;
                border: 1px solid #e1e5eb;
                border-radius: 12px;
                padding: 15px;
                cursor: pointer;

                box-shadow:
                    0 3px 10px
                    rgba(0,0,0,.04);

                transition:
                    all .2s ease;
            }


            #chamadosSystem
            .ch-resumo-card:hover {

                transform:
                    translateY(-2px);

                box-shadow:
                    0 7px 18px
                    rgba(0,0,0,.08);
            }


            #chamadosSystem
            .ch-resumo-card small {

                color: #6c757d;
                font-weight: 700;
            }


            #chamadosSystem
            .ch-resumo-num {

                font-size: 26px;
                font-weight: 700;
                margin-top: 3px;
            }


            #chamadosSystem
            .ch-filtros {

                display: grid;

                grid-template-columns:
                    1.7fr
                    repeat(
                        3,
                        minmax(150px, .7fr)
                    );

                gap: 10px;

                margin-bottom:
                    15px;
            }


            #chamadosSystem
            .ch-tabela-wrap {

                overflow-x: auto;

                border:
                    1px solid
                    #e1e5eb;

                border-radius:
                    10px;
            }


            #chamadosSystem
            .ch-tabela {

                width: 100%;

                border-collapse:
                    collapse;

                background:
                    #fff;
            }


            #chamadosSystem
            .ch-tabela th {

                background:
                    #f8f9fa;

                padding:
                    11px 9px;

                font-size:
                    12px;

                text-align:
                    left;

                white-space:
                    nowrap;

                border-bottom:
                    1px solid
                    #dee2e6;
            }


            #chamadosSystem
            .ch-tabela td {

                padding:
                    11px 9px;

                font-size:
                    13px;

                border-bottom:
                    1px solid
                    #eef1f4;

                vertical-align:
                    middle;
            }


            #chamadosSystem
            .ch-tabela tbody tr {

                cursor:
                    pointer;
            }


            #chamadosSystem
            .ch-tabela tbody tr:hover {

                background:
                    #f4fbfe;
            }


            .ch-badge {

                display:
                    inline-flex;

                align-items:
                    center;

                gap:
                    4px;

                border-radius:
                    20px;

                padding:
                    4px 8px;

                font-size:
                    11px;

                font-weight:
                    700;

                white-space:
                    nowrap;
            }


            .ch-status-aberto {
                background: #fde8ea;
                color: #a61b29;
            }


            .ch-status-andamento {
                background: #fff3cd;
                color: #765800;
            }


            .ch-status-aguardando {
                background: #dbeafe;
                color: #1d4ed8;
            }


            .ch-status-concluido {
                background: #d1e7dd;
                color: #0f5132;
            }


            .ch-tipo-erro {
                background: #f8d7da;
                color: #842029;
            }


            .ch-tipo-melhoria {
                background: #e2e3e5;
                color: #41464b;
            }


            .ch-tipo-nova {
                background: #e0cffc;
                color: #59359a;
            }


            .ch-prio-normal {
                background: #f1f3f5;
                color: #555;
            }


            .ch-prio-importante {
                background: #fff0d8;
                color: #975a00;
            }


            .ch-prio-urgente {
                background: #ffe2e5;
                color: #b42318;
            }


            .ch-vazio {

                text-align:
                    center;

                padding:
                    38px 15px;

                color:
                    #6c757d;
            }


            .ch-vazio i {

                font-size:
                    36px !important;

                opacity:
                    .28;

                display:
                    block;

                margin-bottom:
                    8px;
            }


            .ch-menu-contador {

                display:
                    inline-flex;

                min-width:
                    20px;

                height:
                    20px;

                padding:
                    0 6px;

                align-items:
                    center;

                justify-content:
                    center;

                border-radius:
                    10px;

                background:
                    #dc3545;

                color:
                    #fff;

                font-size:
                    11px;

                font-weight:
                    700;

                margin-left:
                    5px;
            }


            .ch-menu-contador.vazio {
                display: none;
            }


            .ch-overlay {

                position:
                    fixed;

                inset:
                    0;

                z-index:
                    10050;

                display:
                    flex;

                align-items:
                    center;

                justify-content:
                    center;

                background:
                    rgba(0,0,0,.55);

                padding:
                    20px;
            }


            .ch-overlay.hidden-ch {
                display: none !important;
            }


            .ch-modal {

                width:
                    min(
                        900px,
                        96vw
                    );

                max-height:
                    92vh;

                overflow:
                    auto;

                background:
                    #fff;

                border-radius:
                    14px;

                box-shadow:
                    0 25px 80px
                    rgba(0,0,0,.3);
            }


            .ch-modal.grande {

                width:
                    min(
                        1120px,
                        97vw
                    );
            }


            .ch-modal-head {

                position:
                    sticky;

                top:
                    0;

                z-index:
                    5;

                display:
                    flex;

                align-items:
                    center;

                justify-content:
                    space-between;

                gap:
                    10px;

                padding:
                    17px 20px;

                background:
                    #fff;

                border-bottom:
                    1px solid
                    #e9ecef;
            }


            .ch-modal-head h3 {

                margin:
                    0;

                font-size:
                    18px !important;
            }


            .ch-modal-body {

                padding:
                    20px;
            }


            .ch-modal-foot {

                position:
                    sticky;

                bottom:
                    0;

                z-index:
                    5;

                display:
                    flex;

                justify-content:
                    flex-end;

                gap:
                    8px;

                padding:
                    14px 20px;

                background:
                    #fff;

                border-top:
                    1px solid
                    #e9ecef;
            }


            .ch-x {

                border:
                    0;

                background:
                    transparent;

                color:
                    #6c757d;

                cursor:
                    pointer;

                font-size:
                    26px;

                line-height:
                    1;
            }


            .ch-form-grid {

                display:
                    grid;

                grid-template-columns:
                    1fr 1fr;

                gap:
                    14px;
            }


            .ch-full {

                grid-column:
                    1 / -1;
            }


            .ch-label {

                display:
                    block;

                font-weight:
                    700;

                margin-bottom:
                    6px;

                font-size:
                    13px;

                color:
                    #495057;
            }


            .ch-obrigatorio {

                color:
                    #dc3545;
            }


            .ch-drop {

                min-height:
                    145px;

                border:
                    2px dashed
                    #b7c2cc;

                border-radius:
                    12px;

                display:
                    flex;

                align-items:
                    center;

                justify-content:
                    center;

                padding:
                    18px;

                text-align:
                    center;

                cursor:
                    pointer;

                background:
                    #fafbfc;
            }


            .ch-drop:hover,
            .ch-drop.arrastando {

                border-color:
                    #00ADEE;

                background:
                    #f1fbff;
            }


            .ch-preview {

                margin-top:
                    10px;

                border:
                    1px solid
                    #dee2e6;

                border-radius:
                    10px;

                overflow:
                    hidden;

                background:
                    #f8f9fa;
            }


            .ch-preview img {

                width:
                    100%;

                max-height:
                    380px;

                object-fit:
                    contain;

                display:
                    block;

                background:
                    #fff;
            }


            .ch-preview .acoes {

                padding:
                    8px;

                text-align:
                    right;

                border-top:
                    1px solid
                    #dee2e6;
            }


            .ch-detalhes {

                display:
                    grid;

                grid-template-columns:
                    minmax(0, 1fr)
                    280px;

                gap:
                    18px;
            }


            .ch-box {

                background:
                    #fff;

                border:
                    1px solid
                    #e1e5eb;

                border-radius:
                    10px;

                padding:
                    14px;

                margin-bottom:
                    12px;
            }


            .ch-box-titulo {

                font-weight:
                    700;

                font-size:
                    13px;

                color:
                    #495057;

                margin-bottom:
                    8px;
            }


            .ch-img {

                max-width:
                    100%;

                max-height:
                    520px;

                object-fit:
                    contain;

                border:
                    1px solid
                    #dee2e6;

                border-radius:
                    8px;

                margin-top:
                    8px;

                cursor:
                    zoom-in;
            }


            .ch-conversa {

                display:
                    flex;

                flex-direction:
                    column;

                gap:
                    10px;
            }


            .ch-msg {

                border:
                    1px solid
                    #e1e5eb;

                border-radius:
                    10px;

                padding:
                    12px;

                background:
                    #f8f9fa;
            }


            .ch-msg.admin {

                background:
                    #eef9fd;

                border-color:
                    #b6e6f7;
            }


            .ch-msg-head {

                display:
                    flex;

                justify-content:
                    space-between;

                gap:
                    10px;

                font-size:
                    12px;

                margin-bottom:
                    7px;
            }


            .ch-msg-head strong {

                color:
                    #343a40;
            }


            .ch-msg-head span {

                color:
                    #868e96;

                white-space:
                    nowrap;
            }


            .ch-resposta {

                border-top:
                    1px solid
                    #e9ecef;

                margin-top:
                    15px;

                padding-top:
                    15px;
            }


            .ch-mini-preview {

                margin-top:
                    8px;

                display:
                    flex;

                align-items:
                    center;

                gap:
                    10px;

                padding:
                    8px;

                background:
                    #f8f9fa;

                border:
                    1px solid
                    #dee2e6;

                border-radius:
                    8px;
            }


            .ch-mini-preview img {

                width:
                    80px;

                height:
                    60px;

                object-fit:
                    cover;

                border-radius:
                    6px;
            }


            .ch-info-admin {

                padding:
                    10px;

                background:
                    #f1f3f5;

                border-radius:
                    8px;

                font-size:
                    12px;

                color:
                    #495057;
            }


            .ch-zoom {

                position:
                    fixed;

                inset:
                    0;

                z-index:
                    10100;

                background:
                    rgba(0,0,0,.88);

                display:
                    flex;

                align-items:
                    center;

                justify-content:
                    center;

                padding:
                    20px;

                cursor:
                    zoom-out;
            }


            .ch-zoom img {

                max-width:
                    96vw;

                max-height:
                    94vh;

                object-fit:
                    contain;
            }


            @media(max-width: 900px) {

                #chamadosSystem
                .ch-resumo {

                    grid-template-columns:
                        1fr 1fr;
                }


                #chamadosSystem
                .ch-filtros {

                    grid-template-columns:
                        1fr 1fr;
                }


                .ch-detalhes {

                    grid-template-columns:
                        1fr;
                }

            }


            @media(max-width: 600px) {

                #chamadosSystem
                .ch-filtros,

                .ch-form-grid {

                    grid-template-columns:
                        1fr;
                }


                .ch-full {

                    grid-column:
                        auto;
                }

            }

        `;


        document.head.appendChild(
            style
        );

    }


    // ========================================================
    // CRIA A ABA
    // ========================================================

    function criarAbaChamados() {

        if (
            document.getElementById(
                'chamadosSystem'
            )
        ) {

            return;

        }


        const div =
            document.createElement(
                'div'
            );


        div.id =
            'chamadosSystem';


        div.className =
            'hidden';


        div.innerHTML = `

            <header
                class="main-header"
            >

                <div
                    class="container"
                >

                    <div
                        class="header-content"
                    >

                        <h1
                            style="
                                display:flex;
                                align-items:center;
                                gap:10px;
                            "
                        >

                            <img
                                src="logo.png"
                                alt="Wheel Tech"
                                style="
                                    height:35px;
                                    width:auto;
                                "
                            >

                            Central de Chamados

                        </h1>


                        <div
                            class="user-info"
                        >

                            <div
                                class="user-avatar"
                                id="chamadosAvatar"
                            >
                                U
                            </div>


                            <div>

                                <div
                                    id="chamadosNome"
                                    style="
                                        font-weight:600;
                                    "
                                >
                                    Usuário
                                </div>


                                <div
                                    id="chamadosRole"
                                    style="
                                        font-size:12px;
                                        color:#6c757d;
                                    "
                                >
                                </div>


                                <div
                                    class="
                                        d-flex
                                        gap-2
                                        mt-2
                                    "
                                >

                                    <button
                                        class="
                                            btn
                                            btn-primary
                                            btn-sm
                                        "
                                        onclick="
                                            voltarMenuChamados()
                                        "
                                    >
                                        ← Voltar ao Menu
                                    </button>


                                    <button
                                        class="
                                            btn
                                            btn-secondary
                                            btn-sm
                                        "
                                        onclick="
                                            handleLogout()
                                        "
                                    >
                                        Sair
                                    </button>

                                </div>

                            </div>

                        </div>

                    </div>

                </div>

            </header>


            <div
                class="ch-wrap"
            >

                <div
                    class="
                        card
                        mb-4
                    "
                >

                    <div
                        class="ch-topo"
                    >

                        <div>

                            <h2
                                class="card-title"
                                style="
                                    margin:
                                        0 0 5px;
                                "
                            >

                                <i
                                    class="
                                        fas
                                        fa-headset
                                    "
                                ></i>

                                <span
                                    id="chTituloLista"
                                >
                                    Meus chamados
                                </span>

                            </h2>


                            <div
                                class="text-muted"
                                id="chSubtituloLista"
                            >
                                Acompanhe os chamados que você abriu.
                            </div>

                        </div>


                        <div
                            class="
                                d-flex
                                gap-2
                            "
                        >

                            <button
                                class="
                                    btn
                                    btn-secondary
                                "
                                onclick="
                                    carregarChamados(true)
                                "
                            >

                                <i
                                    class="
                                        fas
                                        fa-sync-alt
                                    "
                                ></i>

                                Atualizar

                            </button>


                            <button
                                class="
                                    btn
                                    btn-primary
                                "
                                onclick="
                                    abrirNovoChamado()
                                "
                            >

                                <i
                                    class="
                                        fas
                                        fa-plus
                                    "
                                ></i>

                                Abrir chamado

                            </button>

                        </div>

                    </div>

                </div>


                <div
                    class="ch-resumo"
                >

                    <div
                        class="ch-resumo-card"
                        onclick="
                            filtrarStatusChamados(
                                'aberto'
                            )
                        "
                    >

                        <small>
                            🔴 ABERTOS
                        </small>

                        <div
                            class="ch-resumo-num"
                            id="chQtdAberto"
                        >
                            0
                        </div>

                    </div>


                    <div
                        class="ch-resumo-card"
                        onclick="
                            filtrarStatusChamados(
                                'em_andamento'
                            )
                        "
                    >

                        <small>
                            🟡 EM ANDAMENTO
                        </small>

                        <div
                            class="ch-resumo-num"
                            id="chQtdAndamento"
                        >
                            0
                        </div>

                    </div>


                    <div
                        class="ch-resumo-card"
                        onclick="
                            filtrarStatusChamados(
                                'aguardando'
                            )
                        "
                    >

                        <small>
                            🔵 AGUARDANDO
                        </small>

                        <div
                            class="ch-resumo-num"
                            id="chQtdAguardando"
                        >
                            0
                        </div>

                    </div>


                    <div
                        class="ch-resumo-card"
                        onclick="
                            filtrarStatusChamados(
                                'concluido'
                            )
                        "
                    >

                        <small>
                            🟢 CONCLUÍDOS
                        </small>

                        <div
                            class="ch-resumo-num"
                            id="chQtdConcluido"
                        >
                            0
                        </div>

                    </div>

                </div>


                <div
                    class="card"
                >

                    <div
                        class="ch-filtros"
                    >

                        <input
                            id="chBusca"
                            class="form-control"
                            placeholder="
                                🔎 Buscar chamado...
                            "
                            oninput="
                                renderizarChamados()
                            "
                        >


                        <select
                            id="chFiltroStatus"
                            class="form-control"
                            onchange="
                                renderizarChamados()
                            "
                        >

                            <option
                                value=""
                            >
                                Todos os status
                            </option>

                            <option
                                value="aberto"
                            >
                                Aberto
                            </option>

                            <option
                                value="em_andamento"
                            >
                                Em andamento
                            </option>

                            <option
                                value="aguardando"
                            >
                                Aguardando
                            </option>

                            <option
                                value="concluido"
                            >
                                Concluído
                            </option>

                        </select>


                        <select
                            id="chFiltroTipo"
                            class="form-control"
                            onchange="
                                renderizarChamados()
                            "
                        >

                            <option
                                value=""
                            >
                                Todos os tipos
                            </option>

                            <option
                                value="erro"
                            >
                                Erro / Bug
                            </option>

                            <option
                                value="melhoria"
                            >
                                Melhoria
                            </option>

                            <option
                                value="nova_funcionalidade"
                            >
                                Nova funcionalidade
                            </option>

                        </select>


                        <select
                            id="chFiltroPrio"
                            class="form-control"
                            onchange="
                                renderizarChamados()
                            "
                        >

                            <option
                                value=""
                            >
                                Todas as prioridades
                            </option>

                            <option
                                value="normal"
                            >
                                Normal
                            </option>

                            <option
                                value="importante"
                            >
                                Importante
                            </option>

                            <option
                                value="urgente"
                            >
                                Urgente
                            </option>

                        </select>

                    </div>


                    <div
                        id="chLista"
                    >
                    </div>

                </div>

            </div>

        `;


        document.body.appendChild(
            div
        );

    }


    // ========================================================
    // CRIA CARD NO MENU
    // ========================================================

    function criarMenuChamados() {

        const menu =
            document.querySelector(
                '.menu-grid'
            );


        if (
            !menu ||
            document.getElementById(
                'menuCardChamados'
            )
        ) {

            return;

        }


        const card =
            document.createElement(
                'div'
            );


        card.id =
            'menuCardChamados';


        card.className =
            'menu-card';


        card.onclick =
            () =>
                window
                    .abrirSistemaChamados();


        card.innerHTML = `

            <div
                class="menu-icon"
            >

                <i
                    class="
                        fas
                        fa-headset
                    "
                ></i>

            </div>


            <h3>

                Chamados

                <span
                    id="chMenuQtd"
                    class="
                        ch-menu-contador
                        vazio
                    "
                >
                    0
                </span>

            </h3>


            <p>
                Erros, melhorias e novas funcionalidades
            </p>

        `;


        const feedback =
            Array
                .from(
                    menu.querySelectorAll(
                        '.menu-card'
                    )
                )

                .find(
                    el =>
                        (
                            el.textContent ||
                            ''
                        )
                            .includes(
                                'Feedback'
                            )
                );


        if (
            feedback
        ) {

            menu.insertBefore(
                card,
                feedback
            );

        } else {

            menu.appendChild(
                card
            );

        }

    }


    // ========================================================
    // MODAL NOVO CHAMADO
    // ========================================================

    function criarModalNovoChamado() {

        if (
            document.getElementById(
                'modalNovoChamado'
            )
        ) {

            return;

        }


        const opcoesModulo =
            MODULOS_CHAMADOS

                .map(
                    m => `

                        <option
                            value="${escChamados(m)}"
                        >
                            ${escChamados(m)}
                        </option>

                    `
                )

                .join('');


        const overlay =
            document.createElement(
                'div'
            );


        overlay.id =
            'modalNovoChamado';


        overlay.className =
            'ch-overlay hidden-ch';


        overlay.onclick =
            () =>
                window
                    .fecharNovoChamado();


        overlay.innerHTML = `

            <div
                class="ch-modal"
                onclick="
                    event.stopPropagation()
                "
            >

                <div
                    class="ch-modal-head"
                >

                    <h3>

                        <i
                            class="
                                fas
                                fa-ticket-alt
                            "
                        ></i>

                        Abrir novo chamado

                    </h3>


                    <button
                        class="ch-x"
                        onclick="
                            fecharNovoChamado()
                        "
                    >
                        ×
                    </button>

                </div>


                <div
                    class="ch-modal-body"
                >

                    <div
                        class="ch-form-grid"
                    >

                        <div>

                            <label
                                class="ch-label"
                            >

                                Tipo

                                <span
                                    class="ch-obrigatorio"
                                >
                                    *
                                </span>

                            </label>


                            <select
                                id="chNovoTipo"
                                class="form-control"
                                onchange="
                                    mudarTipoNovoChamado()
                                "
                            >

                                <option
                                    value=""
                                >
                                    Selecione...
                                </option>

                                <option
                                    value="erro"
                                >
                                    🐞 Erro / Bug
                                </option>

                                <option
                                    value="melhoria"
                                >
                                    🛠️ Melhoria
                                </option>

                                <option
                                    value="nova_funcionalidade"
                                >
                                    ✨ Nova funcionalidade
                                </option>

                            </select>

                        </div>


                        <div>

                            <label
                                class="ch-label"
                            >

                                Aba / módulo

                                <span
                                    class="ch-obrigatorio"
                                >
                                    *
                                </span>

                            </label>


                            <select
                                id="chNovoModulo"
                                class="form-control"
                            >

                                <option
                                    value=""
                                >
                                    Selecione...
                                </option>

                                ${opcoesModulo}

                            </select>

                        </div>


                        <div
                            class="ch-full"
                        >

                            <label
                                class="ch-label"
                            >

                                Título

                                <span
                                    class="ch-obrigatorio"
                                >
                                    *
                                </span>

                            </label>


                            <input
                                id="chNovoTitulo"
                                class="form-control"
                                maxlength="160"
                                placeholder="
                                    Ex.: Botão Dar Entrada não funciona
                                "
                            >

                        </div>


                        <div
                            id="chNovoErroBox"
                            class="ch-full"
                            style="
                                display:none;
                            "
                        >

                            <label
                                class="ch-label"
                            >

                                Qual o erro?

                                <span
                                    class="ch-obrigatorio"
                                >
                                    *
                                </span>

                            </label>


                            <textarea
                                id="chNovoErro"
                                class="form-control"
                                rows="3"
                                placeholder="
                                    Cole a mensagem do erro ou explique o comportamento incorreto.
                                "
                            ></textarea>

                        </div>


                        <div>

                            <label
                                class="ch-label"
                            >
                                Prioridade
                            </label>


                            <select
                                id="chNovoPrioridade"
                                class="form-control"
                            >

                                <option
                                    value="normal"
                                >
                                    ⚪ Normal
                                </option>

                                <option
                                    value="importante"
                                >
                                    🟠 Importante
                                </option>

                                <option
                                    value="urgente"
                                >
                                    🔴 Urgente
                                </option>

                            </select>

                        </div>


                        <div>
                        </div>


                        <div
                            class="ch-full"
                        >

                            <label
                                class="ch-label"
                            >

                                Descrição

                                <span
                                    class="ch-obrigatorio"
                                >
                                    *
                                </span>

                            </label>


                            <textarea
                                id="chNovoDescricao"
                                class="form-control"
                                rows="6"
                                placeholder="
                                    Explique o que tentou fazer, o que aconteceu e o que deveria acontecer.
                                "
                            ></textarea>

                        </div>


                        <div
                            class="ch-full"
                        >

                            <label
                                class="ch-label"
                            >
                                Print
                            </label>


                            <div
                                id="chDropNovo"
                                class="ch-drop"
                                tabindex="0"
                                onclick="
                                    document
                                        .getElementById(
                                            'chArquivoNovo'
                                        )
                                        .click()
                                "
                            >

                                <div>

                                    <i
                                        class="
                                            fas
                                            fa-image
                                        "
                                        style="
                                            font-size:30px;
                                            color:#00ADEE;
                                        "
                                    ></i>


                                    <div
                                        style="
                                            font-weight:700;
                                            margin-top:7px;
                                        "
                                    >
                                        Cole um print aqui com CTRL + V
                                    </div>


                                    <div
                                        class="text-muted"
                                    >
                                        ou clique para selecionar
                                    </div>


                                    <small
                                        class="text-muted"
                                    >
                                        PNG/JPG/WEBP — máximo 8 MB
                                    </small>

                                </div>

                            </div>


                            <input
                                id="chArquivoNovo"
                                type="file"
                                accept="
                                    image/png,
                                    image/jpeg,
                                    image/webp
                                "
                                style="
                                    display:none;
                                "
                                onchange="
                                    selecionarPrintNovo(
                                        this.files[0]
                                    )
                                "
                            >


                            <div
                                id="chPreviewNovo"
                            >
                            </div>

                        </div>

                    </div>

                </div>


                <div
                    class="ch-modal-foot"
                >

                    <button
                        class="
                            btn
                            btn-secondary
                        "
                        onclick="
                            fecharNovoChamado()
                        "
                    >
                        Cancelar
                    </button>


                    <button
                        id="chSalvarNovo"
                        class="
                            btn
                            btn-primary
                        "
                        onclick="
                            salvarNovoChamado()
                        "
                    >

                        <i
                            class="
                                fas
                                fa-paper-plane
                            "
                        ></i>

                        Abrir chamado

                    </button>

                </div>

            </div>

        `;


        document.body.appendChild(
            overlay
        );


        configurarPasteNovoChamado();

    }


    // ========================================================
    // PRINT DO NOVO CHAMADO
    // ========================================================

    function configurarPasteNovoChamado() {

        const modal =
            document.getElementById(
                'modalNovoChamado'
            );


        const drop =
            document.getElementById(
                'chDropNovo'
            );


        if (
            !modal ||
            !drop ||
            modal.dataset.eventos === '1'
        ) {

            return;

        }


        modal.dataset.eventos =
            '1';


        modal.addEventListener(
            'paste',
            e => {

                const file =
                    arquivoImagemClipboard(
                        e
                    );


                if (!file) {
                    return;
                }


                e.preventDefault();


                window
                    .selecionarPrintNovo(
                        file
                    );

            }
        );


        drop.addEventListener(
            'dragover',
            e => {

                e.preventDefault();

                drop.classList.add(
                    'arrastando'
                );

            }
        );


        drop.addEventListener(
            'dragleave',
            () => {

                drop.classList.remove(
                    'arrastando'
                );

            }
        );


        drop.addEventListener(
            'drop',
            e => {

                e.preventDefault();


                drop.classList.remove(
                    'arrastando'
                );


                const file =
                    e.dataTransfer
                        ?.files?.[0];


                if (file) {

                    window
                        .selecionarPrintNovo(
                            file
                        );

                }

            }
        );

    }


    window.abrirNovoChamado =
        function() {

            criarModalNovoChamado();

            limparNovoChamado();


            document
                .getElementById(
                    'modalNovoChamado'
                )
                ?.classList
                .remove(
                    'hidden-ch'
                );

        };


    window.fecharNovoChamado =
        function() {

            document
                .getElementById(
                    'modalNovoChamado'
                )
                ?.classList
                .add(
                    'hidden-ch'
                );

        };


    window.mudarTipoNovoChamado =
        function() {

            const tipo =
                document
                    .getElementById(
                        'chNovoTipo'
                    )
                    ?.value ||
                '';


            const box =
                document.getElementById(
                    'chNovoErroBox'
                );


            if (box) {

                box.style.display =
                    tipo === 'erro'
                        ? ''
                        : 'none';

            }


            if (
                tipo !== 'erro'
            ) {

                const input =
                    document.getElementById(
                        'chNovoErro'
                    );


                if (input) {

                    input.value =
                        '';

                }

            }

        };


    function limparNovoChamado() {

        [
            'chNovoTipo',
            'chNovoModulo',
            'chNovoTitulo',
            'chNovoErro',
            'chNovoDescricao'
        ]
            .forEach(
                id => {

                    const el =
                        document.getElementById(
                            id
                        );


                    if (el) {

                        el.value =
                            '';

                    }

                }
            );


        const p =
            document.getElementById(
                'chNovoPrioridade'
            );


        if (p) {

            p.value =
                'normal';

        }


        const arq =
            document.getElementById(
                'chArquivoNovo'
            );


        if (arq) {

            arq.value =
                '';

        }


        printNovoChamado =
            null;


        renderPreviewNovo();


        window
            .mudarTipoNovoChamado();

    }


    window.selecionarPrintNovo =
        function(file) {

            if (!file) {
                return;
            }


            const erro =
                validarImagemChamados(
                    file
                );


            if (erro) {

                toastChamados(
                    '⚠️ ' + erro,
                    'warning'
                );

                return;

            }


            printNovoChamado =
                file;


            renderPreviewNovo();

        };


    window.removerPrintNovo =
        function() {

            printNovoChamado =
                null;


            const arq =
                document.getElementById(
                    'chArquivoNovo'
                );


            if (arq) {

                arq.value =
                    '';

            }


            renderPreviewNovo();

        };


    function renderPreviewNovo() {

        const box =
            document.getElementById(
                'chPreviewNovo'
            );


        if (!box) {
            return;
        }


        if (
            !printNovoChamado
        ) {

            box.innerHTML =
                '';

            return;

        }


        const url =
            URL.createObjectURL(
                printNovoChamado
            );


        box.innerHTML = `

            <div
                class="ch-preview"
            >

                <img
                    src="${escChamados(url)}"
                    alt="Prévia"
                >


                <div
                    class="acoes"
                >

                    <button
                        class="
                            btn
                            btn-sm
                            btn-danger
                        "
                        onclick="
                            removerPrintNovo()
                        "
                    >

                        <i
                            class="
                                fas
                                fa-trash
                            "
                        ></i>

                        Remover imagem

                    </button>

                </div>

            </div>

        `;

    }


    // ========================================================
    // SALVAR NOVO CHAMADO
    // ========================================================

    window.salvarNovoChamado =
        async function() {

            if (
                salvandoChamado
            ) {

                return;

            }


            const sb =
                sbChamados();


            const u =
                usuarioChamados();


            if (
                !sb ||
                !u
            ) {

                toastChamados(
                    '❌ Supabase ou usuário não disponível.',
                    'error'
                );

                return;

            }


            const tipo =
                document
                    .getElementById(
                        'chNovoTipo'
                    )
                    ?.value ||
                '';


            const modulo =
                document
                    .getElementById(
                        'chNovoModulo'
                    )
                    ?.value ||
                '';


            const titulo =
                document
                    .getElementById(
                        'chNovoTitulo'
                    )
                    ?.value
                    .trim() ||
                '';


            const erroTexto =
                document
                    .getElementById(
                        'chNovoErro'
                    )
                    ?.value
                    .trim() ||
                '';


            const prioridade =
                document
                    .getElementById(
                        'chNovoPrioridade'
                    )
                    ?.value ||
                'normal';


            const descricao =
                document
                    .getElementById(
                        'chNovoDescricao'
                    )
                    ?.value
                    .trim() ||
                '';


            if (!tipo) {

                toastChamados(
                    '⚠️ Selecione o tipo.',
                    'warning'
                );

                return;

            }


            if (!modulo) {

                toastChamados(
                    '⚠️ Selecione a aba/módulo.',
                    'warning'
                );

                return;

            }


            if (!titulo) {

                toastChamados(
                    '⚠️ Informe o título.',
                    'warning'
                );

                return;

            }


            if (
                tipo === 'erro' &&
                !erroTexto
            ) {

                toastChamados(
                    '⚠️ Informe qual erro está acontecendo.',
                    'warning'
                );

                return;

            }


            if (!descricao) {

                toastChamados(
                    '⚠️ Informe a descrição.',
                    'warning'
                );

                return;

            }


            salvandoChamado =
                true;


            const btn =
                document.getElementById(
                    'chSalvarNovo'
                );


            if (btn) {

                btn.disabled =
                    true;


                btn.innerHTML =
                    `
                        <i
                            class="
                                fas
                                fa-spinner
                                fa-spin
                            "
                        ></i>

                        Enviando...
                    `;

            }


            try {

                const agora =
                    new Date()
                        .toISOString();


                const {
                    data: chamado,
                    error
                } =
                    await sb

                        .from(
                            CFG_CHAMADOS
                                .tabelaChamados
                        )

                        .insert({

                            tipo:
                                tipo,

                            modulo:
                                modulo,

                            titulo:
                                titulo,

                            erro:
                                tipo === 'erro'
                                    ? erroTexto
                                    : null,

                            descricao:
                                descricao,

                            prioridade:
                                prioridade,

                            status:
                                'aberto',

                            criado_por_username:
                                usernameChamados(),

                            criado_por_nome:
                                u.name ||
                                u.username ||
                                usernameChamados(),

                            print_url:
                                null,

                            responsavel:
                                null,

                            criado_em:
                                agora,

                            atualizado_em:
                                agora,

                            concluido_em:
                                null

                        })

                        .select('*')

                        .single();


                if (error) {

                    throw error;

                }


                // ============================================
                // ENVIA PRINT
                // ============================================

                if (
                    printNovoChamado
                ) {

                    try {

                        const url =
                            await uploadImagemChamados(
                                printNovoChamado,
                                chamado.id,
                                'abertura'
                            );


                        const {
                            error:
                                erroAtualizar
                        } =
                            await sb

                                .from(
                                    CFG_CHAMADOS
                                        .tabelaChamados
                                )

                                .update({

                                    print_url:
                                        url,

                                    atualizado_em:
                                        new Date()
                                            .toISOString()

                                })

                                .eq(
                                    'id',
                                    chamado.id
                                );


                        if (
                            erroAtualizar
                        ) {

                            throw (
                                erroAtualizar
                            );

                        }


                        chamado.print_url =
                            url;


                    } catch (
                        e
                    ) {

                        console.warn(
                            '⚠️ Chamado criado, mas o print falhou:',
                            e
                        );


                        toastChamados(
                            `⚠️ Chamado criado, mas o print não foi enviado: ${e.message}`,
                            'warning'
                        );

                    }

                }


                toastChamados(
                    `✅ Chamado #${numeroChamado(chamado.id)} aberto!`,
                    'success'
                );


                window
                    .fecharNovoChamado();


                await window
                    .carregarChamados(
                        false
                    );


                await atualizarContadorMenuChamados();


                await window
                    .abrirDetalhesChamado(
                        chamado.id
                    );


            } catch (
                e
            ) {

                console.error(
                    '❌ Erro ao abrir chamado:',
                    e
                );


                toastChamados(
                    '❌ Erro ao abrir chamado: ' +
                    (
                        e.message ||
                        'erro desconhecido'
                    ),
                    'error'
                );


            } finally {

                salvandoChamado =
                    false;


                if (btn) {

                    btn.disabled =
                        false;


                    btn.innerHTML =
                        `
                            <i
                                class="
                                    fas
                                    fa-paper-plane
                                "
                            ></i>

                            Abrir chamado
                        `;

                }

            }

        };


    // ========================================================
    // ABRIR ABA
    // ========================================================

    window.abrirSistemaChamados =
        async function() {

            const u =
                usuarioChamados();


            if (!u) {

                toastChamados(
                    '⚠️ Faça login primeiro.',
                    'warning'
                );

                return;

            }


            criarAbaChamados();

            criarModalNovoChamado();

            criarModalDetalhesChamados();


            // Esconde todas as outras abas do sistema
            document
                .querySelectorAll(
                    '[id$="System"]'
                )

                .forEach(
                    el => {

                        if (
                            el.id !==
                            'chamadosSystem'
                        ) {

                            el.classList.add(
                                'hidden'
                            );

                        }

                    }
                );


            document
                .getElementById(
                    'menuSystem'
                )
                ?.classList
                .add(
                    'hidden'
                );


            document
                .getElementById(
                    'chamadosSystem'
                )
                ?.classList
                .remove(
                    'hidden'
                );


            const nome =
                document.getElementById(
                    'chamadosNome'
                );


            const avatar =
                document.getElementById(
                    'chamadosAvatar'
                );


            const role =
                document.getElementById(
                    'chamadosRole'
                );


            if (nome) {

                nome.textContent =
                    u.name ||
                    u.username ||
                    'Usuário';

            }


            if (avatar) {

                avatar.textContent =
                    u.avatar ||
                    (
                        u.name ||
                        'U'
                    )
                        .charAt(0)
                        .toUpperCase();

            }


            if (role) {

                role.textContent =
                    u.role ||
                    '';

            }


            const tituloLista =
                document.getElementById(
                    'chTituloLista'
                );


            const subtituloLista =
                document.getElementById(
                    'chSubtituloLista'
                );


            if (
                ehAdminChamados()
            ) {

                if (
                    tituloLista
                ) {

                    tituloLista.textContent =
                        'Todos os chamados';

                }


                if (
                    subtituloLista
                ) {

                    subtituloLista.textContent =
                        'Você está vendo os chamados de todos os usuários.';

                }

            } else {

                if (
                    tituloLista
                ) {

                    tituloLista.textContent =
                        'Meus chamados';

                }


                if (
                    subtituloLista
                ) {

                    subtituloLista.textContent =
                        'Acompanhe os chamados que você abriu.';

                }

            }


            await window
                .carregarChamados(
                    false
                );

        };


    // ========================================================
    // VOLTAR AO MENU
    // ========================================================

    window.voltarMenuChamados =
        function() {

            document
                .getElementById(
                    'chamadosSystem'
                )
                ?.classList
                .add(
                    'hidden'
                );


            if (
                typeof window
                    .voltarParaMenu ===
                'function'
            ) {

                return (
                    window
                        .voltarParaMenu()
                );

            }


            document
                .getElementById(
                    'menuSystem'
                )
                ?.classList
                .remove(
                    'hidden'
                );

        };


    // ========================================================
    // CARREGAR CHAMADOS
    // ========================================================

    window.carregarChamados =
        async function(
            mostrarToast =
                false
        ) {

            const sb =
                sbChamados();


            if (
                !sb ||
                !usuarioChamados()
            ) {

                return;

            }


            const lista =
                document.getElementById(
                    'chLista'
                );


            if (lista) {

                lista.innerHTML = `

                    <div
                        class="ch-vazio"
                    >

                        <i
                            class="
                                fas
                                fa-spinner
                                fa-spin
                            "
                        ></i>

                        Carregando chamados...

                    </div>

                `;

            }


            try {

                let query =
                    sb

                        .from(
                            CFG_CHAMADOS
                                .tabelaChamados
                        )

                        .select('*')

                        .order(
                            'atualizado_em',
                            {
                                ascending:
                                    false,

                                nullsFirst:
                                    false
                            }
                        )

                        .order(
                            'criado_em',
                            {
                                ascending:
                                    false
                            }
                        );


                // Usuário comum vê apenas os próprios chamados
                if (
                    !ehAdminChamados()
                ) {

                    query =
                        query.eq(
                            'criado_por_username',
                            usernameChamados()
                        );

                }


                const {
                    data,
                    error
                } =
                    await query;


                if (error) {

                    throw error;

                }


                chamadosCache =
                    data ||
                    [];


                renderResumoChamados();


                window
                    .renderizarChamados();


                atualizarContadorMenuLocal();


                if (
                    mostrarToast
                ) {

                    toastChamados(
                        '✅ Chamados atualizados.',
                        'success'
                    );

                }


            } catch (
                e
            ) {

                console.error(
                    '❌ Erro ao carregar chamados:',
                    e
                );


                if (lista) {

                    lista.innerHTML = `

                        <div
                            class="ch-vazio"
                        >

                            <i
                                class="
                                    fas
                                    fa-exclamation-triangle
                                "
                            ></i>

                            Erro ao carregar chamados.

                            <br>

                            <small>
                                ${escChamados(
                                    e.message
                                )}
                            </small>

                        </div>

                    `;

                }


                toastChamados(
                    '❌ Erro ao carregar chamados: ' +
                    e.message,
                    'error'
                );

            }

        };


    // ========================================================
    // RESUMO
    // ========================================================

    function renderResumoChamados() {

        const qtd =
            status =>
                chamadosCache
                    .filter(
                        c =>
                            c.status ===
                            status
                    )
                    .length;


        const mapa = {

            chQtdAberto:
                qtd(
                    'aberto'
                ),

            chQtdAndamento:
                qtd(
                    'em_andamento'
                ),

            chQtdAguardando:
                qtd(
                    'aguardando'
                ),

            chQtdConcluido:
                qtd(
                    'concluido'
                )

        };


        Object
            .entries(
                mapa
            )

            .forEach(
                (
                    [
                        id,
                        valor
                    ]
                ) => {

                    const el =
                        document.getElementById(
                            id
                        );


                    if (el) {

                        el.textContent =
                            valor;

                    }

                }
            );

    }


    // ========================================================
    // FILTRO STATUS
    // ========================================================

    window.filtrarStatusChamados =
        function(
            status
        ) {

            const el =
                document.getElementById(
                    'chFiltroStatus'
                );


            if (el) {

                el.value =
                    status ||
                    '';

            }


            window
                .renderizarChamados();

        };


    // ========================================================
    // RENDERIZAR LISTA
    // ========================================================

    window.renderizarChamados =
        function() {

            const lista =
                document.getElementById(
                    'chLista'
                );


            if (!lista) {
                return;
            }


            const busca =
                normalizarUsuarioChamados(

                    document
                        .getElementById(
                            'chBusca'
                        )
                        ?.value ||
                    ''

                );


            const status =
                document
                    .getElementById(
                        'chFiltroStatus'
                    )
                    ?.value ||
                '';


            const tipo =
                document
                    .getElementById(
                        'chFiltroTipo'
                    )
                    ?.value ||
                '';


            const prio =
                document
                    .getElementById(
                        'chFiltroPrio'
                    )
                    ?.value ||
                '';


            let dados =
                [
                    ...chamadosCache
                ];


            if (status) {

                dados =
                    dados.filter(
                        c =>
                            c.status ===
                            status
                    );

            }


            if (tipo) {

                dados =
                    dados.filter(
                        c =>
                            c.tipo ===
                            tipo
                    );

            }


            if (prio) {

                dados =
                    dados.filter(
                        c =>
                            (
                                c.prioridade ||
                                'normal'
                            ) === prio
                    );

            }


            if (busca) {

                dados =
                    dados.filter(
                        c => {

                            const texto =
                                [

                                    numeroChamado(
                                        c.id
                                    ),

                                    c.titulo,

                                    c.modulo,

                                    c.descricao,

                                    c.erro,

                                    c.criado_por_nome,

                                    c.criado_por_username,

                                    c.responsavel

                                ]
                                    .join(
                                        ' '
                                    );


                            return (
                                normalizarUsuarioChamados(
                                    texto
                                )
                                    .includes(
                                        busca
                                    )
                            );

                        }
                    );

            }


            if (
                !dados.length
            ) {

                lista.innerHTML = `

                    <div
                        class="ch-vazio"
                    >

                        <i
                            class="
                                fas
                                fa-inbox
                            "
                        ></i>

                        Nenhum chamado encontrado.

                    </div>

                `;


                return;

            }


            const admin =
                ehAdminChamados();


            lista.innerHTML = `

                <div
                    class="ch-tabela-wrap"
                >

                    <table
                        class="ch-tabela"
                    >

                        <thead>

                            <tr>

                                <th>
                                    Chamado
                                </th>

                                ${
                                    admin

                                        ? `
                                            <th>
                                                Usuário
                                            </th>
                                        `

                                        : ''
                                }

                                <th>
                                    Tipo
                                </th>

                                <th>
                                    Prioridade
                                </th>

                                <th>
                                    Aba / Módulo
                                </th>

                                <th>
                                    Assunto
                                </th>

                                <th>
                                    Status
                                </th>

                                <th>
                                    Atualizado
                                </th>

                                <th>
                                </th>

                            </tr>

                        </thead>


                        <tbody>

                            ${
                                dados
                                    .map(
                                        c => {

                                            const t =
                                                cfgTipo(
                                                    c.tipo
                                                );


                                            const s =
                                                cfgStatus(
                                                    c.status
                                                );


                                            const p =
                                                cfgPrioridade(
                                                    c.prioridade ||
                                                    'normal'
                                                );


                                            return `

                                                <tr
                                                    onclick="
                                                        abrirDetalhesChamado(
                                                            ${Number(c.id)}
                                                        )
                                                    "
                                                >

                                                    <td>

                                                        <strong>
                                                            #${numeroChamado(c.id)}
                                                        </strong>

                                                    </td>


                                                    ${
                                                        admin

                                                            ? `

                                                                <td>

                                                                    <strong>
                                                                        ${escChamados(
                                                                            c.criado_por_nome ||
                                                                            '-'
                                                                        )}
                                                                    </strong>

                                                                    <br>

                                                                    <small
                                                                        class="text-muted"
                                                                    >
                                                                        ${escChamados(
                                                                            c.criado_por_username ||
                                                                            ''
                                                                        )}
                                                                    </small>

                                                                </td>

                                                            `

                                                            : ''
                                                    }


                                                    <td>

                                                        <span
                                                            class="
                                                                ch-badge
                                                                ${t.classe}
                                                            "
                                                        >
                                                            ${t.icone}
                                                            ${escChamados(t.texto)}
                                                        </span>

                                                    </td>


                                                    <td>

                                                        <span
                                                            class="
                                                                ch-badge
                                                                ${p.classe}
                                                            "
                                                        >
                                                            ${p.icone}
                                                            ${escChamados(p.texto)}
                                                        </span>

                                                    </td>


                                                    <td>
                                                        ${escChamados(
                                                            c.modulo ||
                                                            '-'
                                                        )}
                                                    </td>


                                                    <td
                                                        style="
                                                            min-width:250px;
                                                        "
                                                    >

                                                        <strong>
                                                            ${escChamados(
                                                                c.titulo ||
                                                                '-'
                                                            )}
                                                        </strong>


                                                        ${
                                                            c.print_url

                                                                ? `

                                                                    <br>

                                                                    <small
                                                                        class="text-muted"
                                                                    >

                                                                        <i
                                                                            class="
                                                                                fas
                                                                                fa-paperclip
                                                                            "
                                                                        ></i>

                                                                        possui print

                                                                    </small>

                                                                `

                                                                : ''
                                                        }

                                                    </td>


                                                    <td>

                                                        <span
                                                            class="
                                                                ch-badge
                                                                ${s.classe}
                                                            "
                                                        >
                                                            ${s.icone}
                                                            ${escChamados(s.texto)}
                                                        </span>

                                                    </td>


                                                    <td>

                                                        ${escChamados(
                                                            formatarDataChamados(
                                                                c.atualizado_em ||
                                                                c.criado_em
                                                            )
                                                        )}

                                                    </td>


                                                    <td>

                                                        <button
                                                            class="
                                                                btn
                                                                btn-sm
                                                                btn-primary
                                                            "
                                                            onclick="
                                                                event.stopPropagation();

                                                                abrirDetalhesChamado(
                                                                    ${Number(c.id)}
                                                                )
                                                            "
                                                        >
                                                            Abrir
                                                        </button>

                                                    </td>

                                                </tr>

                                            `;

                                        }
                                    )
                                    .join('')
                            }

                        </tbody>

                    </table>

                </div>

            `;

        };


    // ========================================================
    // MODAL DETALHES
    // ========================================================

    function criarModalDetalhesChamados() {

        if (
            document.getElementById(
                'modalDetalhesChamado'
            )
        ) {

            return;

        }


        const overlay =
            document.createElement(
                'div'
            );


        overlay.id =
            'modalDetalhesChamado';


        overlay.className =
            'ch-overlay hidden-ch';


        overlay.onclick =
            () =>
                window
                    .fecharDetalhesChamado();


        overlay.innerHTML = `

            <div
                class="
                    ch-modal
                    grande
                "
                onclick="
                    event.stopPropagation()
                "
            >

                <div
                    class="ch-modal-head"
                >

                    <h3
                        id="chDetalhesTitulo"
                    >
                        Chamado
                    </h3>


                    <button
                        class="ch-x"
                        onclick="
                            fecharDetalhesChamado()
                        "
                    >
                        ×
                    </button>

                </div>


                <div
                    id="chDetalhesBody"
                    class="ch-modal-body"
                >
                </div>

            </div>

        `;


        document.body.appendChild(
            overlay
        );

    }


    // ========================================================
    // ABRIR DETALHES
    // ========================================================

    window.abrirDetalhesChamado =
        async function(
            id
        ) {

            criarModalDetalhesChamados();


            document
                .getElementById(
                    'modalDetalhesChamado'
                )
                ?.classList
                .remove(
                    'hidden-ch'
                );


            const body =
                document.getElementById(
                    'chDetalhesBody'
                );


            if (body) {

                body.innerHTML = `

                    <div
                        class="ch-vazio"
                    >

                        <i
                            class="
                                fas
                                fa-spinner
                                fa-spin
                            "
                        ></i>

                        Carregando...

                    </div>

                `;

            }


            try {

                await carregarDetalhesChamados(
                    Number(
                        id
                    )
                );


            } catch (
                e
            ) {

                console.error(
                    '❌ Erro ao abrir chamado:',
                    e
                );


                if (body) {

                    body.innerHTML = `

                        <div
                            class="ch-vazio"
                        >

                            <i
                                class="
                                    fas
                                    fa-exclamation-triangle
                                "
                            ></i>

                            ${escChamados(
                                e.message
                            )}

                        </div>

                    `;

                }

            }

        };


    window.fecharDetalhesChamado =
        function() {

            document
                .getElementById(
                    'modalDetalhesChamado'
                )
                ?.classList
                .add(
                    'hidden-ch'
                );


            chamadoAberto =
                null;


            mensagensCache =
                [];


            printNovaMensagem =
                null;

        };


    // ========================================================
    // CARREGAR DETALHES DO CHAMADO
    // ========================================================

    async function carregarDetalhesChamados(
        id
    ) {

        const sb =
            sbChamados();


        if (!sb) {

            throw new Error(
                'Supabase não conectado.'
            );

        }


        let query =
            sb

                .from(
                    CFG_CHAMADOS
                        .tabelaChamados
                )

                .select('*')

                .eq(
                    'id',
                    id
                );


        if (
            !ehAdminChamados()
        ) {

            query =
                query.eq(
                    'criado_por_username',
                    usernameChamados()
                );

        }


        const {
            data: chamado,
            error
        } =
            await query
                .single();


        if (error) {

            throw error;

        }


        if (!chamado) {

            throw new Error(
                'Chamado não encontrado ou sem permissão.'
            );

        }


        const {
            data: msgs,
            error: erroMsgs
        } =
            await sb

                .from(
                    CFG_CHAMADOS
                        .tabelaMensagens
                )

                .select('*')

                .eq(
                    'chamado_id',
                    id
                )

                .order(
                    'criado_em',
                    {
                        ascending:
                            true
                    }
                );


        if (
            erroMsgs
        ) {

            throw (
                erroMsgs
            );

        }


        chamadoAberto =
            chamado;


        mensagensCache =
            msgs ||
            [];


        renderDetalhesChamados();

    }


    // ========================================================
    // RENDERIZAR MENSAGENS
    // ========================================================

    function renderMensagensChamados() {

        if (
            !mensagensCache.length
        ) {

            return `

                <div
                    class="text-muted"
                    style="
                        font-size:12px;
                    "
                >
                    Nenhuma mensagem ainda.
                </div>

            `;

        }


        return mensagensCache

            .map(
                m => {

                    const admin =
                        CFG_CHAMADOS
                            .admins
                            .includes(
                                normalizarUsuarioChamados(
                                    m.autor_username
                                )
                            );


                    return `

                        <div
                            class="
                                ch-msg
                                ${
                                    admin
                                        ? 'admin'
                                        : ''
                                }
                            "
                        >

                            <div
                                class="ch-msg-head"
                            >

                                <strong>

                                    ${
                                        admin
                                            ? '🛠️'
                                            : '👤'
                                    }

                                    ${escChamados(
                                        m.autor_nome ||
                                        m.autor_username ||
                                        'Usuário'
                                    )}

                                </strong>


                                <span>

                                    ${escChamados(
                                        formatarDataChamados(
                                            m.criado_em
                                        )
                                    )}

                                </span>

                            </div>


                            ${
                                m.mensagem

                                    ? `

                                        <div>
                                            ${nlChamados(
                                                m.mensagem
                                            )}
                                        </div>

                                    `

                                    : ''
                            }


                            ${
                                m.anexo_url

                                    ? `

                                        <img
                                            class="ch-img"
                                            src="${escChamados(
                                                m.anexo_url
                                            )}"
                                            onclick="
                                                ampliarImagemChamados(
                                                    '${escChamados(
                                                        m.anexo_url
                                                    )}'
                                                )
                                            "
                                        >

                                    `

                                    : ''
                            }

                        </div>

                    `;

                }
            )

            .join('');

    }


    // ========================================================
    // RENDERIZAR DETALHES
    // ========================================================

    function renderDetalhesChamados() {

        if (
            !chamadoAberto
        ) {

            return;

        }


        const c =
            chamadoAberto;


        const body =
            document.getElementById(
                'chDetalhesBody'
            );


        const titulo =
            document.getElementById(
                'chDetalhesTitulo'
            );


        if (!body) {
            return;
        }


        const t =
            cfgTipo(
                c.tipo
            );


        const s =
            cfgStatus(
                c.status
            );


        const p =
            cfgPrioridade(
                c.prioridade ||
                'normal'
            );


        const admin =
            ehAdminChamados();


        if (titulo) {

            titulo.textContent =
                `#${numeroChamado(c.id)} — ${c.titulo || ''}`;

        }


        body.innerHTML = `

            <div
                class="ch-detalhes"
            >

                <div>

                    <div
                        class="ch-box"
                    >

                        <div
                            style="
                                display:flex;
                                gap:7px;
                                flex-wrap:wrap;
                                margin-bottom:10px;
                            "
                        >

                            <span
                                class="
                                    ch-badge
                                    ${t.classe}
                                "
                            >
                                ${t.icone}
                                ${escChamados(t.texto)}
                            </span>


                            <span
                                class="
                                    ch-badge
                                    ${s.classe}
                                "
                            >
                                ${s.icone}
                                ${escChamados(s.texto)}
                            </span>


                            <span
                                class="
                                    ch-badge
                                    ${p.classe}
                                "
                            >
                                ${p.icone}
                                ${escChamados(p.texto)}
                            </span>

                        </div>


                        <h3
                            style="
                                font-size:20px !important;
                                margin:0 0 8px;
                            "
                        >

                            ${escChamados(
                                c.titulo ||
                                '-'
                            )}

                        </h3>


                        <div
                            class="text-muted"
                            style="
                                font-size:12px;
                            "
                        >

                            Aba:

                            <strong>
                                ${escChamados(
                                    c.modulo ||
                                    '-'
                                )}
                            </strong>

                            •

                            Criado por:

                            <strong>
                                ${escChamados(
                                    c.criado_por_nome ||
                                    c.criado_por_username ||
                                    '-'
                                )}
                            </strong>

                            •

                            ${escChamados(
                                formatarDataChamados(
                                    c.criado_em
                                )
                            )}

                        </div>

                    </div>


                    ${
                        c.erro

                            ? `

                                <div
                                    class="ch-box"
                                >

                                    <div
                                        class="ch-box-titulo"
                                    >
                                        🐞 Erro informado
                                    </div>

                                    ${nlChamados(
                                        c.erro
                                    )}

                                </div>

                            `

                            : ''
                    }


                    <div
                        class="ch-box"
                    >

                        <div
                            class="ch-box-titulo"
                        >
                            Descrição
                        </div>


                        ${nlChamados(
                            c.descricao ||
                            '-'
                        )}

                    </div>


                    ${
                        c.print_url

                            ? `

                                <div
                                    class="ch-box"
                                >

                                    <div
                                        class="ch-box-titulo"
                                    >
                                        📷 Print anexado
                                    </div>


                                    <img
                                        class="ch-img"
                                        src="${escChamados(
                                            c.print_url
                                        )}"
                                        onclick="
                                            ampliarImagemChamados(
                                                '${escChamados(
                                                    c.print_url
                                                )}'
                                            )
                                        "
                                    >

                                </div>

                            `

                            : ''
                    }


                    <div
                        class="ch-box"
                    >

                        <div
                            class="ch-box-titulo"
                        >
                            💬 Conversa
                        </div>


                        <div
                            class="ch-conversa"
                        >
                            ${renderMensagensChamados()}
                        </div>


                        <div
                            class="ch-resposta"
                        >

                            <label
                                class="ch-label"
                            >
                                Adicionar resposta
                            </label>


                            <textarea
                                id="chResposta"
                                class="form-control"
                                rows="4"
                                placeholder="
                                    Digite uma mensagem...
                                "
                            ></textarea>


                            <div
                                class="
                                    d-flex
                                    gap-2
                                    align-items-center
                                    mt-2
                                "
                                style="
                                    flex-wrap:wrap;
                                "
                            >

                                <button
                                    class="
                                        btn
                                        btn-secondary
                                        btn-sm
                                    "
                                    onclick="
                                        document
                                            .getElementById(
                                                'chArquivoMsg'
                                            )
                                            .click()
                                    "
                                >

                                    <i
                                        class="
                                            fas
                                            fa-paperclip
                                        "
                                    ></i>

                                    Anexar print

                                </button>


                                <small
                                    class="text-muted"
                                >
                                    Ou cole um print com CTRL + V na caixa de resposta.
                                </small>

                            </div>


                            <input
                                id="chArquivoMsg"
                                type="file"
                                accept="
                                    image/png,
                                    image/jpeg,
                                    image/webp
                                "
                                style="
                                    display:none;
                                "
                                onchange="
                                    selecionarPrintMensagemChamados(
                                        this.files[0]
                                    )
                                "
                            >


                            <div
                                id="chPreviewMsg"
                            >
                            </div>


                            <div
                                style="
                                    text-align:right;
                                    margin-top:10px;
                                "
                            >

                                <button
                                    id="chEnviarMsg"
                                    class="
                                        btn
                                        btn-primary
                                    "
                                    onclick="
                                        enviarMensagemChamados(
                                            ${Number(c.id)}
                                        )
                                    "
                                >

                                    <i
                                        class="
                                            fas
                                            fa-paper-plane
                                        "
                                    ></i>

                                    Enviar resposta

                                </button>

                            </div>

                        </div>

                    </div>

                </div>


                <div>

                    ${
                        admin

                            ? `

                                <div
                                    class="ch-box"
                                >

                                    <div
                                        class="ch-box-titulo"
                                    >
                                        Status do chamado
                                    </div>


                                    <select
                                        class="form-control"
                                        onchange="
                                            alterarStatusChamados(
                                                ${Number(c.id)},
                                                this.value
                                            )
                                        "
                                    >

                                        <option
                                            value="aberto"
                                            ${
                                                c.status === 'aberto'
                                                    ? 'selected'
                                                    : ''
                                            }
                                        >
                                            🔴 Aberto
                                        </option>


                                        <option
                                            value="em_andamento"
                                            ${
                                                c.status === 'em_andamento'
                                                    ? 'selected'
                                                    : ''
                                            }
                                        >
                                            🟡 Em andamento
                                        </option>


                                        <option
                                            value="aguardando"
                                            ${
                                                c.status === 'aguardando'
                                                    ? 'selected'
                                                    : ''
                                            }
                                        >
                                            🔵 Aguardando
                                        </option>


                                        <option
                                            value="concluido"
                                            ${
                                                c.status === 'concluido'
                                                    ? 'selected'
                                                    : ''
                                            }
                                        >
                                            🟢 Concluído
                                        </option>

                                    </select>

                                </div>


                                <div
                                    class="ch-box"
                                >

                                    <div
                                        class="ch-box-titulo"
                                    >
                                        Responsável
                                    </div>


                                    ${escChamados(
                                        c.responsavel ||
                                        'Ainda não definido'
                                    )}

                                </div>

                            `

                            : `

                                <div
                                    class="ch-box"
                                >

                                    <div
                                        class="ch-box-titulo"
                                    >
                                        Status atual
                                    </div>


                                    <span
                                        class="
                                            ch-badge
                                            ${s.classe}
                                        "
                                    >
                                        ${s.icone}
                                        ${escChamados(s.texto)}
                                    </span>

                                </div>


                                ${
                                    c.responsavel

                                        ? `

                                            <div
                                                class="ch-box"
                                            >

                                                <div
                                                    class="ch-box-titulo"
                                                >
                                                    Responsável
                                                </div>

                                                ${escChamados(
                                                    c.responsavel
                                                )}

                                            </div>

                                        `

                                        : ''
                                }

                            `
                    }


                    <div
                        class="ch-box"
                    >

                        <div
                            class="ch-box-titulo"
                        >
                            Informações
                        </div>


                        <div
                            style="
                                font-size:12px;
                                line-height:1.8;
                            "
                        >

                            <div>

                                <strong>
                                    Chamado:
                                </strong>

                                #${numeroChamado(c.id)}

                            </div>


                            <div>

                                <strong>
                                    Abertura:
                                </strong>

                                ${escChamados(
                                    formatarDataChamados(
                                        c.criado_em
                                    )
                                )}

                            </div>


                            <div>

                                <strong>
                                    Atualização:
                                </strong>

                                ${escChamados(
                                    formatarDataChamados(
                                        c.atualizado_em ||
                                        c.criado_em
                                    )
                                )}

                            </div>


                            ${
                                c.concluido_em

                                    ? `

                                        <div>

                                            <strong>
                                                Conclusão:
                                            </strong>

                                            ${escChamados(
                                                formatarDataChamados(
                                                    c.concluido_em
                                                )
                                            )}

                                        </div>

                                    `

                                    : ''
                            }

                        </div>

                    </div>


                    <div
                        class="ch-info-admin"
                    >

                        ${
                            admin

                                ? `

                                    <strong>
                                        Visão administrativa
                                    </strong>

                                    <br>

                                    Você pode alterar o status e responder ao usuário.

                                `

                                : `

                                    Você pode responder e enviar novos prints.

                                    O status é alterado pelo responsável do sistema.

                                `
                        }

                    </div>

                </div>

            </div>

        `;


        printNovaMensagem =
            null;


        renderPreviewMsg();


        // CTRL + V na conversa
        const resposta =
            document.getElementById(
                'chResposta'
            );


        if (resposta) {

            resposta.addEventListener(
                'paste',
                e => {

                    const file =
                        arquivoImagemClipboard(
                            e
                        );


                    if (!file) {
                        return;
                    }


                    e.preventDefault();


                    window
                        .selecionarPrintMensagemChamados(
                            file
                        );

                }
            );

        }

    }


    // ========================================================
    // ALTERAR STATUS
    // ========================================================

    window.alterarStatusChamados =
        async function(
            id,
            novoStatus
        ) {

            if (
                !ehAdminChamados()
            ) {

                toastChamados(
                    '🔒 Apenas o administrador pode alterar o status.',
                    'warning'
                );

                return;

            }


            if (
                !STATUS_CHAMADOS[
                    novoStatus
                ]
            ) {

                return;

            }


            const sb =
                sbChamados();


            const u =
                usuarioChamados();


            if (
                !sb ||
                !u
            ) {

                return;

            }


            try {

                const agora =
                    new Date()
                        .toISOString();


                const update = {

                    status:
                        novoStatus,

                    atualizado_em:
                        agora,

                    responsavel:
                        u.name ||
                        u.username ||
                        usernameChamados(),

                    concluido_em:
                        novoStatus ===
                        'concluido'

                            ? agora

                            : null

                };


                const {
                    error
                } =
                    await sb

                        .from(
                            CFG_CHAMADOS
                                .tabelaChamados
                        )

                        .update(
                            update
                        )

                        .eq(
                            'id',
                            id
                        );


                if (error) {

                    throw error;

                }


                if (
                    chamadoAberto &&
                    Number(
                        chamadoAberto.id
                    ) ===
                    Number(
                        id
                    )
                ) {

                    Object.assign(
                        chamadoAberto,
                        update
                    );

                }


                const local =
                    chamadosCache.find(
                        c =>
                            Number(
                                c.id
                            ) ===
                            Number(
                                id
                            )
                    );


                if (local) {

                    Object.assign(
                        local,
                        update
                    );

                }


                renderResumoChamados();


                window
                    .renderizarChamados();


                atualizarContadorMenuLocal();


                renderDetalhesChamados();


                toastChamados(
                    `✅ Status alterado para ${cfgStatus(novoStatus).texto}.`,
                    'success'
                );


            } catch (
                e
            ) {

                console.error(
                    '❌ Erro ao alterar status:',
                    e
                );


                toastChamados(
                    '❌ Erro ao alterar status: ' +
                    e.message,
                    'error'
                );


                if (
                    chamadoAberto
                ) {

                    await carregarDetalhesChamados(
                        id
                    );

                }

            }

        };


    // ========================================================
    // PRINT DA MENSAGEM
    // ========================================================

    window.selecionarPrintMensagemChamados =
        function(
            file
        ) {

            if (!file) {
                return;
            }


            const erro =
                validarImagemChamados(
                    file
                );


            if (erro) {

                toastChamados(
                    '⚠️ ' + erro,
                    'warning'
                );

                return;

            }


            printNovaMensagem =
                file;


            renderPreviewMsg();

        };


    window.removerPrintMensagemChamados =
        function() {

            printNovaMensagem =
                null;


            const input =
                document.getElementById(
                    'chArquivoMsg'
                );


            if (input) {

                input.value =
                    '';

            }


            renderPreviewMsg();

        };


    function renderPreviewMsg() {

        const box =
            document.getElementById(
                'chPreviewMsg'
            );


        if (!box) {
            return;
        }


        if (
            !printNovaMensagem
        ) {

            box.innerHTML =
                '';

            return;

        }


        const url =
            URL.createObjectURL(
                printNovaMensagem
            );


        box.innerHTML = `

            <div
                class="ch-mini-preview"
            >

                <img
                    src="${escChamados(url)}"
                >


                <div
                    style="
                        flex:1;
                    "
                >

                    <strong>
                        ${escChamados(
                            printNovaMensagem.name ||
                            'print.png'
                        )}
                    </strong>

                </div>


                <button
                    class="
                        btn
                        btn-sm
                        btn-danger
                    "
                    onclick="
                        removerPrintMensagemChamados()
                    "
                >
                    Remover
                </button>

            </div>

        `;

    }


    window.enviarMensagemChamados =
    async function(id) {

        if (
            salvandoMensagem
        ) {
            return;
        }


        const sb =
            sbChamados();


        const u =
            usuarioChamados();


        if (
            !sb ||
            !u
        ) {

            toastChamados(
                '❌ Supabase ou usuário não disponível.',
                'error'
            );

            return;
        }


        const texto =
            document
                .getElementById(
                    'chResposta'
                )
                ?.value
                .trim() ||
            '';


        if (
            !texto &&
            !printNovaMensagem
        ) {

            toastChamados(
                '⚠️ Digite uma mensagem ou anexe um print.',
                'warning'
            );

            return;
        }


        salvandoMensagem =
            true;


        const btn =
            document.getElementById(
                'chEnviarMsg'
            );


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

                Enviando...

            `;
        }


        // ====================================================
        // SE O PRINT FALHAR, A MENSAGEM CONTINUA SENDO ENVIADA
        // ====================================================

        let erroUploadAnexo =
            null;


        try {

            // =================================================
            // BUSCA DADOS ATUAIS DO CHAMADO
            //
            // Além de validar permissão, usamos os dados para:
            // - saber quem abriu
            // - saber status atual
            // - gerar notificação
            // =================================================

            let queryChamado =
                sb

                    .from(
                        CFG_CHAMADOS
                            .tabelaChamados
                    )

                    .select(
                        'id, titulo, status, criado_por_username, criado_por_nome'
                    )

                    .eq(
                        'id',
                        id
                    );


            // =================================================
            // USUÁRIO COMUM SÓ PODE RESPONDER CHAMADO PRÓPRIO
            // =================================================

            if (
                !ehAdminChamados()
            ) {

                queryChamado =
                    queryChamado.eq(
                        'criado_por_username',
                        usernameChamados()
                    );
            }


            const {
                data: dadosChamado,
                error: erroBuscarChamado
            } =
                await queryChamado
                    .single();


            if (
                erroBuscarChamado ||
                !dadosChamado
            ) {

                if (
                    !ehAdminChamados()
                ) {

                    throw new Error(
                        'Você não tem permissão para responder este chamado.'
                    );

                }


                throw (
                    erroBuscarChamado ||
                    new Error(
                        'Chamado não encontrado.'
                    )
                );
            }


            // =================================================
            // UPLOAD DO PRINT
            // =================================================

            let anexoUrl =
                null;


            if (
                printNovaMensagem
            ) {

                try {

                    anexoUrl =
                        await uploadImagemChamados(
                            printNovaMensagem,
                            id,
                            'mensagens'
                        );


                } catch (
                    erroUpload
                ) {

                    console.error(
                        '❌ Erro ao enviar print do chamado:',
                        erroUpload
                    );


                    erroUploadAnexo =
                        erroUpload;


                    // =========================================
                    // IMPORTANTE
                    //
                    // Não damos throw aqui.
                    // A resposta de texto será enviada mesmo
                    // que o print tenha falhado.
                    // =========================================
                }
            }


            const agora =
                new Date()
                    .toISOString();


            // =================================================
            // INSERE A MENSAGEM
            // =================================================

            const {
                error: erroMensagem
            } =
                await sb

                    .from(
                        CFG_CHAMADOS
                            .tabelaMensagens
                    )

                    .insert({

                        chamado_id:
                            id,

                        autor_username:
                            usernameChamados(),

                        autor_nome:
                            u.name ||
                            u.username ||
                            usernameChamados(),

                        mensagem:
                            texto ||
                            null,

                        anexo_url:
                            anexoUrl,

                        criado_em:
                            agora

                    });


            if (
                erroMensagem
            ) {

                throw erroMensagem;
            }


            // =================================================
            // ATUALIZA DATA DO CHAMADO
            // =================================================

            const atualizacao = {

                atualizado_em:
                    agora

            };


            // =================================================
            // SE USUÁRIO RESPONDER CHAMADO CONCLUÍDO
            //
            // Reabre como "Aguardando"
            // =================================================

            if (
                !ehAdminChamados() &&
                dadosChamado.status ===
                    'concluido'
            ) {

                atualizacao.status =
                    'aguardando';


                atualizacao.concluido_em =
                    null;
            }


            const {
                error: erroUpdate
            } =
                await sb

                    .from(
                        CFG_CHAMADOS
                            .tabelaChamados
                    )

                    .update(
                        atualizacao
                    )

                    .eq(
                        'id',
                        id
                    );


            if (
                erroUpdate
            ) {

                throw erroUpdate;
            }


            // =================================================
            // NOTIFICAÇÕES
            // =================================================

            try {

                const criadorChamado =
                    (
                        dadosChamado
                            .criado_por_username ||
                        ''
                    )
                        .toString()
                        .trim()
                        .toLowerCase();


                const previewMensagem =
                    texto

                        ? texto.substring(
                            0,
                            180
                        )

                        : anexoUrl

                            ? 'Foi enviado um novo print no chamado.'

                            : 'Nova atualização no chamado.';


                // =============================================
                // ADMIN RESPONDEU
                //
                // -> NOTIFICA QUEM ABRIU O CHAMADO
                // =============================================

                if (
                    ehAdminChamados()
                ) {

                    if (
                        criadorChamado &&
                        criadorChamado !==
                            usernameChamados() &&
                        typeof window
                            .criarNotificacaoChamado ===
                            'function'
                    ) {

                        await window
                            .criarNotificacaoChamado({

                                chamadoId:
                                    id,

                                destinatarioUsername:
                                    criadorChamado,

                                tipo:
                                    'nova_mensagem',

                                titulo:
                                    'Nova resposta no seu chamado',

                                mensagem:
                                    previewMensagem

                            });
                    }


                // =============================================
                // FUNCIONÁRIO RESPONDEU
                //
                // -> NOTIFICA OS ADMINISTRADORES
                // =============================================

                } else {

                    if (
                        typeof window
                            .notificarAdminsChamado ===
                            'function'
                    ) {

                        await window
                            .notificarAdminsChamado({

                                chamadoId:
                                    id,

                                tipo:
                                    'resposta_usuario',

                                titulo:
                                    `${
                                        u.name ||
                                        u.username ||
                                        'Usuário'
                                    } respondeu o chamado #${numeroChamado(id)}`,

                                mensagem:
                                    previewMensagem

                            });
                    }
                }


            } catch (
                erroNotificacao
            ) {

                // =============================================
                // UMA FALHA NA NOTIFICAÇÃO NÃO PODE
                // CANCELAR UMA RESPOSTA QUE JÁ FOI ENVIADA
                // =============================================

                console.warn(
                    '⚠️ Mensagem enviada, mas não foi possível gerar a notificação:',
                    erroNotificacao
                );
            }


            // =================================================
            // LIMPA ANEXO
            // =================================================

            printNovaMensagem =
                null;


            const arquivoInput =
                document.getElementById(
                    'chArquivoMsg'
                );


            if (
                arquivoInput
            ) {

                arquivoInput.value =
                    '';
            }


            // =================================================
            // RECARREGA O CHAMADO
            // =================================================

            await carregarDetalhesChamados(
                id
            );


            // =================================================
            // RECARREGA LISTAGEM DE CHAMADOS
            // =================================================

            await window
                .carregarChamados(
                    false
                );


            // =================================================
            // CONTADOR DO CARD "CHAMADOS"
            // =================================================

            await atualizarContadorMenuChamados();


            // =================================================
            // ATUALIZA O SINO DO PRÓPRIO USUÁRIO
            //
            // Não é obrigatório, mas mantém o contador
            // sincronizado imediatamente.
            // =================================================

            if (
                typeof window
                    .carregarNotificacoesChamados ===
                'function'
            ) {

                try {

                    await window
                        .carregarNotificacoesChamados();

                } catch (
                    erroAtualizarSino
                ) {

                    console.warn(
                        '⚠️ Não foi possível atualizar o sino:',
                        erroAtualizarSino
                    );
                }
            }


            // =================================================
            // RESULTADO
            // =================================================

            if (
                erroUploadAnexo
            ) {

                toastChamados(
                    '⚠️ Resposta enviada, mas o print não pôde ser anexado: ' +
                    (
                        erroUploadAnexo.message ||
                        'erro desconhecido'
                    ),
                    'warning'
                );


            } else {

                toastChamados(
                    '✅ Resposta enviada.',
                    'success'
                );
            }


        } catch (
            e
        ) {

            console.error(
                '❌ Erro ao responder chamado:',
                e
            );


            toastChamados(
                '❌ Erro ao responder chamado: ' +
                (
                    e.message ||
                    'erro desconhecido'
                ),
                'error'
            );


        } finally {

            salvandoMensagem =
                false;


            if (
                btn
            ) {

                btn.disabled =
                    false;


                btn.innerHTML = `

                    <i
                        class="
                            fas
                            fa-paper-plane
                        "
                    ></i>

                    Enviar resposta

                `;
            }
        }
    };


    // ========================================================
    // CONTADOR DO MENU - CACHE
    // ========================================================

    function atualizarContadorMenuLocal() {

        const el =
            document.getElementById(
                'chMenuQtd'
            );


        if (!el) {
            return;
        }


        const qtd =
            chamadosCache.filter(
                c =>
                    c.status !==
                    'concluido'
            ).length;


        el.textContent =
            qtd > 99
                ? '99+'
                : qtd;


        el.classList.toggle(
            'vazio',
            qtd === 0
        );

    }


    // ========================================================
    // CONTADOR DO MENU - BANCO
    // ========================================================

    async function atualizarContadorMenuChamados() {

        const sb =
            sbChamados();


        const el =
            document.getElementById(
                'chMenuQtd'
            );


        if (
            !sb ||
            !el ||
            !usuarioChamados()
        ) {

            return;

        }


        try {

            let query =
                sb

                    .from(
                        CFG_CHAMADOS
                            .tabelaChamados
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

                    .neq(
                        'status',
                        'concluido'
                    );


            if (
                !ehAdminChamados()
            ) {

                query =
                    query.eq(
                        'criado_por_username',
                        usernameChamados()
                    );

            }


            const {
                count,
                error
            } =
                await query;


            if (error) {

                throw error;

            }


            const qtd =
                Number(
                    count ||
                    0
                );


            el.textContent =
                qtd > 99
                    ? '99+'
                    : qtd;


            el.classList.toggle(
                'vazio',
                qtd === 0
            );


        } catch (
            e
        ) {

            console.warn(
                '⚠️ Não foi possível atualizar contador de chamados:',
                e
            );

        }

    }


    // ========================================================
    // AMPLIAR IMAGEM
    // ========================================================

    window.ampliarImagemChamados =
        function(
            url
        ) {

            if (!url) {
                return;
            }


            const div =
                document.createElement(
                    'div'
                );


            div.className =
                'ch-zoom';


            div.onclick =
                () =>
                    div.remove();


            div.innerHTML = `

                <img
                    src="${escChamados(url)}"
                >

            `;


            document.body.appendChild(
                div
            );

        };


    // ========================================================
    // INICIALIZAÇÃO
    // ========================================================

    function iniciarChamados() {

        injetarCSSChamados();

        criarAbaChamados();

        criarModalNovoChamado();

        criarModalDetalhesChamados();

        criarMenuChamados();


        if (
            usuarioChamados()
        ) {

            atualizarContadorMenuChamados();

        }

    }


    if (
        document.readyState ===
        'loading'
    ) {

        document.addEventListener(
            'DOMContentLoaded',
            () => {

                setTimeout(
                    iniciarChamados,
                    300
                );

            }
        );

    } else {

        setTimeout(
            iniciarChamados,
            100
        );

    }


    // ========================================================
    // O MENU DO SEU SISTEMA PODE SER MONTADO DEPOIS
    // ENTÃO FAZ NOVAS TENTATIVAS SEM DUPLICAR
    // ========================================================

    setTimeout(
        criarMenuChamados,
        800
    );


    setTimeout(
        criarMenuChamados,
        1800
    );


    setTimeout(
        () => {

            criarMenuChamados();


            if (
                usuarioChamados()
            ) {

                atualizarContadorMenuChamados();

            }

        },
        2500
    );


    // ========================================================
    // EXPÕE ALGUMAS FUNÇÕES PARA DIAGNÓSTICO
    // ========================================================

    window.CFG_CHAMADOS =
        CFG_CHAMADOS;


    window.ehAdminChamados =
        ehAdminChamados;


    window.atualizarContadorMenuChamados =
        atualizarContadorMenuChamados;
// ========================================================
// CORREÇÃO DE LOGOUT DA CENTRAL DE CHAMADOS
// ========================================================

function limparTelaChamadosAoSair() {

    console.log(
        '🧹 Limpando Central de Chamados para logout...'
    );


    // =====================================================
    // ESCONDE A TELA PRINCIPAL DE CHAMADOS
    // =====================================================

    const sistemaChamados =
        document.getElementById(
            'chamadosSystem'
        );


    if (
        sistemaChamados
    ) {

        sistemaChamados.classList.add(
            'hidden'
        );


        sistemaChamados.style.display =
            'none';
    }


    // =====================================================
    // FECHA MODAL DE NOVO CHAMADO
    // =====================================================

    const modalNovo =
        document.getElementById(
            'modalNovoChamado'
        );


    if (
        modalNovo
    ) {

        modalNovo.classList.add(
            'hidden-ch'
        );


        modalNovo.style.display =
            'none';
    }


    // =====================================================
    // FECHA MODAL DE DETALHES
    // =====================================================

    const modalDetalhes =
        document.getElementById(
            'modalDetalhesChamado'
        );


    if (
        modalDetalhes
    ) {

        modalDetalhes.classList.add(
            'hidden-ch'
        );


        modalDetalhes.style.display =
            'none';
    }


    // =====================================================
    // FECHA ZOOM DE PRINT
    // =====================================================

    document
        .querySelectorAll(
            '.ch-zoom'
        )
        .forEach(
            elemento => {

                elemento.remove();

            }
        );


    // =====================================================
    // FECHA NOTIFICAÇÕES
    // =====================================================

    if (
        typeof window
            .fecharDropdownNotificacoesChamados ===
        'function'
    ) {

        try {

            window
                .fecharDropdownNotificacoesChamados();

        } catch (
            erro
        ) {

            console.warn(
                '⚠️ Erro fechando notificações:',
                erro
            );
        }
    }


    // =====================================================
    // LIMPA ESTADO INTERNO
    // =====================================================

    chamadoAberto =
        null;


    mensagensCache =
        [];


    printNovoChamado =
        null;


    printNovaMensagem =
        null;


    salvandoChamado =
        false;


    salvandoMensagem =
        false;


    console.log(
        '✅ Central de Chamados limpa.'
    );
}


// ========================================================
// EXPÕE FUNÇÃO
// ========================================================

window.limparTelaChamadosAoSair =
    limparTelaChamadosAoSair;


// ========================================================
// INTERCEPTA O LOGOUT ORIGINAL SEM SUBSTITUIR SUA LÓGICA
// ========================================================

function instalarCorrecaoLogoutChamados() {

    // Já instalado
    if (
        window.__logoutChamadosCorrigido
    ) {

        return;
    }


    const logoutOriginal =
        window.handleLogout;


    // =====================================================
    // HANDLELOGOUT AINDA NÃO CARREGOU
    // =====================================================

    if (
        typeof logoutOriginal !==
        'function'
    ) {

        console.warn(
            '⏳ handleLogout ainda não disponível. Tentando novamente...'
        );


        setTimeout(
            instalarCorrecaoLogoutChamados,
            500
        );


        return;
    }


    // =====================================================
    // GUARDA FUNÇÃO ORIGINAL E CRIA WRAPPER
    // =====================================================

    window.handleLogout =
        function (...args) {

            // Primeiro fecha tudo da Central de Chamados
            try {

                limparTelaChamadosAoSair();

            } catch (
                erro
            ) {

                console.warn(
                    '⚠️ Erro limpando Chamados no logout:',
                    erro
                );
            }


            // Depois executa exatamente o logout original
            return logoutOriginal.apply(
                this,
                args
            );

        };


    window.__logoutChamadosCorrigido =
        true;


    console.log(
        '✅ Correção de logout da Central de Chamados instalada.'
    );
}


// ========================================================
// PROTEÇÃO EXTRA VIA CSS
//
// Mesmo que algum logout futuro seja alterado,
// se o body entrar em modo login, Chamados some.
// ========================================================

function instalarCSSLogoutChamados() {

    if (
        document.getElementById(
            'cssLogoutChamados'
        )
    ) {

        return;
    }


    const style =
        document.createElement(
            'style'
        );


    style.id =
        'cssLogoutChamados';


    style.textContent = `

        body.login-active #chamadosSystem {
            display: none !important;
        }


        body.login-active #modalNovoChamado {
            display: none !important;
        }


        body.login-active #modalDetalhesChamado {
            display: none !important;
        }


        body.login-active .ch-zoom {
            display: none !important;
        }

    `;


    document.head.appendChild(
        style
    );
}


// ========================================================
// INSTALA
// ========================================================

instalarCSSLogoutChamados();


setTimeout(
    instalarCorrecaoLogoutChamados,
    100
);


setTimeout(
    instalarCorrecaoLogoutChamados,
    800
);


setTimeout(
    instalarCorrecaoLogoutChamados,
    2000
);

})();