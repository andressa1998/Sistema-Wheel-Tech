// shipping_simple.js - VERSÃO COM EXTRAÇÃO DE FRETE ROBUSTA
console.log('🚚 shipping_simple.js carregado (v18 - com extração de frete)');

if (typeof window.WORKER_URL === 'undefined') {
    window.WORKER_URL = 'https://purple-bonus-3b1c.andmiotto1998.workers.dev';
}

// ============================================
// FUNÇÃO AUXILIAR PARA IDENTIFICAR FULL POR TÍTULO/MLB
// ============================================
function isFullByAnyField(item) {
    const text = `${item.titulo || ''} ${item.mlb || ''} ${item.id || ''}`.toLowerCase();
    return /full|fulfillment/.test(text);
}

// ============================================
// EXTRAIR FRETE DA VENDA COMPLETA (usando shipment)
// ============================================
async function extrairFreteDaVenda(order, token) {
    const shipping = order.shipping || {};
    let frete = 0;

    // 1. Verifica receiver_cost diretamente
    if (shipping.receiver_cost !== undefined && shipping.receiver_cost !== null && shipping.receiver_cost > 0) {
        frete = shipping.receiver_cost;
        console.log(`   📦 Frete receiver_cost: R$ ${frete}`);
        return frete;
    }

    // 2. Verifica cost (se for menor que 50% do total, para evitar valores suspeitos)
    if (shipping.cost !== undefined && shipping.cost !== null && shipping.cost > 0) {
        if (order.total_amount && shipping.cost < order.total_amount * 0.5) {
            frete = shipping.cost;
            console.log(`   📦 Frete shipping.cost: R$ ${frete}`);
            return frete;
        }
    }

    // 3. Se tem shipping.id, busca os detalhes do shipment
    if (shipping.id && token) {
        try {
            const shipUrl = `https://api.mercadolibre.com/shipments/${shipping.id}`;
            const shipProxy = `${window.WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(shipUrl)}&token=${encodeURIComponent(token)}`;
            const resp = await fetch(shipProxy);
            if (resp.ok) {
                const shipData = await resp.json();
                if (shipData.receiver_cost && shipData.receiver_cost > 0) {
                    frete = shipData.receiver_cost;
                    console.log(`   📦 Frete shipment.receiver_cost: R$ ${frete}`);
                    return frete;
                }
                if (frete === 0 && shipData.cost && shipData.cost > 0) {
                    frete = shipData.cost;
                    console.log(`   📦 Frete shipment.cost: R$ ${frete}`);
                    return frete;
                }
                // Tenta o endpoint de costs
                const costsUrl = `https://api.mercadolibre.com/shipments/${shipping.id}/costs`;
                const costsProxy = `${window.WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(costsUrl)}&token=${encodeURIComponent(token)}`;
                const costsResp = await fetch(costsProxy);
                if (costsResp.ok) {
                    const costsData = await costsResp.json();
                    if (costsData.receiver && costsData.receiver.cost !== undefined && costsData.receiver.cost > 0) {
                        frete = costsData.receiver.cost;
                        console.log(`   📦 Frete costs.receiver.cost: R$ ${frete}`);
                        return frete;
                    }
                    if (frete === 0 && costsData.senders && costsData.senders.length > 0 && costsData.senders[0].cost > 0) {
                        frete = costsData.senders[0].cost;
                        console.log(`   📦 Frete costs.senders[0].cost: R$ ${frete}`);
                        return frete;
                    }
                }
            }
        } catch (e) {
            console.warn(`   ⏱️ Erro ao buscar shipment ${shipping.id}:`, e.message);
        }
    }

    console.warn(`   ⚠️ Nenhum frete para venda ${order.id}`);
    return 0;
}

