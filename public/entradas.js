// ============================================
// SISTEMA DE ENTRADAS - VERSÃO COMPLETA
// ============================================

let entradasCards = [];
let filtroEntradasAtual = 'todos';
let entradaEmProcessamento = null; // guarda o ID do card sendo processado

// ===== ABRIR SISTEMA DE ENTRADAS =====
window.abrirSistemaEntradas = function() {
    if (!currentUser) {
        showToast('⚠️ Faça login primeiro', 'warning');
        return;
    }

    // Esconder menu e outros sistemas
    const menuSystem = document.getElementById('menuSystem');
    if (menuSystem) menuSystem.classList.add('hidden');

    const sistemasIds = [
        'mainSystem', 'salesSystem', 'reembolsosSystem', 'caixaSystem',
        'reviewsSystem', 'folgasSystem', 'shippingSystem', 'estoqueSystem',
        'feedbackSystem', 'perguntasSystem', 'estoqueGestaoSystem', 'nfeSystem',
        'precificacaoSystem'
    ];
    sistemasIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });

    const entradasSystem = document.getElementById('entradasSystem');
    if (entradasSystem) entradasSystem.classList.remove('hidden');

    // Atualizar dados do usuário
    document.getElementById('entradasUserName').textContent = currentUser.name;
    document.getElementById('entradasUserAvatar').textContent = currentUser.avatar;
    document.getElementById('entradasUserRole').textContent = currentUser.role;

    // Carregar cards
    carregarEntradas();
    showToast('📦 Sistema de Entradas carregado', 'info');
};

// ===== ADICIONAR MENU CARD =====
function adicionarMenuEntradas() {
    const menuGrid = document.querySelector('.menu-grid');
    if (!menuGrid) return;

    // Verifica se já existe
    if (document.querySelector('.menu-card[data-menu="entradas"]')) return;

    const card = document.createElement('div');
    card.className = 'menu-card';
    card.setAttribute('data-menu', 'entradas');
    card.innerHTML = `
        <div class="menu-icon"><i class="fas fa-arrow-right-to-bracket"></i></div>
        <h3>Entradas</h3>
        <p>Processar entradas de estoque via Excel</p>
    `;
    card.onclick = () => window.abrirSistemaEntradas();

    // Inserir antes do card de "Entradas e Saídas" ou no final
    const referencia = menuGrid.querySelector('.menu-card:last-child');
    if (referencia) {
        menuGrid.insertBefore(card, referencia.nextSibling);
    } else {
        menuGrid.appendChild(card);
    }
}

// ===== INICIALIZAR MENU =====
document.addEventListener('DOMContentLoaded', function() {
    setTimeout(adicionarMenuEntradas, 500);
});

// ============================================
// FUNÇÕES PRINCIPAIS
// ============================================

// ===== CARREGAR ENTRADAS DO SUPABASE =====
async function carregarEntradas() {
    if (!window.supabaseClient) {
        showToast('Erro: Supabase não conectado', 'error');
        return;
    }

    try {
        const { data: cards, error: errCards } = await window.supabaseClient
            .from('entradas_cards')
            .select('*')
            .order('criado_em', { ascending: false });

        if (errCards) throw errCards;

        if (!cards || cards.length === 0) {
            entradasCards = [];
            renderizarEntradas();
            return;
        }

        // Buscar itens de cada card
        const cardIds = cards.map(c => c.id);
        const { data: items, error: errItems } = await window.supabaseClient
            .from('entrada_items')
            .select('*')
            .in('entrada_id', cardIds);

        if (errItems) throw errItems;

        // Montar estrutura
        entradasCards = cards.map(card => ({
            ...card,
            itens: items.filter(item => item.entrada_id === card.id) || []
        }));

        renderizarEntradas();

    } catch (error) {
        console.error('❌ Erro ao carregar entradas:', error);
        showToast('Erro ao carregar entradas: ' + error.message, 'error');
    }
}

