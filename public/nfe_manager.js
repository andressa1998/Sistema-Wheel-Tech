// nfe_manager.js - Versão completa com edição de produtos, fallback de APIs e integração ML
window.showToast = window.showToast || showToast;

// Configurações globais
if (!window.WORKER_URL) window.WORKER_URL = 'https://purple-bonus-3b1c.andmiotto1998.workers.dev';
if (!window.API_BASE_URL) window.API_BASE_URL = 'https://sistema-wheel-tech.onrender.com';

let vendasPendentes = [];
let pendingEmitOrderId = null;
let produtosEditados = [];
let vendaIdParaEdicao = null;

// ===== VERIFICAR SE É FULL (versão robusta) =====
function isFullByAnyField(item) {
    if (item.shipping && item.shipping.logistic_type) {
        const logisticType = item.shipping.logistic_type.toLowerCase();
        if (logisticType === 'fulfillment' || logisticType.includes('full')) {
            return true;
        }
    }

    if (item.tags && Array.isArray(item.tags)) {
        const hasFulfillmentTag = item.tags.some(tag => 
            tag.toLowerCase() === 'fulfillment' || tag.toLowerCase().includes('full')
        );
        if (hasFulfillmentTag) return true;
    }

    const text = `${item.titulo || ''} ${item.mlb || ''} ${item.id || ''} ${item.shipping?.logistic_type || ''} ${item.tags?.join(' ') || ''}`.toLowerCase();
    return /full|fulfillment/.test(text);
}

window.isFullByAnyField = isFullByAnyField;

function mapearUF(nomeEstado) {
    if (!nomeEstado) return '';
    
    const estado = nomeEstado.toString().trim().toLowerCase();
    
    const mapa = {
        'acre': 'AC', 'alagoas': 'AL', 'amapá': 'AP', 'amazonas': 'AM',
        'bahia': 'BA', 'ceará': 'CE', 'distrito federal': 'DF', 'espírito santo': 'ES',
        'goiás': 'GO', 'maranhão': 'MA', 'mato grosso': 'MT', 'mato grosso do sul': 'MS',
        'minas gerais': 'MG', 'pará': 'PA', 'paraíba': 'PB', 'paraná': 'PR',
        'pernambuco': 'PE', 'piauí': 'PI', 'rio de janeiro': 'RJ', 'rio grande do norte': 'RN',
        'rio grande do sul': 'RS', 'rondônia': 'RO', 'roraima': 'RR', 'santa catarina': 'SC',
        'são paulo': 'SP', 'sergipe': 'SE', 'tocantins': 'TO',
        'sao paulo': 'SP', 'rio de janeiro': 'RJ', 'rio grande do sul': 'RS',
        'santa catarina': 'SC', 'mato grosso do sul': 'MS', 'espirito santo': 'ES',
        'distrito federal': 'DF', 'minas gerais': 'MG', 'para': 'PA',
        'pernambuco': 'PE', 'parana': 'PR', 'maranhao': 'MA', 'amazonas': 'AM',
        'bahia': 'BA', 'ceara': 'CE', 'goias': 'GO', 'mato grosso': 'MT'
    };
    
    if (mapa[estado]) return mapa[estado];
    
    if (estado.length === 2 && estado.match(/^[a-z]{2}$/)) {
        return estado.toUpperCase();
    }
    
    console.warn(`⚠️ UF não reconhecida: "${nomeEstado}"`);
    return '';
}

// =========================================================
// FUNÇÃO PARA BUSCAR VALOR EXATO DO MERCADO PAGO
// =========================================================

async function buscarValorExatoPagamento(orderId) {
    try {
        console.log(`🔍 Buscando valor exato do pagamento para venda ${orderId}...`);
        
        let token = localStorage.getItem('ml_access_token');
        if (!token && typeof window.getValidToken === 'function') {
            const tokenData = await window.getValidToken();
            token = tokenData?.access_token;
        }
        if (!token) {
            console.warn('⚠️ Token ML não disponível');
            return null;
        }

        const orderUrl = `https://api.mercadolibre.com/orders/${orderId}`;
        const orderProxyUrl = `${window.WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(orderUrl)}&token=${encodeURIComponent(token)}`;
        const orderResponse = await fetch(orderProxyUrl);
        
        if (!orderResponse.ok) {
            console.warn(`⚠️ Não foi possível buscar a venda ${orderId}: ${orderResponse.status}`);
            return null;
        }
        
        const orderData = await orderResponse.json();
        console.log('📦 Dados da venda:', orderData);
        
        let paymentId = null;
        if (orderData.payments && orderData.payments.length > 0) {
            paymentId = orderData.payments[0].id;
        } else if (orderData.payment_id) {
            paymentId = orderData.payment_id;
        } else if (orderData.payment_ids && orderData.payment_ids.length > 0) {
            paymentId = orderData.payment_ids[0];
        }
        
        if (!paymentId) {
            console.warn(`⚠️ Não foi possível encontrar o ID do pagamento para venda ${orderId}`);
            return null;
        }
        
        console.log(`💳 ID do pagamento: ${paymentId}`);
        
        const paymentUrl = `https://api.mercadopago.com/v1/payments/${paymentId}`;
        const paymentProxyUrl = `${window.WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(paymentUrl)}&token=${encodeURIComponent(token)}`;
        const paymentResponse = await fetch(paymentProxyUrl);
        
        if (!paymentResponse.ok) {
            console.warn(`⚠️ Erro ao buscar pagamento ${paymentId}: ${paymentResponse.status}`);
            return null;
        }
        
        const paymentData = await paymentResponse.json();
        console.log('💳 Dados do pagamento (Mercado Pago):', paymentData);
        
        let totalPago = parseFloat(paymentData.transaction_amount || paymentData.total_amount || 0);
        let descontoCupom = parseFloat(paymentData.coupon_amount || 0);
        let valorFrete = 0;
        
        // CALCULAR O VALOR DO PRODUTO: Total Pago - Desconto do Cupom
        let valorProduto = totalPago - descontoCupom;
        
        if (paymentData.additional_info?.shipments?.shipping_amount) {
            valorFrete = parseFloat(paymentData.additional_info.shipments.shipping_amount) || 0;
        } else if (paymentData.shipping_amount) {
            valorFrete = parseFloat(paymentData.shipping_amount) || 0;
        } else if (orderData.shipping?.cost) {
            valorFrete = parseFloat(orderData.shipping.cost) || 0;
        }
        
        const totalSemFrete = totalPago - valorFrete;
        if (valorProduto > totalSemFrete) {
            valorProduto = totalSemFrete;
        }
        
        console.log(`💰 VALORES EXATOS (Mercado Pago):`);
        console.log(`   💳 Total pago: R$ ${totalPago.toFixed(2)}`);
        console.log(`   🎫 Desconto cupom: R$ ${descontoCupom.toFixed(2)}`);
        console.log(`   📦 Valor do frete: R$ ${valorFrete.toFixed(2)}`);
        console.log(`   ✅ Valor do produto: R$ ${valorProduto.toFixed(2)}`);
        
        return {
            valor_produto: valorProduto,
            valor_frete: valorFrete,
            total_pago: totalPago,
            payment_id: paymentId,
            desconto_cupom: descontoCupom
        };
        
    } catch (error) {
        console.error(`❌ Erro ao buscar valor no Mercado Pago:`, error);
        return null;
    }
}

async function abrirModalEdicaoProdutos(orderId) {
    console.log('🔧 Abrindo edição de produtos para venda:', orderId);
    vendaIdParaEdicao = orderId;

    let token = localStorage.getItem('ml_access_token');
    if (!token && typeof window.getValidToken === 'function') {
        const tokenData = await window.getValidToken();
        token = tokenData?.access_token;
    }
    if (!token) {
        showToast('Token ML não disponível', 'error');
        return;
    }

    try {
        // ===== BUSCAR O VALOR CORRETO DO MERCADO PAGO =====
        const dadosPagamento = await buscarValorExatoPagamento(orderId);
        console.log('📊 Dados do pagamento para edição:', dadosPagamento);

        // Buscar a venda para obter os itens
        const url = `https://api.mercadolibre.com/orders/${orderId}`;
        const proxyUrl = `${window.WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(url)}&token=${encodeURIComponent(token)}`;
        const response = await fetch(proxyUrl);
        if (!response.ok) throw new Error('Erro ao buscar venda');
        const venda = await response.json();

        const items = venda.order_items || [];
        if (items.length === 0) {
            showToast('Nenhum produto encontrado', 'warning');
            return;
        }

        // ===== CALCULAR VALOR UNITÁRIO CORRETO =====
        let valorTotalProduto = 0;
        let quantidadeTotal = 0;
        
        // Calcular quantidade total e valor total do produto (do Mercado Pago)
        if (dadosPagamento && dadosPagamento.valor_produto > 0) {
            valorTotalProduto = dadosPagamento.valor_produto;
            // Calcular quantidade total de itens
            for (const item of items) {
                quantidadeTotal += item.quantity || 1;
            }
            console.log(`💰 Valor total do produto (Mercado Pago): R$ ${valorTotalProduto.toFixed(2)}`);
            console.log(`📦 Quantidade total de itens: ${quantidadeTotal}`);
        } else {
            // Fallback: usar o valor da venda
            for (const item of items) {
                const valorUnitario = item.unit_price || 0;
                const quantidade = item.quantity || 1;
                valorTotalProduto += valorUnitario * quantidade;
                quantidadeTotal += quantidade;
            }
            console.log(`📦 Usando fallback: valor total = R$ ${valorTotalProduto.toFixed(2)}`);
        }

        // Buscar NCM salvos por SKU
        let ncmPorSku = {};
        try {
            const { data, error } = await window.supabaseClient
                .from('produto_ncm')
                .select('sku, ncm')
                .in('sku', items.map(item => item.item.seller_sku || 'SEM_SKU'));
            if (!error && data) {
                data.forEach(row => ncmPorSku[row.sku] = row.ncm);
            }
        } catch (e) {
            console.warn('Erro ao buscar NCM:', e);
        }

        // ===== CRIAR LISTA DE PRODUTOS COM VALORES CORRETOS =====
        produtosEditados = items.map((item, index) => {
            const sku = item.item.seller_sku || 'SEM_SKU';
            const ncmSalvo = ncmPorSku[sku] || '87149990';
            const quantidade = item.quantity || 1;
            
            // Calcular o valor unitário proporcional
            let valorUnitario = 0;
            if (quantidadeTotal > 0 && valorTotalProduto > 0) {
                // Distribuir o valor total proporcionalmente pela quantidade
                valorUnitario = (valorTotalProduto / quantidadeTotal) * quantidade;
            } else {
                // Fallback: usar o unit_price da venda
                valorUnitario = item.unit_price || 0;
            }
            
            console.log(`📊 Produto ${index + 1}: ${item.item.title}`);
            console.log(`   Quantidade: ${quantidade}`);
            console.log(`   Valor unitário calculado: R$ ${valorUnitario.toFixed(2)}`);
            console.log(`   SKU: ${sku}`);
            
            return {
                nome: item.item.title,
                quantidade: quantidade,
                valor_unitario: valorUnitario,
                sku: sku,
                ncm: ncmSalvo,
                // Guardar o valor original para referência
                _valor_original: item.unit_price || 0
            };
        });

        // ===== VERIFICAR SE O VALOR TOTAL BATE =====
        const totalCalculado = produtosEditados.reduce((acc, p) => acc + (p.valor_unitario * p.quantidade), 0);
        console.log(`💰 Total calculado: R$ ${totalCalculado.toFixed(2)}`);
        console.log(`💰 Total esperado (Mercado Pago): R$ ${valorTotalProduto.toFixed(2)}`);
        
        if (Math.abs(totalCalculado - valorTotalProduto) > 0.01 && valorTotalProduto > 0) {
            console.warn(`⚠️ Diferença no valor total. Ajustando...`);
            // Ajustar o último item para compensar diferenças de arredondamento
            const diff = valorTotalProduto - totalCalculado;
            if (produtosEditados.length > 0) {
                const ultimoItem = produtosEditados[produtosEditados.length - 1];
                ultimoItem.valor_unitario += diff / ultimoItem.quantidade;
                console.log(`🔄 Ajuste aplicado no último item: +R$ ${(diff / ultimoItem.quantidade).toFixed(2)}`);
            }
        }

        // Criar modal
        const modalHTML = `
        <div id="modalEdicaoProdutos" class="modal" style="display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,0.5); z-index:9999;">
            <div class="modal-content" style="max-width:900px; width:95%; max-height:90vh; overflow-y:auto; background:white; padding:25px; border-radius:8px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
                    <h3 style="margin:0;"><i class="fas fa-edit"></i> Editar Produtos</h3>
                    <button onclick="fecharModalEdicaoProdutos()" style="background:none; border:none; font-size:24px; cursor:pointer;">&times;</button>
                </div>
                <p style="color:#6c757d; margin-bottom:15px;">Ajuste a quantidade, valor unitário e NCM de cada produto. O total será recalculado.</p>
                <div class="table-responsive">
                    <table class="table table-striped">
                        <thead>
                            <tr>
                                <th>Produto</th>
                                <th style="width:100px;">Qtd</th>
                                <th style="width:130px;">Valor Unit.</th>
                                <th style="width:130px;">NCM</th>
                                <th style="width:110px;">Subtotal</th>
                            </tr>
                        </thead>
                        <tbody id="produtosEditaveisBody">
                            ${produtosEditados.map((p, index) => `
                                <tr>
                                    <td><span title="${p.nome}">${p.nome.length > 40 ? p.nome.substring(0,40)+'...' : p.nome}</span></td>
                                    <td>
                                        <input type="number" class="form-control form-control-sm qtd-produto" 
                                               data-index="${index}" value="${p.quantidade}" min="0.01" step="0.01">
                                    </td>
                                    <td>
                                        <input type="number" class="form-control form-control-sm valor-produto" 
                                               data-index="${index}" value="${p.valor_unitario}" min="0" step="0.01">
                                    </td>
                                    <td>
                                        <input type="text" class="form-control form-control-sm ncm-produto" 
                                               data-index="${index}" value="${p.ncm}" placeholder="NCM" maxlength="8">
                                    </td>
                                    <td class="subtotal-produto">R$ ${(p.quantidade * p.valor_unitario).toFixed(2)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                        <tfoot>
                            <tr style="font-weight:bold; background:#f8f9fa;">
                                <td colspan="3" style="text-align:right;">Total da Nota:</td>
                                <td id="totalGeralProdutos" style="text-align:right;" colspan="2">R$ ${produtosEditados.reduce((acc, p) => acc + (p.quantidade * p.valor_unitario), 0).toFixed(2)}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>

                <div class="d-flex justify-content-end gap-2 mt-3">
                    <button class="btn btn-secondary" onclick="fecharModalEdicaoProdutos()">Cancelar</button>
                    <button class="btn btn-success" id="confirmarProdutosFinalBtn"><i class="fas fa-check"></i> Confirmar e Emitir NF-e</button>
                </div>
            </div>
        </div>`;

        const modalContainer = document.createElement('div');
        modalContainer.innerHTML = modalHTML;
        document.body.appendChild(modalContainer.firstElementChild);

        // Event listeners para recalcular subtotal e atualizar NCM
        document.querySelectorAll('.qtd-produto, .valor-produto, .ncm-produto').forEach(input => {
            input.addEventListener('input', function() {
                const idx = parseInt(this.dataset.index);
                const row = this.closest('tr');
                const qtdInput = row.querySelector('.qtd-produto');
                const valorInput = row.querySelector('.valor-produto');
                const subtotalCell = row.querySelector('.subtotal-produto');
                const ncmInput = row.querySelector('.ncm-produto');
                const qtd = parseFloat(qtdInput.value) || 0;
                const valor = parseFloat(valorInput.value) || 0;
                const subtotal = qtd * valor;
                subtotalCell.textContent = `R$ ${subtotal.toFixed(2)}`;
                produtosEditados[idx].quantidade = qtd;
                produtosEditados[idx].valor_unitario = valor;
                produtosEditados[idx].ncm = ncmInput.value.trim() || '87149990';
                recalcularTotalGeral();
            });
        });

        function recalcularTotalGeral() {
            let total = 0;
            produtosEditados.forEach(p => total += p.quantidade * p.valor_unitario);
            const totalCell = document.getElementById('totalGeralProdutos');
            if (totalCell) totalCell.textContent = `R$ ${total.toFixed(2)}`;
        }

        // Botão confirmar
        document.getElementById('confirmarProdutosFinalBtn').addEventListener('click', function() {
            confirmarProdutosEditados();
        });

    } catch (error) {
        console.error('Erro ao carregar produtos:', error);
        showToast('Erro ao carregar produtos: ' + error.message, 'error');
    }
}

function fecharModalEdicaoProdutos() {
    const modal = document.getElementById('modalEdicaoProdutos');
    if (modal) modal.remove();
    console.log('✅ Modal de edição removido');
}

// =========================================================
// CONFIRMAR PRODUTOS EDITADOS E EMITIR NF-e
// =========================================================

async function confirmarProdutosEditados() {
    console.log('🔵 [confirmarProdutosEditados] FUNÇÃO INICIADA');
    console.log('🔵 vendaIdParaEdicao:', vendaIdParaEdicao);
    console.log('🔵 produtosEditados:', produtosEditados);
    
    const vendaId = vendaIdParaEdicao;
    if (!vendaId) {
        console.log('❌ vendaIdParaEdicao está vazio!');
        showToast('❌ ID da venda não encontrado', 'error');
        return;
    }

    if (!produtosEditados || produtosEditados.length === 0) {
        console.log('❌ produtosEditados está vazio!');
        showToast('❌ Nenhum produto para emitir', 'error');
        return;
    }

    console.log(`✅ Venda ID: ${vendaId}`);
    console.log(`✅ ${produtosEditados.length} produtos para emitir`);

    try {
        // ===== SALVAR NCMs NO BANCO =====
        console.log('💾 Salvando NCMs...');
        const ncmPromises = produtosEditados.map(p => {
            if (p.sku && p.sku !== 'SEM_SKU' && p.ncm) {
                return window.supabaseClient
                    .from('produto_ncm')
                    .upsert({ sku: p.sku, ncm: p.ncm }, { onConflict: 'sku' });
            }
            return Promise.resolve();
        });
        await Promise.all(ncmPromises);
        console.log('✅ NCMs salvos com sucesso');

        // ===== PREPARAR PRODUTOS PARA EMISSÃO =====
        window.produtosParaEmissao = produtosEditados.map(p => ({
            nome: p.nome || 'Produto',
            quantidade: p.quantidade || 1,
            valor_unitario: p.valor_unitario || 0,
            sku: p.sku || 'SEM_SKU',
            ncm: p.ncm || '87149990'
        }));

        console.log('📤 Produtos para emissão:', window.produtosParaEmissao);

        // ===== FECHAR MODAL DE EDIÇÃO =====
        fecharModalEdicaoProdutos();
        console.log('✅ Modal de edição fechado');

        // ===== 🔥 DEFINIR pendingEmitOrderId =====
        // IMPORTANTE: Definir antes de chamar emitirNFEParaVenda
        pendingEmitOrderId = vendaId;
        console.log(`✅ pendingEmitOrderId DEFINIDO: ${pendingEmitOrderId}`);

        // ===== CHAMAR EMISSÃO =====
        console.log(`📤 Chamando emitirNFEParaVenda para: ${vendaId}`);
        await emitirNFEParaVenda(vendaId);

        // ===== LIMPAR =====
        vendaIdParaEdicao = null;
        produtosEditados = [];
        console.log('✅ Processo concluído com sucesso');

    } catch (error) {
        console.error('❌ Erro em confirmarProdutosEditados:', error);
        showToast('❌ Erro ao confirmar produtos: ' + error.message, 'error');
        // Restaurar estado em caso de erro
        vendaIdParaEdicao = null;
        produtosEditados = [];
    }
}

// ===================== NCM POR SKU =====================
async function buscarNCMporSKU(sku) {
    if (!sku || sku === 'SEM_SKU' || sku === 'N/A') return null;
    try {
        const { data, error } = await window.supabaseClient
            .from('produto_ncm')
            .select('ncm')
            .eq('sku', sku)
            .maybeSingle();
        if (error) throw error;
        return data?.ncm || null;
    } catch (error) {
        console.warn(`⚠️ Erro ao buscar NCM para SKU ${sku}:`, error.message);
        return null;
    }
}

async function salvarNCMporSKU(sku, ncm) {
    if (!sku || sku === 'SEM_SKU' || sku === 'N/A' || !ncm) return;
    try {
        const { error } = await window.supabaseClient
            .from('produto_ncm')
            .upsert({ sku, ncm }, { onConflict: 'sku' });
        if (error) throw error;
        console.log(`✅ NCM ${ncm} salvo para SKU ${sku}`);
    } catch (error) {
        console.warn(`⚠️ Erro ao salvar NCM para SKU ${sku}:`, error.message);
    }
}

// =========================================================
// FUNÇÕES AUXILIARES PARA BUSCA DE SKU (MESMA LÓGICA DO ESTOQUE)
// =========================================================

// ===== FUNÇÃO PARA EXTRAIR BASE DO SKU DO SISTEMA (NÃO REMOVE NADA) =====
function extrairSkuBaseSistema(sku) {
    if (!sku) return '';
    const base = sku.trim().substring(0, 8).toUpperCase();
    console.log(`📊 [SISTEMA] SKU: "${sku}" → Base: "${base}"`);
    return base;
}

// ===== FUNÇÃO PARA EXTRAIR BASE DO SKU DO ANÚNCIO (REMOVE 3 DÍGITOS) =====
function extrairSkuBaseAnuncio(sku) {
    if (!sku) return '';
    
    let skuLimpo = sku.trim();
    let skuReal = skuLimpo;
    
    const match = skuLimpo.match(/^\d{3}(.+)$/);
    if (match) {
        skuReal = match[1];
        console.log(`📊 [ANÚNCIO] SKU: "${skuLimpo}" → remove 3 dígitos → "${skuReal}"`);
    }
    
    const base = skuReal.substring(0, 8).toUpperCase();
    console.log(`📊 [ANÚNCIO] Base: "${base}"`);
    return base;
}

// ===== BUSCAR PRODUTO POR SKU (USANDO A LÓGICA DE 8 CARACTERES) =====
async function buscarProdutoPorSku(sku) {
    if (!sku) return null;
    
    const skuLimpo = sku.trim();
    console.log(`🔍 Buscando produto para SKU: "${skuLimpo}"`);
    
    // 🔥 EXTRAI A BASE DE 8 CARACTERES DO SKU (NÃO REMOVE NADA)
    const skuBase = extrairSkuBaseSistema(skuLimpo);
    console.log(`🔍 Buscando pela base de 8 caracteres: "${skuBase}"`);
    
    // ===== 1ª TENTATIVA: BUSCAR NO CACHE LOCAL PELA BASE =====
    try {
        if (typeof produtosEstoque !== 'undefined' && Array.isArray(produtosEstoque)) {
            const encontrado = produtosEstoque.find(p => {
                const baseSistema = extrairSkuBaseSistema(p.sku);
                return baseSistema === skuBase;
            });
            if (encontrado) {
                console.log(`✅ Produto encontrado no cache pela base: ${encontrado.sku}`);
                return encontrado;
            }
        }
    } catch (e) {
        console.warn('⚠️ Erro ao buscar no cache:', e);
    }
    
    // ===== 2ª TENTATIVA: BUSCAR NO SUPABASE PELA BASE =====
    try {
        if (window.supabaseClient) {
            // Buscar todos os produtos e comparar pela base
            const { data: produtos, error: prodsError } = await window.supabaseClient
                .from('produtos_estoque')
                .select('id, quantidade, nome, sku, bloquear_sync_ml, mlb_codes, dados_extra, preco, categoria');
            
            if (!prodsError && produtos && produtos.length > 0) {
                const encontrado = produtos.find(p => {
                    const baseSistema = extrairSkuBaseSistema(p.sku);
                    return baseSistema === skuBase;
                });
                if (encontrado) {
                    console.log(`✅ Produto encontrado no Supabase pela base: ${encontrado.sku} (base: ${skuBase})`);
                    return encontrado;
                }
            }
        }
    } catch (e) {
        console.warn('⚠️ Erro ao buscar no Supabase pela base:', e);
    }
    
    // ===== 3ª TENTATIVA: FALLBACK - BUSCA EXATA =====
    try {
        if (window.supabaseClient) {
            const { data: prod, error: prodError } = await window.supabaseClient
                .from('produtos_estoque')
                .select('id, quantidade, nome, sku, bloquear_sync_ml, mlb_codes, dados_extra, preco, categoria')
                .eq('sku', skuLimpo)
                .maybeSingle();
            
            if (!prodError && prod) {
                console.log(`✅ Produto encontrado por SKU exato (fallback): ${prod.sku}`);
                return prod;
            }
        }
    } catch (e) {
        console.warn('⚠️ Erro ao buscar por SKU exato:', e);
    }
    
    // ===== 4ª TENTATIVA: ILIKE PELA BASE =====
    if (skuBase.length > 3) {
        try {
            if (window.supabaseClient) {
                const { data: prods, error: prodsError } = await window.supabaseClient
                    .from('produtos_estoque')
                    .select('id, quantidade, nome, sku, bloquear_sync_ml, mlb_codes, dados_extra, preco, categoria')
                    .ilike('sku', `%${skuBase}%`)
                    .limit(10);
                
                if (!prodsError && prods && prods.length > 0) {
                    // Verifica se algum tem a base correspondente
                    for (const prod of prods) {
                        const baseSistema = extrairSkuBaseSistema(prod.sku);
                        if (baseSistema === skuBase) {
                            console.log(`✅ Produto encontrado por ILIKE com base correspondente: ${prod.sku}`);
                            return prod;
                        }
                    }
                    // Se não encontrou pela base, pega o primeiro
                    console.log(`✅ Produto encontrado por ILIKE (similar): ${prods[0].sku}`);
                    return prods[0];
                }
            }
        } catch (e) {
            console.warn('⚠️ Erro ao buscar por ILIKE:', e);
        }
    }
    
    console.warn(`❌ Produto NÃO encontrado para base: "${skuBase}" (SKU original: "${sku}")`);
    return null;
}

function extrairSkuEQuantidade(skuComPrefixo) {
    if (!skuComPrefixo || skuComPrefixo === 'SEM_SKU' || skuComPrefixo === 'N/A') {
        return { sku: skuComPrefixo, multiplicador: 1 };
    }
    
    // 🔥 REMOVE APENAS OS 3 PRIMEIROS DÍGITOS (prefixo de quantidade do ML)
    const match = skuComPrefixo.match(/^(\d{3})(.+)$/);
    if (match) {
        const prefixo = parseInt(match[1]);
        let skuReal = match[2];
        
        if (skuReal.startsWith('/') || skuReal.startsWith('\\')) {
            skuReal = skuReal.substring(1);
        }
        
        console.log(`🔍 SKU com prefixo: ${skuComPrefixo} → Prefixo: ${prefixo}, SKU Real: ${skuReal}`);
        
        return { 
            sku: skuReal,              // SKU sem os 3 primeiros dígitos
            multiplicador: prefixo,    // Quantidade do prefixo
            skuOriginal: skuComPrefixo
        };
    }
    
    return { 
        sku: skuComPrefixo, 
        multiplicador: 1, 
        skuOriginal: skuComPrefixo 
    };
}

// ===================== ABAS =====================
async function mostrarAbaNFE(aba) {
    const abaVendas = document.getElementById('abaVendas');
    const abaEmitidas = document.getElementById('abaEmitidas');
    const abaAvulsa = document.getElementById('abaAvulsa');
    const abaTransportadoras = document.getElementById('abaTransportadoras');
    const abaClientes = document.getElementById('abaClientes');
    
    if (abaVendas) abaVendas.classList.add('hidden');
    if (abaEmitidas) abaEmitidas.classList.add('hidden');
    if (abaAvulsa) abaAvulsa.classList.add('hidden');
    if (abaTransportadoras) abaTransportadoras.classList.add('hidden');
    if (abaClientes) abaClientes.classList.add('hidden');
    
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
    
    if (aba === 'vendas') {
        // 🔥 AGORA SÓ CARREGA DO BANCO, NÃO SINCRONIZA AUTOMATICAMENTE
        await carregarVendasDoBanco();
    }
    if (aba === 'emitidas') await carregarNFesEmitidas();
    if (aba === 'transportadoras') await carregarTransportadoras();
    if (aba === 'clientes') await carregarClientes();
}

// =========================================================
// CARREGAR VENDAS APENAS DO BANCO (SEM SINCRONIZAR)
// =========================================================

async function carregarVendasDoBanco() {
    const tbody = document.getElementById('vendasPendentesBody');
    if (!tbody) return;

    // Mostrar loading
    tbody.innerHTML = `
        <tr>
            <td colspan="8" class="text-center py-4">
                <div class="spinner" style="display: inline-block; width: 30px; height: 30px; border-width: 4px;"></div>
                <p class="mt-2 text-muted">Carregando vendas do banco...</p>
            </td>
        </tr>
    `;

    try {
        if (window.supabaseClient) {
            const { data, error } = await window.supabaseClient
                .from('vendas_nfe')
                .select('*')
                .order('data_venda', { ascending: false })
                .limit(200);

            if (!error && data && data.length > 0) {
                console.log(`📂 ${data.length} vendas carregadas do banco`);
                renderizarTabelaVendas(data);
            } else {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="8" class="text-center py-4">
                            <p class="text-muted">Nenhuma venda encontrada no banco.</p>
                            <p class="text-muted" style="font-size: 12px;">Clique em "Atualizar Lista" para sincronizar com o Mercado Livre.</p>
                        </td>
                    </tr>
                `;
            }
        }
    } catch (error) {
        console.error('❌ Erro ao carregar vendas do banco:', error);
        tbody.innerHTML = `<tr><td colspan="8" class="text-center text-danger py-4">Erro ao carregar vendas: ${error.message}</td></tr>`;
    }
}

