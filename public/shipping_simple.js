// shipping_simple.js - VERSÃO COMPLETA CORRIGIDA (v35)
// Sistema completo de reclamações de frete

console.log('🚚 shipping_simple.js carregado (v35)');

if (typeof window.WORKER_URL === 'undefined') {
    window.WORKER_URL = 'https://purple-bonus-3b1c.andmiotto1998.workers.dev';
}

// ============================================
// TABELA DE CUSTOS DE FRETE
// ============================================
const SHIPPING_COST_TABLE = [
    { priceMin: 0,    priceMax: 18.99,   weightMin: 0,    weightMax: 0.3,   cost: 5.65 },
    { priceMin: 19,    priceMax: 48.99,   weightMin: 0,    weightMax: 0.3,   cost: 6.55 },
    { priceMin: 49,    priceMax: 78.99,   weightMin: 0,    weightMax: 0.3,   cost: 7.75 },
    { priceMin: 79,    priceMax: 99.99,   weightMin: 0,    weightMax: 0.3,   cost: 12.35 },
    { priceMin: 100,    priceMax: 119.99,   weightMin: 0,    weightMax: 0.3,   cost: 14.35 },
    { priceMin: 120,    priceMax: 149.99,   weightMin: 0,    weightMax: 0.3,   cost: 16.45 },
    { priceMin: 150,    priceMax: 199.99,   weightMin: 0,    weightMax: 0.3,   cost: 18.45 },
    { priceMin: 200,    priceMax: 10000,   weightMin: 0,    weightMax: 0.3,   cost: 20.95 },
    { priceMin: 0,    priceMax: 18.99,   weightMin: 0.3,    weightMax: 0.5,   cost: 5.95 },
    { priceMin: 19,    priceMax: 48.99,   weightMin: 0.3,    weightMax: 0.5,   cost: 6.65 },
    { priceMin: 49,    priceMax: 78.99,   weightMin: 0.3,    weightMax: 0.5,   cost: 7.85 },
    { priceMin: 79,    priceMax: 99.99,   weightMin: 0.3,    weightMax: 0.5,   cost: 13.25 },
    { priceMin: 100,    priceMax: 119.99,   weightMin: 0.3,    weightMax: 0.5,   cost: 15.45 },
    { priceMin: 120,    priceMax: 149.99,   weightMin: 0.3,    weightMax: 0.5,   cost: 17.65 },
    { priceMin: 150,    priceMax: 199.99,   weightMin: 0.3,    weightMax: 0.5,   cost: 19.85 },
    { priceMin: 200,    priceMax: 10000,   weightMin: 0.3,    weightMax: 0.5,   cost: 22.55 },
    { priceMin: 0,    priceMax: 18.99,   weightMin: 0.5,    weightMax: 1,   cost: 6.05 },
    { priceMin: 19,    priceMax: 48.99,   weightMin: 0.5,    weightMax: 1,   cost: 6.75 },
    { priceMin: 49,    priceMax: 78.99,   weightMin: 0.5,    weightMax: 1,   cost: 7.95 },
    { priceMin: 79,    priceMax: 99.99,   weightMin: 0.5,    weightMax: 1,   cost: 13.85 },
    { priceMin: 100,    priceMax: 119.99,   weightMin: 0.5,    weightMax: 1,   cost: 16.15 },
    { priceMin: 120,    priceMax: 149.99,   weightMin: 0.5,    weightMax: 1,   cost: 18.45 },
    { priceMin: 150,    priceMax: 199.99,   weightMin: 0.5,    weightMax: 1,   cost: 20.75 },
    { priceMin: 200,    priceMax: 10000,   weightMin: 0.5,    weightMax: 1,   cost: 23.65 },
    { priceMin: 0,    priceMax: 18.99,   weightMin: 1,    weightMax: 1.5,   cost: 6.15 },
    { priceMin: 19,    priceMax: 48.99,   weightMin: 1,    weightMax: 1.5,   cost: 6.85 },
    { priceMin: 49,    priceMax: 78.99,   weightMin: 1,    weightMax: 1.5,   cost: 8.05 },
    { priceMin: 79,    priceMax: 99.99,   weightMin: 1,    weightMax: 1.5,   cost: 14.15 },
    { priceMin: 100,    priceMax: 119.99,   weightMin: 1,    weightMax: 1.5,   cost: 16.45 },
    { priceMin: 120,    priceMax: 149.99,   weightMin: 1,    weightMax: 1.5,   cost: 18.85 },
    { priceMin: 150,    priceMax: 199.99,   weightMin: 1,    weightMax: 1.5,   cost: 21.15 },
    { priceMin: 200,    priceMax: 10000,   weightMin: 1,    weightMax: 1.5,   cost: 24.65 },
    { priceMin: 0,    priceMax: 18.99,   weightMin: 1.5,    weightMax: 2,   cost: 6.25 },
    { priceMin: 19,    priceMax: 48.99,   weightMin: 1.5,    weightMax: 2,   cost: 6.95 },
    { priceMin: 49,    priceMax: 78.99,   weightMin: 1.5,    weightMax: 2,   cost: 8.15 },
    { priceMin: 79,    priceMax: 99.99,   weightMin: 1.5,    weightMax: 2,   cost: 14.45 },
    { priceMin: 100,    priceMax: 119.99,   weightMin: 1.5,    weightMax: 2,   cost: 16.85 },
    { priceMin: 120,    priceMax: 149.99,   weightMin: 1.5,    weightMax: 2,   cost: 19.25 },
    { priceMin: 150,    priceMax: 199.99,   weightMin: 1.5,    weightMax: 2,   cost: 21.65 },
    { priceMin: 200,    priceMax: 10000,   weightMin: 1.5,    weightMax: 2,   cost: 24.65 }
];

// ============================================
// VARIÁVEIS GLOBAIS
// ============================================
let filtroStatusReclamacao = 'todos';
let reclamacoesCache = [];
let protocolosTemp = [];

// ============================================
// FUNÇÕES AUXILIARES
// ============================================
function isFullByAnyField(item) {
    const text = `${item.titulo || ''} ${item.mlb || ''} ${item.id || ''}`.toLowerCase();
    return /full|fulfillment/.test(text);
}

function calcularFreteEsperado(valorProduto, peso) {
    const pesoArredondado = Math.round(peso * 100) / 100;
    const valor = parseFloat(valorProduto);
    if (isNaN(valor) || isNaN(pesoArredondado) || pesoArredondado <= 0) return null;

    for (const faixa of SHIPPING_COST_TABLE) {
        if (pesoArredondado >= faixa.weightMin && pesoArredondado <= faixa.weightMax) {
            if (valor >= faixa.priceMin && valor <= faixa.priceMax) {
                return faixa.cost;
            }
        }
    }
    return null;
}

function calcularPesoVolumetrico(comprimento, largura, altura) {
    const cm3 = comprimento * largura * altura;
    return cm3 / 6000;
}

function getNomeUsuario() {
    if (window.currentUser && window.currentUser.name) {
        return window.currentUser.name;
    }
    try {
        const userData = localStorage.getItem('wheeltech_user');
        if (userData) {
            const user = JSON.parse(userData);
            if (user.name) return user.name;
        }
    } catch (e) {}
    return 'Sistema';
}

// ============================================
// TOAST CORRIGIDO (sem recursão)
// ============================================
function showToast(mensagem, tipo = 'info') {
    // Verificar se já existe um toast e remover
    const toastExistente = document.querySelector('.custom-toast');
    if (toastExistente) {
        toastExistente.remove();
    }
    
    const toast = document.createElement('div');
    toast.className = 'custom-toast';
    toast.style.cssText = `
        position: fixed; 
        bottom: 20px; 
        right: 20px; 
        padding: 12px 20px;
        background: ${tipo === 'success' ? '#28a745' : tipo === 'error' ? '#dc3545' : tipo === 'warning' ? '#ffc107' : '#17a2b8'};
        color: ${tipo === 'warning' ? '#212529' : 'white'};
        border-radius: 8px; 
        z-index: 99999; 
        max-width: 400px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        font-size: 14px;
        animation: slideIn 0.3s ease;
    `;
    toast.innerHTML = mensagem;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        if (toast.parentNode) {
            toast.remove();
        }
    }, 4000);
}

// ============================================
// BUSCAR MEDIDAS SALVAS POR SKU
// ============================================
async function buscarMedidasPorSKU(sku) {
    if (!sku || sku === 'N/A' || sku === 'SEM SKU') return null;
    try {
        const { data, error } = await window.supabaseClient
            .from('produto_medidas')
            .select('*')
            .eq('sku', sku)
            .maybeSingle();
        if (error) throw error;
        return data;
    } catch (error) {
        console.warn(`Erro ao buscar medidas para SKU ${sku}:`, error.message);
        return null;
    }
}

// ============================================
// SALVAR MEDIDAS POR SKU
// ============================================
async function salvarMedidasSKU(sku, comprimento, largura, altura, peso, fotoUrl = null) {
    if (!sku || sku === 'N/A' || sku === 'SEM SKU') {
        showToast('SKU inválido para salvar medidas', 'warning');
        return false;
    }

    try {
        const dados = {
            sku: sku,
            comprimento_cm: comprimento,
            largura_cm: largura,
            altura_cm: altura,
            peso_kg: peso,
            atualizado_em: new Date().toISOString()
        };
        if (fotoUrl) dados.foto_url = fotoUrl;

        const { data: existente } = await window.supabaseClient
            .from('produto_medidas')
            .select('sku')
            .eq('sku', sku)
            .maybeSingle();

        let result;
        if (existente) {
            result = await window.supabaseClient
                .from('produto_medidas')
                .update(dados)
                .eq('sku', sku);
        } else {
            dados.criado_em = new Date().toISOString();
            result = await window.supabaseClient
                .from('produto_medidas')
                .insert([dados]);
        }

        if (result.error) throw result.error;
        showToast(`Medidas salvas para SKU ${sku}`, 'success');
        return true;
    } catch (error) {
        console.error('Erro ao salvar medidas:', error);
        showToast('Erro ao salvar medidas: ' + error.message, 'error');
        return false;
    }
}