// ===== RENDERIZAR CARDS =====
function renderizarEntradas() {
    const container = document.getElementById('entradasCardsContainer');
    if (!container) return;

    // Aplicar filtro
    let cardsFiltrados = [...entradasCards];
    if (filtroEntradasAtual === 'pendente') {
        cardsFiltrados = cardsFiltrados.filter(c => c.status === 'pendente');
    } else if (filtroEntradasAtual === 'finalizado') {
        cardsFiltrados = cardsFiltrados.filter(c => c.status === 'finalizado');
    }

    // Aplicar busca
    const busca = document.getElementById('buscaEntradas')?.value?.trim().toLowerCase() || '';
    if (busca) {
        cardsFiltrados = cardsFiltrados.filter(card => {
            // Busca no card
            const cardMatch = card.numero_entrada.toLowerCase().includes(busca) ||
                (card.dados_brutos || '').toLowerCase().includes(busca);
            if (cardMatch) return true;

            // Busca nos itens
            return card.itens.some(item =>
                (item.rastreio || '').toLowerCase().includes(busca) ||
                (item.produto || '').toLowerCase().includes(busca) ||
                (item.sku_original || '').toLowerCase().includes(busca) ||
                (item.sku_match || '').toLowerCase().includes(busca)
            );
        });
    }

    if (cardsFiltrados.length === 0) {
        container.innerHTML = `
            <div class="text-center py-5 text-muted">
                <i class="fas fa-box-open fa-3x mb-3" style="opacity:0.3;"></i>
                <h4>Nenhuma entrada encontrada</h4>
                <p>${filtroEntradasAtual === 'pendente' ? 'Todas as entradas foram finalizadas!' : 
                      filtroEntradasAtual === 'finalizado' ? 'Nenhuma entrada finalizada ainda.' : 
                      'Cole os dados acima e clique em "Processar Entrada" para começar.'}</p>
            </div>
        `;
        return;
    }

    let html = '';
    cardsFiltrados.forEach(card => {
        const total = card.itens.length;
        const concluidos = card.itens.filter(i => i.status !== 'pendente').length;
        const progresso = total > 0 ? Math.round((concluidos / total) * 100) : 0;
        const isFinalizado = card.status === 'finalizado';
        const criadoEm = new Date(card.criado_em).toLocaleString('pt-BR');

        html += `
            <div class="card mb-4 entrada-card" data-id="${card.id}">
                <div class="card-header" style="flex-wrap:wrap; gap:10px;">
                    <div>
                        <h3 class="card-title" style="margin:0;">
                            <i class="fas fa-receipt"></i>
                            ${card.numero_entrada}
                            <span class="badge ${isFinalizado ? 'badge-success' : 'badge-warning'} ml-2">
                                ${isFinalizado ? '✅ Finalizado' : '⏳ Pendente'}
                            </span>
                        </h3>
                        <small class="text-muted">
                            Criado por: ${card.criado_por || 'Sistema'} em ${criadoEm}
                            ${isFinalizado && card.finalizado_por ? ` • Finalizado por: ${card.finalizado_por}` : ''}
                        </small>
                    </div>
                    <div class="d-flex gap-2 align-items-center">
                        <div style="min-width:120px;">
                            <div class="progress" style="height:8px; border-radius:4px; background:#e9ecef;">
                                <div class="progress-bar ${progresso === 100 ? 'bg-success' : 'bg-primary'}" 
                                     style="width:${progresso}%; border-radius:4px; transition:width 0.3s;">
                                </div>
                            </div>
                            <small class="text-muted">${concluidos}/${total} itens (${progresso}%)</small>
                        </div>
                        ${!isFinalizado ? `
                            <button class="btn btn-sm btn-danger" onclick="cancelarEntrada('${card.id}')" title="Cancelar entrada (excluir)">
                                <i class="fas fa-times"></i>
                            </button>
                        ` : ''}
                    </div>
                </div>

                <div class="table-responsive">
                    <table class="table table-sm table-hover" style="margin-bottom:0;">
                        <thead>
                            <tr>
                                <th style="width:40px;">#</th>
                                <th>Rastreio</th>
                                <th style="width:80px;">Quant</th>
                                <th>Produto</th>
                                <th>SKU</th>
                                <th style="width:70px;">Status</th>
                                <th style="width:200px;">Ação</th>
                            </tr>
                        </thead>
                        <tbody>
                `;

        card.itens.forEach((item, idx) => {
            const isConcluido = item.status !== 'pendente';
            const itemStatus = item.status === 'entrada_realizada' ? '✅ Entrada' :
                              item.status === 'cadastrado' ? '📝 Cadastrado' : '⏳ Pendente';
            const statusClass = item.status === 'entrada_realizada' ? 'badge-success' :
                               item.status === 'cadastrado' ? 'badge-info' : 'badge-warning';

            // Verificar se o SKU existe no estoque
            const produtoExistente = verificarSKUExistente(item.sku_original);

            let acaoHtml = '';
            if (isConcluido) {
                acaoHtml = `
                    <span class="badge ${statusClass}">${itemStatus}</span>
                    <small class="text-muted d-block">${item.responsavel || ''}</small>
                `;
            } else {
                if (produtoExistente) {
                    acaoHtml = `
                        <button class="btn btn-sm btn-success" onclick="darEntradaItem('${card.id}', ${item.id}, '${produtoExistente.id}')" title="Adicionar ao estoque">
                            <i class="fas fa-arrow-right-to-bracket"></i> Dar Entrada
                        </button>
                    `;
                } else {
                    acaoHtml = `
                        <button class="btn btn-sm btn-primary" onclick="abrirCadastroRapido('${card.id}', ${item.id})" title="Cadastrar novo produto">
                            <i class="fas fa-plus-circle"></i> Cadastrar
                        </button>
                    `;
                }
            }

            // Mostrar SKU match se existir
            const skuDisplay = item.sku_match || item.sku_original || '-';

            html += `
                <tr class="${isConcluido ? 'table-light' : ''}">
                    <td>${idx + 1}</td>
                    <td>${item.rastreio || '-'}</td>
                    <td><strong>${item.quantidade || 0}</strong></td>
                    <td>${item.produto || '-'}</td>
                    <td><code>${skuDisplay}</code></td>
                    <td><span class="badge ${statusClass}">${itemStatus}</span></td>
                    <td>${acaoHtml}</td>
                </tr>
            `;
        });

        html += `
                        </tbody>
                    </table>
                </div>

                ${!isFinalizado ? `
                    <div class="card-footer bg-transparent d-flex justify-content-end gap-2">
                        <button class="btn btn-sm btn-outline-secondary" onclick="expandirDadosBrutos('${card.id}')">
                            <i class="fas fa-eye"></i> Ver dados brutos
                        </button>
                        ${concluidos === total && total > 0 ? `
                            <button class="btn btn-sm btn-success" onclick="finalizarEntrada('${card.id}')">
                                <i class="fas fa-check-double"></i> Finalizar Entrada
                            </button>
                        ` : ''}
                    </div>
                ` : ''}

                <!-- Dados brutos (oculto) -->
                <div id="dadosBrutos_${card.id}" style="display:none; padding:15px; background:#f8f9fa; border-top:1px solid #dee2e6;">
                    <pre style="white-space:pre-wrap; font-size:12px; margin:0;">${card.dados_brutos || 'N/A'}</pre>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
}

// ============================================
// PROCESSAR ENTRADA (PARSING DO EXCEL)
// ============================================
window.processarEntrada = async function() {
    const pasteArea = document.getElementById('entradaPasteArea');
    if (!pasteArea) return;

    const texto = pasteArea.value.trim();
    if (!texto) {
        showToast('⚠️ Cole os dados antes de processar', 'warning');
        return;
    }

    // Tentar detectar separador: TAB ou vírgula
    let linhas = texto.split('\n').filter(l => l.trim() !== '');
    if (linhas.length === 0) {
        showToast('⚠️ Nenhuma linha encontrada', 'warning');
        return;
    }

    // Detecta separador pela primeira linha
    let separador = '\t';
    const primeiraLinha = linhas[0];
    if (primeiraLinha.includes('\t')) separador = '\t';
    else if (primeiraLinha.includes(';')) separador = ';';
    else if (primeiraLinha.includes(',')) separador = ',';

    // Verifica se a primeira linha é cabeçalho
    const cabecalho = linhas[0].split(separador).map(c => c.trim().toLowerCase());
    const colunasEsperadas = ['rastreio', 'quant', 'produto', 'sku'];
    const isCabecalho = colunasEsperadas.every(c => cabecalho.some(h => h.includes(c)));

    let dadosLinhas = linhas;
    if (isCabecalho) {
        dadosLinhas = linhas.slice(1);
        if (dadosLinhas.length === 0) {
            showToast('⚠️ Nenhum dado encontrado (apenas cabeçalho)', 'warning');
            return;
        }
    }

    // Parsear cada linha
    const itens = [];
    let erros = [];

    dadosLinhas.forEach((linha, idx) => {
        const partes = linha.split(separador).map(c => c.trim());
        if (partes.length < 4) {
            erros.push(`Linha ${idx + 1}: poucas colunas (${partes.length})`);
            return;
        }

        const rastreio = partes[0] || '';
        const quantidade = parseInt(partes[1]) || 0;
        const produto = partes[2] || '';
        const sku = partes[3] || '';

        if (!sku) {
            erros.push(`Linha ${idx + 1}: SKU vazio`);
            return;
        }

        itens.push({
            rastreio,
            quantidade,
            produto,
            sku_original: sku,
            sku_match: null,
            produto_id: null,
            status: 'pendente',
            acao: null,
            responsavel: null,
            data_acao: null
        });
    });

    if (itens.length === 0) {
        showToast(`⚠️ Nenhum item válido encontrado. ${erros.length} erro(s).`, 'error');
        return;
    }

    if (erros.length > 0) {
        showToast(`⚠️ ${erros.length} erro(s) encontrado(s). ${itens.length} item(s) processados.`, 'warning');
        console.warn('Erros no parsing:', erros);
    }

    // Para cada item, verificar se SKU existe no estoque
    for (const item of itens) {
        const produto = verificarSKUExistente(item.sku_original);
        if (produto) {
            item.sku_match = produto.sku;
            item.produto_id = produto.id;
        }
    }

    // Gerar número de entrada único
    const numeroEntrada = await gerarNumeroEntrada();

    // Salvar no Supabase
    try {
        if (!window.supabaseClient) throw new Error('Supabase não conectado');

        // 1. Criar card
        const cardData = {
            numero_entrada: numeroEntrada,
            dados_brutos: texto,
            status: 'pendente',
            criado_por: currentUser.name,
            criado_em: new Date().toISOString(),
            total_items: itens.length,
            items_concluidos: 0
        };

        const { data: cardResult, error: cardError } = await window.supabaseClient
            .from('entradas_cards')
            .insert([cardData])
            .select();

        if (cardError) throw cardError;
        const card = cardResult[0];

        // 2. Inserir itens
        const itemsToInsert = itens.map(item => ({
            entrada_id: card.id,
            rastreio: item.rastreio,
            quantidade: item.quantidade,
            produto: item.produto,
            sku_original: item.sku_original,
            sku_match: item.sku_match,
            produto_id: item.produto_id,
            status: 'pendente',
            acao: null,
            responsavel: null,
            data_acao: null
        }));

        const { error: itemsError } = await window.supabaseClient
            .from('entrada_items')
            .insert(itemsToInsert);

        if (itemsError) throw itemsError;

        showToast(`✅ Entrada ${numeroEntrada} criada com ${itens.length} item(s)!`, 'success');
        pasteArea.value = '';
        await carregarEntradas();

    } catch (error) {
        console.error('❌ Erro ao salvar entrada:', error);
        showToast('❌ Erro ao processar entrada: ' + error.message, 'error');
    }
};

// ===== VERIFICAR SE SKU EXISTE NO ESTOQUE =====
function verificarSKUExistente(sku) {
    if (!sku) return null;
    const skuNormalizado = sku.trim().toLowerCase();
    // Buscar no array global produtosEstoque (definido em estoque_gestao.js)
    if (typeof produtosEstoque !== 'undefined' && Array.isArray(produtosEstoque)) {
        const encontrado = produtosEstoque.find(p =>
            p.sku && p.sku.trim().toLowerCase() === skuNormalizado
        );
        if (encontrado) return encontrado;
    }
    return null;
}

// ===== GERAR NÚMERO DE ENTRADA =====
async function gerarNumeroEntrada() {
    const hoje = new Date();
    const ano = hoje.getFullYear();
    const mes = String(hoje.getMonth() + 1).padStart(2, '0');
    const dia = String(hoje.getDate()).padStart(2, '0');
    const prefixo = `${ano}${mes}${dia}`;

    if (!window.supabaseClient) {
        // Fallback: gerar número sequencial local
        const existentes = entradasCards.filter(c => c.numero_entrada.startsWith(`ENT-${prefixo}`));
        const seq = existentes.length + 1;
        return `ENT-${prefixo}-${String(seq).padStart(4, '0')}`;
    }

    try {
        const { data, error } = await window.supabaseClient
            .from('entradas_cards')
            .select('numero_entrada')
            .ilike('numero_entrada', `ENT-${prefixo}-%`)
            .order('numero_entrada', { ascending: false })
            .limit(1);

        if (error) throw error;

        let sequencial = 1;
        if (data && data.length > 0) {
            const ultimo = data[0].numero_entrada;
            const match = ultimo.match(/\d{4}$/);
            if (match) sequencial = parseInt(match[0]) + 1;
        }
        return `ENT-${prefixo}-${String(sequencial).padStart(4, '0')}`;
    } catch (error) {
        console.warn('⚠️ Erro ao gerar número de entrada, usando fallback:', error);
        const seq = entradasCards.filter(c => c.numero_entrada.startsWith(`ENT-${prefixo}`)).length + 1;
        return `ENT-${prefixo}-${String(seq).padStart(4, '0')}`;
    }
}

// ============================================
// AÇÕES DOS ITENS
// ============================================

// ===== DAR ENTRADA EM UM ITEM =====
window.darEntradaItem = async function(cardId, itemId, produtoId) {
    if (!cardId || !itemId || !produtoId) {
        showToast('Erro: dados incompletos', 'error');
        return;
    }

    // Buscar o item e o card
    const card = entradasCards.find(c => c.id == cardId);
    if (!card) {
        showToast('Card não encontrado', 'error');
        return;
    }
    const item = card.itens.find(i => i.id == itemId);
    if (!item) {
        showToast('Item não encontrado', 'error');
        return;
    }

    if (item.status !== 'pendente') {
        showToast('Este item já foi processado', 'warning');
        return;
    }

    const quantidade = item.quantidade || 1;
    if (quantidade <= 0) {
        showToast('Quantidade inválida para dar entrada', 'warning');
        return;
    }

    if (!confirm(`Deseja dar entrada de ${quantidade} unidade(s) do SKU "${item.sku_original}"?`)) {
        return;
    }

    try {
        if (!window.supabaseClient) throw new Error('Supabase não conectado');

        // 1. Atualizar estoque do produto
        const { data: produto, error: errProd } = await window.supabaseClient
            .from('produtos_estoque')
            .select('quantidade')
            .eq('id', produtoId)
            .single();

        if (errProd) throw errProd;

        const novaQuantidade = (produto.quantidade || 0) + quantidade;

        const { error: errUpdate } = await window.supabaseClient
            .from('produtos_estoque')
            .update({ quantidade: novaQuantidade })
            .eq('id', produtoId);

        if (errUpdate) throw errUpdate;

        // 2. Registrar movimentação
        await registrarMovimentacao(
            produtoId,
            'entrada',
            quantidade,
            `ENT-${card.numero_entrada}`,
            'nova'
        );

        // 3. Atualizar item
        const { error: errItem } = await window.supabaseClient
            .from('entrada_items')
            .update({
                status: 'entrada_realizada',
                acao: 'entrada',
                responsavel: currentUser.name,
                data_acao: new Date().toISOString()
            })
            .eq('id', itemId);

        if (errItem) throw errItem;

        // 4. Atualizar card (contador)
        const concluidos = card.itens.filter(i => i.id != itemId && i.status !== 'pendente').length + 1;
        const total = card.itens.length;
        const novoStatus = concluidos === total ? 'finalizado' : 'pendente';

        const { error: errCard } = await window.supabaseClient
            .from('entradas_cards')
            .update({
                items_concluidos: concluidos,
                status: novoStatus,
                finalizado_em: novoStatus === 'finalizado' ? new Date().toISOString() : null,
                finalizado_por: novoStatus === 'finalizado' ? currentUser.name : null
            })
            .eq('id', cardId);

        if (errCard) throw errCard;

        showToast(`✅ Entrada de ${quantidade} unidade(s) realizada!`, 'success');

        // Atualizar lista local e re-renderizar
        await carregarEntradas();

        // Sincronizar com ML (se o produto tiver MLB)
        if (typeof produtosEstoque !== 'undefined' && Array.isArray(produtosEstoque)) {
            const produtoAtualizado = produtosEstoque.find(p => p.id == produtoId);
            if (produtoAtualizado && produtoAtualizado.dados_extra?.mlb_codes) {
                setTimeout(() => {
                    if (typeof sincronizarEstoqueML === 'function') {
                        sincronizarEstoqueML(produtoAtualizado);
                    }
                }, 500);
            }
        }

    } catch (error) {
        console.error('❌ Erro ao dar entrada:', error);
        showToast('❌ Erro ao dar entrada: ' + error.message, 'error');
    }
};

// ===== ABRIR CADASTRO RÁPIDO =====
window.abrirCadastroRapido = function(cardId, itemId) {
    if (!cardId || !itemId) {
        showToast('Erro: dados incompletos', 'error');
        return;
    }

    const card = entradasCards.find(c => c.id == cardId);
    if (!card) {
        showToast('Card não encontrado', 'error');
        return;
    }
    const item = card.itens.find(i => i.id == itemId);
    if (!item) {
        showToast('Item não encontrado', 'error');
        return;
    }

    if (item.status !== 'pendente') {
        showToast('Este item já foi processado', 'warning');
        return;
    }

    // Guardar referência para uso após cadastro
    entradaEmProcessamento = {
        cardId: cardId,
        itemId: itemId,
        item: item
    };

    // Abrir o modal de cadastro de produto (reutilizando o existente)
    if (typeof abrirModalProdutoEstoque === 'function') {
        // Pré-preencher campos com os dados do item
        const produtoNome = item.produto || '';
        const sku = item.sku_original || '';

        // Chamar a função com um objeto produto parcial
        const produtoParcial = {
            nome: produtoNome,
            sku: sku,
            categoria: '',
            dados_extra: {}
        };

        abrirModalProdutoEstoque(produtoParcial);

        // Adicionar evento personalizado no modal para quando salvar
        const modal = document.getElementById('modalProdutoEstoque');
        if (modal) {
            // Remover listener antigo para evitar duplicação
            const salvarBtn = document.getElementById('salvarProdutoEstoqueBtn') ||
                             document.querySelector('#modalProdutoEstoque .btn-success');
            if (salvarBtn) {
                const novoBtn = salvarBtn.cloneNode(true);
                salvarBtn.parentNode.replaceChild(novoBtn, salvarBtn);
                novoBtn.onclick = function() {
                    // Chamar a função original de salvar
                    if (typeof salvarProdutoEstoque === 'function') {
                        salvarProdutoEstoque();
                        // Após salvar, processar o item
                        setTimeout(() => {
                            processarItemAposCadastro(cardId, itemId);
                        }, 1000);
                    }
                };
            }
        }

        showToast('📝 Preencha os dados do produto e clique em Salvar', 'info');
    } else {
        showToast('❌ Função de cadastro não disponível', 'error');
    }
};

// ===== PROCESSAR ITEM APÓS CADASTRO =====
async function processarItemAposCadastro(cardId, itemId) {
    try {
        if (!window.supabaseClient) throw new Error('Supabase não conectado');

        // Buscar o item atualizado
        const { data: item, error: errItem } = await window.supabaseClient
            .from('entrada_items')
            .select('*')
            .eq('id', itemId)
            .single();

        if (errItem) throw errItem;

        // Verificar se o SKU agora existe no estoque
        const produto = verificarSKUExistente(item.sku_original);
        if (!produto) {
            showToast('⚠️ Produto não encontrado após cadastro. Tente novamente.', 'warning');
            return;
        }

        // Atualizar o item com o produto_id e sku_match
        const { error: errUpdate } = await window.supabaseClient
            .from('entrada_items')
            .update({
                produto_id: produto.id,
                sku_match: produto.sku,
                status: 'cadastrado',
                acao: 'cadastro',
                responsavel: currentUser.name,
                data_acao: new Date().toISOString()
            })
            .eq('id', itemId);

        if (errUpdate) throw errUpdate;

        // Atualizar card
        const card = entradasCards.find(c => c.id == cardId);
        if (card) {
            const concluidos = card.itens.filter(i => i.id != itemId && i.status !== 'pendente').length + 1;
            const total = card.itens.length;
            const novoStatus = concluidos === total ? 'finalizado' : 'pendente';

            await window.supabaseClient
                .from('entradas_cards')
                .update({
                    items_concluidos: concluidos,
                    status: novoStatus,
                    finalizado_em: novoStatus === 'finalizado' ? new Date().toISOString() : null,
                    finalizado_por: novoStatus === 'finalizado' ? currentUser.name : null
                })
                .eq('id', cardId);
        }

        showToast(`✅ Produto cadastrado e vinculado à entrada!`, 'success');
        entradaEmProcessamento = null;
        await carregarEntradas();

    } catch (error) {
        console.error('❌ Erro ao processar item após cadastro:', error);
        showToast('❌ Erro: ' + error.message, 'error');
    }
}

// ===== FINALIZAR ENTRADA =====
window.finalizarEntrada = async function(cardId) {
    if (!confirm('Confirmar que todos os itens foram processados e finalizar esta entrada?')) return;

    try {
        if (!window.supabaseClient) throw new Error('Supabase não conectado');

        const { error } = await window.supabaseClient
            .from('entradas_cards')
            .update({
                status: 'finalizado',
                finalizado_em: new Date().toISOString(),
                finalizado_por: currentUser.name
            })
            .eq('id', cardId);

        if (error) throw error;

        showToast('✅ Entrada finalizada com sucesso!', 'success');
        await carregarEntradas();

    } catch (error) {
        console.error('❌ Erro ao finalizar entrada:', error);
        showToast('❌ Erro: ' + error.message, 'error');
    }
};

// ===== CANCELAR ENTRADA =====
window.cancelarEntrada = async function(cardId) {
    if (!confirm('Tem certeza que deseja cancelar/excluir esta entrada? Todos os dados serão removidos.')) return;

    try {
        if (!window.supabaseClient) throw new Error('Supabase não conectado');

        // Os itens serão excluídos em cascata (ON DELETE CASCADE)
        const { error } = await window.supabaseClient
            .from('entradas_cards')
            .delete()
            .eq('id', cardId);

        if (error) throw error;

        showToast('🗑️ Entrada cancelada', 'success');
        await carregarEntradas();

    } catch (error) {
        console.error('❌ Erro ao cancelar entrada:', error);
        showToast('❌ Erro: ' + error.message, 'error');
    }
};

// ============================================
// FUNÇÕES AUXILIARES
// ============================================

// ===== FILTRAR ENTRADAS =====
window.filtrarEntradas = function(filtro) {
    filtroEntradasAtual = filtro;

    // Atualizar estilo dos botões
    document.querySelectorAll('#entradasSystem .btn[data-filtro]').forEach(btn => {
        btn.classList.remove('btn-primary', 'active');
        btn.classList.add('btn-outline-secondary');
    });
    const btnAtivo = document.querySelector(`#entradasSystem .btn[data-filtro="${filtro}"]`);
    if (btnAtivo) {
        btnAtivo.classList.remove('btn-outline-secondary');
        btnAtivo.classList.add('btn-primary', 'active');
    }

    renderizarEntradas();
};

// ===== BUSCAR ENTRADAS =====
window.buscarEntradas = function() {
    renderizarEntradas();
};

// ===== EXPANDIR DADOS BRUTOS =====
window.expandirDadosBrutos = function(cardId) {
    const div = document.getElementById(`dadosBrutos_${cardId}`);
    if (div) {
        if (div.style.display === 'none') {
            div.style.display = 'block';
        } else {
            div.style.display = 'none';
        }
    }
};

// ===== LIMPAR ÁREA DE ENTRADA =====
window.limparAreaEntrada = function() {
    document.getElementById('entradaPasteArea').value = '';
    showToast('Área limpa', 'info');
};

// ===== MOSTRAR EXEMPLO =====
window.mostrarExemploEntrada = function() {
    const exemplo = `Rastreio	Quant	Produto	SKU
NN264716981BR	72	Sapim Race SP 28pcs 276mm, 28pcs 300mm and 16pcs 304mm	raios
NN266540386BR	28	Sapim Cx-Ray J-Bend 12pcs 238mm and 16pcs 256mm / Nipples Alumínio	raios
NN263670492BR	32	Pilar Nipple interno Latão	raios
NN275710171BR	3	Rolamentos de Direção para Bicicleta ACB3544 ACB3344	2239ROL44-35-5.5
NN277588212BR	2	Cage 6800	4044CAGEOVER-0086
NN277588213BR	4	Capa bike para transporte	4041CAPBIK-PTO`;

    document.getElementById('entradaPasteArea').value = exemplo;
    showToast('📋 Exemplo carregado! Clique em "Processar Entrada" para testar.', 'info');
};

// ============================================
// INICIALIZAÇÃO (MONITORAR CARREGAMENTO DO ESTOQUE)
// ============================================

// Aguardar o carregamento do estoque para ter acesso a produtosEstoque
let estoqueCarregado = false;

// Verificar periodicamente se produtosEstoque foi carregado
const intervalEstoque = setInterval(() => {
    if (typeof produtosEstoque !== 'undefined' && Array.isArray(produtosEstoque) && produtosEstoque.length > 0) {
        estoqueCarregado = true;
        clearInterval(intervalEstoque);
        console.log('✅ produtosEstoque carregado para o sistema de Entradas');
        // Se houver cards pendentes, re-renderizar para atualizar os botões
        if (entradasCards.some(c => c.status === 'pendente')) {
            renderizarEntradas();
        }
    }
}, 2000);

// Limpar intervalo após 30 segundos para não ficar eternamente
setTimeout(() => {
    clearInterval(intervalEstoque);
}, 30000);

// ============================================
// FUNÇÃO DE REGISTRO DE MOVIMENTAÇÃO (REUTILIZADA DO ESTOQUE)
// ============================================

// Se a função registrarMovimentacao não existir, definir uma versão local
if (typeof registrarMovimentacao !== 'function') {
    window.registrarMovimentacao = async function(produtoId, tipo, quantidade, numeroDocumento, tipoEntrada) {
        try {
            if (!window.supabaseClient) return;
            const usuario = currentUser ? currentUser.name : 'sistema';
            const { error } = await window.supabaseClient
                .from('estoque_movimentacoes')
                .insert([{
                    produto_id: produtoId,
                    tipo: tipo,
                    quantidade: quantidade,
                    usuario: usuario,
                    numero_documento: numeroDocumento || 'ENTRADA_SISTEMA',
                    tipo_entrada: tipoEntrada || 'nova',
                    data_hora: new Date().toISOString()
                }]);
            if (error) console.warn('⚠️ Erro ao registrar movimentação:', error);
        } catch (e) {
            console.warn('⚠️ Erro ao registrar movimentação:', e);
        }
    };
}

// ============================================
// SOBRESCREVER SALVAR PRODUTO DO ESTOQUE PARA CAPTURAR O CADASTRO
// ============================================

// Armazenar a função original
const _salvarProdutoEstoqueOriginal = window.salvarProdutoEstoque;

// Sobrescrever para capturar quando um produto é cadastrado via modal
window.salvarProdutoEstoque = async function() {
    // Chamar a função original
    if (typeof _salvarProdutoEstoqueOriginal === 'function') {
        await _salvarProdutoEstoqueOriginal();
    }

    // Se houver um item em processamento, verificar se o SKU agora existe
    if (entradaEmProcessamento) {
        const { cardId, itemId, item } = entradaEmProcessamento;
        const produto = verificarSKUExistente(item.sku_original);
        if (produto) {
            // Atualizar o item com o produto_id
            try {
                if (!window.supabaseClient) throw new Error('Supabase não conectado');

                const { error } = await window.supabaseClient
                    .from('entrada_items')
                    .update({
                        produto_id: produto.id,
                        sku_match: produto.sku,
                        status: 'cadastrado',
                        acao: 'cadastro',
                        responsavel: currentUser.name,
                        data_acao: new Date().toISOString()
                    })
                    .eq('id', itemId);

                if (error) throw error;

                // Atualizar card
                const card = entradasCards.find(c => c.id == cardId);
                if (card) {
                    const concluidos = card.itens.filter(i => i.id != itemId && i.status !== 'pendente').length + 1;
                    const total = card.itens.length;
                    const novoStatus = concluidos === total ? 'finalizado' : 'pendente';

                    await window.supabaseClient
                        .from('entradas_cards')
                        .update({
                            items_concluidos: concluidos,
                            status: novoStatus,
                            finalizado_em: novoStatus === 'finalizado' ? new Date().toISOString() : null,
                            finalizado_por: novoStatus === 'finalizado' ? currentUser.name : null
                        })
                        .eq('id', cardId);
                }

                showToast(`✅ Produto cadastrado e vinculado à entrada!`, 'success');
                entradaEmProcessamento = null;
                await carregarEntradas();

            } catch (error) {
                console.error('❌ Erro ao vincular produto cadastrado:', error);
                showToast('⚠️ Produto cadastrado, mas houve erro ao vincular à entrada.', 'warning');
            }
        }
    }
};

// ============================================
// EXPORTAR FUNÇÕES PARA USO GLOBAL
// ============================================

window.abrirSistemaEntradas = window.abrirSistemaEntradas;
window.carregarEntradas = carregarEntradas;
window.processarEntrada = window.processarEntrada;
window.darEntradaItem = window.darEntradaItem;
window.abrirCadastroRapido = window.abrirCadastroRapido;
window.finalizarEntrada = window.finalizarEntrada;
window.cancelarEntrada = window.cancelarEntrada;
window.filtrarEntradas = window.filtrarEntradas;
window.buscarEntradas = window.buscarEntradas;
window.expandirDadosBrutos = window.expandirDadosBrutos;
window.limparAreaEntrada = window.limparAreaEntrada;
window.mostrarExemploEntrada = window.mostrarExemploEntrada;

console.log('📦 Sistema de Entradas carregado com sucesso!');