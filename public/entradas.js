// ============================================
// SISTEMA DE ENTRADAS - VERSÃO COMPLETA COM XML E CUSTO
// ============================================

let entradasCards = [];
let filtroEntradasAtual = 'todos';
let entradaEmProcessamento = null;
let fornecedoresMap = {};
let preEntradaItens = [];
let preEntradaDadosBrutos = '';

// ===== FUNÇÃO PARA AGUARDAR O CARREGAMENTO DO ESTOQUE =====
function aguardarEstoqueCarregado(timeout = 30000) {
    return new Promise((resolve) => {
        if (typeof produtosEstoque !== 'undefined' && Array.isArray(produtosEstoque) && produtosEstoque.length > 0) {
            console.log('✅ Estoque já carregado.');
            resolve();
            return;
        }
        console.log('⏳ Aguardando carregamento do estoque...');
        const start = Date.now();
        const interval = setInterval(() => {
            if (typeof produtosEstoque !== 'undefined' && Array.isArray(produtosEstoque) && produtosEstoque.length > 0) {
                clearInterval(interval);
                console.log('✅ Estoque carregado após', Date.now() - start, 'ms.');
                resolve();
            } else if (Date.now() - start > timeout) {
                clearInterval(interval);
                console.warn('⚠️ Timeout: estoque não carregado após', timeout, 'ms.');
                resolve();
            }
        }, 300);
    });
}

// ===== ABRIR SISTEMA =====
window.abrirSistemaEntradas = function() {
    if (!currentUser) {
        showToast('⚠️ Faça login primeiro', 'warning');
        return;
    }

    const menuSystem = document.getElementById('menuSystem');
    if (menuSystem) menuSystem.classList.add('hidden');

    const sistemasIds = [
        'mainSystem', 'salesSystem', 'reembolsosSystem', 'caixaSystem', 'promocoesSystem',
        'reviewsSystem', 'folgasSystem', 'shippingSystem', 'estoqueSystem',
        'feedbackSystem', 'perguntasSystem', 'estoqueGestaoSystem', 'nfeSystem',
        'precificacaoSystem', 'fullSystem'
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

    carregarFornecedores();
    carregarEntradas();
    showToast('📦 Sistema de Entradas carregado', 'info');
};

// ===== CARREGAR FORNECEDORES (com indexação por sku_fornecedor) =====
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
                if (!fornecedoresMap[f.cd_fornecedor]) {
                    fornecedoresMap[f.cd_fornecedor] = [];
                }
                fornecedoresMap[f.cd_fornecedor].push(f);
                
                if (f.sku_sistema) {
                    if (!fornecedoresMap[f.sku_sistema]) {
                        fornecedoresMap[f.sku_sistema] = [];
                    }
                    fornecedoresMap[f.sku_sistema].push(f);
                }
                
                if (f.sku_fornecedor) {
                    if (!fornecedoresMap[f.sku_fornecedor]) {
                        fornecedoresMap[f.sku_fornecedor] = [];
                    }
                    fornecedoresMap[f.sku_fornecedor].push(f);
                }
            });
            console.log('✅ Fornecedores carregados:', Object.keys(fornecedoresMap).length);
        }
    } catch (error) {
        console.error('❌ Erro ao carregar fornecedores:', error);
    }
}

