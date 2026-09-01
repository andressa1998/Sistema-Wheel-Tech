// ============================================
// SISTEMA OS FOTOGRAFIA - VERSÃO COMPLETA COM FOTOS
// ============================================

// ===== CONFIGURAÇÃO SUPABASE =====
const SUPABASE_URL = 'https://nvlmtinpcayrpkhulefs.supabase.co';
const SUPABASE_KEY = 'sb_publishable_7AaXEKbS9roL57PO5lQkuQ_fkVWnGoL';
let supabaseClient = null;

// ===== VARIÁVEIS PARA CONTROLE DE SESSÃO =====
const SESSION_TIMEOUT = 3600000; // 1 horas em milissegundos
let sessionTimer = null;
let refreshTokenInterval = null;
let reembolsoNotificationCount = null;
let reembolsoNotificationBell = null;

// ===== VARIÁVEIS DE PAGINAÇÃO =====
let paginaAtualOS = 1;
let itensPorPaginaOS = 20;
let todasOSFiltradas = [];

async function handleLogin(e) {
    e.preventDefault();
    
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const username = usernameInput.value.trim().toLowerCase();
    const password = passwordInput.value;
    
    const submitBtn = loginForm.querySelector('button[type="submit"]');
    let originalBtnText = '';
    if (submitBtn) {
        originalBtnText = submitBtn.innerHTML;
        submitBtn.innerHTML = '<span class="spinner"></span> Verificando...';
        submitBtn.disabled = true;
    }
    
    if (!username || !password) {
        showToast('Por favor, preencha usuário e senha!', 'warning');
        if (submitBtn) {
            submitBtn.innerHTML = originalBtnText;
            submitBtn.disabled = false;
        }
        passwordInput.focus();
        return;
    }
    
    const foundUser = SYSTEM_USERS.find(user => 
        user.username === username && user.password === password
    );
    
    // Executa diretamente, sem setTimeout
    if (foundUser) {
        // 🔒 BLOQUEIO: verifica se o usuário está na lista negra
    if (BLOCKED_USERS.includes(foundUser.username)) {
        // Registra tentativa bloqueada no histórico
        const ip = await getClientIP();
        const userAgent = navigator.userAgent;
        await supabaseClient
            .from('login_history')
            .insert([{
                username: foundUser.username,
                user_name: `🚫 BLOQUEADO - ${foundUser.name}`,
                ip_address: ip,
                user_agent: userAgent,
                login_time: new Date().toISOString()
            }]);
        
        showToast(`⛔ Acesso negado para ${foundUser.name}. Contate o administrador.`, 'error');
        
        // Limpa campos e mantém na tela de login
        if (submitBtn) {
            submitBtn.innerHTML = originalBtnText;
            submitBtn.disabled = false;
        }
        passwordInput.value = '';
        passwordInput.focus();
        return;
    }
        currentUser = foundUser;
        window.currentUser = currentUser;

        document.body.classList.remove('login-active');

        atualizarVisibilidadeMenu();
        
        // Registrar histórico de login (agora await funciona)
        const ip = await getClientIP();
        const userAgent = navigator.userAgent;
        await supabaseClient
            .from('login_history')
            .insert([{
                username: foundUser.username,
                user_name: foundUser.name,
                ip_address: ip,
                user_agent: userAgent,
                login_time: new Date().toISOString()
            }]);
        
        // Restante do seu código (atualizar interface, etc.)
        atualizarVisibilidadeRelatorioColaborador();
        atualizarTodosAvatares();
        saveSessionToStorage();
        startSessionTimer();
        
        if (userName) userName.textContent = foundUser.name;
        if (userAvatar) userAvatar.textContent = foundUser.avatar;
        if (userRole) userRole.textContent = foundUser.role;
        if (welcomeMessage) welcomeMessage.textContent = `Bem-vindo(a), ${foundUser.name}!`;
        if (createdByInput) createdByInput.value = foundUser.name;
        
        if (loginScreen) loginScreen.classList.add('hidden');
        const menuSystem = document.getElementById('menuSystem');
        if (menuSystem) menuSystem.classList.remove('hidden');
        
        showToast(`✅ Bem-vindo(a), ${foundUser.name}!`, 'success');
        
        setTimeout(
    async () => {

        try {

            // ================================================
            // GARANTIR SUPABASE
            // ================================================

            if (!supabaseClient) {

                initSupabase();
            }


            // ================================================
            // CONECTAR E CARREGAR
            // testSupabaseConnection agora já chama a meta
            // ================================================

            if (supabaseClient) {

                await testSupabaseConnection();

            } else {

                updateCounters();

                renderOrdersTable();

                updateOSNotificationBell();


                console.error(
                    '❌ Supabase não disponível após login'
                );
            }


            // ================================================
            // MENU
            // ================================================

            atualizarVisibilidadeMenu();


            // ================================================
            // BOTÕES
            // ================================================

            const reembolsosBtn =
                document.getElementById(
                    'reembolsosBtn'
                );


            if (reembolsosBtn) {

                reembolsosBtn.onclick =
                    () =>
                        abrirSistemaReembolsos();
            }


            if (logoutBtn) {

                logoutBtn.onclick =
                    handleLogout;
            }


        } catch (error) {

            console.error(
                '❌ Erro pós-login:',
                error
            );
        }

    },
    500
);
        
    } else {
        showToast('❌ Usuário ou senha incorretos', 'error');
        passwordInput.value = '';
        passwordInput.focus();
    }
    
    if (submitBtn) {
        submitBtn.innerHTML = originalBtnText;
        submitBtn.disabled = false;
    }
}

// Adicione no início do script.js, perto das outras variáveis globais
let salesSyncStatus = {
    isSyncing: false,
    lastSync: null,
    totalSynced: 0
};

// ============================================================
// META DE CONFERÊNCIA DE OS - RONALD
// ============================================================

const META_RONALD_CONFIG = {

    username:
        'ronald',

    nome:
        'Ronald',

    adminUsername:
        'andressamiotto',

    metaDiariaPadrao:
        15,

    maxIgnoradasDia:
        3,

    maxDiasIgnorarSemana:
        3,

    intervaloVerificacao:
        30 * 60 * 1000, // 30 minutos

    intervaloPollBloqueio:
        30 * 1000 // verifica desbloqueio da Andressa a cada 30s
};


let bloqueioMetaRonaldAtivo =
    false;


let verificacaoMetaRonaldEmAndamento =
    false;


let ultimoStatusMetaRonald =
    null;


let timerPollBloqueioMetaRonald =
    null;


let guardMetaRonaldInstalado =
    false;


// ============================================================
// UTILIDADES DE DATA
// ============================================================

function dataLocalISO(data = new Date()) {

    const d =
        new Date(data);


    const ano =
        d.getFullYear();


    const mes =
        String(
            d.getMonth() + 1
        ).padStart(2, '0');


    const dia =
        String(
            d.getDate()
        ).padStart(2, '0');


    return `${ano}-${mes}-${dia}`;
}


function criarDataLocalMetaRonald(
    dataString
) {

    const partes =
        String(
            dataString
        )
            .split('-')
            .map(Number);


    return new Date(
        partes[0],
        partes[1] - 1,
        partes[2],
        12,
        0,
        0,
        0
    );
}


// ============================================================
// DIAS QUE POSSUEM META
//
// Atualmente:
// segunda a sexta.
//
// Se quiser incluir sábado depois:
// return dia >= 1 && dia <= 6;
// ============================================================

function ehDiaDeMetaRonald(
    data
) {

    const dia =
        new Date(
            data
        ).getDay();


    return (
        dia >= 1 &&
        dia <= 5
    );
}


// ============================================================
// INÍCIO DA SEMANA = SEGUNDA
// ============================================================

function inicioSemanaMetaRonald(
    data = new Date()
) {

    const d =
        new Date(
            data
        );


    d.setHours(
        12,
        0,
        0,
        0
    );


    const diaSemana =
        d.getDay();


    const diferenca =
        (
            diaSemana + 6
        ) % 7;


    d.setDate(
        d.getDate() -
        diferenca
    );


    return dataLocalISO(
        d
    );
}


// ============================================================
// FIM DA SEMANA = DOMINGO
// ============================================================

function fimSemanaMetaRonald(
    data = new Date()
) {

    const inicio =
        criarDataLocalMetaRonald(
            inicioSemanaMetaRonald(
                data
            )
        );


    inicio.setDate(
        inicio.getDate() +
        6
    );


    return dataLocalISO(
        inicio
    );
}


// ============================================================
// ESCAPE HTML LOCAL
// ============================================================

function escapeHtmlMetaRonald(
    valor
) {

    return String(
        valor ?? ''
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


// ============================================================
// AGUARDAR SUPABASE
// ============================================================

async function aguardarSupabaseMetaRonald(
    tentativas = 20
) {

    for (
        let i = 0;
        i < tentativas;
        i++
    ) {

        if (supabaseClient) {
            return true;
        }


        await new Promise(
            resolve =>
                setTimeout(
                    resolve,
                    250
                )
        );
    }


    return false;
}


// ============================================================
// CARREGAR SITUAÇÃO ATUAL DA META
//
// Essa função pode ser usada pelo Ronald
// e também pelo painel da Andressa.
// ============================================================

async function carregarStatusMetaRonald() {

    const conectado =
        await aguardarSupabaseMetaRonald();


    if (!conectado) {

        throw new Error(
            'Supabase ainda não está disponível'
        );
    }


    // ========================================================
    // CONFIGURAÇÃO
    // ========================================================

    const {
        data: config,
        error: configError
    } =
        await supabaseClient
            .from(
                'os_conferencia_meta_config'
            )
            .select('*')
            .eq(
                'username',
                META_RONALD_CONFIG.username
            )
            .maybeSingle();


    if (configError) {
        throw configError;
    }


    if (
        !config ||
        config.ativo === false
    ) {

        return {

            ativo:
                false

        };
    }


    const metaDiaria =
        Number(
            config.meta_diaria
        ) ||
        META_RONALD_CONFIG.metaDiariaPadrao;


    const dataInicio =
        config.data_inicio;


    const hoje =
        dataLocalISO(
            new Date()
        );


    // ========================================================
    // BUSCAR TODAS AS CONFERÊNCIAS
    // DESDE O INÍCIO DA META
    // ========================================================

    const dataInicialJS =
        criarDataLocalMetaRonald(
            dataInicio
        );


    dataInicialJS.setHours(
        0,
        0,
        0,
        0
    );


    const {
        data: logs,
        error: logError
    } =
        await supabaseClient
            .from(
                'os_conferencia_meta_log'
            )
            .select(
                'id, os_id, resultado, data_conferencia'
            )
            .eq(
                'username',
                META_RONALD_CONFIG.username
            )
            .gte(
                'data_conferencia',
                dataInicialJS.toISOString()
            )
            .lte(
                'data_conferencia',
                new Date().toISOString()
            );


    if (logError) {
        throw logError;
    }


    // ========================================================
    // AGRUPAR CONFERÊNCIAS POR DIA
    // ========================================================

    const conferenciasPorDia =
        {};


    (
        logs ||
        []
    ).forEach(
        item => {

            const chave =
                dataLocalISO(
                    new Date(
                        item.data_conferencia
                    )
                );


            if (
                !conferenciasPorDia[
                    chave
                ]
            ) {

                conferenciasPorDia[
                    chave
                ] = 0;
            }


            conferenciasPorDia[
                chave
            ]++;

        }
    );


    // ========================================================
    // CALCULAR PENDÊNCIA ACUMULADA
    //
    // IMPORTANTE:
    // excesso de um dia NÃO vira crédito para outro.
    //
    // Exemplo:
    // segunda meta 15, fez 20
    // terça continua precisando de 15.
    // ========================================================

    let pendenciaAnterior =
        0;


    let metaBaseHoje =
        0;


    let exigenciaTotalHoje =
        0;


    let conferidasHoje =
        conferenciasPorDia[
            hoje
        ] ||
        0;


    let faltamHoje =
        0;


    const cursor =
        criarDataLocalMetaRonald(
            dataInicio
        );


    const hojeData =
        criarDataLocalMetaRonald(
            hoje
        );


    let seguranca =
        0;


    while (
        cursor <= hojeData &&
        seguranca < 5000
    ) {

        seguranca++;


        const chave =
            dataLocalISO(
                cursor
            );


        const feitasNesseDia =
            conferenciasPorDia[
                chave
            ] ||
            0;


        const metaDesteDia =
            ehDiaDeMetaRonald(
                cursor
            )
                ? metaDiaria
                : 0;


        const ehHoje =
            chave === hoje;


        if (ehHoje) {

            metaBaseHoje =
                metaDesteDia;


            exigenciaTotalHoje =
                pendenciaAnterior +
                metaBaseHoje;


            faltamHoje =
                Math.max(
                    0,
                    exigenciaTotalHoje -
                    feitasNesseDia
                );


            break;
        }


        pendenciaAnterior =
            Math.max(
                0,
                pendenciaAnterior +
                metaDesteDia -
                feitasNesseDia
            );


        cursor.setDate(
            cursor.getDate() +
            1
        );
    }


    // ========================================================
    // CONTROLE DE IGNORADAS DE HOJE
    // ========================================================

    const {
        data: controleHoje,
        error: controleError
    } =
        await supabaseClient
            .from(
                'os_conferencia_meta_diaria'
            )
            .select('*')
            .eq(
                'username',
                META_RONALD_CONFIG.username
            )
            .eq(
                'data',
                hoje
            )
            .maybeSingle();


    if (controleError) {
        throw controleError;
    }


    const ignoradasHoje =
        Number(
            controleHoje?.ignoradas
        ) ||
        0;


    // ========================================================
    // DIAS DA SEMANA EM QUE ELE JÁ USOU "IGNORAR"
    // ========================================================

    const semanaInicio =
        inicioSemanaMetaRonald();


    const semanaFim =
        fimSemanaMetaRonald();


    const {
        data: controlesSemana,
        error: semanaError
    } =
        await supabaseClient
            .from(
                'os_conferencia_meta_diaria'
            )
            .select(
                'data, ignoradas'
            )
            .eq(
                'username',
                META_RONALD_CONFIG.username
            )
            .gte(
                'data',
                semanaInicio
            )
            .lte(
                'data',
                semanaFim
            )
            .gt(
                'ignoradas',
                0
            );


    if (semanaError) {
        throw semanaError;
    }


    const diasIgnoradosSemana =
        new Set(
            (
                controlesSemana ||
                []
            ).map(
                item =>
                    item.data
            )
        ).size;


    const hojeJaIgnorou =
        ignoradasHoje > 0;


    // ========================================================
    // ESTADO GLOBAL DO BLOQUEIO
    // ========================================================

    const {
        data: estado,
        error: estadoError
    } =
        await supabaseClient
            .from(
                'os_conferencia_meta_estado'
            )
            .select('*')
            .eq(
                'username',
                META_RONALD_CONFIG.username
            )
            .maybeSingle();


    if (estadoError) {
        throw estadoError;
    }


    const agora =
        new Date();


    const overrideAte =
        estado?.desbloqueado_admin_ate
            ? new Date(
                estado.desbloqueado_admin_ate
            )
            : null;


    const overrideAtivo =
        !!(
            overrideAte &&
            overrideAte >
            agora
        );


    const overrideExpirado =
        !!(
            overrideAte &&
            overrideAte <=
            agora
        );


    // ========================================================
    // QUANTIDADE DE OS DISPONÍVEIS PARA CONFERÊNCIA
    // ========================================================

    let osDisponiveis =
        0;


    try {

        const {
            count,
            error: countError
        } =
            await supabaseClient
                .from(
                    'ordens_service'
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
                    'status',
                    'concluida'
                )
                .eq(
                    'conferido',
                    false
                );


        if (!countError) {

            osDisponiveis =
                Number(
                    count
                ) ||
                0;
        }

    } catch (
        countException
    ) {

        console.warn(
            'Não foi possível contar OS não conferidas:',
            countException
        );
    }


    const diasEquivalentesPendentes =
        faltamHoje > 0
            ? Math.ceil(
                faltamHoje /
                metaDiaria
            )
            : 0;


    const diasAcumuladosAnteriores =
        pendenciaAnterior > 0
            ? Math.ceil(
                pendenciaAnterior /
                metaDiaria
            )
            : 0;


    return {

        ativo:
            true,

        metaDiaria,

        dataInicio,

        hoje,

        metaBaseHoje,

        pendenciaAnterior,

        exigenciaTotalHoje,

        conferidasHoje,

        faltamHoje,

        diasEquivalentesPendentes,

        diasAcumuladosAnteriores,

        ignoradasHoje,

        diasIgnoradosSemana,

        hojeJaIgnorou,

        semanaInicio,

        semanaFim,

        osDisponiveis,

        estado:
            estado || {

                username:
                    META_RONALD_CONFIG.username,

                bloqueado:
                    false
            },

        overrideAtivo,

        overrideExpirado
    };
}


// ============================================================
// FECHAR AVISO DE META
// ============================================================

function fecharModalMetaRonald() {

    const modal =
        document.getElementById(
            'modalAvisoMetaRonald'
        );


    if (modal) {
        modal.remove();
    }
}


// ============================================================
// ABRIR AVISO DA META
// ============================================================

function mostrarModalMetaRonald(
    status
) {

    if (
        !status ||
        status.faltamHoje <= 0
    ) {

        fecharModalMetaRonald();

        return;
    }


    fecharModalMetaRonald();


    const modal =
        document.createElement(
            'div'
        );


    modal.id =
        'modalAvisoMetaRonald';


    modal.style.cssText = `
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,.62);
        z-index: 999999;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
    `;


    const acumulado =
        status.pendenciaAnterior > 0;


    const limiteDiaProximo =
        status.ignoradasHoje >=
        META_RONALD_CONFIG.maxIgnoradasDia;


    const limiteSemanaProximo =
        (
            !status.hojeJaIgnorou &&
            status.diasIgnoradosSemana >=
            META_RONALD_CONFIG.maxDiasIgnorarSemana
        );


    let avisoLimite =
        '';


    if (limiteDiaProximo) {

        avisoLimite = `
            <div style="
                background:#ffebee;
                border:1px solid #ef9a9a;
                color:#b71c1c;
                padding:12px;
                border-radius:8px;
                margin-top:15px;
                font-weight:700;
            ">
                <i class="fas fa-lock"></i>
                Você já ignorou 3 vezes hoje.
                Se tentar ignorar novamente,
                seu acesso será bloqueado.
            </div>
        `;

    } else if (
        limiteSemanaProximo
    ) {

        avisoLimite = `
            <div style="
                background:#ffebee;
                border:1px solid #ef9a9a;
                color:#b71c1c;
                padding:12px;
                border-radius:8px;
                margin-top:15px;
                font-weight:700;
            ">
                <i class="fas fa-lock"></i>
                Você já utilizou o recurso de ignorar
                em 3 dias diferentes nesta semana.
                Se tentar ignorar hoje,
                seu acesso será bloqueado.
            </div>
        `;
    }


    modal.innerHTML = `

        <div style="
            width:100%;
            max-width:620px;
            background:white;
            border-radius:14px;
            overflow:hidden;
            box-shadow:0 20px 60px rgba(0,0,0,.35);
        ">

            <div style="
                padding:22px 25px;
                background:linear-gradient(
                    135deg,
                    #ff9800,
                    #f57c00
                );
                color:white;
            ">

                <div style="
                    font-size:21px;
                    font-weight:800;
                ">
                    <i class="fas fa-clipboard-check"></i>
                    Meta de conferência pendente
                </div>

                <div style="
                    margin-top:5px;
                    opacity:.95;
                ">
                    Ronald, sua meta de conferência ainda não foi concluída.
                </div>

            </div>


            <div style="
                padding:25px;
            ">

                ${
                    acumulado
                        ? `
                            <div style="
                                background:#fff3cd;
                                border:1px solid #ffe69c;
                                color:#664d03;
                                padding:14px;
                                border-radius:8px;
                                margin-bottom:18px;
                            ">
                                <strong>
                                    <i class="fas fa-exclamation-triangle"></i>
                                    Há meta acumulada.
                                </strong>

                                <div style="margin-top:6px;">
                                    Você trouxe
                                    <strong>${status.pendenciaAnterior}</strong>
                                    conferência(ões) pendente(s)
                                    de dias anteriores.

                                    Isso equivale a aproximadamente
                                    <strong>
                                        ${status.diasAcumuladosAnteriores}
                                        dia(s) de meta
                                    </strong>.
                                </div>
                            </div>
                        `
                        : ''
                }


                <div style="
                    display:grid;
                    grid-template-columns:
                        repeat(2, minmax(0,1fr));
                    gap:10px;
                ">

                    <div style="
                        background:#f8f9fa;
                        padding:14px;
                        border-radius:8px;
                    ">
                        <div style="
                            font-size:12px;
                            color:#6c757d;
                        ">
                            Meta base do dia
                        </div>

                        <strong style="
                            font-size:24px;
                        ">
                            ${status.metaBaseHoje}
                        </strong>
                    </div>


                    <div style="
                        background:#f8f9fa;
                        padding:14px;
                        border-radius:8px;
                    ">
                        <div style="
                            font-size:12px;
                            color:#6c757d;
                        ">
                            Pendência anterior
                        </div>

                        <strong style="
                            font-size:24px;
                        ">
                            ${status.pendenciaAnterior}
                        </strong>
                    </div>


                    <div style="
                        background:#e8f5e9;
                        padding:14px;
                        border-radius:8px;
                    ">
                        <div style="
                            font-size:12px;
                            color:#2e7d32;
                        ">
                            Conferidas hoje
                        </div>

                        <strong style="
                            font-size:24px;
                            color:#2e7d32;
                        ">
                            ${status.conferidasHoje}
                        </strong>
                    </div>


                    <div style="
                        background:#ffebee;
                        padding:14px;
                        border-radius:8px;
                    ">
                        <div style="
                            font-size:12px;
                            color:#c62828;
                        ">
                            Ainda faltam
                        </div>

                        <strong style="
                            font-size:24px;
                            color:#c62828;
                        ">
                            ${status.faltamHoje}
                        </strong>
                    </div>

                </div>


                <div style="
                    margin-top:18px;
                    background:#e3f2fd;
                    padding:14px;
                    border-radius:8px;
                    color:#0d47a1;
                ">

                    <strong>Meta exigida hoje:</strong>

                    ${status.exigenciaTotalHoje}
                    conferência(ões).

                    <br>

                    <strong>
                        OS atualmente disponíveis:
                    </strong>

                    ${status.osDisponiveis}

                </div>


                <div style="
                    margin-top:15px;
                    display:grid;
                    grid-template-columns:
                        repeat(2, minmax(0,1fr));
                    gap:10px;
                    font-size:13px;
                ">

                    <div style="
                        border:1px solid #ddd;
                        padding:10px;
                        border-radius:8px;
                    ">
                        Ignoradas hoje:
                        <strong>
                            ${status.ignoradasHoje}
                            /
                            ${META_RONALD_CONFIG.maxIgnoradasDia}
                        </strong>
                    </div>


                    <div style="
                        border:1px solid #ddd;
                        padding:10px;
                        border-radius:8px;
                    ">
                        Dias com ignorar na semana:
                        <strong>
                            ${status.diasIgnoradosSemana}
                            /
                            ${META_RONALD_CONFIG.maxDiasIgnorarSemana}
                        </strong>
                    </div>

                </div>


                ${avisoLimite}


                <div style="
                    display:flex;
                    gap:10px;
                    margin-top:22px;
                    flex-wrap:wrap;
                ">

                    <button
                        onclick="irParaConferenciaMetaRonald()"
                        style="
                            flex:1;
                            min-width:220px;
                            border:none;
                            background:#28a745;
                            color:white;
                            padding:13px;
                            border-radius:8px;
                            cursor:pointer;
                            font-weight:700;
                            font-size:14px;
                        "
                    >
                        <i class="fas fa-check-double"></i>
                        Ir para Não Conferidas
                    </button>


                    <button
                        onclick="ignorarAvisoMetaRonald()"
                        style="
                            flex:1;
                            min-width:180px;
                            border:none;
                            background:#6c757d;
                            color:white;
                            padding:13px;
                            border-radius:8px;
                            cursor:pointer;
                            font-weight:700;
                            font-size:14px;
                        "
                    >
                        <i class="fas fa-clock"></i>
                        Ignorar por enquanto
                    </button>

                </div>


                <div style="
                    margin-top:15px;
                    color:#6c757d;
                    font-size:12px;
                    line-height:1.5;
                ">
                    O aviso volta a aparecer a cada
                    30 minutos enquanto a meta estiver pendente.
                    A meta não desaparece ao sair do sistema.
                </div>

            </div>

        </div>
    `;


    document.body.appendChild(
        modal
    );
}


// ============================================================
// IR DIRETO PARA "NÃO CONFERIDAS"
// ============================================================

window.irParaConferenciaMetaRonald =
    async function() {

        fecharModalMetaRonald();


        if (
            typeof window.abrirSistemaOS ===
            'function'
        ) {

            window.abrirSistemaOS();
        }


        paginaAtualOS =
            1;


        currentFilter =
            'nao_conferidas';


        toggleFiltroDataConcluidas(
            false
        );


        setTimeout(
            () => {

                renderOrdersTable();

                highlightActiveFilterButton();


                if (
                    bloqueioMetaRonaldAtivo
                ) {

                    aplicarRestricaoVisualMetaRonald();
                }

            },
            350
        );
    };


// ============================================================
// IGNORAR AVISO
// ============================================================

window.ignorarAvisoMetaRonald =
    async function() {

        if (
            !currentUser ||
            currentUser.username !==
            META_RONALD_CONFIG.username
        ) {
            return;
        }


        try {

            // Buscar novamente para evitar usar
            // informação desatualizada.
            const status =
                await carregarStatusMetaRonald();


            if (
                status.faltamHoje <= 0
            ) {

                fecharModalMetaRonald();

                showToast(
                    '✅ Sua meta já foi concluída.',
                    'success'
                );

                return;
            }


            if (
                status.overrideAtivo
            ) {

                fecharModalMetaRonald();

                return;
            }


            // =================================================
            // 4ª TENTATIVA NO MESMO DIA
            // =================================================

            if (
                status.ignoradasHoje >=
                META_RONALD_CONFIG.maxIgnoradasDia
            ) {

                await bloquearMetaRonald(
                    'Limite de 3 avisos ignorados no mesmo dia excedido.',
                    status
                );

                return;
            }


            // =================================================
            // TENTATIVA NO 4º DIA DIFERENTE DA SEMANA
            // =================================================

            if (
                !status.hojeJaIgnorou &&
                status.diasIgnoradosSemana >=
                META_RONALD_CONFIG.maxDiasIgnorarSemana
            ) {

                await bloquearMetaRonald(
                    'Tentativa de ignorar a meta no 4º dia diferente da semana.',
                    status
                );

                return;
            }


            const novaQuantidade =
                status.ignoradasHoje +
                1;


            const {
                error
            } =
                await supabaseClient
                    .from(
                        'os_conferencia_meta_diaria'
                    )
                    .upsert(
                        {

                            username:
                                META_RONALD_CONFIG.username,

                            data:
                                status.hoje,

                            ignoradas:
                                novaQuantidade,

                            atualizado_em:
                                new Date()
                                    .toISOString()

                        },
                        {

                            onConflict:
                                'username,data'

                        }
                    );


            if (error) {
                throw error;
            }


            fecharModalMetaRonald();


            showToast(
                `⚠️ Aviso ignorado (${novaQuantidade}/${META_RONALD_CONFIG.maxIgnoradasDia} hoje)`,
                'warning'
            );


        } catch (error) {

            console.error(
                'Erro ao ignorar aviso da meta:',
                error
            );


            showToast(
                '❌ Não foi possível registrar o aviso ignorado.',
                'error'
            );
        }
    };


// ============================================================
// BLOQUEAR RONALD
// ============================================================

async function bloquearMetaRonald(
    motivo,
    statusAtual = null
) {

    if (
        !supabaseClient
    ) {
        return;
    }


    const agora =
        new Date()
            .toISOString();


    const {
        error
    } =
        await supabaseClient
            .from(
                'os_conferencia_meta_estado'
            )
            .upsert(
                {

                    username:
                        META_RONALD_CONFIG.username,

                    bloqueado:
                        true,

                    bloqueado_em:
                        agora,

                    motivo_bloqueio:
                        motivo,

                    desbloqueado_admin_ate:
                        null,

                    desbloqueado_por:
                        null,

                    atualizado_em:
                        agora

                },
                {

                    onConflict:
                        'username'

                }
            );


    if (error) {

        console.error(
            'Erro ao bloquear Ronald:',
            error
        );

        throw error;
    }


    const status =
        statusAtual ||
        await carregarStatusMetaRonald();


    status.estado = {

        ...(
            status.estado ||
            {}
        ),

        bloqueado:
            true,

        bloqueado_em:
            agora,

        motivo_bloqueio:
            motivo,

        desbloqueado_admin_ate:
            null,

        desbloqueado_por:
            null
    };


    status.overrideAtivo =
        false;


    ativarBloqueioVisualMetaRonald(
        status,
        motivo
    );
}


// ============================================================
// DESBLOQUEIO AUTOMÁTICO POR META CUMPRIDA
// ============================================================

async function desbloquearAutomaticamenteMetaRonald() {

    if (
        !supabaseClient
    ) {
        return;
    }


    const {
        error
    } =
        await supabaseClient
            .from(
                'os_conferencia_meta_estado'
            )
            .upsert(
                {

                    username:
                        META_RONALD_CONFIG.username,

                    bloqueado:
                        false,

                    bloqueado_em:
                        null,

                    motivo_bloqueio:
                        null,

                    desbloqueado_admin_ate:
                        null,

                    desbloqueado_por:
                        null,

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

        console.error(
            'Erro ao retirar bloqueio automático:',
            error
        );

        return;
    }


    desativarBloqueioVisualMetaRonald();


    fecharModalMetaRonald();
}


// ============================================================
// BANNER DE BLOQUEIO
// ============================================================

function atualizarBannerBloqueioMetaRonald(
    status,
    motivo
) {

    let banner =
        document.getElementById(
            'ronaldMetaBloqueioBanner'
        );


    if (!banner) {

        banner =
            document.createElement(
                'div'
            );


        banner.id =
            'ronaldMetaBloqueioBanner';


        document.body.appendChild(
            banner
        );
    }


    banner.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        z-index: 999998;
        background: linear-gradient(
            135deg,
            #b71c1c,
            #d32f2f
        );
        color: white;
        padding: 12px 20px;
        box-shadow: 0 4px 18px rgba(0,0,0,.30);
        text-align: center;
        font-size: 14px;
    `;


    banner.innerHTML = `

        <div style="
            font-weight:800;
            font-size:16px;
        ">
            <i class="fas fa-lock"></i>
            SISTEMA BLOQUEADO — META DE CONFERÊNCIA PENDENTE
        </div>

        <div style="
            margin-top:4px;
        ">
            Conferidas hoje:
            <strong>
                ${status.conferidasHoje}
            </strong>

            &nbsp; | &nbsp;

            Faltam:
            <strong>
                ${status.faltamHoje}
            </strong>

            &nbsp; | &nbsp;

            Meta exigida:
            <strong>
                ${status.exigenciaTotalHoje}
            </strong>
        </div>

        ${
            motivo
                ? `
                    <div style="
                        font-size:11px;
                        opacity:.9;
                        margin-top:3px;
                    ">
                        ${escapeHtmlMetaRonald(
                            motivo
                        )}
                    </div>
                `
                : ''
        }

        <div style="
            font-size:11px;
            opacity:.9;
            margin-top:3px;
        ">
            Somente a conferência de OS está liberada.
            Andressa pode realizar desbloqueio administrativo.
        </div>
    `;
}


function aplicarRestricaoVisualMetaRonald() {
    if (
        !bloqueioMetaRonaldAtivo ||
        !currentUser ||
        currentUser.username !==
            META_RONALD_CONFIG.username
    ) {
        return;
    }

    /*
     * A aba de Ordem de Serviço permanece completamente
     * liberada. Remove qualquer ocultação aplicada por
     * versões anteriores do bloqueio.
     */
    restaurarInterfaceMetaRonald();

    console.log(
        '🔒 Ronald bloqueado: outras abas bloqueadas, aba OS totalmente liberada.'
    );
}


// ============================================================
// RESTAURAR INTERFACE
// ============================================================

function restaurarInterfaceMetaRonald() {

    document
        .querySelectorAll(
            '[data-meta-ronald-display]'
        )
        .forEach(
            elemento => {

                elemento.style.display =
                    elemento.getAttribute(
                        'data-meta-ronald-display'
                    ) ||
                    '';


                elemento.removeAttribute(
                    'data-meta-ronald-display'
                );

            }
        );
}


function ativarBloqueioVisualMetaRonald(
    status,
    motivo = null
) {
    if (
        !currentUser ||
        currentUser.username !==
            META_RONALD_CONFIG.username
    ) {
        return;
    }

    const jaEstavaBloqueado =
        bloqueioMetaRonaldAtivo;

    bloqueioMetaRonaldAtivo =
        true;

    ultimoStatusMetaRonald =
        status;

    fecharModalMetaRonald();

    /*
     * Ao ser bloqueado, Ronald é direcionado para a aba OS.
     * A aba continua inteiramente liberada.
     */
    if (
        !jaEstavaBloqueado &&
        typeof window.abrirSistemaOS ===
            'function'
    ) {
        window.abrirSistemaOS();
    }

    /*
     * Não força mais o filtro "Não Conferidas".
     * Mantém o filtro que Ronald estiver utilizando.
     */
    setTimeout(
        () => {
            if (
                typeof renderOrdersTable ===
                'function'
            ) {
                renderOrdersTable();
            }

            if (
                typeof highlightActiveFilterButton ===
                'function'
            ) {
                highlightActiveFilterButton();
            }

            aplicarRestricaoVisualMetaRonald();
        },
        300
    );

    atualizarBannerBloqueioMetaRonald(
        status,
        motivo ||
        status.estado
            ?.motivo_bloqueio ||
        'Meta de conferência pendente'
    );

    /*
     * Continua verificando a cada 30 segundos se houve
     * desbloqueio administrativo ou conclusão da meta.
     */
    if (
        !timerPollBloqueioMetaRonald
    ) {
        timerPollBloqueioMetaRonald =
            setInterval(
                () => {
                    if (
                        currentUser &&
                        currentUser.username ===
                            META_RONALD_CONFIG.username &&
                        bloqueioMetaRonaldAtivo
                    ) {
                        verificarMetaRonald({
                            mostrarAviso:
                                false,

                            motivo:
                                'poll_bloqueio'
                        });
                    }
                },
                META_RONALD_CONFIG
                    .intervaloPollBloqueio
            );
    }
}


// ============================================================
// DESATIVAR BLOQUEIO VISUAL
// ============================================================

function desativarBloqueioVisualMetaRonald() {

    bloqueioMetaRonaldAtivo =
        false;


    const banner =
        document.getElementById(
            'ronaldMetaBloqueioBanner'
        );


    if (banner) {
        banner.remove();
    }


    restaurarInterfaceMetaRonald();


    if (
        timerPollBloqueioMetaRonald
    ) {

        clearInterval(
            timerPollBloqueioMetaRonald
        );


        timerPollBloqueioMetaRonald =
            null;
    }
}


// ============================================================
// VERIFICAR META
// ============================================================

async function verificarMetaRonald(
    {
        mostrarAviso = true,
        motivo = 'verificacao'
    } = {}
) {

    if (
        !currentUser ||
        currentUser.username !==
        META_RONALD_CONFIG.username
    ) {

        return null;
    }


    if (
        verificacaoMetaRonaldEmAndamento
    ) {

        return ultimoStatusMetaRonald;
    }


    verificacaoMetaRonaldEmAndamento =
        true;


    try {

        const status =
            await carregarStatusMetaRonald();


        ultimoStatusMetaRonald =
            status;


        if (
            !status ||
            status.ativo === false
        ) {

            desativarBloqueioVisualMetaRonald();

            fecharModalMetaRonald();

            return status;
        }


        // ====================================================
        // META CONCLUÍDA
        // ====================================================

        if (
            status.faltamHoje <= 0
        ) {

            if (
                status.estado
                    ?.bloqueado ||

                bloqueioMetaRonaldAtivo ||

                status.estado
                    ?.desbloqueado_admin_ate
            ) {

                await desbloquearAutomaticamenteMetaRonald();
            }


            fecharModalMetaRonald();


            return status;
        }


        // ====================================================
        // ANDRESSA LIBEROU TEMPORARIAMENTE
        // ====================================================

        if (
            status.overrideAtivo
        ) {

            desativarBloqueioVisualMetaRonald();

            fecharModalMetaRonald();


            return status;
        }


        // ====================================================
        // DESBLOQUEIO ADMINISTRATIVO EXPIROU
        //
        // A pendência não foi apagada.
        // ====================================================

        if (
            status.overrideExpirado &&
            !status.estado
                ?.bloqueado
        ) {

            await bloquearMetaRonald(
                'O desbloqueio administrativo expirou e a meta continua pendente.',
                status
            );


            return status;
        }


        // ====================================================
        // JÁ ESTÁ BLOQUEADO NO BANCO
        // ====================================================

        if (
            status.estado
                ?.bloqueado
        ) {

            ativarBloqueioVisualMetaRonald(
                status,
                status.estado
                    ?.motivo_bloqueio
            );


            return status;
        }


        // ====================================================
        // NÃO BLOQUEADO:
        // APENAS MOSTRA AVISO
        // ====================================================

        desativarBloqueioVisualMetaRonald();


        if (
            mostrarAviso
        ) {

            mostrarModalMetaRonald(
                status
            );
        }


        return status;


    } catch (error) {

        console.error(
            `❌ Erro verificando meta Ronald (${motivo}):`,
            error
        );


        return null;


    } finally {

        verificacaoMetaRonaldEmAndamento =
            false;
    }
}


// ============================================================
// INICIAR CONTROLE QUANDO RONALD ENTRA
// ============================================================

async function inicializarControleMetaRonald() {

    if (
        !currentUser ||
        currentUser.username !==
        META_RONALD_CONFIG.username
    ) {

        return;
    }


    const conectado =
        await aguardarSupabaseMetaRonald();


    if (!conectado) {

        console.warn(
            'Supabase indisponível para controle da meta Ronald'
        );

        return;
    }


    await verificarMetaRonald(
        {

            mostrarAviso:
                true,

            motivo:
                'login'

        }
    );
}


// ============================================================
// ENCERRAR CONTROLE AO FAZER LOGOUT
// ============================================================

function finalizarControleMetaRonaldSessao() {

    fecharModalMetaRonald();

    desativarBloqueioVisualMetaRonald();


    const painel =
        document.getElementById(
            'painelMetaRonaldModal'
        );


    if (painel) {
        painel.remove();
    }


    ultimoStatusMetaRonald =
        null;


    verificacaoMetaRonaldEmAndamento =
        false;
}


function elementoPermitidoDuranteBloqueioMetaRonald(
    elemento
) {
    if (!elemento) {
        return true;
    }

    /*
     * Tudo dentro da aba Ordem de Serviço fica liberado.
     * O container principal da aba OS é #mainSystem.
     */
    if (
        elemento.closest &&
        elemento.closest(
            '#mainSystem'
        )
    ) {
        return true;
    }

    /*
     * Modais pertencentes à aba OS também permanecem
     * totalmente liberados.
     */
    if (
        elemento.closest &&
        (
            elemento.closest(
                '#viewOSModal'
            ) ||

            elemento.closest(
                '#photoViewerModal'
            ) ||

            elemento.closest(
                '#rejeitarOSModal'
            ) ||

            elemento.closest(
                '#relatorioOSModal'
            ) ||

            elemento.closest(
                '#ronaldMetaBloqueioBanner'
            )
        )
    ) {
        return true;
    }

    /*
     * Logout continua liberado mesmo durante o bloqueio.
     */
    const acionavel =
        elemento.closest
            ? elemento.closest(
                'button, a, input, select, textarea, form, [onclick]'
            )
            : null;

    if (
        elemento.id === 'logoutBtn' ||
        acionavel?.id === 'logoutBtn'
    ) {
        return true;
    }

    /*
     * Clique em áreas sem ação não precisa ser bloqueado.
     */
    if (!acionavel) {
        return true;
    }

    /*
     * Qualquer ação fora da aba OS permanece bloqueada.
     */
    return false;
}


function instalarGuardMetaRonald() {
    if (
        guardMetaRonaldInstalado
    ) {
        return;
    }

    guardMetaRonaldInstalado =
        true;

    /*
     * Bloqueia cliques somente fora da aba OS.
     */
    document.addEventListener(
        'click',
        function(event) {
            if (
                !bloqueioMetaRonaldAtivo ||
                !currentUser ||
                currentUser.username !==
                    META_RONALD_CONFIG.username
            ) {
                return;
            }

            if (
                elementoPermitidoDuranteBloqueioMetaRonald(
                    event.target
                )
            ) {
                return;
            }

            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();

            showToast(
                '🔒 Enquanto a meta estiver pendente, somente a aba de Ordem de Serviço está disponível.',
                'error'
            );
        },
        true
    );

    /*
     * Formulários da aba OS ficam totalmente liberados.
     * Formulários de outras abas permanecem bloqueados.
     */
    document.addEventListener(
        'submit',
        function(event) {
            if (
                !bloqueioMetaRonaldAtivo ||
                !currentUser ||
                currentUser.username !==
                    META_RONALD_CONFIG.username
            ) {
                return;
            }

            if (
                event.target.closest(
                    '#mainSystem'
                ) ||

                event.target.closest(
                    '#viewOSModal'
                ) ||

                event.target.closest(
                    '#photoViewerModal'
                ) ||

                event.target.closest(
                    '#rejeitarOSModal'
                ) ||

                event.target.closest(
                    '#relatorioOSModal'
                )
            ) {
                return;
            }

            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();

            showToast(
                '🔒 Enquanto a meta estiver pendente, somente a aba de Ordem de Serviço está disponível.',
                'error'
            );
        },
        true
    );

    /*
     * Atalhos utilizados dentro da aba OS também ficam
     * liberados. Fora dela, Ctrl e Command continuam
     * bloqueados.
     */
    document.addEventListener(
        'keydown',
        function(event) {
            if (
                !bloqueioMetaRonaldAtivo ||
                !currentUser ||
                currentUser.username !==
                    META_RONALD_CONFIG.username
            ) {
                return;
            }

            if (
                event.target.closest &&
                (
                    event.target.closest(
                        '#mainSystem'
                    ) ||

                    event.target.closest(
                        '#viewOSModal'
                    ) ||

                    event.target.closest(
                        '#photoViewerModal'
                    ) ||

                    event.target.closest(
                        '#rejeitarOSModal'
                    ) ||

                    event.target.closest(
                        '#relatorioOSModal'
                    )
                )
            ) {
                return;
            }

            if (
                event.key ===
                'Escape'
            ) {
                return;
            }

            if (
                event.ctrlKey ||
                event.metaKey
            ) {
                event.preventDefault();
                event.stopImmediatePropagation();
            }
        },
        true
    );
}


instalarGuardMetaRonald();


// ============================================================
// PAINEL ADMINISTRATIVO DA ANDRESSA
// ============================================================

window.abrirPainelMetaRonald =
    async function() {

        if (
            !currentUser ||
            currentUser.username !==
            META_RONALD_CONFIG.adminUsername
        ) {

            showToast(
                '⛔ Somente Andressa possui acesso a este controle.',
                'error'
            );

            return;
        }


        try {

            const status =
                await carregarStatusMetaRonald();


            let modal =
                document.getElementById(
                    'painelMetaRonaldModal'
                );


            if (modal) {
                modal.remove();
            }


            modal =
                document.createElement(
                    'div'
                );


            modal.id =
                'painelMetaRonaldModal';


            modal.style.cssText = `
                position:fixed;
                inset:0;
                background:rgba(0,0,0,.58);
                z-index:999999;
                display:flex;
                align-items:center;
                justify-content:center;
                padding:20px;
            `;


            const bloqueado =
                !!status.estado
                    ?.bloqueado;


            let liberacao =
                'Não';


            if (
                status.overrideAtivo
            ) {

                liberacao =
                    new Date(
                        status.estado
                            .desbloqueado_admin_ate
                    ).toLocaleString(
                        'pt-BR'
                    );
            }


            modal.innerHTML = `

                <div style="
                    background:white;
                    width:100%;
                    max-width:620px;
                    border-radius:14px;
                    overflow:hidden;
                    box-shadow:0 20px 60px rgba(0,0,0,.3);
                ">

                    <div style="
                        padding:20px 24px;
                        background:linear-gradient(
                            135deg,
                            #ff9800,
                            #f57c00
                        );
                        color:white;
                        display:flex;
                        justify-content:space-between;
                        align-items:center;
                    ">

                        <div>
                            <strong style="
                                font-size:20px;
                            ">
                                <i class="fas fa-user-shield"></i>
                                Controle da Meta — Ronald
                            </strong>
                        </div>


                        <button
                            onclick="fecharPainelMetaRonald()"
                            style="
                                border:none;
                                background:transparent;
                                color:white;
                                font-size:26px;
                                cursor:pointer;
                            "
                        >
                            &times;
                        </button>

                    </div>


                    <div style="
                        padding:24px;
                    ">

                        <div style="
                            display:grid;
                            grid-template-columns:
                                repeat(2,minmax(0,1fr));
                            gap:10px;
                        ">

                            <div style="
                                background:#f8f9fa;
                                padding:14px;
                                border-radius:8px;
                            ">
                                Meta diária
                                <br>
                                <strong style="font-size:24px;">
                                    ${status.metaDiaria}
                                </strong>
                            </div>


                            <div style="
                                background:#f8f9fa;
                                padding:14px;
                                border-radius:8px;
                            ">
                                Conferidas hoje
                                <br>
                                <strong style="font-size:24px;">
                                    ${status.conferidasHoje}
                                </strong>
                            </div>


                            <div style="
                                background:#fff3cd;
                                padding:14px;
                                border-radius:8px;
                            ">
                                Pendência anterior
                                <br>
                                <strong style="font-size:24px;">
                                    ${status.pendenciaAnterior}
                                </strong>
                            </div>


                            <div style="
                                background:#ffebee;
                                padding:14px;
                                border-radius:8px;
                            ">
                                Faltam
                                <br>
                                <strong style="
                                    font-size:24px;
                                    color:#c62828;
                                ">
                                    ${status.faltamHoje}
                                </strong>
                            </div>

                        </div>


                        <div style="
                            margin-top:15px;
                            border:1px solid #ddd;
                            border-radius:8px;
                            padding:14px;
                            line-height:1.8;
                        ">

                            <strong>Meta exigida hoje:</strong>
                            ${status.exigenciaTotalHoje}

                            <br>

                            <strong>Ignoradas hoje:</strong>
                            ${status.ignoradasHoje}/3

                            <br>

                            <strong>Dias ignorados na semana:</strong>
                            ${status.diasIgnoradosSemana}/3

                            <br>

                            <strong>OS disponíveis:</strong>
                            ${status.osDisponiveis}

                            <br>

                            <strong>Status:</strong>

                            ${
                                bloqueado
                                    ? `
                                        <span style="
                                            color:#d32f2f;
                                            font-weight:800;
                                        ">
                                            BLOQUEADO
                                        </span>
                                    `
                                    : `
                                        <span style="
                                            color:#28a745;
                                            font-weight:800;
                                        ">
                                            LIBERADO
                                        </span>
                                    `
                            }

                            <br>

                            <strong>
                                Liberação administrativa ativa até:
                            </strong>

                            ${liberacao}

                        </div>


                        ${
    bloqueado
        ? `
            <div style="
                margin-top:18px;
                padding:12px;
                background:#ffebee;
                border:1px solid #ef9a9a;
                border-radius:8px;
                color:#b71c1c;
                text-align:center;
                font-weight:700;
            ">
                <i class="fas fa-lock"></i>
                Ronald está BLOQUEADO
            </div>

            <button
                onclick="desbloquearRonaldAdmin()"
                style="
                    width:100%;
                    border:none;
                    background:#28a745;
                    color:white;
                    padding:14px;
                    border-radius:8px;
                    margin-top:10px;
                    cursor:pointer;
                    font-weight:800;
                    font-size:15px;
                "
            >
                <i class="fas fa-unlock"></i>
                Desbloquear Ronald até o fim do dia
            </button>
        `
        : `
            <div style="
                margin-top:18px;
                padding:14px;
                background:#e8f5e9;
                border:1px solid #a5d6a7;
                border-radius:8px;
                color:#1b5e20;
                text-align:center;
                font-weight:700;
            ">
                <i class="fas fa-unlock"></i>
                Ronald não está bloqueado no momento
            </div>
        `
}


                        <div style="
                            font-size:12px;
                            color:#6c757d;
                            margin-top:15px;
                        ">
                            O desbloqueio administrativo não apaga
                            a pendência de OS. Ele apenas libera
                            excepcionalmente o sistema até o fim do dia.
                        </div>

                    </div>

                </div>
            `;


            document.body.appendChild(
                modal
            );


        } catch (error) {

            console.error(
                'Erro abrindo painel da meta Ronald:',
                error
            );


            showToast(
                '❌ Erro ao carregar controle da meta.',
                'error'
            );
        }
    };


// ============================================================
// FECHAR PAINEL
// ============================================================

window.fecharPainelMetaRonald =
    function() {

        const modal =
            document.getElementById(
                'painelMetaRonaldModal'
            );


        if (modal) {
            modal.remove();
        }
    };


// ============================================================
// ANDRESSA DESBLOQUEAR RONALD
// ============================================================

window.desbloquearRonaldAdmin =
    async function() {

        if (
            !currentUser ||
            currentUser.username !==
            META_RONALD_CONFIG.adminUsername
        ) {

            showToast(
                '⛔ Somente Andressa pode desbloquear Ronald.',
                'error'
            );

            return;
        }


        if (
            !confirm(
                'Deseja realmente desbloquear Ronald?\n\n' +
                'A liberação valerá até o final de hoje.\n' +
                'A pendência de conferências NÃO será apagada.'
            )
        ) {

            return;
        }


        try {

            const fimHoje =
                new Date();


            fimHoje.setHours(
                23,
                59,
                59,
                999
            );


            const {
                error
            } =
                await supabaseClient
                    .rpc(
                        'desbloquear_meta_ronald',
                        {

                            p_admin_username:
                                currentUser.username,

                            p_ate:
                                fimHoje
                                    .toISOString()

                        }
                    );


            if (error) {
                throw error;
            }


            fecharPainelMetaRonald();


            showToast(
                '🔓 Ronald foi desbloqueado até o fim do dia.',
                'success'
            );


        } catch (error) {

            console.error(
                'Erro desbloqueando Ronald:',
                error
            );


            showToast(
                '❌ Não foi possível desbloquear Ronald: ' +
                error.message,
                'error'
            );
        }
    };

// ===== VARIÁVEIS GLOBAIS =====
let currentUser = null;
window.currentUser = currentUser;
let orders = [];
let sessionWarningTimer = null;
let orderCounter = 1;
let currentFilter = 'pendente';
let editingOrderId = null;
let currentOSForPrint = null;
let currentPrintStyle = 'detailed';
let emailsEnviados = new Set();

// ===== VARIÁVEIS PARA REEMBOLSOS =====
let reembolsos = [];
let currentReembolsoFilter = 'a_verificar';
let editingReembolsoId = null;
let notificacoes = [];

// ===== VARIÁVEIS PARA FOTOS =====
let selectedPhotos = [];
const MAX_PHOTO_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_PHOTOS_PER_OS = 10;

// ===== CONFIGURAÇÃO DE EMAIL =====
const EMAIL_CONFIG = {
    service: 'gmail', // ou seu serviço de email
    from: 'sistema@wheeltech.com',
    // Em produção, você usaria um serviço como SendGrid, Mailgun, etc.
};

// Mapeamento de usuários para emails
const USER_EMAILS = {
    'Elaine': 'elainecguidelli@gmail.com',
    'Arthur': 'arthur@wheeltech.com.br',
    'Laura': 'laura@empresa.com',
    'Ronald': 'ronald@empresa.com',
    'Bruna': 'bruna@wheeltech.com.br',
    'Elaine': 'leticia@wheeltech.com.br',
    'Thalyta': 'thalyta@empresa.com',
    'AndressaMiotto': 'andmiotto1998@gmail.com'
};

// Mapeamento de tipos de serviço (fotos)
const PHOTO_TYPE_MAP = {
    estudio: 'Foto Estúdio',
    bike: 'Foto Bike',
    ambos: 'Foto em Ambos',
    edicao: 'Apenas edição',
    criar_anuncio: 'Criar anúncio',
    replicar_anuncio: 'Replicar anúncio',
    fotos_para_atualizar: 'Fotos para atualizar',
    renovacao_anuncio: 'Renovação de anúncio'
};

// ===== VARIÁVEIS PARA NOTIFICAÇÕES DO SISTEMA =====
let systemNotifications = [];
let unreadNotifications = 0;


// ===== ELEMENTOS DOM =====
const loginScreen = document.getElementById('loginScreen');
const mainSystem = document.getElementById('mainSystem');
const loginForm = document.getElementById('loginForm');
const osCodeDisplay = document.getElementById('osCodeDisplay');
const osTableBody = document.getElementById('osTableBody');
const emptyMessage = document.getElementById('emptyMessage');
const userName = document.getElementById('userName');
const userAvatar = document.getElementById('userAvatar');
const userRole = document.getElementById('userRole');
const logoutBtn = document.getElementById('logoutBtn');
const testSupabaseBtn = document.getElementById('testSupabaseBtn');
const reloadBtn = document.getElementById('reloadBtn');
const cancelEditBtn = document.getElementById('cancelEditBtn');
const formTitle = document.getElementById('formTitle');
const submitBtnText = document.getElementById('submitBtnText');
const completeModal = document.getElementById('completeModal');
const finalizarOSBtn = document.getElementById('finalizarOSBtn');
const completeOSId = document.getElementById('completeOSId');
const saveOSBtn = document.getElementById('saveOSBtn');
const clearFormBtn = document.getElementById('clearFormBtn');
const welcomeMessage = document.getElementById('welcomeMessage');
const myOrdersCount = document.getElementById('myOrdersCount');
const totalOrdersCount = document.getElementById('totalOrdersCount');
const createdByInput = document.getElementById('createdBy');

// ===== CONTADORES =====
const countPending = document.getElementById('countPending');
const countProgress = document.getElementById('countProgress');
const countCompleted = document.getElementById('countCompleted');
const countTotal = document.getElementById('countTotal');
const syncStatus = document.getElementById('syncStatus');

// ===== USUÁRIOS DO SISTEMA =====
const SYSTEM_USERS = [
    { username: 'elaine', password: '180998', name: 'Elaine', avatar: 'E', role: 'Fotógrafa' },
    { username: 'arthur', password: '040869', name: 'Arthur', avatar: 'A', role: 'Comercial' },
    { username: 'laura', password: '123456', name: 'Laura', avatar: 'L', role: 'Midia' },
    { username: 'ronald', password: '210188', name: 'Ronald', avatar: 'R', role: 'Administrador' },
    { username: 'bruna', password: '270194', name: 'Bruna', avatar: 'B', role: 'Assistente' },
    { username: 'mirella', password: '220922', name: 'Mirella', avatar: 'M', role: 'Assistente 2' },
    { username: 'thalyta', password: '300377', name: 'Thalyta', avatar: 'T', role: 'Assistente 3' },
    { username: 'suelen', password: '148596', name: 'Suelen', avatar: 'S', role: 'Assistente 4' },
    { username: 'leticia', password: '181094', name: 'Leticia', avatar: 'L', role: 'Administrador' },
    { username: 'andressamiotto', password: '241101', name: 'Andressa', avatar: 'A', role: 'Administrador' }
];

// USUÁRIOS BLOQUEADOS (não podem acessar o sistema)
const BLOCKED_USERS = ['hosama', 'andressa'];

function contarCaracteres() {
    const campo = document.getElementById('productName');
    if (campo) {
        updateProductCounter(campo, 'productCounter');
    }
}

// ===== FUNÇÃO PARA INICIALIZAR BOTÕES DO HEADER =====
function setupHeaderButtons() {
    if (!currentUser) return;
    
    // Configurar botão de Vendas ML
    const vendasBtn = document.getElementById('vendasBtn');
    if (vendasBtn) {
        vendasBtn.onclick = function() {
            abrirSistemaVendas();
        };
    }

    // Configurar botão de Reembolsos
    const reembolsosBtn = document.getElementById('reembolsosBtn');
    if (reembolsosBtn) {
        reembolsosBtn.onclick = function() {
            abrirSistemaReembolsos();
        };
    }
    
    // Configurar botão de Logout
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.onclick = handleLogout;
    }
}

function configurarCampoRenovacaoAnuncio() {
    const servico =
        document.getElementById(
            'photoType'
        );

    const responsavel =
        document.getElementById(
            'responsibleName'
        );

    const container =
        document.getElementById(
            'campoLinkFotoBikeRenovacao'
        );

    const linkFoto =
        document.getElementById(
            'linkFotoBikeRenovacao'
        );

    if (
        !servico ||
        !container ||
        !linkFoto
    ) {
        return;
    }

    const atualizar =
        () => {
            const ehRenovacao =
                servico.value ===
                'renovacao_anuncio';

            container.classList.toggle(
                'hidden',
                !ehRenovacao
            );

            linkFoto.required =
                ehRenovacao;

            if (responsavel) {
                if (ehRenovacao) {
                    /*
                     * Elaine é a destinatária final.
                     * No banco, a primeira responsável será Letícia.
                     */
                    responsavel.value =
                        'Elaine';

                    responsavel.disabled =
                        true;
                } else {
                    responsavel.disabled =
                        false;
                }
            }

            if (!ehRenovacao) {
                linkFoto.value =
                    '';
            }
        };

    servico.removeEventListener(
        'change',
        atualizar
    );

    servico.addEventListener(
        'change',
        atualizar
    );

    atualizar();
}

document.addEventListener(
    'DOMContentLoaded',
    configurarCampoRenovacaoAnuncio
);

function ehOSRenovacaoAnuncio(order) {
    return (
        String(
            order?.photoType ||
            order?.tipo_foto ||
            ''
        )
            .trim()
            .toLowerCase() ===
        'renovacao_anuncio'
    );
}

function obterNomeEtapaRenovacao(
    etapa
) {
    const etapas = {
        leticia_verificacao:
            'Letícia: verificar vendas dos últimos 3 meses',

        ronald_validacao:
            'Ronald: validar foto da bike/gancheira',

        elaine_execucao:
            'Elaine: tirar ou editar a foto',

        devolvida_arthur:
            'Arthur: corrigir informações',

        fluxo_normal:
            'Aguardando conferência normal',

        finalizada:
            'Finalizada'
    };

    return (
        etapas[etapa] ||
        'Etapa não identificada'
    );
}

function podeAtuarNaEtapaRenovacao(
    order
) {
    if (
        !currentUser ||
        !ehOSRenovacaoAnuncio(order)
    ) {
        return false;
    }

    const username =
        getUsernameAtualOS();

    const etapa =
        order.renovacaoEtapa;

    if (
        etapa ===
            'leticia_verificacao' &&
        username ===
            'leticia'
    ) {
        return true;
    }

    if (
        etapa ===
            'ronald_validacao' &&
        username ===
            'ronald'
    ) {
        return true;
    }

    if (
        etapa ===
            'elaine_execucao' &&
        username ===
            'elaine'
    ) {
        return true;
    }

    if (
        etapa ===
            'devolvida_arthur' &&
        username ===
            'arthur'
    ) {
        return true;
    }

    return false;
}

async function notificarResponsavelRenovacao(
    order,
    destinatario,
    titulo,
    texto
) {
    if (
        !destinatario ||
        destinatario ===
            currentUser?.name
    ) {
        return;
    }

    try {
        await enviarNotificacaoEmail(
            destinatario,
            titulo,
            texto,
            order
        );
    } catch (error) {
        console.warn(
            'A etapa avançou, mas houve erro ao enviar a notificação:',
            error
        );
    }
}

async function atualizarEtapaRenovacao(
    order,
    {
        etapa,
        responsavel,
        motivo = null,
        etapaRetorno = null,
        dadosAdicionais = {}
    }
) {
    if (
        !order ||
        !supabaseClient
    ) {
        throw new Error(
            'OS ou Supabase indisponível.'
        );
    }

    const agora =
        new Date().toISOString();

    const historicoAtual =
        Array.isArray(
            order.renovacaoHistorico
        )
            ? order.renovacaoHistorico
            : [];

    const novoHistorico = [
        ...historicoAtual,
        {
            etapa_anterior:
                order.renovacaoEtapa ||
                null,

            nova_etapa:
                etapa,

            responsavel:
                responsavel,

            alterado_por:
                currentUser.name,

            motivo:
                motivo,

            data:
                agora
        }
    ];

    const dadosBanco = {
        renovacao_etapa:
            etapa,

        renovacao_etapa_retorno:
            etapaRetorno,

        renovacao_motivo_reprovacao:
            motivo,

        renovacao_historico:
            novoHistorico,

        responsavel:
            responsavel,

        user_notified:
            false,

        ultima_atualizacao:
            agora,

        ...dadosAdicionais
    };

    const {
        error
    } =
        await supabaseClient
            .from(
                'ordens_service'
            )
            .update(
                dadosBanco
            )
            .eq(
                'id',
                order.id
            );

    if (error) {
        throw error;
    }

    order.renovacaoEtapa =
        etapa;

    order.renovacaoEtapaRetorno =
        etapaRetorno;

    order.renovacaoMotivoReprovacao =
        motivo;

    order.renovacaoHistorico =
        novoHistorico;

    order.responsibleName =
        responsavel;

    order.user_notified =
        false;

    order.updatedAt =
        agora;

    Object.assign(
        order,
        dadosAdicionais
    );

    updateCounters();
    renderOrdersTable();
    updateOSNotificationBell();

    return agora;
}

window.aprovarEtapaRenovacao =
    async function(orderId) {
        const order =
            orders.find(
                item =>
                    String(item.id) ===
                    String(orderId)
            );

        if (!order) {
            showToast(
                '❌ OS não encontrada.',
                'error'
            );

            return;
        }

        if (
            !podeAtuarNaEtapaRenovacao(
                order
            )
        ) {
            showToast(
                '⚠️ Esta etapa não está atribuída ao seu usuário.',
                'warning'
            );

            return;
        }

        const username =
            getUsernameAtualOS();

        try {
            if (
                order.renovacaoEtapa ===
                    'leticia_verificacao' &&
                username ===
                    'leticia'
            ) {
                if (
                    !confirm(
                        'Você confirmou que este anúncio não teve vendas nos últimos 3 meses?'
                    )
                ) {
                    return;
                }

                const agora =
                    new Date().toISOString();

                await atualizarEtapaRenovacao(
                    order,
                    {
                        etapa:
                            'ronald_validacao',

                        responsavel:
                            'Ronald',

                        dadosAdicionais: {
                            renovacao_aprovado_leticia_por:
                                currentUser.name,

                            renovacao_aprovado_leticia_em:
                                agora
                        }
                    }
                );

                order.renovacaoAprovadoLeticiaPor =
                    currentUser.name;

                order.renovacaoAprovadoLeticiaEm =
                    agora;

                await notificarResponsavelRenovacao(
                    order,
                    'Ronald',
                    `🔎 Renovação para validar: ${order.code}`,
                    `A Letícia confirmou que o anúncio da OS ${order.code} não possui vendas nos últimos 3 meses.

Agora você deve verificar se a foto da bike corresponde à gancheira.

Produto: ${order.productName}
Anúncio: ${order.linkAnuncio}
Foto da bike: ${order.linkFotoBikeRenovacao}`
                );

                showToast(
                    '✅ Verificação aprovada e enviada ao Ronald.',
                    'success'
                );

                return;
            }

            if (
                order.renovacaoEtapa ===
                    'ronald_validacao' &&
                username ===
                    'ronald'
            ) {
                if (
                    !confirm(
                        'Você confirma que a foto da bike corresponde à gancheira deste anúncio?'
                    )
                ) {
                    return;
                }

                const agora =
                    new Date().toISOString();

                await atualizarEtapaRenovacao(
                    order,
                    {
                        etapa:
                            'elaine_execucao',

                        responsavel:
                            order.renovacaoDestinatarioFinal ||
                            'Elaine',

                        dadosAdicionais: {
                            renovacao_aprovado_ronald_por:
                                currentUser.name,

                            renovacao_aprovado_ronald_em:
                                agora,

                            status:
                                'pendente'
                        }
                    }
                );

                order.status =
                    'pendente';

                order.renovacaoAprovadoRonaldPor =
                    currentUser.name;

                order.renovacaoAprovadoRonaldEm =
                    agora;

                await notificarResponsavelRenovacao(
                    order,
                    order.renovacaoDestinatarioFinal ||
                        'Elaine',
                    `📸 Renovação liberada: ${order.code}`,
                    `O Ronald confirmou a foto da bike/gancheira da OS ${order.code}.

A OS está liberada para tirar ou editar a foto.

Produto: ${order.productName}
Anúncio: ${order.linkAnuncio}
Foto de referência: ${order.linkFotoBikeRenovacao}`
                );

                showToast(
                    '✅ Foto validada e OS enviada para Elaine.',
                    'success'
                );

                return;
            }

            showToast(
                '⚠️ Esta etapa não pode ser aprovada pelo seu usuário.',
                'warning'
            );
        } catch (error) {
            console.error(
                'Erro ao aprovar etapa da renovação:',
                error
            );

            showToast(
                '❌ Erro ao avançar etapa: ' +
                error.message,
                'error'
            );
        }
    };

window.reprovarEtapaRenovacao =
    async function(orderId) {
        const order =
            orders.find(
                item =>
                    String(item.id) ===
                    String(orderId)
            );

        if (
            !order ||
            !podeAtuarNaEtapaRenovacao(
                order
            )
        ) {
            showToast(
                '⚠️ Esta etapa não está atribuída ao seu usuário.',
                'warning'
            );

            return;
        }

        if (
            ![
                'leticia_verificacao',
                'ronald_validacao'
            ].includes(
                order.renovacaoEtapa
            )
        ) {
            showToast(
                '⚠️ Esta etapa não permite devolução ao Arthur.',
                'warning'
            );

            return;
        }

        const motivo =
            prompt(
                'Informe o motivo da reprovação. A OS voltará para Arthur:'
            )?.trim();

        if (!motivo) {
            showToast(
                '⚠️ Informe o motivo da reprovação.',
                'warning'
            );

            return;
        }

        const etapaRetorno =
            order.renovacaoEtapa;

        try {
            await atualizarEtapaRenovacao(
                order,
                {
                    etapa:
                        'devolvida_arthur',

                    responsavel:
                        'Arthur',

                    motivo:
                        motivo,

                    etapaRetorno:
                        etapaRetorno,

                    dadosAdicionais: {
                        status:
                            'pendente'
                    }
                }
            );

            order.status =
                'pendente';

            await notificarResponsavelRenovacao(
                order,
                'Arthur',
                `⚠️ Renovação devolvida: ${order.code}`,
                `A OS ${order.code} foi devolvida para correção.

Reprovada por: ${currentUser.name}
Etapa: ${obterNomeEtapaRenovacao(etapaRetorno)}

Motivo:
${motivo}

Após corrigir as informações, clique em “Reenviar fluxo”.`
            );

            showToast(
                '✅ OS devolvida para Arthur.',
                'success'
            );
        } catch (error) {
            console.error(
                'Erro ao reprovar renovação:',
                error
            );

            showToast(
                '❌ Erro ao devolver OS: ' +
                error.message,
                'error'
            );
        }
    };

window.reenviarFluxoRenovacao =
    async function(orderId) {
        const order =
            orders.find(
                item =>
                    String(item.id) ===
                    String(orderId)
            );

        if (
            !order ||
            getUsernameAtualOS() !==
                'arthur' ||
            order.renovacaoEtapa !==
                'devolvida_arthur'
        ) {
            showToast(
                '⚠️ Somente Arthur pode reenviar esta OS.',
                'warning'
            );

            return;
        }

        const etapaRetorno =
            order.renovacaoEtapaRetorno ||
            'leticia_verificacao';

        const responsavel =
            etapaRetorno ===
                'ronald_validacao'
                ? 'Ronald'
                : 'Leticia';

        if (
            !confirm(
                `Reenviar esta OS para ${responsavel}?`
            )
        ) {
            return;
        }

        try {
            await atualizarEtapaRenovacao(
                order,
                {
                    etapa:
                        etapaRetorno,

                    responsavel:
                        responsavel,

                    motivo:
                        null,

                    etapaRetorno:
                        null
                }
            );

            await notificarResponsavelRenovacao(
                order,
                responsavel,
                `🔄 Renovação corrigida: ${order.code}`,
                `Arthur corrigiu a OS ${order.code} e reenviou para sua validação.

Produto: ${order.productName}
Anúncio: ${order.linkAnuncio}
Foto da bike: ${order.linkFotoBikeRenovacao}`
            );

            showToast(
                `✅ OS reenviada para ${responsavel}.`,
                'success'
            );
        } catch (error) {
            showToast(
                '❌ Erro ao reenviar OS: ' +
                error.message,
                'error'
            );
        }
    };

function highlightActiveFilterButton() {
    const buttons = document.querySelectorAll('.filter-group .btn');
    buttons.forEach(btn => {
        btn.classList.remove('btn-primary', 'active');
        btn.classList.add('btn-outline-secondary');
    });
    const activeBtn = document.querySelector(`.filter-group .btn[onclick*="'${currentFilter}'"]`);
    if (activeBtn) {
        activeBtn.classList.remove('btn-outline-secondary');
        activeBtn.classList.add('btn-primary', 'active');
    }
}

// ===== INICIALIZAÇÃO =====
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 Sistema OS Fotografia iniciado!');
    
    // VERIFICAR SE HÁ SESSÃO SALVA
    const hasValidSession = loadSessionFromStorage();
    
    if (hasValidSession && currentUser) {
        // Usuário já logado - restaurar sessão
        console.log('✅ Restaurando sessão existente');

        atualizarVisibilidadeMenu();
        
        // Atualizar interface do usuário
        if (userName) userName.textContent = currentUser.name;
        if (userAvatar) userAvatar.textContent = currentUser.avatar;
        if (userRole) userRole.textContent = currentUser.role;
        if (welcomeMessage) welcomeMessage.textContent = `Bem-vindo(a) de volta, ${currentUser.name}!`;
        if (createdByInput) createdByInput.value = currentUser.name;
        
        // Mostrar sistema, esconder login
        if (loginScreen) loginScreen.classList.add('hidden');
        const menuSystem = document.getElementById('menuSystem');
        if (menuSystem) menuSystem.classList.remove('hidden');

        reembolsoNotificationCount = document.getElementById('reembolsoNotificationCount');
        reembolsoNotificationBell = document.getElementById('reembolsoNotificationBell');
        
        // Iniciar timer de sessão
        startSessionTimer();
        
        // Configurar detectores de atividade
        setupActivityDetectors();

        // Chamar após definir currentUser, por exemplo dentro do handleLogin
        atualizarVisibilidadeRelatorioColaborador();
        
        // Carregar dados
        setTimeout(
    async () => {

        try {

            if (!supabaseClient) {

                initSupabase();
            }


            if (supabaseClient) {

                await testSupabaseConnection();

            } else {

                updateCounters();

                renderOrdersTable();

                setTimeout(
                    () =>
                        highlightActiveFilterButton(),
                    100
                );
            }


            atualizarVisibilidadeMenu();


            const reembolsosBtn =
                document.getElementById(
                    'reembolsosBtn'
                );


            if (reembolsosBtn) {

                reembolsosBtn.onclick =
                    function() {

                        abrirSistemaReembolsos();

                    };
            }


            if (logoutBtn) {

                logoutBtn.onclick =
                    handleLogout;
            }


        } catch (error) {

            console.error(
                '❌ Erro restaurando sessão:',
                error
            );
        }

    },
    500
);
        
    } else {

        // Usuário não logado - mostrar tela de login
        console.log('👤 Nenhuma sessão ativa');
        if (loginScreen) loginScreen.classList.remove('hidden');
        // 👇 ATIVA o fundo de login
        document.body.classList.add('login-active');
        if (mainSystem) mainSystem.classList.add('hidden');
    }

    // 👇 COLOQUE AQUI
    // Se a tela de login estiver visível, ativa o fundo
    if (loginScreen && !loginScreen.classList.contains('hidden')) {
        document.body.classList.add('login-active');
    }
    
    generateOSCode();
    initSupabase();
    setupEventListeners();
    setupPhotoUpload();
    toggleFiltroDataConcluidas(false);
    
    // Adicionar evento de tecla ESC para fechar modais
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            const printModal = document.getElementById('printModal');
            if (printModal && !printModal.classList.contains('hidden')) {
                closePrintModal();
            }
            const photoViewerModal = document.getElementById('photoViewerModal');
            if (photoViewerModal && !photoViewerModal.classList.contains('hidden')) {
                closePhotoViewer();
            }
            if (completeModal && !completeModal.classList.contains('hidden')) {
                closeCompleteModal();
            }
        }
        
        // Atalho Ctrl+P para imprimir
        if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
            e.preventDefault();
            if (currentOSForPrint) {
                printOS();
            }
        }
    });
});

// ============================================
// FUNÇÕES DE INICIALIZAÇÃO
// ============================================
function initSupabase() {
    try {
        if (window.supabase) {
            supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
            window.supabaseClient = supabaseClient;
            console.log('✅ Supabase inicializado');
        } else {
            console.error('❌ Biblioteca Supabase não carregada');
        }
    } catch (error) {
        console.error('❌ Erro ao inicializar Supabase:', error);
    }
}

function montarMensagemOS(os) {
    return `
Nova Ordem de Serviço criada

Número da OS: ${os.numero}
Cliente: ${os.cliente}
Equipamento: ${os.equipamento}
Responsável: ${os.responsavel}
Status: ${os.status}

Acesse o sistema para mais detalhes.
Sistema Wheel Tech
`;
}

// Função auxiliar para atualizar avatar em qualquer elemento
function atualizarAvatar(elementId, avatar) {
    const el = document.getElementById(elementId);
    if (el) el.textContent = avatar;
}

// No login, após definir currentUser, atualize todos os avatares possíveis
function atualizarTodosAvatares() {
    if (!currentUser) return;
    const avatar = currentUser.avatar;
    atualizarAvatar('menuUserAvatar', avatar);
    atualizarAvatar('userAvatar', avatar);
    atualizarAvatar('caixaUserAvatar', avatar);
    atualizarAvatar('salesUserAvatar', avatar);
    atualizarAvatar('reembolsoUserAvatar', avatar);
    atualizarAvatar('reviewsUserAvatar', avatar);
    atualizarAvatar('folgasUserAvatar', avatar);
    atualizarAvatar('shippingUserAvatar', avatar);
    atualizarAvatar('estoqueUserAvatar', avatar);
    atualizarAvatar('estoqueGestaoAvatar', avatar);
}

// ============================================
// FUNÇÃO PARA ENVIAR NOTIFICAÇÕES POR EMAIL
// ============================================
async function enviarNotificacaoEmail(recipientName, subject, message, osData = null) {

    const recipientEmail = USER_EMAILS[recipientName];

    if (!recipientEmail) {
        console.warn(`Email não configurado para: ${recipientName}`);
        return false;
    }

    // CRIA IDENTIFICADOR ÚNICO DO EMAIL
    const emailId = `${recipientEmail}-${subject}`;

    if (emailsEnviados.has(emailId)) {
        console.warn("⚠️ Email duplicado bloqueado:", emailId);
        return false;
    }

    emailsEnviados.add(emailId);

    console.log("📧 Enviando email para:", recipientEmail);

    try {

        const response = await emailjs.send(
            "service_lqj60lq",
            "template_hq8vrdn",
            {
                to_email: recipientEmail,
                subject: subject,
                message: message
            },
            {
                publicKey: "GtDq2kuz4ng-u8gYR"
            }
        );

        console.log("✅ Email enviado:", response);

        showToast(`📧 Email enviado para ${recipientName}`, "success");

        return true;

    } catch (error) {

        console.error("❌ Erro EmailJS:", error);

        showToast("Erro ao enviar email", "error");

        return false;
    }
}

function generateEmailTemplate(message, osData) {
    // Template HTML básico para o email
    return `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: #8A2BE2; color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0; }
                .content { background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px; }
                .os-info { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #8A2BE2; }
                .btn { display: inline-block; background: #8A2BE2; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin-top: 15px; }
                .footer { text-align: center; margin-top: 30px; color: #6c757d; font-size: 12px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>🚀 Sistema Wheel Tech</h1>
                    <p>Notificação de Ordem de Serviço</p>
                </div>
                <div class="content">
                    ${message}
                    ${osData ? `
                    <div class="os-info">
                        <h3>📋 Detalhes da OS</h3>
                        <p><strong>Código:</strong> ${osData.code}</p>
                        <p><strong>Produto:</strong> ${osData.productName}</p>
                        <p><strong>Criado por:</strong> ${osData.createdBy}</p>
                        <p><strong>Responsável:</strong> ${osData.responsibleName}</p>
                        <p><strong>Status:</strong> ${osData.status}</p>
                        ${osData.completionTime ? `<p><strong>Tempo de execução:</strong> ${osData.completionTime}</p>` : ''}
                    </div>
                    ` : ''}
                    <a href="${window.location.origin}" class="btn">Acessar Sistema</a>
                </div>
                <div class="footer">
                    <p>Esta é uma notificação automática do Sistema Wheel Tech</p>
                    <p>© ${new Date().getFullYear()} Wheel Tech - Todos os direitos reservados</p>
                </div>
            </div>
        </body>
        </html>
    `;
}

// ============================================
// FUNÇÃO SUPER SIMPLES PARA CONTADOR
// ============================================

function updateProductCounter(input, counterId) {
    const counter = document.getElementById(counterId);
    if (!counter) return;
    
    const currentLength = input.value.length;
    const maxLength = 200;
    
    counter.textContent = `${currentLength}/${maxLength}`;
    
    // Muda a cor se estiver perto do limite
    if (currentLength > 180) {
        counter.style.color = '#dc3545';
        counter.style.fontWeight = 'bold';
    } else if (currentLength > 160) {
        counter.style.color = '#ffc107';
        counter.style.fontWeight = 'bold';
    } else {
        counter.style.color = '#6c757d';
        counter.style.fontWeight = 'normal';
    }
}

// ============================================
// FUNÇÕES DE CONTROLE DE SESSÃO
// ============================================

function saveSessionToStorage() {
    if (!currentUser) return;
    
    const sessionData = {
        user: currentUser,
        loginTime: Date.now(),
        expiresAt: Date.now() + SESSION_TIMEOUT
    };
    
    // Salvar no localStorage
    localStorage.setItem('wheeltech_session', JSON.stringify(sessionData));
    localStorage.setItem('wheeltech_user', JSON.stringify(currentUser));
    
    console.log('✅ Sessão salva no localStorage');
}

function loadSessionFromStorage() {
    try {
        const sessionData = localStorage.getItem('wheeltech_session');
        const userData = localStorage.getItem('wheeltech_user');
        
        if (!sessionData || !userData) {
            return false;
        }
        
        const session = JSON.parse(sessionData);
        const user = JSON.parse(userData);
        
        // Verificar se a sessão expirou
        const now = Date.now();
        if (now > session.expiresAt) {
            console.log('❌ Sessão expirada');
            clearSessionStorage();
            return false;
        }

        // Mostrar MENU, esconder login
        if (loginScreen) loginScreen.classList.add('hidden');
        const menuSystem = document.getElementById('menuSystem');
        if (menuSystem) menuSystem.classList.remove('hidden');
        
        // Restaurar usuário
        currentUser = user;
        iniciarMonitorNotificacoesOS();
        window.currentUser = currentUser;
        
       // 🔒 VERIFICAÇÃO DE BLOQUEIO (INSIRA AQUI)
        if (BLOCKED_USERS.includes(currentUser.username)) {
            console.log(`🚫 Sessão bloqueada para ${currentUser.username}`);
            clearSessionStorage();
            if (loginScreen) loginScreen.classList.remove('hidden');
            if (menuSystem) menuSystem.classList.add('hidden');
            showToast('⛔ Seu usuário foi bloqueado. Contate o administrador.', 'error');
            return false;
        }
        
        const timeLeft = session.expiresAt - now;
        console.log(`🕒 Sessão válida por mais ${Math.round(timeLeft / 1000 / 60)} minutos`);
        return true;
    } catch (error) {
        console.error('❌ Erro ao carregar sessão:', error);
        clearSessionStorage();
        return false;
    }
}

function clearSessionStorage() {
    localStorage.removeItem('wheeltech_session');
    localStorage.removeItem('wheeltech_user');
    localStorage.removeItem('wheeltech_orders');
    console.log('🧹 Sessão limpa do localStorage');
}

function startSessionTimer() {

    // Limpar timers anteriores
    if (sessionTimer) {

        clearTimeout(
            sessionTimer
        );

        sessionTimer =
            null;
    }


    if (refreshTokenInterval) {

        clearInterval(
            refreshTokenInterval
        );

        refreshTokenInterval =
            null;
    }


    // ========================================================
    // TIMER DE EXPIRAÇÃO DA SESSÃO
    // ========================================================

    sessionTimer =
        setTimeout(
            () => {

                showToast(
                    '⏰ Sua sessão expirou por inatividade',
                    'warning'
                );


                handleLogout();

            },
            SESSION_TIMEOUT
        );


    // ========================================================
    // VERIFICAÇÃO INICIAL DA META
    //
    // Como startSessionTimer é chamado tanto no login
    // quanto na restauração de sessão,
    // isso cobre os dois casos.
    // ========================================================

    if (
        currentUser &&
        currentUser.username ===
        META_RONALD_CONFIG.username
    ) {

        setTimeout(
            () => {

                inicializarControleMetaRonald();

            },
            1200
        );
    }


    // ========================================================
    // INTERVALO A CADA 30 MINUTOS
    // ========================================================

    refreshTokenInterval =
        setInterval(
            async () => {

                if (!currentUser) {
                    return;
                }


                console.log(
                    '🔄 Atualizando sessão...'
                );


                saveSessionToStorage();


                // =================================================
                // META RONALD
                // =================================================

                if (
                    currentUser.username ===
                    META_RONALD_CONFIG.username
                ) {

                    await verificarMetaRonald(
                        {

                            mostrarAviso:
                                true,

                            motivo:
                                '30_minutos'

                        }
                    );
                }


                // =================================================
                // MENSAGEM ANTIGA DE TEMPO ONLINE
                // =================================================

                try {

                    const sessao =
                        JSON.parse(
                            localStorage.getItem(
                                'wheeltech_session'
                            )
                        );


                    if (
                        sessao &&
                        sessao.loginTime
                    ) {

                        const hoursOnline =
                            Math.floor(
                                (
                                    Date.now() -
                                    sessao.loginTime
                                ) /
                                (
                                    1000 *
                                    60 *
                                    60
                                )
                            );


                        if (
                            hoursOnline > 0 &&
                            hoursOnline % 4 === 0
                        ) {

                            showToast(
                                `⏰ Você está online há ${hoursOnline} horas`,
                                'info'
                            );
                        }
                    }

                } catch (
                    error
                ) {

                    console.warn(
                        'Erro calculando tempo online:',
                        error
                    );
                }

            },
            META_RONALD_CONFIG
                .intervaloVerificacao
        );


    console.log(
        '⏰ Timer de sessão e meta iniciado'
    );
}

function resetSessionTimer() {
    if (currentUser) {
        // Atualizar tempo de expiração
        const sessionData = {
            user: currentUser,
            loginTime: Date.now(),
            expiresAt: Date.now() + SESSION_TIMEOUT
        };
        
        localStorage.setItem('wheeltech_session', JSON.stringify(sessionData));
        
        // Reiniciar timer
        if (sessionTimer) {
            clearTimeout(sessionTimer);
        }
        
        sessionTimer = setTimeout(() => {
            showToast('⏰ Sua sessão expirou por inatividade', 'warning');
            handleLogout();
        }, SESSION_TIMEOUT);
        
        console.log('🔄 Timer de sessão reiniciado');
    }
}

// Detectar atividade do usuário para resetar timer
function setupActivityDetectors() {
    // Resetar timer em qualquer interação do usuário
    const events = ['mousemove', 'keypress', 'click', 'scroll', 'touchstart'];
    
    events.forEach(event => {
        document.addEventListener(event, () => {
            if (currentUser) {
                resetSessionTimer();
            }
        }, { passive: true });
    });
    
    // Resetar timer quando a janela ganha foco
    window.addEventListener('focus', () => {
        if (currentUser) {
            resetSessionTimer();
        }
    });
    
    console.log('👀 Detectores de atividade configurados');
}

// ============================================
// FUNÇÃO SETUP EVENT LISTENERS (COMPLETA E ATUALIZADA)
// ============================================
function setupEventListeners() {
    // Login
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }
    
    // Tecla Enter no campo de senha
    const passwordInput = document.getElementById('password');
    if (passwordInput) {
        passwordInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                loginForm.dispatchEvent(new Event('submit'));
            }
        });
    }

    const detalhesModal = document.getElementById('detalhesReembolsoModal');
    if (detalhesModal) {
        detalhesModal.addEventListener('click', function(e) {
            if (e.target === detalhesModal) closeDetalhesReembolso();
        });
    }
    
    // Logout
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }
    
    // Supabase
    if (testSupabaseBtn) {
        testSupabaseBtn.addEventListener('click', testSupabaseConnection);
    }
    
    if (reloadBtn) {
        reloadBtn.addEventListener('click', loadOrders);
    }
    
    // Formulário OS
    if (saveOSBtn) {
        saveOSBtn.addEventListener('click', saveOrder);
    }
    
    if (clearFormBtn) {
        clearFormBtn.addEventListener('click', clearForm);
    }
    
    if (cancelEditBtn) {
        cancelEditBtn.addEventListener('click', cancelEdit);
    }
    
    // Modal de finalização
    if (finalizarOSBtn) {
        finalizarOSBtn.addEventListener('click', completeOrder);
    }
    
    if (completeModal) {
        completeModal.addEventListener('click', function(e) {
            if (e.target === completeModal) closeCompleteModal();
        });
    }

    // Botão de caixa
    const caixaBtn = document.getElementById('caixaBtn');
    if (caixaBtn) {
        caixaBtn.addEventListener('click', function(e) {
            e.preventDefault();
            console.log('💰 Botão Caixa clicado');
            window.abrirSistemaCaixa();
        });
    }

    // Botão de reembolsos
    const reembolsosBtn = document.getElementById('reembolsosBtn');
    if (reembolsosBtn) {
        reembolsosBtn.addEventListener('click', function(e) {
            e.preventDefault();
            console.log('💰 Botão Reembolsos clicado');
            window.abrirSistemaReembolsos();
        });
    }

    // Botão de vendas
    const vendasBtn = document.getElementById('vendasBtn');
    if (vendasBtn) {
        vendasBtn.addEventListener('click', function(e) {
            e.preventDefault();
            console.log('🛒 Botão Vendas clicado');
            window.abrirSistemaVendas();
        });
    }
    
    // Event listener para mostrar/ocultar campos de anúncio
    const photoTypeSelect = document.getElementById('photoType');
    if (photoTypeSelect) {
        photoTypeSelect.addEventListener('change', toggleCamposAnuncio);
    }
    
    // Event listener para campo "precisa de foto"
    const precisaFotoSelect = document.getElementById('precisaFoto');
    if (precisaFotoSelect) {
        precisaFotoSelect.addEventListener('change', function() {
            const photoType = document.getElementById('photoType').value;
            const precisaFoto = this.value;
            
            if ((photoType === 'criar_anuncio' || photoType === 'replicar_anuncio') && precisaFoto === 'sim') {
                const responsibleSelect = document.getElementById('responsibleName');
                if (responsibleSelect) {
                    if (responsibleSelect.value === 'Elaine') {
                        showToast('📸 Elaine já é a responsável selecionada', 'info');
                    } else {
                        showToast('📸 Elaine será adicionada como responsável junto com o selecionado', 'info');
                    }
                }
            }
            
            const responsibleField = document.getElementById('responsibleName');
            if (responsibleField) {
                if (precisaFoto === 'sim' && (photoType === 'criar_anuncio' || photoType === 'replicar_anuncio')) {
                    responsibleField.style.borderColor = '#e91e63';
                    responsibleField.style.boxShadow = '0 0 0 3px rgba(233, 30, 99, 0.15)';
                    responsibleField.style.transition = 'all 0.3s';
                    
                    const tooltip = document.createElement('div');
                    tooltip.id = 'fotoTooltip';
                    tooltip.innerHTML = '<i class="fas fa-info-circle"></i> Elaine será adicionada automaticamente';
                    tooltip.style.cssText = 'font-size: 12px; color: #e91e63; margin-top: 5px; display: flex; align-items: center; gap: 5px;';
                    
                    const existingTooltip = document.getElementById('fotoTooltip');
                    if (existingTooltip) existingTooltip.remove();
                    
                    responsibleField.parentNode.appendChild(tooltip);
                } else {
                    responsibleField.style.borderColor = '';
                    responsibleField.style.boxShadow = '';
                    const tooltip = document.getElementById('fotoTooltip');
                    if (tooltip) tooltip.remove();
                }
            }
        });
    }
    
    // Botão de adicionar foto por link
    const addPhotoLinkBtn = document.getElementById('addPhotoLinkBtn');
    if (addPhotoLinkBtn) {
        addPhotoLinkBtn.addEventListener('click', addPhotoFromLink);
    }
    
    // Tecla Enter no campo de link de foto
    const photoLinkInput = document.getElementById('photoLinkInput');
    if (photoLinkInput) {
        photoLinkInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                addPhotoFromLink();
            }
        });
    }
    
    // Mudança no campo de responsável quando "precisa de foto" estiver ativo
    const responsibleSelect = document.getElementById('responsibleName');
    if (responsibleSelect) {
        responsibleSelect.addEventListener('change', function() {
            const photoType = document.getElementById('photoType').value;
            const precisaFoto = document.getElementById('precisaFoto')?.value;
            
            if (precisaFoto === 'sim' && (photoType === 'criar_anuncio' || photoType === 'replicar_anuncio')) {
                if (this.value === 'Elaine') {
                    showToast('📸 Elaine já é a responsável principal', 'info');
                } else if (this.value) {
                    showToast(`📸 Elaine será adicionada junto com ${this.value}`, 'info');
                }
            }
        });
    }
    
    // Foco no campo de usuário ao carregar
    const usernameInput = document.getElementById('username');
    if (usernameInput) {
        setTimeout(() => usernameInput.focus(), 100);
    }
    
    // Notificações
    const notificationBell = document.getElementById('notificationBell');
    if (notificationBell) {
        notificationBell.addEventListener('click', toggleNotificacoes);
    }
    
    // Fechar notificações ao clicar fora
    document.addEventListener('click', function(e) {
        const dropdown = document.getElementById('notificacoesDropdown');
        const bell = document.getElementById('notificationBell');
        
        if (dropdown && !dropdown.classList.contains('hidden') && 
            !dropdown.contains(e.target) && 
            !bell.contains(e.target)) {
            dropdown.classList.add('hidden');
        }
    });
    
    // Tecla ESC em modais
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            const printModal = document.getElementById('printModal');
            if (printModal && !printModal.classList.contains('hidden')) closePrintModal();
            const photoViewerModal = document.getElementById('photoViewerModal');
            if (photoViewerModal && !photoViewerModal.classList.contains('hidden')) closePhotoViewer();
            if (completeModal && !completeModal.classList.contains('hidden')) closeCompleteModal();
            const viewOSModal = document.getElementById('viewOSModal');
            if (viewOSModal && !viewOSModal.classList.contains('hidden')) closeViewOSModal();
            const reembolsoModal = document.getElementById('reembolsoModal');
            if (reembolsoModal && !reembolsoModal.classList.contains('hidden')) closeReembolsoModal();
            const notificacoesDropdown = document.getElementById('notificacoesDropdown');
            if (notificacoesDropdown && !notificacoesDropdown.classList.contains('hidden')) {
                notificacoesDropdown.classList.add('hidden');
            }
        }
        
        if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
            e.preventDefault();
            if (currentOSForPrint) printOS();
        }
        
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            const activeElement = document.activeElement;
            const formElements = ['productName', 'skus', 'observations', 'descricaoAnuncio'];
            if (activeElement && formElements.includes(activeElement.id)) saveOrder();
        }
        
        if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
            e.preventDefault();
            if (!editingOrderId) clearForm();
        }
    });
    
    // Event listeners para reembolsos
    setupReembolsoEventListeners();
    
    // Configurar drag and drop para fotos
    setupPhotoUpload();
    
    // Inicializar botão de reembolsos
    inicializarBotaoReembolsos();
    
    // Configurar evento para botão de impressão na tabela
    document.addEventListener('click', function(e) {
        if (e.target.closest('[onclick*="openPrintModal"]')) {
            e.preventDefault();
            const onclickAttr = e.target.closest('[onclick*="openPrintModal"]').getAttribute('onclick');
            const match = onclickAttr.match(/openPrintModal\(([^)]+)\)/);
            if (match) {
                try {
                    const osData = JSON.parse(match[1].replace(/&quot;/g, '"'));
                    openPrintModal(osData);
                } catch (error) {
                    console.error('Erro ao processar dados da OS:', error);
                }
            }
        }
    });
    
    // 🔥 NOVOS EVENTOS PARA O CAMPO DE PRAZO (horas úteis)
    const urgencySelect = document.getElementById('urgency');
    const prazoHorasInput = document.getElementById('prazoHoras');
    
    if (urgencySelect) {
        urgencySelect.addEventListener('change', function() {
            // Atualiza o valor do campo de horas conforme a urgência
            const urgency = this.value;
            let horas = 48;
            switch (urgency) {
                case 'baixa': horas = 48; break;
                case 'normal': horas = 36; break;
                case 'alta': horas = 2; break;
            }
            if (prazoHorasInput) prazoHorasInput.value = horas;
            // (Opcional) atualizar visualização do prazo estimado
            if (typeof atualizarPrazoEstimadoPorHoras === 'function') atualizarPrazoEstimadoPorHoras();
        });
    }
    
    if (prazoHorasInput) {
        prazoHorasInput.addEventListener('input', function() {
            if (typeof atualizarPrazoEstimadoPorHoras === 'function') atualizarPrazoEstimadoPorHoras();
        });
    }
    
    console.log('✅ Event listeners configurados com sucesso!');
}

async function getTokenWithInitialCode() {
    try {
        console.log('🔑 Usando código inicial:', ML_CONFIG.INITIAL_CODE.substring(0, 20) + '...');
        
        const params = new URLSearchParams();
        params.append('grant_type', 'authorization_code');
        params.append('client_id', ML_CONFIG.CLIENT_ID);
        params.append('client_secret', ML_CONFIG.CLIENT_SECRET);
        params.append('code', ML_CONFIG.INITIAL_CODE);
        params.append('redirect_uri', ML_CONFIG.REDIRECT_URI);
        
        console.log('📤 Enviando requisição para:', `${ML_CONFIG.API_BASE_URL}/oauth/token`);
        console.log('Parâmetros:', {
            grant_type: 'authorization_code',
            client_id: ML_CONFIG.CLIENT_ID.substring(0, 10) + '...',
            code_length: ML_CONFIG.INITIAL_CODE.length,
            redirect_uri: ML_CONFIG.REDIRECT_URI
        });
        
        const response = await fetch(`${ML_CONFIG.API_BASE_URL}/oauth/token`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json'
            },
            body: params
        });
        
        console.log('📥 Resposta recebida. Status:', response.status);
        
        if (response.ok) {
            const data = await response.json();
            console.log('✅ Token obtido com sucesso!');
            console.log('Access Token (primeiros 30 chars):', data.access_token.substring(0, 30) + '...');
            console.log('Refresh Token (primeiros 30 chars):', data.refresh_token.substring(0, 30) + '...');
            console.log('Expira em:', data.expires_in, 'segundos');
            console.log('Escopos:', data.scope);
            
            return data;
        } else {
            const errorText = await response.text();
            console.error('❌ Erro na resposta:', response.status, response.statusText);
            console.error('Detalhes do erro:', errorText);
            
            // Tenta parsear como JSON se possível
            try {
                const errorJson = JSON.parse(errorText);
                console.error('Erro JSON:', errorJson);
            } catch (e) {
                console.error('Erro não é JSON');
            }
            
            return null;
        }
        
    } catch (error) {
        console.error('❌ Erro ao obter token com código inicial:', error);
        console.error('Detalhes:', error.message);
        if (error.stack) {
            console.error('Stack:', error.stack);
        }
        return null;
    }
}

// ===== FUNÇÃO PARA BUSCAR VENDAS AUTOMATICAMENTE =====
async function fetchMLSalesAuto() {
    console.log('🛒 Buscando vendas do Mercado Livre...');
    
    // 1. Obter token
    let token = localStorage.getItem('ml_access_token');
    
    if (!token) {
        console.log('🔑 Token não encontrado, obtendo novo...');
        token = await getMLTokenAutomatically();
    }
    
    if (!token) {
        console.error('❌ Não foi possível obter token do ML');
        return [];
    }
    
    // 2. Buscar vendas dos últimos 3 dias
    try {
        const now = new Date();
        const threeDaysAgo = new Date(now);
        threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
        
        const params = new URLSearchParams({
            seller: 'me',
            sort: 'date_desc',
            'order.status': 'paid',
            'order.date_created.from': threeDaysAgo.toISOString().split('T')[0],
            limit: '20'
        });
        
        const response = await fetch(`${ML_CONFIG.API_BASE_URL}/orders/search?${params.toString()}`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json'
            }
        });
        
        if (response.status === 401) {
            // Token expirado, tentar renovar
            console.log('🔄 Token expirado, tentando renovar...');
            token = await getMLTokenAutomatically();
            
            if (token) {
                // Tentar novamente com novo token
                return await fetchMLSalesAuto();
            }
        }
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        
        // Processar resultados
        if (data.results && data.results.length > 0) {
            console.log(`✅ ${data.results.length} vendas encontradas`);
            return processMLSales(data.results);
        }
        
        return [];
        
    } catch (error) {
        console.error('❌ Erro ao buscar vendas:', error);
        return [];
    }
}

function processMLSales(sales) {
    return sales.map(sale => {
        const order = sale.order_items && sale.order_items.length > 0 ? sale.order_items[0] : {};
        
        return {
            id: sale.id,
            numero_venda: sale.external_reference || `ML-${sale.id}`,
            data_venda: new Date(sale.date_created).toLocaleString('pt-BR'),
            valor_total: sale.total_amount || 0,
            quantidade_itens: sale.order_items?.length || 0,
            comprador: sale.buyer?.nickname || 'Não informado',
            status: 'nova',
            verificada: false,
            
            // Detalhes do item principal
            item_titulo: order.item?.title || 'Produto não identificado',
            item_sku: order.item?.seller_custom_field || 'N/A',
            item_quantidade: order.quantity || 1,
            item_preco_unitario: order.unit_price || 0,
            
            // Informações adicionais
            metodo_pagamento: sale.payments?.[0]?.payment_type || 'Não informado',
            tags: sale.tags || []
        };
    });
}

window.verDetalhesVenda = async function(vendaId) {
    // Buscar venda atual a partir da lista global (vendasAtuais)
    const venda = vendasAtuais.find(v => v.id == vendaId);
    if (!venda) {
        mostrarToast('Venda não encontrada', 'error');
        return;
    }

    // Preencher cabeçalho
    document.getElementById('vendaCodigo').textContent = venda.id;

    // Preencher aba de informações
    const detalhesContent = document.getElementById('vendaDetalhesContent');
    detalhesContent.innerHTML = `
        <div class="info-card">
            <p><strong>ID Venda:</strong> ${venda.id}</p>
            <p><strong>Data:</strong> ${new Date(venda.date_created).toLocaleString('pt-BR')}</p>
            <p><strong>Cliente:</strong> ${venda.buyer_nickname || 'Não informado'}</p>
            <p><strong>Total:</strong> R$ ${(venda.total_amount || 0).toFixed(2)}</p>
            <p><strong>SKU:</strong> ${venda.sku || 'N/A'}</p>
            <p><strong>MLB:</strong> ${venda.mlb || 'Não informado'}</p>
            <p><strong>Produto:</strong> ${venda.produto_titulo || '-'}</p>
            <p><strong>Tipo de Envio:</strong> ${venda.meio_envio || '-'}</p>
        </div>
    `;

    // Carregar dimensões salvas (se houver)
    const analise = analises.find(a => a.venda_id === String(venda.id));
    if (analise) {
        document.getElementById('dimensaoComprimento').value = analise.comprimento_cm || '';
        document.getElementById('dimensaoLargura').value = analise.largura_cm || '';
        document.getElementById('dimensaoAltura').value = analise.altura_cm || '';
        document.getElementById('dimensaoPeso').value = analise.peso_kg || '';
        if (analise.comprimento_cm && analise.largura_cm && analise.altura_cm) {
            const vol = (analise.comprimento_cm * analise.largura_cm * analise.altura_cm) / 6000;
            document.getElementById('pesoVolumetricoValor').textContent = vol.toFixed(2);
        } else {
            document.getElementById('pesoVolumetricoValor').textContent = '-';
        }
    } else {
        // Tentar buscar dimensões padrão pelo SKU
        if (venda.sku && venda.sku !== 'N/A') {
            const dims = await window.shippingManager.getProductDimensions(venda.sku);
            if (dims) {
                document.getElementById('dimensaoComprimento').value = dims.comprimento_cm || '';
                document.getElementById('dimensaoLargura').value = dims.largura_cm || '';
                document.getElementById('dimensaoAltura').value = dims.altura_cm || '';
                document.getElementById('dimensaoPeso').value = dims.peso_kg || '';
                if (dims.comprimento_cm && dims.largura_cm && dims.altura_cm) {
                    const vol = (dims.comprimento_cm * dims.largura_cm * dims.altura_cm) / 6000;
                    document.getElementById('pesoVolumetricoValor').textContent = vol.toFixed(2);
                }
            }
        }
    }

    // Carregar fotos
    await carregarFotosVenda(venda.id);

    // Configurar eventos dos botões
    const salvarBtn = document.getElementById('salvarDimensoesBtn');
    const salvarPadraoBtn = document.getElementById('salvarComoPadraoBtn');
    const uploadBtn = document.getElementById('uploadFotoVendaBtn');
    const uploadInput = document.getElementById('uploadFotoVendaInput');

    // Remover listeners antigos (para evitar duplicação)
    const newSalvarBtn = salvarBtn.cloneNode(true);
    salvarBtn.parentNode.replaceChild(newSalvarBtn, salvarBtn);
    const newSalvarPadraoBtn = salvarPadraoBtn.cloneNode(true);
    salvarPadraoBtn.parentNode.replaceChild(newSalvarPadraoBtn, salvarPadraoBtn);
    const newUploadBtn = uploadBtn.cloneNode(true);
    uploadBtn.parentNode.replaceChild(newUploadBtn, uploadBtn);

    newSalvarBtn.onclick = async () => {
        const comp = parseFloat(document.getElementById('dimensaoComprimento').value);
        const larg = parseFloat(document.getElementById('dimensaoLargura').value);
        const alt = parseFloat(document.getElementById('dimensaoAltura').value);
        const peso = parseFloat(document.getElementById('dimensaoPeso').value);
        await window.shippingManager.salvarDimensoesVenda(venda.id, comp, larg, alt, peso, false);
        mostrarToast('Dimensões salvas para esta venda', 'success');
    };

    newSalvarPadraoBtn.onclick = async () => {
        if (!venda.sku || venda.sku === 'N/A') {
            mostrarToast('Este produto não possui SKU, não é possível salvar como padrão', 'warning');
            return;
        }
        const comp = parseFloat(document.getElementById('dimensaoComprimento').value);
        const larg = parseFloat(document.getElementById('dimensaoLargura').value);
        const alt = parseFloat(document.getElementById('dimensaoAltura').value);
        const peso = parseFloat(document.getElementById('dimensaoPeso').value);
        await window.shippingManager.salvarDimensoesVenda(venda.id, comp, larg, alt, peso, true);
        mostrarToast(`Dimensões salvas como padrão para o SKU ${venda.sku}`, 'success');
    };

    newUploadBtn.onclick = () => uploadInput.click();
    uploadInput.onchange = async (e) => {
        if (e.target.files.length) {
            await window.shippingManager.adicionarFotoVenda(venda.id, e.target.files[0]);
            await carregarFotosVenda(venda.id);
            uploadInput.value = '';
        }
    };

    // Adicionar listeners para atualizar peso volumétrico em tempo real
    const compInput = document.getElementById('dimensaoComprimento');
    const largInput = document.getElementById('dimensaoLargura');
    const altInput = document.getElementById('dimensaoAltura');
    const atualizarVol = () => {
        const comp = parseFloat(compInput.value);
        const larg = parseFloat(largInput.value);
        const alt = parseFloat(altInput.value);
        if (comp && larg && alt) {
            const vol = (comp * larg * alt) / 6000;
            document.getElementById('pesoVolumetricoValor').textContent = vol.toFixed(2);
        } else {
            document.getElementById('pesoVolumetricoValor').textContent = '-';
        }
    };
    compInput.addEventListener('input', atualizarVol);
    largInput.addEventListener('input', atualizarVol);
    altInput.addEventListener('input', atualizarVol);

    // Exibir modal
    document.getElementById('vendaDetalhesModal').classList.remove('hidden');
};

async function carregarFotosVenda(vendaId) {
    const fotos = await window.shippingManager.listarFotosVenda(vendaId);
    const galeria = document.getElementById('galeriaFotosVenda');
    galeria.innerHTML = fotos.map(foto => `
        <div class="position-relative" style="width: 100px; margin: 5px;">
            <img src="${foto.foto_url}" style="width: 100%; height: 80px; object-fit: cover; border-radius: 5px;">
            <button class="btn btn-sm btn-danger position-absolute top-0 end-0" onclick="removerFoto(${foto.id}, '${vendaId}')">&times;</button>
        </div>
    `).join('');
}

window.removerFoto = async function(fotoId, vendaId) {
    if (confirm('Remover esta foto?')) {
        await window.shippingManager.removerFotoVenda(fotoId);
        await carregarFotosVenda(vendaId);
        mostrarToast('Foto removida', 'success');
    }
};

// ===== FUNÇÃO PARA RENDERIZAR VENDAS NA TELA =====
function renderVendasML(vendas) {
    const salesTableBody = document.getElementById('salesTableBody');
    if (!salesTableBody) {
        console.error('❌ Tabela de vendas não encontrada');
        return;
    }
    
    salesTableBody.innerHTML = '';
    
    if (vendas.length === 0) {
        salesTableBody.innerHTML = `
            <tr>
                <td colspan="9" class="text-center" style="padding: 40px;">
                    <i class="fas fa-store-slash fa-3x" style="color: #6c757d; opacity: 0.5; margin-bottom: 15px;"></i>
                    <h4 style="color: #6c757d;">Nenhuma venda encontrada</h4>
                    <p style="color: #6c757d;">Não há vendas recentes no Mercado Livre.</p>
                </td>
            </tr>
        `;
        return;
    }
    
    vendas.forEach((venda, index) => {
        const row = document.createElement('tr');
        row.className = 'venda-item';
        
        // Status badge
        let statusBadge = '';
        if (venda.verificada) {
            statusBadge = '<span class="badge badge-success">Verificada</span>';
        } else if (venda.status === 'fraude') {
            statusBadge = '<span class="badge badge-danger">Fraude</span>';
        } else {
            statusBadge = '<span class="badge badge-warning">Nova</span>';
        }
        
        row.innerHTML = `
            <td><strong>${venda.numero_venda}</strong></td>
            <td>${venda.data_venda}</td>
            <td class="valor-cell">R$ ${parseFloat(venda.valor_total).toFixed(2)}</td>
            <td>${venda.comprador}</td>
            <td>${venda.quantidade_itens}</td>
            <td>${statusBadge}</td>
            <td>
                <button class="btn btn-info btn-sm" onclick="verDetalhesVenda(${index})" title="Ver detalhes">
                    <i class="fas fa-eye"></i>
                </button>
                <button class="btn btn-success btn-sm" onclick="verificarVenda('${venda.id}')" title="Marcar como verificada">
                    <i class="fas fa-check"></i>
                </button>
                <button class="btn btn-danger btn-sm" onclick="marcarComoFraude('${venda.id}')" title="Marcar como fraude">
                    <i class="fas fa-times"></i>
                </button>
            </td>
        `;
        
        salesTableBody.appendChild(row);
    });
}

// ============================================
// FUNÇÃO PARA MOSTRAR/OCULTAR CAMPOS DE ANÚNCIO (MODIFICADA)
// ============================================
function toggleCamposAnuncio() {
    const photoType = document.getElementById('photoType').value;
    const camposAnuncio = document.getElementById('camposAnuncio');
    
    // Agora mostra os campos também para "Apenas edição"
    if (photoType === 'criar_anuncio' || photoType === 'replicar_anuncio' || photoType === 'edicao') {
        camposAnuncio.classList.remove('hidden');
    } else {
        camposAnuncio.classList.add('hidden');
    }
    
    // Se for criar/replicar anúncio ou apenas edição, definir opções padrão
    if (photoType === 'criar_anuncio' || photoType === 'replicar_anuncio' || photoType === 'edicao') {
        const precisaFotoSelect = document.getElementById('precisaFoto');
        if (precisaFotoSelect) {
            precisaFotoSelect.value = 'nao'; // Valor padrão
        }
    }
}

// ===== FUNÇÃO PARA ADICIONAR FOTO POR LINK =====
function addPhotoFromLink() {
    const photoLinkInput = document.getElementById('photoLinkInput');
    const link = photoLinkInput.value.trim();
    
    if (!link) {
        showToast('Por favor, insira um link válido', 'warning');
        return;
    }
    
    // Validar se é uma URL válida
    try {
        new URL(link);
    } catch (e) {
        showToast('Link inválido. Por favor, insira uma URL válida', 'error');
        return;
    }
    
    // Validar se é uma imagem
    if (!link.match(/\.(jpg|jpeg|png|gif|webp|bmp)(\?.*)?$/i)) {
        showToast('Link deve ser de uma imagem (JPG, PNG, GIF, etc.)', 'warning');
        return;
    }
    
    if (selectedPhotos.length >= MAX_PHOTOS_PER_OS) {
        showToast(`Limite de ${MAX_PHOTOS_PER_OS} fotos atingido`, 'warning');
        return;
    }
    
    // Adicionar foto por link
    const photoData = {
        id: Date.now() + Math.random(),
        name: `Foto do link: ${link.substring(0, 30)}...`,
        type: 'image/url',
        size: 0,
        data: link, // Salva o link diretamente
        thumbnail: link,
        isLink: true // Marcar que é uma foto por link
    };
    
    selectedPhotos.push(photoData);
    updatePhotoPreviews();
    photoLinkInput.value = '';
    showToast('✅ Foto adicionada por link', 'success');
}

// Reenviar reembolso para verificação (do pendente para a verificar)
window.reenviarParaVerificacao = async function(id) {
    if (!confirm('Reenviar este reembolso para verificação?')) return;
    
    try {
        console.log('Reenviando reembolso ID:', id, 'para verificação');
        
        const { data, error } = await supabaseClient
            .from('reembolsos_ml')
            .update({ 
                status: 'a_verificar',
                verificado_por: null,
                data_atualizacao: new Date().toISOString(),
                notificado_admin: false // Resetar notificação para admin
            })
            .eq('id', id)
            .select();
        
        if (error) {
            console.error('Erro Supabase:', error);
            throw error;
        }
        
        console.log('Reembolso reenviado para verificação:', data);
        
        // Atualizar lista local
        const index = reembolsos.findIndex(r => r.id === id);
        if (index !== -1) {
            reembolsos[index].status = 'a_verificar';
            reembolsos[index].verificado_por = null;
            reembolsos[index].notificado_admin = false;
        }
        
        showToast('↪️ Reembolso reenviado para verificação!', 'info');
        
        // Recarregar a tabela e voltar para aba "A Verificar"
        currentReembolsoFilter = 'a_verificar';
        updateReembolsoCounters();
        renderReembolsosTable();
        
    } catch (error) {
        console.error('❌ Erro ao reenviar reembolso:', error);
        showToast('❌ Erro ao reenviar reembolso: ' + error.message, 'error');
    }
};

// ===== FUNÇÕES PARA TOKEN ML AUTOMÁTICO =====

async function renewTokenWithRefreshToken(refreshToken) {
    try {
        console.log('🔄 Renovando token com refresh_token...');
        
        const params = new URLSearchParams();
        params.append('grant_type', 'refresh_token');
        params.append('client_id', ML_CONFIG.CLIENT_ID);
        params.append('client_secret', ML_CONFIG.CLIENT_SECRET);
        params.append('refresh_token', refreshToken);
        
        const response = await fetch(`${ML_CONFIG.API_BASE_URL}/oauth/token`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json'
            },
            body: params
        });
        
        if (response.ok) {
            const data = await response.json();
            console.log('✅ Token renovado com refresh_token!');
            return data;
        } else {
            console.error('❌ Erro na renovação:', response.status);
            return null;
        }
    } catch (error) {
        console.error('❌ Erro ao renovar token:', error);
        return null;
    }
}

// Adicione esta função em ml_token_manager.js
async function getValidToken() {
    try {
        console.log('🔑 Obtendo token válido...');
        
        const token = await autoManageMLToken();
        
        if (!token) {
            throw new Error('Não foi possível obter token válido');
        }
        
        return {
            access_token: token,
            expires_at: mlTokenStatus.expires_at,
            is_valid: true
        };
        
    } catch (error) {
        console.error('❌ Erro ao obter token válido:', error);
        return null;
    }
}

// Função para buscar vendas usando token automático
async function buscarVendasML(limit = 50) {
    console.log('🛒 Buscando vendas do Mercado Livre...');
    
    try {
        // 1. Obter token válido
        const token = await autoManageMLToken();
        
        if (!token) {
            throw new Error('Não foi possível obter token válido');
        }
        
        // 2. Buscar vendas DIRETAMENTE da API ML (fallback se Worker falhar)
        const dataInicio = new Date();
        dataInicio.setDate(dataInicio.getDate() - 30); // Últimos 30 dias
        
        const params = new URLSearchParams({
            seller: '415176739',
            sort: 'date_desc',
            'order.status': 'paid',
            limit: limit,
            offset: 0,
            'order.date_created.from': dataInicio.toISOString().split('T')[0]
        });
        
        let vendas = [];
        
        // Tentar via Worker primeiro
        try {
            const response = await fetch(
                `https://purple-bonus-3b1c.andmiotto1998.workers.dev/api/ml/proxy?url=https://api.mercadolibre.com/orders/search?${params}&token=${token}`
            );
            
            if (response.ok) {
                const data = await response.json();
                vendas = data.results || [];
                console.log(`✅ ${vendas.length} vendas encontradas via Worker`);
            } else {
                throw new Error('Worker falhou');
            }
        } catch (workerError) {
            console.log('🔄 Worker falhou, tentando direto...');
            
            // Fallback: chamada direta
            const directResponse = await fetch(
                `https://api.mercadolibre.com/orders/search?${params}`,
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Accept': 'application/json'
                    }
                }
            );
            
            if (directResponse.ok) {
                const data = await directResponse.json();
                vendas = data.results || [];
                console.log(`✅ ${vendas.length} vendas encontradas via API direta`);
            } else {
                throw new Error(`API direta falhou: ${directResponse.status}`);
            }
        }
        
        // 3. Processar resultados
        if (vendas.length > 0) {
            return processarVendasML(vendas);
        }
        
        return [];
        
    } catch (error) {
        console.error('❌ Erro ao buscar vendas:', error);
        showToast('Erro ao buscar vendas: ' + error.message, 'error');
        return [];
    }
}

function processarVendasML(vendas) {
    return vendas.map(venda => {
        const item = venda.order_items && venda.order_items.length > 0 ? venda.order_items[0] : {};
        
        return {
            id: venda.id,
            numero_venda: venda.external_reference || `ML-${venda.id}`,
            data_venda: new Date(venda.date_created).toLocaleString('pt-BR'),
            valor_total: venda.total_amount || 0,
            quantidade_itens: venda.order_items?.length || 0,
            comprador: venda.buyer?.nickname || 'Não informado',
            status: 'nova',
            verificada: false,
            
            // Detalhes do item principal
            item_titulo: item.item?.title || 'Produto não identificado',
            item_sku: item.item?.seller_custom_field || 'N/A',
            item_quantidade: item.quantity || 1,
            item_preco_unitario: item.unit_price || 0,
            
            // Informações adicionais
            metodo_pagamento: venda.payments?.[0]?.payment_type || 'Não informado',
            tags: venda.tags || [],
            dados_completos: venda
        };
    });
}

async function adicionarFotoVenda(vendaId, file) {
    // Converte para base64 ou upload para storage
    const reader = new FileReader();
    reader.onload = async function(e) {
        const base64 = e.target.result;
        const { data, error } = await supabaseClient
            .from('vendas_fotos')
            .insert([{
                venda_id: vendaId,
                foto_url: base64,
                uploaded_by: currentUser.name
            }]);
        if (error) console.error(error);
        else carregarFotosVenda(vendaId);
    };
    reader.readAsDataURL(file);
}

async function carregarFotosVenda(vendaId) {
    const { data, error } = await supabaseClient
        .from('vendas_fotos')
        .select('*')
        .eq('venda_id', vendaId);
    if (!error && data) {
        const galeria = document.getElementById('galeriaFotosVenda');
        galeria.innerHTML = data.map(foto => `
            <div class="position-relative">
                <img src="${foto.foto_url}" style="width: 80px; height: 80px; object-fit: cover; border-radius: 5px;">
                <button class="btn btn-sm btn-danger position-absolute top-0 end-0" onclick="removerFotoVenda(${foto.id})">&times;</button>
            </div>
        `).join('');
    }
}

// ============================================
// FUNÇÕES PARA REEMBOLSOS
// ============================================

async function loadReembolsos() {
    if (!currentUser) return;

    try {
        if (!supabaseClient) {
            throw new Error('Supabase não conectado');
        }

        const { data, error } = await supabaseClient
            .from('reembolsos_ml')
            .select('*')
            .order('data_criacao', { ascending: false });

        if (error) throw error;

        // Mapeia os dados do Supabase para o formato usado internamente
        reembolsos = (data || []).map(item => ({
            id: item.id,
            numero_venda: item.numero_venda,
            numero_operacao: item.numero_operacao,
            valor: item.valor,
            data_operacao: item.data_operacao,
            tipo: item.tipo || (item.tem_frete ? 'frete' : 'normal'),
            tem_frete: item.tem_frete || item.tipo === 'frete',
            observacoes: item.observacoes,
            criado_por: item.criado_por,
            status: item.status,
            verificado_por: item.verificado_por,
            data_criacao: item.data_criacao,
            data_atualizacao: item.data_atualizacao,
            notificado_admin: item.notificado_admin,
            notificado_usuario: item.notificado_usuario,
            motivo: item.motivo,
            numero_reclamacao: item.numero_reclamacao,
            tipo_referencia: item.tipo_referencia,
            numero_retirada: item.numero_retirada,
            status_reembolso: item.status_reembolso || 'em_andamento',
            tipo_reclamacao: item.tipo_reclamacao || 'com_reembolso',
            resolvida: item.resolvida || false,
            responsabilidade: item.responsabilidade,
            cliente_bloqueado: item.cliente_bloqueado
        }));

        // Se não for administrador, filtra apenas os reembolsos criados pelo próprio usuário
        if (currentUser.role !== 'Administrador') {
            reembolsos = reembolsos.filter(r => r.criado_por === currentUser.name);
        }

        updateReembolsoCounters();
        renderReembolsosTable();
        verificarNotificacoesReembolsos();

    } catch (error) {
        console.error('❌ Erro ao carregar reembolsos:', error);
        reembolsos = [];
        updateReembolsoCounters();
        renderReembolsosTable();
        showToast('Erro ao carregar reembolsos. Verifique o console.', 'error');
    }
}

// ============================================
// ATUALIZAR CONTADORES DE REEMBOLSOS (VERSÃO SUPER SEGURA)
// ============================================
function updateReembolsoCounters() {
    if (!currentUser) return;

    // A verificar: com reembolso em andamento + sem reembolso não resolvidas
    const aVerificar = reembolsos.filter(r => 
        (r.tipo_reclamacao === 'com_reembolso' && (r.status === 'a_verificar' || r.status_reembolso === 'em_andamento')) ||
        (r.tipo_reclamacao === 'sem_reembolso' && !r.resolvida)
    ).length;

    // Reembolsados: com reembolso e que obtiveram sucesso
    const reembolsados = reembolsos.filter(r => 
        r.tipo_reclamacao === 'com_reembolso' && 
        (r.status === 'reembolsado' || r.status_reembolso === 'finalizado')
    ).length;

    // Pendentes: com reembolso mas não obtiveram (status pendente)
    const pendentes = reembolsos.filter(r => 
        r.tipo_reclamacao === 'com_reembolso' && 
        r.status === 'pendente'
    ).length;

    // Finalizadas: sem reembolso resolvidas
    const finalizadas = reembolsos.filter(r => 
        r.tipo_reclamacao === 'sem_reembolso' && 
        r.resolvida === true
    ).length;

    const total = reembolsos.length;

    // Total de valores reembolsados (apenas os que foram aprovados)
    const totalValor = reembolsos
        .filter(r => r.tipo_reclamacao === 'com_reembolso' && (r.status === 'reembolsado' || r.status_reembolso === 'finalizado'))
        .reduce((sum, r) => sum + parseFloat(r.valor || 0), 0);

    const setText = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    };
    const setDisplay = (id, display) => {
        const el = document.getElementById(id);
        if (el) el.style.display = display;
    };

    setText('countVerificar', aVerificar);
    setText('countReembolsados', reembolsados);
    setText('countPendentes', pendentes);
    setText('countFinalizadas', finalizadas); // novo contador
    setText('totalReembolsos', totalValor.toFixed(2));

    setText('tabVerificar', aVerificar);
    setText('tabReembolsados', reembolsados);
    setText('tabPendentes', pendentes);
    setText('tabFinalizadas', finalizadas);
    setText('tabTodos', total);

    // Badges de notificação (admin)
    if (currentUser.role === 'Administrador' && aVerificar > 0) {
        setDisplay('badgeNovos', 'inline-block');
        setText('badgeNovos', aVerificar);
    } else {
        setDisplay('badgeNovos', 'none');
    }

    const pendentesUsuario = reembolsos.filter(r => 
        r.tipo_reclamacao === 'com_reembolso' && 
        r.status === 'pendente' && 
        r.criado_por === currentUser.name
    ).length;

    if (pendentesUsuario > 0) {
        setDisplay('badgePendentes', 'inline-block');
        setText('badgePendentes', pendentesUsuario);
    } else {
        setDisplay('badgePendentes', 'none');
    }

    const totalNotificacoes = aVerificar + pendentesUsuario;
    setText('reembolsoNotificationCount', totalNotificacoes);
    setDisplay('reembolsoNotificationBell', totalNotificacoes > 0 ? 'block' : 'none');
}

// Adicione esta função se não existir:
function setupReembolsoEventListeners() {
    // Event listener para o checkbox de frete (se ainda existir)
    const temFreteCheckbox = document.getElementById('temFrete');
    const freteContainer = document.getElementById('freteContainer');
    
    if (temFreteCheckbox && freteContainer) {
        temFreteCheckbox.addEventListener('change', function() {
            freteContainer.style.display = this.checked ? 'block' : 'none';
        });
    }
    
    // Event listener para data - setar data atual se vazia
    const dataReembolsoInput = document.getElementById('dataReembolso');
    if (dataReembolsoInput && !dataReembolsoInput.value) {
        dataReembolsoInput.value = new Date().toISOString().split('T')[0];
    }
    
    // Fechar modal ao clicar fora
    const reembolsoModal = document.getElementById('reembolsoModal');
    if (reembolsoModal) {
        reembolsoModal.addEventListener('click', function(e) {
            if (e.target === reembolsoModal) {
                closeReembolsoModal();
            }
        });
    }
}

function renderReembolsosTable() {
    const tbody = document.getElementById('reembolsosTableBody');
    const emptyMsg = document.getElementById('reembolsosEmpty');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (reembolsos.length === 0) {
        if (emptyMsg) emptyMsg.classList.remove('hidden');
        return;
    }
    if (emptyMsg) emptyMsg.classList.add('hidden');

    let filteredReembolsos = [];

    // Lógica de filtro conforme o valor de currentReembolsoFilter
    switch (currentReembolsoFilter) {
        case 'a_verificar':
    filteredReembolsos = reembolsos.filter(r => 
        // Com reembolso: apenas se estiver a_verificar OU em_andamento, mas NÃO pendente
        (r.tipo_reclamacao === 'com_reembolso' && 
         (r.status === 'a_verificar' || r.status_reembolso === 'em_andamento') &&
         r.status !== 'pendente') ||
        // Sem reembolso: não resolvidas
        (r.tipo_reclamacao === 'sem_reembolso' && !r.resolvida)
    );
    break;
        case 'reembolsados':
            filteredReembolsos = reembolsos.filter(r => 
                r.tipo_reclamacao === 'com_reembolso' && 
                (r.status === 'reembolsado' || r.status_reembolso === 'finalizado')
            );
            break;
        case 'pendentes':
            filteredReembolsos = reembolsos.filter(r => 
                r.tipo_reclamacao === 'com_reembolso' && 
                r.status === 'pendente'
            );
            break;
        case 'finalizadas':
            filteredReembolsos = reembolsos.filter(r => 
                r.tipo_reclamacao === 'sem_reembolso' && 
                r.resolvida === true
            );
            break;
        case 'todos':
        default:
            filteredReembolsos = [...reembolsos];
            break;
    }

    const isAdmin = currentUser && currentUser.role === 'Administrador';

    filteredReembolsos.forEach(reembolso => {
        const row = document.createElement('tr');
        const dataFormatada = formatarDataISO(reembolso.data_operacao);
        const motivo = reembolso.motivo || '-';
        const numReclamacao = reembolso.numero_reclamacao || '-';
        const tipoReclamacao = reembolso.tipo_reclamacao || 'com_reembolso';

        // Badge do tipo
        let tipoBadge = tipoReclamacao === 'sem_reembolso' 
            ? '<span class="badge badge-secondary">📋 Acompanhamento</span>'
            : '<span class="badge badge-primary">💰 Com reembolso</span>';

        // Status/Resolução
        let statusOrResolvida = '';
        if (tipoReclamacao === 'sem_reembolso') {
            statusOrResolvida = reembolso.resolvida
                ? '<span class="badge badge-success">Resolvida</span>'
                : `<span class="badge badge-warning">Pendente</span>
                   <button class="btn btn-sm btn-success ml-1" onclick="marcarResolvida(${reembolso.id})">Resolver</button>`;
        } else {
            // Com reembolso
            if (reembolso.status === 'reembolsado' || reembolso.status_reembolso === 'finalizado') {
                statusOrResolvida = '<span class="badge badge-success">Reembolso finalizado</span>';
            } else if (reembolso.status === 'pendente') {
                statusOrResolvida = '<span class="badge badge-danger">Reembolso negado</span>';
            } else {
                statusOrResolvida = '<span class="badge badge-warning">Em andamento</span>';
            }
        }

        // Botões de ação
        let acoes = '';
        if (isAdmin || reembolso.criado_por === currentUser?.name) {
            if (tipoReclamacao === 'com_reembolso') {
                if ((reembolso.status === 'a_verificar' || reembolso.status_reembolso === 'em_andamento') && isAdmin) {
                    acoes = `
                        <button class="btn btn-success btn-sm" onclick="aprovarReembolso(${reembolso.id})" title="Marcar como Reembolsado">
                            <i class="fas fa-check"></i>
                        </button>
                        <button class="btn btn-danger btn-sm" onclick="rejeitarReembolso(${reembolso.id})" title="Marcar como Pendente">
                            <i class="fas fa-times"></i>
                        </button>
                    `;
                }
                if (reembolso.status === 'pendente' && reembolso.criado_por === currentUser?.name) {
                    acoes += `<button class="btn btn-info btn-sm" onclick="reenviarParaVerificacao(${reembolso.id})" title="Reenviar para Verificação"><i class="fas fa-paper-plane"></i></button>`;
                }
                if ((reembolso.status === 'reembolsado' || reembolso.status_reembolso === 'finalizado') && isAdmin) {
                    acoes += `<button class="btn btn-warning btn-sm" onclick="voltarParaVerificacao(${reembolso.id})" title="Voltar para A Verificar"><i class="fas fa-undo-alt"></i></button>`;
                }
            }
            // Botões comuns
            acoes += `<button class="btn btn-info btn-sm" onclick="verDetalhesReembolso(${reembolso.id})" title="Ver detalhes"><i class="fas fa-eye"></i></button>`;
            acoes += `<button class="btn btn-warning btn-sm" onclick="editarReembolso(${reembolso.id})" title="Editar"><i class="fas fa-edit"></i></button>`;
            if (isAdmin || reembolso.criado_por === currentUser?.name) {
                acoes += `<button class="btn btn-danger btn-sm" onclick="excluirReembolso(${reembolso.id})" title="Excluir"><i class="fas fa-trash"></i></button>`;
            }
        } else {
            acoes = '<span class="text-muted">Sem permissão</span>';
        }

        row.innerHTML = `
            <td><strong>${reembolso.numero_venda}</strong><br><small class="text-muted">Rec: ${numReclamacao}</small></td>
            <td>${reembolso.numero_operacao || '-'} ${reembolso.numero_retirada ? `<br><small>Retirada: ${reembolso.numero_retirada}</small>` : ''}</td>
            <td class="valor-cell">R$ ${parseFloat(reembolso.valor).toFixed(2)}</td>
            <td>${dataFormatada}</td>
            <td>${motivo}</td>
            <td>${tipoBadge}</td>
            <td>${statusOrResolvida}</td>
            <td>${reembolso.criado_por}</td>
            <td><div class="d-flex gap-2">${acoes}</div></td>
        `;
        tbody.appendChild(row);
    });
}

// ===== FUNÇÃO PARA EDITAR REEMBOLSO =====
window.editarReembolso = async function(id) {
    const reembolso = reembolsos.find(r => r.id === id);
    if (!reembolso) {
        showToast('Reembolso não encontrado', 'error');
        return;
    }

    const isAdmin = currentUser.role === 'Administrador';
    if (!isAdmin && reembolso.criado_por !== currentUser.name) {
        showToast('Sem permissão', 'warning');
        return;
    }

    editingReembolsoId = id;
    document.getElementById('reembolsoModalTitle').textContent = 'Editar Reclamação';
    document.getElementById('reembolsoId').value = id;

    // Tipo de referência
    const isRetirada = (reembolso.tipo_referencia === 'retirada') || (reembolso.numero_venda && reembolso.numero_venda.startsWith('RET-'));
    if (isRetirada) {
        document.querySelector('input[name="tipoReferencia"][value="retirada"]').checked = true;
        document.getElementById('numeroRetirada').value = reembolso.numero_retirada || reembolso.numero_venda?.replace('RET-', '') || '';
    } else {
        document.querySelector('input[name="tipoReferencia"][value="venda"]').checked = true;
        document.getElementById('numeroVenda').value = reembolso.numero_venda || '';
    }
    toggleReferenciaFields();

    // Tipo de operação
    if (reembolso.numero_operacao) {
        document.querySelector('input[name="tipoOperacao"][value="adicionar"]').checked = true;
        document.getElementById('numeroOperacao').value = reembolso.numero_operacao;
    } else {
        document.querySelector('input[name="tipoOperacao"][value="reembolso_venda"]').checked = true;
    }
    toggleOperacaoField();

    // Dados comuns
    document.getElementById('numeroReclamacao').value = reembolso.numero_reclamacao || '';
    document.getElementById('valorReembolso').value = reembolso.valor || '';
    document.getElementById('dataReembolso').value = reembolso.data_operacao?.split('T')[0] || '';
    document.getElementById('observacoesReembolso').value = reembolso.observacoes || '';

    // Tipo de reclamação
    const tipoReclamacao = reembolso.tipo_reclamacao || 'com_reembolso';
    document.querySelector(`input[name="tipoReclamacao"][value="${tipoReclamacao}"]`).checked = true;
    toggleCamposReclamacao(); // ajusta visibilidade

    if (tipoReclamacao === 'sem_reembolso') {
        document.getElementById('responsabilidade').value = reembolso.responsabilidade || '';
        if (reembolso.cliente_bloqueado) {
            document.querySelector('input[name="clienteBloqueado"][value="sim"]').checked = true;
        } else {
            document.querySelector('input[name="clienteBloqueado"][value="nao"]').checked = true;
        }
        document.getElementById('motivoReclamacaoExtra').value = reembolso.motivo || '';
        document.getElementById('resolvida').value = reembolso.resolvida ? 'sim' : 'nao';
        // Esconder campos de reembolso
        document.getElementById('statusReembolso').closest('.form-group').style.display = 'none';
    } else {
        document.getElementById('motivoReembolso').value = reembolso.motivo || '';
        document.getElementById('statusReembolso').value = reembolso.status_reembolso || 'em_andamento';
        document.getElementById('statusReembolso').closest('.form-group').style.display = 'block';
    }

    document.getElementById('reembolsoModal').classList.remove('hidden');
};

// Filtrar reembolsos
window.filtrarReembolsos = function(filter) {
    // Normaliza o filtro: mapeia singular para plural se necessário
    let normalizedFilter = filter;
    if (filter === 'reembolsado') normalizedFilter = 'reembolsados';
    if (filter === 'pendente') normalizedFilter = 'pendentes';
    
    console.log(`📌 Aplicando filtro: ${filter} -> normalizado: ${normalizedFilter}`);
    
    currentReembolsoFilter = normalizedFilter;
    renderReembolsosTable();
    
    // Atualizar estilo dos botões
    document.querySelectorAll('#reembolsosSystem .btn-sm').forEach(btn => {
        btn.classList.remove('btn-primary', 'active');
        btn.classList.add('btn-outline-secondary');
    });
    const activeBtn = document.querySelector(`#reembolsosSystem .btn-sm[onclick*="${filter.replace(/'/g, '')}"]`);
    if (activeBtn) {
        activeBtn.classList.remove('btn-outline-secondary');
        activeBtn.classList.add('btn-primary', 'active');
    }
};

// ===== FUNÇÃO PARA EXCLUIR REEMBOLSO =====
window.excluirReembolso = async function(id) {
    const reembolso = reembolsos.find(r => r.id === id);
    if (!reembolso) {
        showToast('Reembolso não encontrado', 'error');
        return;
    }
    
    // Verificar permissão - apenas admin ou criador pode excluir
    const isAdmin = currentUser.role === 'Administrador';
    if (!isAdmin && reembolso.criado_por !== currentUser.name) {
        showToast('Você não tem permissão para excluir este reembolso', 'warning');
        return;
    }
    
    if (!confirm(`Tem certeza que deseja excluir o reembolso da venda ${reembolso.numero_venda}?`)) {
        return;
    }
    
    try {
        if (!supabaseClient) {
            throw new Error('Conexão não disponível');
        }
        
        const { error } = await supabaseClient
            .from('reembolsos_ml')
            .delete()
            .eq('id', id);
        
        if (error) throw error;
        
        // Remover da lista local
        reembolsos = reembolsos.filter(r => r.id !== id);
        
        updateReembolsoCounters();
        renderReembolsosTable();
        
        showToast('🗑️ Reembolso excluído com sucesso!', 'success');
        
    } catch (error) {
        console.error('❌ Erro ao excluir reembolso:', error);
        showToast('❌ Erro ao excluir reembolso: ' + error.message, 'error');
    }
};

// ===== FUNÇÃO PARA NOVO REEMBOLSO =====
window.novoReembolso = function() {
    editingReembolsoId = null;
    document.getElementById('reembolsoModalTitle').textContent = 'Nova Reclamação';
    document.getElementById('reembolsoId').value = '';

    // Resetar radios
    document.querySelector('input[name="tipoReferencia"][value="venda"]').checked = true;
    document.querySelector('input[name="tipoOperacao"][value="adicionar"]').checked = true;
    document.querySelector('input[name="tipoReclamacao"][value="com_reembolso"]').checked = true;

    // Limpar campos
    document.getElementById('numeroVenda').value = '';
    document.getElementById('numeroRetirada').value = '';
    document.getElementById('numeroReclamacao').value = '';
    document.getElementById('numeroOperacao').value = '';
    document.getElementById('valorReembolso').value = '';
    document.getElementById('dataReembolso').value = new Date().toISOString().split('T')[0];
    document.getElementById('motivoReembolso').value = '';
    document.getElementById('observacoesReembolso').value = '';
    document.getElementById('statusReembolso').value = 'em_andamento';
    // Novos campos
    document.getElementById('responsabilidade').value = '';
    document.querySelector('input[name="clienteBloqueado"][value="nao"]').checked = true;
    document.getElementById('motivoReclamacaoExtra').value = '';
    document.getElementById('resolvida').value = 'nao';

    // Mostrar/ocultar campos conforme tipo
    toggleCamposReclamacao();
    toggleReferenciaFields();
    toggleOperacaoField();

    document.getElementById('reembolsoModal').classList.remove('hidden');
};

// Adicione esta função no arquivo script.js (pode ser na seção de funções para reembolsos):
window.reenviarParaVerificacao = async function(id) {
    if (!confirm('Reenviar este reembolso para verificação?\n\nO administrador será notificado para verificar novamente.')) return;
    
    try {
        if (!supabaseClient) {
            throw new Error('Conexão não disponível');
        }
        
        const { data, error } = await supabaseClient
            .from('reembolsos_ml')
            .update({ 
                status: 'a_verificar',
                verificado_por: null,
                data_atualizacao: new Date().toISOString(),
                notificado_admin: false // Resetar notificação para admin
            })
            .eq('id', id)
            .select();
        
        if (error) throw error;
        
        // Atualizar lista local
        const index = reembolsos.findIndex(r => r.id === id);
        if (index !== -1) {
            reembolsos[index].status = 'a_verificar';
            reembolsos[index].verificado_por = null;
            reembolsos[index].notificado_admin = false;
        }
        
        showToast('↪️ Reembolso reenviado para verificação!', 'success');
        
        // Recarregar a tabela
        updateReembolsoCounters();
        renderReembolsosTable();
        
        // Se for admin, mostrar notificação imediatamente
        if (currentUser.role === 'Administrador') {
            verificarNotificacoes();
        }
        
    } catch (error) {
        console.error('❌ Erro ao reenviar reembolso:', error);
        showToast('❌ Erro ao reenviar reembolso: ' + error.message, 'error');
    }
};

// Fechar modal de reembolso
window.closeReembolsoModal = function() {
    document.getElementById('reembolsoModal').classList.add('hidden');
};

// Salvar reembolso - VERSÃO CORRIGIDA
window.salvarReembolso = async function() {
    const tipoRefRadio = document.querySelector('input[name="tipoReferencia"]:checked');
    if (!tipoRefRadio) {
        showToast('Selecione o tipo de referência (Venda ou Retirada FULL)', 'warning');
        return;
    }
    const tipoReferencia = tipoRefRadio.value;
    
    let numeroVenda = '';
    let numeroRetirada = '';
    
    if (tipoReferencia === 'venda') {
        const inputVenda = document.getElementById('numeroVenda');
        if (!inputVenda) {
            showToast('Campo número da venda não encontrado', 'error');
            return;
        }
        numeroVenda = inputVenda.value.trim();
        if (!numeroVenda || numeroVenda.length !== 16) {
            showToast('Número da venda deve ter exatamente 16 caracteres!', 'warning');
            return;
        }
    } else {
        const inputRetirada = document.getElementById('numeroRetirada');
        if (!inputRetirada) {
            showToast('Campo número da retirada não encontrado', 'error');
            return;
        }
        numeroRetirada = inputRetirada.value.trim();
        if (!numeroRetirada) {
            showToast('Número da retirada é obrigatório!', 'warning');
            return;
        }
        numeroVenda = `RET-${numeroRetirada}`;
    }
    
    const inputReclamacao = document.getElementById('numeroReclamacao');
    if (!inputReclamacao) {
        showToast('Campo número da reclamação não encontrado', 'error');
        return;
    }
    const numeroReclamacao = inputReclamacao.value.trim();
    if (!numeroReclamacao) {
        showToast('Número da reclamação é obrigatório!', 'warning');
        return;
    }
    
    const tipoOpRadio = document.querySelector('input[name="tipoOperacao"]:checked');
    if (!tipoOpRadio) {
        showToast('Selecione o tipo de operação', 'warning');
        return;
    }
    const tipoOperacao = tipoOpRadio.value;
    let numeroOperacao = '';
    if (tipoOperacao === 'adicionar') {
        const inputOp = document.getElementById('numeroOperacao');
        if (!inputOp) {
            showToast('Campo número da operação não encontrado', 'error');
            return;
        }
        numeroOperacao = inputOp.value.trim();
        // Opcional – não obrigatório
    }
    
    const inputValor = document.getElementById('valorReembolso');
    const inputData = document.getElementById('dataReembolso');
    const inputMotivo = document.getElementById('motivoReembolso');
    const inputObservacoes = document.getElementById('observacoesReembolso');
    const inputStatus = document.getElementById('statusReembolso');
    const inputId = document.getElementById('reembolsoId');
    
    if (!inputValor || !inputData || !inputMotivo || !inputStatus) {
        showToast('Campos obrigatórios não encontrados', 'error');
        return;
    }
    
    let valor = inputValor.value;
    const dataOperacao = inputData.value;
    let motivo = inputMotivo.value;
    const observacoes = inputObservacoes ? inputObservacoes.value.trim() : '';
    const statusReembolso = inputStatus.value;
    const reembolsoId = inputId ? inputId.value : '';
    
    const tipoReclamacaoRadio = document.querySelector('input[name="tipoReclamacao"]:checked');
    if (!tipoReclamacaoRadio) {
        showToast('Selecione o tipo de reclamação', 'warning');
        return;
    }
    const tipoReclamacao = tipoReclamacaoRadio.value;
    
    let responsabilidade = null;
    let clienteBloqueado = null;
    let motivoReclamacaoExtra = null;
    let resolvida = false;
    
    if (tipoReclamacao === 'sem_reembolso') {
        responsabilidade = document.getElementById('responsabilidade')?.value || '';
        const clienteBloq = document.querySelector('input[name="clienteBloqueado"]:checked')?.value;
        clienteBloqueado = (clienteBloq === 'sim');
        motivoReclamacaoExtra = document.getElementById('motivoReclamacaoExtra')?.value.trim() || '';
        resolvida = (document.getElementById('resolvida')?.value === 'sim');
        
        if (!responsabilidade || !motivoReclamacaoExtra) {
            showToast('Responsabilidade e Motivo da reclamação são obrigatórios!', 'warning');
            return;
        }
        valor = valor || 0;
        motivo = motivoReclamacaoExtra;
    } else {
        if (!valor || parseFloat(valor) <= 0) {
            showToast('Valor do reembolso é obrigatório', 'warning');
            return;
        }
        if (!motivo) {
            showToast('Motivo é obrigatório!', 'warning');
            return;
        }
    }
    
    // Monta o objeto para salvar
    const reembolsoData = {
        numero_venda: numeroVenda,
        numero_retirada: tipoReferencia === 'retirada' ? numeroRetirada : null,
        tipo_referencia: tipoReferencia,
        numero_reclamacao: numeroReclamacao,
        numero_operacao: numeroOperacao || null,
        valor: parseFloat(valor || 0),
        data_operacao: dataOperacao,
        motivo: motivo,
        observacoes: observacoes || null,
        tipo_reclamacao: tipoReclamacao,
        responsabilidade: responsabilidade,
        cliente_bloqueado: clienteBloqueado,
        resolvida: resolvida,
        // 🔥 CORREÇÃO: para sem_reembolso, status = 'pendente'
        status: tipoReclamacao === 'com_reembolso' ? 'a_verificar' : 'pendente',
        status_reembolso: tipoReclamacao === 'com_reembolso' ? statusReembolso : null,
        data_atualizacao: new Date().toISOString()
    };
    
    if (!reembolsoId) {
        reembolsoData.criado_por = currentUser.name;
    }
    
    const btn = document.getElementById('salvarReembolsoBtn');
    if (!btn) {
        showToast('Botão salvar não encontrado', 'error');
        return;
    }
    const originalText = btn.innerHTML;
    btn.innerHTML = '<span class="spinner"></span> Salvando...';
    btn.disabled = true;
    
    try {
        let result;
        if (reembolsoId) {
            const { data, error } = await supabaseClient
                .from('reembolsos_ml')
                .update(reembolsoData)
                .eq('id', reembolsoId)
                .select();
            if (error) throw error;
            result = { success: true, data };
        } else {
            const { data, error } = await supabaseClient
                .from('reembolsos_ml')
                .insert([reembolsoData])
                .select();
            if (error) throw error;
            result = { success: true, data };
        }
        
        if (result.success) {
            showToast(reembolsoId ? 'Reclamação atualizada!' : 'Reclamação criada!', 'success');
            closeReembolsoModal();
            await loadReembolsos();
        }
    } catch (error) {
        console.error('❌ Erro ao salvar:', error);
        let msg = error.message;
        if (error.code === '23502') msg = 'Campo obrigatório não preenchido. Verifique todos os dados.';
        showToast('Erro ao salvar: ' + msg, 'error');
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
};

// Rejeitar reembolso (marcar como pendente) - VERSÃO CORRIGIDA
window.rejeitarReembolso = async function(id) {
    if (!confirm('⚠️ Confirmar que o reembolso NÃO foi obtido? Irá para "Pendentes".')) return;

    try {
        await supabaseClient
            .from('reembolsos_ml')
            .update({
                status: 'pendente',
                status_reembolso: null,
                verificado_por: currentUser.name,
                data_atualizacao: new Date().toISOString()
            })
            .eq('id', id);

        // Atualiza localmente para garantir consistência
        const idx = reembolsos.findIndex(r => r.id === id);
        if (idx !== -1) {
            reembolsos[idx].status = 'pendente';
            reembolsos[idx].status_reembolso = null;
            reembolsos[idx].verificado_por = currentUser.name;
        }

        // Recarrega a lista e re-renderiza
        await loadReembolsos();
        showToast('⚠️ Reembolso marcado como pendente', 'warning');
    } catch (error) {
        console.error(error);
        showToast('Erro ao rejeitar: ' + error.message, 'error');
    }
};

// ===== FUNÇÃO PARA ATUALIZAR REEMBOLSOS =====
window.atualizarReembolsos = function() {
    loadReembolsos();
    showToast('🔄 Atualizando lista de reembolsos...', 'info');
};

window.marcarResolvida = async function(id) {
    if (!confirm('Marcar esta reclamação como resolvida?')) return;
    try {
        const { error } = await supabaseClient
            .from('reembolsos_ml')
            .update({ resolvida: true })
            .eq('id', id);
        if (error) throw error;
        showToast('✅ Reclamação marcada como resolvida', 'success');
        await loadReembolsos();
    } catch (error) {
        console.error(error);
        showToast('Erro ao marcar como resolvida', 'error');
    }
};

// ============================================
// FUNÇÕES DE NOTIFICAÇÃO
// ============================================

// Verificar notificações
async function verificarNotificacoes() {
    if (!currentUser || !supabaseClient) return;
    
    try {
        // Para admin (ronald): verificar reembolsos "a_verificar" não notificados
        if (currentUser.role === 'Administrador') {
            const { data, error } = await supabaseClient
                .from('reembolsos_ml')
                .select('*')
                .eq('status', 'a_verificar')
                .eq('notificado_admin', false);
            
            if (error) throw error;
            
            if (data && data.length > 0) {
                // Atualizar contador
                if (notificationCount) {
                    notificationCount.textContent = data.length;
                    notificationBell.style.display = 'block';
                }
                
                // Adicionar notificações
                notificacoes = data.map(item => ({
                    id: item.id,
                    type: 'novo_reembolso',
                    title: 'Novo Reembolso para Verificar',
                    message: `${item.criado_por} adicionou um novo reembolso: ${item.numero_venda}`,
                    date: new Date(item.data_criacao),
                    read: false
                }));
                
                updateNotificationsUI();
            }
        }
        
        // Para todos os usuários: verificar reembolsos "pendente" não notificados
        const { data: pendentes, error: errorPendentes } = await supabaseClient
            .from('reembolsos_ml')
            .select('*')
            .eq('status', 'pendente')
            .eq('notificado_usuario', false)
            .eq('criado_por', currentUser.name);
        
        if (errorPendentes) throw errorPendentes;
        
        if (pendentes && pendentes.length > 0) {
            pendentes.forEach(item => {
                notificacoes.push({
                    id: item.id,
                    type: 'reembolso_pendente',
                    title: 'Reembolso Pendente',
                    message: `Seu reembolso ${item.numero_venda} foi marcado como pendente`,
                    date: new Date(item.data_atualizacao),
                    read: false
                });
            });
            
            updateNotificationsUI();
        }
        
    } catch (error) {
        console.error('❌ Erro ao verificar notificações:', error);
    }
}

function toggleCamposReclamacao() {
    const tipo = document.querySelector('input[name="tipoReclamacao"]:checked').value;
    const camposSemReembolso = document.getElementById('camposSemReembolso');
    const campoResolvida = document.getElementById('campoResolvida');
    const grupoValor = document.getElementById('valorReembolso')?.closest('.form-group');
    const grupoStatusReembolso = document.getElementById('statusReembolso')?.closest('.form-group');
    const grupoMotivoComReembolso = document.getElementById('motivoReembolso')?.closest('.form-group');

    if (tipo === 'sem_reembolso') {
        if (camposSemReembolso) camposSemReembolso.classList.remove('hidden');
        if (campoResolvida) campoResolvida.classList.remove('hidden');
        if (grupoValor) grupoValor.style.display = 'none';
        if (grupoStatusReembolso) grupoStatusReembolso.style.display = 'none';
        if (grupoMotivoComReembolso) grupoMotivoComReembolso.style.display = 'none';
        // Tornar campos obrigatórios
        if (document.getElementById('responsabilidade')) document.getElementById('responsabilidade').required = true;
        if (document.getElementById('motivoReclamacaoExtra')) document.getElementById('motivoReclamacaoExtra').required = true;
    } else {
        if (camposSemReembolso) camposSemReembolso.classList.add('hidden');
        if (campoResolvida) campoResolvida.classList.add('hidden');
        if (grupoValor) grupoValor.style.display = 'block';
        if (grupoStatusReembolso) grupoStatusReembolso.style.display = 'block';
        if (grupoMotivoComReembolso) grupoMotivoComReembolso.style.display = 'block';
        if (document.getElementById('responsabilidade')) document.getElementById('responsabilidade').required = false;
        if (document.getElementById('motivoReclamacaoExtra')) document.getElementById('motivoReclamacaoExtra').required = false;
    }
}

// Verificar notificações específicas para reembolsos
async function verificarNotificacoesReembolsos() {
    if (!currentUser) return;
    
    let count = 0;
    
    // Para admin: contar reembolsos a verificar
    if (currentUser.role === 'Administrador') {
        count += reembolsos.filter(r => r.status === 'a_verificar').length;
    }
    
    // Para todos: contar reembolsos pendentes próprios
    const pendentesProprios = reembolsos.filter(r => 
        r.status === 'pendente' && r.criado_por === currentUser.name
    ).length;
    
    count += pendentesProprios;
    
    // Atualizar badge - verificando se os elementos existem
    const reembolsoNotificationCountEl = document.getElementById('reembolsoNotificationCount');
    const reembolsoNotificationBellEl = document.getElementById('reembolsoNotificationBell');
    
    if (reembolsoNotificationCountEl) {
        reembolsoNotificationCountEl.textContent = count;
        if (count > 0) {
            reembolsoNotificationCountEl.style.display = 'inline-block';
        } else {
            reembolsoNotificationCountEl.style.display = 'none';
        }
    }
    
    if (reembolsoNotificationBellEl) {
        if (count > 0) {
            reembolsoNotificationBellEl.style.display = 'block';
        } else {
            reembolsoNotificationBellEl.style.display = 'none';
        }
    }
}

// Atualizar UI das notificações
function updateNotificationsUI() {
    const content = document.getElementById('notificacoesContent');
    if (!content) return;

    // OS não lidas
    const osNaoLidas = orders
        .filter(os => 
            os.responsibleName?.toLowerCase().includes(currentUser.name.toLowerCase()) &&
            os.user_notified === false
        )
        .map(os => ({
            id: os.id,
            type: 'nova_os',
            title: '📸 Nova OS atribuída',
            message: `${os.code} - ${os.productName}`,
            date: new Date(os.createdAt),
            read: false
        }));

    // Reembolsos não lidos (já existentes em notificacoes)
    const reembolsoNots = notificacoes.filter(n => !n.read).map(n => ({
        ...n,
        type: n.type === 'novo_reembolso' ? 'reembolso' : 'pendente'
    }));

    const todas = [...osNaoLidas, ...reembolsoNots].sort((a, b) => b.date - a.date);

    if (todas.length === 0) {
        content.innerHTML = `<div style="padding:20px; text-align:center; color:#6c757d;">Nenhuma notificação</div>`;
        return;
    }

    let html = '';
    todas.forEach((notif, index) => {
        const timeAgo = getTimeAgo(notif.date);
        const icon = notif.type === 'nova_os' ? 'fa-file-alt' : (notif.type === 'reembolso' ? 'fa-exchange-alt' : 'fa-exclamation-circle');
        const color = notif.type === 'nova_os' ? '#8A2BE2' : '#dc3545';

        html += `
            <div style="padding:15px; border-bottom:1px solid #e9ecef; cursor:pointer;" 
                 onclick="marcarNotificacaoComoLida('${notif.type}', ${notif.id})">
                <div style="display:flex; gap:10px;">
                    <div style="color:${color};">
                        <i class="fas ${icon}"></i>
                    </div>
                    <div style="flex:1;">
                        <div style="font-weight:600;">${notif.title}</div>
                        <div style="font-size:13px; color:#6c757d;">${notif.message}</div>
                        <div style="font-size:11px; color:#adb5bd;">${timeAgo}</div>
                    </div>
                </div>
            </div>
        `;
    });
    content.innerHTML = html;
}

async function updateNotificationBadge() {
    const notificationBell =
        document.getElementById(
            'notificationBell'
        );

    const notificationCount =
        document.getElementById(
            'notificationCount'
        );

    const reembolsoNotificationBell =
        document.getElementById(
            'reembolsoNotificationBell'
        );

    const reembolsoNotificationCount =
        document.getElementById(
            'reembolsoNotificationCount'
        );

    /*
     * Notificações de reembolso ainda não lidas.
     */
    const quantidadeReembolsos =
        Array.isArray(notificacoes)
            ? notificacoes.filter(
                notificacao =>
                    !notificacao.read
            ).length
            : 0;

    /*
     * Notificações de OS do usuário logado,
     * consultadas diretamente no Supabase.
     */
    let quantidadeOS =
        0;

    try {
        if (
            currentUser &&
            supabaseClient &&
            typeof obterOSNaoLidasUsuarioAtual ===
                'function'
        ) {
            const osNaoLidas =
                await obterOSNaoLidasUsuarioAtual();

            quantidadeOS =
                osNaoLidas.length;
        }

    } catch (error) {
        console.error(
            '❌ Erro contando notificações de OS:',
            error
        );
    }

    /*
     * O sino principal mostra OS + reembolsos.
     */
    const quantidadeTotal =
        quantidadeOS +
        quantidadeReembolsos;

    if (
        notificationBell &&
        notificationCount
    ) {
        notificationCount.textContent =
            String(quantidadeTotal);

        if (quantidadeTotal > 0) {
            notificationBell.style.display =
                'block';

            notificationBell.style.visibility =
                'visible';

            notificationBell.classList.add(
                'has-notifications'
            );

        } else {
            notificationBell.style.display =
                'none';

            notificationBell.classList.remove(
                'has-notifications'
            );
        }
    }

    /*
     * O sino específico de reembolso continua
     * mostrando apenas reembolsos.
     */
    if (
        reembolsoNotificationBell &&
        reembolsoNotificationCount
    ) {
        reembolsoNotificationCount.textContent =
            String(
                quantidadeReembolsos
            );

        reembolsoNotificationBell.style.display =
            quantidadeReembolsos > 0
                ? 'block'
                : 'none';
    }

    console.log(
        '🔔 Notificações atualizadas:',
        {
            usuario:
                currentUser?.name ||
                currentUser?.username,

            os:
                quantidadeOS,

            reembolsos:
                quantidadeReembolsos,

            total:
                quantidadeTotal
        }
    );
}

// Marcar notificação como lida
window.marcarNotificacaoComoLida = async function(tipo, id) {
    if (tipo === 'nova_os') {
        // Marcar OS como lida
        try {
            if (!supabaseClient) return;
            await supabaseClient
                .from('ordens_service')
                .update({ user_notified: true })
                .eq('id', id);

            const os = orders.find(o => o.id == id);
            if (os) os.user_notified = true;

            updateOSNotificationBell();
            updateNotificationsUI();
        } catch (error) {
            console.error('Erro ao marcar OS como lida:', error);
        }
    } else {
        // Código existente para reembolsos
        const notif = notificacoes.find(n => n.id === id);
        if (notif) {
            notif.read = true;
            if (notif.type === 'novo_reembolso') {
                await supabaseClient.from('reembolsos_ml').update({ notificado_admin: true }).eq('id', id);
            } else if (notif.type === 'reembolso_pendente') {
                await supabaseClient.from('reembolsos_ml').update({ notificado_usuario: true }).eq('id', id);
            }
        }
        updateNotificationsUI();
    }
};

// Marcar todas como lidas
window.marcarTodasComoLidas = async function() {
    // Marcar todas como lidas localmente
    notificacoes.forEach(notif => notif.read = true);
    
    // Atualizar no banco de dados
    try {
        if (currentUser.role === 'Administrador') {
            await supabaseClient
                .from('reembolsos_ml')
                .update({ notificado_admin: true })
                .eq('status', 'a_verificar');
        }
        
        // Marcar notificações de pendentes como lidas
        await supabaseClient
            .from('reembolsos_ml')
            .update({ notificado_usuario: true })
            .eq('status', 'pendente')
            .eq('criado_por', currentUser.name);
        
    } catch (error) {
        console.error('❌ Erro ao marcar notificações como lidas:', error);
    }
    
    updateNotificationsUI();
    showToast('Todas as notificações marcadas como lidas', 'success');
};

// Marcar todas como lidas (reembolsos)
window.marcarTodasComoLidasReembolso = function() {
    marcarTodasComoLidas();
};

// Alternar exibição de notificações
window.toggleNotificacoes = async function() {
    // Marcar OS como lidas ao abrir o dropdown
    await marcarOSComoLidas();

    const dropdown = document.getElementById('notificacoesDropdown');
    if (dropdown.classList.contains('hidden')) {
        dropdown.classList.remove('hidden');
        // Atualiza outras notificações se necessário
        updateNotificationsUI();
    } else {
        dropdown.classList.add('hidden');
    }
};

// Função auxiliar para calcular tempo relativo
function getTimeAgo(date) {
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'agora mesmo';
    if (diffMins < 60) return `há ${diffMins} min`;
    if (diffHours < 24) return `há ${diffHours} h`;
    if (diffDays < 7) return `há ${diffDays} d`;
    return date.toLocaleDateString('pt-BR');
}

// ============================================
// FUNÇÃO PARA NOTIFICAR ELAINE SOBRE FOTOS (ATUALIZADA)
// ============================================
async function notificarElaineSobreFotos(osData) {
    // Verificar se precisa de foto
    const precisaFoto = osData.precisaFoto === 'sim';
    
    if (precisaFoto) {
        const assunto = `📸 Nova OS precisa de fotos - ${osData.code}`;
        const mensagem = `
            Nova Ordem de Serviço criada que precisa de fotos:
            
            📋 OS: ${osData.code}
            📦 Produto: ${osData.productName}
            👤 Responsável: ${osData.responsibleName}
            💰 Valor do Anúncio: R$ ${osData.valorAnuncio || '0,00'}
            📝 Descrição: ${osData.descricaoAnuncio || 'Nenhuma'}
            
            Por favor, verifique o sistema para mais detalhes.
            
            Sistema Wheel Tech
        `;
        
        // Enviar notificação para Elaine
        await enviarNotificacaoEmail('elaine@empresa.com', assunto, mensagem, 'foto_os');
        
        // Também podemos enviar uma notificação no sistema
        showToast('📧 Notificação enviada para Elaine sobre necessidade de fotos', 'success');
    }
}

// ===== FUNÇÃO PARA NOTIFICAR ADMIN SOBRE NOVA OS =====
async function notificarAdminSobreNovaOS(osData) {
    const assunto = `🆕 Nova Ordem de Serviço criada - ${osData.code}`;
    const mensagem = `
        Nova Ordem de Serviço criada no sistema:
        
        📋 Código: ${osData.code}
        📦 Produto: ${osData.productName}
        👤 Criado por: ${osData.createdBy}
        👥 Responsável: ${osData.responsibleName}
        🚨 Urgência: ${osData.urgency}
        📷 Tipo: ${osData.photoType}
        
        ${osData.photoType === 'criar_anuncio' || osData.photoType === 'replicar_anuncio' ? `
        💰 Valor: R$ ${document.getElementById('valorAnuncio')?.value || '0,00'}
        📝 Descrição: ${document.getElementById('descricaoAnuncio')?.value.substring(0, 100)}...
        🔗 Link: ${document.getElementById('linkNovoAnuncio')?.value || 'Não informado'}
        ` : ''}
        
        Acesse o sistema para mais detalhes.
        
        Sistema Wheel Tech
    `;
    
    // Enviar para todos os administradores
    const admins = SYSTEM_USERS.filter(user => user.role === 'Administrador');
    
    for (const admin of admins) {
        // Agora passamos o NOME do admin, não o username
        await enviarNotificacaoEmail(admin.name, assunto, mensagem, 'nova_os');
    }
}

// ============================================
// FUNÇÕES DE RELATÓRIO DE REEMBOLSOS
// ============================================

// Abrir modal de relatório
window.openRelatorioReembolsos = function() {
    // Verificar se é admin
    if (currentUser.role !== 'Administrador') {
        showToast('Apenas o administrador pode acessar relatórios', 'warning');
        return;
    }
    
    // Configurar datas padrão (últimos 30 dias)
    const hoje = new Date();
    const umMesAtras = new Date();
    umMesAtras.setDate(hoje.getDate() - 30);
    
    document.getElementById('dataInicio').value = umMesAtras.toISOString().split('T')[0];
    document.getElementById('dataFim').value = hoje.toISOString().split('T')[0];
    document.getElementById('filtroMes').value = '';
    
    document.getElementById('relatorioModal').classList.remove('hidden');
};

// Fechar modal de relatório
window.closeRelatorioModal = function() {
    document.getElementById('relatorioModal').classList.add('hidden');
};

// Gerar relatório
window.gerarRelatorioReembolsos = async function() {
    const dataInicio = document.getElementById('dataInicio').value;
    const dataFim = document.getElementById('dataFim').value;
    const filtroMes = document.getElementById('filtroMes').value;

    if (dataInicio && dataFim && new Date(dataInicio) > new Date(dataFim)) {
        showToast('Data início não pode ser maior que data fim', 'warning');
        return;
    }

    try {
        // Buscar todos os registros (sem filtro de status)
        const { data, error } = await supabaseClient
            .from('reembolsos_ml')
            .select('*');

        if (error) throw error;
        if (!data || data.length === 0) {
            showToast('Nenhum registro encontrado', 'info');
            document.getElementById('totalPeriodo').textContent = '0,00';
            document.getElementById('quantidadePeriodo').textContent = '0';
            document.getElementById('mediaPeriodo').textContent = '0,00';
            document.getElementById('relatorioTableBody').innerHTML = '<tr><td colspan="5" class="text-center">Nenhum dado encontrado</td></tr>';
            return;
        }

        // Função auxiliar para filtrar por data
        const parseDate = (dateStr) => new Date(dateStr + 'T00:00:00');
        let filteredData = data;

        if (dataInicio && dataFim) {
            const inicioDate = parseDate(dataInicio);
            const fimDate = parseDate(dataFim);
            filteredData = filteredData.filter(item => {
                if (!item.data_operacao) return false;
                const itemDate = parseDate(item.data_operacao);
                return itemDate >= inicioDate && itemDate <= fimDate;
            });
        }

        if (filtroMes && filtroMes !== '') {
            const mes = parseInt(filtroMes);
            filteredData = filteredData.filter(item => {
                if (!item.data_operacao) return false;
                const itemDate = parseDate(item.data_operacao);
                return itemDate.getMonth() + 1 === mes;
            });
        }

        // ===== CÁLCULOS =====
        const totalRegistros = filteredData.length;
        const totalReembolsados = filteredData.filter(item => 
            item.status === 'reembolsado' || item.status_reembolso === 'finalizado'
        ).length;

        // Soma dos valores de todos os registros (independente do status)
        const somaTotal = filteredData.reduce((sum, item) => sum + parseFloat(item.valor || 0), 0);
        const mediaGeral = totalRegistros > 0 ? somaTotal / totalRegistros : 0;

        const totalPendentes = filteredData.filter(item => item.status === 'pendente').length;

        // Atualizar resumo
        document.getElementById('totalPeriodo').textContent = somaTotal.toFixed(2);
        document.getElementById('quantidadePeriodo').textContent = totalRegistros;
        document.getElementById('mediaPeriodo').textContent = mediaGeral.toFixed(2);

        // Preencher tabela com todos os registros (incluindo status)
        const tbody = document.getElementById('relatorioTableBody');
        tbody.innerHTML = '';

        if (filteredData.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center">Nenhum dado no período</td></tr>';
        } else {
            filteredData.forEach(item => {
                const dataOp = item.data_operacao ? new Date(item.data_operacao).toLocaleDateString('pt-BR') : '-';
                let statusBadge = '';
                if (item.status === 'reembolsado' || item.status_reembolso === 'finalizado') {
                    statusBadge = '<span class="badge badge-success">Reembolsado</span>';
                } else if (item.status === 'pendente') {
                    statusBadge = '<span class="badge badge-danger">Pendente</span>';
                } else if (item.status === 'a_verificar' || item.status_reembolso === 'em_andamento') {
                    statusBadge = '<span class="badge badge-warning">Em andamento</span>';
                } else if (item.tipo_reclamacao === 'sem_reembolso') {
                    statusBadge = item.resolvida ? '<span class="badge badge-info">Resolvida (sem reembolso)</span>' : '<span class="badge badge-secondary">Acompanhamento</span>';
                } else {
                    statusBadge = '<span class="badge badge-secondary">' + (item.status || 'Desconhecido') + '</span>';
                }

                const row = tbody.insertRow();
                row.innerHTML = `
                    <td>${item.numero_venda || '-'}</td>
                    <td>${dataOp}</td>
                    <td>R$ ${parseFloat(item.valor || 0).toFixed(2)}</td>
                    <td>${item.motivo || '-'}</td>
                    <td>${statusBadge}</td>
                `;
            });
        }

        // Se tiver gráfico, chama a função para atualizar
        if (typeof gerarGraficoReembolsos === 'function') {
            gerarGraficoReembolsos(filteredData);
        }

        showToast(`✅ Relatório gerado: ${filteredData.length} registros, total R$ ${somaTotal.toFixed(2)}`, 'success');

    } catch (error) {
        console.error('❌ Erro ao gerar relatório:', error);
        showToast('Erro ao gerar relatório: ' + error.message, 'error');
    }
};

// Gerar gráfico de reembolsos (simplificado)
function gerarGraficoReembolsos(data) {
    const container = document.getElementById('graficoContainer');
    
    if (!data || data.length === 0) {
        container.innerHTML = `
            <div style="text-align: center;">
                <i class="fas fa-chart-bar fa-3x" style="color: #6c757d; opacity: 0.3;"></i>
                <p style="color: #6c757d; margin-top: 10px;">Sem dados para exibir</p>
            </div>
        `;
        return;
    }
    
    // Agrupar por mês
    const meses = {};
    data.forEach(item => {
        const dataItem = new Date(item.data_operacao);
        const mesAno = `${dataItem.getMonth() + 1}/${dataItem.getFullYear()}`;
        
        if (!meses[mesAno]) {
            meses[mesAno] = 0;
        }
        meses[mesAno] += parseFloat(item.valor);
    });
    
    // Criar gráfico simples com HTML/CSS
    const maxValor = Math.max(...Object.values(meses));
    
    let html = '<div style="width: 100%;">';
    
    Object.entries(meses).forEach(([mes, valor]) => {
        const porcentagem = (valor / maxValor) * 100;
        html += `
            <div style="margin-bottom: 15px;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                    <span style="font-size: 12px; color: #495057;">${mes}</span>
                    <span style="font-size: 12px; color: #28a745; font-weight: 600;">R$ ${valor.toFixed(2)}</span>
                </div>
                <div style="height: 20px; background: #e9ecef; border-radius: 10px; overflow: hidden;">
                    <div style="height: 100%; width: ${porcentagem}%; background: linear-gradient(90deg, #28a745, #20c997); border-radius: 10px;"></div>
                </div>
            </div>
        `;
    });
    
    html += '</div>';
    container.innerHTML = html;
}

// Exportar relatório para Excel
window.exportarRelatorio = function() {
    const tbody = document.getElementById('relatorioTableBody');
    const rows = tbody.querySelectorAll('tr');
    
    if (rows.length === 0 || (rows.length === 1 && rows[0].querySelector('td[colspan]'))) {
        showToast('Nenhum dado para exportar', 'warning');
        return;
    }
    
    // Criar dados para Excel
    const dados = [];
    
    // Cabeçalho
    dados.push(['Venda', 'Data', 'Valor', 'Frete', 'Status']);
    
    // Dados
    rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 5) {
            dados.push([
                cells[0].textContent,
                cells[1].textContent,
                cells[2].textContent,
                cells[3].textContent,
                cells[4].textContent
            ]);
        }
    });
    
    // Criar workbook
    const ws = XLSX.utils.aoa_to_sheet(dados);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Reembolsos");
    
    // Gerar nome do arquivo
    const dataInicio = document.getElementById('dataInicio').value || 'inicio';
    const dataFim = document.getElementById('dataFim').value || 'fim';
    const filename = `reembolsos_${dataInicio}_a_${dataFim}.xlsx`;
    
    // Baixar arquivo
    XLSX.writeFile(wb, filename);
    
    showToast('Relatório exportado com sucesso!', 'success');
};

// Imprimir relatório
window.imprimirRelatorio = function() {
    const printWindow = window.open('', '_blank');
    
    const hoje = new Date().toLocaleDateString('pt-BR');
    const dataInicio = document.getElementById('dataInicio').value || '-';
    const dataFim = document.getElementById('dataFim').value || '-';
    const totalPeriodo = document.getElementById('totalPeriodo').textContent;
    const quantidadePeriodo = document.getElementById('quantidadePeriodo').textContent;
    const mediaPeriodo = document.getElementById('mediaPeriodo').textContent;
    
    // Pegar dados da tabela
    const tbody = document.getElementById('relatorioTableBody');
    let tabelaHTML = '';
    
    tbody.querySelectorAll('tr').forEach(row => {
        tabelaHTML += '<tr>';
        row.querySelectorAll('td').forEach(cell => {
            tabelaHTML += `<td>${cell.textContent}</td>`;
        });
        tabelaHTML += '</tr>';
    });
    
    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Relatório de Reembolsos</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 20px; }
                h1 { color: #333; }
                .info { background: #f5f5f5; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                th { background: #8A2BE2; color: white; padding: 10px; text-align: left; }
                td { padding: 8px; border-bottom: 1px solid #ddd; }
                .resumo { display: flex; justify-content: space-between; margin: 20px 0; }
                .resumo-item { text-align: center; }
                .resumo-valor { font-size: 24px; font-weight: bold; }
                @media print {
                    .no-print { display: none; }
                    body { margin: 0; }
                }
            </style>
        </head>
        <body>
            <h1>Relatório de Reembolsos</h1>
            <div class="info">
                <p><strong>Período:</strong> ${dataInicio} a ${dataFim}</p>
                <p><strong>Gerado em:</strong> ${hoje}</p>
                <p><strong>Gerado por:</strong> ${currentUser.name}</p>
            </div>
            
            <div class="resumo">
                <div class="resumo-item">
                    <div class="resumo-valor" style="color: #28a745;">R$ ${totalPeriodo}</div>
                    <div>Total Reembolsado</div>
                </div>
                <div class="resumo-item">
                    <div class="resumo-valor" style="color: #17a2b8;">${quantidadePeriodo}</div>
                    <div>Quantidade</div>
                </div>
                <div class="resumo-item">
                    <div class="resumo-valor" style="color: #ffc107;">R$ ${mediaPeriodo}</div>
                    <div>Média por Reembolso</div>
                </div>
            </div>
            
            <table>
                <thead>
                    <tr>
                        <th>Venda</th>
                        <th>Data</th>
                        <th>Valor</th>
                        <th>Frete</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
                    ${tabelaHTML}
                </tbody>
            </table>
            
            <div class="no-print" style="margin-top: 30px;">
                <button onclick="window.print()" style="padding: 10px 20px; background: #8A2BE2; color: white; border: none; cursor: pointer;">
                    Imprimir
                </button>
                <button onclick="window.close()" style="padding: 10px 20px; background: #6c757d; color: white; border: none; cursor: pointer; margin-left: 10px;">
                    Fechar
                </button>
            </div>
            
            <script>
                window.onload = function() {
                    setTimeout(function() {
                        window.print();
                    }, 500);
                };
            </script>
        </body>
        </html>
    `);
    
    printWindow.document.close();
};

// ============================================
// FUNÇÃO PARA ABRIR SISTEMA DE RECLAMAÇÕES (REEMBOLSOS)
// ============================================
function abrirSistemaReembolsos() {
    if (!currentUser) {
        showToast('⚠️ Faça login primeiro', 'warning');
        return;
    }

    // Esconder sistema principal e mostrar sistema de reembolsos
    if (mainSystem) mainSystem.classList.add('hidden');
    if (reembolsosSystem) reembolsosSystem.classList.remove('hidden');
    if (perguntasSystem) perguntasSystem.classList.add('hidden');
    if (estoqueGestaoSystem) estoqueGestaoSystem.classList.add('hidden');
    
    // Atualizar informações do usuário na tela de reembolsos
    if (reembolsoUserName) reembolsoUserName.textContent = currentUser.name;
    if (reembolsoUserAvatar) reembolsoUserAvatar.textContent = currentUser.avatar;
    if (reembolsoUserRole) reembolsoUserRole.textContent = currentUser.role;
    
    // Mostrar/ocultar botão de relatório padrão (se existir)
    const btnRelatorio = document.getElementById('btnRelatorio');
    if (btnRelatorio) {
        if (currentUser.role === 'Administrador') {
            btnRelatorio.classList.remove('hidden');
        } else {
            btnRelatorio.classList.add('hidden');
        }
    }
    
    // 🔥 FORÇAR A VISIBILIDADE DO BOTÃO DE RELATÓRIO POR COLABORADOR
    atualizarVisibilidadeRelatorioColaborador();
    
    // Carregar reembolsos
    loadReembolsos();
    showToast('💰 Sistema de Reclamações carregado', 'info');
}

// ============================================================
// LOGOUT
// ============================================================

function handleLogout() {

    if (
        !confirm(
            'Deseja realmente sair do sistema?'
        )
    ) {

        return;
    }


    // ========================================================
    // LIMPAR CONTROLE VISUAL DA META
    //
    // IMPORTANTE:
    // NÃO altera o bloqueio do banco.
    // ========================================================

    finalizarControleMetaRonaldSessao();


    // ========================================================
    // TIMERS DA SESSÃO
    // ========================================================

    if (sessionTimer) {

        clearTimeout(
            sessionTimer
        );


        sessionTimer =
            null;
    }


    if (sessionWarningTimer) {

        clearTimeout(
            sessionWarningTimer
        );


        sessionWarningTimer =
            null;
    }


    if (refreshTokenInterval) {

        clearInterval(
            refreshTokenInterval
        );


        refreshTokenInterval =
            null;
    }


    isSessionExpiring =
        false;


    // Remover modal antigo de sessão
    const warningModal =
        document.getElementById(
            'sessionWarningModal'
        );


    if (warningModal) {
        warningModal.remove();
    }


    // ========================================================
    // LOCAL STORAGE
    // ========================================================

    clearSessionStorage();


    // ========================================================
    // VARIÁVEIS
    // ========================================================

    currentUser =
        null;


    window.currentUser =
        null;


    orders =
        [];


    selectedPhotos =
        [];


    // ========================================================
    // MERCADO LIVRE
    // ========================================================

    localStorage.removeItem(
        'ml_access_token'
    );


    localStorage.removeItem(
        'ml_refresh_token'
    );


    localStorage.removeItem(
        'ml_token_expiry'
    );


    localStorage.removeItem(
        'ml_token_data'
    );


    localStorage.removeItem(
        'ml_vendas'
    );


    // ========================================================
    // ESCONDER SISTEMAS
    // ========================================================

    const sistemas = [
                    'menuSystem', 'mainSystem', 'salesSystem', 'reembolsosSystem', 'caixaSystem',
                    'precificacaoSystem', 'reviewsSystem', 'folgasSystem', 'shippingSystem',
                    'estoqueSystem', 'entradasSystem', 'estoqueGestaoSystem', 'perguntasSystem',
                    'feedbackSystem', 'nfeSystem', 'historicoAcessosScreen', 'promocoesSystem', 'gerenciamentoAnunciosSystem'
                    ];


    sistemas.forEach(
        id => {

            const el =
                document.getElementById(
                    id
                );


            if (el) {

                el.classList.add(
                    'hidden'
                );
            }

        }
    );


    // ========================================================
    // LOGIN
    // ========================================================

    const telaLogin =
        document.getElementById(
            'loginScreen'
        );


    if (telaLogin) {

        telaLogin.classList.remove(
            'hidden'
        );
    }


    document.body.classList.add(
        'login-active'
    );


    // ========================================================
    // MODAIS
    // ========================================================

    closeAllModals();


    // ========================================================
    // FORM LOGIN
    // ========================================================

    const formLogin =
        document.getElementById(
            'loginForm'
        );


    if (formLogin) {

        formLogin.reset();
    }


    const usernameInput =
        document.getElementById(
            'username'
        );


    if (usernameInput) {

        setTimeout(
            () =>
                usernameInput.focus(),
            100
        );
    }


    showToast(
        '👋 Até logo!',
        'info'
    );
}

function closeAllModals() {
    const modals = [
        'printModal',
        'photoViewerModal', 
        'completeModal',
        'viewOSModal',
        'reembolsoModal',
        'relatorioModal',
        'notificacoesDropdown',
        'notificacoesReembolsoDropdown'
    ];
    
    modals.forEach(modalId => {
        const modal = document.getElementById(modalId);
        if (modal) modal.classList.add('hidden');
    });
}

// ============================================
// TESTAR CONEXÃO SUPABASE
// + CARREGAR OS
// + VERIFICAR META RONALD
// ============================================

async function testSupabaseConnection() {

    showToast(
        '🔗 Testando conexão...',
        'info'
    );


    if (testSupabaseBtn) {

        testSupabaseBtn.innerHTML =
            '<span class="spinner"></span> Testando...';

        testSupabaseBtn.disabled =
            true;
    }


    try {

        // ====================================================
        // GARANTIR SUPABASE
        // ====================================================

        if (!supabaseClient) {

            initSupabase();
        }


        if (!supabaseClient) {

            throw new Error(
                'Supabase não inicializado'
            );
        }


        // ====================================================
        // TESTAR BANCO
        // ====================================================

        const {
            data,
            error
        } =
            await supabaseClient
                .from(
                    'ordens_service'
                )
                .select('id')
                .limit(1);


        if (error) {
            throw error;
        }


        showToast(
            '✅ Conexão estabelecida!',
            'success'
        );


        if (syncStatus) {

            syncStatus.textContent =
                'Conectado';

            syncStatus.className =
                'badge badge-success ml-2';
        }


        // ====================================================
        // CARREGAR OS
        // ====================================================

        await loadOrders();


        // ====================================================
        // ATUALIZAR MENU
        // ====================================================

        atualizarVisibilidadeMenu();


        // ====================================================
        // VERIFICAR META DO RONALD
        //
        // AGORA A VERIFICAÇÃO ACONTECE SOMENTE
        // DEPOIS DO SUPABASE ESTAR REALMENTE CONECTADO.
        // ====================================================

        if (
            currentUser &&
            String(
                currentUser.username
            )
                .toLowerCase() ===
                'ronald'
        ) {

            console.log(
                '🎯 Login do Ronald detectado. Verificando meta...'
            );


            const statusMeta =
                await verificarMetaRonald(
                    {

                        mostrarAviso:
                            true,

                        motivo:
                            'apos_conexao_supabase'

                    }
                );


            console.log(
                '🎯 Resultado da meta Ronald:',
                statusMeta
            );
        }


    } catch (error) {

        console.error(
            '❌ Erro de conexão:',
            error
        );


        showToast(
            '❌ Falha na conexão',
            'error'
        );


        if (syncStatus) {

            syncStatus.textContent =
                'Desconectado';

            syncStatus.className =
                'badge badge-danger ml-2';
        }


        updateCounters();

        renderOrdersTable();


    } finally {

        if (testSupabaseBtn) {

            testSupabaseBtn.innerHTML =
                '<i class="fas fa-database"></i> Testar Conexão';

            testSupabaseBtn.disabled =
                false;
        }
    }
}

// ============================================
// CARREGAR ORDENS
// ============================================
async function loadOrders() {

    if (!currentUser) {

        showToast(
            '⚠️ Faça login primeiro',
            'warning'
        );

        return;
    }


    showToast(
        '🔄 Carregando ordens...',
        'info'
    );


    if (reloadBtn) {

        reloadBtn.innerHTML =
            '<span class="spinner"></span> Carregando...';

        reloadBtn.disabled = true;
    }


    try {

        if (!supabaseClient) {

            throw new Error(
                'Supabase não conectado'
            );
        }


        const {
            data,
            error
        } =
            await supabaseClient
                .from('ordens_service')
                .select('*')
                .order(
                    'data_criacao',
                    {
                        ascending: false
                    }
                );


        if (error) {
            throw error;
        }


        if (
            data &&
            data.length > 0
        ) {

            orders =
                data.map(order => ({

                    id:
                        order.id,

                    user_notified:
                        order.user_notified || false,

                    code:
                        order.codigo ||
                        `OS-${order.id
                            .toString()
                            .padStart(4, '0')}`,

                    productName:
                        order.produto_nome ||
                        'Sem nome',

                    linkAnuncio:
                        order.link_anuncio || '',

                    responsibleName:
                        order.responsavel ||
                        currentUser.name,

                    urgency:
                        order.urgencia ||
                        'normal',

                    osType:
                        order.tipo_os ||
                        'normal',

                    status:
                        order.status ||
                        'pendente',

                    photoType:
                        order.tipo_foto ||
                        'estudio',

                    skus:
                        order.skus || [],

                    observations:
                        order.observacoes || '',

                    photos:
                        order.fotos || [],

                    photosTaken:
                        Number(
                            order.qtd_fotos
                        ) || 0,

                    editsMade:
                        Number(
                            order.qtd_edicoes
                        ) || 0,

                    createdBy:
                        order.criado_por ||
                        'Sistema',

                    createdAt:
                        order.data_criacao,

                    // NOVO
                    startedAt:
                        order.data_inicio ||
                        null,

                    completionDate:
                        order.data_conclusao ||
                        null,

                    updatedAt:
                        order.ultima_atualizacao ||
                        order.data_criacao,

                    conferido:
                        order.conferido ||
                        false,

                    conferidoPor:
                        order.conferido_por ||
                        null,

                    dataConferencia:
                        order.data_conferencia ||
                        null,

                    valorAnuncio:
                        order.valor_anuncio ||
                        0,

                    descricaoAnuncio:
                        order.descricao_anuncio ||
                        '',

                    linkNovoAnuncio:
                        order.link_novo_anuncio ||
                        '',

                    precisaFoto:
                        order.precisa_foto ||
                        'nao',

                    prazo_horas:
                        order.prazo_horas ||
                        null,

                    motivo_rejeicao:
                        order.motivo_rejeicao ||
                        null,

                    rejeitado_por:
                        order.rejeitado_por ||
                        null,

                    data_rejeicao:
                        order.data_rejeicao ||
                        null,

                    prazo_esperado:
                        order.prazo_esperado ||
                        null,

                    anuncio_criado:
                        order.anuncio_criado ||
                        false,

                    anuncio_criado_por:
                        order.anuncio_criado_por ||
                        null,

                    anuncio_criado_data:
                        order.anuncio_criado_data ||
                        null
                        

                }));


            orderCounter =
                orders.length > 0
                    ? Math.max(
                        ...orders.map(
                            o => parseInt(o.id)
                        )
                    ) + 1
                    : 1;


            updateOSNotificationBell();


            showToast(
                `✅ ${orders.length} ordens carregadas`,
                'success'
            );

        } else {
            orders = [];
            showToast('📭 Nenhuma ordem encontrada', 'info');
        }

        updateCounters();
        renderOrdersTable();


    } catch (error) {
        console.error('❌ Erro ao carregar ordens:', error);
        showToast('❌ Erro ao carregar ordens', 'error');

        orders = [];

        updateCounters();
        renderOrdersTable();

    } finally {
        if (reloadBtn) {
            reloadBtn.innerHTML =
                '<i class="fas fa-sync-alt"></i> Recarregar';
            reloadBtn.disabled = false;
        }
    }
}

async function saveOrder() {
    if (!currentUser) {
        showToast(
            '⚠️ Faça login primeiro',
            'warning'
        );

        return;
    }

    const normalizarTextoOS = valor => {
        return String(valor || '')
            .trim()
            .toLowerCase()
            .normalize('NFD')
            .replace(
                /[\u0300-\u036f]/g,
                ''
            );
    };

    const productName =
        document
            .getElementById('productName')
            ?.value
            ?.trim() ||
        '';

    const responsibleName =
        document
            .getElementById('responsibleName')
            ?.value ||
        '';

    const linkAnuncio =
        document
            .getElementById('linkAnuncio')
            ?.value
            ?.trim() ||
        '';

    const photoType =
        document
            .getElementById('photoType')
            ?.value ||
        '';

    const valorAnuncio =
        document
            .getElementById('valorAnuncio')
            ?.value ||
        0;

    const descricaoAnuncio =
        document
            .getElementById('descricaoAnuncio')
            ?.value ||
        '';

    const linkNovoAnuncio =
        document
            .getElementById('linkNovoAnuncio')
            ?.value
            ?.trim() ||
        '';

    const precisaFoto =
        document
            .getElementById('precisaFoto')
            ?.value ||
        'nao';

    const urgency =
        document
            .getElementById('urgency')
            ?.value ||
        'normal';

    const osType =
        document
            .getElementById('osType')
            ?.value ||
        'normal';

    const observations =
        document
            .getElementById('observations')
            ?.value ||
        '';

    const skus =
        (
            document
                .getElementById('skus')
                ?.value ||
            ''
        )
            .split(',')
            .map(sku => sku.trim())
            .filter(Boolean);

    const prazoHorasValor =
        document
            .getElementById('prazoHoras')
            ?.value;

    const prazoHoras =
        parseInt(
            prazoHorasValor,
            10
        ) ||
        null;

    /*
     * Identifica Renovação de anúncio pelo serviço selecionado.
     * Aceita tanto valor com acento quanto sem acento.
     */
    const servicoNormalizado =
        normalizarTextoOS(
            photoType
        );

    const ehRenovacaoAnuncio =
        servicoNormalizado.includes(
            'renovacao'
        ) &&
        servicoNormalizado.includes(
            'anuncio'
        );

    if (
        !productName ||
        !responsibleName
    ) {
        showToast(
            '⚠️ Preencha produto e responsável',
            'warning'
        );

        return;
    }

    /*
     * Validações específicas da Renovação de anúncio.
     */
    if (ehRenovacaoAnuncio) {
        if (!linkAnuncio) {
            showToast(
                '⚠️ Informe o link do anúncio',
                'warning'
            );

            return;
        }

        const possuiFotoReferencia =
            Array.isArray(selectedPhotos) &&
            selectedPhotos.length > 0;

        if (!possuiFotoReferencia) {
            showToast(
                '⚠️ Adicione o link ou arquivo da foto da bike/gancheira',
                'warning'
            );

            return;
        }
    }

    let finalResponsibleName =
        responsibleName;

    const tiposComAnuncio = [
        'criar_anuncio',
        'replicar_anuncio',
        'edicao'
    ];

    /*
     * Regra antiga de inclusão da Elaine para serviços
     * comuns que precisam de foto.
     *
     * Não executa essa regra na Renovação, porque a primeira
     * responsável interna precisa ser a Letícia.
     */
    if (
        !ehRenovacaoAnuncio &&
        tiposComAnuncio.includes(
            photoType
        ) &&
        precisaFoto === 'sim'
    ) {
        if (
            responsibleName &&
            normalizarTextoOS(
                responsibleName
            ) !== 'elaine'
        ) {
            finalResponsibleName =
                `${responsibleName} e Elaine`;

            showToast(
                '📸 Elaine adicionada como responsável (precisa de foto)',
                'info'
            );

        } else {
            finalResponsibleName =
                'Elaine';
        }
    }

    let existingOrder =
        null;

    if (editingOrderId) {
        existingOrder =
            orders.find(
                order =>
                    String(order.id) ===
                    String(editingOrderId)
            );

        if (!existingOrder) {
            showToast(
                '❌ Não foi possível encontrar a OS que está sendo editada',
                'error'
            );

            return;
        }
    }

    const agora =
        new Date().toISOString();

    const formData = {
        productName:
            productName,

        responsibleName:
            finalResponsibleName,

        linkAnuncio:
            linkAnuncio,

        urgency:
            urgency,

        osType:
            osType,

        photoType:
            photoType,

        skus:
            skus,

        observations:
            observations,

        valorAnuncio:
            parseFloat(
                valorAnuncio
            ) ||
            0,

        descricaoAnuncio:
            descricaoAnuncio,

        linkNovoAnuncio:
            linkNovoAnuncio,

        precisaFoto:
            precisaFoto,

        photos:
            Array.isArray(selectedPhotos)
                ? selectedPhotos
                : [],

        updatedAt:
            agora,

        prazo_horas:
            prazoHoras,

        prazo_esperado:
            null,

        /*
         * Campos do fluxo de Renovação.
         */
        fluxoRenovacao:
            ehRenovacaoAnuncio,

        etapaFluxo:
            null,

        destinatarioFinal:
            ehRenovacaoAnuncio
                ? 'Elaine'
                : finalResponsibleName,

        etapaAtualizadaEm:
            agora,

        etapaAtualizadaPor:
            currentUser.name ||
            currentUser.username ||
            ''
    };

    if (
        prazoHoras &&
        prazoHoras > 0
    ) {
        formData.prazo_esperado =
            calcularPrazoPorPrioridade(
                new Date(),
                null,
                prazoHoras
            );
    }

    const isAnuncio =
        photoType ===
            'criar_anuncio' ||
        photoType ===
            'replicar_anuncio';

    const criandoNovaOS =
        !editingOrderId;

    if (criandoNovaOS) {
        formData.id =
            orderCounter;

        formData.code =
            generateOSCode();

        formData.status =
            'pendente';

        formData.photosTaken =
            0;

        formData.editsMade =
            0;

        formData.createdBy =
            currentUser.name ||
            currentUser.username ||
            '';

        formData.createdAt =
            agora;

        formData.completionDate =
            null;

        formData.conferido =
            false;

        formData.conferidoPor =
            null;

        formData.dataConferencia =
            null;

        formData.motivo_rejeicao =
            null;

        formData.rejeitado_por =
            null;

        formData.data_rejeicao =
            null;

        formData.anuncio_criado =
            isAnuncio
                ? false
                : null;

        formData.anuncio_criado_por =
            null;

        formData.anuncio_criado_data =
            null;

        /*
         * Regra da Renovação:
         *
         * O campo visível do formulário continua Elaine,
         * mas a responsável da primeira etapa é Letícia.
         */
        if (ehRenovacaoAnuncio) {
            formData.responsibleName =
                'Leticia';

            formData.user_notified =
                false;

            formData.etapaFluxo =
                'aguardando_leticia';

            formData.destinatarioFinal =
                'Elaine';

            formData.status =
                'pendente';

            formData.conferido =
                false;

        } else {
            const responsavelNormalizado =
                normalizarTextoOS(
                    finalResponsibleName
                );

            const usuarioAtualNormalizado =
                normalizarTextoOS(
                    currentUser.name ||
                    currentUser.username
                );

            formData.user_notified =
                responsavelNormalizado !==
                usuarioAtualNormalizado;

            /*
             * user_notified precisa ser false para indicar
             * que existe uma notificação ainda não lida.
             */
            formData.user_notified =
                formData.user_notified
                    ? false
                    : true;
        }

    } else {
        /*
         * Edição: preserva os campos de controle da OS.
         */
        formData.id =
            existingOrder.id;

        formData.code =
            existingOrder.code;

        formData.status =
            existingOrder.status;

        formData.photosTaken =
            existingOrder.photosTaken ||
            0;

        formData.editsMade =
            existingOrder.editsMade ||
            0;

        formData.createdBy =
            existingOrder.createdBy;

        formData.user_notified =
            existingOrder.user_notified;

        formData.createdAt =
            existingOrder.createdAt;

        formData.completionDate =
            existingOrder.completionDate ||
            null;

        formData.conferido =
            existingOrder.conferido ||
            false;

        formData.conferidoPor =
            existingOrder.conferidoPor ||
            null;

        formData.dataConferencia =
            existingOrder.dataConferencia ||
            null;

        formData.motivo_rejeicao =
            existingOrder.motivo_rejeicao ||
            null;

        formData.rejeitado_por =
            existingOrder.rejeitado_por ||
            null;

        formData.data_rejeicao =
            existingOrder.data_rejeicao ||
            null;

        formData.anuncio_criado =
            existingOrder.anuncio_criado ||
            false;

        formData.anuncio_criado_por =
            existingOrder.anuncio_criado_por ||
            null;

        formData.anuncio_criado_data =
            existingOrder.anuncio_criado_data ||
            null;

        /*
         * Se a OS já pertence ao fluxo de Renovação,
         * editar os dados não pode mandá-la diretamente
         * para Elaine nem reiniciar o fluxo.
         */
        const existingEhRenovacao =
            existingOrder.fluxoRenovacao ===
                true ||
            normalizarTextoOS(
                existingOrder.photoType
            ).includes(
                'renovacao'
            );

        if (existingEhRenovacao) {
            formData.fluxoRenovacao =
                true;

            formData.responsibleName =
                existingOrder.responsibleName ||
                'Leticia';

            formData.etapaFluxo =
                existingOrder.etapaFluxo ||
                existingOrder.etapa_fluxo ||
                'aguardando_leticia';

            formData.destinatarioFinal =
                existingOrder.destinatarioFinal ||
                existingOrder.destinatario_final ||
                'Elaine';

            formData.etapaAtualizadaEm =
                existingOrder.etapaAtualizadaEm ||
                existingOrder.etapa_atualizada_em ||
                agora;

            formData.etapaAtualizadaPor =
                existingOrder.etapaAtualizadaPor ||
                existingOrder.etapa_atualizada_por ||
                currentUser.name ||
                currentUser.username ||
                '';
        }

        /*
         * Corrige data de conclusão inválida.
         */
        if (
            formData.status ===
                'concluida' &&
            formData.completionDate
        ) {
            const createdAtDate =
                new Date(
                    formData.createdAt
                );

            const completionDateObj =
                new Date(
                    formData.completionDate
                );

            if (
                completionDateObj <
                createdAtDate
            ) {
                console.warn(
                    `Data de conclusão ${formData.completionDate} anterior à criação. Corrigindo para agora.`
                );

                formData.completionDate =
                    agora;

                showToast(
                    '⚠️ Data de conclusão corrigida',
                    'warning'
                );
            }
        }

        /*
         * Recalcula o prazo quando necessário.
         */
        if (
            formData.status !==
                'concluida' &&
            (
                existingOrder.urgency !==
                    formData.urgency ||
                existingOrder.prazo_horas !==
                    prazoHoras
            )
        ) {
            formData.prazo_esperado =
                calcularPrazoPorPrioridade(
                    new Date(),
                    null,
                    prazoHoras
                );

        } else {
            formData.prazo_esperado =
                existingOrder.prazo_esperado ||
                null;
        }

        if (
            isAnuncio &&
            linkNovoAnuncio &&
            !existingOrder.anuncio_criado
        ) {
            formData.anuncio_criado =
                true;

            formData.anuncio_criado_por =
                currentUser.name ||
                currentUser.username ||
                '';

            formData.anuncio_criado_data =
                agora;

            showToast(
                '✅ Link do novo anúncio adicionado!',
                'success'
            );
        }
    }

    if (saveOSBtn) {
        saveOSBtn.innerHTML =
            '<span class="spinner"></span> Salvando...';

        saveOSBtn.disabled =
            true;
    }

    try {
        let result;

        if (
            editingOrderId &&
            supabaseClient
        ) {
            const oldOrder =
                orders.find(
                    order =>
                        String(order.id) ===
                        String(editingOrderId)
                );

            if (oldOrder) {
                const dadosAntigos = {
                    produto:
                        oldOrder.productName,

                    responsavel:
                        oldOrder.responsibleName,

                    urgencia:
                        oldOrder.urgency,

                    tipo_os:
                        oldOrder.osType,

                    servico:
                        oldOrder.photoType,

                    status:
                        oldOrder.status,

                    etapa_fluxo:
                        oldOrder.etapaFluxo ||
                        oldOrder.etapa_fluxo ||
                        null
                };

                await salvarHistoricoOS(
                    editingOrderId,
                    dadosAntigos,
                    formData,
                    currentUser.name ||
                    currentUser.username ||
                    ''
                );
            }
        }

        if (supabaseClient) {
            result =
                await saveOrderToSupabase(
                    formData
                );
        } else {
            result = {
                success: true,
                offline: true
            };
        }

        if (!result?.success) {
            throw new Error(
                result?.error ||
                'Não foi possível salvar a OS'
            );
        }

        if (criandoNovaOS) {
            /*
             * Usa o ID retornado pelo Supabase, quando disponível.
             */
            const osSalva =
                result.data ||
                result.order ||
                result.os ||
                null;

            if (osSalva?.id) {
                formData.id =
                    osSalva.id;
            }

            if (osSalva?.codigo) {
                formData.code =
                    osSalva.codigo;
            }

            orders.unshift(
                formData
            );

            orderCounter++;

            if (ehRenovacaoAnuncio) {
                showToast(
                    '✅ OS criada e enviada para a Letícia',
                    'success'
                );

            } else {
                showToast(
                    `✅ OS "${formData.productName}" criada`,
                    'success'
                );
            }

            /*
             * Não envia e-mail.
             * O sino é controlado por:
             *
             * responsavel = usuário da etapa
             * user_notified = false
             */

        } else {
            const index =
                orders.findIndex(
                    order =>
                        String(order.id) ===
                        String(formData.id)
                );

            if (index !== -1) {
                orders[index] = {
                    ...orders[index],
                    ...formData
                };
            }

            editingOrderId =
                null;

            showToast(
                `✅ OS "${formData.productName}" atualizada`,
                'success'
            );
        }

        if (
            typeof updateCounters ===
            'function'
        ) {
            updateCounters();
        }

        if (
            typeof renderOrdersTable ===
            'function'
        ) {
            renderOrdersTable();
        }

        if (
            typeof clearForm ===
            'function'
        ) {
            clearForm();
        }

        if (
            typeof updateOSNotificationBell ===
            'function'
        ) {
            await updateOSNotificationBell();
        }

    } catch (error) {
        console.error(
            '❌ Erro salvando OS:',
            error
        );

        showToast(
            `❌ Erro ao salvar: ${
                error.message ||
                error
            }`,
            'error'
        );

    } finally {
        if (saveOSBtn) {
            saveOSBtn.innerHTML =
                '<i class="fas fa-save"></i> <span id="submitBtnText">Salvar OS</span>';

            saveOSBtn.disabled =
                false;
        }
    }
}

// Função auxiliar para salvar histórico (adicione no script.js)
async function salvarHistoricoOS(osId, dadosAntes, dadosDepois, alteradoPor) {
    if (!supabaseClient) return;
    
    const camposAlterados = {};
    for (let key in dadosDepois) {
        if (dadosAntes[key] !== dadosDepois[key]) {
            camposAlterados[key] = {
                de: dadosAntes[key],
                para: dadosDepois[key]
            };
        }
    }
    
    const historico = {
        os_id: osId,
        dados_anteriores: dadosAntes,
        alterado_por: alteradoPor,
        data_alteracao: new Date().toISOString(),
        campos_alterados: Object.keys(camposAlterados).length ? camposAlterados : null
    };
    
    const { error } = await supabaseClient
        .from('ordens_service_historico')
        .insert(historico);
    
    if (error) console.error('Erro ao salvar histórico:', error);
}

// ============================================
// SALVAR OS NO SUPABASE
// ============================================
async function saveOrderToSupabase(order) {

    try {

        let fotosParaSalvar = [];


        if (
            order.photos &&
            order.photos.length > 0
        ) {

            fotosParaSalvar =
                order.photos.map(
                    photo => ({

                        name:
                            photo.name,

                        size:
                            photo.size,

                        type:
                            photo.type,

                        data:
                            photo.data,

                        isLink:
                            photo.isLink || false

                    })
                );
        }


        const orderData = {

            codigo:
                order.code,

            produto_nome:
                order.productName,

            responsavel:
                order.responsibleName,
            user_notified:
                order.user_notified,    
            fluxo_renovacao:
                order.fluxoRenovacao,
            etapa_fluxo:
                order.etapaFluxo,

            destinatario_final:
                order.destinatarioFinal,

            etapa_atualizada_em:
                order.etapaAtualizadaEm,

            etapa_atualizada_por:
                order.etapaAtualizadaPor,  

            link_anuncio:
                order.linkAnuncio || '',

            criado_por:
                order.createdBy,

            urgencia:
                order.urgency,

            tipo_os:
                order.osType,

            status:
                order.status,

            tipo_foto:
                order.photoType,

            observacoes:
                order.observations,

            skus:
                order.skus,

            fotos:
                fotosParaSalvar,

            qtd_fotos:
                Number(
                    order.photosTaken
                ) || 0,

            qtd_edicoes:
                Number(
                    order.editsMade
                ) || 0,

            user_notified:
                order.user_notified !== undefined
                    ? order.user_notified
                    : false,

            conferido:
                order.conferido || false,

            conferido_por:
                order.conferidoPor || null,

            data_conferencia:
                order.dataConferencia || null,

            valor_anuncio:
                order.valorAnuncio || 0,

            descricao_anuncio:
                order.descricaoAnuncio || '',

            link_novo_anuncio:
                order.linkNovoAnuncio || '',

            precisa_foto:
                order.precisaFoto || 'nao',

            // PRESERVA A DATA ORIGINAL
            data_criacao:
                order.createdAt ||
                new Date().toISOString(),

            data_conclusao:
                order.completionDate ||
                null,

            ultima_atualizacao:
                new Date().toISOString(),

            prazo_horas:
                order.prazo_horas ||
                null,

            prazo_esperado:
                order.prazo_esperado ||
                null,

            anuncio_criado:
                order.anuncio_criado ||
                false,

            anuncio_criado_por:
                order.anuncio_criado_por ||
                null,

            anuncio_criado_data:
                order.anuncio_criado_data ||
                null
        };


        // Só mexe em data_inicio
        // quando o objeto realmente possui esse campo.
        //
        // Isso evita apagar data_inicio
        // durante uma edição antiga.
        if (
            Object.prototype
                .hasOwnProperty
                .call(
                    order,
                    'startedAt'
                )
        ) {

            orderData.data_inicio =
                order.startedAt || null;
        }


        let result;


        if (editingOrderId) {

            const {
                data,
                error
            } =
                await supabaseClient
                    .from(
                        'ordens_service'
                    )
                    .update(
                        orderData
                    )
                    .eq(
                        'id',
                        editingOrderId
                    )
                    .select();


            if (error) {
                throw error;
            }


            result = {
                success: true,
                data
            };


        } else {

            // Nova OS ainda não iniciou
            orderData.data_inicio =
                order.startedAt ||
                null;


            const {
                data,
                error
            } =
                await supabaseClient
                    .from(
                        'ordens_service'
                    )
                    .insert([
                        orderData
                    ])
                    .select();


            if (error) {
                throw error;
            }


            result = {
                success: true,
                data
            };


            if (
                data &&
                data[0]
            ) {

                order.id =
                    data[0].id;
            }
        }


        return result;


    } catch (error) {

        console.error(
            '❌ Erro no Supabase:',
            error
        );


        return {

            success: false,

            error:
                error.message

        };
    }
}

// ============================================================
// CONFERIR OS
// Ronald: confere qualquer OS e contabiliza meta
// Letícia: confere somente devolução e não contabiliza meta
// ============================================================

window.conferirOS =
    async function(orderId) {
        const order =
            orders.find(
                item =>
                    String(item.id) ===
                    String(orderId)
            );

        if (!order) {
            showToast(
                '❌ Ordem não encontrada',
                'error'
            );

            return;
        }

        if (!currentUser) {
            showToast(
                '⚠️ Faça login primeiro',
                'warning'
            );

            return;
        }

        const username =
            getUsernameAtualOS();

        if (
            !podeUsuarioConferirOS(order)
        ) {
            if (
                username ===
                'leticia'
            ) {
                showToast(
                    '⚠️ Letícia pode conferir somente OS do tipo Devolução.',
                    'warning'
                );
            } else {
                showToast(
                    '⚠️ A conferência das OS é responsabilidade do Ronald.',
                    'warning'
                );
            }

            return;
        }

        if (
            order.status !==
            'concluida'
        ) {
            showToast(
                '⚠️ Apenas OS concluídas podem ser conferidas',
                'warning'
            );

            return;
        }

        if (order.conferido) {
            showToast(
                '⚠️ Esta OS já foi conferida',
                'warning'
            );

            return;
        }

        if (
            username ===
                'leticia' &&
            !ehOSDevolucao(order)
        ) {
            showToast(
                '⚠️ Letícia pode conferir somente OS do tipo Devolução.',
                'warning'
            );

            return;
        }

        const mensagemConfirmacao =
            username === 'leticia'
                ? (
                    `Deseja marcar a devolução "${order.productName}" como conferida?\n\n` +
                    'Esta conferência não será contabilizada em uma meta.'
                )
                : (
                    `Deseja marcar a OS "${order.productName}" como conferida?\n\n` +
                    'Você não poderá desfazer esta ação.'
                );

        if (
            !confirm(
                mensagemConfirmacao
            )
        ) {
            return;
        }

        try {
            if (!supabaseClient) {
                throw new Error(
                    'Supabase não conectado'
                );
            }

            const agoraISO =
                new Date()
                    .toISOString();

            // ====================================================
            // RONALD — UTILIZA A RPC E CONTABILIZA META
            // ====================================================

            if (
                username ===
                'ronald'
            ) {
                const {
                    data,
                    error
                } =
                    await supabaseClient
                        .rpc(
                            'processar_conferencia_os_ronald',
                            {
                                p_os_id:
                                    String(
                                        orderId
                                    ),

                                p_username:
                                    currentUser.username,

                                p_nome:
                                    currentUser.name,

                                p_resultado:
                                    'conferida',

                                p_motivo:
                                    null
                            }
                        );

                if (error) {
                    throw error;
                }

                const dataEvento =
                    data?.data_evento ||
                    agoraISO;

                order.conferido =
                    true;

                order.conferidoPor =
                    currentUser.name;

                order.dataConferencia =
                    dataEvento;

                order.updatedAt =
                    dataEvento;

                updateCounters();
                renderOrdersTable();

                const status =
                    await verificarMetaRonald({
                        mostrarAviso:
                            false,

                        motivo:
                            'conferencia_realizada'
                    });

                if (
                    status &&
                    status.faltamHoje > 0
                ) {
                    showToast(
                        `✅ OS conferida. Faltam ${status.faltamHoje} para concluir sua meta.`,
                        'success'
                    );

                    if (
                        bloqueioMetaRonaldAtivo
                    ) {
                        atualizarBannerBloqueioMetaRonald(
                            status,
                            status.estado
                                ?.motivo_bloqueio
                        );

                        setTimeout(
                            aplicarRestricaoVisualMetaRonald,
                            0
                        );
                    }
                } else {
                    showToast(
                        '🎯 OS conferida. Meta de conferência concluída!',
                        'success'
                    );
                }

                return;
            }

            // ====================================================
            // LETÍCIA — SOMENTE DEVOLUÇÃO E SEM META
            // ====================================================

            if (
                username ===
                'leticia'
            ) {
                if (
                    !ehOSDevolucao(order)
                ) {
                    throw new Error(
                        'Letícia pode conferir somente OS do tipo Devolução.'
                    );
                }

                const {
                    data,
                    error
                } =
                    await supabaseClient
                        .from(
                            'ordens_service'
                        )
                        .update({
                            conferido:
                                true,

                            conferido_por:
                                currentUser.name,

                            data_conferencia:
                                agoraISO,

                            ultima_atualizacao:
                                agoraISO
                        })
                        .eq(
                            'id',
                            orderId
                        )
                        .eq(
                            'status',
                            'concluida'
                        )
                        .eq(
                            'conferido',
                            false
                        )
                        .eq(
                            'tipo_os',
                            'devolucao'
                        )
                        .select()
                        .maybeSingle();

                if (error) {
                    throw error;
                }

                if (!data) {
                    throw new Error(
                        'A OS já foi conferida ou não é uma devolução concluída.'
                    );
                }

                order.conferido =
                    true;

                order.conferidoPor =
                    currentUser.name;

                order.dataConferencia =
                    data.data_conferencia ||
                    agoraISO;

                order.updatedAt =
                    data.ultima_atualizacao ||
                    agoraISO;

                updateCounters();
                renderOrdersTable();

                showToast(
                    '✅ Devolução conferida por Letícia. Esta conferência não possui meta.',
                    'success'
                );
            }
        } catch (error) {
            console.error(
                '❌ Erro ao conferir OS:',
                error
            );

            showToast(
                '❌ Erro ao conferir OS: ' +
                error.message,
                'error'
            );
        }
    };

// ============================================
// FUNÇÕES DO FORMULÁRIO (ATUALIZADAS COM FOTOS)
// ============================================
function clearForm() {
    const productNameInput = document.getElementById('productName');
    const responsibleNameInput = document.getElementById('responsibleName');
    const linkAnuncioInput = document.getElementById('linkAnuncio');
    const urgencySelect = document.getElementById('urgency');
    const osTypeSelect = document.getElementById('osType');
    const photoTypeSelect = document.getElementById('photoType');
    const skusInput = document.getElementById('skus');
    const observationsInput = document.getElementById('observations');
    const valorAnuncioInput = document.getElementById('valorAnuncio');
    const descricaoAnuncioInput = document.getElementById('descricaoAnuncio');
    const linkNovoAnuncioInput = document.getElementById('linkNovoAnuncio');
    const precisaFotoSelect = document.getElementById('precisaFoto');
    const photoLinkInput = document.getElementById('photoLinkInput');
    const prazoHorasInput = document.getElementById('prazoHoras');
    
    if (productNameInput) { productNameInput.value = ''; contarCaracteres(); }
    if (responsibleNameInput) responsibleNameInput.value = '';
    if (linkAnuncioInput) linkAnuncioInput.value = '';
    if (urgencySelect) urgencySelect.value = 'normal';
    if (osTypeSelect) osTypeSelect.value = 'normal';
    if (photoTypeSelect) photoTypeSelect.value = 'estudio';
    if (skusInput) skusInput.value = '';
    if (observationsInput) observationsInput.value = '';
    if (valorAnuncioInput) valorAnuncioInput.value = '';
    if (descricaoAnuncioInput) descricaoAnuncioInput.value = '';
    if (linkNovoAnuncioInput) linkNovoAnuncioInput.value = '';
    if (precisaFotoSelect) precisaFotoSelect.value = 'nao';
    if (photoLinkInput) photoLinkInput.value = '';
    
    // 🔥 Resetar campo de prazo (horas) para o valor padrão da urgência normal (48)
    if (prazoHorasInput) prazoHorasInput.value = 48;
    
    updateProductCounter(productNameInput, 'productCounter');
    
    // Ocultar campos de anúncio
    document.getElementById('camposAnuncio').classList.add('hidden');
    
    // Limpar fotos
    selectedPhotos = [];
    const previewArea = document.getElementById('photoPreviews');
    if (previewArea) {
        previewArea.innerHTML = '';
        previewArea.style.display = 'none';
    }
    const uploadArea = document.getElementById('photoUploadArea');
    if (uploadArea) {
        uploadArea.querySelector('p:first-of-type').textContent = 'Clique ou arraste fotos aqui';
    }
    
    editingOrderId = null;
    if (formTitle) formTitle.textContent = 'Nova Ordem de Serviço';
    if (submitBtnText) submitBtnText.textContent = 'Salvar OS';
    if (cancelEditBtn) cancelEditBtn.classList.add('hidden');
    
    generateOSCode();
}

function atualizarVisibilidadeMenu() {

    if (!currentUser) {
        return;
    }

    const username =
        String(currentUser.username || '')
            .trim()
            .toLowerCase();


    console.log(
        '👤 Atualizando menu para:',
        username
    );


    // ========================================================
    // HISTÓRICO DE ACESSOS
    // Ronald + Andressa
    // ========================================================

    const historicoCard =
        document.getElementById(
            'historicoMenuCard'
        );


    if (historicoCard) {

        const usuariosPermitidos = [
            'ronald',
            'andressamiotto'
        ];


        historicoCard.style.display =
            usuariosPermitidos.includes(username)
                ? 'block'
                : 'none';
    }


    // ========================================================
    // META RONALD
    // SOMENTE ANDRESSAMIOTTO
    // ========================================================

    const metaRonaldMenuCard =
        document.getElementById(
            'metaRonaldMenuCard'
        );


    if (metaRonaldMenuCard) {

        if (
            username ===
            'andressamiotto'
        ) {

            metaRonaldMenuCard.style.display =
                'block';


            console.log(
                '✅ Card Meta Ronald liberado para Andressa'
            );

        } else {

            metaRonaldMenuCard.style.display =
                'none';
        }

    } else {

        console.warn(
            '⚠️ #metaRonaldMenuCard não encontrado no HTML'
        );
    }


    // ========================================================
    // BOTÃO DENTRO DA ABA DE OS
    // CASO TENHA MANTIDO
    // ========================================================

    const btnMetaRonald =
        document.getElementById(
            'btnMetaRonald'
        );


    if (btnMetaRonald) {

        btnMetaRonald.style.display =
            username === 'andressamiotto'
                ? 'inline-block'
                : 'none';
    }
}

function cancelEdit() {
    editingOrderId = null;
    if (formTitle) formTitle.textContent = 'Nova Ordem de Serviço';
    if (submitBtnText) submitBtnText.textContent = 'Salvar OS';
    if (cancelEditBtn) cancelEditBtn.classList.add('hidden');
    clearForm();
    showToast('❌ Edição cancelada', 'info');
}

function generateOSCode() {
    const timestamp = Date.now().toString().slice(-4);
    const code = `OS${orderCounter.toString().padStart(4, '0')}-${timestamp}`;
    if (osCodeDisplay) osCodeDisplay.textContent = `Código: ${code}`;
    return code;
}

function filterOrdersByUser(ordersList) {
    if (!currentUser) {
        return [];
    }

    const filtroAtual =
        currentFilter ||
        'pendente';

    let listaFiltrada =
        [...ordersList];

    // Esconde as OS de atualização de fotos nos demais filtros
    if (
        filtroAtual !==
        'fotos_atualizar'
    ) {
        listaFiltrada =
            listaFiltrada.filter(
                order =>
                    order.photoType !==
                    'fotos_para_atualizar'
            );
    }

    // Administrador visualiza todas
    if (
        currentUser.role ===
        'Administrador'
    ) {
        return listaFiltrada;
    }

    const username =
        getUsernameAtualOS();

    return listaFiltrada.filter(
        order => {
            const nomeUsuario =
                String(
                    currentUser.name ||
                    ''
                ).toLowerCase();

            const responsavel =
                String(
                    order.responsibleName ||
                    ''
                ).toLowerCase();

            const criador =
                String(
                    order.createdBy ||
                    ''
                ).toLowerCase();

            const isResponsible =
                nomeUsuario &&
                responsavel.includes(
                    nomeUsuario
                );

            const isCreator =
                nomeUsuario &&
                criador.includes(
                    nomeUsuario
                );

            // Letícia visualiza todas as devoluções
            const isDevolucaoLeticia =
                username === 'leticia' &&
                ehOSDevolucao(order);

            return (
                isResponsible ||
                isCreator ||
                isDevolucaoLeticia
            );
        }
    );
}

// ============================================
// PERMISSÕES DE CONFERÊNCIA DE OS
// ============================================
function getUsernameAtualOS() {
    return String(
        currentUser?.username ||
        currentUser?.login ||
        currentUser?.name ||
        ''
    )
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase();
}

function ehOSDevolucao(order) {
    return String(
        order?.osType ||
        order?.tipo_os ||
        ''
    )
        .trim()
        .toLowerCase() === 'devolucao';
}

function podeUsuarioConferirOS(order) {
    const username = getUsernameAtualOS();

    // Ronald pode conferir qualquer OS e possui meta
    if (username === 'ronald') {
        return true;
    }

    // Letícia pode conferir somente devoluções e não possui meta
    if (
        username === 'leticia' &&
        ehOSDevolucao(order)
    ) {
        return true;
    }

    return false;
}

function podeUsuarioNaoAutorizarOS(order) {
    const username = getUsernameAtualOS();

    // Ronald e Letícia podem não autorizar OS concluídas
    // que ainda não foram conferidas.
    return (
        (
            username === 'ronald' ||
            username === 'leticia'
        ) &&
        order?.status === 'concluida' &&
        !order?.conferido
    );
}

function checkOrderPermission(order) {
    if (!currentUser) return false;
    
    /// Administrador tem permissão para TUDO
    if (currentUser.role === 'Administrador') { // ALTERADO AQUI
        return true;
    }
    
    // Outros usuários só têm permissão se forem responsáveis ou criadores
    const isResponsible = order.responsibleName?.toLowerCase().includes(currentUser.name.toLowerCase());
    const isCreator = order.createdBy?.toLowerCase().includes(currentUser.name.toLowerCase());
    return isResponsible || isCreator;
}

function updateCounters() {
    if (!currentUser) return;

    // 🔥 CORREÇÃO: Pegamos TODAS as OS do usuário (incluindo as de "Atualizar Fotos")
    const userOrders = filterOrdersByUser(orders);
    
    // 🔥 SEPARAMOS as OS que são do tipo "fotos_para_atualizar"
    const fotosAtualizar = userOrders.filter(o => o.photoType === 'fotos_para_atualizar');
    
    // 🔥 OS DEMAIS filtros EXCLUEM as "fotos_para_atualizar"
    const demaisOrders = userOrders.filter(o => o.photoType !== 'fotos_para_atualizar');

    // Contadores para os filtros normais (excluindo "Atualizar Fotos")
    const pending = demaisOrders.filter(o => o.status === 'pendente' && (!o.motivo_rejeicao || o.motivo_rejeicao === '')).length;
    const progress = demaisOrders.filter(o => o.status === 'andamento').length;
    const notChecked = demaisOrders.filter(o => o.status === 'concluida' && !o.conferido).length;
    const revision = demaisOrders.filter(o => o.status === 'pendente' && o.motivo_rejeicao && o.motivo_rejeicao !== '').length;
    const completed = demaisOrders.filter(o => o.status === 'concluida' && o.conferido === true).length;
    const total = demaisOrders.length;

    // 🔥 Contador para "Atualizar Fotos" (TODAS as OS desse tipo, independente do status)
    const fotosAtualizarCount = fotosAtualizar.length;

    // Atualiza os elementos HTML
    const setText = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    };
    setText('countPending', pending);
    setText('countProgress', progress);
    setText('countNotChecked', notChecked);
    setText('countRevision', revision);
    setText('countCompleted', completed);
    setText('countTotal', total);
    setText('countFotosAtualizar', fotosAtualizarCount); // 🔥 Sempre mostra o total de "Atualizar Fotos"

    // Atualiza contadores do usuário
    if (myOrdersCount) {
        if (currentUser.role === 'Administrador') {
            myOrdersCount.textContent = `${total} (todas)`;
        } else {
            myOrdersCount.textContent = total;
        }
    }
    if (totalOrdersCount) totalOrdersCount.textContent = orders.length;

    // Mensagem de vazio
    if (emptyMessage) {
        const tableResponsive = document.querySelector('.table-responsive');
        const totalExibido = currentFilter === 'fotos_atualizar' ? fotosAtualizarCount : total;
        if (totalExibido === 0) {
            emptyMessage.classList.remove('hidden');
            if (tableResponsive) tableResponsive.classList.add('hidden');
            emptyMessage.innerHTML = `
                <i class="fas fa-user-lock fa-3x mb-3" style="color: #6c757d; opacity: 0.5;"></i>
                <h4 style="color: #6c757d;">Nenhuma ordem no sistema</h4>
                <p style="color: #6c757d;">Não há ordens de serviço cadastradas no momento.</p>
                ${currentUser.role === 'Administrador' ? '<p style="color: #6c757d; font-size: 12px; margin-top: 10px;"><i class="fas fa-info-circle"></i> Como administrador, você vê todas as ordens do sistema.</p>' : ''}
            `;
        } else {
            emptyMessage.classList.add('hidden');
            if (tableResponsive) tableResponsive.classList.remove('hidden');
        }
    }

    updateOSNotificationBell();
}

// Mostra/oculta o campo de data quando o filtro concluída é ativado
function toggleFiltroDataConcluidas(show) {
    const div = document.getElementById('filtroDataConcluidas');
    if (div) {
        if (show) {
            div.classList.remove('hidden');
            div.style.display = 'inline-flex';
        } else {
            div.classList.add('hidden');
            div.style.display = 'none';
        }
    }
}

// Aplica o filtro de data (chamado pelo botão)
function aplicarFiltroDataConcluidas() {
    if (currentFilter === 'concluida') {
        renderOrdersTable();
    } else {
        // Se não estiver no filtro concluída, muda para ele
        filterOS('concluida');
    }
}

// Limpa o campo de data e re-renderiza
function limparFiltroDataConcluidas() {
    const input = document.getElementById('dataFiltroConcluidas');
    if (input) input.value = '';
    if (currentFilter === 'concluida') {
        renderOrdersTable();
    }
}

// ===== MARCAR ALTERAÇÕES FEITAS =====
window.marcarAlteracoesFeitas = async function(orderId) {
    if (!confirm('Confirmar que as alterações solicitadas foram realizadas? A OS será enviada para "Não conferidas" e o criador será notificado.')) {
        return;
    }

    const order = orders.find(o => o.id == orderId);
    if (!order) {
        showToast('Ordem não encontrada', 'error');
        return;
    }

    try {
        // Atualizar no Supabase
        if (supabaseClient) {
            const { error } = await supabaseClient
                .from('ordens_service')
                .update({
                    status: 'concluida',
                    conferido: false,
                    conferido_por: null,
                    data_conferencia: null,
                    ultima_atualizacao: new Date().toISOString()
                })
                .eq('id', orderId);
            if (error) throw error;
        }

        // Atualizar localmente
        const idx = orders.findIndex(o => o.id == orderId);
        if (idx !== -1) {
            orders[idx].status = 'concluida';
            orders[idx].conferido = false;
            orders[idx].conferidoPor = null;
            orders[idx].dataConferencia = null;
            orders[idx].updatedAt = new Date().toISOString();
        }

        // Notificar o criador
        const criador = order.createdBy;
        if (criador && criador !== currentUser.name) {
            const assunto = `🔄 Alterações realizadas na OS ${order.code}`;
            const mensagem = `
                Olá ${criador},
                
                A OS ${order.code} - ${order.productName} foi atualizada após a não autorização.
                
                O responsável realizou as alterações solicitadas e a OS está novamente disponível para conferência.
                
                Motivo anterior: ${order.motivo_rejeicao || 'Não informado'}
                
                Acesse o sistema para conferir.
                
                Sistema Wheel Tech
            `;
            await enviarNotificacaoEmail(criador, assunto, mensagem);
        }

        showToast('✅ OS enviada para "Não conferidas" e criador notificado!', 'success');
        updateCounters();
        renderOrdersTable();

    } catch (error) {
        console.error('❌ Erro ao marcar alterações feitas:', error);
        showToast('❌ Erro: ' + error.message, 'error');
    }
};

// ===== FUNÇÃO PARA MUDAR ITENS POR PÁGINA =====
function mudarItensPorPaginaOS() {
    const select = document.getElementById('itensPorPaginaOS');
    if (select) {
        itensPorPaginaOS = parseInt(select.value) || 20;
        paginaAtualOS = 1;
        renderOrdersTable();
    }
}

// ===== FUNÇÃO PARA PAGINAR =====
function paginarOS(direcao) {
    console.log('🔄 Paginando:', direcao, 'Página atual:', paginaAtualOS);
    
    const totalPaginas = Math.max(1, Math.ceil(todasOSFiltradas.length / itensPorPaginaOS));
    
    if (direcao === 'anterior' && paginaAtualOS > 1) {
        paginaAtualOS--;
        renderOrdersTable();
    } else if (direcao === 'proxima' && paginaAtualOS < totalPaginas) {
        paginaAtualOS++;
        renderOrdersTable();
    }
}

// ============================================
// CONTROLE DE TEMPO ÚTIL DAS ORDENS DE SERVIÇO
// HORÁRIO COMERCIAL: SEGUNDA A SEXTA - 07:00 ÀS 16:00
// ============================================

const OS_HORA_INICIO = 7;
const OS_HORA_FIM = 16;

let intervaloRelogioOS = null;


// ============================================
// VERIFICA SE É DIA ÚTIL
// ============================================
function ehDiaUtilOS(data) {
    const dia = data.getDay();

    // 0 = domingo
    // 6 = sábado
    return dia >= 1 && dia <= 5;
}


// ============================================
// VERIFICA SE ESTÁ DENTRO DO HORÁRIO COMERCIAL
// ============================================
function estaNoHorarioComercialOS(data = new Date()) {

    const d = new Date(data);

    if (isNaN(d.getTime())) {
        return false;
    }

    if (!ehDiaUtilOS(d)) {
        return false;
    }

    const inicio = new Date(d);
    inicio.setHours(OS_HORA_INICIO, 0, 0, 0);

    const fim = new Date(d);
    fim.setHours(OS_HORA_FIM, 0, 0, 0);

    return d >= inicio && d < fim;
}


// ============================================
// AJUSTA UMA DATA PARA O PRÓXIMO MOMENTO ÚTIL
// ============================================
function ajustarParaHorarioUtilOS(data) {

    let resultado = new Date(data);

    if (isNaN(resultado.getTime())) {
        return null;
    }

    let seguranca = 0;

    while (seguranca < 20) {

        seguranca++;

        const diaSemana = resultado.getDay();

        // DOMINGO
        if (diaSemana === 0) {

            resultado.setDate(resultado.getDate() + 1);
            resultado.setHours(OS_HORA_INICIO, 0, 0, 0);

            continue;
        }

        // SÁBADO
        if (diaSemana === 6) {

            resultado.setDate(resultado.getDate() + 2);
            resultado.setHours(OS_HORA_INICIO, 0, 0, 0);

            continue;
        }

        const inicioDia = new Date(resultado);
        inicioDia.setHours(OS_HORA_INICIO, 0, 0, 0);

        const fimDia = new Date(resultado);
        fimDia.setHours(OS_HORA_FIM, 0, 0, 0);


        // Antes das 07h
        if (resultado < inicioDia) {

            resultado = inicioDia;

            return resultado;
        }


        // Depois das 16h
        if (resultado >= fimDia) {

            resultado.setDate(resultado.getDate() + 1);
            resultado.setHours(OS_HORA_INICIO, 0, 0, 0);

            continue;
        }


        // Já está dentro do horário comercial
        return resultado;
    }

    return resultado;
}


// ============================================
// CALCULA MINUTOS ÚTEIS ENTRE DUAS DATAS
// ============================================
function calcularMinutosUteisOS(dataInicio, dataFim) {

    if (!dataInicio || !dataFim) {
        return 0;
    }

    const inicioOriginal = new Date(dataInicio);
    const fimOriginal = new Date(dataFim);

    if (
        isNaN(inicioOriginal.getTime()) ||
        isNaN(fimOriginal.getTime())
    ) {
        return 0;
    }

    if (fimOriginal <= inicioOriginal) {
        return 0;
    }


    let cursor = ajustarParaHorarioUtilOS(inicioOriginal);

    if (!cursor) {
        return 0;
    }


    let minutosTotais = 0;

    let seguranca = 0;


    while (
        cursor < fimOriginal &&
        seguranca < 5000
    ) {

        seguranca++;


        // Caso por algum motivo caia em fim de semana
        if (!ehDiaUtilOS(cursor)) {

            cursor = ajustarParaHorarioUtilOS(cursor);

            continue;
        }


        const fimExpediente = new Date(cursor);

        fimExpediente.setHours(
            OS_HORA_FIM,
            0,
            0,
            0
        );


        const limiteHoje =
            fimOriginal < fimExpediente
                ? fimOriginal
                : fimExpediente;


        if (limiteHoje > cursor) {

            minutosTotais +=
                (limiteHoje - cursor) /
                (1000 * 60);
        }


        // Já chegamos ao fim informado
        if (fimOriginal <= fimExpediente) {
            break;
        }


        // Avança para o próximo dia
        cursor.setDate(cursor.getDate() + 1);

        cursor.setHours(
            OS_HORA_INICIO,
            0,
            0,
            0
        );


        cursor = ajustarParaHorarioUtilOS(cursor);

        if (!cursor) {
            break;
        }
    }


    return Math.max(
        0,
        Math.round(minutosTotais)
    );
}


// ============================================
// ADICIONA MINUTOS ÚTEIS A UMA DATA
// USADO PARA PRAZO DA OS
// ============================================
function adicionarMinutosUteisOS(dataInicio, minutosAdicionar) {

    let minutosRestantes =
        Math.max(
            0,
            Number(minutosAdicionar) || 0
        );


    let cursor =
        ajustarParaHorarioUtilOS(
            new Date(dataInicio)
        );


    if (!cursor) {
        return null;
    }


    if (minutosRestantes === 0) {
        return cursor;
    }


    let seguranca = 0;


    while (
        minutosRestantes > 0 &&
        seguranca < 5000
    ) {

        seguranca++;


        cursor =
            ajustarParaHorarioUtilOS(
                cursor
            );


        const fimExpediente =
            new Date(cursor);


        fimExpediente.setHours(
            OS_HORA_FIM,
            0,
            0,
            0
        );


        const minutosDisponiveisHoje =
            Math.max(
                0,
                Math.floor(
                    (fimExpediente - cursor) /
                    (1000 * 60)
                )
            );


        if (
            minutosRestantes <=
            minutosDisponiveisHoje
        ) {

            cursor.setMinutes(
                cursor.getMinutes() +
                minutosRestantes
            );

            minutosRestantes = 0;

            break;
        }


        minutosRestantes -=
            minutosDisponiveisHoje;


        cursor.setDate(
            cursor.getDate() + 1
        );


        cursor.setHours(
            OS_HORA_INICIO,
            0,
            0,
            0
        );
    }


    return cursor;
}


// ============================================
// FORMATA MINUTOS EM TEXTO
// ============================================
function formatarDuracaoOS(minutos) {

    minutos =
        Math.max(
            0,
            Math.round(
                Number(minutos) || 0
            )
        );


    if (minutos < 60) {
        return `${minutos} min`;
    }


    const horas =
        Math.floor(minutos / 60);


    const minutosRestantes =
        minutos % 60;


    if (minutosRestantes === 0) {
        return `${horas}h`;
    }


    return `${horas}h ${minutosRestantes}min`;
}


// ============================================
// INÍCIO REAL DE EXECUÇÃO DA OS
// ============================================
function obterInicioExecucaoOS(order) {

    if (!order) {
        return null;
    }


    // NOVAS OS
    if (order.startedAt) {
        return order.startedAt;
    }


    // Compatibilidade caso outro código utilize esse nome
    if (order.dataInicio) {
        return order.dataInicio;
    }


    // OS antigas
    return order.createdAt || null;
}


// ============================================
// QUANTIDADE DE FOTOS UTILIZADA PARA MÉDIA
//
// Usamos o MAIOR valor entre:
// - fotos tiradas
// - fotos editadas
//
// Isso evita contar a mesma foto duas vezes.
// ============================================
function obterQuantidadeFotosBaseOS(order) {

    const tiradas =
        Number(order?.photosTaken) || 0;


    const editadas =
        Number(order?.editsMade) || 0;


    return Math.max(
        tiradas,
        editadas
    );
}


// ============================================
// CALCULA O TEMPO DA OS
// ============================================
function calcularTempoExecucaoOS(
    order,
    dataReferencia = new Date()
) {

    if (!order) {
        return 0;
    }


    const inicio =
        obterInicioExecucaoOS(order);


    if (!inicio) {
        return 0;
    }


    let fim = null;


    if (
        order.status === 'concluida' &&
        order.completionDate
    ) {

        fim =
            new Date(
                order.completionDate
            );

    } else if (
        order.status === 'andamento'
    ) {

        fim =
            new Date(
                dataReferencia
            );

    } else {

        return 0;
    }


    return calcularMinutosUteisOS(
        inicio,
        fim
    );
}


// ============================================
// MÉDIA DE TEMPO POR FOTO
// ============================================
function calcularMediaTempoPorFotoOS(
    order,
    minutosExecucao = null
) {

    const qtdFotos =
        obterQuantidadeFotosBaseOS(order);


    if (qtdFotos <= 0) {
        return null;
    }


    const minutos =
        minutosExecucao !== null
            ? minutosExecucao
            : calcularTempoExecucaoOS(order);


    const media =
        minutos / qtdFotos;


    return media;
}


// ============================================
// FORMATA MÉDIA POR FOTO
// ============================================
function formatarMediaFotoOS(
    order,
    minutosExecucao = null
) {

    const media =
        calcularMediaTempoPorFotoOS(
            order,
            minutosExecucao
        );


    if (
        media === null ||
        !isFinite(media)
    ) {

        return '-';
    }


    return `${formatarDuracaoOS(media)} / foto`;
}


// ============================================
// HTML DO TEMPO NA TABELA
// ============================================
function montarTempoExecucaoHTML(
    order,
    agora = new Date()
) {

    if (
        !order ||
        order.status === 'pendente'
    ) {

        return `
            <span style="color:#adb5bd;">
                -
            </span>
        `;
    }


    const minutos =
        calcularTempoExecucaoOS(
            order,
            agora
        );


    if (order.status === 'concluida') {

        return `
            <strong>
                ${formatarDuracaoOS(minutos)}
            </strong>

            <div style="
                font-size:10px;
                color:#28a745;
            ">
                <i class="fas fa-check"></i>
                Finalizado
            </div>
        `;
    }


    const emHorario =
        estaNoHorarioComercialOS(agora);


    if (emHorario) {

        return `
            <strong>
                ${formatarDuracaoOS(minutos)}
            </strong>

            <div style="
                font-size:10px;
                color:#28a745;
            ">
                <i class="fas fa-play"></i>
                contando
            </div>
        `;

    }


    return `
        <strong>
            ${formatarDuracaoOS(minutos)}
        </strong>

        <div style="
            font-size:10px;
            color:#ff9800;
        ">
            <i class="fas fa-pause"></i>
            pausado
        </div>
    `;
}


// ============================================
// ATUALIZA APENAS OS RELÓGIOS DA TABELA
// ============================================
function atualizarRelogiosOSTabela() {

    const agora =
        new Date();


    document
        .querySelectorAll('[data-os-tempo-id]')
        .forEach(elemento => {

            const orderId =
                elemento.getAttribute(
                    'data-os-tempo-id'
                );


            const order =
                orders.find(
                    o =>
                        String(o.id) ===
                        String(orderId)
                );


            if (!order) {
                return;
            }


            elemento.innerHTML =
                montarTempoExecucaoHTML(
                    order,
                    agora
                );

        });
}


// ============================================
// RELÓGIO AUTOMÁTICO
// ============================================
function iniciarRelogioOSTabela() {

    if (intervaloRelogioOS) {
        clearInterval(
            intervaloRelogioOS
        );
    }


    atualizarRelogiosOSTabela();


    intervaloRelogioOS =
        setInterval(() => {

            atualizarRelogiosOSTabela();

        }, 60000);
}


// ============================================
// BUSCA DE OS
// ============================================
function filtrarBuscaOS() {

    paginaAtualOS = 1;


    const input =
        document.getElementById(
            'buscaOS'
        );


    const btnLimpar =
        document.getElementById(
            'btnLimparBuscaOS'
        );


    if (btnLimpar) {

        btnLimpar.style.display =
            input &&
            input.value.trim()
                ? 'block'
                : 'none';
    }


    renderOrdersTable();
}


// ============================================
// LIMPAR PESQUISA
// ============================================
function limparBuscaOS() {

    const input =
        document.getElementById(
            'buscaOS'
        );


    if (input) {

        input.value = '';

        input.focus();
    }


    const btn =
        document.getElementById(
            'btnLimparBuscaOS'
        );


    if (btn) {
        btn.style.display = 'none';
    }


    paginaAtualOS = 1;

    renderOrdersTable();
}


// ============================================
// INICIAR ATUALIZAÇÃO AUTOMÁTICA
// ============================================
document.addEventListener(
    'DOMContentLoaded',
    function () {

        iniciarRelogioOSTabela();

    }
);

// ============================================
// RENDERIZAR TABELA DE OS
// COM PAGINAÇÃO + BUSCA + TEMPO ÚTIL
// ============================================
function renderOrdersTable() {

    console.log(
        '📊 Renderizando tabela OS - Página:',
        paginaAtualOS
    );


    if (!osTableBody) {
        return;
    }


    osTableBody.innerHTML = '';


    if (!currentUser) {

        if (emptyMessage) {
            emptyMessage.classList.remove(
                'hidden'
            );
        }

        return;
    }


    // ========================================
    // FILTRO DE USUÁRIO
    // ========================================

    let userOrders =
        filterOrdersByUser(
            orders
        );


    let filteredOrders = [];


    // ========================================
    // FILTRO DE STATUS
    // ========================================

    switch (currentFilter) {

        case 'todos':

            filteredOrders =
                [...userOrders];

            break;


        case 'pendente':

            filteredOrders =
                userOrders.filter(
                    o =>
                        o.status === 'pendente' &&
                        (
                            !o.motivo_rejeicao ||
                            o.motivo_rejeicao === ''
                        )
                );

            break;


        case 'andamento':

            filteredOrders =
                userOrders.filter(
                    o =>
                        o.status === 'andamento'
                );

            break;


        case 'nao_conferidas':

            filteredOrders =
                userOrders.filter(
                    o =>
                        o.status === 'concluida' &&
                        !o.conferido
                );

            break;


        case 'revisao':

            filteredOrders =
                userOrders.filter(
                    o =>
                        o.status === 'pendente' &&
                        o.motivo_rejeicao &&
                        o.motivo_rejeicao !== ''
                );

            break;


        case 'concluida': {

            let base =
                userOrders.filter(
                    o =>
                        o.status === 'concluida' &&
                        o.conferido === true
                );


            const dataInput =
                document.getElementById(
                    'dataFiltroConcluidas'
                );


            if (
                dataInput &&
                dataInput.value
            ) {

                const dataSelecionada =
                    new Date(
                        dataInput.value +
                        'T00:00:00'
                    );


                base =
                    base.filter(
                        o => {

                            if (
                                !o.completionDate
                            ) {
                                return false;
                            }


                            const compDate =
                                new Date(
                                    o.completionDate
                                );


                            return (
                                compDate.getFullYear() ===
                                    dataSelecionada.getFullYear() &&

                                compDate.getMonth() ===
                                    dataSelecionada.getMonth() &&

                                compDate.getDate() ===
                                    dataSelecionada.getDate()
                            );
                        }
                    );
            }


            filteredOrders =
                base;

            break;
        }


        case 'fotos_atualizar':

            filteredOrders =
                userOrders.filter(
                    o =>
                        o.photoType ===
                        'fotos_para_atualizar'
                );

            break;


        default:

            filteredOrders =
                [...userOrders];

            break;
    }


    // ========================================
// PESQUISA
// PESQUISA DENTRO DO FILTRO ATIVO
// ========================================

const campoBusca =
    document.getElementById(
        'buscaOS'
    );

/*
 * Remove acentos e transforma tudo em minúsculo.
 *
 * Assim, "Foto Estúdio" e "foto estudio"
 * produzem o mesmo resultado.
 */
const normalizarTextoBuscaOS =
    valor =>
        String(valor || '')
            .normalize('NFD')
            .replace(
                /[\u0300-\u036f]/g,
                ''
            )
            .trim()
            .toLowerCase();

const termoBusca =
    normalizarTextoBuscaOS(
        campoBusca?.value
    );

if (termoBusca) {
    /*
     * filteredOrders já contém somente as OS pertencentes
     * ao filtro ativo. Portanto, a pesquisa abaixo acontece
     * dentro de Pendentes, Em Andamento, Não Conferidas,
     * Revisão, Concluídas ou Todas, conforme o filtro aberto.
     */
    filteredOrders =
        filteredOrders.filter(
            order => {
                const skusTexto =
                    Array.isArray(
                        order.skus
                    )
                        ? order.skus.join(
                            ' '
                        )
                        : (
                            order.skus ||
                            ''
                        );

                /*
                 * order.photoType normalmente guarda valores
                 * como "estudio", "bike" e "edicao".
                 *
                 * PHOTO_TYPE_MAP converte para o nome exibido:
                 * "Foto Estúdio", "Foto Bike", "Apenas edição" etc.
                 */
                const codigoServico =
                    order.photoType ||
                    '';

                const nomeServico =
                    PHOTO_TYPE_MAP[
                        codigoServico
                    ] ||
                    codigoServico;

                const campos =
                    [
                        order.code,
                        order.id,
                        order.productName,
                        order.responsibleName,
                        order.createdBy,
                        order.status,
                        order.urgency,
                        order.osType,

                        // Código salvo no banco: "estudio"
                        codigoServico,

                        // Nome exibido: "Foto Estúdio"
                        nomeServico,

                        order.observations,
                        skusTexto,
                        order.linkAnuncio,
                        order.linkNovoAnuncio,
                        order.motivo_rejeicao,
                        order.rejeitado_por
                    ];

                return campos.some(
                    valor =>
                        normalizarTextoBuscaOS(
                            valor
                        ).includes(
                            termoBusca
                        )
                );
            }
        );
}


    // ========================================
    // ORDENAÇÃO
    // ========================================

    filteredOrders.sort(
        (a, b) => {

            const aIsNotChecked =
                (
                    a.status ===
                    'concluida' &&
                    !a.conferido
                );


            const bIsNotChecked =
                (
                    b.status ===
                    'concluida' &&
                    !b.conferido
                );


            if (
                aIsNotChecked &&
                !bIsNotChecked
            ) {
                return -1;
            }


            if (
                !aIsNotChecked &&
                bIsNotChecked
            ) {
                return 1;
            }


            const aIsRevision =
                (
                    a.status ===
                    'pendente' &&
                    a.motivo_rejeicao
                );


            const bIsRevision =
                (
                    b.status ===
                    'pendente' &&
                    b.motivo_rejeicao
                );


            if (
                aIsRevision &&
                !bIsRevision
            ) {
                return -1;
            }


            if (
                !aIsRevision &&
                bIsRevision
            ) {
                return 1;
            }


            return (
                new Date(
                    b.updatedAt ||
                    b.createdAt
                ) -
                new Date(
                    a.updatedAt ||
                    a.createdAt
                )
            );
        }
    );


    todasOSFiltradas =
        filteredOrders;


    // ========================================
    // PAGINAÇÃO
    // ========================================

    const totalItens =
        filteredOrders.length;


    const totalPaginas =
        Math.max(
            1,
            Math.ceil(
                totalItens /
                itensPorPaginaOS
            )
        );


    if (
        paginaAtualOS >
        totalPaginas
    ) {

        paginaAtualOS =
            totalPaginas;
    }


    if (
        paginaAtualOS < 1
    ) {

        paginaAtualOS = 1;
    }


    const inicio =
        (
            paginaAtualOS - 1
        ) *
        itensPorPaginaOS;


    const fim =
        Math.min(
            inicio +
            itensPorPaginaOS,

            totalItens
        );


    const paginaItens =
        filteredOrders.slice(
            inicio,
            fim
        );


    // ========================================
    // INFORMAÇÕES DA PAGINAÇÃO
    // ========================================

    const infoEl =
        document.getElementById(
            'osInfo'
        );


    if (infoEl) {

        if (totalItens === 0) {

            infoEl.textContent =
                termoBusca
                    ? 'Nenhuma OS encontrada na pesquisa'
                    : 'Nenhum registro encontrado';

        } else {

            infoEl.textContent =
                `Mostrando ${inicio + 1}-${fim} de ${totalItens}`;
        }
    }


    const paginaInfoEl =
        document.getElementById(
            'osPaginaInfo'
        );


    if (paginaInfoEl) {

        paginaInfoEl.textContent =
            `Página ${paginaAtualOS} de ${totalPaginas}`;
    }


    const btnAnterior =
        document.getElementById(
            'btnOSAnterior'
        );


    const btnProxima =
        document.getElementById(
            'btnOSProxima'
        );


    if (btnAnterior) {

        btnAnterior.disabled =
            (
                paginaAtualOS <= 1 ||
                totalItens === 0
            );
    }


    if (btnProxima) {

        btnProxima.disabled =
            (
                paginaAtualOS >=
                    totalPaginas ||

                totalItens === 0
            );
    }


    // ========================================
    // SEM RESULTADOS
    // ========================================

    if (
        paginaItens.length === 0
    ) {

        osTableBody.innerHTML = `
            <tr>
                <td
                    colspan="9"
                    class="text-center"
                    style="padding:40px;"
                >
                    <i
                        class="fas fa-search fa-3x"
                        style="
                            color:#6c757d;
                            opacity:0.4;
                            margin-bottom:15px;
                        "
                    ></i>

                    <h4 style="color:#6c757d;">
                        ${
                            termoBusca
                                ? 'Nenhuma OS encontrada'
                                : 'Nenhuma ordem disponível'
                        }
                    </h4>

                    ${
                        termoBusca
                            ? `
                                <p style="color:#adb5bd;">
                                    Pesquisa:
                                    <strong>${escapeHtml(termoBusca)}</strong>
                                </p>
                            `
                            : ''
                    }
                </td>
            </tr>
        `;

        return;
    }


    const agora =
        new Date();


    // ========================================
    // RENDERIZAÇÃO
    // ========================================

    paginaItens.forEach(
        order => {

            const row =
                document.createElement(
                    'tr'
                );


            const hasPermission =
                checkOrderPermission(
                    order
                );


            const isAdmin =
                currentUser.role ===
                'Administrador';


            const isRejectedPending =
                (
                    order.status ===
                    'pendente' &&

                    order.motivo_rejeicao &&

                    order.motivo_rejeicao
                        .trim() !== ''
                );


            const isNotChecked =
                (
                    order.status ===
                    'concluida' &&
                    !order.conferido
                );


            // =================================
            // PRAZO
            // =================================

            let atrasado =
                false;


            if (
                order.status !==
                'concluida'
            ) {

                let prazoCalculado =
                    null;


                // Recalcula usando 07h-16h
                if (
                    order.createdAt &&
                    order.prazo_horas
                ) {

                    prazoCalculado =
                        calcularPrazoPorPrioridade(
                            new Date(
                                order.createdAt
                            ),
                            null,
                            Number(
                                order.prazo_horas
                            )
                        );

                } else if (
                    order.prazo_esperado
                ) {

                    prazoCalculado =
                        new Date(
                            order.prazo_esperado
                        );
                }


                if (
                    prazoCalculado &&
                    prazoCalculado <
                        agora
                ) {

                    atrasado = true;
                }
            }


            // =================================
            // COR DA LINHA
            // =================================

            if (isRejectedPending) {

                row.style.backgroundColor =
                    '#fff3cd';

                row.style.borderLeft =
                    '4px solid #ffc107';


            } else if (isNotChecked) {

                row.style.backgroundColor =
                    '#fff5f5';

                row.style.borderLeft =
                    '4px solid #dc3545';


            } else if (
                order.urgency === 'alta'
            ) {

                row.style.backgroundColor =
                    '#ffe5e5';
            }


            // =================================
            // LINKS
            // =================================

            let linksHtml = '';


            if (
                order.linkAnuncio &&
                order.linkAnuncio.trim()
            ) {

                linksHtml += `
                    <a
                        href="${order.linkAnuncio}"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="link-anuncio"
                        title="Link do anúncio"
                    >
                        <i
                            class="fas fa-link"
                            style="color:#00ADEE;"
                        ></i>

                        Anúncio
                    </a>
                `;
            }


            if (
                order.linkNovoAnuncio &&
                order.linkNovoAnuncio.trim()
            ) {

                linksHtml += `
                    <a
                        href="${order.linkNovoAnuncio}"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="link-anuncio"
                        title="Novo anúncio"
                    >
                        <i
                            class="fas fa-link"
                            style="color:#28a745;"
                        ></i>

                        Novo
                    </a>
                `;
            }


            if (!linksHtml) {

                linksHtml = `
                    <span
                        style="
                            color:#adb5bd;
                            font-size:11px;
                        "
                    >
                        Sem link
                    </span>
                `;
            }


            // =================================
            // BADGES
            // =================================

            let conferenciaBadge = '';


            if (
                order.status ===
                'concluida'
            ) {

                if (order.conferido) {

                    conferenciaBadge = `
                        <span class="badge badge-success">
                            <i class="fas fa-check-double"></i>
                            Conferido
                        </span>
                    `;

                } else {

                    conferenciaBadge = `
                        <span class="badge badge-warning">
                            <i class="fas fa-exclamation-circle"></i>
                            Aguardando conferência
                        </span>
                    `;
                }
            }


            let ajusteBadge = '';


            if (isRejectedPending) {

                ajusteBadge = `
                    <span
                        class="badge badge-warning"
                        style="
                            background:#ffc107;
                            color:#856404;
                        "
                    >
                        Ajustes
                    </span>

                    <span class="badge badge-danger">
                        Não autorizado
                    </span>
                `;
            }


            const atrasoBadge =
                atrasado
                    ? `
                        <span class="badge badge-danger">
                            <i class="fas fa-clock"></i>
                            Atrasada
                        </span>
                    `
                    : '';


            let anuncioBadge = '';


            const isAnuncio =
                (
                    order.photoType ===
                        'criar_anuncio' ||

                    order.photoType ===
                        'replicar_anuncio'
                );


            if (
                isAnuncio &&
                !order.anuncio_criado
            ) {

                anuncioBadge = `
                    <span
                        class="badge badge-warning"
                        style="
                            background:#ff9800;
                            color:white;
                        "
                    >
                        <i class="fas fa-ad"></i>
                        Aguardando anúncio
                    </span>
                `;
            }


            const permissionBadge =
                isAdmin
                    ? `
                        <span class="badge badge-danger">
                            <i class="fas fa-crown"></i>
                            Admin
                        </span>
                    `
                    : '';


            let urgencyBadge = '';


            if (
                order.urgency ===
                'alta'
            ) {

                urgencyBadge =
                    '<span class="badge badge-danger">Alta (2h)</span>';


            } else if (
                order.urgency ===
                'normal'
            ) {

                urgencyBadge =
                    '<span class="badge badge-warning">Normal (48h)</span>';


            } else {

                urgencyBadge =
                    '<span class="badge badge-success">Baixa (36h)</span>';
            }


            let statusBadge = '';


            if (
                order.status ===
                'pendente'
            ) {

                statusBadge =
                    '<span class="badge badge-secondary">Pendente</span>';


            } else if (
                order.status ===
                'andamento'
            ) {

                statusBadge =
                    '<span class="badge badge-info">Em Andamento</span>';


            } else {

                statusBadge =
                    '<span class="badge badge-success">Concluída</span>';
            }


            // =================================
            // DATA
            // =================================

            const createdDate =
                order.createdAt
                    ? new Date(
                        order.createdAt
                    )
                    : null;


            const formattedDate =
                createdDate &&
                !isNaN(
                    createdDate.getTime()
                )
                    ? createdDate
                        .toLocaleString(
                            'pt-BR',
                            {
                                day: '2-digit',
                                month: '2-digit',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                            }
                        )
                    : '-';


            // =================================
            // AÇÕES
            // =================================

            let actionButtons = '';


            if (
                hasPermission ||
                isAdmin
            ) {

                actionButtons += `
                    <button
                        class="btn btn-primary btn-sm"
                        onclick="viewOrderDetails('${order.id}')"
                        title="Visualizar OS"
                    >
                        <i class="fas fa-eye"></i>
                    </button>
                `;
            }


            if (
                order.photos &&
                order.photos.length > 0 &&
                (
                    hasPermission ||
                    isAdmin
                )
            ) {

                actionButtons += `
                    <button
                        class="btn btn-info btn-sm"
                        onclick="viewOrderPhotos('${order.id}')"
                        title="Ver Fotos"
                    >
                        <i class="fas fa-images"></i>
                        ${order.photos.length}
                    </button>
                `;
            }


            if (
    order.status === 'concluida' &&
    !order.conferido &&
    (
        isAdmin ||
        podeUsuarioConferirOS(order)
    )
) {
    actionButtons += `
        <button
            class="btn btn-success btn-sm"
            onclick="conferirOS('${order.id}')"
            title="Conferir"
        >
            <i class="fas fa-check-double"></i>
        </button>
    `;
}

if (
    order.status === 'concluida' &&
    !order.conferido &&
    (
        isAdmin ||
        podeUsuarioNaoAutorizarOS(order)
    )
) {
    actionButtons += `
        <button
            class="btn btn-danger btn-sm"
            onclick="abrirRejeitarModal('${order.id}')"
            title="Não Autorizado"
        >
            <i class="fas fa-ban"></i>
            Não Autorizado
        </button>
    `;
}


            if (
                isRejectedPending &&
                (
                    hasPermission ||
                    isAdmin
                )
            ) {

                actionButtons += `
                    <button
                        class="btn btn-success btn-sm"
                        onclick="marcarAlteracoesFeitas('${order.id}')"
                        title="Alterações feitas"
                    >
                        <i class="fas fa-check-double"></i>
                        OK
                    </button>
                `;
            }


            if (
                hasPermission ||
                isAdmin
            ) {

                if (
                    order.status ===
                        'pendente' &&

                    !order.motivo_rejeicao
                ) {

                    actionButtons += `
                        <button
                            class="btn btn-success btn-sm"
                            onclick="startOrder('${order.id}')"
                            title="Iniciar OS"
                        >
                            <i class="fas fa-play"></i>
                        </button>
                    `;


                } else if (
                    order.status ===
                    'andamento'
                ) {

                    actionButtons += `
                        <button
                            class="btn btn-info btn-sm"
                            onclick="openCompleteModal('${order.id}')"
                            title="Finalizar OS"
                        >
                            <i class="fas fa-flag-checkered"></i>
                        </button>
                    `;
                }
            }


            if (
                hasPermission ||
                isAdmin
            ) {

                actionButtons += `
                    <button
                        class="btn btn-warning btn-sm"
                        onclick="abrirModalEdicaoOS('${order.id}')"
                        title="Editar OS"
                    >
                        <i class="fas fa-edit"></i>
                    </button>
                `;
            }


            actionButtons += `
                <button
                    class="btn btn-primary btn-sm"
                    onclick="openPrintModal(${JSON.stringify(order).replace(/"/g, '&quot;')})"
                    title="Imprimir OS"
                >
                    <i class="fas fa-print"></i>
                </button>
            `;


            if (
                isAdmin ||
                order.createdBy
                    ?.toLowerCase()
                    .includes(
                        currentUser.name
                            .toLowerCase()
                    )
            ) {

                actionButtons += `
                    <button
                        class="btn btn-danger btn-sm"
                        onclick="deleteOrderPrompt('${order.id}')"
                        title="Excluir OS"
                    >
                        <i class="fas fa-trash"></i>
                    </button>
                `;
            }


            // =================================
            // LINHA
            // =================================

            row.innerHTML = `

                <td>

                    <strong>
                        ${escapeHtml(
                            String(
                                order.code ||
                                order.id
                            )
                        )}
                    </strong>

                    <div style="
                        display:flex;
                        flex-wrap:wrap;
                        gap:2px;
                        margin-top:3px;
                    ">
                        ${conferenciaBadge}
                        ${ajusteBadge}
                        ${atrasoBadge}
                        ${anuncioBadge}
                        ${permissionBadge}
                    </div>

                </td>


                <td>
                    ${escapeHtml(
                        order.productName ||
                        '-'
                    )}
                </td>


                <td>

                    <div>
                        ${escapeHtml(
                            order.responsibleName ||
                            '-'
                        )}
                    </div>

                    <small style="
                        color:#6c757d;
                        font-size:10px;
                    ">
                        <i class="fas fa-user-plus"></i>

                        Criado por:
                        ${escapeHtml(
                            order.createdBy ||
                            'Sistema'
                        )}
                    </small>

                </td>


                <td>
                    ${urgencyBadge}
                </td>


                <td>
                    ${statusBadge}
                </td>


                <!-- TEMPO EXEC. -->
                <td
                    style="
                        white-space:nowrap;
                        min-width:100px;
                    "
                >
                    <div
                        data-os-tempo-id="${order.id}"
                    >
                        ${montarTempoExecucaoHTML(
                            order,
                            agora
                        )}
                    </div>
                </td>


                <!-- CRIADO EM -->
                <td style="white-space:nowrap;">
                    ${formattedDate}
                </td>


                <td>

                    <div style="
                        display:flex;
                        flex-wrap:wrap;
                        gap:3px;
                        align-items:center;
                    ">
                        ${linksHtml}
                    </div>

                </td>


                <td style="min-width:380px;">

                    <div
                        class="d-flex gap-1 flex-wrap"
                        style="gap:3px;"
                    >
                        ${actionButtons}
                    </div>

                </td>
            `;


            osTableBody.appendChild(
                row
            );
        }
    );


    updateCounters();

    atualizarRelogiosOSTabela();


    console.log(
        '✅ Tabela renderizada com',
        paginaItens.length,
        'itens'
    );
}

window.filterOS = function(filter) {
    /*
     * Todos os filtros da aba OS permanecem liberados,
     * inclusive quando Ronald estiver bloqueado.
     */
    currentFilter =
        filter;

    paginaAtualOS =
        1;

    toggleFiltroDataConcluidas(
        filter ===
            'concluida'
    );

    renderOrdersTable();

    highlightActiveFilterButton();
};

// Mostrar mensagem do filtro ativo
    const filterNames = {
        'pendente': 'Pendentes',
        'andamento': 'Em Andamento',
        'concluida': 'Concluídas',
        'nao_conferidas': 'Não Conferidas',
        'todos': 'Todas'
    };

window.viewOrder = function(orderId) {
    const order = orders.find(o => o.id == orderId);
    if (order) {
        alert(`📋 Detalhes da OS:\n\n🏷️ Código: ${order.code}\n📦 Produto: ${order.productName}\n👤 Responsável: ${order.responsibleName}\n📊 Status: ${order.status}`);
    }
};

window.editOrder = function(orderId) {
    abrirModalEdicaoOS(orderId);
};

window.viewOrderPhotos = function(orderId) {
    const order = orders.find(o => o.id == orderId);
    if (order && order.photos && order.photos.length > 0) {
        openPhotoViewer(order.photos, order.productName);
    } else {
        showToast('Nenhuma foto disponível para esta OS', 'info');
    }
};

window.abrirSistemaOS = function() {
    if (!currentUser) {
        showToast('Faça login primeiro', 'warning');
        return;
    }
    // Esconder menu
    const menuSystem = document.getElementById('menuSystem');
    if (menuSystem) menuSystem.classList.add('hidden');
    
    // Esconder outros sistemas
    const sistemas = ['salesSystem', 'reembolsosSystem', 'caixaSystem', 'entradasSystem', 'promocoesSystem', 'precificacaoSystem', 'promocoesSystem', 'reviewsSystem', 'feedbackSystem', 'perguntasSystem', 'folgasSystem', 'shippingSystem', 'estoqueSystem', 'estoqueGestaoSystem'];
    sistemas.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });

    if (perguntasSystem) perguntasSystem.classList.add('hidden');
    if (estoqueGestaoSystem) estoqueGestaoSystem.classList.add('hidden');
    
    // Mostrar sistema principal de OS
    const mainSystem = document.getElementById('mainSystem');
    if (mainSystem) mainSystem.classList.remove('hidden');
    
    // Atualizar dados do usuário na interface OS
    document.getElementById('userName').textContent = currentUser.name;
    document.getElementById('userAvatar').textContent = currentUser.avatar;
    document.getElementById('userRole').textContent = currentUser.role;
    
    // Carregar ordens se necessário
    if (typeof loadOrders === 'function') loadOrders();
    showToast('Sistema de Ordem de Serviço', 'info');
};

// ============================================
// FUNÇÃO PARA VOLTAR AO FORMULÁRIO VAZIO (HOME)
// ============================================
window.voltarParaHome = function() {
    // Cancelar qualquer edição em andamento
    if (editingOrderId) {
        cancelEdit();
    } else {
        // Apenas limpar o formulário
        clearForm();
    }
    
    // Voltar para o filtro "pendente" (ou o padrão que você preferir)
    if (currentFilter !== 'pendente') {
        currentFilter = 'pendente';
        highlightActiveFilterButton();
        renderOrdersTable();
    }
    
    // Rolar suavemente para o topo do formulário
    const formSection = document.querySelector('.form-section');
    if (formSection) {
        formSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    
    showToast('🏠 Voltando ao início', 'info');
};

// ============================================
// FUNÇÕES PARA MANIPULAÇÃO DE FOTOS
// ============================================
function setupPhotoUpload() {
    const uploadArea = document.getElementById('photoUploadArea');
    const fileInput = document.getElementById('photoUploadInput');
    
    if (!uploadArea || !fileInput) return;
    
    // Clique na área de upload
    uploadArea.addEventListener('click', () => fileInput.click());
    
    // Arrastar e soltar
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('drag-over');
    });
    
    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('drag-over');
    });
    
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('drag-over');
        
        if (e.dataTransfer.files.length > 0) {
            handlePhotoFiles(e.dataTransfer.files);
        }
    });
    
    // Mudança no input de arquivo
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handlePhotoFiles(e.target.files);
        }
    });
}

function handlePhotoFiles(files) {
    const previewArea = document.getElementById('photoPreviews');
    
    for (let file of files) {
        if (selectedPhotos.length >= MAX_PHOTOS_PER_OS) {
            showToast(`Limite de ${MAX_PHOTOS_PER_OS} fotos atingido`, 'warning');
            break;
        }
        
        if (!file.type.startsWith('image/')) {
            showToast('Apenas imagens são permitidas', 'error');
            continue;
        }
        
        if (file.size > MAX_PHOTO_SIZE) {
            showToast(`Arquivo muito grande (máx. 5MB): ${file.name}`, 'error');
            continue;
        }
        
        // Converter para base64
        const reader = new FileReader();
        reader.onload = (e) => {
            const photoData = {
                id: Date.now() + Math.random(),
                name: file.name,
                type: file.type,
                size: file.size,
                data: e.target.result,
                thumbnail: createThumbnail(e.target.result),
                isLink: false
            };
            
            selectedPhotos.push(photoData);
            updatePhotoPreviews();
        };
        reader.readAsDataURL(file);
    }
    
    // Resetar input
    document.getElementById('photoUploadInput').value = '';
}

function createThumbnail(base64Data) {
    // Para simplificar, usamos a mesma imagem
    // Em produção, você pode criar um thumbnail menor aqui
    return base64Data;
}

function updatePhotoPreviews() {
    const previewArea = document.getElementById('photoPreviews');
    if (!previewArea) return;
    
    previewArea.innerHTML = '';
    
    selectedPhotos.forEach((photo, index) => {
        const photoElement = document.createElement('div');
        photoElement.className = 'photo-preview';
        
        // Ícone diferente para fotos por link
        const icon = photo.isLink ? 'fa-link' : 'fa-image';
        
        photoElement.innerHTML = `
            <img src="${photo.thumbnail || photo.data}" 
                 alt="${photo.name}"
                 style="width: 100%; height: 100%; object-fit: cover;">
            <div style="position: absolute; top: 5px; right: 5px; background: rgba(0,0,0,0.7); color: white; border-radius: 50%; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; font-size: 12px; cursor: pointer;"
                 onclick="removePhoto(${index})">
                ×
            </div>
            <div style="position: absolute; bottom: 0; left: 0; right: 0; background: rgba(0,0,0,0.7); color: white; padding: 3px 5px; font-size: 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                <i class="fas ${icon}"></i> ${photo.name}
            </div>
        `;
        
        previewArea.appendChild(photoElement);
    });
    
    if (selectedPhotos.length > 0) {
        previewArea.style.display = 'flex';
        
        // Atualizar contador
        const uploadArea = document.getElementById('photoUploadArea');
        if (uploadArea) {
            const countText = `<span style="color: #8A2BE2; font-weight: bold;">${selectedPhotos.length}</span> foto(s) selecionada(s)`;
            uploadArea.querySelector('p:first-of-type').innerHTML = countText;
        }
    } else {
        previewArea.style.display = 'none';
    }
}

window.removePhoto = function(index) {
    selectedPhotos.splice(index, 1);
    updatePhotoPreviews();
};

function openPhotoViewer(photos, orderName) {
    const modal = document.getElementById('photoViewerModal');
    const gallery = document.getElementById('photoGallery');
    const title = document.getElementById('photoViewerTitle');
    
    if (!modal || !gallery) return;
    
    if (title) {
        title.textContent = `Fotos da OS: ${orderName}`;
    }
    
    gallery.innerHTML = '';
    
    photos.forEach((photo, index) => {
        const photoElement = document.createElement('div');
        photoElement.className = 'photo-item';
        
        // Ícone diferente para fotos por link
        const icon = photo.isLink ? 'fa-link' : 'fa-image';
        
        photoElement.innerHTML = `
            <img src="${photo.data || photo.thumbnail}" 
                 alt="${photo.name}"
                 style="width: 100%; height: 180px; object-fit: cover;"
                 onclick="viewFullPhoto(${index}, ${JSON.stringify(photos).replace(/"/g, '&quot;')})">
            <div style="padding: 10px; background: white;">
                <div style="font-size: 12px; color: #6c757d; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                    <i class="fas ${icon}"></i> ${photo.name}
                </div>
                <div style="font-size: 10px; color: #adb5bd; margin-top: 5px;">
                    ${photo.isLink ? 'Foto por link' : formatFileSize(photo.size)}
                </div>
            </div>
        `;
        
        gallery.appendChild(photoElement);
    });
    
    modal.classList.remove('hidden');
}

window.viewFullPhoto = function(index, photosData) {
    const photos = typeof photosData === 'string' ? JSON.parse(photosData) : photosData;
    const photo = photos[index];
    
    if (photo) {
        const viewer = window.open('');
        viewer.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>${photo.name}</title>
                <style>
                    body { margin: 0; padding: 20px; background: #000; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
                    img { max-width: 100%; max-height: 90vh; object-fit: contain; }
                    .close-btn { position: fixed; top: 20px; right: 20px; background: rgba(0,0,0,0.7); color: white; border: none; border-radius: 50%; width: 40px; height: 40px; font-size: 20px; cursor: pointer; }
                </style>
            </head>
            <body>
                <button class="close-btn" onclick="window.close()">×</button>
                <img src="${photo.data}" alt="${photo.name}">
            </body>
            </html>
        `);
    }
};

function formatFileSize(bytes) {
    if (!bytes || bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function closePhotoViewer() {
    document.getElementById('photoViewerModal').classList.add('hidden');
}

// ============================================
// INICIAR ORDEM DE SERVIÇO
// ============================================
window.startOrder = async function(orderId) {

    const order =
        orders.find(
            o =>
                String(o.id) ===
                String(orderId)
        );


    if (!order) {

        showToast(
            '❌ OS não encontrada',
            'error'
        );

        return;
    }


    if (!checkOrderPermission(order)) {

        showToast(
            '⚠️ Sem permissão para iniciar esta OS',
            'warning'
        );

        return;
    }


    if (
        !confirm(
            `Iniciar "${order.productName}"?`
        )
    ) {

        return;
    }


    try {

        const agoraISO =
            new Date().toISOString();


        // Se já teve início anteriormente,
        // preserva o primeiro início.
        //
        // Isso é importante para OS que
        // voltaram para revisão.
        const inicioExecucao =
            order.startedAt ||
            agoraISO;


        if (supabaseClient) {

            const dadosAtualizacao = {

                status:
                    'andamento',

                ultima_atualizacao:
                    agoraISO
            };


            // Só grava data_inicio
            // se ainda não existir.
            if (!order.startedAt) {

                dadosAtualizacao.data_inicio =
                    inicioExecucao;
            }


            const {
                error
            } =
                await supabaseClient
                    .from(
                        'ordens_service'
                    )
                    .update(
                        dadosAtualizacao
                    )
                    .eq(
                        'id',
                        orderId
                    );


            if (error) {
                throw error;
            }
        }

        order.status =
            'andamento';

        if (!order.startedAt) {

            order.startedAt =
                inicioExecucao;
        }

        order.updatedAt =
            agoraISO;

        updateCounters();
        renderOrdersTable();

        showToast(
            '✅ OS iniciada - cronômetro de horário útil iniciado',
            'success'
        );


    } catch (error) {

        console.error(
            '❌ Erro ao iniciar OS:',
            error
        );


        showToast(
            '❌ Erro ao iniciar OS: ' +
            error.message,
            'error'
        );
    }
};

window.openCompleteModal = function(orderId) {
    const order = orders.find(o => o.id == orderId);
    if (order && checkOrderPermission(order)) {
        completeOSId.value = orderId;
        const photosTakenInput = document.getElementById('photosTaken');
        const editsMadeInput = document.getElementById('editsMade');
        if (photosTakenInput) photosTakenInput.value = order.photosTaken || 0;
        if (editsMadeInput) editsMadeInput.value = order.editsMade || 0;
        if (completeModal) completeModal.classList.remove('hidden');
    }
};

window.closeCompleteModal = function() {
    if (completeModal) completeModal.classList.add('hidden');
};

// ============================================
// FINALIZAR ORDEM DE SERVIÇO
// ============================================
async function completeOrder() {

    const orderId =
        completeOSId.value;


    const order =
        orders.find(
            o =>
                String(o.id) ===
                String(orderId)
        );


    if (
        !order ||
        !checkOrderPermission(order)
    ) {

        showToast(
            '⚠️ Sem permissão',
            'warning'
        );

        return;
    }


    const photosTakenInput =
        document.getElementById(
            'photosTaken'
        );


    const editsMadeInput =
        document.getElementById(
            'editsMade'
        );


    const photosTaken =
        photosTakenInput
            ? Math.max(
                0,
                parseInt(
                    photosTakenInput.value
                ) || 0
            )
            : 0;


    const editsMade =
        editsMadeInput
            ? Math.max(
                0,
                parseInt(
                    editsMadeInput.value
                ) || 0
            )
            : 0;


    try {

        const agoraISO =
            new Date().toISOString();


        if (supabaseClient) {

            const {
                error
            } =
                await supabaseClient
                    .from(
                        'ordens_service'
                    )
                    .update({

                        status:
                            'concluida',

                        qtd_fotos:
                            photosTaken,

                        qtd_edicoes:
                            editsMade,

                        data_conclusao:
                            agoraISO,

                        conferido:
                            false,

                        conferido_por:
                            null,

                        data_conferencia:
                            null,

                        ultima_atualizacao:
                            agoraISO

                    })
                    .eq(
                        'id',
                        orderId
                    );


            if (error) {
                throw error;
            }
        }


        order.status =
            'concluida';


        order.photosTaken =
            photosTaken;


        order.editsMade =
            editsMade;


        order.completionDate =
            agoraISO;


        order.updatedAt =
            agoraISO;


        order.conferido =
            false;


        order.conferidoPor =
            null;


        order.dataConferencia =
            null;


        const tempoMinutos =
            calcularTempoExecucaoOS(
                order
            );


        const mediaFoto =
            formatarMediaFotoOS(
                order,
                tempoMinutos
            );


        // NOTIFICAR CRIADOR
        const criador =
            order.createdBy;


        if (
            criador &&
            criador !== currentUser.name
        ) {

            const assunto =
                `✅ OS Concluída: ${order.code}`;


            const mensagem = `
OS concluída com sucesso.

OS: ${order.code}
Produto: ${order.productName}
Responsável: ${order.responsibleName}

Fotos tiradas: ${photosTaken}
Fotos editadas: ${editsMade}

Tempo útil de execução:
${formatarDuracaoOS(tempoMinutos)}

Tempo médio por foto:
${mediaFoto}

Horário considerado:
Segunda a sexta-feira, das 07:00 às 16:00.
            `;


            await enviarNotificacaoEmail(
                criador,
                assunto,
                mensagem,
                order
            );
        }


        updateCounters();

        renderOrdersTable();

        closeCompleteModal();


        showToast(
            `✅ OS finalizada! Tempo útil: ${formatarDuracaoOS(tempoMinutos)}`,
            'success'
        );


    } catch (error) {

        console.error(
            '❌ Erro ao finalizar:',
            error
        );


        showToast(
            '❌ Erro ao finalizar: ' +
            error.message,
            'error'
        );
    }
}

async function salvarHistoricoOS(osId, dadosAntes, dadosDepois, alteradoPor) {
    if (!supabaseClient) return;
    
    // Identificar quais campos foram alterados (opcional, mas útil)
    const camposAlterados = {};
    for (let key in dadosDepois) {
        if (dadosAntes[key] !== dadosDepois[key]) {
            camposAlterados[key] = {
                de: dadosAntes[key],
                para: dadosDepois[key]
            };
        }
    }
    
    const historico = {
        os_id: osId,
        dados_anteriores: dadosAntes,
        alterado_por: alteradoPor,
        data_alteracao: new Date().toISOString(),
        campos_alterados: Object.keys(camposAlterados).length ? camposAlterados : null
    };
    
    const { error } = await supabaseClient
        .from('ordens_service_historico')
        .insert(historico);
    
    if (error) console.error('Erro ao salvar histórico:', error);
}

async function carregarHistoricoEdicoes(osId) {
    if (!supabaseClient) return [];
    const { data, error } = await supabaseClient
        .from('ordens_service_historico')
        .select('*')
        .eq('os_id', osId)
        .order('data_alteracao', { ascending: false });
    if (error) {
        console.error('Erro ao carregar histórico:', error);
        return [];
    }
    return data;
}

function gerarTimelineComHistorico(order, historico) {
    let html = `<div class="info-card"><h4><i class="fas fa-history"></i> Histórico da OS</h4>`;
    
    if (historico.length === 0) {
        html += `<p>Nenhuma edição registrada.</p>`;
    } else {
        html += `<ul class="list-group">`;
        historico.forEach(entry => {
            const data = new Date(entry.data_alteracao).toLocaleString('pt-BR');
            const autor = entry.alterado_por;
            const campos = entry.campos_alterados ? Object.keys(entry.campos_alterados).join(', ') : 'diversos';
            html += `
                <li class="list-group-item">
                    <strong>${data}</strong> - por ${autor}<br>
                    <small>Campos alterados: ${campos}</small>
                    <button class="btn btn-sm btn-link" onclick="detalhesAlteracao(${entry.id})">Ver detalhes</button>
                </li>
            `;
        });
        html += `</ul>`;
    }
    html += `</div>`;
    return html;
}

window.deleteOrderPrompt = async function(orderId) {
    const order = orders.find(o => o.id == orderId);
    if (order && checkOrderPermission(order) && confirm(`Excluir "${order.productName}"?`)) {
        try {
            if (supabaseClient) {
                await supabaseClient.from('ordens_service')
                    .delete()
                    .eq('id', orderId);
            }
            
            orders = orders.filter(o => o.id != orderId);
            updateCounters();
            renderOrdersTable();
            showToast(`🗑️ OS excluída`, 'success');
        } catch (error) {
            showToast('❌ Erro ao excluir', 'error');
        }
    }
};

// ============================================
// FUNÇÕES DE IMPRESSÃO MELHORADAS (COM FOTOS)
// ============================================
window.openPrintModal = function(osData) {
    currentOSForPrint = osData;
    
    // Mapear valores para texto
    const statusMap = {
        'pendente': 'Pendente',
        'andamento': 'Em Andamento',
        'concluida': 'Concluída'
    };
    
    const urgencyMap = {
        'alta': 'Alta',
        'normal': 'Normal',
        'baixa': 'Baixa'
    };
    
    // Usa o mapeamento global
    const photoTypeText = PHOTO_TYPE_MAP[osData.photoType] || osData.photoType;
    
    const osTypeMap = {
        'normal': 'Normal',
        'devolucao': 'Devolução',
        'urgente': 'Urgente'
    };
    
    const statusText = statusMap[osData.status] || osData.status;
    const urgencyText = urgencyMap[osData.urgency] || osData.urgency;
    const osTypeText = osTypeMap[osData.osType] || osData.osType;
    const formattedDate = new Date(osData.createdAt).toLocaleString('pt-BR');
    
    // Gerar preview
    generatePrintPreview(osData, statusText, urgencyText, photoTypeText, osTypeText, formattedDate);
    
    // Mostrar modal
    document.getElementById('printModal').classList.remove('hidden');
    
    // Adicionar listener para Ctrl+P
    document.addEventListener('keydown', handlePrintShortcut);
};

function generatePrintPreview(osData, statusText, urgencyText, photoTypeText, osTypeText, formattedDate) {
    const previewContainer = document.getElementById('printPreviewContent');
    
    let statusBadgeClass = 'badge-pending';
    if (osData.status === 'andamento') statusBadgeClass = 'badge-progress';
    if (osData.status === 'concluida') statusBadgeClass = 'badge-completed';
    
    let urgencyBadgeClass = 'badge-normal';
    if (osData.urgency === 'alta') urgencyBadgeClass = 'badge-high';
    if (osData.urgency === 'baixa') urgencyBadgeClass = 'badge-low';
    
    // Seção de fotos se houver
    let photosSection = '';
    if (osData.photos && osData.photos.length > 0) {
        photosSection = `
            <div class="preview-card" style="grid-column: span ${currentPrintStyle === 'compact' ? 1 : 2}">
                <div class="card-header">
                    <div class="card-icon">
                        <i class="fas fa-images"></i>
                    </div>
                    <h3 class="card-title">Fotos de Referência (${osData.photos.length})</h3>
                </div>
                <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 10px; margin-top: 15px;">
                    ${osData.photos.map((photo, index) => `
                        <div style="text-align: center;">
                            <img src="${photo.data || photo.thumbnail}" 
                                 alt="${photo.name}"
                                 style="width: 100%; height: 80px; object-fit: cover; border-radius: 5px; border: 1px solid #dee2e6;">
                            <div style="font-size: 10px; color: #6c757d; margin-top: 5px; overflow: hidden; text-overflow: ellipsis;">
                                ${photo.name}
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }
    
    // Seção para criar/replicar anúncio ou edição
    let anuncioSection = '';
    if (osData.photoType === 'criar_anuncio' || osData.photoType === 'replicar_anuncio' || osData.photoType === 'edicao') {
        anuncioSection = `
            <div class="preview-card" style="grid-column: span ${currentPrintStyle === 'compact' ? 1 : 2}">
                <div class="card-header">
                    <div class="card-icon">
                        <i class="fas fa-ad"></i>
                    </div>
                    <h3 class="card-title">Detalhes do Anúncio</h3>
                </div>
                <div class="info-row">
                    <div class="info-label">Valor:</div>
                    <div class="info-value" style="font-weight: 700; color: #28a745;">
                        R$ ${parseFloat(osData.valorAnuncio || 0).toFixed(2)}
                    </div>
                </div>
                <div class="info-row">
                    <div class="info-label">Precisa de foto:</div>
                    <div class="info-value">
                        ${osData.precisaFoto === 'sim' ? 
                        '<span class="badge badge-warning">Sim - Elaine notificada</span>' : 
                        '<span class="badge badge-success">Não</span>'}
                    </div>
                </div>
                <div class="info-row">
                    <div class="info-label">Descrição:</div>
                    <div class="info-value">
                        ${osData.descricaoAnuncio || 'Nenhuma descrição fornecida'}
                    </div>
                </div>
                ${osData.linkNovoAnuncio ? `
                <div class="info-row">
                    <div class="info-label">Link do novo anúncio:</div>
                    <div class="info-value" style="word-break: break-all; font-size: 11pt;">
                        <a href="${osData.linkNovoAnuncio}" style="color: #8A2BE2; text-decoration: none;">
                            <i class="fas fa-link"></i> ${osData.linkNovoAnuncio}
                        </a>
                    </div>
                </div>
                ` : ''}
            </div>
        `;
    }
    
    previewContainer.innerHTML = `
        <div class="print-preview ${currentPrintStyle === 'compact' ? 'compact-view' : ''}">
            <!-- Cabeçalho -->
            <div class="preview-header">
                <div class="header-gradient">
                    <h1 style="font-size: 42px; margin: 0 0 10px 0; font-weight: 800;">
                        <i class="fas fa-camera"></i> Sistema OS Fotografia
                    </h1>
                    <p style="font-size: 18px; opacity: 0.9; margin: 0 0 20px 0;">
                        Ordem de Serviço Profissional
                    </p>
                    <div class="os-code-preview">
                        OS-${osData.code}
                    </div>
                </div>
                
                <div style="margin-top: 25px; display: flex; justify-content: space-between; align-items: center; padding: 0 20px;">
                    <div style="text-align: left;">
                        <div style="font-size: 14px; color: #6c757d;">Emitido em</div>
                        <div style="font-size: 16px; font-weight: 600; color: #495057;">
                            ${new Date().toLocaleString('pt-BR')}
                        </div>
                    </div>
                    
                    <div style="text-align: center;">
                        <div style="font-size: 14px; color: #6c757d;">Tipo de Documento</div>
                        <div style="font-size: 16px; font-weight: 600; color: #495057;">
                            Ordem de Serviço ${osData.osType === 'devolucao' ? '- Devolução' : ''}
                        </div>
                    </div>
                    
                    <div style="text-align: right;">
                        <div style="font-size: 14px; color: #6c757d;">Página</div>
                        <div style="font-size: 16px; font-weight: 600; color: #495057;">
                            1 de 1
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Grid de Informações -->
            <div class="preview-grid">
                <!-- Card: Informações do Produto -->
                <div class="preview-card">
                    <div class="card-header">
                        <div class="card-icon">
                            <i class="fas fa-box"></i>
                        </div>
                        <h3 class="card-title">Informações do Produto</h3>
                    </div>
                    <div class="info-row">
                        <div class="info-label">Produto:</div>
                        <div class="info-value" style="font-size: 18px; font-weight: 700; color: #8A2BE2;">
                            ${osData.productName}
                        </div>
                    </div>
                    
                    ${osData.linkAnuncio ? `
                    <div class="info-row">
                        <div class="info-label">Link do Anúncio:</div>
                        <div class="info-value" style="word-break: break-all; font-size: 11pt;">
                            <a href="${osData.linkAnuncio}" style="color: #8A2BE2; text-decoration: none;">
                                <i class="fas fa-link"></i> ${osData.linkAnuncio}
                            </a>
                        </div>
                    </div>
                    ` : ''}
                    <div class="info-row">
                        <div class="info-label">Serviço(s):</div>
                        <div class="info-value">
                            <i class="fas fa-camera" style="margin-right: 8px;"></i>
                            ${photoTypeText}
                        </div>
                    </div>
                </div>
                
                <!-- Card: Responsáveis -->
                <div class="preview-card">
                    <div class="card-header">
                        <div class="card-icon">
                            <i class="fas fa-users"></i>
                        </div>
                        <h3 class="card-title">Responsáveis</h3>
                    </div>
                    <div class="info-row">
                        <div class="info-label">Responsável:</div>
                        <div class="info-value" style="font-size: 16px; font-weight: 600;">
                            ${osData.responsibleName}
                            ${osData.osType === 'devolucao' ? 
                            '<span style="background: #dc3545; color: white; padding: 3px 10px; border-radius: 4px; font-size: 11px; margin-left: 10px;">DEVOLUÇÃO</span>' : ''}
                        </div>
                    </div>
                    <div class="info-row">
                        <div class="info-label">Criado por:</div>
                        <div class="info-value">
                            <i class="fas fa-user-edit" style="margin-right: 8px;"></i>
                            ${osData.createdBy}
                        </div>
                    </div>
                    <div class="info-row">
                        <div class="info-label">Data de Criação:</div>
                        <div class="info-value">
                            <i class="far fa-calendar-alt" style="margin-right: 8px;"></i>
                            ${formattedDate}
                        </div>
                    </div>
                </div>
                
                <!-- Card: Status e Prioridade -->
                <div class="preview-card">
                    <div class="card-header">
                        <div class="card-icon">
                            <i class="fas fa-tasks"></i>
                        </div>
                        <h3 class="card-title">Status e Prioridade</h3>
                    </div>
                    <div class="info-row">
                        <div class="info-label">Status:</div>
                        <div class="info-value">
                            <span class="badge-preview ${statusBadgeClass}">
                                <i class="fas fa-circle" style="font-size: 8px; margin-right: 5px;"></i>
                                ${statusText}
                            </span>
                        </div>
                    </div>
                    <div class="info-row">
                        <div class="info-label">Urgência:</div>
                        <div class="info-value">
                            <span class="badge-preview ${urgencyBadgeClass}">
                                <i class="fas fa-exclamation-triangle" style="margin-right: 5px;"></i>
                                ${urgencyText}
                            </span>
                        </div>
                    </div>
                    <div class="info-row">
                        <div class="info-label">Tipo de OS:</div>
                        <div class="info-value">
                            <i class="fas fa-file-alt" style="margin-right: 8px;"></i>
                            ${osTypeText}
                        </div>
                    </div>
                </div>
                
                ${photosSection}
                ${anuncioSection}
                
                <!-- Card: Observações -->
                <div class="preview-card" style="grid-column: span ${currentPrintStyle === 'compact' ? 1 : 2}">
                    <div class="card-header">
                        <div class="card-icon">
                            <i class="fas fa-sticky-note"></i>
                        </div>
                        <h3 class="card-title">Observações e Detalhes</h3>
                    </div>
                    <div class="observations-box-preview">
                        ${osData.observations || 
                        '<div style="text-align: center; color: #adb5bd; padding: 20px;">' +
                        '<i class="fas fa-info-circle" style="font-size: 24px; margin-bottom: 10px; display: block;"></i>' +
                        'Nenhuma observação registrada para esta ordem de serviço.' +
                        '</div>'}
                    </div>
                    
                    <!-- Detalhes de Conclusão (se aplicável) -->
                    ${osData.status === 'concluida' ? `
                    <div style="margin-top: 20px; padding-top: 20px; border-top: 2px dashed #dee2e6;">
                        <h4 style="color: #28a745; margin-bottom: 15px;">
                            <i class="fas fa-check-circle"></i> Detalhes da Conclusão
                        </h4>
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px;">
                            <div>
                                <div style="font-size: 12px; color: #6c757d;">Concluído em</div>
                                <div style="font-weight: 600; color: #495057;">
                                    ${new Date(osData.completionDate).toLocaleString('pt-BR')}
                                </div>
                            </div>
                            <div>
                                <div style="font-size: 12px; color: #6c757d;">Fotos Tiradas</div>
                                <div style="font-weight: 600; color: #495057;">
                                    <i class="fas fa-camera-retro"></i> ${osData.photosTaken || '0'}
                                </div>
                            </div>
                            <div>
                                <div style="font-size: 12px; color: #6c757d;">Edições Realizadas</div>
                                <div style="font-weight: 600; color: #495057;">
                                    <i class="fas fa-edit"></i> ${osData.editsMade || '0'}
                                </div>
                            </div>
                        </div>
                    </div>
                    ` : ''}
                </div>
            </div>
            
            <!-- Rodapé -->
            <div class="footer-preview">
                <p style="margin: 5px 0;">
                    <strong>Documento válido somente para registro interno</strong>
                </p>
                <p style="margin: 5px 0; font-size: 11px;">
                    OS Code: ${osData.code} | ID: ${osData.id} | Emitido: ${formattedDate}
                    ${osData.completionDate ? `| Concluído: ${new Date(osData.completionDate).toLocaleString('pt-BR')}` : ''}
                </p>
                <p style="margin: 5px 0; font-size: 10px; color: #adb5bd;">
                    Documento gerado automaticamente pelo Sistema OS Fotografia - v2.0
                </p>
            </div>
            
            <!-- Watermark -->
            <div class="watermark">
                OS-${osData.code}
            </div>
        </div>
    `;
}

// Funções auxiliares para impressão
window.togglePrintStyle = function(style) {
    currentPrintStyle = style;
    if (currentOSForPrint) {
        const osData = currentOSForPrint;
        
        // Mapear valores (como na função principal)
        const statusMap = { 'pendente': 'Pendente', 'andamento': 'Em Andamento', 'concluida': 'Concluída' };
        const urgencyMap = { 'alta': 'Alta', 'normal': 'Normal', 'baixa': 'Baixa' };
        const photoTypeMap = { 'estudio': 'Estúdio', 'bike': 'Na Bike', 'ambos': 'Ambos', 'Apenas edição': 'Apenas edição', 'criar_anuncio': 'Criar anúncio', 'replicar_anuncio': 'Replicar anúncio' };
        const osTypeMap = { 'normal': 'Normal', 'devolucao': 'Devolução', 'urgente': 'Urgente' };
        
        const statusText = statusMap[osData.status] || osData.status;
        const urgencyText = urgencyMap[osData.urgency] || osData.urgency;
        const photoTypeText = photoTypeMap[osData.photoType] || osData.photoType;
        const osTypeText = osTypeMap[osData.osType] || osData.osType;
        const formattedDate = new Date(osData.createdAt).toLocaleString('pt-BR');
        
        generatePrintPreview(osData, statusText, urgencyText, photoTypeText, osTypeText, formattedDate);
    }
};

// Atalho para impressão
function handlePrintShortcut(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
        e.preventDefault();
        printOS();
    }
}

window.closePrintModal = function() {
    document.getElementById('printModal').classList.add('hidden');
    currentOSForPrint = null;
    document.removeEventListener('keydown', handlePrintShortcut);
};

window.printOS = function() {
    // Criar uma janela de impressão com o conteúdo formatado
    const printContent = document.getElementById('printPreviewContent').innerHTML;
    
    const printWindow = window.open('', '_blank', 'width=1200,height=800');
    
    printWindow.document.write(`
        <!DOCTYPE html>
        <html lang="pt-br">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Ordem de Serviço - OS-${currentOSForPrint.code}</title>
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
            <style>
                @media print {
                    @page {
                        margin: 20mm;
                        size: A4;
                    }
                    
                    body {
                        font-family: 'Segoe UI', Arial, sans-serif;
                        margin: 0;
                        padding: 0;
                        color: #333;
                        font-size: 12pt;
                        line-height: 1.5;
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                    }
                    
                    .print-only {
                        display: block !important;
                    }
                    
                    .no-print {
                        display: none !important;
                    }
                    
                    .page-break {
                        page-break-before: always;
                    }
                    
                    .avoid-break {
                        page-break-inside: avoid;
                    }
                    
                    /* Estilos específicos para impressão */
                    .print-header {
                        text-align: center;
                        margin-bottom: 30px;
                        padding-bottom: 20px;
                        border-bottom: 3px solid #8A2BE2;
                    }
                    
                    .header-gradient {
                        background: linear-gradient(135deg, #8A2BE2 0%, #4B0082 100%) !important;
                        color: white;
                        padding: 25px;
                        border-radius: 12px;
                        margin-bottom: 25px;
                        box-shadow: 0 4px 15px rgba(138, 43, 226, 0.2);
                    }
                    
                    .os-code-preview {
                        font-size: 28px;
                        font-weight: 800;
                        letter-spacing: 2px;
                        background: rgba(255,255,255,0.15);
                        padding: 12px 25px;
                        border-radius: 10px;
                        display: inline-block;
                        margin: 15px 0;
                        border: 2px solid rgba(255,255,255,0.3);
                    }
                    
                    .preview-grid {
                        display: grid;
                        grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
                        gap: 15px;
                        margin: 25px 0;
                    }
                    
                    .preview-card {
                        background: #f8f9fa;
                        border: 1px solid #e9ecef;
                        border-radius: 8px;
                        padding: 15px;
                        page-break-inside: avoid;
                    }
                    
                    .card-header {
                        display: flex;
                        align-items: center;
                        margin-bottom: 12px;
                        padding-bottom: 10px;
                        border-bottom: 2px solid #dee2e6;
                    }
                    
                    .card-icon {
                        width: 35px;
                        height: 35px;
                        background: #8A2BE2;
                        border-radius: 8px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        margin-right: 12px;
                        color: white;
                        font-size: 16px;
                    }
                    
                    .card-title {
                        font-size: 14px;
                        font-weight: 600;
                        color: #495057;
                        margin: 0;
                    }
                    
                    .info-row {
                        display: flex;
                        margin-bottom: 10px;
                        padding-bottom: 10px;
                        border-bottom: 1px dashed #dee2e6;
                    }
                    
                    .info-label {
                        font-weight: 600;
                        color: #6c757d;
                        width: 120px;
                        min-width: 120px;
                        font-size: 11pt;
                    }
                    
                    .info-value {
                        flex: 1;
                        color: #212529;
                        font-size: 11pt;
                    }
                    
                    .badge-preview {
                        padding: 4px 12px;
                        border-radius: 20px;
                        font-weight: 600;
                        font-size: 11px;
                        display: inline-block;
                    }
                    
                    .observations-box-preview {
                        background: white;
                        border: 2px dashed #dee2e6;
                        padding: 15px;
                        border-radius: 8px;
                        margin-top: 8px;
                        min-height: 80px;
                        font-style: italic;
                        color: #495057;
                        font-size: 11pt;
                    }
                    
                    .signature-section {
                        margin-top: 40px;
                        padding-top: 25px;
                        border-top: 3px solid #dee2e6;
                        page-break-inside: avoid;
                    }
                    
                    .signature-grid {
                        display: grid;
                        grid-template-columns: repeat(3, 1fr);
                        gap: 20px;
                        margin-top: 25px;
                    }
                    
                    .signature-box {
                        text-align: center;
                        padding: 15px;
                        border: 2px solid #e9ecef;
                        border-radius: 8px;
                        background: #f8f9fa;
                    }
                    
                    .signature-line {
                        width: 80%;
                        height: 1px;
                        background: #495057;
                        margin: 30px auto 10px;
                    }
                    
                    .signature-label {
                        font-size: 12px;
                        color: #6c757d;
                        text-transform: uppercase;
                        letter-spacing: 1px;
                        margin-bottom: 8px;
                    }
                    
                    .signature-name {
                        font-size: 14px;
                        font-weight: 600;
                        color: #495057;
                        margin-top: 12px;
                    }
                    
                    .footer-preview {
                        margin-top: 40px;
                        text-align: center;
                        font-size: 10px;
                        color: #6c757d;
                        padding-top: 15px;
                        border-top: 1px solid #dee2e6;
                    }
                    
                    .watermark {
                        position: absolute;
                        bottom: 30mm;
                        right: 30mm;
                        opacity: 0.05;
                        font-size: 60px;
                        font-weight: 800;
                        color: #8A2BE2;
                        transform: rotate(-45deg);
                        pointer-events: none;
                        user-select: none;
                    }
                }
                
                /* Estilos para visualização na tela */
                @media screen {
                    body {
                        font-family: 'Segoe UI', Arial, sans-serif;
                        margin: 20px;
                        color: #333;
                        background: #f5f5f5;
                    }
                    
                    .print-container {
                        background: white;
                        width: 210mm;
                        min-height: 297mm;
                        margin: 0 auto;
                        padding: 25mm;
                        box-shadow: 0 5px 15px rgba(0,0,0,0.1);
                        border-radius: 3px;
                    }
                    
                    .print-controls {
                        text-align: center;
                        margin: 20px 0;
                        padding: 15px;
                        background: white;
                        border-radius: 8px;
                        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                    }
                    
                    .print-btn {
                        padding: 12px 30px;
                        background: #8A2BE2;
                        color: white;
                        border: none;
                        border-radius: 5px;
                        font-size: 16px;
                        cursor: pointer;
                        margin: 0 10px;
                        transition: all 0.3s;
                    }
                    
                    .print-btn:hover {
                        background: #7a1bd2;
                        transform: translateY(-2px);
                        box-shadow: 0 4px 8px rgba(138, 43, 226, 0.3);
                    }
                    
                    .close-btn {
                        background: #6c757d;
                    }
                    
                    .close-btn:hover {
                        background: #5a6268;
                    }
                }
            </style>
        </head>
        <body>
            <div class="print-controls no-print">
                <h2>Pronto para imprimir</h2>
                <p>Visualize como ficará a impressão antes de imprimir.</p>
                <button class="print-btn" onclick="window.print()">
                    <i class="fas fa-print"></i> Imprimir Documento
                </button>
                <button class="print-btn close-btn" onclick="window.close()">
                    <i class="fas fa-times"></i> Fechar
                </button>
            </div>
            
            <div class="print-container">
                ${printContent}
            </div>
            
            <script>
                // Auto-print quando a janela carregar
                window.onload = function() {
                    setTimeout(function() {
                        window.print();
                    }, 1000);
                };
                
                // Fechar após impressão (opcional)
                window.onafterprint = function() {
                    setTimeout(function() {
                        window.close();
                    }, 1000);
                };
            <\/script>
        </body>
        </html>
    `);
    
    printWindow.document.close();
    
    // Fechar o modal de preview
    closePrintModal();
};

// ============================================
// FUNÇÃO DE NOTIFICAÇÃO
// ============================================
function showToast(message, type = 'info') {
    const existingToast = document.querySelector('.toast');
    if (existingToast) existingToast.remove();
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let icon = 'info-circle';
    if (type === 'success') icon = 'check-circle';
    else if (type === 'error') icon = 'exclamation-circle';
    else if (type === 'warning') icon = 'exclamation-triangle';
    
    toast.innerHTML = `
        <i class="fas fa-${icon}"></i>
        <span>${message}</span>
    `;
    
    document.body.appendChild(toast);
    
    // Mostrar toast
    setTimeout(() => {
        toast.style.opacity = '1';
    }, 10);
    
    // Remover depois de 4 segundos
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 300);
    }, 4000);
}

// ============================================
// VARIÁVEIS PARA VISUALIZAÇÃO DA OS
// ============================================
let currentViewingOS = null;

// ============================================
// FUNÇÕES PARA VISUALIZAÇÃO DA OS
// ============================================
window.viewOrderDetails = function(orderId) {
    const order = orders.find(o => o.id == orderId);
    if (!order) {
        showToast('Ordem não encontrada', 'error');
        return;
    }
    
    currentViewingOS = order;
    openViewOSModal(order);
};

function openViewOSModal(order) {
    // Atualizar cabeçalho
    document.getElementById('viewOSCode').textContent = order.code;
    
    // Atualizar contador de fotos
    const photoCount = order.photos ? order.photos.length : 0;
    document.getElementById('viewPhotosCount').textContent = photoCount;
    
    // Atualizar data de criação
    const createdDate = new Date(order.createdAt);
    document.getElementById('viewCreatedAt').textContent = createdDate.toLocaleString('pt-BR');
    
    // Carregar conteúdo inicial (aba de detalhes)
    switchViewOSTab('details');
    
    // Mostrar modal
    document.getElementById('viewOSModal').classList.remove('hidden');
}

function closeViewOSModal() {
    document.getElementById('viewOSModal').classList.add('hidden');
    currentViewingOS = null;
}

async function switchViewOSTab(tabName) {
    // Atualizar botões das abas
    const tabButtons = document.querySelectorAll('#viewOSTabs .tab-button');
    tabButtons.forEach(button => {
        button.classList.remove('active');
        button.style.borderBottomColor = 'transparent';
        button.style.color = '#6c757d';
    });
    
    // Ativar botão atual
    const activeButton = document.querySelector(`#viewOSTabs button[onclick*="${tabName}"]`);
    if (activeButton) {
        activeButton.classList.add('active');
        activeButton.style.borderBottomColor = '#8A2BE2';
        activeButton.style.color = '#8A2BE2';
    }
    
    // Carregar conteúdo da aba
    const contentContainer = document.getElementById('viewOSContent');
    
    switch(tabName) {
        case 'details':
            contentContainer.innerHTML = generateDetailsTab();
            break;
        case 'photos':
            contentContainer.innerHTML = generatePhotosTab();
            break;
        case 'timeline':
    contentContainer.innerHTML = '<div class="text-center"><div class="spinner"></div> Carregando histórico...</div>';
    const timelineHtml = await generateTimelineTab();
    contentContainer.innerHTML = timelineHtml;
    break;
    }
}

function generateDetailsTab() {
    if (!currentViewingOS) return '<p>Carregando...</p>';
    
    const order = currentViewingOS;
    
    const statusMap = {
        'pendente': { text: 'Pendente', class: 'status-pending-view' },
        'andamento': { text: 'Em Andamento', class: 'status-progress-view' },
        'concluida': { text: 'Concluída', class: 'status-completed-view' }
    };
    const urgencyMap = {
        'baixa': { text: 'Baixa (36h)', color: '#28a745' },
        'normal': { text: 'Normal (48h)', color: '#ffc107' },
        'alta': { text: 'Alta (2h)', color: '#dc3545' }
    };
    // Usa o mapeamento global
    const photoTypeText = PHOTO_TYPE_MAP[order.photoType] || order.photoType;
    
    const osTypeMap = { 'normal': 'Normal', 'devolucao': 'Devolução' };
    
    const statusInfo = statusMap[order.status] || { text: order.status, class: '' };
    const urgencyInfo = urgencyMap[order.urgency] || { text: order.urgency, color: '#6c757d' };
    const osTypeText = osTypeMap[order.osType] || order.osType;
    
    const createdDate = new Date(order.createdAt);
    const formattedCreatedDate = createdDate.toLocaleDateString('pt-BR') + ' ' + 
                                createdDate.toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'});
    
    let completionDateText = 'Não concluída';
    if (order.completionDate) {
        const completionDate = new Date(order.completionDate);
        completionDateText = completionDate.toLocaleDateString('pt-BR') + ' ' + 
                           completionDate.toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'});
    }
    
    // Verificar atraso
    let atrasado = false;
    let prazoTexto = '';
    if (order.status !== 'concluida' && order.prazo_esperado) {
        const prazo = new Date(order.prazo_esperado);
        const agora = new Date();
        if (prazo < agora) atrasado = true;
        prazoTexto = `Prazo estimado: ${prazo.toLocaleString('pt-BR')} ${atrasado ? ' (ATRASADO!)' : ''}`;
    }
    
    const isAnuncio = (order.photoType === 'criar_anuncio' || order.photoType === 'replicar_anuncio');
    
    // Seção de anúncio (detalhes e status)
    let anuncioSection = '';
    if (isAnuncio) {
        anuncioSection = `
            <div class="info-card" style="margin-top: 20px;">
                <h4><i class="fas fa-ad"></i> Detalhes do Anúncio</h4>
                <div class="info-grid">
                    <div class="info-item">
                        <div class="info-label">Valor do Anúncio</div>
                        <div class="info-value" style="font-weight: 700; color: #28a745;">
                            R$ ${parseFloat(order.valorAnuncio || 0).toFixed(2)}
                        </div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">Precisa de foto?</div>
                        <div class="info-value">
                            ${order.precisaFoto === 'sim' ? '<span class="badge badge-warning">Sim - Elaine notificada</span>' : '<span class="badge badge-success">Não</span>'}
                        </div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">Status do anúncio</div>
                        <div class="info-value">
                            ${order.anuncio_criado ? 
                                `<span class="badge badge-success">Anúncio criado - link: <a href="${order.linkNovoAnuncio}" target="_blank">ver</a></span>` : 
                                `<span class="badge badge-warning">Aguardando link do anúncio</span>`}
                        </div>
                    </div>
                </div>
                <div class="info-item" style="margin-top: 10px;">
                    <div class="info-label">Descrição</div>
                    <div class="info-value">
                        <div style="background: white; padding: 15px; border-radius: 8px; border: 1px solid #e9ecef;">
                            ${order.descricaoAnuncio || 'Nenhuma descrição fornecida'}
                        </div>
                    </div>
                </div>
                ${order.linkNovoAnuncio ? `
                <div class="info-item" style="margin-top: 10px;">
                    <div class="info-label">Link do Novo Anúncio</div>
                    <div class="info-value">
                        <a href="${order.linkNovoAnuncio}" target="_blank" rel="noopener noreferrer" style="color: #8A2BE2;">
                            <i class="fas fa-external-link-alt"></i> Ver novo anúncio
                        </a>
                        <small style="display: block; color: #6c757d; margin-top: 5px; word-break: break-all;">${order.linkNovoAnuncio}</small>
                    </div>
                </div>
                ` : ''}
            </div>
        `;
    }
    
    // Motivo de rejeição
    let motivoRejeicaoSection = '';
    if (order.motivo_rejeicao) {
        motivoRejeicaoSection = `
            <div class="info-card" style="margin-top: 20px; background: #fff3cd; border-left: 4px solid #ffc107;">
                <h4><i class="fas fa-exclamation-triangle"></i> Motivo da Não Autorização</h4>
                <div class="info-item">
                    <div class="info-label">Rejeitado por</div>
                    <div class="info-value">${order.rejeitado_por || '-'}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">Data da rejeição</div>
                    <div class="info-value">${order.data_rejeicao ? new Date(order.data_rejeicao).toLocaleString('pt-BR') : '-'}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">Motivo</div>
                    <div class="info-value">
                        <div style="background: white; padding: 15px; border-radius: 8px; margin-top: 5px;">
                            ${order.motivo_rejeicao}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
    
    return `
        <div class="tab-content active">
            <div class="info-grid">
                <!-- Informações do Produto -->
                <div class="info-card">
                    <h4><i class="fas fa-box"></i> Informações do Produto</h4>
                    <div class="info-item">
                        <div class="info-label">Produto</div>
                        <div class="info-value" style="font-size: 18px; font-weight: 700; color: #8A2BE2;">${order.productName}</div>
                    </div>
                    ${order.linkAnuncio ? `
                    <div class="info-item">
                        <div class="info-label">Link do Anúncio</div>
                        <div class="info-value">
                            <a href="${order.linkAnuncio}" target="_blank" rel="noopener noreferrer" style="color: #8A2BE2;">
                                <i class="fas fa-external-link-alt"></i> Ver anúncio
                            </a>
                            <small style="display: block; color: #6c757d; word-break: break-all;">${order.linkAnuncio}</small>
                        </div>
                    </div>
                    ` : ''}
                    <div class="info-item">
                        <div class="info-label">Serviço(s)</div>
                        <div class="info-value"><i class="fas fa-camera"></i> ${photoTypeText}</div>
                    </div>
                </div>
                
                <!-- Status e Prioridade -->
                <div class="info-card">
                    <h4><i class="fas fa-tasks"></i> Status e Prioridade</h4>
                    <div class="info-item">
                        <div class="info-label">Status</div>
                        <div class="info-value"><span class="status-badge-view ${statusInfo.class}">${statusInfo.text}</span></div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">Urgência</div>
                        <div class="info-value"><span class="badge-view" style="background: ${urgencyInfo.color}; color: white;">${urgencyInfo.text}</span></div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">Prazo estimado</div>
                        <div class="info-value">${prazoTexto || 'Não definido'}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">Tipo de OS</div>
                        <div class="info-value">
                            <i class="fas fa-file-alt"></i> ${osTypeText}
                            ${order.osType === 'devolucao' ? '<span class="badge badge-danger" style="margin-left: 10px;">DEVOLUÇÃO</span>' : ''}
                        </div>
                    </div>
                </div>
                
                <!-- Responsáveis -->
                <div class="info-card">
                    <h4><i class="fas fa-users"></i> Responsáveis</h4>
                    <div class="info-item">
                        <div class="info-label">Responsável</div>
                        <div class="info-value" style="font-size: 16px; font-weight: 600;">${order.responsibleName}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">Criado por</div>
                        <div class="info-value"><i class="fas fa-user-edit"></i> ${order.createdBy}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">Data de Criação</div>
                        <div class="info-value"><i class="far fa-calendar-alt"></i> ${formattedCreatedDate}</div>
                    </div>
                </div>
                
                <!-- Datas -->
                <div class="info-card">
                    <h4><i class="fas fa-calendar-alt"></i> Datas</h4>
                    <div class="info-item">
                        <div class="info-label">Criado em</div>
                        <div class="info-value">${formattedCreatedDate}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">Última atualização</div>
                        <div class="info-value">${new Date(order.updatedAt).toLocaleString('pt-BR')}</div>
                    </div>
                    ${order.status === 'concluida' ? `
                    <div class="info-item">
                        <div class="info-label">Concluído em</div>
                        <div class="info-value">${completionDateText}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">Fotos tiradas</div>
                        <div class="info-value"><i class="fas fa-camera-retro"></i> ${order.photosTaken || '0'}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">Edições realizadas</div>
                        <div class="info-value"><i class="fas fa-edit"></i> ${order.editsMade || '0'}</div>
                    </div>
                    ` : ''}
                </div>
            </div>
            
            ${anuncioSection}
            ${motivoRejeicaoSection}
            
            <!-- Observações -->
            <div class="info-card" style="margin-top: 20px;">
                <h4><i class="fas fa-sticky-note"></i> Observações</h4>
                <div style="background: white; padding: 20px; border-radius: 8px; border: 1px solid #e9ecef;">
                    ${order.observations || '<div style="text-align: center; color: #adb5bd;">Nenhuma observação registrada.</div>'}
                </div>
            </div>
        </div>
    `;
}

function generatePhotosTab() {
    if (!currentViewingOS) return '<p>Carregando...</p>';
    
    const order = currentViewingOS;
    const photos = order.photos || [];
    
    if (photos.length === 0) {
        return `
            <div class="tab-content active">
                <div style="text-align: center; padding: 50px 20px;">
                    <i class="fas fa-images fa-4x" style="color: #e9ecef; margin-bottom: 20px;"></i>
                    <h4 style="color: #6c757d;">Nenhuma foto anexada</h4>
                    <p style="color: #adb5bd;">Esta ordem de serviço não possui fotos de referência.</p>
                </div>
            </div>
        `;
    }
    
    return `
        <div class="tab-content active">
            <div style="margin-bottom: 20px;">
                <p style="color: #6c757d; margin-bottom: 10px;">
                    <i class="fas fa-info-circle"></i>
                    ${photos.length} foto(s) de referência anexada(s)
                </p>
            </div>
            
            <div class="photo-gallery-view">
                ${photos.map((photo, index) => `
                    <div class="photo-card-view">
                        <img src="${photo.data || photo.thumbnail}" 
                             alt="${photo.name}"
                             style="width: 100%; height: 150px; object-fit: cover; cursor: pointer;"
                             onclick="viewPhotoInModal(${index})">
                        <div style="padding: 10px; background: white;">
                            <div style="font-size: 12px; color: #6c757d; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                                <i class="fas ${photo.isLink ? 'fa-link' : 'fa-image'}"></i> ${photo.name}
                            </div>
                            <div style="font-size: 10px; color: #adb5bd; margin-top: 5px;">
                                ${photo.isLink ? 'Foto por link' : formatFileSize(photo.size)}
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
            
            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e9ecef;">
                <p style="color: #6c757d; font-size: 14px;">
                    <i class="fas fa-lightbulb"></i>
                    <strong>Dica:</strong> Clique em qualquer foto para visualizá-la em tamanho maior.
                </p>
            </div>
        </div>
    `;
}

// Substitua a função generateTimelineTab por esta versão assíncrona
async function generateTimelineTab() {
    if (!currentViewingOS) return '<p>Carregando...</p>';
    
    const order = currentViewingOS;
    
    // Carregar histórico de edições do Supabase
    let historico = [];
    if (supabaseClient) {
        const { data, error } = await supabaseClient
            .from('ordens_service_historico')
            .select('*')
            .eq('os_id', order.id)
            .order('data_alteracao', { ascending: false });
        if (!error && data) historico = data;
    }
    
    // Eventos padrão (criação, início, conclusão)
    const timelineEvents = [];
    
    timelineEvents.push({
        date: order.createdAt,
        title: 'OS Criada',
        description: `Ordem de serviço criada por ${order.createdBy}`,
        icon: 'plus-circle',
        color: '#8A2BE2'
    });
    
    if (order.updatedAt && order.updatedAt !== order.createdAt && historico.length === 0) {
        timelineEvents.push({
            date: order.updatedAt,
            title: 'OS Atualizada',
            description: 'Última atualização do sistema',
            icon: 'sync-alt',
            color: '#17a2b8'
        });
    }
    
    if (order.status === 'andamento' || order.status === 'concluida') {
        timelineEvents.push({
            date: order.updatedAt,
            title: 'OS Iniciada',
            description: `Iniciada por ${order.responsibleName}`,
            icon: 'play-circle',
            color: '#28a745'
        });
    }
    
    if (order.status === 'concluida' && order.completionDate) {
        timelineEvents.push({
            date: order.completionDate,
            title: 'OS Concluída',
            description: `Concluída com ${order.photosTaken || 0} fotos tiradas e ${order.editsMade || 0} edições`,
            icon: 'check-circle',
            color: '#28a745'
        });
    }
    
    // Ordenar eventos padrão por data (mais recente primeiro)
    timelineEvents.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    // Montar HTML combinando eventos padrão + histórico de edições
    let html = `<div class="info-card"><h4><i class="fas fa-history"></i> Linha do Tempo e Edições</h4>`;
    
    if (timelineEvents.length === 0 && historico.length === 0) {
        html += `<p>Nenhum evento registrado.</p>`;
    } else {
        html += `<ul class="timeline-list" style="list-style: none; padding-left: 0;">`;
        
        // Exibir eventos padrão
        timelineEvents.forEach(event => {
            const eventDate = new Date(event.date);
            const formattedDate = eventDate.toLocaleDateString('pt-BR') + ' ' + 
                                 eventDate.toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'});
            html += `
                <li style="margin-bottom: 20px; border-left: 3px solid ${event.color}; padding-left: 15px;">
                    <div><strong>${formattedDate}</strong> - ${event.title}</div>
                    <div style="color: #6c757d; font-size: 14px;">${event.description}</div>
                </li>
            `;
        });
        
        // Exibir histórico de edições
        historico.forEach(entry => {
            const dataAlt = new Date(entry.data_alteracao);
            const formattedDate = dataAlt.toLocaleDateString('pt-BR') + ' ' + 
                                 dataAlt.toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'});
            const campos = entry.campos_alterados ? Object.keys(entry.campos_alterados).join(', ') : 'diversos';
            html += `
                <li style="margin-bottom: 20px; border-left: 3px solid #ffc107; padding-left: 15px;">
                    <div><strong>${formattedDate}</strong> - Edição por ${entry.alterado_por}</div>
                    <div style="color: #6c757d; font-size: 14px;">Campos alterados: ${campos}</div>
                    <button class="btn btn-sm btn-link p-0" onclick="verDetalhesAlteracao(${entry.id})">Ver detalhes</button>
                </li>
            `;
        });
        
        html += `</ul>`;
    }
    
    html += `</div>`;
    return html;
}

window.verDetalhesAlteracao = async function(historicoId) {
    if (!supabaseClient) return;
    const { data, error } = await supabaseClient
        .from('ordens_service_historico')
        .select('*')
        .eq('id', historicoId)
        .single();
    if (error || !data) {
        showToast('Erro ao carregar detalhes', 'error');
        return;
    }
    
    const campos = data.campos_alterados;
    let detalhesHtml = `<div style="max-height: 400px; overflow-y: auto;">`;
    if (campos) {
        for (let [campo, valores] of Object.entries(campos)) {
            detalhesHtml += `
                <div style="margin-bottom: 15px; border-bottom: 1px solid #dee2e6; padding-bottom: 10px;">
                    <strong>${campo}</strong><br>
                    <span style="color: #dc3545;">De: ${valores.de ?? '(vazio)'}</span><br>
                    <span style="color: #28a745;">Para: ${valores.para ?? '(vazio)'}</span>
                </div>
            `;
        }
    } else {
        detalhesHtml += '<p>Nenhum detalhe de campos registrado.</p>';
    }
    detalhesHtml += `</div>`;
    
    showModalDialog('Detalhes da Alteração', detalhesHtml);
};

// Função simples para exibir modal genérico
function showModalDialog(title, contentHtml) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.display = 'flex';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 600px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                <h3>${title}</h3>
                <button onclick="this.closest('.modal').remove()" style="background:none; border:none; font-size:24px;">&times;</button>
            </div>
            ${contentHtml}
            <div class="d-flex justify-content-end mt-3">
                <button class="btn btn-secondary" onclick="this.closest('.modal').remove()">Fechar</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

window.viewPhotoInModal = function(photoIndex) {
    if (!currentViewingOS || !currentViewingOS.photos) return;
    
    const photos = currentViewingOS.photos;
    const photo = photos[photoIndex];
    
    if (!photo) return;
    
    // Criar modal para visualização da foto
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.cssText = `
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(0,0,0,0.9);
        z-index: 2000;
    `;
    
    modal.innerHTML = `
        <div style="position: relative; max-width: 90vw; max-height: 90vh;">
            <button onclick="this.parentElement.parentElement.remove()" 
                    style="position: absolute; top: -40px; right: 0; background: none; border: none; color: white; font-size: 30px; cursor: pointer; z-index: 10;">
                &times;
            </button>
            <img src="${photo.data || photo.thumbnail}" 
                 alt="${photo.name}"
                 style="max-width: 90vw; max-height: 90vh; object-fit: contain;">
            <div style="position: absolute; bottom: 0; left: 0; right: 0; background: rgba(0,0,0,0.7); color: white; padding: 10px; font-size: 12px;">
                <div>${photo.name}</div>
                <div>${photo.isLink ? 'Foto por link' : formatFileSize(photo.size)} • Foto ${photoIndex + 1} de ${photos.length}</div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Fechar modal ao pressionar ESC
    const closeOnEsc = (e) => {
        if (e.key === 'Escape') {
            modal.remove();
            document.removeEventListener('keydown', closeOnEsc);
        }
    };
    document.addEventListener('keydown', closeOnEsc);
};

function printCurrentOS() {
    if (!currentViewingOS) return;
    
    // Usar a função de impressão existente
    openPrintModal(currentViewingOS);
}

function editCurrentOS() {
    if (!currentViewingOS) return;
    
    // Fechar modal de visualização
    closeViewOSModal();
    
    // Abrir edição
    setTimeout(() => {
        editOrder(currentViewingOS.id);
    }, 300);
}

// Adicionar listener para fechar modal ao clicar fora
document.getElementById('viewOSModal')?.addEventListener('click', function(e) {
    if (e.target === this) {
        closeViewOSModal();
    }
});

// ============================================
// INICIALIZAÇÃO DO BOTÃO DE REEMBOLSOS
// ============================================
function inicializarBotaoReembolsos() {
    const reembolsosBtn = document.getElementById('reembolsosBtn');
    if (reembolsosBtn) {
        reembolsosBtn.addEventListener('click', function() {
            abrirSistemaReembolsos();
        });
    }
}

// Chame esta função no DOMContentLoaded
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 Sistema OS Fotografia iniciado!');

    // INICIALIZAR EMAILJS
    if (window.emailjs) {
        emailjs.init({
            publicKey: "GtDq2kuz4ng-u8gYR"
        });
        console.log("✅ EmailJS inicializado");
    } else {
        console.error("❌ EmailJS não carregado");
    }

    console.log('🚀 Sistema OS Fotografia com Reembolsos iniciado!');
    
    generateOSCode();
    initSupabase();
    loadOrders();
    setupEventListeners();
    setupPhotoUpload();
    setupReembolsoEventListeners();
    inicializarBotaoReembolsos();

    // Inicializar sistema de perguntas
    if (typeof inicializarSistemaPerguntas === 'function') {
        inicializarSistemaPerguntas();
    }

    if (currentUser) {
        setTimeout(() => {
            // Verificar status do token ML
            const tokenExpiry = localStorage.getItem('ml_token_expiry');
            if (tokenExpiry) {
                const expiresIn = parseInt(tokenExpiry) - Date.now();
                if (expiresIn < 3600000) { // Se faltar menos de 1 hora
                    console.log('🔄 Token ML prestes a expirar, renovando...');
                    getMLTokenAutomatically();
                }
            }
        }, 5000);
    }
});

// ============================================
// FUNÇÃO PARA VOLTAR PARA SISTEMA OS
// ============================================
window.voltarParaMenu = function() {
    // Lista de todos os sistemas que podem estar abertos
    const sistemas = ['mainSystem', 'salesSystem', 'precificacaoSystem', 'reembolsosSystem', 'caixaSystem', 'perguntasSystem', 'promocoesSystem',
                      'reviewsSystem', 'folgasSystem', 'shippingSystem', 'entradasSystem','feedbackSystem','estoqueSystem', 
                      'estoqueGestaoSystem', 'gerenciamentoAnunciosSystem'];
    sistemas.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });
    const historyScreen = document.getElementById('historicoAcessosScreen');
    if (historyScreen) historyScreen.classList.add('hidden');
    // Mostrar menu
    const menu = document.getElementById('menuSystem');
    if (menu) menu.classList.remove('hidden');
    showToast('Menu principal', 'info');
};

// Adicionar estilos CSS para o sistema de impressão
const printStyles = document.createElement('style');
printStyles.innerHTML = `
    .print-preview {
        font-family: 'Segoe UI', Arial, sans-serif;
        color: #333;
    }
    
    .preview-header {
        text-align: center;
        margin-bottom: 40px;
        padding-bottom: 20px;
        border-bottom: 3px solid #8A2BE2;
        position: relative;
    }
    
    .header-gradient {
        background: linear-gradient(135deg, #8A2BE2 0%, #4B0082 100%);
        color: white;
        padding: 25px;
        border-radius: 12px;
        margin-bottom: 25px;
        box-shadow: 0 4px 15px rgba(138, 43, 226, 0.2);
    }
    
    .os-code-preview {
        font-size: 32px;
        font-weight: 800;
        letter-spacing: 2px;
        background: rgba(255,255,255,0.15);
        padding: 15px 30px;
        border-radius: 10px;
        display: inline-block;
        margin: 15px 0;
        border: 2px solid rgba(255,255,255,0.3);
    }
    
    .preview-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
        gap: 20px;
        margin: 30px 0;
    }
    
    .preview-card {
        background: #f8f9fa;
        border: 1px solid #e9ecef;
        border-radius: 10px;
        padding: 20px;
        transition: all 0.3s ease;
    }
    
    .card-header {
        display: flex;
        align-items: center;
        margin-bottom: 15px;
        padding-bottom: 10px;
        border-bottom: 2px solid #dee2e6;
    }
    
    .card-icon {
        width: 40px;
        height: 40px;
        background: #8A2BE2;
        border-radius: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
        margin-right: 15px;
        color: white;
        font-size: 18px;
    }
    
    .card-title {
        font-size: 16px;
        font-weight: 600;
        color: #495057;
        margin: 0;
    }
    
    .info-row {
        display: flex;
        margin-bottom: 12px;
        padding-bottom: 12px;
        border-bottom: 1px dashed #dee2e6;
    }
    
    .info-label {
        font-weight: 600;
        color: #6c757d;
        width: 140px;
        min-width: 140px;
    }
    
    .info-value {
        flex: 1;
        color: #212529;
    }
    
    .badge-preview {
        padding: 6px 15px;
        border-radius: 20px;
        font-weight: 600;
        font-size: 13px;
        display: inline-block;
    }
    
    .badge-pending {
        background: linear-gradient(135deg, #ffc107, #ff9800);
        color: #856404;
    }
    
    .badge-progress {
        background: linear-gradient(135deg, #17a2b8, #138496);
        color: white;
    }
    
    .badge-completed {
        background: linear-gradient(135deg, #28a745, #218838);
        color: white;
    }
    
    .badge-high {
        background: linear-gradient(135deg, #dc3545, #c82333);
        color: white;
    }
    
    .badge-normal {
        background: linear-gradient(135deg, #28a745, #218838);
        color: white;
    }
    
    .badge-low {
        background: linear-gradient(135deg, #6c757d, #545b62);
        color: white;
    }
    
    .observations-box-preview {
        background: white;
        border: 2px dashed #dee2e6;
        padding: 20px;
        border-radius: 10px;
        margin-top: 10px;
        min-height: 100px;
        font-style: italic;
        color: #495057;
    }
    
    .signature-section {
        margin-top: 60px;
        padding-top: 30px;
        border-top: 3px solid #dee2e6;
        page-break-inside: avoid;
    }
    
    .signature-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 30px;
        margin-top: 30px;
    }
    
    .signature-box {
        text-align: center;
        padding: 20px;
        border: 2px solid #e9ecef;
        border-radius: 10px;
        background: #f8f9fa;
    }
    
    .signature-line {
        width: 80%;
        height: 2px;
        background: #495057;
        margin: 40px auto 15px;
    }
    
    .signature-label {
        font-size: 14px;
        color: #6c757d;
        text-transform: uppercase;
        letter-spacing: 1px;
        margin-bottom: 10px;
    }
    
    .signature-name {
        font-size: 16px;
        font-weight: 600;
        color: #495057;
        margin-top: 15px;
    }
    
    .footer-preview {
        margin-top: 50px;
        text-align: center;
        font-size: 12px;
        color: #6c757d;
        padding-top: 20px;
        border-top: 1px solid #dee2e6;
    }
    
    .watermark {
        position: absolute;
        bottom: 20mm;
        right: 20mm;
        opacity: 0.1;
        font-size: 80px;
        font-weight: 800;
        color: #8A2BE2;
        transform: rotate(-45deg);
        pointer-events: none;
        user-select: none;
    }
    
    /* Estilos para versão compacta */
    .compact-view .preview-grid {
        grid-template-columns: 1fr;
        gap: 15px;
    }
    
    .compact-view .preview-card {
        padding: 15px;
    }
    
    .compact-view .card-header {
        margin-bottom: 10px;
    }
    
    .compact-view .signature-grid {
        grid-template-columns: 1fr;
        gap: 20px;
    }

`;



document.head.appendChild(printStyles);

// ===== FUNÇÕES DE GERENCIAMENTO DE TOKEN =====

function saveMLTokenToStorage(tokenData) {
    try {
        localStorage.setItem('ml_token_data', JSON.stringify(tokenData));
        console.log('✅ Token ML salvo no localStorage');
        
        // Atualizar variáveis globais
        mlAccessToken = tokenData.access_token;
        mlTokenExpiresAt = tokenData.expires_at;
        
        // Atualizar status na interface
        updateMLTokenStatusUI();
        
        return true;
    } catch (error) {
        console.error('❌ Erro ao salvar token ML:', error);
        return false;
    }
}

function loadMLTokenFromStorage() {
    try {
        const tokenData = localStorage.getItem('ml_token_data');
        if (tokenData) {
            return JSON.parse(tokenData);
        }
    } catch (error) {
        console.error('❌ Erro ao carregar token ML:', error);
    }
    return null;
}

function scheduleTokenRefresh() {
    if (mlTokenTimer) {
        clearTimeout(mlTokenTimer);
    }
    
    if (!mlTokenExpiresAt) {
        console.warn('⚠️ Não é possível agendar renovação - token não configurado');
        return;
    }
    
    const now = Date.now();
    const expiresIn = mlTokenExpiresAt - now;
    
    // Renovar 1 hora antes de expirar
    const refreshTime = expiresIn - 3600000;
    
    if (refreshTime > 0) {
        mlTokenTimer = setTimeout(() => {
            console.log('⏰ Token prestes a expirar, notificando usuário...');
            showTokenExpiryWarning();
        }, refreshTime);
        
        const hoursLeft = Math.round(refreshTime / 3600000);
        console.log(`⏰ Token será verificado em ${hoursLeft} horas`);
        
    } else {
        // Token está prestes a expirar
        showTokenExpiryWarning();
    }
}

function showTokenExpiryWarning() {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.cssText = `
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(0,0,0,0.7);
        z-index: 2000;
    `;
    
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 500px; background: white;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                <h3 style="margin: 0; color: #ffc107;">
                    <i class="fas fa-exclamation-triangle"></i> Token ML Expirando
                </h3>
                <button onclick="this.parentElement.parentElement.parentElement.remove()" 
                        style="background: none; border: none; font-size: 24px; cursor: pointer; color: #6c757d;">
                    &times;
                </button>
            </div>
            
            <div style="margin-bottom: 20px;">
                <p style="color: #6c757d;">
                    O seu token de acesso ao Mercado Livre está prestes a expirar.
                </p>
                
                <div style="background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 8px; margin-bottom: 15px;">
                    <p style="margin: 0; color: #856404;">
                        <i class="fas fa-info-circle"></i> 
                        Para continuar acessando as vendas, você precisa renovar o token.
                    </p>
                </div>
                
                <p style="color: #6c757d; font-size: 14px;">
                    O token atual expira em aproximadamente <strong>1 hora</strong>.
                </p>
            </div>
            
            <div class="d-flex justify-content-between">
                <button class="btn btn-secondary" onclick="this.parentElement.parentElement.parentElement.remove()">
                    Lembrar mais tarde
                </button>
                <button class="btn btn-warning" onclick="renewMLToken()">
                    <i class="fas fa-sync-alt"></i> Renovar Token Agora
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
}

window.renewMLToken = async function() {
    // Fechar modal de aviso
    const modals = document.querySelectorAll('.modal');
    modals.forEach(modal => modal.remove());
    
    // Abrir modal para novo token
    await requestTokenFromUser();
};

function checkMLTokenStatus() {
    if (!mlAccessToken || !mlTokenExpiresAt) {
        return { valid: false, message: 'Token não configurado' };
    }
    
    const now = Date.now();
    const expiresIn = mlTokenExpiresAt - now;
    
    if (expiresIn <= 0) {
        return { valid: false, message: 'Token expirado' };
    }
    
    const hoursLeft = Math.round(expiresIn / 3600000);
    const minutesLeft = Math.round((expiresIn % 3600000) / 60000);
    
    return { 
        valid: true, 
        message: `Token válido por ${hoursLeft}h ${minutesLeft}m`,
        expiresIn: expiresIn,
        hoursLeft: hoursLeft,
        minutesLeft: minutesLeft
    };
}

// ===== TESTAR CONEXÃO COM ML =====
async function testMLConnection() {
    if (!mlAccessToken) {
        showToast('⚠️ Token ML não configurado', 'warning');
        return false;
    }
    
    try {
        showToast('🔗 Testando conexão com Mercado Livre...', 'info');
        
        const response = await fetch(`${ML_CONFIG.API_BASE_URL}/users/me`, {
            headers: {
                'Authorization': `Bearer ${mlAccessToken}`,
                'Accept': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const userData = await response.json();
        console.log('✅ Conexão ML bem-sucedida:', userData);
        showToast(`✅ Conectado ao ML como ${userData.nickname}`, 'success');
        
        return true;
        
    } catch (error) {
        console.error('❌ Erro na conexão ML:', error);
        showToast('❌ Falha na conexão com Mercado Livre', 'error');
        return false;
    }
}

// ===== FUNÇÃO PARA TESTAR CONEXÃO COM ML =====
async function testMLConnection() {
    if (!mlAccessToken) {
        showToast('⚠️ Token ML não configurado', 'warning');
        return false;
    }
    
    try {
        showToast('🔗 Testando conexão com Mercado Livre...', 'info');
        
        const response = await fetch(`${ML_CONFIG.API_BASE_URL}/users/me`, {
            headers: {
                'Authorization': `Bearer ${mlAccessToken}`,
                'Accept': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const userData = await response.json();
        console.log('✅ Conexão ML bem-sucedida:', userData);
        showToast(`✅ Conectado ao ML como ${userData.nickname}`, 'success');
        
        return true;
        
    } catch (error) {
        console.error('❌ Erro na conexão ML:', error);
        showToast('❌ Falha na conexão com Mercado Livre', 'error');
        return false;
    }
}

window.abrirSistemaVendas = async function() {
    if (!currentUser) {
        showToast('⚠️ Faça login primeiro', 'warning');
        return;
    }

    const menuSystem = document.getElementById('menuSystem');
    if (menuSystem) menuSystem.classList.add('hidden');
    
    console.log('🛒 Iniciando sistema de vendas ML...');
    
    // Esconder outros sistemas
    if (mainSystem) mainSystem.classList.add('hidden');
    if (reembolsosSystem) reembolsosSystem.classList.add('hidden');
    if (caixaSystem) caixaSystem.classList.add('hidden');
    if (folgasSystem) folgasSystem.classList.add('hidden');
    if (shippingSystem) shippingSystem.classList.add('hidden');
    if (estoqueSystem) estoqueSystem.classList.add('hidden');
    if (perguntasSystem) perguntasSystem.classList.add('hidden');
    if (estoqueGestaoSystem) estoqueGestaoSystem.classList.add('hidden');
    if (entradasSystem) entradasSystem.classList.add('hidden');
    if (gerenciamentoAnunciosSystem) gerenciamentoAnunciosSystem.classList.add('hidden');
    
    // Mostrar sistema de vendas
    const salesSystem = document.getElementById('salesSystem');
    if (!salesSystem) {
        showToast('❌ Sistema de vendas não encontrado', 'error');
        return;
    }
    
    salesSystem.classList.remove('hidden');
    
    // Atualizar informações do usuário
    document.getElementById('salesUserName').textContent = currentUser.name;
    document.getElementById('salesUserAvatar').textContent = currentUser.avatar;
    document.getElementById('salesUserRole').textContent = currentUser.role;
    
    showToast('🔄 Carregando sistema de vendas...', 'info');
    
    try {
        // 1. Verificar conexão ML
        const token = await autoManageMLToken();
        if (!token) {
            showToast('❌ Falha na conexão com Mercado Livre', 'error');
            return;
        }
        
        // 2. Inicializar sistema de sincronização
        if (window.inicializarSistemaVendas) {
            await window.inicializarSistemaVendas();
        }
        
        // 3. Carregar dashboard
        if (window.carregarVendasDashboard) {
            await window.carregarVendasDashboard('hoje');
        }
        
        showToast('✅ Sistema de vendas carregado!', 'success');
        
    } catch (error) {
        console.error('Erro ao carregar sistema de vendas:', error);
        showToast('❌ Erro ao carregar vendas: ' + error.message, 'error');
    }
};

// ============================================
// FUNÇÃO SIMPLES PARA CONTADOR DE CARACTERES
// ============================================

// Adicione esta função no FINAL do seu arquivo script.js
function initContadorCaracteres() {
    console.log('Inicializando contador de caracteres...');
    
    // Aguardar o campo carregar
    setTimeout(() => {
        const campo = document.getElementById('productName');
        const contador = document.getElementById('contadorProduto');
        
        if (!campo || !contador) {
            console.log('Elementos não encontrados, tentando novamente...');
            setTimeout(initContadorCaracteres, 500);
            return;
        }
        
        console.log('Campo e contador encontrados!');
        
        // Função para atualizar o contador
        function atualizarContador() {
            const digitado = campo.value.length;
            const maximo = 200;
            
            contador.textContent = `${digitado}/${maximo}`;
            
            // Mudar cor conforme limite
            if (digitado >= maximo) {
                contador.style.color = '#dc3545';
                contador.style.fontWeight = 'bold';
            } else if (digitado >= 180) {
                contador.style.color = '#ffc107';
                contador.style.fontWeight = 'bold';
            } else {
                contador.style.color = '#6c757d';
                contador.style.fontWeight = 'normal';
            }
        }
        
        // Adicionar eventos
        campo.addEventListener('input', atualizarContador);
        campo.addEventListener('keyup', atualizarContador);
        campo.addEventListener('change', atualizarContador);
        
        // Atualizar valor inicial
        atualizarContador();
        
        // Sobrescrever clearForm globalmente (sem modificar a função original)
        const originalClearForm = window.clearForm;
        if (originalClearForm) {
            window.clearForm = function() {
                originalClearForm();
                setTimeout(atualizarContador, 100);
            };
        }
        
        // Sobrescrever editOrder globalmente (sem modificar a função original)
        const originalEditOrder = window.editOrder;
        if (originalEditOrder) {
            window.editOrder = function(orderId) {
                originalEditOrder(orderId);
                setTimeout(atualizarContador, 200);
            };
        }
        
        console.log('Contador de caracteres inicializado com sucesso!');
        
    }, 1000);
}

// ============================================
// CONFIGURAR BOTÃO DE VENDAS
// ============================================
function configurarBotaoVendas() {
    const vendasBtn = document.getElementById('vendasBtn');
    if (vendasBtn) {
        vendasBtn.addEventListener('click', function() {
            if (window.abrirSistemaVendas) {
                window.abrirSistemaVendas();
            } else {
                console.log('⏳ Aguardando carregamento do sistema de vendas...');
                setTimeout(() => {
                    if (window.abrirSistemaVendas) {
                        window.abrirSistemaVendas();
                    } else {
                        console.error('❌ abrirSistemaVendas não encontrado');
                    }
                }, 2000);
            }
        });
    }
}

document.addEventListener('DOMContentLoaded', function() {
    setTimeout(configurarBotaoVendas, 1000);
});

async function sincronizarVendasML() {
    if (salesSyncStatus.isRunning) return;

    const sellerId = '415176739'; // Definido no topo da função
    const token = window.mlTokenStatus ? window.mlTokenStatus.access_token : null;

    if (!token) return;

    salesSyncStatus.isRunning = true;

    try {
        const url = `https://api.mercadolibre.com/orders/search?seller=${sellerId}&order.status=paid&sort=date_desc`;
        const response = await fetch(`${window.WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(url)}&token=${token}`);
        
        const data = await response.json();
        if (data.results) {
            for (const venda of data.results) {
                const item = venda.order_items[0].item;
                
                await window.supabaseClient.from('vendas_ml').upsert({
                    id: venda.id,
                    sku: item.seller_sku || "SEM SKU",
                    meio_envio: venda.shipping?.id ? "Mercado Envios" : "A combinar",
                    buyer_nickname: venda.buyer?.nickname,
                    total_amount: venda.total_amount,
                    status: venda.status,
                    date_created: venda.date_created
                });
            }
        }
    } catch (e) {
        console.error("Erro na sync automática:", e);
    } finally {
        salesSyncStatus.isRunning = false;
    }
}

// ============================================
// FUNÇÕES PARA NAVEGAÇÃO ENTRE SISTEMAS
// ============================================

// Função para abrir sistema de reembolsos
window.abrirSistemaReembolsos = function() {
    if (!currentUser) {
        showToast('⚠️ Faça login primeiro', 'warning');
        return;
    }

    const menuSystem = document.getElementById('menuSystem');
    if (menuSystem) menuSystem.classList.add('hidden');
    
    console.log('💰 Iniciando sistema de reembolsos...');
    
    // Esconder outros sistemas - usando getElementById com verificação
    const sistemasIds = [
        'mainSystem', 'caixaSystem', 'salesSystem', 'precificacaoSystem', 'reviewsSystem', 
        'folgasSystem', 'shippingSystem', 'estoqueSystem', 'entradasSystem', 'perguntasSystem', 'feedbackSystem', 'promocoesSystem',
        'estoqueGestaoSystem', 'gerenciamentoAnunciosSystem'
    ];
    sistemasIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });
    
    // Mostrar sistema de reembolsos
    const reembolsosSystem = document.getElementById('reembolsosSystem');
    if (!reembolsosSystem) {
        showToast('❌ Sistema de reembolsos não encontrado', 'error');
        return;
    }
    
    reembolsosSystem.classList.remove('hidden');
    
    // Atualizar informações do usuário
    const reembolsoUserName = document.getElementById('reembolsoUserName');
    const reembolsoUserAvatar = document.getElementById('reembolsoUserAvatar');
    const reembolsoUserRole = document.getElementById('reembolsoUserRole');
    
    if (reembolsoUserName) reembolsoUserName.textContent = currentUser.name;
    if (reembolsoUserAvatar) reembolsoUserAvatar.textContent = currentUser.avatar;
    if (reembolsoUserRole) reembolsoUserRole.textContent = currentUser.role;
    
    // Carregar reembolsos
    if (window.loadReembolsos) {
        loadReembolsos();
    }
    
    showToast('💰 Sistema de Reembolsos carregado', 'info');
};

// Função para abrir sistema de conferência de caixa
window.abrirSistemaCaixa = function() {
    if (!currentUser) {
        showToast('⚠️ Faça login primeiro', 'warning');
        return;
    }

    const menuSystem = document.getElementById('menuSystem');
    if (menuSystem) menuSystem.classList.add('hidden');
    
    console.log('💰 Iniciando sistema de conferência de caixa...');
    
    // Esconder outros sistemas
    if (mainSystem) mainSystem.classList.add('hidden');
    if (reembolsosSystem) reembolsosSystem.classList.add('hidden');
    if (salesSystem) salesSystem.classList.add('hidden');
    if (reviewsSystem) reviewsSystem.classList.add('hidden');
    if (folgasSystem) folgasSystem.classList.add('hidden');
    if (shippingSystem) shippingSystem.classList.add('hidden');
    if (estoqueSystem) estoqueSystem.classList.add('hidden');
    if (perguntasSystem) perguntasSystem.classList.add('hidden');
    if (estoqueGestaoSystem) estoqueGestaoSystem.classList.add('hidden');
    if (feedbackSystem) feedbackSystem.classList.add('hidden');
    if (gerenciamentoAnunciosSystem) gerenciamentoAnunciosSystem.classList.add('hidden');
    
    // Mostrar sistema de caixa
    const caixaSystem = document.getElementById('caixaSystem');
    if (!caixaSystem) {
        showToast('❌ Sistema de caixa não encontrado', 'error');
        return;
    }
    
    caixaSystem.classList.remove('hidden');
    
    // Atualizar informações do usuário
    const caixaUserName = document.getElementById('caixaUserName');
    const caixaUserAvatar = document.getElementById('caixaUserAvatar');
    const caixaUserRole = document.getElementById('caixaUserRole');
    
    if (caixaUserName) caixaUserName.textContent = currentUser.name;
    if (caixaUserAvatar) caixaUserAvatar.textContent = currentUser.avatar;
    if (caixaUserRole) caixaUserRole.textContent = currentUser.role;
    
    // Carregar dados do caixa
    if (window.carregarCaixaDia) {
        carregarCaixaDia();
    }
    
    showToast('💰 Sistema de Conferência de Caixa carregado', 'info');
};

// Função para voltar ao sistema principal (OS)
window.voltarParaMenu = function() {
    // Lista de todos os sistemas que podem estar abertos
    const sistemas = ['mainSystem', 'salesSystem', 'reembolsosSystem', 'precificacaoSystem', 'caixaSystem', 'entradasSystem', 'promocoesSystem',
                      'reviewsSystem', 'folgasSystem', 'shippingSystem', 'estoqueSystem', 'feedbackSystem', 'perguntasSystem',
                      'estoqueGestaoSystem', 'gerenciamentoAnunciosSystem'];
    sistemas.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });
    const historyScreen = document.getElementById('historicoAcessosScreen');
    if (historyScreen) historyScreen.classList.add('hidden');
    // Mostrar menu
    const menu = document.getElementById('menuSystem');
    if (menu) menu.classList.remove('hidden');
    showToast('Menu principal', 'info');
};

// ============================================
// SISTEMA DE AVALIAÇÕES ML
// ============================================

// Elementos da aba de avaliações
const reviewsSystem = document.getElementById('reviewsSystem');
const reviewsBtn = document.getElementById('reviewsBtn');

// Função para abrir o sistema de avaliações
window.abrirSistemaReviews = function() {
    if (!currentUser) {
        showToast('⚠️ Faça login primeiro', 'warning');
        return;
    }

    const menuSystem = document.getElementById('menuSystem');
    if (menuSystem) menuSystem.classList.add('hidden');
    
    console.log('⭐ Iniciando sistema de avaliações...');
    
    // Esconder outros sistemas
    const sistemasIds = [
        'mainSystem', 'reembolsosSystem', 'salesSystem', 'precificacaoSystem', 'caixaSystem', 'entradasSystem',
        'folgasSystem', 'shippingSystem', 'estoqueSystem', 'perguntasSystem', 'promocoesSystem',
        'estoqueGestaoSystem', 'gerenciamentoAnunciosSystem'
    ];
    sistemasIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });
    
    // Mostrar sistema de avaliações
    const reviewsSystem = document.getElementById('reviewsSystem');
    if (!reviewsSystem) {
        showToast('❌ Sistema de avaliações não encontrado', 'error');
        return;
    }
    reviewsSystem.classList.remove('hidden');
    
    // Atualizar informações do usuário
    const reviewsUserName = document.getElementById('reviewsUserName');
    const reviewsUserAvatar = document.getElementById('reviewsUserAvatar');
    const reviewsUserRole = document.getElementById('reviewsUserRole');
    
    if (reviewsUserName) reviewsUserName.textContent = currentUser.name;
    if (reviewsUserAvatar) reviewsUserAvatar.textContent = currentUser.avatar;
    if (reviewsUserRole) reviewsUserRole.textContent = currentUser.role;
    
    // Limpar campos anteriores
    const mlbInput = document.getElementById('mlbInput');
    const reviewsResultCard = document.getElementById('reviewsResultCard');
    if (mlbInput) mlbInput.value = '';
    if (reviewsResultCard) reviewsResultCard.classList.add('hidden');
    
    showToast('⭐ Sistema de Avaliações carregado', 'info');
};

// Vincular evento do botão no cabeçalho
if (reviewsBtn) {
    reviewsBtn.addEventListener('click', abrirSistemaReviews);
}

// Função principal para buscar avaliações
window.buscarAvaliacoes = async function() {
    const mlbInput = document.getElementById('mlbInput').value.trim();
    if (!mlbInput) {
        showToast('Digite um MLB válido', 'warning');
        return;
    }
    
    // Se o MLB não começar com "MLB", adiciona automaticamente
    let itemId = mlbInput;
    if (!itemId.toUpperCase().startsWith('MLB')) {
        itemId = 'MLB' + itemId;
    }
    
    const btn = document.querySelector('button[onclick="buscarAvaliacoes()"]');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<span class="spinner"></span> Buscando...';
    btn.disabled = true;
    
    try {
        const resultado = await buscarReviewsML(itemId);
        if (resultado && resultado.success) {
            renderizarReviews(resultado.data);
        } else {
            showToast('Erro ao buscar avaliações: ' + (resultado?.error || 'Desconhecido'), 'error');
        }
    } catch (error) {
        console.error('❌ Erro ao buscar avaliações:', error);
        showToast('Erro ao buscar avaliações: ' + error.message, 'error');
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
};

// Função que faz a chamada à API via proxy (igual às vendas)
async function buscarReviewsML(itemId) {
    try {
        const tokenData = await getValidToken(); // retorna { access_token, refresh_token, expires_at }
        if (!tokenData || !tokenData.access_token) {
            throw new Error('Token não disponível');
        }
        const token = tokenData.access_token;

        let allReviews = [];
        let offset = 0;
        const limit = 50; // máximo permitido pela API do ML (pode ser 50)
        let total = null;
        let firstResponse = null;

        while (total === null || offset < total) {
            const apiUrl = `https://api.mercadolibre.com/reviews/item/${itemId}?limit=${limit}&offset=${offset}`;
            const proxyUrl = `${WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(apiUrl)}&token=${encodeURIComponent(token)}`;

            const response = await fetch(proxyUrl);
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }

            const data = await response.json();

            if (!firstResponse) {
                firstResponse = data; // guarda a primeira resposta para os resumos (rating_levels, rating_average)
                total = data.paging?.total || 0;
            }

            if (data.reviews && data.reviews.length > 0) {
                allReviews = allReviews.concat(data.reviews);
            }

            offset += limit;
        }

        // Monta o objeto final com os resumos da primeira página + todas as avaliações
        const resultadoFinal = {
            rating_average: firstResponse.rating_average,
            rating_levels: firstResponse.rating_levels,
            paging: {
                total: allReviews.length,
                offset: 0,
                limit: allReviews.length
            },
            reviews: allReviews
        };

        return { success: true, data: resultadoFinal };

    } catch (error) {
        console.error('❌ Erro em buscarReviewsML:', error);
        return { success: false, error: error.message };
    }
}

// Renderizar as avaliações na tela
function renderizarReviews(data) {
    const card = document.getElementById('reviewsResultCard');
    card.classList.remove('hidden');
    
    // Atualizar total de avaliações
    const totalReviews = data.reviews ? data.reviews.length : 0;
    document.getElementById('totalReviews').textContent = totalReviews + ' avaliações';
    
    // Resumo das estrelas
    const ratingAverage = data.rating_average || 0;
    const ratingLevels = data.rating_levels || {
        one_star: 0,
        two_star: 0,
        three_star: 0,
        four_star: 0,
        five_star: 0
    };
    
    let summaryHtml = `
        <div class="d-flex align-items-center mb-3">
            <h3 class="mb-0 mr-3">Média: ${ratingAverage.toFixed(1)} <i class="fas fa-star" style="color: #FFD700;"></i></h3>
        </div>
        <div class="row">
            <div class="col-md-6">
                <div><i class="fas fa-star" style="color: #FFD700;"></i> 5 estrelas: ${ratingLevels.five_star}</div>
                <div><i class="fas fa-star" style="color: #FFD700;"></i> 4 estrelas: ${ratingLevels.four_star}</div>
                <div><i class="fas fa-star" style="color: #FFD700;"></i> 3 estrelas: ${ratingLevels.three_star}</div>
            </div>
            <div class="col-md-6">
                <div><i class="fas fa-star" style="color: #FFD700;"></i> 2 estrelas: ${ratingLevels.two_star}</div>
                <div><i class="fas fa-star" style="color: #FFD700;"></i> 1 estrela: ${ratingLevels.one_star}</div>
            </div>
        </div>
    `;
    document.getElementById('reviewsSummary').innerHTML = summaryHtml;

    // Ordenar avaliações da mais recente para a mais antiga
    if (data.reviews && data.reviews.length > 0) {
        data.reviews.sort((a, b) => new Date(b.date_created) - new Date(a.date_created));
    }
    
    // Preencher tabela
    const tbody = document.getElementById('reviewsTableBody');
    tbody.innerHTML = '';
    
    if (!data.reviews || data.reviews.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="text-center py-5">
                    <i class="fas fa-star fa-3x mb-3" style="color: #5d666d; opacity: 0.5;"></i>
                    <h4 style="color: #6c757d;">Nenhuma avaliação encontrada</h4>
                    <p style="color: #6c757d;">Este anúncio ainda não possui avaliações.</p>
                </td>
            </tr>
        `;
        return;
    }
    
    data.reviews.forEach(review => {
        const row = document.createElement('tr');
        
        // Formatar datas
        const dataCriacao = new Date(review.date_created).toLocaleDateString('pt-BR');
        const dataCompra = review.buying_date ? new Date(review.buying_date).toLocaleString('pt-BR') : 'Não informada';
        
        // Estrelas
        let starsHtml = '';
        for (let i = 1; i <= 5; i++) {
            starsHtml += i <= review.rate ? 
                '<i class="fas fa-star" style="color: #FFD700;"></i>' : 
                '<i class="far fa-star" style="color: #ddd;"></i>';
        }
        
        row.innerHTML = `
            <td>${dataCriacao}</td>
            <td>${starsHtml}</td>
            <td><strong>${review.title || 'Sem título'}</strong></td>
            <td>${review.content || ''}</td>
            <td>${dataCompra}</td>
        `;
        tbody.appendChild(row);
    });
}

window.abrirSistemaVendas = async function() {
    if (!currentUser) {
        showToast('⚠️ Faça login primeiro', 'warning');
        return;
    }

    const menuSystem = document.getElementById('menuSystem');
    if (menuSystem) menuSystem.classList.add('hidden');
    
    console.log('🛒 Iniciando sistema de vendas ML...');
    
    // Esconder outros sistemas
    if (mainSystem) mainSystem.classList.add('hidden');
    if (reembolsosSystem) reembolsosSystem.classList.add('hidden');
    if (caixaSystem) caixaSystem.classList.add('hidden');
    if (perguntasSystem) perguntasSystem.classList.add('hidden');
    if (estoqueGestaoSystem) estoqueGestaoSystem.classList.add('hidden');
    if (entradasSystem) entradasSystem.classList.add('hidden');
    if (gerenciamentoAnunciosSystem) gerenciamentoAnunciosSystem.classList.add('hidden');
    
    // Mostrar sistema de vendas
    const salesSystem = document.getElementById('salesSystem');
    if (!salesSystem) {
        showToast('❌ Sistema de vendas não encontrado', 'error');
        return;
    }
    
    salesSystem.classList.remove('hidden');
    
    // Atualizar informações do usuário
    document.getElementById('salesUserName').textContent = currentUser.name;
    document.getElementById('salesUserAvatar').textContent = currentUser.avatar;
    document.getElementById('salesUserRole').textContent = currentUser.role;
    
    showToast('🔄 Carregando sistema de vendas...', 'info');
    
    try {
        // 1. Verificar conexão ML
        const token = await autoManageMLToken();
        if (!token) {
            showToast('❌ Falha na conexão com Mercado Livre', 'error');
            return;
        }
        
        // 2. Inicializar sistema de vendas
        if (window.inicializarSistemaVendas) {
            await window.inicializarSistemaVendas();
        }
        
        // 3. Carregar dashboard
        if (window.carregarVendasDashboard) {
            await window.carregarVendasDashboard('hoje');
        }
        
        showToast('✅ Sistema de vendas carregado!', 'success');
        
    } catch (error) {
        console.error('Erro ao carregar sistema de vendas:', error);
        showToast('❌ Erro ao carregar vendas: ' + error.message, 'error');
    }
};

// ============================================
// FUNÇÃO ATUALIZAR VENDAS - VERSÃO FINAL 
// ============================================

window.atualizarVendas = async function() {
    const btn = document.querySelector('button[onclick="atualizarVendas()"]');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Auditando Logística e Estoque...';
    }
    
    try {
        const sellerId = '415176739';
        const token = window.mlTokenStatus?.access_token || localStorage.getItem('ml_access_token');
        if (!token) return alert('Sessão expirada. Recarregue a página.');

        const workerUrl = 'https://purple-bonus-3b1c.andmiotto1998.workers.dev';
        const mlUrl = `https://api.mercadolibre.com/orders/search?seller=${sellerId}&order.status=paid&sort=date_desc&limit=30`;
        const proxyUrl = `${workerUrl}/api/ml/proxy?url=${encodeURIComponent(mlUrl)}&token=${token}`;

        const response = await fetch(proxyUrl);
        const data = await response.json();
        const vendasResumo = data.results || [];

        for (const resumo of vendasResumo) {
            // 1. BUSCA DETALHADA DA ORDEM (Para não errar o meio de envio)
            const orderDetailUrl = `https://api.mercadolibre.com/orders/${resumo.id}`;
            const detailRes = await fetch(`${workerUrl}/api/ml/proxy?url=${encodeURIComponent(orderDetailUrl)}&token=${token}`);
            const venda = await detailRes.json();

            let meio = "MERCADO ENVIOS";
            let estoqueReal = null;

            // 2. IDENTIFICAÇÃO DE LOGÍSTICA (Baseada no Shipment ID)
            const shipping = venda.shipping || {};
            const tags = (venda.tags || []).map(t => t.toLowerCase());
            
            // Consultamos o Shipment para ter certeza absoluta entre FULL e FLEX
            if (shipping.id) {
                const shipUrl = `https://api.mercadolibre.com/shipments/${shipping.id}`;
                const shipRes = await fetch(`${workerUrl}/api/ml/proxy?url=${encodeURIComponent(shipUrl)}&token=${token}`);
                const shipData = await shipRes.json();
                
                const logType = (shipData.logistic_type || "").toLowerCase();
                if (logType === 'fulfillment') meio = "FULL";
                else if (logType === 'self_service') meio = "FLEX";
                else if (logType === 'cross_docking') meio = "COLETA";
            } 
            // Fallback por tags se o shipment falhar
            else if (tags.includes('fulfillment')) meio = "FULL";
            else if (tags.includes('self_service')) meio = "FLEX";

            // 3. BUSCA DE ESTOQUE (Conforme o tipo de anúncio)
            const orderItem = venda.order_items?.[0] || {};
            const itemBase = orderItem.item || {};

            if (itemBase.id) {
                const itemUrl = `https://api.mercadolibre.com/items/${itemBase.id}`;
                const itemRes = await fetch(`${workerUrl}/api/ml/proxy?url=${encodeURIComponent(itemUrl)}&token=${token}`);
                const itemData = await itemRes.json();

                // Se for FULL, o estoque real costuma estar no inventory_id
                if (meio === "FULL" && itemData.inventory_id) {
                    const invUrl = `https://api.mercadolibre.com/inventories/${itemData.inventory_id}/stock`;
                    const invRes = await fetch(`${workerUrl}/api/ml/proxy?url=${encodeURIComponent(invUrl)}&token=${token}`);
                    const invData = await invRes.json();
                    estoqueReal = invData.total?.available_quantity;
                } else {
                    // Estoque convencional (considerando variações)
                    if (itemBase.variation_id && itemData.variations) {
                        const v = itemData.variations.find(v => String(v.id) === String(itemBase.variation_id));
                        estoqueReal = v ? v.available_quantity : itemData.available_quantity;
                    } else {
                        estoqueReal = itemData.available_quantity;
                    }
                }
            }

            // 4. SALVAMENTO NO SUPABASE
            const dadosParaSalvar = {
                order_id: String(venda.id),
                buyer_nickname: venda.buyer?.nickname || 'N/A',
                total_amount: venda.total_amount,
                sku: itemBase.seller_sku || "SEM SKU",
                meio_envio: meio,
                produto_titulo: itemBase.title || "Sem título",
                estoque_restante: estoqueReal !== null ? Number(estoqueReal) : null,
                date_created: venda.date_created,
                last_updated: new Date().toISOString()
            };

            await supabaseClient.from('vendas_ml').upsert(dadosParaSalvar, { onConflict: 'order_id' });
        }

        alert('✅ Atualização concluída! Logística e Estoque auditados.');
        if (window.carregarVendasDashboard) await window.carregarVendasDashboard('hoje');

    } catch (err) {
        console.error('Erro geral na atualização:', err);
        alert('Erro ao atualizar. Verifique o console.');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = 'Atualizar Vendas'; }
    }
};

// Inicializar quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', function() {
    // Chamar depois de um tempo para garantir que tudo carregou
    setTimeout(initContadorCaracteres, 2000);
});

// ============================================
// BOTÃO PARA SINCRONIZAR VENDAS MANUALMENTE
// ============================================

window.forcarSincronizacaoVendas = async function() {
    const btn = document.querySelector('button[onclick="forcarSincronizacaoVendas()"]');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-sync-alt fa-spin"></i> Sincronizando...';
    }
    
    try {
        if (window.sincronizarVendasComSupabase) {
            await window.sincronizarVendasComSupabase();
        } else {
            showToast('❌ Função de sincronização não encontrada', 'error');
        }
    } catch (error) {
        console.error('❌ Erro na sincronização:', error);
        showToast('❌ Erro ao sincronizar: ' + error.message, 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-sync-alt"></i> Sincronizar Vendas ML';
        }
    }
};

// ============================================
// BOTÃO PARA ATUALIZAR LISTA DE VENDAS
// ============================================

window.atualizarVendas = async function() {
    showToast('🔄 Atualizando lista de vendas...', 'info');
    
    try {
        if (window.buscarVendasML) {
            const vendas = await window.buscarVendasML(50);
            console.log('Vendas atualizadas:', vendas.length);
            
            // Aqui você pode chamar a função que renderiza as vendas
            if (window.renderizarVendasML) {
                window.renderizarVendasML(vendas);
                showToast(`✅ ${vendas.length} vendas carregadas`, 'success');
            } else {
                showToast('⚠️ Função de renderização não encontrada', 'warning');
            }
        } else {
            showToast('❌ Função de busca não encontrada', 'error');
        }
    } catch (error) {
        console.error('❌ Erro ao atualizar vendas:', error);
        showToast('❌ Erro ao atualizar: ' + error.message, 'error');
    }
};

// Adicionar script de conferência de vendas
    //const script = document.createElement('script');
    //script.src = 'vendas_conferencia.js';
    //document.body.appendChild(script);

    // ============================================
// FUNÇÕES DE SELEÇÃO MÚLTIPLA DE OS PARA IMPRESSÃO
// ============================================

// Variáveis para controle de seleção
let selectedOSForPrint = [];
let selectModeActive = false;

// ===== FUNÇÃO PARA ATIVAR MODO DE SELEÇÃO =====
window.ativarModoSelecaoOS = function() {
    selectModeActive = !selectModeActive;
    
    const selectBtn = document.getElementById('selectOSBtn');
    if (selectBtn) {
        if (selectModeActive) {
            selectBtn.innerHTML = '<i class="fas fa-times"></i> Cancelar Seleção';
            selectBtn.classList.add('btn-danger');
            selectBtn.classList.remove('btn-success');
            
            // Adicionar coluna de checkbox na tabela
            adicionarColunaSelecao();
            
            // Mostrar barra de ações
            document.getElementById('selectedOSBar').classList.remove('hidden');
            
            showToast('✅ Modo de seleção ativado - Marque as OS que deseja imprimir', 'success');
        } else {
            cancelarModoSelecao();
        }
    }
};

// ===== FUNÇÃO PARA ADICIONAR COLUNA DE CHECKBOX =====
function adicionarColunaSelecao() {
    const table = document.getElementById('osTableBody');
    if (!table) return;
    
    // Limpar seleções anteriores
    selectedOSForPrint = [];
    atualizarContadorSelecionados();
    
    // Adicionar checkbox em cada linha
    const rows = table.querySelectorAll('tr');
    rows.forEach((row, index) => {
        // Verificar se já não tem checkbox
        if (row.querySelector('.os-select-checkbox')) return;
        
        // Criar checkbox
        const checkboxCell = document.createElement('td');
        checkboxCell.style.width = '40px';
        checkboxCell.style.textAlign = 'center';
        checkboxCell.innerHTML = `
            <input type="checkbox" 
                   class="os-select-checkbox" 
                   data-os-index="${index}"
                   onchange="toggleOSSelection(this, ${index})"
                   style="width: 18px; height: 18px; cursor: pointer;">
        `;
        
        // Inserir no início da linha
        row.insertBefore(checkboxCell, row.firstChild);
    });
}

// ===== FUNÇÃO PARA ALTERNAR SELEÇÃO DE OS =====
window.toggleOSSelection = function(checkbox, index) {
    const row = checkbox.closest('tr');
    
    // Encontrar a OS correspondente
    let userOrders = filterOrdersByUser(orders);
    let filteredOrders = currentFilter === 'todos' ? userOrders : 
                         userOrders.filter(order => order.status === currentFilter);
    
    const os = filteredOrders[index];
    
    if (!os) return;
    
    if (checkbox.checked) {
        // Adicionar à seleção
        selectedOSForPrint.push(os);
        
        // Destacar linha
        row.style.backgroundColor = '#e8f0fe';
        row.style.borderLeft = '4px solid #8A2BE2';
    } else {
        // Remover da seleção
        selectedOSForPrint = selectedOSForPrint.filter(o => o.id !== os.id);
        
        // Remover destaque
        row.style.backgroundColor = '';
        row.style.borderLeft = '';
    }
    
    // Atualizar contador
    atualizarContadorSelecionados();
};

// ===== FUNÇÃO PARA ATUALIZAR CONTADOR DE SELEÇÃO =====
function atualizarContadorSelecionados() {
    const count = selectedOSForPrint.length;
    document.getElementById('selectedOSCount').textContent = count;
    
    // Habilitar/desabilitar botões
    const printSelectedBtn = document.getElementById('printSelectedOSBtn');
    if (printSelectedBtn) {
        printSelectedBtn.disabled = count === 0;
    }
}

// ===== FUNÇÃO PARA SELECIONAR TODAS AS OS =====
window.selecionarTodasOS = function() {
    const checkboxes = document.querySelectorAll('.os-select-checkbox');
    
    checkboxes.forEach((checkbox, index) => {
        if (!checkbox.checked) {
            checkbox.checked = true;
            
            // Disparar evento de seleção
            const event = new Event('change', { bubbles: true });
            checkbox.dispatchEvent(event);
            
            // Chamar toggleOSSelection manualmente
            const row = checkbox.closest('tr');
            
            let userOrders = filterOrdersByUser(orders);
            let filteredOrders = currentFilter === 'todos' ? userOrders : 
                                 userOrders.filter(order => order.status === currentFilter);
            
            const os = filteredOrders[index];
            if (os && !selectedOSForPrint.find(o => o.id === os.id)) {
                selectedOSForPrint.push(os);
                
                // Destacar linha
                row.style.backgroundColor = '#e8f0fe';
                row.style.borderLeft = '4px solid #8A2BE2';
            }
        }
    });
    
    atualizarContadorSelecionados();
    showToast(`✅ ${selectedOSForPrint.length} OS selecionadas`, 'success');
};

// ===== FUNÇÃO PARA LIMPAR SELEÇÃO =====
window.limparSelecaoOS = function() {
    const checkboxes = document.querySelectorAll('.os-select-checkbox');
    
    checkboxes.forEach((checkbox, index) => {
        if (checkbox.checked) {
            checkbox.checked = false;
            
            // Remover destaque da linha
            const row = checkbox.closest('tr');
            row.style.backgroundColor = '';
            row.style.borderLeft = '';
        }
    });
    
    selectedOSForPrint = [];
    atualizarContadorSelecionados();
    showToast('🧹 Seleção limpa', 'info');
};

// ===== FUNÇÃO PARA CANCELAR MODO DE SELEÇÃO =====
function cancelarModoSelecao() {
    selectModeActive = false;
    
    // Resetar botão
    const selectBtn = document.getElementById('selectOSBtn');
    if (selectBtn) {
        selectBtn.innerHTML = '<i class="fas fa-check-double"></i> Selecionar OS';
        selectBtn.classList.remove('btn-danger');
        selectBtn.classList.add('btn-success');
    }
    
    // Remover coluna de checkbox
    const table = document.getElementById('osTableBody');
    if (table) {
        const rows = table.querySelectorAll('tr');
        rows.forEach(row => {
            const firstCell = row.querySelector('td:first-child');
            if (firstCell && firstCell.querySelector('.os-select-checkbox')) {
                row.removeChild(firstCell);
            }
            
            // Remover destaque
            row.style.backgroundColor = '';
            row.style.borderLeft = '';
        });
    }
    
    // Limpar seleção
    selectedOSForPrint = [];
    
    // Esconder barra de ações
    document.getElementById('selectedOSBar').classList.add('hidden');
    
    showToast('Modo de seleção desativado', 'info');
}

// ===== FUNÇÃO PARA IMPRIMIR OS SELECIONADAS =====
window.imprimirOSSelecionadas = function() {
    if (selectedOSForPrint.length === 0) {
        showToast('Nenhuma OS selecionada', 'warning');
        return;
    }
    
    // Abrir janela de impressão
    const printWindow = window.open('', '_blank', 'width=1200,height=800');
    
    // Gerar HTML para impressão
    const printHTML = gerarHTMLImpressaoMultipla(selectedOSForPrint);
    
    printWindow.document.write(printHTML);
    printWindow.document.close();
    
    // Fechar modo de seleção após impressão
    setTimeout(() => {
        if (selectModeActive) {
            cancelarModoSelecao();
        }
    }, 500);
};

// ===== FUNÇÃO PARA GERAR HTML DE IMPRESSÃO MÚLTIPLA EM FORMATO DE LISTA =====
function gerarHTMLImpressaoMultipla(oss) {
    const hoje = new Date().toLocaleDateString('pt-BR');
    const hora = new Date().toLocaleTimeString('pt-BR');
    
    // Ordenar OS por código/número
    const ossOrdenadas = [...oss].sort((a, b) => {
        const numA = parseInt(a.code?.replace(/\D/g, '')) || 0;
        const numB = parseInt(b.code?.replace(/\D/g, '')) || 0;
        return numA - numB;
    });
    
    let listaHTML = '';
    let contador = 1;
    
    ossOrdenadas.forEach((os) => {
        // Extrair apenas os campos necessários
        const osNumber = os.code || `OS-${os.id}`;
        const numeroLimpo = osNumber.replace(/\D/g, ''); // Pega só os números
        
        // Usar o número sequencial da lista (1, 2, 3...) ou o número da OS
        const numeroExibicao = contador.toString().padStart(3, '0');
        
        const productName = os.productName || 'Produto não informado';
        const description = os.observations || 'Sem descrição';
        const sku = Array.isArray(os.skus) ? os.skus.join(', ') : (os.skus || 'N/A');
        
        listaHTML += `
            <div class="lista-item">
                <div class="item-numero">${numeroExibicao}</div>
                <div class="item-conteudo">
                    <div class="item-produto">${productName}</div>
                    <div class="item-descricao">${description}</div>
                    <div class="item-sku">SKU: ${sku}</div>
                </div>
                <div class="item-codigo">#${numeroLimpo}</div>
            </div>
        `;
        
        contador++;
    });
    
    return `
        <!DOCTYPE html>
        <html lang="pt-br">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Lista de OS para Impressão</title>
            <style>
                @media print {
                    @page {
                        size: A4;
                        margin: 1.5cm;
                    }
                    
                    body {
                        font-family: 'Courier New', monospace;
                        margin: 0;
                        padding: 0;
                        background: white;
                        color: black;
                        font-size: 11pt;
                        line-height: 1.3;
                    }
                    
                    .print-header {
                        margin-bottom: 20px;
                        padding-bottom: 10px;
                        border-bottom: 2px solid #000;
                    }
                    
                    .print-header h1 {
                        font-size: 18pt;
                        margin: 0 0 5px 0;
                        font-weight: bold;
                    }
                    
                    .print-header p {
                        margin: 0;
                        font-size: 10pt;
                        color: #333;
                    }
                    
                    .lista-container {
                        width: 100%;
                    }
                    
                    .lista-item {
                        display: flex;
                        align-items: flex-start;
                        gap: 15px;
                        padding: 8px 0;
                        border-bottom: 1px dotted #ccc;
                        page-break-inside: avoid;
                    }
                    
                    .item-numero {
                        font-weight: bold;
                        font-size: 12pt;
                        min-width: 40px;
                        text-align: right;
                        color: #000;
                    }
                    
                    .item-conteudo {
                        flex: 1;
                    }
                    
                    .item-produto {
                        font-weight: bold;
                        font-size: 11pt;
                        margin-bottom: 2px;
                    }
                    
                    .item-descricao {
                        font-size: 10pt;
                        color: #444;
                        margin-bottom: 2px;
                        font-style: italic;
                    }
                    
                    .item-sku {
                        font-size: 9pt;
                        color: #666;
                        font-family: monospace;
                    }
                    
                    .item-codigo {
                        font-size: 9pt;
                        color: #888;
                        min-width: 60px;
                        text-align: right;
                        font-family: monospace;
                    }
                    
                    .print-footer {
                        margin-top: 30px;
                        padding-top: 15px;
                        border-top: 1px solid #ccc;
                        font-size: 8pt;
                        color: #666;
                        text-align: center;
                    }
                    
                    .total-badge {
                        display: inline-block;
                        background: #000;
                        color: white;
                        padding: 3px 10px;
                        border-radius: 20px;
                        font-size: 9pt;
                        margin-top: 10px;
                    }
                    
                    /* Estilo para primeira página */
                    .cover-info {
                        text-align: center;
                        margin-bottom: 30px;
                    }
                    
                    .cover-info h2 {
                        font-size: 24pt;
                        margin: 0;
                    }
                    
                    .cover-info .data {
                        font-size: 11pt;
                        color: #666;
                    }
                }
                
                @media screen {
                    body {
                        font-family: 'Courier New', monospace;
                        margin: 20px;
                        background: #f5f5f5;
                    }
                    
                    .print-container {
                        max-width: 210mm;
                        margin: 0 auto;
                        background: white;
                        padding: 20mm;
                        box-shadow: 0 5px 15px rgba(0,0,0,0.1);
                        border-radius: 3px;
                    }
                    
                    .print-controls {
                        text-align: center;
                        margin: 20px 0;
                        padding: 15px;
                        background: white;
                        border-radius: 8px;
                        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                    }
                    
                    .print-btn {
                        padding: 12px 30px;
                        background: #8A2BE2;
                        color: white;
                        border: none;
                        border-radius: 5px;
                        font-size: 16px;
                        cursor: pointer;
                        margin: 0 10px;
                        transition: all 0.3s;
                    }
                    
                    .print-btn:hover {
                        background: #7a1bd2;
                        transform: translateY(-2px);
                        box-shadow: 0 4px 8px rgba(138, 43, 226, 0.3);
                    }
                    
                    .close-btn {
                        background: #6c757d;
                    }
                    
                    .close-btn:hover {
                        background: #5a6268;
                    }
                    
                    .lista-item {
                        display: flex;
                        align-items: flex-start;
                        gap: 15px;
                        padding: 10px;
                        border-bottom: 1px solid #eee;
                    }
                    
                    .lista-item:hover {
                        background: #f8f9fa;
                    }
                }
            </style>
        </head>
        <body>
            <div class="print-controls no-print">
                <h2>📋 Lista de OS para Impressão</h2>
                <p>${oss.length} OS selecionada(s) - Formato de lista</p>
                <button class="print-btn" onclick="window.print()">
                    <i class="fas fa-print"></i> Imprimir Lista
                </button>
                <button class="print-btn close-btn" onclick="window.close()">
                    <i class="fas fa-times"></i> Fechar
                </button>
            </div>
            
            <div class="print-container">
                <!-- Cabeçalho -->
                <div class="print-header">
                    <h1>📋 LISTA DE ORDENS DE SERVIÇO</h1>
                    <p>Data: ${hoje} | Hora: ${hora} | Emitido por: ${currentUser?.name || 'Sistema'}</p>
                    <div class="total-badge">Total: ${oss.length} OS</div>
                </div>
                
                <!-- Lista -->
                <div class="lista-container">
                    ${listaHTML}
                </div>
                
                <!-- Rodapé -->
                <div class="print-footer">
                    <p>Documento gerado automaticamente pelo Sistema Wheel Tech</p>
                    <p>Lista de OS - Página 1 de 1</p>
                </div>
            </div>
            
            <script>
                window.onload = function() {
                    setTimeout(function() {
                        window.print();
                    }, 1000);
                };
                
                window.onafterprint = function() {
                    setTimeout(function() {
                        window.close();
                    }, 1000);
                };
            <\/script>
        </body>
        </html>
    `;
}

// ============================================
// NOTIFICAÇÃO DE NOVA OS PARA O RESPONSÁVEL
// ============================================
async function notifyResponsibleNewOS(orderData, responsibleName) {
    if (responsibleName === currentUser.name) return;
    const assunto = `📸 Nova OS atribuída a você - ${orderData.code}`;
    const mensagem = `
    
    Olá ${responsibleName},

    Uma nova Ordem de Serviço foi atribuída a você.

    📄 Número da OS: ${orderData.code}
    👤 Criado por: ${orderData.createdBy || currentUser.name}
    🛠 Serviço: ${orderData.service || 'Não informado'}

    📝 Observação:
    ${orderData.observacao || 'Nenhuma observação'}

    🚨 Devolução urgente: ${orderData.devolucaoUrgente ? 'SIM - PRIORIDADE' : 'Não'}

    Acesse o sistema para visualizar todos os detalhes.

    Sistema Wheel Tech`; // sua mensagem
    await enviarNotificacaoEmail(responsibleName, assunto, mensagem);
}

function normalizarNomeNotificacaoOS(valor) {
    return String(valor || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

async function obterOSNaoLidasUsuarioAtual() {
    if (
        !currentUser ||
        !supabaseClient
    ) {
        return [];
    }

    const nomesUsuario = [
        currentUser.name,
        currentUser.nome,
        currentUser.username,
        currentUser.login,
        currentUser.usuario
    ]
        .map(normalizarNomeNotificacaoOS)
        .filter(Boolean);

    if (!nomesUsuario.length) {
        return [];
    }

    try {
        const {
            data,
            error
        } = await supabaseClient
            .from('ordens_service')
            .select(`
                id,
                codigo,
                produto_nome,
                responsavel,
                user_notified,
                data_criacao
            `)
            .or(
                'user_notified.eq.false,user_notified.is.null'
            )
            .order(
                'data_criacao',
                {
                    ascending: false
                }
            );

        if (error) {
            throw error;
        }

        return (data || []).filter(os => {
            const responsavel =
                normalizarNomeNotificacaoOS(
                    os.responsavel
                );

            return nomesUsuario.some(nome => {
                return (
                    responsavel === nome ||
                    responsavel.includes(nome)
                );
            });
        });

    } catch (error) {
        console.error(
            '❌ Erro buscando notificações de OS:',
            error
        );

        return [];
    }
}

async function updateOSNotificationBell() {
    try {
        await updateNotificationBadge();

    } catch (error) {
        console.error(
            '❌ Erro atualizando o sino das OS:',
            error
        );
    }
}

async function marcarOSComoLidas() {
    if (
        !currentUser ||
        !supabaseClient
    ) {
        return;
    }

    try {
        const osNaoLidas =
            await obterOSNaoLidasUsuarioAtual();

        const ids =
            osNaoLidas
                .map(os => os.id)
                .filter(Boolean);

        if (!ids.length) {
            await updateOSNotificationBell();
            return;
        }

        const {
            error
        } = await supabaseClient
            .from('ordens_service')
            .update({
                user_notified: true
            })
            .in(
                'id',
                ids
            );

        if (error) {
            throw error;
        }

        if (Array.isArray(orders)) {
            orders.forEach(order => {
                if (
                    ids.some(
                        id =>
                            String(id) ===
                            String(order.id)
                    )
                ) {
                    order.user_notified =
                        true;
                }
            });
        }

        await updateOSNotificationBell();

        if (
            typeof updateNotificationsUI ===
            'function'
        ) {
            await updateNotificationsUI();
        }

    } catch (error) {
        console.error(
            '❌ Erro marcando notificações das OS como lidas:',
            error
        );
    }
}

function iniciarMonitorNotificacoesOS() {
    if (
        window.__monitorNotificacoesOS
    ) {
        clearInterval(
            window.__monitorNotificacoesOS
        );
    }

    const atualizarSino =
        async () => {
            if (
                typeof currentUser ===
                    'undefined' ||
                !currentUser ||
                !supabaseClient
            ) {
                return;
            }

            try {
                await updateNotificationBadge();

            } catch (error) {
                console.error(
                    '❌ Erro no monitor de notificações:',
                    error
                );
            }
        };

    setTimeout(
        atualizarSino,
        1000
    );

    window.__monitorNotificacoesOS =
        setInterval(
            atualizarSino,
            10000
        );
}

// ============================================
// NOTIFICAR ANDRESSA SOBRE NOVO REEMBOLSO
// ============================================
async function notificarAndressaNovoReembolso(reembolsoData) {
    const destinatario = 'Leticia';
    const assunto = `💰 Novo reembolso para verificar - Venda ${reembolsoData.numero_venda}`;
    const mensagem = `
    Novo reembolso para verificar!
    Entre no sistema para mais detalhes.
    `; // sua mensagem
    await enviarNotificacaoEmail(destinatario, assunto, mensagem);
}

// ===== ADICIONAR BOTÕES NA INTERFACE =====
function adicionarBotoesSelecaoOS() {
    // Verificar se já existe
    if (document.getElementById('selectOSBtn')) return;
    
    // Encontrar o container dos botões de filtro
    const filterContainer = document.querySelector('.filter-group');
    if (!filterContainer) return;
    
    // Criar botão de seleção
    const selectBtn = document.createElement('button');
    selectBtn.id = 'selectOSBtn';
    selectBtn.className = 'btn btn-success';
    selectBtn.innerHTML = '<i class="fas fa-check-double"></i> Selecionar OS';
    selectBtn.onclick = window.ativarModoSelecaoOS;
    
    // Adicionar após os filtros
    filterContainer.parentNode.insertBefore(selectBtn, filterContainer.nextSibling);
    
    // Criar barra de ações para OS selecionadas
    const selectedBar = document.createElement('div');
    selectedBar.id = 'selectedOSBar';
    selectedBar.className = 'selected-os-bar hidden';
    selectedBar.innerHTML = `
        <div style="background: #f0f0f0; padding: 10px 20px; margin: 10px 0; border-radius: 8px; display: flex; align-items: center; justify-content: space-between; border-left: 4px solid #8A2BE2;">
            <div>
                <i class="fas fa-check-circle" style="color: #8A2BE2;"></i>
                <strong id="selectedOSCount">0</strong> OS selecionada(s)
            </div>
            <div style="display: flex; gap: 10px;">
                <button class="btn btn-sm btn-info" onclick="selecionarTodasOS()">
                    <i class="fas fa-check-double"></i> Selecionar Todas
                </button>
                <button class="btn btn-sm btn-warning" onclick="limparSelecaoOS()">
                    <i class="fas fa-eraser"></i> Limpar
                </button>
                <button class="btn btn-sm btn-primary" id="printSelectedOSBtn" onclick="imprimirOSSelecionadas()" disabled>
                    <i class="fas fa-print"></i> Imprimir Selecionadas
                </button>
                <button class="btn btn-sm btn-danger" onclick="ativarModoSelecaoOS()">
                    <i class="fas fa-times"></i> Cancelar
                </button>
            </div>
        </div>
    `;
    
    // Inserir após a tabela
    const tableContainer = document.querySelector('.table-responsive');
    if (tableContainer) {
        tableContainer.parentNode.insertBefore(selectedBar, tableContainer.nextSibling);
    }
}

window.abrirSistemaFrete = function() {
    if (!currentUser) {
        showToast('⚠️ Faça login primeiro', 'warning');
        return;
    }

    const menuSystem = document.getElementById('menuSystem');
    if (menuSystem) menuSystem.classList.add('hidden');

    const sistemasIds = [
        'mainSystem', 'salesSystem', 'reembolsosSystem', 'perguntasSystem', 'precificacaoSystem', 'promocoesSystem',
        'caixaSystem', 'reviewsSystem', 'folgasSystem', 'estoqueSystem', 'feedbackSystem', 'entradasSystem',
        'estoqueGestaoSystem', 'nfeSystem', 'gerenciamentoAnunciosSystem'
    ];
    sistemasIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });

    const shippingSystem = document.getElementById('shippingSystem');
    if (shippingSystem) shippingSystem.classList.remove('hidden');

    document.getElementById('shippingUserName').textContent = currentUser.name;
    document.getElementById('shippingUserAvatar').textContent = currentUser.avatar;
    document.getElementById('shippingUserRole').textContent = currentUser.role;

    // Carregar dados salvos imediatamente
    if (typeof window.carregarFretesSalvos === 'function') {
        window.carregarFretesSalvos();
    } else {
        const script = document.createElement('script');
        script.src = 'shipping_simple.js?v=' + Date.now();
        script.onload = function() {
            if (typeof window.carregarFretesSalvos === 'function') {
                window.carregarFretesSalvos();
            }
            const btn = document.getElementById('btnBuscarFretes');
            if (btn) btn.onclick = window.buscarFretes;
        };
        document.head.appendChild(script);
    }

    const btn = document.getElementById('btnBuscarFretes');
    if (btn) {
        btn.onclick = window.buscarFretes;
    }

    showToast('📦 Sistema de Frete carregado', 'info');
};

// ============================================
// FUNÇÃO PARA ABRIR SISTEMA DE EMISSÃO DE NF-e
// ============================================
// ============================================
// FUNÇÃO PARA ABRIR SISTEMA DE EMISSÃO DE NF-e
// ============================================
window.abrirSistemaNFE = async function() {
    if (!currentUser) {
        showToast('⚠️ Faça login primeiro', 'warning');
        return;
    }

    // Esconde o menu principal e outros sistemas
    const menuSystem = document.getElementById('menuSystem');
    if (menuSystem) menuSystem.classList.add('hidden');

    const sistemasIds = [
        'mainSystem', 'salesSystem', 'reembolsosSystem', 'precificacaoSystem', 'caixaSystem', 'promocoesSystem',
        'reviewsSystem', 'folgasSystem', 'shippingSystem', 'estoqueSystem', 'feedbackSystem', 'entradasSystem',
        'perguntasSystem', 'estoqueGestaoSystem', 'gerenciamentoAnunciosSystem'
    ];
    sistemasIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });

    // Container da NF-e (usando o mesmo ID do original)
    let nfeContainer = document.getElementById('estoqueSystem');
    if (!nfeContainer) {
        nfeContainer = document.createElement('div');
        nfeContainer.id = 'estoqueSystem';
        nfeContainer.className = 'hidden';
        document.body.appendChild(nfeContainer);
    }

    // Se o container já tiver conteúdo, apenas mostra e atualiza dados
    if (nfeContainer.querySelector('.main-header')) {
        nfeContainer.classList.remove('hidden');
        atualizarHeaderNFE();
        // Carrega a aba padrão (Vendas)
        if (typeof mostrarAbaNFE === 'function') {
            mostrarAbaNFE('vendas');
        } else {
            carregarVendasPendentes();
        }
        return;
    }

    // ===== CONSTRUÇÃO DA ESTRUTURA HTML =====
    nfeContainer.innerHTML = `
        <header class="main-header">
            <div class="container">
                <div class="header-content">
                    <h1 style="display: flex; align-items: center; gap: 10px;">
                        <img src="logo.png" alt="Wheel Tech" style="height: 35px; width: auto;">
                        <span id="caixaDateTitle">Emissão de NF-e</span>
                    </h1>
                    <div class="user-info">
                        <div class="user-avatar" id="nfeUserAvatar">U</div>
                        <div>
                            <div id="nfeUserName">Usuário</div>
                            <div id="nfeUserRole"></div>
                            <div class="d-flex gap-2 mt-2">
                                <button onclick="voltarParaMenu()" class="btn btn-primary btn-sm">← Voltar ao Menu</button>
                                <button onclick="handleLogout()" class="btn btn-secondary btn-sm">Sair</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </header>

        <div class="container nfe-container-largo">
            <!-- Abas -->
            <div class="card mb-4">
                <div class="card-header" style="border-bottom: none; padding-bottom: 0;">
                    <div class="d-flex flex-wrap gap-2">
                        <button class="btn btn-primary" id="tabVendasBtn" onclick="mostrarAbaNFE('vendas')">Vendas sem NF-e</button>
                        <button class="btn btn-outline-primary" id="tabEmitidasBtn" onclick="mostrarAbaNFE('emitidas')">NF-es Emitidas</button>
                        <button class="btn btn-outline-primary" id="tabAvulsaBtn" onclick="mostrarAbaNFE('avulsa')">Emitir Avulsa</button>
                        <button class="btn btn-outline-primary" id="tabTransportadorasBtn" onclick="mostrarAbaNFE('transportadoras')">Transportadoras</button>
                        <button class="btn btn-outline-primary" id="tabClientesBtn" onclick="mostrarAbaNFE('clientes')">Clientes</button>
                        <button id="tabCadastrosBtn" class="btn btn-outline-primary" onclick="mostrarAbaNFE('cadastros')"><i class="fas fa-cogs"></i>Cadastros</button>
                    </div>
                </div>
            </div>

            <!-- Aba: Vendas sem NF-e -->
            <div id="abaVendas" class="card">
                <div class="card-header">
                    <h2 class="card-title"><i class="fas fa-store"></i> Vendas sem Nota Fiscal</h2>
                    <div class="d-flex gap-2">
                        <button class="btn btn-success" id="btnAtualizarNFE" onclick="atualizarListaNFE()">
                            <i class="fas fa-sync-alt"></i> Atualizar Lista
                        </button>
                        <button class="btn btn-info" onclick="sincronizarVendasML()">
                            <i class="fas fa-database"></i> Sincronizar Vendas (ML)
                        </button>
                    </div>
                </div>
                <div class="table-responsive">
                    <table class="table" id="tabelaVendasPendentes">
                        <thead>
                            <tr>
                                <th>Venda</th>
                                <th>Data</th>
                                <th>Cliente</th>
                                <th>SKU</th>
                                <th>Valor</th>
                                <th>Método de Envio</th>
                                <th>Status NF-e</th>
                                <th>Ações</th>
                            </tr>
                        </thead>
                        <tbody id="vendasPendentesBody">
                            <tr><td colspan="7" class="text-center">Carregando...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- Aba: NF-es Emitidas -->
            <div id="abaEmitidas" class="card hidden">
                <div class="card-header">
                    <h2 class="card-title"><i class="fas fa-list"></i> Notas Fiscais Emitidas</h2>
                    <button class="btn btn-info" onclick="carregarNFesEmitidas()">Atualizar</button>
                </div>
                <div class="table-responsive">
                    <table class="table" id="tabelaNFesEmitidas">
                        <thead>
                            <tr>
                                <th>Chave</th>
                                <th>Protocolo</th>
                                <th>Cliente</th>
                                <th>Natureza</th>
                                <th>Produto</th>
                                <th>Valor</th>
                                <th>Data</th>
                                <th>Ações</th>
                            </tr>
                        </thead>
                        <tbody id="nfesEmitidasBody"><tr><td colspan="8" class="text-center">Carregando...</td></tr>
                    </table>
                </div>
            </div>

            <!-- Aba: Emissão Avulsa -->
            <div id="abaAvulsa" class="card hidden">
                <div class="card-header">
                    <h2 class="card-title"><i class="fas fa-plus-circle"></i> Emitir NF-e Avulsa</h2>
                </div>
                <div class="row">
                    <div class="col-md-6">
                        <div class="form-group">
                            <label>Cliente *</label>
                            <select id="avulsaClienteId" class="form-control"></select>
                            <button type="button" class="btn btn-sm btn-link" onclick="abrirModalNovoCliente()">+ Novo Cliente</button>
                        </div>
                    </div>
                    <div class="col-md-6">
                        <div class="form-group">
                            <label>Transportadora</label>
                            <select id="avulsaTransportadoraId" class="form-control"></select>
                        </div>
                    </div>
                </div>
                <div class="row">
                    <div class="col-md-4">
                        <div class="form-group">
                            <label>CFOP</label>
                            <input type="text" id="avulsaCfop" class="form-control" value="5102">
                        </div>
                    </div>
                    <div class="col-md-4">
                        <div class="form-group">
                            <label>Natureza da Operação</label>
                            <input type="text" id="avulsaNatOp" class="form-control" value="VENDA">
                        </div>
                    </div>
                    <div class="col-md-4">
                        <div class="form-group">
                            <label>Modalidade Frete</label>
                            <select id="avulsaModFrete" class="form-control">
                                <option value="0">Contratado pelo emitente</option>
                                <option value="1">Contratado pelo destinatário</option>
                                <option value="2">Contratado por terceiros</option>
                                <option value="9">Sem frete</option>
                            </select>
                        </div>
                    </div>
                </div>
                <div class="form-group">
                    <label>Produtos (JSON)</label>
                    <textarea id="avulsaProdutos" rows="3" class="form-control" placeholder='[{"nome":"Produto A","quantidade":1,"valor_unitario":100,"sku":"SKU123","ncm":"87149990"}]'></textarea>
                    <small>Use o formato JSON. Exemplo: [{"nome":"Bicicleta","quantidade":1,"valor_unitario":1500,"sku":"BIKE001","ncm":"87120000"}]</small>
                </div>
                <div class="d-flex gap-2 mt-3">
                    <button class="btn btn-success" onclick="emitirNFEAvulsa()">Emitir NF-e</button>
                    <button class="btn btn-secondary" onclick="limparFormAvulsa()">Limpar</button>
                </div>
            </div>

            <!-- Aba: Transportadoras -->
            <div id="abaTransportadoras" class="card hidden">
                <div class="card-header">
                    <h2 class="card-title"><i class="fas fa-truck"></i> Transportadoras</h2>
                    <button class="btn btn-primary" onclick="abrirModalTransportadora()">Nova Transportadora</button>
                </div>
                <div class="table-responsive">
                    <table class="table" id="tabelaTransportadoras">
                        <thead><tr><th>Nome</th><th>CNPJ</th><th>IE</th><th>Ações</th></tr></thead>
                        <tbody id="transportadorasBody"><tr><td colspan="4" class="text-center">Carregando...</td></tr>
                    </table>
                </div>
            </div>

            <div
                id="abaCadastros"
                class="hidden"><div class="card">
                    <h3>
                        <i class="fas fa-cogs"></i>
                        Cadastros NF-e
                    </h3>
        <div
            style="display: grid; grid-template-columns: repeat(4, 1fr);
                gap:15px;
                margin-top:20px;
            "><button class="btn btn-primary" onclick="mostrarCadastroNFE('transportadoras')">
                <i class="fas fa-truck"></i>Transportadoras</button>
            <button
                class="btn btn-primary" onclick="mostrarCadastroNFE('clientes')">
                <i class="fas fa-user"></i>
                Clientes
            </button>
            <button
                class="btn btn-primary" onclick="mostrarCadastroNFE('naturezas')">
                <i class="fas fa-file-alt"></i>
                Natureza da Operação
            </button>
            <button
                class="btn btn-primary"onclick="mostrarCadastroNFE('cfops')">
                <i class="fas fa-code-branch"></i>
                CFOP
            </button>
        </div>
        <div
            id="cadastrosNFEConteudo"
            style="margin-top:25px;"></div>
            </div>
        </div>

            <!-- Aba: Clientes -->
            <div id="abaClientes" class="card hidden">
                <div class="card-header">
                    <h2 class="card-title"><i class="fas fa-users"></i> Clientes</h2>
                    <button class="btn btn-primary" onclick="abrirModalNovoCliente()">Novo Cliente</button>
                </div>
                <div class="table-responsive">
                    <table class="table" id="tabelaClientes">
                        <thead><tr><th>Nome</th><th>Documento</th><th>Endereço</th><th>Ações</th></tr></thead>
                        <tbody id="clientesBody"><tr><td colspan="4" class="text-center">Carregando...</td></tr>
                    </table>
                </div>
            </div>
        </div>
    `;

    // Atualiza informações do usuário
    atualizarHeaderNFE();

    // ===== DEFINIÇÃO DAS FUNÇÕES AUXILIARES (FALLBACK) =====
    // Essas funções são definidas como globais apenas se já não existirem,
    // para que os botões HTML (onclick) funcionem corretamente.

    if (typeof window.carregarVendasPendentes !== 'function') {
        window.carregarVendasPendentes = carregarVendasPendentesLocal;
    }
    if (typeof window.atualizarListaNFE !== 'function') {
        window.atualizarListaNFE = atualizarListaNFELocal;
    }
    if (typeof window.mostrarAbaNFE !== 'function') {
        window.mostrarAbaNFE = mostrarAbaNFELocal;
    }

    // Carrega o nfe_manager.js se disponível (para sobrescrever com funções mais completas)
    if (typeof window.mostrarAbaNFE === 'function' && window.mostrarAbaNFE === mostrarAbaNFELocal) {
        // Se ainda não carregou, tenta carregar o script
        if (!document.querySelector('script[src="nfe_manager.js"]')) {
            const script = document.createElement('script');
            script.src = 'nfe_manager.js';
            script.onload = () => {
                console.log('✅ nfe_manager.js carregado');
                // Após carregar, as funções do script sobrescrevem as locais
                // Então chamamos inicializar novamente
                inicializarAbaNFE();
            };
            script.onerror = () => {
                console.warn('⚠️ nfe_manager.js não carregou, usando fallback');
                inicializarAbaNFE();
            };
            document.head.appendChild(script);
        } else {
            inicializarAbaNFE();
        }
    } else {
        // Já existe uma função melhor (provavelmente do nfe_manager.js)
        inicializarAbaNFE();
    }

    // ===== FUNÇÕES AUXILIARES (DEFINIDAS LOCALMENTE) =====

    async function carregarVendasPendentesLocal() {
        const tbody = document.getElementById('vendasPendentesBody');
        if (!tbody) return;
        tbody.innerHTML = '<tr><td colspan="7" class="text-center"><div class="spinner"></div> Carregando vendas...</td></tr>';

        try {
            // 1. Buscar NF-es emitidas (tabela nfe_emitidas)
            const { data: nfes, error: nfeError } = await supabaseClient
                .from('nfe_emitidas')
                .select('venda_id');
            if (nfeError) throw nfeError;

            const idsComNFE = new Set(nfes.map(n => String(n.venda_id)).filter(id => id && id !== 'null'));

            // 2. Buscar todas as vendas do Supabase
            const { data: vendas, error: vendasError } = await supabaseClient
                .from('vendas_ml')
                .select('*')
                .order('created_at', { ascending: false });
            if (vendasError) throw vendasError;

            // 3. Filtrar: sem NF-e E NÃO FULL (usando isFullByAnyField se disponível)
            const pendentes = vendas.filter(v => {
                const idVenda = String(v.id_venda_ml || v.id);
                if (idsComNFE.has(idVenda)) return false;

                let isFull = false;
                if (typeof window.isFullByAnyField === 'function') {
                    // Constrói um objeto compatível com a função
                    const item = {
                        id: v.id_venda_ml,
                        shipping: { logistic_type: v.tipo_envio },
                        tags: [],
                        titulo: v.titulo,
                        mlb: v.mlb_id
                    };
                    isFull = window.isFullByAnyField(item);
                } else {
                    // Fallback: verifica o campo tipo_envio
                    const tipo = (v.tipo_envio || '').toUpperCase();
                    isFull = tipo.includes('FULL') || tipo.includes('FULFILLMENT') || tipo === 'FULL';
                }
                return !isFull;
            });

            if (pendentes.length === 0) {
                tbody.innerHTML = '<tr><td colspan="7" class="text-center">✅ Nenhuma venda pendente (todas já possuem NF-e ou são FULL)</td></tr>';
                return;
            }

            // 4. Renderizar tabela
            tbody.innerHTML = pendentes.map(v => {
                const dataVenda = v.created_at ? new Date(v.created_at).toLocaleDateString('pt-BR') : '-';
                const valor = (v.valor_total || 0).toFixed(2);
                const tipoEnvio = v.tipo_envio || 'N/I';

                // Badge de envio
                let badgeEnvio = '';
                const tipoUpper = tipoEnvio.toUpperCase();
                if (tipoUpper.includes('FULL') || tipoUpper.includes('FULFILLMENT')) {
                    badgeEnvio = '<span class="badge badge-full"><i class="fas fa-warehouse"></i> FULL</span>';
                } else if (tipoUpper.includes('FLEX')) {
                    badgeEnvio = '<span class="badge badge-flex"><i class="fas fa-motorcycle"></i> FLEX</span>';
                } else if (tipoUpper.includes('MERCADO') || tipoUpper.includes('CROSS')) {
                    badgeEnvio = '<span class="badge badge-mercado"><i class="fas fa-truck"></i> ME</span>';
                } else {
                    badgeEnvio = `<span class="badge badge-secondary">${tipoEnvio}</span>`;
                }

                return `
                    <tr>
                        <td>${v.id_venda_ml || v.id}</td>
                        <td>${dataVenda}</td>
                        <td>${v.cliente || 'N/I'}</td>
                        <td>${v.sku || 'N/A'}</td>
                        <td>R$ ${valor}</td>
                        <td>${badgeEnvio}</td>
                        <td>
                            <button class="btn btn-sm btn-success btn-emitir-nfe" data-venda-id="${v.id_venda_ml || v.id}">
                                <i class="fas fa-file-invoice"></i> Emitir NF-e
                            </button>
                        </td>
                    </tr>
                `;
            }).join('');

            // Event listener para os botões de emitir
            document.querySelectorAll('#vendasPendentesBody .btn-emitir-nfe').forEach(btn => {
                btn.removeEventListener('click', handleEmitirNFEClick);
                btn.addEventListener('click', handleEmitirNFEClick);
            });

        } catch (error) {
            console.error('❌ Erro ao carregar vendas pendentes:', error);
            tbody.innerHTML = `<tr><td colspan="7" class="text-center text-danger">Erro: ${error.message}</td></tr>`;
        }
    }

    // ===== FUNÇÃO DE ATUALIZAÇÃO INDEPENDENTE (NÃO USA A ABA VENDAS) =====
    async function atualizarListaNFELocal() {
        const btn = document.getElementById('btnAtualizarNFE');
        if (btn) {
            btn.innerHTML = '<span class="spinner"></span> Atualizando...';
            btn.disabled = true;
        }

        try {
            // 1. Buscar vendas do Mercado Livre (usa a função global)
            if (typeof window.buscarVendasML !== 'function') {
                throw new Error('Função buscarVendasML não disponível');
            }
            const resultado = await window.buscarVendasML(50);
            if (!resultado || !resultado.success) {
                throw new Error(resultado?.error || 'Erro ao buscar vendas');
            }

            // 2. Salvar no banco (usa a função do sales_dashboard se disponível, senão fallback)
            if (typeof window.processarESalvarVendas === 'function') {
                await window.processarESalvarVendas(resultado.vendas);
            } else {
                await salvarVendasLocal(resultado.vendas);
            }

            // 3. Recarregar a lista de pendentes
            await carregarVendasPendentes();
            showToast('✅ Lista atualizada com sucesso!', 'success');
        } catch (error) {
            console.error('❌ Erro ao atualizar lista:', error);
            showToast('Erro ao sincronizar vendas: ' + error.message, 'error');
        } finally {
            if (btn) {
                btn.innerHTML = '<i class="fas fa-sync-alt"></i> Atualizar Lista';
                btn.disabled = false;
            }
        }
    }

    // ===== FUNÇÃO DE SALVAMENTO (FALLBACK) =====
    async function salvarVendasLocal(vendasML) {
        try {
            console.log(`💾 Salvando ${vendasML.length} vendas...`);
            const agora = new Date().toISOString();

            for (const venda of vendasML) {
                const idVendaML = venda.id_venda_ml || venda.id || `ML${Date.now()}`;

                // Verifica se a venda já existe
                const { data: existente } = await supabaseClient
                    .from('vendas_ml')
                    .select('id_venda_ml')
                    .eq('id_venda_ml', idVendaML)
                    .maybeSingle();

                if (existente) {
                    // Atualiza dados da venda (mantém status de conferência)
                    await supabaseClient
                        .from('vendas_ml')
                        .update({
                            titulo: venda.titulo || 'Venda sem título',
                            cliente: venda.cliente || 'Cliente não identificado',
                            sku: venda.sku || 'SEM_SKU',
                            mlb_id: venda.mlb_id || null,
                            estoque_anuncio: venda.estoque_anuncio || 0,
                            quantidade: venda.quantidade || 1,
                            valor_total: venda.valor_total || 0,
                            tipo_envio: venda.tipo_envio || 'N/I',
                            id_envio: venda.id_envio || null,
                            informacoes_envio: venda.informacoes_envio || '{}',
                            updated_at: agora
                        })
                        .eq('id_venda_ml', idVendaML);
                } else {
                    // Insere nova venda
                    await supabaseClient
                        .from('vendas_ml')
                        .insert([{
                            id_venda_ml: idVendaML,
                            titulo: venda.titulo || 'Venda sem título',
                            cliente: venda.cliente || 'Cliente não identificado',
                            sku: venda.sku || 'SEM_SKU',
                            mlb_id: venda.mlb_id || null,
                            estoque_anuncio: venda.estoque_anuncio || 0,
                            quantidade: venda.quantidade || 1,
                            valor_total: venda.valor_total || 0,
                            tipo_envio: venda.tipo_envio || 'N/I',
                            id_envio: venda.id_envio || null,
                            informacoes_envio: venda.informacoes_envio || '{}',
                            created_at: venda.data_venda || agora,
                            status_conferencia: 'pendente',
                            status_sistema: 'nova',
                            updated_at: agora
                        }]);
                }
            }
            console.log('✅ Vendas salvas com sucesso');
        } catch (error) {
            console.error('❌ Erro ao salvar vendas:', error);
            throw error;
        }
    }

    function mostrarAbaNFELocal(aba) {
        ['abaVendas', 'abaEmitidas', 'abaAvulsa', 'abaTransportadoras', 'abaClientes'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.classList.add('hidden');
        });

        const target = document.getElementById(`aba${aba.charAt(0).toUpperCase() + aba.slice(1)}`);
        if (target) target.classList.remove('hidden');

        const botoes = ['Vendas', 'Emitidas', 'Avulsa', 'Transportadoras', 'Clientes'];
        botoes.forEach(btn => {
            const el = document.getElementById(`tab${btn}Btn`);
            if (el) {
                if (btn.toLowerCase() === aba) {
                    el.classList.remove('btn-outline-primary');
                    el.classList.add('btn-primary');
                } else {
                    el.classList.remove('btn-primary');
                    el.classList.add('btn-outline-primary');
                }
            }
        });

        // Carrega os dados conforme a aba
        if (aba === 'vendas') carregarVendasPendentes();
        if (aba === 'emitidas') carregarNFesEmitidas();
        if (aba === 'transportadoras') carregarTransportadoras();
        if (aba === 'clientes') carregarClientes();
    }

    function handleEmitirNFEClick(event) {
        const vendaId = event.currentTarget.dataset.vendaId;
        if (!vendaId) {
            showToast('❌ ID da venda não encontrado', 'error');
            return;
        }
        if (typeof emitirNFEParaVenda === 'function') {
            emitirNFEParaVenda(vendaId);
        } else {
            showToast('Função de emissão não disponível', 'error');
        }
    }

    function atualizarHeaderNFE() {
        const userName = document.getElementById('nfeUserName');
        const userAvatar = document.getElementById('nfeUserAvatar');
        const userRole = document.getElementById('nfeUserRole');
        if (userName) userName.textContent = currentUser.name || 'Usuário';
        if (userAvatar) userAvatar.textContent = (currentUser.name || 'U')[0].toUpperCase();
        if (userRole) userRole.textContent = currentUser.role || '';
    }

    function inicializarAbaNFE() {
        nfeContainer.classList.remove('hidden');
        // Chama a função de mostrar a aba (seja a local ou a do nfe_manager)
        if (typeof window.mostrarAbaNFE === 'function') {
            window.mostrarAbaNFE('vendas');
        } else {
            mostrarAbaNFELocal('vendas');
        }
        showToast('📄 Sistema de NF-e carregado', 'info');
    }

    // Se as funções globais já existirem (do nfe_manager.js), use-as; senão, use as locais.
    // O inicializarAbaNFE será chamado no final.
    inicializarAbaNFE();
};

// ===== INICIALIZAR QUANDO O DOM CARREGAR =====
document.addEventListener('DOMContentLoaded', function() {
    // Aguardar um pouco para garantir que tudo carregou
    setTimeout(() => {
        adicionarBotoesSelecaoOS();
    }, 2000);
});

// ===== CSS ADICIONAL PARA A BARRA DE SELEÇÃO =====
const selecaoStyles = document.createElement('style');
selecaoStyles.innerHTML = `
    .selected-os-bar {
        animation: slideDown 0.3s ease-out;
        margin-bottom: 20px;
    }
    
    .selected-os-bar.hidden {
        display: none;
    }
    
    @keyframes slideDown {
        from {
            opacity: 0;
            transform: translateY(-20px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }
    
    /* Estilo para linhas selecionadas */
    tr.selected-os-row {
        background-color: #e8f0fe !important;
        border-left: 4px solid #8A2BE2 !important;
    }
    
    /* Checkbox personalizado */
    .os-select-checkbox {
        width: 18px;
        height: 18px;
        cursor: pointer;
        accent-color: #8A2BE2;
    }
    
    .os-select-checkbox:hover {
        transform: scale(1.1);
    }
    
    /* Botão de seleção */
    #selectOSBtn {
        margin-left: 15px;
        transition: all 0.3s;
    }
    
    #selectOSBtn.btn-success {
        background: linear-gradient(135deg, #28a745, #20c997);
    }
    
    #selectOSBtn.btn-danger {
        background: linear-gradient(135deg, #dc3545, #c82333);
    }
    
    /* Badge de contagem */
    .selection-badge {
        background: #8A2BE2;
        color: white;
        border-radius: 50%;
        padding: 2px 6px;
        font-size: 11px;
        margin-left: 5px;
    }
`;

document.head.appendChild(selecaoStyles);

function formatarDataISO(dataISO) {
    if (!dataISO) return '';
    const [ano, mes, dia] = dataISO.split('-');
    return `${dia}/${mes}/${ano}`;
}

async function emitirNFEVenda(vendaId) {
    // Buscar detalhes da venda
    const { data: venda, error } = await supabaseClient
        .from('vendas_ml')
        .select('*')
        .eq('id_venda_ml', vendaId)
        .single();
    if (error) {
        showToast('Erro ao buscar venda', 'error');
        return;
    }

    // Pedir senha do certificado
    const password = prompt('Digite a senha do certificado digital:');
    if (!password) return;

    // Preparar dados para envio ao backend
    const dadosNFE = {
        venda: venda,
        password: password
    };

    // Chamar backend
    try {
        const response = await fetch(`${API_BASE_URL}/api/nfe/emitir`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dadosNFE)
        });
        const result = await response.json();
        if (response.ok) {
            showToast('NF-e emitida com sucesso!', 'success');
            // Atualizar status da venda no banco
            await supabaseClient.from('vendas_ml').update({ nfe_emitida: true }).eq('id_venda_ml', vendaId);
            // Recarregar lista
            carregarVendasParaNFE();
        } else {
            showToast(`Erro: ${result.error}`, 'error');
        }
    } catch (error) {
        showToast(`Erro de comunicação: ${error.message}`, 'error');
    }
}

// Funções para controle dos campos dinâmicos no modal de reembolso
function toggleReferenciaFields() {
    const tipoRef = document.querySelector('input[name="tipoReferencia"]:checked').value;
    const campoVenda = document.getElementById('campoNumeroVenda');
    const campoRetirada = document.getElementById('campoNumeroRetirada');
    
    if (tipoRef === 'venda') {
        campoVenda.classList.remove('hidden');
        campoRetirada.classList.add('hidden');
        document.getElementById('numeroVenda').required = true;
        document.getElementById('numeroRetirada').required = false;
    } else {
        campoVenda.classList.add('hidden');
        campoRetirada.classList.remove('hidden');
        document.getElementById('numeroVenda').required = false;
        document.getElementById('numeroRetirada').required = true;
    }
}

function toggleOperacaoField() {
    const tipoOp = document.querySelector('input[name="tipoOperacao"]:checked').value;
    const campoOp = document.getElementById('campoNumeroOperacao');
    const inputOp = document.getElementById('numeroOperacao');
    
    if (tipoOp === 'adicionar') {
        campoOp.style.display = 'block';
        inputOp.required = true;
    } else {
        campoOp.style.display = 'none';
        inputOp.required = false;
        inputOp.value = ''; // limpa
    }
}

window.voltarParaVerificacao = async function(id) {
    if (!confirm('Deseja voltar este reembolso para "A Verificar"? O administrador precisará aprovar novamente.')) return;
    
    try {
        const { data, error } = await supabaseClient
            .from('reembolsos_ml')
            .update({ 
                status: 'a_verificar',
                verificado_por: null,
                data_atualizacao: new Date().toISOString(),
                notificado_admin: false
            })
            .eq('id', id)
            .select();
        
        if (error) throw error;
        
        // Atualizar lista local
        const index = reembolsos.findIndex(r => r.id === id);
        if (index !== -1) {
            reembolsos[index].status = 'a_verificar';
            reembolsos[index].verificado_por = null;
            reembolsos[index].notificado_admin = false;
        }
        
        showToast('↪️ Reembolso voltado para verificação!', 'success');
        updateReembolsoCounters();
        renderReembolsosTable();
        
        if (currentUser.role === 'Administrador') {
            verificarNotificacoes();
        }
    } catch (error) {
        console.error('❌ Erro:', error);
        showToast('❌ Erro ao voltar reembolso: ' + error.message, 'error');
    }
};

async function abrirHistoricoAcessos() {
    // Verifica se o usuário está logado
    if (!currentUser) {
        showToast('⚠️ Faça login primeiro', 'warning');
        return;
    }

    // Apenas Ronald e Andressa Miotto podem acessar
    const usuariosPermitidos = ['ronald', 'andressamiotto'];
    if (!usuariosPermitidos.includes(currentUser.username)) {
        showToast('⛔ Acesso negado. Apenas Ronald e Andressa Miotto podem visualizar o histórico.', 'error');
        return;
    }

    // Esconde o menu principal e outros sistemas
    const menuSystem = document.getElementById('menuSystem');
    if (menuSystem) menuSystem.classList.add('hidden');

    // Se já existir uma tela de histórico, remove-a (para recriar atualizada)
    const existingScreen = document.getElementById('historicoAcessosScreen');
    if (existingScreen) existingScreen.remove();

    // Cria o container da tela de histórico
    const historyScreen = document.createElement('div');
    historyScreen.id = 'historicoAcessosScreen';
    historyScreen.className = 'container';
    historyScreen.innerHTML = `
        <div class="card">
            <div class="card-header" style="display: flex; justify-content: space-between; align-items: center;">
                <h2 style="margin: 0;">
                    <i class="fas fa-history"></i> Histórico de Acessos
                </h2>
                <button class="btn btn-secondary" onclick="voltarParaMenu()">
                    <i class="fas fa-arrow-left"></i> Voltar
                </button>
            </div>
            <div class="table-responsive">
                <table class="table table-striped" id="historyTable">
                    <thead>
                        <tr>
                            <th>Usuário</th>
                            <th>Nome</th>
                            <th>IP</th>
                            <th>Data/Hora</th>
                            <th>Navegador</th>
                        </tr>
                    </thead>
                    <tbody id="historyTableBody">
                        <tr><td colspan="5" class="text-center"><div class="spinner"></div> Carregando...</td><ee
                    </tbody>
                </table>
            </div>
        </div>
    `;

    document.body.appendChild(historyScreen);

    // Carrega os dados do Supabase
    try {
        if (!supabaseClient) {
            throw new Error('Cliente Supabase não inicializado');
        }

        const { data, error } = await supabaseClient
            .from('login_history')
            .select('*')
            .order('login_time', { ascending: false })
            .limit(200); // Últimos 200 registros

        if (error) throw error;

        const tbody = document.getElementById('historyTableBody');
        if (!tbody) return;

        if (!data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center">Nenhum registro encontrado</td></tr>';
            return;
        }

        // Preenche a tabela
        tbody.innerHTML = data.map(reg => `
            <tr>
                <td>${escapeHtml(reg.username || '')}</td>
                <td>${escapeHtml(reg.user_name || '')}</td>
                <td>${escapeHtml(reg.ip_address || '-')}</td>
                <td>${new Date(reg.login_time).toLocaleString('pt-BR')}</td>
                <td>${escapeHtml((reg.user_agent || '').substring(0, 60))}</td>
            </tr>
        `).join('');

    } catch (err) {
        console.error('Erro ao carregar histórico:', err);
        const tbody = document.getElementById('historyTableBody');
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center text-danger">Erro ao carregar dados. Verifique o console.</td></tr>';
        }
        showToast('❌ Erro ao carregar histórico de acessos', 'error');
    }
}

// Função auxiliar para escapar HTML (evita injeção)
function escapeHtml(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

async function getClientIP() {
    try {
        const response = await fetch('https://api.ipify.org?format=json');
        const data = await response.json();
        return data.ip;
    } catch (error) {
        console.error('Erro ao obter IP:', error);
        return 'IP não disponível';
    }
}

// Mostrar botão de relatório apenas para admin
function atualizarVisibilidadeRelatorioColaborador() {
    // Aguardar um pouco para garantir que o DOM está pronto
    setTimeout(() => {
        const btnDiv = document.getElementById('btnRelatorioColaborador');
        if (!btnDiv) {
            console.warn('Elemento btnRelatorioColaborador não encontrado no DOM');
            return;
        }
        
        // Verificar se o usuário está logado e é administrador
        if (currentUser && currentUser.role === 'Administrador') {
            btnDiv.classList.remove('hidden');
            console.log('✅ Botão Relatório por Colaborador visível (Admin)');
        } else {
            btnDiv.classList.add('hidden');
            console.log('❌ Botão Relatório por Colaborador oculto - role:', currentUser?.role);
        }
    }, 100); // pequeno atraso para garantir que o DOM foi renderizado
}

// Chamar essa função dentro de abrirSistemaReembolsos() após definir currentUser

window.abrirRelatorioColaborador = function() {
    if (currentUser.role !== 'Administrador') {
        showToast('Apenas administradores podem acessar este relatório', 'warning');
        return;
    }
    // Setar datas padrão (últimos 30 dias)
    const hoje = new Date();
    const trintaDias = new Date();
    trintaDias.setDate(hoje.getDate() - 30);
    document.getElementById('relColabDataInicio').value = trintaDias.toISOString().split('T')[0];
    document.getElementById('relColabDataFim').value = hoje.toISOString().split('T')[0];
    document.getElementById('relatorioColaboradorModal').classList.remove('hidden');
    carregarRelatorioColaborador();
};

window.closeRelatorioColaborador = function() {
    document.getElementById('relatorioColaboradorModal').classList.add('hidden');
};

    // ===== RELATÓRIO POR COLABORADOR =====
async function carregarRelatorioColaborador() {
    console.log("🔍 Iniciando carregamento do relatório por colaborador...");
    
    const dataInicio = document.getElementById('relColabDataInicio')?.value || '';
    const dataFim = document.getElementById('relColabDataFim')?.value || '';
    
    let query = window.supabaseClient
        .from('reembolsos_ml')
        .select('*');
    
    if (dataInicio) {
        query = query.gte('data_criacao', `${dataInicio}T00:00:00`);
    }
    if (dataFim) {
        query = query.lte('data_criacao', `${dataFim}T23:59:59`);
    }
    
    const { data, error } = await query;
    
    if (error) {
        console.error("❌ Erro na consulta:", error);
        showToast("Erro ao carregar dados", "error");
        return;
    }
    
    if (!data || data.length === 0) {
        document.getElementById('relatorioColaboradorBody').innerHTML = '<tr><td colspan="5" class="text-center">Nenhuma reclamação no período</td></tr>';
        const ctx = document.getElementById('graficoColaborador');
        if (ctx && window.meuGraficoColaborador) window.meuGraficoColaborador.destroy();
        return;
    }
    
    console.log(`📊 Total de registros: ${data.length}`);
    
    // Agrupa por colaborador (campo 'criado_por')
    const colaboradores = {};
    data.forEach(item => {
        const nomeColaborador = item.criado_por || 'Não identificado';
        
        if (!colaboradores[nomeColaborador]) {
            colaboradores[nomeColaborador] = {
                total: 0,
                reembolsadas: 0,
                valorTotal: 0
            };
        }
        colaboradores[nomeColaborador].total++;
        
        // Verifica se foi reembolsado (campos: status = 'reembolsado' OU status_reembolso = 'finalizado')
        const isReembolsado = (item.status === 'reembolsado' || item.status_reembolso === 'finalizado');
        if (isReembolsado) {
            colaboradores[nomeColaborador].reembolsadas++;
            colaboradores[nomeColaborador].valorTotal += parseFloat(item.valor || 0);
        }
    });
    
    console.log("📈 Dados agrupados:", colaboradores);
    
    // Converte para array e ordena
    const resultado = Object.entries(colaboradores).map(([nome, dados]) => ({
        nome,
        total: dados.total,
        reembolsadas: dados.reembolsadas,
        valorTotal: dados.valorTotal,
        taxa: dados.total > 0 ? (dados.reembolsadas / dados.total * 100).toFixed(1) : 0
    })).sort((a,b) => b.total - a.total);
    
    // Renderiza tabela
    const tbody = document.getElementById('relatorioColaboradorBody');
    if (!tbody) {
        console.error("❌ Elemento 'relatorioColaboradorBody' não encontrado");
        return;
    }
    tbody.innerHTML = '';
    
    resultado.forEach(row => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${escapeHtml(row.nome)}</strong></td>
            <td>${row.total}</td>
            <td class="${row.reembolsadas > 0 ? 'text-success' : 'text-danger'}">${row.reembolsadas}</td>
            <td>R$ ${row.valorTotal.toFixed(2)}</td>
            <td>
                <div class="progress" style="height: 20px;">
                    <div class="progress-bar bg-success" role="progressbar" style="width: ${row.taxa}%;">${row.taxa}%</div>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
    
    // Gráfico
    const ctx = document.getElementById('graficoColaborador');
    if (ctx && typeof Chart !== 'undefined') {
        if (window.meuGraficoColaborador) window.meuGraficoColaborador.destroy();
        window.meuGraficoColaborador = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: resultado.map(r => r.nome),
                datasets: [
                    {
                        label: 'Total Reclamações',
                        data: resultado.map(r => r.total),
                        backgroundColor: 'rgba(54, 162, 235, 0.6)',
                        borderRadius: 5
                    },
                    {
                        label: 'Reembolsadas',
                        data: resultado.map(r => r.reembolsadas),
                        backgroundColor: 'rgba(75, 192, 192, 0.6)',
                        borderRadius: 5
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                scales: {
                    y: {
                        beginAtZero: true,
                        stepSize: 1,
                        title: { display: true, text: 'Quantidade' }
                    },
                    x: {
                        title: { display: true, text: 'Colaborador' }
                    }
                },
                plugins: {
                    legend: { position: 'top' },
                    tooltip: { callbacks: {
                        label: function(context) {
                            return `${context.dataset.label}: ${context.raw}`;
                        }
                    }}
                }
            }
        });
    } else {
        console.warn("⚠️ Chart.js não carregado");
    }
    
    showToast(`✅ Relatório carregado: ${resultado.length} colaborador(es)`, 'success');
}

// Exportar para Excel
function exportarRelatorioColaboradorExcel() {
    const tabela = document.getElementById('relatorioColaboradorTable');
    if (!tabela) {
        showToast("Tabela não encontrada", "error");
        return;
    }
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.table_to_sheet(tabela, { raw: true });
    XLSX.utils.book_append_sheet(wb, ws, 'Relatorio_Colaborador');
    XLSX.writeFile(wb, `relatorio_colaborador_${new Date().toISOString().slice(0,10)}.xlsx`);
}

// Abrir modal de detalhes
window.verDetalhesReembolso = async function(id) {
    console.log('🔍 Abrindo detalhes do reembolso ID:', id);
    
    const reembolso = reembolsos.find(r => r.id === id);
    if (!reembolso) {
        showToast('Reembolso não encontrado', 'error');
        return;
    }
    
    const modal = document.getElementById('detalhesReembolsoModal');
    const content = document.getElementById('detalhesReembolsoContent');
    
    if (!modal || !content) {
        showToast('Erro: Modal não encontrado', 'error');
        return;
    }
    
    // Formatar dados
    const dataOp = formatarDataISO(reembolso.data_operacao);
    const dataCriacao = new Date(reembolso.data_criacao).toLocaleString('pt-BR');
    const dataAtualizacao = reembolso.data_atualizacao ? new Date(reembolso.data_atualizacao).toLocaleString('pt-BR') : '-';
    
    const tipoReferencia = reembolso.tipo_referencia || (reembolso.numero_venda?.startsWith('RET-') ? 'retirada' : 'venda');
    const numeroReferencia = tipoReferencia === 'retirada' ? (reembolso.numero_retirada || reembolso.numero_venda?.replace('RET-', '')) : reembolso.numero_venda;
    
    // Status
    let statusText = '';
    if (reembolso.tipo_reclamacao === 'sem_reembolso') {
        statusText = reembolso.resolvida 
            ? '<span class="badge badge-success">✅ Resolvida (sem reembolso)</span>'
            : '<span class="badge badge-warning">⏳ Pendente (sem reembolso)</span>';
    } else if (reembolso.status === 'reembolsado' || reembolso.status_reembolso === 'finalizado') {
        statusText = '<span class="badge badge-success">💰 Reembolso finalizado</span>';
    } else if (reembolso.status === 'pendente') {
        statusText = '<span class="badge badge-danger">❌ Reembolso negado</span>';
    } else if (reembolso.status === 'a_verificar' || reembolso.status_reembolso === 'em_andamento') {
        statusText = '<span class="badge badge-warning">⏳ Em andamento</span>';
    } else {
        statusText = `<span class="badge badge-secondary">${reembolso.status || 'Desconhecido'}</span>`;
    }
    
    content.innerHTML = `
        <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 15px;">
            <div class="info-row"><strong>Número da Venda/Retirada:</strong> ${numeroReferencia || '-'}</div>
            <div class="info-row"><strong>Número da Reclamação:</strong> ${reembolso.numero_reclamacao || '-'}</div>
            <div class="info-row"><strong>Número da Operação:</strong> ${reembolso.numero_operacao || 'Reembolso na venda'}</div>
            <div class="info-row"><strong>Valor:</strong> R$ ${parseFloat(reembolso.valor || 0).toFixed(2)}</div>
            <div class="info-row"><strong>Data da Operação:</strong> ${dataOp}</div>
            <div class="info-row"><strong>Motivo:</strong> ${reembolso.motivo || 'Não informado'}</div>
            <div class="info-row"><strong>Status:</strong> ${statusText}</div>
            <div class="info-row"><strong>Criado por:</strong> ${reembolso.criado_por}</div>
            <div class="info-row"><strong>Data de criação:</strong> ${dataCriacao}</div>
            <div class="info-row"><strong>Última atualização:</strong> ${dataAtualizacao}</div>
            ${reembolso.verificado_por ? `<div class="info-row"><strong>Verificado por:</strong> ${reembolso.verificado_por}</div>` : ''}
            ${reembolso.responsabilidade ? `<div class="info-row"><strong>Responsabilidade:</strong> ${reembolso.responsabilidade}</div>` : ''}
            ${reembolso.cliente_bloqueado !== undefined && reembolso.cliente_bloqueado !== null ? `<div class="info-row"><strong>Cliente bloqueado:</strong> ${reembolso.cliente_bloqueado ? 'Sim' : 'Não'}</div>` : ''}
        </div>
        <div class="card">
            <h4><i class="fas fa-comment"></i> Observações</h4>
            <div style="background: white; padding: 15px; border-radius: 8px; border: 1px solid #e9ecef;">
                ${reembolso.observacoes ? reembolso.observacoes.replace(/\n/g, '<br>') : '<em style="color: #6c757d;">Nenhuma observação registrada.</em>'}
            </div>
        </div>
    `;
    
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
};

window.closeDetalhesReembolso = function() {
    const modal = document.getElementById('detalhesReembolsoModal');
    if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
    }
};

window.abrirSistemaEstoque = function() {
    console.log('▶️ Abrindo sistema de Estoque');

    // 1. Esconder outros sistemas principais
    const sistemas = [
        'menuSystem', 'mainSystem', 'salesSystem', 'reembolsosSystem', 'precificacaoSystem', 'entradasSystem', 'promocoesSystem',
        'caixaSystem', 'reviewsSystem', 'folgasSystem', 'shippingSystem', 'feedbackSystem', 'perguntasSystem', 
        'estoqueGestaoSystem', 'gerenciamentoAnunciosSystem'
    ];
    sistemas.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });

    // 2. Se o container #estoqueSystem não existir, aborta (deveria existir)
    const estoqueSystem = document.getElementById('estoqueSystem');
    if (!estoqueSystem) {
        console.error('❌ #estoqueSystem não encontrado');
        showToast('Erro: sistema de notas não encontrado', 'error');
        return;
    }
    estoqueSystem.classList.remove('hidden');
    estoqueSystem.style.display = 'block';

    // ========== PADRONIZAR O HEADER DENTRO DO #estoqueSystem ==========
    // Verifica se já tem um header personalizado; se não, cria um igual ao das outras abas
    let header = estoqueSystem.querySelector('.main-header');
    if (!header) {
        header = document.createElement('header');
        header.className = 'main-header';
        header.innerHTML = `
            <div class="container">
                <div class="header-content">
                    <h1 style="display: flex; align-items: center; gap: 10px;">
                        <i class="fas fa-exchange-alt" style="color:var(--primary);"></i>
                        <span>Emissão de NF-e</span>
                    </h1>
                    <div class="user-info">
                        <div class="user-avatar" id="estoqueUserAvatar">U</div>
                        <div>
                            <div style="font-weight: 600;" id="estoqueUserName">Usuário</div>
                            <div style="font-size: 12px; color: #6c757d;" id="estoqueUserRole"></div>
                            <div class="d-flex gap-2 mt-2">
                                <button onclick="voltarParaMenu()" class="btn btn-primary btn-sm">← Voltar ao Menu</button>
                                <button onclick="handleLogout()" class="btn btn-secondary btn-sm">Sair</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        // Insere o header no início do #estoqueSystem
        estoqueSystem.insertBefore(header, estoqueSystem.firstChild);
    }

    // Atualiza os dados do usuário no header
    const estoqueUserName = document.getElementById('estoqueUserName');
    const estoqueUserAvatar = document.getElementById('estoqueUserAvatar');
    const estoqueUserRole = document.getElementById('estoqueUserRole');
    if (estoqueUserName) estoqueUserName.textContent = currentUser?.name || 'Usuário';
    if (estoqueUserAvatar) estoqueUserAvatar.textContent = currentUser?.avatar || 'U';
    if (estoqueUserRole) estoqueUserRole.textContent = currentUser?.role || 'Usuário';

    // 3. Garantir que a aba NF-e esteja visível (usar o HTML já existente)
    const todasAbas = document.querySelectorAll('.tab-content-estoque');
    todasAbas.forEach(aba => aba.classList.add('hidden'));

    const abaNfe = document.getElementById('abaNfe');
    if (!abaNfe) {
        console.error('❌ #abaNfe não encontrado – verifique se o HTML está completo');
        showToast('Erro: aba NF-e não encontrada', 'error');
        return;
    }
    abaNfe.classList.remove('hidden');
    abaNfe.style.display = 'block';
    abaNfe.style.visibility = 'visible';
    abaNfe.style.opacity = '1';

    // 4. Atualizar os botões das abas (se existirem)
    const botoes = document.querySelectorAll('#estoqueTabs .btn');
    botoes.forEach(btn => {
        btn.classList.remove('btn-primary');
        btn.classList.add('btn-outline-primary');
    });
    const btnAtivo = document.querySelector('#estoqueTabs .btn[onclick*="nfe"]');
    if (btnAtivo) {
        btnAtivo.classList.remove('btn-outline-primary');
        btnAtivo.classList.add('btn-primary');
    }

    // 5. Carregar os dados (transportadoras, vendas pendentes, vendas com NF-e)
    if (typeof window.carregarTransportadoras === 'function') {
        window.carregarTransportadoras();
    } else {
        console.warn('⚠️ carregarTransportadoras não definida');
        const select = document.getElementById('nfeTransportadora');
        if (select) select.innerHTML = '<option value="">Módulo não carregado</option>';
    }
    if (typeof window.carregarVendasSemNFE === 'function') {
        window.carregarVendasSemNFE();
    } else {
        const tbody = document.getElementById('listaVendasNFE');
        if (tbody) tbody.innerHTML = '<tr><td colspan="5" class="text-center text-danger">Erro: nfe_manager.js não carregado. Recarregue a página.</td></tr>';
    }
    if (typeof window.carregarVendasComNFE === 'function') {
        window.carregarVendasComNFE();
    }

    showToast('📄 Emissão de NF-e carregada', 'info');
    console.log('✅ Aba NF-e exibida com sucesso');
};

window.abrirRejeitarModal = function(orderId) {
    console.log(
        '🔴 Abrindo modal Não Autorizado para OS:',
        orderId
    );

    const modal =
        document.getElementById(
            'rejeitarOSModal'
        );

    const osIdInput =
        document.getElementById(
            'rejeitarOSId'
        );

    const motivoInput =
        document.getElementById(
            'motivoRejeicao'
        );

    const responsavelCorrecaoSelect =
        document.getElementById(
            'responsavelCorrecaoOS'
        );

    if (!modal) {
        console.error(
            '❌ Modal #rejeitarOSModal não encontrado!'
        );

        showToast(
            'Erro: Modal não encontrado',
            'error'
        );

        return;
    }

    if (osIdInput) {
        osIdInput.value =
            orderId;
    }

    if (motivoInput) {
        motivoInput.value =
            '';
    }

    if (responsavelCorrecaoSelect) {
        responsavelCorrecaoSelect.innerHTML =
            '<option value="">Selecione o usuário responsável</option>' +
            SYSTEM_USERS
                .filter(
                    usuario =>
                        !BLOCKED_USERS.includes(
                            usuario.username
                        )
                )
                .map(
                    usuario =>
                        `<option value="${usuario.name}">${usuario.name} - ${usuario.role}</option>`
                )
                .join('');

        responsavelCorrecaoSelect.value =
            '';
    }

    modal.classList.remove(
        'hidden'
    );

    modal.style.display =
        'flex';

    modal.style.visibility =
        'visible';

    modal.style.opacity =
        '1';

    modal.style.zIndex =
        '9999';

    document.body.style.overflow =
        '';

    console.log(
        '✅ Modal aberto para OS:',
        orderId
    );
};

window.closeRejeitarModal = function() {
    console.log(
        '🔴 Fechando modal Não Autorizado'
    );

    const modal =
        document.getElementById(
            'rejeitarOSModal'
        );

    if (modal) {
        modal.classList.add(
            'hidden'
        );

        modal.style.display =
            'none';

        modal.style.visibility =
            'hidden';

        modal.style.opacity =
            '0';
    }

    const osIdInput =
        document.getElementById(
            'rejeitarOSId'
        );

    const motivoInput =
        document.getElementById(
            'motivoRejeicao'
        );

    const responsavelSelect =
        document.getElementById(
            'responsavelCorrecaoOS'
        );

    if (osIdInput) {
        osIdInput.value =
            '';
    }

    if (motivoInput) {
        motivoInput.value =
            '';
    }

    if (responsavelSelect) {
        responsavelSelect.value =
            '';
    }
};

window.confirmarRejeicaoOS = async function() {
    console.log(
        '🔴 Confirmando rejeição da OS'
    );

    const username =
        getUsernameAtualOS();

    if (
        !currentUser ||
        ![
            'ronald',
            'leticia'
        ].includes(username)
    ) {
        showToast(
            '⚠️ Apenas Ronald ou Letícia podem não autorizar uma OS.',
            'warning'
        );

        return;
    }

    const orderId =
        document.getElementById(
            'rejeitarOSId'
        )?.value;

    const motivo =
        document.getElementById(
            'motivoRejeicao'
        )?.value?.trim() || '';

    const responsavelCorrecao =
        document.getElementById(
            'responsavelCorrecaoOS'
        )?.value?.trim() || '';

    if (!orderId) {
        showToast(
            '❌ ID da OS não encontrado',
            'error'
        );

        return;
    }

    if (!motivo) {
        showToast(
            '⚠️ Informe o motivo da não autorização',
            'warning'
        );

        document
            .getElementById(
                'motivoRejeicao'
            )
            ?.focus();

        return;
    }

    if (!responsavelCorrecao) {
        showToast(
            '⚠️ Selecione quem vai corrigir a OS',
            'warning'
        );

        document
            .getElementById(
                'responsavelCorrecaoOS'
            )
            ?.focus();

        return;
    }

    const order =
        orders.find(
            item =>
                String(item.id) ===
                String(orderId)
        );

    if (!order) {
        showToast(
            '❌ OS não encontrada',
            'error'
        );

        return;
    }

    if (
        order.status !== 'concluida' ||
        order.conferido
    ) {
        showToast(
            '⚠️ Apenas OS não conferidas podem ser não autorizadas.',
            'warning'
        );

        return;
    }

    const contabilizaMeta =
        username === 'ronald';

    const complementoConfirmacao =
        contabilizaMeta
            ? '\n\nEsta análise contará para sua meta de conferência.'
            : '\n\nEsta ação não será contabilizada na meta do Ronald.';

    const confirmou =
        confirm(
            `⚠️ Tem certeza que deseja NÃO AUTORIZAR esta OS?\n\n` +
            `Motivo: ${motivo}\n\n` +
            `Responsável pela correção: ${responsavelCorrecao}\n\n` +
            `A OS voltará para PENDENTES.` +
            complementoConfirmacao
        );

    if (!confirmou) {
        return;
    }

    try {
        if (!supabaseClient) {
            throw new Error(
                'Supabase não conectado'
            );
        }

        let data =
            null;

        let error =
            null;

        /*
         * Quando Ronald reprova, utilizamos a RPC que já
         * registra a análise na meta de conferência.
         *
         * Quando Letícia reprova, a OS é atualizada
         * normalmente, sem alterar a meta do Ronald.
         */
        if (contabilizaMeta) {
            const resultado =
                await supabaseClient.rpc(
                    'processar_conferencia_os_ronald',
                    {
                        p_os_id:
                            String(orderId),

                        p_username:
                            currentUser.username,

                        p_nome:
                            currentUser.name,

                        p_resultado:
                            'nao_autorizada',

                        p_motivo:
                            motivo
                    }
                );

            data =
                resultado.data;

            error =
                resultado.error;
        } else {
            const agoraLeticia =
                new Date().toISOString();

            const resultado =
                await supabaseClient
                    .from(
                        'ordens_service'
                    )
                    .update({
                        status:
                            'pendente',

                        motivo_rejeicao:
                            motivo,

                        rejeitado_por:
                            currentUser.name,

                        data_rejeicao:
                            agoraLeticia,

                        conferido:
                            false,

                        conferido_por:
                            null,

                        data_conferencia:
                            null,

                        ultima_atualizacao:
                            agoraLeticia
                    })
                    .eq(
                        'id',
                        orderId
                    )
                    .eq(
                        'status',
                        'concluida'
                    )
                    .eq(
                        'conferido',
                        false
                    )
                    .select()
                    .maybeSingle();

            data =
                resultado.data;

            error =
                resultado.error;

            if (
                !error &&
                !data
            ) {
                throw new Error(
                    'A OS já foi conferida ou não está mais disponível.'
                );
            }
        }

        if (error) {
            throw error;
        }

        /*
         * Atribui a correção ao usuário escolhido.
         *
         * user_notified = false faz a OS aparecer como
         * nova no sino desse usuário.
         */
        const agoraAtribuicao =
            new Date().toISOString();

        const {
            error: erroAtribuicao
        } =
            await supabaseClient
                .from(
                    'ordens_service'
                )
                .update({
                    status:
                        'pendente',

                    responsavel:
                        responsavelCorrecao,

                    motivo_rejeicao:
                        motivo,

                    rejeitado_por:
                        currentUser.name,

                    data_rejeicao:
                        agoraAtribuicao,

                    conferido:
                        false,

                    conferido_por:
                        null,

                    data_conferencia:
                        null,

                    user_notified:
                        false,

                    ultima_atualizacao:
                        agoraAtribuicao
                })
                .eq(
                    'id',
                    orderId
                );

        if (erroAtribuicao) {
            throw erroAtribuicao;
        }

        const agoraISO =
            data?.data_evento ||
            data?.data_rejeicao ||
            data?.ultima_atualizacao ||
            agoraAtribuicao;

        /*
         * Atualização local para que a mudança apareça
         * imediatamente, sem precisar recarregar a página.
         */
        order.status =
            'pendente';

        order.responsibleName =
            responsavelCorrecao;

        order.responsavel =
            responsavelCorrecao;

        order.user_notified =
            false;

        order.motivo_rejeicao =
            motivo;

        order.rejeitado_por =
            currentUser.name;

        order.data_rejeicao =
            agoraISO;

        order.conferido =
            false;

        order.conferidoPor =
            null;

        order.conferido_por =
            null;

        order.dataConferencia =
            null;

        order.data_conferencia =
            null;

        order.updatedAt =
            agoraISO;

        order.ultima_atualizacao =
            agoraISO;

        /*
         * Envia a notificação usando o sistema de
         * notificações que já alimenta o sino.
         */
        if (
            responsavelCorrecao &&
            responsavelCorrecao !==
                currentUser.name
        ) {
            const assunto =
                `🛠 Correção atribuída: ${order.code}`;

            const mensagem =
`Olá ${responsavelCorrecao},

A OS ${order.code} - ${order.productName} não foi autorizada.

Motivo:
${motivo}

Esta correção foi atribuída a você. A OS está na aba de pendentes e também foi enviada ao seu sino de notificações.

Sistema Wheel Tech`;

            try {
                await enviarNotificacaoEmail(
                    responsavelCorrecao,
                    assunto,
                    mensagem
                );
            } catch (
                erroNotificacao
            ) {
                /*
                 * A falha da notificação não desfaz a
                 * reprovação nem a atribuição da OS.
                 */
                console.warn(
                    '⚠️ A OS foi não autorizada, mas não foi possível enviar a notificação:',
                    erroNotificacao
                );
            }
        }

        closeRejeitarModal();

        if (
            typeof updateCounters ===
            'function'
        ) {
            updateCounters();
        }

        if (
            typeof renderOrdersTable ===
            'function'
        ) {
            renderOrdersTable();
        }

        if (
            typeof updateOSNotificationBell ===
            'function'
        ) {
            updateOSNotificationBell();
        }

        if (
            typeof updateNotificationsUI ===
            'function'
        ) {
            updateNotificationsUI();
        }

        /*
         * Letícia pode reprovar, mas isso não entra
         * na meta de conferência do Ronald.
         */
        if (!contabilizaMeta) {
            showToast(
                '✅ OS não autorizada por Letícia e enviada para o usuário responsável. Esta ação não contabiliza na meta do Ronald.',
                'success'
            );

            return;
        }

        /*
         * Como Ronald analisou a OS, a reprovação
         * é contabilizada como uma conferência.
         */
        const status =
            await verificarMetaRonald({
                mostrarAviso:
                    false,

                motivo:
                    'os_nao_autorizada'
            });

        if (
            status &&
            status.faltamHoje > 0
        ) {
            showToast(
                `✅ OS não autorizada e contabilizada. Faltam ${status.faltamHoje} conferências.`,
                'success'
            );

            if (
                bloqueioMetaRonaldAtivo
            ) {
                atualizarBannerBloqueioMetaRonald(
                    status,
                    status.estado
                        ?.motivo_bloqueio
                );

                setTimeout(
                    aplicarRestricaoVisualMetaRonald,
                    0
                );
            }
        } else {
            showToast(
                '🎯 OS não autorizada e meta de conferência concluída!',
                'success'
            );
        }
    } catch (error) {
        console.error(
            '❌ Erro ao rejeitar OS:',
            error
        );

        showToast(
            '❌ Erro: ' +
            (
                error?.message ||
                'Não foi possível não autorizar a OS.'
            ),
            'error'
        );
    }
};

// ============================================
// RELATÓRIO DE OS
// ============================================

async function abrirModalRelatorioOS() {
    console.log('🔍 Abrindo modal de relatório...');
    
    // 1. Garantir que as OS estão carregadas
    if (!orders || orders.length === 0) {
        console.log('⏳ Nenhuma OS carregada. Aguardando...');
        showToast('Carregando ordens de serviço...', 'info');
        
        // Tenta carregar as OS (se a função existir)
        if (typeof loadOrders === 'function') {
            await loadOrders();
        }
        
        // Se ainda estiver vazio, exibe erro
        if (!orders || orders.length === 0) {
            showToast('Não foi possível carregar as OS. Verifique a conexão.', 'error');
            return;
        }
    }
    
    console.log(`✅ ${orders.length} OS carregadas`);
    
    // 2. Obter o modal
    const modal = document.getElementById('relatorioOSModal');
    if (!modal) {
        console.error('Modal #relatorioOSModal não encontrado!');
        showToast('Erro: elemento do modal não encontrado', 'error');
        return;
    }
    
    // 3. Exibir o modal
    modal.classList.remove('hidden');
    
    // 4. Preencher a lista de usuários
    try {
        const container = document.getElementById('usuariosCheckboxes');
        if (container) {
            const usuariosSet = new Set();
            orders.forEach(order => {
                if (order.responsibleName && order.responsibleName.trim())
                    usuariosSet.add(order.responsibleName.trim());
                if (order.createdBy && order.createdBy.trim())
                    usuariosSet.add(order.createdBy.trim());
            });
            
            const usuariosList = Array.from(usuariosSet).sort();
            container.innerHTML = '';
            
            if (usuariosList.length === 0) {
                container.innerHTML = '<div class="text-muted">Nenhum usuário encontrado</div>';
            } else {
                usuariosList.forEach(user => {
                    const id = 'chk_' + user.replace(/\s/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
                    const div = document.createElement('div');
                    div.className = 'form-check';
                    div.innerHTML = `
                        <input type="checkbox" class="form-check-input usuario-checkbox" value="${user}" id="${id}">
                        <label class="form-check-label" for="${id}">${user}</label>
                    `;
                    container.appendChild(div);
                });
            }
            
            // Comportamento do checkbox "Todos"
            const chkTodos = document.getElementById('usuarioTodos');
            if (chkTodos) {
                const checkboxes = document.querySelectorAll('.usuario-checkbox');
                const updateTodos = () => {
                    const allChecked = Array.from(checkboxes).every(cb => cb.checked);
                    chkTodos.checked = allChecked && checkboxes.length > 0;
                };
                checkboxes.forEach(cb => {
                    cb.removeEventListener('change', updateTodos);
                    cb.addEventListener('change', updateTodos);
                });
                chkTodos.removeEventListener('change', updateTodos);
                chkTodos.addEventListener('change', function() {
                    checkboxes.forEach(cb => cb.checked = this.checked);
                });
                updateTodos();
            }
        } else {
            console.warn('Elemento #usuariosCheckboxes não encontrado');
        }
    } catch (error) {
        console.error('Erro ao preencher usuários:', error);
    }
    
    // 5. Definir datas padrão (últimos 30 dias)
    const dataInicio = document.getElementById('relDataInicio');
    const dataFim = document.getElementById('relDataFim');
    if (dataInicio && !dataInicio.value) {
        const d = new Date();
        d.setDate(d.getDate() - 30);
        dataInicio.value = d.toISOString().split('T')[0];
    }
    if (dataFim && !dataFim.value) {
        dataFim.value = new Date().toISOString().split('T')[0];
    }
    
    // 6. Garantir que a aba ativa seja a de tabela
    if (typeof switchRelatorioTab === 'function') {
        switchRelatorioTab('tabela');
    }
    
    showToast(`Relatório pronto - ${orders.length} OS disponíveis`, 'success');
}

    function abrirModal() {
        // Configurar datas padrão (últimos 30 dias)
        const hoje = new Date();
        const umMesAtras = new Date();
        umMesAtras.setDate(hoje.getDate() - 30);
        document.getElementById('relDataInicio').value = umMesAtras.toISOString().split('T')[0];
        document.getElementById('relDataFim').value = hoje.toISOString().split('T')[0];

        // Exibir modal
        document.getElementById('relatorioOSModal').classList.remove('hidden');
        switchRelatorioTab('tabela');
    }

function switchRelatorioTab(tab) {
    const tabelaPanel = document.getElementById('relatorioTabelaPanel');
    const graficosPanel = document.getElementById('relatorioGraficosPanel');
    const tabTabelaBtn = document.getElementById('tabTabelaBtn');
    const tabGraficosBtn = document.getElementById('tabGraficosBtn');

    if (tab === 'tabela') {
        tabelaPanel.style.display = 'block';
        graficosPanel.style.display = 'none';
        tabTabelaBtn.classList.add('btn-primary', 'active');
        tabTabelaBtn.classList.remove('btn-outline-primary');
        tabGraficosBtn.classList.add('btn-outline-primary');
        tabGraficosBtn.classList.remove('btn-primary', 'active');
    } else {
        tabelaPanel.style.display = 'none';
        graficosPanel.style.display = 'block';
        tabGraficosBtn.classList.add('btn-primary', 'active');
        tabGraficosBtn.classList.remove('btn-outline-primary');
        tabTabelaBtn.classList.add('btn-outline-primary');
        tabTabelaBtn.classList.remove('btn-primary', 'active');
        if (ultimosDadosFiltrados && ultimosDadosFiltrados.length > 0) {
            atualizarGraficosOSComDados(ultimosDadosFiltrados);
        }
    }
}

// ============================================
// CALCULAR PRAZO DA OS
// HORÁRIO ÚTIL: SEGUNDA A SEXTA - 07h ÀS 16h
// ============================================
function calcularPrazoPorPrioridade(
    dataCriacao,
    prioridade,
    horasPersonalizadas = null
) {

    let horasUteis =
        horasPersonalizadas;


    if (
        horasUteis === null ||
        horasUteis === undefined
    ) {

        switch (prioridade) {

            case 'alta':
                horasUteis = 2;
                break;

            case 'normal':
                horasUteis = 48;
                break;

            case 'baixa':
                horasUteis = 36;
                break;

            default:
                return null;
        }
    }


    horasUteis =
        Number(horasUteis);


    if (
        !isFinite(horasUteis) ||
        horasUteis <= 0
    ) {

        return null;
    }


    const minutos =
        horasUteis * 60;


    return adicionarMinutosUteisOS(
        dataCriacao,
        minutos
    );
}

window.marcarAnuncioCriado = async function(orderId) {
    if (!confirm('Confirmar que o anúncio foi criado/replicado? Esta ação não pode ser desfeita.')) return;
    
    try {
        const { error } = await supabaseClient
            .from('ordens_service')
            .update({
                anuncio_criado: true,
                anuncio_criado_por: currentUser.name,
                anuncio_criado_data: new Date().toISOString(),
                ultima_atualizacao: new Date().toISOString()
            })
            .eq('id', orderId);
        
        if (error) throw error;
        
        // Atualizar objeto local
        const index = orders.findIndex(o => o.id == orderId);
        if (index !== -1) {
            orders[index].anuncio_criado = true;
            orders[index].anuncio_criado_por = currentUser.name;
            orders[index].anuncio_criado_data = new Date().toISOString();
        }
        
        showToast('✅ Anúncio marcado como criado! Agora a OS pode ser finalizada.', 'success');
        renderOrdersTable(); // ou recarregar a visualização atual
        if (currentViewingOS && currentViewingOS.id === orderId) {
            openViewOSModal(orders.find(o => o.id == orderId));
        }
    } catch (error) {
        console.error('Erro ao marcar anúncio:', error);
        showToast('❌ Erro ao marcar anúncio', 'error');
    }
};

// Atualiza o valor do campo de horas com base na urgência selecionada
function atualizarHorasPorUrgencia() {
    const urgency = document.getElementById('urgency').value;
    let horas = 48; // padrão normal
    switch (urgency) {
        case 'baixa': horas = 36; break;
        case 'normal': horas = 48; break;
        case 'alta': horas = 2; break;
    }
    const campoHoras = document.getElementById('prazoHoras');
    if (campoHoras) campoHoras.value = horas;
    atualizarPrazoEstimadoPorHoras(); // opcional: atualiza a data/hora limite dinamicamente
}

// Calcula e exibe a data/hora limite baseada nas horas informadas (opcional)
function atualizarPrazoEstimadoPorHoras() {
    const horas = parseInt(document.getElementById('prazoHoras').value);
    if (isNaN(horas) || horas < 1) {
        document.getElementById('prazoEstimadoDisplay').style.display = 'none';
        return;
    }
    const agora = new Date();
    const prazo = calcularPrazoPorPrioridade(agora, null, horas); // usaremos nova versão
    if (prazo) {
        document.getElementById('prazoEstimadoValor').textContent = prazo.toLocaleString('pt-BR');
        document.getElementById('prazoEstimadoDisplay').style.display = 'block';
    }
}

// Versão modificada de calcularPrazoPorPrioridade que aceita horas personalizadas
function calcularPrazoPorPrioridade(dataCriacao, prioridade, horasPersonalizadas = null) {
    let horasUteis = horasPersonalizadas;
    if (horasUteis === null) {
        // fallback para a prioridade
        switch (prioridade) {
            case 'alta': horasUteis = 2; break;
            case 'normal': horasUteis = 48; break;
            case 'baixa': horasUteis = 36; break;
            default: return null;
        }
    }
    
    let resultado = new Date(dataCriacao);
    let horasAcumuladas = 0;
    
    while (horasAcumuladas < horasUteis) {
        let horaAtual = resultado.getHours();
        let diaSemana = resultado.getDay();
        
        if (diaSemana === 0 || diaSemana === 6) {
            resultado.setDate(resultado.getDate() + (diaSemana === 0 ? 1 : 2));
            resultado.setHours(8, 0, 0, 0);
            continue;
        }
        
        if (horaAtual >= 18) {
            resultado.setDate(resultado.getDate() + 1);
            resultado.setHours(8, 0, 0, 0);
            continue;
        }
        
        if (horaAtual < 8) {
            resultado.setHours(8, 0, 0, 0);
        }
        
        let fimDia = new Date(resultado);
        fimDia.setHours(18, 0, 0, 0);
        let minutosRestantesHoje = (fimDia - resultado) / (1000 * 60);
        let horasRestantesHoje = minutosRestantesHoje / 60;
        
        if (horasRestantesHoje >= (horasUteis - horasAcumuladas)) {
            resultado.setMinutes(resultado.getMinutes() + (horasUteis - horasAcumuladas) * 60);
            horasAcumuladas = horasUteis;
        } else {
            horasAcumuladas += horasRestantesHoje;
            resultado.setDate(resultado.getDate() + 1);
            resultado.setHours(8, 0, 0, 0);
        }
    }
    return resultado;
}

// ============================================
// GRÁFICO DE PRODUTIVIDADE DA OS
// ============================================
function atualizarGraficosOSComDados(
    dadosFiltrados
) {

    console.log(
        '📊 Atualizando gráfico:',
        dadosFiltrados?.length ||
        0
    );


    if (
        !dadosFiltrados ||
        dadosFiltrados.length === 0
    ) {

        if (
            window.barrasChart
        ) {

            window.barrasChart.destroy();

            window.barrasChart =
                null;
        }

        return;
    }


    const canvas =
        document.getElementById(
            'graficoBarrasOS'
        );


    if (!canvas) {

        console.warn(
            'Canvas graficoBarrasOS não encontrado'
        );

        return;
    }


    const usuarios =
        new Set();


    dadosFiltrados.forEach(
        order => {

            if (
                order.responsibleName &&
                order.responsibleName.trim()
            ) {

                usuarios.add(
                    order.responsibleName.trim()
                );
            }
        }
    );


    const usuariosList =
        Array.from(
            usuarios
        ).sort();


    const quantidadesOS = [];

    const quantidadesFotos = [];

    const quantidadesEdicoes = [];

    const temposMediosHoras = [];


    usuariosList.forEach(
        user => {

            const osDoUsuario =
                dadosFiltrados.filter(
                    order =>
                        order.responsibleName ===
                        user
                );


            quantidadesOS.push(
                osDoUsuario.length
            );


            const totalFotos =
                osDoUsuario.reduce(
                    (total, order) =>

                        total +
                        (
                            Number(
                                order.photosTaken
                            ) || 0
                        ),

                    0
                );


            const totalEdicoes =
                osDoUsuario.reduce(
                    (total, order) =>

                        total +
                        (
                            Number(
                                order.editsMade
                            ) || 0
                        ),

                    0
                );


            quantidadesFotos.push(
                totalFotos
            );


            quantidadesEdicoes.push(
                totalEdicoes
            );


            const concluidas =
                osDoUsuario.filter(
                    order =>

                        order.status ===
                            'concluida' &&

                        order.completionDate &&

                        obterInicioExecucaoOS(
                            order
                        )
                );


            if (
                concluidas.length > 0
            ) {

                const totalMinutos =
                    concluidas.reduce(
                        (total, order) =>

                            total +
                            calcularTempoExecucaoOS(
                                order
                            ),

                        0
                    );


                const mediaHoras =
                    (
                        totalMinutos /
                        concluidas.length
                    ) /
                    60;


                temposMediosHoras.push(
                    Number(
                        mediaHoras.toFixed(
                            2
                        )
                    )
                );


            } else {

                temposMediosHoras.push(
                    0
                );
            }
        }
    );


    if (
        window.barrasChart
    ) {

        window.barrasChart.destroy();
    }


    const ctx =
        canvas.getContext(
            '2d'
        );


    window.barrasChart =
        new Chart(
            ctx,
            {

                type:
                    'bar',

                data: {

                    labels:
                        usuariosList,

                    datasets: [

                        {
                            label:
                                'Quantidade de OS',

                            data:
                                quantidadesOS,

                            backgroundColor:
                                'rgba(54, 162, 235, 0.60)',

                            borderColor:
                                'rgba(54, 162, 235, 1)',

                            borderWidth:
                                1,

                            yAxisID:
                                'y'
                        },


                        {
                            label:
                                'Fotos tiradas',

                            data:
                                quantidadesFotos,

                            backgroundColor:
                                'rgba(40, 167, 69, 0.60)',

                            borderColor:
                                'rgba(40, 167, 69, 1)',

                            borderWidth:
                                1,

                            yAxisID:
                                'y'
                        },


                        {
                            label:
                                'Fotos editadas',

                            data:
                                quantidadesEdicoes,

                            backgroundColor:
                                'rgba(255, 193, 7, 0.60)',

                            borderColor:
                                'rgba(255, 193, 7, 1)',

                            borderWidth:
                                1,

                            yAxisID:
                                'y'
                        },


                        {
                            label:
                                'Tempo médio útil (h)',

                            data:
                                temposMediosHoras,

                            backgroundColor:
                                'rgba(111, 66, 193, 0.60)',

                            borderColor:
                                'rgba(111, 66, 193, 1)',

                            borderWidth:
                                1,

                            yAxisID:
                                'y1'
                        }

                    ]
                },


                options: {

                    responsive:
                        true,

                    maintainAspectRatio:
                        true,


                    interaction: {

                        mode:
                            'index',

                        intersect:
                            false
                    },


                    scales: {

                        y: {

                            beginAtZero:
                                true,

                            title: {

                                display:
                                    true,

                                text:
                                    'Quantidade'
                            }
                        },


                        y1: {

                            position:
                                'right',

                            beginAtZero:
                                true,

                            title: {

                                display:
                                    true,

                                text:
                                    'Horas úteis'
                            },

                            grid: {

                                drawOnChartArea:
                                    false
                            }
                        }
                    },


                    plugins: {

                        legend: {

                            position:
                                'top'
                        },


                        tooltip: {

                            callbacks: {

                                label:
                                    function (
                                        context
                                    ) {

                                        const label =
                                            context
                                                .dataset
                                                .label ||
                                            '';


                                        const valor =
                                            context.raw;


                                        if (
                                            label.includes(
                                                'Tempo médio'
                                            )
                                        ) {

                                            return `${label}: ${valor} h`;
                                        }


                                        return `${label}: ${valor}`;
                                    }
                            }
                        }
                    }
                }
            }
        );
}

function fecharModalRelatorioOS() {
    document.getElementById('relatorioOSModal').classList.add('hidden');
}

// ============================================
// GERAR RELATÓRIO COMPLETO DE OS
// ============================================
async function gerarRelatorioOS() {

    console.log(
        '📊 Gerando relatório de OS...'
    );


    if (
        !orders ||
        orders.length === 0
    ) {

        showToast(
            'Nenhuma OS carregada. Carregando...',
            'warning'
        );


        if (
            typeof loadOrders ===
            'function'
        ) {

            await loadOrders();
        }


        if (
            !orders ||
            orders.length === 0
        ) {

            showToast(
                'Nenhuma OS disponível',
                'error'
            );

            return;
        }
    }


    const dataInicio =
        document
            .getElementById(
                'relDataInicio'
            )
            ?.value || '';


    const dataFim =
        document
            .getElementById(
                'relDataFim'
            )
            ?.value || '';


    const tipoPeriodo =
        document
            .getElementById(
                'relTipoPeriodo'
            )
            ?.value ||
        'criacao';


    const statusFiltro =
        document
            .getElementById(
                'relStatus'
            )
            ?.value ||
        'todas';


    // ========================================
    // USUÁRIOS
    // ========================================

    const usuariosSelecionados =
        [];


    document
        .querySelectorAll(
            '.usuario-checkbox:checked'
        )
        .forEach(
            cb => {

                usuariosSelecionados.push(
                    cb.value
                );

            }
        );


    const todosUsuarios =
        document
            .getElementById(
                'usuarioTodos'
            )
            ?.checked ||
        false;


    const filtroUsuarios =
        todosUsuarios
            ? null
            : usuariosSelecionados;


    let dados =
        [...orders];


    // ========================================
    // DATA
    // ========================================

    if (
        dataInicio &&
        dataFim
    ) {

        const inicio =
            new Date(
                dataInicio +
                'T00:00:00'
            );


        const fim =
            new Date(
                dataFim +
                'T23:59:59.999'
            );


        dados =
            dados.filter(
                order => {

                    const dataRef =
                        tipoPeriodo ===
                        'criacao'
                            ? order.createdAt
                            : order.completionDate;


                    if (!dataRef) {
                        return false;
                    }


                    const data =
                        new Date(
                            dataRef
                        );


                    return (
                        data >= inicio &&
                        data <= fim
                    );
                }
            );
    }


    // ========================================
    // STATUS
    // ========================================

    if (
        statusFiltro ===
        'concluida'
    ) {

        dados =
            dados.filter(
                order =>
                    order.status ===
                    'concluida'
            );
    }


    // ========================================
    // USUÁRIO
    // ========================================

    if (
        filtroUsuarios &&
        filtroUsuarios.length > 0
    ) {

        dados =
            dados.filter(
                order =>

                    filtroUsuarios.includes(
                        order.responsibleName
                    ) ||

                    filtroUsuarios.includes(
                        order.createdBy
                    )
            );
    }


    const tbody =
        document.getElementById(
            'relatorioOSBody'
        );


    if (!tbody) {
        return;
    }


    tbody.innerHTML = '';


    // ========================================
    // SEM REGISTROS
    // ========================================

    if (
        dados.length === 0
    ) {

        tbody.innerHTML = `
            <tr>
                <td
                    colspan="13"
                    class="text-center"
                >
                    Nenhuma OS encontrada no período
                </td>
            </tr>
        `;


        atualizarResumoRelatorioOS(
            []
        );


        ultimosDadosFiltrados =
            [];


        window.ultimosDadosFiltrados =
            [];


        return;
    }


    // ========================================
    // TABELA
    // ========================================

    const agora =
        new Date();


    dados.forEach(
        order => {

            const criacao =
                order.createdAt
                    ? new Date(
                        order.createdAt
                    ).toLocaleString(
                        'pt-BR'
                    )
                    : '-';


            const inicioReal =
                obterInicioExecucaoOS(
                    order
                );


            const inicioTexto =
                inicioReal
                    ? new Date(
                        inicioReal
                    ).toLocaleString(
                        'pt-BR'
                    )
                    : '-';


            let conclusao =
                '-';


            if (
                order.completionDate &&
                order.status ===
                    'concluida'
            ) {

                conclusao =
                    new Date(
                        order.completionDate
                    ).toLocaleString(
                        'pt-BR'
                    );
            }


            const minutos =
                calcularTempoExecucaoOS(
                    order,
                    agora
                );


            const tempoTexto =
                (
                    order.status ===
                        'andamento' ||

                    order.status ===
                        'concluida'
                )
                    ? formatarDuracaoOS(
                        minutos
                    )
                    : '-';


            const fotos =
                Number(
                    order.photosTaken
                ) || 0;


            const edicoes =
                Number(
                    order.editsMade
                ) || 0;


            const mediaFoto =
                (
                    order.status ===
                        'andamento' ||

                    order.status ===
                        'concluida'
                )
                    ? formatarMediaFotoOS(
                        order,
                        minutos
                    )
                    : '-';


            let statusText =
                'Pendente';


            if (
                order.status ===
                'andamento'
            ) {

                statusText =
                    'Em andamento';


            } else if (
                order.status ===
                'concluida'
            ) {

                statusText =
                    'Concluída';
            }


            const urgencyMap = {

                alta:
                    'Alta',

                normal:
                    'Normal',

                baixa:
                    'Baixa'
            };


            const row =
                tbody.insertRow();


            row.innerHTML = `

                <td>
                    <strong>
                        ${escapeHtml(
                            String(
                                order.code ||
                                order.id
                            )
                        )}
                    </strong>
                </td>

                <td>
                    ${escapeHtml(
                        order.productName ||
                        '-'
                    )}
                </td>

                <td>
                    ${escapeHtml(
                        order.createdBy ||
                        '-'
                    )}
                </td>

                <td>
                    ${escapeHtml(
                        order.responsibleName ||
                        '-'
                    )}
                </td>

                <td style="white-space:nowrap;">
                    ${criacao}
                </td>

                <td style="white-space:nowrap;">
                    ${inicioTexto}

                    ${
                        !order.startedAt &&
                        order.createdAt
                            ? `
                                <div
                                    style="
                                        font-size:9px;
                                        color:#999;
                                    "
                                    title="OS antiga sem data_inicio. Foi usada a data de criação."
                                >
                                    legado
                                </div>
                            `
                            : ''
                    }
                </td>

                <td style="white-space:nowrap;">
                    ${conclusao}
                </td>

                <td style="text-align:center;">
                    <strong>
                        ${fotos}
                    </strong>
                </td>

                <td style="text-align:center;">
                    <strong>
                        ${edicoes}
                    </strong>
                </td>

                <td style="white-space:nowrap;">
                    <strong>
                        ${tempoTexto}
                    </strong>
                </td>

                <td style="white-space:nowrap;">
                    ${mediaFoto}
                </td>

                <td>
                    ${
                        urgencyMap[
                            order.urgency
                        ] ||
                        order.urgency ||
                        '-'
                    }
                </td>

                <td>
                    ${statusText}
                </td>
            `;
        }
    );


    // ========================================
    // RESUMO
    // ========================================

    atualizarResumoRelatorioOS(
        dados
    );


    // ========================================
    // GRÁFICOS
    // ========================================

    if (
        typeof atualizarGraficosOSComDados ===
        'function'
    ) {

        atualizarGraficosOSComDados(
            dados
        );
    }


    ultimosDadosFiltrados =
        dados;


    window.ultimosDadosFiltrados =
        dados;


    showToast(
        `✅ Relatório gerado: ${dados.length} OS`,
        'success'
    );
}

// ============================================
// CARDS DE RESUMO DO RELATÓRIO
// ============================================
function atualizarResumoRelatorioOS(
    dados
) {

    dados =
        Array.isArray(dados)
            ? dados
            : [];


    const concluidas =
        dados.filter(
            order =>

                order.status ===
                    'concluida' &&

                order.completionDate &&

                obterInicioExecucaoOS(
                    order
                )
        );


    const totalFotos =
        dados.reduce(
            (total, order) =>

                total +
                (
                    Number(
                        order.photosTaken
                    ) || 0
                ),

            0
        );


    const totalEdicoes =
        dados.reduce(
            (total, order) =>

                total +
                (
                    Number(
                        order.editsMade
                    ) || 0
                ),

            0
        );


    let totalMinutos =
        0;


    let totalFotosBase =
        0;


    concluidas.forEach(
        order => {

            const minutos =
                calcularTempoExecucaoOS(
                    order
                );


            totalMinutos +=
                minutos;


            totalFotosBase +=
                obterQuantidadeFotosBaseOS(
                    order
                );
        }
    );


    const mediaOS =
        concluidas.length > 0
            ? totalMinutos /
                concluidas.length
            : 0;


    const mediaFoto =
        totalFotosBase > 0
            ? totalMinutos /
                totalFotosBase
            : 0;


    const setText =
        (
            id,
            valor
        ) => {

            const el =
                document.getElementById(
                    id
                );


            if (el) {

                el.textContent =
                    valor;
            }
        };


    setText(
        'relResumoTotalOS',
        dados.length
    );


    setText(
        'relResumoFotos',
        totalFotos
    );


    setText(
        'relResumoEdicoes',
        totalEdicoes
    );


    setText(
        'relResumoTempoTotal',
        formatarDuracaoOS(
            totalMinutos
        )
    );


    setText(
        'relResumoTempoMedioOS',
        concluidas.length > 0
            ? formatarDuracaoOS(
                mediaOS
            )
            : '-'
    );


    setText(
        'relResumoTempoMedioFoto',
        totalFotosBase > 0
            ? formatarDuracaoOS(
                mediaFoto
            )
            : '-'
    );
}

let ultimosDadosFiltrados = [];

function atualizarGraficosOS() {
    if (!ultimosDadosFiltrados || ultimosDadosFiltrados.length === 0) {
        // Limpar gráficos se não houver dados
        if (window.barrasChart) window.barrasChart.destroy();
        return;
    }

    const dados = ultimosDadosFiltrados;  // Já filtrados pelo gerarRelatorioOS

    // Coletar todos os usuários que aparecem nos dados filtrados
    const usuarios = new Set();
    dados.forEach(order => {
        if (order.responsibleName) usuarios.add(order.responsibleName);
        if (order.createdBy) usuarios.add(order.createdBy);
    });
    const usuariosList = Array.from(usuarios).sort();

    const quantidades = [];
    const temposMedios = [];

    usuariosList.forEach(user => {
        const osDoUsuario = dados.filter(o => o.responsibleName === user || o.createdBy === user);
        quantidades.push(osDoUsuario.length);

        const osConcluidas = osDoUsuario.filter(o => o.status === 'concluida' && o.completionDate && o.createdAt);
        if (osConcluidas.length > 0) {
            const somaDias = osConcluidas.reduce((acc, o) => {
                const diff = new Date(o.completionDate) - new Date(o.createdAt);
                return acc + diff / (1000 * 60 * 60 * 24);
            }, 0);
            temposMedios.push(+(somaDias / osConcluidas.length).toFixed(1));
        } else {
            temposMedios.push(0);
        }
    });

    // Destruir gráfico anterior se existir
    if (window.barrasChart) window.barrasChart.destroy();

    const ctx = document.getElementById('graficoBarrasOS').getContext('2d');
    window.barrasChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: usuariosList,
            datasets: [
                {
                    label: 'Quantidade de OS',
                    data: quantidades,
                    backgroundColor: 'rgba(54, 162, 235, 0.6)',
                    borderColor: 'rgba(54, 162, 235, 1)',
                    borderWidth: 1,
                    yAxisID: 'y',
                },
                {
                    label: 'Tempo médio (dias)',
                    data: temposMedios,
                    backgroundColor: 'rgba(75, 192, 192, 0.6)',
                    borderColor: 'rgba(75, 192, 192, 1)',
                    borderWidth: 1,
                    yAxisID: 'y1',
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            scales: {
                y: { beginAtZero: true, title: { display: true, text: 'Quantidade' } },
                y1: { position: 'right', beginAtZero: true, title: { display: true, text: 'Dias' }, grid: { drawOnChartArea: false } }
            },
            plugins: { tooltip: { mode: 'index', intersect: false }, legend: { position: 'top' } }
        }
    });
}

// ============================================
// EXPORTAR RELATÓRIO DE OS PARA EXCEL
// ============================================
function exportarRelatorioOSExcel() {

    const table =
        document.getElementById(
            'relatorioOSTable'
        );


    if (!table) {

        showToast(
            'Tabela do relatório não encontrada',
            'error'
        );

        return;
    }


    const wb =
        XLSX.utils.book_new();


    const ws =
        XLSX.utils.table_to_sheet(
            table,
            {
                raw: true
            }
        );


    ws['!cols'] = [

        { wch: 18 }, // código

        { wch: 40 }, // produto

        { wch: 18 }, // criado por

        { wch: 18 }, // responsável

        { wch: 22 }, // criação

        { wch: 22 }, // início

        { wch: 22 }, // conclusão

        { wch: 14 }, // fotos

        { wch: 15 }, // editadas

        { wch: 18 }, // tempo

        { wch: 20 }, // média foto

        { wch: 12 }, // urgência

        { wch: 18 }  // status
    ];


    XLSX.utils.book_append_sheet(
        wb,
        ws,
        'Relatorio_OS'
    );


    const agora =
        new Date()
            .toISOString()
            .slice(
                0,
                19
            )
            .replace(
                /:/g,
                '-'
            );


    XLSX.writeFile(
        wb,
        `relatorio_os_${agora}.xlsx`
    );


    showToast(
        '✅ Relatório exportado com sucesso!',
        'success'
    );
}

// ===== MODAL DE EDIÇÃO =====
let editingOSId = null;

window.abrirModalEdicaoOS = function(orderId) {
    const order = orders.find(o => o.id == orderId);
    if (!order) {
        showToast('Ordem não encontrada', 'error');
        return;
    }
    // Verifica permissão
    if (!checkOrderPermission(order) && currentUser.role !== 'Administrador') {
        showToast('Sem permissão para editar', 'warning');
        return;
    }

    editingOSId = orderId;
    const modal = document.getElementById('editOSModal');
    
    // Preencher campos
    document.getElementById('editOSId').value = orderId;
    document.getElementById('editProductName').value = order.productName || '';
    document.getElementById('editResponsibleName').value = order.responsibleName || '';
    document.getElementById('editUrgency').value = order.urgency || 'normal';
    document.getElementById('editOsType').value = order.osType || 'normal';
    document.getElementById('editPhotoType').value = order.photoType || 'estudio';
    document.getElementById('editLinkAnuncio').value = order.linkAnuncio || '';
    document.getElementById('editSkus').value = Array.isArray(order.skus) ? order.skus.join(', ') : (order.skus || '');
    document.getElementById('editObservations').value = order.observations || '';
    document.getElementById('editValorAnuncio').value = order.valorAnuncio || '';
    document.getElementById('editDescricaoAnuncio').value = order.descricaoAnuncio || '';
    document.getElementById('editLinkNovoAnuncio').value = order.linkNovoAnuncio || '';
    document.getElementById('editPrecisaFoto').value = order.precisaFoto || 'nao';
    
    // Campos de anúncio – mostrar se for tipo de anúncio ou edição
    const photoType = order.photoType;
    const isAnuncio = (photoType === 'criar_anuncio' || photoType === 'replicar_anuncio' || photoType === 'edicao');
    document.getElementById('editCamposAnuncio').classList.toggle('hidden', !isAnuncio);
    
    // Motivo de rejeição – visível apenas para admin e se houver motivo
    const motivoGroup = document.getElementById('editMotivoRejeicaoGroup');
    if (currentUser.role === 'Administrador' && order.motivo_rejeicao) {
        motivoGroup.classList.remove('hidden');
        document.getElementById('editMotivoRejeicao').value = order.motivo_rejeicao || '';
    } else {
        motivoGroup.classList.add('hidden');
        document.getElementById('editMotivoRejeicao').value = '';
    }
    
    // Atualizar contador do produto
    const campoProduto = document.getElementById('editProductName');
    const contador = document.getElementById('editContadorProduto');
    function atualizarContadorEdit() {
        const len = campoProduto.value.length;
        const max = 200;
        contador.textContent = `${len}/${max}`;
        contador.style.color = len >= max ? '#dc3545' : (len >= 180 ? '#ffc107' : '#6c757d');
        contador.style.fontWeight = len >= 180 ? 'bold' : 'normal';
    }
    campoProduto.addEventListener('input', atualizarContadorEdit);
    atualizarContadorEdit();
    
    modal.classList.remove('hidden');
};

window.fecharModalEdicaoOS = function() {
    document.getElementById('editOSModal').classList.add('hidden');
    editingOSId = null;
};

window.salvarEdicaoOS = async function() {
    const orderId = document.getElementById('editOSId').value;
    if (!orderId) {
        showToast('ID inválido', 'error');
        return;
    }
    
    // Coletar dados
    const productName = document.getElementById('editProductName').value.trim();
    const responsibleName = document.getElementById('editResponsibleName').value;
    const urgency = document.getElementById('editUrgency').value;
    const osType = document.getElementById('editOsType').value;
    const photoType = document.getElementById('editPhotoType').value;
    const linkAnuncio = document.getElementById('editLinkAnuncio').value.trim();
    const skus = document.getElementById('editSkus').value.split(',').map(s => s.trim()).filter(s => s);
    const observations = document.getElementById('editObservations').value.trim();
    const valorAnuncio = parseFloat(document.getElementById('editValorAnuncio').value) || 0;
    const descricaoAnuncio = document.getElementById('editDescricaoAnuncio').value.trim();
    const linkNovoAnuncio = document.getElementById('editLinkNovoAnuncio').value.trim();
    const precisaFoto = document.getElementById('editPrecisaFoto').value;
    const motivoRejeicao = document.getElementById('editMotivoRejeicao').value.trim();
    
    // Validação
    if (!productName || !responsibleName) {
        showToast('Preencha produto e responsável', 'warning');
        return;
    }
    
    // Montar objeto de atualização
    const updateData = {
        produto_nome: productName,
        responsavel: responsibleName,
        urgencia: urgency,
        tipo_os: osType,
        tipo_foto: photoType,
        link_anuncio: linkAnuncio,
        skus: skus,
        observacoes: observations,
        valor_anuncio: valorAnuncio,
        descricao_anuncio: descricaoAnuncio,
        link_novo_anuncio: linkNovoAnuncio,
        precisa_foto: precisaFoto,
        ultima_atualizacao: new Date().toISOString()
    };
    
    // Se admin e motivo foi alterado, atualizar também
    if (currentUser.role === 'Administrador' && motivoRejeicao !== undefined) {
        updateData.motivo_rejeicao = motivoRejeicao || null;
        // Se o motivo foi removido (vazio), e a OS está pendente com motivo, podemos limpar?
        // Vamos manter, mas se o admin quiser remover, ele pode.
    }
    
    try {
        if (!supabaseClient) throw new Error('Supabase não conectado');
        const { error } = await supabaseClient
            .from('ordens_service')
            .update(updateData)
            .eq('id', orderId);
        if (error) throw error;
        
        // Atualizar a lista local
        const idx = orders.findIndex(o => o.id == orderId);
        if (idx !== -1) {
            const old = orders[idx];
            orders[idx] = {
                ...old,
                productName: updateData.produto_nome,
                responsibleName: updateData.responsavel,
                urgency: updateData.urgencia,
                osType: updateData.tipo_os,
                photoType: updateData.tipo_foto,
                linkAnuncio: updateData.link_anuncio,
                skus: updateData.skus,
                observations: updateData.observacoes,
                valorAnuncio: updateData.valor_anuncio,
                descricaoAnuncio: updateData.descricao_anuncio,
                linkNovoAnuncio: updateData.link_novo_anuncio,
                precisaFoto: updateData.precisa_foto,
                updatedAt: updateData.ultima_atualizacao,
                motivo_rejeicao: updateData.motivo_rejeicao !== undefined ? updateData.motivo_rejeicao : old.motivo_rejeicao
            };
        }
        
        showToast('✅ OS atualizada com sucesso!', 'success');
        fecharModalEdicaoOS();
        renderOrdersTable();
        updateCounters();
    } catch (error) {
        console.error('Erro ao salvar edição:', error);
        showToast('❌ Erro ao salvar: ' + error.message, 'error');
    }
};

// ============================================
// FUNÇÃO PARA APROVAR REEMBOLSO (Marcar como Reembolsado)
// ============================================
window.aprovarReembolso = async function(id) {
    if (!confirm('✅ Confirmar que o reembolso foi obtido com sucesso?')) return;

    try {
        if (!supabaseClient) throw new Error('Supabase não conectado');

        const { error } = await supabaseClient
            .from('reembolsos_ml')
            .update({
                status: 'reembolsado',
                status_reembolso: 'finalizado',
                verificado_por: currentUser.name,
                data_atualizacao: new Date().toISOString()
            })
            .eq('id', id);

        if (error) throw error;

        // Atualiza local
        const idx = reembolsos.findIndex(r => r.id === id);
        if (idx !== -1) {
            reembolsos[idx].status = 'reembolsado';
            reembolsos[idx].status_reembolso = 'finalizado';
            reembolsos[idx].verificado_por = currentUser.name;
        }

        await loadReembolsos(); // recarrega tudo
        showToast('✅ Reembolso aprovado!', 'success');
    } catch (error) {
        console.error(error);
        showToast('Erro ao aprovar: ' + error.message, 'error');
    }
};

// ============================================
// SISTEMA DE PRECIFICAÇÃO DE NOVOS ANÚNCIOS
// ============================================

// Variáveis
let precificacoes = [];

// Abrir sistema de precificação
window.abrirSistemaPrecificacao = function() {
    if (!currentUser) {
        showToast('⚠️ Faça login primeiro', 'warning');
        return;
    }

    // Esconder menu e outros sistemas
    const menuSystem = document.getElementById('menuSystem');
    if (menuSystem) menuSystem.classList.add('hidden');

    const sistemasIds = [
        'mainSystem', 'salesSystem', 'reembolsosSystem', 'caixaSystem', 'precificacaoSystem',
        'reviewsSystem', 'folgasSystem', 'shippingSystem', 'estoqueSystem', 'feedbackSystem',
        'estoqueGestaoSystem', 'nfeSystem', 'gerenciamentoAnunciosSystem', 'perguntasSystem', 'entradasSystem', 'promocoesSystem'
    ];
    sistemasIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });

    const precSystem = document.getElementById('precificacaoSystem');
    if (precSystem) precSystem.classList.remove('hidden');

    // Atualizar dados do usuário
    document.getElementById('precUserName').textContent = currentUser.name;
    document.getElementById('precUserAvatar').textContent = currentUser.avatar;
    document.getElementById('precUserRole').textContent = currentUser.role;

    // Carregar dados
    carregarPrecificacao();
    showToast('📋 Sistema de Precificação carregado', 'info');
};

// Carregar solicitações do Supabase
async function carregarPrecificacao(filtro = '') {
    if (!supabaseClient) {
        showToast('Erro: Supabase não conectado', 'error');
        return;
    }

    try {
        let query = supabaseClient
            .from('precificacao_anuncios')
            .select('*')
            .order('criado_em', { ascending: false });

        // Aplica filtro de busca se houver
        if (filtro.trim() !== '') {
            const termo = filtro.trim().toLowerCase();
            query = query.or(
                `nome_produto.ilike.%${termo}%,` +
                `fornecedor.ilike.%${termo}%,` +
                `sugestao_titulo.ilike.%${termo}%`
            );
        }

        const { data, error } = await query;
        if (error) throw error;

        precificacoes = data || [];
        renderizarPrecificacao();

    } catch (error) {
        console.error('❌ Erro ao carregar precificações:', error);
        showToast('Erro ao carregar dados: ' + error.message, 'error');
    }
}

// Renderizar cards
function renderizarPrecificacao() {
    const pendentesContainer = document.getElementById('precListaPendentes');
    const finalizadosContainer = document.getElementById('precListaFinalizados');

    // Limpar
    pendentesContainer.innerHTML = '';
    finalizadosContainer.innerHTML = '';

    // Separar por status
    const pendentes = precificacoes.filter(p => p.status === 'pendente');
    const finalizados = precificacoes.filter(p => p.status === 'finalizado');

    // Ordenar pendentes por urgência (alta > normal > baixa) e depois por data
    const ordemUrgencia = { alta: 0, normal: 1, baixa: 2 };
    pendentes.sort((a, b) => {
        const diff = ordemUrgencia[a.urgencia] - ordemUrgencia[b.urgencia];
        if (diff !== 0) return diff;
        return new Date(b.criado_em) - new Date(a.criado_em);
    });

    // Renderizar pendentes
    if (pendentes.length === 0) {
        pendentesContainer.innerHTML = `<div class="col-12 text-center py-4 text-muted">Nenhuma solicitação pendente.</div>`;
    } else {
        pendentes.forEach(item => {
            pendentesContainer.appendChild(criarCard(item));
        });
    }

    // Finalizados (mais recentes primeiro)
    finalizados.sort((a, b) => new Date(b.finalizado_em) - new Date(a.finalizado_em));
    if (finalizados.length === 0) {
        finalizadosContainer.innerHTML = `<div class="col-12 text-center py-4 text-muted">Nenhuma solicitação finalizada.</div>`;
    } else {
        finalizados.forEach(item => {
            finalizadosContainer.appendChild(criarCard(item));
        });
    }
}

// Criar um card individual
function criarCard(item) {
    const col = document.createElement('div');
    col.className = 'col-md-6 col-lg-4 mb-3';

    const isPendente = item.status === 'pendente';
    const isAdmin = currentUser && currentUser.role === 'Administrador';

    let botoesAcao = '';

    if (isPendente) {
        botoesAcao += `
            <button class="btn btn-success btn-sm" onclick="finalizarPrecificacao('${item.id}')">
                <i class="fas fa-check"></i> OK (Peguei os dados)
            </button>
        `;
    } else {
        botoesAcao += `
            <span class="badge badge-success">Finalizado por ${escapeHtml(item.finalizado_por)} em ${new Date(item.finalizado_em).toLocaleString('pt-BR')}</span>
        `;
    }

    // Botão de excluir - apenas para admin
    if (isAdmin) {
        botoesAcao += `
            <button class="btn btn-danger btn-sm ml-2" onclick="excluirPrecificacao('${item.id}')" title="Excluir permanentemente">
                <i class="fas fa-trash"></i>
            </button>
        `;
    }

    col.innerHTML = `
        <div class="card h-100 shadow-sm">
            <div class="card-body">
                <div class="d-flex justify-content-between align-items-start mb-2">
                    <h5 class="card-title mb-0">${escapeHtml(item.nome_produto)}</h5>
                    <span class="badge ${item.urgencia === 'alta' ? 'badge-danger' : item.urgencia === 'normal' ? 'badge-warning' : 'badge-success'}">
                        ${item.urgencia.charAt(0).toUpperCase() + item.urgencia.slice(1)}
                    </span>
                </div>
                <div class="small text-muted mb-2">
                    <i class="fas fa-building"></i> ${escapeHtml(item.fornecedor)} &nbsp;|&nbsp;
                    <i class="fas fa-clock"></i> ${new Date(item.criado_em).toLocaleString('pt-BR')}
                </div>
                <p class="card-text">
                    <strong>Sugestão de título:</strong> ${escapeHtml(item.sugestao_titulo || 'Não informado')}<br>
                    <strong>Custo:</strong> R$ ${parseFloat(item.valor_custo).toFixed(2)} &nbsp;|&nbsp;
                    <strong>Venda:</strong> R$ ${parseFloat(item.valor_venda).toFixed(2)}
                </p>
                ${item.link_referencia ? `<p class="card-text"><a href="${escapeHtml(item.link_referencia)}" target="_blank" rel="noopener"><i class="fas fa-link"></i> Link de referência</a></p>` : ''}
                ${item.observacao ? `<p class="card-text small"><i class="fas fa-comment"></i> ${escapeHtml(item.observacao)}</p>` : ''}
                <p class="card-text small text-muted">
                    <i class="fas fa-user"></i> Criado por: ${escapeHtml(item.criado_por)}
                </p>
                <div class="d-flex flex-wrap gap-1">
                    ${botoesAcao}
                </div>
            </div>
        </div>
    `;

    return col;
}

// ===== INICIALIZAÇÃO DO CARROSSEL =====
function initCarousel() {
    const container = document.querySelector('.carousel-container');
    if (!container) return;

    const slides = container.querySelector('.carousel-slides');
    const slideItems = container.querySelectorAll('.carousel-slide');
    const prevBtn = container.querySelector('.carousel-btn.prev');
    const nextBtn = container.querySelector('.carousel-btn.next');
    const indicators = container.querySelector('.carousel-indicators');

    let currentIndex = 0;
    const totalSlides = slideItems.length;
    let intervalId = null;
    let isTransitioning = false;

    // Criar indicadores
    for (let i = 0; i < totalSlides; i++) {
        const dot = document.createElement('span');
        dot.dataset.index = i;
        if (i === 0) dot.classList.add('active');
        dot.addEventListener('click', () => goToSlide(i));
        indicators.appendChild(dot);
    }

    function goToSlide(index) {
        if (isTransitioning || index === currentIndex) return;
        isTransitioning = true;
        currentIndex = index;
        slides.style.transform = `translateX(-${currentIndex * 100}%)`;
        // Atualizar indicadores
        indicators.querySelectorAll('span').forEach((dot, i) => {
            dot.classList.toggle('active', i === currentIndex);
        });
        setTimeout(() => { isTransitioning = false; }, 500);
        resetInterval();
    }

    function nextSlide() {
        goToSlide((currentIndex + 1) % totalSlides);
    }

    function prevSlide() {
        goToSlide((currentIndex - 1 + totalSlides) % totalSlides);
    }

    function resetInterval() {
        if (intervalId) clearInterval(intervalId);
        intervalId = setInterval(nextSlide, 6000);
    }

    // Eventos dos botões
    prevBtn.addEventListener('click', (e) => { e.stopPropagation(); prevSlide(); });
    nextBtn.addEventListener('click', (e) => { e.stopPropagation(); nextSlide(); });

    // Pausar ao passar o mouse
    container.addEventListener('mouseenter', () => {
        if (intervalId) clearInterval(intervalId);
    });
    container.addEventListener('mouseleave', resetInterval);

    // Iniciar
    resetInterval();
}

// ============================================
// MÓDULO: ACOMPANHAMENTO DE DEVOLUÇÕES
// ============================================

let devolucoes = [];
let filtroDevolucaoAtual = 'aguardando';
let editingDevolucaoId = null;
let devolucaoParaOS = null; // guarda a devolução que gerará OS

// ===== ALTERNAR ABAS =====
function switchReembolsoTab(tab) {
    // Atualizar botões
    const btnRec = document.getElementById('tabReclamacoesBtn');
    const btnDev = document.getElementById('tabDevolucoesBtn');
    const contentRec = document.getElementById('reclamacoesContent');
    const contentDev = document.getElementById('devolucoesContent');

    if (tab === 'reclamacoes') {
        btnRec.className = 'btn btn-primary';
        btnDev.className = 'btn btn-outline-primary';
        contentRec.classList.remove('hidden');
        contentDev.classList.add('hidden');
        // Recarregar reembolsos se necessário
        if (typeof loadReembolsos === 'function') loadReembolsos();
    } else {
        btnDev.className = 'btn btn-primary';
        btnRec.className = 'btn btn-outline-primary';
        contentDev.classList.remove('hidden');
        contentRec.classList.add('hidden');
        carregarDevolucoes();
    }
}

// ===== CARREGAR DEVOLUÇÕES =====
async function carregarDevolucoes() {
    if (!supabaseClient) {
        showToast('Erro: Supabase não conectado', 'error');
        return;
    }

    try {
        const { data, error } = await supabaseClient
            .from('devolucoes_acompanhamento')
            .select('*')
            .order('data_abertura', { ascending: false });

        if (error) throw error;
        devolucoes = data || [];
        console.log(`✅ ${devolucoes.length} devoluções carregadas. Status:`, devolucoes.map(d => d.status));
        atualizarContadoresDevolucoes();

        // Se não houver filtro definido, ou for 'todos', usar 'aguardando' como padrão
        if (!filtroDevolucaoAtual || filtroDevolucaoAtual === 'todos') {
            filtroDevolucaoAtual = 'aguardando';
        }

        // Atualizar estilo dos botões para refletir o filtro atual
        document.querySelectorAll('#devolucoesContent .btn[data-filtro]').forEach(btn => {
            btn.classList.remove('active', 'btn-primary');
            btn.classList.add('btn-outline-secondary');
        });
        const btnAtivo = document.querySelector(`#devolucoesContent .btn[data-filtro="${filtroDevolucaoAtual}"]`);
        if (btnAtivo) {
            btnAtivo.classList.remove('btn-outline-secondary');
            btnAtivo.classList.add('active', 'btn-primary');
        }

        renderizarDevolucoes();
    } catch (error) {
        console.error('❌ Erro ao carregar devoluções:', error);
        showToast('Erro ao carregar devoluções', 'error');
    }
}

// ===== ATUALIZAR CONTADORES =====
function atualizarContadoresDevolucoes() {
    const aguardando = devolucoes.filter(d => d.status === 'aguardando_recebimento').length;
    const recebidos = devolucoes.filter(d => d.status === 'recebido').length;
    const cancelados = devolucoes.filter(d => d.status === 'cancelado').length;
    const total = devolucoes.length;

    document.getElementById('countDevAguardando').textContent = aguardando;
    document.getElementById('countDevRecebidos').textContent = recebidos;
    document.getElementById('countDevCancelados').textContent = cancelados;

    // Atualizar filtros
    document.getElementById('filtroDevAguardando').textContent = aguardando;
    document.getElementById('filtroDevRecebidos').textContent = recebidos;
    document.getElementById('filtroDevCancelados').textContent = cancelados;
    document.getElementById('filtroDevTodos').textContent = total;
}
function getStatusFromFilter(filtro) {
    const map = {
        'aguardando': 'aguardando_recebimento',
        'recebidos': 'recebido',
        'cancelados': 'cancelado',
        'todos': null
    };
    return map[filtro] || filtro;
}

// ===== FUNÇÕES FALTANTES =====
function atualizarVisibilidadeMenu() {
    // Controla a exibição de itens do menu conforme o usuário logado
    // Se não houver usuário, esconde itens que exigem permissão
    if (!currentUser) {
        document.querySelectorAll('.menu-card[data-restricted]').forEach(el => el.style.display = 'none');
        return;
    }
    // Se quiser lógica específica, implemente aqui
    // Exemplo: mostrar/ocultar card de histórico
    const historicoCard = document.getElementById('historicoMenuCard');
    if (historicoCard) {
        const permitidos = ['ronald', 'andressamiotto'];
        historicoCard.style.display = (permitidos.includes(currentUser.username)) ? '' : 'none';
    }
}

function clearMLTokenStorage() {
    // Limpa tokens do Mercado Livre
    localStorage.removeItem('ml_access_token');
    localStorage.removeItem('ml_refresh_token');
    localStorage.removeItem('ml_token_expiry');
    localStorage.removeItem('ml_token_data');
    console.log('🧹 Tokens ML limpos');
}

// Caso exista também essa função, defina-a:
function atualizarVisibilidadeRelatorioColaborador() {
    // Exibe botão de relatório por colaborador apenas para admin
    const btnDiv = document.getElementById('btnRelatorioColaborador');
    if (btnDiv) {
        btnDiv.style.display = (currentUser && currentUser.role === 'Administrador') ? '' : 'none';
    }
}

// ===== RENDERIZAR DEVOLUÇÕES =====
function renderizarDevolucoes() {
    const tbody = document.getElementById('devolucoesTableBody');
    if (!tbody) return;

    console.log('📊 Renderizando devoluções. Total:', devolucoes.length, 'Filtro atual:', filtroDevolucaoAtual);

    // Aplicar filtro
    let lista = [...devolucoes];
    
    // Normalizar status
    lista.forEach(d => {
        let status = (d.status || '').toLowerCase().trim();
        if (status === 'aguardando' || status === 'aguardando_recebimento') d.status = 'aguardando_recebimento';
        else if (status === 'recebido' || status === 'recebido') d.status = 'recebido';
        else if (status === 'cancelado' || status === 'cancelado') d.status = 'cancelado';
        else d.status = status;
    });

    if (filtroDevolucaoAtual !== 'todos') {
        const statusMap = {
            'aguardando': 'aguardando_recebimento',
            'recebidos': 'recebido',
            'cancelados': 'cancelado'
        };
        const statusFiltro = statusMap[filtroDevolucaoAtual] || filtroDevolucaoAtual;
        lista = lista.filter(d => d.status === statusFiltro);
    }

    // Busca
    const busca = document.getElementById('buscaDevolucao').value.trim().toLowerCase();
    if (busca) {
        lista = lista.filter(d =>
            (d.nome_produto && d.nome_produto.toLowerCase().includes(busca)) ||
            (d.venda_link && d.venda_link.toLowerCase().includes(busca))
        );
    }

    if (lista.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center py-5">Nenhuma devolução encontrada.</td></tr>`;
        return;
    }

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    let html = '';
    lista.forEach(d => {
        let alertaClass = '';
        let alertaMsg = '';
        let statusText = '';
        let statusClass = '';

        switch (d.status) {
            case 'aguardando_recebimento':
                statusText = 'Aguardando Recebimento';
                statusClass = 'badge-warning';
                if (d.data_abertura) {
                    const abertura = new Date(d.data_abertura + 'T00:00:00');
                    const diffDias = Math.floor((hoje - abertura) / (1000 * 60 * 60 * 24));
                    if (diffDias >= 7 && !d.data_postagem) {
                        alertaClass = 'alerta-nao-enviado';
                        alertaMsg = '⚠️ Cliente não enviou (7 dias)';
                    }
                }
                if (d.data_postagem) {
                    const postagem = new Date(d.data_postagem + 'T00:00:00');
                    const diffDias = Math.floor((hoje - postagem) / (1000 * 60 * 60 * 24));
                    if (diffDias >= 30) {
                        alertaClass = 'alerta-extraviado';
                        alertaMsg = '🚨 Pedir reembolso de extravio (30 dias)';
                    }
                }
                break;
            case 'recebido':
                statusText = 'Recebido';
                statusClass = 'badge-success';
                break;
            case 'cancelado':
                statusText = 'Cancelado';
                statusClass = 'badge-secondary';
                break;
            default:
                statusText = d.status || 'Desconhecido';
                statusClass = 'badge-secondary';
        }

        // 🔥 CORREÇÃO: Formatar datas sem conversão de fuso
        const dataAberturaFormatada = d.data_abertura ? formatarDataBR(d.data_abertura) : '-';
        const dataPostagemFormatada = d.data_postagem ? formatarDataBR(d.data_postagem) : '-';

        let botoes = '';
        if (d.status === 'aguardando_recebimento') {
            botoes += `<button class="btn btn-sm btn-primary" onclick="abrirModalRecebimento('${d.id}')" title="Registrar chegada"><i class="fas fa-box-open"></i> Chegou</button>`;
        }
        botoes += `<button class="btn btn-sm btn-warning" onclick="editarDevolucao('${d.id}')" title="Editar"><i class="fas fa-edit"></i></button>`;
        if (currentUser && currentUser.role === 'Administrador') {
            botoes += `<button class="btn btn-sm btn-danger" onclick="excluirDevolucao('${d.id}')" title="Excluir"><i class="fas fa-trash"></i></button>`;
        }

        const linhaAlerta = alertaClass ? `<span class="badge ${alertaClass}" style="display:inline-block; padding:3px 8px;">${alertaMsg}</span>` : '';

        html += `
            <tr class="${alertaClass}">
                <td><a href="${d.venda_link || '#'}" target="_blank" class="text-primary">${d.venda_link ? 'Ver venda' : '-'}</a></td>
                <td><strong>${d.nome_produto || '-'}</strong></td>
                <td>${dataAberturaFormatada}</td>
                <td>${dataPostagemFormatada}</td>
                <td>
                    <span class="badge ${statusClass}">${statusText}</span>
                    ${linhaAlerta}
                </td>
                <td>
                    <div class="d-flex flex-wrap gap-1">
                        ${botoes}
                    </div>
                </td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
}

// ============================================
// FUNÇÃO AUXILIAR: FORMATAR DATA BR (YYYY-MM-DD -> DD/MM/YYYY)
// ============================================

function formatarDataBR(dataStr) {
    if (!dataStr) return '-';
    const partes = dataStr.split('-');
    if (partes.length === 3) {
        return `${partes[2]}/${partes[1]}/${partes[0]}`;
    }
    return dataStr;
}

// ===== FILTRAR DEVOLUÇÕES =====
function filtrarDevolucoes(filtro) {
    console.log('🔄 Aplicando filtro:', filtro);
    
    if (filtro) {
        filtroDevolucaoAtual = filtro;
        // Atualizar estilo dos botões
        document.querySelectorAll('#devolucoesContent .btn[data-filtro]').forEach(btn => {
            btn.classList.remove('active', 'btn-primary');
            btn.classList.add('btn-outline-secondary');
        });
        const btnAtivo = document.querySelector(`#devolucoesContent .btn[data-filtro="${filtro}"]`);
        if (btnAtivo) {
            btnAtivo.classList.remove('btn-outline-secondary');
            btnAtivo.classList.add('active', 'btn-primary');
        }
    }
    renderizarDevolucoes();
}

// Substitua a função abrirModalNovaDevolucao por esta versão corrigida:
function abrirModalNovaDevolucao() {
    editingDevolucaoId = null;
    document.getElementById('modalDevolucaoTitle').textContent = 'Nova Devolução';
    document.getElementById('editDevolucaoId').value = '';
    document.getElementById('devCamposRecebimento').style.display = 'none';
    
    // Limpar campos
    document.getElementById('devVendaLink').value = '';
    document.getElementById('devNomeProduto').value = '';
    
    // 🔥 CORREÇÃO: Usar a data atual no formato YYYY-MM-DD (sem conversão de fuso)
    const hoje = new Date().toISOString().split('T')[0];
    document.getElementById('devDataAbertura').value = hoje;
    document.getElementById('devDataPostagem').value = '';
    document.getElementById('devAfetaReputacao').value = 'nao';
    document.getElementById('devLocalFull').value = 'local';
    document.getElementById('devDataRecebimento').value = '';
    document.getElementById('devQuemRevisou').value = '';
    document.getElementById('devAptaVenda').value = 'nao';
    document.getElementById('devBloqueado').value = 'nao';
    document.getElementById('devResponsabilidade').value = '';
    document.getElementById('devCancelouDevolucao').value = 'nao';
    document.getElementById('devObservacao').value = '';

    document.getElementById('modalNovaDevolucao').classList.remove('hidden');
}

// ===== FECHAR MODAL NOVA DEVOLUÇÃO =====
function fecharModalNovaDevolucao() {
    document.getElementById('modalNovaDevolucao').classList.add('hidden');
}

// ===== SALVAR DEVOLUÇÃO (CRIAR/EDITAR) =====
document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('formNovaDevolucao');
    if (form) {
        // Remove listeners antigos (se houver)
        const newForm = form.cloneNode(true);
        form.parentNode.replaceChild(newForm, form);
        
        newForm.addEventListener('submit', async function(e) {
            e.preventDefault();

            const id = document.getElementById('editDevolucaoId').value;
            const vendaLink = document.getElementById('devVendaLink').value.trim();
            const nomeProduto = document.getElementById('devNomeProduto').value.trim();
            const dataAbertura = document.getElementById('devDataAbertura').value;
            const dataPostagem = document.getElementById('devDataPostagem').value || null;
            const afetaReputacao = document.getElementById('devAfetaReputacao').value === 'sim';
            const localFull = document.getElementById('devLocalFull').value;

            if (!vendaLink || !nomeProduto || !dataAbertura) {
                showToast('Preencha todos os campos obrigatórios (*)', 'warning');
                return;
            }

            // Dados da segunda parte
            const dataRecebimento = document.getElementById('devDataRecebimento').value || null;
            const quemRevisou = document.getElementById('devQuemRevisou').value || null;
            const aptaVenda = document.getElementById('devAptaVenda').value === 'sim';
            const bloqueado = document.getElementById('devBloqueado').value === 'sim';
            const responsabilidade = document.getElementById('devResponsabilidade').value || null;
            const cancelouDevolucao = document.getElementById('devCancelouDevolucao').value === 'sim';
            const observacao = document.getElementById('devObservacao').value || null;

            // 🔥 CORREÇÃO: Garantir que as datas sejam salvas no formato correto (YYYY-MM-DD)
            // O input type="date" já retorna YYYY-MM-DD, mas vamos garantir que não haja conversão de fuso
            const dataAberturaCorrigida = dataAbertura ? dataAbertura : null;
            const dataPostagemCorrigida = dataPostagem ? dataPostagem : null;
            const dataRecebimentoCorrigida = dataRecebimento ? dataRecebimento : null;

            const dados = {
                venda_link: vendaLink,
                nome_produto: nomeProduto,
                data_abertura: dataAberturaCorrigida,
                data_postagem: dataPostagemCorrigida,
                afeta_reputacao: afetaReputacao,
                local_ou_full: localFull,
                data_recebimento: dataRecebimentoCorrigida,
                quem_revisou: quemRevisou,
                apta_venda: aptaVenda,
                bloqueado: bloqueado,
                responsabilidade: responsabilidade,
                cancelou_devolucao: cancelouDevolucao,
                observacao: observacao,
                atualizado_em: new Date().toISOString()
            };

            if (!id) {
                dados.status = 'aguardando_recebimento';
                dados.criado_por = currentUser.name;
                dados.criado_em = new Date().toISOString();
            }

            try {
                let result;
                if (id) {
                    const { data, error } = await supabaseClient
                        .from('devolucoes_acompanhamento')
                        .update(dados)
                        .eq('id', id)
                        .select();
                    if (error) throw error;
                    result = data;
                    showToast('✅ Devolução atualizada!', 'success');
                } else {
                    const { data, error } = await supabaseClient
                        .from('devolucoes_acompanhamento')
                        .insert([dados])
                        .select();
                    if (error) throw error;
                    result = data;
                    showToast('✅ Devolução criada!', 'success');
                }
                fecharModalNovaDevolucao();
                carregarDevolucoes();
            } catch (error) {
                console.error('❌ Erro ao salvar devolução:', error);
                showToast('Erro ao salvar: ' + error.message, 'error');
            }
        });
    }
});

// Substitua a função editarDevolucao por esta versão corrigida:
function editarDevolucao(id) {
    const dev = devolucoes.find(d => d.id === id);
    if (!dev) {
        showToast('Devolução não encontrada', 'error');
        return;
    }

    editingDevolucaoId = id;
    document.getElementById('modalDevolucaoTitle').textContent = 'Editar Devolução';
    document.getElementById('editDevolucaoId').value = id;
    document.getElementById('devVendaLink').value = dev.venda_link || '';
    document.getElementById('devNomeProduto').value = dev.nome_produto || '';
    
    // 🔥 CORREÇÃO: Manter a data exata sem conversão de fuso
    document.getElementById('devDataAbertura').value = dev.data_abertura || '';
    document.getElementById('devDataPostagem').value = dev.data_postagem || '';
    
    document.getElementById('devAfetaReputacao').value = dev.afeta_reputacao ? 'sim' : 'nao';
    document.getElementById('devLocalFull').value = dev.local_ou_full || 'local';

    const temRecebimento = dev.data_recebimento || dev.quem_revisou;
    document.getElementById('devCamposRecebimento').style.display = temRecebimento ? 'block' : 'none';
    document.getElementById('devDataRecebimento').value = dev.data_recebimento || '';
    document.getElementById('devQuemRevisou').value = dev.quem_revisou || '';
    document.getElementById('devAptaVenda').value = dev.apta_venda ? 'sim' : 'nao';
    document.getElementById('devBloqueado').value = dev.bloqueado ? 'sim' : 'nao';
    document.getElementById('devResponsabilidade').value = dev.responsabilidade || '';
    document.getElementById('devCancelouDevolucao').value = dev.cancelou_devolucao ? 'sim' : 'nao';
    document.getElementById('devObservacao').value = dev.observacao || '';

    document.getElementById('modalNovaDevolucao').classList.remove('hidden');
}

// ===== EXCLUIR DEVOLUÇÃO =====
async function excluirDevolucao(id) {
    if (!confirm('Tem certeza que deseja excluir esta devolução?')) return;
    try {
        const { error } = await supabaseClient
            .from('devolucoes_acompanhamento')
            .delete()
            .eq('id', id);
        if (error) throw error;
        showToast('🗑️ Devolução excluída', 'success');
        carregarDevolucoes();
    } catch (error) {
        console.error('Erro ao excluir:', error);
        showToast('Erro ao excluir', 'error');
    }
}

// Substitua a função abrirModalRecebimento por esta versão corrigida:
function abrirModalRecebimento(id) {
    document.getElementById('recebimentoDevolucaoId').value = id;
    const dev = devolucoes.find(d => d.id === id);
    
    // 🔥 CORREÇÃO: Usar a data exata do banco, sem conversão
    const hoje = new Date().toISOString().split('T')[0];
    
    if (dev) {
        document.getElementById('recebDataRecebimento').value = dev.data_recebimento || hoje;
        document.getElementById('recebQuemRevisou').value = dev.quem_revisou || '';
        document.getElementById('recebAptaVenda').value = dev.apta_venda ? 'sim' : 'nao';
        document.getElementById('recebBloqueado').value = dev.bloqueado ? 'sim' : 'nao';
        document.getElementById('recebResponsabilidade').value = dev.responsabilidade || '';
        document.getElementById('recebCancelouDevolucao').value = dev.cancelou_devolucao ? 'sim' : 'nao';
        document.getElementById('recebObservacao').value = dev.observacao || '';
    } else {
        document.getElementById('recebDataRecebimento').value = hoje;
        document.getElementById('recebQuemRevisou').value = '';
        document.getElementById('recebAptaVenda').value = 'nao';
        document.getElementById('recebBloqueado').value = 'nao';
        document.getElementById('recebResponsabilidade').value = '';
        document.getElementById('recebCancelouDevolucao').value = 'nao';
        document.getElementById('recebObservacao').value = '';
    }
    
    document.getElementById('modalRecebimentoDevolucao').classList.remove('hidden');
}

// ===== FECHAR MODAL RECEBIMENTO =====
function fecharModalRecebimento() {
    document.getElementById('modalRecebimentoDevolucao').classList.add('hidden');
}

// Substitua a função salvarRecebimento por esta versão corrigida:
async function salvarRecebimento() {
    const id = document.getElementById('recebimentoDevolucaoId').value;
    if (!id) {
        showToast('ID inválido', 'error');
        return;
    }

    const dataRecebimento = document.getElementById('recebDataRecebimento').value;
    const quemRevisou = document.getElementById('recebQuemRevisou').value;
    const aptaVenda = document.getElementById('recebAptaVenda').value === 'sim';
    const bloqueado = document.getElementById('recebBloqueado').value === 'sim';
    const responsabilidade = document.getElementById('recebResponsabilidade').value || null;
    const cancelouDevolucao = document.getElementById('recebCancelouDevolucao').value === 'sim';
    const observacao = document.getElementById('recebObservacao').value || null;

    if (!dataRecebimento || !quemRevisou) {
        showToast('Preencha data de recebimento e quem revisou', 'warning');
        return;
    }

    try {
        // 🔥 CORREÇÃO: Manter a data exata selecionada (YYYY-MM-DD)
        const updateData = {
            data_recebimento: dataRecebimento, // Já está no formato correto do input type="date"
            quem_revisou: quemRevisou,
            apta_venda: aptaVenda,
            bloqueado: bloqueado,
            responsabilidade: responsabilidade,
            cancelou_devolucao: cancelouDevolucao,
            observacao: observacao,
            atualizado_em: new Date().toISOString()
        };

        if (cancelouDevolucao) {
            updateData.status = 'cancelado';
        } else {
            updateData.status = 'recebido';
        }

        const { error } = await supabaseClient
            .from('devolucoes_acompanhamento')
            .update(updateData)
            .eq('id', id);

        if (error) throw error;

        showToast('✅ Recebimento registrado!', 'success');
        fecharModalRecebimento();

        if (!cancelouDevolucao) {
            const { data: devAtualizada } = await supabaseClient
                .from('devolucoes_acompanhamento')
                .select('*')
                .eq('id', id)
                .single();

            if (devAtualizada) {
                devolucaoParaOS = devAtualizada;
                document.getElementById('osDevolucaoId').value = id;
                document.getElementById('obsOSDevolucao').value = '';
                document.getElementById('modalObservacaoOS').classList.remove('hidden');
            }
        }

        carregarDevolucoes();

    } catch (error) {
        console.error('❌ Erro ao salvar recebimento:', error);
        showToast('Erro ao salvar recebimento', 'error');
    }
}

// ===== CONFIRMAR CRIAÇÃO DE OS =====
async function confirmarCriarOSDevolucao() {
    const id = document.getElementById('osDevolucaoId').value;
    const observacao = document.getElementById('obsOSDevolucao').value.trim();

    if (!devolucaoParaOS || devolucaoParaOS.id !== id) {
        showToast('Erro: dados da devolução não encontrados', 'error');
        return;
    }

    const dev = devolucaoParaOS;

    try {
        // Construir dados da OS
        const osData = {
            code: generateOSCode(),
            productName: dev.nome_produto,
            responsibleName: 'Elaine',
            urgency: 'alta',
            osType: 'devolucao',
            photoType: 'estudio', // padrão
            skus: [],
            observations: observacao || `Devolução: ${dev.nome_produto} - ${dev.venda_link || ''}`,
            createdBy: currentUser.name,
            status: 'pendente',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            photos: [],
            photosTaken: 0,
            editsMade: 0,
            conferido: false,
            user_notified: false,
            precisaFoto: 'nao',
            valorAnuncio: 0,
            descricaoAnuncio: '',
            linkNovoAnuncio: '',
            linkAnuncio: dev.venda_link || '',
            prazo_horas: 2, // urgência alta
            prazo_esperado: calcularPrazoPorPrioridade(new Date(), null, 2)
        };

        // Salvar OS no Supabase
        const result = await saveOrderToSupabase(osData);
        if (result.success) {
            // Atualizar devolução com o ID da OS
            const osId = result.data && result.data[0] ? result.data[0].id : null;
            if (osId) {
                await supabaseClient
                    .from('devolucoes_acompanhamento')
                    .update({ os_id: osId })
                    .eq('id', id);
            }

            // Adicionar à lista local de ordens
            orders.unshift({ ...osData, id: osId });
            updateCounters();
            renderOrdersTable();

            showToast('✅ OS criada com sucesso para Elaine!', 'success');
            fecharModalObservacaoOS();
            carregarDevolucoes();
        } else {
            showToast('❌ Erro ao criar OS: ' + result.error, 'error');
        }
    } catch (error) {
        console.error('❌ Erro ao criar OS:', error);
        showToast('Erro ao criar OS', 'error');
    }
}

// ===== FECHAR MODAL OBSERVAÇÃO OS =====
function fecharModalObservacaoOS() {
    document.getElementById('modalObservacaoOS').classList.add('hidden');
    devolucaoParaOS = null;
}

// ===== INICIALIZAR =====
// Chamar ao carregar a página
document.addEventListener('DOMContentLoaded', function() {
    // Se já estiver logado e a aba de devoluções estiver ativa, carregar
    // O carregamento será feito via switchReembolsoTab
});

// Chamar quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', initCarousel);

// Criar nova solicitação
document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('formPrecificacao');
    if (form) {
        form.addEventListener('submit', async function(e) {
            e.preventDefault();

            const fornecedor = document.getElementById('precFornecedor').value;
            const urgencia = document.getElementById('precUrgencia').value;
            const nomeProduto = document.getElementById('precNomeProduto').value.trim();
            const sugestaoTitulo = document.getElementById('precSugestaoTitulo').value.trim();
            const valorCusto = parseFloat(document.getElementById('precValorCusto').value);
            const valorVenda = parseFloat(document.getElementById('precValorVenda').value);
            const linkReferencia = document.getElementById('precLinkReferencia').value.trim();
            const observacao = document.getElementById('precObservacao').value.trim();

            if (!fornecedor || !nomeProduto || isNaN(valorCusto) || isNaN(valorVenda)) {
                showToast('Preencha todos os campos obrigatórios (*)', 'warning');
                return;
            }

            const dados = {
                fornecedor,
                urgencia,
                nome_produto: nomeProduto,
                sugestao_titulo: sugestaoTitulo || null,
                valor_custo: valorCusto,
                valor_venda: valorVenda,
                link_referencia: linkReferencia || null,
                observacao: observacao || null,
                status: 'pendente',
                criado_por: currentUser.name,
                criado_em: new Date().toISOString()
            };

            try {
                const { data, error } = await supabaseClient
                    .from('precificacao_anuncios')
                    .insert([dados]);

                if (error) throw error;

                showToast('✅ Solicitação criada com sucesso!', 'success');
                form.reset();
                carregarPrecificacao(document.getElementById('buscaPrecificacao').value);
            } catch (error) {
                console.error('❌ Erro ao criar solicitação:', error);
                showToast('Erro ao salvar: ' + error.message, 'error');
            }
        });
    }

    // Busca em tempo real
    const buscaInput = document.getElementById('buscaPrecificacao');
    if (buscaInput) {
        buscaInput.addEventListener('input', function() {
            carregarPrecificacao(this.value);
        });
    }
});

// Finalizar solicitação (marcar como OK)
window.finalizarPrecificacao = async function(id) {
    if (!confirm('Confirmar que você pegou os dados e já utilizou?')) return;

    try {
        const { error } = await supabaseClient
            .from('precificacao_anuncios')
            .update({
                status: 'finalizado',
                finalizado_por: currentUser.name,
                finalizado_em: new Date().toISOString()
            })
            .eq('id', id);

        if (error) throw error;

        showToast('✅ Solicitação finalizada!', 'success');
        carregarPrecificacao(document.getElementById('buscaPrecificacao').value);
    } catch (error) {
        console.error('❌ Erro ao finalizar:', error);
        showToast('Erro ao finalizar: ' + error.message, 'error');
    }
};

// ============================================
// EXCLUIR SOLICITAÇÃO DE PRECIFICAÇÃO (APENAS ADMIN)
// ============================================
window.excluirPrecificacao = async function(id) {
    // Verifica se o usuário é administrador
    if (!currentUser || currentUser.role !== 'Administrador') {
        showToast('⛔ Apenas administradores podem excluir solicitações.', 'error');
        return;
    }

    if (!confirm('Tem certeza que deseja excluir esta solicitação permanentemente?')) {
        return;
    }

    try {
        if (!supabaseClient) throw new Error('Supabase não conectado');

        const { error } = await supabaseClient
            .from('precificacao_anuncios')
            .delete()
            .eq('id', id);

        if (error) throw error;

        showToast('🗑️ Solicitação excluída com sucesso!', 'success');
        // Recarregar a lista com o filtro atual
        const busca = document.getElementById('buscaPrecificacao')?.value || '';
        carregarPrecificacao(busca);

    } catch (error) {
        console.error('❌ Erro ao excluir:', error);
        showToast('Erro ao excluir: ' + error.message, 'error');
    }
};

// ============================================================
// FLUXO DE RENOVAÇÃO DE ANÚNCIO
// Arthur -> Letícia -> Ronald -> Elaine -> fluxo normal
// ============================================================

(function instalarFluxoRenovacaoAnuncio() {
    if (
        window.__fluxoRenovacaoAnuncioInstalado
    ) {
        return;
    }

    window.__fluxoRenovacaoAnuncioInstalado =
        true;

    const SERVICO_RENOVACAO =
        'renovacao_anuncio';

    const ETAPA_LETICIA =
        'leticia_verificacao';

    const ETAPA_RONALD =
        'ronald_validacao';

    const ETAPA_ELAINE =
        'elaine_execucao';

    const ETAPA_ARTHUR =
        'devolvida_arthur';

    const ETAPA_NORMAL =
        'fluxo_normal';

    const ETAPA_FINALIZADA =
        'finalizada';

    // ========================================================
    // ADICIONAR SERVIÇO AO MAPA
    // ========================================================

    if (
        typeof PHOTO_TYPE_MAP ===
        'object'
    ) {
        PHOTO_TYPE_MAP[
            SERVICO_RENOVACAO
        ] =
            'Renovação de anúncio';
    }

    // ========================================================
    // FUNÇÕES AUXILIARES
    // ========================================================

    window.ehOSRenovacaoAnuncio =
        function(order) {
            return (
                String(
                    order?.photoType ||
                    order?.tipo_foto ||
                    ''
                )
                    .trim()
                    .toLowerCase() ===
                SERVICO_RENOVACAO
            );
        };

    window.estaNoFluxoEspecialRenovacao =
        function(order) {
            if (
                !window.ehOSRenovacaoAnuncio(
                    order
                )
            ) {
                return false;
            }

            return ![
                ETAPA_NORMAL,
                ETAPA_FINALIZADA
            ].includes(
                order.renovacaoEtapa
            );
        };

    window.obterNomeEtapaRenovacao =
        function(etapa) {
            const etapas = {
                [ETAPA_LETICIA]:
                    'Letícia verifica as vendas dos últimos 3 meses',

                [ETAPA_RONALD]:
                    'Ronald valida a foto da bike/gancheira',

                [ETAPA_ELAINE]:
                    'Elaine tira ou edita a foto',

                [ETAPA_ARTHUR]:
                    'Arthur corrige as informações',

                [ETAPA_NORMAL]:
                    'Aguardando conferência normal',

                [ETAPA_FINALIZADA]:
                    'Finalizada'
            };

            return (
                etapas[etapa] ||
                'Etapa não identificada'
            );
        };

    window.obterResponsavelEtapaRenovacao =
        function(etapa) {
            const responsaveis = {
                [ETAPA_LETICIA]:
                    'Leticia',

                [ETAPA_RONALD]:
                    'Ronald',

                [ETAPA_ELAINE]:
                    'Elaine',

                [ETAPA_ARTHUR]:
                    'Arthur',

                [ETAPA_NORMAL]:
                    'Ronald'
            };

            return (
                responsaveis[etapa] ||
                null
            );
        };

    window.usuarioAtualEhResponsavelRenovacao =
        function(order) {
            if (
                !currentUser ||
                !order
            ) {
                return false;
            }

            return (
                String(
                    order.responsibleName ||
                    ''
                )
                    .trim()
                    .toLowerCase() ===
                String(
                    currentUser.name ||
                    ''
                )
                    .trim()
                    .toLowerCase()
            );
        };

    window.podeAtuarNaEtapaRenovacao =
        function(order) {
            if (
                !currentUser ||
                !window.estaNoFluxoEspecialRenovacao(
                    order
                )
            ) {
                return false;
            }

            const username =
                getUsernameAtualOS();

            if (
                order.renovacaoEtapa ===
                    ETAPA_LETICIA
            ) {
                return (
                    username ===
                    'leticia'
                );
            }

            if (
                order.renovacaoEtapa ===
                    ETAPA_RONALD
            ) {
                return (
                    username ===
                    'ronald'
                );
            }

            if (
                order.renovacaoEtapa ===
                    ETAPA_ELAINE
            ) {
                return (
                    username ===
                    'elaine'
                );
            }

            if (
                order.renovacaoEtapa ===
                    ETAPA_ARTHUR
            ) {
                return (
                    username ===
                    'arthur'
                );
            }

            return false;
        };

    // ========================================================
    // CAMPO DE LINK DA FOTO DA BIKE
    // ========================================================

    window.configurarCampoRenovacaoAnuncio =
        function() {
            const servico =
                document.getElementById(
                    'photoType'
                );

            const responsavel =
                document.getElementById(
                    'responsibleName'
                );

            const container =
                document.getElementById(
                    'campoLinkFotoBikeRenovacao'
                );

            const linkFoto =
                document.getElementById(
                    'linkFotoBikeRenovacao'
                );

            if (
                !servico ||
                !container ||
                !linkFoto
            ) {
                return;
            }

            const atualizar =
                function() {
                    const ehRenovacao =
                        servico.value ===
                        SERVICO_RENOVACAO;

                    container.classList.toggle(
                        'hidden',
                        !ehRenovacao
                    );

                    linkFoto.required =
                        ehRenovacao;

                    if (!responsavel) {
                        return;
                    }

                    if (ehRenovacao) {
                        /*
                         * No formulário aparece Elaine porque ela
                         * é a destinatária final.
                         */
                        if (!editingOrderId) {
                            responsavel.value =
                                'Elaine';
                        }

                        responsavel.disabled =
                            true;
                    } else {
                        responsavel.disabled =
                            false;
                    }
                };

            if (
                servico.dataset
                    .eventoRenovacaoInstalado !==
                '1'
            ) {
                servico.addEventListener(
                    'change',
                    atualizar
                );

                servico.dataset
                    .eventoRenovacaoInstalado =
                    '1';
            }

            atualizar();
        };

    window.notificarResponsavelFluxoRenovacao =
    async function(
        order,
        destinatario,
        titulo,
        mensagem
    ) {
        if (
            !order ||
            !destinatario
        ) {
            return;
        }

        try {
            /*
             * Não envia mais e-mail.
             *
             * A notificação é criada pelo próprio registro da OS:
             * - responsavel define quem receberá;
             * - user_notified false ativa o sino.
             */
            if (supabaseClient) {
                const agora =
                    new Date().toISOString();

                const {
                    error
                } =
                    await supabaseClient
                        .from(
                            'ordens_service'
                        )
                        .update({
                            responsavel:
                                destinatario,

                            user_notified:
                                false,

                            ultima_atualizacao:
                                agora
                        })
                        .eq(
                            'id',
                            order.id
                        );

                if (error) {
                    throw error;
                }

                order.responsibleName =
                    destinatario;

                order.user_notified =
                    false;

                order.updatedAt =
                    agora;
            }

            /*
             * Atualiza a interface caso o destinatário esteja
             * usando esta mesma sessão.
             */
            if (
                typeof updateOSNotificationBell ===
                'function'
            ) {
                updateOSNotificationBell();
            }

            if (
                typeof updateNotificationsUI ===
                'function'
            ) {
                updateNotificationsUI();
            }

            console.log(
                `🔔 Notificação da OS ${order.code} enviada somente ao sino de ${destinatario}.`,
                {
                    titulo:
                        titulo,

                    mensagem:
                        mensagem
                }
            );
        } catch (error) {
            console.error(
                'Erro ao gerar notificação no sino:',
                error
            );

            throw error;
        }
    };

    // ========================================================
    // ATUALIZAR ETAPA NO BANCO E LOCALMENTE
    // ========================================================

    window.atualizarEtapaRenovacao =
        async function(
            order,
            {
                etapa,
                responsavel,
                motivo = null,
                etapaRetorno = null,
                dadosAdicionais = {}
            }
        ) {
            if (!order) {
                throw new Error(
                    'OS não encontrada.'
                );
            }

            if (!supabaseClient) {
                throw new Error(
                    'Supabase não conectado.'
                );
            }

            const agora =
                new Date().toISOString();

            const historicoAtual =
                Array.isArray(
                    order.renovacaoHistorico
                )
                    ? order.renovacaoHistorico
                    : [];

            const novoHistorico = [
                ...historicoAtual,
                {
                    etapa_anterior:
                        order.renovacaoEtapa ||
                        null,

                    nova_etapa:
                        etapa,

                    responsavel:
                        responsavel,

                    alterado_por:
                        currentUser?.name ||
                        'Sistema',

                    motivo:
                        motivo,

                    data:
                        agora
                }
            ];

            const dadosBanco = {
                renovacao_etapa:
                    etapa,

                renovacao_etapa_retorno:
                    etapaRetorno,

                renovacao_motivo_reprovacao:
                    motivo,

                renovacao_historico:
                    novoHistorico,

                responsavel:
                    responsavel,

                user_notified:
                    false,

                ultima_atualizacao:
                    agora,

                ...dadosAdicionais
            };

            const {
                error
            } =
                await supabaseClient
                    .from(
                        'ordens_service'
                    )
                    .update(
                        dadosBanco
                    )
                    .eq(
                        'id',
                        order.id
                    );

            if (error) {
                throw error;
            }

            order.renovacaoEtapa =
                etapa;

            order.renovacaoEtapaRetorno =
                etapaRetorno;

            order.renovacaoMotivoReprovacao =
                motivo;

            order.renovacaoHistorico =
                novoHistorico;

            order.responsibleName =
                responsavel;

            order.user_notified =
                false;

            order.updatedAt =
                agora;

            if (
                Object.prototype
                    .hasOwnProperty
                    .call(
                        dadosAdicionais,
                        'status'
                    )
            ) {
                order.status =
                    dadosAdicionais.status;
            }

            if (
                Object.prototype
                    .hasOwnProperty
                    .call(
                        dadosAdicionais,
                        'conferido'
                    )
            ) {
                order.conferido =
                    dadosAdicionais.conferido;
            }

            updateCounters();
            renderOrdersTable();
            updateOSNotificationBell();
            updateNotificationsUI();

            return agora;
        };

    // ========================================================
    // LETÍCIA OU RONALD APROVAR ETAPA
    // ========================================================

    window.aprovarEtapaRenovacao =
        async function(orderId) {
            const order =
                orders.find(
                    item =>
                        String(item.id) ===
                        String(orderId)
                );

            if (!order) {
                showToast(
                    '❌ OS não encontrada.',
                    'error'
                );

                return;
            }

            if (
                !window.podeAtuarNaEtapaRenovacao(
                    order
                )
            ) {
                showToast(
                    '⚠️ Esta etapa não pertence ao seu usuário.',
                    'warning'
                );

                return;
            }

            try {
                if (
                    order.renovacaoEtapa ===
                        ETAPA_LETICIA
                ) {
                    if (
                        !confirm(
                            'Você confirma que este anúncio não teve nenhuma venda nos últimos 3 meses?'
                        )
                    ) {
                        return;
                    }

                    const agora =
                        new Date().toISOString();

                    await window
                        .atualizarEtapaRenovacao(
                            order,
                            {
                                etapa:
                                    ETAPA_RONALD,

                                responsavel:
                                    'Ronald',

                                dadosAdicionais: {
                                    renovacao_aprovado_leticia_por:
                                        currentUser.name,

                                    renovacao_aprovado_leticia_em:
                                        agora
                                }
                            }
                        );

                    order.renovacaoAprovadoLeticiaPor =
                        currentUser.name;

                    order.renovacaoAprovadoLeticiaEm =
                        agora;

                    await window
                        .notificarResponsavelFluxoRenovacao(
                            order,
                            'Ronald',
                            `Renovação para validar: ${order.code}`,
                            `A Letícia confirmou que o anúncio da OS ${order.code} não teve vendas nos últimos 3 meses.

Agora verifique se a foto da bike corresponde à gancheira.

Produto: ${order.productName}
Anúncio: ${order.linkAnuncio}
Foto da bike/gancheira: ${order.linkFotoBikeRenovacao}`
                        );

                    showToast(
                        '✅ Etapa aprovada e enviada ao Ronald.',
                        'success'
                    );

                    return;
                }

                if (
                    order.renovacaoEtapa ===
                        ETAPA_RONALD
                ) {
                    if (
                        !confirm(
                            'Você confirma que a foto da bike corresponde à gancheira deste anúncio?'
                        )
                    ) {
                        return;
                    }

                    const agora =
                        new Date().toISOString();

                    await window
                        .atualizarEtapaRenovacao(
                            order,
                            {
                                etapa:
                                    ETAPA_ELAINE,

                                responsavel:
                                    order
                                        .renovacaoDestinatarioFinal ||
                                    'Elaine',

                                dadosAdicionais: {
                                    renovacao_aprovado_ronald_por:
                                        currentUser.name,

                                    renovacao_aprovado_ronald_em:
                                        agora,

                                    status:
                                        'pendente',

                                    conferido:
                                        false
                                }
                            }
                        );

                    order.status =
                        'pendente';

                    order.conferido =
                        false;

                    order.renovacaoAprovadoRonaldPor =
                        currentUser.name;

                    order.renovacaoAprovadoRonaldEm =
                        agora;

                    await window
                        .notificarResponsavelFluxoRenovacao(
                            order,
                            order
                                .renovacaoDestinatarioFinal ||
                                'Elaine',
                            `Renovação liberada: ${order.code}`,
                            `O Ronald confirmou que a foto da bike corresponde à gancheira.

A OS ${order.code} está liberada para tirar ou editar a foto.

Produto: ${order.productName}
Anúncio: ${order.linkAnuncio}
Foto de referência: ${order.linkFotoBikeRenovacao}`
                        );

                    showToast(
                        '✅ Foto validada e OS enviada para Elaine.',
                        'success'
                    );
                }
            } catch (error) {
                console.error(
                    'Erro ao aprovar etapa:',
                    error
                );

                showToast(
                    '❌ Erro ao avançar a etapa: ' +
                    error.message,
                    'error'
                );
            }
        };

    // ========================================================
    // LETÍCIA OU RONALD REPROVAR
    // ========================================================

    window.reprovarEtapaRenovacao =
        async function(orderId) {
            const order =
                orders.find(
                    item =>
                        String(item.id) ===
                        String(orderId)
                );

            if (
                !order ||
                !window.podeAtuarNaEtapaRenovacao(
                    order
                )
            ) {
                showToast(
                    '⚠️ Esta etapa não pertence ao seu usuário.',
                    'warning'
                );

                return;
            }

            if (
                ![
                    ETAPA_LETICIA,
                    ETAPA_RONALD
                ].includes(
                    order.renovacaoEtapa
                )
            ) {
                showToast(
                    '⚠️ Esta etapa não permite reprovação.',
                    'warning'
                );

                return;
            }

            const motivo =
                prompt(
                    'Informe o motivo da reprovação. A OS voltará para Arthur:'
                )?.trim();

            if (!motivo) {
                showToast(
                    '⚠️ Informe o motivo da reprovação.',
                    'warning'
                );

                return;
            }

            const etapaRetorno =
                order.renovacaoEtapa;

            try {
                await window
                    .atualizarEtapaRenovacao(
                        order,
                        {
                            etapa:
                                ETAPA_ARTHUR,

                            responsavel:
                                'Arthur',

                            motivo:
                                motivo,

                            etapaRetorno:
                                etapaRetorno,

                            dadosAdicionais: {
                                status:
                                    'pendente',

                                conferido:
                                    false
                            }
                        }
                    );

                order.status =
                    'pendente';

                order.conferido =
                    false;

                await window
                    .notificarResponsavelFluxoRenovacao(
                        order,
                        'Arthur',
                        `Renovação devolvida: ${order.code}`,
                        `A OS ${order.code} foi devolvida para correção.

Reprovada por: ${currentUser.name}
Etapa: ${window.obterNomeEtapaRenovacao(etapaRetorno)}

Motivo:
${motivo}

Corrija as informações e clique em "Reenviar fluxo".`
                    );

                showToast(
                    '✅ OS devolvida para Arthur.',
                    'success'
                );
            } catch (error) {
                showToast(
                    '❌ Erro ao devolver a OS: ' +
                    error.message,
                    'error'
                );
            }
        };

    // ========================================================
    // ARTHUR REENVIAR APÓS CORREÇÃO
    // ========================================================

    window.reenviarFluxoRenovacao =
        async function(orderId) {
            const order =
                orders.find(
                    item =>
                        String(item.id) ===
                        String(orderId)
                );

            if (
                !order ||
                getUsernameAtualOS() !==
                    'arthur' ||
                order.renovacaoEtapa !==
                    ETAPA_ARTHUR
            ) {
                showToast(
                    '⚠️ Somente Arthur pode reenviar esta OS.',
                    'warning'
                );

                return;
            }

            const etapaRetorno =
                order.renovacaoEtapaRetorno ||
                ETAPA_LETICIA;

            const responsavel =
                window
                    .obterResponsavelEtapaRenovacao(
                        etapaRetorno
                    );

            if (!responsavel) {
                showToast(
                    '❌ Não foi possível identificar o responsável.',
                    'error'
                );

                return;
            }

            if (
                !confirm(
                    `Reenviar esta OS para ${responsavel}?`
                )
            ) {
                return;
            }

            try {
                await window
                    .atualizarEtapaRenovacao(
                        order,
                        {
                            etapa:
                                etapaRetorno,

                            responsavel:
                                responsavel,

                            motivo:
                                null,

                            etapaRetorno:
                                null,

                            dadosAdicionais: {
                                status:
                                    'pendente'
                            }
                        }
                    );

                await window
                    .notificarResponsavelFluxoRenovacao(
                        order,
                        responsavel,
                        `Renovação corrigida: ${order.code}`,
                        `Arthur corrigiu a OS ${order.code} e reenviou para sua validação.

Produto: ${order.productName}
Anúncio: ${order.linkAnuncio}
Foto da bike/gancheira: ${order.linkFotoBikeRenovacao}`
                    );

                showToast(
                    `✅ OS reenviada para ${responsavel}.`,
                    'success'
                );
            } catch (error) {
                showToast(
                    '❌ Erro ao reenviar a OS: ' +
                    error.message,
                    'error'
                );
            }
        };

    // ========================================================
    // ATUALIZAR A INTERFACE DO FORMULÁRIO
    // ========================================================

    const clearFormOriginalRenovacao =
        clearForm;

    clearForm =
        function() {
            clearFormOriginalRenovacao();

            const linkFoto =
                document.getElementById(
                    'linkFotoBikeRenovacao'
                );

            const responsavel =
                document.getElementById(
                    'responsibleName'
                );

            if (linkFoto) {
                linkFoto.value =
                    '';
            }

            if (responsavel) {
                responsavel.disabled =
                    false;
            }

            setTimeout(
                window
                    .configurarCampoRenovacaoAnuncio,
                0
            );
        };

    const saveOrderOriginalRenovacao =
    saveOrder;

saveOrder =
    async function() {
        const servico =
            document.getElementById(
                'photoType'
            )?.value || '';

        const ehRenovacao =
            servico ===
            SERVICO_RENOVACAO;

        const criandoNova =
            !editingOrderId;

        const linkAnuncio =
            document.getElementById(
                'linkAnuncio'
            )?.value?.trim() || '';

        /*
         * Aceita o campo específico da renovação.
         */
        const campoEspecifico =
            document.getElementById(
                'linkFotoBikeRenovacao'
            );

        const linkCampoEspecifico =
            campoEspecifico
                ?.value
                ?.trim() || '';

        /*
         * Aceita também o campo que já existe em:
         * Fotos de Referência -> Adicionar foto por link.
         */
        const linkCampoFotoReferencia =
            document.getElementById(
                'photoLinkInput'
            )?.value?.trim() || '';

        /*
         * Se o usuário já clicou em "Adicionar", procura
         * também dentro das fotos de referência selecionadas.
         */
        let linkFotoSelecionada =
            '';

        if (
            Array.isArray(
                selectedPhotos
            )
        ) {
            const fotoPorLink =
                selectedPhotos.find(
                    foto =>
                        foto?.isLink ===
                            true ||
                        String(
                            foto?.type ||
                            ''
                        )
                            .trim()
                            .toLowerCase() ===
                            'link'
                );

            if (fotoPorLink) {
                linkFotoSelecionada =
                    String(
                        fotoPorLink.data ||
                        fotoPorLink.url ||
                        fotoPorLink.link ||
                        fotoPorLink.src ||
                        ''
                    ).trim();
            }
        }

        /*
         * Prioridade:
         *
         * 1. Campo específico da renovação;
         * 2. Campo "Adicionar foto por link";
         * 3. Foto por link já adicionada às referências.
         */
        const linkFotoBike =
            linkCampoEspecifico ||
            linkCampoFotoReferencia ||
            linkFotoSelecionada;

        const responsavel =
            document.getElementById(
                'responsibleName'
            );

        if (
            ehRenovacao &&
            criandoNova &&
            getUsernameAtualOS() !==
                'arthur'
        ) {
            showToast(
                '⚠️ Somente Arthur pode criar uma OS de renovação de anúncio.',
                'warning'
            );

            return;
        }

        if (
            ehRenovacao &&
            !linkAnuncio
        ) {
            showToast(
                '⚠️ Informe o link do anúncio.',
                'warning'
            );

            document
                .getElementById(
                    'linkAnuncio'
                )
                ?.focus();

            return;
        }

        if (
            ehRenovacao &&
            !linkFotoBike
        ) {
            showToast(
                '⚠️ Informe o link da foto da bike/gancheira em “Fotos de Referência”.',
                'warning'
            );

            document
                .getElementById(
                    'photoLinkInput'
                )
                ?.focus();

            return;
        }

        /*
         * Garante que o restante do fluxo encontre o link,
         * mesmo quando foi preenchido no campo já existente.
         */
        let campoLinkRenovacao =
            document.getElementById(
                'linkFotoBikeRenovacao'
            );

        if (!campoLinkRenovacao) {
            campoLinkRenovacao =
                document.createElement(
                    'input'
                );

            campoLinkRenovacao.type =
                'hidden';

            campoLinkRenovacao.id =
                'linkFotoBikeRenovacao';

            document.body.appendChild(
                campoLinkRenovacao
            );
        }

        campoLinkRenovacao.value =
            linkFotoBike;

        /*
         * Se o link ainda não foi adicionado às fotos de
         * referência, adiciona automaticamente antes de salvar.
         */
        if (
            ehRenovacao &&
            linkFotoBike &&
            Array.isArray(
                selectedPhotos
            )
        ) {
            const linkJaAdicionado =
                selectedPhotos.some(
                    foto =>
                        String(
                            foto?.data ||
                            foto?.url ||
                            foto?.link ||
                            foto?.src ||
                            ''
                        ).trim() ===
                        linkFotoBike
                );

            if (!linkJaAdicionado) {
                selectedPhotos.push({
                    name:
                        'Foto de referência da bike',

                    size:
                        0,

                    type:
                        'link',

                    data:
                        linkFotoBike,

                    url:
                        linkFotoBike,

                    isLink:
                        true
                });
            }
        }

        /*
         * Arthur escolhe Elaine visualmente, mas a primeira
         * responsável real da etapa é Letícia.
         */
        if (
            ehRenovacao &&
            criandoNova &&
            responsavel
        ) {
            responsavel.disabled =
                false;

            responsavel.value =
                'Leticia';
        }

        try {
            await saveOrderOriginalRenovacao();
        } finally {
            setTimeout(
                window
                    .configurarCampoRenovacaoAnuncio,
                0
            );
        }
    };

    // ============================================================
// CORRIGIR ETAPA NÃO IDENTIFICADA DA RENOVAÇÃO
// E GARANTIR BOTÕES OK / RECUSADO
// ============================================================

window.normalizarEtapaRenovacao =
    async function(order) {
        if (
            !order ||
            !window.ehOSRenovacaoAnuncio(
                order
            )
        ) {
            return false;
        }

        if (
            order.renovacaoEtapa
        ) {
            return false;
        }

        const responsavel =
            String(
                order.responsibleName ||
                ''
            )
                .normalize('NFD')
                .replace(
                    /[\u0300-\u036f]/g,
                    ''
                )
                .trim()
                .toLowerCase();

        let etapaCorreta =
            ETAPA_LETICIA;

        if (
            responsavel ===
            'ronald'
        ) {
            etapaCorreta =
                ETAPA_RONALD;
        } else if (
            responsavel ===
            'elaine'
        ) {
            etapaCorreta =
                ETAPA_ELAINE;
        } else if (
            responsavel ===
            'arthur'
        ) {
            etapaCorreta =
                ETAPA_ARTHUR;
        } else {
            /*
             * Renovação recém-criada começa obrigatoriamente
             * pela Letícia.
             */
            etapaCorreta =
                ETAPA_LETICIA;

            order.responsibleName =
                'Leticia';
        }

        order.renovacaoEtapa =
            etapaCorreta;

        order.renovacaoDestinatarioFinal =
            order.renovacaoDestinatarioFinal ||
            'Elaine';

        if (supabaseClient) {
            const {
                error
            } =
                await supabaseClient
                    .from(
                        'ordens_service'
                    )
                    .update({
                        renovacao_etapa:
                            etapaCorreta,

                        renovacao_destinatario_final:
                            order
                                .renovacaoDestinatarioFinal,

                        responsavel:
                            order
                                .responsibleName,

                        user_notified:
                            false,

                        ultima_atualizacao:
                            new Date()
                                .toISOString()
                    })
                    .eq(
                        'id',
                        order.id
                    );

            if (error) {
                console.error(
                    'Erro corrigindo etapa da renovação:',
                    error
                );

                return false;
            }
        }

        return true;
    };

// ============================================================
// SUBSTITUI A INTERFACE ANTERIOR DA RENOVAÇÃO
// ============================================================

window.aplicarInterfaceFluxoRenovacao =
    async function() {
        /*
         * Primeiro corrige localmente todas as renovações
         * que ficaram sem etapa.
         */
        const renovacoesSemEtapa =
            orders.filter(
                order =>
                    window
                        .ehOSRenovacaoAnuncio(
                            order
                        ) &&
                    !order
                        .renovacaoEtapa
            );

        for (
            const order of
            renovacoesSemEtapa
        ) {
            await window
                .normalizarEtapaRenovacao(
                    order
                );
        }

        const linhas =
            document.querySelectorAll(
                '#osTableBody tr'
            );

        linhas.forEach(
            linha => {
                const botaoReferencia =
                    linha.querySelector(
                        'button[onclick*="viewOrderDetails"]'
                    );

                if (!botaoReferencia) {
                    return;
                }

                const onclick =
                    botaoReferencia.getAttribute(
                        'onclick'
                    ) || '';

                const resultado =
                    onclick.match(
                        /viewOrderDetails\(['"]([^'"]+)['"]\)/
                    );

                if (!resultado) {
                    return;
                }

                const orderId =
                    resultado[1];

                const order =
                    orders.find(
                        item =>
                            String(item.id) ===
                            String(orderId)
                    );

                if (
                    !order ||
                    !window
                        .estaNoFluxoEspecialRenovacao(
                            order
                        )
                ) {
                    return;
                }

                const celulas =
                    linha.querySelectorAll(
                        'td'
                    );

                const primeiraCelula =
                    celulas[0];

                const celulaAcoes =
                    celulas[
                        celulas.length - 1
                    ];

                if (!celulaAcoes) {
                    return;
                }

                const containerAcoes =
                    celulaAcoes.querySelector(
                        '.d-flex'
                    ) ||
                    celulaAcoes;

                /*
                 * Remove ações normais de andamento,
                 * finalização e conferência durante as
                 * etapas Letícia/Ronald/Arthur.
                 */
                containerAcoes
                    .querySelectorAll(
                        'button'
                    )
                    .forEach(
                        botao => {
                            const acao =
                                botao.getAttribute(
                                    'onclick'
                                ) || '';

                            const remover =
                                acao.includes(
                                    'startOrder'
                                ) ||
                                acao.includes(
                                    'openCompleteModal'
                                ) ||
                                acao.includes(
                                    'conferirOS'
                                ) ||
                                acao.includes(
                                    'abrirRejeitarModal'
                                ) ||
                                acao.includes(
                                    'marcarAlteracoesFeitas'
                                ) ||
                                acao.includes(
                                    'aprovarEtapaRenovacao'
                                ) ||
                                acao.includes(
                                    'reprovarEtapaRenovacao'
                                ) ||
                                acao.includes(
                                    'reenviarFluxoRenovacao'
                                );

                            if (remover) {
                                botao.remove();
                            }
                        }
                    );

                containerAcoes
                    .querySelectorAll(
                        '[data-botoes-renovacao]'
                    )
                    .forEach(
                        elemento =>
                            elemento.remove()
                    );

                const grupo =
                    document.createElement(
                        'span'
                    );

                grupo.setAttribute(
                    'data-botoes-renovacao',
                    '1'
                );

                grupo.style.display =
                    'inline-flex';

                grupo.style.gap =
                    '4px';

                grupo.style.alignItems =
                    'center';

                /*
                 * ETAPA DA LETÍCIA
                 */
                if (
                    order.renovacaoEtapa ===
                        ETAPA_LETICIA &&
                    getUsernameAtualOS() ===
                        'leticia'
                ) {
                    grupo.innerHTML = `
                        <button
                            type="button"
                            class="btn btn-success btn-sm"
                            onclick="aprovarEtapaRenovacao('${order.id}')"
                            title="Confirmar que não houve vendas nos últimos 3 meses"
                        >
                            <i class="fas fa-check"></i>
                            OK
                        </button>

                        <button
                            type="button"
                            class="btn btn-danger btn-sm"
                            onclick="reprovarEtapaRenovacao('${order.id}')"
                            title="Recusar e devolver para Arthur"
                        >
                            <i class="fas fa-times"></i>
                            Recusado
                        </button>
                    `;
                }

                /*
                 * ETAPA DO RONALD
                 */
                if (
                    order.renovacaoEtapa ===
                        ETAPA_RONALD &&
                    getUsernameAtualOS() ===
                        'ronald'
                ) {
                    grupo.innerHTML = `
                        <button
                            type="button"
                            class="btn btn-success btn-sm"
                            onclick="aprovarEtapaRenovacao('${order.id}')"
                            title="Confirmar que a foto corresponde à gancheira"
                        >
                            <i class="fas fa-check"></i>
                            OK
                        </button>

                        <button
                            type="button"
                            class="btn btn-danger btn-sm"
                            onclick="reprovarEtapaRenovacao('${order.id}')"
                            title="Recusar e devolver para Arthur"
                        >
                            <i class="fas fa-times"></i>
                            Recusado
                        </button>
                    `;
                }

                /*
                 * OS DEVOLVIDA PARA ARTHUR
                 */
                if (
                    order.renovacaoEtapa ===
                        ETAPA_ARTHUR &&
                    getUsernameAtualOS() ===
                        'arthur'
                ) {
                    grupo.innerHTML = `
                        <button
                            type="button"
                            class="btn btn-warning btn-sm"
                            onclick="reenviarFluxoRenovacao('${order.id}')"
                            title="Reenviar após corrigir"
                        >
                            <i class="fas fa-redo"></i>
                            Reenviar
                        </button>
                    `;
                }

                /*
                 * ETAPA DA ELAINE
                 */
                if (
                    order.renovacaoEtapa ===
                        ETAPA_ELAINE &&
                    getUsernameAtualOS() ===
                        'elaine'
                ) {
                    if (
                        order.status ===
                        'pendente'
                    ) {
                        grupo.innerHTML = `
                            <button
                                type="button"
                                class="btn btn-success btn-sm"
                                onclick="startOrder('${order.id}')"
                            >
                                <i class="fas fa-play"></i>
                                Iniciar
                            </button>
                        `;
                    }

                    if (
                        order.status ===
                        'andamento'
                    ) {
                        grupo.innerHTML = `
                            <button
                                type="button"
                                class="btn btn-info btn-sm"
                                onclick="openCompleteModal('${order.id}')"
                            >
                                <i class="fas fa-flag-checkered"></i>
                                Finalizar
                            </button>
                        `;
                    }
                }

                if (
                    grupo.innerHTML.trim()
                ) {
                    containerAcoes.appendChild(
                        grupo
                    );
                }

                /*
                 * Atualiza a identificação visual da etapa.
                 */
                if (primeiraCelula) {
                    primeiraCelula
                        .querySelectorAll(
                            '[data-etapa-renovacao]'
                        )
                        .forEach(
                            elemento =>
                                elemento.remove()
                        );

                    const etapa =
                        document.createElement(
                            'div'
                        );

                    etapa.setAttribute(
                        'data-etapa-renovacao',
                        '1'
                    );

                    etapa.style.marginTop =
                        '4px';

                    etapa.innerHTML = `
                        <span class="badge badge-dark">
                            Renovação: ${window.obterNomeEtapaRenovacao(order.renovacaoEtapa)}
                        </span>
                    `;

                    primeiraCelula.appendChild(
                        etapa
                    );
                }
            }
        );
    };

    // ========================================================
    // ELAINE FINALIZOU
    // Entra em Não Conferidas e passa para Ronald.
    // ========================================================

    const completeOrderOriginalRenovacao =
        completeOrder;

    completeOrder =
        async function() {
            const orderId =
                completeOSId?.value;

            const order =
                orders.find(
                    item =>
                        String(item.id) ===
                        String(orderId)
                );

            const eraRenovacaoElaine =
                Boolean(
                    order &&
                    window
                        .ehOSRenovacaoAnuncio(
                            order
                        ) &&
                    order.renovacaoEtapa ===
                        ETAPA_ELAINE &&
                    getUsernameAtualOS() ===
                        'elaine'
                );

            await completeOrderOriginalRenovacao();

            if (
                !eraRenovacaoElaine ||
                !order ||
                order.status !==
                    'concluida'
            ) {
                return;
            }

            try {
                await window
                    .atualizarEtapaRenovacao(
                        order,
                        {
                            etapa:
                                ETAPA_NORMAL,

                            responsavel:
                                'Ronald',

                            motivo:
                                null,

                            etapaRetorno:
                                null,

                            dadosAdicionais: {
                                status:
                                    'concluida',

                                conferido:
                                    false,

                                conferido_por:
                                    null,

                                data_conferencia:
                                    null
                            }
                        }
                    );

                order.status =
                    'concluida';

                order.conferido =
                    false;

                order.conferidoPor =
                    null;

                order.dataConferencia =
                    null;

                await window
                    .notificarResponsavelFluxoRenovacao(
                        order,
                        'Ronald',
                        `Renovação aguardando conferência: ${order.code}`,
                        `Elaine finalizou a foto ou edição da OS ${order.code}.

A OS agora está no fluxo normal, no filtro "Não Conferidas".

Produto: ${order.productName}
Anúncio: ${order.linkAnuncio}`
                    );

                showToast(
                    '✅ Renovação finalizada e enviada para Não Conferidas.',
                    'success'
                );
            } catch (error) {
                console.error(
                    'Erro enviando renovação para conferência:',
                    error
                );

                showToast(
                    '⚠️ A OS foi finalizada, mas houve erro ao encaminhar para Ronald: ' +
                    error.message,
                    'warning'
                );
            }
        };

    // ========================================================
    // RONALD CONFERIU NO FLUXO NORMAL
    // ========================================================

    const conferirOSOriginalRenovacao =
        window.conferirOS;

    window.conferirOS =
        async function(orderId) {
            const order =
                orders.find(
                    item =>
                        String(item.id) ===
                        String(orderId)
                );

            const eraRenovacaoNormal =
                Boolean(
                    order &&
                    window
                        .ehOSRenovacaoAnuncio(
                            order
                        ) &&
                    order.renovacaoEtapa ===
                        ETAPA_NORMAL
                );

            await conferirOSOriginalRenovacao(
                orderId
            );

            if (
                !eraRenovacaoNormal ||
                !order?.conferido
            ) {
                return;
            }

            try {
                const agora =
                    new Date().toISOString();

                const historico =
                    Array.isArray(
                        order
                            .renovacaoHistorico
                    )
                        ? order
                            .renovacaoHistorico
                        : [];

                const novoHistorico = [
                    ...historico,
                    {
                        etapa_anterior:
                            ETAPA_NORMAL,

                        nova_etapa:
                            ETAPA_FINALIZADA,

                        responsavel:
                            order.responsibleName,

                        alterado_por:
                            currentUser.name,

                        motivo:
                            null,

                        data:
                            agora
                    }
                ];

                const {
                    error
                } =
                    await supabaseClient
                        .from(
                            'ordens_service'
                        )
                        .update({
                            renovacao_etapa:
                                ETAPA_FINALIZADA,

                            renovacao_historico:
                                novoHistorico,

                            ultima_atualizacao:
                                agora
                        })
                        .eq(
                            'id',
                            order.id
                        );

                if (error) {
                    throw error;
                }

                order.renovacaoEtapa =
                    ETAPA_FINALIZADA;

                order.renovacaoHistorico =
                    novoHistorico;
            } catch (error) {
                console.error(
                    'Erro finalizando fluxo da renovação:',
                    error
                );
            }
        };

    // ========================================================
    // INICIALIZAÇÃO
    // ========================================================

    const iniciarModuloRenovacao =
        function() {
            window
                .configurarCampoRenovacaoAnuncio();

            updateCounters();
            updateOSNotificationBell();

            if (
                typeof renderOrdersTable ===
                'function'
            ) {
                renderOrdersTable();
            }
        };

    if (
        document.readyState ===
        'loading'
    ) {
        document.addEventListener(
            'DOMContentLoaded',
            iniciarModuloRenovacao
        );
    } else {
        iniciarModuloRenovacao();
    }

    console.log(
        '✅ Fluxo de renovação de anúncio instalado.'
    );
})();

// ============================================================
// CORREÇÃO DEFINITIVA DO FLUXO DE RENOVAÇÃO
// Cole no final do script.js
// ============================================================

(function corrigirFluxoDefinitivoRenovacao() {
    const ETAPA_LETICIA =
        'leticia_verificacao';

    const ETAPA_RONALD =
        'ronald_validacao';

    const ETAPA_ELAINE =
        'elaine_execucao';

    const ETAPA_ARTHUR =
        'devolvida_arthur';

    const ETAPA_NORMAL =
        'fluxo_normal';

    const ETAPA_FINALIZADA =
        'finalizada';

    function normalizarUsuarioRenovacao(
        valor
    ) {
        return String(valor || '')
            .trim()
            .toLowerCase()
            .normalize('NFD')
            .replace(
                /[\u0300-\u036f]/g,
                ''
            );
    }

    function obterUsuarioAtualRenovacao() {
        return normalizarUsuarioRenovacao(
            currentUser?.username ||
            currentUser?.login ||
            currentUser?.name ||
            ''
        );
    }

    function ehRenovacaoCorrecao(
        order
    ) {
        const servico =
            normalizarUsuarioRenovacao(
                order?.photoType ||
                order?.tipo_foto ||
                ''
            );

        return (
            servico ===
                'renovacao_anuncio' ||
            servico ===
                'renovacao de anuncio'
        );
    }

    function obterEtapaRenovacaoCorrecao(
        order
    ) {
        const etapa =
            order?.renovacaoEtapa ||
            order?.etapaFluxo ||
            order?.etapa_fluxo ||
            '';

        const mapa = {
            aguardando_leticia:
                ETAPA_LETICIA,

            aguardando_ronald:
                ETAPA_RONALD,

            execucao_elaine:
                ETAPA_ELAINE,

            aguardando_conferencia:
                ETAPA_NORMAL,

            leticia_verificacao:
                ETAPA_LETICIA,

            ronald_validacao:
                ETAPA_RONALD,

            elaine_execucao:
                ETAPA_ELAINE,

            devolvida_arthur:
                ETAPA_ARTHUR,

            fluxo_normal:
                ETAPA_NORMAL,

            finalizada:
                ETAPA_FINALIZADA
        };

        return (
            mapa[etapa] ||
            etapa
        );
    }

    function obterEtapaBancoGenerica(
        etapa
    ) {
        const mapa = {
            [ETAPA_LETICIA]:
                'aguardando_leticia',

            [ETAPA_RONALD]:
                'aguardando_ronald',

            [ETAPA_ELAINE]:
                'execucao_elaine',

            [ETAPA_ARTHUR]:
                'correcao_arthur',

            [ETAPA_NORMAL]:
                'aguardando_conferencia',

            [ETAPA_FINALIZADA]:
                'finalizada'
        };

        return (
            mapa[etapa] ||
            etapa
        );
    }

    function obterNomeEtapaCorrecao(
        etapa
    ) {
        const nomes = {
            [ETAPA_LETICIA]:
                'Letícia verifica as informações',

            [ETAPA_RONALD]:
                'Ronald confere a foto da bike/gancheira',

            [ETAPA_ELAINE]:
                'Elaine tira ou edita a foto',

            [ETAPA_ARTHUR]:
                'Arthur corrige as informações',

            [ETAPA_NORMAL]:
                'Aguardando conferência normal',

            [ETAPA_FINALIZADA]:
                'Finalizada'
        };

        return (
            nomes[etapa] ||
            'Etapa não identificada'
        );
    }

    window.obterNomeEtapaRenovacao =
        obterNomeEtapaCorrecao;

    window.ehOSRenovacaoAnuncio =
        ehRenovacaoCorrecao;

    window.estaNoFluxoEspecialRenovacao =
        function(order) {
            if (
                !ehRenovacaoCorrecao(
                    order
                )
            ) {
                return false;
            }

            const etapa =
                obterEtapaRenovacaoCorrecao(
                    order
                );

            return ![
                ETAPA_NORMAL,
                ETAPA_FINALIZADA
            ].includes(
                etapa
            );
        };

    window.podeAtuarNaEtapaRenovacao =
        function(order) {
            if (
                !currentUser ||
                !ehRenovacaoCorrecao(
                    order
                )
            ) {
                return false;
            }

            const usuario =
                obterUsuarioAtualRenovacao();

            const etapa =
                obterEtapaRenovacaoCorrecao(
                    order
                );

            const responsaveis = {
                [ETAPA_LETICIA]:
                    'leticia',

                [ETAPA_RONALD]:
                    'ronald',

                [ETAPA_ELAINE]:
                    'elaine',

                [ETAPA_ARTHUR]:
                    'arthur'
            };

            return (
                responsaveis[etapa] ===
                usuario
            );
        };

    // ========================================================
    // ATUALIZAR ETAPA
    // ========================================================

    window.atualizarEtapaRenovacao =
        async function(
            order,
            {
                etapa,
                responsavel,
                motivo = null,
                etapaRetorno = null,
                dadosAdicionais = {}
            }
        ) {
            if (!order) {
                throw new Error(
                    'OS não encontrada.'
                );
            }

            if (!supabaseClient) {
                throw new Error(
                    'Supabase não conectado.'
                );
            }

            const agora =
                new Date().toISOString();

            const etapaAnterior =
                obterEtapaRenovacaoCorrecao(
                    order
                );

            const historicoAtual =
                Array.isArray(
                    order.renovacaoHistorico
                )
                    ? order.renovacaoHistorico
                    : [];

            const novoHistorico = [
                ...historicoAtual,
                {
                    etapa_anterior:
                        etapaAnterior ||
                        null,

                    nova_etapa:
                        etapa,

                    responsavel:
                        responsavel,

                    alterado_por:
                        currentUser?.name ||
                        currentUser?.username ||
                        'Sistema',

                    motivo:
                        motivo,

                    data:
                        agora
                }
            ];

            const etapaGenerica =
                obterEtapaBancoGenerica(
                    etapa
                );

            const dadosBanco = {
                fluxo_renovacao:
                    true,

                etapa_fluxo:
                    etapaGenerica,

                destinatario_final:
                    'Elaine',

                etapa_atualizada_em:
                    agora,

                etapa_atualizada_por:
                    currentUser?.name ||
                    currentUser?.username ||
                    'Sistema',

                renovacao_etapa:
                    etapa,

                renovacao_etapa_retorno:
                    etapaRetorno,

                renovacao_motivo_reprovacao:
                    motivo,

                renovacao_historico:
                    novoHistorico,

                renovacao_destinatario_final:
                    'Elaine',

                responsavel:
                    responsavel,

                user_notified:
                    false,

                ultima_atualizacao:
                    agora,

                ...dadosAdicionais
            };

            const {
                error
            } = await supabaseClient
                .from(
                    'ordens_service'
                )
                .update(
                    dadosBanco
                )
                .eq(
                    'id',
                    order.id
                );

            if (error) {
                throw error;
            }

            order.fluxoRenovacao =
                true;

            order.etapaFluxo =
                etapaGenerica;

            order.destinatarioFinal =
                'Elaine';

            order.etapaAtualizadaEm =
                agora;

            order.etapaAtualizadaPor =
                currentUser?.name ||
                currentUser?.username ||
                'Sistema';

            order.renovacaoEtapa =
                etapa;

            order.renovacaoEtapaRetorno =
                etapaRetorno;

            order.renovacaoMotivoReprovacao =
                motivo;

            order.renovacaoHistorico =
                novoHistorico;

            order.renovacaoDestinatarioFinal =
                'Elaine';

            order.responsibleName =
                responsavel;

            order.user_notified =
                false;

            order.updatedAt =
                agora;

            if (
                Object.prototype.hasOwnProperty.call(
                    dadosAdicionais,
                    'status'
                )
            ) {
                order.status =
                    dadosAdicionais.status;
            }

            if (
                Object.prototype.hasOwnProperty.call(
                    dadosAdicionais,
                    'conferido'
                )
            ) {
                order.conferido =
                    dadosAdicionais.conferido;
            }

            if (
                Object.prototype.hasOwnProperty.call(
                    dadosAdicionais,
                    'conferido_por'
                )
            ) {
                order.conferidoPor =
                    dadosAdicionais
                        .conferido_por;
            }

            if (
                Object.prototype.hasOwnProperty.call(
                    dadosAdicionais,
                    'data_conferencia'
                )
            ) {
                order.dataConferencia =
                    dadosAdicionais
                        .data_conferencia;
            }

            if (
                typeof updateCounters ===
                'function'
            ) {
                updateCounters();
            }

            if (
                typeof renderOrdersTable ===
                'function'
            ) {
                renderOrdersTable();
            }

            if (
                typeof window
                    .carregarNotificacoesChamados ===
                'function'
            ) {
                await window
                    .carregarNotificacoesChamados();
            }

            return agora;
        };

    // ========================================================
    // APROVAR: LETÍCIA → RONALD → ELAINE
    // ========================================================

    window.aprovarEtapaRenovacao =
        async function(orderId) {
            const order =
                orders.find(
                    item =>
                        String(item.id) ===
                        String(orderId)
                );

            if (
                !order ||
                !window.podeAtuarNaEtapaRenovacao(
                    order
                )
            ) {
                showToast(
                    '⚠️ Esta etapa não pertence ao seu usuário.',
                    'warning'
                );

                return;
            }

            const etapa =
                obterEtapaRenovacaoCorrecao(
                    order
                );

            try {
                if (
                    etapa ===
                    ETAPA_LETICIA
                ) {
                    if (
                        !confirm(
                            'Confirmar que as informações estão corretas e enviar para Ronald?'
                        )
                    ) {
                        return;
                    }

                    const agora =
                        new Date()
                            .toISOString();

                    await window
                        .atualizarEtapaRenovacao(
                            order,
                            {
                                etapa:
                                    ETAPA_RONALD,

                                responsavel:
                                    'Ronald',

                                motivo:
                                    null,

                                etapaRetorno:
                                    null,

                                dadosAdicionais: {
                                    status:
                                        'pendente',

                                    conferido:
                                        false,

                                    renovacao_aprovado_leticia_por:
                                        currentUser.name,

                                    renovacao_aprovado_leticia_em:
                                        agora
                                }
                            }
                        );

                    order
                        .renovacaoAprovadoLeticiaPor =
                        currentUser.name;

                    order
                        .renovacaoAprovadoLeticiaEm =
                        agora;

                    showToast(
                        '✅ Aprovada e enviada para Ronald.',
                        'success'
                    );

                    return;
                }

                if (
                    etapa ===
                    ETAPA_RONALD
                ) {
                    if (
                        !confirm(
                            'Confirmar que a foto corresponde à gancheira e enviar para Elaine?'
                        )
                    ) {
                        return;
                    }

                    const agora =
                        new Date()
                            .toISOString();

                    await window
                        .atualizarEtapaRenovacao(
                            order,
                            {
                                etapa:
                                    ETAPA_ELAINE,

                                responsavel:
                                    'Elaine',

                                motivo:
                                    null,

                                etapaRetorno:
                                    null,

                                dadosAdicionais: {
                                    status:
                                        'pendente',

                                    conferido:
                                        false,

                                    conferido_por:
                                        null,

                                    data_conferencia:
                                        null,

                                    renovacao_aprovado_ronald_por:
                                        currentUser.name,

                                    renovacao_aprovado_ronald_em:
                                        agora
                                }
                            }
                        );

                    order
                        .renovacaoAprovadoRonaldPor =
                        currentUser.name;

                    order
                        .renovacaoAprovadoRonaldEm =
                        agora;

                    showToast(
                        '✅ Aprovada e enviada para Elaine.',
                        'success'
                    );

                    return;
                }

                showToast(
                    '⚠️ Esta etapa não pode ser aprovada.',
                    'warning'
                );

            } catch (error) {
                console.error(
                    'Erro ao aprovar renovação:',
                    error
                );

                showToast(
                    '❌ Erro ao aprovar: ' +
                    error.message,
                    'error'
                );
            }
        };

    // ========================================================
    // RECUSAR
    // LETÍCIA → ARTHUR
    // RONALD → LETÍCIA
    // ========================================================

    window.reprovarEtapaRenovacao =
        async function(orderId) {
            const order =
                orders.find(
                    item =>
                        String(item.id) ===
                        String(orderId)
                );

            if (
                !order ||
                !window.podeAtuarNaEtapaRenovacao(
                    order
                )
            ) {
                showToast(
                    '⚠️ Esta etapa não pertence ao seu usuário.',
                    'warning'
                );

                return;
            }

            const etapa =
                obterEtapaRenovacaoCorrecao(
                    order
                );

            if (
                ![
                    ETAPA_LETICIA,
                    ETAPA_RONALD
                ].includes(
                    etapa
                )
            ) {
                showToast(
                    '⚠️ Esta etapa não permite recusa.',
                    'warning'
                );

                return;
            }

            const destino =
                etapa === ETAPA_RONALD
                    ? 'Leticia'
                    : 'Arthur';

            const novaEtapa =
                etapa === ETAPA_RONALD
                    ? ETAPA_LETICIA
                    : ETAPA_ARTHUR;

            const mensagemPrompt =
                etapa === ETAPA_RONALD
                    ? 'Informe o motivo. A OS voltará para Letícia:'
                    : 'Informe o motivo. A OS voltará para Arthur:';

            const motivo =
                prompt(
                    mensagemPrompt
                )?.trim();

            if (!motivo) {
                showToast(
                    '⚠️ Informe o motivo da recusa.',
                    'warning'
                );

                return;
            }

            try {
                await window
                    .atualizarEtapaRenovacao(
                        order,
                        {
                            etapa:
                                novaEtapa,

                            responsavel:
                                destino,

                            motivo:
                                motivo,

                            etapaRetorno:
                                etapa,

                            dadosAdicionais: {
                                status:
                                    'pendente',

                                conferido:
                                    false
                            }
                        }
                    );

                showToast(
                    `✅ OS devolvida para ${destino}.`,
                    'success'
                );

            } catch (error) {
                console.error(
                    'Erro recusando renovação:',
                    error
                );

                showToast(
                    '❌ Erro ao recusar: ' +
                    error.message,
                    'error'
                );
            }
        };

    // ========================================================
    // ARTHUR CORRIGIU → VOLTA PARA LETÍCIA
    // ========================================================

    window.reenviarFluxoRenovacao =
        async function(orderId) {
            const order =
                orders.find(
                    item =>
                        String(item.id) ===
                        String(orderId)
                );

            if (
                !order ||
                obterUsuarioAtualRenovacao() !==
                    'arthur' ||
                obterEtapaRenovacaoCorrecao(
                    order
                ) !==
                    ETAPA_ARTHUR
            ) {
                showToast(
                    '⚠️ Somente Arthur pode reenviar esta OS.',
                    'warning'
                );

                return;
            }

            if (
                !confirm(
                    'Reenviar esta OS para Letícia?'
                )
            ) {
                return;
            }

            try {
                await window
                    .atualizarEtapaRenovacao(
                        order,
                        {
                            etapa:
                                ETAPA_LETICIA,

                            responsavel:
                                'Leticia',

                            motivo:
                                null,

                            etapaRetorno:
                                null,

                            dadosAdicionais: {
                                status:
                                    'pendente',

                                conferido:
                                    false
                            }
                        }
                    );

                showToast(
                    '✅ OS reenviada para Letícia.',
                    'success'
                );

            } catch (error) {
                console.error(
                    'Erro reenviando renovação:',
                    error
                );

                showToast(
                    '❌ Erro ao reenviar: ' +
                    error.message,
                    'error'
                );
            }
        };

    // ========================================================
    // FILTRO: SOMENTE RESPONSÁVEL DA ETAPA VISUALIZA
    // ========================================================

    const filtroOriginalRenovacao =
        filterOrdersByUser;

    filterOrdersByUser =
        function(ordersList) {
            if (!currentUser) {
                return [];
            }

            const usuario =
                obterUsuarioAtualRenovacao();

            const ordensNormais =
                ordersList.filter(
                    order => {
                        return !(
                            ehRenovacaoCorrecao(
                                order
                            ) &&
                            window
                                .estaNoFluxoEspecialRenovacao(
                                    order
                                )
                        );
                    }
                );

            const renovacoesEspeciais =
                ordersList.filter(
                    order => {
                        if (
                            !ehRenovacaoCorrecao(
                                order
                            ) ||
                            !window
                                .estaNoFluxoEspecialRenovacao(
                                    order
                                )
                        ) {
                            return false;
                        }

                        const responsavel =
                            normalizarUsuarioRenovacao(
                                order.responsibleName
                            );

                        return (
                            responsavel ===
                            usuario
                        );
                    }
                );

            const resultadoNormal =
                filtroOriginalRenovacao(
                    ordensNormais
                );

            const idsPermitidos =
                new Set([
                    ...resultadoNormal.map(
                        order =>
                            String(order.id)
                    ),

                    ...renovacoesEspeciais.map(
                        order =>
                            String(order.id)
                    )
                ]);

            return ordersList.filter(
                order =>
                    idsPermitidos.has(
                        String(order.id)
                    )
            );
        };

    // ========================================================
    // SINCRONIZA CAMPOS APÓS CARREGAR DO BANCO
    // ========================================================

    const carregarOrdensOriginalRenovacao =
        loadOrders;

    loadOrders =
        async function() {
            await carregarOrdensOriginalRenovacao();

            if (
                !supabaseClient ||
                !Array.isArray(orders) ||
                !orders.length
            ) {
                return;
            }

            try {
                const {
                    data,
                    error
                } = await supabaseClient
                    .from(
                        'ordens_service'
                    )
                    .select(`
                        id,
                        fluxo_renovacao,
                        etapa_fluxo,
                        destinatario_final,
                        etapa_atualizada_em,
                        etapa_atualizada_por,
                        renovacao_etapa,
                        renovacao_etapa_retorno,
                        renovacao_motivo_reprovacao,
                        renovacao_historico,
                        renovacao_destinatario_final,
                        renovacao_aprovado_leticia_por,
                        renovacao_aprovado_leticia_em,
                        renovacao_aprovado_ronald_por,
                        renovacao_aprovado_ronald_em
                    `);

                if (error) {
                    throw error;
                }

                const dadosPorId =
                    new Map(
                        (data || []).map(
                            item => [
                                String(item.id),
                                item
                            ]
                        )
                    );

                orders.forEach(order => {
                    const banco =
                        dadosPorId.get(
                            String(order.id)
                        );

                    if (!banco) {
                        return;
                    }

                    order.fluxoRenovacao =
                        banco.fluxo_renovacao ===
                        true;

                    order.etapaFluxo =
                        banco.etapa_fluxo ||
                        null;

                    order.destinatarioFinal =
                        banco.destinatario_final ||
                        'Elaine';

                    order.etapaAtualizadaEm =
                        banco.etapa_atualizada_em ||
                        null;

                    order.etapaAtualizadaPor =
                        banco.etapa_atualizada_por ||
                        null;

                    order.renovacaoEtapa =
                        banco.renovacao_etapa ||
                        obterEtapaRenovacaoCorrecao(
                            {
                                etapaFluxo:
                                    banco.etapa_fluxo
                            }
                        );

                    order.renovacaoEtapaRetorno =
                        banco
                            .renovacao_etapa_retorno ||
                        null;

                    order.renovacaoMotivoReprovacao =
                        banco
                            .renovacao_motivo_reprovacao ||
                        null;

                    order.renovacaoHistorico =
                        banco
                            .renovacao_historico ||
                        [];

                    order.renovacaoDestinatarioFinal =
                        banco
                            .renovacao_destinatario_final ||
                        banco.destinatario_final ||
                        'Elaine';

                    order.renovacaoAprovadoLeticiaPor =
                        banco
                            .renovacao_aprovado_leticia_por ||
                        null;

                    order.renovacaoAprovadoLeticiaEm =
                        banco
                            .renovacao_aprovado_leticia_em ||
                        null;

                    order.renovacaoAprovadoRonaldPor =
                        banco
                            .renovacao_aprovado_ronald_por ||
                        null;

                    order.renovacaoAprovadoRonaldEm =
                        banco
                            .renovacao_aprovado_ronald_em ||
                        null;
                });

                renderOrdersTable();

            } catch (error) {
                console.error(
                    'Erro carregando campos da renovação:',
                    error
                );
            }
        };

    // ========================================================
    // BOTÕES E BLOQUEIO DA EXECUÇÃO ANTES DA ELAINE
    // ========================================================

    window.aplicarInterfaceFluxoRenovacao =
        function() {
            const linhas =
                document.querySelectorAll(
                    '#osTableBody tr'
                );

            linhas.forEach(linha => {
                const botaoDetalhes =
                    linha.querySelector(
                        'button[onclick*="viewOrderDetails"]'
                    );

                if (!botaoDetalhes) {
                    return;
                }

                const acaoDetalhes =
                    botaoDetalhes.getAttribute(
                        'onclick'
                    ) ||
                    '';

                const resultado =
                    acaoDetalhes.match(
                        /viewOrderDetails\(['"]([^'"]+)['"]\)/
                    );

                if (!resultado) {
                    return;
                }

                const order =
                    orders.find(
                        item =>
                            String(item.id) ===
                            String(resultado[1])
                    );

                if (
                    !order ||
                    !ehRenovacaoCorrecao(
                        order
                    )
                ) {
                    return;
                }

                const etapa =
                    obterEtapaRenovacaoCorrecao(
                        order
                    );

                if (
                    [
                        ETAPA_NORMAL,
                        ETAPA_FINALIZADA
                    ].includes(
                        etapa
                    )
                ) {
                    return;
                }

                const celulas =
                    linha.querySelectorAll(
                        'td'
                    );

                const primeiraCelula =
                    celulas[0];

                const celulaAcoes =
                    celulas[
                        celulas.length - 1
                    ];

                if (!celulaAcoes) {
                    return;
                }

                const container =
                    celulaAcoes.querySelector(
                        '.d-flex'
                    ) ||
                    celulaAcoes;

                container
                    .querySelectorAll(
                        'button'
                    )
                    .forEach(botao => {
                        const acao =
                            botao.getAttribute(
                                'onclick'
                            ) ||
                            '';

                        if (
                            acao.includes(
                                'startOrder'
                            ) ||
                            acao.includes(
                                'openCompleteModal'
                            ) ||
                            acao.includes(
                                'conferirOS'
                            ) ||
                            acao.includes(
                                'abrirRejeitarModal'
                            ) ||
                            acao.includes(
                                'marcarAlteracoesFeitas'
                            ) ||
                            acao.includes(
                                'aprovarEtapaRenovacao'
                            ) ||
                            acao.includes(
                                'reprovarEtapaRenovacao'
                            ) ||
                            acao.includes(
                                'reenviarFluxoRenovacao'
                            )
                        ) {
                            botao.remove();
                        }
                    });

                container
                    .querySelectorAll(
                        '[data-fluxo-renovacao]'
                    )
                    .forEach(
                        elemento =>
                            elemento.remove()
                    );

                const grupo =
                    document.createElement(
                        'span'
                    );

                grupo.dataset
                    .fluxoRenovacao =
                    '1';

                grupo.style.display =
                    'inline-flex';

                grupo.style.gap =
                    '4px';

                const usuario =
                    obterUsuarioAtualRenovacao();

                if (
                    etapa ===
                        ETAPA_LETICIA &&
                    usuario ===
                        'leticia'
                ) {
                    grupo.innerHTML = `
                        <button
                            class="btn btn-success btn-sm"
                            onclick="aprovarEtapaRenovacao('${order.id}')"
                            title="Aprovar e enviar para Ronald"
                        >
                            <i class="fas fa-check"></i>
                            OK
                        </button>

                        <button
                            class="btn btn-danger btn-sm"
                            onclick="reprovarEtapaRenovacao('${order.id}')"
                            title="Recusar e devolver para Arthur"
                        >
                            <i class="fas fa-times"></i>
                            Recusado
                        </button>
                    `;
                }

                if (
                    etapa ===
                        ETAPA_RONALD &&
                    usuario ===
                        'ronald'
                ) {
                    grupo.innerHTML = `
                        <button
                            class="btn btn-success btn-sm"
                            onclick="aprovarEtapaRenovacao('${order.id}')"
                            title="Aprovar e enviar para Elaine"
                        >
                            <i class="fas fa-check"></i>
                            OK
                        </button>

                        <button
                            class="btn btn-danger btn-sm"
                            onclick="reprovarEtapaRenovacao('${order.id}')"
                            title="Recusar e devolver para Letícia"
                        >
                            <i class="fas fa-times"></i>
                            Recusado
                        </button>
                    `;
                }

                if (
                    etapa ===
                        ETAPA_ARTHUR &&
                    usuario ===
                        'arthur'
                ) {
                    grupo.innerHTML = `
                        <button
                            class="btn btn-warning btn-sm"
                            onclick="reenviarFluxoRenovacao('${order.id}')"
                            title="Reenviar para Letícia"
                        >
                            <i class="fas fa-redo"></i>
                            Reenviar
                        </button>
                    `;
                }

                if (
                    etapa ===
                        ETAPA_ELAINE &&
                    usuario ===
                        'elaine'
                ) {
                    if (
                        order.status ===
                        'pendente'
                    ) {
                        grupo.innerHTML = `
                            <button
                                class="btn btn-success btn-sm"
                                onclick="startOrder('${order.id}')"
                            >
                                <i class="fas fa-play"></i>
                                Iniciar
                            </button>
                        `;
                    } else if (
                        order.status ===
                        'andamento'
                    ) {
                        grupo.innerHTML = `
                            <button
                                class="btn btn-info btn-sm"
                                onclick="openCompleteModal('${order.id}')"
                            >
                                <i class="fas fa-flag-checkered"></i>
                                Finalizar
                            </button>
                        `;
                    }
                }

                if (
                    grupo.innerHTML.trim()
                ) {
                    container.appendChild(
                        grupo
                    );
                }

                if (primeiraCelula) {
                    primeiraCelula
                        .querySelectorAll(
                            '[data-etapa-renovacao]'
                        )
                        .forEach(
                            elemento =>
                                elemento.remove()
                        );

                    const indicador =
                        document.createElement(
                            'div'
                        );

                    indicador.dataset
                        .etapaRenovacao =
                        '1';

                    indicador.style.marginTop =
                        '4px';

                    indicador.innerHTML = `
                        <span class="badge badge-dark">
                            Renovação: ${obterNomeEtapaCorrecao(etapa)}
                        </span>
                    `;

                    primeiraCelula.appendChild(
                        indicador
                    );
                }
            });
        };

    // Garante que a interface especial seja aplicada
    // sempre depois da tabela normal.
    const renderizarTabelaOriginalRenovacao =
        renderOrdersTable;

    renderOrdersTable =
        function() {
            const retorno =
                renderizarTabelaOriginalRenovacao();

            setTimeout(
                () => {
                    window
                        .aplicarInterfaceFluxoRenovacao();
                },
                0
            );

            return retorno;
        };

    console.log(
        '✅ Correção definitiva do fluxo de renovação instalada.'
    );
})();


// ===== EXPORTAR FUNÇÕES PARA USO GLOBAL =====
window.emitirNFEVenda = emitirNFEVenda;
window.testMLConnection = testMLConnection;
window.checkMLTokenStatus = checkMLTokenStatus;
window.initializeMLAuth = initializeMLAuth;
window.testMLConnection = testMLConnection;
window.abrirSistemaVendas = abrirSistemaVendas;
window.carregarVendasML = carregarVendasML;
window.verDetalhesVenda = verDetalhesVenda;
window.verificarVenda = verificarVenda;
window.desverificarVenda = desverificarVenda;
window.configurarVendas = configurarVendas;
window.fecharConfigVendas = fecharConfigVendas;
window.salvarConfigVendas = salvarConfigVendas;
window.exportarVendas = exportarVendas;
window.fecharDetalhesVenda = fecharDetalhesVenda;
window.imprimirDetalhesVenda = imprimirDetalhesVenda;
window.verificarVendaAtual = verificarVendaAtual;