// ============================================
// FUNÇÃO PARA BUSCAR VENDAS ML
// ============================================
async function buscarVendasMLFrete(limit = 50) {
    console.log('🔍 Buscando vendas para análise de frete...');
    
    try {
        if (typeof window.buscarVendasML === 'function') {
            console.log('✅ Usando window.buscarVendasML da aba de vendas');
            const resultado = await window.buscarVendasML(limit);
            
            if (Array.isArray(resultado)) {
                return { vendas: resultado };
            }
            if (resultado && resultado.vendas) {
                return resultado;
            }
            if (resultado && resultado.data) {
                return { vendas: resultado.data };
            }
            if (resultado) {
                for (const key of Object.keys(resultado)) {
                    if (Array.isArray(resultado[key]) && resultado[key].length > 0) {
                        return { vendas: resultado[key] };
                    }
                }
            }
        }
        
        console.log('🔄 Usando fallback para buscar vendas');
        const tokenData = await window.getValidToken();
        const token = tokenData?.access_token;
        if (!token) {
            throw new Error('Token ML não disponível');
        }

        const url = `https://api.mercadolibre.com/orders/search?limit=${limit}&sort=date_desc&status=paid`;
        const proxyUrl = `${window.WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(url)}&token=${encodeURIComponent(token)}`;
        
        console.log('📡 Buscando pedidos pagos...');
        const response = await fetch(proxyUrl);
        if (!response.ok) {
            if (response.status === 403) {
                console.warn('⚠️ Token rejeitado, tentando renovar...');
                if (window.forceTokenRefresh) {
                    await window.forceTokenRefresh();
                    const newTokenData = await window.getValidToken();
                    const newToken = newTokenData?.access_token;
                    if (newToken) {
                        console.log('🔄 Token renovado, tentando novamente...');
                        const newProxyUrl = `${window.WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(url)}&token=${encodeURIComponent(newToken)}`;
                        const newResponse = await fetch(newProxyUrl);
                        if (newResponse.ok) {
                            const data = await newResponse.json();
                            return processarPedidosML(data, newToken);
                        }
                    }
                }
                throw new Error(`Erro na API: ${response.status} - Token inválido ou expirado`);
            }
            throw new Error(`Erro na API: ${response.status} - ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log(`📦 ${data.results?.length || 0} pedidos encontrados`);
        return processarPedidosML(data, token);
        
    } catch (error) {
        console.error('Erro ao buscar vendas para frete:', error);
        throw error;
    }
}

// ============================================
// PROCESSAR PEDIDOS DO ML
// ============================================
async function processarPedidosML(data, token) {
    const orders = data.results || [];
    console.log(`📦 ${orders.length} pedidos encontrados para análise de frete`);
    
    const vendas = [];
    for (const order of orders) {
        try {
            const shippingMode = order.shipping?.mode || '';
            
            // Ignorar FULL
            if (shippingMode.toLowerCase().includes('full') || 
                order.shipping?.fulfillment?.toLowerCase().includes('full')) {
                console.log(`⏭️ Venda ${order.id} é FULL, ignorando`);
                continue;
            }

            const itemId = order.order_items?.[0]?.item?.id;
            let titulo = 'Sem título';
            let sku = 'N/A';
            let mlbId = 'N/A';
            let valorTotal = 0;
            
            if (order.order_items && order.order_items.length > 0) {
                valorTotal = order.order_items.reduce((sum, item) => {
                    return sum + (item.unit_price || 0) * (item.quantity || 0);
                }, 0);
            }
            
            if (itemId) {
                try {
                    const itemUrl = `https://api.mercadolibre.com/items/${itemId}`;
                    const itemProxy = `${window.WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(itemUrl)}&token=${encodeURIComponent(token)}`;
                    const itemResp = await fetch(itemProxy);
                    if (itemResp.ok) {
                        const itemData = await itemResp.json();
                        titulo = itemData.title || titulo;
                        sku = itemData.seller_sku || sku;
                        mlbId = itemId;
                    }
                } catch (e) {
                    console.warn(`Erro ao buscar item ${itemId}:`, e.message);
                }
            }
            
            // ===== EXTRAIR FRETE USANDO A FUNÇÃO CORRIGIDA =====
            let freteCobrado = await extrairFreteDaVenda(order, token);
            
            // Se freteCobrado for 0, tentar uma última vez com mais detalhes
            if (freteCobrado === 0) {
                console.log(`🔄 Tentando extrair frete novamente para ${order.id}...`);
                // Buscar shipment diretamente
                if (order.shipping?.id) {
                    try {
                        const shipUrl = `https://api.mercadolibre.com/shipments/${order.shipping.id}`;
                        const shipProxy = `${window.WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(shipUrl)}&token=${encodeURIComponent(token)}`;
                        const shipResp = await fetch(shipProxy);
                        if (shipResp.ok) {
                            const shipData = await shipResp.json();
                            if (shipData.receiver_cost && shipData.receiver_cost > 0) {
                                freteCobrado = shipData.receiver_cost;
                                console.log(`✅ Frete encontrado na segunda tentativa: R$ ${freteCobrado.toFixed(2)}`);
                            }
                        }
                    } catch (e) {
                        console.warn(`Erro na segunda tentativa:`, e.message);
                    }
                }
            }
            
            console.log(`📊 Venda ${order.id}: Frete = R$ ${freteCobrado.toFixed(2)}, Valor = R$ ${valorTotal.toFixed(2)}`);
            
            vendas.push({
                id_venda_ml: order.id.toString(),
                id: order.id.toString(),
                titulo: titulo,
                sku: sku,
                mlb_id: mlbId,
                valor_total: valorTotal,
                data_venda: order.date_created || new Date().toISOString(),
                tipo_envio: shippingMode || 'N/I',
                status: order.status,
                frete_cobrado: freteCobrado,
                quantidade: order.order_items?.[0]?.quantity || 1
            });
            
            await new Promise(resolve => setTimeout(resolve, 150));
            
        } catch (e) {
            console.warn('Erro ao processar pedido:', e.message);
        }
    }
    
    console.log(`✅ ${vendas.length} vendas processadas para análise de frete`);
    return { vendas };
}

// ============================================
// EXTRAIR FRETE DA VENDA (VERSÃO CORRIGIDA)
// ============================================
async function extrairFreteDaVenda(order, token) {
    console.log(`🔍 Extraindo frete da venda ${order.id}...`);
    
    // 1. Tentar receiver_cost diretamente do order.shipping
    if (order.shipping && order.shipping.receiver_cost) {
        const frete = parseFloat(order.shipping.receiver_cost);
        if (frete > 0) {
            console.log(`✅ Frete via shipping.receiver_cost: R$ ${frete.toFixed(2)}`);
            return frete;
        }
    }

    // 2. Tentar cost diretamente do order.shipping
    if (order.shipping && order.shipping.cost) {
        const frete = parseFloat(order.shipping.cost);
        if (frete > 0) {
            console.log(`✅ Frete via shipping.cost: R$ ${frete.toFixed(2)}`);
            return frete;
        }
    }

    // 3. Buscar shipment completo
    if (order.shipping && order.shipping.id && token) {
        try {
            console.log(`🔄 Buscando shipment ${order.shipping.id}...`);
            
            const shipUrl = `https://api.mercadolibre.com/shipments/${order.shipping.id}`;
            const shipProxy = `${window.WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(shipUrl)}&token=${encodeURIComponent(token)}`;
            
            const response = await fetch(shipProxy);
            if (response.ok) {
                const shipData = await response.json();
                console.log('📦 Shipment data:', JSON.stringify(shipData, null, 2));
                
                // Tentar receiver_cost
                if (shipData.receiver_cost) {
                    const frete = parseFloat(shipData.receiver_cost);
                    if (frete > 0) {
                        console.log(`✅ Frete via shipment.receiver_cost: R$ ${frete.toFixed(2)}`);
                        return frete;
                    }
                }
                
                // Tentar cost
                if (shipData.cost) {
                    const frete = parseFloat(shipData.cost);
                    if (frete > 0) {
                        console.log(`✅ Frete via shipment.cost: R$ ${frete.toFixed(2)}`);
                        return frete;
                    }
                }
                
                // Tentar shipping_option.cost
                if (shipData.shipping_option && shipData.shipping_option.cost) {
                    const frete = parseFloat(shipData.shipping_option.cost);
                    if (frete > 0) {
                        console.log(`✅ Frete via shipping_option.cost: R$ ${frete.toFixed(2)}`);
                        return frete;
                    }
                }
            }
        } catch (e) {
            console.warn(`Erro ao buscar shipment:`, e.message);
        }
    }

    // 4. Tentar buscar da order diretamente (total_amount - item_amount)
    try {
        if (order.total_amount && order.order_items && order.order_items.length > 0) {
            let itemTotal = 0;
            for (const item of order.order_items) {
                itemTotal += (item.unit_price || 0) * (item.quantity || 0);
            }
            const diff = order.total_amount - itemTotal;
            if (diff > 0) {
                console.log(`✅ Frete calculado por diferença: R$ ${diff.toFixed(2)}`);
                return diff;
            }
        }
    } catch (e) {
        console.warn('Erro ao calcular por diferença:', e.message);
    }

    console.log(`⚠️ Nenhum frete encontrado para venda ${order.id}`);
    return 0;
}

