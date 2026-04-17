// ============================================
// GESTÃO DE ESTOQUE - VERSÃO COMPLETA COM CATEGORIAS, MLB E SINCRONIZAÇÃO ML
// ============================================

let produtosEstoque = [];

// Definição dos campos específicos por categoria (organizados em grade)
const camposPorCategoria = {
    Eixos: [
        { nome: "tamanho", label: "Tamanho", tipo: "number", obrigatorio: true, placeholder: "Ex: 175" },
        { nome: "passo", label: "Passo da rosca", tipo: "number", obrigatorio: true, placeholder: "Ex: 1.5" },
        { nome: "posição", label: "Posição", tipo: "select", opcoes: ["Dianteiro", "Traseiro"] },
        { nome: "mlb_codes", label: "Códigos MLB", tipo: "textarea", placeholder: "MLB separados por vírgula (ex: MLB123, MLB456, MLB789)", obrigatorio: false, rows: 2}
    ],
    roupa: [
        { nome: "tamanho", label: "Tamanho", tipo: "select", opcoes: ["PP", "P", "M", "G", "GG", "XG"] },
        { nome: "cor", label: "Cor", tipo: "text", placeholder: "Ex: Azul" },
        { nome: "material", label: "Material", tipo: "text", placeholder: "Ex: Algodão" },
        { nome: "genero", label: "Gênero", tipo: "select", opcoes: ["Masculino", "Feminino", "Unissex"] },
        { nome: "mlb_codes", label: "Códigos MLB", tipo: "textarea", placeholder: "MLB separados por vírgula", rows: 2 }
    ],
    alimento: [
        { nome: "validade", label: "Data de Validade", tipo: "date" },
        { nome: "lote", label: "Lote", tipo: "text", placeholder: "Ex: LOT123" },
        { nome: "unidade_medida", label: "Unidade", tipo: "select", opcoes: ["kg", "g", "L", "ml", "unidade"] },
        { nome: "mlb_codes", label: "Códigos MLB", tipo: "textarea", placeholder: "MLB separados por vírgula", rows: 2 }
    ],
    moveis: [
        { nome: "material", label: "Material", tipo: "text", placeholder: "Ex: Madeira" },
        { nome: "dimensoes", label: "Dimensões (C x L x A)", tipo: "text", placeholder: "Ex: 100x50x80 cm" },
        { nome: "cor", label: "Cor", tipo: "text", placeholder: "Ex: Carvalho" },
        { nome: "montagem_necessaria", label: "Montagem necessária?", tipo: "checkbox" },
        { nome: "mlb_codes", label: "Códigos MLB", tipo: "textarea", placeholder: "MLB separados por vírgula", rows: 2 }
    ],
    outros: [
        { nome: "observacoes_adicionais", label: "Observações", tipo: "textarea", rows: 2 },
        { nome: "mlb_codes", label: "Códigos MLB", tipo: "textarea", placeholder: "MLB separados por vírgula", rows: 2 }
    ]
};

// ===== ABRIR SISTEMA =====
window.abrirGestaoEstoque = function() {
    if (!currentUser) {
        if (window.showToast) showToast('⚠️ Faça login primeiro', 'warning');
        else alert('Faça login primeiro');
        return;
    }

    // Esconder outros sistemas
    const sistemas = ['mainSystem', 'salesSystem', 'reembolsosSystem', 'caixaSystem', 
                      'reviewsSystem', 'folgasSystem', 'shippingSystem', 'estoqueSystem', 'menuSystem'];
    sistemas.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });

    const gestaoSystem = document.getElementById('estoqueGestaoSystem');
    if (!gestaoSystem) {
        console.error('Elemento #estoqueGestaoSystem não encontrado');
        if (window.showToast) showToast('Erro: sistema de estoque não configurado', 'error');
        return;
    }
    gestaoSystem.classList.remove('hidden');

    // Atualizar cabeçalho
    const userNameEl = document.getElementById('estoqueGestaoUserName');
    if (userNameEl) userNameEl.textContent = currentUser.name;
    const userAvatarEl = document.getElementById('estoqueGestaoUserAvatar');
    if (userAvatarEl) userAvatarEl.textContent = currentUser.avatar;
    const userRoleEl = document.getElementById('estoqueGestaoUserRole');
    if (userRoleEl) userRoleEl.textContent = currentUser.role;

    carregarProdutosEstoque();
};

