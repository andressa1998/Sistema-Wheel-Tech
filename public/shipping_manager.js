// ============================================
// SHIPPING MANAGER - GESTÃO DE FRETES (CORRIGIDO COM BUSCA FUNCIONAL)
// ============================================

console.log('🚀 shipping_manager.js: início');

// Tabela de custos esperados (baseada em https://www.mercadolivre.com.br/ajuda/40538)
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

const DEFAULT_WEIGHT_KG = 0.3;

function getExpectedShippingCost(price, weight) {
    for (const row of SHIPPING_COST_TABLE) {
        if (price >= row.priceMin && price <= row.priceMax &&
            weight >= row.weightMin && weight <= row.weightMax) {
            let cost = row.cost;
            if (price < 19) {
                const maxAllowed = price / 2;
                if (cost > maxAllowed) cost = maxAllowed;
            }
            return parseFloat(cost.toFixed(2));
        }
    }
    return null;
}

async function getActualShippingCost(shipmentId, token) {
    if (!shipmentId) return null;
    try {
        const WORKER_URL = window.WORKER_URL || 'https://purple-bonus-3b1c.andmiotto1998.workers.dev';
        const url = `https://api.mercadolibre.com/shipments/${shipmentId}/costs`;
        const proxyUrl = `${WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(url)}&token=${token}`;
        const response = await fetch(proxyUrl);
        if (!response.ok) return null;
        const data = await response.json();
        let cost = data.senders?.[0]?.cost;
        if (cost === undefined) cost = data.gross_amount;
        return cost ? parseFloat(cost) : null;
    } catch (error) {
        console.error('Erro ao obter custo real:', error);
        return null;
    }
}

// ==================== GESTÃO DE PESOS E DIMENSÕES ====================
async function getProductWeight(sku) {
    if (!sku || sku === 'N/A') return DEFAULT_WEIGHT_KG;
    try {
        const { data, error } = await supabaseClient
            .from('produtos_peso')
            .select('peso_kg')
            .eq('sku', sku)
            .maybeSingle();
        if (error) throw error;
        return data ? parseFloat(data.peso_kg) : DEFAULT_WEIGHT_KG;
    } catch (error) {
        console.error('Erro ao buscar peso do produto:', error);
        return DEFAULT_WEIGHT_KG;
    }
}

async function setProductWeight(sku, peso_kg) {
    if (!sku || sku === 'N/A') return false;
    try {
        const { error } = await supabaseClient
            .from('produtos_peso')
            .upsert({ sku: sku, peso_kg: parseFloat(peso_kg), updated_at: new Date().toISOString() });
        if (error) throw error;
        return true;
    } catch (error) {
        console.error('Erro ao salvar peso do produto:', error);
        return false;
    }
}

function calcularVolumeMetroCubico(comprimento, largura, altura) {
    if (!comprimento || !largura || !altura) return null;
    const volumeCm3 = comprimento * largura * altura;
    return parseFloat((volumeCm3 / 1000000).toFixed(4));
}

function calcularPesoVolumetricoKg(comprimento, largura, altura) {
    if (!comprimento || !largura || !altura) return null;
    const volumeCm3 = comprimento * largura * altura;
    return parseFloat((volumeCm3 / 6000).toFixed(2));
}

async function getProductDimensions(sku) {
    if (!sku || sku === 'N/A') return null;
    try {
        const { data, error } = await supabaseClient
            .from('produto_dimensoes_padrao')
            .select('comprimento_cm, largura_cm, altura_cm, peso_kg')
            .eq('sku', sku)
            .maybeSingle();
        if (error) throw error;
        return data;
    } catch (error) {
        console.error('Erro ao buscar dimensões padrão:', error);
        return null;
    }
}

async function setProductDimensions(sku, comprimento, largura, altura, pesoKg) {
    if (!sku || sku === 'N/A') return false;
    try {
        const { error } = await supabaseClient
            .from('produto_dimensoes_padrao')
            .upsert({
                sku: sku,
                comprimento_cm: parseFloat(comprimento),
                largura_cm: parseFloat(largura),
                altura_cm: parseFloat(altura),
                peso_kg: parseFloat(pesoKg),
                atualizado_por: getNomeUsuario(),
                data_atualizacao: new Date().toISOString()
            });
        if (error) throw error;
        return true;
    } catch (error) {
        console.error('Erro ao salvar dimensões padrão:', error);
        return false;
    }
}

async function salvarDimensoesVenda(vendaId, comprimento, largura, altura, pesoKg, salvarComoPadrao = false) {
    const analise = analises.find(a => a.venda_id === vendaId);
    if (!analise) return false;
    const volumetrico = calcularPesoVolumetricoKg(comprimento, largura, altura);
    const updateData = {
        comprimento_cm: parseFloat(comprimento),
        largura_cm: parseFloat(largura),
        altura_cm: parseFloat(altura),
        peso_volumetrico_kg: volumetrico,
        peso_kg: parseFloat(pesoKg)
    };
    const { error } = await supabaseClient
        .from('frete_analises')
        .update(updateData)
        .eq('venda_id', vendaId);
    if (error) {
        console.error('Erro ao salvar dimensões:', error);
        return false;
    }
    Object.assign(analise, updateData);
    atualizarTabela();
    if (salvarComoPadrao && analise.sku && analise.sku !== 'N/A') {
        const saved = await setProductDimensions(analise.sku, comprimento, largura, altura, pesoKg);
        if (saved) mostrarToast(`Dimensões salvas como padrão para o SKU ${analise.sku}`, 'success');
    }
    return true;
}

// ==================== SINCRONIZAÇÃO DE VENDAS ====================
let analises = [];
let filtroStatus = 'todos';
let sincronizando = false;
let skuDimensionsList = [];
let currentSkuFilter = ''; // filtro para a tabela de SKU