// ============================================
// BUSCAR FRETES (sincronização - APENAS INCORRETOS)
// ============================================
async function buscarFretes() {
    console.log('🔍 Iniciando sincronização de fretes...');
    const tbody = document.getElementById('shippingSimpleBody');
    const contagem = document.getElementById('contagemFretes');
    const btn = document.getElementById('btnBuscarFretes');

    if (!tbody) return;

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span> Sincronizando...';
    }

    tbody.innerHTML = '<tr><td colspan="13" class="text-center"><div class="spinner"></div> Buscando vendas para análise de frete...</td></tr>';
    if (contagem) contagem.textContent = 'Sincronizando...';

    try {
        const resultado = await buscarVendasMLFrete(50);

        if (!resultado || !resultado.vendas) {
            throw new Error('Nenhum resultado retornado');
        }

        console.log(`📦 ${resultado.vendas.length} vendas retornadas da busca de frete`);

        if (resultado.vendas.length === 0) {
            tbody.innerHTML = '<tr><td colspan="13" class="text-center">Nenhuma venda encontrada.</td></tr>';
            if (contagem) contagem.textContent = '0 registros';
            showToast('Nenhuma venda encontrada', 'info');
            return;
        }

        const registrosParaInserir = [];
        const idsIncorretos = [];
        let totalFullIgnorados = 0;
        let totalCorretosIgnorados = 0;

        for (const venda of resultado.vendas) {
            const idVenda = venda.id_venda_ml || venda.id;
            if (!idVenda) continue;

            if (venda.tipo_envio === 'FULL' || isFullByAnyField(venda)) {
                totalFullIgnorados++;
                continue;
            }

            const freteCobrado = venda.frete_cobrado || 0;
            const quantidade = venda.quantidade || 1;
            const sku = venda.sku || 'N/A';
            const titulo = venda.titulo || 'Sem título';
            const mlb = venda.mlb_id || 'N/A';
            const valorProduto = venda.valor_total || 0;

            let medidas = await buscarMedidasPorSKU(sku);
            let comprimento = 22, largura = 16, altura = 1, peso = 0.3;
            if (medidas) {
                comprimento = medidas.comprimento_cm || 22;
                largura = medidas.largura_cm || 16;
                altura = medidas.altura_cm || 1;
                peso = medidas.peso_kg || 0.3;
            }

            const freteEsperado = calcularFreteEsperado(valorProduto, peso);
            const isIncorreto = freteEsperado !== null && Math.abs(freteCobrado - freteEsperado) > 0.01;

            if (isIncorreto) {
                const pesoVolumetrico = calcularPesoVolumetrico(comprimento, largura, altura);
                idsIncorretos.push(idVenda);
                
                registrosParaInserir.push({
                    id: idVenda,
                    titulo: titulo,
                    mlb: mlb,
                    sku: sku,
                    valor_produto: valorProduto,
                    quantidade: quantidade,
                    frete_cobrado: freteCobrado,
                    frete_esperado: freteEsperado,
                    frete_por_unidade: freteCobrado / (quantidade || 1),
                    data_venda: venda.data_venda || new Date().toISOString(),
                    tipo_envio: venda.tipo_envio || 'N/I',
                    peso_estimado: peso,
                    comprimento_cm: comprimento,
                    largura_cm: largura,
                    altura_cm: altura,
                    peso_volumetrico: pesoVolumetrico,
                    updated_at: new Date().toISOString()
                });
            } else {
                totalCorretosIgnorados++;
            }

            await new Promise(resolve => setTimeout(resolve, 50));
        }

        console.log(`📊 Resumo: ${registrosParaInserir.length} incorretos para salvar, ${totalCorretosIgnorados} corretos ignorados, ${totalFullIgnorados} FULL ignorados`);

        // REMOVER CORRETOS DO BANCO
        if (totalCorretosIgnorados > 0) {
            console.log('🗑️ Buscando registros corretos para remover...');
            const { data: todosRegistros } = await window.supabaseClient
                .from('fretes_ml')
                .select('id, frete_cobrado, valor_produto, peso_estimado');
            
            if (todosRegistros) {
                let removidos = 0;
                for (const registro of todosRegistros) {
                    const freteEsperado = calcularFreteEsperado(registro.valor_produto || 0, registro.peso_estimado || 0.3);
                    const isCorreto = freteEsperado !== null && Math.abs((registro.frete_cobrado || 0) - freteEsperado) <= 0.01;
                    
                    if (isCorreto && !idsIncorretos.includes(registro.id)) {
                        await window.supabaseClient.from('fretes_ml').delete().eq('id', registro.id);
                        removidos++;
                    }
                }
                console.log(`🗑️ ${removidos} registros corretos removidos do banco`);
            }
        }

        if (registrosParaInserir.length === 0) {
            let msg = `Nenhum frete incorreto encontrado.`;
            if (totalCorretosIgnorados > 0) msg += ` ${totalCorretosIgnorados} corretos ignorados.`;
            if (totalFullIgnorados > 0) msg += ` ${totalFullIgnorados} FULL ignorados.`;
            tbody.innerHTML = `<tr><td colspan="13" class="text-center">${msg}</td></tr>`;
            if (contagem) contagem.textContent = '0 incorretos';
            showToast(msg, 'info');
            return;
        }

        await window.supabaseClient
            .from('fretes_ml')
            .upsert(registrosParaInserir, { onConflict: 'id', ignoreDuplicates: false });

        console.log(`✅ ${registrosParaInserir.length} fretes incorretos salvos`);
        await carregarFretesSalvos();

        if (contagem) {
            const { count } = await window.supabaseClient.from('fretes_ml').select('id', { count: 'exact', head: true });
            contagem.textContent = `${count || 0} incorretos (${registrosParaInserir.length} novos)`;
        }

        showToast(`✅ ${registrosParaInserir.length} fretes incorretos salvos`, 'success');

    } catch (error) {
        console.error('❌ Erro na sincronização de fretes:', error);
        tbody.innerHTML = `<tr><td colspan="13" class="text-center text-danger">Erro: ${error.message}</td></tr>`;
        if (contagem) contagem.textContent = 'Erro';
        showToast('Erro ao sincronizar: ' + error.message, 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-sync-alt"></i> Buscar Fretes';
        }
    }
}

// ============================================
// SALVAR MEDIDAS E RECALCULAR
// ============================================
async function salvarMedidasERecalcular(row, vendaId, sku) {
    try {
        const compInput = row.querySelector('.medida-input[data-medida="comprimento"]');
        const largInput = row.querySelector('.medida-input[data-medida="largura"]');
        const altInput = row.querySelector('.medida-input[data-medida="altura"]');
        const pesoInput = row.querySelector('.peso-input');
        
        const comprimento = parseFloat(compInput?.value) || 22;
        const largura = parseFloat(largInput?.value) || 16;
        const altura = parseFloat(altInput?.value) || 1;
        const peso = parseFloat(pesoInput?.value) || 0.3;

        if (comprimento <= 0 || largura <= 0 || altura <= 0 || peso <= 0) {
            showToast('Medidas e peso devem ser maiores que zero', 'warning');
            return;
        }

        await salvarMedidasSKU(sku, comprimento, largura, altura, peso);

        const pesoVol = calcularPesoVolumetrico(comprimento, largura, altura);
        await window.supabaseClient
            .from('fretes_ml')
            .update({
                comprimento_cm: comprimento,
                largura_cm: largura,
                altura_cm: altura,
                peso_estimado: peso,
                peso_volumetrico: pesoVol,
                updated_at: new Date().toISOString()
            })
            .eq('id', vendaId);

        const valorCell = row.querySelector('td:nth-child(5)');
        const valorText = valorCell?.textContent.replace('R$ ', '').replace(',', '.') || '0';
        const valorProduto = parseFloat(valorText) || 0;
        
        const freteEsperado = calcularFreteEsperado(valorProduto, peso);
        const freteCobradoCell = row.querySelector('td:nth-child(7)');
        const freteCobradoText = freteCobradoCell?.textContent.replace('R$ ', '').replace(',', '.') || '0';
        const freteCobrado = parseFloat(freteCobradoText) || 0;

        const freteEsperadoCell = row.querySelector('.frete-esperado-cell');
        const statusBadge = row.querySelector('.status-badge');
        const volDisplay = row.querySelector('.peso-volumetrico-display');

        if (freteEsperado !== null) {
            freteEsperadoCell.textContent = `R$ ${freteEsperado.toFixed(2)}`;
            const diferenca = freteCobrado - freteEsperado;
            const diffAbs = Math.abs(diferenca);
            let statusClass, statusText;
            if (diffAbs < 0.01) {
                statusClass = 'success';
                statusText = '✅ Correto';
                await window.supabaseClient.from('fretes_ml').delete().eq('id', vendaId);
                showToast(`✅ Frete corrigido! Registro removido.`, 'success');
                await carregarFretesSalvos();
                return;
            } else if (diferenca > 0) {
                statusClass = 'danger';
                statusText = `❌ Acima (R$ ${diferenca.toFixed(2)})`;
            } else {
                statusClass = 'warning';
                statusText = `⚠️ Abaixo (R$ ${Math.abs(diferenca).toFixed(2)})`;
            }
            statusBadge.className = `badge badge-${statusClass} status-badge`;
            statusBadge.textContent = statusText;
        }

        if (volDisplay) {
            volDisplay.textContent = pesoVol.toFixed(3);
        }

        showToast(`✅ Medidas salvas para ${sku}!`, 'success');

    } catch (error) {
        console.error('Erro ao salvar medidas:', error);
        showToast('Erro ao salvar: ' + error.message, 'error');
    }
}