// ===== CARREGAR PRODUTOS DO SUPABASE =====
async function carregarProdutosEstoque() {
    try {
        if (!window.supabaseClient) throw new Error('Supabase não inicializado');
        const { data, error } = await window.supabaseClient
            .from('produtos_estoque')
            .select('*')
            .order('nome', { ascending: true });
        if (error) throw error;
        produtosEstoque = data || [];
        renderizarTabelaProdutos();
    } catch (error) {
        console.error('Erro ao carregar produtos:', error);
        if (window.showToast) showToast('Erro ao carregar produtos', 'error');
        const tbody = document.getElementById('produtosEstoqueBody');
        if (tbody) tbody.innerHTML = '<tr><td colspan="8" class="text-danger">Erro ao carregar produtos. Consulte o console.穷</td></tr>';
    }
}

// ===== RENDERIZAR TABELA =====
function renderizarTabelaProdutos() {
    const tbody = document.getElementById('produtosEstoqueBody');
    if (!tbody) return;
    if (produtosEstoque.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center">Nenhum produto cadastrado.穷</td></tr>';
        return;
    }
    tbody.innerHTML = '';
    produtosEstoque.forEach(prod => {
        const row = document.createElement('tr');
        let atributosResumo = '';
        if (prod.dados_extra) {
            const keys = Object.keys(prod.dados_extra).slice(0, 2);
            atributosResumo = keys.map(k => `${k}: ${prod.dados_extra[k]}`).join(', ');
            if (Object.keys(prod.dados_extra).length > 2) atributosResumo += '...';
        }
        // Botões de ação
        let botoes = `
            <button class="btn btn-sm btn-info" onclick="editarProdutoEstoque(${prod.id})" title="Editar"><i class="fas fa-edit"></i></button>
            <button class="btn btn-sm btn-warning" onclick="abrirModalMovimentacaoEstoque(${prod.id}, '${escapeHtml(prod.nome)}')" title="Movimentar"><i class="fas fa-exchange-alt"></i></button>
            <button class="btn btn-sm btn-danger" onclick="excluirProdutoEstoque(${prod.id})" title="Excluir"><i class="fas fa-trash"></i></button>
        `;
        // Botão sincronizar ML se houver MLB cadastrado
        const mlbCodes = prod.dados_extra?.mlb_codes;
        if (mlbCodes && ((Array.isArray(mlbCodes) && mlbCodes.length > 0) || (typeof mlbCodes === 'string' && mlbCodes.trim() !== ''))) {
            botoes += `<button class="btn btn-sm btn-primary" onclick="sincronizarProdutoML(${prod.id})" title="Sincronizar estoque com ML"><i class="fab fa-mercadolibre"></i></button>`;
        }
        row.innerHTML = `
            <td>${prod.id}</td>
            <td><strong>${escapeHtml(prod.nome)}</strong><br><small class="text-muted">${escapeHtml(prod.categoria || 'sem categoria')}</small></td>
            <td>${escapeHtml(prod.sku)}</td>
            <td class="${prod.quantidade <= 5 ? 'text-danger fw-bold' : ''}">${prod.quantidade}</td>
            <td>R$ ${(prod.preco || 0).toFixed(2)}</td>
            <td><span title="${escapeHtml(atributosResumo)}" class="badge bg-info">${Object.keys(prod.dados_extra || {}).length} atributos</span></td>
            <td>${botoes}</td>
        `;
        tbody.appendChild(row);
    });
}