async function sincronizarVendas(limite = 200) {
    if (sincronizando) {
        mostrarToast('Sincronização já em andamento...', 'info');
        return;
    }
    sincronizando = true;
    const btn = document.getElementById('btnSincronizarFrete');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span> Sincronizando e calculando fretes...';
    }
    mostrarToast(`Buscando até ${limite} vendas FULL e Mercado Envios...`, 'info');
    try {
        const tokenData = await window.getValidToken();
        if (!tokenData?.access_token) throw new Error('Token ML inválido');
        const token = tokenData.access_token;
        const WORKER_URL = window.WORKER_URL || 'https://purple-bonus-3b1c.andmiotto1998.workers.dev';
        const dataLimite = new Date();
        dataLimite.setDate(dataLimite.getDate() - 90);
        const dataStr = dataLimite.toISOString();
        let offset = 0;
        const limit = 50;
        let vendasColetadas = [];
        while (vendasColetadas.length < limite) {
            const mlUrl = `https://api.mercadolibre.com/orders/search?seller=415176739&sort=date_desc&order.status=paid&order.date_created.from=${dataStr}&limit=${limit}&offset=${offset}`;
            const proxyUrl = `${WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(mlUrl)}&token=${token}`;
            const resp = await fetch(proxyUrl);
            if (!resp.ok) break;
            const data = await resp.json();
            if (!data.results || data.results.length === 0) break;
            vendasColetadas = vendasColetadas.concat(data.results);
            if (data.results.length < limit) break;
            offset += limit;
        }
        console.log(`📦 Total de vendas obtidas: ${vendasColetadas.length}`);
        mostrarToast(`Processando ${vendasColetadas.length} vendas...`, 'info');
        let novas = 0;
        let ignoradasTipo = 0;
        let ignoradasShipment = 0;
        let errosInsercao = 0;
        for (let i = 0; i < vendasColetadas.length && i < limite; i++) {
            const vendaResumo = vendasColetadas[i];
            try {
                const orderUrl = `https://api.mercadolibre.com/orders/${vendaResumo.id}`;
                const orderProxy = `${WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(orderUrl)}&token=${token}`;
                const orderResp = await fetch(orderProxy);
                if (!orderResp.ok) continue;
                const venda = await orderResp.json();
                const shipping = venda.shipping || {};
                let tipoEnvio = 'N/I';
                let shipmentId = shipping.id;
                if (!shipping.logistic_type && shipmentId) {
                    const shipUrl = `https://api.mercadolibre.com/shipments/${shipmentId}`;
                    const shipProxy = `${WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(shipUrl)}&token=${token}`;
                    const shipResp = await fetch(shipProxy);
                    if (shipResp.ok) {
                        const shipData = await shipResp.json();
                        shipping.logistic_type = shipData.logistic_type;
                    }
                }
                if (shipping.logistic_type === 'fulfillment') tipoEnvio = 'FULL';
                else if (shipping.logistic_type === 'cross_docking') tipoEnvio = 'MERCADO ENVIOS';
                else if (shipping.logistic_type === 'self_service') tipoEnvio = 'FLEX';
                else if (shipping.logistic_type) tipoEnvio = shipping.logistic_type;
                else tipoEnvio = 'desconhecido';
                if (tipoEnvio !== 'FULL' && tipoEnvio !== 'MERCADO ENVIOS') {
                    ignoradasTipo++;
                    continue;
                }
                if (!shipmentId) {
                    ignoradasShipment++;
                    continue;
                }
                const orderItems = venda.order_items || [];
                let quantidadeTotal = 0;
                let pesoTotal = 0;
                let primeiroPrecoUnitario = null;
                let primeiroSku = null;
                let primeiroTitulo = null;
                let primeiroMLB = null;
                for (const item of orderItems) {
                    const qtd = item.quantity || 1;
                    const precoUnit = item.unit_price || 0;
                    const sku = item.item?.seller_sku || 'N/A';
                    const titulo = item.item?.title || 'Sem título';
                    const itemId = item.item?.id || null;
                    const mlb = itemId ? itemId.replace('MLB', '') : null;
                    if (primeiroPrecoUnitario === null) {
                        primeiroPrecoUnitario = precoUnit;
                        primeiroSku = sku;
                        primeiroTitulo = titulo;
                        primeiroMLB = mlb;
                    }
                    quantidadeTotal += qtd;
                    const pesoUnitario = await getProductWeight(sku);
                    pesoTotal += pesoUnitario * qtd;
                }
                if (quantidadeTotal === 0) quantidadeTotal = 1;
                if (pesoTotal <= 0) pesoTotal = DEFAULT_WEIGHT_KG;
                const valorTotalVenda = venda.total_amount || 0;
                const precoUnitarioReferencia = primeiroPrecoUnitario || (valorTotalVenda / quantidadeTotal);
                let comprimentoPadrao = null, larguraPadrao = null, alturaPadrao = null, pesoPadrao = null;
                if (primeiroSku && primeiroSku !== 'N/A') {
                    const dims = await getProductDimensions(primeiroSku);
                    if (dims) {
                        comprimentoPadrao = dims.comprimento_cm;
                        larguraPadrao = dims.largura_cm;
                        alturaPadrao = dims.altura_cm;
                        pesoPadrao = dims.peso_kg;
                    }
                }
                const custoReal = await getActualShippingCost(shipmentId, token);
                let custoEsperadoTotal = null;
                let divergencia = null;
                let status = 'pendente';
                if (custoReal !== null) {
                    custoEsperadoTotal = getExpectedShippingCost(precoUnitarioReferencia, pesoTotal);
                    if (custoEsperadoTotal !== null) {
                        divergencia = parseFloat((custoReal - custoEsperadoTotal).toFixed(2));
                        status = Math.abs(divergencia) <= 0.01 ? 'ok' : 'divergente';
                    }
                }
                const { data: existente } = await supabaseClient
                    .from('frete_analises')
                    .select('venda_id')
                    .eq('venda_id', String(venda.id))
                    .maybeSingle();
                if (!existente) {
                    const novaAnalise = {
                        venda_id: String(venda.id),
                        shipment_id: shipmentId,
                        titulo: primeiroTitulo,
                        sku: primeiroSku,
                        mlb: primeiroMLB,
                        comprimento_cm: comprimentoPadrao,
                        largura_cm: larguraPadrao,
                        altura_cm: alturaPadrao,
                        peso_kg: pesoTotal,
                        custo_real: custoReal,
                        custo_esperado: custoEsperadoTotal,
                        divergencia: divergencia,
                        status_frete: status,
                        data_venda: venda.date_created,
                        created_at: new Date().toISOString()
                    };
                    const { error: insertError } = await supabaseClient.from('frete_analises').insert([novaAnalise]);
                    if (insertError) {
                        console.error('❌ Erro ao inserir análise:', insertError);
                        errosInsercao++;
                    } else {
                        novas++;
                        console.log(`✅ Inserida venda ${venda.id} | MLB:${primeiroMLB} | qtd_total:${quantidadeTotal} | peso_total:${pesoTotal}kg | custo_real:${custoReal} | esperado:${custoEsperadoTotal} | status:${status}`);
                    }
                } else {
                    console.log(`ℹ️ Venda ${venda.id} já existe`);
                }
                if (i % 10 === 0) await new Promise(r => setTimeout(r, 100));
            } catch (err) {
                console.error(`❌ Erro na venda ${vendaResumo.id}:`, err);
            }
        }
        console.log(`📊 Resumo: novas=${novas}, ignoradasTipo=${ignoradasTipo}, ignoradasShipment=${ignoradasShipment}, errosInsercao=${errosInsercao}`);
        mostrarToast(`Sincronização concluída! ${novas} novas análises.`, 'success');
        await carregarAnalises();
    } catch (error) {
        console.error('Erro na sincronização:', error);
        mostrarToast('Erro na sincronização: ' + error.message, 'error');
    } finally {
        sincronizando = false;
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-sync-alt"></i> Sincronizar Vendas';
        }
    }
}