// ============================================
// CARREGAR FRETES SALVOS (APENAS INCORRETOS)
// ============================================
async function carregarFretesSalvos() {
    console.log('📂 Carregando fretes salvos (apenas incorretos)...');
    const tbody = document.getElementById('shippingSimpleBody');
    const contagem = document.getElementById('contagemFretes');
    if (!tbody) return;

    try {
        if (!window.supabaseClient) throw new Error('Supabase não inicializado');

        const { data, error } = await window.supabaseClient
            .from('fretes_ml')
            .select('*')
            .order('data_venda', { ascending: false });

        if (error) throw error;

        // Buscar reclamações abertas
        const { data: reclamacoes } = await window.supabaseClient
            .from('reclamacoes_frete')
            .select('venda_id, status')
            .eq('status', 'aberto');

        const reclamacoesMap = {};
        if (reclamacoes) {
            reclamacoes.forEach(r => { reclamacoesMap[r.venda_id] = r.status; });
        }

        let dados = (data || []).filter(item => {
            if (item.tipo_envio === 'FULL') return false;
            if (isFullByAnyField(item)) return false;
            const peso = item.peso_estimado || 0.3;
            const freteEsperado = calcularFreteEsperado(item.valor_produto, peso);
            if (freteEsperado === null) return false;
            return Math.abs(item.frete_cobrado - freteEsperado) > 0.01;
        });

        window.dadosFretesProcessados = dados.map(item => {
            const peso = item.peso_estimado || 0.3;
            const freteEsperado = calcularFreteEsperado(item.valor_produto, peso);
            return { ...item, freteEsperado, isIncorreto: true };
        });

        if (dados.length === 0) {
            tbody.innerHTML = '<tr><td colspan="13" class="text-center">Nenhum frete incorreto encontrado. 🎉</td></tr>';
            if (contagem) contagem.textContent = '0 incorretos';
            return;
        }

        tbody.innerHTML = '';
        dados.forEach(item => {
            const row = document.createElement('tr');

            const peso = item.peso_estimado || 0.3;
            const comprimento = item.comprimento_cm || 22;
            const largura = item.largura_cm || 16;
            const altura = item.altura_cm || 1;
            const valorProduto = item.valor_produto || 0;
            const freteCobrado = item.frete_cobrado || 0;
            const quantidade = item.quantidade || 1;
            const sku = item.sku || 'N/A';
            const fotoUrl = item.foto_url || null;
            const freteEsperado = calcularFreteEsperado(valorProduto, peso);

            const pesoVol = calcularPesoVolumetrico(comprimento, largura, altura);
            let statusClass = 'secondary', statusText = 'Não calculado', diferenca = 0;
            if (freteEsperado !== null) {
                diferenca = freteCobrado - freteEsperado;
                const diffAbs = Math.abs(diferenca);
                if (diffAbs < 0.01) {
                    statusClass = 'success';
                    statusText = '✅ Correto';
                } else if (diferenca > 0) {
                    statusClass = 'danger';
                    statusText = `❌ Acima (R$ ${diferenca.toFixed(2)})`;
                } else {
                    statusClass = 'warning';
                    statusText = `⚠️ Abaixo (R$ ${Math.abs(diferenca).toFixed(2)})`;
                }
            }

            const temReclamacao = reclamacoesMap[item.id] === 'aberto';
            const badgeReclamacao = temReclamacao ? '<span class="badge badge-info ml-1">Reclamação Aberta</span>' : '';

            let fotoThumb = '';
            if (fotoUrl) {
                fotoThumb = `<img src="${fotoUrl}" style="width: 40px; height: 40px; object-fit: cover; border-radius: 4px; cursor: pointer;" onclick="window.open('${fotoUrl}','_blank')">`;
            } else {
                fotoThumb = '<span class="text-muted">Sem foto</span>';
            }

            row.innerHTML = `
                <td><strong>${item.id}</strong></td>
                <td>${item.titulo || 'Sem título'}</td>
                <td><code>${sku}</code></td>
                <td><code>${item.mlb || 'N/A'}</code></td>
                <td>R$ ${valorProduto.toFixed(2)}</td>
                <td>${quantidade}</td>
                <td>R$ ${freteCobrado.toFixed(2)}</td>
                <td class="frete-esperado-cell">${freteEsperado !== null ? `R$ ${freteEsperado.toFixed(2)}` : 'N/A'}</td>
                <td>
                    <span class="badge badge-${statusClass} status-badge">${statusText}</span>
                    ${badgeReclamacao}
                </td>
                <td>
                    <input type="number" class="form-control form-control-sm peso-input" 
                           value="${peso}" step="0.01" min="0" 
                           data-venda-id="${item.id}" style="width: 65px;">
                </td>
                <td>
                    <div style="display:flex; gap:3px; flex-wrap:wrap; align-items:center;">
                        <input type="number" class="form-control form-control-sm medida-input" 
                               value="${comprimento}" step="0.1" min="0" 
                               data-venda-id="${item.id}" data-medida="comprimento" style="width: 55px;" placeholder="C">
                        <span style="font-size:11px;">x</span>
                        <input type="number" class="form-control form-control-sm medida-input" 
                               value="${largura}" step="0.1" min="0" 
                               data-venda-id="${item.id}" data-medida="largura" style="width: 55px;" placeholder="L">
                        <span style="font-size:11px;">x</span>
                        <input type="number" class="form-control form-control-sm medida-input" 
                               value="${altura}" step="0.1" min="0" 
                               data-venda-id="${item.id}" data-medida="altura" style="width: 55px;" placeholder="A">
                        <button class="btn btn-sm btn-success btn-salvar-medidas" 
                                data-venda-id="${item.id}" 
                                data-sku="${sku}"
                                style="padding: 2px 8px; margin-left: 4px;">
                            <i class="fas fa-save"></i>
                        </button>
                    </div>
                    <div style="font-size:10px; color:#6c757d; margin-top:3px;">
                        Vol: <span class="peso-volumetrico-display">${pesoVol.toFixed(3)}</span> m³
                    </div>
                </td>
                <td>
                    ${fotoThumb}
                    <button class="btn btn-sm btn-outline-secondary mt-1" onclick="abrirEditorFoto('${item.id}', '${sku}')" title="Editar foto">
                        <i class="fas fa-camera"></i>
                    </button>
                </td>
                <td>
                    <button class="btn btn-sm btn-primary btn-reclamar" 
                            data-venda-id="${item.id}"
                            data-valor="${valorProduto}"
                            data-frete-cobrado="${freteCobrado}"
                            data-frete-esperado="${freteEsperado !== null ? freteEsperado : 0}"
                            ${temReclamacao ? 'disabled' : ''}>
                        <i class="fas fa-comment-dots"></i>
                    </button>
                    ${temReclamacao ? `<button class="btn btn-sm btn-info btn-ver-reclamacao" data-venda-id="${item.id}"><i class="fas fa-eye"></i></button>` : ''}
                </td>
            `;

            tbody.appendChild(row);

            const btnSalvar = row.querySelector('.btn-salvar-medidas');
            if (btnSalvar) {
                btnSalvar.addEventListener('click', function() {
                    salvarMedidasERecalcular(row, this.dataset.vendaId, this.dataset.sku);
                });
            }

            const pesoInput = row.querySelector('.peso-input');
            if (pesoInput) {
                pesoInput.addEventListener('change', function() {
                    const novoPeso = parseFloat(this.value);
                    if (!isNaN(novoPeso) && novoPeso >= 0) {
                        atualizarVisualizacaoLinha(row, item.id, null, null, null, novoPeso);
                    }
                });
            }

            const medidaInputs = row.querySelectorAll('.medida-input');
            medidaInputs.forEach(input => {
                input.addEventListener('change', function() {
                    const valor = parseFloat(this.value);
                    if (isNaN(valor) || valor < 0) return;
                    const comprimentoInput = row.querySelector('.medida-input[data-medida="comprimento"]');
                    const larguraInput = row.querySelector('.medida-input[data-medida="largura"]');
                    const alturaInput = row.querySelector('.medida-input[data-medida="altura"]');
                    atualizarVisualizacaoLinha(row, item.id, 
                        parseFloat(comprimentoInput.value) || 0,
                        parseFloat(larguraInput.value) || 0,
                        parseFloat(alturaInput.value) || 0, null);
                });
            });

            const btnReclamar = row.querySelector('.btn-reclamar');
            if (btnReclamar) {
                btnReclamar.addEventListener('click', function() {
                    abrirModalReclamacaoCompleta(
                        this.dataset.vendaId,
                        parseFloat(this.dataset.valor),
                        parseFloat(this.dataset.freteCobrado),
                        parseFloat(this.dataset.freteEsperado)
                    );
                });
            }

            const btnVerReclamacao = row.querySelector('.btn-ver-reclamacao');
            if (btnVerReclamacao) {
                btnVerReclamacao.addEventListener('click', function() {
                    verReclamacaoCompleta(this.dataset.vendaId);
                });
            }
        });

        if (contagem) {
            contagem.textContent = `${dados.length} incorretos`;
        }
        console.log(`✅ ${dados.length} fretes incorretos carregados`);

    } catch (error) {
        console.error('❌ Erro ao carregar fretes:', error);
        tbody.innerHTML = `<tr><td colspan="13" class="text-center text-danger">Erro: ${error.message}</td></tr>`;
    }
}

// ============================================
// ATUALIZAR VISUALIZAÇÃO DA LINHA
// ============================================
function atualizarVisualizacaoLinha(row, vendaId, comprimento, largura, altura, peso) {
    try {
        if (comprimento === null) {
            const compInput = row.querySelector('.medida-input[data-medida="comprimento"]');
            comprimento = compInput ? parseFloat(compInput.value) || 22 : 22;
        }
        if (largura === null) {
            const largInput = row.querySelector('.medida-input[data-medida="largura"]');
            largura = largInput ? parseFloat(largInput.value) || 16 : 16;
        }
        if (altura === null) {
            const altInput = row.querySelector('.medida-input[data-medida="altura"]');
            altura = altInput ? parseFloat(altInput.value) || 1 : 1;
        }
        if (peso === null) {
            const pesoInput = row.querySelector('.peso-input');
            peso = pesoInput ? parseFloat(pesoInput.value) || 0.3 : 0.3;
        }

        if (comprimento <= 0 || largura <= 0 || altura <= 0 || peso <= 0) return;

        const pesoVol = calcularPesoVolumetrico(comprimento, largura, altura);

        const valorCell = row.querySelector('td:nth-child(5)');
        const valorText = valorCell?.textContent.replace('R$ ', '').replace(',', '.') || '0';
        const valorProduto = parseFloat(valorText) || 0;
        const freteCobradoCell = row.querySelector('td:nth-child(7)');
        const freteCobradoText = freteCobradoCell?.textContent.replace('R$ ', '').replace(',', '.') || '0';
        const freteCobrado = parseFloat(freteCobradoText) || 0;

        const freteEsperado = calcularFreteEsperado(valorProduto, peso);
        const freteEsperadoCell = row.querySelector('.frete-esperado-cell');
        const statusBadge = row.querySelector('.status-badge');

        if (freteEsperado !== null) {
            freteEsperadoCell.textContent = `R$ ${freteEsperado.toFixed(2)}`;
            const diferenca = freteCobrado - freteEsperado;
            const diffAbs = Math.abs(diferenca);
            let statusClass, statusText;
            if (diffAbs < 0.01) {
                statusClass = 'success';
                statusText = '✅ Correto';
            } else if (diferenca > 0) {
                statusClass = 'danger';
                statusText = `❌ Acima (R$ ${diferenca.toFixed(2)})`;
            } else {
                statusClass = 'warning';
                statusText = `⚠️ Abaixo (R$ ${Math.abs(diferenca).toFixed(2)})`;
            }
            statusBadge.className = `badge badge-${statusClass} status-badge`;
            statusBadge.textContent = statusText;

            const btnReclamar = row.querySelector('.btn-reclamar');
            if (btnReclamar) {
                btnReclamar.dataset.freteEsperado = freteEsperado;
            }
        }

        const volDisplay = row.querySelector('.peso-volumetrico-display');
        if (volDisplay) {
            volDisplay.textContent = pesoVol.toFixed(3);
        }

    } catch (error) {
        console.error('Erro ao atualizar visualização:', error);
    }
}