// ===== MODAL PRODUTO (COM CATEGORIA E CAMPOS DINÂMICOS) =====
function abrirModalProdutoEstoque(produto = null) {
    const modal = document.getElementById('modalProdutoEstoque');
    if (!modal) return;
    const title = document.getElementById('modalProdutoTitle');
    const idInput = document.getElementById('produtoId');
    const nomeInput = document.getElementById('produtoNome');
    const skuInput = document.getElementById('produtoSKU');
    const qtdInput = document.getElementById('produtoQuantidade');
    const precoInput = document.getElementById('produtoPreco');
    const descInput = document.getElementById('produtoDescricao');
    const categoriaSelect = document.getElementById('produtoCategoria');

    if (produto) {
        title.textContent = 'Editar Produto';
        idInput.value = produto.id;
        nomeInput.value = produto.nome;
        skuInput.value = produto.sku;
        qtdInput.value = produto.quantidade;
        precoInput.value = produto.preco || 0;
        descInput.value = produto.descricao || '';
        categoriaSelect.value = produto.categoria || '';
        gerarCamposDinamicos(produto.categoria);
        const dadosExtra = produto.dados_extra || {};
        Object.keys(dadosExtra).forEach(chave => {
            const campo = document.getElementById(`campo_${chave}`);
            if (campo) {
                if (campo.type === 'checkbox') campo.checked = dadosExtra[chave];
                else if (chave === 'mlb_codes' && Array.isArray(dadosExtra[chave])) {
                    campo.value = dadosExtra[chave].join(', ');
                } else {
                    campo.value = dadosExtra[chave];
                }
            }
        });
    } else {
        title.textContent = 'Novo Produto';
        idInput.value = '';
        nomeInput.value = '';
        skuInput.value = '';
        qtdInput.value = '0';
        precoInput.value = '0';
        descInput.value = '';
        categoriaSelect.value = '';
        gerarCamposDinamicos('');
    }

    categoriaSelect.onchange = function() {
        if (!produto || confirm('Alterar a categoria limpará os atributos específicos. Deseja continuar?')) {
            gerarCamposDinamicos(categoriaSelect.value);
        } else {
            categoriaSelect.value = produto.categoria;
        }
    };

    modal.classList.remove('hidden');
}

function fecharModalProdutoEstoque() {
    const modal = document.getElementById('modalProdutoEstoque');
    if (modal) modal.classList.add('hidden');
}

function gerarCamposDinamicos(categoria) {
    const container = document.getElementById('camposDinamicos');
    if (!container) return;
    container.innerHTML = '';

    const campos = camposPorCategoria[categoria];
    if (!campos || campos.length === 0) {
        container.innerHTML = '<div class="alert alert-info">Nenhum campo específico para esta categoria.</div>';
        return;
    }

    const grid = document.createElement('div');
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = '1fr 1fr';
    grid.style.gap = '10px';
    grid.style.marginTop = '10px';

    campos.forEach(campo => {
        const div = document.createElement('div');
        div.className = 'campo-dinamico';
        let html = `<label style="font-weight: 600; display: block; margin-bottom: 5px;">${campo.label} ${campo.obrigatorio ? '*' : ''}</label>`;

        if (campo.tipo === 'select') {
            html += `<select id="campo_${campo.nome}" class="form-control" ${campo.obrigatorio ? 'required' : ''}>`;
            html += `<option value="">Selecione...</option>`;
            campo.opcoes.forEach(op => {
                html += `<option value="${op}">${op}</option>`;
            });
            html += `</select>`;
        } else if (campo.tipo === 'checkbox') {
            html += `<div class="form-check">`;
            html += `<input type="checkbox" id="campo_${campo.nome}" class="form-check-input">`;
            html += `<label class="form-check-label" for="campo_${campo.nome}">${campo.label}</label>`;
            html += `</div>`;
        } else if (campo.tipo === 'textarea') {
            html += `<textarea id="campo_${campo.nome}" class="form-control" rows="${campo.rows || 2}" placeholder="${campo.placeholder || ''}"></textarea>`;
        } else {
            html += `<input type="${campo.tipo}" id="campo_${campo.nome}" class="form-control" 
                         step="${campo.step || ''}" min="${campo.min || ''}" 
                         placeholder="${campo.placeholder || ''}" ${campo.obrigatorio ? 'required' : ''}>`;
        }
        div.innerHTML = html;
        grid.appendChild(div);
    });
    container.appendChild(grid);
}

