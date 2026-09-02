// ============================================================
// MÓDULO: GERENCIAMENTO DE PROMOÇÕES ML - COM LOGS DETALHADOS
// ============================================================

(function() {
    'use strict';

    // ============================================================
    // VARIÁVEIS GLOBAIS
    // ============================================================
    let todasPromocoes = [];
    let itensOrigem = [];
    let itensDestino = [];
    let itensAnalisados = [];
    let mlbsBloqueados = [];
    let isLoading = false;
    let promocoesEncontradasAgendamento = [];
    let agendamentosPromocoes = [];
    let modalAvisoAgendamentoAberto = false;
    let timerAvisosAgendamento = null;
    let itensAgendamentoEmMassa = [];

    // ============================================================
    // FUNÇÃO DE LOG
    // ============================================================
    function log(msg, type = 'info', data = null) {
        const prefix = '📢 [PROMOÇÕES]';
        const timestamp = new Date().toLocaleTimeString();
        
        switch(type) {
            case 'info':
                console.log(`${prefix} ${timestamp} ℹ️ ${msg}`, data || '');
                break;
            case 'success':
                console.log(`${prefix} ${timestamp} ✅ ${msg}`, data || '');
                break;
            case 'warning':
                console.log(`${prefix} ${timestamp} ⚠️ ${msg}`, data || '');
                break;
            case 'error':
                console.error(`${prefix} ${timestamp} ❌ ${msg}`, data || '');
                break;
            case 'debug':
                console.debug(`${prefix} ${timestamp} 🔍 ${msg}`, data || '');
                break;
            default:
                console.log(`${prefix} ${timestamp} ${msg}`, data || '');
        }
    }

    // ============================================================
    // FUNÇÃO PRINCIPAL: ABRIR SISTEMA DE PROMOÇÕES
    // ============================================================
    window.abrirGestaoPromocoesLote = async function() {
        log('🚀 Abrindo Gestão de Promoções em Lote', 'info');
        
        if (!window.currentUser) {
            log('Usuário não logado!', 'error');
            showToast('⚠️ Faça login primeiro', 'warning');
            return;
        }

        log(`Usuário: ${window.currentUser.name} (${window.currentUser.role})`, 'info');

        // Esconder outros sistemas
        const sistemas = [
            'menuSystem', 'mainSystem', 'salesSystem', 'reembolsosSystem',
            'caixaSystem', 'precificacaoSystem', 'reviewsSystem', 'folgasSystem',
            'shippingSystem', 'estoqueSystem', 'entradasSystem', 'estoqueGestaoSystem',
            'perguntasSystem', 'feedbackSystem', 'nfeSystem', 'promocoesSystem'
        ];
        sistemas.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.classList.add('hidden');
        });
        log('Sistemas ocultados', 'debug');

        // Criar ou mostrar container
        let container = document.getElementById('bulkPromotionSystem');
        if (container) {
            log('Container já existe, reutilizando...', 'debug');
            container.classList.remove('hidden');
        } else {
            log('Criando novo container...', 'debug');
            container = criarInterfaceBulk();
            document.body.appendChild(container);
            log('Container criado', 'success');
        }

        // Atualizar usuário
        const nameEl = document.getElementById('bulkUserName');
        const avatarEl = document.getElementById('bulkUserAvatar');
        const roleEl = document.getElementById('bulkUserRole');
        if (nameEl) nameEl.textContent = window.currentUser?.name || 'Usuário';
        if (avatarEl) avatarEl.textContent = window.currentUser?.avatar || 'U';
        if (roleEl) roleEl.textContent = window.currentUser?.role || '';
        log('Usuário atualizado na interface', 'debug');

        // Carregar promoções e MLBs bloqueados
        log('Carregando promoções...', 'info');
        await carregarPromocoes();
        carregarMLBsBloqueados();
        await carregarAgendamentosPromocoes();
        await verificarAvisosPromocoesAgendadas();

        showToast('📋 Gestão de Promoções em Lote carregada', 'info');
        log('Sistema carregado com sucesso', 'success');
    };

    window.fecharGestaoPromocoesLote = function() {
        log('Fechando Gestão de Promoções em Lote', 'info');
        const container = document.getElementById('bulkPromotionSystem');
        if (container) container.classList.add('hidden');
        const menu = document.getElementById('menuSystem');
        if (menu) menu.classList.remove('hidden');
    };

function criarInterfaceBulk() {
    log('Criando interface...', 'debug');

    const div = document.createElement('div');
    div.id = 'bulkPromotionSystem';
    div.className = 'container';
    div.style.cssText =
        'display:block; max-width:1400px; margin:0 auto; padding:0 20px;';

    div.innerHTML = `
        <header class="main-header">
            <div class="container">
                <div class="header-content">
                    <h1 style="display:flex; align-items:center; gap:10px;">
                        <img
                            src="logo.png"
                            alt="Wheel Tech"
                            style="height:35px; width:auto;"
                        >
                        <span>Gestão de Promoções em Lote</span>
                    </h1>

                    <div class="user-info">
                        <div class="user-avatar" id="bulkUserAvatar">U</div>

                        <div>
                            <div
                                style="font-weight:600;"
                                id="bulkUserName"
                            >
                                Usuário
                            </div>

                            <div
                                style="font-size:12px; color:#6c757d;"
                                id="bulkUserRole"
                            ></div>

                            <div class="d-flex gap-2 mt-2">
                                <button
                                    onclick="fecharGestaoPromocoesLote()"
                                    class="btn btn-primary btn-sm"
                                >
                                    ← Voltar ao Menu
                                </button>

                                <button
                                    onclick="handleLogout()"
                                    class="btn btn-secondary btn-sm"
                                >
                                    Sair
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </header>

        <!-- AGENDAMENTO MANUAL DE PROMOÇÕES -->
        <div class="card mb-4">
            <div class="card-header">
                <h2 class="card-title">
                    <i class="fas fa-calendar-alt"></i>
                    Agendar promoção por MLB
                </h2>

                <button
                    class="btn btn-sm btn-primary"
                    onclick="carregarAgendamentosPromocoes()"
                >
                    <i class="fas fa-sync-alt"></i>
                    Atualizar lista
                </button>
            </div>

            <div class="card-body">
                <div class="row align-items-end">
                    <div class="col-md-9">
                        <div class="form-group">
                            <label>MLB do anúncio *</label>

                            <input
                                type="text"
                                id="agendaMlbPesquisa"
                                class="form-control"
                                placeholder="Ex: MLB1234567890"
                                onkeydown="
                                    if (event.key === 'Enter') {
                                        event.preventDefault();
                                        pesquisarMLBParaAgendamento();
                                    }
                                "
                            >
                        </div>
                    </div>

                    <div class="col-md-3">
                        <button
                            id="btnPesquisarAgendaMlb"
                            class="btn btn-primary"
                            style="width:100%;"
                            onclick="pesquisarMLBParaAgendamento()"
                        >
                            <i class="fas fa-search"></i>
                            Pesquisar MLB
                        </button>
                    </div>
                </div>

                <div id="agendaDadosItem" class="mt-3"></div>

                <div
                    id="agendaPromocoesEncontradas"
                    class="mt-3"
                ></div>

                <div
                    id="agendaDatasContainer"
                    class="row mt-3 hidden"
                >
                    <div class="col-md-5">
                        <div class="form-group">
                            <label>Data e hora de ativação *</label>

                            <input
                                type="datetime-local"
                                id="agendaDataAtivacao"
                                class="form-control"
                            >
                        </div>
                    </div>

                    <div class="col-md-5">
                        <div class="form-group">
                            <label>Data e hora de desativação *</label>

                            <input
                                type="datetime-local"
                                id="agendaDataDesativacao"
                                class="form-control"
                            >
                        </div>
                    </div>

                    <div
                        class="col-md-2"
                        style="display:flex; align-items:flex-end;"
                    >
                        <button
                            id="btnSalvarAgendamento"
                            class="btn btn-success"
                            style="width:100%;"
                            onclick="salvarAgendamentosSelecionados()"
                        >
                            <i class="fas fa-save"></i>
                            Programar
                        </button>
                    </div>
                </div>
            </div>
        </div>

        <!-- AGENDAMENTO EM MASSA POR LISTA DE MLBS -->
<div class="card mb-4">
    <div class="card-header">
        <h2 class="card-title">
            <i class="fas fa-layer-group"></i>
            Agendar lista de MLBs
        </h2>
    </div>

    <div class="card-body">
        <div class="form-group">
            <label>Lista de MLBs *</label>

            <textarea
                id="agendaMassaListaMlbs"
                class="form-control"
                rows="6"
                placeholder="Cole um MLB por linha, separados por espaço, vírgula ou ponto e vírgula."
            ></textarea>

            <small class="text-muted">
                MLBs repetidos serão removidos automaticamente.
            </small>
        </div>

        <button
            type="button"
            id="btnPesquisarAgendaMassa"
            class="btn btn-primary"
            onclick="pesquisarListaMLBsParaAgendamento()"
        >
            <i class="fas fa-search"></i>
            Pesquisar lista
        </button>

        <div
            id="agendaMassaProgresso"
            class="mt-3"
        ></div>

        <div
            id="agendaMassaResultados"
            class="mt-3"
        ></div>

        <div
            id="agendaMassaDatasContainer"
            class="row mt-3 hidden"
        >
            <div class="col-md-5">
                <div class="form-group">
                    <label>Data e hora de ativação *</label>

                    <input
                        type="datetime-local"
                        id="agendaMassaDataAtivacao"
                        class="form-control"
                    >
                </div>
            </div>

            <div class="col-md-5">
                <div class="form-group">
                    <label>Data e hora de desativação *</label>

                    <input
                        type="datetime-local"
                        id="agendaMassaDataDesativacao"
                        class="form-control"
                    >
                </div>
            </div>

            <div
                class="col-md-2"
                style="display:flex; align-items:flex-end;"
            >
                <button
                    type="button"
                    id="btnSalvarAgendamentoMassa"
                    class="btn btn-success"
                    style="width:100%;"
                    onclick="salvarAgendamentosEmMassa()"
                >
                    <i class="fas fa-calendar-check"></i>
                    Agendar todos
                </button>
            </div>
        </div>
    </div>
</div>

        <!-- LISTA DE AGENDAMENTOS -->
        <div class="card mb-4">
            <div class="card-header">
                <h2 class="card-title">
                    <i class="fas fa-list"></i>
                    MLBs programados
                </h2>

                <div class="d-flex flex-wrap gap-2 align-items-center">
                    <button
                        id="btnAtivarAgendamentosHoje"
                        class="btn btn-sm btn-success"
                        onclick="executarAtivacoesAgendadasDeHoje()"
                        disabled
                    >
                        <i class="fas fa-play-circle"></i>
                        Ativar todas de hoje (0)
                    </button>

                    <select
                        id="agendaFiltroStatus"
                        class="form-control form-control-sm"
                        onchange="renderizarAgendamentosPromocoes()"
                        style="max-width:200px;"
                    >
                        <option value="todos">
                            Todos os status
                        </option>

                        <option value="pendentes">
                            Ações pendentes
                        </option>

                        <option value="agendada">
                            Agendadas
                        </option>

                        <option value="ativada">
                            Ativadas
                        </option>

                        <option value="concluida">
                            Concluídas
                        </option>

                        <option value="erros">
                            Com erro
                        </option>

                        <option value="cancelada">
                            Canceladas
                        </option>
                    </select>
                </div>
            </div>

            <div class="card-body">
                <div class="table-responsive">
                    <table class="table table-striped table-hover">
                        <thead>
                            <tr>
                                <th>MLB</th>
                                <th>Promoção</th>
                                <th style="text-align:right;">
                                    Valor final
                                </th>
                                <th>Ativação</th>
                                <th>Desativação</th>
                                <th>Status</th>
                                <th>Responsável</th>
                                <th style="min-width:190px;">
                                    Ações
                                </th>
                            </tr>
                        </thead>

                        <tbody id="agendaPromocoesBody">
                            <tr>
                                <td
                                    colspan="8"
                                    class="text-center text-muted py-4"
                                >
                                    Carregando...
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>

        <!-- CONFIGURAR ANÁLISE -->
        <div class="card mb-4">
            <div class="card-header">
                <h2 class="card-title">
                    <i class="fas fa-cog"></i>
                    Configurar Análise
                </h2>
            </div>

            <div class="card-body">
                <div class="row">
                    <div class="col-md-4">
                        <div class="form-group">
                            <label>
                                <i class="fas fa-arrow-right"></i>
                                Promoção de Origem *
                            </label>

                            <select
                                id="bulkPromocaoOrigem"
                                class="form-control"
                            >
                                <option value="">Selecione...</option>
                            </select>

                            <small class="text-muted">
                                Itens ativos nesta promoção serão analisados
                            </small>
                        </div>
                    </div>

                    <div class="col-md-4">
                        <div class="form-group">
                            <label>
                                <i class="fas fa-arrow-left"></i>
                                Promoção de Destino *
                            </label>

                            <select
                                id="bulkPromocaoDestino"
                                class="form-control"
                            >
                                <option value="">Selecione...</option>
                            </select>

                            <small class="text-muted">
                                Itens serão ativados nesta promoção
                            </small>
                        </div>
                    </div>

                    <div class="col-md-4">
                        <div class="form-group">
                            <label>
                                <i class="fas fa-rule"></i>
                                Regra de Filtro *
                            </label>

                            <select
                                id="bulkRegraFiltro"
                                class="form-control"
                            >
                                <option value="todos">
                                    📋 Todos os MLBs (sem filtro)
                                </option>

                                <option value="destino_maior">
                                    📈 Destino &gt; Origem
                                    (preço final maior)
                                </option>

                                <option value="destino_menor">
                                    📉 Destino &lt; Origem
                                    (preço final menor)
                                </option>

                                <option value="destino_igual">
                                    📊 Destino = Origem
                                    (preços iguais)
                                </option>

                                <option value="destino_maior_igual">
                                    📈 Destino ≥ Origem
                                    (maior ou igual)
                                </option>

                                <option value="destino_menor_igual">
                                    📉 Destino ≤ Origem
                                    (menor ou igual)
                                </option>

                                <option value="diferenca_minima">
                                    💰 Diferença mínima (R$ 5,00)
                                </option>

                                <option value="diferenca_maxima">
                                    💰 Diferença máxima (R$ 20,00)
                                </option>
                            </select>

                            <small class="text-muted">
                                Filtra os MLBs com base na comparação de preços
                            </small>
                        </div>
                    </div>
                </div>

                <div class="row mt-3">
                    <div class="col-md-12">
                        <button
                            class="btn btn-primary btn-block"
                            onclick="analisarItens()"
                            style="width:100%;"
                        >
                            <i class="fas fa-search"></i>
                            Analisar
                        </button>
                    </div>
                </div>
            </div>
        </div>

        <!-- MLBs BLOQUEADOS -->
        <div class="card mb-4">
            <div class="card-header">
                <h2 class="card-title">
                    <i class="fas fa-ban"></i>
                    MLBs Bloqueados
                </h2>

                <div class="d-flex flex-wrap gap-2">
                    <button
                        class="btn btn-sm btn-success"
                        onclick="adicionarMLBBloqueado()"
                    >
                        <i class="fas fa-plus"></i>
                        Adicionar
                    </button>

                    <button
                        class="btn btn-sm btn-danger"
                        onclick="limparMLBsBloqueados()"
                    >
                        <i class="fas fa-trash"></i>
                        Limpar Todos
                    </button>

                    <button
                        class="btn btn-sm btn-primary"
                        onclick="exportarMLBsBloqueados()"
                    >
                        <i class="fas fa-file-export"></i>
                        Exportar
                    </button>

                    <button
                        class="btn btn-sm btn-info"
                        onclick="importarMLBsBloqueados()"
                    >
                        <i class="fas fa-file-import"></i>
                        Importar
                    </button>
                </div>
            </div>

            <div class="card-body">
                <div class="form-group">
                    <label>MLB's bloqueados (separados por espaço)</label>

                    <input
                        type="text"
                        id="bulkMLBsBloqueados"
                        class="form-control"
                        placeholder="Ex: MLB123 MLB456 MLB789"
                        onchange="salvarMLBsBloqueadosManuais()"
                    >

                    <small class="text-muted">
                        <span
                            class="badge badge-danger"
                            id="contadorMLBs"
                        >
                            0
                        </span>
                        MLBs bloqueados
                    </small>
                </div>

                <div
                    id="bulkMLBsBloqueadosLista"
                    class="mt-2"
                    style="
                        display:flex;
                        flex-wrap:wrap;
                        gap:5px;
                    "
                ></div>
            </div>
        </div>

        <!-- RESULTADO DA ANÁLISE -->
        <div class="card mb-4">
            <div class="card-header">
                <h2 class="card-title">
                    <i class="fas fa-chart-bar"></i>
                    Resultado da Análise
                </h2>

                <div class="d-flex flex-wrap gap-2">
                    <button
                        class="btn btn-success"
                        onclick="executarAtivacaoEmMassa()"
                        id="btnAtivarMassa"
                        disabled
                    >
                        <i class="fas fa-play"></i>
                        Ativar em Massa (0)
                    </button>

                    <button
                        class="btn btn-info"
                        onclick="exportarAnaliseExcel()"
                    >
                        <i class="fas fa-file-excel"></i>
                        Exportar
                    </button>
                </div>
            </div>

            <div class="card-body">
                <div id="bulkResumo" class="row mb-3 hidden">
                    <div class="col-md-3">
                        <div class="card text-center bg-light">
                            <div class="card-body">
                                <h5>Total Analisado</h5>
                                <h3 id="bulkTotalItens">0</h3>
                            </div>
                        </div>
                    </div>

                    <div class="col-md-3">
                        <div class="card text-center bg-success text-white">
                            <div class="card-body">
                                <h5>✅ Elegíveis</h5>
                                <h3 id="bulkElegiveis">0</h3>
                            </div>
                        </div>
                    </div>

                    <div class="col-md-3">
                        <div class="card text-center bg-danger text-white">
                            <div class="card-body">
                                <h5>🚫 Bloqueados</h5>
                                <h3 id="bulkBloqueados">0</h3>
                            </div>
                        </div>
                    </div>

                    <div class="col-md-3">
                        <div class="card text-center bg-warning">
                            <div class="card-body">
                                <h5>⏳ Já Ativos</h5>
                                <h3 id="bulkJaAtivos">0</h3>
                            </div>
                        </div>
                    </div>
                </div>

                <div
                    id="bulkTabelaContainer"
                    class="table-responsive hidden"
                >
                    <table
                        class="table table-striped table-hover"
                        id="bulkItensTable"
                    >
                        <thead>
                            <tr>
                                <th style="width:40px;">
                                    <input
                                        type="checkbox"
                                        id="bulkSelectAll"
                                        onchange="selecionarTodosItens()"
                                    >
                                </th>

                                <th>MLB</th>

                                <th style="text-align:right;">
                                    Preço Final Origem
                                </th>

                                <th style="text-align:center;">
                                    % Origem
                                </th>

                                <th style="text-align:right;">
                                    Preço Final Destino
                                </th>

                                <th style="text-align:center;">
                                    % Destino
                                </th>

                                <th style="text-align:center;">
                                    Diferença
                                </th>

                                <th>Status</th>
                            </tr>
                        </thead>

                        <tbody id="bulkItensBody">
                            <tr>
                                <td
                                    colspan="8"
                                    class="text-center py-4 text-muted"
                                >
                                    <i class="fas fa-info-circle"></i>
                                    Selecione as promoções e clique em
                                    "Analisar"
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;

    log('Interface criada', 'success');

    return div;
}

    // ============================================================
// FUNÇÃO: APLICAR REGRA DE FILTRO
// ============================================================
function aplicarRegraFiltro(item, regra) {
    const precoOrigem = item.precoOrigem || 0;
    const precoDestino = item.precoDestino || 0;
    const diferenca = precoDestino - precoOrigem;
    
    switch(regra) {
        case 'todos':
            return true;
            
        case 'destino_maior':
            return precoDestino > precoOrigem;
            
        case 'destino_menor':
            return precoDestino < precoOrigem;
            
        case 'destino_igual':
            return Math.abs(precoDestino - precoOrigem) < 0.01;
            
        case 'destino_maior_igual':
            return precoDestino >= precoOrigem;
            
        case 'destino_menor_igual':
            return precoDestino <= precoOrigem;
            
        case 'diferenca_minima':
            return diferenca >= 5.00;
            
        case 'diferenca_maxima':
            return diferenca <= 20.00;
            
        default:
            return true;
    }
}

    // ============================================================
    // FUNÇÃO: CARREGAR PROMOÇÕES
    // ============================================================
    async function carregarPromocoes() {
        log('🔄 Carregando promoções...', 'info');
        
        try {
            log('Obtendo token...', 'debug');
            const tokenData = await window.getValidToken?.();
            if (!tokenData?.access_token) {
                log('Token não disponível!', 'error');
                showToast('❌ Token não disponível', 'error');
                return;
            }
            log(`Token obtido: ${tokenData.access_token.substring(0, 20)}...`, 'debug');

            const userId = '415176739';
            const url = `https://api.mercadolibre.com/seller-promotions/users/${userId}?app_version=v2`;
            log(`URL: ${url}`, 'debug');
            
            const proxyUrl = `${window.WORKER_URL || 'https://purple-bonus-3b1c.andmiotto1998.workers.dev'}/api/ml/proxy?url=${encodeURIComponent(url)}&token=${tokenData.access_token}`;
            log(`Proxy URL: ${proxyUrl.substring(0, 100)}...`, 'debug');

            log('Fazendo requisição para API...', 'info');
            const response = await fetch(proxyUrl);
            log(`Resposta: status ${response.status}`, 'debug');
            
            if (!response.ok) {
                const errorText = await response.text();
                log(`Erro na API: ${response.status} - ${errorText}`, 'error');
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }

            const data = await response.json();
            log(`Dados recebidos: ${data.results?.length || 0} promoções`, 'info');
            
            todasPromocoes = (data.results || []).filter(p => p.status === 'started');
            log(`✅ ${todasPromocoes.length} promoções ativas carregadas`, 'success');
            
            // Log detalhado das promoções
            todasPromocoes.forEach((p, i) => {
                log(`  ${i+1}. ${p.name} (${p.type}) - ID: ${p.id}`, 'debug');
            });
            
            preencherSelectsPromocoes();
            showToast(`✅ ${todasPromocoes.length} promoções ativas`, 'success');

        } catch (error) {
            log(`❌ Erro ao carregar promoções: ${error.message}`, 'error');
            console.error(error);
            showToast('Erro ao carregar promoções', 'error');
        }
    }

    function preencherSelectsPromocoes() {
        log('Preenchendo selects...', 'debug');
        const origem = document.getElementById('bulkPromocaoOrigem');
        const destino = document.getElementById('bulkPromocaoDestino');
        
        if (origem) {
            origem.innerHTML = '<option value="">Selecione...</option>';
            todasPromocoes.forEach(p => {
                const opt = document.createElement('option');
                opt.value = p.id;
                opt.textContent = `${p.name} (${p.type})`;
                opt.dataset.type = p.type;
                origem.appendChild(opt);
            });
            log(`Select origem preenchido com ${todasPromocoes.length} opções`, 'debug');
        }
        
        if (destino) {
            destino.innerHTML = '<option value="">Selecione...</option>';
            todasPromocoes.forEach(p => {
                const opt = document.createElement('option');
                opt.value = p.id;
                opt.textContent = `${p.name} (${p.type})`;
                opt.dataset.type = p.type;
                destino.appendChild(opt);
            });
            log(`Select destino preenchido com ${todasPromocoes.length} opções`, 'debug');
        }
    }

    function converterDataAgendaParaInputLocal(valor) {
    if (!valor) {
        return '';
    }

    const data = new Date(valor);

    if (!Number.isFinite(data.getTime())) {
        return '';
    }

    const preencher = numero => {
        return String(numero).padStart(2, '0');
    };

    return (
        `${data.getFullYear()}-` +
        `${preencher(data.getMonth() + 1)}-` +
        `${preencher(data.getDate())}T` +
        `${preencher(data.getHours())}:` +
        `${preencher(data.getMinutes())}`
    );
}