// =========================================================
// CARREGAR VENDAS DO SUPABASE
// =========================================================

async function carregarVendasDoSupabase() {
    try {
        if (!window.supabaseClient) {
            console.warn('⚠️ Supabase não disponível');
            return [];
        }

        const { data: vendas, error } = await window.supabaseClient
            .from('vendas_ml')
            .select('*')
            .order('data_venda', { ascending: false })
            .limit(200);

        if (error) {
            console.error('❌ Erro ao carregar vendas do Supabase:', error);
            return [];
        }

        console.log(`📂 ${vendas?.length || 0} vendas carregadas do Supabase`);
        return vendas || [];
    } catch (error) {
        console.error('❌ Erro ao carregar vendas do Supabase:', error);
        return [];
    }
}

// =========================================================
// SINCRONIZAR VENDAS DO ML COM O SUPABASE (ADAPTADO)
// =========================================================

async function sincronizarVendasComSupabase() {
    console.log('🔄 Sincronizando vendas do ML com o Supabase...');
    
    try {
        let token = localStorage.getItem('ml_access_token');
        if (!token && typeof window.getValidToken === 'function') {
            const tokenData = await window.getValidToken();
            token = tokenData?.access_token;
        }
        if (!token) throw new Error('Token ML não disponível');

        // Buscar vendas do ML
        const diasAtras = 90;
        const dataInicio = new Date();
        dataInicio.setDate(dataInicio.getDate() - diasAtras);
        
        let todasVendas = [];
        let offset = 0;
        const maxLimit = 50;
        let total = null;
        
        while (total === null || offset < total) {
            const params = new URLSearchParams({
                seller: '415176739',
                sort: 'date_desc',
                'order.status': 'paid',
                limit: maxLimit,
                offset: offset,
                'order.date_created.from': dataInicio.toISOString()
            });
            
            const url = `https://api.mercadolibre.com/orders/search?${params}`;
            const proxyUrl = `${window.WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(url)}&token=${encodeURIComponent(token)}`;
            
            const response = await fetch(proxyUrl);
            if (!response.ok) throw new Error(`Erro na API: ${response.status}`);
            
            const data = await response.json();
            const orders = data.results || [];
            
            if (total === null) {
                total = data.paging?.total || 0;
                console.log(`📦 Total de pedidos no ML: ${total}`);
            }
            
            todasVendas = todasVendas.concat(orders);
            offset += maxLimit;
            
            if (todasVendas.length >= 500) {
                console.log(`⏹️ Limite de 500 vendas atingido`);
                break;
            }
            
            await new Promise(resolve => setTimeout(resolve, 300));
        }
        
        console.log(`📦 ${todasVendas.length} vendas obtidas do ML`);

        // Processar e salvar cada venda
        let vendasSalvas = 0;
        let vendasComErro = 0;

        for (const venda of todasVendas) {
            try {
                // Buscar shipment
                let logisticType = '';
                let shippingMode = '';
                
                if (venda.shipping?.id) {
                    try {
                        const shipUrl = `https://api.mercadolibre.com/shipments/${venda.shipping.id}`;
                        const shipProxyUrl = `${window.WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(shipUrl)}&token=${encodeURIComponent(token)}`;
                        const shipResponse = await fetch(shipProxyUrl);
                        if (shipResponse.ok) {
                            const shipment = await shipResponse.json();
                            logisticType = shipment.logistic_type || '';
                            shippingMode = shipment.shipping_mode || '';
                        }
                    } catch (e) {}
                }

                const isFull = 
                    logisticType.toLowerCase() === 'fulfillment' ||
                    logisticType.toLowerCase().includes('full') ||
                    shippingMode.toLowerCase() === 'fulfillment' ||
                    shippingMode.toLowerCase().includes('full') ||
                    (venda.tags || []).some(t => t.toLowerCase() === 'fulfillment');

                // Verificar NF-e no ML
                let temNFEML = false;
                let statusNfe = 'pendente';
                
                try {
                    const resultNFE = await verificarNFEMercadoLivre(venda.id);
                    if (resultNFE) {
                        temNFEML = resultNFE.tem_nfe;
                        if (resultNFE.status === 'authorized') {
                            statusNfe = 'emitida';
                        } else if (resultNFE.status === 'pending') {
                            statusNfe = 'pendente';
                        } else if (resultNFE.status === 'canceled') {
                            statusNfe = 'cancelada';
                        }
                    }
                } catch (e) {}

                // Buscar valor exato
                let valorProduto = 0;
                let valorFrete = 0;
                
                try {
                    const dadosPagamento = await buscarValorExatoPagamento(venda.id);
                    if (dadosPagamento) {
                        valorProduto = dadosPagamento.valor_produto || 0;
                        valorFrete = dadosPagamento.valor_frete || 0;
                    }
                } catch (e) {}

                // Extrair SKU principal
                let skuPrincipal = 'N/A';
                let quantidadeTotal = 0;
                let ehKit = false;
                let skusKit = [];

                if (venda.order_items && venda.order_items.length > 0) {
                    for (const item of venda.order_items) {
                        const sku = item.item?.seller_sku || 'N/A';
                        const quantidade = item.quantity || 1;
                        
                        if (skuPrincipal === 'N/A') {
                            skuPrincipal = sku;
                        }
                        quantidadeTotal += quantidade;
                        
                        if (sku && sku.includes('.')) {
                            ehKit = true;
                            const partes = sku.split('.');
                            for (const parte of partes) {
                                const match = parte.match(/^\d{3}(.+)$/);
                                if (match) {
                                    skusKit.push({
                                        sku: match[1],
                                        quantidade: quantidade,
                                        sku_original: parte
                                    });
                                } else {
                                    skusKit.push({
                                        sku: parte,
                                        quantidade: quantidade,
                                        sku_original: parte
                                    });
                                }
                            }
                        }
                    }
                }

                // Determinar tipo de envio
                let meioEnvio = logisticType || shippingMode || '';
                if (meioEnvio.toLowerCase().includes('full') || meioEnvio.toLowerCase().includes('fulfillment')) {
                    meioEnvio = 'FULL';
                } else if (meioEnvio.toLowerCase().includes('flex')) {
                    meioEnvio = 'FLEX';
                } else if (meioEnvio.toLowerCase().includes('mercado')) {
                    meioEnvio = 'MERCADO_ENVIOS';
                }

                // Montar dados
                const vendaData = {
                    id_venda_ml: String(venda.id),
                    data_venda: venda.date_created || new Date().toISOString(),
                    date_created: venda.date_created || new Date().toISOString(),
                    last_updated: venda.last_updated || new Date().toISOString(),
                    date_closed: venda.date_closed || null,
                    cliente: venda.buyer?.nickname || 'N/I',
                    buyer_id: String(venda.buyer?.id || ''),
                    buyer_nickname: venda.buyer?.nickname || 'N/I',
                    sku: skuPrincipal,
                    sku_original: skuPrincipal,
                    quantidade: quantidadeTotal,
                    quantidade_vendida: quantidadeTotal,
                    valor_total: venda.total_amount || 0,
                    total_amount: venda.total_amount || 0,
                    status: venda.status || 'paid',
                    status_ml: venda.status || 'paid',
                    status_sistema: 'pendente',
                    eh_full: isFull,
                    tipo_envio: meioEnvio,
                    shipping_type: logisticType,
                    meio_envio: meioEnvio,
                    eh_kit: ehKit,
                    skus_kit: skusKit.length > 0 ? skusKit : null,
                    items_json: venda.order_items || [],
                    payments_json: venda.payments || [],
                    shipping_info: venda.shipping || {},
                    dados_envio: venda.shipping || {},
                    dados_completos: venda,
                    nfe_emitida: temNFEML,
                    status_nfe: statusNfe,
                    conferido: false,
                    divergente: false,
                    custo_frete_real: valorFrete,
                    custo_frete_esperado: 0,
                    status_frete: 'pendente',
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                };

                // Verificar se já existe
                const { data: existing, error: checkError } = await window.supabaseClient
                    .from('vendas_ml')
                    .select('id')
                    .eq('id_venda_ml', String(venda.id))
                    .maybeSingle();

                if (checkError && checkError.code !== 'PGRST116') {
                    console.warn('⚠️ Erro ao verificar venda:', checkError);
                }

                if (existing) {
                    const { error: updateError } = await window.supabaseClient
                        .from('vendas_ml')
                        .update(vendaData)
                        .eq('id_venda_ml', String(venda.id));
                    
                    if (updateError) {
                        console.error('❌ Erro ao atualizar venda:', updateError);
                        vendasComErro++;
                    } else {
                        vendasSalvas++;
                    }
                } else {
                    const { error: insertError } = await window.supabaseClient
                        .from('vendas_ml')
                        .insert([vendaData]);
                    
                    if (insertError) {
                        console.error('❌ Erro ao inserir venda:', insertError);
                        vendasComErro++;
                    } else {
                        vendasSalvas++;
                    }
                }

                await new Promise(resolve => setTimeout(resolve, 100));

            } catch (error) {
                console.error(`❌ Erro ao processar venda ${venda.id}:`, error);
                vendasComErro++;
            }
        }

        console.log(`💾 Sincronização concluída: ${vendasSalvas} vendas salvas, ${vendasComErro} erros`);
        
        return { vendasSalvas, vendasComErro, total: todasVendas.length };

    } catch (error) {
        console.error('❌ Erro na sincronização:', error);
        throw error;
    }
}
// =========================================================
// CARREGAR VENDAS PENDENTES (COM VERIFICAÇÃO DE TOKEN)
// =========================================================

