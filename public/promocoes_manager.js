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
    window.abrirGestaoPromocoesLote = function() {
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
        carregarPromocoes();
        carregarMLBsBloqueados();

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

    // ============================================================
    // CRIAÇÃO DA INTERFACE
    // ============================================================
    function criarInterfaceBulk() {
        log('Criando interface...', 'debug');
        const div = document.createElement('div');
        div.id = 'bulkPromotionSystem';
        div.className = 'container';
        div.style.cssText = 'display:block; max-width:1400px; margin:0 auto; padding:0 20px;';

        div.innerHTML = `
            <header class="main-header">
                <div class="container">
                    <div class="header-content">
                        <h1 style="display:flex; align-items:center; gap:10px;">
                            <img src="logo.png" alt="Wheel Tech" style="height:35px; width:auto;">
                            <span>Gestão de Promoções em Lote</span>
                        </h1>
                        <div class="user-info">
                            <div class="user-avatar" id="bulkUserAvatar">U</div>
                            <div>
                                <div style="font-weight:600;" id="bulkUserName">Usuário</div>
                                <div style="font-size:12px; color:#6c757d;" id="bulkUserRole"></div>
                                <div class="d-flex gap-2 mt-2">
                                    <button onclick="fecharGestaoPromocoesLote()" class="btn btn-primary btn-sm">← Voltar ao Menu</button>
                                    <button onclick="handleLogout()" class="btn btn-secondary btn-sm">Sair</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            <!-- CONFIGURAR REGRAS -->
            <div class="card mb-4">
                <div class="card-header">
                    <h2 class="card-title">
                        <i class="fas fa-cog"></i> Configurar Análise
                    </h2>
                </div>
                <div class="card-body">
                    <div class="row">
                        <div class="col-md-5">
                            <div class="form-group">
                                <label><i class="fas fa-arrow-right"></i> Promoção de Origem *</label>
                                <select id="bulkPromocaoOrigem" class="form-control">
                                    <option value="">Selecione...</option>
                                </select>
                                <small class="text-muted">Itens ativos nesta promoção serão analisados</small>
                            </div>
                        </div>
                        <div class="col-md-5">
                            <div class="form-group">
                                <label><i class="fas fa-arrow-left"></i> Promoção de Destino *</label>
                                <select id="bulkPromocaoDestino" class="form-control">
                                    <option value="">Selecione...</option>
                                </select>
                                <small class="text-muted">Itens serão ativados nesta promoção</small>
                            </div>
                        </div>
                        <div class="col-md-2" style="display:flex; align-items:flex-end;">
                            <button class="btn btn-primary btn-block" onclick="analisarItens()" style="width:100%;">
                                <i class="fas fa-search"></i> Analisar
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- MLBs BLOQUEADOS -->
            <div class="card mb-4">
                <div class="card-header">
                    <h2 class="card-title">
                        <i class="fas fa-ban"></i> MLBs Bloqueados
                    </h2>
                    <div class="d-flex flex-wrap gap-2">
                        <button class="btn btn-sm btn-success" onclick="adicionarMLBBloqueado()">
                            <i class="fas fa-plus"></i> Adicionar
                        </button>
                        <button class="btn btn-sm btn-danger" onclick="limparMLBsBloqueados()">
                            <i class="fas fa-trash"></i> Limpar Todos
                        </button>
                        <button class="btn btn-sm btn-primary" onclick="exportarMLBsBloqueados()">
                            <i class="fas fa-file-export"></i> Exportar
                        </button>
                        <button class="btn btn-sm btn-info" onclick="importarMLBsBloqueados()">
                            <i class="fas fa-file-import"></i> Importar
                        </button>
                    </div>
                </div>
                <div class="card-body">
                    <div class="form-group">
                        <label>MLB's bloqueados (separados por espaço)</label>
                        <input type="text" id="bulkMLBsBloqueados" class="form-control" 
                            placeholder="Ex: MLB123 MLB456 MLB789" 
                            onchange="salvarMLBsBloqueadosManuais()">
                        <small class="text-muted">
                            <span class="badge badge-danger" id="contadorMLBs">0</span> MLBs bloqueados
                        </small>
                    </div>
                    <div id="bulkMLBsBloqueadosLista" class="mt-2" style="display:flex; flex-wrap:wrap; gap:5px;"></div>
                </div>
            </div>

            <!-- RESULTADO DA ANÁLISE -->
            <div class="card mb-4">
                <div class="card-header">
                    <h2 class="card-title">
                        <i class="fas fa-chart-bar"></i> Resultado da Análise
                    </h2>
                    <div class="d-flex flex-wrap gap-2">
                        <button class="btn btn-success" onclick="executarAtivacaoEmMassa()" id="btnAtivarMassa" disabled>
                            <i class="fas fa-play"></i> Ativar em Massa (0)
                        </button>
                        <button class="btn btn-info" onclick="exportarAnaliseExcel()">
                            <i class="fas fa-file-excel"></i> Exportar
                        </button>
                    </div>
                </div>
                <div class="card-body">
                    <!-- Resumo -->
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

                    <!-- Tabela -->
                    <div id="bulkTabelaContainer" class="table-responsive hidden">
                        <table class="table table-striped table-hover" id="bulkItensTable">
                            <thead>
                                <tr>
                                    <th style="width:40px;"><input type="checkbox" id="bulkSelectAll" onchange="selecionarTodosItens()"></th>
                                    <th>MLB</th>
                                    <th style="text-align:right;">Preço Final Origem</th>
                                    <th style="text-align:center;">% Origem</th>
                                    <th style="text-align:right;">Preço Final Destino</th>
                                    <th style="text-align:center;">% Destino</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody id="bulkItensBody">
                                <tr>
                                    <td colspan="7" class="text-center py-4 text-muted">
                                        <i class="fas fa-info-circle"></i> Selecione as promoções e clique em "Analisar"
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

window.analisarItens = async function() {
    const origemId = document.getElementById('bulkPromocaoOrigem')?.value;
    const destinoId = document.getElementById('bulkPromocaoDestino')?.value;
    
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

    mostrarBarraProgresso('Buscando interseção...', 'Carregando dados...');

    try {
        // ============================================================
        // PASSO 1: Buscar ATIVOS na origem (status=started)
        // ============================================================
        atualizarProgresso(20, 'Buscando ativos na origem...', `Promoção: ${promoOrigem.name}`, '20%');
        
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
        
        const setAtivosOrigem = new Set(ativosOrigem.map(item => item.id));
        log(`📊 ${setAtivosOrigem.size} MLBs ativos na origem`, 'info');
        
        // ============================================================
        // PASSO 2: Buscar CANDIDATOS no destino (status=candidate)
        // ============================================================
        atualizarProgresso(40, 'Buscando candidatos no destino...', `Promoção: ${promoDestino.name}`, '40%');
        
        const candidatosDestino = await buscarItensPromocaoPorStatus(
            destinoId, 
            promoDestino.type, 
            'candidate', 
            tokenData.access_token
        );
        
        const setCandidatosDestino = new Set(candidatosDestino.map(item => item.id));
        log(`📊 ${setCandidatosDestino.size} MLBs candidatos no destino`, 'info');
        
        // ============================================================
        // PASSO 3: Buscar PROGRAMADOS no destino (status=pending)
        // ============================================================
        atualizarProgresso(60, 'Buscando programados no destino...', `Promoção: ${promoDestino.name}`, '60%');
        
        const programadosDestino = await buscarItensPromocaoPorStatus(
            destinoId, 
            promoDestino.type, 
            'pending', 
            tokenData.access_token
        );
        
        const setProgramadosDestino = new Set(programadosDestino.map(item => item.id));
        log(`📊 ${setProgramadosDestino.size} MLBs programados no destino`, 'info');
        
        // ============================================================
        // PASSO 4: Unir candidatos + programados
        // ============================================================
        const setDestino = new Set([...setCandidatosDestino, ...setProgramadosDestino]);
        log(`📊 Total no destino (candidatos + programados): ${setDestino.size}`, 'info');
        
        // Criar mapa com os dados de destino
        const mapDestino = new Map();
        for (const item of candidatosDestino) {
            mapDestino.set(item.id, { ...item, tipo: 'candidato' });
        }
        for (const item of programadosDestino) {
            if (mapDestino.has(item.id)) {
                // Se já existe como candidato, mantém (candidato tem prioridade)
                continue;
            }
            mapDestino.set(item.id, { ...item, tipo: 'programado' });
        }
        
        // ============================================================
        // PASSO 5: Encontrar a INTERSEÇÃO
        // ============================================================
        atualizarProgresso(80, 'Encontrando interseção...', 'Processando...', '80%');
        
        const interseccao = [];
        let candidatosCount = 0;
        let programadosCount = 0;
        let totalProcessados = 0;
        const totalAtivos = ativosOrigem.length;
        
        for (const item of ativosOrigem) {
            totalProcessados++;
            
            if (totalProcessados % 10 === 0 || totalProcessados === totalAtivos) {
                const pct = 80 + (totalProcessados / totalAtivos) * 15;
                atualizarProgresso(
                    Math.min(pct, 95),
                    `Processando ${totalProcessados}/${totalAtivos}`,
                    `${interseccao.length} encontrados`,
                    `${Math.round(pct)}%`
                );
            }
            
            const mlb = item.id;
            
            // Verificar se está no destino (candidato ou programado)
            if (!setDestino.has(mlb)) {
                continue;
            }
            
            const dadosDestino = mapDestino.get(mlb);
            if (!dadosDestino) continue;
            
            // Buscar preço detalhado
            const precoDetalhado = await buscarPrecoNaPromocaoDestino(mlb, destinoId, tokenData.access_token);
            
            let precoDestino = dadosDestino.price || 0;
            let precoOriginalDestino = dadosDestino.original_price || 0;
            let percentDestino = dadosDestino.seller_percentage || 0;
            let statusDestino = dadosDestino.status || 'unknown';
            let tipo = dadosDestino.tipo || 'candidato';
            
            // Se o preço detalhado tiver informações melhores
            if (precoDetalhado) {
                if (precoDetalhado.price > 0) precoDestino = precoDetalhado.price;
                if (precoDetalhado.original_price > 0) precoOriginalDestino = precoDetalhado.original_price;
                if (precoDetalhado.seller_percentage > 0) percentDestino = precoDetalhado.seller_percentage;
                if (precoDetalhado.status) statusDestino = precoDetalhado.status;
            }
            
            // Contar
            if (tipo === 'candidato') candidatosCount++;
            else if (tipo === 'programado') programadosCount++;
            
            // Se ainda não tem preço, tentar usar o preço original com desconto padrão
            if (precoDestino === 0 && precoOriginalDestino > 0) {
                precoDestino = precoOriginalDestino * 0.9;
            }
            
            const statusLabel = tipo === 'candidato' ? '📌 Candidato' : '⏳ Programada';
            
            interseccao.push({
                mlb: mlb,
                precoOrigem: item.price || 0,
                precoDestino: precoDestino,
                precoOriginalDestino: precoOriginalDestino,
                percentOrigem: item.seller_percentage || 0,
                percentDestino: percentDestino,
                statusOrigem: item.status || 'started',
                statusDestino: statusDestino,
                statusLabel: statusLabel,
                tipo: tipo
            });
        }
        
        // ============================================================
        // PASSO 6: Mostrar resultado
        // ============================================================
        log('═══════════════════════════════════════════════════════════', 'info');
        log('📊 RESULTADO DA ANÁLISE:', 'info');
        log(`   📦 Ativos na ORIGEM: ${ativosOrigem.length}`, 'info');
        log(`   📦 Candidatos no DESTINO: ${setCandidatosDestino.size}`, 'info');
        log(`   📦 Programados no DESTINO: ${setProgramadosDestino.size}`, 'info');
        log(`   🔄 INTERSEÇÃO TOTAL: ${interseccao.length}`, 'success');
        log(`   📌 Candidatos: ${candidatosCount}`, 'info');
        log(`   ⏳ Programados: ${programadosCount}`, 'info');
        log('═══════════════════════════════════════════════════════════', 'info');
        
        // Log dos primeiros itens
        if (interseccao.length > 0) {
            log(`📝 Primeiros 5 itens da interseção:`, 'debug');
            interseccao.slice(0, 5).forEach(item => {
                log(`  - ${item.mlb}: Origem R$ ${item.precoOrigem.toFixed(2)} → Destino R$ ${item.precoDestino.toFixed(2)} (${item.statusLabel})`, 'debug');
            });
        }
        
        atualizarProgresso(100, '✅ Concluído!', `${interseccao.length} MLBs na interseção`, '✅');
        
        // Renderizar tabela
        renderizarTabelaInterseccao(interseccao);
        
        document.getElementById('bulkTotalItens').textContent = interseccao.length;
        document.getElementById('bulkElegiveis').textContent = interseccao.length;
        document.getElementById('bulkBloqueados').textContent = 0;
        document.getElementById('bulkJaAtivos').textContent = 0;
        
        document.getElementById('bulkResumo').classList.remove('hidden');
        document.getElementById('bulkTabelaContainer').classList.remove('hidden');
        
        const btnAtivar = document.getElementById('btnAtivarMassa');
        if (btnAtivar) {
            btnAtivar.disabled = interseccao.length === 0;
            btnAtivar.innerHTML = `<i class="fas fa-play"></i> Ativar Todos (${interseccao.length})`;
        }
        
        setTimeout(fecharBarraProgresso, 1500);
        
        if (interseccao.length > 0) {
            showToast(`✅ ${interseccao.length} MLBs (${candidatosCount} candidatos, ${programadosCount} programados)`, 'success');
        } else {
            showToast('⚠️ Nenhum MLB encontrado na interseção', 'warning');
        }

    } catch (error) {
        log(`❌ Erro: ${error.message}`, 'error');
        console.error(error);
        fecharBarraProgresso();
        showToast('Erro: ' + error.message, 'error');
    }
};

// ============================================================
// FUNÇÃO: RENDERIZAR TABELA DA INTERSEÇÃO
// ============================================================
function renderizarTabelaInterseccao(itens) {
    const tbody = document.getElementById('bulkItensBody');
    if (!tbody) return;
    
    if (!itens || itens.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-muted">Nenhum MLB encontrado na interseção</td></tr>`;
        return;
    }
    
    tbody.innerHTML = '';
    
    itens.forEach((item, index) => {
        const tr = document.createElement('tr');
        
        let bgColor = '#ffffff';
        let statusColor = '#6c757d';
        let statusText = item.statusLabel || 'Desconhecido';
        
        if (item.tipo === 'programado') {
            bgColor = '#fff3cd';
            statusColor = '#856404';
        } else if (item.tipo === 'candidato') {
            bgColor = '#d4edda';
            statusColor = '#155724';
        }
        
        tr.style.backgroundColor = bgColor;
        
        tr.innerHTML = `
            <td style="text-align:center;">
                <input type="checkbox" class="bulk-item-checkbox" data-index="${index}" checked>
            </td>
            <td><strong>${item.mlb || 'N/A'}</strong></td>
            <td style="text-align:right; font-weight:600; color:#007bff;">
                R$ ${(item.precoOrigem || 0).toFixed(2)}
            </td>
            <td style="text-align:center;">${(item.percentOrigem || 0)}%</td>
            <td style="text-align:right; font-weight:600; color:#28a745;">
                R$ ${(item.precoDestino || 0).toFixed(2)}
            </td>
            <td style="text-align:center;">${(item.percentDestino || 0)}%</td>
            <td style="text-align:center; font-size:12px; font-weight:600; color:${statusColor};">
                ${statusText}
                <br><small style="color:#6c757d;">✅ Ativo na origem</small>
            </td>
        `;
        
        tbody.appendChild(tr);
    });
    
    document.querySelectorAll('.bulk-item-checkbox').forEach(cb => cb.checked = true);
    atualizarBotaoAtivacao();
}