window.fecharModalAlterarFimPromocao = function() {
    const modal = document.getElementById(
        'modalAlterarFimPromocao'
    );

    if (modal) {
        modal.remove();
    }
};

window.abrirModalAlterarFimPromocao = function(id) {
    const agendamento = agendamentosPromocoes.find(
        item => Number(item.id) === Number(id)
    );

    if (!agendamento) {
        showToast(
            '❌ Agendamento não encontrado',
            'error'
        );

        return;
    }

    const statusPermitidos = [
        'agendada',
        'erro_ativacao'
    ];

    if (!statusPermitidos.includes(agendamento.status)) {
        showToast(
            '⚠️ A data final só pode ser alterada antes da ativação',
            'warning'
        );

        return;
    }

    window.fecharModalAlterarFimPromocao();

    const valorAtual = converterDataAgendaParaInputLocal(
        agendamento.data_desativacao
    );

    const modal = document.createElement('div');

    modal.id = 'modalAlterarFimPromocao';

    modal.style.cssText = `
        position: fixed;
        inset: 0;
        z-index: 100001;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
        background: rgba(0, 0, 0, 0.68);
    `;

    modal.innerHTML = `
        <div
            style="
                width: min(520px, 96vw);
                background: #ffffff;
                border-radius: 14px;
                padding: 24px;
                box-shadow: 0 15px 50px rgba(0, 0, 0, 0.30);
            "
        >
            <div
                style="
                    display: flex;
                    align-items: flex-start;
                    justify-content: space-between;
                    gap: 15px;
                    margin-bottom: 20px;
                "
            >
                <div>
                    <h3
                        style="
                            margin: 0;
                            color: #343a40;
                            font-size: 20px;
                        "
                    >
                        <i
                            class="fas fa-calendar-edit"
                            style="color: #00ADEE;"
                        ></i>

                        Alterar data de encerramento
                    </h3>

                    <p
                        class="text-muted"
                        style="margin: 7px 0 0;"
                    >
                        ${escaparHtmlAgenda(agendamento.mlb)}
                        —
                        ${escaparHtmlAgenda(
                            agendamento.promotion_name
                        )}
                    </p>
                </div>

                <button
                    type="button"
                    class="btn btn-sm btn-secondary"
                    onclick="fecharModalAlterarFimPromocao()"
                >
                    <i class="fas fa-times"></i>
                </button>
            </div>

            <div class="form-group">
                <label for="novaDataFimPromocao">
                    Nova data e hora de encerramento *
                </label>

                <input
                    type="datetime-local"
                    id="novaDataFimPromocao"
                    class="form-control"
                    value="${escaparHtmlAgenda(valorAtual)}"
                >

                <small class="text-muted">
                    A nova data precisa ser posterior à data de ativação.
                </small>
            </div>

            <div
                style="
                    display: flex;
                    justify-content: flex-end;
                    gap: 10px;
                    margin-top: 22px;
                "
            >
                <button
                    type="button"
                    class="btn btn-secondary"
                    onclick="fecharModalAlterarFimPromocao()"
                >
                    Cancelar
                </button>

                <button
                    type="button"
                    id="btnSalvarNovaDataFimPromocao"
                    class="btn btn-success"
                    onclick="salvarNovaDataFimPromocao(${Number(
                        agendamento.id
                    )})"
                >
                    <i class="fas fa-save"></i>
                    Salvar nova data
                </button>
            </div>
        </div>
    `;

    modal.addEventListener('click', event => {
        if (event.target === modal) {
            window.fecharModalAlterarFimPromocao();
        }
    });

    document.body.appendChild(modal);

    setTimeout(() => {
        document
            .getElementById('novaDataFimPromocao')
            ?.focus();
    }, 100);
};

window.salvarNovaDataFimPromocao = async function(id) {
    const supabase = obterSupabasePromocoes();

    if (!supabase) {
        showToast(
            '❌ Supabase não conectado',
            'error'
        );

        return;
    }

    const agendamento = agendamentosPromocoes.find(
        item => Number(item.id) === Number(id)
    );

    if (!agendamento) {
        showToast(
            '❌ Agendamento não encontrado',
            'error'
        );

        return;
    }

    const statusPermitidos = [
        'agendada',
        'erro_ativacao'
    ];

    if (!statusPermitidos.includes(agendamento.status)) {
        showToast(
            '⚠️ Esta promoção já foi ativada e não pode mais ser alterada',
            'warning'
        );

        window.fecharModalAlterarFimPromocao();

        await carregarAgendamentosPromocoes();

        return;
    }

    const input = document.getElementById(
        'novaDataFimPromocao'
    );

    const novaDataValor = input?.value;

    if (!novaDataValor) {
        showToast(
            '⚠️ Informe a nova data de encerramento',
            'warning'
        );

        input?.focus();

        return;
    }

    const novaDataFim = new Date(novaDataValor);

    if (!Number.isFinite(novaDataFim.getTime())) {
        showToast(
            '⚠️ A data de encerramento informada é inválida',
            'warning'
        );

        input?.focus();

        return;
    }

    const dataAtivacao = new Date(
        agendamento.data_ativacao
    );

    if (!Number.isFinite(dataAtivacao.getTime())) {
        showToast(
            '❌ A data de ativação deste agendamento é inválida',
            'error'
        );

        return;
    }

    if (novaDataFim.getTime() <= dataAtivacao.getTime()) {
        showToast(
            '⚠️ A data final precisa ser posterior à data de ativação',
            'warning'
        );

        input?.focus();

        return;
    }

    const botao = document.getElementById(
        'btnSalvarNovaDataFimPromocao'
    );

    if (botao) {
        botao.disabled = true;

        botao.innerHTML = `
            <i class="fas fa-spinner fa-spin"></i>
            Salvando...
        `;
    }

    try {
        const {
            data,
            error
        } = await supabase
            .from('promocoes_agendadas')
            .update({
                data_desativacao: novaDataFim.toISOString(),
                atualizada_por: nomeUsuarioAgenda(),
                atualizada_em: new Date().toISOString()
            })
            .eq('id', id)
            .in('status', statusPermitidos)
            .select();

        if (error) {
            throw error;
        }

        if (!data?.length) {
            throw new Error(
                'A promoção já foi ativada ou alterada por outro usuário'
            );
        }

        window.fecharModalAlterarFimPromocao();

        showToast(
            `✅ Nova data final salva para ${agendamento.mlb}`,
            'success'
        );

        await carregarAgendamentosPromocoes();

        fecharModalAvisosPromocoes();

        await verificarAvisosPromocoesAgendadas();
    } catch (error) {
        log(
            `Erro ao alterar data final do agendamento ${id}: ` +
            `${error.message}`,
            'error'
        );

        showToast(
            `❌ Erro ao alterar a data final: ${error.message}`,
            'error'
        );
    } finally {
        const botaoAtual = document.getElementById(
            'btnSalvarNovaDataFimPromocao'
        );

        if (botaoAtual) {
            botaoAtual.disabled = false;

            botaoAtual.innerHTML = `
                <i class="fas fa-save"></i>
                Salvar nova data
            `;
        }
    }
};

// ============================================================
// FUNÇÃO: ANALISAR ITENS (COMPLETA E ATUALIZADA)
// ============================================================
window.analisarItens = async function() {
    const origemId = document.getElementById('bulkPromocaoOrigem')?.value;
    const destinoId = document.getElementById('bulkPromocaoDestino')?.value;
    const regra = document.getElementById('bulkRegraFiltro')?.value || 'todos';
    
    if (!origemId || !destinoId) {
        showToast('⚠️ Selecione a promoção de origem e destino', 'warning');
        return;
    }
    
    if (origemId === destinoId) {
        showToast('⚠️ Origem e destino não podem ser iguais', 'warning');
        return;
    }

    const tokenData = await window.getValidToken?.();
    if (!tokenData?.access_token) {
        showToast('❌ Token não disponível', 'error');
        return;
    }

    const promoOrigem = todasPromocoes.find(p => p.id === origemId);
    const promoDestino = todasPromocoes.find(p => p.id === destinoId);
    
    if (!promoOrigem || !promoDestino) {
        showToast('❌ Promoção não encontrada', 'error');
        return;
    }

    // Nome da regra para exibição
    const regraLabels = {
        'todos': 'Todos os MLBs',
        'destino_maior': 'Destino > Origem',
        'destino_menor': 'Destino < Origem',
        'destino_igual': 'Destino = Origem',
        'destino_maior_igual': 'Destino ≥ Origem',
        'destino_menor_igual': 'Destino ≤ Origem',
        'diferenca_minima': 'Diferença ≥ R$ 5,00',
        'diferenca_maxima': 'Diferença ≤ R$ 20,00'
    };
    
    const nomeRegra = regraLabels[regra] || 'Todos os MLBs';
    log(`📋 Regra selecionada: ${nomeRegra}`, 'info');

    mostrarBarraProgresso('Buscando interseção...', `Regra: ${nomeRegra}`);

    try {
        // ============================================================
        // PASSO 1: Buscar ATIVOS na origem (status=started)
        // ============================================================
        atualizarProgresso(15, 'Buscando ativos na origem...', `Promoção: ${promoOrigem.name}`, '15%');
        
        const ativosOrigem = await buscarItensPromocaoPorStatus(
            origemId, 
            promoOrigem.type, 
            'started', 
            tokenData.access_token
        );
        
        if (ativosOrigem.length === 0) {
            showToast('⚠️ Nenhum item ativo na origem', 'warning');
            fecharBarraProgresso();
            return;
        }
        
        const mapAtivosOrigem = new Map();
        ativosOrigem.forEach(item => {
            // Garantir que o preço está em reais
            let price = item.price || 0;
            if (price > 1000) price = price / 100;
            
            mapAtivosOrigem.set(item.id, {
                price: price,
                seller_percentage: item.seller_percentage || 0,
                status: item.status || 'started'
            });
        });
        
        log(`📊 ${mapAtivosOrigem.size} MLBs ativos na origem`, 'info');
        
        // ============================================================
        // PASSO 2: Buscar TODOS os itens do destino
        // ============================================================
        atualizarProgresso(35, 'Buscando todos os itens do destino...', `Promoção: ${promoDestino.name}`, '35%');
        
        const todosItensDestino = await buscarTodosItensPromocao(
            destinoId, 
            promoDestino.type, 
            tokenData.access_token
        );
        
        const mapDestino = new Map();
        const itensStarted = [];
        const itensCandidate = [];
        const itensPending = [];
        
        for (const item of todosItensDestino) {
            const mlb = item.id;
            const status = item.status || 'unknown';
            
            // Garantir que o preço está em reais
            let price = item.price || 0;
            let originalPrice = item.original_price || 0;
            
            mapDestino.set(mlb, {
                id: mlb,
                status: status,
                price: price,
                original_price: originalPrice,
                seller_percentage: item.seller_percentage || 0
            });
            
            if (status === 'started') itensStarted.push(item);
            else if (status === 'candidate') itensCandidate.push(item);
            else if (status === 'pending') itensPending.push(item);
        }
        
        log(`📊 Destino - Ativos (started): ${itensStarted.length}`, 'info');
        log(`📊 Destino - Candidatos (candidate): ${itensCandidate.length}`, 'info');
        log(`📊 Destino - Programados (pending): ${itensPending.length}`, 'info');
        log(`📊 Total de itens únicos no destino: ${mapDestino.size}`, 'info');
        
        // ============================================================
        // PASSO 3: Encontrar a INTERSEÇÃO
        // ============================================================
        atualizarProgresso(60, 'Encontrando interseção...', 'Processando...', '60%');
        
        const interseccaoBruta = [];
        let totalProcessados = 0;
        const totalAtivosOrigem = ativosOrigem.length;
        
        let countStarted = 0;
        let countCandidate = 0;
        let countPending = 0;
        let countDesconhecido = 0;
        
        for (const [mlb, dadosOrigem] of mapAtivosOrigem) {
            totalProcessados++;
            
            if (totalProcessados % 50 === 0 || totalProcessados === totalAtivosOrigem) {
                const pct = 60 + (totalProcessados / totalAtivosOrigem) * 30;
                atualizarProgresso(
                    Math.min(pct, 90),
                    `Processando ${totalProcessados}/${totalAtivosOrigem}`,
                    `${interseccaoBruta.length} encontrados`,
                    `${Math.round(pct)}%`
                );
            }
            
            // Verificar se está no destino
            if (!mapDestino.has(mlb)) continue;
            
            const dadosDestino = mapDestino.get(mlb);
            if (!dadosDestino) continue;
            
            const statusDestino = dadosDestino.status || 'unknown';
            
            // Mapear status para exibição
            let statusLabel = '';
            let statusClass = '';
            
            switch(statusDestino) {
                case 'started':
                    statusLabel = '✅ Ativo';
                    statusClass = 'text-success';
                    countStarted++;
                    break;
                case 'candidate':
                    statusLabel = '📌 Candidato';
                    statusClass = 'text-primary';
                    countCandidate++;
                    break;
                case 'pending':
                    statusLabel = '⏳ Programado';
                    statusClass = 'text-warning';
                    countPending++;
                    break;
                default:
                    statusLabel = `❓ ${statusDestino}`;
                    statusClass = 'text-muted';
                    countDesconhecido++;
                    break;
            }
            
            // ============================================================
            // BUSCAR PREÇO DO DESTINO - SEMPRE USAR A FUNÇÃO DETALHADA
            // ============================================================
            let precoDestino = 0;
            let precoOriginalDestino = 0;
            let percentDestino = 0;
            
            try {
                const precoDetalhado = await buscarPrecoNaPromocaoDestino(mlb, destinoId, tokenData.access_token);
                if (precoDetalhado && precoDetalhado.price > 0) {
                    precoDestino = precoDetalhado.price;
                    precoOriginalDestino = precoDetalhado.original_price || 0;
                    percentDestino = precoDetalhado.seller_percentage || 0;
                    
                    // LOG ESPECÍFICO PARA DEBUG - MLB1950680845
                    if (mlb === 'MLB1950680845') {
                        log(`🎯 MLB1950680845 - Preço Destino: R$ ${precoDestino.toFixed(2)}`, 'success');
                        log(`🎯 MLB1950680845 - Dados completos:`, 'debug', precoDetalhado);
                    }
                } else {
                    // Fallback: usar o preço da lista
                    precoDestino = dadosDestino.price || 0;
                    precoOriginalDestino = dadosDestino.original_price || 0;
                    percentDestino = dadosDestino.seller_percentage || 0;
                    
                    // Se ainda for 0, tentar usar original com desconto padrão
                    if (precoDestino === 0 && precoOriginalDestino > 0) {
                        precoDestino = precoOriginalDestino * 0.9;
                    }
                }
            } catch (err) {
                log(`⚠️ Erro ao buscar preço detalhado para ${mlb}: ${err.message}`, 'warning');
                // Fallback
                precoDestino = dadosDestino.price || 0;
                precoOriginalDestino = dadosDestino.original_price || 0;
                percentDestino = dadosDestino.seller_percentage || 0;
            }
            
            const item = {
                mlb: mlb,
                precoOrigem: dadosOrigem.price || 0,
                precoDestino: precoDestino,
                precoOriginalDestino: precoOriginalDestino,
                percentOrigem: dadosOrigem.seller_percentage || 0,
                percentDestino: percentDestino,
                statusOrigem: dadosOrigem.status || 'started',
                statusDestino: statusDestino,
                statusLabel: statusLabel,
                statusClass: statusClass,
                tipo: statusDestino,
                diferenca: precoDestino - (dadosOrigem.price || 0)
            };
            
            // LOG PARA DEBUG - mostra o preço que está sendo usado
            if (mlb === 'MLB5949881892') {
                log(`🔍 DEBUG MLB5949881892:`, 'debug');
                log(`   Preço Origem: R$ ${dadosOrigem.price}`, 'debug');
                log(`   Preço Destino (da lista): R$ ${dadosDestino.price}`, 'debug');
                log(`   Preço Destino (detalhado): R$ ${precoDestino}`, 'debug');
                log(`   Preço Original Destino: R$ ${precoOriginalDestino}`, 'debug');
                log(`   Status Destino: ${statusDestino}`, 'debug');
            }
            
            interseccaoBruta.push(item);
        }
        
        // ============================================================
        // PASSO 4: APLICAR REGRA DE FILTRO
        // ============================================================
        atualizarProgresso(92, 'Aplicando regra de filtro...', nomeRegra, '92%');
        
        const interseccaoFiltrada = interseccaoBruta.filter(item => {
            return aplicarRegraFiltro(item, regra);
        });
        
        log(`📊 Antes do filtro: ${interseccaoBruta.length} itens`, 'info');
        log(`📊 Depois do filtro (${nomeRegra}): ${interseccaoFiltrada.length} itens`, 'info');
        
        // ============================================================
        // PASSO 5: Mostrar resultado
        // ============================================================
        log('═══════════════════════════════════════════════════════════', 'info');
        log('📊 RESULTADO DA ANÁLISE:', 'info');
        log(`   📦 Ativos na ORIGEM: ${ativosOrigem.length}`, 'info');
        log(`   📦 Total no DESTINO: ${mapDestino.size}`, 'info');
        log(`   📦 Ativos (started): ${itensStarted.length}`, 'info');
        log(`   📦 Candidatos (candidate): ${itensCandidate.length}`, 'info');
        log(`   📦 Programados (pending): ${itensPending.length}`, 'info');
        log(`   🔄 INTERSEÇÃO TOTAL: ${interseccaoBruta.length}`, 'info');
        log(`   🎯 APÓS FILTRO (${nomeRegra}): ${interseccaoFiltrada.length}`, 'success');
        log(`   ✅ Ativos na interseção: ${countStarted}`, 'success');
        log(`   📌 Candidatos na interseção: ${countCandidate}`, 'info');
        log(`   ⏳ Programados na interseção: ${countPending}`, 'info');
        log('═══════════════════════════════════════════════════════════', 'info');
        
        atualizarProgresso(100, '✅ Concluído!', `${interseccaoFiltrada.length} MLBs após filtro`, '✅');
        
        // ============================================================
        // PASSO 6: Armazenar os itens filtrados globalmente
        // ============================================================
        itensAnalisados = interseccaoFiltrada;
        log(`📦 ${itensAnalisados.length} itens armazenados para ativação`, 'info');
        
        // Renderizar tabela com os itens filtrados
        renderizarTabelaInterseccao(interseccaoFiltrada);
        
        // Atualizar resumo
        const totalElegiveis = interseccaoFiltrada.filter(i => i.tipo === 'candidate' || i.tipo === 'pending').length;
        const totalAtivos = interseccaoFiltrada.filter(i => i.tipo === 'started').length;
        const totalBloqueados = interseccaoFiltrada.filter(i => i.tipo === 'unknown' || !i.tipo).length;
        
        document.getElementById('bulkTotalItens').textContent = interseccaoFiltrada.length;
        document.getElementById('bulkElegiveis').textContent = totalElegiveis;
        document.getElementById('bulkBloqueados').textContent = totalBloqueados;
        document.getElementById('bulkJaAtivos').textContent = totalAtivos;
        
        document.getElementById('bulkResumo').classList.remove('hidden');
        document.getElementById('bulkTabelaContainer').classList.remove('hidden');
        
        // Atualizar botão de ativação
        const btnAtivar = document.getElementById('btnAtivarMassa');
        if (btnAtivar) {
            const selecionaveis = interseccaoFiltrada.filter(item => 
                item.tipo !== 'started' && !mlbsBloqueados.includes(item.mlb)
            ).length;
            btnAtivar.disabled = selecionaveis === 0;
            btnAtivar.innerHTML = `<i class="fas fa-play"></i> Ativar em Massa (${selecionaveis})`;
        }
        
        setTimeout(fecharBarraProgresso, 1500);
        
        // Mostrar toast com resultado
        if (interseccaoFiltrada.length > 0) {
            const ativos = interseccaoFiltrada.filter(i => i.tipo === 'started').length;
            const candidatos = interseccaoFiltrada.filter(i => i.tipo === 'candidate').length;
            const programados = interseccaoFiltrada.filter(i => i.tipo === 'pending').length;
            showToast(`✅ ${interseccaoFiltrada.length} MLBs (${ativos} ativos, ${candidatos} candidatos, ${programados} programados) - Regra: ${nomeRegra}`, 'success');
        } else {
            showToast(`⚠️ Nenhum MLB encontrado com a regra: ${nomeRegra}`, 'warning');
        }

    } catch (error) {
        log(`❌ Erro: ${error.message}`, 'error');
        console.error(error);
        fecharBarraProgresso();
        showToast('Erro: ' + error.message, 'error');
    }
};

