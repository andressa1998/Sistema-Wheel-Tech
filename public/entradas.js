// ============================================
// SISTEMA DE ENTRADAS - VERSÃO COMPLETA COM FORNECEDORES E AGRUPAMENTO
// ============================================

let entradasCards = [];
let filtroEntradasAtual = 'todos';
let entradaEmProcessamento = null;
let fornecedoresMap = {}; // cache de fornecedores

// ===== ABRIR SISTEMA =====
window.abrirSistemaEntradas = function() {
    if (!currentUser) {
        showToast('⚠️ Faça login primeiro', 'warning');
        return;
    }

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

    document.getElementById('entradasUserName').textContent = currentUser.name;
    document.getElementById('entradasUserAvatar').textContent = currentUser.avatar;
    document.getElementById('entradasUserRole').textContent = currentUser.role;

    carregarFornecedores(); // carrega cache
    carregarEntradas();
    showToast('📦 Sistema de Entradas carregado', 'info');
};

// ===== CARREGAR FORNECEDORES =====
async function carregarFornecedores() {
    if (!window.supabaseClient) return;
    try {
        const { data, error } = await window.supabaseClient
            .from('fornecedores')
            .select('*');
        if (error) throw error;
        if (data) {
            fornecedoresMap = {};
            data.forEach(f => {
                // Indexar por cd_fornecedor
                if (!fornecedoresMap[f.cd_fornecedor]) {
                    fornecedoresMap[f.cd_fornecedor] = [];
                }
                fornecedoresMap[f.cd_fornecedor].push(f);
                
                // Também indexar por sku_sistema (para busca direta)
                if (f.sku_sistema) {
                    if (!fornecedoresMap[f.sku_sistema]) {
                        fornecedoresMap[f.sku_sistema] = [];
                    }
                    fornecedoresMap[f.sku_sistema].push(f);
                }
            });
            console.log('✅ Fornecedores carregados:', Object.keys(fornecedoresMap).length);
        }
    } catch (error) {
        console.error('❌ Erro ao carregar fornecedores:', error);
    }
}

// ===== BUSCAR DADOS DO FORNECEDOR =====
function buscarFornecedor(chave) {
    if (!chave) return null;
    const chaveNormalizada = chave.trim();
    
    // Buscar por cd_fornecedor
    if (fornecedoresMap[chaveNormalizada]) {
        // Pode ter mais de um com mesmo cd, pega o primeiro
        return fornecedoresMap[chaveNormalizada][0];
    }
    
    // Buscar por sku_sistema (percorrendo todos)
    for (const key in fornecedoresMap) {
        const lista = fornecedoresMap[key];
        for (const f of lista) {
            if (f.sku_sistema && f.sku_sistema.trim() === chaveNormalizada) {
                return f;
            }
        }
    }
    return null;
}

// ===== ADICIONAR MENU =====
function adicionarMenuEntradas() {
    const menuGrid = document.querySelector('.menu-grid');
    if (!menuGrid) return;
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

    const referencia = menuGrid.querySelector('.menu-card:last-child');
    if (referencia) {
        menuGrid.insertBefore(card, referencia.nextSibling);
    } else {
        menuGrid.appendChild(card);
    }
}

document.addEventListener('DOMContentLoaded', function() {
    setTimeout(adicionarMenuEntradas, 500);
});