async function carregarVendasPendentes() {
    const tbody = document.getElementById('vendasPendentesBody');
    if (!tbody) return;

    // Mostrar loading com mensagem de sincronização
    tbody.innerHTML = `
        <tr>
            <td colspan="8" class="text-center py-4">
                <div class="spinner" style="display: inline-block; width: 30px; height: 30px; border-width: 4px;"></div>
                <p class="mt-2 text-muted">Sincronizando com o Mercado Livre...</p>
            </td>
        </tr>
    `;

    try {
        // ===== 🔥 VERIFICAR E RENOVAR TOKEN =====
        console.log('🔑 Verificando token ML...');
        
        let token = localStorage.getItem('ml_access_token');
        let tokenValido = false;
        
        // Verificar se o token existe
        if (token) {
            // Verificar se está expirado
            const tokenExpiry = localStorage.getItem('ml_token_expiry');
            if (tokenExpiry) {
                const expiryDate = new Date(tokenExpiry);
                const now = new Date();
                if (expiryDate > now) {
                    tokenValido = true;
                    console.log('✅ Token válido (expira em:', expiryDate.toLocaleString(), ')');
                } else {
                    console.log('⚠️ Token expirado desde:', expiryDate.toLocaleString());
                }
            } else {
                // Se não tem data de expiração, considerar válido
                tokenValido = true;
                console.log('✅ Token presente (sem data de expiração)');
            }
        }
        
        // Se não tem token ou está expirado, tentar renovar
        if (!token || !tokenValido) {
            console.log('🔄 Token não disponível ou expirado. Tentando renovar...');
            
            // REMOVER TOKEN ANTIGO
            localStorage.removeItem('ml_access_token');
            localStorage.removeItem('ml_token_expiry');
            
            if (typeof window.getValidToken === 'function') {
                try {
                    const tokenData = await window.getValidToken();
                    if (tokenData && tokenData.access_token) {
                        token = tokenData.access_token;
                        localStorage.setItem('ml_access_token', token);
                        if (tokenData.expires_in) {
                            const expiryDate = new Date();
                            expiryDate.setSeconds(expiryDate.getSeconds() + tokenData.expires_in);
                            localStorage.setItem('ml_token_expiry', expiryDate.toISOString());
                            console.log('✅ Token renovado! Expira em:', expiryDate.toLocaleString());
                        } else {
                            console.log('✅ Token renovado! (sem data de expiração)');
                        }
                        tokenValido = true;
                    } else {
                        throw new Error('Não foi possível obter novo token');
                    }
                } catch (e) {
                    console.error('❌ Erro ao renovar token:', e);
                    throw new Error('Token ML não disponível. Faça login novamente.');
                }
            } else {
                console.warn('⚠️ função getValidToken não disponível');
                throw new Error('Token ML não disponível. Faça login novamente.');
            }
        }
        
        if (!tokenValido || !token) {
            throw new Error('Token ML não disponível. Faça login novamente.');
        }

        console.log('✅ Token OK, iniciando sincronização...');
        mostrarBarraProgresso('Sincronizando vendas com o ML...');

        // 🔥 REDUZIDO PARA 15 DIAS
        const diasAtras = 15;
        const dataInicio = new Date();
        dataInicio.setDate(dataInicio.getDate() - diasAtras);
        
        let todasVendas = [];
        let offset = 0;
        const maxLimit = 50;
        let total = null;
        const MAX_PAGINAS = 4;
        
        while ((total === null || offset < total) && offset / maxLimit < MAX_PAGINAS) {
            const params = new URLSearchParams({
                seller: '415176739',
                sort: 'date_desc',
                'order.status': 'paid',
                limit: maxLimit,
                offset: offset,
                'order.date_created.from': dataInicio.toISOString()
            });
            
            const url = `https://api.mercadolibre.com/orders/search?${params}`;
            const proxyUrl = `${window.WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(url)}&token=${encodeURIComponent(token)}`;
            
            console.log(`📡 Buscando pedidos (offset ${offset})...`);
            const response = await fetch(proxyUrl);
            
            if (!response.ok) {
                // Se for 401, token inválido - tentar renovar novamente
                if (response.status === 401) {
                    console.warn('⚠️ Token rejeitado pela API (401). Tentando renovar...');
                    
                    // Remover token antigo e renovar
                    localStorage.removeItem('ml_access_token');
                    localStorage.removeItem('ml_token_expiry');
                    
                    if (typeof window.getValidToken === 'function') {
                        const tokenData = await window.getValidToken();
                        if (tokenData && tokenData.access_token) {
                            token = tokenData.access_token;
                            localStorage.setItem('ml_access_token', token);
                            if (tokenData.expires_in) {
                                const expiryDate = new Date();
                                expiryDate.setSeconds(expiryDate.getSeconds() + tokenData.expires_in);
                                localStorage.setItem('ml_token_expiry', expiryDate.toISOString());
                            }
                            console.log('✅ Token renovado, tentando novamente...');
                            
                            // Tentar novamente com o novo token
                            const retryParams = new URLSearchParams({
                                seller: '415176739',
                                sort: 'date_desc',
                                'order.status': 'paid',
                                limit: maxLimit,
                                offset: offset,
                                'order.date_created.from': dataInicio.toISOString()
                            });
                            const retryUrl = `https://api.mercadolibre.com/orders/search?${retryParams}`;
                            const retryProxyUrl = `${window.WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(retryUrl)}&token=${encodeURIComponent(token)}`;
                            
                            const retryResponse = await fetch(retryProxyUrl);
                            if (!retryResponse.ok) throw new Error(`Erro na API: ${retryResponse.status}`);
                            const retryData = await retryResponse.json();
                            const retryOrders = retryData.results || [];
                            if (total === null) total = retryData.paging?.total || 0;
                            todasVendas = todasVendas.concat(retryOrders);
                            offset += maxLimit;
                            continue;
                        }
                    }
                    throw new Error('Token ML inválido. Faça login novamente.');
                }
                throw new Error(`Erro na API: ${response.status}`);
            }
            
            const data = await response.json();
            const orders = data.results || [];
            
            if (total === null) {
                total = data.paging?.total || 0;
                console.log(`📦 Total de pedidos no ML: ${total}`);
            }
            
            todasVendas = todasVendas.concat(orders);
            offset += maxLimit;
            
            const progresso = Math.min(100, Math.round((offset / (maxLimit * MAX_PAGINAS)) * 100));
            atualizarBarraProgresso(progresso, `Carregando ${offset}/${maxLimit * MAX_PAGINAS}...`);
            
            await new Promise(resolve => setTimeout(resolve, 200));
        }
        
        // LIMITAR PARA 200 VENDAS
        if (todasVendas.length > 200) {
            todasVendas = todasVendas.slice(0, 200);
            console.log(`📦 Limitado para 200 vendas`);
        }
        
        console.log(`📦 ${todasVendas.length} vendas obtidas do ML`);

        if (todasVendas.length > 0) {
            atualizarBarraProgresso(50, 'Processando vendas...');
            
            let vendasSalvas = 0;
            let vendasComErro = 0;
            
            const BATCH_SIZE = 5;
            
            for (let i = 0; i < todasVendas.length; i += BATCH_SIZE) {
                const batch = todasVendas.slice(i, i + BATCH_SIZE);
                
                for (const venda of batch) {
                    try {
                        const vendaProcessada = await processarVendaIndividual(venda, token);
                        if (vendaProcessada) {
                            const salvou = await salvarVendaNFE(vendaProcessada);
                            if (salvou) vendasSalvas++;
                            else vendasComErro++;
                        }
                    } catch (e) {
                        vendasComErro++;
                    }
                }
                
                const progresso = 50 + Math.round(((i + batch.length) / todasVendas.length) * 45);
                atualizarBarraProgresso(progresso, `Processando ${Math.min(i + batch.length, todasVendas.length)}/${todasVendas.length}...`);
                
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            // ===== RECARREGAR DO BANCO =====
            atualizarBarraProgresso(95, 'Finalizando...');
            
            if (window.supabaseClient) {
                const { data, error } = await window.supabaseClient
                    .from('vendas_nfe')
                    .select('*')
                    .order('data_venda', { ascending: false })
                    .limit(200);
                
                if (!error && data && data.length > 0) {
                    renderizarTabelaVendas(data);
                }
            }
            
            atualizarBarraProgresso(100, '✅ Concluído!');
            setTimeout(() => fecharBarraProgresso(), 1500);
            
            console.log(`💾 Sincronização: ${vendasSalvas} salvas, ${vendasComErro} erros`);
            if (vendasSalvas > 0) {
                showToast(`✅ ${vendasSalvas} vendas sincronizadas!`, 'success');
            }
            if (vendasComErro > 0) {
                showToast(`⚠️ ${vendasComErro} vendas com erro`, 'warning');
            }
        } else {
            fecharBarraProgresso();
            showToast('ℹ️ Nenhuma venda nova encontrada.', 'info');
            await carregarVendasDoBanco();
        }

    } catch (error) {
        console.error('❌ Erro:', error);
        fecharBarraProgresso();
        
        // Mensagem mais amigável para erro de token
        if (error.message.includes('401') || error.message.includes('Token')) {
            showToast('🔑 Token do Mercado Livre expirado. Faça login novamente.', 'error');
            // Tentar renovar token automaticamente
            if (typeof window.getValidToken === 'function') {
                try {
                    const tokenData = await window.getValidToken();
                    if (tokenData && tokenData.access_token) {
                        localStorage.setItem('ml_access_token', tokenData.access_token);
                        localStorage.removeItem('ml_token_expiry');
                        showToast('✅ Token renovado! Tente novamente.', 'success');
                    }
                } catch (e) {
                    console.error('❌ Falha ao renovar token:', e);
                }
            }
        } else {
            showToast('Erro ao sincronizar: ' + error.message, 'error');
        }
        
        await carregarVendasDoBanco();
    }
}

// =========================================================
// FUNÇÃO PARA OBTER TOKEN MANUALMENTE
// =========================================================

async function obterTokenManual() {
    console.log('🔑 Tentando obter token manualmente...');
    
    // Tentar via getValidToken
    if (typeof window.getValidToken === 'function') {
        try {
            const tokenData = await window.getValidToken();
            if (tokenData && tokenData.access_token) {
                localStorage.setItem('ml_access_token', tokenData.access_token);
                if (tokenData.expires_in) {
                    const expiryDate = new Date();
                    expiryDate.setSeconds(expiryDate.getSeconds() + tokenData.expires_in);
                    localStorage.setItem('ml_token_expiry', expiryDate.toISOString());
                }
                return tokenData.access_token;
            }
        } catch (e) {
            console.warn('⚠️ Erro ao obter token via getValidToken:', e);
        }
    }
    
    // Tentar via ml_token_manager
    if (typeof window.getMlToken === 'function') {
        try {
            const token = await window.getMlToken();
            if (token) {
                localStorage.setItem('ml_access_token', token);
                return token;
            }
        } catch (e) {
            console.warn('⚠️ Erro ao obter token via getMlToken:', e);
        }
    }
    
    // Verificar se há token no localStorage
    const token = localStorage.getItem('ml_access_token');
    if (token) {
        console.log('✅ Token encontrado no localStorage');
        return token;
    }
    
    console.error('❌ Nenhum token disponível');
    return null;
}

// =========================================================
// PROCESSAR VENDA INDIVIDUAL (COM VALOR CORRETO)
// =========================================================

async function processarVendaIndividual(venda, token) {
    const idVenda = String(venda.id);
    
    // Buscar shipment
    let logisticType = '';
    let shippingMode = '';
    
    if (venda.shipping?.id) {
        try {
            const shipUrl = `https://api.mercadolibre.com/shipments/${venda.shipping.id}`;
            const shipProxyUrl = `${window.WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(shipUrl)}&token=${encodeURIComponent(token)}`;
            const shipResponse = await fetch(shipProxyUrl);
            if (shipResponse.ok) {
                const shipment = await shipResponse.json();
                logisticType = shipment.logistic_type || '';
                shippingMode = shipment.shipping_mode || '';
            }
        } catch (e) {}
    }

    // Verificar se é FULL
    const isFull = 
        logisticType.toLowerCase() === 'fulfillment' ||
        logisticType.toLowerCase().includes('full') ||
        shippingMode.toLowerCase() === 'fulfillment' ||
        shippingMode.toLowerCase().includes('full') ||
        (venda.tags || []).some(t => t.toLowerCase() === 'fulfillment');

    // 🔥 BUSCAR VALOR EXATO DO MERCADO PAGO (sempre)
    let valorProduto = 0;
    let valorFrete = 0;
    
    try {
        const dadosPagamento = await buscarValorExatoPagamento(venda.id);
        if (dadosPagamento) {
            valorProduto = dadosPagamento.valor_produto || 0;
            valorFrete = dadosPagamento.valor_frete || 0;
            console.log(`💰 Venda ${idVenda}: Produto=R$ ${valorProduto.toFixed(2)}, Frete=R$ ${valorFrete.toFixed(2)}`);
        }
    } catch (e) {
        console.warn(`⚠️ Erro ao buscar pagamento para ${idVenda}:`, e);
    }
    
    // Fallback
    if (valorProduto === 0 && venda.order_items && venda.order_items.length > 0) {
        for (const item of venda.order_items) {
            valorProduto += (parseFloat(item.unit_price) || 0) * (parseInt(item.quantity) || 1);
        }
        console.log(`📦 Venda ${idVenda} (fallback): Valor = R$ ${valorProduto.toFixed(2)}`);
    }
    
    if (valorProduto === 0 && venda.total_amount) {
        valorFrete = venda.shipping?.cost || 0;
        valorProduto = Math.max(0, (venda.total_amount || 0) - valorFrete);
    }

    // Verificar NF-e no ML
    let temNFEML = false;
    let statusNFE = '⏳ Pendente';
    let statusDescricao = 'NF-e não emitida';

    if (!isFull) {
        try {
            const resultNFE = await verificarNFEMercadoLivre(venda.id);
            if (resultNFE) {
                temNFEML = resultNFE.tem_nfe;
                statusDescricao = resultNFE.status_descricao || 'Status desconhecido';
                
                if (resultNFE.status === 'authorized') {
                    statusNFE = '✅ NF-e Emitida (ML)';
                } else if (resultNFE.status === 'pending') {
                    statusNFE = '⏳ NF-e Pendente';
                } else if (resultNFE.status === 'canceled') {
                    statusNFE = '❌ NF-e Cancelada';
                } else {
                    statusNFE = '⏳ Pendente';
                }
            }
        } catch (e) {}
    } else {
        statusNFE = '🚫 FULL';
        statusDescricao = 'NF-e automática (FULL)';
    }

    return {
        ...venda,
        _logistic_type: logisticType,
        _shipping_mode: shippingMode,
        _valor_produto: valorProduto,
        _valor_frete: valorFrete,
        _is_full: isFull,
        _tem_nfe_ml: temNFEML,
        _status_nfe: statusNFE,
        _status_descricao: statusDescricao
    };
}

// =========================================================
// BARRA DE PROGRESSO (CORRIGIDA)
// =========================================================

let progressBarElement = null;

function mostrarBarraProgresso(mensagem) {
    // Remover barra anterior se existir
    fecharBarraProgresso();
    
    // 🔥 PROCURAR O CONTAINER CORRETO
    const container = document.querySelector('#abaVendas') || document.querySelector('.card:has(#vendasPendentesBody)') || document.querySelector('.card:has(table)');
    if (!container) {
        console.warn('⚠️ Container da tabela não encontrado');
        return;
    }
    
    progressBarElement = document.createElement('div');
    progressBarElement.id = 'progressBarContainer';
    progressBarElement.style.cssText = `
        padding: 15px 20px;
        background: #f8f9fa;
        border-radius: 8px;
        margin: 10px 15px;
        border: 1px solid #e9ecef;
        display: flex;
        align-items: center;
        gap: 15px;
    `;
    
    progressBarElement.innerHTML = `
        <div style="flex: 1;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                <span style="font-size: 13px; color: #495057;" id="progressMessage">${mensagem}</span>
                <span style="font-size: 13px; font-weight: 600; color: #00ADEE;" id="progressPercent">0%</span>
            </div>
            <div style="width: 100%; height: 8px; background: #e9ecef; border-radius: 4px; overflow: hidden;">
                <div id="progressBarFill" style="width: 0%; height: 100%; background: linear-gradient(90deg, #00ADEE, #80D6F7); border-radius: 4px; transition: width 0.5s ease;"></div>
            </div>
        </div>
        <button onclick="fecharBarraProgresso()" style="background: none; border: none; color: #6c757d; cursor: pointer; font-size: 18px;">
            <i class="fas fa-times"></i>
        </button>
    `;
    
    // 🔥 INSERIR ANTES DA TABELA
    const tableWrapper = container.querySelector('.table-responsive') || container.querySelector('table')?.parentElement || container;
    if (tableWrapper) {
        tableWrapper.parentElement.insertBefore(progressBarElement, tableWrapper);
    } else {
        container.appendChild(progressBarElement);
    }
}

function atualizarBarraProgresso(percentual, mensagem) {
    if (!progressBarElement) return;
    
    const fill = progressBarElement.querySelector('#progressBarFill');
    const percent = progressBarElement.querySelector('#progressPercent');
    const msg = progressBarElement.querySelector('#progressMessage');
    
    if (fill) fill.style.width = `${Math.min(100, percentual)}%`;
    if (percent) percent.textContent = `${Math.min(100, percentual)}%`;
    if (msg && mensagem) msg.textContent = mensagem;
}

function fecharBarraProgresso() {
    if (progressBarElement) {
        progressBarElement.remove();
        progressBarElement = null;
    }
}

// =========================================================
// RENDERIZAR TABELA DE VENDAS (COM VALOR CORRETO)
// =========================================================

function renderizarTabelaVendas(vendas) {
    const tbody = document.getElementById('vendasPendentesBody');
    if (!tbody) return;

    if (!vendas || vendas.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center py-5">Nenhuma venda encontrada</td></tr>';
        window.vendasPendentes = [];
        return;
    }

    // Remover duplicatas
    const vendasUnicas = [];
    const idsVistos = new Set();
    
    for (const v of vendas) {
        const id = v.id_venda_ml || v.id || '';
        if (id && !idsVistos.has(id)) {
            idsVistos.add(id);
            vendasUnicas.push(v);
        }
    }

    function gerarBadgeEnvio(venda) {
        const logisticType = venda._logistic_type || venda.logistic_type || '';
        const shippingMode = venda._shipping_mode || venda.shipping_mode || '';
        const meioEnvio = venda._meio_envio || venda.meio_envio || venda.tipo_envio || '';
        
        const tipoCompleto = (logisticType + ' ' + shippingMode + ' ' + meioEnvio).toUpperCase();

        if (tipoCompleto.includes('FULL') || tipoCompleto.includes('FULFILLMENT')) {
            return '<span class="badge badge-danger" style="background: #dc3545; color: white; padding: 4px 10px;"><i class="fas fa-warehouse"></i> FULL</span>';
        }
        
        if (tipoCompleto.includes('FLEX') || tipoCompleto.includes('DROP_OFF') || tipoCompleto.includes('SELF_SERVICE')) {
            return '<span class="badge badge-flex" style="background: #fd7e14; color: white; padding: 4px 10px;"><i class="fas fa-motorcycle"></i> FLEX</span>';
        }
        
        if (tipoCompleto.includes('CROSS_DOCKING') || tipoCompleto.includes('ME2') || tipoCompleto.includes('MERCADO_ENVIOS') || tipoCompleto.includes('ME')) {
            return '<span class="badge badge-mercado" style="background: #17a2b8; color: white; padding: 4px 10px;"><i class="fas fa-truck"></i> ME</span>';
        }

        return '<span class="badge badge-secondary" style="padding: 4px 10px;">N/I</span>';
    }

    tbody.innerHTML = vendasUnicas.map(v => {
        const vendaId = v.id_venda_ml || v.id || 'N/A';
        const dataVenda = v.data_venda || v.date_created ? 
            new Date(v.data_venda || v.date_created).toLocaleDateString('pt-BR') : '-';
        
        // 🔥 CORREÇÃO: PRIORIZAR valor_produto (valor sem desconto de cupom)
        // Ordem de prioridade correta:
        // 1. _valor_produto (vindo do Mercado Pago)
        // 2. valor_produto (salvo no banco)
        // 3. total_amount (fallback)
        let valorExibir = 0;
        
        // 🔥 PRIORIDADE 1: valor_produto (sem desconto)
        if (v._valor_produto && v._valor_produto > 0) {
            valorExibir = v._valor_produto;
        } else if (v.valor_produto && v.valor_produto > 0) {
            valorExibir = v.valor_produto;
        } 
        // 🔥 PRIORIDADE 2: total_amount (fallback)
        else if (v.total_amount && v.total_amount > 0) {
            valorExibir = v.total_amount;
        } else if (v.valor_total && v.valor_total > 0) {
            valorExibir = v.valor_total;
        }
        
        // 🔥 LOG PARA DEBUG
        console.log(`📊 Venda ${vendaId}: valor_produto=${v._valor_produto || v.valor_produto || 0}, total_amount=${v.total_amount || v.valor_total || 0}, exibindo=${valorExibir}`);

        const clienteExibir = v.cliente || v.buyer_nickname || v.buyer?.nickname || 'N/I';
        const skuExibir = v.sku || v.sku_original || v.order_items?.[0]?.item?.seller_sku || 'N/A';
        
        // Verificar se é FULL
        const isFull = v._is_full || v.eh_full || v.is_full || 
                      (v._logistic_type && v._logistic_type.toLowerCase().includes('full')) ||
                      (v.logistic_type && v.logistic_type.toLowerCase().includes('full')) ||
                      (v.tipo_envio && v.tipo_envio.toUpperCase().includes('FULL')) ||
                      (v.meio_envio && v.meio_envio.toUpperCase().includes('FULL'));
        
        const temNFE = v._tem_nfe_ml || v.tem_nfe_ml || v.nfe_emitida || false;
        const statusNfe = v._status_nfe || v.status_nfe || '⏳ Pendente';
        
        let statusNFEBadge = '';
        let botaoEmitir = '';

        if (isFull) {
            statusNFEBadge = '<span class="badge badge-danger" style="background: #dc3545; color: white; padding: 4px 10px;">🚫 FULL</span>';
            botaoEmitir = '<span class="text-muted" style="font-size: 12px; color: #6c757d;"><i class="fas fa-lock"></i> NF-e automática</span>';
        } else if (temNFE) {
            statusNFEBadge = '<span class="badge badge-success" style="background: #28a745; color: white;">✅ NF-e Emitida</span>';
            botaoEmitir = '<span class="text-muted" style="font-size: 12px;">NF-e já emitida</span>';
        } else if (statusNfe && (statusNfe.includes('Cancelada') || statusNfe.includes('cancelada'))) {
            statusNFEBadge = '<span class="badge badge-danger">❌ NF-e Cancelada</span>';
            botaoEmitir = `
                <button class="btn btn-sm btn-warning btn-emitir-nfe" data-venda-id="${vendaId}">
                    <i class="fas fa-file-invoice"></i> Reemitir
                </button>
            `;
        } else {
            statusNFEBadge = '<span class="badge badge-warning">⏳ NF-e Pendente</span>';
            botaoEmitir = `
                <button class="btn btn-sm btn-success btn-emitir-nfe" data-venda-id="${vendaId}">
                    <i class="fas fa-file-invoice"></i> Emitir NF-e
                </button>
            `;
        }

        return `
        <tr>
            <td><strong>${vendaId}</strong></td>
            <td>${dataVenda}</td>
            <td>${clienteExibir}</td>
            <td><code style="font-size: 11px;">${skuExibir}</code></td>
            <td><strong>R$ ${parseFloat(valorExibir || 0).toFixed(2)}</strong></td>
            <td>${gerarBadgeEnvio(v)}</td>
            <td>${statusNFEBadge}</td>
            <td>${botaoEmitir}</td>
        </tr>`;
    }).join('');

    // Adicionar event listeners
    document.querySelectorAll('#vendasPendentesBody .btn-emitir-nfe').forEach(btn => {
        btn.removeEventListener('click', handleEmitirNFEClick);
        btn.addEventListener('click', handleEmitirNFEClick);
    });

    window.vendasPendentes = vendasUnicas;
}

// =========================================================
// FUNÇÃO PARA DEBUG - MOSTRAR DADOS DO PAGAMENTO
// =========================================================

window.debugMercadoPago = async function(orderId) {
    if (!orderId) {
        orderId = prompt('Digite o ID da venda (ex: 2000017646644698):');
        if (!orderId) return;
    }
    
    console.log(`🔍 Debugando Mercado Pago para venda ${orderId}...`);
    
    try {
        const resultado = await buscarValorExatoPagamento(orderId);
        console.log('📊 Resultado completo:', resultado);
        
        if (resultado) {
            const mensagem = `
🔍 VALORES DO MERCADO PAGO:

✅ Valor do Produto: R$ ${resultado.valor_produto?.toFixed(2) || '0,00'}
📦 Valor do Frete: R$ ${resultado.valor_frete?.toFixed(2) || '0,00'}
💳 Total Pago: R$ ${resultado.total_pago?.toFixed(2) || '0,00'}
🎫 Desconto Cupom: R$ ${resultado.desconto_cupom?.toFixed(2) || '0,00'}
🆔 Payment ID: ${resultado.payment_id || 'N/A'}

Verifique o console para mais detalhes.
            `;
            alert(mensagem);
        } else {
            alert('❌ Não foi possível obter os dados do pagamento. Verifique o console para mais detalhes.');
        }
        
        return resultado;
    } catch (error) {
        console.error('❌ Erro no debug:', error);
        alert('❌ Erro ao buscar dados: ' + error.message);
        return null;
    }
};

console.log('✅ Função debugMercadoPago registrada globalmente');

// =========================================================
// EMITIR NF-e PARA VENDA
// =========================================================

async function emitirNFEParaVenda(orderId) {
    console.log('🔵 [emitirNFEParaVenda] FUNÇÃO INICIADA');
    console.log(`🔵 orderId recebido: ${orderId}`);
    console.log(`🔵 pendingEmitOrderId ANTES: ${pendingEmitOrderId}`);

    if (!orderId || orderId === 'null' || orderId === 'undefined') {
        console.log('❌ orderId inválido!');
        showToast('❌ ID da venda inválido', 'error');
        return;
    }

    // 🔥 GARANTIR QUE pendingEmitOrderId ESTÁ DEFINIDO
    if (!pendingEmitOrderId || pendingEmitOrderId !== orderId) {
        console.log(`⚠️ pendingEmitOrderId (${pendingEmitOrderId}) não coincide com orderId (${orderId}), corrigindo...`);
        pendingEmitOrderId = orderId;
        console.log(`✅ pendingEmitOrderId CORRIGIDO: ${pendingEmitOrderId}`);
    }

    console.log('📋 Abrindo modal de dados do cliente...');
    abrirModalCliente();
    
    // ===== MOSTRAR LOADING NOS CAMPOS =====
    const camposLoading = ['clienteNome', 'clienteDocumento', 'clienteEndereco', 'clienteNumero', 'clienteBairro', 'clienteCidade', 'clienteUF', 'clienteCEP'];
    camposLoading.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.placeholder = '⏳ Carregando...';
            el.value = '';
            el.disabled = true;
        }
    });
    
    const numeroEl = document.getElementById('clienteNumero');
    if (numeroEl) numeroEl.value = 'S/N';

    try {
        let token = localStorage.getItem('ml_access_token');
        if (!token && typeof window.getValidToken === 'function') {
            const tokenData = await window.getValidToken();
            token = tokenData?.access_token;
        }
        
        if (!token) {
            console.warn('⚠️ Token ML não disponível.');
            habilitarCamposCliente();
            showToast('⚠️ Token ML não disponível. Preencha os dados manualmente.', 'warning');
            return;
        }

        // ===== BUSCAR DADOS DA VENDA =====
        const url = `https://api.mercadolibre.com/orders/${orderId}`;
        let venda = null;

        try {
            const proxyUrl = `${window.WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(url)}&token=${encodeURIComponent(token)}`;
            console.log('📤 Buscando venda...');
            const response = await fetch(proxyUrl);
            if (response.ok) {
                venda = await response.json();
                console.log('✅ Venda obtida com sucesso');
            } else {
                console.warn(`⚠️ Worker falhou: ${response.status}`);
            }
        } catch (error) {
            console.warn('⚠️ Erro no worker:', error);
        }

        if (!venda) {
            console.warn('⚠️ Não foi possível obter dados da venda, permitindo preenchimento manual');
            habilitarCamposCliente();
            showToast('⚠️ Preencha os dados manualmente.', 'warning');
            return;
        }

        // ===== VERIFICAR SE É FULL =====
        if (typeof isFullByAnyField === 'function' && isFullByAnyField(venda)) {
            console.log('🚫 Venda FULL – NF-e não permitida.');
            showToast('🚫 Esta venda é FULL e não permite emissão manual de NF-e.', 'warning');
            habilitarCamposCliente();
            pendingEmitOrderId = null;
            return;
        }

        // ===== EXTRAIR ENDEREÇO =====
        let address = {};
        if (venda.shipping && venda.shipping.id) {
            try {
                const shipUrl = `https://api.mercadolibre.com/shipments/${venda.shipping.id}`;
                const shipProxyUrl = `${window.WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(shipUrl)}&token=${encodeURIComponent(token)}`;
                const shipResponse = await fetch(shipProxyUrl);
                if (shipResponse.ok) {
                    const shipment = await shipResponse.json();
                    if (shipment.receiver_address) {
                        address = shipment.receiver_address;
                    }
                }
            } catch (error) {
                console.warn('⚠️ Erro ao buscar shipment:', error);
            }
        }

        if (!address.address_line && !address.street_name && venda.buyer && venda.buyer.address) {
            address = venda.buyer.address;
        }

        // ===== PREENCHER CAMPOS =====
        const buyer = venda.buyer || {};
        const nome = `${buyer.first_name || ''} ${buyer.last_name || ''}`.trim() || buyer.nickname || '';

        habilitarCamposCliente();
        
        document.getElementById('clienteNome').value = nome;
        document.getElementById('clienteEndereco').value = address.address_line || address.street_name || '';
        document.getElementById('clienteNumero').value = address.street_number || 'S/N';
        document.getElementById('clienteBairro').value = address.neighborhood?.name || address.neighborhood || '';
        document.getElementById('clienteCidade').value = address.city?.name || address.city || '';
        
        const ufOriginal = address.state?.name || address.state || '';
        const ufSigla = mapearUF(ufOriginal);
        document.getElementById('clienteUF').value = ufSigla;
        document.getElementById('clienteCEP').value = address.zip_code ? address.zip_code.replace(/\D/g, '') : '';
        document.getElementById('clienteDocumento').value = '';

        console.log('📋 Dados preenchidos:', {
            nome,
            endereco: document.getElementById('clienteEndereco').value,
            cidade: document.getElementById('clienteCidade').value,
            uf: ufSigla
        });

        // ===== CFOP AUTOMÁTICO =====
        const cfopSelect = document.getElementById('nfeCfop');
        if (cfopSelect) {
            const cfopSugerido = (ufSigla === 'PR') ? '5102' : '6108';
            cfopSelect.value = cfopSugerido;
            console.log(`🔧 CFOP definido: ${cfopSugerido}`);
        }

        window._mlAccessToken = token;
        await carregarTransportadorasSelect();

        console.log('✅ Dados do cliente carregados com sucesso!');
        console.log(`✅ pendingEmitOrderId mantido: ${pendingEmitOrderId}`);

    } catch (error) {
        console.error('❌ Erro ao buscar dados da venda:', error);
        habilitarCamposCliente();
        showToast('❌ Erro ao carregar dados. Preencha manualmente.', 'error');
    }
}