// ===== SALVAR PRODUTO (COM DADOS EXTRAS E SINCRONIZAÇÃO ML) =====
async function salvarProdutoEstoque() {
    const id = document.getElementById('produtoId').value;
    const nome = document.getElementById('produtoNome').value.trim();
    const sku = document.getElementById('produtoSKU').value.trim();
    const quantidade = parseInt(document.getElementById('produtoQuantidade').value) || 0;
    const preco = parseFloat(document.getElementById('produtoPreco').value) || 0;
    const descricao = document.getElementById('produtoDescricao').value.trim();
    const categoria = document.getElementById('produtoCategoria').value;

    if (!nome || !sku || !categoria) {
        if (window.showToast) showToast('Nome, SKU e Categoria são obrigatórios', 'warning');
        return;
    }

    // Coletar dados específicos da categoria
    const dadosExtra = {};
    const campos = camposPorCategoria[categoria] || [];
    for (const campo of campos) {
        const el = document.getElementById(`campo_${campo.nome}`);
        if (el) {
            if (campo.tipo === 'checkbox') {
                dadosExtra[campo.nome] = el.checked;
            } else if (campo.nome === 'mlb_codes' && el.value.trim()) {
                const valores = el.value.split(',').map(v => v.trim()).filter(v => v);
                dadosExtra[campo.nome] = valores;
            } else {
                let valor = el.value;
                if (campo.tipo === 'number' && valor !== '') valor = parseFloat(valor);
                dadosExtra[campo.nome] = valor;
            }
        }
    }

    const produtoData = {
        nome,
        sku,
        quantidade,
        preco,
        descricao,
        categoria,
        dados_extra: dadosExtra
    };

    try {
        let produtoSalvo;
        if (id) {
            const { data, error } = await window.supabaseClient
                .from('produtos_estoque')
                .update(produtoData)
                .eq('id', id)
                .select();
            if (error) throw error;
            produtoSalvo = data[0];
            if (window.showToast) showToast('Produto atualizado!', 'success');
        } else {
            const { data, error } = await window.supabaseClient
                .from('produtos_estoque')
                .insert([produtoData])
                .select();
            if (error) throw error;
            produtoSalvo = data[0];
            if (window.showToast) showToast('Produto adicionado!', 'success');
        }

        fecharModalProdutoEstoque();
        await carregarProdutosEstoque();

        // Sincronizar com ML se houver MLB cadastrado
        if (produtoSalvo && produtoSalvo.dados_extra?.mlb_codes && produtoSalvo.dados_extra.mlb_codes.length > 0) {
            setTimeout(() => {
                sincronizarEstoqueML(produtoSalvo);
            }, 500);
        }
    } catch (error) {
        console.error('Erro ao salvar produto:', error);
        if (window.showToast) showToast('Erro: ' + error.message, 'error');
    }
}

// ===== EDITAR, EXCLUIR =====
function editarProdutoEstoque(id) {
    const produto = produtosEstoque.find(p => p.id == id);
    if (produto) abrirModalProdutoEstoque(produto);
}

async function excluirProdutoEstoque(id) {
    if (!confirm('Tem certeza que deseja excluir este produto?')) return;
    try {
        const { error } = await window.supabaseClient
            .from('produtos_estoque')
            .delete()
            .eq('id', id);
        if (error) throw error;
        if (window.showToast) showToast('Produto excluído', 'success');
        await carregarProdutosEstoque();
    } catch (error) {
        console.error(error);
        if (window.showToast) showToast('Erro ao excluir', 'error');
    }
}

// ===== MOVIMENTAÇÃO DE ESTOQUE =====
let produtoMovimentacaoAtual = null;

function abrirModalMovimentacaoEstoque(id, nome) {
    produtoMovimentacaoAtual = id;
    document.getElementById('movProdutoId').value = id;
    document.getElementById('movProdutoNome').textContent = nome;
    document.getElementById('movQuantidade').value = '1';
    document.getElementById('movTipo').value = 'entrada';
    document.getElementById('modalMovimentacaoEstoque').classList.remove('hidden');
}

function fecharModalMovimentacaoEstoque() {
    document.getElementById('modalMovimentacaoEstoque').classList.add('hidden');
    produtoMovimentacaoAtual = null;
}

