// ============================================
// SHIPPING MANAGER - Gestão de Custos de Frete ML com Acompanhamento de Reembolsos
// ============================================

// Tabela de custos baseada em https://www.mercadolivre.com.br/ajuda/40538
const SHIPPING_COST_TABLE = [ ... ]; // (mesma tabela fornecida anteriormente, omitida por brevidade, mas deve ser igual)

const SHIPPING_FAST_COST_TABLE = [ ... ]; // tabela opcional

// Data inicial para busca de vendas (configurável)
const DATA_INICIAL = '2026-03-01';

// ============================================
// FUNÇÕES AUXILIARES (custo esperado, API, etc.)
// ============================================

function getExpectedShippingCost(price, weight, fastShipping = false) {
    const table = fastShipping ? SHIPPING_FAST_COST_TABLE : SHIPPING_COST_TABLE;
    for (const row of table) {
        if (price >= row.priceMin && price <= row.priceMax) {
            if (weight >= row.weightMin && weight <= row.weightMax) {
                let cost = row.cost;
                if (price < 19 && !fastShipping) {
                    const maxAllowed = price / 2;
                    if (cost > maxAllowed) cost = maxAllowed;
                }
                return cost;
            }
        }
    }
    return null;
}

async function getActualShippingCost(shipmentId) {
    try {
        const tokenData = await window.getValidToken();
        if (!tokenData?.access_token) throw new Error('Token inválido');
        
        const url = `https://api.mercadolibre.com/shipments/${shipmentId}/costs`;
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${tokenData.access_token}`,
                'x-format-new': 'true'
            }
        });
        if (!response.ok) return null;
        const data = await response.json();
        return data.senders?.[0]?.cost ?? data.gross_amount ?? null;
    } catch (error) {
        console.error('Erro ao obter custo real:', error);
        return null;
    }
}

// ============================================
// FUNÇÕES PRINCIPAIS
// ============================================

let vendasCarregadas = [];

async function carregarVendas() {
    console.log('📦 Carregando vendas a partir de 2026-01-01...');
    try {
        const { data, error } = await supabaseClient
            .from('vendas_ml')
            .select('*')
            .gte('created_at', '2026-01-01')  // Coluna correta e data mais ampla
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        vendasCarregadas = data || [];
        console.log(`✅ ${vendasCarregadas.length} vendas carregadas`);
        atualizarTabela();
        atualizarResumo();
    } catch (error) {
        console.error('❌ Erro ao carregar vendas:', error);
        mostrarToast('Erro ao carregar vendas', 'error');
    }
}

function atualizarTabela() {
    const tbody = document.getElementById('shippingTableBody');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    if (vendasCarregadas.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="text-center py-5">Nenhuma venda encontrada a partir de 01/03/2026.</td></tr>';
        return;
    }
    
    vendasCarregadas.forEach(venda => {
        const precoUnitario = venda.valor_unitario || (venda.valor_total / venda.quantidade) || 0;
        const peso = venda.peso || 0;
        const custoReal = venda.custo_frete_real;
        const custoEsperado = venda.custo_frete_esperado;
        const divergencia = (custoReal && custoEsperado) ? (custoReal - custoEsperado).toFixed(2) : '-';
        const status = venda.status_frete || 'pendente';
        
        let statusBadge = '';
        if (status === 'pendente') statusBadge = '<span class="badge badge-secondary">Pendente</span>';
        else if (status === 'ok') statusBadge = '<span class="badge badge-success">OK</span>';
        else if (status === 'divergente') statusBadge = '<span class="badge badge-danger">Divergente</span>';
        else if (status === 'reembolsado') statusBadge = '<span class="badge badge-success">Reembolsado</span>';
        else if (status === 'contatado') statusBadge = '<span class="badge badge-warning">Contatado ML</span>';
        else statusBadge = `<span class="badge badge-info">${status}</span>`;
        
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${venda.id_venda_ml}</td>
            <td>${venda.sku || 'N/I'}</td>
            <td>R$ ${precoUnitario.toFixed(2)}</td>
            <td>
                <input type="number" class="peso-input" data-id="${venda.id_venda_ml}" 
                       value="${peso}" step="0.1" min="0" style="width:80px; padding:4px;">
            </td>
            <td class="custo-real" data-id="${venda.id_venda_ml}">${custoReal ? 'R$ '+custoReal.toFixed(2) : '-'}</td>
            <td class="custo-esperado" data-id="${venda.id_venda_ml}">${custoEsperado ? 'R$ '+custoEsperado.toFixed(2) : '-'}</td>
            <td class="divergencia" data-id="${venda.id_venda_ml}">${divergencia !== '-' ? 'R$ '+divergencia : '-'}</td>
            <td class="status-cell" data-id="${venda.id_venda_ml}">${statusBadge}</td>
            <td>
                <button class="btn btn-sm btn-primary" onclick="shippingManager.verificarVenda('${venda.id_venda_ml}')">
                    <i class="fas fa-check"></i> Verificar
                </button>
                <button class="btn btn-sm btn-warning" onclick="shippingManager.abrirModalReembolso('${venda.id_venda_ml}')">
                    <i class="fas fa-hand-holding-usd"></i>
                </button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

async function verificarVenda(idVenda) {
    const venda = vendasCarregadas.find(v => v.id_venda_ml === idVenda);
    if (!venda) return;
    
    const pesoInput = document.querySelector(`.peso-input[data-id="${idVenda}"]`);
    const peso = parseFloat(pesoInput.value);
    if (isNaN(peso) || peso <= 0) {
        mostrarToast('Informe um peso válido', 'warning');
        return;
    }
    
    // Atualiza peso no objeto e no banco
    venda.peso = peso;
    await supabaseClient.from('vendas_ml').update({ peso }).eq('id_venda_ml', idVenda);
    
    // Busca custo real via API
    if (!venda.id_envio) {
        mostrarToast('Venda sem ID de envio', 'error');
        return;
    }
    const custoReal = await getActualShippingCost(venda.id_envio);
    if (custoReal === null) {
        mostrarToast('Não foi possível obter custo real da API', 'error');
        return;
    }
    
    // Calcula custo esperado
    const precoUnitario = venda.valor_unitario || (venda.valor_total / venda.quantidade);
    const custoEsperado = getExpectedShippingCost(precoUnitario, peso, false);
    if (custoEsperado === null) {
        mostrarToast('Não foi possível calcular custo esperado (verifique peso/faixa de preço)', 'error');
        return;
    }
    
    const divergencia = Math.abs(custoReal - custoEsperado);
    const status = divergencia <= 0.01 ? 'ok' : 'divergente';
    
    // Atualiza no banco
    await supabaseClient.from('vendas_ml').update({
        custo_frete_real: custoReal,
        custo_frete_esperado: custoEsperado,
        status_frete: status,
        ultima_verificacao_frete: new Date().toISOString()
    }).eq('id_venda_ml', idVenda);
    
    // Atualiza na tabela
    const linha = document.querySelector(`.peso-input[data-id="${idVenda}"]`).closest('tr');
    linha.querySelector('.custo-real').innerHTML = `R$ ${custoReal.toFixed(2)}`;
    linha.querySelector('.custo-esperado').innerHTML = `R$ ${custoEsperado.toFixed(2)}`;
    linha.querySelector('.divergencia').innerHTML = `R$ ${(custoReal - custoEsperado).toFixed(2)}`;
    const badge = status === 'ok' 
        ? '<span class="badge badge-success">OK</span>' 
        : '<span class="badge badge-danger">Divergente</span>';
    linha.querySelector('.status-cell').innerHTML = badge;
    
    mostrarToast('Verificação concluída!', 'success');
    atualizarResumo();
}

async function verificarVendasPendentes() {
    const linhas = document.querySelectorAll('#shippingTableBody tr');
    const idsPendentes = [];
    linhas.forEach(row => {
        const statusCell = row.querySelector('.status-cell span');
        if (statusCell && statusCell.textContent.includes('Pendente')) {
            const pesoInput = row.querySelector('.peso-input');
            if (pesoInput && pesoInput.value > 0) {
                idsPendentes.push(pesoInput.dataset.id);
            }
        }
    });
    
    if (idsPendentes.length === 0) {
        mostrarToast('Nenhuma venda pendente com peso informado', 'info');
        return;
    }
    
    mostrarToast(`Verificando ${idsPendentes.length} vendas...`, 'info');
    for (let i = 0; i < idsPendentes.length; i++) {
        await verificarVenda(idsPendentes[i]);
        await new Promise(resolve => setTimeout(resolve, 600));
    }
    mostrarToast('Verificação em lote concluída!', 'success');
}

// ============================================
// FUNÇÕES DE REEMBOLSO
// ============================================

function abrirModalReembolso(idVenda) {
    const venda = vendasCarregadas.find(v => v.id_venda_ml === idVenda);
    if (!venda) return;
    
    document.getElementById('acaoVendaId').value = idVenda;
    document.querySelectorAll('input[name="contatoFeito"]').forEach(r => {
        r.checked = (r.value === 'sim' && venda.contato_ml_feito) ? true : (r.value === 'nao' && !venda.contato_ml_feito);
    });
    document.getElementById('dataContato').value = venda.data_contato || '';
    document.getElementById('numeroOperacao').value = venda.numero_operacao || '';
    document.getElementById('dataRetorno').value = venda.data_retorno || '';
    document.querySelectorAll('input[name="reembolsoObtido"]').forEach(r => {
        r.checked = (r.value === 'sim' && venda.reembolso_obtido) ? true : (r.value === 'nao' && !venda.reembolso_obtido);
    });
    document.getElementById('observacoesReembolso').value = venda.observacoes_reembolso || '';
    
    document.getElementById('modalAcaoReembolso').classList.remove('hidden');
}

async function salvarAcaoReembolso(event) {
    event.preventDefault();
    
    const idVenda = document.getElementById('acaoVendaId').value;
    const contatoFeito = document.querySelector('input[name="contatoFeito"]:checked')?.value === 'sim';
    const dataContato = document.getElementById('dataContato').value || null;
    const numeroOperacao = document.getElementById('numeroOperacao').value || null;
    const dataRetorno = document.getElementById('dataRetorno').value || null;
    const reembolsoObtido = document.querySelector('input[name="reembolsoObtido"]:checked')?.value === 'sim';
    const observacoes = document.getElementById('observacoesReembolso').value || null;
    const usuario = getNomeUsuario();
    
    // Define status com base nas ações
    let statusFrete = null;
    if (reembolsoObtido) {
        statusFrete = 'reembolsado';
    } else if (contatoFeito) {
        statusFrete = 'contatado';
    } else {
        // mantém o atual (não altera)
    }
    
    const updateData = {
        contato_ml_feito: contatoFeito,
        data_contato: dataContato,
        numero_operacao: numeroOperacao,
        data_retorno: dataRetorno,
        reembolso_obtido: reembolsoObtido,
        usuario_responsavel_reembolso: usuario,
        observacoes_reembolso: observacoes
    };
    if (statusFrete) updateData.status_frete = statusFrete;
    
    await supabaseClient.from('vendas_ml').update(updateData).eq('id_venda_ml', idVenda);
    
    // Atualiza a lista local
    const venda = vendasCarregadas.find(v => v.id_venda_ml === idVenda);
    Object.assign(venda, updateData);
    
    // Atualiza badge na linha
    const linha = document.querySelector(`.peso-input[data-id="${idVenda}"]`).closest('tr');
    let badgeHtml = '';
    if (venda.status_frete === 'reembolsado') badgeHtml = '<span class="badge badge-success">Reembolsado</span>';
    else if (venda.status_frete === 'contatado') badgeHtml = '<span class="badge badge-warning">Contatado ML</span>';
    else if (venda.status_frete === 'divergente') badgeHtml = '<span class="badge badge-danger">Divergente</span>';
    else if (venda.status_frete === 'ok') badgeHtml = '<span class="badge badge-success">OK</span>';
    else badgeHtml = '<span class="badge badge-secondary">Pendente</span>';
    linha.querySelector('.status-cell').innerHTML = badgeHtml;
    
    fecharModalAcaoReembolso();
    mostrarToast('Ação registrada com sucesso!', 'success');
    atualizarResumo();
}

function fecharModalAcaoReembolso() {
    document.getElementById('modalAcaoReembolso').classList.add('hidden');
}

// ============================================
// RESUMO
// ============================================

function atualizarResumo() {
    const total = vendasCarregadas.length;
    const pendentes = vendasCarregadas.filter(v => v.status_frete === 'pendente' || !v.status_frete).length;
    const divergentes = vendasCarregadas.filter(v => v.status_frete === 'divergente').length;
    const contatados = vendasCarregadas.filter(v => v.status_frete === 'contatado').length;
    const reembolsados = vendasCarregadas.filter(v => v.status_frete === 'reembolsado').length;
    
    document.getElementById('shippingPendentes').textContent = pendentes;
    document.getElementById('shippingDivergentes').textContent = divergentes;
    document.getElementById('shippingEmReembolso').textContent = contatados;
    document.getElementById('shippingReembolsados').textContent = reembolsados;
}

// ============================================
// RELATÓRIO
// ============================================

function abrirRelatorio() {
    // Preencher select de usuários
    const selectUsuario = document.getElementById('relUsuario');
    selectUsuario.innerHTML = '<option value="">Todos</option>';
    const usuarios = [...new Set(vendasCarregadas.map(v => v.usuario_responsavel_reembolso).filter(u => u))];
    usuarios.forEach(u => {
        const opt = document.createElement('option');
        opt.value = u;
        opt.textContent = u;
        selectUsuario.appendChild(opt);
    });
    
    document.getElementById('modalRelatorioFrete').classList.remove('hidden');
}

async function gerarRelatorio() {
    const dataInicio = document.getElementById('relDataInicio').value;
    const dataFim = document.getElementById('relDataFim').value;
    const status = document.getElementById('relStatus').value;
    const usuario = document.getElementById('relUsuario').value;
    
    let query = supabaseClient.from('vendas_ml').select('*').gte('data_venda', dataInicio || '2026-03-01');
    if (dataFim) query = query.lte('data_venda', dataFim);
    if (status) query = query.eq('status_frete', status);
    if (usuario) query = query.eq('usuario_responsavel_reembolso', usuario);
    
    const { data, error } = await query.order('data_venda', { ascending: false });
    if (error) {
        mostrarToast('Erro ao gerar relatório', 'error');
        return;
    }
    
    const tbody = document.getElementById('relatorioTableBody');
    tbody.innerHTML = '';
    data.forEach(v => {
        const precoUnit = v.valor_unitario || (v.valor_total / v.quantidade) || 0;
        const dif = (v.custo_frete_real && v.custo_frete_esperado) ? (v.custo_frete_real - v.custo_frete_esperado).toFixed(2) : '-';
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${v.id_venda_ml}</td>
            <td>${new Date(v.data_venda).toLocaleDateString('pt-BR')}</td>
            <td>${v.sku || 'N/I'}</td>
            <td>${v.peso || 0} kg</td>
            <td>${v.custo_frete_real ? 'R$ '+v.custo_frete_real.toFixed(2) : '-'}</td>
            <td>${v.custo_frete_esperado ? 'R$ '+v.custo_frete_esperado.toFixed(2) : '-'}</td>
            <td>${dif !== '-' ? 'R$ '+dif : '-'}</td>
            <td>${v.status_frete || 'pendente'}</td>
            <td>${v.contato_ml_feito ? 'Sim' : 'Não'}</td>
            <td>${v.numero_operacao || '-'}</td>
            <td>${v.reembolso_obtido ? 'Sim' : 'Não'}</td>
            <td>${v.usuario_responsavel_reembolso || '-'}</td>
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
    const divergentes = vendasCarregadas.filter(v => v.status_frete === 'divergente');
    if (divergentes.length === 0) {
        mostrarToast('Nenhuma divergência encontrada', 'info');
        return;
    }
    const dados = divergentes.map(v => ({
        'ID Venda': v.id_venda_ml,
        'Data': new Date(v.data_venda).toLocaleDateString('pt-BR'),
        'SKU': v.sku,
        'Peso': v.peso,
        'Custo Real': v.custo_frete_real,
        'Custo Esperado': v.custo_frete_esperado,
        'Diferença': v.custo_frete_real - v.custo_frete_esperado,
        'Status': v.status_frete,
        'Contato ML': v.contato_ml_feito ? 'Sim' : 'Não',
        'Nº Operação': v.numero_operacao,
        'Reembolso Obtido': v.reembolso_obtido ? 'Sim' : 'Não'
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

// ============================================
// INICIALIZAÇÃO E EXPORTAÇÃO
// ============================================

// Adiciona event listener ao formulário de reembolso
document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('formAcaoReembolso');
    if (form) form.addEventListener('submit', (e) => {
        e.preventDefault();
        salvarAcaoReembolso(e);
    });
});

window.shippingManager = {
    carregarVendas,
    verificarVenda,
    verificarVendasPendentes, // mesmo nome do botão
    abrirModalReembolso,
    abrirRelatorio,
    gerarRelatorio,
    exportarRelatorio,
    exportarDivergencias
};