// ===== FUNÇÃO PARA HABILITAR CAMPOS DO CLIENTE =====
function habilitarCamposCliente() {
    const campos = ['clienteNome', 'clienteEndereco', 'clienteNumero', 'clienteBairro', 'clienteCidade', 'clienteUF', 'clienteCEP', 'clienteDocumento'];
    campos.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.disabled = false;
            if (el.placeholder === '⏳ Carregando...') {
                el.placeholder = '';
            }
        }
    });
}

// =========================================================
// ABRIR MODAL CLIENTE (CORRIGIDO)
// =========================================================
function abrirModalCliente() {
    console.log('📋 [abrirModalCliente] Abrindo modal...');
    
    let modal = document.getElementById('modalDadosClienteNFE');
    
    // Se o modal não existe, criar
    if (!modal) {
        console.log('📋 Criando modal de cliente...');
        modal = criarModalClienteEmergencia();
    }
    
    if (modal) {
        modal.classList.remove('hidden');
        modal.style.display = 'flex';
        modal.style.alignItems = 'center';
        modal.style.justifyContent = 'center';
        modal.style.position = 'fixed';
        modal.style.top = '0';
        modal.style.left = '0';
        modal.style.width = '100%';
        modal.style.height = '100%';
        modal.style.backgroundColor = 'rgba(0,0,0,0.5)';
        modal.style.zIndex = '10000';
        console.log('✅ Modal de dados do cliente aberto');
        
        // 🔥 FORÇAR RECRIAÇÃO DOS BOTÕES
        setTimeout(() => {
            fixModalButtons();
        }, 200);
    } else {
        console.error('❌ Modal não encontrado');
        showToast('Erro: modal não encontrado', 'error');
    }
}

// =========================================================
// CRIAR MODAL CLIENTE EMERGÊNCIA (CORRIGIDO)
// =========================================================
function criarModalClienteEmergencia() {
    // Remover modal antigo se existir
    const oldModal = document.getElementById('modalDadosClienteNFE');
    if (oldModal) oldModal.remove();
    
    const modalHTML = `
    <div id="modalDadosClienteNFE" class="modal" style="display:none; align-items:center; justify-content:center; background:rgba(0,0,0,0.5); z-index:10000; position:fixed; top:0; left:0; width:100%; height:100%;">
        <div class="modal-content" style="max-width:600px; background:white; padding:25px; border-radius:8px; max-height:90vh; overflow-y:auto; width:95%;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
                <h3 style="margin:0;"><i class="fas fa-user-edit"></i> Dados do Cliente para NF-e</h3>
                <button onclick="fecharModalDadosClienteNFE()" style="background:none; border:none; font-size:28px; cursor:pointer; color:#6c757d; line-height:1;">&times;</button>
            </div>
            <form id="formDadosClienteNFE">
                <div class="form-group">
                    <label>Nome completo *</label>
                    <input type="text" id="clienteNome" class="form-control" required>
                </div>
                <div class="form-group">
                    <label>CPF / CNPJ * (apenas números)</label>
                    <input type="text" id="clienteDocumento" class="form-control" placeholder="00000000000" required>
                </div>
                <div class="form-group">
                    <label>Endereço (logradouro) *</label>
                    <input type="text" id="clienteEndereco" class="form-control" required>
                </div>
                <div class="row">
                    <div class="col-md-4">
                        <div class="form-group">
                            <label>Número</label>
                            <input type="text" id="clienteNumero" class="form-control" value="S/N">
                        </div>
                    </div>
                    <div class="col-md-8">
                        <div class="form-group">
                            <label>Bairro</label>
                            <input type="text" id="clienteBairro" class="form-control">
                        </div>
                    </div>
                </div>
                <div class="row">
                    <div class="col-md-5">
                        <div class="form-group">
                            <label>Cidade *</label>
                            <input type="text" id="clienteCidade" class="form-control" required>
                        </div>
                    </div>
                    <div class="col-md-3">
                        <div class="form-group">
                            <label>UF *</label>
                            <input type="text" id="clienteUF" class="form-control" maxlength="2" required>
                        </div>
                    </div>
                    <div class="col-md-4">
                        <div class="form-group">
                            <label>CEP</label>
                            <input type="text" id="clienteCEP" class="form-control" placeholder="00000000">
                        </div>
                    </div>
                </div>
                <div class="row">
                    <div class="col-md-6">
                        <div class="form-group">
                            <label>NCM</label>
                            <input type="text" id="nfeNcm" class="form-control" value="87149990">
                        </div>
                    </div>
                    <div class="col-md-6">
                        <div class="form-group">
                            <label>CFOP</label>
                            <select id="nfeCfop" class="form-control">
                                <option value="5102">5102 - Venda dentro do estado</option>
                                <option value="6108">6108 - Venda interestadual</option>
                                <option value="5405">5405 - Venda de produção</option>
                            </select>
                        </div>
                    </div>
                </div>
                <div class="form-group">
                    <label>Transportadora</label>
                    <select id="nfeTransportadora" class="form-control">
                        <option value="">Selecione uma transportadora</option>
                    </select>
                </div>
                
                <!-- 🔥 BOTÕES COM IDS FIXOS E EVENTOS DIRETOS -->
                <div class="d-flex justify-content-end gap-2 mt-3">
                    <button type="button" class="btn btn-secondary" id="cancelarModalNFEBtn">
                        <i class="fas fa-times"></i> Cancelar
                    </button>
                    <button type="button" class="btn btn-success" id="confirmarModalNFEBtn">
                        <i class="fas fa-file-invoice"></i> Confirmar e Emitir NF-e
                    </button>
                </div>
            </form>
        </div>
    </div>`;
    
    const container = document.createElement('div');
    container.innerHTML = modalHTML;
    document.body.appendChild(container.firstElementChild);
    
    const modal = document.getElementById('modalDadosClienteNFE');
    console.log('✅ Modal de cliente criado em emergência');
    
    // Carregar transportadoras
    setTimeout(carregarTransportadorasSelect, 300);
    
    // 🔥 ANEXAR EVENTOS AOS BOTÕES IMEDIATAMENTE
    setTimeout(fixModalButtons, 100);
    
    return modal;
}