// ============================================================
// FUNÇÃO: RENDERIZAR TABELA DA INTERSEÇÃO - ATUALIZADA
// ============================================================
function renderizarTabelaInterseccao(itens) {
    const tbody = document.getElementById('bulkItensBody');

    if (!tbody) {
        log('❌ bulkItensBody não encontrado', 'error');
        return;
    }

    if (!itens || itens.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="text-center py-4 text-muted">
                    Nenhum MLB encontrado com a regra selecionada
                </td>
            </tr>
        `;

        atualizarBotaoAtivacao();
        return;
    }

    tbody.innerHTML = '';

    itens.forEach((item, index) => {
        const tr = document.createElement('tr');

        let bgColor = '#ffffff';
        let statusColor = '#6c757d';
        let statusText = item.statusLabel || 'Desconhecido';

        switch (item.tipo) {
            case 'started':
                bgColor = '#d4edda';
                statusColor = '#155724';
                break;

            case 'pending':
                bgColor = '#fff3cd';
                statusColor = '#856404';
                break;

            case 'candidate':
                bgColor = '#d1ecf1';
                statusColor = '#0c5460';
                break;

            default:
                bgColor = '#f8d7da';
                statusColor = '#721c24';
                break;
        }

        tr.style.backgroundColor = bgColor;

        const isBloqueado =
            mlbsBloqueados.includes(item.mlb);

        if (isBloqueado) {
            tr.style.opacity = '0.6';
        }

        // IMPORTANTE:
        // somente CANDIDATE deve ser enviado para ativação.
        //
        // started = já ativo
        // pending = já programado
        // candidate = pode ser aceito/ativado
        const podeSelecionar =
            !isBloqueado &&
            item.tipo === 'candidate';

        const precoOrigem =
            Number(item.precoOrigem) || 0;

        const precoDestino =
            Number(item.precoDestino) || 0;

        const diferenca =
            precoDestino - precoOrigem;

        const diffColor =
            diferenca > 0
                ? '#28a745'
                : diferenca < 0
                    ? '#dc3545'
                    : '#6c757d';

        const diffLabel =
            diferenca > 0
                ? `+R$ ${diferenca.toFixed(2)}`
                : diferenca < 0
                    ? `-R$ ${Math.abs(diferenca).toFixed(2)}`
                    : 'R$ 0,00';

        let complementoStatus = '';

        if (item.tipo === 'started') {
            complementoStatus =
                '<br><small style="color:#28a745;">✅ Já ativo</small>';
        }

        if (item.tipo === 'candidate') {
            complementoStatus =
                '<br><small style="color:#0c5460;">📌 Pode ativar</small>';
        }

        if (item.tipo === 'pending') {
            complementoStatus =
                '<br><small style="color:#856404;">⏳ Já programado</small>';
        }

        tr.innerHTML = `
            <td style="text-align:center;">
                <input
                    type="checkbox"
                    class="bulk-item-checkbox"
                    data-index="${index}"
                    data-mlb="${item.mlb || ''}"
                    ${podeSelecionar ? 'checked' : 'disabled'}
                    ${!podeSelecionar ? 'style="opacity:0.5;"' : ''}
                    onchange="atualizarBotaoAtivacao()"
                >

                ${
                    isBloqueado
                        ? '<i class="fas fa-ban text-danger" title="MLB bloqueado"></i>'
                        : ''
                }
            </td>

            <td>
                <strong>${item.mlb || 'N/A'}</strong>
            </td>

            <td style="text-align:right; font-weight:600; color:#007bff;">
                R$ ${precoOrigem.toFixed(2)}
            </td>

            <td style="text-align:center;">
                ${Number(item.percentOrigem) || 0}%
            </td>

            <td style="text-align:right; font-weight:600; color:#28a745;">
                R$ ${precoDestino.toFixed(2)}
            </td>

            <td style="text-align:center;">
                ${Number(item.percentDestino) || 0}%
            </td>

            <td
                style="
                    text-align:center;
                    font-size:12px;
                    font-weight:600;
                    color:${diffColor};
                "
            >
                ${diffLabel}
            </td>

            <td
                style="
                    text-align:center;
                    font-size:12px;
                    font-weight:600;
                    color:${statusColor};
                "
            >
                ${statusText}
                ${complementoStatus}
            </td>
        `;

        tbody.appendChild(tr);
    });

    // Marcar automaticamente somente os candidates habilitados
    document
        .querySelectorAll(
            '.bulk-item-checkbox:not(:disabled)'
        )
        .forEach(cb => {
            cb.checked = true;
        });

    atualizarBotaoAtivacao();
}

// ============================================================
// FUNÇÃO: BUSCAR TODOS OS ITENS DA PROMOÇÃO (COM CORREÇÃO DE PREÇO)
// ============================================================
async function buscarTodosItensPromocao(promotionId, promotionType, token) {
    log(`🔄 Buscando TODOS os itens da promoção ${promotionId}...`, 'info');
    const itens = [];
    let searchAfter = null;
    let hasMore = true;
    let pagina = 1;
    
    while (hasMore) {
        try {
            let url = `https://api.mercadolibre.com/seller-promotions/promotions/${promotionId}/items`;
            let params = {
                promotion_type: promotionType,
                app_version: 'v2',
                limit: 50
            };
            
            if (searchAfter) {
                params.search_after = searchAfter;
            }
            
            const queryString = Object.keys(params)
                .map(key => `${key}=${encodeURIComponent(params[key])}`)
                .join('&');
            const fullUrl = `${url}?${queryString}`;
            
            const proxyUrl = `${window.WORKER_URL || 'https://purple-bonus-3b1c.andmiotto1998.workers.dev'}/api/ml/proxy?url=${encodeURIComponent(fullUrl)}&token=${token}`;
            
            const response = await fetch(proxyUrl);
            
            if (response.ok) {
                const data = await response.json();
                const results = data.results || [];
                
                for (const item of results) {
                    const itemId = item.id || item.item_id;
                    if (itemId) {
                        // CORREÇÃO: Verificar se o preço está em centavos
                        let price = item.price || 0;
                        let originalPrice = item.original_price || 0;
                        
                        // Se o preço for > 1000, provavelmente está em centavos
                        if (price > 1000) price = price / 100;
                        if (originalPrice > 1000) originalPrice = originalPrice / 100;
                        
                        itens.push({
                        id: itemId,
                        status: item.status,
                        price: price,
                        original_price: originalPrice,
                        seller_percentage: item.seller_percentage,
                        offer_id: item.offer_id || item.id  // 👈 ADICIONE ISSO
                    });
                    }
                }
                
                const paging = data.paging || {};
                if (paging.searchAfter) {
                    searchAfter = paging.searchAfter;
                    pagina++;
                } else {
                    hasMore = false;
                }
            } else {
                hasMore = false;
            }
        } catch (error) {
            log(`❌ Erro: ${error.message}`, 'error');
            hasMore = false;
        }
    }
    
    // Estatísticas por status
    const statusCount = {};
    itens.forEach(item => {
        statusCount[item.status] = (statusCount[item.status] || 0) + 1;
    });
    
    log(`✅ ${itens.length} itens carregados`, 'success');
    log(`📊 Distribuição por status: ${JSON.stringify(statusCount)}`, 'info');
    
    // Mostrar alguns exemplos de preços
    if (itens.length > 0) {
        log(`📝 Exemplos de preços (primeiros 3):`, 'debug');
        itens.slice(0, 3).forEach(item => {
            log(`   ${item.id}: R$ ${item.price.toFixed(2)} (${item.status})`, 'debug');
        });
    }
    
    return itens;
}

async function buscarOfferIdDoItem(itemId, promotionId, token) {
    try {
        const url = `https://api.mercadolibre.com/seller-promotions/items/${itemId}?app_version=v2`;
        const proxyUrl = `${window.WORKER_URL || 'https://purple-bonus-3b1c.andmiotto1998.workers.dev'}/api/ml/proxy?url=${encodeURIComponent(url)}&token=${token}`;
        const response = await fetch(proxyUrl);
        
        if (response.ok) {
            const data = await response.json();
            
            // Procura a promoção específica
            for (const promocao of data) {
                if (promocao.id === promotionId) {
                    // Retorna o offer_id da promoção
                    return promocao.offer_id || null;
                }
            }
            
            // Se não encontrou a promoção específica, procura por tipo DEAL
            for (const promocao of data) {
                if (promocao.type === 'DEAL' || promocao.type === 'MARKETPLACE_CAMPAIGN') {
                    return promocao.offer_id || null;
                }
            }
        }
        return null;
    } catch (error) {
        log(`❌ Erro ao buscar offer_id para ${itemId}: ${error.message}`, 'warning');
        return null;
    }
}

// ============================================================
// FUNÇÃO: BUSCAR ITENS DA PROMOÇÃO (SEM DIVISÃO POR 100)
// ============================================================
async function buscarItensPromocaoComPrecos(promotionId, promotionType, token) {
    log(`🔄 Buscando itens da promoção ${promotionId} (${promotionType})...`, 'info');
    const itens = [];
    let searchAfter = null;
    let hasMore = true;
    let pagina = 1;
    
    while (hasMore) {
        try {
            let url = `https://api.mercadolibre.com/seller-promotions/promotions/${promotionId}/items`;
            let params = {
                promotion_type: promotionType,
                app_version: 'v2',
                limit: 50
            };
            
            if (searchAfter) {
                params.search_after = searchAfter;
            }
            
            const queryString = Object.keys(params)
                .map(key => `${key}=${encodeURIComponent(params[key])}`)
                .join('&');
            const fullUrl = `${url}?${queryString}`;
            
            const proxyUrl = `${window.WORKER_URL || 'https://purple-bonus-3b1c.andmiotto1998.workers.dev'}/api/ml/proxy?url=${encodeURIComponent(fullUrl)}&token=${token}`;
            
            const response = await fetch(proxyUrl);
            
            if (response.ok) {
                const data = await response.json();
                const results = data.results || [];
                
                for (const item of results) {
                    const itemId = item.id || item.item_id;
                    if (itemId) {
                        itens.push({
                            id: itemId,
                            status: item.status || 'unknown',
                            price: item.price || 0,                    // JÁ EM REAIS
                            original_price: item.original_price || 0,
                            seller_percentage: item.seller_percentage || 0,
                            meli_percentage: item.meli_percentage || 0
                        });
                    }
                }
                
                const paging = data.paging || {};
                if (paging.searchAfter) {
                    searchAfter = paging.searchAfter;
                    pagina++;
                } else {
                    hasMore = false;
                }
            } else {
                hasMore = false;
            }
        } catch (error) {
            log(`❌ Erro: ${error.message}`, 'error');
            hasMore = false;
        }
    }
    
    log(`✅ ${itens.length} itens carregados`, 'success');
    return itens;
}

// ============================================================
// FUNÇÃO: BUSCAR PROMOÇÕES DO ITEM (API CORRETA)
// ============================================================
async function buscarPromocoesDoItem(itemId, token) {
    try {
        const url = `https://api.mercadolibre.com/seller-promotions/items/${itemId}?app_version=v2`;
        const proxyUrl = `${window.WORKER_URL || 'https://purple-bonus-3b1c.andmiotto1998.workers.dev'}/api/ml/proxy?url=${encodeURIComponent(url)}&token=${token}`;
        const response = await fetch(proxyUrl);
        
        if (response.ok) {
            return await response.json();
        }
        return null;
    } catch (error) {
        log(`❌ Erro ao buscar promoções do item ${itemId}: ${error.message}`, 'warning');
        return null;
    }
}

// ============================================================
// FUNÇÃO: BUSCAR ITENS DA PROMOÇÃO POR STATUS (MÚLTIPLOS)
// ============================================================
async function buscarItensPromocaoPorMultiplosStatus(promotionId, promotionType, statusList, token) {
    log(`🔄 Buscando itens com status [${statusList.join(', ')}] da promoção ${promotionId}...`, 'info');
    const todosItens = [];
    const itensMap = new Map();
    
    for (const status of statusList) {
        const itens = await buscarItensPromocaoPorStatus(promotionId, promotionType, status, token);
        for (const item of itens) {
            // Se o item já existe, manter o status mais relevante (started > pending > candidate)
            if (!itensMap.has(item.id)) {
                itensMap.set(item.id, item);
            } else {
                const existing = itensMap.get(item.id);
                // Prioridade: started > pending > candidate
                const priority = { 'started': 3, 'pending': 2, 'candidate': 1 };
                if (priority[item.status] > priority[existing.status]) {
                    itensMap.set(item.id, item);
                }
            }
        }
    }
    
    const resultado = Array.from(itensMap.values());
    log(`✅ ${resultado.length} itens únicos com status [${statusList.join(', ')}]`, 'success');
    return resultado;
}

async function buscarItensPromocaoPorStatus(promotionId, promotionType, status, token) {
    log(`🔄 Buscando itens com status "${status}" da promoção ${promotionId}...`, 'info');
    const itens = [];
    let searchAfter = null;
    let hasMore = true;
    
    while (hasMore) {
        try {
            let url = `https://api.mercadolibre.com/seller-promotions/promotions/${promotionId}/items`;
            let params = {
                promotion_type: promotionType,
                app_version: 'v2',
                limit: 50
            };
            
            if (status !== 'todos') {
                params.status = status;
            }
            
            if (searchAfter) {
                params.search_after = searchAfter;
            }
            
            const queryString = Object.keys(params)
                .map(key => `${key}=${encodeURIComponent(params[key])}`)
                .join('&');
            const fullUrl = `${url}?${queryString}`;
            
            const proxyUrl = `${window.WORKER_URL || 'https://purple-bonus-3b1c.andmiotto1998.workers.dev'}/api/ml/proxy?url=${encodeURIComponent(fullUrl)}&token=${token}`;
            
            const response = await fetch(proxyUrl);
            
            if (response.ok) {
                const data = await response.json();
                const results = data.results || [];
                
                for (const item of results) {
                    const itemId = item.id || item.item_id;
                    if (itemId) {
                        itens.push({
                            id: itemId,
                            status: item.status || 'unknown',
                            price: item.price || 0,
                            original_price: item.original_price || 0,
                            seller_percentage: item.seller_percentage || 0,
                            offer_id: item.offer_id || null  // 👈 ADICIONAR ESTA LINHA
                        });
                    }
                }
                
                const paging = data.paging || {};
                if (paging.searchAfter) {
                    searchAfter = paging.searchAfter;
                } else {
                    hasMore = false;
                }
            } else {
                if (status !== 'todos') {
                    log(`⚠️ Falha com status "${status}", tentando sem filtro...`, 'warning');
                    return await buscarItensPromocaoPorStatus(promotionId, promotionType, 'todos', token);
                }
                hasMore = false;
            }
        } catch (error) {
            log(`❌ Erro: ${error.message}`, 'error');
            hasMore = false;
        }
    }
    
    log(`✅ ${itens.length} itens com status "${status}"`, 'success');
    return itens;
}


// ============================================================
// FUNÇÃO: CONSULTAR DETALHES DA PROMOÇÃO
// ============================================================
async function buscarDetalhesPromocao(promotionId, promotionType, token) {
    try {
        const url = `https://api.mercadolibre.com/seller-promotions/promotions/${promotionId}?promotion_type=${promotionType}&app_version=v2`;
        const proxyUrl = `${window.WORKER_URL || 'https://purple-bonus-3b1c.andmiotto1998.workers.dev'}/api/ml/proxy?url=${encodeURIComponent(url)}&token=${token}`;
        const response = await fetch(proxyUrl);
        
        if (response.ok) {
            return await response.json();
        }
        return null;
    } catch (error) {
        log(`❌ Erro ao buscar detalhes da promoção: ${error.message}`, 'error');
        return null;
    }
}