// ============================================
// MODAL DE RECLAMAÇÃO COMPLETA
// ============================================
function abrirModalReclamacaoCompleta(vendaId, valorProduto, freteCobrado, freteEsperado) {
    // Verificar se o modal existe, se não, criar
    let modal = document.getElementById('modalReclamacaoCompleta');
    if (!modal) {
        criarModalReclamacaoCompleta();
        modal = document.getElementById('modalReclamacaoCompleta');
        if (!modal) {
            showToast('Erro ao criar modal. Tente novamente.', 'error');
            return;
        }
    }

    // Garantir que os elementos existem antes de tentar definir valores
    const elementos = {
        vendaId: document.getElementById('reclamacaoVendaId'),
        valorProduto: document.getElementById('reclamacaoValorProduto'),
        freteCobrado: document.getElementById('reclamacaoFreteCobrado'),
        freteEsperado: document.getElementById('reclamacaoFreteEsperado'),
        diferenca: document.getElementById('reclamacaoDiferenca'),
        status: document.getElementById('reclamacaoStatus'),
        data: document.getElementById('reclamacaoData'),
        numeroReclamacao: document.getElementById('reclamacaoNumeroReclamacao'),
        numeroOperacao: document.getElementById('reclamacaoNumeroOperacao'),
        observacoes: document.getElementById('reclamacaoObservacoes'),
        justificativa: document.getElementById('reclamacaoJustificativa'),
        numeroTransacao: document.getElementById('reclamacaoNumeroTransacao'),
        id: document.getElementById('reclamacaoId'),
        valor: document.getElementById('reclamacaoValor'),
        motivo: document.getElementById('reclamacaoMotivo'),
        campoProtocolo: document.getElementById('campoProtocolo'),
        listaProtocolos: document.getElementById('listaProtocolos'),
        campoNumeroOperacao: document.getElementById('campoNumeroOperacao'),
        campoJustificativa: document.getElementById('campoJustificativa'),
        campoNumeroTransacao: document.getElementById('campoNumeroTransacao'),
        campoNumeroVenda: document.getElementById('campoNumeroVenda')
    };

    // Verificar se todos os elementos existem
    const elementosFaltando = Object.entries(elementos)
        .filter(([key, el]) => !el)
        .map(([key]) => key);

    if (elementosFaltando.length > 0) {
        console.error('Elementos faltando no modal:', elementosFaltando);
        showToast('Erro: elementos do modal não encontrados. Recarregue a página.', 'error');
        return;
    }

    const diferenca = freteCobrado - freteEsperado;
    
    // Definir valores
    elementos.vendaId.value = vendaId || '';
    elementos.valorProduto.value = (valorProduto || 0).toFixed(2);
    elementos.freteCobrado.value = (freteCobrado || 0).toFixed(2);
    elementos.freteEsperado.value = (freteEsperado || 0).toFixed(2);
    elementos.diferenca.value = diferenca.toFixed(2);
    elementos.status.value = 'aberto';
    elementos.data.value = new Date().toISOString().split('T')[0];
    
    // Limpar campos
    elementos.numeroReclamacao.value = '';
    elementos.numeroOperacao.value = '';
    elementos.observacoes.value = '';
    elementos.justificativa.value = '';
    elementos.numeroTransacao.value = '';
    elementos.id.value = '';
    elementos.valor.value = '0';
    elementos.motivo.value = '';
    
    // Limpar protocolos
    protocolosTemp = [];
    if (elementos.listaProtocolos) {
        elementos.listaProtocolos.innerHTML = '<small style="color: #6c757d;">Nenhum protocolo adicionado</small>';
    }
    if (elementos.campoProtocolo) {
        elementos.campoProtocolo.value = '';
    }
    
    // Esconder campos condicionais
    if (elementos.campoJustificativa) {
        elementos.campoJustificativa.style.display = 'none';
    }
    if (elementos.campoNumeroTransacao) {
        elementos.campoNumeroTransacao.style.display = 'none';
    }
    if (elementos.campoNumeroOperacao) {
        elementos.campoNumeroOperacao.style.display = 'block';
    }
    
    // Mostrar modal
    modal.classList.remove('hidden');
    
    // Carregar reclamação existente
    carregarReclamacaoExistente(vendaId);
}

function criarModalReclamacaoCompleta() {
    if (document.getElementById('modalReclamacaoCompleta')) return;

    const modalHTML = `
        <div id="modalReclamacaoCompleta" class="modal hidden">
            <div class="modal-content" style="max-width: 700px; max-height: 90vh; overflow-y: auto;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 2px solid #00ADEE; padding-bottom: 15px;">
                    <h3 style="margin:0;"><i class="fas fa-comment-dots" style="color:#00ADEE;"></i> Nova Reclamação de Frete</h3>
                    <button onclick="fecharModalReclamacaoCompleta()" style="background:none; border:none; font-size:24px; cursor:pointer;">&times;</button>
                </div>

                <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
                    <p><strong>Venda:</strong> <span id="reclamacaoNumeroVendaDisplay">-</span></p>
                    <p><strong>Valor Produto:</strong> R$ <span id="reclamacaoValorProdutoDisplay">0,00</span></p>
                    <p><strong>Frete Cobrado:</strong> R$ <span id="reclamacaoFreteCobradoDisplay">0,00</span></p>
                    <p><strong>Frete Esperado:</strong> R$ <span id="reclamacaoFreteEsperadoDisplay">0,00</span></p>
                    <p><strong>Diferença:</strong> R$ <span id="reclamacaoDiferencaDisplay" style="font-weight: bold;">0,00</span></p>
                </div>

                <input type="hidden" id="reclamacaoId">
                <input type="hidden" id="reclamacaoVendaId">
                <input type="hidden" id="reclamacaoValorProduto">
                <input type="hidden" id="reclamacaoFreteCobrado">
                <input type="hidden" id="reclamacaoFreteEsperado">
                <input type="hidden" id="reclamacaoDiferenca">

                <!-- Tipo de referência -->
                <div class="form-group">
                    <label><strong>Tipo de referência *</strong></label>
                    <div class="d-flex gap-3">
                        <label><input type="radio" name="tipoReferencia" value="venda" checked onchange="toggleReferenciaFields()"> Venda</label>
                        <label><input type="radio" name="tipoReferencia" value="retirada" onchange="toggleReferenciaFields()"> Retirada FULL</label>
                    </div>
                </div>

                <!-- Número da Venda -->
                <div class="form-group" id="campoNumeroVenda">
                    <label><i class="fas fa-tag"></i> Número da Venda (16 caracteres)</label>
                    <input type="text" id="reclamacaoNumeroVenda" class="form-control" placeholder="Ex: 1234567890123456" maxlength="16">
                    <small style="color: #6c757d;">Deve ter exatamente 16 caracteres</small>
                </div>

                <!-- Número da Reclamação -->
                <div class="form-group">
                    <label><i class="fas fa-exclamation-circle"></i> Número da Reclamação *</label>
                    <input type="text" id="reclamacaoNumeroReclamacao" class="form-control" placeholder="Ex: REC123456" required>
                </div>

                <!-- Número da Operação -->
                <div class="form-group">
                    <label><i class="fas fa-receipt"></i> Número da Operação</label>
                    <div class="d-flex gap-3 mb-2">
                        <label><input type="radio" name="tipoOperacao" value="adicionar" checked onchange="toggleOperacaoField()"> Adicionar número da operação</label>
                        <label><input type="radio" name="tipoOperacao" value="reembolso_venda" onchange="toggleOperacaoField()"> Reembolso na venda (sem número)</label>
                    </div>
                    <div id="campoNumeroOperacao">
                        <input type="text" id="reclamacaoNumeroOperacao" class="form-control" placeholder="Ex: OP789012">
                    </div>
                </div>

                <!-- Tipo de reclamação -->
                <div class="form-group">
                    <label><i class="fas fa-tag"></i> Tipo de reclamação *</label>
                    <div class="d-flex gap-3">
                        <label><input type="radio" name="tipoReclamacao" value="com_reembolso" checked onchange="toggleCamposReclamacao()"> Com reembolso</label>
                        <label><input type="radio" name="tipoReclamacao" value="sem_reembolso" onchange="toggleCamposReclamacao()"> Sem reembolso (apenas acompanhamento)</label>
                    </div>
                </div>

                <!-- Valor e Data -->
                <div class="row">
                    <div class="col-md-6">
                        <div class="form-group">
                            <label><i class="fas fa-money-bill-wave"></i> Valor *</label>
                            <input type="number" id="reclamacaoValor" class="form-control" step="0.01" min="0" placeholder="0,00" value="0">
                        </div>
                    </div>
                    <div class="col-md-6">
                        <div class="form-group">
                            <label><i class="fas fa-calendar"></i> Data *</label>
                            <input type="date" id="reclamacaoData" class="form-control" required>
                        </div>
                    </div>
                </div>

                <!-- Motivo -->
                <div class="form-group">
                    <label><i class="fas fa-question-circle"></i> Motivo *</label>
                    <select id="reclamacaoMotivo" class="form-control" required>
                        <option value="">Selecione o motivo</option>
                        <option value="Frete">Frete</option>
                        <option value="Extravio no envio">Extravio no envio</option>
                        <option value="Extravio na devolução">Extravio na devolução</option>
                        <option value="Devolução danificada">Devolução danificada</option>
                        <option value="Valor incorreto">Valor incorreto</option>
                        <option value="Prazo de entrega">Prazo de entrega</option>
                    </select>
                </div>

                <!-- Protocolos -->
                <div class="form-group">
                    <label><i class="fas fa-list"></i> Protocolos</label>
                    <div class="d-flex gap-2">
                        <input type="text" id="campoProtocolo" class="form-control" placeholder="Número do protocolo">
                        <button type="button" class="btn btn-primary btn-sm" onclick="adicionarProtocolo()">
                            <i class="fas fa-plus"></i> Adicionar
                        </button>
                    </div>
                    <div id="listaProtocolos" style="margin-top: 10px;">
                        <small style="color: #6c757d;">Nenhum protocolo adicionado</small>
                    </div>
                </div>

                <!-- Status -->
                <div class="form-group">
                    <label><i class="fas fa-tag"></i> Status *</label>
                    <select id="reclamacaoStatus" class="form-control" onchange="onStatusChange()" required>
                        <option value="aberto">Aberto</option>
                        <option value="em_andamento">Em andamento</option>
                        <option value="rejeitado">Rejeitado</option>
                        <option value="resolvido">Resolvido</option>
                    </select>
                </div>

                <!-- Justificativa (aparece quando status = rejeitado) -->
                <div id="campoJustificativa" style="display: none;">
                    <div class="form-group">
                        <label><i class="fas fa-comment"></i> Justificativa da Rejeição *</label>
                        <textarea id="reclamacaoJustificativa" class="form-control" rows="3" placeholder="Descreva o motivo da rejeição..."></textarea>
                    </div>
                    <div class="form-group">
                        <label><i class="fas fa-paperclip"></i> Anexar Arquivo</label>
                        <input type="file" id="reclamacaoArquivo" class="form-control" accept=".pdf,.jpg,.png,.doc,.docx">
                        <small style="color: #6c757d;">Anexe evidências (PDF, imagem, documento)</small>
                    </div>
                </div>

                <!-- Número de Transação (aparece quando status = resolvido) -->
                <div id="campoNumeroTransacao" style="display: none;">
                    <div class="form-group">
                        <label><i class="fas fa-exchange-alt"></i> Número da Transação</label>
                        <input type="text" id="reclamacaoNumeroTransacao" class="form-control" placeholder="Ex: TRANS123456">
                        <small style="color: #6c757d;">Número da transação do reembolso</small>
                    </div>
                </div>

                <!-- Observações -->
                <div class="form-group">
                    <label><i class="fas fa-sticky-note"></i> Observações</label>
                    <textarea id="reclamacaoObservacoes" class="form-control" rows="3" placeholder="Detalhes sobre a reclamação..."></textarea>
                </div>

                <div class="d-flex justify-content-end gap-2 mt-3">
                    <button type="button" class="btn btn-secondary" onclick="fecharModalReclamacaoCompleta()">Cancelar</button>
                    <button type="button" class="btn btn-success" onclick="salvarReclamacaoCompleta()">
                        <i class="fas fa-save"></i> Salvar
                    </button>
                </div>
            </div>
        </div>
    `;

    const div = document.createElement('div');
    div.innerHTML = modalHTML;
    document.body.appendChild(div.firstElementChild);
}