// =========================================================
// FIXAR BOTÕES DO MODAL (CORRIGIDO)
// =========================================================
function fixModalButtons() {
    console.log('🔧 [fixModalButtons] Fixando botões do modal...');
    
    // Botão Confirmar
    const btnConfirmar = document.getElementById('confirmarModalNFEBtn');
    if (btnConfirmar) {
        // Remover todos os eventos antigos
        const novoBtn = btnConfirmar.cloneNode(true);
        btnConfirmar.parentNode.replaceChild(novoBtn, btnConfirmar);
        
        // Adicionar evento CORRETO
        novoBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            console.log('🔵 [CONFIRMAR] Botão clicado!');
            console.log('🔵 pendingEmitOrderId:', pendingEmitOrderId);
            
            // Se não tiver orderId, tentar recuperar
            if (!pendingEmitOrderId) {
                const btnVenda = document.querySelector('.btn-emitir-nfe[data-venda-id]');
                if (btnVenda) {
                    const vendaId = btnVenda.dataset.vendaId || btnVenda.getAttribute('data-venda-id');
                    if (vendaId) {
                        pendingEmitOrderId = vendaId;
                        console.log(`✅ pendingEmitOrderId recuperado: ${pendingEmitOrderId}`);
                    }
                }
            }
            
            confirmarEmissaoNFE();
        });
        
        // Também adicionar onclick direto (fallback)
        novoBtn.onclick = function(e) {
            e.preventDefault();
            e.stopPropagation();
            console.log('🔵 [CONFIRMAR] onclick disparado!');
            confirmarEmissaoNFE();
        };
        
        console.log('✅ Botão Confirmar fixado');
    } else {
        console.warn('⚠️ Botão confirmar não encontrado');
    }
    
    // Botão Cancelar
    const btnCancelar = document.getElementById('cancelarModalNFEBtn');
    if (btnCancelar) {
        const novoBtn = btnCancelar.cloneNode(true);
        btnCancelar.parentNode.replaceChild(novoBtn, btnCancelar);
        
        novoBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            console.log('🔵 [CANCELAR] Botão clicado!');
            fecharModalDadosClienteNFE();
        });
        
        novoBtn.onclick = function(e) {
            e.preventDefault();
            e.stopPropagation();
            fecharModalDadosClienteNFE();
        };
        
        console.log('✅ Botão Cancelar fixado');
    } else {
        console.warn('⚠️ Botão cancelar não encontrado');
    }
}

// =========================================================
// FECHAR MODAL DADOS CLIENTE (CORRIGIDO)
// =========================================================
function fecharModalDadosClienteNFE() {
    console.log('🔵 [fecharModalDadosClienteNFE] Fechando modal...');
    const modal = document.getElementById('modalDadosClienteNFE');
    if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
    }
    // Não limpar pendingEmitOrderId aqui para permitir reabertura
    console.log('✅ Modal fechado');
}

// =========================================================
// FUNÇÃO DE EMERGÊNCIA - BOTÃO FLUTUANTE
// =========================================================
let botaoFlutuante = null;

function criarBotaoFlutuanteEmergencia() {
    // Remover botão antigo
    if (botaoFlutuante) {
        botaoFlutuante.remove();
        botaoFlutuante = null;
    }
    
    const modal = document.getElementById('modalDadosClienteNFE');
    if (!modal || modal.style.display !== 'flex') {
        console.log('ℹ️ Modal não está aberto');
        return;
    }
    
    botaoFlutuante = document.createElement('div');
    botaoFlutuante.style.cssText = `
        position: fixed;
        bottom: 30px;
        right: 30px;
        z-index: 99999;
        background: linear-gradient(135deg, #28a745, #20c997);
        color: white;
        border: none;
        padding: 15px 30px;
        border-radius: 50px;
        font-weight: bold;
        font-size: 16px;
        cursor: pointer;
        box-shadow: 0 4px 15px rgba(40, 167, 69, 0.4);
        display: flex;
        align-items: center;
        gap: 10px;
        animation: pulse 2s infinite;
    `;
    
    botaoFlutuante.innerHTML = `
        <i class="fas fa-file-invoice"></i>
        🚀 EMITIR NF-e AGORA
        <span style="font-size: 10px; background: rgba(255,255,255,0.2); padding: 2px 10px; border-radius: 20px;">
            ${pendingEmitOrderId || 'SEM ID'}
        </span>
    `;
    
    botaoFlutuante.onclick = function() {
        console.log('🔵 [BOTÃO FLUTUANTE] Clicado!');
        if (!pendingEmitOrderId) {
            const btnVenda = document.querySelector('.btn-emitir-nfe[data-venda-id]');
            if (btnVenda) {
                const vendaId = btnVenda.dataset.vendaId || btnVenda.getAttribute('data-venda-id');
                if (vendaId) {
                    pendingEmitOrderId = vendaId;
                    console.log(`✅ pendingEmitOrderId recuperado: ${pendingEmitOrderId}`);
                }
            }
        }
        if (!pendingEmitOrderId) {
            alert('❌ Nenhuma venda selecionada! Clique em "Emitir NF-e" na tabela primeiro.');
            return;
        }
        confirmarEmissaoNFE();
    };
    
    document.body.appendChild(botaoFlutuante);
    console.log('✅ Botão flutuante criado!');
}

// Observar quando o modal abre
const observerModal = new MutationObserver(() => {
    const modal = document.getElementById('modalDadosClienteNFE');
    if (modal && modal.style.display === 'flex') {
        console.log('🔍 Modal detectado, fixando botões...');
        setTimeout(fixModalButtons, 300);
        setTimeout(criarBotaoFlutuanteEmergencia, 500);
    }
});

// Iniciar observação
try {
    observerModal.observe(document.body, {
        attributes: true,
        attributeFilter: ['style'],
        subtree: true
    });
} catch (e) {
    console.warn('⚠️ Erro ao iniciar observer:', e);
}

// =========================================================
// SALVAR CLIENTE NO BANCO (SUPABASE + API)
// =========================================================

