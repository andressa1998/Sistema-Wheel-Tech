// ============================================
// SALES DASHBOARD - VERSÃO FINAL CORRIGIDA
// ============================================

let vendasML = [];
let vendasPaginadas = [];
let paginaAtual = 1;
const itensPorPagina = 20;
let filtroAtual = 'todas';
let periodoAtual = 'todas';

// ============================================
// INICIALIZAÇÃO
// ============================================
document.addEventListener('DOMContentLoaded', function() {
    console.log('📊 Sistema de Vendas ML inicializando...');
    carregarVendasDoBanco();
    configurarEventListeners();
    iniciarAutoSincronizacao();
});

// ============================================
// CONFIGURAÇÃO DE EVENTOS
// ============================================
function configurarEventListeners() {
    const buscarInput = document.getElementById('buscarVendas');
    if (buscarInput) {
        buscarInput.addEventListener('input', function() {
            filtrarPorBusca(this.value);
        });
    }
    
    const btnSincronizar = document.getElementById('btnSincronizar');
    if (btnSincronizar) {
        btnSincronizar.addEventListener('click', sincronizarVendasML);
    }
}

// ============================================
// CARREGAR VENDAS DO BANCO
// ============================================
async function carregarVendasDoBanco() {
    try {
        console.log('📦 Carregando vendas do banco...');
        
        const { data, error } = await supabaseClient
            .from('vendas_ml')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (error) {
            console.error('❌ Erro ao carregar vendas:', error);
            mostrarToast('Erro ao carregar vendas', 'error');
            return;
        }
        
        vendasML = data || [];
        console.log(`✅ ${vendasML.length} vendas carregadas do banco`);
        
        atualizarEstatisticas();
        aplicarFiltroAtual();
        
    } catch (error) {
        console.error('❌ Erro no carregamento:', error);
        mostrarToast('Erro ao carregar vendas do banco', 'error');
    }
}

// ============================================
// SINCRONIZAR VENDAS DO ML
// ============================================
async function sincronizarVendasML() {
    try {
        const btn = document.getElementById('btnSincronizar');
        const textoOriginal = btn.innerHTML;
        
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sincronizando...';
        btn.disabled = true;
        
        console.log('🔄 Iniciando sincronização de vendas ML...');
        
        if (window.showToast) {
            window.showToast('Sincronizando vendas do Mercado Livre...', 'info');
        }
        
        console.log('🔑 Chamando buscarVendasML...');
        const resultado = await window.buscarVendasML(50);
        console.log('📦 Resultado bruto:', resultado);
        
        if (resultado && resultado.success && resultado.vendas && resultado.vendas.length > 0) {
            console.log(`✅ ${resultado.vendas.length} vendas recebidas do ML`);
            
            const vendasSalvas = await processarESalvarVendas(resultado.vendas);
            await carregarVendasDoBanco();
            
            if (window.showToast) {
                window.showToast(`${vendasSalvas} vendas sincronizadas com sucesso!`, 'success');
            }
        } else {
            const mensagemErro = resultado?.error || 'Nenhuma venda encontrada';
            console.warn('⚠️', mensagemErro);
            
            if (window.showToast) {
                window.showToast(mensagemErro, resultado?.total === 0 ? 'info' : 'warning');
            }
        }
    } catch (error) {
        console.error('❌ Erro na sincronização:', error);
        if (window.showToast) {
            window.showToast(`Erro na sincronização: ${error.message}`, 'error');
        }
    } finally {
        const btn = document.getElementById('btnSincronizar');
        if (btn) {
            btn.innerHTML = '<i class="fas fa-sync-alt"></i> Sincronizar Agora';
            btn.disabled = false;
        }
    }
}