async function confirmarMovimentacaoEstoque() {
    const id = document.getElementById('movProdutoId').value;
    const tipo = document.getElementById('movTipo').value;
    let quantidade = parseInt(document.getElementById('movQuantidade').value);
    if (isNaN(quantidade) || quantidade <= 0) {
        if (window.showToast) showToast('Quantidade inválida', 'warning');
        return;
    }

    const produto = produtosEstoque.find(p => p.id == id);
    if (!produto) return;

    let novaQuantidade = produto.quantidade;
    if (tipo === 'entrada') {
        novaQuantidade += quantidade;
    } else {
        if (produto.quantidade < quantidade) {
            if (window.showToast) showToast('Estoque insuficiente!', 'error');
            return;
        }
        novaQuantidade -= quantidade;
    }

    try {
        const { error } = await window.supabaseClient
            .from('produtos_estoque')
            .update({ quantidade: novaQuantidade })
            .eq('id', id);
        if (error) throw error;
        if (window.showToast) showToast(`Movimentação: ${tipo === 'entrada' ? '+' : '-'}${quantidade}`, 'success');
        fecharModalMovimentacaoEstoque();
        await carregarProdutosEstoque();

        // Após movimentar, sincronizar com ML se houver MLB
        const produtoAtualizado = produtosEstoque.find(p => p.id == id);
        if (produtoAtualizado && produtoAtualizado.dados_extra?.mlb_codes && produtoAtualizado.dados_extra.mlb_codes.length > 0) {
            setTimeout(() => {
                sincronizarEstoqueML(produtoAtualizado);
            }, 500);
        }
    } catch (error) {
        console.error(error);
        if (window.showToast) showToast('Erro ao movimentar', 'error');
    }
}

// ===== SINCRONIZAÇÃO FINAL COM MERCADO LIVRE =====
function encontrarVariacaoPorSKU(item, skuProduto) {
    if (!item.variations || item.variations.length === 0) return null;

    const skuAlvo = (skuProduto || '').toLowerCase().trim();
    console.log(`🔍 Buscando variação para SKU: "${skuAlvo}"`);

    const normalizar = (str) => (str || '').toLowerCase().trim().replace(/^0+/, '');
    const skuAlvoNorm = normalizar(skuAlvo);

    for (const v of item.variations) {
        let identificador = extrairSkuDaVariacao(v);
        if (identificador) {
            let idNorm = normalizar(identificador);
            // Remove prefixo de 3 dígitos (ex: "00100268..." -> "00268...")
            if (/^\d{3}/.test(idNorm)) {
                const semPrefixo = idNorm.replace(/^\d{3}/, '');
                if (semPrefixo === skuAlvoNorm) {
                    console.log(`✅ Match após remover prefixo: ${identificador}`);
                    return v;
                }
            }
            if (idNorm === skuAlvoNorm) {
                console.log(`✅ Match exato: ${identificador}`);
                return v;
            }
            if (idNorm.includes(skuAlvoNorm) || skuAlvoNorm.includes(idNorm)) {
                console.log(`✅ Match por inclusão: ${identificador}`);
                return v;
            }
        }
        // Fallback por tamanho (opcional, mantido)
        const numeros = skuAlvo.match(/\d+/g);
        const tamanho = numeros?.find(n => n.length === 3 && n !== '000');
        if (tamanho && v.attribute_combinations) {
            const match = v.attribute_combinations.some(attr =>
                (attr.name === 'Tamanho' || attr.name === 'Size') &&
                String(attr.value_name) === tamanho
            );
            if (match) {
                console.log(`✅ Match por tamanho ${tamanho}`);
                return v;
            }
        }
    }
    console.warn(`⚠️ Nenhuma variação compatível. Usando a primeira.`);
    return item.variations[0];
}

function extrairSkuDaVariacao(variacao) {
    // 1. Prioriza seller_custom_field
    if (variacao.seller_custom_field) {
        return variacao.seller_custom_field;
    }
    // 2. Procura no array 'attributes' por SELLER_SKU
    if (variacao.attributes && Array.isArray(variacao.attributes)) {
        const skuAttr = variacao.attributes.find(attr => attr.id === 'SELLER_SKU');
        if (skuAttr && skuAttr.value_name) {
            return skuAttr.value_name;
        }
    }
    return null;
}