// ============================================
// FUNÇÕES DO MODAL DE RECLAMAÇÃO
// ============================================
function fecharModalReclamacaoCompleta() {
    const modal = document.getElementById('modalReclamacaoCompleta');
    if (modal) {
        modal.classList.add('hidden');
    }
    protocolosTemp = [];
}

function toggleReferenciaFields() {
    const tipo = document.querySelector('input[name="tipoReferencia"]:checked')?.value || 'venda';
    const campoNumeroVenda = document.getElementById('campoNumeroVenda');
    if (campoNumeroVenda) {
        campoNumeroVenda.style.display = tipo === 'venda' ? 'block' : 'none';
    }
}

function toggleOperacaoField() {
    const tipo = document.querySelector('input[name="tipoOperacao"]:checked')?.value || 'adicionar';
    const campoNumeroOperacao = document.getElementById('campoNumeroOperacao');
    if (campoNumeroOperacao) {
        campoNumeroOperacao.style.display = tipo === 'adicionar' ? 'block' : 'none';
    }
}

function toggleCamposReclamacao() {
    const tipo = document.querySelector('input[name="tipoReclamacao"]:checked')?.value || 'com_reembolso';
    const campoValor = document.getElementById('reclamacaoValor');
    if (campoValor) {
        campoValor.disabled = tipo === 'sem_reembolso';
        if (tipo === 'sem_reembolso') {
            campoValor.value = '0';
        }
    }
}

function onStatusChange() {
    const status = document.getElementById('reclamacaoStatus')?.value;
    const campoJustificativa = document.getElementById('campoJustificativa');
    const campoNumeroTransacao = document.getElementById('campoNumeroTransacao');
    
    if (campoJustificativa) {
        campoJustificativa.style.display = status === 'rejeitado' ? 'block' : 'none';
    }
    if (campoNumeroTransacao) {
        campoNumeroTransacao.style.display = status === 'resolvido' ? 'block' : 'none';
    }
}

function adicionarProtocolo() {
    const input = document.getElementById('campoProtocolo');
    if (!input) return;
    
    const protocolo = input.value.trim();
    if (!protocolo) {
        showToast('Digite um número de protocolo', 'warning');
        return;
    }
    
    if (protocolosTemp.includes(protocolo)) {
        showToast('Protocolo já adicionado', 'warning');
        return;
    }
    
    protocolosTemp.push(protocolo);
    input.value = '';
    renderizarProtocolos();
}

function removerProtocolo(index) {
    protocolosTemp.splice(index, 1);
    renderizarProtocolos();
}

function renderizarProtocolos() {
    const container = document.getElementById('listaProtocolos');
    if (!container) return;
    
    if (protocolosTemp.length === 0) {
        container.innerHTML = '<small style="color: #6c757d;">Nenhum protocolo adicionado</small>';
        return;
    }
    
    container.innerHTML = protocolosTemp.map((p, i) => `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 5px 10px; background: #f8f9fa; border-radius: 4px; margin-bottom: 5px;">
            <span><i class="fas fa-hashtag"></i> ${p}</span>
            <button type="button" class="btn btn-sm btn-danger" onclick="removerProtocolo(${i})" style="padding: 0 8px;">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `).join('');
}

// ============================================
// CARREGAR RECLAMAÇÃO EXISTENTE
// ============================================
async function carregarReclamacaoExistente(vendaId) {
    try {
        const { data, error } = await window.supabaseClient
            .from('reclamacoes_frete')
            .select('*')
            .eq('venda_id', vendaId)
            .order('criado_em', { ascending: false })
            .limit(1);
        
        if (error) throw error;
        if (data && data.length > 0) {
            const recl = data[0];
            document.getElementById('reclamacaoId').value = recl.id;
            document.getElementById('reclamacaoNumeroReclamacao').value = recl.numero_reclamacao || '';
            document.getElementById('reclamacaoNumeroOperacao').value = recl.numero_operacao || '';
            document.getElementById('reclamacaoValor').value = recl.valor || 0;
            document.getElementById('reclamacaoData').value = recl.data_reclamacao ? recl.data_reclamacao.split('T')[0] : new Date().toISOString().split('T')[0];
            document.getElementById('reclamacaoMotivo').value = recl.motivo || '';
            document.getElementById('reclamacaoStatus').value = recl.status || 'aberto';
            document.getElementById('reclamacaoObservacoes').value = recl.observacoes || '';
            document.getElementById('reclamacaoJustificativa').value = recl.justificativa_rejeicao || '';
            document.getElementById('reclamacaoNumeroTransacao').value = recl.numero_transacao || '';
            
            // Protocolos
            if (recl.protocolos && recl.protocolos.length > 0) {
                protocolosTemp = recl.protocolos;
                renderizarProtocolos();
            }
            
            // Tipo de referência
            if (recl.tipo_referencia) {
                document.querySelector(`input[name="tipoReferencia"][value="${recl.tipo_referencia}"]`).checked = true;
                toggleReferenciaFields();
            }
            
            // Tipo de reclamação
            if (recl.tipo_reclamacao) {
                document.querySelector(`input[name="tipoReclamacao"][value="${recl.tipo_reclamacao}"]`).checked = true;
                toggleCamposReclamacao();
            }
            
            onStatusChange();
        }
    } catch (error) {
        console.error('Erro ao carregar reclamação:', error);
    }
}

// ============================================
// SALVAR RECLAMAÇÃO COMPLETA
// ============================================
async function salvarReclamacaoCompleta() {
    const vendaId = document.getElementById('reclamacaoVendaId').value;
    const id = document.getElementById('reclamacaoId').value;
    const numeroReclamacao = document.getElementById('reclamacaoNumeroReclamacao').value.trim();
    const numeroOperacao = document.getElementById('reclamacaoNumeroOperacao').value.trim();
    const valor = parseFloat(document.getElementById('reclamacaoValor').value) || 0;
    const data = document.getElementById('reclamacaoData').value;
    const motivo = document.getElementById('reclamacaoMotivo').value;
    const status = document.getElementById('reclamacaoStatus').value;
    const observacoes = document.getElementById('reclamacaoObservacoes').value.trim();
    const justificativa = document.getElementById('reclamacaoJustificativa').value.trim();
    const numeroTransacao = document.getElementById('reclamacaoNumeroTransacao').value.trim();
    const tipoReferencia = document.querySelector('input[name="tipoReferencia"]:checked')?.value || 'venda';
    const tipoReclamacao = document.querySelector('input[name="tipoReclamacao"]:checked')?.value || 'com_reembolso';
    
    const nomeUsuario = getNomeUsuario();

    if (!vendaId) {
        showToast('Erro: venda não identificada', 'error');
        return;
    }

    if (!numeroReclamacao) {
        showToast('Número da reclamação é obrigatório', 'warning');
        return;
    }

    if (!data) {
        showToast('Data é obrigatória', 'warning');
        return;
    }

    if (!motivo) {
        showToast('Motivo é obrigatório', 'warning');
        return;
    }

    if (status === 'rejeitado' && !justificativa) {
        showToast('Justificativa é obrigatória para rejeição', 'warning');
        return;
    }

    const dados = {
        venda_id: vendaId,
        numero_reclamacao: numeroReclamacao,
        numero_operacao: numeroOperacao,
        protocolos: protocolosTemp,
        valor: valor,
        data_reclamacao: data,
        motivo: motivo,
        status: status,
        tipo_referencia: tipoReferencia,
        tipo_reclamacao: tipoReclamacao,
        observacoes: observacoes,
        justificativa_rejeicao: justificativa,
        numero_transacao: numeroTransacao,
        atualizado_em: new Date().toISOString()
    };

    if (status === 'resolvido') {
        dados.resolvido_por = nomeUsuario;
        dados.data_resolucao = new Date().toISOString();
    }

    try {
        let result;
        if (id) {
            // Atualizar existente
            result = await window.supabaseClient
                .from('reclamacoes_frete')
                .update(dados)
                .eq('id', id);
        } else {
            // Criar nova
            dados.criado_por = nomeUsuario;
            dados.criado_em = new Date().toISOString();
            result = await window.supabaseClient
                .from('reclamacoes_frete')
                .insert([dados]);
        }

        if (result.error) throw result.error;

        // ===== SE RESOLVIDO E COM REEMBOLSO, CRIAR NA ABA RECLAMAÇÕES =====
        if (status === 'resolvido' && tipoReclamacao === 'com_reembolso') {
            await criarReclamacaoNaAbaReembolsos(vendaId, dados);
        }

        showToast('Reclamação salva com sucesso!', 'success');
        fecharModalReclamacaoCompleta();
        await carregarFretesSalvos();
        await carregarListaReclamacoes();

    } catch (error) {
        console.error('Erro ao salvar reclamação:', error);
        showToast('Erro ao salvar: ' + error.message, 'error');
    }
}