// ============================================
// PROCESSAR E SALVAR VENDAS
// ============================================
async function processarESalvarVendas(vendasML) {
    try {
        console.log(`🔄 Processando ${vendasML.length} vendas para salvar...`);
        
        const vendasParaSalvar = [];
        const agora = new Date().toISOString();
        
        for (const venda of vendasML) {
            try {
                // ID da venda
                const idVendaML = venda.id_venda_ml || venda.id || `ML${Date.now()}`;
                
                // Preparar dados da venda com TODOS os campos
                const vendaProcessada = {
                    id_venda_ml: idVendaML,
                    titulo: venda.titulo || venda.title || 'Venda sem título',
                    cliente: venda.cliente || venda.buyer?.nickname || 'Cliente não identificado',
                    
                    // SKU e Estoque
                    sku: venda.sku || venda.codigo || 'SEM_SKU',
                    sku_original: venda.sku_original || null,
                    item_id: venda.item_id || null,
                    variacao_id: venda.variacao_id || null,
                    variacao_atributos: venda.variacao_atributos || [],
                    estoque_anuncio: venda.estoque_anuncio || 0,
                    estoque_fisico: venda.estoque_fisico || 0,
                    ultima_verificacao_estoque: venda.ultima_verificacao_estoque || agora,
                    
                    // Quantidade e Valores
                    quantidade: venda.quantidade || venda.quantity || 1,
                    valor_unitario: venda.valor_unitario || venda.unit_price || 0,
                    valor_total: venda.valor_total || venda.total_amount || 0,
                    
                    // Datas
                    created_at: venda.created_at || venda.data_venda || venda.date_created || agora,
                    data_venda: venda.data_venda || venda.date_created || agora,
                    
                    // Status
                    status_ml: venda.status_ml || venda.status || 'paid',
                    status_sistema: venda.status_sistema || 'nova',
                    
                    // Envio
                    tipo_envio: venda.tipo_envio || 'N/I',
                    id_envio: venda.id_envio || null,
                    informacoes_envio: venda.informacoes_envio || JSON.stringify({
                        tipo: venda.tipo_envio,
                        id: venda.id_envio
                    }),
                    
                    // Pagamento
                    informacoes_pagamento: venda.informacoes_pagamento || '{}',
                    
                    // Links
                    link: venda.link || venda.permalink || null,
                    
                    // Controle
                    updated_at: agora,
                    dados_completos: JSON.stringify(venda)
                };
                
                // Verificar se a venda já existe
                const { data: vendaExistente } = await supabaseClient
                    .from('vendas_ml')
                    .select('id')
                    .eq('id_venda_ml', idVendaML)
                    .maybeSingle();
                
                if (vendaExistente) {
                    // Atualizar venda existente
                    const { error } = await supabaseClient
                        .from('vendas_ml')
                        .update(vendaProcessada)
                        .eq('id_venda_ml', idVendaML);
                    
                    if (error) {
                        console.warn(`⚠️ Erro ao atualizar venda ${idVendaML}:`, error);
                    }
                } else {
                    vendasParaSalvar.push(vendaProcessada);
                }
            } catch (errorVenda) {
                console.error(`❌ Erro processando venda:`, errorVenda);
            }
        }
        
        // Salvar novas vendas
        if (vendasParaSalvar.length > 0) {
            console.log(`💾 Salvando ${vendasParaSalvar.length} novas vendas...`);
            
            const { error } = await supabaseClient
                .from('vendas_ml')
                .insert(vendasParaSalvar);
            
            if (error) {
                console.error('❌ Erro ao salvar vendas:', error);
                
                // Tentar uma por uma
                let sucessos = 0;
                for (const venda of vendasParaSalvar) {
                    try {
                        const { error: singleError } = await supabaseClient
                            .from('vendas_ml')
                            .insert([venda]);
                        
                        if (!singleError) sucessos++;
                    } catch (singleError) {
                        console.error(`❌ Erro individual:`, singleError);
                    }
                }
                console.log(`✅ ${sucessos}/${vendasParaSalvar.length} vendas salvas`);
                return sucessos;
            } else {
                console.log(`✅ ${vendasParaSalvar.length} vendas salvas com sucesso`);
                return vendasParaSalvar.length;
            }
        }
        
        console.log('ℹ️ Nenhuma venda nova para salvar');
        return 0;
        
    } catch (error) {
        console.error('❌ Erro processarESalvarVendas:', error);
        throw error;
    }
}

