// ============================================
// SISTEMA DE ENTRADAS - VERSÃO MELHORADA
// ============================================

let entradasCards = [];
let filtroEntradasAtual = 'todos';
let entradaEmProcessamento = null;
let fornecedoresMap = {};
let preEntradaItens = [];
let preEntradaDadosBrutos = '';

// ============================================
// LISTA DE USUÁRIOS AUTORIZADOS A VER FORNECEDORES
// ============================================
const USUARIOS_AUTORIZADOS_FORNECEDORES = ['andressamiotto', 'ronald'];

// ============================================
// REGRAS DE PERMISSÃO DA ABA DE ENTRADAS
// Bruna e Arthur podem trabalhar somente com XML
// ============================================

const USUARIOS_SOMENTE_XML_ENTRADAS = ['bruna', 'arthur'];

function normalizarUsuarioEntradas(valor) {
    return (valor || '')
        .toString()
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

function usuarioSomenteXMLEntradas() {
    if (!currentUser) return false;

    const username = normalizarUsuarioEntradas(currentUser.username);

    const primeiroNome = normalizarUsuarioEntradas(
        currentUser.name
    ).split(/\s+/)[0];

    return (
        USUARIOS_SOMENTE_XML_ENTRADAS.includes(username) ||
        USUARIOS_SOMENTE_XML_ENTRADAS.includes(primeiroNome)
    );
}


// ============================================
// VERIFICA SE UMA ENTRADA VEIO DE XML
// ============================================

function entradaEhXML(card) {
    return (card?.tipo_entrada || '').toLowerCase() === 'xml';
}


// ============================================
// OCULTA ENTRADA MANUAL PARA BRUNA E ARTHUR
// ============================================

function aplicarPermissoesEntradaUsuario() {

    // Localiza o textarea da entrada manual
    const pasteArea = document.getElementById('entradaPasteArea');

    // Sobe até o card "Nova Entrada"
    const cardEntradaManual = pasteArea
        ? pasteArea.closest('.card')
        : null;

    if (!cardEntradaManual) return;

    if (usuarioSomenteXMLEntradas()) {

        // Bruna e Arthur não enxergam a entrada manual
        cardEntradaManual.style.display = 'none';

    } else {

        // Ronald / Admin continuam vendo normalmente
        cardEntradaManual.style.display = '';
    }
}


// ============================================
// ESTILO DE ENTRADA URGENTE
// PRODUTO COM ESTOQUE ZERO
// ============================================

function injetarEstilosEntradasUrgentes() {

    // Evita adicionar o CSS mais de uma vez
    if (document.getElementById('estilosEntradasUrgentes')) {
        return;
    }

    const style = document.createElement('style');

    style.id = 'estilosEntradasUrgentes';

    style.textContent = `

        @keyframes entradaUrgentePiscarVermelho {

            0%, 100% {
                background-color: #ffe3e3;
                color: #721c24;
            }

            50% {
                background-color: #dc3545;
                color: #ffffff;
            }
        }


        /* Linha inteira do produto urgente */
        tr.entrada-urgente-estoque-zero > td {
            animation: entradaUrgentePiscarVermelho 1s ease-in-out infinite;
            border-color: rgba(220, 53, 69, 0.45) !important;
        }


        tr.entrada-urgente-estoque-zero code,
        tr.entrada-urgente-estoque-zero small,
        tr.entrada-urgente-estoque-zero strong {
            color: inherit !important;
        }


        /* Aviso URGENTE */
        .badge-entrada-urgente {
            display: inline-block;
            background: #dc3545;
            color: white;
            border-radius: 4px;
            padding: 4px 7px;
            margin-bottom: 4px;
            font-size: 11px;
            font-weight: 700;
        }

    `;

    document.head.appendChild(style);
}

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

    if (menuSystem) {
        menuSystem.classList.add('hidden');
    }

    const sistemasIds = [
        'mainSystem',
        'salesSystem',
        'reembolsosSystem',
        'caixaSystem',
        'promocoesSystem',
        'reviewsSystem',
        'folgasSystem',
        'shippingSystem',
        'estoqueSystem',
        'feedbackSystem',
        'perguntasSystem',
        'estoqueGestaoSystem',
        'nfeSystem',
        'precificacaoSystem',
        'fullSystem'
    ];

    sistemasIds.forEach(id => {

        const el = document.getElementById(id);

        if (el) {
            el.classList.add('hidden');
        }

    });

    const entradasSystem = document.getElementById('entradasSystem');

    if (entradasSystem) {
        entradasSystem.classList.remove('hidden');
    }


    // ========================================
    // DADOS DO USUÁRIO
    // ========================================

    document.getElementById('entradasUserName').textContent =
        currentUser.name;

    document.getElementById('entradasUserAvatar').textContent =
        currentUser.avatar;

    document.getElementById('entradasUserRole').textContent =
        currentUser.role;


    // ========================================
    // NOVAS REGRAS
    // ========================================

    // Adiciona CSS do alerta urgente
    injetarEstilosEntradasUrgentes();

    // Bruna e Arthur não podem usar entrada manual
    aplicarPermissoesEntradaUsuario();


    // ========================================
    // CARREGAMENTOS NORMAIS
    // ========================================

    carregarFornecedores();

    carregarEntradas();

    showToast(
        '📦 Sistema de Entradas carregado',
        'info'
    );
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

// ============================================
// FUNÇÃO PARA VERIFICAR SE USUÁRIO PODE VER FORNECEDORES
// ============================================
function podeVerFornecedores() {
    if (!currentUser) return false;
    const username = currentUser.username?.toLowerCase() || '';
    return USUARIOS_AUTORIZADOS_FORNECEDORES.includes(username) || currentUser.role === 'admin';
}

// ============================================
// FUNÇÕES AUXILIARES DE DATA/HORA (FUSO BRASÍLIA)
// ============================================

function getDataHoraLocal() {
    const agora = new Date();
    // Ajusta para o fuso horário de Brasília (UTC-3)
    const offsetBrasilia = -3;
    const offsetUTC = agora.getTimezoneOffset() / 60;
    const diferenca = offsetBrasilia - offsetUTC;
    const dataLocal = new Date(agora.getTime() + (diferenca * 60 * 60 * 1000));
    return dataLocal;
}

function getDataHoraLocalISO() {
    const dataLocal = getDataHoraLocal();
    return dataLocal.toISOString();
}

// ============================================
// FUNÇÃO AUXILIAR PARA FORMATAR DATA/HORA LOCAL
// ============================================
function formatarDataHoraLocal(dataISO) {
    if (!dataISO) return '';
    try {
        const data = new Date(dataISO);
        if (isNaN(data.getTime())) return dataISO;
        return data.toLocaleString('pt-BR', {
            timeZone: 'America/Sao_Paulo',
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    } catch {
        return dataISO;
    }
}

// ============================================
// FUNÇÃO PARA SINCRONIZAR ESTOQUE POR MLB CODE
// ============================================
async function sincronizarEstoqueMLPorMlb(mlbCode, quantidade) {
    try {
        if (!mlbCode) return false;
        
        // Verifica se o token ML está disponível
        if (!window.mlAccessToken) {
            console.warn('⚠️ Token ML não disponível');
            return false;
        }

        const url = `https://api.mercadolibre.com/items/${mlbCode}?access_token=${window.mlAccessToken}`;
        
        // Busca o item atual para verificar se precisa atualizar
        const responseGet = await fetch(url);
        if (!responseGet.ok) {
            console.warn(`⚠️ Erro ao buscar item ${mlbCode}: ${responseGet.status}`);
            return false;
        }
        
        const itemData = await responseGet.json();
        
        // Verifica se a quantidade é diferente
        if (itemData.available_quantity === quantidade) {
            console.log(`ℹ️ Quantidade já está atualizada para ${mlbCode}: ${quantidade}`);
            return true;
        }
        
        // Atualiza o estoque
        const updateData = {
            available_quantity: quantidade
        };
        
        const responsePut = await fetch(url, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(updateData)
        });
        
        if (!responsePut.ok) {
            const errorText = await responsePut.text();
            console.warn(`⚠️ Erro ao atualizar ${mlbCode}: ${responsePut.status} - ${errorText}`);
            return false;
        }
        
        console.log(`✅ Estoque atualizado para ${mlbCode}: ${quantidade}`);
        return true;
        
    } catch (error) {
        console.error(`❌ Erro ao sincronizar MLB ${mlbCode}:`, error);
        return false;
    }
}

// ============================================
// FUNÇÃO PARA ATUALIZAR ESTOQUE NO ML (FALLBACK)
// ============================================
window.atualizarEstoqueML = async function(produto) {
    try {
        if (!produto) return false;
        
        const mlbCodes = produto.mlb_codes || produto.dados_extra?.mlb_codes || [];
        if (!mlbCodes || mlbCodes.length === 0) {
            console.log(`ℹ️ Produto ${produto.sku} não possui MLB codes`);
            return false;
        }
        
        let sucesso = 0;
        for (const mlbCode of mlbCodes) {
            const resultado = await sincronizarEstoqueMLPorMlb(mlbCode, produto.quantidade || 0);
            if (resultado) sucesso++;
        }
        
        return sucesso > 0;
        
    } catch (error) {
        console.error('❌ Erro em atualizarEstoqueML:', error);
        return false;
    }
};

// ============================================
// VERIFICAR SKU NO ESTOQUE
// COMPARA OS 8 PRIMEIROS CARACTERES
// ============================================

function verificarSKUExistente(sku) {

    if (!sku) {
        return null;
    }


    // ========================================
    // NORMALIZA SKU INFORMADO
    // ========================================

    const skuNormalizado =
        String(sku)
            .trim()
            .toLowerCase();


    // ========================================
    // PEGA EXATAMENTE OS 8 PRIMEIROS
    // ========================================

    const prefixoBusca =
        skuNormalizado.substring(
            0,
            8
        );


    // Se tiver menos de 8 caracteres,
    // não tenta localizar por prefixo.
    if (
        prefixoBusca.length < 8
    ) {

        console.warn(
            `⚠️ SKU "${skuNormalizado}" possui menos de 8 caracteres.`
        );

        return null;
    }


    // ========================================
    // ESTOQUE PRECISA ESTAR CARREGADO
    // ========================================

    if (
        typeof produtosEstoque ===
            'undefined' ||

        !Array.isArray(
            produtosEstoque
        ) ||

        produtosEstoque.length === 0
    ) {

        console.warn(
            '⚠️ produtosEstoque ainda não carregado. SKU não verificado:',
            skuNormalizado
        );

        return null;
    }


    console.log(
        `🔎 Buscando pelos 8 primeiros caracteres: "${prefixoBusca}"`
    );


    // ========================================
    // PROCURA NO ESTOQUE
    // ========================================

    const encontrados =
        produtosEstoque.filter(
            produto => {

                const skuProduto =
                    String(
                        produto.sku ||
                        ''
                    )
                        .trim()
                        .toLowerCase();


                if (
                    skuProduto.length < 8
                ) {

                    return false;
                }


                const prefixoProduto =
                    skuProduto.substring(
                        0,
                        8
                    );


                return (
                    prefixoProduto ===
                    prefixoBusca
                );

            }
        );


    // ========================================
    // ENCONTROU UM ÚNICO PRODUTO
    // ========================================

    if (
        encontrados.length === 1
    ) {

        const encontrado =
            encontrados[0];


        console.log(
            '✅ SKU encontrado pelos 8 primeiros caracteres:',
            {
                skuEntrada:
                    skuNormalizado,

                prefixo:
                    prefixoBusca,

                skuEncontrado:
                    encontrado.sku,

                produto:
                    encontrado.nome
            }
        );


        return encontrado;
    }


    // ========================================
    // ENCONTROU MAIS DE UM
    // ========================================

    if (
        encontrados.length > 1
    ) {

        console.warn(
            `⚠️ Mais de um SKU encontrado com os mesmos 8 primeiros caracteres "${prefixoBusca}":`,
            encontrados.map(
                produto => ({
                    id:
                        produto.id,

                    sku:
                        produto.sku,

                    nome:
                        produto.nome
                })
            )
        );


        // Por enquanto usa o primeiro encontrado
        return encontrados[0];
    }


    // ========================================
    // TENTA MAPEAMENTO DO FORNECEDOR
    // ========================================

    const fornecedor =
        buscarFornecedor(
            skuNormalizado
        );


    if (
        fornecedor &&
        fornecedor.sku_sistema
    ) {

        const skuSistema =
            String(
                fornecedor.sku_sistema
            )
                .trim()
                .toLowerCase();


        const prefixoSistema =
            skuSistema.substring(
                0,
                8
            );


        if (
            prefixoSistema.length === 8
        ) {

            const encontradosFornecedor =
                produtosEstoque.filter(
                    produto => {

                        const skuProduto =
                            String(
                                produto.sku ||
                                ''
                            )
                                .trim()
                                .toLowerCase();


                        if (
                            skuProduto.length < 8
                        ) {

                            return false;
                        }


                        return (
                            skuProduto.substring(
                                0,
                                8
                            ) ===
                            prefixoSistema
                        );

                    }
                );


            if (
                encontradosFornecedor.length > 0
            ) {

                const encontrado =
                    encontradosFornecedor[0];


                console.log(
                    '✅ SKU encontrado via fornecedor pelos 8 primeiros caracteres:',
                    {
                        skuEntrada:
                            skuNormalizado,

                        skuSistema:
                            fornecedor.sku_sistema,

                        prefixo:
                            prefixoSistema,

                        skuEncontrado:
                            encontrado.sku,

                        produto:
                            encontrado.nome
                    }
                );


                return encontrado;
            }
        }
    }


    // ========================================
    // NÃO ENCONTRADO
    // ========================================

    console.log(
        `❌ Nenhum SKU encontrado com os 8 primeiros caracteres "${prefixoBusca}".`
    );


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
// CARREGAR ENTRADAS (COM ORDENAÇÃO: PENDENTES PRIMEIRO)
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

        // ==== ORDENAÇÃO: PENDENTES PRIMEIRO ====
        entradasCards.sort((a, b) => {
            if (a.status === 'pendente' && b.status === 'finalizado') return -1;
            if (a.status === 'finalizado' && b.status === 'pendente') return 1;
            return new Date(b.criado_em) - new Date(a.criado_em);
        });

        renderizarEntradas();

    } catch (error) {
        console.error('❌ Erro ao carregar entradas:', error);
        showToast('Erro ao carregar entradas: ' + error.message, 'error');
    }
}

// ============================================
// FUNÇÃO PARA ADICIONAR/EDITAR OBSERVAÇÃO (RONALD)
// ============================================

// ===== VARIÁVEL GLOBAL PARA ARMAZENAR O ITEM EM EDIÇÃO =====
let itemObservacaoEmEdicao = null;

// ===== FUNÇÃO PARA ABRIR MODAL DE EDIÇÃO DE OBSERVAÇÃO =====
window.abrirModalObservacao = function(cardId, itemId) {
    if (!currentUser || currentUser.username !== 'ronald') {
        showToast('⚠️ Apenas o usuário Ronald pode editar observações.', 'warning');
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

    itemObservacaoEmEdicao = {
        cardId: cardId,
        itemId: itemId,
        card: card,
        item: item
    };

    // Cria ou atualiza o modal
    let modal = document.getElementById('modalEditarObservacao');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modalEditarObservacao';
        modal.className = 'modal hidden';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 600px; max-height: 80vh; overflow-y: auto;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 2px solid #f1f3f5; padding-bottom: 15px;">
                    <h3 style="margin: 0; color: #00ADEE;">
                        <i class="fas fa-edit"></i> Editar Observação
                    </h3>
                    <button onclick="fecharModalObservacao()" style="background: none; border: none; font-size: 24px; cursor: pointer; color: #6c757d;">
                        &times;
                    </button>
                </div>
                
                <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
                    <p style="margin: 0 0 5px 0;"><strong>Entrada:</strong> <span id="obsNumeroEntrada">-</span></p>
                    <p style="margin: 0 0 5px 0;"><strong>Produto:</strong> <span id="obsProdutoNome">-</span></p>
                    <p style="margin: 0 0 5px 0;"><strong>SKU:</strong> <span id="obsSkuDisplay">-</span></p>
                    <p style="margin: 0 0 5px 0;"><strong>Status:</strong> <span id="obsStatusDisplay">-</span></p>
                    <p style="margin: 0;"><strong>Observação atual:</strong> <span id="obsAtualDisplay" style="font-style: italic;">-</span></p>
                </div>
                
                <div class="form-group">
                    <label for="obsTextoInput">
                        <i class="fas fa-comment"></i> Nova Observação
                    </label>
                    <textarea id="obsTextoInput" class="form-control" rows="4" 
                              placeholder="Digite a observação para este item..." 
                              style="resize: vertical;"></textarea>
                    <small class="text-muted">Esta observação ficará registrada no item da entrada.</small>
                </div>
                
                <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px; border-top: 1px solid #f1f3f5; padding-top: 20px;">
                    <button class="btn btn-secondary" onclick="fecharModalObservacao()">
                        <i class="fas fa-times"></i> Cancelar
                    </button>
                    <button class="btn btn-success" onclick="salvarObservacaoModal()">
                        <i class="fas fa-save"></i> Salvar Observação
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    // Preenche os dados
    document.getElementById('obsNumeroEntrada').textContent = card.numero_entrada || '-';
    document.getElementById('obsProdutoNome').textContent = item.produto || '-';
    document.getElementById('obsSkuDisplay').textContent = item.sku_match || item.sku_original || '-';
    document.getElementById('obsStatusDisplay').textContent = item.status || 'pendente';
    document.getElementById('obsAtualDisplay').textContent = item.observacao || '(vazio)';
    document.getElementById('obsTextoInput').value = item.observacao || '';

    // Mostra o modal
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
    modal.style.zIndex = '10000';
    
    // Foca no textarea
    setTimeout(() => {
        const textarea = document.getElementById('obsTextoInput');
        if (textarea) {
            textarea.focus();
            textarea.select();
        }
    }, 300);
};

// ===== FECHAR MODAL DE OBSERVAÇÃO =====
window.fecharModalObservacao = function() {
    const modal = document.getElementById('modalEditarObservacao');
    if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
    }
    itemObservacaoEmEdicao = null;
};

// ===== SALVAR OBSERVAÇÃO DO MODAL =====
window.salvarObservacaoModal = async function() {
    if (!itemObservacaoEmEdicao) {
        showToast('❌ Nenhum item selecionado para edição.', 'error');
        return;
    }

    const texto = document.getElementById('obsTextoInput')?.value?.trim();
    if (!texto) {
        if (!confirm('A observação está vazia. Deseja salvar mesmo assim?')) {
            return;
        }
    }

    const { cardId, itemId, card, item } = itemObservacaoEmEdicao;

    try {
        if (!window.supabaseClient) throw new Error('Supabase não conectado');
        
        // Adiciona um prefixo com a data e usuário se já tiver observação
        let novaObservacao = texto || '';
        if (item.observacao && item.observacao.trim() !== '' && novaObservacao !== item.observacao) {
            // Se já tinha observação, adiciona um histórico
            const dataHora = new Date().toLocaleString('pt-BR', {
                timeZone: 'America/Sao_Paulo',
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
            novaObservacao = `${item.observacao}\n\n--- EDITADO POR ${currentUser.name} em ${dataHora} ---\n${novaObservacao}`;
        } else if (!item.observacao || item.observacao.trim() === '') {
            // Se não tinha observação, adiciona com data
            const dataHora = new Date().toLocaleString('pt-BR', {
                timeZone: 'America/Sao_Paulo',
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
            novaObservacao = `[${dataHora} - ${currentUser.name}]\n${novaObservacao}`;
        }

        const { error } = await window.supabaseClient
            .from('entrada_items')
            .update({ 
                observacao: novaObservacao,
                // Atualiza também a data de modificação (se tiver campo)
                // data_modificacao: getDataHoraLocalISO()
            })
            .eq('id', itemId);
        
        if (error) throw error;
        
        // Atualiza o item localmente
        const cardLocal = entradasCards.find(c => c.id == cardId);
        if (cardLocal) {
            const itemLocal = cardLocal.itens.find(i => i.id == itemId);
            if (itemLocal) {
                itemLocal.observacao = novaObservacao;
            }
        }
        
        showToast('✅ Observação atualizada com sucesso!', 'success');
        
        // Fecha o modal
        fecharModalObservacao();
        
        // Recarrega a lista para atualizar a exibição
        await carregarEntradas();
        
    } catch (error) {
        console.error('❌ Erro ao salvar observação:', error);
        showToast('❌ Erro ao salvar observação: ' + error.message, 'error');
    }
};

// ===== FUNÇÃO PARA ADICIONAR BOTÃO DE OBSERVAÇÃO NAS LINHAS =====
// Esta função será chamada dentro do renderizarEntradas
function adicionarBotaoObservacao(item, card) {
    // Apenas para o usuário Ronald
    if (!currentUser || currentUser.username !== 'ronald') return '';
    
    // Mostra o botão para todos os itens (pendentes ou concluídos)
    return `
        <button class="btn btn-sm btn-outline-primary" 
                onclick="abrirModalObservacao('${card.id}', ${item.id})" 
                title="Editar observação do item">
            <i class="fas fa-edit"></i>
        </button>
    `;
}

async function renderizarEntradas() {
    // Garante que o estoque esteja carregado
    if (
        typeof produtosEstoque === 'undefined' ||
        !Array.isArray(produtosEstoque) ||
        produtosEstoque.length === 0
    ) {
        console.log('🔄 Forçando recarregamento do estoque antes de renderizar...');

        if (typeof carregarProdutosEstoque === 'function') {
            await carregarProdutosEstoque();
        } else {
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }

    // CSS do alerta de estoque zero
    if (!document.getElementById('estilosEntradasUrgentes')) {
        const style = document.createElement('style');
        style.id = 'estilosEntradasUrgentes';

        style.textContent = `
            @keyframes entradaUrgentePiscarVermelho {
                0%, 100% {
                    background-color: #ffe3e3;
                }

                50% {
                    background-color: #dc3545;
                    color: #ffffff;
                }
            }

            tr.entrada-urgente-estoque-zero > td {
                animation: entradaUrgentePiscarVermelho 1s ease-in-out infinite;
                border-color: rgba(220, 53, 69, 0.45) !important;
            }

            tr.entrada-urgente-estoque-zero code,
            tr.entrada-urgente-estoque-zero small,
            tr.entrada-urgente-estoque-zero strong {
                color: inherit !important;
            }

            .badge-entrada-urgente {
                display: inline-block;
                background: #dc3545;
                color: #ffffff !important;
                border-radius: 5px;
                padding: 4px 8px;
                margin-bottom: 4px;
                font-size: 11px;
                font-weight: 700;
                white-space: nowrap;
                box-shadow: 0 2px 5px rgba(220, 53, 69, 0.35);
            }
        `;

        document.head.appendChild(style);
    }

    const container =
        document.getElementById('entradasCardsContainer');

    if (!container) {
        return;
    }

    // =====================================================
    // BRUNA E ARTHUR:
    // podem trabalhar em entradas já existentes.
    // A restrição é somente para CRIAR entrada manual.
    // =====================================================

    const somenteXML =
        typeof usuarioSomenteXMLEntradas === 'function'
            ? usuarioSomenteXMLEntradas()
            : false;

    // Oculta somente o formulário usado para CRIAR entrada manual
    const entradaPasteArea =
        document.getElementById('entradaPasteArea');

    if (entradaPasteArea) {
        const cardEntradaManual =
            entradaPasteArea.closest('.card');

        if (cardEntradaManual) {
            cardEntradaManual.style.display =
                somenteXML
                    ? 'none'
                    : '';
        }
    }

    // =====================================================
    // FILTRO
    // =====================================================

    let cardsFiltrados =
        [...entradasCards];

    if (filtroEntradasAtual === 'pendente') {
        cardsFiltrados =
            cardsFiltrados.filter(
                c => c.status === 'pendente'
            );

    } else if (
        filtroEntradasAtual === 'finalizado'
    ) {
        cardsFiltrados =
            cardsFiltrados.filter(
                c => c.status === 'finalizado'
            );
    }

    // =====================================================
    // BUSCA
    // =====================================================

    const busca =
        document
            .getElementById('buscaEntradas')
            ?.value
            ?.trim()
            .toLowerCase() || '';

    if (busca) {
        cardsFiltrados =
            cardsFiltrados.filter(card => {

                if (
                    (card.numero_entrada || '')
                        .toLowerCase()
                        .includes(busca)
                ) {
                    return true;
                }

                return (card.itens || []).some(item =>

                    (item.rastreio || '')
                        .toLowerCase()
                        .includes(busca) ||

                    (item.produto || '')
                        .toLowerCase()
                        .includes(busca) ||

                    (item.sku_original || '')
                        .toLowerCase()
                        .includes(busca) ||

                    (item.sku_match || '')
                        .toLowerCase()
                        .includes(busca) ||

                    (item.fornecedor_nome || '')
                        .toLowerCase()
                        .includes(busca) ||

                    (item.cd_fornecedor || '')
                        .toLowerCase()
                        .includes(busca)
                );
            });
    }

    // =====================================================
    // NENHUMA ENTRADA
    // =====================================================

    if (cardsFiltrados.length === 0) {
        container.innerHTML = `

            <div class="text-center py-5 text-muted">

                <i
                    class="fas fa-box-open fa-3x mb-3"
                    style="opacity:0.3;"
                ></i>

                <h4>
                    Nenhuma entrada encontrada
                </h4>

                <p>
                    ${
                        filtroEntradasAtual === 'pendente'
                            ? 'Todas as entradas foram finalizadas!'
                            :
                        filtroEntradasAtual === 'finalizado'
                            ? 'Nenhuma entrada finalizada ainda.'
                            :
                        somenteXML
                            ? 'Envie um XML para começar uma nova entrada.'
                            : 'Cole os dados acima ou envie um XML e clique em "Processar Entrada" para começar.'
                    }
                </p>

            </div>
        `;

        return;
    }

    // =====================================================
    // PERMISSÕES
    // =====================================================

    const podeVerCusto = !!(
        currentUser &&
        (
            currentUser.username === 'andressamiotto' ||
            currentUser.username === 'ronald'
        )
    );

    const podeEditarObservacoes = !!(
        currentUser &&
        currentUser.username === 'ronald'
    );

    const isAdmin = !!(
        currentUser &&
        (
            currentUser.role === 'admin' ||
            currentUser.username === 'andressamiotto' ||
            currentUser.username === 'ronald'
        )
    );

    const verFornecedor =
        podeVerFornecedores();

    let html = '';

    // =====================================================
    // CARDS
    // =====================================================

    cardsFiltrados.forEach(card => {

        const itens =
            Array.isArray(card.itens)
                ? card.itens
                : [];

        const total =
            itens.filter(
                i => i.status !== 'ignorado'
            ).length;

        const concluidos =
            itens.filter(i =>
                i.status === 'entrada_realizada' ||
                i.status === 'cadastrado' ||
                i.status === 'ignorado'
            ).length;

        const progresso =
            total > 0
                ? Math.round(
                    (concluidos / total) * 100
                )
                : 0;

        const isFinalizado =
            card.status === 'finalizado';

        const criadoEm =
            formatarDataHora(
                card.criado_em
            );

        const cardEhXML =
            (
                card.tipo_entrada ||
                ''
            )
                .toString()
                .toLowerCase() === 'xml';

        const isExcel =
            card.tipo_entrada === 'excel' ||
            !card.tipo_entrada;

        const origemBadge =
            cardEhXML
                ? `
                    <span class="badge badge-info ml-2">
                        📄 XML
                    </span>
                `
                : `
                    <span class="badge badge-secondary ml-2">
                        📋 Manual
                    </span>
                `;

        // =================================================
        // CABEÇALHO DO CARD
        // =================================================

        html += `

            <div
                class="card mb-4 entrada-card"
                data-id="${card.id}"
                style="${
                    !isFinalizado
                        ? 'border-left: 4px solid #ffc107;'
                        : ''
                }"
            >

                <div
                    class="card-header"
                    style="flex-wrap:wrap; gap:10px;"
                >

                    <div>

                        <h3
                            class="card-title"
                            style="margin:0;"
                        >

                            <i class="fas fa-receipt"></i>

                            ${card.numero_entrada}

                            ${origemBadge}

                            <span
                                class="badge ${
                                    isFinalizado
                                        ? 'badge-success'
                                        : 'badge-warning'
                                } ml-2"
                            >

                                ${
                                    isFinalizado
                                        ? '✅ Finalizado'
                                        : '⏳ Pendente'
                                }

                            </span>

                            ${
                                isExcel &&
                                !verFornecedor
                                    ? `
                                        <span
                                            class="badge badge-secondary ml-2"
                                        >
                                            🔒 Fornecedor oculto
                                        </span>
                                    `
                                    : ''
                            }

                        </h3>

                        <small class="text-muted">

                            Criado por:
                            ${card.criado_por || 'Sistema'}
                            em
                            ${criadoEm}

                            ${
                                isFinalizado &&
                                card.finalizado_por
                                    ? `
                                        • Finalizado por:
                                        ${card.finalizado_por}
                                    `
                                    : ''
                            }

                            ${
                                card.fornecedor
                                    ? `
                                        • Fornecedor:
                                        ${card.fornecedor}
                                    `
                                    : ''
                            }

                            ${
                                card.nf_numero
                                    ? `
                                        • NF:
                                        ${card.nf_numero}
                                    `
                                    : ''
                            }

                        </small>

                    </div>

                    <div
                        class="d-flex gap-2 align-items-center"
                    >

                        <div
                            style="min-width:120px;"
                        >

                            <div
                                class="progress"
                                style="
                                    height:8px;
                                    border-radius:4px;
                                    background:#e9ecef;
                                "
                            >

                                <div
                                    class="
                                        progress-bar
                                        ${
                                            progresso === 100
                                                ? 'bg-success'
                                                : 'bg-primary'
                                        }
                                    "
                                    style="
                                        width:${progresso}%;
                                        border-radius:4px;
                                        transition:width 0.3s;
                                    "
                                ></div>

                            </div>

                            <small
                                class="text-muted"
                            >
                                ${concluidos}/${total}
                                itens
                                (${progresso}%)
                            </small>

                        </div>

                        ${
                            !isFinalizado
                                ? `
                                    <button
                                        class="btn btn-sm btn-danger"
                                        onclick="cancelarEntrada('${card.id}')"
                                        title="Cancelar entrada (excluir)"
                                    >
                                        <i class="fas fa-times"></i>
                                    </button>
                                `
                                : ''
                        }

                        ${
                            isFinalizado &&
                            isAdmin
                                ? `
                                    <button
                                        class="btn btn-sm btn-danger"
                                        onclick="excluirEntradaFinalizada('${card.id}')"
                                        title="Excluir entrada finalizada (Admin)"
                                    >
                                        <i class="fas fa-trash-alt"></i>
                                    </button>
                                `
                                : ''
                        }

                    </div>

                </div>

                <div
                    class="table-responsive"
                >

                    <table
                        class="table table-sm table-hover"
                        style="margin-bottom:0;"
                    >

                        <thead>

                            <tr>

                                <th
                                    style="width:40px;"
                                >
                                    #
                                </th>

                                <th>
                                    Cd. Fornecedor
                                </th>

                                <th>
                                    Referência de entrada
                                </th>

                                <th
                                    style="width:80px;"
                                >
                                    Quant
                                </th>

                                <th>
                                    Produto
                                </th>

                                <th>
                                    SKU
                                </th>

                                ${
                                    verFornecedor
                                        ? `
                                            <th>
                                                Fornecedor
                                            </th>
                                        `
                                        : ''
                                }

                                <th
                                    style="width:70px;"
                                >
                                    Qtd Entrada
                                </th>

                                ${
                                    podeVerCusto
                                        ? `
                                            <th
                                                style="width:90px;"
                                            >
                                                Custo Unit.
                                            </th>
                                        `
                                        : ''
                                }

                                <th
                                    style="min-width:180px;"
                                >
                                    Obs.
                                </th>

                                <th
                                    style="width:70px;"
                                >
                                    Status
                                </th>

                                <th
                                    style="width:300px;"
                                >
                                    Ação
                                </th>

                            </tr>

                        </thead>

                        <tbody>
        `;

        // =================================================
        // ITENS
        // =================================================

        itens.forEach(
            (item, idx) => {

                const isConcluido =
                    item.status !== 'pendente';

                const isIgnorado =
                    item.status === 'ignorado';

                // =========================================
                // STATUS
                // =========================================

                let itemStatus = '';
                let statusClass = '';

                if (isIgnorado) {

                    itemStatus =
                        '⏭️ Ignorado';

                    statusClass =
                        'badge-secondary';

                } else if (
                    item.status ===
                    'entrada_realizada'
                ) {

                    itemStatus =
                        '✅ Entrada';

                    statusClass =
                        'badge-success';

                } else if (
                    item.status ===
                    'cadastrado'
                ) {

                    itemStatus =
                        '📝 Cadastrado';

                    statusClass =
                        'badge-info';

                } else {

                    itemStatus =
                        '⏳ Pendente';

                    statusClass =
                        'badge-warning';
                }

                // =========================================
                // PRODUTO DO ESTOQUE
                // =========================================

                const skuParaVerificar =
                    item.sku_match ||
                    item.sku_original;

                const produtoExistente =
                    verificarSKUExistente(
                        skuParaVerificar
                    );

                const tituloProduto =
                    produtoExistente?.nome ||
                    '';

                let quantidadeAtualProduto =
                    null;

                if (produtoExistente) {

                    const quantidadeConvertida =
                        Number(
                            produtoExistente.quantidade
                        );

                    if (
                        Number.isFinite(
                            quantidadeConvertida
                        )
                    ) {
                        quantidadeAtualProduto =
                            quantidadeConvertida;
                    }
                }

                const entradaUrgente =
                    !!produtoExistente &&
                    !isConcluido &&
                    quantidadeAtualProduto !== null &&
                    quantidadeAtualProduto <= 0;

                // =========================================
                // OBSERVAÇÃO
                // =========================================

                const obsValue =
                    item.observacao ||
                    '';

                const obsId =
                    `obs-${card.id}-${item.id}`;

                // =========================================
                // AÇÕES
                //
                // IMPORTANTE:
                // NÃO EXISTE MAIS BLOQUEIO POR SER MANUAL.
                // =========================================

                let acaoHtml = '';

                // ITEM JÁ CONCLUÍDO
                if (
                    isConcluido &&
                    !isIgnorado
                ) {

                    acaoHtml = `

                        <span
                            class="badge ${statusClass}"
                        >
                            ${itemStatus}
                        </span>

                        <small
                            class="text-muted d-block"
                        >
                            ${item.responsavel || ''}
                        </small>

                        ${
                            podeEditarObservacoes
                                ? `
                                    <button
                                        class="btn btn-sm btn-outline-primary mt-1"
                                        onclick="abrirModalObservacao('${card.id}', ${item.id})"
                                        title="Editar observação"
                                    >
                                        <i class="fas fa-edit"></i>
                                        Obs
                                    </button>
                                `
                                : ''
                        }

                    `;

                // ITEM IGNORADO
                } else if (
                    isIgnorado
                ) {

                    acaoHtml = `

                        <span
                            class="badge ${statusClass}"
                        >
                            ${itemStatus}
                        </span>

                        <small
                            class="text-muted d-block"
                        >
                            ${item.responsavel || ''}
                        </small>

                        ${
                            podeEditarObservacoes
                                ? `
                                    <button
                                        class="btn btn-sm btn-outline-primary mt-1"
                                        onclick="abrirModalObservacao('${card.id}', ${item.id})"
                                        title="Editar observação"
                                    >
                                        <i class="fas fa-edit"></i>
                                        Obs
                                    </button>
                                `
                                : ''
                        }

                    `;

                // PRODUTO JÁ EXISTE NO ESTOQUE
                } else if (
                    produtoExistente
                ) {

                    acaoHtml = `

                        ${
                            entradaUrgente
                                ? `
                                    <span
                                        class="badge-entrada-urgente"
                                    >
                                        🚨 URGENTE — ESTOQUE ${quantidadeAtualProduto}
                                    </span>

                                    <br>
                                `
                                : ''
                        }

                        <button
                            class="btn btn-sm btn-success"
                            onclick="darEntradaItem(
                                '${card.id}',
                                ${item.id},
                                '${produtoExistente.id}'
                            )"
                            title="Adicionar ao estoque"
                        >
                            <i
                                class="fas fa-arrow-right-to-bracket"
                            ></i>

                            Dar Entrada
                        </button>

                        ${
                            tituloProduto
                                ? `
                                    <small
                                        class="d-block text-success"
                                    >
                                        🔍 ${tituloProduto}
                                    </small>
                                `
                                : ''
                        }

                        <small
                            class="
                                d-block
                                ${
                                    entradaUrgente
                                        ? ''
                                        : 'text-muted'
                                }
                            "
                            style="
                                margin-top:2px;
                                font-size:11px;
                            "
                        >

                            Estoque atual:

                            <strong>
                                ${
                                    quantidadeAtualProduto !== null
                                        ? quantidadeAtualProduto
                                        : '-'
                                }
                            </strong>

                        </small>

                        <button
                            class="btn btn-sm btn-secondary"
                            onclick="ignorarItem(
                                '${card.id}',
                                ${item.id}
                            )"
                            title="Ignorar este item"
                        >
                            <i class="fas fa-ban"></i>
                            Ignorar
                        </button>

                        ${
                            podeEditarObservacoes
                                ? `
                                    <button
                                        class="btn btn-sm btn-outline-primary mt-1"
                                        onclick="abrirModalObservacao(
                                            '${card.id}',
                                            ${item.id}
                                        )"
                                        title="Editar observação"
                                    >
                                        <i class="fas fa-edit"></i>
                                    </button>
                                `
                                : ''
                        }

                    `;

                // PRODUTO NÃO ENCONTRADO
                } else {

                    acaoHtml = `

                        <div
                            class="d-flex flex-wrap gap-1"
                        >

                            <button
                                class="btn btn-sm btn-primary"
                                onclick="abrirCadastroRapido(
                                    '${card.id}',
                                    ${item.id}
                                )"
                                title="Cadastrar novo produto"
                            >
                                <i
                                    class="fas fa-plus-circle"
                                ></i>

                                Cadastrar
                            </button>

                            <button
                                class="btn btn-sm btn-info"
                                onclick="vincularProdutoExistente(
                                    '${card.id}',
                                    ${item.id}
                                )"
                                title="Vincular a um produto já existente"
                            >
                                <i
                                    class="fas fa-link"
                                ></i>

                                Já existe
                            </button>

                            <button
                                class="btn btn-sm btn-secondary"
                                onclick="ignorarItem(
                                    '${card.id}',
                                    ${item.id}
                                )"
                                title="Ignorar este item"
                            >
                                <i
                                    class="fas fa-ban"
                                ></i>

                                Ignorar
                            </button>

                            ${
                                podeEditarObservacoes
                                    ? `
                                        <button
                                            class="btn btn-sm btn-outline-primary"
                                            onclick="abrirModalObservacao(
                                                '${card.id}',
                                                ${item.id}
                                            )"
                                            title="Editar observação"
                                        >
                                            <i
                                                class="fas fa-edit"
                                            ></i>
                                        </button>
                                    `
                                    : ''
                            }

                        </div>

                        <small
                            class="d-block text-muted"
                        >
                            ⛔ Produto não encontrado
                        </small>

                    `;
                }

                // =========================================
                // SKU
                // =========================================

                const skuDisplay =
                    item.sku_match ||
                    item.sku_original ||
                    '-';

                // =========================================
                // FORNECEDOR
                // =========================================

                let fornecedorDisplay =
                    item.fornecedor_nome ||
                    item.cd_fornecedor ||
                    '-';

                if (
                    isExcel &&
                    !verFornecedor
                ) {
                    fornecedorDisplay =
                        '🔒 Oculto';
                }

                // =========================================
                // QTD ENTRADA
                // =========================================

                const qtdEntrada =
                    item.quantidade_entrada &&
                    item.quantidade_entrada > 0
                        ? item.quantidade_entrada
                        : '-';

                // =========================================
                // CUSTO
                // =========================================

                const custoDisplay =
                    podeVerCusto &&
                    item.valor_custo
                        ? `R$ ${parseFloat(
                            item.valor_custo
                        ).toFixed(2)}`
                        :
                    podeVerCusto
                        ? '-'
                        : '';

                // =========================================
                // OBSERVAÇÃO
                // =========================================

                let obsDisplay =
                    obsValue ||
                    '-';

                if (
                    podeEditarObservacoes
                ) {

                    obsDisplay = `

                        <div
                            class="d-flex align-items-center gap-1"
                        >

                            <span
                                id="${obsId}-text"
                                style="
                                    font-size:12px;
                                    max-width:150px;
                                    overflow:hidden;
                                    text-overflow:ellipsis;
                                    white-space:nowrap;
                                "
                                title="${obsValue || '-'}"
                            >
                                ${obsValue || '-'}
                            </span>

                            <button
                                class="btn btn-sm btn-outline-primary"
                                onclick="abrirModalObservacao(
                                    '${card.id}',
                                    ${item.id}
                                )"
                                style="
                                    padding:2px 6px;
                                    font-size:10px;
                                "
                                title="Editar observação"
                            >
                                <i
                                    class="fas fa-pen"
                                ></i>
                            </button>

                        </div>

                    `;
                }

                // =========================================
                // CLASSE DA LINHA
                // =========================================

                const classeLinha =
                    [
                        (
                            isConcluido ||
                            isIgnorado
                        )
                            ? 'table-light'
                            : '',

                        entradaUrgente
                            ? 'entrada-urgente-estoque-zero'
                            : ''
                    ]
                        .filter(Boolean)
                        .join(' ');

                // =========================================
                // LINHA
                // =========================================

                html += `

                    <tr
                        class="${classeLinha}"
                    >

                        <td>
                            ${idx + 1}
                        </td>

                        <td>
                            ${item.cd_fornecedor || '-'}
                        </td>

                        <td>
                            ${item.rastreio || '-'}
                        </td>

                        <td>
                            <strong>
                                ${item.quantidade || 0}
                            </strong>
                        </td>

                        <td>

                            ${
                                entradaUrgente
                                    ? `
                                        <span
                                            class="badge-entrada-urgente"
                                        >
                                            🚨 URGENTE — ESTOQUE 0
                                        </span>

                                        <br>
                                    `
                                    : ''
                            }

                            ${item.produto || '-'}

                        </td>

                        <td>
                            <code>
                                ${skuDisplay}
                            </code>
                        </td>

                        ${
                            verFornecedor
                                ? `
                                    <td>
                                        ${fornecedorDisplay}
                                    </td>
                                `
                                : ''
                        }

                        <td>
                            ${qtdEntrada}
                        </td>

                        ${
                            podeVerCusto
                                ? `
                                    <td>
                                        ${custoDisplay}
                                    </td>
                                `
                                : ''
                        }

                        <td>
                            ${obsDisplay}
                        </td>

                        <td>

                            <span
                                class="badge ${statusClass}"
                            >
                                ${itemStatus}
                            </span>

                        </td>

                        <td>
                            ${acaoHtml}
                        </td>

                    </tr>

                `;
            }
        );

        // =================================================
        // RODAPÉ
        // =================================================

        html += `

                        </tbody>

                    </table>

                </div>

                ${
                    !isFinalizado
                        ? `

                            <div
                                class="
                                    card-footer
                                    bg-transparent
                                    d-flex
                                    justify-content-end
                                    gap-2
                                "
                            >

                                ${
                                    concluidos === total &&
                                    total > 0
                                        ? `
                                            <button
                                                class="btn btn-sm btn-success"
                                                onclick="finalizarEntrada('${card.id}')"
                                            >
                                                <i
                                                    class="fas fa-check-double"
                                                ></i>

                                                Finalizar Entrada
                                            </button>
                                        `
                                        : ''
                                }

                            </div>

                        `
                        : ''
                }

                ${
                    isFinalizado &&
                    isAdmin
                        ? `

                            <div
                                class="
                                    card-footer
                                    bg-transparent
                                    d-flex
                                    justify-content-end
                                    gap-2
                                "
                            >

                                <button
                                    class="btn btn-sm btn-danger"
                                    onclick="excluirEntradaFinalizada('${card.id}')"
                                >
                                    <i
                                        class="fas fa-trash-alt"
                                    ></i>

                                    Excluir Entrada (Admin)
                                </button>

                            </div>

                        `
                        : ''
                }

            </div>

        `;
    });

    container.innerHTML =
        html;
}

// ============================================
// EXCLUIR ENTRADA FINALIZADA (APENAS ADMIN)
// ============================================
window.excluirEntradaFinalizada = async function(cardId) {
    // Verifica se é admin
    const isAdmin = currentUser && (currentUser.role === 'admin' || currentUser.username === 'andressamiotto' || currentUser.username === 'ronald');
    
    if (!isAdmin) {
        showToast('⚠️ Apenas administradores podem excluir entradas finalizadas.', 'warning');
        return;
    }

    const card = entradasCards.find(c => c.id == cardId);
    if (!card) {
        showToast('Card não encontrado', 'error');
        return;
    }

    if (card.status !== 'finalizado') {
        showToast('⚠️ Esta entrada não está finalizada. Use o botão "Cancelar" para excluí-la.', 'warning');
        return;
    }

    // Verifica se há itens com entrada realizada que precisam ser revertidos
    const itensComEntrada = card.itens.filter(i => i.status === 'entrada_realizada' && i.produto_id);
    
    let mensagem = `⚠️ ATENÇÃO: Você está prestes a EXCLUIR a entrada "${card.numero_entrada}".\n\n`;
    mensagem += `Esta entrada foi finalizada por ${card.finalizado_por || 'desconhecido'} em ${card.finalizado_em ? new Date(card.finalizado_em).toLocaleString('pt-BR') : 'data desconhecida'}.\n\n`;
    
    if (itensComEntrada.length > 0) {
        mensagem += `📦 ${itensComEntrada.length} item(ns) tiveram entrada no estoque e serão REVERTIDOS (estoque será diminuído).\n\n`;
        itensComEntrada.forEach(item => {
            mensagem += `  - ${item.produto || 'Sem nome'} (${item.sku_match || item.sku_original}): ${item.quantidade_entrada || item.quantidade || 0} unidade(s)\n`;
        });
        mensagem += `\n`;
    }
    
    mensagem += `❗ Esta ação é IRREVERSÍVEL e só pode ser feita por administradores.\n\n`;
    mensagem += `Deseja continuar?`;

    if (!confirm(mensagem)) {
        return;
    }

    // Segunda confirmação com digitação
    const confirmacao = prompt(`Digite "EXCLUIR" para confirmar a exclusão da entrada "${card.numero_entrada}":`);
    if (confirmacao !== 'EXCLUIR') {
        showToast('❌ Exclusão cancelada. Digite "EXCLUIR" para confirmar.', 'warning');
        return;
    }

    try {
        if (!window.supabaseClient) throw new Error('Supabase não conectado');

        showToast('🔄 Revertendo estoque e excluindo entrada...', 'info');

        // ===== 1. REVERTER ESTOQUE PARA CADA ITEM COM ENTRADA REALIZADA =====
        for (const item of itensComEntrada) {
            if (item.produto_id && item.quantidade_entrada > 0) {
                try {
                    // Busca o produto atual
                    const { data: produto, error: errProd } = await window.supabaseClient
                        .from('produtos_estoque')
                        .select('quantidade, dados_extra, historico_custos')
                        .eq('id', item.produto_id)
                        .single();

                    if (errProd) {
                        console.error(`❌ Erro ao buscar produto ${item.produto_id}:`, errProd);
                        continue;
                    }

                    // Subtrai a quantidade que foi adicionada
                    const novaQuantidade = Math.max(0, (produto.quantidade || 0) - item.quantidade_entrada);

                    // Remove a entrada do histórico de custos
                    let historicoCustos = produto.historico_custos || [];
                    historicoCustos = historicoCustos.filter(h => 
                        !(h.entrada === card.numero_entrada && h.quantidade === item.quantidade_entrada)
                    );

                    // Atualiza dados_extra
                    let dadosExtra = produto.dados_extra || {};
                    
                    // Recalcula custo médio
                    const custosValidos = historicoCustos.filter(h => h.valor > 0);
                    const custoMedio = custosValidos.length > 0 
                        ? custosValidos.reduce((sum, h) => sum + h.valor, 0) / custosValidos.length 
                        : 0;
                    
                    dadosExtra.custo_medio = custoMedio;
                    dadosExtra.historico_custos = historicoCustos;

                    const { error: errUpdate } = await window.supabaseClient
                        .from('produtos_estoque')
                        .update({
                            quantidade: novaQuantidade,
                            dados_extra: dadosExtra,
                            historico_custos: historicoCustos,
                            custo_medio: custoMedio
                        })
                        .eq('id', item.produto_id);

                    if (errUpdate) {
                        console.error(`❌ Erro ao atualizar estoque do produto ${item.produto_id}:`, errUpdate);
                    } else {
                        console.log(`✅ Estoque revertido: ${item.produto} (${item.sku_match || item.sku_original}) - ${novaQuantidade} unidades`);
                    }

                    // Registra a movimentação de reversão
                    await registrarMovimentacao(
                        item.produto_id,
                        'saida',
                        item.quantidade_entrada,
                        `REV-${card.numero_entrada}`,
                        'reversao'
                    );

                } catch (err) {
                    console.error(`❌ Erro ao reverter item ${item.id}:`, err);
                }
            }
        }

        // ===== 2. EXCLUIR OS ITENS DA ENTRADA =====
        const { error: errItems } = await window.supabaseClient
            .from('entrada_items')
            .delete()
            .eq('entrada_id', cardId);

        if (errItems) throw errItems;

        // ===== 3. EXCLUIR O CARD =====
        const { error: errCard } = await window.supabaseClient
            .from('entradas_cards')
            .delete()
            .eq('id', cardId);

        if (errCard) throw errCard;

        showToast(`✅ Entrada "${card.numero_entrada}" excluída com sucesso! Estoque revertido.`, 'success');
        
        // Recarrega a lista
        await carregarEntradas();

    } catch (error) {
        console.error('❌ Erro ao excluir entrada finalizada:', error);
        showToast('❌ Erro ao excluir: ' + error.message, 'error');
    }
};

// ============================================
// FUNÇÃO PARA ADICIONAR OBSERVAÇÃO INLINE (RONALD)
// ============================================
window.editarObservacaoInline = function(cardId, itemId, obsId) {
    const textSpan = document.getElementById(`${obsId}-text`);
    if (!textSpan) return;
    
    const valorAtual = textSpan.textContent === '-' ? '' : textSpan.textContent;
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'form-control form-control-sm';
    input.value = valorAtual;
    input.style.width = '200px';
    input.placeholder = 'Digite a observação...';
    
    const container = textSpan.parentElement;
    container.replaceChild(input, textSpan);
    input.focus();
    input.select();
    
    const salvar = () => {
        const novoValor = input.value.trim();
        salvarObservacaoItem(cardId, itemId, novoValor, container, obsId);
    };
    
    input.addEventListener('blur', salvar);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            input.blur();
        }
        if (e.key === 'Escape') {
            const span = document.createElement('span');
            span.id = `${obsId}-text`;
            span.textContent = valorAtual || '-';
            container.replaceChild(span, input);
        }
    });
};

// ============================================
// FUNÇÃO PARA SALVAR OBSERVAÇÃO DO ITEM
// ============================================
async function salvarObservacaoItem(cardId, itemId, novaObservacao, container, obsId) {
    try {
        if (!window.supabaseClient) throw new Error('Supabase não conectado');
        
        const { error } = await window.supabaseClient
            .from('entrada_items')
            .update({ observacao: novaObservacao })
            .eq('id', itemId);
        
        if (error) throw error;
        
        // Atualiza a exibição
        const span = document.createElement('span');
        span.id = `${obsId}-text`;
        span.textContent = novaObservacao || '-';
        if (container) {
            container.replaceChild(span, container.querySelector('input') || container.firstChild);
        }
        
        // Atualiza o item localmente
        const card = entradasCards.find(c => c.id == cardId);
        if (card) {
            const item = card.itens.find(i => i.id == itemId);
            if (item) item.observacao = novaObservacao;
        }
        
        showToast('✅ Observação atualizada com sucesso!', 'success');
    } catch (error) {
        console.error('❌ Erro ao salvar observação:', error);
        showToast('❌ Erro ao salvar observação: ' + error.message, 'error');
    }
}

// ============================================
// FUNÇÃO PARA VINCULAR PRODUTO EXISTENTE (CORRIGIDA - COM BOTÃO DE ENTRADA)
// ============================================
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

    if (!confirm(`Deseja vincular o item "${item.produto}" ao produto existente:\nSKU: ${produtoExistente.sku}\nNome: ${produtoExistente.nome}\nID: ${produtoExistente.id}?\n\nApós vincular, você poderá dar entrada no estoque.`)) {
        return;
    }

    try {
        if (!window.supabaseClient) throw new Error('Supabase não conectado');

        // ===== SALVA O MAPEAMENTO PRIMEIRO =====
        const cdFornecedor = item.cd_fornecedor || '';
        const skuFornecedor = item.sku_original || '';
        const fornecedorNome = item.fornecedor_nome || '';

        // Verifica se já existe mapeamento
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
            showToast(`✅ Mapeamento criado: SKU do fornecedor "${skuFornecedor}" → SKU do sistema "${produtoExistente.sku}"`, 'success');
        } else {
            // Atualiza o mapeamento existente
            const { error: errUpdateFornecedor } = await window.supabaseClient
                .from('fornecedores')
                .update({
                    sku_sistema: produtoExistente.sku,
                    descricao_produto: produtoExistente.nome,
                    nome_fornecedor: fornecedorNome || ''
                })
                .eq('id', existing.id);
            if (errUpdateFornecedor) throw errUpdateFornecedor;
            showToast(`✅ Mapeamento atualizado: ${skuFornecedor} → ${produtoExistente.sku}`, 'success');
        }

        // ===== ATUALIZA O ITEM DA ENTRADA =====
        // Mantém status como 'pendente' para permitir dar entrada
        // Preenche produto_id e sku_match para o sistema reconhecer
        const { error: errItem } = await window.supabaseClient
            .from('entrada_items')
            .update({
                produto_id: produtoExistente.id,
                sku_match: produtoExistente.sku,
                status: 'pendente',  // <- MANTÉM PENDENTE para permitir dar entrada
                acao: 'cadastro',    // <- valor válido
                responsavel: currentUser.name,
                data_acao: new Date().toISOString()
            })
            .eq('id', itemId);

        if (errItem) throw errItem;

        // Não atualiza o card para finalizado, pois o item ainda está pendente
        // O card permanece pendente até que todos os itens sejam processados

        // Recarrega os dados
        await carregarFornecedores();
        await carregarEntradas();

        showToast(`✅ Item vinculado ao produto "${produtoExistente.nome}"!\nAgora clique em "Dar Entrada" para adicionar ao estoque.`, 'success');

    } catch (error) {
        console.error('❌ Erro ao vincular produto:', error);
        showToast('❌ Erro ao vincular: ' + error.message, 'error');
    }
};