// ============================================================
// FUNÇÃO: ATIVAR ITEM EM UMA PROMOÇÃO - ATUALIZADA
// ============================================================
async function ativarItemPromocao(
    itemId,
    promotionId,
    promotionType,
    dealPrice,
    token
) {
    try {
        if (!itemId) {
            return {
                success: false,
                error: 'Item ID não informado'
            };
        }

        if (!promotionId) {
            return {
                success: false,
                error: 'Promotion ID não informado'
            };
        }

        if (!promotionType) {
            return {
                success: false,
                error: 'Promotion Type não informado'
            };
        }

        if (!token) {
            return {
                success: false,
                error: 'Token não informado'
            };
        }

        // Endpoint correto para incluir/aceitar o item na promoção
        const url =
            `https://api.mercadolibre.com/seller-promotions/items/${itemId}?app_version=v2`;

        const body = {
            promotion_id: promotionId,
            promotion_type: promotionType
        };

        // Algumas promoções exigem deal_price.
        // IMPORTANTE: NÃO multiplicar por 100.
        const precoNumerico = Number(dealPrice);

        if (Number.isFinite(precoNumerico) && precoNumerico > 0) {
            body.deal_price = Number(precoNumerico.toFixed(2));
        }

        const worker =
            window.WORKER_URL ||
            'https://purple-bonus-3b1c.andmiotto1998.workers.dev';

        const proxyUrl =
            `${worker}/api/ml/proxy?url=${encodeURIComponent(url)}&token=${encodeURIComponent(token)}`;

        log(`🚀 Ativando ${itemId} na promoção ${promotionId}`, 'info');
        log(`   Tipo: ${promotionType}`, 'debug');
        log(
            `   Deal price: ${
                body.deal_price !== undefined
                    ? `R$ ${body.deal_price.toFixed(2)}`
                    : 'não informado'
            }`,
            'debug'
        );
        log(`   Body: ${JSON.stringify(body)}`, 'debug');

        const response = await fetch(proxyUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        const responseText = await response.text();

        let responseData = null;

        if (responseText) {
            try {
                responseData = JSON.parse(responseText);
            } catch {
                responseData = responseText;
            }
        }

        log(
            `📥 ${itemId} → HTTP ${response.status}: ${responseText || 'sem conteúdo'}`,
            response.ok ? 'success' : 'warning'
        );

        if (response.ok) {
            return {
                success: true,
                status: response.status,
                data: responseData
            };
        }

        let mensagemErro = responseText || `HTTP ${response.status}`;

        if (
            responseData &&
            typeof responseData === 'object'
        ) {
            mensagemErro =
                responseData.message ||
                responseData.error ||
                responseData.cause?.[0]?.message ||
                responseText ||
                `HTTP ${response.status}`;
        }

        return {
            success: false,
            status: response.status,
            error: mensagemErro,
            data: responseData
        };

    } catch (error) {
        log(
            `❌ Erro ao ativar ${itemId}: ${error.message}`,
            'error'
        );

        return {
            success: false,
            error: error.message
        };
    }
}

async function excluirItemPromocao(
    itemId,
    promotionId,
    promotionType,
    token,
    offerId = null
) {
    try {
        const worker =
            window.WORKER_URL ||
            'https://purple-bonus-3b1c.andmiotto1998.workers.dev';

        const parametros = new URLSearchParams({
            app_version: 'v2',
            promotion_id: String(promotionId),
            promotion_type: String(promotionType)
        });

        const url =
            `https://api.mercadolibre.com/seller-promotions/items/` +
            `${encodeURIComponent(itemId)}?${parametros.toString()}`;

        const proxyUrl =
            `${worker}/api/ml/proxy?url=${encodeURIComponent(url)}` +
            `&token=${encodeURIComponent(token)}`;

        const response = await fetch(proxyUrl, {
            method: 'DELETE',
            cache: 'no-store'
        });

        const responseText = await response.text();

        let responseData = null;

        if (responseText) {
            try {
                responseData = JSON.parse(responseText);
            } catch {
                responseData = responseText;
            }
        }

        log(
            `📥 Desativação ${itemId} / ${promotionId} → ` +
            `HTTP ${response.status}: ` +
            `${responseText || 'sem conteúdo'}`,
            response.ok ? 'success' : 'warning'
        );

        if (response.ok) {
            return {
                success: true,
                status: response.status,
                data: responseData,
                endpoint: 'item'
            };
        }

        /*
         * Compatibilidade com ofertas antigas.
         *
         * O endpoint principal é /items/{item_id}.
         * O endpoint /offers/{offer_id} é usado somente como
         * alternativa quando existe um offer_id.
         */
        if (offerId) {
            const fallbackUrl =
                `https://api.mercadolibre.com/` +
                `seller-promotions/offers/` +
                `${encodeURIComponent(offerId)}?app_version=v2`;

            const fallbackProxyUrl =
                `${worker}/api/ml/proxy?` +
                `url=${encodeURIComponent(fallbackUrl)}` +
                `&token=${encodeURIComponent(token)}`;

            const fallbackResponse = await fetch(
                fallbackProxyUrl,
                {
                    method: 'DELETE',
                    cache: 'no-store'
                }
            );

            const fallbackText =
                await fallbackResponse.text();

            log(
                `📥 Fallback offer ${offerId} → ` +
                `HTTP ${fallbackResponse.status}: ` +
                `${fallbackText || 'sem conteúdo'}`,
                fallbackResponse.ok
                    ? 'success'
                    : 'warning'
            );

            if (fallbackResponse.ok) {
                return {
                    success: true,
                    status: fallbackResponse.status,
                    data: fallbackText,
                    endpoint: 'offer'
                };
            }

            return {
                success: false,
                status: fallbackResponse.status,
                error:
                    fallbackText ||
                    responseText ||
                    'Mercado Livre recusou a desativação'
            };
        }

        return {
            success: false,
            status: response.status,
            error:
                responseData?.message ||
                responseData?.error ||
                responseText ||
                `Erro HTTP ${response.status} ao desativar`
        };
    } catch (error) {
        return {
            success: false,
            error:
                error.message ||
                'Erro desconhecido ao desativar a promoção'
        };
    }
}

// ============================================================
// FUNÇÃO: CONSULTAR ITENS CANDIDATOS
// ============================================================
async function buscarCandidatosPromocao(candidateId, token) {
    try {
        const url = `https://api.mercadolibre.com/seller-promotions/candidates/${candidateId}?app_version=v2`;
        const proxyUrl = `${window.WORKER_URL || 'https://purple-bonus-3b1c.andmiotto1998.workers.dev'}/api/ml/proxy?url=${encodeURIComponent(url)}&token=${token}`;
        const response = await fetch(proxyUrl);
        
        if (response.ok) {
            return await response.json();
        }
        return null;
    } catch (error) {
        log(`❌ Erro ao buscar candidato: ${error.message}`, 'error');
        return null;
    }
}

// ============================================================
// FUNÇÃO: BUSCAR PREÇO NA PROMOÇÃO DESTINO (COM LOGS DETALHADOS)
// ============================================================
async function buscarPrecoNaPromocaoDestino(itemId, promotionId, token) {
    log(`🔍 Buscando preço para ${itemId} na promoção ${promotionId}`, 'info');
    
    try {
        // Buscar todas as promoções do item
        const url = `https://api.mercadolibre.com/seller-promotions/items/${itemId}?app_version=v2`;
        const proxyUrl = `${window.WORKER_URL || 'https://purple-bonus-3b1c.andmiotto1998.workers.dev'}/api/ml/proxy?url=${encodeURIComponent(url)}&token=${token}`;
        const response = await fetch(proxyUrl);
        
        if (!response.ok) {
            log(`❌ Erro na API: ${response.status}`, 'error');
            return null;
        }
        
        const data = await response.json();
        log(`📦 Dados recebidos para ${itemId}: ${JSON.stringify(data).length} caracteres`, 'debug');
        
        // ============================================================
        // MÉTODO 1: Procurar a promoção específica pelo ID
        // ============================================================
        let promocao = data.find(p => p.id === promotionId);
        
        if (promocao) {
            log(`✅ Promoção encontrada pelo ID: ${promocao.id}`, 'success');
            log(`   Nome: ${promocao.name || 'Sem nome'}`, 'debug');
            log(`   Status: ${promocao.status}`, 'debug');
            log(`   Price (bruto): ${promocao.price}`, 'debug');
            log(`   Original Price: ${promocao.original_price}`, 'debug');
            log(`   Seller Percentage: ${promocao.seller_percentage}%`, 'debug');
            log(`   Meli Percentage: ${promocao.meli_percentage}%`, 'debug');
            
            // Extrair o preço final
            let precoFinal = 0;
            let precoOriginal = 0;
            let percentual = 0;
            
            // O preço final da promoção é o campo 'price'
            // A API retorna em centavos (ex: 18000 = R$ 180,00)
            const priceValue = promocao.price || 0;
            const originalValue = promocao.original_price || 0;
            
            // Converter de centavos para reais
            precoFinal = priceValue / 100;
            precoOriginal = originalValue / 100;
            percentual = promocao.seller_percentage || 0;
            
            log(`   ✅ Preço Final (convertido): R$ ${precoFinal.toFixed(2)}`, 'success');
            log(`   ✅ Preço Original (convertido): R$ ${precoOriginal.toFixed(2)}`, 'debug');
            
            return {
                price: precoFinal,
                original_price: precoOriginal,
                seller_percentage: percentual,
                status: promocao.status || 'unknown'
            };
        }
        
        // ============================================================
        // MÉTODO 2: Se não encontrou pelo ID, listar todas as promoções disponíveis
        // ============================================================
        log(`⚠️ Promoção ${promotionId} não encontrada pelo ID`, 'warning');
        log(`📋 Promoções disponíveis para ${itemId}:`, 'info');
        
        data.forEach((p, index) => {
            log(`   ${index + 1}. ID: ${p.id} | Nome: ${p.name || 'Sem nome'} | Status: ${p.status} | Price: ${p.price}`, 'debug');
        });
        
        // ============================================================
        // MÉTODO 3: Procurar pela promoção de destino (DEAL ou MARKETPLACE_CAMPAIGN)
        // ============================================================
        log(`🔍 Procurando promoção do tipo DEAL ou MARKETPLACE_CAMPAIGN...`, 'info');
        
        // Primeiro, tentar encontrar pelo nome (mais confiável)
        const promocoesDeal = data.filter(p => 
            p.type === 'DEAL' || 
            p.type === 'MARKETPLACE_CAMPAIGN' ||
            p.name?.includes('Dia dos Pais') ||
            p.name?.includes('8.8') ||
            p.name?.includes('8,8')
        );
        
        if (promocoesDeal.length > 0) {
            // Pegar a primeira promoção DEAL encontrada
            const pDeal = promocoesDeal[0];
            log(`✅ Promoção DEAL encontrada: ${pDeal.name} (${pDeal.id})`, 'success');
            log(`   Status: ${pDeal.status}`, 'debug');
            log(`   Price: ${pDeal.price}`, 'debug');
            
            let precoFinal = pDeal.price || 0;
            let precoOriginal = pDeal.original_price || 0;
            let percentual = pDeal.seller_percentage || 0;
            
            // Converter de centavos para reais
            precoFinal = precoFinal / 100;
            precoOriginal = precoOriginal / 100;
            
            log(`   ✅ Preço Final (DEAL): R$ ${precoFinal.toFixed(2)}`, 'success');
            
            return {
                price: precoFinal,
                original_price: precoOriginal,
                seller_percentage: percentual,
                status: pDeal.status || 'unknown'
            };
        }
        
        // ============================================================
        // MÉTODO 4: Procurar qualquer promoção com status 'started' ou 'candidate'
        // ============================================================
        log(`🔍 Procurando qualquer promoção ativa...`, 'info');
        
        const promocoesAtivas = data.filter(p => 
            p.status === 'started' || 
            p.status === 'candidate' || 
            p.status === 'pending'
        );
        
        if (promocoesAtivas.length > 0) {
            // Pegar a primeira promoção ativa
            const pAtiva = promocoesAtivas[0];
            log(`✅ Promoção ativa encontrada: ${pAtiva.name} (${pAtiva.id})`, 'success');
            log(`   Status: ${pAtiva.status}`, 'debug');
            log(`   Price: ${pAtiva.price}`, 'debug');
            
            let precoFinal = pAtiva.price || 0;
            let precoOriginal = pAtiva.original_price || 0;
            let percentual = pAtiva.seller_percentage || 0;
            
            // Converter de centavos para reais
            precoFinal = precoFinal / 100;
            precoOriginal = precoOriginal / 100;
            
            log(`   ✅ Preço Final (ativa): R$ ${precoFinal.toFixed(2)}`, 'success');
            
            return {
                price: precoFinal,
                original_price: precoOriginal,
                seller_percentage: percentual,
                status: pAtiva.status || 'unknown'
            };
        }
        
        // ============================================================
        // MÉTODO 5: Fallback - usar o preço do item
        // ============================================================
        log(`⚠️ Nenhuma promoção encontrada, usando fallback`, 'warning');
        const urlItem = `https://api.mercadolibre.com/items/${itemId}`;
        const proxyUrlItem = `${window.WORKER_URL || 'https://purple-bonus-3b1c.andmiotto1998.workers.dev'}/api/ml/proxy?url=${encodeURIComponent(urlItem)}&token=${token}`;
        const responseItem = await fetch(proxyUrlItem);
        
        if (responseItem.ok) {
            const dataItem = await responseItem.json();
            log(`📦 Preço do item: R$ ${dataItem.price}`, 'debug');
            return {
                price: dataItem.price || 0,
                original_price: dataItem.original_price || 0,
                seller_percentage: 0,
                status: 'fallback'
            };
        }
        
        return null;
        
    } catch (error) {
        log(`❌ Erro ao buscar preço do item ${itemId}: ${error.message}`, 'error');
        console.error(error);
        return null;
    }
}

// ============================================================
// FUNÇÃO: BUSCAR PREÇO DO ITEM NA PROMOÇÃO DESTINO
// ============================================================
async function buscarPrecoItemNaPromocao(itemId, promotionId, token) {
    try {
        const url = `https://api.mercadolibre.com/seller-promotions/items/${itemId}?app_version=v2`;
        const proxyUrl = `${window.WORKER_URL || 'https://purple-bonus-3b1c.andmiotto1998.workers.dev'}/api/ml/proxy?url=${encodeURIComponent(url)}&token=${token}`;
        const response = await fetch(proxyUrl);
        
        if (response.ok) {
            const data = await response.json();
            
            // Procurar a promoção específica pelo ID
            const promocao = data.find(p => p.id === promotionId);
            
            if (promocao) {
                // Se o status é 'started', usa o price
                if (promocao.status === 'started') {
                    return {
                        price: promocao.price || 0,
                        original_price: promocao.original_price || 0,
                        seller_percentage: promocao.seller_percentage || 0,
                        status: promocao.status || 'started'
                    };
                }
                
                // Se o status é 'candidate' ou 'pending', usa o suggested_discounted_price
                // ou min_discounted_price para saber qual será o preço
                if (promocao.status === 'candidate' || promocao.status === 'pending') {
                    // Prioridade: suggested_discounted_price > min_discounted_price > price
                    let precoSugerido = promocao.suggested_discounted_price || 
                                        promocao.min_discounted_price || 
                                        promocao.price || 0;
                    
                    // Se ainda for 0, tenta usar o preço original com desconto sugerido
                    if (precoSugerido === 0 && promocao.original_price > 0) {
                        // Usar o desconto sugerido pela promoção
                        precoSugerido = promocao.original_price * 0.9; // Exemplo: 10% de desconto
                    }
                    
                    return {
                        price: precoSugerido,
                        original_price: promocao.original_price || 0,
                        seller_percentage: promocao.seller_percentage || 0,
                        status: promocao.status || 'candidate'
                    };
                }
                
                // Qualquer outro status, retorna o price
                return {
                    price: promocao.price || 0,
                    original_price: promocao.original_price || 0,
                    seller_percentage: promocao.seller_percentage || 0,
                    status: promocao.status || 'unknown'
                };
            }
            
            // Se não encontrou a promoção específica, procurar por tipo
            // Algumas promoções podem não ter ID na resposta
            for (const p of data) {
                if (p.type === 'DEAL' || p.type === 'MARKETPLACE_CAMPAIGN' || p.type === 'PRICE_DISCOUNT') {
                    if (p.status === 'candidate' || p.status === 'pending') {
                        let precoSugerido = p.suggested_discounted_price || 
                                            p.min_discounted_price || 
                                            p.price || 0;
                        
                        return {
                            price: precoSugerido,
                            original_price: p.original_price || 0,
                            seller_percentage: p.seller_percentage || 0,
                            status: p.status || 'candidate'
                        };
                    }
                }
            }
            
            return null;
        }
        return null;
    } catch (error) {
        log(`❌ Erro ao buscar preço do item ${itemId}: ${error.message}`, 'warning');
        return null;
    }
}

    // ============================================================
    // FUNÇÃO: BUSCAR PREÇO DE VENDA ATUAL
    // ============================================================
    async function buscarPrecoVendaItem(itemId, token) {
        try {
            const url = `https://api.mercadolibre.com/items/${itemId}/sale_price?context=channel_marketplace`;
            const proxyUrl = `${window.WORKER_URL || 'https://purple-bonus-3b1c.andmiotto1998.workers.dev'}/api/ml/proxy?url=${encodeURIComponent(url)}&token=${token}`;
            const response = await fetch(proxyUrl);
            if (response.ok) {
                return await response.json();
            }
            return null;
        } catch (error) {
            // log apenas em debug para não poluir
            return null;
        }
    }

    // ============================================================
// FUNÇÃO: RENDERIZAR TABELA (SEM DIVISÃO)
// ============================================================
function renderizarTabelaAnalise(itens) {
    log(`Renderizando tabela com ${itens.length} itens...`, 'debug');
    const tbody = document.getElementById('bulkItensBody');
    if (!tbody) {
        log('❌ tbody não encontrado!', 'error');
        return;
    }
    
    if (!itens || itens.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-muted">Nenhum item para exibir</td></tr>`;
        log('Nenhum item para renderizar', 'warning');
        return;
    }
    
    tbody.innerHTML = '';
    let elegiveisCount = 0;
    
    itens.forEach((item, index) => {
        const tr = document.createElement('tr');
        
        const elegivel = item.elegivel === true;
        const podeSelecionar = elegivel;
        if (elegivel) elegiveisCount++;
        
        // Cor de fundo
        let bgColor = '#ffffff';
        if (item.motivo && item.motivo.includes('Bloqueado')) bgColor = '#f8d7da';
        else if (elegivel) bgColor = '#d4edda';
        else if (item.jaAtivo) bgColor = '#d1ecf1';
        else bgColor = '#fff3cd';
        
        tr.style.backgroundColor = bgColor;
        
        // PREÇOS JÁ EM REAIS (não dividir por 100)
        const precoOrigem = item.precoOrigem || 0;
        const precoDestino = item.precoDestino !== null ? item.precoDestino : '-';
        const percentOrigem = item.percentOrigem || 0;
        const percentDestino = item.percentDestino !== null ? `${item.percentDestino}%` : '-';
        
        tr.innerHTML = `
            <td style="text-align:center;">
                <input type="checkbox" class="bulk-item-checkbox" data-index="${index}" 
                    ${podeSelecionar ? 'checked' : 'disabled'} 
                    ${!podeSelecionar ? 'style="opacity:0.5;"' : ''}>
            </td>
            <td><strong>${item.mlb || 'N/A'}</strong></td>
            <td style="text-align:right; font-weight:600; color:#007bff;">
                R$ ${precoOrigem.toFixed(2)}
                ${item.precoOriginalOrigem ? `<br><small style="color:#6c757d; font-weight:400;">Original: R$ ${item.precoOriginalOrigem.toFixed(2)}</small>` : ''}
            </td>
            <td style="text-align:center;">${percentOrigem}%</td>
            <td style="text-align:right; font-weight:600; ${elegivel ? 'color:#28a745;' : 'color:#6c757d;'}">
                ${precoDestino !== '-' ? `R$ ${precoDestino.toFixed(2)}` : '-'}
                ${item.precoOriginalDestino ? `<br><small style="color:#6c757d; font-weight:400;">Original: R$ ${item.precoOriginalDestino.toFixed(2)}</small>` : ''}
            </td>
            <td style="text-align:center;">${percentDestino}</td>
            <td style="text-align:center; font-size:12px; font-weight:600;">
                <span class="${elegivel ? 'text-success' : item.jaAtivo ? 'text-info' : 'text-danger'}">
                    ${item.motivo || ''}
                </span>
            </td>
        `;
        
        tbody.appendChild(tr);
    });
    
    log(`✅ Tabela renderizada: ${itens.length} itens, ${elegiveisCount} elegíveis`, 'success');
    atualizarBotaoAtivacao();
}

// ============================================================
// FUNÇÃO: ATUALIZAR BOTÃO DE ATIVAÇÃO
// ============================================================
function atualizarBotaoAtivacao() {
    const btnAtivar = document.getElementById('btnAtivarMassa');
    if (!btnAtivar) return;
    
    // Contar apenas checkboxes habilitados e marcados
    const checkboxes = document.querySelectorAll('.bulk-item-checkbox:checked:not(:disabled)');
    const selecionados = checkboxes.length;
    
    // Também verificar se há itens analisados
    const totalItens = itensAnalisados ? itensAnalisados.length : 0;
    
    log(`🔍 Atualizando botão: ${selecionados} selecionados de ${totalItens}`, 'debug');
    
    if (selecionados > 0) {
        btnAtivar.disabled = false;
        btnAtivar.innerHTML = `<i class="fas fa-play"></i> Ativar em Massa (${selecionados})`;
        btnAtivar.title = `Ativar ${selecionados} itens selecionados`;
    } else {
        btnAtivar.disabled = true;
        btnAtivar.innerHTML = `<i class="fas fa-play"></i> Ativar em Massa (0)`;
        btnAtivar.title = 'Selecione pelo menos um item para ativar';
    }
}

    // ============================================================
    // FUNÇÃO: SELECIONAR TODOS
    // ============================================================
    window.selecionarTodosItens = function() {
        const selectAll = document.getElementById('bulkSelectAll');
        if (!selectAll) return;
        
        const checkboxes = document.querySelectorAll('.bulk-item-checkbox');
        checkboxes.forEach(cb => {
            if (!cb.disabled) {
                cb.checked = selectAll.checked;
            }
        });
        
        atualizarBotaoAtivacao();
    };

// ============================================================
// FUNÇÃO: EXECUTAR ATIVAÇÃO EM MASSA - ATUALIZADA
// ============================================================
window.executarAtivacaoEmMassa = async function() {
    log(
        '🚀 EXECUTANDO ATIVAÇÃO EM MASSA',
        'info'
    );

    log(
        '═══════════════════════════════════════════════════════════',
        'info'
    );

    // ========================================================
    // 1. OBTER ITENS SELECIONADOS
    // ========================================================
    const checkboxes = document.querySelectorAll(
        '.bulk-item-checkbox:checked:not(:disabled)'
    );

    if (!checkboxes.length) {
        showToast(
            '⚠️ Nenhum item selecionado.',
            'warning'
        );
        return;
    }

    const selecionados = [];

    checkboxes.forEach(cb => {
        const index = Number(cb.dataset.index);

        if (
            Number.isInteger(index) &&
            itensAnalisados &&
            itensAnalisados[index]
        ) {
            const item = itensAnalisados[index];

            const bloqueado =
                mlbsBloqueados.includes(item.mlb);

            // Somente candidate realmente precisa ser ativado.
            if (
                !bloqueado &&
                item.tipo === 'candidate'
            ) {
                selecionados.push(item);
            }
        }
    });

    if (!selecionados.length) {
        showToast(
            '⚠️ Nenhum item candidato selecionado para ativação.',
            'warning'
        );
        return;
    }

    // ========================================================
    // 2. PROMOÇÃO DESTINO
    // ========================================================
    const destinoId =
        document.getElementById(
            'bulkPromocaoDestino'
        )?.value;

    if (!destinoId) {
        showToast(
            '⚠️ Selecione a promoção de destino.',
            'warning'
        );
        return;
    }

    const promocaoDestino =
        todasPromocoes.find(
            promocao =>
                String(promocao.id) ===
                String(destinoId)
        );

    if (!promocaoDestino) {
        showToast(
            '❌ Não foi possível identificar a promoção de destino.',
            'error'
        );

        log(
            `❌ Promoção destino ${destinoId} não encontrada em todasPromocoes`,
            'error'
        );

        return;
    }

    const promotionType =
        promocaoDestino.type;

    if (!promotionType) {
        showToast(
            '❌ Tipo da promoção de destino não identificado.',
            'error'
        );

        return;
    }

    log(
        `🎯 Promoção destino: ${promocaoDestino.name || destinoId}`,
        'info'
    );

    log(
        `🎯 ID: ${destinoId}`,
        'debug'
    );

    log(
        `🎯 Tipo: ${promotionType}`,
        'debug'
    );

    // ========================================================
    // 3. TOKEN
    // ========================================================
    const tokenData =
        await window.getValidToken?.();

    if (!tokenData?.access_token) {
        showToast(
            '❌ Token do Mercado Livre não disponível.',
            'error'
        );
        return;
    }

    const token =
        tokenData.access_token;

    // ========================================================
    // 4. CONFIRMAÇÃO
    // ========================================================
    const confirmar = confirm(
        `Ativar ${selecionados.length} MLB(s) na promoção "${promocaoDestino.name || destinoId}"?`
    );

    if (!confirmar) {
        return;
    }

    // ========================================================
    // 5. INTERFACE / PROGRESSO
    // ========================================================
    const btnAtivar =
        document.getElementById(
            'btnAtivarMassa'
        );

    if (btnAtivar) {
        btnAtivar.disabled = true;
        btnAtivar.innerHTML =
            '<i class="fas fa-spinner fa-spin"></i> Ativando...';
    }

    mostrarBarraProgresso(
        `Ativando ${selecionados.length} itens...`,
        promocaoDestino.name || destinoId
    );

    let sucessos = 0;
    let falhas = 0;

    const falhasLista = [];

    // ========================================================
    // 6. PROCESSAR MLB POR MLB
    // ========================================================
    for (
        let i = 0;
        i < selecionados.length;
        i++
    ) {
        const item =
            selecionados[i];

        const mlb =
            item.mlb;

        const percentual =
            ((i + 1) / selecionados.length) * 100;

        atualizarProgresso(
            percentual,
            `Processando ${i + 1}/${selecionados.length}`,
            `${sucessos} sucessos • ${falhas} falhas`,
            `${Math.round(percentual)}%`
        );

        try {
            if (!mlb) {
                falhas++;

                falhasLista.push(
                    'Item sem MLB'
                );

                continue;
            }

            // O preço que interessa é o preço FINAL da
            // promoção destino obtido durante a análise.
            //
            // NÃO usar o preço normal de /items/{MLB}
            // e NÃO multiplicar por 100.
            let dealPrice =
                Number(item.precoDestino) || 0;

            log(
                `🔄 ${mlb} → promoção ${destinoId}`,
                'info'
            );

            log(
                `   Status atual: ${item.tipo}`,
                'debug'
            );

            log(
                `   Preço destino analisado: ${
                    dealPrice > 0
                        ? `R$ ${dealPrice.toFixed(2)}`
                        : 'não disponível'
                }`,
                'debug'
            );

            const resultado =
                await ativarItemPromocao(
                    mlb,
                    destinoId,
                    promotionType,
                    dealPrice,
                    token
                );

            if (resultado.success) {
                sucessos++;

                log(
                    `✅ ${mlb} ativado na promoção ${destinoId}`,
                    'success'
                );

                // Atualizar localmente para impedir
                // clique duplicado enquanto a análise
                // ainda não foi recarregada.
                item.tipo = 'pending';
                item.statusDestino = 'pending';
                item.statusLabel = '⏳ Programado';

            } else {
                falhas++;

                const erro =
                    resultado.error ||
                    `HTTP ${resultado.status || '?'}`;

                falhasLista.push(
                    `${mlb}: ${erro}`
                );

                log(
                    `❌ ${mlb} não ativado: ${erro}`,
                    'error'
                );
            }

        } catch (error) {
            falhas++;

            falhasLista.push(
                `${mlb}: ${error.message}`
            );

            log(
                `❌ ${mlb}: ${error.message}`,
                'error'
            );
        }
    }

    // ========================================================
    // 7. RESULTADO
    // ========================================================
    log(
        '═══════════════════════════════════════════════════════════',
        'info'
    );

    log(
        `✅ Sucessos: ${sucessos}`,
        'success'
    );

    log(
        `❌ Falhas: ${falhas}`,
        falhas > 0 ? 'warning' : 'info'
    );

    if (falhasLista.length) {
        console.group(
            '📋 Falhas na ativação em massa'
        );

        falhasLista.forEach(erro =>
            console.error(erro)
        );

        console.groupEnd();
    }

    atualizarProgresso(
        100,
        'Processamento concluído',
        `${sucessos} ativados • ${falhas} falhas`,
        '100%'
    );

    if (
        sucessos > 0 &&
        falhas === 0
    ) {
        showToast(
            `✅ ${sucessos} MLB(s) enviados para a promoção com sucesso!`,
            'success'
        );

    } else if (
        sucessos > 0 &&
        falhas > 0
    ) {
        showToast(
            `⚠️ ${sucessos} ativados e ${falhas} falharam. Veja o console para os detalhes.`,
            'warning'
        );

    } else {
        showToast(
            `❌ Nenhum MLB foi ativado. ${falhas} falha(s). Veja o console.`,
            'error'
        );
    }

    // ========================================================
    // 8. RECARREGAR A ANÁLISE
    // ========================================================
    fecharBarraProgresso();

    try {
        await window.analisarItens();
    } catch (error) {
        log(
            `⚠️ Ativação terminou, mas houve erro ao atualizar a análise: ${error.message}`,
            'warning'
        );

        if (btnAtivar) {
            btnAtivar.disabled = false;
        }

        atualizarBotaoAtivacao();
    }
};

// ADICIONE ESTA FUNÇÃO AO FINAL DO ARQUIVO (antes do fechamento da IIFE)

async function buscarOfferIdDoItemAlternativo(itemId, promotionId, token) {
    try {
        // Buscar todas as promoções do item
        const url = `https://api.mercadolibre.com/seller-promotions/items/${itemId}?app_version=v2`;
        const proxyUrl = `${window.WORKER_URL || 'https://purple-bonus-3b1c.andmiotto1998.workers.dev'}/api/ml/proxy?url=${encodeURIComponent(url)}&token=${token}`;
        const response = await fetch(proxyUrl);
        
        if (!response.ok) return null;
        
        const data = await response.json();
        
        // Procurar a promoção específica
        for (const promocao of data) {
            if (promocao.id === promotionId) {
                // Se o status for 'candidate' ou 'pending', precisamos do offer_id
                if (promocao.offer_id) {
                    return promocao.offer_id;
                }
                
                // Se não tiver offer_id, mas tiver status, podemos tentar ativar
                if (promocao.status === 'candidate' || promocao.status === 'pending') {
                    // Retorna o ID da promoção como fallback
                    return promotionId;
                }
            }
        }
        
        return null;
    } catch (error) {
        log(`❌ Erro ao buscar offer_id: ${error.message}`, 'error');
        return null;
    }
}

    // ============================================================
    // FUNÇÃO: EXPORTAR ANÁLISE
    // ============================================================
    window.exportarAnaliseExcel = function() {
        if (itensAnalisados.length === 0) {
            showToast('⚠️ Nenhum dado para exportar', 'warning');
            return;
        }
        
        try {
            const dados = itensAnalisados.map(item => ({
                'MLB': item.mlb || 'N/A',
                'Preço Final Origem (R$)': item.precoOrigem || 0,
                'Preço Original Origem (R$)': item.precoOriginalOrigem || 0,
                '% Desconto Origem': item.percentOrigem || 0,
                'Preço Final Destino (R$)': item.precoDestino !== null ? item.precoDestino : 'N/A',
                'Preço Original Destino (R$)': item.precoOriginalDestino !== null ? item.precoOriginalDestino : 'N/A',
                '% Desconto Destino': item.percentDestino !== null ? item.percentDestino : 'N/A',
                'Status': item.jaAtivo ? 'Já Ativo' : (item.elegivel ? 'Elegível' : 'Não Elegível'),
                'Motivo': item.motivo || ''
            }));
            
            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.json_to_sheet(dados);
            XLSX.utils.book_append_sheet(wb, ws, 'Análise Promoções');
            
            const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
            const blob = new Blob([wbout], { type: 'application/octet-stream' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `analise_promocoes_${new Date().toISOString().slice(0,10)}.xlsx`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            
            showToast('📊 Análise exportada com sucesso!', 'success');
        } catch (error) {
            console.error('❌ Erro ao exportar:', error);
            showToast('Erro ao exportar', 'error');
        }
    };

    // ============================================================
    // FUNÇÕES: MLBs BLOQUEADOS
    // ============================================================
    
    function carregarMLBsBloqueados() {
        try {
            const saved = localStorage.getItem('mlbs_bloqueados_promocao');
            if (saved) {
                mlbsBloqueados = JSON.parse(saved);
                log(`${mlbsBloqueados.length} MLBs bloqueados carregados`, 'info');
            } else {
                mlbsBloqueados = [];
                log('Nenhum MLB bloqueado encontrado', 'debug');
            }
            atualizarInterfaceMLBsBloqueados();
        } catch (e) {
            log(`Erro ao carregar MLBs: ${e.message}`, 'warning');
            mlbsBloqueados = [];
        }
    }

    function salvarMLBsBloqueados() {
        try {
            localStorage.setItem('mlbs_bloqueados_promocao', JSON.stringify(mlbsBloqueados));
            atualizarInterfaceMLBsBloqueados();
            log(`${mlbsBloqueados.length} MLBs salvos`, 'debug');
        } catch (e) {
            log(`Erro ao salvar MLBs: ${e.message}`, 'error');
        }
    }

    window.salvarMLBsBloqueadosManuais = function() {
        const input = document.getElementById('bulkMLBsBloqueados');
        if (input) {
            const raw = input.value;
            mlbsBloqueados = raw.split(/[\s,;]+/).filter(m => m.trim().length > 0).map(m => m.trim().toUpperCase());
            salvarMLBsBloqueados();
            showToast(`✅ ${mlbsBloqueados.length} MLBs salvos`, 'success');
            log(`${mlbsBloqueados.length} MLBs salvos manualmente`, 'info');
        }
    };

    window.adicionarMLBBloqueado = function() {
        const mlb = prompt('Digite o MLB para bloquear (ex: MLB1234567890):');
        if (!mlb) return;
        const mlbClean = mlb.trim().toUpperCase();
        if (!mlbsBloqueados.includes(mlbClean)) {
            mlbsBloqueados.push(mlbClean);
            salvarMLBsBloqueados();
            document.getElementById('bulkMLBsBloqueados').value = mlbsBloqueados.join(' ');
            showToast(`✅ ${mlbClean} bloqueado`, 'success');
            log(`MLB ${mlbClean} adicionado à lista de bloqueados`, 'info');
        } else {
            showToast('⚠️ MLB já está na lista', 'warning');
        }
    };

    window.removerMLBBloqueado = function(mlb) {
        if (!confirm(`Remover ${mlb} da lista?`)) return;
        mlbsBloqueados = mlbsBloqueados.filter(m => m !== mlb);
        salvarMLBsBloqueados();
        document.getElementById('bulkMLBsBloqueados').value = mlbsBloqueados.join(' ');
        showToast(`✅ ${mlb} removido`, 'success');
        log(`MLB ${mlb} removido da lista`, 'info');
    };

    window.limparMLBsBloqueados = function() {
        if (!confirm('Limpar TODOS os MLBs bloqueados?')) return;
        mlbsBloqueados = [];
        salvarMLBsBloqueados();
        document.getElementById('bulkMLBsBloqueados').value = '';
        showToast('✅ Todos os MLBs removidos', 'success');
        log('Todos os MLBs bloqueados foram removidos', 'info');
    };

    window.exportarMLBsBloqueados = function() {
        if (mlbsBloqueados.length === 0) {
            showToast('⚠️ Nenhum MLB para exportar', 'warning');
            return;
        }
        const texto = mlbsBloqueados.join('\n');
        const blob = new Blob([texto], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `mlbs_bloqueados_${new Date().toISOString().slice(0,10)}.txt`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        showToast(`📋 ${mlbsBloqueados.length} MLBs exportados`, 'success');
        log(`${mlbsBloqueados.length} MLBs exportados`, 'info');
    };

    window.importarMLBsBloqueados = function() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.txt,.csv';
        input.onchange = function(e) {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = function(event) {
                const texto = event.target.result;
                const novos = texto.split(/[\s,;\n\r\t]+/)
                    .map(m => m.trim().toUpperCase())
                    .filter(m => m.length > 0);
                
                let adicionados = 0;
                novos.forEach(m => {
                    if (!mlbsBloqueados.includes(m)) {
                        mlbsBloqueados.push(m);
                        adicionados++;
                    }
                });
                
                if (adicionados > 0) {
                    salvarMLBsBloqueados();
                    document.getElementById('bulkMLBsBloqueados').value = mlbsBloqueados.join(' ');
                    showToast(`✅ ${adicionados} MLBs importados`, 'success');
                    log(`${adicionados} MLBs importados`, 'info');
                } else {
                    showToast('⚠️ Nenhum MLB novo', 'warning');
                }
            };
            reader.readAsText(file);
        };
        input.click();
    };

    function atualizarInterfaceMLBsBloqueados() {
        const input = document.getElementById('bulkMLBsBloqueados');
        const lista = document.getElementById('bulkMLBsBloqueadosLista');
        const contador = document.getElementById('contadorMLBs');
        
        if (input) {
            input.value = mlbsBloqueados.join(' ');
        }
        
        if (contador) {
            contador.textContent = mlbsBloqueados.length;
        }
        
        if (lista) {
            lista.innerHTML = '';
            if (mlbsBloqueados.length === 0) {
                lista.innerHTML = '<span class="text-muted" style="font-size:13px;">Nenhum MLB bloqueado</span>';
                return;
            }
            
            mlbsBloqueados.forEach(mlb => {
                const tag = document.createElement('span');
                tag.className = 'badge badge-danger';
                tag.style.cssText = `
                    padding: 4px 12px;
                    font-size: 12px;
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    border-radius: 4px;
                    background: #dc3545;
                    color: white;
                `;
                tag.innerHTML = `${mlb} <i class="fas fa-times" style="cursor:pointer; font-size:10px;" onclick="window.removerMLBBloqueado('${mlb}')"></i>`;
                lista.appendChild(tag);
            });
        }
    }

    // ============================================================
    // AGENDAMENTO MANUAL DE PROMOÇÕES
    // ============================================================
    function obterSupabasePromocoes() {
        if (window.supabaseClient) return window.supabaseClient;
        if (typeof supabaseClient !== 'undefined' && supabaseClient) return supabaseClient;
        return null;
    }

    function escaparHtmlAgenda(valor) {
        return String(valor ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function normalizarMlbAgenda(valor) {
        let mlb = String(valor || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (/^\d+$/.test(mlb)) mlb = `MLB${mlb}`;
        return mlb;
    }

    function nomeUsuarioAgenda() {
        const usuario = window.currentUser || {};
        return usuario.username || usuario.user || usuario.login || usuario.name || 'Usuário';
    }

    function usuarioPodeReceberAvisoAgenda() {
    const usuario =
        window.currentUser || {};

    const texto = [
        usuario.username,
        usuario.user,
        usuario.login,
        usuario.name
    ]
        .filter(Boolean)
        .join(' ')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();

    return texto
        .split(/\s+/)
        .some(parte => {
            return (
                parte === 'bruna' ||
                parte.startsWith('bruna') ||
                parte === 'ronald' ||
                parte.startsWith('ronald')
            );
        });
}

    function formatarDataAgenda(data) {
        if (!data) return '-';
        return new Date(data).toLocaleString('pt-BR', {
            timeZone: 'America/Sao_Paulo',
            dateStyle: 'short',
            timeStyle: 'short'
        });
    }

    function valorPromocaoEmReais(promocao) {
        const candidatos = [
            promocao.suggested_discounted_price,
            promocao.min_discounted_price,
            promocao.price
        ];
        let valor = Number(candidatos.find(v => Number(v) > 0) || 0);
        if (valor > 1000) valor /= 100;
        return Number(valor.toFixed(2));
    }

    function definirDatasPadraoAgenda() {
        const inicio = document.getElementById('agendaDataAtivacao');
        const fim = document.getElementById('agendaDataDesativacao');
        if (!inicio || !fim || inicio.value || fim.value) return;

        const agora = new Date();
        agora.setSeconds(0, 0);
        agora.setMinutes(agora.getMinutes() + 5);
        const depois = new Date(agora);
        depois.setDate(depois.getDate() + 7);
        const localInput = data => {
            const ajuste = data.getTimezoneOffset() * 60000;
            return new Date(data.getTime() - ajuste).toISOString().slice(0, 16);
        };
        inicio.value = localInput(agora);
        fim.value = localInput(depois);
    }

    function obterListaMlbsAgendamentoEmMassa(valor) {
    const partes = String(valor || '')
        .toUpperCase()
        .split(/[\s,;|]+/)
        .map(normalizarMlbAgenda)
        .filter(mlb => /^MLB\d+$/.test(mlb));

    return [...new Set(partes)];
}

function definirDatasPadraoAgendaEmMassa() {
    const inicio = document.getElementById(
        'agendaMassaDataAtivacao'
    );

    const fim = document.getElementById(
        'agendaMassaDataDesativacao'
    );

    if (!inicio || !fim || inicio.value || fim.value) {
        return;
    }

    const agora = new Date();

    agora.setSeconds(0, 0);
    agora.setMinutes(agora.getMinutes() + 5);

    const depois = new Date(agora);

    depois.setDate(depois.getDate() + 7);

    const localInput = data => {
        const ajuste =
            data.getTimezoneOffset() * 60000;

        return new Date(
            data.getTime() - ajuste
        )
            .toISOString()
            .slice(0, 16);
    };

    inicio.value = localInput(agora);
    fim.value = localInput(depois);
}

function renderizarResultadosAgendamentoEmMassa() {
    const container = document.getElementById(
        'agendaMassaResultados'
    );

    const datas = document.getElementById(
        'agendaMassaDatasContainer'
    );

    if (!container) {
        return;
    }

    if (!itensAgendamentoEmMassa.length) {
        container.innerHTML = '';
        datas?.classList.add('hidden');

        return;
    }

    const quantidadeValidos =
        itensAgendamentoEmMassa.filter(item => {
            return item.promocoes.length > 0;
        }).length;

    container.innerHTML = `
        <div
            class="d-flex justify-content-between align-items-center mb-2"
        >
            <h5 style="margin:0;">
                Confira a promoção e o valor de cada MLB
            </h5>

            <span class="badge badge-primary">
                ${quantidadeValidos} de
                ${itensAgendamentoEmMassa.length} disponíveis
            </span>
        </div>

        <div class="table-responsive">
            <table
                class="table table-sm table-bordered table-hover"
            >
                <thead>
                    <tr>
                        <th
                            style="
                                width:45px;
                                text-align:center;
                            "
                        >
                            <input
                                type="checkbox"
                                checked
                                onchange="
                                    marcarTodosAgendamentosEmMassa(
                                        this.checked
                                    )
                                "
                                title="Marcar ou desmarcar todos"
                            >
                        </th>

                        <th>MLB / anúncio</th>

                        <th style="min-width:280px;">
                            Promoção
                        </th>

                        <th style="width:190px;">
                            Valor final
                        </th>

                        <th>Situação</th>
                    </tr>
                </thead>

                <tbody>
                    ${itensAgendamentoEmMassa.map(
                        (item, index) => {
                            if (
                                item.erro ||
                                !item.promocoes.length
                            ) {
                                return `
                                    <tr>
                                        <td
                                            style="
                                                text-align:center;
                                            "
                                        >
                                            <input
                                                type="checkbox"
                                                disabled
                                            >
                                        </td>

                                        <td>
                                            <strong>
                                                ${escaparHtmlAgenda(
                                                    item.mlb
                                                )}
                                            </strong>

                                            ${
                                                item.titulo
                                                    ? `
                                                        <br>

                                                        <small>
                                                            ${escaparHtmlAgenda(
                                                                item.titulo
                                                            )}
                                                        </small>
                                                    `
                                                    : ''
                                            }
                                        </td>

                                        <td>—</td>
                                        <td>—</td>

                                        <td>
                                            <span
                                                class="text-danger"
                                            >
                                                ${escaparHtmlAgenda(
                                                    item.erro ||
                                                    'Nenhuma promoção candidata disponível'
                                                )}
                                            </span>
                                        </td>
                                    </tr>
                                `;
                            }

                            const promocaoSelecionada =
                                item.promocoes[
                                    item.promocaoSelecionada
                                ] ||
                                item.promocoes[0];

                            return `
                                <tr>
                                    <td
                                        style="
                                            text-align:center;
                                        "
                                    >
                                        <input
                                            type="checkbox"
                                            class="
                                                agenda-massa-item-check
                                            "
                                            data-index="${index}"
                                            checked
                                        >
                                    </td>

                                    <td>
                                        <strong>
                                            ${escaparHtmlAgenda(
                                                item.mlb
                                            )}
                                        </strong>

                                        <br>

                                        <small>
                                            ${escaparHtmlAgenda(
                                                item.titulo ||
                                                'Anúncio encontrado'
                                            )}
                                        </small>

                                        <br>

                                        <small
                                            class="text-muted"
                                        >
                                            Preço atual: R$
                                            ${Number(
                                                item.precoAtual || 0
                                            ).toFixed(2)}
                                        </small>
                                    </td>

                                    <td>
                                        <select
                                            class="
                                                form-control
                                                form-control-sm
                                                agenda-massa-promocao
                                            "
                                            data-index="${index}"
                                            onchange="
                                                alterarPromocaoAgendamentoEmMassa(
                                                    ${index},
                                                    this.value
                                                )
                                            "
                                        >
                                            ${item.promocoes.map(
                                                (
                                                    promocao,
                                                    promocaoIndex
                                                ) => {
                                                    return `
                                                        <option
                                                            value="${promocaoIndex}"
                                                            ${
                                                                promocaoIndex ===
                                                                item.promocaoSelecionada
                                                                    ? 'selected'
                                                                    : ''
                                                            }
                                                        >
                                                            ${escaparHtmlAgenda(
                                                                promocao.name
                                                            )}
                                                            —
                                                            ${escaparHtmlAgenda(
                                                                promocao.type
                                                            )}
                                                        </option>
                                                    `;
                                                }
                                            ).join('')}
                                        </select>

                                        <small
                                            class="
                                                text-muted
                                                agenda-massa-promocao-id
                                            "
                                            data-index="${index}"
                                        >
                                            ${escaparHtmlAgenda(
                                                promocaoSelecionada.id
                                            )}
                                        </small>
                                    </td>

                                    <td>
                                        <input
                                            type="number"
                                            min="0.01"
                                            step="0.01"
                                            class="
                                                form-control
                                                form-control-sm
                                                agenda-massa-valor
                                            "
                                            data-index="${index}"
                                            value="${
                                                Number(
                                                    promocaoSelecionada
                                                        .valor || 0
                                                ) > 0
                                                    ? Number(
                                                        promocaoSelecionada
                                                            .valor
                                                    ).toFixed(2)
                                                    : ''
                                            }"
                                        >
                                    </td>

                                    <td>
                                        <span
                                            class="
                                                badge
                                                badge-success
                                            "
                                        >
                                            Pronto para agendar
                                        </span>
                                    </td>
                                </tr>
                            `;
                        }
                    ).join('')}
                </tbody>
            </table>
        </div>
    `;

    if (quantidadeValidos > 0) {
        datas?.classList.remove('hidden');
        definirDatasPadraoAgendaEmMassa();
    } else {
        datas?.classList.add('hidden');
    }
}

window.marcarTodosAgendamentosEmMassa = function(
    marcar
) {
    document
        .querySelectorAll(
            '.agenda-massa-item-check:not(:disabled)'
        )
        .forEach(checkbox => {
            checkbox.checked = Boolean(marcar);
        });
};

window.alterarPromocaoAgendamentoEmMassa =
function(
    index,
    valorSelecionado
) {
    const item =
        itensAgendamentoEmMassa[Number(index)];

    const promocaoIndex =
        Number(valorSelecionado);

    const promocao =
        item?.promocoes?.[promocaoIndex];

    if (!item || !promocao) {
        return;
    }

    item.promocaoSelecionada =
        promocaoIndex;

    const inputValor = document.querySelector(
        `.agenda-massa-valor[data-index="${Number(index)}"]`
    );

    if (inputValor) {
        inputValor.value =
            Number(promocao.valor || 0) > 0
                ? Number(promocao.valor).toFixed(2)
                : '';
    }

    const textoId = document.querySelector(
        `.agenda-massa-promocao-id[data-index="${Number(index)}"]`
    );

    if (textoId) {
        textoId.textContent =
            promocao.id;
    }
};

    window.pesquisarMLBParaAgendamento = async function() {
        const input = document.getElementById('agendaMlbPesquisa');
        const btn = document.getElementById('btnPesquisarAgendaMlb');
        const dadosItem = document.getElementById('agendaDadosItem');
        const lista = document.getElementById('agendaPromocoesEncontradas');
        const datas = document.getElementById('agendaDatasContainer');
        const mlb = normalizarMlbAgenda(input?.value);

        if (!/^MLB\d+$/.test(mlb)) {
            showToast('⚠️ Informe um MLB válido', 'warning');
            return;
        }

        if (input) input.value = mlb;
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Pesquisando...';
        }
        if (lista) lista.innerHTML = '';
        if (datas) datas.classList.add('hidden');
        promocoesEncontradasAgendamento = [];

        try {
            const tokenData = await window.getValidToken?.();
            if (!tokenData?.access_token) throw new Error('Token do Mercado Livre não disponível');

            const worker = window.WORKER_URL || 'https://purple-bonus-3b1c.andmiotto1998.workers.dev';
            const itemUrl = `https://api.mercadolibre.com/items/${mlb}`;
            const itemResponse = await fetch(
                `${worker}/api/ml/proxy?url=${encodeURIComponent(itemUrl)}&token=${encodeURIComponent(tokenData.access_token)}`
            );
            if (!itemResponse.ok) throw new Error(`MLB não encontrado (HTTP ${itemResponse.status})`);
            const item = await itemResponse.json();

            if (dadosItem) {
                dadosItem.innerHTML = `
                    <div class="alert alert-info" style="display:flex; gap:15px; align-items:center;">
                        ${item.thumbnail ? `<img src="${escaparHtmlAgenda(item.thumbnail)}" alt="" style="width:60px;height:60px;object-fit:contain;background:#fff;border-radius:6px;">` : ''}
                        <div><strong>${escaparHtmlAgenda(mlb)}</strong><br>${escaparHtmlAgenda(item.title || 'Anúncio encontrado')}<br>
                        <small>Preço atual: R$ ${Number(item.price || 0).toFixed(2)}</small></div>
                    </div>`;
            }

            const promocoesItem = await buscarPromocoesDoItem(mlb, tokenData.access_token);
            if (!Array.isArray(promocoesItem)) throw new Error('Não foi possível consultar as promoções deste MLB');

            promocoesEncontradasAgendamento = promocoesItem
                .filter(p => ['candidate', 'pending', 'started'].includes(p.status))
                .map(p => ({
                    id: String(p.id || ''),
                    name: p.name || p.id || 'Promoção sem nome',
                    type: p.type || '',
                    status: p.status || 'unknown',
                    valor: valorPromocaoEmReais(p)
                }))
                .filter(p => p.id && p.type);

            if (!promocoesEncontradasAgendamento.length) {
                if (lista) lista.innerHTML = '<div class="alert alert-warning">Este MLB não possui promoções disponíveis para programar.</div>';
                return;
            }

            if (lista) {
                lista.innerHTML = `
                    <h5>Selecione uma ou mais promoções</h5>
                    <div class="table-responsive"><table class="table table-sm table-bordered">
                        <thead><tr><th style="width:45px;"></th><th>Promoção</th><th>Status atual</th><th style="width:210px;">Valor final desejado</th></tr></thead>
                        <tbody>${promocoesEncontradasAgendamento.map((p, index) => {
                            const candidato = p.status === 'candidate';
                            const status = p.status === 'candidate' ? 'Candidata' : p.status === 'pending' ? 'Já programada no ML' : 'Já ativa';
                            return `<tr>
                                <td style="text-align:center;"><input type="checkbox" class="agenda-promo-check" data-index="${index}" ${candidato ? '' : 'disabled'}></td>
                                <td><strong>${escaparHtmlAgenda(p.name)}</strong><br><small>${escaparHtmlAgenda(p.type)} • ${escaparHtmlAgenda(p.id)}</small></td>
                                <td>${escaparHtmlAgenda(status)}</td>
                                <td><input type="number" min="0.01" step="0.01" class="form-control form-control-sm agenda-promo-valor"
                                    data-index="${index}" value="${p.valor > 0 ? p.valor.toFixed(2) : ''}" ${candidato ? '' : 'disabled'}></td>
                            </tr>`;
                        }).join('')}</tbody>
                    </table></div>
                    <small class="text-muted">Somente promoções com status “Candidata” podem ser programadas pelo sistema.</small>`;
            }
            if (datas) datas.classList.remove('hidden');
            definirDatasPadraoAgenda();
        } catch (error) {
            log(`Erro ao pesquisar MLB para agendamento: ${error.message}`, 'error');
            if (dadosItem) dadosItem.innerHTML = `<div class="alert alert-danger">${escaparHtmlAgenda(error.message)}</div>`;
            showToast(`❌ ${error.message}`, 'error');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-search"></i> Pesquisar MLB';
            }
        }
    };

    window.pesquisarListaMLBsParaAgendamento =
async function() {
    const textarea = document.getElementById(
        'agendaMassaListaMlbs'
    );

    const botao = document.getElementById(
        'btnPesquisarAgendaMassa'
    );

    const progresso = document.getElementById(
        'agendaMassaProgresso'
    );

    const resultados = document.getElementById(
        'agendaMassaResultados'
    );

    const datas = document.getElementById(
        'agendaMassaDatasContainer'
    );

    const mlbs = obterListaMlbsAgendamentoEmMassa(
        textarea?.value
    );

    if (!mlbs.length) {
        showToast(
            '⚠️ Cole ao menos um MLB válido',
            'warning'
        );

        textarea?.focus();

        return;
    }

    if (textarea) {
        textarea.value = mlbs.join('\n');
    }

    if (botao) {
        botao.disabled = true;

        botao.innerHTML = `
            <i class="fas fa-spinner fa-spin"></i>
            Pesquisando 0 de ${mlbs.length}
        `;
    }

    if (resultados) {
        resultados.innerHTML = '';
    }

    datas?.classList.add('hidden');

    itensAgendamentoEmMassa = [];

    try {
        const tokenData =
            await window.getValidToken?.();

        const accessToken =
            tokenData?.access_token ||
            null;

        if (!accessToken) {
            throw new Error(
                'Token do Mercado Livre não disponível'
            );
        }

        const worker =
            window.WORKER_URL ||
            'https://purple-bonus-3b1c.andmiotto1998.workers.dev';

        let processados = 0;

        const pesquisarMlb = async mlb => {
            const resultado = {
                mlb,
                titulo: '',
                precoAtual: 0,
                promocoes: [],
                promocaoSelecionada: 0,
                erro: null
            };

            try {
                const itemUrl =
                    `https://api.mercadolibre.com/items/${mlb}`;

                const itemResponse = await fetch(
                    `${worker}/api/ml/proxy?` +
                    `url=${encodeURIComponent(itemUrl)}` +
                    `&token=${encodeURIComponent(accessToken)}`,
                    {
                        cache: 'no-store'
                    }
                );

                if (!itemResponse.ok) {
                    throw new Error(
                        `MLB não encontrado ` +
                        `(HTTP ${itemResponse.status})`
                    );
                }

                const item =
                    await itemResponse.json();

                resultado.titulo =
                    item.title ||
                    'Anúncio encontrado';

                resultado.precoAtual =
                    Number(item.price || 0);

                const promocoesItem =
                    await buscarPromocoesDoItem(
                        mlb,
                        accessToken
                    );

                if (!Array.isArray(promocoesItem)) {
                    throw new Error(
                        'Não foi possível consultar as promoções'
                    );
                }

                resultado.promocoes =
                    promocoesItem
                        .filter(promocao => {
                            return (
                                promocao.status ===
                                'candidate'
                            );
                        })
                        .map(promocao => ({
                            id: String(
                                promocao.id || ''
                            ),

                            name:
                                promocao.name ||
                                promocao.id ||
                                'Promoção sem nome',

                            type:
                                promocao.type ||
                                '',

                            status:
                                promocao.status,

                            valor:
                                valorPromocaoEmReais(
                                    promocao
                                )
                        }))
                        .filter(promocao => {
                            return (
                                promocao.id &&
                                promocao.type
                            );
                        });

                if (!resultado.promocoes.length) {
                    resultado.erro =
                        'Nenhuma promoção candidata disponível';
                }
            } catch (error) {
                resultado.erro =
                    error.message ||
                    'Erro ao consultar o MLB';
            } finally {
                processados++;

                if (botao) {
                    botao.innerHTML = `
                        <i
                            class="
                                fas
                                fa-spinner
                                fa-spin
                            "
                        ></i>

                        Pesquisando
                        ${processados} de ${mlbs.length}
                    `;
                }

                if (progresso) {
                    progresso.innerHTML = `
                        <div class="alert alert-info">
                            Consultando promoções:

                            <strong>
                                ${processados}/${mlbs.length}
                            </strong>
                        </div>
                    `;
                }
            }

            return resultado;
        };

        /*
         * Pesquisa cinco MLBs simultaneamente.
         * Isso evita sobrecarregar a API.
         */
        const tamanhoLote = 5;

        for (
            let inicioLote = 0;
            inicioLote < mlbs.length;
            inicioLote += tamanhoLote
        ) {
            const lote = mlbs.slice(
                inicioLote,
                inicioLote + tamanhoLote
            );

            const resultadosLote =
                await Promise.all(
                    lote.map(pesquisarMlb)
                );

            itensAgendamentoEmMassa.push(
                ...resultadosLote
            );
        }

        renderizarResultadosAgendamentoEmMassa();

        const validos =
            itensAgendamentoEmMassa.filter(item => {
                return item.promocoes.length > 0;
            }).length;

        if (progresso) {
            progresso.innerHTML =
                validos > 0
                    ? `
                        <div class="alert alert-success">
                            ${validos} de ${mlbs.length}
                            MLB(s) estão prontos para agendar.
                        </div>
                    `
                    : `
                        <div class="alert alert-warning">
                            Nenhum dos MLBs possui
                            promoção candidata.
                        </div>
                    `;
        }
    } catch (error) {
        log(
            `Erro na pesquisa em massa: ${error.message}`,
            'error'
        );

        if (progresso) {
            progresso.innerHTML = `
                <div class="alert alert-danger">
                    ${escaparHtmlAgenda(error.message)}
                </div>
            `;
        }

        showToast(
            `❌ ${error.message}`,
            'error'
        );
    } finally {
        if (botao) {
            botao.disabled = false;

            botao.innerHTML = `
                <i class="fas fa-search"></i>
                Pesquisar lista
            `;
        }
    }
};

    window.salvarAgendamentosSelecionados = async function() {
        const supabase = obterSupabasePromocoes();
        if (!supabase) return showToast('❌ Supabase não conectado', 'error');

        const mlb = normalizarMlbAgenda(document.getElementById('agendaMlbPesquisa')?.value);
        const inicioValor = document.getElementById('agendaDataAtivacao')?.value;
        const fimValor = document.getElementById('agendaDataDesativacao')?.value;
        const selecionados = [...document.querySelectorAll('.agenda-promo-check:checked:not(:disabled)')];

        if (!selecionados.length) return showToast('⚠️ Selecione ao menos uma promoção', 'warning');
        if (!inicioValor || !fimValor) return showToast('⚠️ Informe as datas de ativação e desativação', 'warning');

        const inicio = new Date(inicioValor);
        const fim = new Date(fimValor);
        if (!Number.isFinite(inicio.getTime()) || !Number.isFinite(fim.getTime())) return showToast('⚠️ Datas inválidas', 'warning');
        if (fim <= inicio) return showToast('⚠️ A desativação deve ser posterior à ativação', 'warning');

        const registros = [];
        for (const checkbox of selecionados) {
            const index = Number(checkbox.dataset.index);
            const promocao = promocoesEncontradasAgendamento[index];
            const valorInput = document.querySelector(`.agenda-promo-valor[data-index="${index}"]`);
            const valor = Number(valorInput?.value);
            if (!promocao || !Number.isFinite(valor) || valor <= 0) {
                return showToast(`⚠️ Informe um valor válido para ${promocao?.name || 'a promoção'}`, 'warning');
            }
            registros.push({
                mlb,
                promotion_id: promocao.id,
                promotion_name: promocao.name,
                promotion_type: promocao.type,
                valor_final: Number(valor.toFixed(2)),
                data_ativacao: inicio.toISOString(),
                data_desativacao: fim.toISOString(),
                status: 'agendada',
                criada_por: nomeUsuarioAgenda()
            });
        }

        const btn = document.getElementById('btnSalvarAgendamento');
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...'; }
        try {
            const { error } = await supabase.from('promocoes_agendadas').insert(registros);
            if (error) throw error;
            showToast(`✅ ${registros.length} promoção(ões) programada(s)`, 'success');
            document.querySelectorAll('.agenda-promo-check').forEach(cb => { cb.checked = false; });
            await carregarAgendamentosPromocoes();
            await verificarAvisosPromocoesAgendadas();
        } catch (error) {
            const duplicado = String(error.message || '').toLowerCase().includes('duplicate');
            showToast(duplicado ? '⚠️ Este agendamento já existe' : `❌ Erro ao programar: ${error.message}`, duplicado ? 'warning' : 'error');
        } finally {
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-save"></i> Programar'; }
        }
    };

   window.salvarAgendamentosEmMassa =
async function() {
    const supabase =
        obterSupabasePromocoes();

    if (!supabase) {
        showToast(
            '❌ Supabase não conectado',
            'error'
        );

        return;
    }

    const inicioValor =
        document.getElementById(
            'agendaMassaDataAtivacao'
        )?.value;

    const fimValor =
        document.getElementById(
            'agendaMassaDataDesativacao'
        )?.value;

    const selecionados = [
        ...document.querySelectorAll(
            '.agenda-massa-item-check:checked:not(:disabled)'
        )
    ];

    if (!selecionados.length) {
        showToast(
            '⚠️ Marque ao menos um MLB para agendar',
            'warning'
        );

        return;
    }

    if (!inicioValor || !fimValor) {
        showToast(
            '⚠️ Informe as datas de ativação e desativação',
            'warning'
        );

        return;
    }

    const inicio =
        new Date(inicioValor);

    const fim =
        new Date(fimValor);

    if (
        !Number.isFinite(inicio.getTime()) ||
        !Number.isFinite(fim.getTime())
    ) {
        showToast(
            '⚠️ Datas inválidas',
            'warning'
        );

        return;
    }

    if (fim <= inicio) {
        showToast(
            '⚠️ A desativação deve ser posterior à ativação',
            'warning'
        );

        return;
    }

    const registros = [];

    for (const checkbox of selecionados) {
        const index =
            Number(checkbox.dataset.index);

        const item =
            itensAgendamentoEmMassa[index];

        const promocao =
            item?.promocoes?.[
                item.promocaoSelecionada || 0
            ];

        const inputValor =
            document.querySelector(
                `.agenda-massa-valor[data-index="${index}"]`
            );

        const valor =
            Number(inputValor?.value);

        if (!item || !promocao) {
            showToast(
                '⚠️ Selecione uma promoção válida para todos os MLBs marcados',
                'warning'
            );

            return;
        }

        if (
            !Number.isFinite(valor) ||
            valor <= 0
        ) {
            showToast(
                `⚠️ Informe um valor válido para ${item.mlb}`,
                'warning'
            );

            inputValor?.focus();

            return;
        }

        registros.push({
            mlb: item.mlb,
            promotion_id: promocao.id,
            promotion_name: promocao.name,
            promotion_type: promocao.type,
            valor_final: Number(
                valor.toFixed(2)
            ),
            data_ativacao:
                inicio.toISOString(),
            data_desativacao:
                fim.toISOString(),
            status: 'agendada',
            criada_por:
                nomeUsuarioAgenda()
        });
    }

    const confirmou = confirm(
        `Agendar ${registros.length} MLB(s) ` +
        `com as datas informadas?`
    );

    if (!confirmou) {
        return;
    }

    const botao =
        document.getElementById(
            'btnSalvarAgendamentoMassa'
        );

    if (botao) {
        botao.disabled = true;

        botao.innerHTML = `
            <i class="fas fa-spinner fa-spin"></i>
            Salvando 0 de ${registros.length}
        `;
    }

    let sucessos = 0;
    const falhas = [];

    try {
        /*
         * Salva individualmente para que um erro
         * não impeça os demais agendamentos.
         */
        for (
            let index = 0;
            index < registros.length;
            index++
        ) {
            const registro =
                registros[index];

            if (botao) {
                botao.innerHTML = `
                    <i
                        class="
                            fas
                            fa-spinner
                            fa-spin
                        "
                    ></i>

                    Salvando
                    ${index + 1} de ${registros.length}
                `;
            }

            const { error } =
                await supabase
                    .from('promocoes_agendadas')
                    .insert(registro);

            if (error) {
                falhas.push({
                    mlb: registro.mlb,
                    erro: error.message
                });
            } else {
                sucessos++;
            }
        }

        /*
         * Atualiza a lista inferior antes de limpar
         * o formulário de agendamento em massa.
         */
        await carregarAgendamentosPromocoes();

        await verificarAvisosPromocoesAgendadas();

        /*
         * Se ao menos um agendamento foi salvo,
         * limpa completamente a lista e a tabela superior.
         */
        if (sucessos > 0) {
            const textarea =
                document.getElementById(
                    'agendaMassaListaMlbs'
                );

            const progresso =
                document.getElementById(
                    'agendaMassaProgresso'
                );

            const resultados =
                document.getElementById(
                    'agendaMassaResultados'
                );

            const datas =
                document.getElementById(
                    'agendaMassaDatasContainer'
                );

            const inicioInput =
                document.getElementById(
                    'agendaMassaDataAtivacao'
                );

            const fimInput =
                document.getElementById(
                    'agendaMassaDataDesativacao'
                );

            if (textarea) {
                textarea.value = '';
            }

            if (progresso) {
                progresso.innerHTML = '';
            }

            if (resultados) {
                resultados.innerHTML = '';
            }

            if (inicioInput) {
                inicioInput.value = '';
            }

            if (fimInput) {
                fimInput.value = '';
            }

            datas?.classList.add('hidden');

            /*
             * Limpa também a lista mantida na memória.
             */
            itensAgendamentoEmMassa = [];
        }

        if (!falhas.length) {
            showToast(
                `✅ ${sucessos} MLB(s) ` +
                `agendado(s) com sucesso`,
                'success'
            );

            return;
        }

        log(
            'Falhas no agendamento em massa',
            'error',
            falhas
        );

        if (sucessos > 0) {
            showToast(
                `⚠️ ${sucessos} agendado(s) e ` +
                `${falhas.length} com erro. ` +
                `Os agendados já estão na lista abaixo.`,
                'warning'
            );

            return;
        }

        const todosDuplicados =
            falhas.every(falha => {
                return String(
                    falha.erro || ''
                )
                    .toLowerCase()
                    .includes('duplicate');
            });

        showToast(
            todosDuplicados
                ? '⚠️ Todos os agendamentos já existem'
                : `❌ Nenhum MLB foi agendado. ` +
                  `${falhas.length} erro(s).`,
            todosDuplicados
                ? 'warning'
                : 'error'
        );
    } catch (error) {
        log(
            `Erro ao salvar agendamentos em massa: ` +
            `${error.message}`,
            'error'
        );

        showToast(
            `❌ Erro ao salvar: ${error.message}`,
            'error'
        );
    } finally {
        if (botao) {
            botao.disabled = false;

            botao.innerHTML = `
                <i class="fas fa-calendar-check"></i>
                Agendar todos
            `;
        }
    }
};

    window.carregarAgendamentosPromocoes = async function() {
        const supabase = obterSupabasePromocoes();
        const tbody = document.getElementById('agendaPromocoesBody');
        if (!supabase) {
            if (tbody) tbody.innerHTML = '<tr><td colspan="8" class="text-center text-danger">Supabase não conectado</td></tr>';
            return [];
        }
        try {
            const { data, error } = await supabase
                .from('promocoes_agendadas')
                .select('*')
                .order('data_ativacao', { ascending: false });
            if (error) throw error;
            agendamentosPromocoes = data || [];
            renderizarAgendamentosPromocoes();
            return agendamentosPromocoes;
        } catch (error) {
            log(`Erro ao carregar agendamentos: ${error.message}`, 'error');
            if (tbody) tbody.innerHTML = `<tr><td colspan="8" class="text-center text-danger">${escaparHtmlAgenda(error.message)}</td></tr>`;
            return [];
        }
    };

    function statusAgendaInfo(status) {
    const mapa = {
        agendada: [
            'Agendada',
            'warning'
        ],
        ativando: [
            'Ativando...',
            'info'
        ],
        ativada: [
            'Ativada',
            'success'
        ],
        erro_ativacao: [
            'Erro na ativação',
            'danger'
        ],
        desativando: [
            'Desativando...',
            'info'
        ],
        concluida: [
            'Concluída',
            'secondary'
        ],
        erro_desativacao: [
            'Erro na desativação',
            'danger'
        ],
        cancelada: [
            'Cancelada',
            'secondary'
        ]
    };

    return mapa[status] || [
        status || 'Desconhecido',
        'secondary'
    ];
}

function chaveDataSaoPauloAgenda(valor) {
    const data = valor instanceof Date
        ? valor
        : new Date(valor);

    if (!Number.isFinite(data.getTime())) {
        return '';
    }

    const partes = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).formatToParts(data);

    const obter = tipo => {
        return partes.find(parte => parte.type === tipo)?.value || '';
    };

    return [
        obter('year'),
        obter('month'),
        obter('day')
    ].join('-');
}

function obterAtivacoesAgendadasDisponiveisHoje() {
    const agora = new Date();
    const hoje = chaveDataSaoPauloAgenda(agora);

    return agendamentosPromocoes.filter(item => {
        const dataAtivacao = new Date(item.data_ativacao);

        const statusPermiteAtivar = [
            'agendada',
            'erro_ativacao'
        ].includes(item.status);

        const dataValida = Number.isFinite(
            dataAtivacao.getTime()
        );

        const agendadaParaHoje =
            chaveDataSaoPauloAgenda(dataAtivacao) === hoje;

        const horarioJaChegou =
            dataAtivacao.getTime() <= agora.getTime();

        return (
            statusPermiteAtivar &&
            dataValida &&
            agendadaParaHoje &&
            horarioJaChegou
        );
    });
}

function atualizarBotaoAtivacoesAgendadasHoje() {
    const botao = document.getElementById(
        'btnAtivarAgendamentosHoje'
    );

    if (!botao) {
        return;
    }

    const quantidade =
        obterAtivacoesAgendadasDisponiveisHoje().length;

    botao.disabled = quantidade === 0;

    botao.innerHTML = `
        <i class="fas fa-play-circle"></i>
        Ativar todas de hoje (${quantidade})
    `;

    botao.title = quantidade > 0
        ? 'Ativa todas as promoções de hoje cujo horário programado já chegou'
        : 'Não há ativações de hoje com horário já alcançado';
}

    window.renderizarAgendamentosPromocoes = function() {
    const tbody = document.getElementById(
        'agendaPromocoesBody'
    );

    if (!tbody) {
        return;
    }

    atualizarBotaoAtivacoesAgendadasHoje();

    const filtro =
        document.getElementById('agendaFiltroStatus')?.value ||
        'todos';

    const agora = Date.now();

    const itens = agendamentosPromocoes.filter(item => {
        if (filtro === 'todos') {
            return true;
        }

        if (filtro === 'pendentes') {
            const ativacaoPendente =
                [
                    'agendada',
                    'erro_ativacao'
                ].includes(item.status) &&
                new Date(item.data_ativacao).getTime() <= agora;

            const desativacaoPendente =
                [
                    'ativada',
                    'erro_desativacao'
                ].includes(item.status) &&
                new Date(item.data_desativacao).getTime() <= agora;

            return ativacaoPendente || desativacaoPendente;
        }

        if (filtro === 'erros') {
            return [
                'erro_ativacao',
                'erro_desativacao'
            ].includes(item.status);
        }

        return item.status === filtro;
    });

    if (!itens.length) {
        tbody.innerHTML = `
            <tr>
                <td
                    colspan="8"
                    class="text-center text-muted py-4"
                >
                    Nenhum agendamento encontrado
                </td>
            </tr>
        `;

        return;
    }

    tbody.innerHTML = itens.map(item => {
        const [
            statusTexto,
            statusCor
        ] = statusAgendaInfo(item.status);

        const dataAtivacao = new Date(
            item.data_ativacao
        ).getTime();

        const dataDesativacao = new Date(
            item.data_desativacao
        ).getTime();

        const podeAtivar =
            [
                'agendada',
                'erro_ativacao'
            ].includes(item.status) &&
            Number.isFinite(dataAtivacao) &&
            dataAtivacao <= agora;

        const podeDesativar =
            [
                'ativada',
                'erro_desativacao'
            ].includes(item.status) &&
            Number.isFinite(dataDesativacao) &&
            dataDesativacao <= agora;

        const podeCancelar = [
            'agendada',
            'erro_ativacao'
        ].includes(item.status);

        /*
         * A data final só pode ser alterada enquanto a promoção
         * ainda não foi ativada.
         */
        const podeAlterarDataFim = [
            'agendada',
            'erro_ativacao'
        ].includes(item.status);

        const responsavel =
            item.desativada_por ||
            item.ativada_por ||
            item.criada_por ||
            '-';

        const erro =
            item.erro_ativacao ||
            item.erro_desativacao;

        return `
            <tr>
                <td>
                    <strong>
                        ${escaparHtmlAgenda(item.mlb)}
                    </strong>
                </td>

                <td>
                    ${escaparHtmlAgenda(item.promotion_name)}

                    <br>

                    <small>
                        ${escaparHtmlAgenda(item.promotion_id)}
                    </small>
                </td>

                <td style="text-align:right;">
                    R$ ${Number(
                        item.valor_final || 0
                    ).toFixed(2)}
                </td>

                <td>
                    ${formatarDataAgenda(item.data_ativacao)}
                </td>

                <td>
                    ${formatarDataAgenda(item.data_desativacao)}

                    ${
                        podeAlterarDataFim
                            ? `
                                <br>

                                <button
                                    type="button"
                                    class="btn btn-sm btn-outline-primary mt-1"
                                    onclick="abrirModalAlterarFimPromocao(${Number(
                                        item.id
                                    )})"
                                    title="Alterar a data de encerramento"
                                >
                                    <i class="fas fa-calendar-alt"></i>
                                    Alterar fim
                                </button>
                            `
                            : ''
                    }
                </td>

                <td>
                    <span class="badge badge-${statusCor}">
                        ${escaparHtmlAgenda(statusTexto)}
                    </span>

                    ${
                        erro
                            ? `
                                <br>

                                <small
                                    class="text-danger"
                                    title="${escaparHtmlAgenda(erro)}"
                                >
                                    ${escaparHtmlAgenda(
                                        String(erro).slice(0, 70)
                                    )}
                                </small>
                            `
                            : ''
                    }
                </td>

                <td>
                    ${escaparHtmlAgenda(responsavel)}
                </td>

                <td>
                    ${
                        podeAtivar
                            ? `
                                <button
                                    class="btn btn-sm btn-success"
                                    onclick="executarAtivacaoAgendada(${Number(
                                        item.id
                                    )})"
                                >
                                    <i class="fas fa-play"></i>
                                    Ativar
                                </button>
                            `
                            : ''
                    }

                    ${
                        podeDesativar
                            ? `
                                <button
                                    class="btn btn-sm btn-danger"
                                    onclick="executarDesativacaoAgendada(${Number(
                                        item.id
                                    )})"
                                >
                                    <i class="fas fa-stop"></i>
                                    Desativar
                                </button>
                            `
                            : ''
                    }

                    ${
                        podeCancelar
                            ? `
                                <button
                                    class="btn btn-sm btn-secondary"
                                    onclick="cancelarAgendamentoPromocao(${Number(
                                        item.id
                                    )})"
                                >
                                    <i class="fas fa-times"></i>
                                    Cancelar
                                </button>
                            `
                            : ''
                    }

                    ${
                        !podeAtivar &&
                        !podeDesativar &&
                        !podeCancelar
                            ? '<span class="text-muted">—</span>'
                            : ''
                    }
                </td>
            </tr>
        `;
    }).join('');
};

    async function reservarAcaoAgenda(
    id,
    statusPermitidos,
    novoStatus,
    camposExtras
) {
    const supabase = obterSupabasePromocoes();

    if (!supabase) {
        throw new Error('Supabase não conectado');
    }

    const {
        data,
        error
    } = await supabase
        .from('promocoes_agendadas')
        .update({
            status: novoStatus,
            ultima_tentativa_em: new Date().toISOString(),
            ...camposExtras
        })
        .eq('id', id)
        .in('status', statusPermitidos)
        .select()
        .maybeSingle();

    if (error) {
        throw error;
    }

    return data;
}