// ============================================
// ATUALIZAR TABELA DE VENDAS - CORRIGIDA
// ============================================
function atualizarTabelaVendas() {
    const tbody = document.getElementById('salesTableBody');
    const emptyMsg = document.getElementById('salesEmpty');
    
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    if (vendasPaginadas.length === 0) {
        if (emptyMsg) emptyMsg.classList.remove('hidden');
        return;
    }
    
    if (emptyMsg) emptyMsg.classList.add('hidden');
    
    vendasPaginadas.forEach(venda => {
        const row = document.createElement('tr');
        row.className = 'venda-item';
        row.dataset.id = venda.id_venda_ml || venda.id;
        
        // ===== DATA DA VENDA =====
        const dataVenda = venda.created_at || venda.data_venda || venda.date_created || new Date().toISOString();
        const dataObj = new Date(dataVenda);
        const dataFormatada = dataObj.toLocaleDateString('pt-BR');
        const horaFormatada = dataObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        
        // ===== STATUS DA VENDA =====
        let statusBadge = '';
        if (venda.status_sistema === 'nova') {
            statusBadge = '<span class="badge badge-nova"><i class="fas fa-star"></i> NOVA</span>';
        } else if (venda.status_sistema === 'verificada') {
            statusBadge = '<span class="badge badge-verificada"><i class="fas fa-check"></i> VERIFICADA</span>';
        } else if (venda.status_sistema === 'fraude') {
            statusBadge = '<span class="badge badge-fraude"><i class="fas fa-ban"></i> FRAUDE</span>';
        } else {
            statusBadge = '<span class="badge badge-secondary">PENDENTE</span>';
        }
        
        // ===== SKU =====
        const sku = venda.sku || venda.item_sku || venda.codigo || 'SEM_SKU';
        
        // ===== VARIAÇÕES =====
        let variacaoDisplay = '';
        if (venda.variacao_atributos && venda.variacao_atributos.length > 0) {
            const variacoes = venda.variacao_atributos
                .map(attr => `${attr.name}: ${attr.value_name}`)
                .join(' | ');
            variacaoDisplay = `<br><small style="color: #666; font-size: 10px;">${variacoes}</small>`;
        }
        
        // ===== TIPO DE ENVIO =====
        let envioBadge = '';
        let tipoEnvio = venda.tipo_envio || venda.meio_envio || 'N/I';
        
        if (tipoEnvio.includes('FULL') || tipoEnvio.includes('fulfillment')) {
            envioBadge = '<span class="badge badge-full"><i class="fas fa-warehouse"></i> FULL</span>';
        } else if (tipoEnvio.includes('FLEX') || tipoEnvio.includes('drop_off') || tipoEnvio.includes('xd_drop_off')) {
            envioBadge = '<span class="badge badge-flex"><i class="fas fa-motorcycle"></i> FLEX</span>';
        } else if (tipoEnvio.includes('MERCADO') || tipoEnvio.includes('self_service') || tipoEnvio.includes('cross_docking')) {
            envioBadge = '<span class="badge badge-mercado"><i class="fas fa-truck"></i> MERCADO ENVIOS</span>';
        } else if (tipoEnvio !== 'N/I' && tipoEnvio !== 'Não especificado') {
            envioBadge = `<span class="badge badge-info">${tipoEnvio}</span>`;
        } else {
            envioBadge = '<span class="badge badge-secondary"><i class="fas fa-question"></i> N/I</span>';
        }
        
        // ===== ESTOQUE DO ANÚNCIO =====
        let estoqueBadge = '';
        const estoqueAnuncio = venda.estoque_anuncio !== undefined && venda.estoque_anuncio !== null 
            ? venda.estoque_anuncio 
            : null;
        
        if (estoqueAnuncio !== null) {
            if (estoqueAnuncio <= 5) {
                estoqueBadge = `<span class="badge badge-danger"><i class="fas fa-exclamation-triangle"></i> ${estoqueAnuncio} un</span>`;
            } else if (estoqueAnuncio <= 20) {
                estoqueBadge = `<span class="badge badge-warning"><i class="fas fa-exclamation"></i> ${estoqueAnuncio} un</span>`;
            } else {
                estoqueBadge = `<span class="badge badge-success"><i class="fas fa-check"></i> ${estoqueAnuncio} un</span>`;
            }
        } else {
            estoqueBadge = '<span class="badge badge-secondary">N/I</span>';
        }
        
        // ===== ESTOQUE FÍSICO =====
        const estoqueFisicoInput = `
            <div style="display: flex; align-items: center; gap: 4px;">
                <input type="number" 
                       class="estoque-fisico-input form-control-sm" 
                       value="${venda.estoque_fisico || 0}" 
                       min="0"
                       data-id="${venda.id_venda_ml || venda.id}"
                       style="width: 60px; padding: 2px 4px; border-radius: 4px; border: 1px solid #ddd;"
                       onchange="window.atualizarEstoqueFisico('${venda.id_venda_ml || venda.id}', this.value)">
            </div>
        `;
        
        // ===== MONTAR LINHA DA TABELA =====
        row.innerHTML = `
            <td>
                <strong style="font-size: 12px;">${(venda.id_venda_ml || venda.id || '').substring(0, 15)}</strong><br>
                <small style="color: #666; font-size: 11px;">${(venda.titulo || venda.title || '').substring(0, 30)}${(venda.titulo || venda.title || '').length > 30 ? '...' : ''}</small>
            </td>
            <td>
                <span style="font-weight: 500;">${dataFormatada}</span><br>
                <small style="color: #666;">${horaFormatada}</small>
            </td>
            <td class="valor-cell">
                <span style="font-weight: 600; color: #28a745;">R$ ${(venda.valor_total || 0).toFixed(2)}</span><br>
                <small style="color: #666;">${venda.quantidade || venda.quantity || 1} un</small>
            </td>
            <td>
                <span style="font-size: 12px;">${venda.cliente || venda.comprador || venda.buyer?.nickname || 'N/I'}</span>
            </td>
            <td>
                <div style="display: flex; flex-direction: column; gap: 4px;">
                    <span class="badge badge-info" style="font-size: 11px; text-align: left; word-break: break-all;">
                        <i class="fas fa-barcode"></i> ${sku}
                    </span>
                    ${variacaoDisplay}
                    <div style="margin-top: 4px;">
                        ${envioBadge}
                    </div>
                </div>
            </td>
            <td>
                <div style="display: flex; flex-direction: column; gap: 6px;">
                    <div>
                        <small style="color: #666; font-size: 10px; display: block;">📦 Anúncio:</small>
                        ${estoqueBadge}
                    </div>
                    <div>
                        <small style="color: #666; font-size: 10px; display: block;">🏭 Físico:</small>
                        ${estoqueFisicoInput}
                    </div>
                </div>
            </td>
            <td>
                ${statusBadge}
            </td>
            <td>
                <div style="display: flex; gap: 4px;">
                    <button onclick="verDetalhesVenda('${venda.id_venda_ml || venda.id}')" class="btn btn-sm btn-info" title="Ver detalhes">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button onclick="verificarVenda('${venda.id_venda_ml || venda.id}')" class="btn btn-sm btn-success ${venda.status_sistema === 'nova' ? '' : 'hidden'}" title="Verificar">
                        <i class="fas fa-check"></i>
                    </button>
                    <button onclick="marcarComoFraude('${venda.id_venda_ml || venda.id}')" class="btn btn-sm btn-danger ${venda.status_sistema === 'nova' ? '' : 'hidden'}" title="Fraude">
                        <i class="fas fa-ban"></i>
                    </button>
                </div>
            </td>
        `;
        
        tbody.appendChild(row);
    });
    
    console.log(`✅ Tabela atualizada com ${vendasPaginadas.length} vendas`);
}