async function carregarAnalises() {
    try {
        const { data, error } = await supabaseClient
            .from('frete_analises')
            .select('*')
            .order('data_venda', { ascending: false });
        if (error) throw error;
        analises = data || [];
        console.log(`✅ ${analises.length} análises carregadas`);
        atualizarTabela();
        atualizarResumo();
    } catch (error) {
        console.error('Erro ao carregar análises:', error);
        mostrarToast('Erro ao carregar dados', 'error');
    }
}

function atualizarTabela() {
    const tbody = document.getElementById('shippingTableBody');
    if (!tbody) return;
    let filtradas = analises;
    const hoje = new Date().toISOString().split('T')[0];
    if (filtroStatus !== 'todos') {
        if (filtroStatus === 'atrasado') {
            filtradas = analises.filter(a => a.data_retorno && a.data_retorno < hoje);
        } else {
            filtradas = analises.filter(a => a.status_frete === filtroStatus);
        }
    }
    tbody.innerHTML = '';
    if (filtradas.length === 0) {
        tbody.innerHTML = '<tr><td colspan="12" class="text-center py-5">Nenhuma análise encontrada. Clique em "Sincronizar Vendas".</td</tr>';
        return;
    }
    filtradas.forEach(an => {
        const custoReal = an.custo_real;
        const custoEsperado = an.custo_esperado;
        const divergencia = (custoReal && custoEsperado) ? (custoReal - custoEsperado).toFixed(2) : '-';
        const status = an.status_frete || 'pendente';
        const quantidade = an.quantidade || 1;
        const pesoExibido = an.peso_kg ? an.peso_kg.toFixed(2) : DEFAULT_WEIGHT_KG;
        let statusBadge = '';
        if (status === 'pendente') statusBadge = '<span class="badge badge-secondary">A verificar</span>';
        else if (status === 'ok') statusBadge = '<span class="badge badge-success">OK</span>';
        else if (status === 'divergente') statusBadge = '<span class="badge badge-danger">Divergente</span>';
        else if (status === 'reembolsado') statusBadge = '<span class="badge badge-success">Reembolso conseguido</span>';
        else if (status === 'contatado') statusBadge = '<span class="badge badge-warning">Reembolso solicitado</span>';
        const isAtrasado = an.data_retorno && an.data_retorno < hoje;
        let atrasadoBadge = '';
        let rowClass = (custoReal && custoEsperado && Math.abs(custoReal - custoEsperado) > 0.01) ? 'table-danger' : '';
        if (isAtrasado) {
            atrasadoBadge = '<span class="badge badge-danger ms-2"><i class="fas fa-exclamation-triangle"></i> Atrasado</span>';
            rowClass += ' table-warning';
        }
        const row = document.createElement('tr');
        row.className = rowClass;
        row.innerHTML = `
            <td><strong>${an.venda_id}</strong><br><small>${new Date(an.data_venda).toLocaleDateString('pt-BR')}</small></td>
            <td>${an.titulo}<br><small class="text-muted">SKU: ${an.sku}</small></td>
            <td>${an.mlb || '-'}</td>
            <td>R$ ${(an.valor_unitario || 0).toFixed(2)}</td>
            <td>${quantidade}</td>
            <td>${pesoExibido} kg</td>
            <td>${custoReal ? 'R$ ' + custoReal.toFixed(2) : '-'}</td>
            <td>${custoEsperado ? 'R$ ' + custoEsperado.toFixed(2) : '-'}</td>
            <td class="${divergencia !== '-' && Math.abs(parseFloat(divergencia)) > 0.01 ? 'text-danger fw-bold' : ''}">
                ${divergencia !== '-' ? 'R$ ' + divergencia : '-'}
            </td>
            <td>${statusBadge}${atrasadoBadge}</td>
            <td>
                <div class="d-flex flex-column gap-1">
                    <div class="d-flex align-items-center gap-1">
                        <input type="number" class="peso-input form-control form-control-sm" value="${an.peso_kg || DEFAULT_WEIGHT_KG}" step="0.1" min="0" data-id="${an.venda_id}" style="width: 80px;">
                        <button class="btn btn-sm btn-primary" onclick="shippingManager.verificarFrete('${an.venda_id}')" title="Recalcular com novo peso"><i class="fas fa-sync-alt"></i></button>
                        <button class="btn btn-sm btn-info" onclick="shippingManager.salvarPesoProduto('${an.sku}')" title="Salvar este peso para o SKU"><i class="fas fa-save"></i></button>
                    </div>
                    <button class="btn btn-sm btn-warning w-100" onclick="shippingManager.abrirModalReembolso('${an.venda_id}')" title="Registrar ação"><i class="fas fa-hand-holding-usd"></i> Reembolso</button>
                </div>
            </td>
        `;
        tbody.appendChild(row);
    });
}