// ============================================
// CARREGAR ENTRADAS
// ============================================
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

        const cardIds = cards.map(c => c.id);
        const { data: items, error: errItems } = await window.supabaseClient
            .from('entrada_items')
            .select('*')
            .in('entrada_id', cardIds);

        if (errItems) throw errItems;

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

    let cardsFiltrados = [...entradasCards];
    if (filtroEntradasAtual === 'pendente') {
        cardsFiltrados = cardsFiltrados.filter(c => c.status === 'pendente');
    } else if (filtroEntradasAtual === 'finalizado') {
        cardsFiltrados = cardsFiltrados.filter(c => c.status === 'finalizado');
    }

    const busca = document.getElementById('buscaEntradas')?.value?.trim().toLowerCase() || '';
    if (busca) {
        cardsFiltrados = cardsFiltrados.filter(card => {
            const cardMatch = card.numero_entrada.toLowerCase().includes(busca);
            if (cardMatch) return true;
            return card.itens.some(item =>
                (item.rastreio || '').toLowerCase().includes(busca) ||
                (item.produto || '').toLowerCase().includes(busca) ||
                (item.sku_original || '').toLowerCase().includes(busca) ||
                (item.sku_match || '').toLowerCase().includes(busca) ||
                (item.fornecedor_nome || '').toLowerCase().includes(busca) ||
                (item.cd_fornecedor || '').toLowerCase().includes(busca)
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
                                <th>Cd. Fornecedor</th>
                                <th>Referência de entrada</th>
                                <th style="width:80px;">Quant</th>
                                <th>Produto</th>
                                <th>SKU</th>
                                <th>Fornecedor</th>
                                <th>Observação</th>
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

            // Verificar se SKU existe no estoque
            const produtoExistente = verificarSKUExistente(item.sku_original);
            let tituloProduto = '';
            if (produtoExistente) {
                tituloProduto = produtoExistente.nome || '';
            }

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
                        ${tituloProduto ? `<small class="d-block text-success">🔍 ${tituloProduto}</small>` : ''}
                    `;
                } else {
                    acaoHtml = `
                        <button class="btn btn-sm btn-primary" onclick="abrirCadastroRapido('${card.id}', ${item.id})" title="Cadastrar novo produto">
                            <i class="fas fa-plus-circle"></i> Cadastrar
                        </button>
                        <small class="d-block text-muted">⛔ Produto não encontrado</small>
                    `;
                }
            }

            const skuDisplay = item.sku_match || item.sku_original || '-';
            const fornecedorDisplay = item.fornecedor_nome || item.cd_fornecedor || '-';

            html += `
                <tr class="${isConcluido ? 'table-light' : ''}">
                    <td>${idx + 1}</td>
                    <td>${item.cd_fornecedor || '-'}</td>
                    <td>${item.rastreio || '-'}</td>
                    <td><strong>${item.quantidade || 0}</strong></td>
                    <td>${item.produto || '-'}</td>
                    <td><code>${skuDisplay}</code></td>
                    <td>${fornecedorDisplay}</td>
                    <td>${item.observacao || '-'}</td>
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
                        ${concluidos === total && total > 0 ? `
                            <button class="btn btn-sm btn-success" onclick="finalizarEntrada('${card.id}')">
                                <i class="fas fa-check-double"></i> Finalizar Entrada
                            </button>
                        ` : ''}
                    </div>
                ` : ''}
            </div>
        `;
    });

    container.innerHTML = html;
}

// ===== PROCESSAR ENTRADA (VERSÃO FINAL CORRIGIDA) =====
window.processarEntrada = async function() {
    const pasteArea = document.getElementById('entradaPasteArea');
    if (!pasteArea) return;

    const texto = pasteArea.value.trim();
    if (!texto) {
        showToast('⚠️ Cole os dados antes de processar', 'warning');
        return;
    }

    let linhas = texto.split('\n').filter(l => l.trim() !== '');
    if (linhas.length === 0) {
        showToast('⚠️ Nenhuma linha encontrada', 'warning');
        return;
    }

    let separador = '\t';
    const primeiraLinha = linhas[0];
    if (primeiraLinha.includes('\t')) separador = '\t';
    else if (primeiraLinha.includes(';')) separador = ';';
    else if (primeiraLinha.includes(',')) separador = ',';

    const cabecalho = linhas[0].split(separador).map(c => c.trim().toLowerCase());
    const colunasEsperadas = ['cd fornecedor', 'rastreio', 'fornecedor', 'quant', 'produto', 'sku', 'observações'];
    const isCabecalho = colunasEsperadas.every(c => cabecalho.some(h => h.includes(c)));

    let dadosLinhas = linhas;
    if (isCabecalho) {
        dadosLinhas = linhas.slice(1);
        if (dadosLinhas.length === 0) {
            showToast('⚠️ Nenhum dado encontrado (apenas cabeçalho)', 'warning');
            return;
        }
    }

    const itensRaw = [];
    let erros = [];

    dadosLinhas.forEach((linha, idx) => {
        const partes = linha.split(separador).map(c => c.trim());
        if (partes.length < 6) {
            erros.push(`Linha ${idx + 1}: poucas colunas (${partes.length})`);
            return;
        }

        const cdFornecedor = partes[0] || '';
        const rastreio = partes[1] || '';
        const fornecedorNome = partes[2] || '';
        const quantidade = parseInt(partes[3]) || 0;
        const produto = partes[4] || '';
        const sku = partes[5] || '';
        const observacao = partes[6] || '';

        if (!sku && !cdFornecedor) {
            erros.push(`Linha ${idx + 1}: SKU e cd fornecedor vazios`);
            return;
        }

        itensRaw.push({
            cd_fornecedor: cdFornecedor,
            rastreio: rastreio,
            fornecedor_nome: fornecedorNome,
            quantidade: quantidade,
            produto: produto,
            sku_original: sku,
            observacao: observacao,
            sku_match: null,
            produto_id: null,
            status: 'pendente',
            acao: null,
            responsavel: null,
            data_acao: null
        });
    });

    if (itensRaw.length === 0) {
        showToast(`⚠️ Nenhum item válido encontrado. ${erros.length} erro(s).`, 'error');
        return;
    }

    if (erros.length > 0) {
        showToast(`⚠️ ${erros.length} erro(s) encontrado(s). ${itensRaw.length} item(s) processados.`, 'warning');
        console.warn('Erros no parsing:', erros);
    }

    // Ordenar por rastreio para agrupar visualmente
    itensRaw.sort((a, b) => (a.rastreio || '').localeCompare(b.rastreio || ''));

    // Para cada item, buscar fornecedor e descrição
    for (const item of itensRaw) {
        let fornecedor = null;

        // Buscar pelo cd_fornecedor
        if (item.cd_fornecedor) {
            fornecedor = buscarFornecedor(item.cd_fornecedor);
        }

        // Se não encontrou, buscar pelo sku_original
        if (!fornecedor && item.sku_original) {
            fornecedor = buscarFornecedor(item.sku_original);
        }

        if (fornecedor) {
            // Preencher o nome do produto com a descrição se estiver vazio ou for igual ao SKU
            if (!item.produto || item.produto.trim() === '' || item.produto === item.sku_original) {
                item.produto = fornecedor.descricao_produto || item.produto;
            }
            // Atualizar nome do fornecedor se não tiver
            if (!item.fornecedor_nome) {
                item.fornecedor_nome = fornecedor.nome_fornecedor;
            }
            // Atualizar cd_fornecedor se não tiver
            if (!item.cd_fornecedor) {
                item.cd_fornecedor = fornecedor.cd_fornecedor;
            }
            // Guardar o sku_sistema como sku_match (para buscar no estoque)
            if (fornecedor.sku_sistema) {
                item.sku_match = fornecedor.sku_sistema;
            }
        }

        // Verificar se o SKU (original ou match) existe no estoque
        const skuParaBuscar = item.sku_match || item.sku_original;
        if (skuParaBuscar) {
            const produtoEstoque = verificarSKUExistente(skuParaBuscar);
            if (produtoEstoque) {
                item.produto_id = produtoEstoque.id;
                // Atualiza sku_match para o SKU exato do estoque
                item.sku_match = produtoEstoque.sku;
            }
        }
    }

    const numeroEntrada = await gerarNumeroEntrada();

    try {
        if (!window.supabaseClient) throw new Error('Supabase não conectado');

        const cardData = {
            numero_entrada: numeroEntrada,
            dados_brutos: texto,
            status: 'pendente',
            criado_por: currentUser.name,
            criado_em: new Date().toISOString(),
            total_items: itensRaw.length,
            items_concluidos: 0
        };

        const { data: cardResult, error: cardError } = await window.supabaseClient
            .from('entradas_cards')
            .insert([cardData])
            .select();

        if (cardError) throw cardError;
        const card = cardResult[0];

        const itemsToInsert = itensRaw.map(item => ({
            entrada_id: card.id,
            cd_fornecedor: item.cd_fornecedor,
            rastreio: item.rastreio,
            fornecedor_nome: item.fornecedor_nome,
            quantidade: item.quantidade,
            produto: item.produto,
            sku_original: item.sku_original,
            sku_match: item.sku_match,
            produto_id: item.produto_id,
            observacao: item.observacao,
            status: 'pendente',
            acao: null,
            responsavel: null,
            data_acao: null
        }));

        const { error: itemsError } = await window.supabaseClient
            .from('entrada_items')
            .insert(itemsToInsert);

        if (itemsError) throw itemsError;

        showToast(`✅ Entrada ${numeroEntrada} criada com ${itensRaw.length} item(s)!`, 'success');
        pasteArea.value = '';
        await carregarEntradas();

    } catch (error) {
        console.error('❌ Erro ao salvar entrada:', error);
        showToast('❌ Erro ao processar entrada: ' + error.message, 'error');
    }
};

// ===== VERIFICAR SKU NO ESTOQUE =====
function verificarSKUExistente(sku) {
    if (!sku) return null;
    const skuNormalizado = sku.trim().toLowerCase();
    console.log('🔍 Verificando SKU no estoque:', skuNormalizado);
    
    if (typeof produtosEstoque !== 'undefined' && Array.isArray(produtosEstoque)) {
        const encontrado = produtosEstoque.find(p => {
            const pSku = (p.sku || '').trim().toLowerCase();
            return pSku === skuNormalizado;
        });
        if (encontrado) {
            console.log('✅ Produto encontrado no estoque:', encontrado);
            return encontrado;
        } else {
            console.log('❌ SKU não encontrado no estoque.');
        }
    } else {
        console.warn('⚠️ produtosEstoque não está definido ou não é um array.');
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

// ===== DAR ENTRADA EM UM ITEM =====
window.darEntradaItem = async function(cardId, itemId, produtoId) {
    if (!cardId || !itemId || !produtoId) {
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

        // Atualizar estoque
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

        // Registrar movimentação
        await registrarMovimentacao(
            produtoId,
            'entrada',
            quantidade,
            `ENT-${card.numero_entrada}`,
            'nova'
        );

        // Atualizar item
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

        // Atualizar card
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

        await carregarEntradas();

        // Sincronizar ML
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

    entradaEmProcessamento = {
        cardId: cardId,
        itemId: itemId,
        item: item
    };

    if (typeof abrirModalProdutoEstoque === 'function') {
        const produtoParcial = {
            nome: item.produto || '',
            sku: item.sku_original || '',
            categoria: '',
            dados_extra: {}
        };

        abrirModalProdutoEstoque(produtoParcial);

        const modal = document.getElementById('modalProdutoEstoque');
        if (modal) {
            const salvarBtn = document.getElementById('salvarProdutoEstoqueBtn') ||
                             document.querySelector('#modalProdutoEstoque .btn-success');
            if (salvarBtn) {
                const novoBtn = salvarBtn.cloneNode(true);
                salvarBtn.parentNode.replaceChild(novoBtn, salvarBtn);
                novoBtn.onclick = function() {
                    if (typeof salvarProdutoEstoque === 'function') {
                        salvarProdutoEstoque();
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

        const { data: item, error: errItem } = await window.supabaseClient
            .from('entrada_items')
            .select('*')
            .eq('id', itemId)
            .single();

        if (errItem) throw errItem;

        const produto = verificarSKUExistente(item.sku_original);
        if (!produto) {
            showToast('⚠️ Produto não encontrado após cadastro. Tente novamente.', 'warning');
            return;
        }

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

// ===== FILTRAR ENTRADAS =====
window.filtrarEntradas = function(filtro) {
    filtroEntradasAtual = filtro;

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

// ===== LIMPAR ÁREA =====
window.limparAreaEntrada = function() {
    document.getElementById('entradaPasteArea').value = '';
    showToast('Área limpa', 'info');
};

// ===== REGISTRAR MOVIMENTAÇÃO (fallback) =====
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

// ===== SOBRESCREVER SALVAR PRODUTO =====
const _salvarProdutoEstoqueOriginal = window.salvarProdutoEstoque;

window.salvarProdutoEstoque = async function() {
    if (typeof _salvarProdutoEstoqueOriginal === 'function') {
        await _salvarProdutoEstoqueOriginal();
    }

    if (entradaEmProcessamento) {
        const { cardId, itemId, item } = entradaEmProcessamento;
        const produto = verificarSKUExistente(item.sku_original);
        if (produto) {
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

// ===== INICIALIZAR (cache de fornecedores) =====
let estoqueCarregado = false;
const intervalEstoque = setInterval(() => {
    if (typeof produtosEstoque !== 'undefined' && Array.isArray(produtosEstoque) && produtosEstoque.length > 0) {
        estoqueCarregado = true;
        clearInterval(intervalEstoque);
        console.log('✅ produtosEstoque carregado para o sistema de Entradas');
        if (entradasCards.some(c => c.status === 'pendente')) {
            renderizarEntradas();
        }
    }
}, 2000);

setTimeout(() => {
    clearInterval(intervalEstoque);
}, 30000);

// ===== EXPORTAR =====
window.abrirSistemaEntradas = window.abrirSistemaEntradas;
window.carregarEntradas = carregarEntradas;
window.processarEntrada = window.processarEntrada;
window.darEntradaItem = window.darEntradaItem;
window.abrirCadastroRapido = window.abrirCadastroRapido;
window.finalizarEntrada = window.finalizarEntrada;
window.cancelarEntrada = window.cancelarEntrada;
window.filtrarEntradas = window.filtrarEntradas;
window.buscarEntradas = window.buscarEntradas;
window.limparAreaEntrada = window.limparAreaEntrada;

console.log('📦 Sistema de Entradas atualizado com sucesso!');