// ============================================
// ATUALIZAR ESTATÍSTICAS
// ============================================
function atualizarEstatisticas() {
    if (!vendasML || vendasML.length === 0) {
        atualizarContadores(0, 0, 0, 0);
        atualizarResumoFinanceiro(0, 0, 0, 0);
        return;
    }
    
    const hoje = new Date().toISOString().split('T')[0];
    
    const vendasHoje = vendasML.filter(v => {
        if (!v.created_at) return false;
        const dataVenda = new Date(v.created_at).toISOString().split('T')[0];
        return dataVenda === hoje;
    });
    
    const umaSemanaAtras = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const vendasSemana = vendasML.filter(v => {
        if (!v.created_at) return false;
        const dataVenda = new Date(v.created_at);
        return dataVenda >= umaSemanaAtras;
    });
    
    const vendasNaoVerificadas = vendasML.filter(v => v.status_sistema === 'nova');
    
    atualizarContadores(
        vendasHoje.length,
        vendasSemana.length,
        vendasNaoVerificadas.length,
        vendasML.length
    );
    
    const totalHoje = vendasHoje.reduce((sum, v) => sum + (v.valor_total || 0), 0);
    const quantidadeHoje = vendasHoje.reduce((sum, v) => sum + (v.quantidade || 0), 0);
    const ticketMedio = quantidadeHoje > 0 ? totalHoje / quantidadeHoje : 0;
    
    atualizarResumoFinanceiro(totalHoje, quantidadeHoje, ticketMedio, vendasNaoVerificadas.length);
}