// ============================================
// FUNÇÃO PARA EDITAR OBSERVAÇÃO (MODAL)
// ============================================
window.editarObservacaoItem = function(cardId, itemId) {
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

    const novaObs = prompt('Editar observação do item:', item.observacao || '');
    if (novaObs === null) return; // Cancelou

    salvarObservacaoItem(cardId, itemId, novaObs, null, `obs-${cardId}-${itemId}`);
};

// ============================================
// FUNÇÃO PARA VERIFICAR DUPLICIDADE DE ENTRADA
// ============================================
async function verificarDuplicidadeEntrada(referencia, sku) {
    if (!referencia || !sku) return false;
    
    try {
        const { data, error } = await window.supabaseClient
            .from('entrada_items')
            .select('entrada_id, rastreio, sku_original, sku_match')
            .eq('rastreio', referencia.trim());
        
        if (error) {
            console.error('Erro ao verificar duplicidade:', error);
            return false;
        }
        
        if (!data || data.length === 0) return false;
        
        const skuNormalizado = sku.trim().toLowerCase();
        const duplicado = data.some(item => {
            const skuOriginal = (item.sku_original || '').trim().toLowerCase();
            const skuMatch = (item.sku_match || '').trim().toLowerCase();
            return skuOriginal === skuNormalizado || skuMatch === skuNormalizado;
        });
        
        if (duplicado) {
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
// PROCESSAR XML - COM HORÁRIO CORRETO
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

                if (rastreio && cProd) {
                    const duplicado = await verificarDuplicidadeEntrada(rastreio, cProd);
                    if (duplicado && duplicado.duplicado) {
                        duplicatasEncontradas.push({
                            rastreio: rastreio,
                            sku: cProd,
                            entrada: duplicado.entrada,
                            produto: xProd || 'Sem nome'
                        });
                        continue;
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
                criado_em: getDataHoraLocalISO(),  // <- USANDO HORÁRIO LOCAL
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

// ============================================
// PROCESSAR ENTRADA MANUAL
//
// NOVO LAYOUT DA PLANILHA:
//
// A = IGNORAR
// B = RASTREIO
// C = CÓD. FORNECEDOR (OPCIONAL)
// D = IGNORAR
// E = IGNORAR
// F = FORNECEDOR
// G = IGNORAR
// H = IGNORAR
// I = QUANTIDADE
// J = DESCRIÇÃO
// K = SKU
// L = VALOR TOTAL
//
// IMPORTANTE:
// - Só afeta NOVAS entradas coladas.
// - Não altera entradas já existentes.
// - Valor total é convertido em custo unitário.
// ============================================

window.processarEntrada =
    async function() {

        // ========================================
        // BRUNA E ARTHUR NÃO CRIAM ENTRADA MANUAL
        // ========================================

        if (
            usuarioSomenteXMLEntradas()
        ) {

            showToast(
                '🔒 Seu usuário pode criar entradas somente por XML.',
                'warning'
            );

            return;
        }


        // ========================================
        // CARREGA ESTOQUE
        // ========================================

        if (
            typeof produtosEstoque ===
                'undefined' ||

            !Array.isArray(
                produtosEstoque
            ) ||

            produtosEstoque.length ===
                0
        ) {

            showToast(
                '🔄 Carregando estoque...',
                'info'
            );


            if (
                typeof carregarProdutosEstoque ===
                'function'
            ) {

                await carregarProdutosEstoque();

            } else {

                await new Promise(
                    resolve =>
                        setTimeout(
                            resolve,
                            2000
                        )
                );
            }
        }


        console.log(
            '✅ Estoque carregado:',
            produtosEstoque?.length || 0,
            'produtos'
        );


        await aguardarEstoqueCarregado();


        // ========================================
        // ÁREA DE COLAGEM
        // ========================================

        const pasteArea =
            document.getElementById(
                'entradaPasteArea'
            );


        if (!pasteArea) {

            showToast(
                '❌ Área de entrada não encontrada.',
                'error'
            );

            return;
        }


        const texto =
            pasteArea.value.trim();


        if (!texto) {

            showToast(
                '⚠️ Cole os dados antes de processar.',
                'warning'
            );

            return;
        }


        // ========================================
        // LINHAS
        // ========================================

        let linhas =
            texto
                .split(/\r?\n/)
                .filter(
                    linha =>
                        linha.trim() !==
                        ''
                );


        if (
            linhas.length ===
            0
        ) {

            showToast(
                '⚠️ Nenhuma linha encontrada.',
                'warning'
            );

            return;
        }


        // ========================================
        // SEPARADOR
        //
        // Excel copiado normalmente usa TAB.
        // ========================================

        let separador =
            '\t';


        const primeiraLinha =
            linhas[0];


        if (
            primeiraLinha.includes(
                '\t'
            )
        ) {

            separador =
                '\t';

        } else if (
            primeiraLinha.includes(
                ';'
            )
        ) {

            separador =
                ';';

        } else {

            // Não usamos vírgula como preferência porque
            // o valor monetário pode ser 342,10.
            //
            // Se não houver TAB ou ;, tenta vírgula.
            separador =
                ',';
        }


        // ========================================
        // NORMALIZADOR DE CABEÇALHO
        // ========================================

        const normalizarCabecalho =
            valor =>

                String(
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


        // ========================================
        // IDENTIFICA CABEÇALHO NOVO
        //
        // Não usamos as colunas "Ignora",
        // porque aparecem várias vezes.
        // ========================================

        const cabecalho =
            primeiraLinha
                .split(
                    separador
                )
                .map(
                    normalizarCabecalho
                );


        const isCabecalhoNovo =
            (
                cabecalho.length >=
                    11
            ) &&
            (
                cabecalho[1]
                    ?.includes(
                        'rastreio'
                    )
            ) &&
            (
                (
                    cabecalho[8]
                        ?.includes(
                            'quantidade'
                        )
                ) ||
                (
                    cabecalho[8]
                        ?.includes(
                            'quant'
                        )
                )
            ) &&
            (
                (
                    cabecalho[9]
                        ?.includes(
                            'descricao'
                        )
                ) ||
                (
                    cabecalho[9]
                        ?.includes(
                            'produto'
                        )
                )
            ) &&
            (
                cabecalho[10]
                    ?.includes(
                        'sku'
                    )
            );


        let dadosLinhas =
            linhas;


        if (
            isCabecalhoNovo
        ) {

            dadosLinhas =
                linhas.slice(
                    1
                );


            if (
                dadosLinhas.length ===
                0
            ) {

                showToast(
                    '⚠️ A planilha possui apenas o cabeçalho.',
                    'warning'
                );

                return;
            }
        }


        // ========================================
        // CONVERSOR DE NÚMERO BRASILEIRO
        //
        // Aceita:
        // 342,1
        // 342,10
        // 1.234,56
        // R$ 1.234,56
        // 342.10
        // ========================================

        const converterValorNumero =
            valor => {

                if (
                    valor === null ||
                    valor === undefined
                ) {

                    return 0;
                }


                let textoValor =
                    String(
                        valor
                    )
                        .trim()
                        .replace(
                            /R\$/gi,
                            ''
                        )
                        .replace(
                            /\s/g,
                            ''
                        );


                if (
                    !textoValor
                ) {

                    return 0;
                }


                // Tem ponto e vírgula:
                // padrão BR 1.234,56
                if (
                    textoValor.includes(
                        '.'
                    ) &&
                    textoValor.includes(
                        ','
                    )
                ) {

                    textoValor =
                        textoValor
                            .replace(
                                /\./g,
                                ''
                            )
                            .replace(
                                ',',
                                '.'
                            );


                // Somente vírgula:
                // 342,10
                } else if (
                    textoValor.includes(
                        ','
                    )
                ) {

                    textoValor =
                        textoValor.replace(
                            ',',
                            '.'
                        );
                }


                const numero =
                    parseFloat(
                        textoValor
                    );


                return Number.isFinite(
                    numero
                )
                    ? numero
                    : 0;
            };


        // ========================================
        // RESULTADO DO PARSING
        // ========================================

        const itensRaw =
            [];


        const erros =
            [];


        const duplicatasEncontradas =
            [];


        // ========================================
        // PERCORRE LINHAS
        // ========================================

        for (
            let idx = 0;
            idx < dadosLinhas.length;
            idx++
        ) {

            const linha =
                dadosLinhas[idx];


            const partes =
                linha
                    .split(
                        separador
                    )
                    .map(
                        campo =>
                            campo.trim()
                    );


            // ====================================
            // NOVO ARQUIVO PRECISA TER ATÉ COLUNA L
            // ====================================

            if (
                partes.length <
                11
            ) {

                erros.push(
                    `Linha ${idx + 1}: poucas colunas (${partes.length}). Esperado layout até a coluna L.`
                );

                continue;
            }


            // ====================================
            // NOVO MAPEAMENTO
            // ====================================

            // A = ignorar
            // partes[0]


            // B = Rastreio
            const rastreio =
                partes[1] ||
                '';


            // C = Código fornecedor opcional
            const cdFornecedor =
                partes[2] ||
                '';


            // D = ignorar
            // partes[3]


            // E = ignorar
            // partes[4]


            // F = Fornecedor
            const fornecedorNome =
                partes[5] ||
                '';


            // G = ignorar
            // partes[6]


            // H = ignorar
            // partes[7]


            // I = Quantidade
            const quantidade =
                parseInt(
                    String(
                        partes[8] ||
                        ''
                    )
                        .replace(
                            /\D/g,
                            ''
                        ),
                    10
                ) ||
                0;


            // J = Descrição
            const produto =
                partes[9] ||
                '';


            // K = SKU
            const sku =
                partes[10]
                    ? String(
                        partes[10]
                    ).trim()
                    : '';


            // L = Valor TOTAL
            const valorTotal =
                converterValorNumero(
                    partes[11] ||
                    ''
                );


            // ====================================
            // CONVERTE VALOR TOTAL EM CUSTO UNITÁRIO
            // ====================================

            let valorCusto =
                0;


            if (
                quantidade > 0 &&
                valorTotal > 0
            ) {

                valorCusto =
                    valorTotal /
                    quantidade;


                // Limita ruído de ponto flutuante
                valorCusto =
                    Math.round(
                        (
                            valorCusto +
                            Number.EPSILON
                        ) *
                        1000000
                    ) /
                    1000000;
            }


            // ====================================
            // VALIDAÇÕES
            // ====================================

            if (
                !sku &&
                !cdFornecedor
            ) {

                erros.push(
                    `Linha ${idx + 1}: SKU e código do fornecedor estão vazios.`
                );

                continue;
            }


            if (
                quantidade <= 0
            ) {

                erros.push(
                    `Linha ${idx + 1}: quantidade inválida para o SKU "${sku || cdFornecedor}".`
                );

                continue;
            }


            // ====================================
            // DUPLICIDADE
            // ====================================

            if (
                rastreio &&
                sku
            ) {

                const duplicado =
                    await verificarDuplicidadeEntrada(
                        rastreio,
                        sku
                    );


                if (
                    duplicado &&
                    duplicado.duplicado
                ) {

                    duplicatasEncontradas.push({

                        linha:
                            idx + 1,

                        rastreio:
                            rastreio,

                        sku:
                            sku,

                        entrada:
                            duplicado.entrada

                    });


                    continue;
                }
            }


            // ====================================
            // MONTA ITEM
            // ====================================

            itensRaw.push({

                cd_fornecedor:
                    cdFornecedor,

                rastreio:
                    rastreio,

                fornecedor_nome:
                    fornecedorNome,

                quantidade:
                    quantidade,

                produto:
                    produto,

                sku_original:
                    sku,

                // Nova planilha não possui
                // coluna de observação.
                observacao:
                    '',

                // O sistema trabalha com
                // custo UNITÁRIO.
                valor_custo:
                    valorCusto,

                sku_match:
                    null,

                produto_id:
                    null,

                status:
                    'pendente',

                acao:
                    null,

                responsavel:
                    null,

                quantidade_entrada:
                    0,

                data_acao:
                    null

            });


            console.log(
                `📦 Linha ${idx + 1} interpretada:`,
                {

                    rastreio:
                        rastreio,

                    cdFornecedor:
                        cdFornecedor,

                    fornecedor:
                        fornecedorNome,

                    quantidade:
                        quantidade,

                    produto:
                        produto,

                    sku:
                        sku,

                    valorTotal:
                        valorTotal,

                    valorCustoUnitario:
                        valorCusto

                }
            );
        }


        // ========================================
        // BLOQUEIA DUPLICATAS
        // ========================================

        if (
            duplicatasEncontradas.length >
            0
        ) {

            let mensagem =
                '⚠️ Foram encontradas entradas duplicadas:\n\n';


            duplicatasEncontradas.forEach(
                duplicata => {

                    mensagem +=
                        `Linha ${duplicata.linha}: Referência "${duplicata.rastreio}" + SKU "${duplicata.sku}" → Já existe na entrada ${duplicata.entrada}\n`;

                }
            );


            mensagem +=
                '\n❌ Corrija os dados e tente novamente.';


            alert(
                mensagem
            );


            showToast(
                '❌ Entradas duplicadas detectadas. Corrija os dados.',
                'error'
            );


            return;
        }


        // ========================================
        // NENHUM ITEM
        // ========================================

        if (
            itensRaw.length ===
            0
        ) {

            console.warn(
                'Erros no parsing:',
                erros
            );


            showToast(
                `⚠️ Nenhum item válido encontrado. ${erros.length} erro(s).`,
                'error'
            );


            return;
        }


        // ========================================
        // HOUVE ALGUM ERRO, MAS TEM ITENS VÁLIDOS
        // ========================================

        if (
            erros.length >
            0
        ) {

            showToast(
                `⚠️ ${erros.length} linha(s) ignorada(s). ${itensRaw.length} item(s) válidos.`,
                'warning'
            );


            console.warn(
                '⚠️ Erros no parsing:',
                erros
            );
        }


        // ========================================
        // ORDENA POR RASTREIO
        // ========================================

        itensRaw.sort(
            (
                a,
                b
            ) =>

                (
                    a.rastreio ||
                    ''
                ).localeCompare(
                    b.rastreio ||
                    ''
                )
        );


        // ========================================
        // IDENTIFICA FORNECEDOR E PRODUTO
        // ========================================

        for (
            const item
            of itensRaw
        ) {

            let fornecedor =
                null;


            // ====================================
            // PRIMEIRO PROCURA PELO CÓDIGO
            // DO FORNECEDOR, SE INFORMADO
            // ====================================

            if (
                item.cd_fornecedor
            ) {

                fornecedor =
                    buscarFornecedor(
                        item.cd_fornecedor
                    );
            }


            // ====================================
            // SENÃO PROCURA PELO SKU
            // ====================================

            if (
                !fornecedor &&
                item.sku_original
            ) {

                fornecedor =
                    buscarFornecedor(
                        item.sku_original
                    );
            }


            // ====================================
            // DADOS DO MAPEAMENTO DO FORNECEDOR
            // ====================================

            if (
                fornecedor
            ) {

                if (
                    !item.produto ||
                    item.produto.trim() ===
                        '' ||
                    item.produto ===
                        item.sku_original
                ) {

                    item.produto =
                        fornecedor.descricao_produto ||
                        item.produto;
                }


                if (
                    !item.fornecedor_nome
                ) {

                    item.fornecedor_nome =
                        fornecedor.nome_fornecedor;
                }


                if (
                    !item.cd_fornecedor
                ) {

                    item.cd_fornecedor =
                        fornecedor.cd_fornecedor;
                }


                if (
                    fornecedor.sku_sistema
                ) {

                    item.sku_match =
                        fornecedor.sku_sistema;
                }
            }


            // ====================================
            // PROCURA PRODUTO NO ESTOQUE
            //
            // Esta chamada continua utilizando
            // sua regra atual dos 8 primeiros
            // caracteres.
            // ====================================

            const skuParaBuscar =
                item.sku_match ||
                item.sku_original;


            if (
                skuParaBuscar
            ) {

                const produtoEstoque =
                    verificarSKUExistente(
                        skuParaBuscar
                    );


                if (
                    produtoEstoque
                ) {

                    item.produto_id =
                        produtoEstoque.id;


                    item.sku_match =
                        produtoEstoque.sku;


                    // Mantém a descrição da planilha.
                    // Só usa o cadastro se vier vazia.
                    if (
                        !item.produto ||
                        item.produto.trim() ===
                            ''
                    ) {

                        item.produto =
                            produtoEstoque.nome;
                    }
                }
            }
        }


        // ========================================
        // GERA NOVO NÚMERO
        // ========================================

        const numeroEntrada =
            await gerarNumeroEntrada();


        // ========================================
        // SALVA
        // ========================================

        try {

            if (
                !window.supabaseClient
            ) {

                throw new Error(
                    'Supabase não conectado'
                );
            }


            // ====================================
            // CARD
            // ====================================

            const cardData = {

                numero_entrada:
                    numeroEntrada,

                // Preserva exatamente o texto
                // original colado.
                dados_brutos:
                    texto,

                status:
                    'pendente',

                criado_por:
                    currentUser.name,

                criado_em:
                    getDataHoraLocalISO(),

                total_items:
                    itensRaw.length,

                items_concluidos:
                    0,

                tipo_entrada:
                    'excel'

            };


            const {
                data: cardResult,
                error: cardError
            } =
                await window.supabaseClient

                    .from(
                        'entradas_cards'
                    )

                    .insert(
                        [
                            cardData
                        ]
                    )

                    .select();


            if (
                cardError
            ) {

                throw cardError;
            }


            const card =
                cardResult[0];


            // ====================================
            // ITENS
            // ====================================

            const itemsToInsert =
                itensRaw.map(
                    item => ({

                        entrada_id:
                            card.id,

                        cd_fornecedor:
                            item.cd_fornecedor,

                        rastreio:
                            item.rastreio,

                        fornecedor_nome:
                            item.fornecedor_nome,

                        quantidade:
                            item.quantidade,

                        produto:
                            item.produto,

                        sku_original:
                            item.sku_original,

                        sku_match:
                            item.sku_match,

                        produto_id:
                            item.produto_id,

                        observacao:
                            item.observacao,

                        valor_custo:
                            item.valor_custo ||
                            0,

                        status:
                            'pendente',

                        acao:
                            null,

                        responsavel:
                            null,

                        data_acao:
                            null,

                        quantidade_entrada:
                            0,

                        tipo_entrada:
                            'excel'

                    })
                );


            const {
                error: itemsError
            } =
                await window.supabaseClient

                    .from(
                        'entrada_items'
                    )

                    .insert(
                        itemsToInsert
                    );


            if (
                itemsError
            ) {

                throw itemsError;
            }


            // ====================================
            // SUCESSO
            // ====================================

            showToast(
                `✅ Entrada ${numeroEntrada} criada com ${itensRaw.length} item(s)!`,
                'success'
            );


            pasteArea.value =
                '';


            await carregarEntradas();


        } catch (
            error
        ) {

            console.error(
                '❌ Erro ao salvar entrada:',
                error
            );


            showToast(
                '❌ Erro ao processar entrada: ' +
                error.message,
                'error'
            );
        }

    };

// ============================================
// EXPORTAR ENTRADAS PARA EXCEL
// ============================================
window.exportarEntradasExcel = async function() {
    try {
        showToast('📊 Gerando relatório de entradas...', 'info');
        
        if (!entradasCards || entradasCards.length === 0) {
            showToast('⚠️ Nenhuma entrada encontrada para exportar.', 'warning');
            return;
        }
        
        const dadosExcel = [];
        
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
        
        entradasCards.forEach(card => {
            const itensDoCard = card.itens || [];
            
            if (itensDoCard.length === 0) {
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
        
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(dadosExcel);
        
        const colWidths = [
            { wch: 20 }, { wch: 20 }, { wch: 15 }, { wch: 12 },
            { wch: 14 }, { wch: 25 }, { wch: 14 }, { wch: 14 },
            { wch: 16 }, { wch: 25 }, { wch: 25 }, { wch: 12 },
            { wch: 40 }, { wch: 18 }, { wch: 18 }, { wch: 30 },
            { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 14 },
            { wch: 20 }
        ];
        ws['!cols'] = colWidths;
        
        XLSX.utils.book_append_sheet(wb, ws, "Entradas");
        
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
        
        if (!entradasCards || entradasCards.length === 0) {
            showToast('⚠️ Nenhuma entrada encontrada.', 'warning');
            return;
        }
        
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
        
        const pendentes = entradasCards.filter(c => c.status === 'pendente');
        const finalizados = entradasCards.filter(c => c.status === 'finalizado');
        
        const wb = XLSX.utils.book_new();
        
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
// FUNÇÃO AUXILIAR PARA FORMATAR DATA/HORA (COM FUSO BRASÍLIA)
// ============================================
function formatarDataHora(dataISO) {
    if (!dataISO) return '';
    try {
        const data = new Date(dataISO);
        if (isNaN(data.getTime())) return dataISO;
        return data.toLocaleString('pt-BR', {
            timeZone: 'America/Sao_Paulo',  // <- FORÇA FUSO BRASÍLIA
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
// FUNÇÃO PARA FECHAR O MENU DE EXPORTAÇÃO
// ============================================
window.toggleExportMenu = function() {
    const menu = document.getElementById('exportMenu');
    if (menu) {
        menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
    }
};

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
// GERAR NÚMERO DE ENTRADA
// ============================================
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

window.darEntradaItem = async function(cardId, itemId, produtoId) {

    if (
        !cardId ||
        !itemId ||
        !produtoId
    ) {
        showToast(
            'Erro: dados incompletos',
            'error'
        );

        return;
    }

    const card =
        entradasCards.find(
            c => c.id == cardId
        );

    if (!card) {
        showToast(
            'Card não encontrado',
            'error'
        );

        return;
    }

    // =====================================================
    // IMPORTANTE:
    // NÃO verificar aqui se o card é XML ou Manual.
    //
    // Bruna e Arthur não podem CRIAR entrada manual,
    // mas podem processar qualquer entrada já criada.
    // =====================================================

    const item =
        card.itens.find(
            i => i.id == itemId
        );

    if (!item) {
        showToast(
            'Item não encontrado',
            'error'
        );

        return;
    }

    if (
        item.status !== 'pendente'
    ) {
        showToast(
            'Este item já foi processado',
            'warning'
        );

        return;
    }

    const quantidadeSugerida =
        item.quantidade ||
        1;

    const quantidadeStr =
        prompt(
            `Quantas unidades deseja dar entrada?\n(Sugestão: ${quantidadeSugerida})`,
            quantidadeSugerida.toString()
        );

    if (
        quantidadeStr === null
    ) {
        showToast(
            'Operação cancelada.',
            'info'
        );

        return;
    }

    const quantidade =
        parseInt(
            quantidadeStr
        );

    if (
        isNaN(quantidade) ||
        quantidade <= 0
    ) {
        showToast(
            'Quantidade inválida. Deve ser um número positivo.',
            'warning'
        );

        return;
    }

    if (
        !confirm(
            `Confirmar entrada de ${quantidade} unidade(s) do SKU "${item.sku_original}"?`
        )
    ) {
        return;
    }

    try {

        if (
            !window.supabaseClient
        ) {
            throw new Error(
                'Supabase não conectado'
            );
        }

        // =================================================
        // PRODUTO
        // =================================================

        const {
            data: produto,
            error: errProd
        } =
            await window.supabaseClient

                .from(
                    'produtos_estoque'
                )

                .select(
                    'quantidade, dados_extra, historico_custos, bloquear_sync_ml, sku, nome'
                )

                .eq(
                    'id',
                    produtoId
                )

                .single();

        if (errProd) {
            throw errProd;
        }

        const novaQuantidade =
            (
                produto.quantidade ||
                0
            ) +
            quantidade;

        // =================================================
        // CUSTO
        // =================================================

        const valorCusto =
            item.valor_custo ||
            0;

        let historicoCustos =
            produto.historico_custos ||
            [];

        if (
            valorCusto > 0
        ) {

            historicoCustos.push({
                valor: valorCusto,
                data: getDataHoraLocalISO(),
                entrada: card.numero_entrada,
                quantidade: quantidade,
                usuario: currentUser.name
            });

            if (
                historicoCustos.length >
                50
            ) {
                historicoCustos =
                    historicoCustos.slice(
                        -50
                    );
            }
        }

        const custosValidos =
            historicoCustos.filter(
                h => h.valor > 0
            );

        const custoMedio =
            custosValidos.length > 0

                ? custosValidos.reduce(
                    (
                        sum,
                        h
                    ) =>
                        sum +
                        h.valor,
                    0
                ) /
                custosValidos.length

                : 0;

        let dadosExtra =
            produto.dados_extra ||
            {};

        dadosExtra.ultimo_custo =
            valorCusto;

        dadosExtra.custo_medio =
            custoMedio;

        dadosExtra.historico_custos =
            historicoCustos;

        // =================================================
        // ATUALIZA ESTOQUE
        // =================================================

        const {
            error: errUpdate
        } =
            await window.supabaseClient

                .from(
                    'produtos_estoque'
                )

                .update({
                    quantidade: novaQuantidade,
                    dados_extra: dadosExtra,
                    historico_custos: historicoCustos,
                    ultimo_custo: valorCusto,
                    custo_medio: custoMedio
                })

                .eq(
                    'id',
                    produtoId
                );

        if (errUpdate) {
            throw errUpdate;
        }

        // =================================================
        // MOVIMENTAÇÃO
        // =================================================

        await registrarMovimentacao(
            produtoId,
            'entrada',
            quantidade,
            `ENT-${card.numero_entrada}`,
            'nova'
        );

        // =================================================
        // ITEM
        // =================================================

        const {
            error: errItem
        } =
            await window.supabaseClient

                .from(
                    'entrada_items'
                )

                .update({
                    status:
                        'entrada_realizada',

                    acao:
                        'entrada',

                    quantidade_entrada:
                        quantidade,

                    responsavel:
                        currentUser.name,

                    data_acao:
                        getDataHoraLocalISO()
                })

                .eq(
                    'id',
                    itemId
                );

        if (errItem) {
            throw errItem;
        }

        // =================================================
        // STATUS DO CARD
        // =================================================

        const concluidos =
            card.itens.filter(
                i =>
                    i.id != itemId &&
                    (
                        i.status !==
                        'pendente' &&
                        i.status !==
                        'ignorado'
                    )
            ).length +
            1;

        const total =
            card.itens.filter(
                i =>
                    i.status !==
                    'ignorado'
            ).length;

        const novoStatus =
            concluidos === total
                ? 'finalizado'
                : 'pendente';

        const {
            error: errCard
        } =
            await window.supabaseClient

                .from(
                    'entradas_cards'
                )

                .update({
                    items_concluidos:
                        concluidos,

                    status:
                        novoStatus,

                    finalizado_em:
                        novoStatus ===
                        'finalizado'
                            ? getDataHoraLocalISO()
                            : null,

                    finalizado_por:
                        novoStatus ===
                        'finalizado'
                            ? currentUser.name
                            : null
                })

                .eq(
                    'id',
                    cardId
                );

        if (errCard) {
            throw errCard;
        }

        showToast(
            `✅ Entrada de ${quantidade} unidade(s) realizada! Custo: R$ ${valorCusto.toFixed(2)}`,
            'success'
        );

        // =================================================
        // ATUALIZA ESTOQUE LOCAL
        // =================================================

        if (
            typeof produtosEstoque !==
                'undefined' &&
            Array.isArray(
                produtosEstoque
            )
        ) {

            const produtoLocal =
                produtosEstoque.find(
                    p =>
                        p.id ==
                        produtoId
                );

            if (
                produtoLocal
            ) {

                produtoLocal.quantidade =
                    novaQuantidade;

                produtoLocal.dados_extra =
                    dadosExtra;

                produtoLocal.historico_custos =
                    historicoCustos;

                produtoLocal.ultimo_custo =
                    valorCusto;

                produtoLocal.custo_medio =
                    custoMedio;
            }
        }

        // Atualiza a tela
        await carregarEntradas();

        // =================================================
        // SINCRONIZAÇÃO MERCADO LIVRE
        // =================================================

        const mlbCodes =
            dadosExtra?.mlb_codes ||
            [];

        const syncBloqueado =
            produto.bloquear_sync_ml ||
            dadosExtra?.bloquear_sync_ml ||
            false;

        if (
            mlbCodes &&
            mlbCodes.length > 0 &&
            !syncBloqueado
        ) {

            console.log(
                `🔄 Iniciando sincronização com ML para ${produto.sku} (${mlbCodes.length} anúncios)`
            );

            const {
                data: produtoAtualizado,
                error: errProdAtualizado
            } =
                await window.supabaseClient

                    .from(
                        'produtos_estoque'
                    )

                    .select('*')

                    .eq(
                        'id',
                        produtoId
                    )

                    .single();

            if (
                errProdAtualizado
            ) {

                console.warn(
                    '⚠️ Erro ao buscar produto atualizado para sincronização:',
                    errProdAtualizado
                );

                showToast(
                    '⚠️ Produto atualizado, mas falha ao sincronizar com ML',
                    'warning'
                );

            } else {

                try {

                    // =============================================
                    // MÉTODO PRINCIPAL
                    // =============================================

                    if (
                        typeof window.sincronizarEstoqueML ===
                        'function'
                    ) {

                        console.log(
                            `🔄 Sincronizando ${produtoAtualizado.sku} via sincronizarEstoqueML`
                        );

                        showToast(
                            `🔄 Sincronizando ${produtoAtualizado.sku} com Mercado Livre...`,
                            'info'
                        );

                        const resultado =
                            await window.sincronizarEstoqueML(
                                produtoAtualizado
                            );

                        if (
                            resultado &&
                            resultado.success
                        ) {

                            showToast(
                                `✅ Produto ${produtoAtualizado.sku} sincronizado com ML!`,
                                'success'
                            );

                        } else if (
                            resultado &&
                            resultado.results
                        ) {

                            const sucessos =
                                resultado.results.filter(
                                    r =>
                                        r.success
                                ).length;

                            const falhas =
                                resultado.results.filter(
                                    r =>
                                        !r.success
                                ).length;

                            if (
                                sucessos > 0 &&
                                falhas === 0
                            ) {

                                showToast(
                                    `✅ ${sucessos} anúncio(s) sincronizado(s)!`,
                                    'success'
                                );

                            } else if (
                                sucessos > 0 &&
                                falhas > 0
                            ) {

                                showToast(
                                    `⚠️ ${sucessos} OK, ${falhas} falhas na sincronização`,
                                    'warning'
                                );

                            } else {

                                const fullPuros =
                                    resultado.results.filter(
                                        r =>
                                            r.tipo ===
                                                'full_puro' ||
                                            r.ignorado
                                    );

                                if (
                                    fullPuros.length > 0
                                ) {

                                    showToast(
                                        `🔴 ${fullPuros.length} anúncio(s) FULL precisam ser atualizados manualmente`,
                                        'warning'
                                    );

                                } else {

                                    showToast(
                                        `⚠️ Falha ao sincronizar ${produtoAtualizado.sku} com ML`,
                                        'warning'
                                    );
                                }
                            }
                        }

                    // =============================================
                    // FALLBACK
                    // =============================================
                    } else if (
                        typeof window.sincronizarProdutoML ===
                        'function'
                    ) {

                        console.log(
                            `🔄 Sincronizando ${produtoAtualizado.sku} via sincronizarProdutoML`
                        );

                        showToast(
                            `🔄 Sincronizando ${produtoAtualizado.sku} com Mercado Livre...`,
                            'info'
                        );

                        await window.sincronizarProdutoML(
                            produtoId
                        );

                    } else {

                        console.warn(
                            '⚠️ Nenhuma função de sincronização ML encontrada'
                        );

                        showToast(
                            'ℹ️ Produto atualizado no estoque, mas sincronização ML não disponível',
                            'info'
                        );
                    }

                } catch (
                    errSync
                ) {

                    console.error(
                        '❌ Erro na sincronização com ML:',
                        errSync
                    );

                    showToast(
                        `⚠️ Erro ao sincronizar com ML: ${
                            errSync.message ||
                            'Erro desconhecido'
                        }`,
                        'warning'
                    );
                }
            }

        } else if (
            syncBloqueado
        ) {

            console.log(
                `🔒 Sincronização BLOQUEADA para ${produto.sku}`
            );

            showToast(
                `🔒 Sincronização com ML bloqueada para ${produto.sku}`,
                'info'
            );

        } else if (
            !mlbCodes ||
            mlbCodes.length === 0
        ) {

            console.log(
                `ℹ️ Produto ${produto.sku} não possui códigos MLB para sincronizar`
            );
        }

    } catch (
        error
    ) {

        console.error(
            '❌ Erro ao dar entrada:',
            error
        );

        showToast(
            '❌ Erro ao dar entrada: ' +
            error.message,
            'error'
        );
    }
};

// ============================================
// IGNORAR ITEM / CORRIGIR SKU RECEBIDO
// ============================================

window.ignorarItem = async function(cardId, itemId) {

    // ========================================
    // VALIDAÇÃO
    // ========================================

    if (
        !cardId ||
        !itemId
    ) {

        showToast(
            'Erro: dados incompletos',
            'error'
        );

        return;
    }


    const card =
        entradasCards.find(
            c =>
                String(c.id) ===
                String(cardId)
        );


    if (!card) {

        showToast(
            'Card não encontrado',
            'error'
        );

        return;
    }


    const item =
        card.itens.find(
            i =>
                String(i.id) ===
                String(itemId)
        );


    if (!item) {

        showToast(
            'Item não encontrado',
            'error'
        );

        return;
    }


    if (
        item.status !==
        'pendente'
    ) {

        showToast(
            'Este item já foi processado',
            'warning'
        );

        return;
    }


    // ========================================
    // ESCOLHA
    // ========================================

    const escolha =
        prompt(
            `O que deseja fazer com este item?

Produto informado:
${item.produto || '-'}

SKU / referência atual:
${item.sku_match || item.sku_original || '-'}

1 - Ignorar completamente este item

2 - O produto que chegou é outro
    Informar o SKU correto e dar entrada nele

Digite 1 ou 2:`,
            '1'
        );


    // Cancelou
    if (
        escolha === null
    ) {

        showToast(
            'Operação cancelada.',
            'info'
        );

        return;
    }


    const opcao =
        String(
            escolha
        )
            .trim();


    // ========================================
    // OPÇÃO 2:
    // CORRIGIR SKU
    // ========================================

    if (
        opcao === '2'
    ) {

        await window
            .corrigirSKUEntradaItem(
                cardId,
                itemId
            );

        return;
    }


    // ========================================
    // OPÇÃO INVÁLIDA
    // ========================================

    if (
        opcao !== '1'
    ) {

        showToast(
            '⚠️ Opção inválida. Digite 1 para ignorar ou 2 para corrigir o SKU.',
            'warning'
        );

        return;
    }


    // ========================================
    // CONFIRMA IGNORAR
    // ========================================

    const confirmar =
        confirm(
            `Deseja realmente IGNORAR este item?

Produto:
${item.produto || '-'}

SKU:
${item.sku_match || item.sku_original || '-'}

Quantidade:
${item.quantidade || 0}

Nenhuma unidade será adicionada ao estoque.`
        );


    if (
        !confirmar
    ) {

        showToast(
            'Operação cancelada.',
            'info'
        );

        return;
    }


    // ========================================
    // IGNORA
    // ========================================

    try {

        if (
            !window.supabaseClient
        ) {

            throw new Error(
                'Supabase não conectado'
            );
        }


        const responsavel =
            currentUser?.name ||
            currentUser?.username ||
            'Sistema';


        const dataAcao =
            typeof getDataHoraLocalISO ===
                'function'

                ? getDataHoraLocalISO()

                : new Date()
                    .toISOString();


        // ====================================
        // IMPORTANTE:
        //
        // NÃO usamos:
        //
        // acao: 'ignorado'
        //
        // porque o banco possui
        // entrada_items_acao_check e esse
        // valor não é permitido.
        //
        // O STATUS já identifica que o item
        // foi ignorado.
        // ====================================

        const {
            error: errItem
        } =
            await window.supabaseClient

                .from(
                    'entrada_items'
                )

                .update({

                    status:
                        'ignorado',

                    acao:
                        null,

                    responsavel:
                        responsavel,

                    data_acao:
                        dataAcao,

                    quantidade_entrada:
                        0

                })

                .eq(
                    'id',
                    itemId
                );


        if (
            errItem
        ) {

            throw errItem;
        }


        // ====================================
        // SIMULA O NOVO ESTADO DOS ITENS
        // PARA RECALCULAR O CARD
        // ====================================

        const itensAtualizados =
            card.itens.map(
                i => {

                    if (
                        String(i.id) ===
                        String(itemId)
                    ) {

                        return {

                            ...i,

                            status:
                                'ignorado',

                            acao:
                                null,

                            responsavel:
                                responsavel,

                            data_acao:
                                dataAcao,

                            quantidade_entrada:
                                0

                        };
                    }


                    return i;

                }
            );


        // ====================================
        // QUANTOS ITENS AINDA ESTÃO PENDENTES?
        // ====================================

        const pendentes =
            itensAtualizados.filter(
                i =>
                    i.status ===
                    'pendente'
            ).length;


        // Tudo que não está pendente
        // já foi processado ou ignorado.
        const concluidos =
            itensAtualizados.filter(
                i =>
                    i.status !==
                    'pendente'
            ).length;


        const novoStatus =
            pendentes === 0

                ? 'finalizado'

                : 'pendente';


        // ====================================
        // ATUALIZA CARD
        // ====================================

        const {
            error: errCard
        } =
            await window.supabaseClient

                .from(
                    'entradas_cards'
                )

                .update({

                    items_concluidos:
                        concluidos,

                    status:
                        novoStatus,

                    finalizado_em:
                        novoStatus ===
                        'finalizado'

                            ? dataAcao

                            : null,

                    finalizado_por:
                        novoStatus ===
                        'finalizado'

                            ? responsavel

                            : null

                })

                .eq(
                    'id',
                    cardId
                );


        if (
            errCard
        ) {

            throw errCard;
        }


        showToast(
            '⏭️ Item ignorado com sucesso!',
            'success'
        );


        // ====================================
        // RECARREGA
        // ====================================

        await carregarEntradas();


    } catch (
        error
    ) {

        console.error(
            '❌ Erro ao ignorar item:',
            error
        );


        showToast(
            '❌ Erro ao ignorar: ' +
            (
                error.message ||
                'Erro desconhecido'
            ),
            'error'
        );

    }

};

// ============================================
// CORRIGIR SKU DE UM ITEM DA ENTRADA
//
// USADO QUANDO:
// - fornecedor/referência indica um produto
// - fisicamente chegou outro produto
//
// NÃO ALTERA O MAPEAMENTO DO FORNECEDOR.
// ALTERA SOMENTE ESTA ENTRADA.
// ============================================

window.corrigirSKUEntradaItem =
    async function(
        cardId,
        itemId
    ) {

        // ========================================
        // VALIDAÇÃO
        // ========================================

        if (
            !cardId ||
            !itemId
        ) {

            showToast(
                'Erro: dados incompletos',
                'error'
            );

            return;
        }


        const card =
            entradasCards.find(
                c =>
                    String(c.id) ===
                    String(cardId)
            );


        if (!card) {

            showToast(
                'Card não encontrado',
                'error'
            );

            return;
        }


        const item =
            card.itens.find(
                i =>
                    String(i.id) ===
                    String(itemId)
            );


        if (!item) {

            showToast(
                'Item não encontrado',
                'error'
            );

            return;
        }


        if (
            item.status !==
            'pendente'
        ) {

            showToast(
                'Este item já foi processado.',
                'warning'
            );

            return;
        }


        // ========================================
        // GARANTE ESTOQUE CARREGADO
        // ========================================

        try {

            if (
                (
                    typeof produtosEstoque ===
                        'undefined'
                )

                ||

                !Array.isArray(
                    produtosEstoque
                )

                ||

                produtosEstoque.length ===
                    0
            ) {

                showToast(
                    '🔄 Carregando estoque...',
                    'info'
                );


                if (
                    typeof carregarProdutosEstoque ===
                    'function'
                ) {

                    await carregarProdutosEstoque();

                }


                if (
                    typeof aguardarEstoqueCarregado ===
                    'function'
                ) {

                    await aguardarEstoqueCarregado(
                        15000
                    );

                }

            }

        } catch (
            erroEstoque
        ) {

            console.warn(
                '⚠️ Erro carregando estoque:',
                erroEstoque
            );

        }


        // ========================================
        // PEDE SKU CORRETO
        // ========================================

        const skuInformado =
            prompt(
                `Informe o SKU CORRETO do produto que realmente chegou.

Produto/referência recebida na entrada:
${item.produto || '-'}

SKU atualmente identificado:
${item.sku_match || item.sku_original || '-'}

Digite o SKU correto:`
            );


        if (
            skuInformado === null
        ) {

            showToast(
                'Operação cancelada.',
                'info'
            );

            return;
        }


        const skuCorreto =
            String(
                skuInformado
            )
                .trim();


        if (
            !skuCorreto
        ) {

            showToast(
                '⚠️ Informe o SKU correto.',
                'warning'
            );

            return;
        }


        // ========================================
        // PROCURA PRODUTO NO ESTOQUE
        // ========================================

        const produtoCorreto =
            verificarSKUExistente(
                skuCorreto
            );


        if (
            !produtoCorreto
        ) {

            showToast(
                `❌ O SKU "${skuCorreto}" não foi encontrado no estoque.

Confira o SKU informado.`,
                'error'
            );

            return;
        }


        // ========================================
        // CONFIRMA PRODUTO
        // ========================================

        const confirmar =
            confirm(
                `Confirme a correção:

ENTRADA:
${card.numero_entrada || '-'}

PRODUTO INFORMADO ORIGINALMENTE:
${item.produto || '-'}

SKU ORIGINAL / REFERÊNCIA:
${item.sku_original || '-'}

────────────────────────────

PRODUTO QUE REALMENTE CHEGOU:

SKU:
${produtoCorreto.sku || '-'}

Produto:
${produtoCorreto.nome || '-'}

Estoque atual:
${produtoCorreto.quantidade ?? '-'}

────────────────────────────

Após confirmar, esta linha continuará PENDENTE e o botão "Dar Entrada" será ativado para o produto correto.

Confirmar?`
            );


        if (
            !confirmar
        ) {

            showToast(
                'Correção cancelada.',
                'info'
            );

            return;
        }


        // ========================================
        // ATUALIZA ITEM
        // ========================================

        try {

            if (
                !window.supabaseClient
            ) {

                throw new Error(
                    'Supabase não conectado'
                );

            }


            const responsavel =
                currentUser?.name ||
                currentUser?.username ||
                'Sistema';


            const dataAcao =
                typeof getDataHoraLocalISO ===
                    'function'

                    ? getDataHoraLocalISO()

                    : new Date()
                        .toISOString();


            // ====================================
            // REGISTRA HISTÓRICO NA OBSERVAÇÃO
            // ====================================

            const dataHistorico =
                new Date()
                    .toLocaleString(
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


            const registroCorrecao =
                `[CORREÇÃO DE SKU - ${dataHistorico} - ${responsavel}]
Produto informado na entrada: ${item.produto || '-'}
SKU original/referência: ${item.sku_original || '-'}
SKU identificado anteriormente: ${item.sku_match || '-'}
Produto que realmente chegou: ${produtoCorreto.nome || '-'}
SKU correto: ${produtoCorreto.sku || '-'}`;


            const novaObservacao =
                item.observacao &&
                String(
                    item.observacao
                ).trim()

                    ? `${item.observacao}

${registroCorrecao}`

                    : registroCorrecao;


            // ====================================
            // ATUALIZA SOMENTE ESTA ENTRADA
            //
            // NÃO mexe na tabela fornecedores.
            // ====================================

            const {
                error: errUpdate
            } =
                await window.supabaseClient

                    .from(
                        'entrada_items'
                    )

                    .update({

                        // Produto correto no estoque
                        produto_id:
                            produtoCorreto.id,

                        // SKU correto passa a ter prioridade
                        // no renderizarEntradas()
                        sku_match:
                            produtoCorreto.sku,

                        // Atualiza o nome visual da linha
                        // para mostrar o produto recebido
                        produto:
                            produtoCorreto.nome ||
                            item.produto,

                        // Continua pendente:
                        // NÃO adiciona estoque ainda.
                        status:
                            'pendente',

                        // "cadastro" já é um valor aceito
                        // pelo check atual de acao.
                        acao:
                            'cadastro',

                        quantidade_entrada:
                            0,

                        responsavel:
                            responsavel,

                        data_acao:
                            dataAcao,

                        observacao:
                            novaObservacao

                    })

                    .eq(
                        'id',
                        itemId
                    );


            if (
                errUpdate
            ) {

                throw errUpdate;
            }


            // ====================================
            // ATUALIZA MEMÓRIA LOCAL
            // ====================================

            const cardLocal =
                entradasCards.find(
                    c =>
                        String(c.id) ===
                        String(cardId)
                );


            if (
                cardLocal
            ) {

                const itemLocal =
                    cardLocal.itens.find(
                        i =>
                            String(i.id) ===
                            String(itemId)
                    );


                if (
                    itemLocal
                ) {

                    itemLocal.produto_id =
                        produtoCorreto.id;


                    itemLocal.sku_match =
                        produtoCorreto.sku;


                    itemLocal.produto =
                        produtoCorreto.nome ||
                        itemLocal.produto;


                    itemLocal.status =
                        'pendente';


                    itemLocal.acao =
                        'cadastro';


                    itemLocal.quantidade_entrada =
                        0;


                    itemLocal.responsavel =
                        responsavel;


                    itemLocal.data_acao =
                        dataAcao;


                    itemLocal.observacao =
                        novaObservacao;

                }

            }


            showToast(
                `✅ SKU corrigido para ${produtoCorreto.sku}!

Agora você já pode clicar em "Dar Entrada".`,
                'success'
            );


            // ====================================
            // RECARREGA A TELA
            // ====================================

            await carregarEntradas();


        } catch (
            error
        ) {

            console.error(
                '❌ Erro corrigindo SKU da entrada:',
                error
            );


            showToast(
                '❌ Erro ao corrigir SKU: ' +
                (
                    error.message ||
                    'Erro desconhecido'
                ),
                'error'
            );

        }

    };

// ============================================
// ABRIR CADASTRO RÁPIDO
// ============================================
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

    if (typeof abrirModalProdutoEstoque !== 'function') {
        showToast('❌ Função de cadastro não disponível. Recarregue a página.', 'error');
        console.error('❌ abrirModalProdutoEstoque não é uma função');
        return;
    }

    abrirModalProdutoEstoque(null);
    
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
        
        const modal = document.getElementById('modalProdutoEstoque');
        if (modal) {
            modal.classList.remove('hidden');
            modal.style.display = 'flex';
            modal.style.alignItems = 'center';
            modal.style.justifyContent = 'center';
            modal.style.zIndex = '9999';
        }
        
        configurarBotaoSalvarModal(cardId, itemId);
    }, 300);

    showToast('📝 Preencha os dados do produto e clique em Salvar', 'info');
};

// ============================================
// CONFIGURAR BOTÃO SALVAR DO MODAL
// ============================================
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

// ============================================
// PROCESSAR ITEM APÓS CADASTRO
// ============================================
async function processarItemAposCadastro(cardId, itemId) {
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
            const produtoMatch = verificarSKUExistente(item.sku_match);
            if (produtoMatch) {
                await atualizarItemEntradaPendente(cardId, itemId, produtoMatch.id, produtoMatch.sku);
                return;
            }
            showToast('⚠️ Produto não encontrado após cadastro. Tente novamente.', 'warning');
            return;
        }

        await atualizarItemEntradaPendente(cardId, itemId, produto.id, produto.sku);

    } catch (error) {
        console.error('❌ Erro ao processar item após cadastro:', error);
        showToast('❌ Erro: ' + error.message, 'error');
    }
}

// ============================================
// ATUALIZAR ITEM DA ENTRADA (MANTÉM PENDENTE)
// ============================================
async function atualizarItemEntradaPendente(cardId, itemId, produtoId, skuMatch) {
    try {
        if (!window.supabaseClient) throw new Error('Supabase não conectado');

        const { error: errUpdate } = await window.supabaseClient
            .from('entrada_items')
            .update({
                produto_id: produtoId,
                sku_match: skuMatch,
                status: 'pendente',  // <- MANTÉM PENDENTE
                acao: 'cadastro',
                responsavel: currentUser.name,
                data_acao: new Date().toISOString()
            })
            .eq('id', itemId);

        if (errUpdate) throw errUpdate;

        // NÃO finaliza o card automaticamente - deixa o usuário dar entrada
        showToast(`✅ Produto vinculado! Agora clique em "Dar Entrada" para adicionar ao estoque.`, 'success');
        entradaEmProcessamento = null;
        await carregarEntradas();

    } catch (error) {
        console.error('❌ Erro ao atualizar item da entrada:', error);
        throw error;
    }
}

// ============================================
// ABRIR CADASTRO DE PRODUTO NOVO + CRIAR OS
// ============================================
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

// ============================================
// PROCESSAR NOVO PRODUTO + CRIAR OS
// ============================================
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

// ============================================
// CRIAR UMA ORDEM DE SERVIÇO COMPLETA
// ============================================
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

// ============================================
// FINALIZAR ENTRADA
// ============================================
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

// ============================================
// CANCELAR ENTRADA
// ============================================
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
// REGISTRAR MOVIMENTAÇÃO (FALLBACK)
// ============================================
if (typeof registrarMovimentacao !== 'function') {
    window.registrarMovimentacao = async function(produtoId, tipo, quantidade, numeroDocumento, tipoEntrada) {
        try {
            if (!window.supabaseClient) return;
            const usuario = currentUser ? currentUser.name : 'sistema';
            const dataHora = getDataHoraLocalISO();
            const { error } = await window.supabaseClient
                .from('estoque_movimentacoes')
                .insert([{
                    produto_id: produtoId,
                    tipo: tipo,
                    quantidade: quantidade,
                    usuario: usuario,
                    numero_documento: numeroDocumento || 'ENTRADA_SISTEMA',
                    tipo_entrada: tipoEntrada || 'nova',
                    data_hora: dataHora
                }]);
            if (error) console.warn('⚠️ Erro ao registrar movimentação:', error);
        } catch (e) {
            console.warn('⚠️ Erro ao registrar movimentação:', e);
        }
    };
}

// ============================================
// SOBRESCREVER SALVAR PRODUTO (CORRIGIDO)
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
                        status: 'pendente',  // <- MANTÉM PENDENTE
                        acao: acao === 'novo_com_os' ? 'cadastro_com_os' : 'cadastro',
                        responsavel: currentUser.name,
                        data_acao: new Date().toISOString()
                    })
                    .eq('id', itemId);

                if (error) throw error;

                // NÃO finaliza o card automaticamente
                showToast(`✅ Produto cadastrado! Agora clique em "Dar Entrada" para adicionar ao estoque.`, 'success');
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
// PRÉ-ENTRADA
// ============================================

function renderizarPreEntrada() {

    const tbody =
        document.getElementById('preEntradaTableBody');

    if (!tbody) return;


    const podeVerCusto =
        currentUser &&
        (
            currentUser.username === 'andressamiotto' ||
            currentUser.username === 'ronald'
        );


    // Garante que o estilo existe
    injetarEstilosEntradasUrgentes();


    // ========================================
    // SEM ITENS
    // ========================================

    if (preEntradaItens.length === 0) {

        tbody.innerHTML = `
            <tr>
                <td
                    colspan="${podeVerCusto ? 10 : 9}"
                    class="text-center text-muted"
                >
                    Nenhum item carregado.
                </td>
            </tr>
        `;

        return;
    }


    let html = '';


    preEntradaItens.forEach((item, idx) => {

        const skuDisplay =
            item.sku_match ||
            item.sku_original ||
            '-';


        const fornecedorDisplay =
            item.fornecedor_nome ||
            item.cd_fornecedor ||
            '-';


        const custoDisplay =
            podeVerCusto && item.valor_custo
                ? `R$ ${parseFloat(item.valor_custo).toFixed(2)}`
                : (
                    podeVerCusto
                        ? '-'
                        : ''
                );


        // ========================================
        // PROCURA O PRODUTO NO ESTOQUE
        // ========================================

        const produtoExistente =
            verificarSKUExistente(
                item.sku_match ||
                item.sku_original
            );


        // ========================================
        // PEGA QUANTIDADE ATUAL
        // ========================================

        const quantidadeAtualProduto =
            produtoExistente
                ? Number(produtoExistente.quantidade)
                : NaN;


        // ========================================
        // ESTOQUE ZERADO = URGENTE
        // ========================================

        const entradaUrgente =
            !!produtoExistente &&
            Number.isFinite(quantidadeAtualProduto) &&
            quantidadeAtualProduto <= 0;


        // ========================================
        // MONTA LINHA
        // ========================================

        html += `

            <tr class="${
                entradaUrgente
                    ? 'entrada-urgente-estoque-zero'
                    : ''
            }">

                <td>
                    ${idx + 1}
                </td>


                <td>
                    ${item.cd_fornecedor || '-'}
                </td>


                <td>
                    ${item.rastreio || '-'}
                </td>


                <td>
                    <strong>
                        ${item.quantidade || 0}
                    </strong>
                </td>


                <td>

                    ${
                        entradaUrgente
                            ? `
                                <span class="badge-entrada-urgente">
                                    🚨 URGENTE — ESTOQUE ${quantidadeAtualProduto}
                                </span>

                                <br>
                            `
                            : ''
                    }

                    ${item.produto || '-'}

                </td>


                <td>
                    <code>
                        ${skuDisplay}
                    </code>
                </td>


                <td>
                    ${fornecedorDisplay}
                </td>


                ${
                    podeVerCusto
                        ? `
                            <td>
                                ${custoDisplay}
                            </td>
                        `
                        : ''
                }


                <td>

                    <input
                        type="text"
                        class="form-control form-control-sm pre-observacao"
                        data-idx="${idx}"
                        value="${item.observacao || ''}"
                        placeholder="Observações..."
                        style="min-width:150px;"
                    >

                </td>


                <td>

                    <button
                        class="btn btn-sm btn-danger"
                        onclick="removerItemPreEntrada(${idx})"
                        title="Remover item"
                    >
                        <i class="fas fa-times"></i>
                    </button>

                </td>

            </tr>
        `;

    });


    tbody.innerHTML = html;


    // ========================================
    // OBSERVAÇÕES
    // ========================================

    document
        .querySelectorAll('.pre-observacao')
        .forEach(input => {

            input.addEventListener(
                'input',
                function() {

                    const idx =
                        parseInt(this.dataset.idx);

                    preEntradaItens[idx].observacao =
                        this.value;
                }
            );

        });
}

// ============================================
// REMOVER ITEM DA PRÉ-ENTRADA
// ============================================
window.removerItemPreEntrada = function(idx) {
    if (!confirm(`Remover o item "${preEntradaItens[idx].produto}" da pré-entrada?`)) return;
    preEntradaItens.splice(idx, 1);
    renderizarPreEntrada();
    if (preEntradaItens.length === 0) {
        document.getElementById('preEntradaTableContainer').style.display = 'none';
        showToast('Todos os itens removidos. A pré-entrada está vazia.', 'info');
    }
};

// ============================================
// LIMPAR PRÉ-ENTRADA
// ============================================
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
// PROCESSAR PRÉ-ENTRADA
// ============================================
window.processarPreEntrada = async function() {
    if (preEntradaItens.length === 0) {
        showToast('⚠️ Nenhum item na pré-entrada. Carregue um XML primeiro.', 'warning');
        return;
    }

    if (!confirm(`Confirmar a criação da entrada com ${preEntradaItens.length} item(s)?`)) {
        return;
    }

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
// PROCESSAR XML PARA PRÉ-ENTRADA
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

                if (rastreio && cProd) {
                    const duplicado = await verificarDuplicidadeEntrada(rastreio, cProd);
                    if (duplicado && duplicado.duplicado) {
                        duplicatasEncontradas.push({
                            rastreio: rastreio,
                            sku: cProd,
                            entrada: duplicado.entrada,
                            produto: xProd || 'Sem nome'
                        });
                        continue;
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

let produtoNovoParaOS = null;

// ============================================
// SOBRESCREVER ABRIR CADASTRO RÁPIDO COM BOTÃO PRODUTO NOVO
// ============================================
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

    if (typeof abrirModalProdutoEstoque !== 'function') {
        showToast('❌ Função de cadastro não disponível. Recarregue a página.', 'error');
        console.error('❌ abrirModalProdutoEstoque não é uma função');
        return;
    }

    abrirModalProdutoEstoque(null);
    
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
        
        const modal = document.getElementById('modalProdutoEstoque');
        if (modal) {
            modal.classList.remove('hidden');
            modal.style.display = 'flex';
            modal.style.alignItems = 'center';
            modal.style.justifyContent = 'center';
            modal.style.zIndex = '9999';
        }
        
        adicionarBotaoProdutoNovo(cardId, itemId);
        configurarBotaoSalvarModal(cardId, itemId);
    }, 300);

    showToast('📝 Preencha os dados do produto e clique em Salvar', 'info');
};

// ============================================
// FUNÇÃO PARA ADICIONAR BOTÃO "PRODUTO NOVO"
// ============================================
function adicionarBotaoProdutoNovo(cardId, itemId) {
    const btnExistente = document.getElementById('btnProdutoNovoOS');
    if (btnExistente) btnExistente.remove();

    const container = document.querySelector('#modalProdutoEstoque .d-flex.justify-content-between.gap-2.mt-3');
    if (!container) return;

    const btn = document.createElement('button');
    btn.id = 'btnProdutoNovoOS';
    btn.className = 'btn btn-warning';
    btn.innerHTML = '<i class="fas fa-plus-circle"></i> Produto Novo + OS';
    btn.style.marginRight = 'auto';
    btn.title = 'Cadastrar como produto novo e criar automaticamente uma OS para Elaine';
    
    btn.onclick = function() {
        produtoNovoParaOS = {
            cardId: cardId,
            itemId: itemId,
            item: entradaEmProcessamento?.item || null
        };
        abrirModalDescricaoOS();
    };
    
    const existingButtons = container.querySelectorAll('.btn:not(#btnProdutoNovoOS)');
    if (existingButtons.length > 0) {
        container.insertBefore(btn, existingButtons[0]);
    } else {
        container.prepend(btn);
    }
}

// ============================================
// MODAL PARA DESCRIÇÃO DA OS
// ============================================
function abrirModalDescricaoOS() {
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

    const textarea = document.getElementById('descricaoOSInput');
    if (textarea) textarea.value = '';

    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
    modal.style.zIndex = '10000';
    
    setTimeout(() => {
        if (textarea) textarea.focus();
    }, 300);
}

// ============================================
// FECHAR MODAL DESCRIÇÃO OS
// ============================================
window.fecharModalDescricaoOS = function() {
    const modal = document.getElementById('modalDescricaoOS');
    if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
    }
};

// ============================================
// CONFIRMAR CRIAÇÃO DA OS
// ============================================
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
    
    const produto = verificarSKUExistente(item?.sku_original);
    if (!produto) {
        showToast('⚠️ Produto não encontrado. Salve o produto primeiro.', 'warning');
        return;
    }

    fecharModalDescricaoOS();

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
            await atualizarItemEntrada(cardId, itemId, produto.id, produto.sku);
            produtoNovoParaOS = null;
            await carregarEntradas();
        } else {
            showToast('❌ Erro ao criar OS. Tente novamente.', 'error');
        }
    } catch (error) {
        console.error('❌ Erro ao criar OS:', error);
        showToast('❌ Erro ao criar OS: ' + error.message, 'error');
    }
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
window.editarObservacaoInline = window.editarObservacaoInline;
window.editarObservacaoItem = window.editarObservacaoItem;

console.log('📦 Sistema de Entradas carregado com sucesso! (Versão melhorada)');