async function salvarClienteNoBanco(dadosCliente) {
    try {
        console.log('💾 Salvando cliente no banco:', dadosCliente);
        
        // ===== 1. SALVAR NO SUPABASE =====
        if (window.supabaseClient) {
            try {
                // Verificar se o cliente já existe pelo documento
                const { data: clienteExistente, error: checkError } = await window.supabaseClient
                    .from('clientes')
                    .select('id')
                    .eq('documento', dadosCliente.documento)
                    .maybeSingle();
                
                if (checkError && checkError.code !== 'PGRST116') {
                    console.warn('⚠️ Erro ao verificar cliente no Supabase:', checkError);
                }
                
                if (clienteExistente) {
                    // Atualizar cliente existente
                    const { error: updateError } = await window.supabaseClient
                        .from('clientes')
                        .update({
                            nome: dadosCliente.nome,
                            logradouro: dadosCliente.endereco,
                            numero: dadosCliente.numero,
                            bairro: dadosCliente.bairro,
                            cidade: dadosCliente.cidade,
                            uf: dadosCliente.uf,
                            cep: dadosCliente.cep,
                            updated_at: new Date().toISOString()
                        })
                        .eq('id', clienteExistente.id);
                    
                    if (updateError) {
                        console.warn('⚠️ Erro ao atualizar cliente no Supabase:', updateError);
                    } else {
                        console.log('✅ Cliente atualizado no Supabase:', dadosCliente.nome);
                    }
                } else {
                    // Inserir novo cliente
                    const { error: insertError } = await window.supabaseClient
                        .from('clientes')
                        .insert([{
                            nome: dadosCliente.nome,
                            documento: dadosCliente.documento,
                            logradouro: dadosCliente.endereco,
                            numero: dadosCliente.numero,
                            bairro: dadosCliente.bairro,
                            cidade: dadosCliente.cidade,
                            uf: dadosCliente.uf,
                            cep: dadosCliente.cep,
                            created_at: new Date().toISOString(),
                            updated_at: new Date().toISOString()
                        }]);
                    
                    if (insertError) {
                        console.warn('⚠️ Erro ao inserir cliente no Supabase:', insertError);
                    } else {
                        console.log('✅ Novo cliente salvo no Supabase:', dadosCliente.nome);
                    }
                }
            } catch (supabaseError) {
                console.warn('⚠️ Erro ao salvar cliente no Supabase:', supabaseError);
            }
        }
        
        // ===== 2. SALVAR NA API (fallback) =====
        try {
            // Verificar se o cliente já existe na API
            const responseBusca = await fetch(`${window.API_BASE_URL}/nfe/clientes?documento=${dadosCliente.documento}`);
            let clienteExiste = false;
            
            if (responseBusca.ok) {
                const data = await responseBusca.json();
                if (data.clientes && data.clientes.length > 0) {
                    clienteExiste = true;
                    console.log('ℹ️ Cliente já cadastrado na API:', dadosCliente.documento);
                }
            }
            
            if (!clienteExiste) {
                const payload = {
                    nome: dadosCliente.nome,
                    documento: dadosCliente.documento,
                    logradouro: dadosCliente.endereco,
                    numero: dadosCliente.numero,
                    bairro: dadosCliente.bairro,
                    cidade: dadosCliente.cidade,
                    uf: dadosCliente.uf,
                    cep: dadosCliente.cep
                };
                
                const response = await fetch(`${window.API_BASE_URL}/nfe/clientes`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                
                if (response.ok) {
                    console.log('✅ Cliente salvo na API:', dadosCliente.nome);
                } else {
                    const errorText = await response.text();
                    console.warn('⚠️ Erro ao salvar cliente na API:', errorText);
                }
            }
        } catch (apiError) {
            console.warn('⚠️ Erro ao salvar cliente na API:', apiError);
        }
        
        // ===== 3. RECARREGAR LISTA DE CLIENTES =====
        if (document.getElementById('abaClientes') && !document.getElementById('abaClientes').classList.contains('hidden')) {
            await carregarClientes();
        }
        
        return true;
        
    } catch (error) {
        console.error('❌ Erro ao salvar cliente:', error);
        return false;
    }
}

function handleEmitirNFEClick(event) {
    const vendaId = event.currentTarget.dataset.vendaId;
    if (!vendaId) {
        showToast('❌ ID da venda não encontrado', 'error');
        return;
    }
    abrirModalEdicaoProdutos(vendaId);
}

// =========================================================
// SALVAR VENDA NA TABELA vendas_nfe (COM CAMPOS DE CONTROLE)
// =========================================================

async function salvarVendaNFE(venda) {
    try {
        if (!window.supabaseClient) {
            console.warn('⚠️ Supabase não disponível');
            return false;
        }

        const idVenda = String(venda.id);

        // 🔥 VALOR CORRETO
        let valorProduto = venda._valor_produto || 0;
        let valorFrete = venda._valor_frete || 0;
        
        if (valorProduto === 0 && venda.order_items && venda.order_items.length > 0) {
            for (const item of venda.order_items) {
                valorProduto += (parseFloat(item.unit_price) || 0) * (parseInt(item.quantity) || 1);
            }
        }
        
        if (valorProduto === 0 && venda.total_amount) {
            valorFrete = venda.shipping?.cost || 0;
            valorProduto = Math.max(0, (venda.total_amount || 0) - valorFrete);
        }

        console.log(`💰 Salvando venda ${idVenda} (NFE): valor_produto=R$ ${valorProduto.toFixed(2)}`);

        // Extrair SKU
        let skuPrincipal = 'N/A';
        let quantidadeTotal = 0;

        if (venda.order_items && venda.order_items.length > 0) {
            for (const item of venda.order_items) {
                const sku = item.item?.seller_sku || 'N/A';
                const quantidade = item.quantity || 1;
                if (skuPrincipal === 'N/A') skuPrincipal = sku;
                quantidadeTotal += quantidade;
            }
        }

        // Dados de envio
        const logisticType = venda._logistic_type || '';
        const shippingMode = venda._shipping_mode || '';
        
        let meioEnvio = 'N/I';
        const tipoCompleto = (logisticType + ' ' + shippingMode).toLowerCase();
        
        if (tipoCompleto.includes('full') || tipoCompleto.includes('fulfillment')) {
            meioEnvio = 'FULL';
        } else if (tipoCompleto.includes('flex') || tipoCompleto.includes('drop_off')) {
            meioEnvio = 'FLEX';
        } else if (tipoCompleto.includes('cross_docking') || tipoCompleto.includes('mercado_envios')) {
            meioEnvio = 'ME';
        } else if (logisticType) {
            meioEnvio = logisticType.toUpperCase();
        }

        const isFull = venda._is_full || tipoCompleto.includes('full');

        // Status NF-e
        let statusNfe = 'pendente';
        let nfeEmitida = false;
        
        if (venda._tem_nfe_ml) {
            nfeEmitida = true;
            if (venda._status_nfe && venda._status_nfe.includes('Cancelada')) {
                statusNfe = 'cancelada';
            } else if (venda._status_nfe && venda._status_nfe.includes('Emitida')) {
                statusNfe = 'emitida';
            } else {
                statusNfe = 'emitida';
            }
        }

        const vendaData = {
            id_venda_ml: idVenda,
            data_venda: venda.date_created || new Date().toISOString(),
            date_created: venda.date_created || new Date().toISOString(),
            last_updated: venda.last_updated || new Date().toISOString(),
            date_closed: venda.date_closed || null,
            cliente: venda.buyer?.nickname || 'N/I',
            buyer_id: String(venda.buyer?.id || ''),
            buyer_nickname: venda.buyer?.nickname || 'N/I',
            sku: skuPrincipal,
            sku_original: skuPrincipal,
            quantidade: quantidadeTotal,
            quantidade_vendida: quantidadeTotal,
            valor_unitario: venda.order_items?.[0]?.unit_price || 0,
            valor_total: venda.total_amount || 0,
            total_amount: venda.total_amount || 0,
            valor_produto: valorProduto,
            valor_frete: valorFrete,
            status: venda.status || 'paid',
            status_ml: venda.status || 'paid',
            status_sistema: 'pendente',
            status_conferencia: 'pendente',
            eh_full: isFull,
            is_full: isFull,
            logistic_type: logisticType,
            shipping_mode: shippingMode,
            meio_envio: meioEnvio,
            tipo_envio: meioEnvio,
            shipping_type: logisticType || shippingMode,
            nfe_emitida: nfeEmitida,
            status_nfe: statusNfe,
            conferido: false,
            divergente: false,
            custo_frete_real: valorFrete || 0,
            custo_frete_esperado: 0,
            status_frete: 'pendente',
            items_json: venda.order_items || [],
            payments_json: venda.payments || [],
            shipping_info: venda.shipping || {},
            dados_envio: venda.shipping || {},
            dados_completos: venda,
            // 🔥 CAMPOS DE CONTROLE DE ESTOQUE
            estoque_baixado: venda._estoque_baixado || false,
            data_baixa_estoque: venda._data_baixa_estoque || null,
            updated_at: new Date().toISOString()
        };

        // 🔥 UPSERT na nova tabela
        const { data, error } = await window.supabaseClient
            .from('vendas_nfe')
            .upsert(vendaData, { 
                onConflict: 'id_venda_ml'
            })
            .select();

        if (error) {
            console.error('❌ Erro ao salvar venda na tabela NFE:', error);
            return false;
        }

        console.log(`✅ Venda ${idVenda} salva na tabela vendas_nfe`);
        return true;

    } catch (error) {
        console.error('❌ Erro ao salvar venda na tabela NFE:', error);
        return false;
    }
}

// =========================================================
// CONFIRMAR EMISSÃO NF-E - COMPLETA E CORRIGIDA
// =========================================================

async function confirmarEmissaoNFE() {
    console.log('🔵 [confirmarEmissaoNFE] FUNÇÃO INICIADA');
    console.log(`🔵 pendingEmitOrderId: ${pendingEmitOrderId}`);
    console.log(`🔵 vendaIdParaEdicao: ${vendaIdParaEdicao}`);
    
    // 🔥 SE pendingEmitOrderId ESTIVER VAZIO, TENTAR RECUPERAR
    let orderId = pendingEmitOrderId;
    
    if (!orderId) {
        console.warn('⚠️ pendingEmitOrderId está vazio! Tentando recuperar...');
        
        if (vendaIdParaEdicao) {
            orderId = vendaIdParaEdicao;
            pendingEmitOrderId = orderId;
            console.log(`✅ Recuperado de vendaIdParaEdicao: ${orderId}`);
        } else {
            const btn = document.querySelector('.btn-emitir-nfe[data-venda-id]');
            if (btn) {
                orderId = btn.dataset.vendaId || btn.getAttribute('data-venda-id');
                if (orderId) {
                    pendingEmitOrderId = orderId;
                    console.log(`✅ Recuperado do botão da tabela: ${orderId}`);
                }
            }
        }
        
        if (!orderId) {
            console.log('❌ Nenhuma venda selecionada');
            showToast('❌ Nenhuma venda selecionada. Tente novamente.', 'error');
            fecharModalDadosClienteNFE();
            return;
        }
    }

    console.log(`✅ orderId final: ${orderId}`);

    // ===== VALIDAR CAMPOS DO FORMULÁRIO =====
    const nome = document.getElementById('clienteNome').value.trim();
    const documento = document.getElementById('clienteDocumento').value.trim().replace(/\D/g, '');
    const endereco = document.getElementById('clienteEndereco').value.trim();
    const numero = document.getElementById('clienteNumero').value.trim() || 'S/N';
    const bairro = document.getElementById('clienteBairro').value.trim() || '';
    const cidade = document.getElementById('clienteCidade').value.trim();
    const uf = document.getElementById('clienteUF').value.trim().toUpperCase();
    const cep = document.getElementById('clienteCEP').value.trim().replace(/\D/g, '');
    const transportadoraId = document.getElementById('nfeTransportadora')?.value || null;

    console.log('📋 Dados do formulário:');
    console.log(`   Nome: ${nome}`);
    console.log(`   Documento: ${documento}`);
    console.log(`   Endereço: ${endereco}`);
    console.log(`   Cidade: ${cidade}`);
    console.log(`   UF: ${uf}`);

    // ===== VALIDAÇÕES =====
    if (!nome) { 
        showToast('⚠️ Nome é obrigatório', 'warning'); 
        document.getElementById('clienteNome').focus();
        return; 
    }
    
    if (!documento || (documento.length !== 11 && documento.length !== 14)) {
        showToast('⚠️ CPF/CNPJ inválido (11 ou 14 dígitos)', 'warning');
        document.getElementById('clienteDocumento').focus();
        return;
    }
    
    if (!endereco) { 
        showToast('⚠️ Endereço é obrigatório', 'warning'); 
        document.getElementById('clienteEndereco').focus();
        return; 
    }
    
    if (!cidade) { 
        showToast('⚠️ Cidade é obrigatória', 'warning'); 
        document.getElementById('clienteCidade').focus();
        return; 
    }
    
    if (uf.length !== 2) { 
        showToast('⚠️ UF deve ter 2 letras (ex: SP, RJ, PR)', 'warning'); 
        document.getElementById('clienteUF').focus();
        return; 
    }

    const ufValidas = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];
    if (!ufValidas.includes(uf)) {
        showToast(`⚠️ UF "${uf}" inválida. Use uma sigla válida (ex: SP, RJ, PR)`, 'warning');
        document.getElementById('clienteUF').focus();
        return;
    }

    if (cep && cep.length !== 8) {
        showToast('⚠️ CEP deve ter 8 dígitos (apenas números)', 'warning');
        document.getElementById('clienteCEP').focus();
        return;
    }

    // ===== FECHAR MODAL =====
    fecharModalDadosClienteNFE();

    // ===== BOTÃO DE CARREGAMENTO =====
    const btn = document.querySelector(`#vendasPendentesBody .btn-emitir-nfe[data-venda-id="${orderId}"]`);
    let originalText = '';
    if (btn) {
        originalText = btn.innerHTML;
        btn.innerHTML = '<span class="spinner"></span> Emitindo...';
        btn.disabled = true;
    }

    // =========================================================
    // 🔥 VARIÁVEIS PARA CONTROLAR O STATUS
    // =========================================================
    let nfeEmitida = false;
    let protocoloNFE = null;
    let erroNFE = null;
    let produtosFinal = [];

    try {
        // ===== TOKEN =====
        let token = localStorage.getItem('ml_access_token');
        if (!token && typeof window.getValidToken === 'function') {
            const tokenData = await window.getValidToken();
            token = tokenData?.access_token;
        }

        // ===== BUSCAR PRODUTOS COM VALORES CORRETOS =====
        let produtos = [];
        
        const dadosPagamento = await buscarValorExatoPagamento(orderId);
        
        if (dadosPagamento && dadosPagamento.valor_produto > 0) {
            console.log(`✅ Usando valor do Mercado Pago: R$ ${dadosPagamento.valor_produto.toFixed(2)}`);
            
            if (token) {
                try {
                    const url = `https://api.mercadolibre.com/orders/${orderId}`;
                    const proxyUrl = `${window.WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(url)}&token=${encodeURIComponent(token)}`;
                    const response = await fetch(proxyUrl);
                    
                    if (response.ok) {
                        const venda = await response.json();
                        const orderItems = venda.order_items || [];
                        
                        const totalItems = orderItems.reduce((sum, item) => sum + (item.quantity || 1), 0);
                        const valorPorItem = totalItems > 0 ? dadosPagamento.valor_produto / totalItems : 0;
                        
                        for (const item of orderItems) {
                            const sku = item.item.seller_sku || 'SEM_SKU';
                            const quantidade = item.quantity || 1;
                            const valorUnitario = valorPorItem * quantidade;
                            
                            let ncmSalvo = '87149990';
                            try {
                                const ncmData = await buscarNCMporSKU(sku);
                                if (ncmData) ncmSalvo = ncmData;
                            } catch (e) {}
                            
                            produtos.push({
                                nome: item.item.title || 'Produto',
                                quantidade: quantidade,
                                valor_unitario: valorUnitario,
                                sku: sku,
                                ncm: ncmSalvo
                            });
                        }
                    }
                } catch (error) {
                    console.warn('⚠️ Erro ao buscar dados da venda:', error);
                }
            }
        }
        
        if (produtos.length === 0 && token) {
            try {
                const url = `https://api.mercadolibre.com/orders/${orderId}`;
                const proxyUrl = `${window.WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(url)}&token=${encodeURIComponent(token)}`;
                const response = await fetch(proxyUrl);
                if (response.ok) {
                    const venda = await response.json();
                    const orderItems = venda.order_items || [];
                    for (const item of orderItems) {
                        const sku = item.item.seller_sku || 'SEM_SKU';
                        const quantidade = item.quantity || 1;
                        let ncmSalvo = '87149990';
                        try { const ncmData = await buscarNCMporSKU(sku); if (ncmData) ncmSalvo = ncmData; } catch (e) {}
                        produtos.push({
                            nome: item.item.title || 'Produto',
                            quantidade: quantidade,
                            valor_unitario: item.unit_price || 0,
                            sku: sku,
                            ncm: ncmSalvo
                        });
                    }
                }
            } catch (error) {
                console.warn('⚠️ Erro ao buscar dados da venda:', error);
            }
        }

        if (produtos.length === 0) {
            console.log('📦 Usando produtos da edição (fallback final)');
            produtos = window.produtosParaEmissao || [];
            if (produtos.length === 0) {
                produtos = [{
                    nome: 'Produto não identificado',
                    quantidade: 1,
                    valor_unitario: 0,
                    sku: 'SEM_SKU',
                    ncm: '87149990'
                }];
            }
        }

        const cfopSelect = document.getElementById('nfeCfop');
        let cfop = '';
        if (cfopSelect) {
            cfop = cfopSelect.value;
        }
        if (!cfop) {
            cfop = (uf === 'PR') ? '5102' : '6108';
            console.warn(`⚠️ CFOP vazio, usando fallback: ${cfop}`);
        }

        produtosFinal = produtos.map(prod => ({
            nome: prod.nome || 'Produto',
            quantidade: prod.quantidade || 1,
            valor_unitario: prod.valor_unitario || 0,
            sku: prod.sku || 'SEM_SKU',
            ncm: prod.ncm || '87149990'
        }));

        const totalNota = produtosFinal.reduce((sum, p) => sum + (p.valor_unitario * p.quantidade), 0);
        console.log(`💰 Total da nota: R$ ${totalNota.toFixed(2)}`);

        // =========================================================
        // 🔥 1º - VERIFICAR SE O ESTOQUE JÁ FOI BAIXADO
        // =========================================================
        console.log('📦 Verificando se o estoque já foi baixado para venda:', orderId);

        let estoqueJaBaixado = false;
        let dadosVenda = null;

        try {
            if (window.supabaseClient) {
                const { data, error } = await window.supabaseClient
                    .from('vendas_nfe')
                    .select('estoque_baixado, data_baixa_estoque')
                    .eq('id_venda_ml', orderId)
                    .maybeSingle();
                
                if (!error && data) {
                    dadosVenda = data;
                    if (data.estoque_baixado) {
                        estoqueJaBaixado = true;
                        console.log(`⚠️ Estoque já foi baixado para venda ${orderId} em ${data.data_baixa_estoque}`);
                    }
                }
            }
        } catch (e) {
            console.warn('⚠️ Erro ao verificar se estoque foi baixado:', e);
        }

        // =========================================================
        // 🔥 2º - EMITIR NF-e
        // =========================================================
        console.log('📤 Emitindo NF-e...');
        
        const payload = {
            venda_id: String(orderId),
            cliente: { nome, documento, endereco, numero, bairro, cidade, uf, cep },
            produtos: produtosFinal,
            cfop: cfop,
            natureza_operacao: 'VENDA',
            modalidade_frete: transportadoraId ? '0' : '9',
            transportadora_id: transportadoraId,
            ml_access_token: token
        };

        const emitResponse = await fetch(`${window.API_BASE_URL}/nfe/emitir`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const result = await emitResponse.json();

        if (result.success) {
            nfeEmitida = true;
            protocoloNFE = result.protocolo;
            console.log(`✅ NF-e emitida! Protocolo: ${protocoloNFE}`);
            showToast(`✅ NF-e emitida! Protocolo: ${protocoloNFE}`, 'success');
        } else {
            erroNFE = result.error || 'Erro desconhecido';
            console.error(`❌ Erro ao emitir NF-e: ${erroNFE}`);
            
            // Verificar se é erro de duplicidade (NF-e já existe)
            if (erroNFE.includes('cStat=539') || erroNFE.includes('Duplicidade')) {
                showToast('⚠️ Esta venda já possui NF-e emitida. Continuando com baixa de estoque...', 'warning');
                nfeEmitida = true; // Considerar como emitida para continuar
            } else {
                showToast(`❌ Erro na NF-e: ${erroNFE}`, 'error');
            }
        }

        // =========================================================
        // 🔥 3º - BAIXA DE ESTOQUE (SÓ SE NÃO TIVER SIDO BAIXADO AINDA)
        // =========================================================
        
        if (estoqueJaBaixado) {
            console.log('⏭️ Pulando baixa de estoque (já foi baixado anteriormente)');
            showToast('ℹ️ Estoque já foi baixado para esta venda.', 'info');
        } else {
            console.log('📦 Iniciando baixa de estoque...');
            
            let itensBaixados = 0;
            let errosBaixa = [];
            let itensRegistrados = [];
            let produtosParaSincronizar = [];

            for (const prod of produtosFinal) {
                if (!prod.sku || prod.sku === 'SEM_SKU' || prod.sku === 'N/A') continue;
                
                const { sku: skuReal, multiplicador, skuOriginal } = extrairSkuEQuantidade(prod.sku);
                const quantidadeTotal = (prod.quantidade || 1) * multiplicador;
                
                console.log(`📦 Processando: ${prod.nome} | SKU: ${skuReal} | Qtd: ${quantidadeTotal}`);
                
                let produto = await buscarProdutoPorSku(skuReal);
                
                if (!produto && skuOriginal && skuOriginal !== skuReal) {
                    console.log(`🔄 Tentando com SKU original: ${skuOriginal}`);
                    produto = await buscarProdutoPorSku(skuOriginal);
                }
                
                if (!produto && skuReal.length > 3) {
                    const skuSemPrefixo = skuReal.replace(/^\d{3}/, '');
                    if (skuSemPrefixo !== skuReal) {
                        console.log(`🔄 Tentando com SKU sem prefixo: ${skuSemPrefixo}`);
                        produto = await buscarProdutoPorSku(skuSemPrefixo);
                    }
                }
                
                if (produto) {
                    const quantidadeAtual = produto.quantidade || 0;
                    
                    if (quantidadeAtual < quantidadeTotal) {
                        errosBaixa.push(`Estoque insuficiente para ${produto.nome} (${produto.sku}): ${quantidadeAtual} < ${quantidadeTotal}`);
                        continue;
                    }
                    
                    const novaQuantidade = quantidadeAtual - quantidadeTotal;
                    
                    const { error: updateError } = await window.supabaseClient
                        .from('produtos_estoque')
                        .update({ 
                            quantidade: novaQuantidade,
                            updated_at: new Date().toISOString()
                        })
                        .eq('id', produto.id);
                    
                    if (updateError) {
                        errosBaixa.push(`Erro ao atualizar ${produto.sku}: ${updateError.message}`);
                    } else {
                        itensBaixados++;
                        console.log(`✅ Estoque atualizado: ${produto.sku} ${quantidadeAtual} → ${novaQuantidade}`);
                        
                        itensRegistrados.push({
                            produto_id: produto.id,
                            sku: produto.sku,
                            nome: produto.nome,
                            quantidade: quantidadeTotal,
                            novaQuantidade: novaQuantidade
                        });
                        
                        // Verificar sincronização ML
                        const syncBloqueado = produto.bloquear_sync_ml || produto.dados_extra?.bloquear_sync_ml || false;
                        const mlbCodes = produto.mlb_codes || produto.dados_extra?.mlb_codes;
                        
                        if (mlbCodes && Array.isArray(mlbCodes) && mlbCodes.length > 0 && !syncBloqueado) {
                            produtosParaSincronizar.push({
                                id: produto.id,
                                sku: produto.sku,
                                quantidade: novaQuantidade,
                                nome: produto.nome
                            });
                        }
                    }
                } else {
                    errosBaixa.push(`Produto não encontrado: ${skuReal}`);
                }
            }

            // ===== REGISTRAR MOVIMENTAÇÕES =====
            console.log('📝 Registrando movimentações...');
            for (const item of itensRegistrados) {
                if (typeof window.registrarMovimentacao === 'function') {
                    try {
                        await window.registrarMovimentacao(
                            item.produto_id,
                            'saida',
                            item.quantidade,
                            `NFE-${orderId}`,
                            'venda'
                        );
                        console.log(`✅ Movimentação registrada para ${item.sku}: -${item.quantidade}`);
                    } catch (movError) {
                        console.warn(`⚠️ Erro ao registrar movimentação:`, movError);
                    }
                }
            }

            // ===== MARCAR COMO BAIXADO NO BANCO =====
            if (itensBaixados > 0 && window.supabaseClient) {
                try {
                    const { error: updateVendaError } = await window.supabaseClient
                        .from('vendas_nfe')
                        .update({
                            estoque_baixado: true,
                            data_baixa_estoque: new Date().toISOString()
                        })
                        .eq('id_venda_ml', orderId);
                    
                    if (updateVendaError) {
                        console.warn('⚠️ Erro ao marcar venda como baixada:', updateVendaError);
                    } else {
                        console.log('✅ Venda marcada como estoque baixado');
                    }
                } catch (e) {
                    console.warn('⚠️ Erro ao atualizar status da venda:', e);
                }
            }

            // ===== RECARREGAR ESTOQUE LOCAL =====
            if (typeof window.carregarProdutosEstoque === 'function') {
                await window.carregarProdutosEstoque();
            }

            // ===== SINCRONIZAR COM ML =====
            if (produtosParaSincronizar.length > 0) {
                console.log(`🔄 Sincronizando ${produtosParaSincronizar.length} produto(s) com ML...`);
                for (const prod of produtosParaSincronizar) {
                    try {
                        const { data: produtoCompleto, error: prodError } = await window.supabaseClient
                            .from('produtos_estoque')
                            .select('*')
                            .eq('id', prod.id)
                            .single();
                        
                        if (!prodError && typeof window.sincronizarEstoqueML === 'function') {
                            await window.sincronizarEstoqueML(produtoCompleto);
                            console.log(`✅ ${prod.sku} sincronizado com ML!`);
                        }
                    } catch (err) {
                        console.warn(`⚠️ Erro ao sincronizar ${prod.sku}:`, err);
                    }
                }
            }

            // ===== RESUMO FINAL =====
            if (itensBaixados > 0) {
                showToast(`✅ ${itensBaixados} item(ns) baixados do estoque!`, 'success');
            }
            if (errosBaixa.length > 0) {
                showToast(`⚠️ ${errosBaixa.length} erro(s) na baixa de estoque`, 'warning');
                console.warn('Erros na baixa:', errosBaixa);
            }
        }

        // ===== SALVAR CLIENTE =====
        await salvarClienteNoBanco({ nome, documento, endereco, numero, bairro, cidade, uf, cep });

        // ===== RECARREGAR TABELA =====
        window.produtosParaEmissao = null;
        await carregarVendasDoBanco();
        await carregarNFesEmitidas();

    } catch (error) {
        console.error('❌ Erro no processo:', error);
        showToast(`Erro: ${error.message}`, 'error');
        
    } finally {
        if (btn) {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
        window._mlAccessToken = null;
        window.produtosParaEmissao = null;
        pendingEmitOrderId = null;
        vendaIdParaEdicao = null;
        console.log('✅ pendingEmitOrderId limpo');
    }
}

// Exportar para escopo global
window.confirmarEmissaoNFE = confirmarEmissaoNFE;

// =========================================================
// NF-ES EMITIDAS
// =========================================================

async function carregarNFesEmitidas() {
    const tbody = document.getElementById('nfesEmitidasBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="6" class="text-center"><div class="spinner"></div> Carregando...<\/td><\/tr>';
    try {
        const response = await fetch(`${window.API_BASE_URL}/nfe/listar-nfes`);
        const data = await response.json();
        if (!data.success) throw new Error(data.error);
        const nfes = data.notas || [];
        if (!nfes.length) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center">Nenhuma NF-e emitida<\/td><\/tr>';
            return;
        }
        tbody.innerHTML = nfes.map(nfe => {
            const chave = nfe.chave_acesso || nfe.chave || 'N/A';
            const protocolo = nfe.protocolo || '-';
            const dataEmissao = nfe.data_emissao ? new Date(nfe.data_emissao).toLocaleDateString('pt-BR') : '-';
            
            let clienteNome = nfe.cliente_nome || nfe.cliente?.nome || '-';
            let valorTotal = nfe.valor_total ? parseFloat(nfe.valor_total).toFixed(2) : '—';
            
            if (clienteNome === '-' || valorTotal === '—') {
                try {
                    if (nfe.xml_assinado) {
                        const parser = new DOMParser();
                        const xmlDoc = parser.parseFromString(nfe.xml_assinado, 'application/xml');
                        const infNFe = xmlDoc.querySelector('infNFe');
                        if (infNFe) {
                            const dest = infNFe.querySelector('dest');
                            if (dest) {
                                const xNome = dest.querySelector('xNome');
                                if (xNome) clienteNome = xNome.textContent || '-';
                            }
                            const ICMSTot = infNFe.querySelector('ICMSTot');
                            if (ICMSTot) {
                                const vNF = ICMSTot.querySelector('vNF');
                                if (vNF) valorTotal = parseFloat(vNF.textContent || '0').toFixed(2);
                            }
                        }
                    }
                } catch (e) {
                    console.warn('Erro ao extrair dados do XML:', e);
                }
            }

            return `
            <tr>
                <td><small>${chave}</small></td>
                <td>${protocolo}</td>
                <td>${clienteNome}</td>
                <td>R$ ${valorTotal}</td>
                <td>${dataEmissao}</td>
                <td>
                    <button class="btn btn-sm btn-info" onclick="visualizarNFE('${chave}')">Visualizar</button>
                    <button class="btn btn-sm btn-secondary" onclick="baixarXMLNFE('${chave}')">XML</button>
                    ${!nfe.cancelada ? `<button class="btn btn-sm btn-danger" onclick="cancelarNFE('${chave}')">Cancelar</button>` : '<span class="badge badge-danger">Cancelada</span>'}
                </td>
            </tr>`;
        }).join('');
    } catch (error) {
        console.error(error);
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-danger">Erro ao carregar NF-es<\/td><\/tr>';
    }
}

// ===== VISUALIZAR, BAIXAR, CANCELAR =====
async function visualizarNFE(chaveAcesso) {
    try {
        const response = await fetch(`${window.API_BASE_URL}/nfe/buscar-xml?chave=${chaveAcesso}`);
        const data = await response.json();
        if (!data.xml) {
            window.showToast('XML não encontrado', 'error');
            return;
        }

        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(data.xml, 'application/xml');
        const infNFe = xmlDoc.querySelector('infNFe');
        if (!infNFe) {
            window.showToast('XML inválido', 'error');
            return;
        }

        const chave = infNFe.getAttribute('Id').replace('NFe', '');
        const nNF = infNFe.querySelector('nNF')?.textContent || '';
        const serie = infNFe.querySelector('serie')?.textContent || '';
        const natOp = infNFe.querySelector('natOp')?.textContent || '';
        const dhEmi = infNFe.querySelector('dhEmi')?.textContent || '';
        const dhSaiEnt = infNFe.querySelector('dhSaiEnt')?.textContent || '';
        const modFrete = infNFe.querySelector('modFrete')?.textContent || '9';
        const protocolo = infNFe.querySelector('nProt')?.textContent || 'Não informado';

        const emit = infNFe.querySelector('emit');
        const emitNome = emit.querySelector('xNome')?.textContent || '';
        const emitCNPJ = emit.querySelector('CNPJ')?.textContent || '';
        const emitIE = emit.querySelector('IE')?.textContent || '';
        const emitEnd = emit.querySelector('enderEmit');
        const emitLogr = emitEnd?.querySelector('xLgr')?.textContent || '';
        const emitNro = emitEnd?.querySelector('nro')?.textContent || '';
        const emitBairro = emitEnd?.querySelector('xBairro')?.textContent || '';
        const emitMun = emitEnd?.querySelector('xMun')?.textContent || '';
        const emitUF = emitEnd?.querySelector('UF')?.textContent || '';
        const emitCEP = emitEnd?.querySelector('CEP')?.textContent || '';
        const emitFone = emitEnd?.querySelector('fone')?.textContent || '';

        const dest = infNFe.querySelector('dest');
        const destNome = dest.querySelector('xNome')?.textContent || '';
        const destDoc = dest.querySelector('CPF')?.textContent || dest.querySelector('CNPJ')?.textContent || '';
        const destEnd = dest.querySelector('enderDest');
        const destLogr = destEnd?.querySelector('xLgr')?.textContent || '';
        const destNro = destEnd?.querySelector('nro')?.textContent || '';
        const destBairro = destEnd?.querySelector('xBairro')?.textContent || '';
        const destMun = destEnd?.querySelector('xMun')?.textContent || '';
        const destUF = destEnd?.querySelector('UF')?.textContent || '';
        const destCEP = destEnd?.querySelector('CEP')?.textContent || '';

        const dets = xmlDoc.querySelectorAll('det');
        let produtosHTML = '';
        let totalProd = 0;
        dets.forEach((det, idx) => {
            const prod = det.querySelector('prod');
            const nome = prod.querySelector('xProd')?.textContent || '';
            const ncm = prod.querySelector('NCM')?.textContent || '';
            const cfop = prod.querySelector('CFOP')?.textContent || '';
            const qtd = prod.querySelector('qCom')?.textContent || '0';
            const vUn = prod.querySelector('vUnCom')?.textContent || '0';
            const vProd = prod.querySelector('vProd')?.textContent || '0';
            const unidade = 'PC';
            totalProd += parseFloat(vProd) || 0;
            produtosHTML += `
                <tr>
                    <td>${idx+1}</td>
                    <td style="text-align:left;">${nome}</td>
                    <td>${ncm}</td>
                    <td>${cfop}</td>
                    <td>${unidade}</td>
                    <td style="text-align:right;">${qtd}</td>
                    <td style="text-align:right;">${parseFloat(vUn).toFixed(2)}</td>
                    <td style="text-align:right;">${parseFloat(vProd).toFixed(2)}</td>
                </tr>
            `;
        });

        const ICMSTot = infNFe.querySelector('ICMSTot');
        const vNF = ICMSTot?.querySelector('vNF')?.textContent || totalProd.toFixed(2);
        const vProdTotal = ICMSTot?.querySelector('vProd')?.textContent || totalProd.toFixed(2);
        const vFrete = ICMSTot?.querySelector('vFrete')?.textContent || '0';
        const vSeg = ICMSTot?.querySelector('vSeg')?.textContent || '0';
        const vDesc = ICMSTot?.querySelector('vDesc')?.textContent || '0';
        const vTotTrib = ICMSTot?.querySelector('vTotTrib')?.textContent || '0';

        const transp = infNFe.querySelector('transp');
        const transporta = transp?.querySelector('transporta');
        const vol = transp?.querySelector('vol');

        let qVol = '0';
        let pesoL = '0,000';
        let pesoB = '0,000';
        if (vol) {
            qVol = vol.querySelector('qVol')?.textContent || '0';
            pesoL = vol.querySelector('pesoL')?.textContent || '0,000';
            pesoB = vol.querySelector('pesoB')?.textContent || '0,000';
            if (!isNaN(parseFloat(pesoL))) pesoL = parseFloat(pesoL).toFixed(3);
            if (!isNaN(parseFloat(pesoB))) pesoB = parseFloat(pesoB).toFixed(3);
        }

        let transpHTML = '';
        if (transporta) {
            const tpCNPJ = transporta.querySelector('CNPJ')?.textContent || '';
            const tpNome = transporta.querySelector('xNome')?.textContent || '';
            const tpIE = transporta.querySelector('IE')?.textContent || '';
            const tpEnd = transporta.querySelector('xEnder')?.textContent || '';
            const tpMun = transporta.querySelector('xMun')?.textContent || '';
            const tpUF = transporta.querySelector('UF')?.textContent || '';
            const freteLabel = modFrete === '0' ? 'Emitente' : modFrete === '1' ? 'Destinatário' : modFrete === '2' ? 'Terceiros' : 'Sem frete';
            transpHTML = `
                <div class="transp-section">
                    <table class="transp-table">
                        <tr><th colspan="4">TRANSPORTADOR / VOLUMES TRANSPORTADOS</th></tr>
                        <tr>
                            <td><strong>RAZÃO SOCIAL</strong><br>${tpNome}</td>
                            <td><strong>FRETE POR CONTA</strong><br>${freteLabel}</td>
                            <td><strong>CNPJ/CPF</strong><br>${tpCNPJ}</td>
                            <td><strong>INSCRIÇÃO ESTADUAL</strong><br>${tpIE}</td>
                        </tr>
                        <tr>
                            <td colspan="2"><strong>ENDEREÇO</strong><br>${tpEnd}</td>
                            <td><strong>MUNICÍPIO</strong><br>${tpMun}</td>
                            <td><strong>UF</strong><br>${tpUF}</td>
                        </tr>
                        <tr>
                            <td><strong>QUANTIDADE</strong><br>${qVol}</td>
                            <td><strong>ESPÉCIE</strong><br></td>
                            <td><strong>MARCA</strong><br></td>
                            <td><strong>NUMERAÇÃO</strong><br></td>
                        </tr>
                        <tr>
                            <td><strong>PESO BRUTO</strong><br>${pesoB}</td>
                            <td><strong>PESO LÍQUIDO</strong><br>${pesoL}</td>
                            <td colspan="2"></td>
                        </tr>
                    </table>
                </div>
            `;
        } else {
            transpHTML = `<p><strong>Frete:</strong> ${modFrete === '9' ? 'Sem frete' : 'Não informado'}</p>`;
        }

        const infAdic = infNFe.querySelector('infAdic infCpl')?.textContent || '';

        const html = `
<!DOCTYPE html>
<html>
<head>
    <title>DANFE - ${chave}</title>
    <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"></script>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Courier New', Courier, monospace;
            background: #fff;
            padding: 20px;
            color: #000;
            font-size: 11px;
            line-height: 1.3;
        }
        .danfe {
            max-width: 1000px;
            margin: 0 auto;
            border: 2px solid #000;
            padding: 15px;
            background: #fff;
            position: relative;
        }
        .header {
            border-bottom: 2px solid #000;
            padding-bottom: 8px;
            margin-bottom: 10px;
            text-align: center;
            position: relative;
        }
        .logo-container {
            position: absolute;
            top: 0;
            left: 0;
            width: 60px;
            height: 60px;
        }
        .logo-container img {
            max-width: 100%;
            max-height: 60px;
            object-fit: contain;
        }
        .header .emitente-nome { font-size: 16px; font-weight: bold; }
        .header .emitente-end { font-size: 10px; }
        .header .titulo { font-size: 20px; font-weight: bold; letter-spacing: 2px; }
        .header .subtitulo { font-size: 12px; }
        .chave {
            font-size: 14px;
            font-weight: bold;
            letter-spacing: 2px;
            background: #eee;
            padding: 4px 8px;
            margin: 5px 0;
            border: 1px solid #000;
        }
        .barcode-container {
            text-align: center;
            margin: 5px 0;
        }
        .barcode-container svg {
            max-width: 100%;
            height: auto;
        }
        .recibo {
            border: 1px solid #000;
            padding: 8px;
            margin: 0 0 10px 0;
            font-size: 10px;
            text-align: center;
        }
        .recibo .assinatura {
            margin-top: 10px;
            padding-top: 10px;
            border-top: 1px solid #000;
            display: flex;
            justify-content: space-between;
        }
        .dados-gerais {
            display: flex;
            justify-content: space-between;
            border-top: 1px solid #000;
            border-bottom: 1px solid #000;
            padding: 6px 0;
            margin: 6px 0;
        }
        .dados-gerais > div { width: 48%; }
        .dados-gerais p { margin: 2px 0; }
        .dados-gerais .label { font-weight: bold; }
        .table-produtos {
            width: 100%;
            border-collapse: collapse;
            margin: 10px 0;
            font-size: 10px;
        }
        .table-produtos th, .table-produtos td {
            border: 1px solid #000;
            padding: 3px 4px;
            text-align: center;
        }
        .table-produtos th { background: #ddd; font-weight: bold; }
        .table-produtos td:first-child { width: 30px; }
        .table-produtos td:nth-child(2) { text-align: left; min-width: 200px; }
        .table-produtos td:nth-child(6), .table-produtos td:nth-child(7), .table-produtos td:nth-child(8) { text-align: right; padding-right: 6px; }

        .totais {
            display: flex;
            justify-content: flex-end;
            border-top: 1px solid #000;
            border-bottom: 1px solid #000;
            padding: 6px 0;
            margin: 6px 0;
        }
        .totais > div { margin-left: 30px; text-align: right; }
        .totais .valor-grande { font-size: 14px; font-weight: bold; }

        .transp-section { margin: 10px 0; border-top: 1px solid #000; padding-top: 6px; }
        .transp-table { width: 100%; border-collapse: collapse; }
        .transp-table th, .transp-table td { border: 1px solid #000; padding: 3px 5px; text-align: left; vertical-align: top; }
        .transp-table th { background: #ddd; text-align: center; }

        .dados-adicionais {
            border: 2px solid #000;
            padding: 10px;
            margin: 10px 0;
            font-size: 9px;
            white-space: pre-wrap;
            position: relative;
            background: #fcfcfc;
        }
        .dados-adicionais .titulo {
            font-weight: bold;
            font-size: 10px;
            background: #fff;
            padding: 0 6px;
            position: absolute;
            top: -8px;
            left: 10px;
            border: 1px solid #000;
            background: #fff;
            border-radius: 2px;
        }
        .dados-adicionais .conteudo {
            margin-top: 6px;
            text-align: center;
        }

        .footer {
            text-align: center;
            font-size: 9px;
            border-top: 1px solid #000;
            padding-top: 6px;
            margin-top: 10px;
        }

        .no-print { text-align: center; margin-bottom: 15px; }
        .no-print button { padding: 8px 20px; margin: 0 5px; cursor: pointer; }
        @media print {
            .no-print { display: none; }
            body { padding: 0; }
            .danfe { border: none; padding: 10px; }
        }
    </style>
</head>
<body>
    <div class="no-print">
        <button onclick="window.print()">🖨️ Imprimir DANFE</button>
        <button onclick="window.close()">❌ Fechar</button>
    </div>
    <div class="danfe">
        <div class="recibo">
            <div><strong>RECEBEMOS DE ${emitNome} OS PRODUTOS CONSTANTES DA NOTA FISCAL INDICADA ABAIXO</strong></div>
            <div style="margin-top:5px;">NF-e Nº ${nNF.padStart(6, '0')} - SÉRIE ${serie}</div>
            <div style="margin-top:8px;">DATA DE RECEBIMENTO: ____________________</div>
            <div class="assinatura">
                <span>IDENTIFICAÇÃO E ASSINATURA DO RECEBEDOR _____________________________________________________________________________________________________________</span>
            </div>
        </div>

        <div class="header">
            <div class="logo-container">
                <img src="logo.png" alt="Logo Wheel Tech">
            </div>
            <div class="emitente-nome">${emitNome}</div>
            <div class="emitente-end">${emitLogr}, ${emitNro} - ${emitBairro} - ${emitMun}/${emitUF} - CEP: ${emitCEP} - Fone: ${emitFone}</div>
            <div style="margin-top:6px;">
                <span class="titulo">DANFE</span>
                <span class="subtitulo">Documento Auxiliar da Nota Fiscal Eletrônica</span>
            </div>
            <div style="display:flex; justify-content:space-between; margin-top:4px;">
                <span><strong>1 - SAÍDA</strong></span>
                <span><strong>Nº ${nNF.padStart(6, '0')}</strong> | SÉRIE ${serie} | FOLHA 1/1</span>
            </div>
            <div class="chave">CHAVE DE ACESSO: ${chave.replace(/(.{4})/g, '$1 ')}</div>
            <div style="font-size:9px;">Consulta: www.nfe.fazenda.gov.br/portal ou site da Sefaz Autorizadora</div>
            <div style="margin-top:2px;"><strong>Protocolo:</strong> ${protocolo}</div>
            <div class="barcode-container">
                <svg id="barcode"></svg>
            </div>
        </div>

        <div class="dados-gerais">
            <div>
                <p><span class="label">NATUREZA DA OPERAÇÃO</span><br>${natOp}</p>
                <p><span class="label">INSCRIÇÃO ESTADUAL</span><br>${emitIE}</p>
                <p><span class="label">CNPJ/CPF</span><br>${emitCNPJ}</p>
            </div>
            <div>
                <p><span class="label">DESTINATÁRIO / REMETENTE</span><br>${destNome}</p>
                <p><span class="label">ENDEREÇO</span><br>${destLogr}, ${destNro} - ${destBairro} - ${destMun}/${destUF}</p>
                <p><span class="label">CNPJ/CPF</span><br>${destDoc}</p>
                <p><span class="label">DATA DA EMISSÃO</span><br>${dhEmi.split('T')[0].replace(/-/g, '/')}</p>
                <p><span class="label">DATA DA SAÍDA/ENTRADA</span><br>${dhSaiEnt.split('T')[0].replace(/-/g, '/')}</p>
                <p><span class="label">HORA DE SAÍDA</span><br>${dhSaiEnt.split('T')[1]?.substring(0,5) || ''}</p>
            </div>
        </div>

        <div style="display:flex; justify-content:space-between; border:1px solid #000; padding:4px 8px; margin:6px 0;">
            <div><strong>BASE DE CÁLCULO DO ICMS</strong><br>0,00</div>
            <div><strong>VALOR DO ICMS</strong><br>0,00</div>
            <div><strong>BASE DE CÁLCULO DO ICMS ST</strong><br>0,00</div>
            <div><strong>VALOR DO ICMS ST</strong><br>0,00</div>
            <div><strong>VALOR TOTAL DOS PRODUTOS</strong><br>${parseFloat(vProdTotal).toFixed(2)}</div>
        </div>
        <div style="display:flex; justify-content:space-between; border:1px solid #000; padding:4px 8px; margin-bottom:6px;">
            <div><strong>VALOR DO FRETE</strong><br>${parseFloat(vFrete).toFixed(2)}</div>
            <div><strong>VALOR DO SEGURO</strong><br>${parseFloat(vSeg).toFixed(2)}</div>
            <div><strong>DESCONTO</strong><br>${parseFloat(vDesc).toFixed(2)}</div>
            <div><strong>OUTRAS DESPESAS</strong><br>0,00</div>
            <div><strong>VALOR DO IPI</strong><br>0,00</div>
            <div><strong>VALOR TOTAL DA NOTA</strong><br>${parseFloat(vNF).toFixed(2)}</div>
        </div>

        <table class="table-produtos">
            <thead>
                <tr>
                    <th>CÓDIGO</th>
                    <th>DESCRIÇÃO DOS PRODUTOS / SERVIÇOS</th>
                    <th>NCM/SH</th>
                    <th>CFOP</th>
                    <th>UNID.</th>
                    <th>QTD.</th>
                    <th>VLR UNIT.</th>
                    <th>VALOR TOTAL</th>
                </tr>
            </thead>
            <tbody>${produtosHTML}</tbody>
        </table>

        ${transpHTML}

        <div class="dados-adicionais">
            <div class="titulo">DADOS ADICIONAIS</div>
            <div class="conteudo">${infAdic || 'Nenhuma informação complementar.'}</div>
        </div>

        <div class="footer">
            <p>Documento gerado eletronicamente - Sistema Wheel Tech</p>
            <p>Chave: ${chave}</p>
        </div>
    </div>

    <script>
        JsBarcode("#barcode", "${chave}", {
            format: "CODE128",
            width: 1.2,
            height: 40,
            displayValue: false,
            fontSize: 12,
            background: "#ffffff",
            lineColor: "#000000"
        });
    </script>
</body>
</html>`;

        const win = window.open('', '_blank', 'width=1000,height=800');
        win.document.write(html);
        win.document.close();

    } catch (error) {
        console.error('Erro ao visualizar NF-e:', error);
        window.showToast('Erro ao visualizar NF-e', 'error');
    }
}

async function baixarXMLNFE(chaveAcesso) {
    try {
        const response = await fetch(`${window.API_BASE_URL}/nfe/buscar-xml?chave=${chaveAcesso}`);
        const data = await response.json();
        if (!data.xml) {
            window.showToast('XML não encontrado', 'error');
            return;
        }
        const blob = new Blob([data.xml], { type: 'application/xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `NFe_${chaveAcesso}.xml`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (error) {
        window.showToast('Erro ao baixar XML', 'error');
    }
}

async function cancelarNFE(chaveAcesso) {
    const justificativa = prompt('Informe a justificativa para cancelamento:');
    if (!justificativa) return;
    try {
        const response = await fetch(`${window.API_BASE_URL}/nfe/cancelar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chaveAcesso, justificativa })
        });
        const result = await response.json();
        if (result.success) {
            window.showToast('NF-e cancelada com sucesso', 'success');
            await carregarNFesEmitidas();
        } else {
            window.showToast('Erro ao cancelar: ' + result.error, 'error');
        }
    } catch (error) {
        window.showToast('Erro de comunicação', 'error');
    }
}

// ===================== TRANSPORTADORAS =====================
async function carregarTransportadoras() {
    const tbody = document.getElementById('transportadorasBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="4" class="text-center"><div class="spinner"></div> Carregando...<\/td><\/tr>';
    try {
        const response = await fetch(`${window.API_BASE_URL}/nfe/transportadoras`);
        const data = await response.json();
        if (!data.success) throw new Error(data.error);
        const transportadoras = data.transportadoras || [];
        if (!transportadoras.length) {
            tbody.innerHTML = '<td><td colspan="4" class="text-center">Nenhuma transportadora cadastrada<\/td><\/tr>';
            return;
        }
        tbody.innerHTML = transportadoras.map(t => `
            <tr>
                <td>${t.nome}<\/td>
                <td>${t.cnpj}<\/td>
                <td>${t.ie || '-'}<\/td>
                <td><button class="btn btn-sm btn-danger" onclick="excluirTransportadora(${t.id})">Excluir<\/button><\/td>
            </tr>`).join('');
        const select = document.getElementById('avulsaTransportadoraId');
        if (select) select.innerHTML = '<option value="">Selecione</option>' + transportadoras.map(t => `<option value="${t.id}">${t.nome}</option>`).join('');
    } catch (error) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center text-danger">Erro ao carregar<\/td><\/tr>';
    }
}

async function excluirTransportadora(id) {
    if (!confirm('Excluir esta transportadora?')) return;
    try {
        const response = await fetch(`${window.API_BASE_URL}/nfe/transportadoras/${id}`, { method: 'DELETE' });
        if (response.ok) {
            window.showToast('Transportadora excluída', 'success');
            await carregarTransportadoras();
        } else {
            window.showToast('Erro ao excluir', 'error');
        }
    } catch (error) {
        window.showToast('Erro de comunicação', 'error');
    }
}

function abrirModalTransportadora() {
    let modal = document.getElementById('modalNovaTransportadora');
    if (modal) {
        modal.classList.remove('hidden');
        return;
    }

    const modalHTML = `
    <div id="modalNovaTransportadora" class="modal" style="display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,0.5); z-index:9999;">
        <div class="modal-content" style="max-width:500px; width:90%; background:white; padding:25px; border-radius:8px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
                <h3 style="margin:0;"><i class="fas fa-truck"></i> Nova Transportadora</h3>
                <button onclick="fecharModalTransportadora()" style="background:none; border:none; font-size:24px; cursor:pointer;">&times;</button>
            </div>
            <form id="formNovaTransportadora">
                <div class="form-group">
                    <label>Nome *</label>
                    <input type="text" id="novaTransportadoraNome" class="form-control" required>
                </div>
                <div class="form-group">
                    <label>CNPJ * (apenas números)</label>
                    <input type="text" id="novaTransportadoraCnpj" class="form-control" placeholder="00000000000000" required>
                </div>
                <div class="form-group">
                    <label>Inscrição Estadual</label>
                    <input type="text" id="novaTransportadoraIe" class="form-control">
                </div>
                <div class="form-group">
                    <label>Endereço</label>
                    <input type="text" id="novaTransportadoraEndereco" class="form-control">
                </div>
                <div class="row">
                    <div class="col-md-6">
                        <div class="form-group">
                            <label>Cidade</label>
                            <input type="text" id="novaTransportadoraCidade" class="form-control">
                        </div>
                    </div>
                    <div class="col-md-6">
                        <div class="form-group">
                            <label>UF</label>
                            <input type="text" id="novaTransportadoraUf" class="form-control" maxlength="2">
                        </div>
                    </div>
                </div>
                <div class="d-flex justify-content-end gap-2 mt-3">
                    <button type="button" class="btn btn-secondary" onclick="fecharModalTransportadora()">Cancelar</button>
                    <button type="button" class="btn btn-success" onclick="salvarNovaTransportadora()"><i class="fas fa-save"></i> Salvar</button>
                </div>
            </form>
        </div>
    </div>`;

    const container = document.createElement('div');
    container.innerHTML = modalHTML;
    document.body.appendChild(container.firstElementChild);
}

function fecharModalTransportadora() {
    const modal = document.getElementById('modalNovaTransportadora');
    if (modal) modal.classList.add('hidden');
}

async function salvarNovaTransportadora() {
    const nome = document.getElementById('novaTransportadoraNome').value.trim();
    const cnpj = document.getElementById('novaTransportadoraCnpj').value.trim().replace(/\D/g, '');
    const ie = document.getElementById('novaTransportadoraIe').value.trim();
    const endereco = document.getElementById('novaTransportadoraEndereco').value.trim();
    const cidade = document.getElementById('novaTransportadoraCidade').value.trim();
    const uf = document.getElementById('novaTransportadoraUf').value.trim().toUpperCase();

    if (!nome || !cnpj) {
        showToast('Nome e CNPJ são obrigatórios', 'warning');
        return;
    }
    if (cnpj.length !== 14) {
        showToast('CNPJ deve ter 14 dígitos', 'warning');
        return;
    }

    const payload = { nome, cnpj, ie, endereco, cidade, uf };

    try {
        const response = await fetch(`${window.API_BASE_URL}/nfe/transportadoras`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const result = await response.json();
        if (result.success) {
            showToast('Transportadora cadastrada com sucesso!', 'success');
            fecharModalTransportadora();
            await carregarTransportadoras();
            await carregarTransportadorasSelect();
        } else {
            showToast('Erro: ' + result.error, 'error');
        }
    } catch (error) {
        console.error(error);
        showToast('Erro ao salvar transportadora', 'error');
    }
}

async function carregarTransportadorasSelect() {
    const select = document.getElementById('nfeTransportadora');
    if (!select) return;
    try {
        const response = await fetch(`${window.API_BASE_URL}/nfe/transportadoras`);
        const data = await response.json();
        if (!data.success) throw new Error(data.error);
        const transportadoras = data.transportadoras || [];
        select.innerHTML = '<option value="">Selecione uma transportadora</option>' +
            transportadoras.map(t => `<option value="${t.id}">${t.nome} (${t.cnpj})</option>`).join('');
    } catch (error) {
        console.error('Erro ao carregar transportadoras:', error);
    }
}

// ===================== CLIENTES =====================
async function carregarClientes() {
    const tbody = document.getElementById('clientesBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="4" class="text-center"><div class="spinner"></div> Carregando...<\/td><\/tr>';
    try {
        const response = await fetch(`${window.API_BASE_URL}/nfe/clientes`);
        const data = await response.json();
        if (!data.success) throw new Error(data.error);
        const clientes = data.clientes || [];
        if (!clientes.length) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center">Nenhum cliente cadastrado<\/td><\/tr>';
            return;
        }
        tbody.innerHTML = clientes.map(c => `
            <tr>
                <td>${c.nome}<\/td>
                <td>${c.documento || '-'}<\/td>
                <td>${c.logradouro || ''}, ${c.numero || ''} - ${c.cidade || ''}<\/td>
                <td>
                <button class="btn btn-sm btn-info" onclick="visualizarCliente(${c.id})" title="Ver detalhes">
                <i class="fas fa-eye"></i>
                </button>
                <button class="btn btn-sm btn-danger" onclick="excluirCliente(${c.id})">Excluir<\/button><\/td>
            </tr>`).join('');
        const select = document.getElementById('avulsaClienteId');
        if (select) select.innerHTML = '<option value="">Selecione</option>' + clientes.map(c => `<option value="${c.id}">${c.nome} (${c.documento})</option>`).join('');
    } catch (error) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center text-danger">Erro ao carregar<\/td><\/tr>';
    }
}

async function excluirCliente(id) {
    if (!confirm('Excluir este cliente?')) return;
    try {
        const response = await fetch(`${window.API_BASE_URL}/nfe/clientes/${id}`, { method: 'DELETE' });
        if (response.ok) {
            window.showToast('Cliente excluído', 'success');
            await carregarClientes();
        } else {
            window.showToast('Erro ao excluir', 'error');
        }
    } catch (error) {
        window.showToast('Erro de comunicação', 'error');
    }
}

window.visualizarCliente = async function(id) {
    try {
        const response = await fetch(`${API_BASE_URL}/nfe/clientes/${id}`);
        const data = await response.json();
        if (!data.success) throw new Error(data.error);
        const cliente = data.cliente;

        const modalContent = `
            <div style="padding: 10px;">
                <h4>${cliente.nome}</h4>
                <p><strong>Documento:</strong> ${cliente.documento || '-'}</p>
                <p><strong>Endereço:</strong> ${cliente.logradouro || ''}, ${cliente.numero || 'S/N'} - ${cliente.bairro || ''}</p>
                <p><strong>Cidade/UF:</strong> ${cliente.cidade || ''} / ${cliente.uf || ''}</p>
                <p><strong>CEP:</strong> ${cliente.cep || ''}</p>
            </div>
        `;

        showModalDialog('Detalhes do Cliente', modalContent);
    } catch (error) {
        console.error('Erro ao buscar cliente:', error);
        showToast('Erro ao carregar dados do cliente', 'error');
    }
};

// ===================== EMISSÃO AVULSA =====================
async function emitirNFEAvulsa() {
    const clienteId = document.getElementById('avulsaClienteId').value;
    if (!clienteId) {
        window.showToast('Selecione um cliente', 'warning');
        return;
    }
    const transportadoraId = document.getElementById('avulsaTransportadoraId').value || null;
    const cfop = document.getElementById('avulsaCfop').value;
    const natOp = document.getElementById('avulsaNatOp').value;
    const modFrete = document.getElementById('avulsaModFrete').value;
    let produtos;
    try {
        produtos = JSON.parse(document.getElementById('avulsaProdutos').value);
        if (!Array.isArray(produtos) || !produtos.length) throw new Error();
    } catch (e) {
        window.showToast('Produtos inválidos. Use um array JSON válido.', 'error');
        return;
    }
    const dados = { cliente: { id: clienteId }, produtos, cfop, natureza_operacao: natOp, modalidade_frete: modFrete, transportadora_id: transportadoraId };
    const btn = event.target;
    const original = btn.innerHTML;
    btn.innerHTML = '<span class="spinner"></span> Emitindo...';
    btn.disabled = true;
    try {
        const response = await fetch(`${window.API_BASE_URL}/nfe/emitir-avulsa`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dados)
        });
        const result = await response.json();
        if (result.success) {
            window.showToast('NF-e avulsa emitida com sucesso!', 'success');
            limparFormAvulsa();
            await carregarNFesEmitidas();
        } else {
            window.showToast('Erro: ' + result.error, 'error');
        }
    } catch (error) {
        window.showToast('Erro de comunicação', 'error');
    } finally {
        btn.innerHTML = original;
        btn.disabled = false;
    }
}

function limparFormAvulsa() {
    document.getElementById('avulsaClienteId').value = '';
    document.getElementById('avulsaTransportadoraId').value = '';
    document.getElementById('avulsaCfop').value = '5102';
    document.getElementById('avulsaNatOp').value = 'VENDA';
    document.getElementById('avulsaModFrete').value = '9';
    document.getElementById('avulsaProdutos').value = '';
}

async function sincronizarVendasML() {
    window.showToast('A sincronização de vendas é feita automaticamente ao acessar a aba. Use o botão "Emitir NF-e" para cada venda.', 'info');
}

function inicializarAbaNFE() {
    // 🔥 MOSTRA APENAS O QUE ESTÁ NO BANCO (sem sincronizar)
    mostrarAbaNFE('vendas');
}

// =========================================================
// FUNÇÃO PARA VERIFICAR SE VENDA TEM NF-e NO MERCADO LIVRE
// =========================================================

async function verificarNFEMercadoLivre(orderId) {
    try {
        console.log(`🔍 Verificando NF-e no Mercado Livre para venda ${orderId}...`);
        
        let token = localStorage.getItem('ml_access_token');
        if (!token && typeof window.getValidToken === 'function') {
            const tokenData = await window.getValidToken();
            token = tokenData?.access_token;
        }
        if (!token) {
            console.warn('⚠️ Token ML não disponível');
            return null;
        }

        // Buscar invoices da venda
        const url = `https://api.mercadolibre.com/users/415176739/invoices/orders/${orderId}`;
        const proxyUrl = `${window.WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(url)}&token=${encodeURIComponent(token)}`;
        const response = await fetch(proxyUrl);
        
        if (!response.ok) {
            // Se for 404, significa que não tem invoice (NF-e não emitida)
            if (response.status === 404) {
                console.log(`ℹ️ Venda ${orderId} NÃO tem NF-e emitida (404)`);
                return {
                    tem_nfe: false,
                    status: 'nao_emitida',
                    status_descricao: 'NF-e não emitida'
                };
            }
            console.warn(`⚠️ Erro ao buscar invoices da venda ${orderId}: ${response.status}`);
            return null;
        }
        
        const data = await response.json();
        console.log(`📋 Invoices da venda ${orderId}:`, data);
        
        // Se não houver invoices ou for um array vazio
        if (!data || (Array.isArray(data) && data.length === 0)) {
            console.log(`ℹ️ Venda ${orderId} NÃO tem NF-e emitida`);
            return {
                tem_nfe: false,
                status: 'nao_emitida',
                status_descricao: 'NF-e não emitida'
            };
        }
        
        // Se for um objeto único (invoice única)
        const invoices = Array.isArray(data) ? data : [data];
        
        // ===== VERIFICAR STATUS DA NF-e =====
        // Status possíveis:
        // - authorized: NF-e autorizada (pronta para coleta/impressão)
        // - pending: pendente
        // - canceled: cancelada
        // - rejected: rejeitada
        // - processing: processando
        // - in_progress: em andamento
        // - waiting: aguardando
        
        // Status que indicam que a NF-e está emitida e válida
        const statusEmitida = ['authorized', 'AUTHORIZED', 'approved', 'APPROVED', 'completed', 'COMPLETED'];
        const statusPendente = ['pending', 'PENDING', 'processing', 'PROCESSING', 'in_progress', 'IN_PROGRESS', 'waiting', 'WAITING'];
        const statusCancelada = ['canceled', 'CANCELED', 'cancelled', 'CANCELLED', 'rejected', 'REJECTED'];
        
        let statusAtual = 'desconhecido';
        let statusDescricao = 'Status desconhecido';
        let temNFE = false;
        let detalhesNFE = null;
        
        // Verificar cada invoice
        for (const invoice of invoices) {
            const invoiceStatus = invoice.status || invoice.transaction_status || '';
            const statusLower = invoiceStatus.toLowerCase();
            
            console.log(`📄 Invoice status: "${invoiceStatus}"`);
            
            // Verificar se é uma NF-e de venda (SALE) ou devolução
            const tipoOperacao = invoice.transaction_type || invoice.type || '';
            const isSale = tipoOperacao.toLowerCase().includes('sale') || 
                          tipoOperacao.toLowerCase().includes('venda') ||
                          invoice.items?.some(item => item.external_order_id);
            
            // Verificar se está autorizada (emitida)
            if (statusEmitida.some(s => statusLower === s.toLowerCase())) {
                statusAtual = 'authorized';
                statusDescricao = '✅ NF-e autorizada (pronta para coleta/impressão)';
                temNFE = true;
                detalhesNFE = {
                    id: invoice.id,
                    status: invoiceStatus,
                    transaction_status: invoice.transaction_status,
                    issued_date: invoice.issued_date,
                    invoice_number: invoice.invoice_number,
                    invoice_series: invoice.invoice_series,
                    xml_location: invoice.attributes?.xml_location || invoice.xml_location,
                    danfe: invoice.attributes?.danfe || invoice.danfe,
                    transaction_type: tipoOperacao
                };
                break;
            }
            
            // Verificar se está pendente (ainda não autorizada)
            if (statusPendente.some(s => statusLower === s.toLowerCase())) {
                statusAtual = 'pending';
                statusDescricao = '⏳ NF-e pendente (aguardando autorização)';
                temNFE = false;
                detalhesNFE = {
                    id: invoice.id,
                    status: invoiceStatus,
                    transaction_status: invoice.transaction_status,
                    issued_date: invoice.issued_date,
                    transaction_type: tipoOperacao
                };
                // Não quebra o loop, pode ter outra invoice autorizada
            }
            
            // Verificar se está cancelada
            if (statusCancelada.some(s => statusLower === s.toLowerCase())) {
                statusAtual = 'canceled';
                statusDescricao = '❌ NF-e cancelada';
                temNFE = false;
                detalhesNFE = {
                    id: invoice.id,
                    status: invoiceStatus,
                    transaction_status: invoice.transaction_status,
                    issued_date: invoice.issued_date,
                    transaction_type: tipoOperacao
                };
            }
        }
        
        // Se encontrou alguma invoice autorizada
        if (temNFE) {
            console.log(`✅ Venda ${orderId} tem NF-e autorizada!`);
            return {
                tem_nfe: true,
                status: 'authorized',
                status_descricao: statusDescricao,
                invoice: detalhesNFE,
                invoices: invoices
            };
        }
        
        // Se tem invoice pendente
        if (statusAtual === 'pending') {
            console.log(`⏳ Venda ${orderId} tem NF-e pendente`);
            return {
                tem_nfe: false,
                status: 'pending',
                status_descricao: statusDescricao,
                invoice: detalhesNFE,
                invoices: invoices
            };
        }
        
        // Se tem invoice cancelada
        if (statusAtual === 'canceled') {
            console.log(`❌ Venda ${orderId} tem NF-e cancelada`);
            return {
                tem_nfe: false,
                status: 'canceled',
                status_descricao: statusDescricao,
                invoice: detalhesNFE,
                invoices: invoices
            };
        }
        
        // Caso tenha invoices mas nenhuma com status reconhecido
        console.log(`ℹ️ Venda ${orderId} tem invoices mas nenhuma autorizada`);
        return {
            tem_nfe: false,
            status: 'nao_autorizada',
            status_descricao: 'NF-e não autorizada',
            invoices: invoices
        };
        
    } catch (error) {
        console.error(`❌ Erro ao verificar NF-e no ML para ${orderId}:`, error);
        return null;
    }
}


// =========================================================
// ATUALIZAR LISTA DE VENDAS NA ABA NF-E
// =========================================================
async function atualizarListaNFE() {
    const btn = document.getElementById('btnAtualizarNFE');
    if (btn) {
        btn.innerHTML = '<span class="spinner"></span> Sincronizando...';
        btn.disabled = true;
    }

    try {
        // 🔥 CHAMA A FUNÇÃO QUE VERIFICA TOKEN E SINCRONIZA
        await carregarVendasPendentes();

    } catch (error) {
        console.error('❌ Erro ao sincronizar:', error);
        showToast('Erro ao sincronizar vendas', 'error');
    } finally {
        if (btn) {
            btn.innerHTML = '<i class="fas fa-sync-alt"></i> Atualizar Lista';
            btn.disabled = false;
        }
    }
}

window.atualizarListaNFE = atualizarListaNFE;

// ===================== EXPORTAÇÕES GLOBAIS =====================
window.mostrarAbaNFE = mostrarAbaNFE;
window.emitirNFEParaVenda = emitirNFEParaVenda;
window.sincronizarVendasML = sincronizarVendasML;
window.carregarNFesEmitidas = carregarNFesEmitidas;
window.visualizarNFE = visualizarNFE;
window.baixarXMLNFE = baixarXMLNFE;
window.cancelarNFE = cancelarNFE;
window.emitirNFEAvulsa = emitirNFEAvulsa;
window.limparFormAvulsa = limparFormAvulsa;
window.inicializarAbaNFE = inicializarAbaNFE;
window.confirmarEmissaoNFE = confirmarEmissaoNFE;
window.fecharModalDadosClienteNFE = fecharModalDadosClienteNFE;
window.isFullByAnyField = isFullByAnyField;
window.abrirModalEdicaoProdutos = abrirModalEdicaoProdutos;
window.fecharModalEdicaoProdutos = fecharModalEdicaoProdutos;
window.confirmarProdutosEditados = confirmarProdutosEditados;
window.abrirModalTransportadora = abrirModalTransportadora;
window.fecharModalTransportadora = fecharModalTransportadora;
window.salvarNovaTransportadora = salvarNovaTransportadora;
window.salvarVendaNoSupabase = salvarVendaNoSupabase;
window.carregarVendasDoSupabase = carregarVendasDoSupabase;
window.sincronizarVendasComSupabase = sincronizarVendasComSupabase;
window.atualizarListaNFE = atualizarListaNFE;

// ===================== INICIALIZAR EVENT LISTENERS DO MODAL =====================
document.addEventListener('DOMContentLoaded', function() {
    // Botões do modal (fallback)
    const confirmarBtn = document.getElementById('confirmarModalNFEBtn');
    const cancelarBtn = document.getElementById('cancelarModalNFEBtn');
    
    if (confirmarBtn) {
        confirmarBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            console.log('🔵 DOMContentLoaded - Confirmar clicado');
            confirmarEmissaoNFE();
        });
    }
    
    if (cancelarBtn) {
        cancelarBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            console.log('🔵 DOMContentLoaded - Cancelar clicado');
            fecharModalDadosClienteNFE();
        });
    }
    
    console.log('✅ Event listeners do DOMContentLoaded configurados');
});

console.log('✅ nfe_manager.js carregado (versão completa com fallback)');