function atualizarContadores(hoje, semana, naoVerificadas, total) {
    const elementos = {
        'countVendasHoje': hoje,
        'countVendasSemana': semana,
        'countVendasNaoVerificadas': naoVerificadas,
        'countTotalVendas': total,
        'countNovas': vendasML.filter(v => v.status_sistema === 'nova').length,
        'countVerificadas': vendasML.filter(v => v.status_sistema === 'verificada').length,
        'countFraudes': vendasML.filter(v => v.status_sistema === 'fraude').length
    };
    
    Object.entries(elementos).forEach(([id, valor]) => {
        const elemento = document.getElementById(id);
        if (elemento) elemento.textContent = valor;
    });
}

function atualizarResumoFinanceiro(totalHoje, quantidadeHoje, ticketMedio, pendentes) {
    const elementos = {
        'totalHoje': totalHoje.toFixed(2),
        'quantidadeHoje': quantidadeHoje,
        'ticketMedio': ticketMedio.toFixed(2),
        'pendentesVerificacao': pendentes,
        'totalVendasPeriodo': vendasML.reduce((sum, v) => sum + (v.valor_total || 0), 0).toFixed(2)
    };
    
    Object.entries(elementos).forEach(([id, valor]) => {
        const elemento = document.getElementById(id);
        if (elemento) elemento.textContent = valor;
    });
}

// ============================================
// FILTROS E PAGINAÇÃO
// ============================================
function aplicarFiltroAtual() {
    let vendasFiltradas = [...vendasML];
    
    if (filtroAtual === 'nova') {
        vendasFiltradas = vendasFiltradas.filter(v => v.status_sistema === 'nova');
    } else if (filtroAtual === 'verificada') {
        vendasFiltradas = vendasFiltradas.filter(v => v.status_sistema === 'verificada');
    } else if (filtroAtual === 'fraude') {
        vendasFiltradas = vendasFiltradas.filter(v => v.status_sistema === 'fraude');
    }
    
    if (periodoAtual !== 'todas') {
        const hoje = new Date();
        let dataLimite = new Date();
        
        if (periodoAtual === 'hoje') {
            dataLimite.setHours(0, 0, 0, 0);
        } else if (periodoAtual === 'ontem') {
            dataLimite.setDate(dataLimite.getDate() - 1);
            dataLimite.setHours(0, 0, 0, 0);
        } else if (periodoAtual === 'semana') {
            dataLimite.setDate(dataLimite.getDate() - 7);
        } else if (periodoAtual === 'mes') {
            dataLimite.setMonth(dataLimite.getMonth() - 1);
        }
        
        vendasFiltradas = vendasFiltradas.filter(v => {
            if (!v.created_at) return false;
            const dataVenda = new Date(v.created_at);
            return dataVenda >= dataLimite;
        });
    }
    
    vendasFiltradas.sort((a, b) => {
        const dataA = new Date(a.created_at || 0);
        const dataB = new Date(b.created_at || 0);
        return dataB - dataA;
    });
    
    paginarVendasLista(vendasFiltradas);
}