async function salvarPesoProduto(sku) {
    if (!sku || sku === 'N/A') {
        mostrarToast('Este produto não possui SKU definido.', 'warning');
        return;
    }
    const analise = analises.find(a => a.sku === sku);
    if (!analise) {
        mostrarToast('Não foi possível encontrar o SKU na lista.', 'error');
        return;
    }
    const inputPeso = document.querySelector(`.peso-input[data-id="${analise.venda_id}"]`);
    const novoPeso = inputPeso ? parseFloat(inputPeso.value) : analise.peso_kg;
    if (isNaN(novoPeso) || novoPeso <= 0) {
        mostrarToast('Peso inválido.', 'error');
        return;
    }
    const sucesso = await setProductWeight(sku, novoPeso);
    if (sucesso) {
        mostrarToast(`Peso do SKU ${sku} salvo como ${novoPeso} kg`, 'success');
        await carregarAnalises();
    } else {
        mostrarToast('Erro ao salvar peso.', 'error');
    }
}

async function verificarFrete(vendaId) {
    const analise = analises.find(a => a.venda_id === vendaId);
    if (!analise) {
        mostrarToast('Análise não encontrada', 'error');
        return;
    }
    const inputPeso = document.querySelector(`.peso-input[data-id="${vendaId}"]`);
    let peso = inputPeso ? parseFloat(inputPeso.value) : analise.peso_kg;
    if (isNaN(peso) || peso <= 0) {
        peso = DEFAULT_WEIGHT_KG;
        if (inputPeso) inputPeso.value = peso;
    }
    const tokenData = await window.getValidToken();
    if (!tokenData?.access_token) {
        mostrarToast('Token ML inválido', 'error');
        return;
    }
    const token = tokenData.access_token;
    mostrarToast('Consultando custo real na API...', 'info');
    const custoReal = await getActualShippingCost(analise.shipment_id, token);
    if (custoReal === null) {
        mostrarToast('Não foi possível obter custo real', 'error');
        return;
    }
    const quantidade = analise.quantidade || 1;
    const pesoTotal = peso;
    const precoUnitario = analise.valor_unitario;
    const custoEsperadoTotal = getExpectedShippingCost(precoUnitario, pesoTotal);
    if (custoEsperadoTotal === null) {
        mostrarToast('Não foi possível calcular custo esperado', 'error');
        return;
    }
    const divergencia = parseFloat((custoReal - custoEsperadoTotal).toFixed(2));
    const status = Math.abs(divergencia) <= 0.01 ? 'ok' : 'divergente';
    await supabaseClient.from('frete_analises').update({
        peso_kg: pesoTotal,
        custo_real: custoReal,
        custo_esperado: custoEsperadoTotal,
        divergencia: divergencia,
        status_frete: status,
        ultima_verificacao: new Date().toISOString()
    }).eq('venda_id', vendaId);
    analise.peso_kg = pesoTotal;
    analise.custo_real = custoReal;
    analise.custo_esperado = custoEsperadoTotal;
    analise.divergencia = divergencia;
    analise.status_frete = status;
    atualizarTabela();
    atualizarResumo();
    mostrarToast(`Verificação concluída! Custo real: R$ ${custoReal.toFixed(2)} | Esperado (peso ${pesoTotal}kg): R$ ${custoEsperadoTotal.toFixed(2)} | Divergência: R$ ${divergencia.toFixed(2)}`, 'success');
}

async function verificarVendasPendentes() {
    const pendentes = analises.filter(a => a.status_frete === 'pendente' || a.status_frete === 'divergente');
    if (pendentes.length === 0) {
        mostrarToast('Nenhuma venda pendente ou divergente', 'info');
        return;
    }
    mostrarToast(`Recalculando ${pendentes.length} vendas...`, 'info');
    for (let i = 0; i < pendentes.length; i++) {
        await verificarFrete(pendentes[i].venda_id);
        await new Promise(r => setTimeout(r, 600));
    }
    mostrarToast('Recálculo concluído!', 'success');
}

function abrirModalReembolso(vendaId) {
    const analise = analises.find(a => a.venda_id === vendaId);
    if (!analise) return;
    document.getElementById('acaoVendaId').value = vendaId;
    document.querySelectorAll('input[name="contatoFeito"]').forEach(r => {
        r.checked = (r.value === 'sim' && analise.contato_ml_feito) ? true : (r.value === 'nao' && !analise.contato_ml_feito);
    });
    document.getElementById('dataContato').value = analise.data_contato || '';
    document.getElementById('numeroOperacao').value = analise.numero_operacao || '';
    document.getElementById('dataRetorno').value = analise.data_retorno || '';
    document.querySelectorAll('input[name="reembolsoObtido"]').forEach(r => {
        r.checked = (r.value === 'sim' && analise.reembolso_obtido) ? true : (r.value === 'nao' && !analise.reembolso_obtido);
    });
    document.getElementById('observacoesReembolso').value = analise.observacoes || '';
    document.getElementById('modalAcaoReembolso').classList.remove('hidden');
}

