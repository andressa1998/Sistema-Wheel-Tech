// shipping_simple.js - VERSÃO COMPLETA COM EXPORTAÇÃO EXCEL
console.log('🚚 shipping_simple.js carregado (v26 - com exportação Excel)');

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
// VARIÁVEL DE FILTRO
// ============================================
let filtroApenasIncorretos = false;

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
// BUSCAR FRETES (sincronização)
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

    tbody.innerHTML = '<tr><td colspan="13" class="text-center"><div class="spinner"></div> Buscando vendas...</td></tr>';
    if (contagem) contagem.textContent = 'Sincronizando...';

    try {
        const tokenData = await window.getValidToken();
        const token = tokenData?.access_token;
        if (!token) {
            throw new Error('Token ML não disponível. Verifique a conexão.');
        }

        if (typeof window.buscarVendasML !== 'function') {
            throw new Error('Função buscarVendasML não disponível.');
        }

        const resultado = await window.buscarVendasML(50);
        console.log(`📦 ${resultado.vendas?.length || 0} vendas retornadas da busca`);

        if (!resultado || !resultado.vendas || resultado.vendas.length === 0) {
            tbody.innerHTML = '<tr><td colspan="13" class="text-center">Nenhuma venda encontrada.</td></tr>';
            if (contagem) contagem.textContent = '0 registros';
            return;
        }

        const { data: salvos, error: erroSalvos } = await window.supabaseClient
            .from('fretes_ml')
            .select('id');
        if (erroSalvos) throw erroSalvos;
        const idsSalvos = new Set(salvos.map(item => item.id));

        const registrosParaInserir = [];
        let totalFullIgnorados = 0;
        let totalSemFrete = 0;

        for (const venda of resultado.vendas) {
            const idVenda = venda.id_venda_ml || venda.id;
            if (idsSalvos.has(idVenda)) continue;

            if (venda.tipo_envio === 'FULL' || isFullByAnyField(venda)) {
                totalFullIgnorados++;
                continue;
            }

            const orderId = venda.id_venda_ml || venda.id;
            const idML = orderId.replace(/^ML/, '');
            const orderUrl = `https://api.mercadolibre.com/orders/${idML}`;
            const orderProxy = `${window.WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(orderUrl)}&token=${encodeURIComponent(token)}`;
            let order = null;
            try {
                const resp = await fetch(orderProxy);
                if (resp.ok) order = await resp.json();
            } catch (e) {
                console.warn(`Erro ao buscar ordem ${idML}:`, e.message);
            }

            let freteCobrado = 0;
            let quantidade = 1;
            let sku = venda.sku || 'N/A';

            if (order) {
                freteCobrado = await extrairFreteDaVenda(order, token);
                if (order.order_items && order.order_items.length > 0) {
                    quantidade = order.order_items.reduce((sum, item) => sum + (item.quantity || 0), 0);
                    if (order.order_items[0].item && order.order_items[0].item.seller_sku) {
                        sku = order.order_items[0].item.seller_sku || 'N/A';
                    }
                }
            }

            if (freteCobrado === 0) totalSemFrete++;

            const fretePorUnidade = freteCobrado / (quantidade || 1);
            const freteTotal = fretePorUnidade * quantidade;

            const titulo = venda.titulo || 'Sem título';
            const mlb = venda.mlb_id || 'N/A';
            const valorProduto = venda.valor_total || 0;

            let medidas = await buscarMedidasPorSKU(sku);
            let comprimento = 22, largura = 16, altura = 1, peso = 0.3;
            let fotoUrl = null;
            if (medidas) {
                comprimento = medidas.comprimento_cm || 22;
                largura = medidas.largura_cm || 16;
                altura = medidas.altura_cm || 1;
                peso = medidas.peso_kg || 0.3;
                fotoUrl = medidas.foto_url || null;
            }

            const pesoVolumetrico = calcularPesoVolumetrico(comprimento, largura, altura);

            registrosParaInserir.push({
                id: idVenda,
                titulo: titulo,
                mlb: mlb,
                sku: sku,
                valor_produto: valorProduto,
                quantidade: quantidade,
                frete_cobrado: freteTotal,
                frete_por_unidade: fretePorUnidade,
                data_venda: venda.data_venda || venda.created_at || new Date().toISOString(),
                tipo_envio: venda.tipo_envio || 'N/I',
                peso_estimado: peso,
                comprimento_cm: comprimento,
                largura_cm: largura,
                altura_cm: altura,
                peso_volumetrico: pesoVolumetrico,
                foto_url: fotoUrl
            });

            await new Promise(resolve => setTimeout(resolve, 200));
        }

        console.log(`📊 Resumo: ${registrosParaInserir.length} para inserir, ${totalFullIgnorados} FULL ignorados, ${totalSemFrete} sem frete`);

        if (registrosParaInserir.length === 0) {
            tbody.innerHTML = `<tr><td colspan="13" class="text-center">Nenhuma venda nova (${totalFullIgnorados} FULL ignorados).</td></tr>`;
            if (contagem) contagem.textContent = 'Nenhuma nova';
            return;
        }

        const { error: insertError } = await window.supabaseClient
            .from('fretes_ml')
            .insert(registrosParaInserir);

        if (insertError) throw insertError;

        console.log(`✅ ${registrosParaInserir.length} fretes inseridos`);
        await carregarFretesSalvos();

        if (contagem) {
            const { count } = await window.supabaseClient.from('fretes_ml').select('id', { count: 'exact', head: true });
            contagem.textContent = `${count || 0} registros (${registrosParaInserir.length} novos, ${totalFullIgnorados} FULL ignorados)`;
        }

        showToast(`✅ ${registrosParaInserir.length} fretes adicionados`, 'success');

    } catch (error) {
        console.error('❌ Erro na sincronização:', error);
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
// EXTRAIR FRETE
// ============================================
async function extrairFreteDaVenda(order, token) {
    const shipping = order.shipping || {};
    let frete = 0;

    if (shipping.receiver_cost !== undefined && shipping.receiver_cost !== null && shipping.receiver_cost > 0) {
        frete = shipping.receiver_cost;
        return frete;
    }

    if (shipping.cost !== undefined && shipping.cost !== null && shipping.cost > 0) {
        if (order.total_amount && shipping.cost < order.total_amount * 0.5) {
            frete = shipping.cost;
            return frete;
        }
    }

    if (shipping.id && token) {
        try {
            const shipUrl = `https://api.mercadolibre.com/shipments/${shipping.id}`;
            const shipProxy = `${window.WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(shipUrl)}&token=${encodeURIComponent(token)}`;
            const resp = await fetch(shipProxy);
            if (resp.ok) {
                const shipData = await resp.json();
                if (shipData.receiver_cost && shipData.receiver_cost > 0) {
                    frete = shipData.receiver_cost;
                    return frete;
                }
                if (frete === 0 && shipData.cost && shipData.cost > 0) {
                    frete = shipData.cost;
                    return frete;
                }
                const costsUrl = `https://api.mercadolibre.com/shipments/${shipping.id}/costs`;
                const costsProxy = `${window.WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(costsUrl)}&token=${encodeURIComponent(token)}`;
                const costsResp = await fetch(costsProxy);
                if (costsResp.ok) {
                    const costsData = await costsResp.json();
                    if (costsData.receiver && costsData.receiver.cost !== undefined && costsData.receiver.cost > 0) {
                        frete = costsData.receiver.cost;
                        return frete;
                    }
                    if (frete === 0 && costsData.senders && costsData.senders.length > 0 && costsData.senders[0].cost > 0) {
                        frete = costsData.senders[0].cost;
                        return frete;
                    }
                }
            }
        } catch (e) {
            console.warn(`Erro ao buscar shipment ${shipping.id}:`, e.message);
        }
    }

    return 0;
}

// ============================================
// CARREGAR FRETES SALVOS (com armazenamento e filtro)
// ============================================
async function carregarFretesSalvos() {
    console.log('📂 Carregando fretes salvos...');
    const tbody = document.getElementById('shippingSimpleBody');
    const contagem = document.getElementById('contagemFretes');
    if (!tbody) return;

    try {
        if (!window.supabaseClient) throw new Error('Supabase não inicializado');

        const { data, error } = await window.supabaseClient
            .from('fretes_ml')
            .select('*')
            .order('data_venda', { ascending: false })
            .limit(500);

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

        // Filtrar FULL
        let dados = (data || []).filter(item => {
            if (item.tipo_envio === 'FULL') return false;
            if (isFullByAnyField(item)) return false;
            return true;
        });

        // Calcular status e identificar incorretos
        let totalIncorretos = 0;
        const dadosComStatus = dados.map(item => {
            const peso = item.peso_estimado || 0.3;
            const freteEsperado = calcularFreteEsperado(item.valor_produto, peso);
            let isIncorreto = false;
            if (freteEsperado !== null) {
                const diff = Math.abs(item.frete_cobrado - freteEsperado);
                isIncorreto = diff > 0.01;
                if (isIncorreto) totalIncorretos++;
            }
            return { ...item, freteEsperado, isIncorreto };
        });

        // ARMAZENAR DADOS PROCESSADOS PARA EXPORTAÇÃO
        window.dadosFretesProcessados = dadosComStatus;

        // Atualizar botão de filtro
        const btnFiltro = document.getElementById('btnFiltrarIncorretos');
        if (btnFiltro) {
            if (filtroApenasIncorretos) {
                btnFiltro.innerHTML = `<i class="fas fa-filter"></i> Mostrar todos (${totalIncorretos} incorretos)`;
                btnFiltro.classList.remove('btn-outline-danger');
                btnFiltro.classList.add('btn-danger');
            } else {
                btnFiltro.innerHTML = `<i class="fas fa-exclamation-triangle"></i> Apenas incorretos (${totalIncorretos})`;
                btnFiltro.classList.remove('btn-danger');
                btnFiltro.classList.add('btn-outline-danger');
            }
        }

        // Aplicar filtro
        let dadosFiltrados = filtroApenasIncorretos
            ? dadosComStatus.filter(item => item.isIncorreto)
            : dadosComStatus;

        if (dadosFiltrados.length === 0) {
            tbody.innerHTML = `<tr><td colspan="13" class="text-center">${filtroApenasIncorretos ? 'Nenhum frete incorreto encontrado.' : 'Nenhum frete válido (FULL removidos).'}</td></tr>`;
            if (contagem) contagem.textContent = '0 registros';
            return;
        }

        tbody.innerHTML = '';
        dadosFiltrados.forEach(item => {
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

            const temReclamacao = reclamacoesMap[item.id] === 'aberto';
            const badgeReclamacao = temReclamacao ? '<span class="badge badge-info ml-1">Reclamação Aberta</span>' : '';

            let badgeEnvio = '';
            const tipo = (item.tipo_envio || 'N/I').toUpperCase();
            if (tipo.includes('FULL')) badgeEnvio = '<span class="badge badge-danger">FULL</span>';
            else if (tipo.includes('FLEX')) badgeEnvio = '<span class="badge badge-warning">FLEX</span>';
            else if (tipo.includes('MERCADO') || tipo.includes('ME')) badgeEnvio = '<span class="badge badge-success">ME</span>';
            else if (tipo.includes('CROSS')) badgeEnvio = '<span class="badge badge-info">CROSS</span>';
            else badgeEnvio = `<span class="badge badge-secondary">${tipo}</span>`;

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
                    <div style="display:flex; gap:3px; flex-wrap:wrap;">
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

            // Eventos para peso
            const pesoInput = row.querySelector('.peso-input');
            if (pesoInput) {
                pesoInput.addEventListener('change', function() {
                    const novoPeso = parseFloat(this.value);
                    if (!isNaN(novoPeso) && novoPeso >= 0) {
                        atualizarLinhaAposMedidas(row, item.id, null, null, null, novoPeso);
                    }
                });
            }

            // Eventos para medidas
            const medidaInputs = row.querySelectorAll('.medida-input');
            medidaInputs.forEach(input => {
                input.addEventListener('change', function() {
                    const valor = parseFloat(this.value);
                    if (isNaN(valor) || valor < 0) return;
                    const vendaId = this.dataset.vendaId;
                    const comprimentoInput = row.querySelector('.medida-input[data-medida="comprimento"]');
                    const larguraInput = row.querySelector('.medida-input[data-medida="largura"]');
                    const alturaInput = row.querySelector('.medida-input[data-medida="altura"]');
                    const comp = parseFloat(comprimentoInput.value) || 0;
                    const larg = parseFloat(larguraInput.value) || 0;
                    const alt = parseFloat(alturaInput.value) || 0;
                    atualizarLinhaAposMedidas(row, vendaId, comp, larg, alt, null);
                });
            });

            // Botões reclamar
            const btnReclamar = row.querySelector('.btn-reclamar');
            if (btnReclamar) {
                btnReclamar.addEventListener('click', function() {
                    const vendaId = this.dataset.vendaId;
                    const valor = parseFloat(this.dataset.valor);
                    const freteCobrado = parseFloat(this.dataset.freteCobrado);
                    const freteEsperado = parseFloat(this.dataset.freteEsperado);
                    abrirModalReclamacao(vendaId, valor, freteCobrado, freteEsperado);
                });
            }

            const btnVerReclamacao = row.querySelector('.btn-ver-reclamacao');
            if (btnVerReclamacao) {
                btnVerReclamacao.addEventListener('click', function() {
                    verReclamacao(this.dataset.vendaId);
                });
            }
        });

        if (contagem) {
            const totalExibidos = dadosFiltrados.length;
            const totalTotal = dadosComStatus.length;
            const filtroMsg = filtroApenasIncorretos ? ' (incorretos)' : '';
            contagem.textContent = `${totalExibidos} registros${filtroMsg} (${totalTotal} total)`;
        }
        console.log(`✅ ${dadosFiltrados.length} fretes carregados`);

    } catch (error) {
        console.error('❌ Erro ao carregar fretes:', error);
        tbody.innerHTML = `<tr><td colspan="13" class="text-center text-danger">Erro: ${error.message}</td></tr>`;
    }
}

// ============================================
// ATUALIZAR LINHA APÓS MEDIDAS/PESO
// ============================================
async function atualizarLinhaAposMedidas(row, vendaId, comprimento, largura, altura, peso) {
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

        if (comprimento <= 0 || largura <= 0 || altura <= 0 || peso <= 0) {
            showToast('Medidas e peso devem ser maiores que zero', 'warning');
            return;
        }

        const pesoVol = calcularPesoVolumetrico(comprimento, largura, altura);

        const skuCell = row.querySelector('td:nth-child(3)');
        const sku = skuCell ? skuCell.textContent.trim() : 'N/A';

        await window.supabaseClient
            .from('fretes_ml')
            .update({
                comprimento_cm: comprimento,
                largura_cm: largura,
                altura_cm: altura,
                peso_estimado: peso,
                peso_volumetrico: pesoVol
            })
            .eq('id', vendaId);

        if (sku && sku !== 'N/A' && sku !== 'SEM SKU') {
            await salvarMedidasSKU(sku, comprimento, largura, altura, peso);
        }

        const valorCell = row.querySelector('td:nth-child(5)');
        const valorText = valorCell.textContent.replace('R$ ', '').replace(',', '.');
        const valorProduto = parseFloat(valorText);
        const freteCobradoCell = row.querySelector('td:nth-child(7)');
        const freteCobradoText = freteCobradoCell.textContent.replace('R$ ', '').replace(',', '.');
        const freteCobrado = parseFloat(freteCobradoText);

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
        } else {
            freteEsperadoCell.textContent = 'N/A';
            statusBadge.className = 'badge badge-secondary status-badge';
            statusBadge.textContent = 'Não calculado';
        }

        const volDisplay = row.querySelector('.peso-volumetrico-display');
        if (volDisplay) {
            volDisplay.textContent = pesoVol.toFixed(3);
        }

        // Se filtro de incorretos estiver ativo, recarregar a lista
        if (filtroApenasIncorretos) {
            await carregarFretesSalvos();
        }

        showToast(`Medidas e peso atualizados! Vol: ${pesoVol.toFixed(3)} m³`, 'success');

    } catch (error) {
        console.error('Erro ao atualizar linha:', error);
        showToast('Erro ao atualizar: ' + error.message, 'error');
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
        console.error('Modal editor não encontrado');
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

// ============================================
// MODAL DE RECLAMAÇÃO
// ============================================
function abrirModalReclamacao(vendaId, valorProduto, freteCobrado, freteEsperado) {
    const modal = document.getElementById('modalReclamacaoFrete');
    if (!modal) {
        console.error('Modal de reclamação não encontrado');
        return;
    }

    const diferenca = freteCobrado - freteEsperado;
    document.getElementById('reclamacaoVendaId').value = vendaId;
    document.getElementById('reclamacaoValorProduto').value = valorProduto.toFixed(2);
    document.getElementById('reclamacaoFreteCobrado').value = freteCobrado.toFixed(2);
    document.getElementById('reclamacaoFreteEsperado').value = freteEsperado.toFixed(2);
    document.getElementById('reclamacaoDiferenca').value = diferenca.toFixed(2);
    document.getElementById('reclamacaoStatus').value = 'aberto';
    document.getElementById('reclamacaoObservacoes').value = '';
    document.getElementById('reclamacaoNumeroVenda').textContent = vendaId;

    carregarReclamacaoExistente(vendaId);

    modal.classList.remove('hidden');
}

async function carregarReclamacaoExistente(vendaId) {
    try {
        const { data, error } = await window.supabaseClient
            .from('reclamacoes_frete')
            .select('*')
            .eq('venda_id', vendaId)
            .order('data_criacao', { ascending: false })
            .limit(1);
        if (error) throw error;
        if (data && data.length > 0) {
            const recl = data[0];
            document.getElementById('reclamacaoId').value = recl.id;
            document.getElementById('reclamacaoStatus').value = recl.status;
            document.getElementById('reclamacaoObservacoes').value = recl.observacoes || '';
            document.getElementById('reclamacaoMotivo').value = recl.motivo || '';
        } else {
            document.getElementById('reclamacaoId').value = '';
            document.getElementById('reclamacaoMotivo').value = '';
        }
    } catch (error) {
        console.error('Erro ao carregar reclamação:', error);
    }
}

function fecharModalReclamacao() {
    document.getElementById('modalReclamacaoFrete').classList.add('hidden');
}

async function salvarReclamacao() {
    const vendaId = document.getElementById('reclamacaoVendaId').value;
    const valorProduto = parseFloat(document.getElementById('reclamacaoValorProduto').value);
    const freteCobrado = parseFloat(document.getElementById('reclamacaoFreteCobrado').value);
    const freteEsperado = parseFloat(document.getElementById('reclamacaoFreteEsperado').value);
    const diferenca = parseFloat(document.getElementById('reclamacaoDiferenca').value);
    const status = document.getElementById('reclamacaoStatus').value;
    const observacoes = document.getElementById('reclamacaoObservacoes').value.trim();
    const motivo = document.getElementById('reclamacaoMotivo').value.trim() || 'Diferença de frete';
    const reclId = document.getElementById('reclamacaoId').value;

    if (!vendaId) {
        showToast('Erro: venda não identificada', 'error');
        return;
    }

    const dados = {
        venda_id: vendaId,
        valor_produto: valorProduto,
        frete_cobrado: freteCobrado,
        frete_esperado: freteEsperado,
        diferenca: diferenca,
        motivo: motivo,
        status: status,
        observacoes: observacoes,
        atualizado_em: new Date().toISOString()
    };

    try {
        let result;
        if (reclId) {
            result = await window.supabaseClient
                .from('reclamacoes_frete')
                .update(dados)
                .eq('id', reclId);
        } else {
            dados.data_criacao = new Date().toISOString();
            dados.criado_por = window.currentUser?.name || 'Sistema';
            result = await window.supabaseClient
                .from('reclamacoes_frete')
                .insert([dados]);
        }

        if (result.error) throw result.error;

        showToast('Reclamação salva com sucesso!', 'success');
        fecharModalReclamacao();
        await carregarFretesSalvos();
    } catch (error) {
        console.error('Erro ao salvar reclamação:', error);
        showToast('Erro ao salvar: ' + error.message, 'error');
    }
}

async function verReclamacao(vendaId) {
    try {
        const { data, error } = await window.supabaseClient
            .from('reclamacoes_frete')
            .select('*')
            .eq('venda_id', vendaId)
            .order('data_criacao', { ascending: false });
        if (error) throw error;
        if (!data || data.length === 0) {
            showToast('Nenhuma reclamação encontrada', 'info');
            return;
        }
        const recl = data[0];
        abrirModalReclamacao(vendaId, recl.valor_produto, recl.frete_cobrado, recl.frete_esperado);
        document.getElementById('reclamacaoId').value = recl.id;
        document.getElementById('reclamacaoStatus').value = recl.status;
        document.getElementById('reclamacaoObservacoes').value = recl.observacoes || '';
        document.getElementById('reclamacaoMotivo').value = recl.motivo || '';
    } catch (error) {
        console.error('Erro ao buscar reclamação:', error);
        showToast('Erro ao buscar reclamação', 'error');
    }
}

function abrirListaReclamacoes() {
    showToast('Função em desenvolvimento - acesse a aba Reclamações', 'info');
}

// ============================================
// EXPORTAR FRETES PARA EXCEL
// ============================================
function exportarFretesExcel() {
    if (!window.dadosFretesProcessados || window.dadosFretesProcessados.length === 0) {
        showToast('Nenhum dado disponível para exportar', 'warning');
        return;
    }

    // Aplicar o mesmo filtro de "apenas incorretos"
    let dadosParaExportar = window.dadosFretesProcessados;
    if (filtroApenasIncorretos) {
        dadosParaExportar = dadosParaExportar.filter(item => item.isIncorreto);
    }

    if (dadosParaExportar.length === 0) {
        showToast('Nenhum dado incorreto encontrado para exportar', 'warning');
        return;
    }

    // Mapear para as colunas do Excel
    const dadosExcel = dadosParaExportar.map(item => {
        const peso = item.peso_estimado || 0.3;
        const comprimento = item.comprimento_cm || 22;
        const largura = item.largura_cm || 16;
        const altura = item.altura_cm || 1;
        const valorProduto = item.valor_produto || 0;
        const freteCobrado = item.frete_cobrado || 0;
        const quantidade = item.quantidade || 1;
        const freteEsperado = item.freteEsperado;

        let statusText = 'Não calculado';
        let diferenca = 0;
        if (freteEsperado !== null) {
            diferenca = freteCobrado - freteEsperado;
            const diffAbs = Math.abs(diferenca);
            if (diffAbs < 0.01) {
                statusText = 'Correto';
            } else if (diferenca > 0) {
                statusText = `Acima (R$ ${diferenca.toFixed(2)})`;
            } else {
                statusText = `Abaixo (R$ ${Math.abs(diferenca).toFixed(2)})`;
            }
        }

        const pesoVol = calcularPesoVolumetrico(comprimento, largura, altura);

        return {
            'Venda': item.id || '',
            'Título': item.titulo || '',
            'SKU': item.sku || 'N/A',
            'MLB': item.mlb || 'N/A',
            'Valor Produto (R$)': valorProduto,
            'Quantidade': quantidade,
            'Frete Cobrado (R$)': freteCobrado,
            'Frete Esperado (R$)': freteEsperado !== null ? freteEsperado : 'N/A',
            'Diferença (R$)': freteEsperado !== null ? diferenca : 'N/A',
            'Status': statusText,
            'Peso (kg)': peso,
            'Comprimento (cm)': comprimento,
            'Largura (cm)': largura,
            'Altura (cm)': altura,
            'Peso Volumétrico (m³)': pesoVol,
            'Tipo Envio': item.tipo_envio || 'N/I',
            'Data Venda': item.data_venda ? new Date(item.data_venda).toLocaleDateString('pt-BR') : ''
        };
    });

    // Criar planilha
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(dadosExcel);
    XLSX.utils.book_append_sheet(wb, ws, 'Fretes');
    
    // Ajustar largura das colunas
    const colWidths = [
        { wch: 20 }, // Venda
        { wch: 40 }, // Título
        { wch: 15 }, // SKU
        { wch: 15 }, // MLB
        { wch: 15 }, // Valor
        { wch: 10 }, // Qtd
        { wch: 15 }, // Frete Cobrado
        { wch: 15 }, // Frete Esperado
        { wch: 15 }, // Diferença
        { wch: 25 }, // Status
        { wch: 10 }, // Peso
        { wch: 15 }, // Comprimento
        { wch: 15 }, // Largura
        { wch: 15 }, // Altura
        { wch: 15 }, // Peso Vol.
        { wch: 15 }, // Tipo Envio
        { wch: 15 }, // Data Venda
    ];
    ws['!cols'] = colWidths;

    // Gerar nome do arquivo com data e indicador de filtro
    const dataStr = new Date().toISOString().slice(0,10);
    const sufixo = filtroApenasIncorretos ? '_incorretos' : '_todos';
    const nomeArquivo = `fretes_${dataStr}${sufixo}.xlsx`;

    // Baixar
    XLSX.writeFile(wb, nomeArquivo);
    showToast(`Arquivo "${nomeArquivo}" exportado com sucesso!`, 'success');
}

// ============================================
// FILTRO DE FRETES INCORRETOS
// ============================================
function toggleFiltroIncorretos() {
    filtroApenasIncorretos = !filtroApenasIncorretos;
    carregarFretesSalvos();
}

// ============================================
// CRIAÇÃO DE MODAIS
// ============================================
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

function criarModalReclamacao() {
    if (document.getElementById('modalReclamacaoFrete')) return;

    const modalHTML = `
        <div id="modalReclamacaoFrete" class="modal hidden">
            <div class="modal-content" style="max-width: 600px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                    <h3><i class="fas fa-comment-dots"></i> Reclamação de Frete</h3>
                    <button onclick="fecharModalReclamacao()" style="background:none; border:none; font-size:24px;">&times;</button>
                </div>
                <div class="form-group">
                    <label>Venda</label>
                    <div><strong id="reclamacaoNumeroVenda"></strong></div>
                </div>
                <input type="hidden" id="reclamacaoId">
                <input type="hidden" id="reclamacaoVendaId">
                <div class="row">
                    <div class="col-md-6">
                        <div class="form-group">
                            <label>Valor Produto</label>
                            <input type="text" id="reclamacaoValorProduto" class="form-control" readonly>
                        </div>
                    </div>
                    <div class="col-md-6">
                        <div class="form-group">
                            <label>Frete Cobrado</label>
                            <input type="text" id="reclamacaoFreteCobrado" class="form-control" readonly>
                        </div>
                    </div>
                </div>
                <div class="row">
                    <div class="col-md-6">
                        <div class="form-group">
                            <label>Frete Esperado</label>
                            <input type="text" id="reclamacaoFreteEsperado" class="form-control" readonly>
                        </div>
                    </div>
                    <div class="col-md-6">
                        <div class="form-group">
                            <label>Diferença</label>
                            <input type="text" id="reclamacaoDiferenca" class="form-control" readonly style="font-weight:bold;">
                        </div>
                    </div>
                </div>
                <div class="form-group">
                    <label>Motivo</label>
                    <input type="text" id="reclamacaoMotivo" class="form-control" placeholder="Ex: Frete acima do esperado">
                </div>
                <div class="form-group">
                    <label>Status</label>
                    <select id="reclamacaoStatus" class="form-control">
                        <option value="aberto">Aberto</option>
                        <option value="em_andamento">Em andamento</option>
                        <option value="resolvido">Resolvido</option>
                        <option value="rejeitado">Rejeitado</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Observações</label>
                    <textarea id="reclamacaoObservacoes" class="form-control" rows="3" placeholder="Detalhes..."></textarea>
                </div>
                <div class="d-flex justify-content-end gap-2 mt-3">
                    <button class="btn btn-secondary" onclick="fecharModalReclamacao()">Cancelar</button>
                    <button class="btn btn-success" onclick="salvarReclamacao()">Salvar</button>
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
    criarModalReclamacao();
    criarModalEditorFoto();

    // INSERIR BOTÃO DE FILTRO E BOTÃO DE EXPORTAÇÃO
    // Procurar o card-header que contém a contagem
    const headerContagem = document.querySelector('.card-header:has(#contagemFretes)');
    if (headerContagem) {
        // Botão de filtro
        let btnFiltro = document.getElementById('btnFiltrarIncorretos');
        if (!btnFiltro) {
            btnFiltro = document.createElement('button');
            btnFiltro.id = 'btnFiltrarIncorretos';
            btnFiltro.className = 'btn btn-outline-danger btn-sm ml-2';
            btnFiltro.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Apenas incorretos (0)';
            btnFiltro.onclick = window.toggleFiltroIncorretos;
            headerContagem.appendChild(btnFiltro);
            console.log('✅ Botão de filtro inserido.');
        }

        // Botão de exportar Excel
        let btnExport = document.getElementById('exportarFretesExcelBtn');
        if (!btnExport) {
            btnExport = document.createElement('button');
            btnExport.id = 'exportarFretesExcelBtn';
            btnExport.className = 'btn btn-success btn-sm ml-2';
            btnExport.innerHTML = '<i class="fas fa-file-excel"></i> Exportar Excel';
            btnExport.onclick = window.exportarFretesExcel;
            headerContagem.appendChild(btnExport);
            console.log('✅ Botão Exportar Excel adicionado.');
        }
    } else {
        console.warn('⚠️ Não foi possível encontrar o local para inserir os botões.');
        // Fallback: criar um container acima da tabela
        const tableContainer = document.querySelector('.table-responsive');
        if (tableContainer) {
            const wrapper = document.createElement('div');
            wrapper.className = 'd-flex justify-content-end mb-2 gap-2';
            
            const btnFiltro = document.createElement('button');
            btnFiltro.id = 'btnFiltrarIncorretos';
            btnFiltro.className = 'btn btn-outline-danger btn-sm';
            btnFiltro.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Apenas incorretos';
            btnFiltro.onclick = window.toggleFiltroIncorretos;
            
            const btnExport = document.createElement('button');
            btnExport.id = 'exportarFretesExcelBtn';
            btnExport.className = 'btn btn-success btn-sm';
            btnExport.innerHTML = '<i class="fas fa-file-excel"></i> Exportar Excel';
            btnExport.onclick = window.exportarFretesExcel;
            
            wrapper.appendChild(btnFiltro);
            wrapper.appendChild(btnExport);
            tableContainer.parentNode.insertBefore(wrapper, tableContainer);
            console.log('✅ Botões criados acima da tabela (fallback)');
        }
    }

    // Carregar fretes
    if (document.getElementById('shippingSimpleBody')) {
        carregarFretesSalvos();
    }

    // Adicionar evento ao botão de buscar (se existir)
    const btnBuscar = document.getElementById('btnBuscarFretes');
    if (btnBuscar) {
        btnBuscar.addEventListener('click', buscarFretes);
    }

    console.log('✅ shipping_simple.js PRONTO (com exportação Excel)');
});

// ============================================
// EXPORTAÇÕES GLOBAIS
// ============================================
window.carregarFretesSalvos = carregarFretesSalvos;
window.buscarFretes = buscarFretes;
window.exportarFretesExcel = exportarFretesExcel;
window.toggleFiltroIncorretos = toggleFiltroIncorretos;
window.atualizarLinhaAposMedidas = atualizarLinhaAposMedidas;
window.calcularFreteEsperado = calcularFreteEsperado;
window.calcularPesoVolumetrico = calcularPesoVolumetrico;
window.abrirModalReclamacao = abrirModalReclamacao;
window.fecharModalReclamacao = fecharModalReclamacao;
window.salvarReclamacao = salvarReclamacao;
window.verReclamacao = verReclamacao;
window.abrirListaReclamacoes = abrirListaReclamacoes;
window.abrirEditorFoto = abrirEditorFoto;
window.fecharEditorFoto = fecharEditorFoto;
window.salvarMedidasEFoto = salvarMedidasEFoto;