// ===== FUNÇÃO PRINCIPAL DE SINCRONIZAÇÃO (MODIFICADA) =====
async function sincronizarEstoqueML(produto) {
    let mlbCodes = produto.dados_extra?.mlb_codes;
    if (!mlbCodes || (Array.isArray(mlbCodes) && mlbCodes.length === 0)) {
        console.log('ℹ️ Produto sem MLB cadastrado.');
        return { success: true, results: [] };
    }
    let codigos = Array.isArray(mlbCodes) ? mlbCodes : mlbCodes.split(',').map(s => s.trim()).filter(c => c);
    if (codigos.length === 0) return { success: true, results: [] };

    let token = localStorage.getItem('ml_access_token');
    if (!token) {
        showToast('❌ Token ML não encontrado.', 'error');
        return { success: false, error: 'Token não disponível' };
    }

    const WORKER_URL = window.WORKER_URL || 'https://purple-bonus-3b1c.andmiotto1998.workers.dev';
    const results = [];
    const quantidade = produto.quantidade;
    const skuProduto = produto.sku;

    for (const codigo of codigos) {
        const itemId = codigo.startsWith('MLB') ? codigo : `MLB${codigo}`;
        const apiUrl = `https://api.mercadolibre.com/items/${itemId}`;
        const proxyUrl = `${WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(apiUrl)}&token=${encodeURIComponent(token)}`;

        try {
            console.log(`\n🔍 Obtendo ${itemId}...`);
            const getRes = await fetch(proxyUrl);
            if (!getRes.ok) throw new Error(`GET falhou: ${getRes.status}`);
            const item = await getRes.json();

            // 🔥 Buscar detalhes de cada variação individualmente
            if (item.variations && item.variations.length > 0) {
                console.log(`📦 Buscando detalhes de ${item.variations.length} variações...`);
                for (let i = 0; i < item.variations.length; i++) {
                    const v = item.variations[i];
                    try {
                        const variationUrl = `https://api.mercadolibre.com/items/${item.id}/variations/${v.id}?include_attributes=all`;
                        const varProxy = `${WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(variationUrl)}&token=${encodeURIComponent(token)}`;
                        const varRes = await fetch(varProxy);
                        if (varRes.ok) {
                            const varDetails = await varRes.json();
                            item.variations[i] = {
                                ...v,
                                seller_custom_field: varDetails.seller_custom_field || v.seller_custom_field,
                                attributes: varDetails.attributes || v.attributes,
                                attribute_combinations: varDetails.attribute_combinations || v.attribute_combinations
                            };
                            const skuExtraido = extrairSkuDaVariacao(item.variations[i]);
                            if (skuExtraido) console.log(`   Variação ${v.id}: SKU = ${skuExtraido}`);
                        } else {
                            console.warn(`   ⚠️ Não foi possível obter detalhes da variação ${v.id}`);
                        }
                    } catch (err) {
                        console.warn(`   ⚠️ Erro ao buscar variação ${v.id}:`, err);
                    }
                    await new Promise(r => setTimeout(r, 100));
                }
            }

            // Verifica oferta ativa
            if (item.tags?.includes('has_price_by_rule')) {
                console.warn(`⚠️ Item ${itemId} tem preço automático.`);
                results.push({ codigo: itemId, success: false, reason: 'oferta_ativa' });
                continue;
            }

            // --- FULL (inventory_id) ---
            const isFulfillment = item.tags?.includes('fulfillment') || 
                      item.shipping?.logistic_type === 'fulfillment' ||
                      item.logistic_type === 'fulfillment';

        if (item.inventory_id && isFulfillment) {
            console.log(`📦 FULL inventory ${item.inventory_id}`);
            const invUrl = `https://api.mercadolibre.com/inventories/${item.inventory_id}/stock`;
            const invProxy = `${WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(invUrl)}&token=${encodeURIComponent(token)}`;
            const invRes = await fetch(invProxy, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ total: { available_quantity: quantidade } })
            });
            if (invRes.ok) {
                console.log(`✅ FULL atualizado`);
                results.push({ codigo: itemId, success: true, method: 'inventory' });
            } else {
                const errorText = await invRes.text();
                console.error(`❌ FULL falhou: ${invRes.status} - ${errorText}`);
                results.push({ codigo: itemId, success: false, error: `FULL ${invRes.status}` });
            }
            continue;
        } else if (item.inventory_id && !isFulfillment) {
            console.log(`⚠️ inventory_id presente, mas item não é FULL. Ignorando e tratando como normal.`);
        }

            // --- COM VARIAÇÕES ---