// ===== BUSCAR FORNECEDOR =====
function buscarFornecedor(chave) {
    if (!chave) return null;
    const chaveNormalizada = chave.trim();
    if (fornecedoresMap[chaveNormalizada]) {
        return fornecedoresMap[chaveNormalizada][0];
    }
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

// ===== VERIFICAR SKU NO ESTOQUE =====
function verificarSKUExistente(sku) {
    if (!sku) return null;
    const skuNormalizado = sku.trim().toLowerCase();

    if (typeof produtosEstoque === 'undefined' || !Array.isArray(produtosEstoque) || produtosEstoque.length === 0) {
        console.warn('⚠️ produtosEstoque ainda não carregado. SKU não verificado:', skuNormalizado);
        return null;
    }

    const encontrado = produtosEstoque.find(p => {
        const pSku = (p.sku || '').trim().toLowerCase();
        return pSku === skuNormalizado;
    });
    if (encontrado) {
        console.log(`✅ SKU encontrado diretamente: ${encontrado.sku}`);
        return encontrado;
    }

    const fornecedor = buscarFornecedor(skuNormalizado);
    if (fornecedor && fornecedor.sku_sistema) {
        const skuSistema = fornecedor.sku_sistema.trim().toLowerCase();
        const encontradoViaFornecedor = produtosEstoque.find(p => {
            const pSku = (p.sku || '').trim().toLowerCase();
            return pSku === skuSistema;
        });
        if (encontradoViaFornecedor) {
            console.log(`✅ SKU mapeado via fornecedor: ${encontradoViaFornecedor.sku}`);
            return encontradoViaFornecedor;
        }
    }

    console.log(`❌ SKU não encontrado: ${skuNormalizado}`);
    return null;
}

// ===== TESTAR BUSCA =====
window.testarBuscaSKU = function() {
    const sku = prompt('Digite o SKU que deseja buscar:');
    if (!sku) return;
    const resultado = verificarSKUExistente(sku);
    if (resultado) {
        alert(`✅ Produto encontrado:\nSKU: ${resultado.sku}\nNome: ${resultado.nome}\nID: ${resultado.id}`);
    } else {
        alert('❌ Produto não encontrado. Verifique se o SKU está correto.');
    }
};

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
        <p>Processar entradas de estoque via Excel ou XML</p>
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

// ============================================
// RENDERIZAR ENTRADAS (COM ESPERA FORÇADA DO ESTOQUE)
// ============================================
async function renderizarEntradas() {
    if (typeof produtosEstoque === 'undefined' || !Array.isArray(produtosEstoque) || produtosEstoque.length === 0) {
        console.log('🔄 Forçando recarregamento do estoque antes de renderizar...');
        if (typeof carregarProdutosEstoque === 'function') {
            await carregarProdutosEstoque();
        } else {
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
        if (typeof produtosEstoque !== 'undefined' && Array.isArray(produtosEstoque) && produtosEstoque.length > 0) {
            console.log(`✅ Estoque carregado: ${produtosEstoque.length} produtos.`);
        } else {
            console.warn('⚠️ Estoque ainda não disponível. Renderizando sem verificação.');
        }
    }

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
                      'Cole os dados acima ou envie um XML e clique em "Processar Entrada" para começar.'}</p>
            </div>
        `;
        return;
    }

    const podeVerCusto = currentUser && (currentUser.username === 'andressamiotto' || currentUser.username === 'ronald');

    let html = '';
    cardsFiltrados.forEach(card => {
        const total = card.itens.filter(i => i.status !== 'ignorado').length;
        const concluidos = card.itens.filter(i => 
            i.status === 'entrada_realizada' || 
            i.status === 'cadastrado' || 
            i.status === 'ignorado'
        ).length;
        const progresso = total > 0 ? Math.round((concluidos / total) * 100) : 0;
        const isFinalizado = card.status === 'finalizado';
        const criadoEm = new Date(card.criado_em).toLocaleString('pt-BR');

        const origemBadge = card.tipo_entrada === 'xml' 
            ? '<span class="badge badge-info ml-2">📄 XML</span>' 
            : '';

        html += `
            <div class="card mb-4 entrada-card" data-id="${card.id}">
                <div class="card-header" style="flex-wrap:wrap; gap:10px;">
                    <div>
                        <h3 class="card-title" style="margin:0;">
                            <i class="fas fa-receipt"></i>
                            ${card.numero_entrada}
                            ${origemBadge}
                            <span class="badge ${isFinalizado ? 'badge-success' : 'badge-warning'} ml-2">
                                ${isFinalizado ? '✅ Finalizado' : '⏳ Pendente'}
                            </span>
                        </h3>
                        <small class="text-muted">
                            Criado por: ${card.criado_por || 'Sistema'} em ${criadoEm}
                            ${isFinalizado && card.finalizado_por ? ` • Finalizado por: ${card.finalizado_por}` : ''}
                            ${card.fornecedor ? ` • Fornecedor: ${card.fornecedor}` : ''}
                            ${card.nf_numero ? ` • NF: ${card.nf_numero}` : ''}
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
                                <th style="width:70px;">Qtd Entrada</th>
                                ${podeVerCusto ? '<th style="width:90px;">Custo Unit.</th>' : ''}
                                <th>Obs.</th>
                                <th style="width:70px;">Status</th>
                                <th style="width:240px;">Ação</th>
                            </tr>
                        </thead>
                        <tbody>
                `;

        card.itens.forEach((item, idx) => {
            const isConcluido = item.status !== 'pendente';
            const isIgnorado = item.status === 'ignorado';
            
            let itemStatus = '';
            let statusClass = '';
            if (isIgnorado) {
                itemStatus = '⏭️ Ignorado';
                statusClass = 'badge-secondary';
            } else if (item.status === 'entrada_realizada') {
                itemStatus = '✅ Entrada';
                statusClass = 'badge-success';
            } else if (item.status === 'cadastrado') {
                itemStatus = '📝 Cadastrado';
                statusClass = 'badge-info';
            } else {
                itemStatus = '⏳ Pendente';
                statusClass = 'badge-warning';
            }

            const skuParaVerificar = item.sku_match || item.sku_original;
            const produtoExistente = verificarSKUExistente(skuParaVerificar);
            let tituloProduto = '';
            if (produtoExistente) {
                tituloProduto = produtoExistente.nome || '';
            }

            let acaoHtml = '';

            if (isConcluido || isIgnorado) {
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
                        <button class="btn btn-sm btn-secondary" onclick="ignorarItem('${card.id}', ${item.id})" title="Ignorar este item">
                            <i class="fas fa-ban"></i> Ignorar
                        </button>
                    `;
                } else {
                    acaoHtml = `
                        <div class="d-flex flex-wrap gap-1">
                            <button class="btn btn-sm btn-primary" onclick="abrirCadastroRapido('${card.id}', ${item.id})" title="Cadastrar novo produto">
                                <i class="fas fa-plus-circle"></i> Cadastrar
                            </button>
                            <button class="btn btn-sm btn-info" onclick="vincularProdutoExistente('${card.id}', ${item.id})" title="Vincular a um produto já existente">
                                <i class="fas fa-link"></i> Já existe
                            </button>
                            <button class="btn btn-sm btn-secondary" onclick="ignorarItem('${card.id}', ${item.id})" title="Ignorar este item">
                                <i class="fas fa-ban"></i> Ignorar
                            </button>
                        </div>
                        <small class="d-block text-muted">⛔ Produto não encontrado</small>
                    `;
                }
            }

            const skuDisplay = item.sku_match || item.sku_original || '-';
            const fornecedorDisplay = item.fornecedor_nome || item.cd_fornecedor || '-';
            const qtdEntrada = item.quantidade_entrada && item.quantidade_entrada > 0 ? item.quantidade_entrada : '-';
            const custoDisplay = podeVerCusto && item.valor_custo ? `R$ ${parseFloat(item.valor_custo).toFixed(2)}` : (podeVerCusto ? '-' : '');

            html += `
                <tr class="${isConcluido || isIgnorado ? 'table-light' : ''}">
                    <td>${idx + 1}</td>
                    <td>${item.cd_fornecedor || '-'}</td>
                    <td>${item.rastreio || '-'}</td>
                    <td><strong>${item.quantidade || 0}</strong></td>
                    <td>${item.produto || '-'}</td>
                    <td><code>${skuDisplay}</code></td>
                    <td>${fornecedorDisplay}</td>
                    <td>${qtdEntrada}</td>
                    ${podeVerCusto ? `<td>${custoDisplay}</td>` : ''}
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

// ============================================
// FUNÇÃO PARA VERIFICAR DUPLICIDADE DE ENTRADA
// ============================================
async function verificarDuplicidadeEntrada(referencia, sku) {
    if (!referencia || !sku) return false;
    
    try {
        // Busca todos os itens de entrada com a mesma referência
        const { data, error } = await window.supabaseClient
            .from('entrada_items')
            .select('entrada_id, rastreio, sku_original, sku_match')
            .eq('rastreio', referencia.trim());
        
        if (error) {
            console.error('Erro ao verificar duplicidade:', error);
            return false;
        }
        
        if (!data || data.length === 0) return false;
        
        // Verifica se algum item tem o mesmo SKU (original ou match)
        const skuNormalizado = sku.trim().toLowerCase();
        const duplicado = data.some(item => {
            const skuOriginal = (item.sku_original || '').trim().toLowerCase();
            const skuMatch = (item.sku_match || '').trim().toLowerCase();
            return skuOriginal === skuNormalizado || skuMatch === skuNormalizado;
        });
        
        if (duplicado) {
            // Busca o número da entrada para mostrar no erro
            const cardIds = [...new Set(data.map(i => i.entrada_id))];
            const { data: cards } = await window.supabaseClient
                .from('entradas_cards')
                .select('numero_entrada')
                .in('id', cardIds);
            
            const numeros = cards ? cards.map(c => c.numero_entrada).join(', ') : 'desconhecida';
            return {
                duplicado: true,
                entrada: numeros
            };
        }
        
        return false;
    } catch (error) {
        console.error('Erro ao verificar duplicidade:', error);
        return false;
    }
}

// ============================================
// PROCESSAR ENTRADA (Excel) - COM VERIFICAÇÃO DE DUPLICIDADE
// ============================================
window.processarEntrada = async function() {
    if (typeof produtosEstoque === 'undefined' || !Array.isArray(produtosEstoque) || produtosEstoque.length === 0) {
        showToast('🔄 Carregando estoque...', 'info');
        if (typeof carregarProdutosEstoque === 'function') {
            await carregarProdutosEstoque();
        } else {
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
    console.log('✅ Estoque carregado:', produtosEstoque?.length || 0, 'produtos');

    await aguardarEstoqueCarregado();

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
    let duplicatasEncontradas = [];

    // Primeiro, processamos todos os itens para verificar duplicatas
    for (let idx = 0; idx < dadosLinhas.length; idx++) {
        const linha = dadosLinhas[idx];
        const partes = linha.split(separador).map(c => c.trim());
        if (partes.length < 6) {
            erros.push(`Linha ${idx + 1}: poucas colunas (${partes.length})`);
            continue;
        }

        const cdFornecedor = partes[0] || '';
        const rastreio = partes[1] || '';
        const fornecedorNome = partes[2] || '';
        const quantidade = parseInt(partes[3]) || 0;
        const produto = partes[4] || '';
        const sku = partes[5] ? partes[5].trim() : '';
        const observacao = partes[6] || '';
        let valorCusto = 0;
        if (partes.length > 7) {
            const rawCusto = partes[7].replace(',', '.').trim();
            valorCusto = parseFloat(rawCusto) || 0;
        }

        if (!sku && !cdFornecedor) {
            erros.push(`Linha ${idx + 1}: SKU e cd fornecedor vazios`);
            continue;
        }

        // ==== VERIFICAÇÃO DE DUPLICIDADE ====
        if (rastreio && sku) {
            const duplicado = await verificarDuplicidadeEntrada(rastreio, sku);
            if (duplicado && duplicado.duplicado) {
                duplicatasEncontradas.push({
                    linha: idx + 1,
                    rastreio: rastreio,
                    sku: sku,
                    entrada: duplicado.entrada
                });
                continue; // Pula este item
            }
        }

        itensRaw.push({
            cd_fornecedor: cdFornecedor,
            rastreio: rastreio,
            fornecedor_nome: fornecedorNome,
            quantidade: quantidade,
            produto: produto,
            sku_original: sku,
            observacao: observacao,
            valor_custo: valorCusto,
            sku_match: null,
            produto_id: null,
            status: 'pendente',
            acao: null,
            responsavel: null,
            quantidade_entrada: 0,
            data_acao: null
        });
    }

    // Se houver duplicatas, mostra aviso e não processa
    if (duplicatasEncontradas.length > 0) {
        let mensagem = '⚠️ Foram encontradas entradas duplicadas:\n\n';
        duplicatasEncontradas.forEach(d => {
            mensagem += `Linha ${d.linha}: Referência "${d.rastreio}" + SKU "${d.sku}" → Já existe na entrada ${d.entrada}\n`;
        });
        mensagem += '\n\n❌ Corrija os dados e tente novamente.';
        alert(mensagem);
        showToast('❌ Entradas duplicadas detectadas. Corrija os dados.', 'error');
        return;
    }

    if (itensRaw.length === 0) {
        showToast(`⚠️ Nenhum item válido encontrado. ${erros.length} erro(s).`, 'error');
        return;
    }

    if (erros.length > 0) {
        showToast(`⚠️ ${erros.length} erro(s) encontrado(s). ${itensRaw.length} item(s) processados.`, 'warning');
        console.warn('Erros no parsing:', erros);
    }

    // Ordena os itens por rastreio
    itensRaw.sort((a, b) => (a.rastreio || '').localeCompare(b.rastreio || ''));

    // Busca fornecedores e produtos
    for (const item of itensRaw) {
        let fornecedor = null;

        if (item.cd_fornecedor) {
            fornecedor = buscarFornecedor(item.cd_fornecedor);
        }
        if (!fornecedor && item.sku_original) {
            fornecedor = buscarFornecedor(item.sku_original);
        }

        if (fornecedor) {
            if (!item.produto || item.produto.trim() === '' || item.produto === item.sku_original) {
                item.produto = fornecedor.descricao_produto || item.produto;
            }
            if (!item.fornecedor_nome) {
                item.fornecedor_nome = fornecedor.nome_fornecedor;
            }
            if (!item.cd_fornecedor) {
                item.cd_fornecedor = fornecedor.cd_fornecedor;
            }
            if (fornecedor.sku_sistema) {
                item.sku_match = fornecedor.sku_sistema;
            }
        }

        const skuParaBuscar = item.sku_match || item.sku_original;
        if (skuParaBuscar) {
            const produtoEstoque = verificarSKUExistente(skuParaBuscar);
            if (produtoEstoque) {
                item.produto_id = produtoEstoque.id;
                item.sku_match = produtoEstoque.sku;
                if (!item.produto || item.produto.trim() === '') {
                    item.produto = produtoEstoque.nome;
                }
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
            items_concluidos: 0,
            tipo_entrada: 'excel'
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
            valor_custo: item.valor_custo || 0,
            status: 'pendente',
            acao: null,
            responsavel: null,
            data_acao: null,
            tipo_entrada: 'excel'
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

// ============================================
// EXPORTAR ENTRADAS PARA EXCEL
// ============================================
window.exportarEntradasExcel = async function() {
    try {
        showToast('📊 Gerando relatório de entradas...', 'info');
        
        // Verifica se há dados
        if (!entradasCards || entradasCards.length === 0) {
            showToast('⚠️ Nenhuma entrada encontrada para exportar.', 'warning');
            return;
        }
        
        // Monta os dados para o Excel
        const dadosExcel = [];
        
        // Cabeçalho
        const cabecalho = [
            'Nº Entrada',
            'Data Criação',
            'Criado Por',
            'Status',
            'Tipo Entrada',
            'Fornecedor',
            'NF Número',
            'NF Data',
            'Cd Fornecedor',
            'Referência (Rastreio)',
            'Fornecedor Nome',
            'Quantidade',
            'Produto',
            'SKU Original',
            'SKU Match',
            'Observação',
            'Valor Custo',
            'Status Item',
            'Quantidade Entrada',
            'Responsável',
            'Data Ação'
        ];
        dadosExcel.push(cabecalho);
        
        // Para cada card, adiciona suas linhas
        entradasCards.forEach(card => {
            const itensDoCard = card.itens || [];
            
            if (itensDoCard.length === 0) {
                // Adiciona uma linha com os dados do card e itens vazios
                dadosExcel.push([
                    card.numero_entrada || '',
                    formatarDataHora(card.criado_em),
                    card.criado_por || '',
                    card.status || '',
                    card.tipo_entrada || '',
                    card.fornecedor || '',
                    card.nf_numero || '',
                    card.nf_data || '',
                    '', '', '', '', '', '', '', '', '', '', '', '', ''
                ]);
            } else {
                itensDoCard.forEach(item => {
                    dadosExcel.push([
                        card.numero_entrada || '',
                        formatarDataHora(card.criado_em),
                        card.criado_por || '',
                        card.status || '',
                        card.tipo_entrada || '',
                        card.fornecedor || '',
                        card.nf_numero || '',
                        card.nf_data || '',
                        item.cd_fornecedor || '',
                        item.rastreio || '',
                        item.fornecedor_nome || '',
                        item.quantidade || 0,
                        item.produto || '',
                        item.sku_original || '',
                        item.sku_match || '',
                        item.observacao || '',
                        item.valor_custo ? parseFloat(item.valor_custo).toFixed(2) : '',
                        item.status || '',
                        item.quantidade_entrada || 0,
                        item.responsavel || '',
                        item.data_acao ? formatarDataHora(item.data_acao) : ''
                    ]);
                });
            }
        });
        
        // Cria o arquivo Excel
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(dadosExcel);
        
        // Ajusta a largura das colunas
        const colWidths = [
            { wch: 20 }, // Nº Entrada
            { wch: 20 }, // Data Criação
            { wch: 15 }, // Criado Por
            { wch: 12 }, // Status
            { wch: 14 }, // Tipo Entrada
            { wch: 25 }, // Fornecedor
            { wch: 14 }, // NF Número
            { wch: 14 }, // NF Data
            { wch: 16 }, // Cd Fornecedor
            { wch: 25 }, // Referência
            { wch: 25 }, // Fornecedor Nome
            { wch: 12 }, // Quantidade
            { wch: 40 }, // Produto
            { wch: 18 }, // SKU Original
            { wch: 18 }, // SKU Match
            { wch: 30 }, // Observação
            { wch: 14 }, // Valor Custo
            { wch: 14 }, // Status Item
            { wch: 16 }, // Quantidade Entrada
            { wch: 14 }, // Responsável
            { wch: 20 }  // Data Ação
        ];
        ws['!cols'] = colWidths;
        
        XLSX.utils.book_append_sheet(wb, ws, "Entradas");
        
        // Gera o arquivo
        const dataAtual = new Date().toISOString().slice(0, 10);
        const nomeArquivo = `entradas_completas_${dataAtual}.xlsx`;
        XLSX.writeFile(wb, nomeArquivo);
        
        showToast(`✅ Relatório completo exportado com sucesso! (${dadosExcel.length - 1} linhas)`, 'success');
        
    } catch (error) {
        console.error('❌ Erro ao exportar entradas:', error);
        showToast('❌ Erro ao exportar: ' + error.message, 'error');
    }
};

// ============================================
// EXPORTAR RELATÓRIO RESUMIDO DE ENTRADAS
// ============================================
window.exportarEntradasResumido = async function() {
    try {
        showToast('📊 Gerando relatório resumido...', 'info');
        
        // Verifica se há dados
        if (!entradasCards || entradasCards.length === 0) {
            showToast('⚠️ Nenhuma entrada encontrada.', 'warning');
            return;
        }
        
        // Monta dados resumidos
        const dadosExcel = [
            ['Nº Entrada', 'Data Criação', 'Criado Por', 'Status', 'Tipo', 'Fornecedor', 'NF', 'Total Itens', 'Concluídos', 'Progresso']
        ];
        
        for (const card of entradasCards) {
            const itens = card.itens || [];
            const total = itens.length;
            const concluidos = itens.filter(i => i.status !== 'pendente' && i.status !== 'ignorado').length;
            const progresso = total > 0 ? Math.round((concluidos / total) * 100) : 0;
            
            dadosExcel.push([
                card.numero_entrada || '',
                formatarDataHora(card.criado_em),
                card.criado_por || '',
                card.status || '',
                card.tipo_entrada || '',
                card.fornecedor || '',
                card.nf_numero || '',
                total,
                concluidos,
                `${progresso}%`
            ]);
        }
        
        // Cria o arquivo
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(dadosExcel);
        
        ws['!cols'] = [
            { wch: 20 }, { wch: 20 }, { wch: 15 }, { wch: 12 }, 
            { wch: 14 }, { wch: 25 }, { wch: 14 }, { wch: 12 },
            { wch: 12 }, { wch: 10 }
        ];
        
        XLSX.utils.book_append_sheet(wb, ws, "Resumo Entradas");
        
        const dataAtual = new Date().toISOString().slice(0, 10);
        XLSX.writeFile(wb, `entradas_resumo_${dataAtual}.xlsx`);
        
        showToast(`✅ Relatório resumido exportado com sucesso! (${dadosExcel.length - 1} entradas)`, 'success');
        
    } catch (error) {
        console.error('❌ Erro ao exportar resumo:', error);
        showToast('❌ Erro ao exportar: ' + error.message, 'error');
    }
};

// ============================================
// EXPORTAR ENTRADAS POR STATUS
// ============================================
window.exportarEntradasPorStatus = async function() {
    try {
        showToast('📊 Gerando relatório por status...', 'info');
        
        if (!entradasCards || entradasCards.length === 0) {
            showToast('⚠️ Nenhuma entrada encontrada.', 'warning');
            return;
        }
        
        // Separa por status
        const pendentes = entradasCards.filter(c => c.status === 'pendente');
        const finalizados = entradasCards.filter(c => c.status === 'finalizado');
        
        // Cria workbook com 2 sheets
        const wb = XLSX.utils.book_new();
        
        // Sheet: Pendentes
        if (pendentes.length > 0) {
            const dadosPendentes = [
                ['Nº Entrada', 'Data Criação', 'Criado Por', 'Tipo', 'Fornecedor', 'NF', 'Total Itens', 'Concluídos', 'Progresso']
            ];
            for (const card of pendentes) {
                const itens = card.itens || [];
                const total = itens.length;
                const concluidos = itens.filter(i => i.status !== 'pendente' && i.status !== 'ignorado').length;
                const progresso = total > 0 ? Math.round((concluidos / total) * 100) : 0;
                
                dadosPendentes.push([
                    card.numero_entrada || '',
                    formatarDataHora(card.criado_em),
                    card.criado_por || '',
                    card.tipo_entrada || '',
                    card.fornecedor || '',
                    card.nf_numero || '',
                    total,
                    concluidos,
                    `${progresso}%`
                ]);
            }
            const wsPendentes = XLSX.utils.aoa_to_sheet(dadosPendentes);
            wsPendentes['!cols'] = [
                { wch: 20 }, { wch: 20 }, { wch: 15 }, { wch: 14 }, 
                { wch: 25 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 10 }
            ];
            XLSX.utils.book_append_sheet(wb, wsPendentes, "Pendentes");
        }
        
        // Sheet: Finalizados
        if (finalizados.length > 0) {
            const dadosFinalizados = [
                ['Nº Entrada', 'Data Criação', 'Criado Por', 'Finalizado Por', 'Data Finalização', 'Tipo', 'Fornecedor', 'NF', 'Total Itens']
            ];
            for (const card of finalizados) {
                const itens = card.itens || [];
                
                dadosFinalizados.push([
                    card.numero_entrada || '',
                    formatarDataHora(card.criado_em),
                    card.criado_por || '',
                    card.finalizado_por || '',
                    card.finalizado_em ? formatarDataHora(card.finalizado_em) : '',
                    card.tipo_entrada || '',
                    card.fornecedor || '',
                    card.nf_numero || '',
                    itens.length
                ]);
            }
            const wsFinalizados = XLSX.utils.aoa_to_sheet(dadosFinalizados);
            wsFinalizados['!cols'] = [
                { wch: 20 }, { wch: 20 }, { wch: 15 }, { wch: 15 }, 
                { wch: 20 }, { wch: 14 }, { wch: 25 }, { wch: 14 }, { wch: 12 }
            ];
            XLSX.utils.book_append_sheet(wb, wsFinalizados, "Finalizados");
        }
        
        // Se não houver dados em nenhuma sheet, avisa
        if (wb.SheetNames.length === 0) {
            showToast('⚠️ Nenhum dado para exportar.', 'warning');
            return;
        }
        
        const dataAtual = new Date().toISOString().slice(0, 10);
        XLSX.writeFile(wb, `entradas_por_status_${dataAtual}.xlsx`);
        
        showToast(`✅ Relatório por status exportado com sucesso!`, 'success');
        
    } catch (error) {
        console.error('❌ Erro ao exportar por status:', error);
        showToast('❌ Erro ao exportar: ' + error.message, 'error');
    }
};

// ============================================
// FUNÇÃO AUXILIAR PARA FORMATAR DATA/HORA
// ============================================
function formatarDataHora(dataISO) {
    if (!dataISO) return '';
    try {
        const data = new Date(dataISO);
        // Verifica se a data é válida
        if (isNaN(data.getTime())) return dataISO;
        return data.toLocaleString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch {
        return dataISO;
    }
}

// ============================================
// FUNÇÃO PARA FECHAR O MENU DE EXPORTAÇÃO (GLOBAL)
// ============================================
window.toggleExportMenu = function() {
    const menu = document.getElementById('exportMenu');
    if (menu) {
        menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
    }
};

// Fecha o menu ao clicar fora
document.addEventListener('click', function(e) {
    const menu = document.getElementById('exportMenu');
    const btn = document.querySelector('.dropdown .btn-success');
    if (menu && btn && !menu.contains(e.target) && !btn.contains(e.target)) {
        menu.style.display = 'none';
    }
});

console.log('✅ Funções de exportação de entradas carregadas!');

// ===== EXTRAIR APENAS O IPI DA NOTA =====
function extrairIPI(det) {
    let ipi = 0;
    const ipiNode = det.querySelector('IPI');
    if (ipiNode) {
        const ipiValNode = ipiNode.querySelector('vIPI');
        if (ipiValNode) ipi = parseFloat(ipiValNode.textContent) || 0;
    }
    return ipi;
}

// ============================================
// FUNÇÃO AUXILIAR PARA FORMATAR DATA/HORA
// ============================================
function formatarDataHora(dataISO) {
    if (!dataISO) return '';
    try {
        const data = new Date(dataISO);
        return data.toLocaleString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch {
        return dataISO;
    }
}

// ============================================
// EXPORTAR ENTRADAS POR STATUS
// ============================================
window.exportarEntradasPorStatus = async function() {
    try {
        showToast('📊 Gerando relatório por status...', 'info');
        
        // Busca todas as entradas
        const { data: cards, error: errCards } = await window.supabaseClient
            .from('entradas_cards')
            .select('*')
            .order('criado_em', { ascending: false });
        
        if (errCards) throw errCards;
        
        if (!cards || cards.length === 0) {
            showToast('⚠️ Nenhuma entrada encontrada.', 'warning');
            return;
        }
        
        // Separa por status
        const pendentes = cards.filter(c => c.status === 'pendente');
        const finalizados = cards.filter(c => c.status === 'finalizado');
        
        // Cria workbook com 2 sheets
        const wb = XLSX.utils.book_new();
        
        // Sheet: Pendentes
        if (pendentes.length > 0) {
            const dadosPendentes = [
                ['Nº Entrada', 'Data Criação', 'Criado Por', 'Tipo', 'Fornecedor', 'NF', 'Total Itens', 'Concluídos', 'Progresso']
            ];
            for (const card of pendentes) {
                const { data: itens } = await window.supabaseClient
                    .from('entrada_items')
                    .select('status')
                    .eq('entrada_id', card.id);
                
                const total = itens ? itens.length : 0;
                const concluidos = itens ? itens.filter(i => i.status !== 'pendente' && i.status !== 'ignorado').length : 0;
                const progresso = total > 0 ? Math.round((concluidos / total) * 100) : 0;
                
                dadosPendentes.push([
                    card.numero_entrada || '',
                    formatarDataHora(card.criado_em),
                    card.criado_por || '',
                    card.tipo_entrada || '',
                    card.fornecedor || '',
                    card.nf_numero || '',
                    total,
                    concluidos,
                    `${progresso}%`
                ]);
            }
            const wsPendentes = XLSX.utils.aoa_to_sheet(dadosPendentes);
            wsPendentes['!cols'] = [
                { wch: 20 }, { wch: 20 }, { wch: 15 }, { wch: 14 }, 
                { wch: 25 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 10 }
            ];
            XLSX.utils.book_append_sheet(wb, wsPendentes, "Pendentes");
        }
        
        // Sheet: Finalizados
        if (finalizados.length > 0) {
            const dadosFinalizados = [
                ['Nº Entrada', 'Data Criação', 'Criado Por', 'Finalizado Por', 'Data Finalização', 'Tipo', 'Fornecedor', 'NF', 'Total Itens']
            ];
            for (const card of finalizados) {
                const { data: itens } = await window.supabaseClient
                    .from('entrada_items')
                    .select('status')
                    .eq('entrada_id', card.id);
                
                dadosFinalizados.push([
                    card.numero_entrada || '',
                    formatarDataHora(card.criado_em),
                    card.criado_por || '',
                    card.finalizado_por || '',
                    card.finalizado_em ? formatarDataHora(card.finalizado_em) : '',
                    card.tipo_entrada || '',
                    card.fornecedor || '',
                    card.nf_numero || '',
                    itens ? itens.length : 0
                ]);
            }
            const wsFinalizados = XLSX.utils.aoa_to_sheet(dadosFinalizados);
            wsFinalizados['!cols'] = [
                { wch: 20 }, { wch: 20 }, { wch: 15 }, { wch: 15 }, 
                { wch: 20 }, { wch: 14 }, { wch: 25 }, { wch: 14 }, { wch: 12 }
            ];
            XLSX.utils.book_append_sheet(wb, wsFinalizados, "Finalizados");
        }
        
        // Se não houver dados em nenhuma sheet, avisa
        if (wb.SheetNames.length === 0) {
            showToast('⚠️ Nenhum dado para exportar.', 'warning');
            return;
        }
        
        const dataAtual = new Date().toISOString().slice(0, 10);
        XLSX.writeFile(wb, `entradas_por_status_${dataAtual}.xlsx`);
        
        showToast(`✅ Relatório por status exportado com sucesso!`, 'success');
        
    } catch (error) {
        console.error('❌ Erro ao exportar por status:', error);
        showToast('❌ Erro ao exportar: ' + error.message, 'error');
    }
};

// ============================================
// PROCESSAR XML DA NOTA FISCAL - COM VERIFICAÇÃO DE DUPLICIDADE
// ============================================
window.processarXML = async function() {
    const fileInput = document.getElementById('xmlFileInput');
    if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
        showToast('⚠️ Selecione um arquivo XML primeiro.', 'warning');
        return;
    }

    const file = fileInput.files[0];
    if (!file.name.toLowerCase().endsWith('.xml')) {
        showToast('⚠️ O arquivo deve ser um XML (.xml)', 'warning');
        return;
    }

    if (typeof produtosEstoque === 'undefined' || !Array.isArray(produtosEstoque) || produtosEstoque.length === 0) {
        showToast('🔄 Carregando estoque...', 'info');
        if (typeof carregarProdutosEstoque === 'function') {
            await carregarProdutosEstoque();
        } else {
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
    await aguardarEstoqueCarregado();

    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const xmlString = e.target.result;
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlString, "text/xml");

            const nfeNode = xmlDoc.querySelector('NFe') || xmlDoc.querySelector('nfeProc');
            if (!nfeNode) {
                showToast('❌ Arquivo XML não é uma NF-e válida.', 'error');
                return;
            }

            const emitNode = nfeNode.querySelector('emit');
            const fornecedorNome = emitNode ? emitNode.querySelector('xNome')?.textContent || '' : '';
            const fornecedorCNPJ = emitNode ? emitNode.querySelector('CNPJ')?.textContent || '' : '';

            const ideNode = nfeNode.querySelector('ide');
            const nNF = ideNode ? ideNode.querySelector('nNF')?.textContent || '' : '';
            const dhEmi = ideNode ? ideNode.querySelector('dhEmi')?.textContent || '' : '';
            const dataEmissao = dhEmi ? new Date(dhEmi).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];

            const detNodes = xmlDoc.querySelectorAll('det');
            if (detNodes.length === 0) {
                showToast('⚠️ Nenhum item encontrado na nota fiscal.', 'warning');
                return;
            }

            const itens = [];
            let duplicatasEncontradas = [];

            for (const det of detNodes) {
                const prod = det.querySelector('prod');
                if (!prod) continue;

                const cProd = prod.querySelector('cProd')?.textContent || '';
                const xProd = prod.querySelector('xProd')?.textContent || '';
                const NCM = prod.querySelector('NCM')?.textContent || '';
                const qCom = parseFloat(prod.querySelector('qCom')?.textContent || '0');
                const vUnCom = parseFloat(prod.querySelector('vUnCom')?.textContent || '0');
                const uCom = prod.querySelector('uCom')?.textContent || '';

                const ipi = extrairIPI(det);
                const valorCustoUnitario = vUnCom + (ipi / (qCom || 1));

                const rastreio = `NF-${nNF}-${cProd}`;

                // ==== VERIFICAÇÃO DE DUPLICIDADE ====
                if (rastreio && cProd) {
                    const duplicado = await verificarDuplicidadeEntrada(rastreio, cProd);
                    if (duplicado && duplicado.duplicado) {
                        duplicatasEncontradas.push({
                            rastreio: rastreio,
                            sku: cProd,
                            entrada: duplicado.entrada,
                            produto: xProd || 'Sem nome'
                        });
                        continue; // Pula este item
                    }
                }

                const fornecedor = buscarFornecedor(cProd);
                let skuSistema = fornecedor ? fornecedor.sku_sistema : null;
                let nomeFornecedor = fornecedor ? fornecedor.nome_fornecedor : fornecedorNome || '';
                let cdFornecedor = fornecedor ? fornecedor.cd_fornecedor : cProd;

                let produtoEstoque = null;
                if (skuSistema) {
                    produtoEstoque = verificarSKUExistente(skuSistema);
                }
                if (!produtoEstoque && cProd) {
                    produtoEstoque = verificarSKUExistente(cProd);
                }

                itens.push({
                    cd_fornecedor: cdFornecedor || '',
                    fornecedor_nome: nomeFornecedor || '',
                    rastreio: rastreio,
                    quantidade: qCom || 0,
                    produto: xProd || '',
                    sku_original: cProd || '',
                    sku_match: skuSistema || (produtoEstoque ? produtoEstoque.sku : null),
                    produto_id: produtoEstoque ? produtoEstoque.id : null,
                    observacao: `NF-e ${nNF} | ${fornecedorNome}`,
                    ncm: NCM || '',
                    valor_unitario: vUnCom || 0,
                    cprod_fornecedor: cProd || '',
                    tipo_entrada: 'xml',
                    status: 'pendente',
                    quantidade_entrada: 0,
                    acao: null,
                    responsavel: null,
                    data_acao: null,
                    valor_custo: valorCustoUnitario
                });
            }

            // Se houver duplicatas, mostra aviso e não processa
            if (duplicatasEncontradas.length > 0) {
                let mensagem = '⚠️ Foram encontradas entradas duplicadas no XML:\n\n';
                duplicatasEncontradas.forEach(d => {
                    mensagem += `Produto "${d.produto}" (SKU: ${d.sku}) → Já existe na entrada ${d.entrada}\n`;
                });
                mensagem += '\n\n❌ Corrija os dados do XML e tente novamente.';
                alert(mensagem);
                showToast('❌ Entradas duplicadas detectadas no XML.', 'error');
                return;
            }

            if (itens.length === 0) {
                showToast('⚠️ Nenhum item válido extraído da nota.', 'warning');
                return;
            }

            const numeroEntrada = await gerarNumeroEntrada();

            if (!window.supabaseClient) throw new Error('Supabase não conectado');

            const cardData = {
                numero_entrada: numeroEntrada,
                dados_brutos: xmlString.substring(0, 500) + '...',
                status: 'pendente',
                criado_por: currentUser.name,
                criado_em: new Date().toISOString(),
                total_items: itens.length,
                items_concluidos: 0,
                tipo_entrada: 'xml',
                fornecedor: fornecedorNome,
                nf_numero: nNF,
                nf_data: dataEmissao
            };

            const { data: cardResult, error: cardError } = await window.supabaseClient
                .from('entradas_cards')
                .insert([cardData])
                .select();

            if (cardError) throw cardError;
            const card = cardResult[0];

            const itemsToInsert = itens.map(item => ({
                entrada_id: card.id,
                cd_fornecedor: item.cd_fornecedor || '',
                rastreio: item.rastreio || '',
                fornecedor_nome: item.fornecedor_nome || '',
                quantidade: item.quantidade,
                produto: item.produto || '',
                sku_original: item.sku_original || '',
                sku_match: item.sku_match || '',
                produto_id: item.produto_id || null,
                observacao: item.observacao || '',
                ncm: item.ncm || '',
                valor_unitario: item.valor_unitario || 0,
                cprod_fornecedor: item.cprod_fornecedor || '',
                tipo_entrada: 'xml',
                status: 'pendente',
                acao: null,
                responsavel: null,
                data_acao: null,
                quantidade_entrada: 0,
                valor_custo: item.valor_custo || 0
            }));

            const { error: itemsError } = await window.supabaseClient
                .from('entrada_items')
                .insert(itemsToInsert);

            if (itemsError) throw itemsError;

            showToast(`✅ Entrada ${numeroEntrada} criada com ${itens.length} item(s) a partir do XML!`, 'success');
            fileInput.value = '';
            await carregarEntradas();

        } catch (error) {
            console.error('❌ Erro ao processar XML:', error);
            showToast('❌ Erro ao processar XML: ' + error.message, 'error');
        }
    };
    reader.readAsText(file);
};

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

// ============================================
// AÇÕES DOS ITENS
// ============================================

// ===== DAR ENTRADA EM UM ITEM (COM CONFIRMAÇÃO DE QUANTIDADE) =====
// ===== DAR ENTRADA EM UM ITEM (COM CONFIRMAÇÃO DE QUANTIDADE) =====
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

    const quantidadeSugerida = item.quantidade || 1;
    
    const quantidadeStr = prompt(
        `Quantas unidades deseja dar entrada?\n(Sugestão: ${quantidadeSugerida})`,
        quantidadeSugerida.toString()
    );
    
    if (quantidadeStr === null) {
        showToast('Operação cancelada.', 'info');
        return;
    }
    
    const quantidade = parseInt(quantidadeStr);
    if (isNaN(quantidade) || quantidade <= 0) {
        showToast('Quantidade inválida. Deve ser um número positivo.', 'warning');
        return;
    }

    if (!confirm(`Confirmar entrada de ${quantidade} unidade(s) do SKU "${item.sku_original}"?`)) {
        return;
    }

    try {
        if (!window.supabaseClient) throw new Error('Supabase não conectado');

        const { data: produto, error: errProd } = await window.supabaseClient
            .from('produtos_estoque')
            .select('quantidade, dados_extra, historico_custos, bloquear_sync_ml')
            .eq('id', produtoId)
            .single();

        if (errProd) throw errProd;

        const novaQuantidade = (produto.quantidade || 0) + quantidade;

        // ==== SALVAR VALOR DE CUSTO ====
        const valorCusto = item.valor_custo || 0;
        let historicoCustos = produto.historico_custos || [];
        
        // Adicionar novo custo ao histórico
        if (valorCusto > 0) {
            historicoCustos.push({
                valor: valorCusto,
                data: new Date().toISOString(),
                entrada: card.numero_entrada,
                quantidade: quantidade,
                usuario: currentUser.name
            });
            
            // Manter apenas os últimos 50 registros
            if (historicoCustos.length > 50) {
                historicoCustos = historicoCustos.slice(-50);
            }
        }

        // Calcular custo médio
        const custosValidos = historicoCustos.filter(h => h.valor > 0);
        const custoMedio = custosValidos.length > 0 
            ? custosValidos.reduce((sum, h) => sum + h.valor, 0) / custosValidos.length 
            : 0;

        // Atualizar dados_extra com o custo
        let dadosExtra = produto.dados_extra || {};
        dadosExtra.ultimo_custo = valorCusto;
        dadosExtra.custo_medio = custoMedio;
        dadosExtra.historico_custos = historicoCustos;

        const { error: errUpdate } = await window.supabaseClient
            .from('produtos_estoque')
            .update({ 
                quantidade: novaQuantidade,
                dados_extra: dadosExtra,
                historico_custos: historicoCustos,
                ultimo_custo: valorCusto,
                custo_medio: custoMedio
            })
            .eq('id', produtoId);

        if (errUpdate) throw errUpdate;

        await registrarMovimentacao(
            produtoId,
            'entrada',
            quantidade,
            `ENT-${card.numero_entrada}`,
            'nova'
        );

        const { error: errItem } = await window.supabaseClient
            .from('entrada_items')
            .update({
                status: 'entrada_realizada',
                acao: 'entrada',
                quantidade_entrada: quantidade,
                responsavel: currentUser.name,
                data_acao: new Date().toISOString()
            })
            .eq('id', itemId);

        if (errItem) throw errItem;

        const concluidos = card.itens.filter(i => 
            i.id != itemId && (i.status !== 'pendente' && i.status !== 'ignorado')
        ).length + 1;
        const total = card.itens.filter(i => i.status !== 'ignorado').length;
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

        showToast(`✅ Entrada de ${quantidade} unidade(s) realizada! Custo: R$ ${valorCusto.toFixed(2)}`, 'success');
        await carregarEntradas();

        // ===== VERIFICAR BLOQUEIO DE SINCRONIZAÇÃO =====
        const syncBloqueado = produto.bloquear_sync_ml || dadosExtra.bloquear_sync_ml || false;

        if (typeof produtosEstoque !== 'undefined' && Array.isArray(produtosEstoque)) {
            const produtoAtualizado = produtosEstoque.find(p => p.id == produtoId);
            if (produtoAtualizado && produtoAtualizado.dados_extra?.mlb_codes) {
                if (!syncBloqueado) {
                    // Verificar se o usuário é autorizado a sincronizar (opcional)
                    const username = currentUser?.username?.toLowerCase() || '';
                    const isAdmin = usuariosAdmin && usuariosAdmin.includes(username);
                    const podeModificarSync = (usuariosAutorizadosSync && usuariosAutorizadosSync.includes(username)) || isAdmin;
                    
                    if (podeModificarSync) {
                        setTimeout(() => {
                            if (typeof sincronizarEstoqueML === 'function') {
                                console.log(`🔄 Sincronizando produto ${produtoAtualizado.sku} com ML (entrada de estoque)`);
                                sincronizarEstoqueML(produtoAtualizado);
                            }
                        }, 500);
                    } else {
                        console.log(`ℹ️ Usuário ${username} não autorizado a sincronizar com ML. Sincronização automática ignorada.`);
                    }
                } else {
                    console.log(`🔒 Produto ${produtoAtualizado.sku} com sincronização BLOQUEADA. Não será sincronizado após entrada.`);
                }
            }
        }

    } catch (error) {
        console.error('❌ Erro ao dar entrada:', error);
        showToast('❌ Erro ao dar entrada: ' + error.message, 'error');
    }
};

// ===== IGNORAR ITEM =====
window.ignorarItem = async function(cardId, itemId) {
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

    if (!confirm(`Deseja ignorar o item "${item.produto}"? Ele será marcado como ignorado.`)) {
        return;
    }

    try {
        if (!window.supabaseClient) throw new Error('Supabase não conectado');

        const { error: errItem } = await window.supabaseClient
            .from('entrada_items')
            .update({
                status: 'ignorado',
                acao: 'ignorado',
                responsavel: currentUser.name,
                data_acao: new Date().toISOString(),
                quantidade_entrada: 0
            })
            .eq('id', itemId);

        if (errItem) throw errItem;

        const concluidos = card.itens.filter(i => 
            i.id != itemId && (i.status !== 'pendente' && i.status !== 'ignorado')
        ).length + 1;
        const total = card.itens.filter(i => i.status !== 'ignorado').length;
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

        showToast(`⏭️ Item ignorado com sucesso!`, 'info');
        await carregarEntradas();

    } catch (error) {
        console.error('❌ Erro ao ignorar item:', error);
        showToast('❌ Erro ao ignorar: ' + error.message, 'error');
    }
};

// ===== VINCULAR PRODUTO EXISTENTE =====
window.vincularProdutoExistente = async function(cardId, itemId) {
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

    const skuExistente = prompt('Digite o SKU do produto já cadastrado no sistema:');
    if (!skuExistente) {
        showToast('Operação cancelada', 'info');
        return;
    }

    const produtoExistente = verificarSKUExistente(skuExistente);
    if (!produtoExistente) {
        showToast(`❌ Produto com SKU "${skuExistente}" não encontrado no estoque.`, 'error');
        return;
    }

    if (!confirm(`Deseja vincular o item "${item.produto}" ao produto existente:\nSKU: ${produtoExistente.sku}\nNome: ${produtoExistente.nome}\nID: ${produtoExistente.id}?`)) {
        return;
    }

    try {
        if (!window.supabaseClient) throw new Error('Supabase não conectado');

        const { error: errItem } = await window.supabaseClient
            .from('entrada_items')
            .update({
                produto_id: produtoExistente.id,
                sku_match: produtoExistente.sku,
                status: 'cadastrado',
                acao: 'vinculo',
                responsavel: currentUser.name,
                data_acao: new Date().toISOString()
            })
            .eq('id', itemId);

        if (errItem) throw errItem;

        const cdFornecedor = item.cd_fornecedor || '';
        const skuFornecedor = item.sku_original || '';
        const fornecedorNome = item.fornecedor_nome || '';

        const { data: existing, error: errExists } = await window.supabaseClient
            .from('fornecedores')
            .select('id')
            .eq('cd_fornecedor', cdFornecedor)
            .eq('sku_fornecedor', skuFornecedor)
            .maybeSingle();

        if (errExists) throw errExists;

        if (!existing) {
            const fornecedorData = {
                cd_fornecedor: cdFornecedor || '',
                nome_fornecedor: fornecedorNome || '',
                sku_fornecedor: skuFornecedor || '',
                sku_sistema: produtoExistente.sku,
                descricao_produto: produtoExistente.nome
            };
            const { error: errFornecedor } = await window.supabaseClient
                .from('fornecedores')
                .insert([fornecedorData]);
            if (errFornecedor) throw errFornecedor;
            console.log(`✅ Mapeamento criado: ${cdFornecedor} → ${produtoExistente.sku}`);
        }

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

        await carregarFornecedores();
        await carregarEntradas();

        showToast(`✅ Item vinculado ao produto "${produtoExistente.nome}" com sucesso!`, 'success');

    } catch (error) {
        console.error('❌ Erro ao vincular produto:', error);
        showToast('❌ Erro ao vincular: ' + error.message, 'error');
    }
};

// ===== ABRIR CADASTRO RÁPIDO (CORRIGIDO) =====
// ===== ABRIR CADASTRO RÁPIDO (CORRIGIDO) =====
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

    // Verificar se a função existe
    if (typeof abrirModalProdutoEstoque !== 'function') {
        showToast('❌ Função de cadastro não disponível. Recarregue a página.', 'error');
        console.error('❌ abrirModalProdutoEstoque não é uma função');
        return;
    }

    // Abrir o modal para novo produto
    abrirModalProdutoEstoque(null);
    
    // Preencher os campos com os dados do item
    setTimeout(() => {
        const nomeInput = document.getElementById('produtoNome');
        const skuInput = document.getElementById('produtoSKU');
        const categoriaSelect = document.getElementById('produtoCategoria');
        
        if (nomeInput) nomeInput.value = item.produto || '';
        if (skuInput) skuInput.value = item.sku_original || '';
        
        // Se tiver categoria, tenta selecionar
        if (categoriaSelect && item.categoria) {
            categoriaSelect.value = item.categoria;
            gerarCamposDinamicos(item.categoria);
        }
        
        // Forçar a exibição do modal novamente (por segurança)
        const modal = document.getElementById('modalProdutoEstoque');
        if (modal) {
            modal.classList.remove('hidden');
            modal.style.display = 'flex';
            modal.style.alignItems = 'center';
            modal.style.justifyContent = 'center';
            modal.style.zIndex = '9999';
        }
        
        // Configurar o botão de salvar
        configurarBotaoSalvarModal(cardId, itemId);
    }, 300);

    showToast('📝 Preencha os dados do produto e clique em Salvar', 'info');
};

// ===== CONFIGURAR BOTÃO SALVAR DO MODAL =====
function configurarBotaoSalvarModal(cardId, itemId) {
    const modal = document.getElementById('modalProdutoEstoque');
    if (!modal) return;
    
    const salvarBtn = document.getElementById('salvarProdutoEstoqueBtn') || 
                     document.querySelector('#modalProdutoEstoque .btn-success');
    if (salvarBtn) {
        const novoBtn = salvarBtn.cloneNode(true);
        salvarBtn.parentNode.replaceChild(novoBtn, salvarBtn);
        
        novoBtn.onclick = async function() {
            if (typeof salvarProdutoEstoque === 'function') {
                await salvarProdutoEstoque();
                setTimeout(() => {
                    processarItemAposCadastro(cardId, itemId);
                }, 1500);
            }
        };
    }
}

// ===== PROCESSAR ITEM APÓS CADASTRO =====
async function processarItemAposCadastro(cardId, itemId) {
    try {
        if (!window.supabaseClient) throw new Error('Supabase não conectado');

        // Aguardar um pouco para garantir que o produto foi salvo
        await new Promise(resolve => setTimeout(resolve, 1000));

        const { data: item, error: errItem } = await window.supabaseClient
            .from('entrada_items')
            .select('*')
            .eq('id', itemId)
            .single();

        if (errItem) throw errItem;

        const produto = verificarSKUExistente(item.sku_original);
        if (!produto) {
            // Tentar buscar pelo SKU match
            const produtoMatch = verificarSKUExistente(item.sku_match);
            if (produtoMatch) {
                await atualizarItemEntrada(cardId, itemId, produtoMatch.id, produtoMatch.sku);
                return;
            }
            showToast('⚠️ Produto não encontrado após cadastro. Tente novamente.', 'warning');
            return;
        }

        await atualizarItemEntrada(cardId, itemId, produto.id, produto.sku);

    } catch (error) {
        console.error('❌ Erro ao processar item após cadastro:', error);
        showToast('❌ Erro: ' + error.message, 'error');
    }
}

async function atualizarItemEntrada(cardId, itemId, produtoId, skuMatch) {
    try {
        const { error: errUpdate } = await window.supabaseClient
            .from('entrada_items')
            .update({
                produto_id: produtoId,
                sku_match: skuMatch,
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
        console.error('❌ Erro ao atualizar item da entrada:', error);
        throw error;
    }
}

// ===== ABRIR CADASTRO DE PRODUTO NOVO + CRIAR OS =====
window.abrirCadastroNovoComOS = function(cardId, itemId) {
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
        item: item,
        acao: 'novo_com_os'
    };

    if (typeof abrirModalProdutoEstoque === 'function') {
        abrirModalProdutoEstoque(null);
        
        setTimeout(() => {
            const nomeInput = document.getElementById('produtoNome');
            const skuInput = document.getElementById('produtoSKU');
            if (nomeInput) nomeInput.value = item.produto || '';
            if (skuInput) skuInput.value = item.sku_original || '';
            
            const modal = document.getElementById('modalProdutoEstoque');
            if (modal) {
                modal.classList.remove('hidden');
                modal.style.display = 'flex';
            }
            
            const salvarBtn = document.getElementById('salvarProdutoEstoqueBtn') || 
                             document.querySelector('#modalProdutoEstoque .btn-success');
            if (salvarBtn) {
                const novoBtn = salvarBtn.cloneNode(true);
                salvarBtn.parentNode.replaceChild(novoBtn, salvarBtn);
                novoBtn.onclick = function() {
                    if (typeof salvarProdutoEstoque === 'function') {
                        salvarProdutoEstoque();
                        setTimeout(() => {
                            processarNovoProdutoComOS(cardId, itemId);
                        }, 1500);
                    }
                };
            }
        }, 300);

        showToast('📝 Preencha os dados do produto e clique em Salvar. Depois criaremos a(s) OS.', 'info');
    } else {
        showToast('❌ Função de cadastro não disponível', 'error');
    }
};

// ===== PROCESSAR NOVO PRODUTO + CRIAR OS =====
async function processarNovoProdutoComOS(cardId, itemId) {
    try {
        if (!window.supabaseClient) throw new Error('Supabase não conectado');

        await new Promise(resolve => setTimeout(resolve, 1000));

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

        const quantidadeOS = parseInt(prompt('Quantas OS deseja criar para este produto?', '1'));
        if (!quantidadeOS || quantidadeOS < 1) {
            showToast('Operação cancelada ou quantidade inválida.', 'info');
            return;
        }

        for (let i = 1; i <= quantidadeOS; i++) {
            const observacao = prompt(`Observações para a OS #${i} (opcional):`, '');
            const osCriada = await criarOSCompleta({
                nomeProduto: produto.nome,
                sku: produto.sku,
                responsavel: 'Elaine',
                urgência: 'normal',
                tipoOS: 'normal',
                servico: 'estudio',
                observacoes: observacao || '',
                criadoPor: currentUser.name
            });

            if (osCriada) {
                showToast(`✅ OS #${i} criada com sucesso para Elaine!`, 'success');
            } else {
                showToast(`❌ Erro ao criar OS #${i}.`, 'error');
            }
        }

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

        entradaEmProcessamento = null;
        await carregarEntradas();

    } catch (error) {
        console.error('❌ Erro ao processar novo produto com OS:', error);
        showToast('❌ Erro: ' + error.message, 'error');
    }
}