// ============================================
// CRIAR RECLAMAÇÃO NA ABA REEMBOLSOS
// ============================================
async function criarReclamacaoNaAbaReembolsos(vendaId, dados) {
    try {
        // Verificar se já existe na tabela reembolsos
        const { data: existente } = await window.supabaseClient
            .from('reembolsos')
            .select('id')
            .eq('venda_id', vendaId)
            .maybeSingle();

        if (existente) {
            console.log('📋 Reclamação já existe na aba Reembolsos');
            return;
        }

        const nomeUsuario = getNomeUsuario();

        const dadosReembolso = {
            venda_id: vendaId,
            numero_venda: dados.numero_reclamacao || vendaId,
            numero_reclamacao: dados.numero_reclamacao,
            numero_operacao: dados.numero_operacao,
            valor: dados.valor || 0,
            data_reclamacao: dados.data_reclamacao || new Date().toISOString(),
            motivo: dados.motivo || 'Frete',
            status: 'a_verificar', // Status inicial na aba reclamações
            tipo_referencia: dados.tipo_referencia || 'venda',
            tipo_reclamacao: dados.tipo_reclamacao || 'com_reembolso',
            observacoes: dados.observacoes || '',
            protocolos: dados.protocolos || [],
            criado_por: nomeUsuario,
            criado_em: new Date().toISOString(),
            atualizado_em: new Date().toISOString()
        };

        const { error } = await window.supabaseClient
            .from('reembolsos')
            .insert([dadosReembolso]);

        if (error) throw error;

        console.log(`✅ Reclamação criada na aba Reembolsos para venda ${vendaId}`);
        showToast('📋 Reclamação enviada para a aba Reclamações!', 'success');

    } catch (error) {
        console.error('Erro ao criar reclamação na aba Reembolsos:', error);
    }
}

// ============================================
// VER RECLAMAÇÃO COMPLETA
// ============================================
async function verReclamacaoCompleta(vendaId) {
    try {
        const { data, error } = await window.supabaseClient
            .from('reclamacoes_frete')
            .select('*')
            .eq('venda_id', vendaId)
            .order('criado_em', { ascending: false });
        
        if (error) throw error;
        if (!data || data.length === 0) {
            showToast('Nenhuma reclamação encontrada', 'info');
            return;
        }
        
        const recl = data[0];
        abrirModalReclamacaoCompleta(
            recl.venda_id,
            recl.valor || 0,
            0, // freteCobrado
            0  // freteEsperado
        );
        
        // Preencher com os dados existentes
        document.getElementById('reclamacaoId').value = recl.id;
        document.getElementById('reclamacaoNumeroReclamacao').value = recl.numero_reclamacao || '';
        document.getElementById('reclamacaoNumeroOperacao').value = recl.numero_operacao || '';
        document.getElementById('reclamacaoValor').value = recl.valor || 0;
        document.getElementById('reclamacaoData').value = recl.data_reclamacao ? recl.data_reclamacao.split('T')[0] : '';
        document.getElementById('reclamacaoMotivo').value = recl.motivo || '';
        document.getElementById('reclamacaoStatus').value = recl.status || 'aberto';
        document.getElementById('reclamacaoObservacoes').value = recl.observacoes || '';
        document.getElementById('reclamacaoJustificativa').value = recl.justificativa_rejeicao || '';
        document.getElementById('reclamacaoNumeroTransacao').value = recl.numero_transacao || '';
        
        if (recl.protocolos && recl.protocolos.length > 0) {
            protocolosTemp = recl.protocolos;
            renderizarProtocolos();
        }
        
        onStatusChange();
        
    } catch (error) {
        console.error('Erro ao ver reclamação:', error);
        showToast('Erro ao carregar reclamação', 'error');
    }
}