function paginarVendasLista(vendas) {
    const inicio = (paginaAtual - 1) * itensPorPagina;
    const fim = inicio + itensPorPagina;
    
    vendasPaginadas = vendas.slice(inicio, fim);
    
    atualizarTabelaVendas();
    atualizarControlesPaginacao(vendas.length);
}

function atualizarControlesPaginacao(totalVendas) {
    const inicio = (paginaAtual - 1) * itensPorPagina + 1;
    const fim = Math.min(paginaAtual * itensPorPagina, totalVendas);
    
    const inicioElem = document.getElementById('vendasInicio');
    const fimElem = document.getElementById('vendasFim');
    const totalElem = document.getElementById('vendasTotal');
    
    if (inicioElem) inicioElem.textContent = inicio;
    if (fimElem) fimElem.textContent = fim;
    if (totalElem) totalElem.textContent = totalVendas;
    
    const btnAnterior = document.getElementById('btnAnterior');
    const btnProxima = document.getElementById('btnProxima');
    
    if (btnAnterior) btnAnterior.disabled = paginaAtual <= 1;
    if (btnProxima) btnProxima.disabled = fim >= totalVendas;
}

function filtrarPorStatus(status) {
    filtroAtual = status;
    paginaAtual = 1;
    aplicarFiltroAtual();
    
    document.querySelectorAll('#salesSystem .btn-sm').forEach(btn => {
        btn.classList.remove('filtro-ativo');
    });
    if (event && event.target) {
        event.target.classList.add('filtro-ativo');
    }
}

function filtrarVendas(periodo) {
    periodoAtual = periodo;
    paginaAtual = 1;
    aplicarFiltroAtual();
    
    document.querySelectorAll('#salesSystem .card.mb-4 .btn-sm').forEach(btn => {
        btn.classList.remove('filtro-ativo');
    });
    if (event && event.target) {
        event.target.classList.add('filtro-ativo');
    }
}

function filtrarPorBusca(termo) {
    if (!termo || termo.trim() === '') {
        aplicarFiltroAtual();
        return;
    }
    
    const termoLower = termo.toLowerCase();
    const vendasFiltradas = vendasML.filter(v => 
        (v.id_venda_ml && v.id_venda_ml.toLowerCase().includes(termoLower)) ||
        (v.titulo && v.titulo.toLowerCase().includes(termoLower)) ||
        (v.cliente && v.cliente.toLowerCase().includes(termoLower)) ||
        (v.sku && v.sku.toLowerCase().includes(termoLower))
    );
    
    paginarVendasLista(vendasFiltradas);
}

// ============================================
// AÇÕES DE VENDAS
// ============================================
async function verificarVenda(idVenda) {
    try {
        const { error } = await supabaseClient
            .from('vendas_ml')
            .update({ 
                status_sistema: 'verificada',
                updated_at: new Date().toISOString()
            })
            .eq('id_venda_ml', idVenda);
        
        if (error) throw error;
        
        mostrarToast('Venda verificada com sucesso!', 'success');
        await carregarVendasDoBanco();
    } catch (error) {
        console.error('❌ Erro ao verificar venda:', error);
        mostrarToast('Erro ao verificar venda', 'error');
    }
}

async function marcarComoFraude(idVenda) {
    try {
        const { error } = await supabaseClient
            .from('vendas_ml')
            .update({ 
                status_sistema: 'fraude',
                updated_at: new Date().toISOString()
            })
            .eq('id_venda_ml', idVenda);
        
        if (error) throw error;
        
        mostrarToast('Venda marcada como fraude!', 'warning');
        await carregarVendasDoBanco();
    } catch (error) {
        console.error('❌ Erro ao marcar venda como fraude:', error);
        mostrarToast('Erro ao marcar venda como fraude', 'error');
    }
}