// ===== CRIAR UMA ORDEM DE SERVIÇO COMPLETA =====
async function criarOSCompleta(dados) {
    try {
        if (!window.supabaseClient) throw new Error('Supabase não conectado');

        const codigo = window.generateOSCode ? window.generateOSCode() : `OS-${Date.now().toString().slice(-6)}`;

        const prazoHoras = dados.urgência === 'alta' ? 2 : dados.urgência === 'normal' ? 48 : 36;

        let prazoEsperado = null;
        if (typeof window.calcularPrazoPorPrioridade === 'function') {
            prazoEsperado = window.calcularPrazoPorPrioridade(new Date(), dados.urgência);
        }

        const osData = {
            codigo: codigo,
            produto_nome: dados.nomeProduto,
            responsavel: dados.responsavel || 'Elaine',
            link_anuncio: dados.linkAnuncio || '',
            criado_por: dados.criadoPor || currentUser.name,
            urgencia: dados.urgência || 'normal',
            tipo_os: dados.tipoOS || 'normal',
            status: 'pendente',
            tipo_foto: dados.servico || 'estudio',
            observacoes: dados.observacoes || '',
            skus: dados.sku ? [dados.sku] : [],
            fotos: [],
            qtd_fotos: 0,
            qtd_edicoes: 0,
            conferido: false,
            user_notified: false,
            precisa_foto: 'nao',
            valor_anuncio: 0,
            descricao_anuncio: '',
            link_novo_anuncio: '',
            data_criacao: new Date().toISOString(),
            ultima_atualizacao: new Date().toISOString(),
            prazo_horas: prazoHoras,
            prazo_esperado: prazoEsperado,
            anuncio_criado: false
        };

        const { data, error } = await window.supabaseClient
            .from('ordens_service')
            .insert([osData])
            .select();

        if (error) throw error;

        console.log('✅ OS criada:', data);
        return data && data[0] ? data[0] : true;

    } catch (error) {
        console.error('❌ Erro ao criar OS:', error);
        return false;
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

// ============================================
// FUNÇÕES AUXILIARES
// ============================================

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

window.buscarEntradas = function() {
    renderizarEntradas();
};

window.limparAreaEntrada = function() {
    document.getElementById('entradaPasteArea').value = '';
    showToast('Área limpa', 'info');
};

// ============================================
// REGISTRAR MOVIMENTAÇÃO (fallback)
// ============================================
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
// SOBRESCREVER SALVAR PRODUTO
// ============================================
const _salvarProdutoEstoqueOriginal = window.salvarProdutoEstoque;

window.salvarProdutoEstoque = async function() {
    if (typeof _salvarProdutoEstoqueOriginal === 'function') {
        await _salvarProdutoEstoqueOriginal();
    }

    if (entradaEmProcessamento) {
        const { cardId, itemId, item, acao } = entradaEmProcessamento;
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
                        acao: acao === 'novo_com_os' ? 'novo_com_os' : 'cadastro',
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

                if (acao === 'novo_com_os') {
                    await processarNovoProdutoComOS(cardId, itemId);
                } else {
                    showToast(`✅ Produto cadastrado e vinculado à entrada!`, 'success');
                    entradaEmProcessamento = null;
                    await carregarEntradas();
                }

            } catch (error) {
                console.error('❌ Erro ao vincular produto cadastrado:', error);
                showToast('⚠️ Produto cadastrado, mas houve erro ao vincular à entrada.', 'warning');
            }
        }
    }
};