async function salvarAcaoReembolso(event) {
    event.preventDefault();
    const vendaId = document.getElementById('acaoVendaId').value;
    const contatoFeito = document.querySelector('input[name="contatoFeito"]:checked')?.value === 'sim';
    const dataContato = document.getElementById('dataContato').value || null;
    const numeroOperacao = document.getElementById('numeroOperacao').value || null;
    const dataRetorno = document.getElementById('dataRetorno').value || null;
    const reembolsoObtido = document.querySelector('input[name="reembolsoObtido"]:checked')?.value === 'sim';
    const observacoes = document.getElementById('observacoesReembolso').value || null;
    const usuario = getNomeUsuario();
    let statusFrete = null;
    if (reembolsoObtido) statusFrete = 'reembolsado';
    else if (contatoFeito) statusFrete = 'contatado';
    const updateData = {
        contato_ml_feito: contatoFeito,
        data_contato: dataContato,
        numero_operacao: numeroOperacao,
        data_retorno: dataRetorno,
        reembolso_obtido: reembolsoObtido,
        usuario_responsavel: usuario,
        observacoes: observacoes
    };
    if (statusFrete) updateData.status_frete = statusFrete;
    await supabaseClient.from('frete_analises').update(updateData).eq('venda_id', vendaId);
    const analise = analises.find(a => a.venda_id === vendaId);
    Object.assign(analise, updateData);
    atualizarTabela();
    fecharModalAcaoReembolso();
    mostrarToast('Ação registrada!', 'success');
    atualizarResumo();
}

function fecharModalAcaoReembolso() {
    document.getElementById('modalAcaoReembolso').classList.add('hidden');
}

function atualizarResumo() {
    const pendentes = analises.filter(a => a.status_frete === 'pendente').length;
    const divergentes = analises.filter(a => a.status_frete === 'divergente').length;
    const contatados = analises.filter(a => a.status_frete === 'contatado').length;
    const reembolsados = analises.filter(a => a.status_frete === 'reembolsado').length;
    const hoje = new Date().toISOString().split('T')[0];
    const atrasados = analises.filter(a => a.data_retorno && a.data_retorno < hoje).length;
    const elPend = document.getElementById('shippingPendentes');
    if (elPend) elPend.textContent = pendentes;
    const elDiv = document.getElementById('shippingDivergentes');
    if (elDiv) elDiv.textContent = divergentes;
    const elCont = document.getElementById('shippingEmReembolso');
    if (elCont) elCont.textContent = contatados;
    const elReem = document.getElementById('shippingReembolsados');
    if (elReem) elReem.textContent = reembolsados;
    const elAtras = document.getElementById('shippingAtrasados');
    if (elAtras) elAtras.textContent = atrasados;
}

function filtrarPorStatus(status) {
    filtroStatus = status;
    atualizarTabela();
    document.querySelectorAll('#shippingSystem .filtro-botao').forEach(btn => {
        btn.classList.remove('btn-primary', 'active');
        btn.classList.add('btn-outline-secondary');
    });
    const botaoAtivo = document.querySelector(`#shippingSystem .filtro-botao[data-status="${status}"]`);
    if (botaoAtivo) {
        botaoAtivo.classList.remove('btn-outline-secondary');
        botaoAtivo.classList.add('btn-primary', 'active');
    }
}

function abrirRelatorio() {
    const usuarios = [...new Set(analises.map(a => a.usuario_responsavel).filter(u => u))];
    const selectUsuario = document.getElementById('relUsuario');
    if (selectUsuario) {
        selectUsuario.innerHTML = '<option value="">Todos</option>';
        usuarios.forEach(u => {
            const opt = document.createElement('option');
            opt.value = u;
            opt.textContent = u;
            selectUsuario.appendChild(opt);
        });
    }
    document.getElementById('modalRelatorioFrete').classList.remove('hidden');
}