// ============================================
// CARREGAR FRETES SALVOS (com filtro FULL)
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

        // Filtro FULL (mesmo da aba de vendas)
        const dadosFiltrados = (data || []).filter(item => {
            if (item.tipo_envio === 'FULL') return false;
            if (isFullByAnyField(item)) return false;
            if (item.titulo && /full|fulfillment/i.test(item.titulo)) return false;
            if (item.mlb && /full|fulfillment/i.test(item.mlb)) return false;
            return true;
        });

        const removidos = (data || []).length - dadosFiltrados.length;
        if (removidos > 0) {
            console.log(`🧹 ${removidos} registros FULL removidos da exibição`);
        }

        if (dadosFiltrados.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center">Nenhum frete válido (FULL removidos).</td></tr>';
            if (contagem) contagem.textContent = '0 registros';
            return;
        }

        tbody.innerHTML = '';
        dadosFiltrados.forEach(item => {
            const row = document.createElement('tr');
            let badgeEnvio = '';
            const tipo = (item.tipo_envio || 'N/I').toUpperCase();
            if (tipo.includes('FULL')) {
                badgeEnvio = '<span class="badge badge-danger">FULL</span>';
            } else if (tipo.includes('FLEX')) {
                badgeEnvio = '<span class="badge badge-warning">FLEX</span>';
            } else if (tipo.includes('MERCADO') || tipo.includes('ME')) {
                badgeEnvio = '<span class="badge badge-success">ME</span>';
            } else if (tipo.includes('CROSS')) {
                badgeEnvio = '<span class="badge badge-info">CROSS</span>';
            } else {
                badgeEnvio = `<span class="badge badge-secondary">${tipo}</span>`;
            }

            row.innerHTML = `
                <td>${item.titulo || 'Sem título'}</td>
                <td><code>${item.mlb || 'N/A'}</code></td>
                <td>R$ ${(item.valor_produto || 0).toFixed(2)}</td>
                <td>R$ ${(item.frete_cobrado || 0).toFixed(2)}</td>
                <td>${badgeEnvio}</td>
                <td><span class="badge badge-secondary">${item.id}</span></td>
            `;
            tbody.appendChild(row);
        });

        if (contagem) contagem.textContent = `${dadosFiltrados.length} registros`;
        console.log(`✅ ${dadosFiltrados.length} fretes carregados`);

    } catch (error) {
        console.error('❌ Erro ao carregar fretes:', error);
        tbody.innerHTML = `<tr><td colspan="6" class="text-center text-danger">Erro: ${error.message}</td></tr>`;
    }
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

    tbody.innerHTML = '<tr><td colspan="6" class="text-center"><div class="spinner"></div> Buscando vendas...</td></tr>';
    if (contagem) contagem.textContent = 'Sincronizando...';

    try {
        // 1. Obtém token (necessário para buscar os shipments)
        const tokenData = await window.getValidToken();
        const token = tokenData?.access_token;
        if (!token) {
            throw new Error('Token ML não disponível. Verifique a conexão.');
        }

        // 2. Busca vendas usando a mesma função da aba de vendas
        if (typeof window.buscarVendasML !== 'function') {
            throw new Error('Função buscarVendasML não disponível. Verifique se ml_token_manager.js está carregado.');
        }

        const resultado = await window.buscarVendasML(50);
        console.log(`📦 ${resultado.vendas?.length || 0} vendas retornadas da busca`);

        if (!resultado || !resultado.vendas || resultado.vendas.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center">Nenhuma venda encontrada.</td></tr>';
            if (contagem) contagem.textContent = '0 registros';
            return;
        }

        // 3. Busca IDs já salvos para evitar duplicação
        const { data: salvos, error: erroSalvos } = await window.supabaseClient
            .from('fretes_ml')
            .select('id');
        if (erroSalvos) throw erroSalvos;
        const idsSalvos = new Set(salvos.map(item => item.id));

        // 4. Para cada venda, buscar a ordem completa para extrair o frete
        const registrosParaInserir = [];
        let totalFullIgnorados = 0;
        let totalSemFrete = 0;

        for (const venda of resultado.vendas) {
            const idVenda = venda.id_venda_ml || venda.id;
            if (idsSalvos.has(idVenda)) continue;

            // Verifica se é FULL (pelo tipo_envio ou título)
            if (venda.tipo_envio === 'FULL' || isFullByAnyField(venda)) {
                totalFullIgnorados++;
                continue;
            }

            // Busca a ordem completa para obter o shipping
            const orderId = venda.id_venda_ml || venda.id;
            // Remove o prefixo 'ML' se houver (a API espera o ID numérico)
            const idML = orderId.replace(/^ML/, '');
            const orderUrl = `https://api.mercadolibre.com/orders/${idML}`;
            const orderProxy = `${window.WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(orderUrl)}&token=${encodeURIComponent(token)}`;
            let order = null;
            try {
                const resp = await fetch(orderProxy);
                if (resp.ok) {
                    order = await resp.json();
                } else {
                    console.warn(`⚠️ Não foi possível buscar ordem ${idML}`);
                }
            } catch (e) {
                console.warn(`Erro ao buscar ordem ${idML}:`, e.message);
            }

            let freteCobrado = 0;
            if (order) {
                freteCobrado = await extrairFreteDaVenda(order, token);
            }

            if (freteCobrado === 0) {
                totalSemFrete++;
            }

            // Obtém título e MLB da venda (já disponíveis)
            const titulo = venda.titulo || 'Sem título';
            const mlb = venda.mlb_id || 'N/A';
            const valorProduto = venda.valor_total || 0;

            registrosParaInserir.push({
                id: idVenda,
                titulo: titulo,
                mlb: mlb,
                valor_produto: valorProduto,
                frete_cobrado: freteCobrado,
                data_venda: venda.data_venda || venda.created_at || new Date().toISOString(),
                tipo_envio: venda.tipo_envio || 'N/I'
            });

            // Pequeno delay para não sobrecarregar a API
            await new Promise(resolve => setTimeout(resolve, 200));
        }

        console.log(`📊 Resumo: ${registrosParaInserir.length} para inserir, ${totalFullIgnorados} FULL ignorados, ${totalSemFrete} sem frete`);

        if (registrosParaInserir.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="text-center">Nenhuma venda nova (${totalFullIgnorados} FULL ignorados).</td></tr>`;
            if (contagem) contagem.textContent = 'Nenhuma nova';
            return;
        }

        // 5. Insere os registros
        const { error: insertError } = await window.supabaseClient
            .from('fretes_ml')
            .insert(registrosParaInserir);

        if (insertError) {
            console.error('❌ Erro ao inserir fretes:', insertError);
            throw insertError;
        }

        console.log(`✅ ${registrosParaInserir.length} fretes inseridos`);

        // 6. Recarrega a exibição
        await carregarFretesSalvos();

        if (contagem) {
            const { count } = await window.supabaseClient.from('fretes_ml').select('id', { count: 'exact', head: true });
            contagem.textContent = `${count || 0} registros (${registrosParaInserir.length} novos, ${totalFullIgnorados} FULL ignorados)`;
        }

        showToast(`✅ ${registrosParaInserir.length} fretes adicionados (${totalFullIgnorados} FULL ignorados)`, 'success');

    } catch (error) {
        console.error('❌ Erro na sincronização:', error);
        tbody.innerHTML = `<tr><td colspan="6" class="text-center text-danger">Erro: ${error.message}</td></tr>`;
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
// LIMPEZA DE FULL NO BANCO
// ============================================
async function limparFretesFull() {
    try {
        console.log('🧹 Removendo registros FULL da tabela fretes_ml...');
        const { data, error } = await window.supabaseClient
            .from('fretes_ml')
            .select('*');
        if (error) throw error;

        const fullIds = data.filter(item => 
            item.tipo_envio === 'FULL' || isFullByAnyField(item)
        ).map(item => item.id);

        if (fullIds.length === 0) {
            console.log('✅ Nenhum FULL encontrado.');
            return;
        }
        console.log(`🗑️ Removendo ${fullIds.length} registros FULL...`);
        await window.supabaseClient.from('fretes_ml').delete().in('id', fullIds);
        console.log(`✅ ${fullIds.length} FULL removidos.`);
        await carregarFretesSalvos();
    } catch (error) {
        console.error('❌ Erro na limpeza:', error);
    }
}

// ============================================
// EXPORTAÇÕES
// ============================================
window.carregarFretesSalvos = carregarFretesSalvos;
window.buscarFretes = buscarFretes;
window.limparFretesFull = limparFretesFull;

console.log('✅ shipping_simple.js PRONTO (v18 - com extração de frete)');