// ===== FUNÇÃO PARA ADICIONAR BOTÃO "PRODUTO NOVO" =====
function adicionarBotaoProdutoNovo(cardId, itemId) {
    // Remove botão existente se houver
    const btnExistente = document.getElementById('btnProdutoNovoOS');
    if (btnExistente) btnExistente.remove();

    // Cria o container do botão
    const container = document.querySelector('#modalProdutoEstoque .d-flex.justify-content-between.gap-2.mt-3');
    if (!container) return;

    // Cria o botão
    const btn = document.createElement('button');
    btn.id = 'btnProdutoNovoOS';
    btn.className = 'btn btn-warning';
    btn.innerHTML = '<i class="fas fa-plus-circle"></i> Produto Novo + OS';
    btn.style.marginRight = 'auto';
    btn.title = 'Cadastrar como produto novo e criar automaticamente uma OS para Elaine';
    
    btn.onclick = function() {
        // Armazena que é um produto novo
        produtoNovoParaOS = {
            cardId: cardId,
            itemId: itemId,
            item: entradaEmProcessamento?.item || null
        };
        
        // Abre modal para descrição da OS
        abrirModalDescricaoOS();
    };
    
    // Insere antes dos botões existentes
    const existingButtons = container.querySelectorAll('.btn:not(#btnProdutoNovoOS)');
    if (existingButtons.length > 0) {
        container.insertBefore(btn, existingButtons[0]);
    } else {
        container.prepend(btn);
    }
}