async function gerarRelatorio() {
    const dataInicio = document.getElementById('relDataInicio').value;
    const dataFim = document.getElementById('relDataFim').value;
    const status = document.getElementById('relStatus').value;
    const usuario = document.getElementById('relUsuario').value;
    let query = supabaseClient.from('frete_analises').select('*');
    if (dataInicio) query = query.gte('data_venda', dataInicio);
    if (dataFim) query = query.lte('data_venda', dataFim);
    if (status && status !== '') query = query.eq('status_frete', status);
    if (usuario) query = query.eq('usuario_responsavel', usuario);
    const { data, error } = await query.order('data_venda', { ascending: false });
    if (error) {
        mostrarToast('Erro ao gerar relatório', 'error');
        return;
    }
    const tbody = document.getElementById('relatorioTableBody');
    tbody.innerHTML = '';
    data.forEach(item => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${item.venda_id}</td>
            <td>${new Date(item.data_venda).toLocaleDateString('pt-BR')}</td>
            <td>${item.titulo}</td>
            <td>${item.sku}</td>
            <td>R$ ${(item.valor_unitario || 0).toFixed(2)}</td>
            <td>${item.quantidade || 1}</td>
            <td>${item.peso_kg ? item.peso_kg.toFixed(2) : DEFAULT_WEIGHT_KG} kg</td>
            <td>${item.custo_real ? 'R$ ' + item.custo_real.toFixed(2) : '-'}</td>
            <td>${item.custo_esperado ? 'R$ ' + item.custo_esperado.toFixed(2) : '-'}</td>
            <td>${item.status_frete || 'pendente'}</td>
            <td>${item.contato_ml_feito ? 'Sim' : 'Não'}</td>
            <td>${item.numero_operacao || '-'}</td>
            <td>${item.reembolso_obtido ? 'Sim' : 'Não'}</td>
        `;
        tbody.appendChild(row);
    });
}

function exportarRelatorio() {
    const tabela = document.getElementById('relatorioTable');
    if (!tabela) return;
    const wb = XLSX.utils.table_to_book(tabela, { sheet: "Relatório Frete" });
    XLSX.writeFile(wb, `relatorio_frete_${new Date().toISOString().split('T')[0]}.xlsx`);
}

function exportarDivergencias() {
    const divergentes = analises.filter(a => a.status_frete === 'divergente');
    if (divergentes.length === 0) {
        mostrarToast('Nenhuma divergência encontrada', 'info');
        return;
    }
    const dados = divergentes.map(a => ({
        'ID Venda': a.venda_id,
        'Data': new Date(a.data_venda).toLocaleDateString('pt-BR'),
        'Produto': a.titulo,
        'SKU': a.sku,
        'Quantidade': a.quantidade,
        'Peso Total (kg)': a.peso_kg,
        'Valor Unitário': a.valor_unitario,
        'Custo Real': a.custo_real,
        'Custo Esperado': a.custo_esperado,
        'Diferença': a.divergencia,
        'Status': a.status_frete,
        'Contato ML': a.contato_ml_feito ? 'Sim' : 'Não',
        'Nº Operação': a.numero_operacao,
        'Reembolso Obtido': a.reembolso_obtido ? 'Sim' : 'Não'
    }));
    const ws = XLSX.utils.json_to_sheet(dados);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Divergências');
    XLSX.writeFile(wb, `divergencias_frete_${new Date().toISOString().split('T')[0]}.xlsx`);
}

function fecharModalRelatorio() {
    document.getElementById('modalRelatorioFrete').classList.add('hidden');
}

function mostrarToast(msg, tipo) {
    if (window.showToast) window.showToast(msg, tipo);
    else alert(msg);
}

function getNomeUsuario() {
    return document.getElementById('userName')?.textContent || 'Sistema';
}

// ==================== MODAL GERENCIAR PESOS (COM BUSCA FUNCIONAL) ====================
async function abrirModalGerenciarPesos() {
    await carregarListaDimensoesSku();
    document.getElementById('modalGerenciarPesos').classList.remove('hidden');

    // Configurar o evento de busca do campo de texto (apenas uma vez)
    const buscaInput = document.getElementById('buscaSkuModal');
    if (buscaInput && !buscaInput._listenerAdicionado) {
        buscaInput.addEventListener('input', function() {
            currentSkuFilter = this.value.trim();
            renderizarTabelaDimensoes();  // a tabela será filtrada em tempo real
        });
        buscaInput._listenerAdicionado = true;
    }
}

function fecharModalGerenciarPesos() {
    document.getElementById('modalGerenciarPesos').classList.add('hidden');
    // Opcional: limpar filtro ao fechar
    currentSkuFilter = '';
}

async function carregarListaDimensoesSku() {
    const tbody = document.getElementById('tabelaDimensoesSkuBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="8" class="text-center"><div class="spinner"></div> Carregando SKUs...</td></tr>';
    try {
        const { data: analisesData, error: analisesError } = await supabaseClient
            .from('frete_analises')
            .select('sku')
            .not('sku', 'is', null)
            .not('sku', 'eq', 'N/A');
        if (analisesError) throw analisesError;
        const skusSet = new Set();
        analisesData.forEach(item => {
            if (item.sku && item.sku.trim() !== '') skusSet.add(item.sku.trim());
        });
        const { data: dimensoesData, error: dimError } = await supabaseClient
            .from('produto_dimensoes_padrao')
            .select('*');
        if (dimError) throw dimError;
        const dimensoesMap = new Map();
        dimensoesData.forEach(d => dimensoesMap.set(d.sku, d));
        skuDimensionsList = Array.from(skusSet).map(sku => {
            const existente = dimensoesMap.get(sku);
            return {
                sku: sku,
                comprimento_cm: existente?.comprimento_cm || '',
                largura_cm: existente?.largura_cm || '',
                altura_cm: existente?.altura_cm || '',
                peso_kg: existente?.peso_kg || ''
            };
        }).sort((a, b) => a.sku.localeCompare(b.sku));
        renderizarTabelaDimensoes();
    } catch (error) {
        console.error('Erro ao carregar SKUs:', error);
        tbody.innerHTML = '<tr><td colspan="8" class="text-center text-danger">Erro ao carregar dados. Recarregue a página.</td></tr>';
    }
}

async function renderizarTabelaDimensoes() {
    const tbody = document.getElementById('tabelaDimensoesSkuBody');
    if (!tbody) return;
    let dadosExibir = skuDimensionsList;
    // Aplica o filtro de busca (case-insensitive)
    if (currentSkuFilter.trim() !== '') {
        const filtro = currentSkuFilter.trim().toLowerCase();
        dadosExibir = skuDimensionsList.filter(item => item.sku.toLowerCase().includes(filtro));
    }
    if (dadosExibir.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center">Nenhum SKU encontrado. Clique em "Novo SKU" para adicionar.</td</tr>';
        return;
    }
    tbody.innerHTML = '';
    for (const item of dadosExibir) {
        const fotos = await carregarFotosSku(item.sku);
        const primeiraFoto = fotos.length > 0 ? fotos[0].foto_url : null;
        const comp = item.comprimento_cm ? parseFloat(item.comprimento_cm) : null;
        const larg = item.largura_cm ? parseFloat(item.largura_cm) : null;
        const alt = item.altura_cm ? parseFloat(item.altura_cm) : null;
        let volume = '';
        let tooltip = '';
        if (comp && larg && alt) {
            const m3 = calcularVolumeMetroCubico(comp, larg, alt);
            const pesoVolKg = calcularPesoVolumetricoKg(comp, larg, alt);
            volume = m3 !== null ? m3.toFixed(4) : '';
            tooltip = `Peso volumétrico (frete): ${pesoVolKg} kg`;
        }
        const tr = document.createElement('tr');
        tr.setAttribute('data-sku', item.sku);
        tr.innerHTML = `
            <td><strong>${escapeHtml(item.sku)}</strong></td>
            <td><input type="number" step="0.1" class="form-control form-control-sm dim-comp" value="${item.comprimento_cm !== '' ? item.comprimento_cm : ''}" placeholder="cm" data-sku="${item.sku}"></td>
            <td><input type="number" step="0.1" class="form-control form-control-sm dim-larg" value="${item.largura_cm !== '' ? item.largura_cm : ''}" placeholder="cm" data-sku="${item.sku}"></td>
            <td><input type="number" step="0.1" class="form-control form-control-sm dim-alt" value="${item.altura_cm !== '' ? item.altura_cm : ''}" placeholder="cm" data-sku="${item.sku}"></td>
            <td><input type="number" step="0.01" class="form-control form-control-sm dim-peso" value="${item.peso_kg !== '' ? item.peso_kg : ''}" placeholder="kg" data-sku="${item.sku}"></td>
            <td class="text-center" style="font-size: 12px;" title="${tooltip}">${volume ? volume : '-'}</td>
            <td class="text-center">
                <div class="d-flex flex-column align-items-center gap-2">
                    ${primeiraFoto ? `<img src="${primeiraFoto}" style="width: 50px; height: 50px; object-fit: cover; border-radius: 5px; cursor: pointer;" onclick="visualizarFotosSku('${item.sku}')">` : '<div style="width:50px; height:50px; background:#f0f0f0; border-radius:5px; display:flex; align-items:center; justify-content:center;"><i class="fas fa-image text-muted"></i></div>'}
                    <button class="btn btn-sm btn-outline-primary" onclick="uploadFotoSku('${item.sku}')"><i class="fas fa-upload"></i> ${primeiraFoto ? 'Trocar' : 'Adicionar'}</button>
                    ${fotos.length > 1 ? `<small class="text-muted">+${fotos.length-1} mais</small>` : ''}
                </div>
            </td>
            <td>
                <button class="btn btn-sm btn-primary mb-1" onclick="salvarDimensoesSkuPorSku('${item.sku}')"><i class="fas fa-save"></i> Salvar</button>
                <button class="btn btn-sm btn-danger" onclick="excluirDimensoesSkuPorSku('${item.sku}')"><i class="fas fa-trash"></i> Excluir</button>
            </td>
        `;
        tbody.appendChild(tr);
    }
    // Adicionar eventos para recalcular volume em tempo real
    document.querySelectorAll('#tabelaDimensoesSkuBody .dim-comp, #tabelaDimensoesSkuBody .dim-larg, #tabelaDimensoesSkuBody .dim-alt').forEach(input => {
        input.addEventListener('input', function() {
            const row = this.closest('tr');
            const comp = parseFloat(row.querySelector('.dim-comp').value) || 0;
            const larg = parseFloat(row.querySelector('.dim-larg').value) || 0;
            const alt = parseFloat(row.querySelector('.dim-alt').value) || 0;
            const volumeTd = row.cells[5];
            if (comp && larg && alt) {
                const m3 = calcularVolumeMetroCubico(comp, larg, alt);
                const pesoVolKg = calcularPesoVolumetricoKg(comp, larg, alt);
                volumeTd.textContent = m3 !== null ? m3.toFixed(4) : '-';
                volumeTd.title = `Peso volumétrico (frete): ${pesoVolKg} kg`;
            } else {
                volumeTd.textContent = '-';
                volumeTd.title = '';
            }
        });
    });
}

async function salvarDimensoesSkuPorSku(sku) {
    const row = document.querySelector(`#tabelaDimensoesSkuBody tr[data-sku="${sku}"]`);
    if (!row) return;
    const comp = parseFloat(row.querySelector('.dim-comp').value);
    const larg = parseFloat(row.querySelector('.dim-larg').value);
    const alt = parseFloat(row.querySelector('.dim-alt').value);
    const peso = parseFloat(row.querySelector('.dim-peso').value);
    if (isNaN(comp) || isNaN(larg) || isNaN(alt) || isNaN(peso)) {
        mostrarToast('Preencha todas as dimensões e peso corretamente', 'warning');
        return;
    }
    const sucesso = await setProductDimensions(sku, comp, larg, alt, peso);
    if (sucesso) {
        const index = skuDimensionsList.findIndex(item => item.sku === sku);
        if (index !== -1) {
            skuDimensionsList[index].comprimento_cm = comp;
            skuDimensionsList[index].largura_cm = larg;
            skuDimensionsList[index].altura_cm = alt;
            skuDimensionsList[index].peso_kg = peso;
        }
        mostrarToast(`Dimensões do SKU ${sku} salvas!`, 'success');
        await renderizarTabelaDimensoes();
    } else {
        mostrarToast('Erro ao salvar dimensões.', 'error');
    }
}

async function excluirDimensoesSkuPorSku(sku) {
    if (!confirm(`Remover todas as dimensões padrão do SKU ${sku}?`)) return;
    try {
        const { error } = await supabaseClient
            .from('produto_dimensoes_padrao')
            .delete()
            .eq('sku', sku);
        if (error) throw error;
        const index = skuDimensionsList.findIndex(item => item.sku === sku);
        if (index !== -1) {
            skuDimensionsList[index].comprimento_cm = '';
            skuDimensionsList[index].largura_cm = '';
            skuDimensionsList[index].altura_cm = '';
            skuDimensionsList[index].peso_kg = '';
        }
        await renderizarTabelaDimensoes();
        mostrarToast(`Dimensões removidas para ${sku}`, 'success');
    } catch (error) {
        console.error(error);
        mostrarToast('Erro ao excluir', 'error');
    }
}

function filtrarTabelaSku() {
    const buscaInput = document.getElementById('buscaSkuModal');
    if (buscaInput) {
        currentSkuFilter = buscaInput.value;
        renderizarTabelaDimensoes();
    }
}

async function adicionarNovoSkuModal() {
    const novoSkus = prompt('Digite o SKU do produto (ex: BICICLETA123):');
    if (!novoSkus) return;
    const sku = novoSkus.trim().toUpperCase();
    if (skuDimensionsList.some(s => s.sku === sku)) {
        mostrarToast('SKU já existe na lista!', 'warning');
        return;
    }
    skuDimensionsList.push({
        sku: sku,
        comprimento_cm: '',
        largura_cm: '',
        altura_cm: '',
        peso_kg: ''
    });
    await setProductDimensions(sku, null, null, null, null);
    await renderizarTabelaDimensoes();
    mostrarToast(`SKU ${sku} adicionado. Preencha as dimensões.`, 'success');
}

async function aplicarDimensoesPadraoGlobal() {
    if (skuDimensionsList.length === 0) {
        mostrarToast('Nenhum SKU disponível para definir como padrão global.', 'warning');
        return;
    }
    const primeiro = skuDimensionsList[0];
    const comp = primeiro.comprimento_cm;
    const larg = primeiro.largura_cm;
    const alt = primeiro.altura_cm;
    const peso = primeiro.peso_kg;
    if (!comp || !larg || !alt || !peso) {
        mostrarToast('O primeiro SKU da lista não possui todas as dimensões preenchidas.', 'warning');
        return;
    }
    localStorage.setItem('global_default_dimensions', JSON.stringify({ comp, larg, alt, peso }));
    mostrarToast(`Medida padrão global definida: ${comp}x${larg}x${alt} cm, ${peso} kg`, 'success');
}

// ==================== FOTOS POR SKU ====================
async function carregarFotosSku(sku) {
    const { data, error } = await supabaseClient
        .from('sku_fotos')
        .select('*')
        .eq('sku', sku)
        .order('data_upload', { ascending: false });
    if (error) {
        console.error('Erro ao carregar fotos do SKU:', error);
        return [];
    }
    return data;
}

async function adicionarFotoSku(sku, file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async function(e) {
            const base64 = e.target.result;
            const { data, error } = await supabaseClient
                .from('sku_fotos')
                .insert([{
                    sku: sku,
                    foto_url: base64,
                    uploaded_by: getNomeUsuario(),
                    data_upload: new Date().toISOString()
                }]);
            if (error) reject(error);
            else resolve(data);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

async function removerFotoSku(fotoId) {
    const { error } = await supabaseClient
        .from('sku_fotos')
        .delete()
        .eq('id', fotoId);
    if (error) throw error;
}

async function uploadFotoSku(sku) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) {
            mostrarToast('Arquivo muito grande (máx. 5MB)', 'error');
            return;
        }
        try {
            await adicionarFotoSku(sku, file);
            mostrarToast(`Foto adicionada ao SKU ${sku}`, 'success');
            await renderizarTabelaDimensoes();
        } catch (error) {
            console.error(error);
            mostrarToast('Erro ao fazer upload da foto', 'error');
        }
    };
    input.click();
}