async function processarAtivacaoAgendada(
    id,
    opcoes = {}
) {
    const {
        confirmar = true,
        atualizarInterface = true,
        tokenAcesso = null
    } = opcoes;

    const supabase = obterSupabasePromocoes();

    const original = agendamentosPromocoes.find(
        agendamento => Number(agendamento.id) === Number(id)
    );

    if (!supabase) {
        return {
            success: false,
            error: 'Supabase não conectado'
        };
    }

    if (!original) {
        return {
            success: false,
            error: 'Agendamento não encontrado'
        };
    }

    const dataAtivacao = new Date(
        original.data_ativacao
    ).getTime();

    if (
        !Number.isFinite(dataAtivacao) ||
        Date.now() < dataAtivacao
    ) {
        return {
            success: false,
            error: 'A data de ativação ainda não chegou'
        };
    }

    if (confirmar) {
        const confirmou = confirm(
            `Ativar ${original.mlb} na promoção ` +
            `“${original.promotion_name}” por ` +
            `R$ ${Number(original.valor_final).toFixed(2)}?`
        );

        if (!confirmou) {
            return {
                success: false,
                cancelado: true
            };
        }
    }

    let reservado = null;

    try {
        reservado = await reservarAcaoAgenda(
            id,
            [
                'agendada',
                'erro_ativacao'
            ],
            'ativando',
            {
                erro_ativacao: null,
                quantidade_tentativas_ativacao:
                    Number(
                        original.quantidade_tentativas_ativacao ||
                        0
                    ) + 1
            }
        );

        if (!reservado) {
            return {
                success: false,
                error:
                    'Esta promoção já foi processada por outro usuário'
            };
        }

        if (atualizarInterface) {
            await carregarAgendamentosPromocoes();
        }

        let accessToken = tokenAcesso;

        if (!accessToken) {
            const tokenData =
                await window.getValidToken?.();

            accessToken =
                tokenData?.access_token ||
                null;
        }

        if (!accessToken) {
            throw new Error(
                'Token do Mercado Livre não disponível'
            );
        }

        const resultado = await ativarItemPromocao(
            reservado.mlb,
            reservado.promotion_id,
            reservado.promotion_type,
            reservado.valor_final,
            accessToken
        );

        if (!resultado?.success) {
            throw new Error(
                resultado?.error ||
                'Mercado Livre recusou a ativação'
            );
        }

        let offerId =
            resultado.data?.offer_id ||
            null;

        if (!offerId) {
            offerId = await buscarOfferIdDoItem(
                reservado.mlb,
                reservado.promotion_id,
                accessToken
            );
        }

        const {
            error
        } = await supabase
            .from('promocoes_agendadas')
            .update({
                status: 'ativada',
                ativada_por: nomeUsuarioAgenda(),
                ativada_em: new Date().toISOString(),
                offer_id: offerId || null,
                erro_ativacao: null
            })
            .eq('id', id)
            .eq('status', 'ativando');

        if (error) {
            throw error;
        }

        if (confirmar) {
            showToast(
                `✅ ${reservado.mlb} ativado com sucesso`,
                'success'
            );
        }

        return {
            success: true,
            item: reservado
        };
    } catch (error) {
        await supabase
            .from('promocoes_agendadas')
            .update({
                status: 'erro_ativacao',
                erro_ativacao:
                    error.message ||
                    'Erro desconhecido na ativação'
            })
            .eq('id', id)
            .eq('status', 'ativando');

        if (confirmar) {
            showToast(
                `❌ Erro ao ativar: ${error.message}`,
                'error'
            );
        }

        return {
            success: false,
            error:
                error.message ||
                'Erro desconhecido na ativação',
            item: reservado || original
        };
    } finally {
        if (atualizarInterface) {
            await carregarAgendamentosPromocoes();

            fecharModalAvisosPromocoes();

            await verificarAvisosPromocoesAgendadas();
        }
    }
}

    window.executarAtivacaoAgendada = async function(id) {
    return processarAtivacaoAgendada(id, {
        confirmar: true,
        atualizarInterface: true
    });
};