// ===== MODAL PARA DESCRIÇÃO DA OS =====
function abrirModalDescricaoOS() {
    // Cria o modal se não existir
    let modal = document.getElementById('modalDescricaoOS');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modalDescricaoOS';
        modal.className = 'modal hidden';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 500px; max-height: 80vh; overflow-y: auto;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 2px solid #f1f3f5; padding-bottom: 15px;">
                    <h3 style="margin: 0; color: #00ADEE;">
                        <i class="fas fa-clipboard-list"></i> Descrição da OS
                    </h3>
                    <button onclick="fecharModalDescricaoOS()" style="background: none; border: none; font-size: 24px; cursor: pointer; color: #6c757d;">
                        &times;
                    </button>
                </div>
                <div style="margin-bottom: 15px;">
                    <p style="color: #6c757d; font-size: 14px;">
                        <i class="fas fa-info-circle"></i> 
                        Esta OS será criada para <strong>Elaine</strong> com os dados do produto.
                    </p>
                </div>
                <div class="form-group">
                    <label for="descricaoOSInput">
                        <i class="fas fa-comment"></i> Descrição / Observações da OS *
                    </label>
                    <textarea id="descricaoOSInput" class="form-control" rows="4" 
                              placeholder="Ex: Mínimo três fotos, seguir briefing do produto..." 
                              style="resize: vertical;"></textarea>
                    <small class="text-muted">Esta descrição será adicionada à OS criada para Elaine.</small>
                </div>
                <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px; border-top: 1px solid #f1f3f5; padding-top: 20px;">
                    <button class="btn btn-secondary" onclick="fecharModalDescricaoOS()">
                        <i class="fas fa-times"></i> Cancelar
                    </button>
                    <button class="btn btn-success" onclick="confirmarCriacaoOS()">
                        <i class="fas fa-check"></i> Criar OS
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    // Limpa o campo
    const textarea = document.getElementById('descricaoOSInput');
    if (textarea) textarea.value = '';

    // Mostra o modal
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
    modal.style.zIndex = '10000';
    
    // Foca no textarea
    setTimeout(() => {
        if (textarea) textarea.focus();
    }, 300);
}

