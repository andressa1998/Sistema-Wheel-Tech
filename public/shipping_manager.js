// ============================================
// SHIPPING MANAGER - GESTÃO DE FRETES (VERSÃO CORRIGIDA)
// ============================================

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

// Buscar custo real via API do ML
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

// ==================== GESTÃO DE PESOS POR PRODUTO ====================
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

// ==================== SINCRONIZAÇÃO DE VENDAS ====================
let analises = [];
let filtroStatus = 'todos';
let sincronizando = false;

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

                // Processar todos os itens da venda
                const orderItems = venda.order_items || [];
                let quantidadeTotal = 0;
                let pesoTotal = 0;
                let primeiroPrecoUnitario = null;
                let primeiroSku = null;
                let primeiroTitulo = null;

                for (const item of orderItems) {
                    const qtd = item.quantity || 1;
                    const precoUnit = item.unit_price || 0;
                    const sku = item.item?.seller_sku || 'N/A';
                    const titulo = item.item?.title || 'Sem título';

                    if (primeiroPrecoUnitario === null) {
                        primeiroPrecoUnitario = precoUnit;
                        primeiroSku = sku;
                        primeiroTitulo = titulo;
                    }

                    quantidadeTotal += qtd;

                    // Buscar peso do produto (pode ser por SKU ou padrão)
                    const pesoUnitario = await getProductWeight(sku);
                    pesoTotal += pesoUnitario * qtd;
                }

                if (quantidadeTotal === 0) quantidadeTotal = 1;
                if (pesoTotal <= 0) pesoTotal = DEFAULT_WEIGHT_KG;

                const valorTotalVenda = venda.total_amount || 0;
                const precoUnitarioReferencia = primeiroPrecoUnitario || (valorTotalVenda / quantidadeTotal);

                // Buscar custo real do frete
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

                // Verificar se já existe análise
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
                        valor_unitario: precoUnitarioReferencia,
                        quantidade: quantidadeTotal,
                        peso_kg: pesoTotal,  // armazenamos o peso total calculado
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
                        console.log(`✅ Inserida venda ${venda.id} | qtd_total:${quantidadeTotal} | peso_total:${pesoTotal}kg | custo_real:${custoReal} | esperado:${custoEsperadoTotal} | status:${status}`);
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

// ==================== CARREGAR ANÁLISES DO BANCO ====================
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

// ==================== ATUALIZAR TABELA ====================
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
        tbody.innerHTML = '<tr><td colspan="11" class="text-center py-5">Nenhuma análise encontrada. Clique em "Sincronizar Vendas".</td></tr>';
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
            <td>R$ ${(an.valor_unitario || 0).toFixed(2)}</td>
            <td>${quantidade}</td>
            <td>${pesoExibido} kg</td>
            <td>${custoReal ? 'R$ ' + custoReal.toFixed(2) : '-'}</td>
            <td>${custoEsperado ? 'R$ ' + custoEsperado.toFixed(2) : '-'}</td>
            <td class="${divergencia !== '-' && Math.abs(parseFloat(divergencia)) > 0.01 ? 'text-danger fw-bold' : ''}">
                ${divergencia !== '-' ? 'R$ ' + divergencia : '-'}
            </td>
            <td>
                ${statusBadge}
                ${atrasadoBadge}
            </td>
            <td>
                <div class="d-flex flex-column gap-1">
                    <div class="d-flex align-items-center gap-1">
                        <input type="number" class="peso-input form-control form-control-sm" 
                               value="${an.peso_kg || DEFAULT_WEIGHT_KG}" step="0.1" min="0"
                               data-id="${an.venda_id}" style="width: 80px;">
                        <button class="btn btn-sm btn-primary" onclick="shippingManager.verificarFrete('${an.venda_id}')" title="Recalcular com novo peso">
                            <i class="fas fa-sync-alt"></i>
                        </button>
                        <button class="btn btn-sm btn-info" onclick="shippingManager.salvarPesoProduto('${an.sku}')" title="Salvar este peso para o SKU">
                            <i class="fas fa-save"></i>
                        </button>
                    </div>
                    <button class="btn btn-sm btn-warning w-100" onclick="shippingManager.abrirModalReembolso('${an.venda_id}')" title="Registrar ação">
                        <i class="fas fa-hand-holding-usd"></i> Reembolso
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(row);
    });
}

// ==================== SALVAR PESO PARA O PRODUTO (SKU) ====================
async function salvarPesoProduto(sku) {
    if (!sku || sku === 'N/A') {
        mostrarToast('Este produto não possui SKU definido. Não é possível salvar o peso.', 'warning');
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

// ==================== VERIFICAR FRETE (RECALCULAR) ====================
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
    // Recalcular peso total se necessário (o usuário pode ter alterado o peso unitário)
    // Mas como salvamos o peso total no banco, usaremos o peso informado como total? 
    // Melhor: o peso informado é o peso total (já multiplicado pela quantidade). Vamos manter assim.
    const pesoTotal = peso; // o usuário está informando o peso total (já considerando quantidade)
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

// ==================== VERIFICAR TODAS AS PENDENTES ====================
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

// ==================== AÇÕES DE REEMBOLSO (mantido igual) ====================
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

// ==================== RESUMO E FILTROS ====================
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

// ==================== RELATÓRIOS ====================
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

// ==================== INICIALIZAÇÃO ====================
document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('formAcaoReembolso');
    if (form) form.addEventListener('submit', salvarAcaoReembolso);
    carregarAnalises();
});

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
    salvarPesoProduto
};