async function visualizarFotosSku(sku) {
    const fotos = await carregarFotosSku(sku);
    if (fotos.length === 0) {
        mostrarToast('Nenhuma foto para este SKU', 'info');
        return;
    }
    let html = `<div class="d-flex flex-wrap gap-3 justify-content-center">`;
    for (const foto of fotos) {
        html += `
            <div class="text-center" style="width: 150px;">
                <img src="${foto.foto_url}" style="width: 100%; height: 120px; object-fit: cover; border-radius: 8px;">
                <button class="btn btn-sm btn-danger mt-1" onclick="removerFotoSkuConfirm(${foto.id}, '${sku}')">Excluir</button>
            </div>
        `;
    }
    html += `</div>`;
    showModalDialog(`Fotos do SKU: ${sku}`, html);
}

window.removerFotoSkuConfirm = async function(fotoId, sku) {
    if (confirm('Remover esta foto?')) {
        await removerFotoSku(fotoId);
        mostrarToast('Foto removida', 'success');
        await renderizarTabelaDimensoes();
        const modal = document.querySelector('#modalFotoSku');
        if (modal) modal.remove();
    }
};

function showModalDialog(title, contentHtml) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'modalFotoSku';
    modal.style.display = 'flex';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 600px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                <h3>${title}</h3>
                <button onclick="this.closest('.modal').remove()" style="background:none; border:none; font-size:24px;">&times;</button>
            </div>
            ${contentHtml}
            <div class="d-flex justify-content-end mt-3">
                <button class="btn btn-secondary" onclick="this.closest('.modal').remove()">Fechar</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