// ===== FECHAR MODAL DESCRIÇÃO OS =====
window.fecharModalDescricaoOS = function() {
    const modal = document.getElementById('modalDescricaoOS');
    if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
    }
};

// ===== CONFIRMAR CRIAÇÃO DA OS =====
window.confirmarCriacaoOS = async function() {
    const descricao = document.getElementById('descricaoOSInput')?.value?.trim();
    if (!descricao) {
        showToast('⚠️ Por favor, preencha a descrição da OS.', 'warning');
        return;
    }

    if (!produtoNovoParaOS) {
        showToast('❌ Nenhum produto novo identificado.', 'error');
        return;
    }

    const { cardId, itemId, item } = produtoNovoParaOS;
    
    // Verifica se o produto foi salvo
    const produto = verificarSKUExistente(item?.sku_original);
    if (!produto) {
        showToast('⚠️ Produto não encontrado. Salve o produto primeiro.', 'warning');
        return;
    }

    // Fecha modal de descrição
    fecharModalDescricaoOS();

    // Cria a OS
    try {
        const osCriada = await criarOSCompleta({
            nomeProduto: produto.nome || item?.produto || 'Produto sem nome',
            sku: produto.sku || item?.sku_original || '',
            responsavel: 'Elaine',
            urgência: 'normal',
            tipoOS: 'normal',
            servico: 'estudio',
            observacoes: descricao,
            criadoPor: currentUser.name,
            linkAnuncio: '',
            valorAnuncio: 0,
            precisaFoto: 'sim',
            descricaoAnuncio: ''
        });

        if (osCriada) {
            showToast('✅ OS criada com sucesso para Elaine!', 'success');
            
            // Atualiza o item da entrada
            await atualizarItemEntrada(cardId, itemId, produto.id, produto.sku);
            
            // Limpa a variável
            produtoNovoParaOS = null;
            
            // Recarrega as entradas
            await carregarEntradas();
        } else {
            showToast('❌ Erro ao criar OS. Tente novamente.', 'error');
        }
    } catch (error) {
        console.error('❌ Erro ao criar OS:', error);
        showToast('❌ Erro ao criar OS: ' + error.message, 'error');
    }
};

