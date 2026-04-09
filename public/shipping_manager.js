// ============================================
// SHIPPING MANAGER - GESTÃO DE FRETES (INDEPENDENTE)
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
    { priceMin: 200,    priceMax: 10.000,   weightMin: 0,    weightMax: 0.3,   cost: 20.95 },
    { priceMin: 0,    priceMax: 18.99,   weightMin: 0.3,    weightMax: 0.5,   cost: 5.95 },
    { priceMin: 19,    priceMax: 48.99,   weightMin: 0.3,    weightMax: 0.5,   cost: 6.65 },
    { priceMin: 49,    priceMax: 78.99,   weightMin: 0.3,    weightMax: 0.5,   cost: 7.85 },
    { priceMin: 79,    priceMax: 99.99,   weightMin: 0.3,    weightMax: 0.5,   cost: 13.25 },
    { priceMin: 100,    priceMax: 119.99,   weightMin: 0.3,    weightMax: 0.5,   cost: 15.45 },
    { priceMin: 120,    priceMax: 149.99,   weightMin: 0.3,    weightMax: 0.5,   cost: 17.65 },
    { priceMin: 150,    priceMax: 199.99,   weightMin: 0.3,    weightMax: 0.5,   cost: 19.85 },
    { priceMin: 200,    priceMax: 10.000,   weightMin: 0.3,    weightMax: 0.5,   cost: 22.55 },
    { priceMin: 0,    priceMax: 18.99,   weightMin: 0.5,    weightMax: 1,   cost: 6.05 },
    { priceMin: 19,    priceMax: 48.99,   weightMin: 0.5,    weightMax: 1,   cost: 6.75 },
    { priceMin: 49,    priceMax: 78.99,   weightMin: 0.5,    weightMax: 1,   cost: 7.95 },
    { priceMin: 79,    priceMax: 99.99,   weightMin: 0.5,    weightMax: 1,   cost: 13.85 },
    { priceMin: 100,    priceMax: 119.99,   weightMin: 0.5,    weightMax: 1,   cost: 16.15 },
    { priceMin: 120,    priceMax: 149.99,   weightMin: 0.5,    weightMax: 1,   cost: 18.45 },
    { priceMin: 150,    priceMax: 199.99,   weightMin: 0.5,    weightMax: 1,   cost: 20.75 },
    { priceMin: 200,    priceMax: 10.000,   weightMin: 0.5,    weightMax: 1,   cost: 23.65 }
];

const DEFAULT_WEIGHT_KG = 0.3; // 300g padrão

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
        // Remove o header problemático
        const response = await fetch(proxyUrl);
        if (!response.ok) return null;
        const data = await response.json();
        // O campo cost pode estar em senders[0].cost ou gross_amount
        let cost = data.senders?.[0]?.cost;
        if (cost === undefined) cost = data.gross_amount;
        return cost ? parseFloat(cost) : null;
    } catch (error) {
        console.error('Erro ao obter custo real:', error);
        return null;
    }
}

let analises = [];
let filtroStatus = 'todos';
let sincronizando = false;