window.executarAtivacoesAgendadasDeHoje =
async function() {
    const pendentes =
        obterAtivacoesAgendadasDisponiveisHoje();

    if (!pendentes.length) {
        showToast(
            '⚠️ Não há promoções de hoje prontas para ativar',
            'warning'
        );

        atualizarBotaoAtivacoesAgendadasHoje();

        return;
    }

    const confirmou = confirm(
        `Ativar agora as ${pendentes.length} ` +
        `promoção(ões) de hoje cujo horário já chegou?`
    );

    if (!confirmou) {
        return;
    }

    const botao = document.getElementById(
        'btnAtivarAgendamentosHoje'
    );

    if (botao) {
        botao.disabled = true;

        botao.innerHTML = `
            <i class="fas fa-spinner fa-spin"></i>
            Ativando 0 de ${pendentes.length}
        `;
    }

    let tokenAcesso = null;

    try {
        const tokenData =
            await window.getValidToken?.();

        tokenAcesso =
            tokenData?.access_token ||
            null;

        if (!tokenAcesso) {
            throw new Error(
                'Token do Mercado Livre não disponível'
            );
        }
    } catch (error) {
        showToast(
            `❌ ${error.message}`,
            'error'
        );

        atualizarBotaoAtivacoesAgendadasHoje();

        return;
    }

    let sucessos = 0;
    const falhas = [];

    for (
        let indice = 0;
        indice < pendentes.length;
        indice++
    ) {
        const item = pendentes[indice];

        if (botao) {
            botao.innerHTML = `
                <i class="fas fa-spinner fa-spin"></i>
                Ativando ${indice + 1} de ${pendentes.length}
            `;
        }

        const resultado =
            await processarAtivacaoAgendada(
                item.id,
                {
                    confirmar: false,
                    atualizarInterface: false,
                    tokenAcesso
                }
            );

        if (resultado.success) {
            sucessos++;
        } else {
            falhas.push(
                `${item.mlb}: ` +
                `${resultado.error || 'erro desconhecido'}`
            );
        }
    }

    await carregarAgendamentosPromocoes();

    fecharModalAvisosPromocoes();

    await verificarAvisosPromocoesAgendadas();

    if (!falhas.length) {
        showToast(
            `✅ ${sucessos} promoção(ões) de hoje ` +
            `ativada(s) com sucesso`,
            'success'
        );

        return;
    }

    if (sucessos > 0) {
        showToast(
            `⚠️ ${sucessos} ativada(s) e ` +
            `${falhas.length} com erro. Veja o console.`,
            'warning'
        );

        log(
            'Falhas na ativação das promoções de hoje',
            'error',
            falhas
        );

        return;
    }

    showToast(
        `❌ Nenhuma promoção foi ativada. ` +
        `${falhas.length} erro(s).`,
        'error'
    );

    log(
        'Falhas na ativação das promoções de hoje',
        'error',
        falhas
    );
};

