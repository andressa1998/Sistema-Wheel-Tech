// ============================================
// SHIPPING_SIMPLE.JS - VERSÃO COMPLETA V4.6
// SISTEMA DE RECLAMAÇÕES DE FRETE - CORREÇÃO FULL E EXPORTAÇÕES
// ============================================

console.log('🚚 shipping_simple.js v4.6 carregado - Sistema completo de reclamações de frete');

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
let currentReclamacaoId = null;

let fretesPaginaAtual = 1;
let fretesPorPagina = 20;
let fretesDadosCompletos = [];
let fretesFiltrados = [];

// ============================================
// FUNÇÕES AUXILIARES
// ============================================
function isFullByAnyField(item) {
    const text = `${item.titulo || ''} ${item.mlb || ''} ${item.id || ''} ${item.tipo_envio || ''} ${item.sku || ''}`.toLowerCase();
    const fullKeywords = ['full', 'fulfillment', 'fulfilment'];
    return fullKeywords.some(keyword => text.includes(keyword));
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

function formatarDataISO(dataISO) {
    if (!dataISO) return '-';
    const data = new Date(dataISO);
    return data.toLocaleDateString('pt-BR') + ' ' + data.toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'});
}

function showToast(mensagem, tipo = 'info') {
    const toastExistente = document.querySelector('.custom-toast');
    if (toastExistente) toastExistente.remove();
    
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
        if (toast.parentNode) toast.remove();
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
// FUNÇÃO AUXILIAR: VERIFICAR SE SHIPMENT É FULL
// ============================================
async function isShipmentFULL(shipmentId, token) {
    try {
        const shipUrl = `https://api.mercadolibre.com/shipments/${shipmentId}`;
        const shipProxy = `${window.WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(shipUrl)}&token=${encodeURIComponent(token)}`;
        const shipResp = await fetch(shipProxy);
        if (shipResp.ok) {
            const shipData = await shipResp.json();
            const logisticType = shipData.logistic_type || '';
            const tags = shipData.tags || [];
            const shippingMode = shipData.mode || '';
            
            return logisticType.toLowerCase().includes('full') ||
                   logisticType.toLowerCase().includes('fulfillment') ||
                   tags.some(t => t.toLowerCase().includes('full')) ||
                   tags.some(t => t.toLowerCase().includes('fulfillment')) ||
                   shippingMode.toLowerCase().includes('full');
        }
        return false;
    } catch (e) {
        console.warn(`Erro ao verificar shipment ${shipmentId}:`, e.message);
        return false;
    }
}

// ============================================
// EXTRAIR FRETE DA VENDA - CORRIGIDA (AGORA ASYNC)
// ============================================
async function extrairFreteDaVenda(order, token) {
    console.log(`🔍 Extraindo frete da venda ${order.id}...`);
    
    let freteCobrado = 0;
    let fonte = 'nenhuma';
    
    // 1. PRIORIDADE MÁXIMA: receiver_cost do order.shipping (valor cobrado do cliente)
    if (order.shipping && order.shipping.receiver_cost !== undefined && order.shipping.receiver_cost !== null) {
        freteCobrado = parseFloat(order.shipping.receiver_cost) || 0;
        fonte = 'order.shipping.receiver_cost';
        console.log(`💰 Frete via ${fonte}: R$ ${freteCobrado.toFixed(2)}`);
        return { frete: freteCobrado, fonte };
    }
    
    // 2. Tentar receiver_cost do shipping_option
    if (order.shipping && order.shipping.shipping_option && order.shipping.shipping_option.receiver_cost !== undefined) {
        freteCobrado = parseFloat(order.shipping.shipping_option.receiver_cost) || 0;
        fonte = 'shipping_option.receiver_cost';
        if (freteCobrado > 0) {
            console.log(`💰 Frete via ${fonte}: R$ ${freteCobrado.toFixed(2)}`);
            return { frete: freteCobrado, fonte };
        }
    }
    
    // 3. Tentar cost do order.shipping (custo do ML, pode ser diferente do cobrado)
    if (order.shipping && order.shipping.cost !== undefined && order.shipping.cost !== null) {
        const cost = parseFloat(order.shipping.cost) || 0;
        if (cost > 0) {
            freteCobrado = cost;
            fonte = 'order.shipping.cost (fallback)';
            console.log(`⚠️ Frete via ${fonte}: R$ ${freteCobrado.toFixed(2)}`);
            return { frete: freteCobrado, fonte };
        }
    }
    
    // 4. Buscar shipment completo (se disponível)
    if (order.shipping && order.shipping.id && token) {
        try {
            console.log(`🔄 Buscando shipment ${order.shipping.id} para obter frete...`);
            const shipUrl = `https://api.mercadolibre.com/shipments/${order.shipping.id}`;
            const shipProxy = `${window.WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(shipUrl)}&token=${encodeURIComponent(token)}`;
            
            const response = await fetch(shipProxy);
            if (response.ok) {
                const shipData = await response.json();
                
                // 4a. receiver_cost do shipment (MAIS CONFIÁVEL)
                if (shipData.receiver_cost !== undefined && shipData.receiver_cost !== null) {
                    const receiverCost = parseFloat(shipData.receiver_cost) || 0;
                    if (receiverCost > 0) {
                        freteCobrado = receiverCost;
                        fonte = 'shipment.receiver_cost';
                        console.log(`💰 Frete via ${fonte}: R$ ${freteCobrado.toFixed(2)}`);
                        return { frete: freteCobrado, fonte };
                    }
                }
                
                // 4b. cost do shipment
                if (shipData.cost !== undefined && shipData.cost !== null) {
                    const cost = parseFloat(shipData.cost) || 0;
                    if (cost > 0 && freteCobrado === 0) {
                        freteCobrado = cost;
                        fonte = 'shipment.cost (fallback)';
                        console.log(`⚠️ Frete via ${fonte}: R$ ${freteCobrado.toFixed(2)}`);
                        return { frete: freteCobrado, fonte };
                    }
                }
                
                // 4c. shipping_option.cost
                if (shipData.shipping_option && shipData.shipping_option.cost !== undefined) {
                    const cost = parseFloat(shipData.shipping_option.cost) || 0;
                    if (cost > 0 && freteCobrado === 0) {
                        freteCobrado = cost;
                        fonte = 'shipment.shipping_option.cost';
                        console.log(`⚠️ Frete via ${fonte}: R$ ${freteCobrado.toFixed(2)}`);
                        return { frete: freteCobrado, fonte };
                    }
                }
            }
        } catch (e) {
            console.warn(`Erro ao buscar shipment ${order.shipping.id}:`, e.message);
        }
    }
    
    // 5. Tentar calcular por diferença (último recurso)
    if (freteCobrado === 0 && order.total_amount && order.order_items) {
        let itemTotal = 0;
        for (const item of order.order_items) {
            itemTotal += (item.unit_price || 0) * (item.quantity || 0);
        }
        const diff = (order.total_amount || 0) - itemTotal;
        if (diff > 0.01) {
            freteCobrado = diff;
            fonte = 'diferença (total - itens)';
            console.log(`⚠️ Frete via ${fonte}: R$ ${freteCobrado.toFixed(2)}`);
            return { frete: freteCobrado, fonte };
        }
    }
    
    console.log(`⚠️ Nenhum frete encontrado para venda ${order.id}`);
    return { frete: 0, fonte: 'nenhuma' };
}

// ============================================
// BUSCAR FRETES (SINCRONIZAÇÃO)
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

    tbody.innerHTML = '<tr><td colspan="15" class="text-center"><div class="spinner"></div> Buscando vendas para análise de frete...</td></tr>';
    if (contagem) contagem.textContent = 'Sincronizando...';

    try {
        const resultado = await buscarFretesML(50);

        if (!resultado || !resultado.vendas) {
            throw new Error('Nenhum resultado retornado');
        }

        console.log(`📦 ${resultado.vendas.length} vendas retornadas da busca de frete`);

        if (resultado.vendas.length === 0) {
            tbody.innerHTML = '<tr><td colspan="15" class="text-center">Nenhuma venda encontrada.</td></tr>';
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

            // ===== VERIFICAÇÃO DUPLA DE FULL =====
            const isFull = venda.tipo_envio === 'FULL' || 
                           venda.tipo_envio === 'FULFILLMENT' ||
                           isFullByAnyField(venda);
            
            if (isFull) {
                totalFullIgnorados++;
                console.log(`⏭️ Venda ${idVenda} é FULL, ignorando`);
                continue;
            }

            const freteCobrado = venda.frete_cobrado || 0;
            const quantidade = venda.quantidade || 1;
            const sku = venda.sku || 'N/A';
            const titulo = venda.titulo || 'Sem título';
            const mlb = venda.mlb_id || 'N/A';
            const valorProduto = venda.valor_total || 0;

            // Se frete cobrado for 0, não é relevante
            if (freteCobrado === 0) {
                totalCorretosIgnorados++;
                continue;
            }

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

        if (registrosParaInserir.length === 0) {
            let msg = `Nenhum frete incorreto encontrado.`;
            if (totalCorretosIgnorados > 0) msg += ` ${totalCorretosIgnorados} corretos ignorados.`;
            if (totalFullIgnorados > 0) msg += ` ${totalFullIgnorados} FULL ignorados.`;
            tbody.innerHTML = `<tr><td colspan="15" class="text-center">${msg}</td></tr>`;
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
        tbody.innerHTML = `<tr><td colspan="15" class="text-center text-danger">Erro: ${error.message}</td></tr>`;
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
// CARREGAR FRETES SALVOS
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

        // Buscar reclamações
        let reclamacoes = [];
        try {
            const { data: reclData, error: reclError } = await window.supabaseClient
                .from('reclamacoes_frete')
                .select('venda_id, status, id, criado_por, data_reclamacao, numero_operacao, numero_transacao, protocolos, justificativa_rejeicao')
                .order('criado_em', { ascending: false });
            
            if (!reclError && reclData) {
                reclamacoes = reclData;
            }
        } catch (e) {
            console.warn('⚠️ Erro ao buscar reclamações:', e.message);
        }

        const reclamacoesMap = {};
        if (reclamacoes && reclamacoes.length > 0) {
            reclamacoes.forEach(r => {
                if (!reclamacoesMap[r.venda_id]) {
                    reclamacoesMap[r.venda_id] = [];
                }
                reclamacoesMap[r.venda_id].push(r);
            });
        }

        // ===== FILTRO MAIS ROBUSTO PARA FULL =====
        let dados = (data || []).filter(item => {
            // 1. Verificar tipo_envio
            if (item.tipo_envio === 'FULL' || item.tipo_envio === 'FULFILLMENT') return false;
            
            // 2. Verificar se contém FULL no texto
            if (isFullByAnyField(item)) return false;
            
            // 3. Verificar se tem frete > 0
            if (!item.frete_cobrado || item.frete_cobrado <= 0) return false;
            
            // 4. Verificar se frete esperado é calculável
            const peso = item.peso_estimado || 0.3;
            const freteEsperado = calcularFreteEsperado(item.valor_produto, peso);
            if (freteEsperado === null) return false;
            
            // 5. Verificar se é incorreto (diferença > 0.01)
            return Math.abs(item.frete_cobrado - freteEsperado) > 0.01;
        });

        console.log(`📊 ${dados.length} fretes incorretos após filtro FULL`);

        fretesDadosCompletos = dados.map(item => {
            const peso = item.peso_estimado || 0.3;
            const freteEsperado = calcularFreteEsperado(item.valor_produto, peso);
            const recls = reclamacoesMap[item.id] || [];
            
            return {
                ...item,
                freteEsperado,
                isIncorreto: true,
                reclamacoes: recls,
                temReclamacaoAberta: recls.some(r => r.status === 'aberto' || r.status === 'em_andamento'),
                temReclamacaoRejeitada: recls.some(r => r.status === 'rejeitado'),
                temReclamacaoResolvida: recls.some(r => r.status === 'resolvido'),
                ultimaReclamacao: recls.length > 0 ? recls[0] : null
            };
        });

        fretesFiltrados = [...fretesDadosCompletos];

        // Aplicar filtro de status se não for 'todos'
        if (filtroStatusReclamacao !== 'todos') {
            fretesFiltrados = fretesFiltrados.filter(item => {
                if (filtroStatusReclamacao === 'aberto') {
                    return item.temReclamacaoAberta;
                } else if (filtroStatusReclamacao === 'rejeitado') {
                    return item.temReclamacaoRejeitada;
                } else if (filtroStatusReclamacao === 'resolvido') {
                    return item.temReclamacaoResolvida;
                }
                return true;
            });
        }

        if (fretesFiltrados.length === 0) {
            tbody.innerHTML = '<tr><td colspan="15" class="text-center py-5">Nenhum frete encontrado com o filtro atual. 🎉</td></tr>';
            if (contagem) contagem.textContent = '0 incorretos';
            atualizarInfoPagina();
            return;
        }

        if (contagem) {
            contagem.textContent = `${fretesFiltrados.length} incorretos`;
        }

        const contagemReclamacoes = document.getElementById('contagemReclamacoes');
        if (contagemReclamacoes) {
            const totalReclamacoes = dados.filter(item => item.reclamacoes && item.reclamacoes.length > 0).length;
            contagemReclamacoes.textContent = `${totalReclamacoes} reclamações`;
        }

        fretesPaginaAtual = 1;
        renderizarPaginaFretes();
        atualizarInfoPagina();

    } catch (error) {
        console.error('❌ Erro ao carregar fretes:', error);
        const tbody = document.getElementById('shippingSimpleBody');
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="15" class="text-center text-danger">Erro: ${error.message}</td></tr>`;
        }
    }
}

// ============================================
// RENDERIZAR PÁGINA DE FRETES
// ============================================
function renderizarPaginaFretes() {
    const tbody = document.getElementById('shippingSimpleBody');
    if (!tbody) return;

    const inicio = (fretesPaginaAtual - 1) * fretesPorPagina;
    const fim = Math.min(inicio + fretesPorPagina, fretesFiltrados.length);
    const paginaDados = fretesFiltrados.slice(inicio, fim);

    if (paginaDados.length === 0) {
        tbody.innerHTML = '<tr><td colspan="15" class="text-center py-5">Nenhum dado encontrado.</td></tr>';
        return;
    }

    tbody.innerHTML = '';

    paginaDados.forEach((item) => {
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
        const freteEsperado = item.freteEsperado;

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

        let badgeReclamacao = '';
        if (item.temReclamacaoAberta) {
            badgeReclamacao = '<span class="badge badge-info ml-1"><i class="fas fa-clock"></i> Em andamento</span>';
        } else if (item.temReclamacaoRejeitada) {
            badgeReclamacao = '<span class="badge badge-danger ml-1"><i class="fas fa-times"></i> Rejeitada</span>';
        } else if (item.temReclamacaoResolvida) {
            badgeReclamacao = '<span class="badge badge-success ml-1"><i class="fas fa-check"></i> Resolvida</span>';
        }

        let infoReclamacao = '';
        if (item.ultimaReclamacao) {
            infoReclamacao = `
                <div style="font-size: 9px; color: #6c757d; margin-top: 2px; line-height: 1.2;">
                    ${item.ultimaReclamacao.status}: ${item.ultimaReclamacao.numero_operacao || ''}
                    ${item.ultimaReclamacao.numero_transacao ? `| TRANS: ${item.ultimaReclamacao.numero_transacao}` : ''}
                </div>
            `;
        }

        let fotoThumb = '';
        if (fotoUrl) {
            fotoThumb = `<img src="${fotoUrl}" style="width:35px; height:35px; object-fit:cover; border-radius:4px; cursor:pointer;" onclick="window.open('${fotoUrl}','_blank')">`;
        } else {
            fotoThumb = '<span class="text-muted" style="font-size:10px;">Sem foto</span>';
        }

        const dataVenda = item.data_venda ? new Date(item.data_venda).toLocaleDateString('pt-BR') : '-';

        const freteCobradoDisplay = freteCobrado > 0 ? `R$ ${freteCobrado.toFixed(2)}` : 'R$ 0,00';
        const skuDisplay = sku && sku !== 'N/A' ? sku : 'N/A';

        row.innerHTML = `
            <td><strong style="font-size:11px;">${item.id}</strong></td>
            <td style="max-width:180px; word-wrap:break-word; font-size:11px;">${item.titulo || 'Sem título'}</td>
            <td><code style="font-size:10px; word-break:break-all;">${skuDisplay}</code></td>
            <td><code style="font-size:10px;">${item.mlb || 'N/A'}</code></td>
            <td style="font-weight:600; color:#28a745; font-size:12px; text-align:right;">R$ ${valorProduto.toFixed(2)}</td>
            <td style="text-align:center; font-size:12px;">${quantidade}</td>
            <td style="font-weight:700; color:#dc3545; font-size:12px; text-align:right;">${freteCobradoDisplay}</td>
            <td class="frete-esperado-cell" style="font-weight:600; color:#17a2b8; font-size:12px; text-align:right;">${freteEsperado !== null ? `R$ ${freteEsperado.toFixed(2)}` : 'N/A'}</td>
            <td style="min-width:130px;">
                <span class="badge badge-${statusClass} status-badge" style="font-size:10px;">${statusText}</span>
                ${badgeReclamacao}
                ${infoReclamacao}
            </td>
            <td style="min-width:65px;">
                <input type="number" class="form-control form-control-sm peso-input" 
                       value="${peso}" step="0.01" min="0" 
                       data-venda-id="${item.id}" style="width:60px; font-size:10px; padding:2px 4px;">
            </td>
            <td style="min-width:160px;">
                <div style="display:flex; gap:2px; flex-wrap:wrap; align-items:center;">
                    <input type="number" class="form-control form-control-sm medida-input" 
                           value="${comprimento}" step="0.1" min="0" 
                           data-venda-id="${item.id}" data-medida="comprimento" style="width:40px; font-size:10px; padding:2px 4px;" placeholder="C">
                    <span style="font-size:9px;">x</span>
                    <input type="number" class="form-control form-control-sm medida-input" 
                           value="${largura}" step="0.1" min="0" 
                           data-venda-id="${item.id}" data-medida="largura" style="width:40px; font-size:10px; padding:2px 4px;" placeholder="L">
                    <span style="font-size:9px;">x</span>
                    <input type="number" class="form-control form-control-sm medida-input" 
                           value="${altura}" step="0.1" min="0" 
                           data-venda-id="${item.id}" data-medida="altura" style="width:40px; font-size:10px; padding:2px 4px;" placeholder="A">
                    <button class="btn btn-sm btn-success btn-salvar-medidas" 
                            data-venda-id="${item.id}" 
                            data-sku="${sku}"
                            style="padding:1px 5px; font-size:10px;">
                        <i class="fas fa-save"></i>
                    </button>
                </div>
                <div style="font-size:8px; color:#6c757d; margin-top:2px;">
                    Vol: <span class="peso-volumetrico-display">${pesoVol.toFixed(3)}</span> m³
                </div>
            </td>
            <td style="min-width:70px; text-align:center;">
                <div style="display:flex; flex-direction:column; align-items:center; gap:2px;">
                    ${fotoThumb}
                    <button class="btn btn-sm btn-outline-secondary" onclick="abrirEditorFoto('${item.id}', '${sku}')" title="Editar foto" style="padding:1px 5px; font-size:9px;">
                        <i class="fas fa-camera"></i>
                    </button>
                </div>
            </td>
            <td style="min-width:90px;">
                <button class="btn btn-sm btn-primary btn-reclamar" 
                        data-venda-id="${item.id}"
                        data-valor="${valorProduto}"
                        data-frete-cobrado="${freteCobrado}"
                        data-frete-esperado="${freteEsperado !== null ? freteEsperado : 0}"
                        ${item.temReclamacaoAberta ? 'disabled' : ''}
                        style="padding:2px 6px; font-size:10px; width:100%;">
                    <i class="fas fa-comment-dots"></i> Reclamar
                </button>
                ${item.temReclamacaoAberta || item.temReclamacaoRejeitada || item.temReclamacaoResolvida ? 
                    `<button class="btn btn-sm btn-info btn-ver-reclamacao" data-venda-id="${item.id}" title="Ver reclamações" style="padding:2px 6px; font-size:10px; width:100%; margin-top:2px;">
                        <i class="fas fa-eye"></i> Ver
                    </button>` : ''}
            </td>
            <td style="font-size:10px;">${dataVenda}</td>
            <td><span class="badge badge-secondary" style="font-size:9px;">${item.tipo_envio || 'N/I'}</span></td>
        `;

        tbody.appendChild(row);

        // Event listeners
        const btnSalvar = row.querySelector('.btn-salvar-medidas');
        if (btnSalvar) {
            btnSalvar.addEventListener('click', function() {
                salvarMedidasERecalcular(row, this.dataset.vendaId, this.dataset.sku);
            });
        }

        const btnReclamar = row.querySelector('.btn-reclamar');
        if (btnReclamar) {
            btnReclamar.addEventListener('click', function() {
                const vendaId = this.dataset.vendaId;
                const valor = parseFloat(this.dataset.valor) || 0;
                const freteCobrado = parseFloat(this.dataset.freteCobrado) || 0;
                const freteEsperado = parseFloat(this.dataset.freteEsperado) || 0;
                abrirModalReclamacaoCompleta(vendaId, valor, freteCobrado, freteEsperado);
            });
        }

        const btnVerReclamacao = row.querySelector('.btn-ver-reclamacao');
        if (btnVerReclamacao) {
            btnVerReclamacao.addEventListener('click', function() {
                verHistoricoReclamacoes(this.dataset.vendaId);
            });
        }
    });

    atualizarInfoPagina();
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
// FILTRAR RECLAMAÇÕES (FUNÇÃO GLOBAL)
// ============================================
function filtrarReclamacoes(status) {
    console.log(`📌 Filtrando reclamações por: ${status}`);
    filtroStatusReclamacao = status;
    
    document.querySelectorAll('.btn-filtro-reclamacao').forEach(btn => {
        btn.classList.remove('btn-primary', 'active');
        btn.classList.add('btn-outline-secondary');
    });
    
    const btn = document.querySelector(`.btn-filtro-reclamacao[data-status="${status}"]`);
    if (btn) {
        btn.classList.remove('btn-outline-warning', 'btn-outline-info', 'btn-outline-danger', 'btn-outline-success', 'btn-outline-secondary');
        btn.classList.add('btn-primary', 'active');
        console.log(`✅ Botão ativo: ${status}`);
    }
    
    carregarFretesSalvos();
}

// ============================================
// ATUALIZAR INFORMAÇÕES DA PÁGINA
// ============================================
function atualizarInfoPagina() {
    const total = fretesFiltrados.length;
    const inicio = (fretesPaginaAtual - 1) * fretesPorPagina + 1;
    const fim = Math.min(inicio + fretesPorPagina - 1, total);

    const infoEl = document.getElementById('infoFretes');
    if (infoEl) {
        infoEl.textContent = total > 0 ? `Mostrando ${inicio}-${fim} de ${total}` : 'Nenhum registro';
    }

    const btnAnterior = document.getElementById('btnFretesAnterior');
    const btnProxima = document.getElementById('btnFretesProxima');
    if (btnAnterior) btnAnterior.disabled = fretesPaginaAtual <= 1;
    if (btnProxima) btnProxima.disabled = fim >= total;
}

// ============================================
// NAVEGAÇÃO DA PÁGINA
// ============================================
function paginaFretesAnterior() {
    if (fretesPaginaAtual > 1) {
        fretesPaginaAtual--;
        renderizarPaginaFretes();
    }
}

function paginaFretesProxima() {
    const totalPaginas = Math.ceil(fretesFiltrados.length / fretesPorPagina);
    if (fretesPaginaAtual < totalPaginas) {
        fretesPaginaAtual++;
        renderizarPaginaFretes();
    }
}

// ============================================
// FUNÇÃO PARA CRIAR O MODAL DE RECLAMAÇÃO
// ============================================
function criarModalReclamacaoCompleta() {
    if (document.getElementById('modalReclamacaoCompleta')) return;

    const modalHTML = `
        <div id="modalReclamacaoCompleta" class="modal hidden">
            <div class="modal-content" style="max-width: 750px; max-height: 90vh; overflow-y: auto; padding: 0;">
                <div style="background: linear-gradient(135deg, #00ADEE, #80D6F7); color: white; padding: 15px 25px; display: flex; justify-content: space-between; align-items: center;">
                    <h3 style="margin:0;"><i class="fas fa-comment-dots"></i> Nova Reclamação de Frete</h3>
                    <button onclick="fecharModalReclamacaoCompleta()" style="background:none; border:none; color:white; font-size:24px; cursor:pointer;">&times;</button>
                </div>

                <div style="padding: 20px;">
                    <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 20px; display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                        <div>
                            <p style="margin: 4px 0;"><strong>Venda:</strong> <span id="reclamacaoNumeroVendaDisplay">-</span></p>
                            <p style="margin: 4px 0;"><strong>Valor Produto:</strong> R$ <span id="reclamacaoValorProdutoDisplay">0,00</span></p>
                        </div>
                        <div>
                            <p style="margin: 4px 0;"><strong>Frete Cobrado:</strong> R$ <span id="reclamacaoFreteCobradoDisplay">0,00</span></p>
                            <p style="margin: 4px 0;"><strong>Frete Esperado:</strong> R$ <span id="reclamacaoFreteEsperadoDisplay">0,00</span></p>
                            <p style="margin: 4px 0;"><strong>Diferença:</strong> R$ <span id="reclamacaoDiferencaDisplay" style="font-weight: bold;">0,00</span></p>
                        </div>
                    </div>

                    <input type="hidden" id="reclamacaoId">
                    <input type="hidden" id="reclamacaoVendaId">
                    <input type="hidden" id="reclamacaoValorProduto">
                    <input type="hidden" id="reclamacaoFreteCobrado">
                    <input type="hidden" id="reclamacaoFreteEsperado">
                    <input type="hidden" id="reclamacaoDiferenca">

                    <div class="form-group">
                        <label><strong>Tipo de referência *</strong></label>
                        <div class="d-flex gap-3">
                            <label><input type="radio" name="tipoReferencia" value="venda" checked onchange="toggleReferenciaFields()"> Venda</label>
                            <label><input type="radio" name="tipoReferencia" value="retirada" onchange="toggleReferenciaFields()"> Retirada FULL</label>
                        </div>
                    </div>

                    <div class="form-group" id="campoNumeroVenda">
                        <label><i class="fas fa-tag"></i> Número da Venda (16 caracteres)</label>
                        <input type="text" id="reclamacaoNumeroVenda" class="form-control" placeholder="Ex: 1234567890123456" maxlength="16">
                        <small style="color: #6c757d;">Deve ter exatamente 16 caracteres</small>
                    </div>

                    <div class="form-group">
                        <label><i class="fas fa-exclamation-circle"></i> Número da Reclamação *</label>
                        <input type="text" id="reclamacaoNumeroReclamacao" class="form-control" placeholder="Ex: REC123456" required>
                    </div>

                    <div class="form-group">
                        <label><i class="fas fa-receipt"></i> Número da Operação *</label>
                        <input type="text" id="reclamacaoNumeroOperacao" class="form-control" placeholder="Ex: OP789012" required>
                        <small style="color: #6c757d;">Número da operação de reembolso no Mercado Livre</small>
                    </div>

                    <div class="form-group">
                        <label><i class="fas fa-tag"></i> Tipo de reclamação *</label>
                        <div class="d-flex gap-3">
                            <label><input type="radio" name="tipoReclamacao" value="com_reembolso" checked onchange="toggleCamposReclamacao()"> Com reembolso</label>
                            <label><input type="radio" name="tipoReclamacao" value="sem_reembolso" onchange="toggleCamposReclamacao()"> Sem reembolso (apenas acompanhamento)</label>
                        </div>
                    </div>

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

                    <div class="form-group">
                        <label><i class="fas fa-list"></i> Protocolos</label>
                        <div class="d-flex gap-2">
                            <input type="text" id="campoProtocolo" class="form-control" placeholder="Número do protocolo">
                            <button type="button" class="btn btn-primary btn-sm" onclick="adicionarProtocolo()">
                                <i class="fas fa-plus"></i> Adicionar
                            </button>
                        </div>
                        <div id="listaProtocolos" style="margin-top: 10px; max-height: 120px; overflow-y: auto; border: 1px solid #e9ecef; border-radius: 4px; padding: 5px; background: #fafafa;">
                            <small style="color: #6c757d;">Nenhum protocolo adicionado</small>
                        </div>
                    </div>

                    <div class="form-group">
                        <label><i class="fas fa-tag"></i> Status *</label>
                        <select id="reclamacaoStatus" class="form-control" onchange="onStatusChange()" required>
                            <option value="aberto">Aberto</option>
                            <option value="em_andamento">Em andamento</option>
                            <option value="rejeitado">Rejeitado</option>
                            <option value="resolvido">Resolvido</option>
                        </select>
                    </div>

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

                    <div id="campoNumeroTransacao" style="display: none;">
                        <div class="form-group">
                            <label><i class="fas fa-exchange-alt"></i> Número da Transação *</label>
                            <input type="text" id="reclamacaoNumeroTransacao" class="form-control" placeholder="Ex: TRANS123456">
                            <small style="color: #6c757d;">Número da transação do reembolso</small>
                        </div>
                    </div>

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
    if (modal) modal.classList.add('hidden');
    protocolosTemp = [];
    currentReclamacaoId = null;
}

function toggleReferenciaFields() {
    const tipo = document.querySelector('input[name="tipoReferencia"]:checked')?.value || 'venda';
    const campoNumeroVenda = document.getElementById('campoNumeroVenda');
    if (campoNumeroVenda) {
        campoNumeroVenda.style.display = tipo === 'venda' ? 'block' : 'none';
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
        if (status === 'rejeitado') {
            document.getElementById('reclamacaoJustificativa').required = true;
        } else {
            document.getElementById('reclamacaoJustificativa').required = false;
        }
    }
    if (campoNumeroTransacao) {
        campoNumeroTransacao.style.display = status === 'resolvido' ? 'block' : 'none';
        if (status === 'resolvido') {
            document.getElementById('reclamacaoNumeroTransacao').required = true;
        } else {
            document.getElementById('reclamacaoNumeroTransacao').required = false;
        }
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
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 4px 10px; background: #f8f9fa; border-radius: 4px; margin-bottom: 4px; border-left: 3px solid #00ADEE;">
            <span style="font-size: 13px;"><i class="fas fa-hashtag" style="color:#00ADEE;"></i> ${p}</span>
            <button type="button" class="btn btn-sm btn-danger" onclick="removerProtocolo(${i})" style="padding: 0 6px; font-size: 12px;">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `).join('');
}

// ============================================
// ABRIR MODAL DE RECLAMAÇÃO
// ============================================
function abrirModalReclamacaoCompleta(vendaId, valorProduto, freteCobrado, freteEsperado) {
    let modal = document.getElementById('modalReclamacaoCompleta');
    if (!modal) {
        criarModalReclamacaoCompleta();
        modal = document.getElementById('modalReclamacaoCompleta');
        if (!modal) {
            showToast('Erro ao criar modal. Tente novamente.', 'error');
            return;
        }
    }

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
        campoJustificativa: document.getElementById('campoJustificativa'),
        campoNumeroTransacao: document.getElementById('campoNumeroTransacao'),
        campoNumeroVenda: document.getElementById('campoNumeroVenda'),
        valorDisplay: document.getElementById('reclamacaoValorProdutoDisplay'),
        freteCobradoDisplay: document.getElementById('reclamacaoFreteCobradoDisplay'),
        freteEsperadoDisplay: document.getElementById('reclamacaoFreteEsperadoDisplay'),
        diferencaDisplay: document.getElementById('reclamacaoDiferencaDisplay'),
        numeroVendaDisplay: document.getElementById('reclamacaoNumeroVendaDisplay')
    };

    const elementosFaltando = Object.entries(elementos)
        .filter(([key, el]) => !el)
        .map(([key]) => key);

    if (elementosFaltando.length > 0) {
        console.error('Elementos faltando no modal:', elementosFaltando);
        const modalAntigo = document.getElementById('modalReclamacaoCompleta');
        if (modalAntigo) modalAntigo.remove();
        criarModalReclamacaoCompleta();
        setTimeout(() => abrirModalReclamacaoCompleta(vendaId, valorProduto, freteCobrado, freteEsperado), 300);
        return;
    }

    const diferenca = freteCobrado - freteEsperado;
    
    elementos.vendaId.value = vendaId || '';
    elementos.valorProduto.value = (valorProduto || 0).toFixed(2);
    elementos.freteCobrado.value = (freteCobrado || 0).toFixed(2);
    elementos.freteEsperado.value = (freteEsperado || 0).toFixed(2);
    elementos.diferenca.value = diferenca.toFixed(2);
    elementos.status.value = 'aberto';
    elementos.data.value = new Date().toISOString().split('T')[0];
    
    elementos.valorDisplay.textContent = (valorProduto || 0).toFixed(2);
    elementos.freteCobradoDisplay.textContent = (freteCobrado || 0).toFixed(2);
    elementos.freteEsperadoDisplay.textContent = (freteEsperado || 0).toFixed(2);
    elementos.diferencaDisplay.textContent = diferenca.toFixed(2);
    elementos.diferencaDisplay.style.color = diferenca > 0 ? '#dc3545' : (diferenca < 0 ? '#28a745' : '#6c757d');
    elementos.numeroVendaDisplay.textContent = vendaId || '-';
    
    elementos.numeroReclamacao.value = '';
    elementos.numeroOperacao.value = '';
    elementos.observacoes.value = '';
    elementos.justificativa.value = '';
    elementos.numeroTransacao.value = '';
    elementos.id.value = '';
    elementos.valor.value = '0';
    elementos.motivo.value = '';
    
    protocolosTemp = [];
    if (elementos.listaProtocolos) {
        elementos.listaProtocolos.innerHTML = '<small style="color: #6c757d;">Nenhum protocolo adicionado</small>';
    }
    if (elementos.campoProtocolo) {
        elementos.campoProtocolo.value = '';
    }
    
    if (elementos.campoJustificativa) {
        elementos.campoJustificativa.style.display = 'none';
    }
    if (elementos.campoNumeroTransacao) {
        elementos.campoNumeroTransacao.style.display = 'none';
    }
    
    modal.classList.remove('hidden');
    carregarReclamacaoExistente(vendaId);
}

// ============================================
// CARREGAR RECLAMAÇÃO EXISTENTE
// ============================================
async function carregarReclamacaoExistente(vendaId) {
    try {
        if (!window.supabaseClient) return;
        
        const { data, error } = await window.supabaseClient
            .from('reclamacoes_frete')
            .select('*')
            .eq('venda_id', vendaId)
            .order('criado_em', { ascending: false })
            .limit(1);
        
        if (error) throw error;
        if (data && data.length > 0) {
            const recl = data[0];
            currentReclamacaoId = recl.id;
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
            
            if (recl.protocolos && recl.protocolos.length > 0) {
                protocolosTemp = recl.protocolos;
                renderizarProtocolos();
            }
            
            if (recl.tipo_referencia) {
                document.querySelector(`input[name="tipoReferencia"][value="${recl.tipo_referencia}"]`).checked = true;
                toggleReferenciaFields();
            }
            
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

    if (!numeroOperacao) {
        showToast('Número da operação é obrigatório', 'warning');
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

    if (status === 'resolvido' && !numeroTransacao) {
        showToast('Número da transação é obrigatório para resolução', 'warning');
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
        atualizado_em: new Date().toISOString(),
        atualizado_por: nomeUsuario
    };

    if (status === 'resolvido') {
        dados.resolvido_por = nomeUsuario;
        dados.data_resolucao = new Date().toISOString();
    }

    if (status === 'rejeitado') {
        dados.rejeitado_por = nomeUsuario;
        dados.data_rejeicao = new Date().toISOString();
    }

    try {
        if (!window.supabaseClient) {
            showToast('Erro: Supabase não conectado', 'error');
            return;
        }

        let result;
        let reclId = id;
        
        if (id) {
            result = await window.supabaseClient
                .from('reclamacoes_frete')
                .update(dados)
                .eq('id', id);
            
            if (result.error) throw result.error;
        } else {
            dados.criado_por = nomeUsuario;
            dados.criado_em = new Date().toISOString();
            
            const insertResult = await window.supabaseClient
                .from('reclamacoes_frete')
                .insert([dados])
                .select();
            
            if (insertResult.error) throw insertResult.error;
            reclId = insertResult.data?.[0]?.id;
        }

        if (status === 'resolvido' && tipoReclamacao === 'com_reembolso') {
            await criarReclamacaoNaAbaReembolsos(vendaId, dados, reclId);
        }

        showToast('✅ Reclamação salva com sucesso!', 'success');
        fecharModalReclamacaoCompleta();
        await carregarFretesSalvos();

    } catch (error) {
        console.error('Erro ao salvar reclamação:', error);
        showToast('Erro ao salvar: ' + error.message, 'error');
    }
}

// ============================================
// CRIAR RECLAMAÇÃO NA ABA REEMBOLSOS
// ============================================
async function criarReclamacaoNaAbaReembolsos(vendaId, dados, reclId) {
    try {
        if (!window.supabaseClient) return;
        
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
            status: 'a_verificar',
            tipo_referencia: dados.tipo_referencia || 'venda',
            tipo_reclamacao: dados.tipo_reclamacao || 'com_reembolso',
            observacoes: dados.observacoes || '',
            protocolos: dados.protocolos || [],
            numero_transacao: dados.numero_transacao || '',
            criado_por: nomeUsuario,
            criado_em: new Date().toISOString(),
            atualizado_em: new Date().toISOString(),
            reclamacao_frete_id: reclId
        };

        const { error } = await window.supabaseClient
            .from('reembolsos')
            .insert([dadosReembolso]);

        if (error) throw error;

        console.log(`✅ Reclamação criada na aba Reembolsos para venda ${vendaId}`);

    } catch (error) {
        console.error('Erro ao criar reclamação na aba Reembolsos:', error);
    }
}

// ============================================
// VER HISTÓRICO DE RECLAMAÇÕES
// ============================================
async function verHistoricoReclamacoes(vendaId) {
    try {
        if (!window.supabaseClient) {
            showToast('Erro: Supabase não conectado', 'error');
            return;
        }
        
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

        let html = `
            <div id="modalHistoricoReclamacao" class="modal" style="display: flex;">
                <div class="modal-content" style="max-width: 900px; max-height: 80vh; padding: 0; overflow: hidden;">
                    <div style="background: linear-gradient(135deg, #00ADEE, #80D6F7); color: white; padding: 15px 25px; display: flex; justify-content: space-between; align-items: center;">
                        <h3 style="margin:0;"><i class="fas fa-history"></i> Histórico de Reclamações</h3>
                        <button onclick="fecharModalHistoricoReclamacao()" style="background:none; border:none; color:white; font-size:24px; cursor:pointer;">&times;</button>
                    </div>
                    <div style="padding: 20px; max-height: 70vh; overflow-y: auto;">
                        <p><strong>Venda:</strong> ${vendaId}</p>
                        <div class="table-responsive">
                            <table class="table table-striped table-sm">
                                <thead>
                                    <tr>
                                        <th>Data</th>
                                        <th>Nº Reclamação</th>
                                        <th>Nº Operação</th>
                                        <th>Valor</th>
                                        <th>Motivo</th>
                                        <th>Status</th>
                                        <th>Protocolos</th>
                                        <th>Nº Transação</th>
                                        <th>Criado por</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${data.map(item => {
                                        const statusColors = {
                                            'aberto': 'warning',
                                            'em_andamento': 'info',
                                            'rejeitado': 'danger',
                                            'resolvido': 'success'
                                        };
                                        return `
                                            <tr>
                                                <td>${formatarDataISO(item.criado_em)}</td>
                                                <td>${item.numero_reclamacao || '-'}</td>
                                                <td>${item.numero_operacao || '-'}</td>
                                                <td>R$ ${(item.valor || 0).toFixed(2)}</td>
                                                <td>${item.motivo || '-'}</td>
                                                <td><span class="badge badge-${statusColors[item.status] || 'secondary'}">${item.status}</span></td>
                                                <td>${item.protocolos ? item.protocolos.join(', ') : '-'}</td>
                                                <td>${item.numero_transacao || '-'}</td>
                                                <td>${item.criado_por || '-'}</td>
                                            </tr>
                                        `;
                                    }).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                    <div style="background: #f8f9fa; padding: 15px 25px; border-top: 1px solid #dee2e6; display: flex; justify-content: flex-end;">
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
// MUDAR STATUS DE REJEITADO PARA RESOLVIDO
// ============================================
async function mudarStatusReclamacao(id, novoStatus) {
    if (!confirm(`Deseja alterar o status para "${novoStatus}"?`)) return;

    try {
        if (!window.supabaseClient) {
            showToast('Erro: Supabase não conectado', 'error');
            return;
        }
        
        const nomeUsuario = getNomeUsuario();
        
        const { data: reclAtual } = await window.supabaseClient
            .from('reclamacoes_frete')
            .select('*')
            .eq('id', id)
            .single();

        const updateData = {
            status: novoStatus,
            atualizado_em: new Date().toISOString(),
            atualizado_por: nomeUsuario
        };

        if (novoStatus === 'resolvido') {
            updateData.resolvido_por = nomeUsuario;
            updateData.data_resolucao = new Date().toISOString();
            
            if (reclAtual && reclAtual.tipo_reclamacao === 'com_reembolso') {
                await criarReclamacaoNaAbaReembolsos(reclAtual.venda_id, reclAtual, id);
            }
        }

        const { error } = await window.supabaseClient
            .from('reclamacoes_frete')
            .update(updateData)
            .eq('id', id);

        if (error) throw error;

        showToast(`✅ Status alterado para "${novoStatus}"`, 'success');
        carregarFretesSalvos();

    } catch (error) {
        console.error('Erro ao alterar status:', error);
        showToast('Erro ao alterar status: ' + error.message, 'error');
    }
}

// ============================================
// EDITAR RECLAMAÇÃO
// ============================================
async function editarReclamacao(id) {
    const recl = reclamacoesCache.find(r => r.id === id);
    if (!recl) {
        showToast('Reclamação não encontrada', 'error');
        return;
    }

    if (!window.supabaseClient) {
        showToast('Erro: Supabase não conectado', 'error');
        return;
    }

    const { data: venda } = await window.supabaseClient
        .from('fretes_ml')
        .select('*')
        .eq('id', recl.venda_id)
        .maybeSingle();

    const valorProduto = venda?.valor_produto || 0;
    const freteCobrado = venda?.frete_cobrado || 0;
    const freteEsperado = venda?.frete_esperado || 0;

    abrirModalReclamacaoCompleta(recl.venda_id, valorProduto, freteCobrado, freteEsperado);

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
    
    if (recl.tipo_referencia) {
        document.querySelector(`input[name="tipoReferencia"][value="${recl.tipo_referencia}"]`).checked = true;
        toggleReferenciaFields();
    }
    
    if (recl.tipo_reclamacao) {
        document.querySelector(`input[name="tipoReclamacao"][value="${recl.tipo_reclamacao}"]`).checked = true;
        toggleCamposReclamacao();
    }
    
    onStatusChange();
}

// ============================================
// FUNÇÃO PRINCIPAL: BUSCAR FRETES DO ML (CORRIGIDA)
// ============================================
async function buscarFretesML(limit = 100) {
    console.log('🔍 Buscando fretes específicos do Mercado Livre...');
    
    try {
        let token = null;
        if (window.mlTokenStatus && window.mlTokenStatus.access_token) {
            token = window.mlTokenStatus.access_token;
        } else if (typeof window.getValidToken === 'function') {
            const tokenData = await window.getValidToken();
            token = tokenData?.access_token;
        }
        
        if (!token) {
            const savedToken = localStorage.getItem('ml_access_token');
            if (savedToken) token = savedToken;
        }
        
        if (!token) {
            throw new Error('Token ML não disponível. Faça login no Mercado Livre primeiro.');
        }

        // Data de início: 1 de junho de 2026
        const dataInicio = new Date(2026, 5, 1);
        const dataFim = new Date();
        
        console.log(`📅 Buscando pedidos de ${dataInicio.toLocaleDateString('pt-BR')} até ${dataFim.toLocaleDateString('pt-BR')}`);
        
        let todasVendas = [];
        let offset = 0;
        let total = null;
        const maxLimit = 50;
        
        while (total === null || offset < total) {
            const params = new URLSearchParams({
                seller: '415176739',
                sort: 'date_desc',
                'order.status': 'paid',
                limit: maxLimit,
                offset: offset,
                'order.date_created.from': dataInicio.toISOString(),
                'order.date_created.to': dataFim.toISOString()
            });
            
            const url = `https://api.mercadolibre.com/orders/search?${params}`;
            const proxyUrl = `${window.WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(url)}&token=${encodeURIComponent(token)}`;
            
            console.log(`📡 Buscando pedidos (offset ${offset})...`);
            const response = await fetch(proxyUrl);
            
            if (!response.ok) {
                let errorMsg = `Erro na API: ${response.status}`;
                try {
                    const errorData = await response.json();
                    if (errorData.message) errorMsg += ` - ${errorData.message}`;
                } catch (e) {}
                throw new Error(errorMsg);
            }
            
            const data = await response.json();
            const orders = data.results || [];
            
            if (total === null) {
                total = data.paging?.total || 0;
                console.log(`📦 Total de pedidos encontrados: ${total}`);
            }
            
            console.log(`📦 ${orders.length} pedidos na página ${Math.floor(offset / maxLimit) + 1}`);
            
            todasVendas = todasVendas.concat(orders);
            offset += maxLimit;
            
            await new Promise(resolve => setTimeout(resolve, 300));
        }
        
        console.log(`📦 Total de ${todasVendas.length} pedidos coletados`);
        
        const vendasProcessadas = [];
        let contador = 0;
        let totalFullIgnorados = 0;
        let totalSemFrete = 0;
        let totalComFrete = 0;
        
        for (const order of todasVendas) {
            contador++;
            try {
                // Verificar se é FULL
                const shippingMode = order.shipping?.mode || '';
                const logisticType = order.shipping?.logistic_type || '';
                const tags = order.tags || [];
                const fulfillment = order.shipping?.fulfillment || '';
                const shippingOption = order.shipping?.shipping_option || {};
                
                const isFull = 
                    shippingMode?.toLowerCase().includes('full') ||
                    logisticType?.toLowerCase().includes('full') ||
                    logisticType?.toLowerCase().includes('fulfillment') ||
                    fulfillment?.toLowerCase().includes('full') ||
                    tags.some(t => t.toLowerCase().includes('full')) ||
                    tags.some(t => t.toLowerCase().includes('fulfillment')) ||
                    shippingOption?.fulfillment?.toLowerCase().includes('full') ||
                    shippingOption?.logistic_type?.toLowerCase().includes('full') ||
                    (order.shipping?.id && await isShipmentFULL(order.shipping.id, token));
                
                if (isFull) {
                    totalFullIgnorados++;
                    continue;
                }

                // Buscar item para obter SKU e título
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
                            sku = itemData.seller_sku || 
                                  itemData.seller_custom_field || 
                                  itemData.attributes?.find(a => a.id === 'SELLER_SKU')?.value_name ||
                                  itemData.attributes?.find(a => a.id === 'SELLER_CUSTOM_FIELD')?.value_name ||
                                  'N/A';
                            mlbId = itemId;
                        }
                    } catch (e) {
                        console.warn(`Erro ao buscar item ${itemId}:`, e.message);
                    }
                }

                // ===== EXTRAIR FRETE CORRETAMENTE =====
                const resultadoFrete = await extrairFreteDaVenda(order, token);
                const freteCobrado = resultadoFrete.frete;
                const fonte = resultadoFrete.fonte;

                if (freteCobrado === 0) {
                    totalSemFrete++;
                    continue;
                }

                totalComFrete++;
                console.log(`📊 Venda ${order.id}: Frete=R$ ${freteCobrado.toFixed(2)} (${fonte}), Valor=R$ ${valorTotal.toFixed(2)}`);

                vendasProcessadas.push({
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
                    quantidade: order.order_items?.[0]?.quantity || 1,
                    fonte_frete: fonte,
                    is_full: false
                });
                
                await new Promise(resolve => setTimeout(resolve, 100));
                
            } catch (e) {
                console.warn(`Erro ao processar pedido ${order.id}:`, e.message);
            }
        }
        
        console.log(`✅ ${vendasProcessadas.length} vendas processadas`);
        console.log(`📊 Resumo: ${totalFullIgnorados} FULL ignorados, ${totalSemFrete} sem frete, ${totalComFrete} com frete`);
        return { vendas: vendasProcessadas };
        
    } catch (error) {
        console.error('❌ Erro ao buscar fretes do ML:', error);
        throw error;
    }
}

// ============================================
// FUNÇÃO AUXILIAR: VERIFICAR SE SHIPMENT É FULL
// ============================================
async function isShipmentFULL(shipmentId, token) {
    try {
        const shipUrl = `https://api.mercadolibre.com/shipments/${shipmentId}`;
        const shipProxy = `${window.WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(shipUrl)}&token=${encodeURIComponent(token)}`;
        const shipResp = await fetch(shipProxy);
        if (shipResp.ok) {
            const shipData = await shipResp.json();
            const logisticType = shipData.logistic_type || '';
            const tags = shipData.tags || [];
            const shippingMode = shipData.mode || '';
            
            const isFull = logisticType.toLowerCase().includes('full') ||
                   logisticType.toLowerCase().includes('fulfillment') ||
                   tags.some(t => t.toLowerCase().includes('full')) ||
                   tags.some(t => t.toLowerCase().includes('fulfillment')) ||
                   shippingMode.toLowerCase().includes('full');
            
            if (isFull) {
                console.log(`🔍 Shipment ${shipmentId} identificado como FULL`);
            }
            return isFull;
        }
        return false;
    } catch (e) {
        console.warn(`Erro ao verificar shipment ${shipmentId}:`, e.message);
        return false;
    }
}

// ============================================
// BUSCAR FRETES (SINCRONIZAÇÃO) - CORRIGIDA
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

    tbody.innerHTML = '<tr><td colspan="15" class="text-center"><div class="spinner"></div> Buscando vendas para análise de frete...</td></tr>';
    if (contagem) contagem.textContent = 'Sincronizando...';

    try {
        // Buscar mais pedidos (200 para garantir todos desde junho)
        const resultado = await buscarFretesML(200);

        if (!resultado || !resultado.vendas) {
            throw new Error('Nenhum resultado retornado');
        }

        console.log(`📦 ${resultado.vendas.length} vendas retornadas da busca de frete`);

        if (resultado.vendas.length === 0) {
            tbody.innerHTML = '<tr><td colspan="15" class="text-center">Nenhuma venda encontrada.</td></tr>';
            if (contagem) contagem.textContent = '0 registros';
            showToast('Nenhuma venda encontrada', 'info');
            return;
        }

        // Limpar dados antigos antes de inserir novos
        console.log('🗑️ Removendo dados antigos...');
        await window.supabaseClient
            .from('fretes_ml')
            .delete()
            .neq('id', '0'); // Deleta todos

        const registrosParaInserir = [];
        let totalFullIgnorados = 0;
        let totalCorretosIgnorados = 0;
        let totalIncorretos = 0;

        for (const venda of resultado.vendas) {
            const idVenda = venda.id_venda_ml || venda.id;
            if (!idVenda) continue;

            // ===== VERIFICAÇÃO DUPLA DE FULL =====
            const isFull = venda.tipo_envio === 'FULL' || 
                           venda.tipo_envio === 'FULFILLMENT' ||
                           isFullByAnyField(venda);
            
            if (isFull) {
                totalFullIgnorados++;
                console.log(`⏭️ Venda ${idVenda} é FULL, ignorando`);
                continue;
            }

            const freteCobrado = venda.frete_cobrado || 0;
            const quantidade = venda.quantidade || 1;
            const sku = venda.sku || 'N/A';
            const titulo = venda.titulo || 'Sem título';
            const mlb = venda.mlb_id || 'N/A';
            const valorProduto = venda.valor_total || 0;

            // Se frete cobrado for 0, não é relevante
            if (freteCobrado === 0) {
                totalCorretosIgnorados++;
                continue;
            }

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
                totalIncorretos++;
                
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

        console.log(`📊 Resumo: ${totalIncorretos} incorretos, ${totalCorretosIgnorados} corretos ignorados, ${totalFullIgnorados} FULL ignorados`);

        if (registrosParaInserir.length === 0) {
            let msg = `Nenhum frete incorreto encontrado.`;
            if (totalCorretosIgnorados > 0) msg += ` ${totalCorretosIgnorados} corretos ignorados.`;
            if (totalFullIgnorados > 0) msg += ` ${totalFullIgnorados} FULL ignorados.`;
            tbody.innerHTML = `<tr><td colspan="15" class="text-center">${msg}</td></tr>`;
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
            contagem.textContent = `${count || 0} incorretos`;
        }

        showToast(`✅ ${registrosParaInserir.length} fretes incorretos salvos (${totalFullIgnorados} FULL ignorados)`, 'success');

    } catch (error) {
        console.error('❌ Erro na sincronização de fretes:', error);
        tbody.innerHTML = `<tr><td colspan="15" class="text-center text-danger">Erro: ${error.message}</td></tr>`;
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
// FUNÇÕES DE RELATÓRIO COMPLETO
// ============================================
function abrirModalRelatorioReclamacoes() {
    console.log('📊 Abrindo relatório de reclamações...');
    
    let modal = document.getElementById('modalRelatorioFrete');
    if (!modal) {
        criarModalRelatorioCompleto();
        modal = document.getElementById('modalRelatorioFrete');
        if (!modal) {
            showToast('Erro ao criar modal de relatório', 'error');
            return;
        }
    }

    const hoje = new Date();
    const umMesAtras = new Date();
    umMesAtras.setDate(hoje.getDate() - 30);
    
    const dataInicio = document.getElementById('relDataInicio');
    const dataFim = document.getElementById('relDataFim');
    if (dataInicio) dataInicio.value = umMesAtras.toISOString().split('T')[0];
    if (dataFim) dataFim.value = hoje.toISOString().split('T')[0];
    
    carregarUsuariosFiltro();
    
    modal.classList.remove('hidden');
    gerarRelatorioCompleto();
}

function fecharModalRelatorio() {
    document.getElementById('modalRelatorioFrete').classList.add('hidden');
}

function criarModalRelatorioCompleto() {
    if (document.getElementById('modalRelatorioFrete')) return;

    const modalHTML = `
        <div id="modalRelatorioFrete" class="modal hidden">
            <div class="modal-content" style="max-width: 1200px; max-height: 95vh; padding: 0; overflow: hidden;">
                <div style="background: linear-gradient(135deg, #fd7e14, #e8590c); color: white; padding: 15px 25px; display: flex; justify-content: space-between; align-items: center;">
                    <h3 style="margin:0;"><i class="fas fa-chart-bar"></i> Relatório de Reclamações de Frete</h3>
                    <button onclick="fecharModalRelatorio()" style="background: rgba(255,255,255,0.2); border:none; color:white; font-size:24px; cursor:pointer;">&times;</button>
                </div>
                
                <div style="padding: 20px; max-height: 85vh; overflow-y: auto;">
                    <div class="card mb-4">
                        <div class="card-header">
                            <h5><i class="fas fa-filter"></i> Filtros</h5>
                        </div>
                        <div class="card-body">
                            <div class="row">
                                <div class="col-md-3">
                                    <div class="form-group">
                                        <label>Data Início</label>
                                        <input type="date" id="relDataInicio" class="form-control">
                                    </div>
                                </div>
                                <div class="col-md-3">
                                    <div class="form-group">
                                        <label>Data Fim</label>
                                        <input type="date" id="relDataFim" class="form-control">
                                    </div>
                                </div>
                                <div class="col-md-3">
                                    <div class="form-group">
                                        <label>Status</label>
                                        <select id="relStatus" class="form-control">
                                            <option value="">Todos</option>
                                            <option value="aberto">Aberto</option>
                                            <option value="em_andamento">Em andamento</option>
                                            <option value="rejeitado">Rejeitado</option>
                                            <option value="resolvido">Resolvido</option>
                                        </select>
                                    </div>
                                </div>
                                <div class="col-md-3">
                                    <div class="form-group">
                                        <label>Usuário</label>
                                        <select id="relUsuario" class="form-control">
                                            <option value="">Todos</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                            <div class="d-flex justify-content-end gap-2 mt-3">
                                <button onclick="gerarRelatorioCompleto()" class="btn btn-primary">
                                    <i class="fas fa-chart-bar"></i> Gerar Relatório
                                </button>
                                <button onclick="exportarRelatorioCompletoExcel()" class="btn btn-success">
                                    <i class="fas fa-file-excel"></i> Exportar Excel
                                </button>
                                <button onclick="imprimirRelatorioCompleto()" class="btn btn-info">
                                    <i class="fas fa-print"></i> Imprimir
                                </button>
                            </div>
                        </div>
                    </div>

                    <div class="row mb-4" id="relatorioResumo">
                        <div class="col-md-3">
                            <div class="card text-center bg-light">
                                <div class="card-body">
                                    <h5 class="card-title">Fretes Incorretos</h5>
                                    <h3 id="relTotalFretes">0</h3>
                                </div>
                            </div>
                        </div>
                        <div class="col-md-3">
                            <div class="card text-center bg-warning">
                                <div class="card-body">
                                    <h5 class="card-title">Reclamações Abertas</h5>
                                    <h3 id="relReclamacoesAbertas">0</h3>
                                </div>
                            </div>
                        </div>
                        <div class="col-md-3">
                            <div class="card text-center bg-success">
                                <div class="card-body">
                                    <h5 class="card-title">Resolvidas</h5>
                                    <h3 id="relReclamacoesResolvidas">0</h3>
                                </div>
                            </div>
                        </div>
                        <div class="col-md-3">
                            <div class="card text-center bg-danger">
                                <div class="card-body">
                                    <h5 class="card-title">Rejeitadas</h5>
                                    <h3 id="relReclamacoesRejeitadas">0</h3>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="row mb-4">
                        <div class="col-md-6">
                            <div class="card">
                                <div class="card-header">
                                    <h5><i class="fas fa-chart-pie"></i> Distribuição por Status</h5>
                                </div>
                                <div class="card-body">
                                    <canvas id="graficoPizzaReclamacoes" height="250"></canvas>
                                </div>
                            </div>
                        </div>
                        <div class="col-md-6">
                            <div class="card">
                                <div class="card-header">
                                    <h5><i class="fas fa-chart-bar"></i> Reclamações por Usuário</h5>
                                </div>
                                <div class="card-body">
                                    <canvas id="graficoBarrasReclamacoes" height="250"></canvas>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="row mb-4">
                        <div class="col-md-12">
                            <div class="card">
                                <div class="card-header">
                                    <h5><i class="fas fa-chart-line"></i> Comparativo: Fretes Incorretos vs Reclamações</h5>
                                </div>
                                <div class="card-body">
                                    <canvas id="graficoComparativo" height="250"></canvas>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="card">
                        <div class="card-header d-flex justify-content-between align-items-center">
                            <h5><i class="fas fa-list"></i> Histórico Detalhado</h5>
                            <span id="relTotalRegistros" class="badge badge-primary">0 registros</span>
                        </div>
                        <div class="table-responsive" style="max-height: 400px; overflow-y: auto;">
                            <table class="table table-striped table-sm" id="relatorioReclamacoesTable">
                                <thead style="position: sticky; top: 0; background: #f8f9fa; z-index: 10;">
                                    <tr>
                                        <th>Venda</th>
                                        <th>Data</th>
                                        <th>Nº Reclamação</th>
                                        <th>Nº Operação</th>
                                        <th>Nº Transação</th>
                                        <th>Valor</th>
                                        <th>Motivo</th>
                                        <th>Status</th>
                                        <th>Protocolos</th>
                                        <th>Criado por</th>
                                        <th>Atualizado por</th>
                                        <th>Data Alteração</th>
                                    </tr>
                                </thead>
                                <tbody id="relatorioReclamacoesBody">
                                    <tr><td colspan="12" class="text-center">Clique em "Gerar Relatório" para carregar dados.</td></tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    const div = document.createElement('div');
    div.innerHTML = modalHTML;
    document.body.appendChild(div.firstElementChild);
}

// ============================================
// GERAR RELATÓRIO COMPLETO
// ============================================
async function gerarRelatorioCompleto() {
    const dataInicio = document.getElementById('relDataInicio').value;
    const dataFim = document.getElementById('relDataFim').value;
    const statusFiltro = document.getElementById('relStatus').value;
    const usuarioFiltro = document.getElementById('relUsuario').value;

    if (dataInicio && dataFim && new Date(dataInicio) > new Date(dataFim)) {
        showToast('Data início não pode ser maior que data fim', 'warning');
        return;
    }

    try {
        if (!window.supabaseClient) {
            showToast('Erro: Supabase não conectado', 'error');
            return;
        }

        let fretesQuery = window.supabaseClient
            .from('fretes_ml')
            .select('*');
        
        if (dataInicio && dataFim) {
            fretesQuery = fretesQuery
                .gte('data_venda', `${dataInicio}T00:00:00`)
                .lte('data_venda', `${dataFim}T23:59:59`);
        }
        
        const { data: fretes, error: fretesError } = await fretesQuery;
        if (fretesError) throw fretesError;

        const fretesIncorretos = (fretes || []).filter(item => {
            if (item.tipo_envio === 'FULL') return false;
            if (isFullByAnyField(item)) return false;
            if (!item.frete_cobrado || item.frete_cobrado <= 0) return false;
            const peso = item.peso_estimado || 0.3;
            const freteEsperado = calcularFreteEsperado(item.valor_produto, peso);
            if (freteEsperado === null) return false;
            return Math.abs(item.frete_cobrado - freteEsperado) > 0.01;
        });

        let reclamacoesQuery = window.supabaseClient
            .from('reclamacoes_frete')
            .select('*')
            .order('criado_em', { ascending: false });
        
        if (dataInicio && dataFim) {
            reclamacoesQuery = reclamacoesQuery
                .gte('data_reclamacao', dataInicio)
                .lte('data_reclamacao', dataFim);
        }
        
        if (statusFiltro) {
            reclamacoesQuery = reclamacoesQuery.eq('status', statusFiltro);
        }
        
        if (usuarioFiltro) {
            reclamacoesQuery = reclamacoesQuery.eq('criado_por', usuarioFiltro);
        }
        
        const { data: reclamacoes, error: reclamacoesError } = await reclamacoesQuery;
        if (reclamacoesError) throw reclamacoesError;

        const abertas = reclamacoes.filter(r => r.status === 'aberto' || r.status === 'em_andamento').length;
        const resolvidas = reclamacoes.filter(r => r.status === 'resolvido').length;
        const rejeitadas = reclamacoes.filter(r => r.status === 'rejeitado').length;

        document.getElementById('relTotalFretes').textContent = fretesIncorretos.length;
        document.getElementById('relReclamacoesAbertas').textContent = abertas;
        document.getElementById('relReclamacoesResolvidas').textContent = resolvidas;
        document.getElementById('relReclamacoesRejeitadas').textContent = rejeitadas;
        document.getElementById('relTotalRegistros').textContent = `${reclamacoes.length} registros`;

        const tbody = document.getElementById('relatorioReclamacoesBody');
        tbody.innerHTML = '';

        if (reclamacoes.length === 0) {
            tbody.innerHTML = '<tr><td colspan="12" class="text-center">Nenhum dado encontrado.</td></tr>';
        } else {
            reclamacoes.forEach(item => {
                const statusColors = {
                    'aberto': 'warning',
                    'em_andamento': 'info',
                    'rejeitado': 'danger',
                    'resolvido': 'success'
                };
                const row = tbody.insertRow();
                row.innerHTML = `
                    <td>${item.venda_id || '-'}</td>
                    <td>${formatarDataISO(item.data_reclamacao)}</td>
                    <td>${item.numero_reclamacao || '-'}</td>
                    <td>${item.numero_operacao || '-'}</td>
                    <td>${item.numero_transacao || '-'}</td>
                    <td>R$ ${(item.valor || 0).toFixed(2)}</td>
                    <td>${item.motivo || '-'}</td>
                    <td><span class="badge badge-${statusColors[item.status] || 'secondary'}">${item.status}</span></td>
                    <td>${item.protocolos ? item.protocolos.join(', ') : '-'}</td>
                    <td>${item.criado_por || '-'}</td>
                    <td>${item.atualizado_por || '-'}</td>
                    <td>${formatarDataISO(item.atualizado_em)}</td>
                `;
            });
        }

        atualizarGraficosRelatorioCompleto(fretesIncorretos, reclamacoes);

        showToast(`✅ Relatório gerado: ${reclamacoes.length} reclamações`, 'success');

    } catch (error) {
        console.error('Erro ao gerar relatório:', error);
        showToast('Erro ao gerar relatório: ' + error.message, 'error');
    }
}

// ============================================
// ATUALIZAR GRÁFICOS DO RELATÓRIO
// ============================================
function atualizarGraficosRelatorioCompleto(fretes, reclamacoes) {
    // Gráfico Pizza
    const statusCount = {};
    reclamacoes.forEach(item => {
        statusCount[item.status] = (statusCount[item.status] || 0) + 1;
    });

    const ctxPizza = document.getElementById('graficoPizzaReclamacoes');
    if (ctxPizza) {
        if (window.graficoPizza) window.graficoPizza.destroy();
        
        const statusColors = {
            'aberto': '#ffc107',
            'em_andamento': '#17a2b8',
            'rejeitado': '#dc3545',
            'resolvido': '#28a745'
        };

        window.graficoPizza = new Chart(ctxPizza, {
            type: 'pie',
            data: {
                labels: Object.keys(statusCount),
                datasets: [{
                    data: Object.values(statusCount),
                    backgroundColor: Object.keys(statusCount).map(s => statusColors[s] || '#6c757d'),
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { position: 'bottom' }
                }
            }
        });
    }

    // Gráfico Barras por Usuário
    const usuarioCount = {};
    reclamacoes.forEach(item => {
        const usuario = item.criado_por || 'Não identificado';
        usuarioCount[usuario] = (usuarioCount[usuario] || 0) + 1;
    });

    const ctxBarras = document.getElementById('graficoBarrasReclamacoes');
    if (ctxBarras) {
        if (window.graficoBarras) window.graficoBarras.destroy();
        
        const sortedUsers = Object.keys(usuarioCount).sort((a, b) => usuarioCount[b] - usuarioCount[a]);
        
        window.graficoBarras = new Chart(ctxBarras, {
            type: 'bar',
            data: {
                labels: sortedUsers,
                datasets: [{
                    label: 'Quantidade de Reclamações',
                    data: sortedUsers.map(u => usuarioCount[u]),
                    backgroundColor: 'rgba(0, 173, 238, 0.6)',
                    borderColor: '#00ADEE',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                scales: {
                    y: {
                        beginAtZero: true,
                        stepSize: 1,
                        title: { display: true, text: 'Quantidade' }
                    }
                },
                plugins: { legend: { display: false } }
            }
        });
    }

    // Gráfico Comparativo
    const meses = {};
    fretes.forEach(item => {
        if (item.data_venda) {
            const data = new Date(item.data_venda);
            const mesAno = `${data.getMonth()+1}/${data.getFullYear()}`;
            if (!meses[mesAno]) meses[mesAno] = { fretes: 0, reclamacoes: 0 };
            meses[mesAno].fretes++;
        }
    });
    
    reclamacoes.forEach(item => {
        if (item.data_reclamacao) {
            const data = new Date(item.data_reclamacao);
            const mesAno = `${data.getMonth()+1}/${data.getFullYear()}`;
            if (!meses[mesAno]) meses[mesAno] = { fretes: 0, reclamacoes: 0 };
            meses[mesAno].reclamacoes++;
        }
    });

    const ctxComparativo = document.getElementById('graficoComparativo');
    if (ctxComparativo) {
        if (window.graficoComparativo) window.graficoComparativo.destroy();
        
        const labels = Object.keys(meses).sort();
        const dadosFretes = labels.map(l => meses[l].fretes);
        const dadosReclamacoes = labels.map(l => meses[l].reclamacoes);
        
        window.graficoComparativo = new Chart(ctxComparativo, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Fretes Incorretos',
                        data: dadosFretes,
                        backgroundColor: 'rgba(54, 162, 235, 0.6)',
                        borderColor: 'rgba(54, 162, 235, 1)',
                        borderWidth: 1
                    },
                    {
                        label: 'Reclamações',
                        data: dadosReclamacoes,
                        backgroundColor: 'rgba(255, 99, 132, 0.6)',
                        borderColor: 'rgba(255, 99, 132, 1)',
                        borderWidth: 1
                    }
                ]
            },
            options: {
                responsive: true,
                scales: {
                    y: {
                        beginAtZero: true,
                        stepSize: 1,
                        title: { display: true, text: 'Quantidade' }
                    }
                },
                plugins: { legend: { position: 'top' } }
            }
        });
    }
}

// ============================================
// EXPORTAR RELATÓRIO PARA EXCEL
// ============================================
function exportarRelatorioCompletoExcel() {
    const tbody = document.getElementById('relatorioReclamacoesBody');
    const rows = tbody.querySelectorAll('tr');
    
    if (rows.length === 0 || (rows.length === 1 && rows[0].querySelector('td[colspan]'))) {
        showToast('Nenhum dado para exportar', 'warning');
        return;
    }
    
    const dados = [
        ['Venda', 'Data', 'Nº Reclamação', 'Nº Operação', 'Nº Transação', 'Valor', 'Motivo', 'Status', 'Protocolos', 'Criado por', 'Atualizado por', 'Data Alteração']
    ];
    
    rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 12) {
            dados.push([
                cells[0].textContent,
                cells[1].textContent,
                cells[2].textContent,
                cells[3].textContent,
                cells[4].textContent,
                cells[5].textContent,
                cells[6].textContent,
                cells[7].textContent,
                cells[8].textContent,
                cells[9].textContent,
                cells[10].textContent,
                cells[11].textContent
            ]);
        }
    });
    
    const ws = XLSX.utils.aoa_to_sheet(dados);
    ws['!cols'] = [
        { wch: 20 }, { wch: 20 }, { wch: 18 }, { wch: 18 }, { wch: 18 },
        { wch: 15 }, { wch: 20 }, { wch: 15 }, { wch: 25 }, { wch: 15 },
        { wch: 15 }, { wch: 20 }
    ];
    
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Reclamacoes_Frete');
    
    const nomeArquivo = `relatorio_reclamacoes_frete_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, nomeArquivo);
    showToast('✅ Relatório exportado com sucesso!', 'success');
}

// ============================================
// IMPRIMIR RELATÓRIO
// ============================================
function imprimirRelatorioCompleto() {
    const printWindow = window.open('', '_blank', 'width=1200,height=800');
    const hoje = new Date().toLocaleDateString('pt-BR');
    const nomeUsuario = getNomeUsuario();
    
    const dataInicio = document.getElementById('relDataInicio').value || '-';
    const dataFim = document.getElementById('relDataFim').value || '-';
    
    const totalFretes = document.getElementById('relTotalFretes').textContent;
    const abertas = document.getElementById('relReclamacoesAbertas').textContent;
    const resolvidas = document.getElementById('relReclamacoesResolvidas').textContent;
    const rejeitadas = document.getElementById('relReclamacoesRejeitadas').textContent;

    const tbody = document.getElementById('relatorioReclamacoesBody');
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
            <title>Relatório de Reclamações de Frete</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 20px; }
                h1 { color: #333; }
                .resumo { display: flex; gap: 20px; margin: 20px 0; flex-wrap: wrap; }
                .resumo-card { background: #f8f9fa; padding: 15px; border-radius: 8px; text-align: center; flex: 1; min-width: 150px; }
                .resumo-card h3 { margin: 0; font-size: 24px; }
                .resumo-card p { margin: 5px 0 0; color: #6c757d; }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 11px; }
                th { background: #00ADEE; color: white; padding: 8px; text-align: left; }
                td { padding: 6px; border-bottom: 1px solid #ddd; }
                .badge { padding: 2px 8px; border-radius: 12px; font-size: 10px; }
                .badge-warning { background: #ffc107; }
                .badge-info { background: #17a2b8; color: white; }
                .badge-danger { background: #dc3545; color: white; }
                .badge-success { background: #28a745; color: white; }
                .badge-secondary { background: #6c757d; color: white; }
                @media print {
                    body { margin: 0; }
                    .no-print { display: none; }
                }
            </style>
        </head>
        <body>
            <h1>📊 Relatório de Reclamações de Frete</h1>
            <p><strong>Período:</strong> ${dataInicio} a ${dataFim}</p>
            <p><strong>Gerado em:</strong> ${hoje}</p>
            <p><strong>Gerado por:</strong> ${nomeUsuario}</p>
            
            <div class="resumo">
                <div class="resumo-card" style="background:#e9ecef;">
                    <h3>${totalFretes}</h3>
                    <p>Fretes Incorretos</p>
                </div>
                <div class="resumo-card" style="background:#fff3cd;">
                    <h3>${abertas}</h3>
                    <p>Reclamações Abertas</p>
                </div>
                <div class="resumo-card" style="background:#d4edda;">
                    <h3>${resolvidas}</h3>
                    <p>Resolvidas</p>
                </div>
                <div class="resumo-card" style="background:#f8d7da;">
                    <h3>${rejeitadas}</h3>
                    <p>Rejeitadas</p>
                </div>
            </div>
            
            <table>
                <thead>
                    <tr>
                        <th>Venda</th>
                        <th>Data</th>
                        <th>Nº Reclamação</th>
                        <th>Nº Operação</th>
                        <th>Nº Transação</th>
                        <th>Valor</th>
                        <th>Motivo</th>
                        <th>Status</th>
                        <th>Protocolos</th>
                        <th>Criado por</th>
                        <th>Atualizado por</th>
                        <th>Data Alteração</th>
                    </tr>
                </thead>
                <tbody>
                    ${tabelaHTML || '<tr><td colspan="12" class="text-center">Nenhum dado encontrado.</td></tr>'}
                </tbody>
            </table>
            
            <div class="no-print" style="margin-top: 30px;">
                <button onclick="window.print()" style="padding: 10px 20px; background: #00ADEE; color: white; border: none; border-radius: 5px; cursor: pointer;">
                    <i class="fas fa-print"></i> Imprimir
                </button>
                <button onclick="window.close()" style="padding: 10px 20px; background: #6c757d; color: white; border: none; border-radius: 5px; cursor: pointer; margin-left: 10px;">
                    Fechar
                </button>
            </div>
            
            <script>
                window.onload = function() {
                    setTimeout(function() {
                        window.print();
                    }, 1500);
                };
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
}

// ============================================
// CARREGAR USUÁRIOS PARA FILTRO
// ============================================
async function carregarUsuariosFiltro() {
    try {
        if (!window.supabaseClient) return;
        
        const { data, error } = await window.supabaseClient
            .from('reclamacoes_frete')
            .select('criado_por')
            .not('criado_por', 'is', null);
        
        if (error) throw error;
        
        const usuarios = [...new Set(data.map(item => item.criado_por).filter(Boolean))].sort();
        const select = document.getElementById('relUsuario');
        if (select) {
            select.innerHTML = '<option value="">Todos</option>';
            usuarios.forEach(user => {
                select.innerHTML += `<option value="${user}">${user}</option>`;
            });
        }
    } catch (error) {
        console.error('Erro ao carregar usuários:', error);
    }
}

// ============================================
// INICIALIZAÇÃO
// ============================================
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 Inicializando sistema de reclamações de frete...');
    
    // Criar modal de reclamação
    criarModalReclamacaoCompleta();
    
    // Configurar botão de buscar fretes
    const btnBuscar = document.getElementById('btnBuscarFretes');
    if (btnBuscar) {
        btnBuscar.addEventListener('click', buscarFretes);
    }
    
    // Configurar botões de paginação
    const btnAnterior = document.getElementById('btnFretesAnterior');
    const btnProxima = document.getElementById('btnFretesProxima');
    if (btnAnterior) btnAnterior.addEventListener('click', paginaFretesAnterior);
    if (btnProxima) btnProxima.addEventListener('click', paginaFretesProxima);
    
    // Carregar dados iniciais
    if (document.getElementById('shippingSimpleBody')) {
        setTimeout(carregarFretesSalvos, 200);
    }
    
    console.log('✅ shipping_simple.js v4.6 carregado - Sistema completo de reclamações de frete');
});

// ============================================
// EXPORTAÇÕES GLOBAIS - TODAS AS FUNÇÕES EXPORTADAS
// ============================================
window.carregarFretesSalvos = carregarFretesSalvos;
window.buscarFretes = buscarFretes;
window.buscarFretesML = buscarFretesML;
window.salvarMedidasERecalcular = salvarMedidasERecalcular;
window.calcularFreteEsperado = calcularFreteEsperado;
window.calcularPesoVolumetrico = calcularPesoVolumetrico;
window.paginaFretesAnterior = paginaFretesAnterior;
window.paginaFretesProxima = paginaFretesProxima;
window.filtrarReclamacoes = filtrarReclamacoes;
window.mudarStatusReclamacao = mudarStatusReclamacao;
window.abrirModalRelatorioReclamacoes = abrirModalRelatorioReclamacoes;
window.fecharModalRelatorio = fecharModalRelatorio;
window.gerarRelatorioCompleto = gerarRelatorioCompleto;
window.exportarRelatorioCompletoExcel = exportarRelatorioCompletoExcel;
window.imprimirRelatorioCompleto = imprimirRelatorioCompleto;
window.abrirModalReclamacaoCompleta = abrirModalReclamacaoCompleta;
window.fecharModalReclamacaoCompleta = fecharModalReclamacaoCompleta;
window.salvarReclamacaoCompleta = salvarReclamacaoCompleta;
window.adicionarProtocolo = adicionarProtocolo;
window.removerProtocolo = removerProtocolo;
window.onStatusChange = onStatusChange;
window.toggleReferenciaFields = toggleReferenciaFields;
window.toggleCamposReclamacao = toggleCamposReclamacao;
window.criarModalReclamacaoCompleta = criarModalReclamacaoCompleta;
window.verHistoricoReclamacoes = verHistoricoReclamacoes;
window.editarReclamacao = editarReclamacao;
window.carregarUsuariosFiltro = carregarUsuariosFiltro;
window.isFullByAnyField = isFullByAnyField;
window.isShipmentFULL = isShipmentFULL;

console.log('✅ shipping_simple.js v4.6 - Todas as funções exportadas');