// ============================================
// CONTROLE DE ESTOQUE FÍSICO
// ============================================
async function atualizarEstoqueFisico(idVenda, novoEstoque) {
    try {
        const valor = parseInt(novoEstoque);
        if (isNaN(valor) || valor < 0) {
            mostrarToast('Valor inválido', 'error');
            return;
        }
        
        const { error } = await supabaseClient
            .from('vendas_ml')
            .update({ 
                estoque_fisico: valor,
                updated_at: new Date().toISOString()
            })
            .eq('id_venda_ml', idVenda);
        
        if (error) throw error;
        
        mostrarToast(`Estoque físico atualizado: ${valor} un`, 'success');
        
        const input = document.querySelector(`.estoque-fisico-input[data-id="${idVenda}"]`);
        if (input) {
            input.value = valor;
            input.style.border = '2px solid #28a745';
            setTimeout(() => input.style.border = '1px solid #ddd', 2000);
        }
    } catch (error) {
        console.error('❌ Erro ao atualizar estoque físico:', error);
        mostrarToast('Erro ao atualizar estoque', 'error');
    }
}

function editarEstoqueFisico(idVenda, estoqueAtual) {
    const novoEstoque = prompt('Digite a quantidade em estoque físico:', estoqueAtual);
    if (novoEstoque !== null && !isNaN(novoEstoque) && novoEstoque >= 0) {
        atualizarEstoqueFisico(idVenda, parseInt(novoEstoque));
    }
}

// ============================================
// DETALHES DA VENDA
// ============================================
async function verDetalhesVenda(idVenda) {
    try {
        const { data: venda, error } = await supabaseClient
            .from('vendas_ml')
            .select('*')
            .eq('id_venda_ml', idVenda)
            .single();
        
        if (error) throw error;
        
        abrirModalDetalhesVenda(venda);
    } catch (error) {
        console.error('❌ Erro ao carregar detalhes da venda:', error);
        mostrarToast('Erro ao carregar detalhes da venda', 'error');
    }
}

function abrirModalDetalhesVenda(venda) {
    const modal = document.getElementById('vendaDetalhesModal');
    const content = document.getElementById('vendaDetalhesContent');
    const codigo = document.getElementById('vendaCodigo');
    
    if (!modal || !content) return;
    
    const dataVenda = venda.created_at ? new Date(venda.created_at) : new Date();
    const dataFormatada = dataVenda.toLocaleDateString('pt-BR');
    const horaFormatada = dataVenda.toLocaleTimeString('pt-BR');
    
    let statusBadge = '';
    if (venda.status_sistema === 'nova') {
        statusBadge = '<span class="badge badge-nova">NOVA</span>';
    } else if (venda.status_sistema === 'verificada') {
        statusBadge = '<span class="badge badge-verificada">VERIFICADA</span>';
    } else if (venda.status_sistema === 'fraude') {
        statusBadge = '<span class="badge badge-fraude">FRAUDE</span>';
    }
    
    content.innerHTML = `
        <div class="info-grid">
            <div class="info-card">
                <h4><i class="fas fa-info-circle"></i> Informações da Venda</h4>
                <p><strong>ID:</strong> ${venda.id_venda_ml || 'N/A'}</p>
                <p><strong>Status:</strong> ${statusBadge}</p>
                <p><strong>Data:</strong> ${dataFormatada} às ${horaFormatada}</p>
                <p><strong>Produto:</strong> ${venda.titulo || 'Sem título'}</p>
            </div>
            <div class="info-card">
                <h4><i class="fas fa-user"></i> Cliente</h4>
                <p><strong>Nome:</strong> ${venda.cliente || 'N/I'}</p>
                <p><strong>SKU:</strong> <span class="badge badge-info">${venda.sku || 'SEM_SKU'}</span></p>
            </div>
            <div class="info-card">
                <h4><i class="fas fa-truck"></i> Envio</h4>
                <p><strong>Tipo:</strong> ${venda.tipo_envio || 'N/I'}</p>
                ${venda.id_envio ? `<p><strong>ID:</strong> ${venda.id_envio}</p>` : ''}
            </div>
            <div class="info-card">
                <h4><i class="fas fa-money-bill-wave"></i> Valores</h4>
                <p><strong>Quantidade:</strong> ${venda.quantidade || 1} un</p>
                <p><strong>Valor Total:</strong> R$ ${(venda.valor_total || 0).toFixed(2)}</p>
            </div>
            <div class="info-card" style="grid-column: span 2;">
                <h4><i class="fas fa-boxes"></i> Estoque</h4>
                <p><strong>Anúncio:</strong> ${venda.estoque_anuncio !== null ? venda.estoque_anuncio + ' unidades' : 'N/I'}</p>
                <p><strong>Físico:</strong> ${venda.estoque_fisico || 0} unidades</p>
            </div>
        </div>
    `;
    
    if (codigo) codigo.textContent = venda.id_venda_ml;
    modal.classList.remove('hidden');
}