async function consultarPromocaoAtivaNoML(
    itemId,
    promotionId,
    token
) {
    const normalizar = valor => {
        return String(valor ?? '').trim();
    };

    const url =
        `https://api.mercadolibre.com/` +
        `seller-promotions/items/` +
        `${encodeURIComponent(itemId)}` +
        `?app_version=v2`;

    const worker =
        window.WORKER_URL ||
        'https://purple-bonus-3b1c.andmiotto1998.workers.dev';

    const proxyUrl =
        `${worker}/api/ml/proxy?` +
        `url=${encodeURIComponent(url)}` +
        `&token=${encodeURIComponent(token)}`;

    try {
        const response = await fetch(proxyUrl, {
            method: 'GET',
            cache: 'no-store'
        });

        const respostaTexto = await response.text();

        let dados = null;

        if (respostaTexto) {
            try {
                dados = JSON.parse(respostaTexto);
            } catch {
                dados = respostaTexto;
            }
        }

        if (!response.ok) {
            throw new Error(
                dados?.message ||
                dados?.error ||
                respostaTexto ||
                `Erro HTTP ${response.status} ao consultar a promoção`
            );
        }

        const promocoes = Array.isArray(dados)
            ? dados
            : Array.isArray(dados?.results)
                ? dados.results
                : Array.isArray(dados?.promotions)
                    ? dados.promotions
                    : [];

        const promocao = promocoes.find(item => {
            return (
                normalizar(item.id) ===
                normalizar(promotionId)
            );
        });

        /*
         * Se a promoção não aparecer mais na lista de promoções
         * desse MLB, o anúncio não participa mais dela.
         */
        if (!promocao) {
            log(
                `✅ ${itemId} não aparece mais na promoção ` +
                `${promotionId}. Considerado desativado.`,
                'success'
            );

            return {
                success: true,
                ativa: false,
                promocao: null,
                offerId: null,
                status: null,
                motivo: 'promocao_nao_encontrada'
            };
        }

        const offerId =
            promocao.offer_id ||
            promocao.offerId ||
            promocao.offer?.id ||
            null;

        const status = normalizar(
            promocao.status
        ).toLowerCase();

        /*
         * "started" representa participação ativa do MLB.
         * Não podemos considerar desativada somente porque
         * a resposta não trouxe offer_id.
         */
        const statusAtivos = [
            'started',
            'active',
            'activated',
            'pending'
        ];

        const statusInativos = [
            'candidate',
            'inactive',
            'finished',
            'closed',
            'deleted',
            'removed',
            'cancelled',
            'canceled'
        ];

        let ativa;

        if (statusAtivos.includes(status)) {
            ativa = true;
        } else if (statusInativos.includes(status)) {
            ativa = false;
        } else {
            /*
             * Para status desconhecido, usa o offer_id como
             * evidência complementar de participação.
             */
            ativa = Boolean(offerId);
        }

        log(
            `🔍 Conferência ${itemId} / ${promotionId}: ` +
            `status=${status || 'sem status'}, ` +
            `offer_id=${offerId || 'não encontrado'}, ` +
            `ativa=${ativa ? 'sim' : 'não'}`,
            ativa ? 'warning' : 'success'
        );

        return {
            success: true,
            ativa,
            promocao,
            offerId,
            status,
            motivo: ativa
                ? 'participacao_ativa'
                : 'participacao_inativa'
        };
    } catch (error) {
        log(
            `❌ Erro ao conferir ${itemId} na promoção ` +
            `${promotionId}: ${error.message}`,
            'error'
        );

        return {
            success: false,
            ativa: null,
            promocao: null,
            offerId: null,
            status: null,
            error:
                error.message ||
                'Não foi possível consultar a promoção no Mercado Livre'
        };
    }
}