// ===== FUNÇÃO PARA CRIAR OS COMPLETA (SOBRESCREVENDO A EXISTENTE) =====
const _criarOSCompletaOriginal = window.criarOSCompleta || async function(dados) {
    try {
        if (!window.supabaseClient) throw new Error('Supabase não conectado');

        const codigo = window.generateOSCode ? window.generateOSCode() : `OS-${Date.now().toString().slice(-6)}`;

        const prazoHoras = dados.urgência === 'alta' ? 2 : dados.urgência === 'normal' ? 48 : 36;

        let prazoEsperado = null;
        if (typeof window.calcularPrazoPorPrioridade === 'function') {
            prazoEsperado = window.calcularPrazoPorPrioridade(new Date(), dados.urgência);
        }

        const osData = {
            codigo: codigo,
            produto_nome: dados.nomeProduto,
            responsavel: dados.responsavel || 'Elaine',
            link_anuncio: dados.linkAnuncio || '',
            criado_por: dados.criadoPor || currentUser.name,
            urgencia: dados.urgência || 'normal',
            tipo_os: dados.tipoOS || 'normal',
            status: 'pendente',
            tipo_foto: dados.servico || 'estudio',
            observacoes: dados.observacoes || '',
            skus: dados.sku ? [dados.sku] : [],
            fotos: [],
            qtd_fotos: 0,
            qtd_edicoes: 0,
            conferido: false,
            user_notified: false,
            precisa_foto: 'nao',
            valor_anuncio: 0,
            descricao_anuncio: '',
            link_novo_anuncio: '',
            data_criacao: new Date().toISOString(),
            ultima_atualizacao: new Date().toISOString(),
            prazo_horas: prazoHoras,
            prazo_esperado: prazoEsperado,
            anuncio_criado: false
        };

        const { data, error } = await window.supabaseClient
            .from('ordens_service')
            .insert([osData])
            .select();

        if (error) throw error;

        console.log('✅ OS criada:', data);
        return data && data[0] ? data[0] : true;

    } catch (error) {
        console.error('❌ Erro ao criar OS:', error);
        return false;
    }
};

// Sobrescreve a função global
window.criarOSCompleta = window.criarOSCompleta || _criarOSCompletaOriginal;

// ===== FUNÇÃO PARA ATUALIZAR ITEM DA ENTRADA (JÁ EXISTE, MAS VAMOS GARANTIR) =====
const _atualizarItemEntradaOriginal = window.atualizarItemEntrada;