// ============================================================
// FUNÇÃO: BUSCAR TODOS OS ITENS DA PROMOÇÃO (SEM FILTRO DE STATUS)
// ============================================================
async function buscarTodosItensPromocao(promotionId, promotionType, token) {
    log(`🔄 Buscando TODOS os itens da promoção ${promotionId}...`, 'info');
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
                            seller_percentage: item.seller_percentage || 0
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
    
    return itens;
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

// ============================================================
// FUNÇÃO: BUSCAR ITENS DA PROMOÇÃO POR STATUS
// ============================================================
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
            
            // Só adiciona o filtro de status se não for 'todos'
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
                            seller_percentage: item.seller_percentage || 0
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
                // Se falhar com filtro de status, tentar sem filtro
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
// FUNÇÃO: ATIVAR ITEM EM UMA PROMOÇÃO
// ============================================================
async function ativarItemPromocao(itemId, promotionId, price, token) {
    try {
        const url = `https://api.mercadolibre.com/seller-promotions/offers?app_version=v2`;
        const body = {
            promotion_id: promotionId,
            item_id: itemId,
            price: Math.round(price * 100) // Converter para centavos
        };
        
        const proxyUrl = `${window.WORKER_URL || 'https://purple-bonus-3b1c.andmiotto1998.workers.dev'}/api/ml/proxy?url=${encodeURIComponent(url)}&token=${token}`;
        const response = await fetch(proxyUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        
        if (response.ok) {
            return { success: true, data: await response.json() };
        } else {
            const errorText = await response.text();
            return { success: false, error: errorText };
        }
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// ============================================================
// FUNÇÃO: EXCLUIR ITEM DE UMA PROMOÇÃO
// ============================================================
async function excluirItemPromocao(offerId, token) {
    try {
        const url = `https://api.mercadolibre.com/seller-promotions/offers/${offerId}?app_version=v2`;
        const proxyUrl = `${window.WORKER_URL || 'https://purple-bonus-3b1c.andmiotto1998.workers.dev'}/api/ml/proxy?url=${encodeURIComponent(url)}&token=${token}`;
        const response = await fetch(proxyUrl, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            return { success: true };
        } else {
            const errorText = await response.text();
            return { success: false, error: errorText };
        }
    } catch (error) {
        return { success: false, error: error.message };
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
// FUNÇÃO: BUSCAR PREÇO NA PROMOÇÃO DESTINO
// ============================================================
async function buscarPrecoNaPromocaoDestino(itemId, promotionId, token) {
    try {
        // Primeiro tenta pela API de promoções do item
        const url = `https://api.mercadolibre.com/seller-promotions/items/${itemId}?app_version=v2`;
        const proxyUrl = `${window.WORKER_URL || 'https://purple-bonus-3b1c.andmiotto1998.workers.dev'}/api/ml/proxy?url=${encodeURIComponent(url)}&token=${token}`;
        const response = await fetch(proxyUrl);
        
        if (response.ok) {
            const data = await response.json();
            // Procurar a promoção específica
            const promocao = data.find(p => p.id === promotionId);
            if (promocao) {
                // Se o status é 'started' ou 'pending' ou 'candidate', pega o price
                let preco = promocao.price || 0;
                
                // Se price for 0, tenta suggested_discounted_price
                if (preco === 0 && promocao.suggested_discounted_price) {
                    preco = promocao.suggested_discounted_price;
                }
                
                // Se ainda for 0, tenta min_discounted_price
                if (preco === 0 && promocao.min_discounted_price) {
                    preco = promocao.min_discounted_price;
                }
                
                return {
                    price: preco,
                    original_price: promocao.original_price || 0,
                    seller_percentage: promocao.seller_percentage || 0,
                    status: promocao.status || 'unknown'
                };
            }
        }
        
        // Fallback: tentar buscar o preço do item normalmente
        const urlItem = `https://api.mercadolibre.com/items/${itemId}`;
        const proxyUrlItem = `${window.WORKER_URL || 'https://purple-bonus-3b1c.andmiotto1998.workers.dev'}/api/ml/proxy?url=${encodeURIComponent(urlItem)}&token=${token}`;
        const responseItem = await fetch(proxyUrlItem);
        if (responseItem.ok) {
            const data = await responseItem.json();
            return {
                price: data.price || 0,
                original_price: data.original_price || 0,
                seller_percentage: 0,
                status: 'fallback'
            };
        }
        
        return null;
    } catch (error) {
        log(`⚠️ Erro ao buscar preço do item ${itemId}: ${error.message}`, 'warning');
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
    
    const selecionados = document.querySelectorAll('.bulk-item-checkbox:checked').length;
    
    if (selecionados > 0) {
        btnAtivar.disabled = false;
        btnAtivar.innerHTML = `<i class="fas fa-play"></i> Ativar em Massa (${selecionados})`;
    } else {
        btnAtivar.disabled = true;
        btnAtivar.innerHTML = `<i class="fas fa-play"></i> Ativar em Massa (0)`;
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
    // FUNÇÃO: EXECUTAR ATIVAÇÃO EM MASSA
    // ============================================================
    window.executarAtivacaoEmMassa = async function() {
        log('🚀 EXECUTANDO ATIVAÇÃO EM MASSA', 'info');
        log('═══════════════════════════════════════════════════════════', 'info');
        
        const selecionados = [];
        document.querySelectorAll('.bulk-item-checkbox:checked').forEach(cb => {
            const index = parseInt(cb.dataset.index);
            if (!isNaN(index) && itensAnalisados[index]) {
                selecionados.push(itensAnalisados[index]);
            }
        });
        
        log(`📊 ${selecionados.length} itens selecionados`, 'info');
        
        if (selecionados.length === 0) {
            log('⚠️ Nenhum item selecionado', 'warning');
            showToast('⚠️ Nenhum item selecionado', 'warning');
            return;
        }
        
        const destinoId = document.getElementById('bulkPromocaoDestino')?.value;
        if (!destinoId) {
            log('⚠️ Destino não selecionado', 'warning');
            showToast('⚠️ Selecione a promoção de destino', 'warning');
            return;
        }
        
        // Confirmar
        if (!confirm(`Tem certeza que deseja ativar ${selecionados.length} itens na promoção?`)) {
            log('Ativação cancelada pelo usuário', 'info');
            return;
        }
        
        const tokenData = await window.getValidToken?.();
        if (!tokenData?.access_token) {
            log('❌ Token não disponível', 'error');
            showToast('❌ Token não disponível', 'error');
            return;
        }
        
        mostrarBarraProgresso(
            `Ativando ${selecionados.length} itens...`,
            'Aguarde enquanto os itens são ativados'
        );
        
        try {
            let sucessos = 0;
            let falhas = 0;
            const falhasLista = [];
            
            const batchSize = 10;
            const totalBatches = Math.ceil(selecionados.length / batchSize);
            log(`Processando em ${totalBatches} lotes de ${batchSize}`, 'info');
            
            for (let i = 0; i < selecionados.length; i += batchSize) {
                const batch = selecionados.slice(i, i + batchSize);
                const batchNum = Math.floor(i / batchSize) + 1;
                
                const pct = (i / selecionados.length) * 100;
                atualizarProgresso(
                    pct,
                    `Lote ${batchNum}/${totalBatches}`,
                    `${sucessos} sucessos, ${falhas} falhas`,
                    `${i + batch.length} / ${selecionados.length}`
                );
                
                log(`📦 Processando lote ${batchNum}/${totalBatches} (${batch.length} itens)...`, 'info');
                
                const promises = batch.map(async (item) => {
                    const mlb = item.mlb;
                    const preco = item.precoDestino;
                    
                    if (!mlb || !preco) {
                        falhas++;
                        falhasLista.push(`${mlb || 'desconhecido'}: preço inválido`);
                        return false;
                    }
                    
                    const url = `https://api.mercadolibre.com/seller-promotions/offers?app_version=v2`;
                    const body = {
                        promotion_id: destinoId,
                        item_id: mlb,
                        price: Math.round(preco * 100)
                    };
                    
                    try {
                        const proxyUrl = `${window.WORKER_URL || 'https://purple-bonus-3b1c.andmiotto1998.workers.dev'}/api/ml/proxy?url=${encodeURIComponent(url)}&token=${tokenData.access_token}`;
                        const response = await fetch(proxyUrl, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(body)
                        });
                        
                        if (response.ok) {
                            sucessos++;
                            log(`   ✅ ${mlb} ativado`, 'debug');
                            return true;
                        } else {
                            const errorText = await response.text();
                            falhas++;
                            falhasLista.push(`${mlb}: ${errorText}`);
                            log(`   ❌ ${mlb} falhou: ${errorText}`, 'warning');
                            return false;
                        }
                    } catch (err) {
                        falhas++;
                        falhasLista.push(`${mlb}: ${err.message}`);
                        log(`   ❌ ${mlb} erro: ${err.message}`, 'warning');
                        return false;
                    }
                });
                
                await Promise.all(promises);
                log(`Lote ${batchNum} concluído: ${sucessos} sucessos, ${falhas} falhas`, 'info');
            }
            
            // Log do resultado final
            log('═══════════════════════════════════════════════════════════', 'info');
            log('📊 RESULTADO DA ATIVAÇÃO:', 'info');
            log(`   ✅ Sucessos: ${sucessos}`, 'success');
            log(`   ❌ Falhas: ${falhas}`, 'warning');
            if (falhasLista.length > 0) {
                log(`   📝 Falhas detalhadas:`, 'debug');
                falhasLista.slice(0, 5).forEach(f => log(`      - ${f}`, 'debug'));
                if (falhasLista.length > 5) {
                    log(`      ... e mais ${falhasLista.length - 5} falhas`, 'debug');
                }
            }
            log('═══════════════════════════════════════════════════════════', 'info');
            
            atualizarProgresso(100, '✅ Ativação concluída!', `${sucessos} sucessos, ${falhas} falhas`, '✅');
            
            setTimeout(fecharBarraProgresso, 1500);
            
            showToast(`✅ Ativação: ${sucessos} sucessos, ${falhas} falhas`, sucessos > 0 ? 'success' : 'error');
            
            // Recarregar análise
            log('🔄 Recarregando análise...', 'info');
            setTimeout(window.analisarItens, 2000);
            
        } catch (error) {
            log(`❌ Erro na ativação: ${error.message}`, 'error');
            console.error(error);
            fecharBarraProgresso();
            showToast('Erro na ativação: ' + error.message, 'error');
        }
    };

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

    // ============================================================
    // INICIALIZAÇÃO
    // ============================================================
    log('═══════════════════════════════════════════════════════════', 'info');
    log('📢 MÓDULO DE PROMOÇÕES CARREGADO', 'success');
    log(`📌 Data/Hora: ${new Date().toLocaleString()}`, 'info');
    log('═══════════════════════════════════════════════════════════', 'info');

})();