async function aguardarConfirmacaoDesativacaoML(
    itemId,
    promotionId,
    token,
    quantidadeTentativas = 3
) {
    let ultimaConsulta = null;

    for (
        let tentativa = 1;
        tentativa <= quantidadeTentativas;
        tentativa++
    ) {
        if (tentativa > 1) {
            await new Promise(resolve => {
                setTimeout(resolve, 1500);
            });
        }

        ultimaConsulta = await consultarPromocaoAtivaNoML(
            itemId,
            promotionId,
            token
        );

        if (!ultimaConsulta.success) {
            continue;
        }

        if (!ultimaConsulta.ativa) {
            return {
                success: true,
                desativada: true,
                consulta: ultimaConsulta,
                tentativa
            };
        }

        log(
            `⚠️ ${itemId} ainda está ativo na promoção ` +
            `${promotionId}. Verificação ${tentativa}/` +
            `${quantidadeTentativas}.`,
            'warning'
        );
    }

    if (!ultimaConsulta?.success) {
        return {
            success: false,
            desativada: false,
            error:
                ultimaConsulta?.error ||
                'Não foi possível confirmar o estado da promoção'
        };
    }

    return {
        success: true,
        desativada: false,
        consulta: ultimaConsulta,
        error:
            'A promoção continua ativa no Mercado Livre após a tentativa de desativação'
    };
}
    window.executarDesativacaoAgendada = async function(id) {
    const supabase = obterSupabasePromocoes();

    if (!supabase) {
        showToast(
            '❌ Supabase não conectado',
            'error'
        );

        return;
    }

    const original = agendamentosPromocoes.find(item => {
        return Number(item.id) === Number(id);
    });

    if (!original) {
        showToast(
            '❌ Agendamento não encontrado',
            'error'
        );

        return;
    }

    const dataDesativacao = new Date(
        original.data_desativacao
    ).getTime();

    if (
        !Number.isFinite(dataDesativacao) ||
        Date.now() < dataDesativacao
    ) {
        showToast(
            '⚠️ A data de desativação ainda não chegou',
            'warning'
        );

        return;
    }

    const confirmou = confirm(
        `Verificar e desativar ${original.mlb} da promoção ` +
        `“${original.promotion_name}”?`
    );

    if (!confirmou) {
        return;
    }

    let reservado = null;
    let desativacaoConfirmada = false;

    try {
        reservado = await reservarAcaoAgenda(
            id,
            [
                'ativada',
                'erro_desativacao'
            ],
            'desativando',
            {
                erro_desativacao: null,
                quantidade_tentativas_desativacao:
                    Number(
                        original
                            .quantidade_tentativas_desativacao ||
                        0
                    ) + 1
            }
        );

        if (!reservado) {
            showToast(
                '⚠️ Esta promoção já está sendo processada por outro usuário',
                'warning'
            );

            await carregarAgendamentosPromocoes();

            return;
        }

        /*
         * Atualiza a tabela para mostrar que o item está
         * sendo processado.
         */
        await carregarAgendamentosPromocoes();

        const tokenData =
            await window.getValidToken?.();

        const accessToken =
            tokenData?.access_token ||
            null;

        if (!accessToken) {
            throw new Error(
                'Token do Mercado Livre não disponível'
            );
        }

        /*
         * Antes de desativar, consulta o estado real do MLB
         * dentro da promoção.
         */
        const estadoAntes =
            await consultarPromocaoAtivaNoML(
                reservado.mlb,
                reservado.promotion_id,
                accessToken
            );

        if (!estadoAntes.success) {
            throw new Error(
                estadoAntes.error ||
                'Não foi possível verificar a promoção no Mercado Livre'
            );
        }

        if (!estadoAntes.ativa) {
            /*
             * O MLB já não participa da promoção.
             * Nesse caso, somente corrige o status local.
             */
            desativacaoConfirmada = true;

            log(
                `✅ ${reservado.mlb} já estava desativado no ` +
                `Mercado Livre. Corrigindo status local.`,
                'success'
            );
        } else {
            /*
             * Procura o offer_id para permitir também o fallback
             * de compatibilidade com ofertas antigas.
             */
            let offerId =
                estadoAntes.offerId ||
                reservado.offer_id ||
                null;

            if (!offerId) {
                offerId = await buscarOfferIdDoItem(
                    reservado.mlb,
                    reservado.promotion_id,
                    accessToken
                );
            }

            /*
             * O endpoint correto precisa do tipo da promoção.
             * Primeiro usa o valor salvo no agendamento.
             * Se não existir, usa o tipo retornado pelo ML.
             */
            const promotionType =
                reservado.promotion_type ||
                estadoAntes.promocao?.type ||
                estadoAntes.promocao?.promotion_type ||
                null;

            if (!promotionType) {
                throw new Error(
                    'O tipo da promoção não foi encontrado para realizar a desativação'
                );
            }

            /*
             * Desativa pelo MLB + promoção + tipo.
             * O offer_id é enviado apenas para o fallback.
             */
            const resultadoExclusao =
                await excluirItemPromocao(
                    reservado.mlb,
                    reservado.promotion_id,
                    promotionType,
                    accessToken,
                    offerId
                );

            if (!resultadoExclusao?.success) {
                /*
                 * Não encerra imediatamente porque, em alguns casos,
                 * o Mercado Livre executa a ação mesmo retornando erro.
                 * A confirmação real será feita abaixo.
                 */
                log(
                    `⚠️ O Mercado Livre retornou erro ao desativar ` +
                    `${reservado.mlb}: ` +
                    `${
                        resultadoExclusao?.error ||
                        'erro desconhecido'
                    }`,
                    'warning'
                );
            }

            /*
             * Consulta novamente o Mercado Livre.
             * Só considera concluído quando o status real confirmar.
             */
            const confirmacao =
                await aguardarConfirmacaoDesativacaoML(
                    reservado.mlb,
                    reservado.promotion_id,
                    accessToken,
                    3
                );

            if (!confirmacao.success) {
                throw new Error(
                    confirmacao.error ||
                    'Não foi possível confirmar a desativação'
                );
            }

            if (!confirmacao.desativada) {
                throw new Error(
                    'A promoção continua ativa no Mercado Livre. ' +
                    'Clique novamente em “Desativar” para tentar outra vez.'
                );
            }

            desativacaoConfirmada = true;
            reservado.offer_id = offerId;
        }

        if (!desativacaoConfirmada) {
            throw new Error(
                'O Mercado Livre não confirmou a desativação'
            );
        }

        /*
         * Somente agora, após a confirmação do Mercado Livre,
         * o status local é alterado para concluída.
         */
        const {
            data,
            error
        } = await supabase
            .from('promocoes_agendadas')
            .update({
                status: 'concluida',
                desativada_por: nomeUsuarioAgenda(),
                desativada_em: new Date().toISOString(),
                offer_id:
                    reservado.offer_id ||
                    null,
                erro_desativacao: null
            })
            .eq('id', id)
            .eq('status', 'desativando')
            .select();

        if (error) {
            throw error;
        }

        if (!data?.length) {
            throw new Error(
                'A promoção foi desativada, mas não foi possível atualizar o status local'
            );
        }

        /*
         * A notificação antiga é removida.
         * Como o status agora é "concluida", ela não será
         * criada novamente.
         */
        fecharModalAvisosPromocoes();

        showToast(
            `✅ ${reservado.mlb} está realmente desativado`,
            'success'
        );
    } catch (error) {
        const mensagemErro =
            error.message ||
            'Erro desconhecido na desativação';

        /*
         * Se o Mercado Livre não confirmou, mantém o item como
         * erro_desativacao. Assim, a notificação permanece e o
         * botão pode ser utilizado novamente.
         */
        await supabase
            .from('promocoes_agendadas')
            .update({
                status: 'erro_desativacao',
                erro_desativacao: mensagemErro
            })
            .eq('id', id)
            .eq('status', 'desativando');

        showToast(
            `❌ ${mensagemErro}`,
            'error'
        );

        log(
            `❌ Falha ao desativar agendamento ${id}: ` +
            mensagemErro,
            'error'
        );
    } finally {
        /*
         * Recarrega os agendamentos e recria o aviso apenas se
         * a promoção ainda estiver realmente pendente.
         */
        await carregarAgendamentosPromocoes();

        fecharModalAvisosPromocoes();

        await verificarAvisosPromocoesAgendadas();
    }
};

    window.cancelarAgendamentoPromocao = async function(id) {
        const supabase = obterSupabasePromocoes();
        const item = agendamentosPromocoes.find(a => Number(a.id) === Number(id));
        if (!item || !confirm(`Cancelar o agendamento de ${item.mlb} em “${item.promotion_name}”?`)) return;
        const { data, error } = await supabase.from('promocoes_agendadas').update({
            status: 'cancelada', cancelada_por: nomeUsuarioAgenda(), cancelada_em: new Date().toISOString()
        }).eq('id', id).in('status', ['agendada', 'erro_ativacao']).select();
        if (error) return showToast(`❌ Erro ao cancelar: ${error.message}`, 'error');
        if (!data?.length) return showToast('⚠️ Este agendamento não pode mais ser cancelado', 'warning');
        showToast('✅ Agendamento cancelado', 'success');
        await carregarAgendamentosPromocoes();
    };

    function fecharModalAvisosPromocoes() {
        document.getElementById('modalAvisosPromocoesAgendadas')?.remove();
        modalAvisoAgendamentoAberto = false;
    }
    window.fecharModalAvisosPromocoes = fecharModalAvisosPromocoes;

    async function verificarAvisosPromocoesAgendadas() {
    /*
     * Confere o elemento real, pois o modal pode ter sido
     * removido durante uma troca de tela.
     */
    const modalExistente =
        document.getElementById(
            'modalAvisosPromocoesAgendadas'
        );

    if (!modalExistente) {
        modalAvisoAgendamentoAberto = false;
    }

    if (
        !usuarioPodeReceberAvisoAgenda() ||
        modalAvisoAgendamentoAberto ||
        modalExistente
    ) {
        return;
    }

    const supabase =
        obterSupabasePromocoes();

    if (!supabase) {
        return;
    }

    const agoraIso =
        new Date().toISOString();

    /*
     * Promoções cuja ativação já chegou.
     */
    const {
        data: ativacoes,
        error: erroAtivacoes
    } = await supabase
        .from('promocoes_agendadas')
        .select('*')
        .in(
            'status',
            [
                'agendada',
                'erro_ativacao'
            ]
        )
        .lte(
            'data_ativacao',
            agoraIso
        )
        .order(
            'data_ativacao'
        );

    /*
     * Promoções cuja desativação já chegou.
     */
    const {
        data: desativacoes,
        error: erroDesativacoes
    } = await supabase
        .from('promocoes_agendadas')
        .select('*')
        .in(
            'status',
            [
                'ativada',
                'erro_desativacao'
            ]
        )
        .lte(
            'data_desativacao',
            agoraIso
        )
        .order(
            'data_desativacao'
        );

    if (
        erroAtivacoes ||
        erroDesativacoes
    ) {
        const erro =
            erroAtivacoes ||
            erroDesativacoes;

        log(
            `Erro ao verificar avisos: ${erro.message}`,
            'warning'
        );

        return;
    }

    const pendencias = [
        ...(ativacoes || []).map(item => ({
            ...item,
            acao: 'ativar'
        })),

        ...(desativacoes || []).map(item => ({
            ...item,
            acao: 'desativar'
        }))
    ];

    if (!pendencias.length) {
        return;
    }

    /*
     * Adiciona as pendências encontradas à lista mantida
     * em memória.
     *
     * Isso é necessário para os botões funcionarem mesmo
     * quando a aba de promoções nunca foi aberta.
     */
    const mapaAgendamentos = new Map(
        agendamentosPromocoes.map(item => [
            Number(item.id),
            item
        ])
    );

    pendencias.forEach(item => {
        mapaAgendamentos.set(
            Number(item.id),
            item
        );
    });

    agendamentosPromocoes = [
        ...mapaAgendamentos.values()
    ];

    modalAvisoAgendamentoAberto = true;

    const modal =
        document.createElement('div');

    modal.id =
        'modalAvisosPromocoesAgendadas';

    modal.style.cssText = `
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.68);
        z-index: 100000;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
    `;

    modal.innerHTML = `
        <div
            style="
                background: #ffffff;
                border-radius: 14px;
                width: min(900px, 96vw);
                max-height: 88vh;
                overflow: auto;
                padding: 24px;
                box-shadow:
                    0 15px 50px
                    rgba(0, 0, 0, 0.30);
            "
        >
            <div
                style="
                    display: flex;
                    justify-content: space-between;
                    gap: 15px;
                    align-items: flex-start;
                    margin-bottom: 15px;
                "
            >
                <div>
                    <h3
                        style="
                            margin: 0;
                            color: #343a40;
                        "
                    >
                        <i
                            class="fas fa-bell"
                            style="color:#f0ad4e;"
                        ></i>

                        Promoções aguardando ação
                    </h3>

                    <p
                        class="text-muted"
                        style="margin:6px 0 0;"
                    >
                        Bruna ou Ronald deve executar
                        as ações abaixo.
                    </p>
                </div>

                <button
                    type="button"
                    class="btn btn-sm btn-secondary"
                    onclick="fecharModalAvisosPromocoes()"
                >
                    Lembrar depois
                </button>
            </div>

            <div class="table-responsive">
                <table
                    class="
                        table
                        table-bordered
                        table-hover
                    "
                >
                    <thead>
                        <tr>
                            <th>Ação</th>
                            <th>MLB</th>
                            <th>Promoção</th>
                            <th>Data prevista</th>
                            <th></th>
                        </tr>
                    </thead>

                    <tbody>
                        ${pendencias.map(item => {
                            const ativar =
                                item.acao === 'ativar';

                            const funcao =
                                ativar
                                    ? 'executarAtivacaoAgendada'
                                    : 'executarDesativacaoAgendada';

                            const texto =
                                ativar
                                    ? 'Ativar'
                                    : 'Desativar';

                            const cor =
                                ativar
                                    ? 'success'
                                    : 'danger';

                            const dataPrevista =
                                ativar
                                    ? item.data_ativacao
                                    : item.data_desativacao;

                            return `
                                <tr>
                                    <td>
                                        <span
                                            class="
                                                badge
                                                badge-${cor}
                                            "
                                        >
                                            ${
                                                ativar
                                                    ? 'ATIVAR'
                                                    : 'DESATIVAR'
                                            }
                                        </span>
                                    </td>

                                    <td>
                                        <strong>
                                            ${escaparHtmlAgenda(
                                                item.mlb
                                            )}
                                        </strong>
                                    </td>

                                    <td>
                                        ${escaparHtmlAgenda(
                                            item.promotion_name
                                        )}
                                    </td>

                                    <td>
                                        ${formatarDataAgenda(
                                            dataPrevista
                                        )}
                                    </td>

                                    <td>
                                        <button
                                            type="button"
                                            class="
                                                btn
                                                btn-sm
                                                btn-${cor}
                                            "
                                            onclick="
                                                ${funcao}(
                                                    ${Number(item.id)}
                                                )
                                            "
                                        >
                                            ${texto}
                                        </button>
                                    </td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
}
    window.verificarAvisosPromocoesAgendadas = verificarAvisosPromocoesAgendadas;

    function iniciarMonitorGlobalAvisosPromocoes() {
    /*
     * Impede que o sistema crie dois ou mais monitores
     * caso o arquivo seja carregado novamente.
     */
    if (
        window
            .__monitorGlobalAvisosPromocoesIniciado
    ) {
        return;
    }

    window.__monitorGlobalAvisosPromocoesIniciado =
        true;

    const verificarAgora = () => {
        verificarAvisosPromocoesAgendadas()
            .catch(error => {
                log(
                    `Erro no monitor global de promoções: ` +
                    `${error.message}`,
                    'warning'
                );
            });
    };

    /*
     * Verifica a cada 30 segundos, independentemente
     * da aba interna que Ronald ou Bruna estiver usando.
     */
    timerAvisosAgendamento = setInterval(
        verificarAgora,
        30000
    );

    /*
     * Verifica quando o usuário volta para a janela.
     */
    window.addEventListener(
        'focus',
        verificarAgora
    );

    /*
     * Verifica quando a página volta a ficar visível.
     */
    document.addEventListener(
        'visibilitychange',
        () => {
            if (!document.hidden) {
                verificarAgora();
            }
        }
    );

    /*
     * Verifica ao clicar em botões, links e abas internas.
     * O pequeno intervalo permite que a nova aba termine
     * de abrir antes do modal ser mostrado.
     */
    document.addEventListener(
        'click',
        event => {
            const elemento =
                event.target?.closest?.(
                    [
                        'button',
                        'a',
                        '[role="tab"]',
                        '[data-tab]',
                        '[onclick]'
                    ].join(', ')
                );

            if (!elemento) {
                return;
            }

            setTimeout(
                verificarAgora,
                500
            );
        },
        true
    );

    /*
     * Primeiras verificações após o carregamento.
     * A segunda também cobre o caso em que o arquivo
     * carregou antes de o login terminar.
     */
    setTimeout(
        verificarAgora,
        1000
    );

    setTimeout(
        verificarAgora,
        5000
    );
}

window.iniciarMonitorGlobalAvisosPromocoes = iniciarMonitorGlobalAvisosPromocoes;

    // ============================================================
    // FUNÇÕES: BARRA DE PROGRESSO
    // ============================================================
    function mostrarBarraProgresso(titulo, subtitulo) {
        log(`Mostrando barra de progresso: ${titulo}`, 'debug');
        let barra = document.getElementById('progressoContainer');
        if (!barra) {
            barra = document.createElement('div');
            barra.id = 'progressoContainer';
            barra.style.cssText = `
                position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                background: rgba(0,0,0,0.7); z-index: 99999;
                display: flex; align-items: center; justify-content: center; flex-direction: column;
            `;
            barra.innerHTML = `
                <div style="background: white; border-radius: 16px; padding: 40px 50px; max-width: 600px; width: 90%; text-align: center;">
                    <div style="margin-bottom: 20px;">
                        <i class="fas fa-spinner fa-spin" style="font-size: 48px; color: #00ADEE;"></i>
                    </div>
                    <h3 id="progressoTitulo" style="margin: 0 0 10px 0; color: #343a40; font-size: 18px;">${titulo}</h3>
                    <p id="progressoSubtitulo" style="margin: 0 0 20px 0; color: #6c757d; font-size: 14px;">${subtitulo}</p>
                    <div style="width: 100%; height: 12px; background: #e9ecef; border-radius: 10px; overflow: hidden; margin-bottom: 15px;">
                        <div id="barraProgressoFill" style="width: 0%; height: 100%; background: linear-gradient(90deg, #00ADEE, #80D6F7); border-radius: 10px; transition: width 0.5s ease;"></div>
                    </div>
                    <div style="display: flex; justify-content: space-between; font-size: 13px; color: #6c757d;">
                        <span id="progressoPorcentagem">0%</span>
                        <span id="progressoDetalhes">0 / 0</span>
                    </div>
                </div>
            `;
            document.body.appendChild(barra);
            log('Barra de progresso criada', 'debug');
        } else {
            barra.style.display = 'flex';
            log('Barra de progresso reutilizada', 'debug');
        }
        return barra;
    }

    function atualizarProgresso(percentual, titulo, subtitulo, detalhes) {
        const fill = document.getElementById('barraProgressoFill');
        const pct = document.getElementById('progressoPorcentagem');
        const det = document.getElementById('progressoDetalhes');
        const tit = document.getElementById('progressoTitulo');
        const sub = document.getElementById('progressoSubtitulo');
        
        if (fill) fill.style.width = Math.min(percentual, 100) + '%';
        if (pct) pct.textContent = Math.round(Math.min(percentual, 100)) + '%';
        if (det) det.textContent = detalhes || '';
        if (tit) tit.textContent = titulo || 'Processando...';
        if (sub) sub.textContent = subtitulo || 'Aguarde...';
        
        // Log a cada 20%
        if (Math.round(percentual) % 20 === 0 && Math.round(percentual) > 0) {
            log(`Progresso: ${Math.round(percentual)}% - ${titulo}`, 'debug');
        }
    }

    function fecharBarraProgresso() {
        log('Fechando barra de progresso', 'debug');
        const barra = document.getElementById('progressoContainer');
        if (barra) {
            barra.style.display = 'none';
        }
    }

    // ============================================================
    // EVENTO: ATUALIZAR BOTÃO QUANDO CHECKBOX MUDA
    // ============================================================
    document.addEventListener('change', function(e) {
        if (e.target.classList.contains('bulk-item-checkbox')) {
            atualizarBotaoAtivacao();
        }
    });

    iniciarMonitorGlobalAvisosPromocoes();

    // ============================================================
    // INICIALIZAÇÃO
    // ============================================================
    log('═══════════════════════════════════════════════════════════', 'info');
    log('📢 MÓDULO DE PROMOÇÕES CARREGADO', 'success');
    log(`📌 Data/Hora: ${new Date().toLocaleString()}`, 'info');
    log('═══════════════════════════════════════════════════════════', 'info');

})();