if (item.variations && item.variations.length > 0) {
    const variacaoAlvo = encontrarVariacaoPorSKU(item, skuProduto);
    if (!variacaoAlvo) {
        console.warn(`⚠️ Nenhuma variação para ${itemId}`);
        results.push({ codigo: itemId, success: false, reason: 'sem_variacao' });
        continue;
    }
    const varId = variacaoAlvo.id;
    const targetUrl = `https://api.mercadolibre.com/items/${itemId}/variations/${varId}`;
    const putProxy = `${WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(targetUrl)}&token=${encodeURIComponent(token)}`;
    console.log(`📦 Atualizando variação ${varId} para ${quantidade}`);
    
    const putRes = await fetch(putProxy, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ available_quantity: quantidade })
    });
    const responseText = await putRes.text();
    console.log(`📡 Resposta da variação (status ${putRes.status}):`, responseText);
    
    let respData;
    try { respData = JSON.parse(responseText); } catch(e) { respData = { raw: responseText }; }
    
    if (putRes.ok) {
        // A resposta pode ser um array com todas as variações
        let newQty = null;
        if (Array.isArray(respData)) {
            const updatedVar = respData.find(v => v.id == varId);
            if (updatedVar) newQty = updatedVar.available_quantity;
        } else {
            newQty = respData.available_quantity;
        }
        
        if (newQty === quantidade) {
            console.log(`✅ Variação ${varId} atualizada para ${newQty}`);
            results.push({ codigo: itemId, success: true, variation_id: varId });
        } else {
            console.warn(`⚠️ Resposta OK, mas estoque não mudou. Esperado: ${quantidade}, Recebido: ${newQty}`);
            results.push({ codigo: itemId, success: false, reason: 'estoque_ignorado', details: respData });
        }
    } else {
        console.error(`❌ Falha na variação: ${putRes.status} - ${responseText}`);
        results.push({ codigo: itemId, success: false, error: `HTTP ${putRes.status}` });
    }
}
            // --- SEM VARIAÇÃO ---
            else {
                console.log(`📦 Atualizando item principal`);
                const putRes = await fetch(proxyUrl, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ available_quantity: quantidade })
                });
                const responseText = await putRes.text();
                let respData;
                try { respData = JSON.parse(responseText); } catch(e) { respData = { raw: responseText }; }
                if (putRes.ok && respData.available_quantity === quantidade) {
                    console.log(`✅ Item ${itemId} atualizado`);
                    results.push({ codigo: itemId, success: true });
                } else {
                    console.warn(`⚠️ Falha item: ${putRes.status}`);
                    results.push({ codigo: itemId, success: false, reason: 'estoque_ignorado', details: respData });
                }
            }
        } catch (error) {
            console.error(`❌ Erro ${itemId}:`, error);
            results.push({ codigo: itemId, success: false, error: error.message });
        }
    }

    const sucessos = results.filter(r => r.success).length;
    const falhas = results.filter(r => !r.success).length;
    if (sucessos) showToast(`✅ ${sucessos} anúncio(s) sincronizado(s)`, 'success');
    if (falhas) showToast(`⚠️ ${falhas} anúncio(s) falharam. Verifique console.`, 'warning');
    return { success: falhas === 0, results };
}

window.sincronizarProdutoML = async function(produtoId) {
    const produto = produtosEstoque.find(p => p.id == produtoId);
    if (!produto) {
        if (window.showToast) showToast('Produto não encontrado', 'error');
        return;
    }
    if (window.showToast) showToast(`🔄 Sincronizando estoque (${produto.quantidade}) com ML...`, 'info');
    await sincronizarEstoqueML(produto);
};

// ===== UTILITÁRIOS =====
function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

// ===== INICIALIZAÇÃO (verifica tabela) =====
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(async () => {
        if (!window.supabaseClient) return;
        try {
            const { error } = await window.supabaseClient
                .from('produtos_estoque')
                .select('id')
                .limit(1);
            if (error && error.message.includes('does not exist')) {
                console.warn('Tabela produtos_estoque não existe. Execute o SQL de criação.');
            }
        } catch(e) {}
    }, 2000);
});