// ==================== SINCRONIZAÇÃO DE VENDAS (COM CÁLCULO AUTOMÁTICO) ====================
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
                // Detalhes da venda
                const orderUrl = `https://api.mercadolibre.com/orders/${vendaResumo.id}`;
                const orderProxy = `${WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(orderUrl)}&token=${token}`;
                const orderResp = await fetch(orderProxy);
                if (!orderResp.ok) continue;
                const venda = await orderResp.json();

                const shipping = venda.shipping || {};
                let tipoEnvio = 'N/I';
                let shipmentId = shipping.id;

                // Se não tiver logistic_type, buscar shipment
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

                // Apenas FULL e Mercado Envios
                if (tipoEnvio !== 'FULL' && tipoEnvio !== 'MERCADO ENVIOS') {
                    ignoradasTipo++;
                    continue;
                }

                if (!shipmentId) {
                    ignoradasShipment++;
                    continue;
                }

                const orderItem = venda.order_items?.[0] || {};
                const item = orderItem.item || {};
                const titulo = item.title || 'Sem título';
                const sku = item.seller_sku || 'N/A';
                const quantidade = orderItem.quantity || 1;
                const valorTotal = venda.total_amount || 0;
                const valorUnitario = valorTotal / quantidade;

                // --- CÁLCULO DO FRETE AUTOMÁTICO ---
                // Peso padrão (0.3 kg) - o usuário pode alterar depois
                let peso = DEFAULT_WEIGHT_KG;
                
                // Buscar custo real
                const custoReal = await getActualShippingCost(shipmentId, token);
                if (custoReal === null) {
                    console.warn(`Não foi possível obter custo real para venda ${venda.id}`);
                    // Mesmo sem custo real, inserimos a análise para depois tentar novamente
                }
                
                // Calcular custo esperado
                let custoEsperado = null;
                let divergencia = null;
                let status = 'pendente';
                
                if (custoReal !== null) {
                    custoEsperado = getExpectedShippingCost(valorUnitario, peso);
                    if (custoEsperado !== null) {
                        divergencia = parseFloat((custoReal - custoEsperado).toFixed(2));
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
                        titulo: titulo,
                        sku: sku,
                        valor_unitario: valorUnitario,
                        quantidade: quantidade,
                        peso_kg: peso,
                        custo_real: custoReal,
                        custo_esperado: custoEsperado,
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
                        console.log(`✅ Inserida venda ${venda.id} (${tipoEnvio}) | custo_real: ${custoReal} | esperado: ${custoEsperado} | status: ${status}`);
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

        // Notificar se houver atrasados
        const hoje = new Date().toISOString().split('T')[0];
        const atrasados = analises.filter(a => a.data_retorno && a.data_retorno < hoje);
        if (atrasados.length > 0) {
            mostrarToast(`⚠️ ${atrasados.length} reembolso(s) com prazo vencido! Verifique a lista de atrasados.`, 'warning');
        }
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

    // Aplicar filtro de status
    if (filtroStatus !== 'todos') {
        if (filtroStatus === 'atrasado') {
            filtradas = analises.filter(a => a.data_retorno && a.data_retorno < hoje);
        } else {
            filtradas = analises.filter(a => a.status_frete === filtroStatus);
        }
    }

    tbody.innerHTML = '';
    if (filtradas.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="text-center py-5">Nenhuma análise encontrada. Clique em "Sincronizar Vendas".</td></tr>';
        return;
    }

    filtradas.forEach(an => {
        const custoReal = an.custo_real;
        const custoEsperado = an.custo_esperado;
        const divergencia = (custoReal && custoEsperado) ? (custoReal - custoEsperado).toFixed(2) : '-';
        const status = an.status_frete || 'pendente';

        let statusBadge = '';
        if (status === 'pendente') statusBadge = '<span class="badge badge-secondary">A verificar</span>';
        else if (status === 'ok') statusBadge = '<span class="badge badge-success">OK</span>';
        else if (status === 'divergente') statusBadge = '<span class="badge badge-danger">Divergente</span>';
        else if (status === 'reembolsado') statusBadge = '<span class="badge badge-success">Reembolso conseguido</span>';
        else if (status === 'contatado') statusBadge = '<span class="badge badge-warning">Reembolso solicitado</span>';

        // Verificar se está atrasado
        const isAtrasado = an.data_retorno && an.data_retorno < hoje;
        let atrasadoBadge = '';
        let rowClass = (custoReal && custoEsperado && Math.abs(custoReal - custoEsperado) > 0.01) ? 'table-danger' : '';
        if (isAtrasado) {
            atrasadoBadge = '<span class="badge badge-danger ms-2"><i class="fas fa-exclamation-triangle"></i> Atrasado</span>';
            rowClass += ' table-warning'; // fundo amarelado
        }

        const row = document.createElement('tr');
        row.className = rowClass;
        row.innerHTML = `
            <td><strong>${an.venda_id}</strong><br><small>${new Date(an.data_venda).toLocaleDateString('pt-BR')}</small></td>
            <td>${an.titulo}</td>
            <td>R$ ${(an.valor_unitario || 0).toFixed(2)}</td>
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
                <input type="number" class="peso-input form-control form-control-sm" 
                       value="${an.peso_kg || DEFAULT_WEIGHT_KG}" step="0.1" min="0"
                       data-id="${an.venda_id}" style="width: 80px; margin-bottom: 5px;">
                <button class="btn btn-sm btn-primary w-100" onclick="shippingManager.verificarFrete('${an.venda_id}')" title="Recalcular com novo peso">
                    <i class="fas fa-sync-alt"></i> Recalcular
                </button>
                <button class="btn btn-sm btn-warning mt-1 w-100" onclick="shippingManager.abrirModalReembolso('${an.venda_id}')" title="Registrar ação">
                    <i class="fas fa-hand-holding-usd"></i> Reembolso
                </button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

// ==================== VERIFICAR FRETE (RECALCULAR COM PESO INFORMADO) ====================
async function verificarFrete(vendaId) {
    const analise = analises.find(a => a.venda_id === vendaId);
    if (!analise) {
        mostrarToast('Análise não encontrada', 'error');
        return;
    }

    // Obter peso do input
    const inputPeso = document.querySelector(`.peso-input[data-id="${vendaId}"]`);
    let peso = inputPeso ? parseFloat(inputPeso.value) : analise.peso_kg;
    if (isNaN(peso) || peso <= 0) {
        peso = DEFAULT_WEIGHT_KG;
        if (inputPeso) inputPeso.value = peso;
    }

    // Obter token
    const tokenData = await window.getValidToken();
    if (!tokenData?.access_token) {
        mostrarToast('Token ML inválido', 'error');
        return;
    }
    const token = tokenData.access_token;

    // Buscar custo real
    mostrarToast('Consultando custo real na API...', 'info');
    const custoReal = await getActualShippingCost(analise.shipment_id, token);
    if (custoReal === null) {
        mostrarToast('Não foi possível obter custo real', 'error');
        return;
    }

    // Calcular custo esperado
    const custoEsperado = getExpectedShippingCost(analise.valor_unitario, peso);
    if (custoEsperado === null) {
        mostrarToast('Não foi possível calcular custo esperado', 'error');
        return;
    }

    const divergencia = parseFloat((custoReal - custoEsperado).toFixed(2));
    const status = Math.abs(divergencia) <= 0.01 ? 'ok' : 'divergente';

    // Atualizar banco
    await supabaseClient.from('frete_analises').update({
        peso_kg: peso,
        custo_real: custoReal,
        custo_esperado: custoEsperado,
        divergencia: divergencia,
        status_frete: status,
        ultima_verificacao: new Date().toISOString()
    }).eq('venda_id', vendaId);

    // Atualizar objeto local
    analise.peso_kg = peso;
    analise.custo_real = custoReal;
    analise.custo_esperado = custoEsperado;
    analise.divergencia = divergencia;
    analise.status_frete = status;

    atualizarTabela();
    atualizarResumo();
    mostrarToast(`Verificação concluída! Custo real: R$ ${custoReal.toFixed(2)} | Esperado: R$ ${custoEsperado.toFixed(2)} | Divergência: R$ ${divergencia.toFixed(2)}`, 'success');
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

// ==================== AÇÕES DE REEMBOLSO ====================
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

    // Contar atrasados: data_retorno não nula e < hoje
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

    // Atualizar estilo dos botões (opcional)
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
    filtrarPorStatus
};