// ============================================
// CARREGAR LISTA DE RECLAMAÇÕES (FILTRO)
// ============================================
async function carregarListaReclamacoes() {
    const tbody = document.getElementById('reclamacoesFreteBody');
    if (!tbody) return;

    try {
        let query = window.supabaseClient
            .from('reclamacoes_frete')
            .select('*')
            .order('criado_em', { ascending: false });

        if (filtroStatusReclamacao !== 'todos') {
            query = query.eq('status', filtroStatusReclamacao);
        }

        const { data, error } = await query;
        if (error) throw error;

        reclamacoesCache = data || [];

        if (reclamacoesCache.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8" class="text-center">Nenhuma reclamação encontrada.</td></tr>`;
            return;
        }

        tbody.innerHTML = '';
        reclamacoesCache.forEach(recl => {
            const statusColors = {
                'aberto': 'warning',
                'em_andamento': 'info',
                'rejeitado': 'danger',
                'resolvido': 'success'
            };

            const row = document.createElement('tr');
            row.innerHTML = `
                <td><strong>${recl.venda_id}</strong></td>
                <td>${recl.numero_reclamacao || '-'}</td>
                <td>${recl.numero_operacao || '-'}</td>
                <td>${recl.protocolos ? recl.protocolos.join(', ') : '-'}</td>
                <td>R$ ${(recl.valor || 0).toFixed(2)}</td>
                <td>${recl.motivo || '-'}</td>
                <td><span class="badge badge-${statusColors[recl.status] || 'secondary'}">${recl.status}</span></td>
                <td>
                    <button class="btn btn-sm btn-primary" onclick="verReclamacaoCompleta('${recl.venda_id}')">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button class="btn btn-sm btn-info" onclick="verHistoricoReclamacao('${recl.venda_id}')">
                        <i class="fas fa-history"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(row);
        });

    } catch (error) {
        console.error('Erro ao carregar reclamações:', error);
        tbody.innerHTML = `<tr><td colspan="8" class="text-center text-danger">Erro: ${error.message}</td></tr>`;
    }
}

// ============================================
// FILTRAR RECLAMAÇÕES
// ============================================
function filtrarReclamacoes(status) {
    filtroStatusReclamacao = status;
    
    // Atualizar botões
    document.querySelectorAll('.btn-filtro-reclamacao').forEach(btn => {
        btn.classList.remove('btn-primary', 'active');
        btn.classList.add('btn-outline-secondary');
    });
    
    const btn = document.querySelector(`.btn-filtro-reclamacao[data-status="${status}"]`);
    if (btn) {
        btn.classList.remove('btn-outline-secondary');
        btn.classList.add('btn-primary', 'active');
    }
    
    carregarListaReclamacoes();
}

// ============================================
// VER HISTÓRICO DA RECLAMAÇÃO
// ============================================
async function verHistoricoReclamacao(vendaId) {
    try {
        const { data, error } = await window.supabaseClient
            .from('reclamacoes_frete')
            .select('*')
            .eq('venda_id', vendaId)
            .order('criado_em', { ascending: true });
        
        if (error) throw error;
        if (!data || data.length === 0) {
            showToast('Nenhum histórico encontrado', 'info');
            return;
        }

        let html = `
            <div id="modalHistoricoReclamacao" class="modal" style="display: flex;">
                <div class="modal-content" style="max-width: 800px; max-height: 80vh; overflow-y: auto;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 2px solid #00ADEE; padding-bottom: 15px;">
                        <h3 style="margin:0;"><i class="fas fa-history"></i> Histórico da Reclamação</h3>
                        <button onclick="fecharModalHistoricoReclamacao()" style="background:none; border:none; font-size:24px;">&times;</button>
                    </div>
                    <p><strong>Venda:</strong> ${vendaId}</p>
                    <div class="table-responsive">
                        <table class="table table-striped">
                            <thead>
                                <tr>
                                    <th>Data</th>
                                    <th>Status</th>
                                    <th>Protocolos</th>
                                    <th>Observações</th>
                                    <th>Usuário</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${data.map(item => `
                                    <tr>
                                        <td>${new Date(item.criado_em).toLocaleString('pt-BR')}</td>
                                        <td><span class="badge badge-${item.status === 'resolvido' ? 'success' : item.status === 'rejeitado' ? 'danger' : 'warning'}">${item.status}</span></td>
                                        <td>${item.protocolos ? item.protocolos.join(', ') : '-'}</td>
                                        <td>${item.observacoes || '-'}</td>
                                        <td>${item.criado_por || '-'}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                    <div class="d-flex justify-content-end mt-3">
                        <button class="btn btn-secondary" onclick="fecharModalHistoricoReclamacao()">Fechar</button>
                    </div>
                </div>
            </div>
        `;

        const modalAnterior = document.getElementById('modalHistoricoReclamacao');
        if (modalAnterior) modalAnterior.remove();
        
        document.body.insertAdjacentHTML('beforeend', html);

    } catch (error) {
        console.error('Erro ao carregar histórico:', error);
        showToast('Erro ao carregar histórico', 'error');
    }
}

function fecharModalHistoricoReclamacao() {
    document.getElementById('modalHistoricoReclamacao')?.remove();
}

// ============================================
// GERAR RELATÓRIO DE RECLAMAÇÕES
// ============================================
async function gerarRelatorioReclamacoes() {
    try {
        const { data, error } = await window.supabaseClient
            .from('reclamacoes_frete')
            .select('*')
            .order('criado_em', { ascending: false });
        
        if (error) throw error;
        if (!data || data.length === 0) {
            showToast('Nenhuma reclamação para gerar relatório', 'info');
            return;
        }

        const dadosExcel = data.map(item => ({
            'Venda': item.venda_id,
            'Nº Reclamação': item.numero_reclamacao || '-',
            'Nº Operação': item.numero_operacao || '-',
            'Protocolos': item.protocolos ? item.protocolos.join('; ') : '-',
            'Valor (R$)': item.valor || 0,
            'Data': item.data_reclamacao ? new Date(item.data_reclamacao).toLocaleDateString('pt-BR') : '-',
            'Motivo': item.motivo || '-',
            'Status': item.status,
            'Observações': item.observacoes || '-',
            'Justificativa Rejeição': item.justificativa_rejeicao || '-',
            'Nº Transação': item.numero_transacao || '-',
            'Criado por': item.criado_por || '-',
            'Resolvido por': item.resolvido_por || '-',
            'Data Resolução': item.data_resolucao ? new Date(item.data_resolucao).toLocaleString('pt-BR') : '-',
            'Criado em': new Date(item.criado_em).toLocaleString('pt-BR')
        }));

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(dadosExcel);
        XLSX.utils.book_append_sheet(wb, ws, 'Reclamações Frete');
        
        const colWidths = [
            { wch: 20 }, { wch: 15 }, { wch: 15 }, { wch: 25 },
            { wch: 12 }, { wch: 12 }, { wch: 20 }, { wch: 15 },
            { wch: 30 }, { wch: 30 }, { wch: 15 }, { wch: 15 },
            { wch: 15 }, { wch: 20 }, { wch: 20 }
        ];
        ws['!cols'] = colWidths;

        const nomeArquivo = `reclamacoes_frete_${new Date().toISOString().split('T')[0]}.xlsx`;
        XLSX.writeFile(wb, nomeArquivo);
        showToast(`Relatório gerado com ${data.length} registros!`, 'success');

    } catch (error) {
        console.error('Erro ao gerar relatório:', error);
        showToast('Erro ao gerar relatório', 'error');
    }
}

// ============================================
// MODAL EDITOR DE FOTO
// ============================================
let skuEditando = null;
let vendaIdEditando = null;

function abrirEditorFoto(vendaId, sku) {
    vendaIdEditando = vendaId;
    skuEditando = sku;

    const modal = document.getElementById('modalEditorFoto');
    if (!modal) {
        criarModalEditorFoto();
        setTimeout(() => abrirEditorFoto(vendaId, sku), 100);
        return;
    }

    buscarMedidasPorSKU(sku).then(medidas => {
        if (medidas) {
            document.getElementById('editComprimento').value = medidas.comprimento_cm || 22;
            document.getElementById('editLargura').value = medidas.largura_cm || 16;
            document.getElementById('editAltura').value = medidas.altura_cm || 1;
            document.getElementById('editPeso').value = medidas.peso_kg || 0.3;
            if (medidas.foto_url) {
                document.getElementById('editFotoPreview').innerHTML = `<img src="${medidas.foto_url}" style="max-width:150px; max-height:150px; border-radius:8px;">`;
            } else {
                document.getElementById('editFotoPreview').innerHTML = 'Nenhuma foto';
            }
        } else {
            document.getElementById('editComprimento').value = 22;
            document.getElementById('editLargura').value = 16;
            document.getElementById('editAltura').value = 1;
            document.getElementById('editPeso').value = 0.3;
            document.getElementById('editFotoPreview').innerHTML = 'Nenhuma foto';
        }
        document.getElementById('editSkuDisplay').textContent = sku;
    });

    modal.classList.remove('hidden');
}

function fecharEditorFoto() {
    document.getElementById('modalEditorFoto').classList.add('hidden');
    vendaIdEditando = null;
    skuEditando = null;
}

async function salvarMedidasEFoto() {
    const sku = skuEditando;
    if (!sku || sku === 'N/A' || sku === 'SEM SKU') {
        showToast('SKU inválido para salvar', 'warning');
        return;
    }

    const comprimento = parseFloat(document.getElementById('editComprimento').value) || 22;
    const largura = parseFloat(document.getElementById('editLargura').value) || 16;
    const altura = parseFloat(document.getElementById('editAltura').value) || 1;
    const peso = parseFloat(document.getElementById('editPeso').value) || 0.3;

    const fileInput = document.getElementById('editFotoUpload');
    let fotoUrl = null;
    if (fileInput && fileInput.files.length > 0) {
        const file = fileInput.files[0];
        try {
            const fileExt = file.name.split('.').pop();
            const fileName = `produtos/${sku}_${Date.now()}.${fileExt}`;
            const { data, error } = await window.supabaseClient.storage
                .from('produto_fotos')
                .upload(fileName, file);
            if (error) throw error;
            const { data: urlData } = window.supabaseClient.storage
                .from('produto_fotos')
                .getPublicUrl(fileName);
            fotoUrl = urlData.publicUrl;
        } catch (error) {
            console.error('Erro ao fazer upload da foto:', error);
            showToast('Erro ao enviar foto', 'error');
            return;
        }
    }

    const sucesso = await salvarMedidasSKU(sku, comprimento, largura, altura, peso, fotoUrl);
    if (sucesso) {
        if (vendaIdEditando) {
            const pesoVol = calcularPesoVolumetrico(comprimento, largura, altura);
            await window.supabaseClient
                .from('fretes_ml')
                .update({
                    comprimento_cm: comprimento,
                    largura_cm: largura,
                    altura_cm: altura,
                    peso_estimado: peso,
                    peso_volumetrico: pesoVol,
                    foto_url: fotoUrl
                })
                .eq('id', vendaIdEditando);
        }
        fecharEditorFoto();
        await carregarFretesSalvos();
        showToast('Medidas e foto salvas com sucesso!', 'success');
    }
}

function criarModalEditorFoto() {
    if (document.getElementById('modalEditorFoto')) return;

    const modalHTML = `
        <div id="modalEditorFoto" class="modal hidden">
            <div class="modal-content" style="max-width: 500px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                    <h3><i class="fas fa-camera"></i> Editar Medidas e Foto</h3>
                    <button onclick="fecharEditorFoto()" style="background:none; border:none; font-size:24px;">&times;</button>
                </div>
                <div class="form-group">
                    <label>SKU</label>
                    <div><strong id="editSkuDisplay"></strong></div>
                </div>
                <div class="row">
                    <div class="col-md-4">
                        <div class="form-group">
                            <label>Comprimento (cm)</label>
                            <input type="number" id="editComprimento" class="form-control" step="0.1" min="0" value="22">
                        </div>
                    </div>
                    <div class="col-md-4">
                        <div class="form-group">
                            <label>Largura (cm)</label>
                            <input type="number" id="editLargura" class="form-control" step="0.1" min="0" value="16">
                        </div>
                    </div>
                    <div class="col-md-4">
                        <div class="form-group">
                            <label>Altura (cm)</label>
                            <input type="number" id="editAltura" class="form-control" step="0.1" min="0" value="1">
                        </div>
                    </div>
                </div>
                <div class="form-group">
                    <label>Peso (kg)</label>
                    <input type="number" id="editPeso" class="form-control" step="0.01" min="0" value="0.3">
                </div>
                <div class="form-group">
                    <label>Foto do Produto</label>
                    <input type="file" id="editFotoUpload" class="form-control-file" accept="image/*">
                    <div id="editFotoPreview" style="margin-top:10px;">Nenhuma foto</div>
                </div>
                <div class="d-flex justify-content-end gap-2 mt-3">
                    <button class="btn btn-secondary" onclick="fecharEditorFoto()">Cancelar</button>
                    <button class="btn btn-success" onclick="salvarMedidasEFoto()">Salvar</button>
                </div>
            </div>
        </div>
    `;

    const div = document.createElement('div');
    div.innerHTML = modalHTML;
    document.body.appendChild(div.firstElementChild);
}

// ============================================
// INICIALIZAÇÃO
// ============================================
document.addEventListener('DOMContentLoaded', function() {
    criarModalEditorFoto();
    criarModalReclamacaoCompleta();

    // Botão de exportar
    const headerContagem = document.querySelector('.card-header:has(#contagemFretes)');
    if (headerContagem) {
        let btnExport = document.getElementById('exportarFretesExcelBtn');
        if (!btnExport) {
            btnExport = document.createElement('button');
            btnExport.id = 'exportarFretesExcelBtn';
            btnExport.className = 'btn btn-success btn-sm ml-2';
            btnExport.innerHTML = '<i class="fas fa-file-excel"></i> Exportar Excel';
            btnExport.onclick = window.exportarFretesExcel;
            headerContagem.appendChild(btnExport);
        }
        
        // Botão de relatório
        let btnRelatorio = document.getElementById('btnRelatorioReclamacoes');
        if (!btnRelatorio) {
            btnRelatorio = document.createElement('button');
            btnRelatorio.id = 'btnRelatorioReclamacoes';
            btnRelatorio.className = 'btn btn-info btn-sm ml-2';
            btnRelatorio.innerHTML = '<i class="fas fa-chart-bar"></i> Relatório';
            btnRelatorio.onclick = window.gerarRelatorioReclamacoes;
            headerContagem.appendChild(btnRelatorio);
        }
    }

    // Carregar dados iniciais
    if (document.getElementById('shippingSimpleBody')) {
        carregarFretesSalvos();
    }

    // Carregar lista de reclamações
    if (document.getElementById('reclamacoesFreteBody')) {
        carregarListaReclamacoes();
    }

    const btnBuscar = document.getElementById('btnBuscarFretes');
    if (btnBuscar) {
        btnBuscar.addEventListener('click', buscarFretes);
    }

    console.log('✅ shipping_simple.js PRONTO (v35) - Sistema completo de reclamações');
});

// ============================================
// EXPORTAÇÕES GLOBAIS
// ============================================
window.carregarFretesSalvos = carregarFretesSalvos;
window.buscarFretes = buscarFretes;
window.exportarFretesExcel = exportarFretesExcel;
window.salvarMedidasERecalcular = salvarMedidasERecalcular;
window.calcularFreteEsperado = calcularFreteEsperado;
window.calcularPesoVolumetrico = calcularPesoVolumetrico;
window.abrirModalReclamacaoCompleta = abrirModalReclamacaoCompleta;
window.fecharModalReclamacaoCompleta = fecharModalReclamacaoCompleta;
window.salvarReclamacaoCompleta = salvarReclamacaoCompleta;
window.verReclamacaoCompleta = verReclamacaoCompleta;
window.carregarListaReclamacoes = carregarListaReclamacoes;
window.filtrarReclamacoes = filtrarReclamacoes;
window.gerarRelatorioReclamacoes = gerarRelatorioReclamacoes;
window.verHistoricoReclamacao = verHistoricoReclamacao;
window.fecharModalHistoricoReclamacao = fecharModalHistoricoReclamacao;
window.adicionarProtocolo = adicionarProtocolo;
window.removerProtocolo = removerProtocolo;
window.onStatusChange = onStatusChange;
window.toggleReferenciaFields = toggleReferenciaFields;
window.toggleOperacaoField = toggleOperacaoField;
window.toggleCamposReclamacao = toggleCamposReclamacao;
window.abrirEditorFoto = abrirEditorFoto;
window.fecharEditorFoto = fecharEditorFoto;
window.salvarMedidasEFoto = salvarMedidasEFoto;
window.extrairFreteDaVenda = extrairFreteDaVenda;