function fecharDetalhesVenda() {
    const modal = document.getElementById('vendaDetalhesModal');
    if (modal) modal.classList.add('hidden');
}

// ============================================
// AUTO-SINCRONIZAÇÃO
// ============================================
function iniciarAutoSincronizacao() {
    setInterval(async () => {
        if (document.getElementById('salesSystem') && 
            !document.getElementById('salesSystem').classList.contains('hidden')) {
            console.log('🔄 Auto-sincronização de vendas...');
            await sincronizarVendasML();
        }
    }, 30 * 60 * 1000);
}

// ============================================
// EXPORTAÇÃO
// ============================================
function exportarVendasExcel() {
    if (vendasML.length === 0) {
        mostrarToast('Nenhuma venda para exportar', 'warning');
        return;
    }
    
    try {
        const dados = vendasML.map(venda => ({
            'ID Venda': venda.id_venda_ml,
            'Data': venda.created_at ? new Date(venda.created_at).toLocaleDateString('pt-BR') : '',
            'Cliente': venda.cliente,
            'SKU': venda.sku,
            'Quantidade': venda.quantidade,
            'Valor Total': venda.valor_total,
            'Envio': venda.tipo_envio,
            'Estoque Anúncio': venda.estoque_anuncio,
            'Status': venda.status_sistema
        }));
        
        const ws = XLSX.utils.json_to_sheet(dados);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Vendas ML");
        
        const nomeArquivo = `vendas_ml_${new Date().toISOString().split('T')[0]}.xlsx`;
        XLSX.writeFile(wb, nomeArquivo);
        
        mostrarToast('Exportação realizada com sucesso!', 'success');
    } catch (error) {
        console.error('❌ Erro na exportação:', error);
        mostrarToast('Erro ao exportar vendas', 'error');
    }
}

// ============================================
// TOAST
// ============================================
function mostrarToast(mensagem, tipo = 'info') {
    if (window.showToast) {
        window.showToast(mensagem, tipo);
    } else {
        console.log(`${tipo.toUpperCase()}: ${mensagem}`);
        const toast = document.createElement('div');
        toast.className = `toast toast-${tipo}`;
        toast.innerHTML = `<i class="fas fa-${tipo === 'success' ? 'check' : tipo === 'error' ? 'times' : 'info'}-circle"></i> ${mensagem}`;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }
}

// ============================================
// EXPORTAÇÕES GLOBAIS
// ============================================
window.filtrarVendas = filtrarVendas;
window.filtrarPorStatus = filtrarPorStatus;
window.paginarVendas = function(direcao) {
    if (direcao === 'anterior' && paginaAtual > 1) paginaAtual--;
    else if (direcao === 'proxima') paginaAtual++;
    aplicarFiltroAtual();
};
window.verDetalhesVenda = verDetalhesVenda;
window.verificarVenda = verificarVenda;
window.marcarComoFraude = marcarComoFraude;
window.fecharDetalhesVenda = fecharDetalhesVenda;
window.exportarVendasExcel = exportarVendasExcel;
window.atualizarEstoqueFisico = atualizarEstoqueFisico;
window.editarEstoqueFisico = editarEstoqueFisico;
window.carregarVendasDoBanco = carregarVendasDoBanco;
window.sincronizarVendasML = sincronizarVendasML;

console.log('✅ Sales Dashboard carregado e pronto!');