async function atualizarItemEntrada(cardId, itemId, produtoId, skuMatch) {
    try {
        if (!window.supabaseClient) throw new Error('Supabase não conectado');

        const { error: errUpdate } = await window.supabaseClient
            .from('entrada_items')
            .update({
                produto_id: produtoId,
                sku_match: skuMatch,
                status: 'cadastrado',
                acao: 'cadastro_com_os',
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

        return true;

    } catch (error) {
        console.error('❌ Erro ao atualizar item da entrada:', error);
        throw error;
    }
}

// Garante que a função global esteja disponível
window.atualizarItemEntrada = window.atualizarItemEntrada || atualizarItemEntrada;

// ===== SOBRESCREVER SALVAR PRODUTO PARA TRATAR PRODUTO NOVO =====
const _salvarProdutoEstoqueComOS = window.salvarProdutoEstoque;

window.salvarProdutoEstoque = async function() {
    // Chama o salvar original
    if (typeof _salvarProdutoEstoqueComOS === 'function') {
        await _salvarProdutoEstoqueComOS();
    }

    // Se tiver produto novo aguardando, cria a OS
    if (produtoNovoParaOS) {
        const { item } = produtoNovoParaOS;
        const produto = verificarSKUExistente(item?.sku_original);
        
        if (produto) {
            // Abre o modal de descrição automaticamente
            abrirModalDescricaoOS();
        }
    }
};

console.log('✅ Extensão de criação automática de OS para produtos novos carregada!');

// ============================================
// PRÉ-ENTRADA
// ============================================

function renderizarPreEntrada() {
    const tbody = document.getElementById('preEntradaTableBody');
    if (!tbody) return;

    const podeVerCusto = currentUser && (currentUser.username === 'andressamiotto' || currentUser.username === 'ronald');

    if (preEntradaItens.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${podeVerCusto ? 10 : 9}" class="text-center text-muted">Nenhum item carregado.</td></tr>`;
        return;
    }

    let html = '';
    preEntradaItens.forEach((item, idx) => {
        const skuDisplay = item.sku_match || item.sku_original || '-';
        const fornecedorDisplay = item.fornecedor_nome || item.cd_fornecedor || '-';
        const custoDisplay = podeVerCusto && item.valor_custo ? `R$ ${parseFloat(item.valor_custo).toFixed(2)}` : (podeVerCusto ? '-' : '');

        html += `
            <tr>
                <td>${idx + 1}</td>
                <td>${item.cd_fornecedor || '-'}</td>
                <td>${item.rastreio || '-'}</td>
                <td><strong>${item.quantidade || 0}</strong></td>
                <td>${item.produto || '-'}</td>
                <td><code>${skuDisplay}</code></td>
                <td>${fornecedorDisplay}</td>
                ${podeVerCusto ? `<td>${custoDisplay}</td>` : ''}
                <td>
                    <input type="text" class="form-control form-control-sm pre-observacao" 
                           data-idx="${idx}" value="${item.observacao || ''}" 
                           placeholder="Observações..." style="min-width:150px;">
                </td>
                <td>
                    <button class="btn btn-sm btn-danger" onclick="removerItemPreEntrada(${idx})" title="Remover item">
                        <i class="fas fa-times"></i>
                    </button>
                </td>
            </tr>
        `;
    });

    tbody.innerHTML = html;

    document.querySelectorAll('.pre-observacao').forEach(input => {
        input.addEventListener('input', function() {
            const idx = parseInt(this.dataset.idx);
            preEntradaItens[idx].observacao = this.value;
        });
    });
}

// ===== REMOVER ITEM DA PRÉ-ENTRADA =====
window.removerItemPreEntrada = function(idx) {
    if (!confirm(`Remover o item "${preEntradaItens[idx].produto}" da pré-entrada?`)) return;
    preEntradaItens.splice(idx, 1);
    renderizarPreEntrada();
    if (preEntradaItens.length === 0) {
        document.getElementById('preEntradaTableContainer').style.display = 'none';
        showToast('Todos os itens removidos. A pré-entrada está vazia.', 'info');
    }
};

// ===== LIMPAR PRÉ-ENTRADA =====
window.limparPreEntrada = function() {
    if (preEntradaItens.length > 0) {
        if (!confirm('Limpar todos os itens da pré-entrada? Os dados não salvos serão perdidos.')) return;
    }
    preEntradaItens = [];
    preEntradaDadosBrutos = '';
    document.getElementById('preEntradaTableContainer').style.display = 'none';
    document.getElementById('preXmlFileInput').value = '';
    renderizarPreEntrada();
    showToast('🧹 Pré-entrada limpa.', 'info');
};

// ============================================
// PROCESSAR PRÉ-ENTRADA - COM VERIFICAÇÃO DE DUPLICIDADE
// ============================================
window.processarPreEntrada = async function() {
    if (preEntradaItens.length === 0) {
        showToast('⚠️ Nenhum item na pré-entrada. Carregue um XML primeiro.', 'warning');
        return;
    }

    if (!confirm(`Confirmar a criação da entrada com ${preEntradaItens.length} item(s)?`)) {
        return;
    }

    // ==== VERIFICAÇÃO DE DUPLICIDADE PARA TODOS OS ITENS ====
    let duplicatasEncontradas = [];
    for (const item of preEntradaItens) {
        if (item.rastreio && item.sku_original) {
            const duplicado = await verificarDuplicidadeEntrada(item.rastreio, item.sku_original);
            if (duplicado && duplicado.duplicado) {
                duplicatasEncontradas.push({
                    rastreio: item.rastreio,
                    sku: item.sku_original,
                    entrada: duplicado.entrada,
                    produto: item.produto || 'Sem nome'
                });
            }
        }
    }

    if (duplicatasEncontradas.length > 0) {
        let mensagem = '⚠️ Foram encontradas entradas duplicadas na pré-entrada:\n\n';
        duplicatasEncontradas.forEach(d => {
            mensagem += `Produto "${d.produto}" (SKU: ${d.sku}) → Já existe na entrada ${d.entrada}\n`;
        });
        mensagem += '\n\n❌ Remova os itens duplicados e tente novamente.';
        alert(mensagem);
        showToast('❌ Entradas duplicadas detectadas na pré-entrada.', 'error');
        return;
    }

    try {
        if (!window.supabaseClient) throw new Error('Supabase não conectado');

        const numeroEntrada = await gerarNumeroEntrada();

        const cardData = {
            numero_entrada: numeroEntrada,
            dados_brutos: preEntradaDadosBrutos || 'Pré-entrada processada',
            status: 'pendente',
            criado_por: currentUser.name,
            criado_em: new Date().toISOString(),
            total_items: preEntradaItens.length,
            items_concluidos: 0,
            tipo_entrada: 'xml',
            fornecedor: preEntradaItens[0]?.fornecedor_nome || '',
            nf_numero: preEntradaItens[0]?.rastreio?.split('-')[1] || ''
        };

        const { data: cardResult, error: cardError } = await window.supabaseClient
            .from('entradas_cards')
            .insert([cardData])
            .select();

        if (cardError) throw cardError;
        const card = cardResult[0];

        const itemsToInsert = preEntradaItens.map(item => ({
            entrada_id: card.id,
            cd_fornecedor: item.cd_fornecedor || '',
            rastreio: item.rastreio || '',
            fornecedor_nome: item.fornecedor_nome || '',
            quantidade: item.quantidade,
            produto: item.produto || '',
            sku_original: item.sku_original || '',
            sku_match: item.sku_match || '',
            produto_id: item.produto_id || null,
            observacao: item.observacao || '',
            ncm: item.ncm || '',
            valor_unitario: item.valor_unitario || 0,
            cprod_fornecedor: item.cprod_fornecedor || '',
            tipo_entrada: 'xml',
            status: 'pendente',
            acao: null,
            responsavel: null,
            data_acao: null,
            quantidade_entrada: 0,
            valor_custo: item.valor_custo || 0
        }));

        const { error: itemsError } = await window.supabaseClient
            .from('entrada_items')
            .insert(itemsToInsert);

        if (itemsError) throw itemsError;

        showToast(`✅ Entrada ${numeroEntrada} criada com ${preEntradaItens.length} item(s) a partir da pré-entrada!`, 'success');

        limparPreEntrada();
        await carregarEntradas();

    } catch (error) {
        console.error('❌ Erro ao processar pré-entrada:', error);
        showToast('❌ Erro ao processar pré-entrada: ' + error.message, 'error');
    }
};

// ============================================
// PROCESSAR XML PARA PRÉ-ENTRADA - COM VERIFICAÇÃO DE DUPLICIDADE
// ============================================
window.processarPreEntradaXML = async function() {
    const fileInput = document.getElementById('preXmlFileInput');
    if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
        showToast('⚠️ Selecione um arquivo XML primeiro.', 'warning');
        return;
    }

    const file = fileInput.files[0];
    if (!file.name.toLowerCase().endsWith('.xml')) {
        showToast('⚠️ O arquivo deve ser um XML (.xml)', 'warning');
        return;
    }

    if (typeof produtosEstoque === 'undefined' || !Array.isArray(produtosEstoque) || produtosEstoque.length === 0) {
        showToast('🔄 Carregando estoque...', 'info');
        if (typeof carregarProdutosEstoque === 'function') {
            await carregarProdutosEstoque();
        } else {
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
    await aguardarEstoqueCarregado();

    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const xmlString = e.target.result;
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlString, "text/xml");

            const nfeNode = xmlDoc.querySelector('NFe') || xmlDoc.querySelector('nfeProc');
            if (!nfeNode) {
                showToast('❌ Arquivo XML não é uma NF-e válida.', 'error');
                return;
            }

            const emitNode = nfeNode.querySelector('emit');
            const fornecedorNome = emitNode ? emitNode.querySelector('xNome')?.textContent || '' : '';
            const fornecedorCNPJ = emitNode ? emitNode.querySelector('CNPJ')?.textContent || '' : '';

            const ideNode = nfeNode.querySelector('ide');
            const nNF = ideNode ? ideNode.querySelector('nNF')?.textContent || '' : '';
            const dhEmi = ideNode ? ideNode.querySelector('dhEmi')?.textContent || '' : '';
            const dataEmissao = dhEmi ? new Date(dhEmi).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];

            const detNodes = xmlDoc.querySelectorAll('det');
            if (detNodes.length === 0) {
                showToast('⚠️ Nenhum item encontrado na nota fiscal.', 'warning');
                return;
            }

            const itens = [];
            let duplicatasEncontradas = [];

            for (const det of detNodes) {
                const prod = det.querySelector('prod');
                if (!prod) continue;

                const cProd = prod.querySelector('cProd')?.textContent || '';
                const xProd = prod.querySelector('xProd')?.textContent || '';
                const NCM = prod.querySelector('NCM')?.textContent || '';
                const qCom = parseFloat(prod.querySelector('qCom')?.textContent || '0');
                const vUnCom = parseFloat(prod.querySelector('vUnCom')?.textContent || '0');
                const uCom = prod.querySelector('uCom')?.textContent || '';

                const ipi = extrairIPI(det);
                const valorCustoUnitario = vUnCom + (ipi / (qCom || 1));

                const rastreio = `NF-${nNF}-${cProd}`;

                // ==== VERIFICAÇÃO DE DUPLICIDADE ====
                if (rastreio && cProd) {
                    const duplicado = await verificarDuplicidadeEntrada(rastreio, cProd);
                    if (duplicado && duplicado.duplicado) {
                        duplicatasEncontradas.push({
                            rastreio: rastreio,
                            sku: cProd,
                            entrada: duplicado.entrada,
                            produto: xProd || 'Sem nome'
                        });
                        continue; // Pula este item
                    }
                }

                const fornecedor = buscarFornecedor(cProd);
                let skuSistema = fornecedor ? fornecedor.sku_sistema : null;
                let nomeFornecedor = fornecedor ? fornecedor.nome_fornecedor : fornecedorNome || '';
                let cdFornecedor = fornecedor ? fornecedor.cd_fornecedor : cProd;

                let produtoEstoque = null;
                if (skuSistema) {
                    produtoEstoque = verificarSKUExistente(skuSistema);
                }
                if (!produtoEstoque && cProd) {
                    produtoEstoque = verificarSKUExistente(cProd);
                }

                itens.push({
                    cd_fornecedor: cdFornecedor || '',
                    fornecedor_nome: nomeFornecedor || '',
                    rastreio: rastreio,
                    quantidade: qCom || 0,
                    produto: xProd || '',
                    sku_original: cProd || '',
                    sku_match: skuSistema || (produtoEstoque ? produtoEstoque.sku : null),
                    produto_id: produtoEstoque ? produtoEstoque.id : null,
                    observacao: '',
                    ncm: NCM || '',
                    valor_unitario: vUnCom || 0,
                    cprod_fornecedor: cProd || '',
                    tipo_entrada: 'xml',
                    status: 'pendente',
                    quantidade_entrada: 0,
                    acao: null,
                    responsavel: null,
                    data_acao: null,
                    valor_custo: valorCustoUnitario
                });
            }

            // Se houver duplicatas, mostra aviso
            if (duplicatasEncontradas.length > 0) {
                let mensagem = '⚠️ Foram encontradas entradas duplicadas no XML:\n\n';
                duplicatasEncontradas.forEach(d => {
                    mensagem += `Produto "${d.produto}" (SKU: ${d.sku}) → Já existe na entrada ${d.entrada}\n`;
                });
                mensagem += '\n\n❌ Remova os itens duplicados e tente novamente.';
                alert(mensagem);
                showToast('❌ Entradas duplicadas detectadas no XML.', 'error');
                return;
            }

            if (itens.length === 0) {
                showToast('⚠️ Nenhum item válido extraído da nota.', 'warning');
                return;
            }

            preEntradaItens = itens;
            preEntradaDadosBrutos = xmlString.substring(0, 500) + '...';

            renderizarPreEntrada();

            document.getElementById('preEntradaTableContainer').style.display = 'block';
            document.getElementById('preXmlFileInput').value = '';
            showToast(`✅ ${preEntradaItens.length} itens carregados. Edite as observações e processe.`, 'success');

        } catch (error) {
            console.error('❌ Erro ao processar XML para pré-entrada:', error);
            showToast('❌ Erro ao processar XML: ' + error.message, 'error');
        }
    };
    reader.readAsText(file);
};

// ============================================
// EXTENSÃO: CRIAÇÃO AUTOMÁTICA DE OS PARA PRODUTOS NOVOS
// ============================================

// ===== VARIÁVEL PARA ARMAZENAR DADOS DO PRODUTO NOVO =====
let produtoNovoParaOS = null;

// ===== SOBRESCREVER ABRIR CADASTRO RÁPIDO COM BOTÃO PRODUTO NOVO =====
const _abrirCadastroRapidoOriginal = window.abrirCadastroRapido;

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

    // Verificar se a função existe
    if (typeof abrirModalProdutoEstoque !== 'function') {
        showToast('❌ Função de cadastro não disponível. Recarregue a página.', 'error');
        console.error('❌ abrirModalProdutoEstoque não é uma função');
        return;
    }

    // Abrir o modal para novo produto
    abrirModalProdutoEstoque(null);
    
    // Preencher os campos com os dados do item
    setTimeout(() => {
        const nomeInput = document.getElementById('produtoNome');
        const skuInput = document.getElementById('produtoSKU');
        const categoriaSelect = document.getElementById('produtoCategoria');
        
        if (nomeInput) nomeInput.value = item.produto || '';
        if (skuInput) skuInput.value = item.sku_original || '';
        
        if (categoriaSelect && item.categoria) {
            categoriaSelect.value = item.categoria;
            gerarCamposDinamicos(item.categoria);
        }
        
        // Forçar a exibição do modal novamente (por segurança)
        const modal = document.getElementById('modalProdutoEstoque');
        if (modal) {
            modal.classList.remove('hidden');
            modal.style.display = 'flex';
            modal.style.alignItems = 'center';
            modal.style.justifyContent = 'center';
            modal.style.zIndex = '9999';
        }
        
        // ==== ADICIONAR BOTÃO "PRODUTO NOVO" NO MODAL ====
        adicionarBotaoProdutoNovo(cardId, itemId);
        
        // Configurar o botão de salvar
        configurarBotaoSalvarModal(cardId, itemId);
    }, 300);

    showToast('📝 Preencha os dados do produto e clique em Salvar', 'info');
};
// ============================================
// EXPORTAR FUNÇÕES PARA USO GLOBAL
// ============================================
window.abrirSistemaEntradas = window.abrirSistemaEntradas;
window.carregarEntradas = carregarEntradas;
window.processarEntrada = window.processarEntrada;
window.processarXML = window.processarXML;
window.darEntradaItem = window.darEntradaItem;
window.vincularProdutoExistente = window.vincularProdutoExistente;
window.abrirCadastroRapido = window.abrirCadastroRapido;
window.abrirCadastroNovoComOS = window.abrirCadastroNovoComOS;
window.finalizarEntrada = window.finalizarEntrada;
window.cancelarEntrada = window.cancelarEntrada;
window.filtrarEntradas = window.filtrarEntradas;
window.buscarEntradas = window.buscarEntradas;
window.limparAreaEntrada = window.limparAreaEntrada;
window.exportarEntradasExcel = window.exportarEntradasExcel;
window.exportarEntradasResumido = window.exportarEntradasResumido;
window.exportarEntradasPorStatus = window.exportarEntradasPorStatus;
window.toggleExportMenu = window.toggleExportMenu;

console.log('📦 Sistema de Entradas carregado com sucesso!');