// ==================== INICIALIZAÇÃO ====================
document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('formAcaoReembolso');
    if (form) form.addEventListener('submit', salvarAcaoReembolso);
    carregarAnalises();
});

console.log('✅ shipping_manager.js: fim, definindo window.shippingManager');

// ==================== EXPOSIÇÃO GLOBAL ====================
window.shippingManager = {
    sincronizarVendas,
    carregarAnalises,
    verificarFrete,
    verificarVendasPendentes,
    abrirModalReembolso,
    abrirRelatorio,
    gerarRelatorio,
    exportarRelatorio,
    exportarDivergencias,
    filtrarPorStatus,
    salvarPesoProduto,
    salvarDimensoesVenda,
    adicionarFotoVenda,
    listarFotosVenda,
    removerFotoVenda,
    getProductDimensions,
    setProductDimensions,
    calcularPesoVolumetrico: calcularPesoVolumetricoKg,
    abrirModalGerenciarPesos,
    fecharModalGerenciarPesos,
    carregarListaDimensoesSku,
    renderizarTabelaDimensoes,
    salvarDimensoesSkuPorSku,
    excluirDimensoesSkuPorSku,
    adicionarNovoSkuModal,
    aplicarDimensoesPadraoGlobal,
    uploadFotoSku,
    visualizarFotosSku,
    removerFotoSkuConfirm,
    salvarDimensoesSkuPorSku,
    excluirDimensoesSkuPorSku,
    filtrarTabelaSku,
    calcularVolumeMetroCubico,
    calcularPesoVolumetricoKg
};

// Funções globais para uso nos botões HTML
window.abrirModalGerenciarPesos = abrirModalGerenciarPesos;
window.fecharModalGerenciarPesos = fecharModalGerenciarPesos;
window.salvarDimensoesSkuPorSku = salvarDimensoesSkuPorSku;
window.excluirDimensoesSkuPorSku = excluirDimensoesSkuPorSku;
window.adicionarNovoSkuModal = adicionarNovoSkuModal;
window.aplicarDimensoesPadraoGlobal = aplicarDimensoesPadraoGlobal;
window.uploadFotoSku = uploadFotoSku;
window.visualizarFotosSku = visualizarFotosSku;
window.removerFotoSkuConfirm = removerFotoSkuConfirm;
window.filtrarTabelaSku = filtrarTabelaSku;


// Forçar a vinculação do campo de busca assim que o DOM estiver pronto
document.addEventListener('DOMContentLoaded', function() {
    const buscaInput = document.getElementById('buscaSkuModal');
    if (buscaInput) {
        console.log('✅ Campo de busca encontrado, vinculando evento...');
        buscaInput.addEventListener('input', function(e) {
            const valor = e.target.value.trim();
            console.log('🔍 Buscando por:', valor);
            currentSkuFilter = valor;
            renderizarTabelaDimensoes();
        });
    } else {
        console.error('❌ Campo de busca #buscaSkuModal não encontrado no DOM!');
    }
});