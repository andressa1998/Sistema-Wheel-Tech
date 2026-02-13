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
        atualizarContadoresConferencia(); // NOVO
        
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
                const idVendaML = venda.id_venda_ml || venda.id || `ML${Date.now()}`;
                
                const vendaProcessada = {
                    id_venda_ml: idVendaML,
                    titulo: venda.titulo || venda.title || 'Venda sem título',
                    cliente: venda.cliente || venda.buyer?.nickname || 'Cliente não identificado',
                    
                    sku: venda.sku || venda.codigo || 'SEM_SKU',
                    sku_original: venda.sku_original || null,
                    item_id: venda.item_id || null,
                    variacao_id: venda.variacao_id || null,
                    variacao_atributos: venda.variacao_atributos || [],
                    estoque_anuncio: venda.estoque_anuncio || 0,
                    estoque_fisico: venda.estoque_fisico || 0,
                    ultima_verificacao_estoque: venda.ultima_verificacao_estoque || agora,
                    
                    quantidade: venda.quantidade || venda.quantity || 1,
                    valor_unitario: venda.valor_unitario || venda.unit_price || 0,
                    valor_total: venda.valor_total || venda.total_amount || 0,
                    
                    created_at: venda.created_at || venda.data_venda || venda.date_created || agora,
                    data_venda: venda.data_venda || venda.date_created || agora,
                    
                    status_ml: venda.status_ml || venda.status || 'paid',
                    status_sistema: venda.status_sistema || 'nova',
                    
                    tipo_envio: venda.tipo_envio || 'N/I',
                    id_envio: venda.id_envio || null,
                    informacoes_envio: venda.informacoes_envio || JSON.stringify({
                        tipo: venda.tipo_envio,
                        id: venda.id_envio
                    }),
                    
                    informacoes_pagamento: venda.informacoes_pagamento || '{}',
                    
                    link: venda.link || venda.permalink || null,
                    
                    // NOVOS CAMPOS PARA CONFERÊNCIA
                    status_conferencia: venda.status_conferencia || 'pendente',
                    divergente: venda.divergente || false,
                    conferido_por_estoque: venda.conferido_por_estoque || null,
                    conferido_por_anuncio: venda.conferido_por_anuncio || null,
                    data_conferencia_estoque: venda.data_conferencia_estoque || null,
                    data_conferencia_anuncio: venda.data_conferencia_anuncio || null,
                    observacao: venda.observacao || null,
                    
                    updated_at: agora,
                    dados_completos: JSON.stringify(venda)
                };
                
                const { data: vendaExistente } = await supabaseClient
                    .from('vendas_ml')
                    .select('id')
                    .eq('id_venda_ml', idVendaML)
                    .maybeSingle();
                
                if (vendaExistente) {
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
        
        if (vendasParaSalvar.length > 0) {
            console.log(`💾 Salvando ${vendasParaSalvar.length} novas vendas...`);
            
            const { error } = await supabaseClient
                .from('vendas_ml')
                .insert(vendasParaSalvar);
            
            if (error) {
                console.error('❌ Erro ao salvar vendas:', error);
                
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
// ATUALIZAR TABELA DE VENDAS
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
        const mlbId = venda.mlb_id || venda.item_id || null;
        
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
        
        // ===== VERIFICAR PERMISSÕES DE CONFERÊNCIA =====
        const podeEditarEstoque = venda.status_conferencia === 'pendente' || !venda.status_conferencia;
        const podeConferirEstoque = venda.status_conferencia === 'pendente' || !venda.status_conferencia;
        const podeConferirAnuncio = venda.status_conferencia === 'conferido_estoque';
        const podeReabrir = venda.status_conferencia === 'conferido_anuncio' && window.currentUser?.role === 'Administrador';
        
        // ===== BADGE DE CONFERÊNCIA =====
        let badgeConferencia = '';
        if (venda.divergente) {
            badgeConferencia = '<span class="badge badge-fraude" style="margin-top: 4px; display: inline-block;"><i class="fas fa-exclamation-triangle"></i> DIVERGENTE</span>';
        } else if (venda.status_conferencia === 'pendente' || !venda.status_conferencia) {
            badgeConferencia = '<span class="badge badge-secondary" style="margin-top: 4px; display: inline-block;"><i class="fas fa-hourglass-half"></i> Pendente</span>';
        } else if (venda.status_conferencia === 'conferido_estoque') {
            badgeConferencia = '<span class="badge badge-info" style="margin-top: 4px; display: inline-block;"><i class="fas fa-box"></i> Estoque OK</span>';
        } else if (venda.status_conferencia === 'conferido_anuncio') {
            badgeConferencia = '<span class="badge badge-success" style="margin-top: 4px; display: inline-block;"><i class="fas fa-check-double"></i> Finalizado</span>';
        }
        
        // ===== ESTOQUE FÍSICO =====
        const estoqueFisicoInput = podeEditarEstoque
            ? `<div style="display: flex; align-items: center; gap: 4px;">
                <input type="number" 
                       class="estoque-fisico-input form-control-sm" 
                       value="${venda.estoque_fisico || 0}" 
                       min="0"
                       data-id="${venda.id_venda_ml || venda.id}"
                       style="width: 60px; padding: 2px 4px; border-radius: 4px; border: 1px solid #ddd;"
                       onchange="window.atualizarEstoqueFisico('${venda.id_venda_ml || venda.id}', this.value)">
               </div>`
            : `<span style="font-weight: bold; color: ${venda.estoque_fisico > 0 ? '#28a745' : '#6c757d'};">${venda.estoque_fisico || 0} un</span>`;
        
        // ===== MONTAR BOTÕES DE AÇÃO =====
        let acoesHtml = '<div style="display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 6px;">';
        
        acoesHtml += `<button onclick="verDetalhesVenda('${venda.id_venda_ml || venda.id}')" class="btn btn-sm btn-info" title="Ver detalhes">
                        <i class="fas fa-eye"></i>
                      </button>`;
        
        if (podeConferirEstoque) {
            acoesHtml += `<button onclick="conferirEstoque('${venda.id_venda_ml || venda.id}')" class="btn btn-sm btn-primary" title="1ª Conferência: Estoque Físico">
                            <i class="fas fa-boxes"></i> <span style="font-size: 10px;">1</span>
                          </button>`;
        }
        
        if (podeConferirAnuncio) {
            acoesHtml += `<button onclick="conferirAnuncio('${venda.id_venda_ml || venda.id}')" class="btn btn-sm btn-success" title="2ª Conferência: Comparar Anúncio">
                            <i class="fas fa-check-double"></i> <span style="font-size: 10px;">2</span>
                          </button>`;
        }
        
        if (podeReabrir) {
            acoesHtml += `<button onclick="reabrirConferencia('${venda.id_venda_ml || venda.id}')" class="btn btn-sm btn-warning" title="Reabrir Conferência">
                            <i class="fas fa-unlock"></i> <span style="font-size: 10px;">↺</span>
                          </button>`;
        }
        
        if (venda.status_sistema === 'nova') {
            acoesHtml += `<button onclick="verificarVenda('${venda.id_venda_ml || venda.id}')" class="btn btn-sm btn-success" title="Verificar">
                            <i class="fas fa-check"></i>
                          </button>
                          <button onclick="marcarComoFraude('${venda.id_venda_ml || venda.id}')" class="btn btn-sm btn-danger" title="Fraude">
                            <i class="fas fa-ban"></i>
                          </button>`;
        }
        
        acoesHtml += '</div>';
        acoesHtml += `<div style="margin-top: 4px; text-align: center;">${badgeConferencia}</div>`;

        if (isAdmin() && venda.status_conferencia !== 'pendente' && venda.status_conferencia !== null) {
    acoesHtml += `<button onclick="moverParaPendentes('${venda.id_venda_ml || venda.id}')" 
                    class="btn btn-sm btn-warning" 
                    title="Mover para Pendentes (Admin)">
                    <i class="fas fa-undo-alt"></i> <span style="font-size: 10px;">↺</span>
                  </button>`;
        }
        
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
                    ${mlbId ? `
                    <span style="font-size: 10px; color: #666; display: flex; align-items: center; gap: 4px;">
                        <i class="fas fa-tag"></i> 
                        <span style="font-family: monospace;">${mlbId.substring(0, 8)}...${mlbId.substring(mlbId.length-4)}</span>
                        <button onclick="copiarMLB('${mlbId}')" style="border: none; background: none; color: #007bff; cursor: pointer;" title="Copiar MLB">
                            <i class="fas fa-copy"></i>
                        </button>
                    </span>
                    ` : ''}
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
                </div>
            </td>
            <td>
                ${statusBadge}
            </td>
            <td>
                ${acoesHtml}
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
    
    // NOVO: FILTRO POR CONFERÊNCIA
    if (filtroConferencia === 'pendente') {
        vendasFiltradas = vendasFiltradas.filter(v => v.status_conferencia === 'pendente' || !v.status_conferencia);
    } else if (filtroConferencia === 'conferido_estoque') {
        vendasFiltradas = vendasFiltradas.filter(v => v.status_conferencia === 'conferido_estoque');
    } else if (filtroConferencia === 'conferido_anuncio') {
        vendasFiltradas = vendasFiltradas.filter(v => v.status_conferencia === 'conferido_anuncio' && !v.divergente);
    } else if (filtroConferencia === 'divergente') {
        vendasFiltradas = vendasFiltradas.filter(v => v.divergente === true);
    }
    
    // FILTRO POR STATUS DO SISTEMA
    if (filtroAtual === 'nova') {
        vendasFiltradas = vendasFiltradas.filter(v => v.status_sistema === 'nova');
    } else if (filtroAtual === 'verificada') {
        vendasFiltradas = vendasFiltradas.filter(v => v.status_sistema === 'verificada');
    } else if (filtroAtual === 'fraude') {
        vendasFiltradas = vendasFiltradas.filter(v => v.status_sistema === 'fraude');
    }
    
    // FILTRO POR PERÍODO
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
    
    // Badge de conferência
    let conferenciaInfo = '';
    if (venda.divergente) {
        conferenciaInfo = '<span class="badge badge-fraude">⚠️ DIVERGENTE</span>';
    } else if (venda.status_conferencia === 'pendente') {
        conferenciaInfo = '<span class="badge badge-secondary">⏳ Pendente</span>';
    } else if (venda.status_conferencia === 'conferido_estoque') {
        conferenciaInfo = '<span class="badge badge-info">📦 Estoque OK</span>';
    } else if (venda.status_conferencia === 'conferido_anuncio') {
        conferenciaInfo = '<span class="badge badge-success">✅ Finalizado</span>';
    }
    
    content.innerHTML = `
        <div class="info-grid">
            <div class="info-card">
                <h4><i class="fas fa-info-circle"></i> Informações da Venda</h4>
                <p><strong>ID:</strong> ${venda.id_venda_ml || 'N/A'}</p>
                <p><strong>Status:</strong> ${statusBadge}</p>
                <p><strong>Conferência:</strong> ${conferenciaInfo}</p>
                <p><strong>Data:</strong> ${dataFormatada} às ${horaFormatada}</p>
                <p><strong>Produto:</strong> ${venda.titulo || 'Sem título'}</p>
            </div>
            <div class="info-card">
                <h4><i class="fas fa-user"></i> Cliente</h4>
                <p><strong>Nome:</strong> ${venda.cliente || 'N/I'}</p>
                <p><strong>SKU:</strong> <span class="badge badge-info">${venda.sku || 'SEM_SKU'}</span></p>
                ${venda.mlb_id ? `<p><strong>MLB:</strong> <code>${venda.mlb_id}</code></p>` : ''}
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
                ${venda.conferido_por_estoque ? `<p><strong>Conferido Estoque por:</strong> ${venda.conferido_por_estoque} em ${new Date(venda.data_conferencia_estoque).toLocaleString('pt-BR')}</p>` : ''}
                ${venda.conferido_por_anuncio ? `<p><strong>Conferido Anúncio por:</strong> ${venda.conferido_por_anuncio} em ${new Date(venda.data_conferencia_anuncio).toLocaleString('pt-BR')}</p>` : ''}
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
// COPIAR MLB
// ============================================
function copiarMLB(mlbId) {
    if (!mlbId) {
        mostrarToast('MLB não disponível', 'error');
        return;
    }
    
    navigator.clipboard.writeText(mlbId).then(() => {
        mostrarToast('MLB copiado para a área de transferência!', 'success');
    }).catch(() => {
        const textarea = document.createElement('textarea');
        textarea.value = mlbId;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        mostrarToast('MLB copiado!', 'success');
    });
}

// ============================================
// ===== NOVAS FUNÇÕES DE CONFERÊNCIA =====
// ============================================

// Variável global para filtro de conferência
let filtroConferencia = 'todos';

// ============================================
// FUNÇÃO PARA PEGAR NOME DO USUÁRIO LOGADO (VERSÃO CORRIGIDA)
// ============================================
function getNomeUsuario() {
    console.log('🔍 Verificando usuário logado...');
    
    // 1. Tentar pegar do window.currentUser (definido no script.js)
    if (window.currentUser) {
        console.log('✅ window.currentUser encontrado:', window.currentUser);
        if (window.currentUser.name) {
            return window.currentUser.name;
        }
        if (window.currentUser.nome) {
            return window.currentUser.nome;
        }
    }
    
    // 2. Tentar pegar do localStorage (wheeltech_user)
    try {
        const userData = localStorage.getItem('wheeltech_user');
        if (userData) {
            const user = JSON.parse(userData);
            console.log('✅ Usuário do localStorage (wheeltech_user):', user);
            if (user.name) return user.name;
            if (user.nome) return user.nome;
        }
    } catch (e) {
        console.warn('⚠️ Erro ao ler wheeltech_user:', e);
    }
    
    // 3. Tentar pegar do sessionStorage (caso use)
    try {
        const sessionUser = sessionStorage.getItem('user');
        if (sessionUser) {
            const user = JSON.parse(sessionUser);
            console.log('✅ Usuário do sessionStorage:', user);
            if (user.name) return user.name;
            if (user.nome) return user.nome;
        }
    } catch (e) {
        console.warn('⚠️ Erro ao ler sessionStorage:', e);
    }
    
    // 4. Tentar pegar da lista de usuários do sistema (como fallback)
    if (window.SYSTEM_USERS && window.currentUser?.username) {
        const foundUser = window.SYSTEM_USERS.find(u => u.username === window.currentUser.username);
        if (foundUser && foundUser.name) {
            console.log('✅ Usuário encontrado na SYSTEM_USERS:', foundUser.name);
            return foundUser.name;
        }
    }
    
    // 5. Última tentativa: verificar elementos da UI
    const userNameElement = document.getElementById('userName');
    if (userNameElement && userNameElement.textContent && userNameElement.textContent !== 'Usuário') {
        console.log('✅ Nome da UI (userName):', userNameElement.textContent);
        return userNameElement.textContent;
    }
    
    const salesUserName = document.getElementById('salesUserName');
    if (salesUserName && salesUserName.textContent && salesUserName.textContent !== 'Usuário Vendas') {
        console.log('✅ Nome da UI (salesUserName):', salesUserName.textContent);
        return salesUserName.textContent;
    }
    
    const reembolsoUserName = document.getElementById('reembolsoUserName');
    if (reembolsoUserName && reembolsoUserName.textContent && reembolsoUserName.textContent !== 'Usuário') {
        console.log('✅ Nome da UI (reembolsoUserName):', reembolsoUserName.textContent);
        return reembolsoUserName.textContent;
    }
    
    console.warn('⚠️ Nenhum usuário encontrado, usando "Sistema"');
    return 'Sistema';
}

// Conferência 1: Estoque Físico
async function conferirEstoque(idVenda) {
    try {
        const { data: venda, error } = await supabaseClient
            .from('vendas_ml')
            .select('*')
            .eq('id_venda_ml', idVenda)
            .single();
        
        if (error) throw error;
        
        if (venda.status_conferencia !== 'pendente' && venda.status_conferencia !== null) {
            mostrarToast('Esta venda já foi conferida!', 'warning');
            return;
        }
        
        const nomeUsuario = getNomeUsuario();
        
        const mensagem = `
📦 CONFERÊNCIA DE ESTOQUE FÍSICO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SKU: ${venda.sku}
MLB: ${venda.mlb_id || venda.item_id || 'N/I'}
Estoque do Anúncio: ${venda.estoque_anuncio || 0} unidades

Usuário: ${nomeUsuario}
Digite a quantidade em ESTOQUE FÍSICO:
        `;
        
        const estoqueFisico = prompt(mensagem, venda.estoque_fisico || 0);
        
        if (estoqueFisico === null) return;
        
        const quantidade = parseInt(estoqueFisico);
        if (isNaN(quantidade) || quantidade < 0) {
            mostrarToast('Quantidade inválida!', 'error');
            return;
        }
        
        const { error: updateError } = await supabaseClient
            .from('vendas_ml')
            .update({
                estoque_fisico: quantidade,
                estoque_fisico_original: quantidade,
                status_conferencia: 'conferido_estoque',
                conferido_por_estoque: nomeUsuario,
                data_conferencia_estoque: new Date().toISOString()
            })
            .eq('id_venda_ml', idVenda);
        
        if (updateError) throw updateError;
        
        mostrarToast(`✅ Estoque conferido por ${nomeUsuario}!`, 'success');
        await carregarVendasDoBanco();
        
    } catch (error) {
        console.error('❌ Erro na conferência:', error);
        mostrarToast('Erro ao conferir estoque', 'error');
    }
}

// Conferência 2: Anúncio (comparação)
async function conferirAnuncio(idVenda) {
    try {
        const { data: venda, error } = await supabaseClient
            .from('vendas_ml')
            .select('*')
            .eq('id_venda_ml', idVenda)
            .single();
        
        if (error) throw error;
        
        if (venda.status_conferencia !== 'conferido_estoque') {
            mostrarToast('Primeiro confira o estoque físico!', 'warning');
            return;
        }
        
        const nomeUsuario = getNomeUsuario();
        const divergente = venda.estoque_anuncio !== venda.estoque_fisico;
        
        if (divergente) {
            const opcao = confirm(
                `⚠️ DIVERGÊNCIA DETECTADA!\n\n` +
                `SKU: ${venda.sku}\n` +
                `MLB: ${venda.mlb_id || venda.item_id || 'N/I'}\n` +
                `Estoque Anúncio: ${venda.estoque_anuncio} unidades\n` +
                `Estoque Físico: ${venda.estoque_fisico} unidades\n\n` +
                `Usuário: ${nomeUsuario}\n\n` +
                `Você JÁ AJUSTOU o anúncio no Mercado Livre?\n\n` +
                `OK = JÁ AJUSTOU (irá para Finalizados)\n` +
                `CANCELAR = AINDA NÃO ajustou (marcar como Divergente)`
            );
            
            if (opcao) {
                await finalizarConferencia(idVenda, false, nomeUsuario);
                mostrarToast('✅ Anúncio ajustado e conferido!', 'success');
            } else {
                await finalizarConferencia(idVenda, true, nomeUsuario);
                mostrarToast('⚠️ Divergência registrada!', 'warning');
            }
        } else {
            if (confirm(
                `✅ VALORES CONFORMES!\n\n` +
                `SKU: ${venda.sku}\n` +
                `MLB: ${venda.mlb_id || venda.item_id || 'N/I'}\n` +
                `Estoque Anúncio: ${venda.estoque_anuncio} unidades\n` +
                `Estoque Físico: ${venda.estoque_fisico} unidades\n\n` +
                `Usuário: ${nomeUsuario}\n\n` +
                `Confirmar conferência do anúncio? (irá para Finalizados)`
            )) {
                await finalizarConferencia(idVenda, false, nomeUsuario);
                mostrarToast('✅ Anúncio conferido com sucesso!', 'success');
            }
        }
        
        await carregarVendasDoBanco();
        
    } catch (error) {
        console.error('❌ Erro na conferência:', error);
        mostrarToast('Erro ao conferir anúncio', 'error');
    }
}

// Finalizar conferência
async function finalizarConferencia(idVenda, divergente, nomeUsuario) {
    try {
        const { error } = await supabaseClient
            .from('vendas_ml')
            .update({
                status_conferencia: 'conferido_anuncio',
                divergente: divergente,
                conferido_por_anuncio: nomeUsuario,
                data_conferencia_anuncio: new Date().toISOString(),
                observacao: divergente ? 'Divergência de estoque - pendente ajuste' : 'Conferido'
            })
            .eq('id_venda_ml', idVenda);
        
        if (error) throw error;
        
    } catch (error) {
        console.error('❌ Erro ao finalizar:', error);
        throw error;
    }
}

// Reabrir conferência
async function reabrirConferencia(idVenda) {
    try {
        const { data: venda, error } = await supabaseClient
            .from('vendas_ml')
            .select('*')
            .eq('id_venda_ml', idVenda)
            .single();
        
        if (error) throw error;
        
        if (venda.status_conferencia !== 'conferido_anuncio') {
            mostrarToast('Esta venda não está finalizada!', 'warning');
            return;
        }
        
        const nomeUsuario = getNomeUsuario();
        
        if (confirm(
            `⚠️ REABRIR CONFERÊNCIA\n\n` +
            `SKU: ${venda.sku}\n` +
            `Status atual: ${venda.divergente ? 'Divergente' : 'Conforme'}\n\n` +
            `Deseja realmente reabrir esta venda para nova conferência?\n` +
            `Ela voltará para a aba "Em andamento".`
        )) {
            const { error: updateError } = await supabaseClient
                .from('vendas_ml')
                .update({
                    status_conferencia: 'conferido_estoque',
                    conferido_por_anuncio: null,
                    data_conferencia_anuncio: null,
                    observacao: 'Reaberto para nova conferência'
                })
                .eq('id_venda_ml', idVenda);
            
            if (updateError) throw updateError;
            
            mostrarToast(`🔄 Conferência reaberta por ${nomeUsuario}`, 'info');
            await carregarVendasDoBanco();
        }
        
    } catch (error) {
        console.error('❌ Erro ao reabrir:', error);
        mostrarToast('Erro ao reabrir conferência', 'error');
    }
}

// Filtrar por conferência
function filtrarPorConferencia(status) {
    filtroConferencia = status;
    paginaAtual = 1;
    aplicarFiltroAtual();
    
    document.querySelectorAll('#salesSystem .btn-conferencia, #salesSystem .btn-outline-secondary, #salesSystem .btn-outline-primary, #salesSystem .btn-outline-info, #salesSystem .btn-outline-success, #salesSystem .btn-outline-danger').forEach(btn => {
        btn.classList.remove('btn-primary', 'btn-info', 'btn-success', 'btn-danger');
        btn.classList.add('btn-outline-secondary');
    });
    
    const activeButton = document.querySelector(`#salesSystem button[onclick*="'${status}'"]`);
    if (activeButton) {
        activeButton.classList.remove('btn-outline-secondary');
        if (status === 'pendente') activeButton.classList.add('btn-primary');
        else if (status === 'conferido_estoque') activeButton.classList.add('btn-info');
        else if (status === 'conferido_anuncio') activeButton.classList.add('btn-success');
        else if (status === 'divergente') activeButton.classList.add('btn-danger');
        else activeButton.classList.add('btn-secondary');
    }
}

// Atualizar contadores de conferência
function atualizarContadoresConferencia() {
    const pendentes = vendasML.filter(v => v.status_conferencia === 'pendente' || !v.status_conferencia).length;
    const emAndamento = vendasML.filter(v => v.status_conferencia === 'conferido_estoque').length;
    const finalizados = vendasML.filter(v => v.status_conferencia === 'conferido_anuncio' && !v.divergente).length;
    const divergentes = vendasML.filter(v => v.divergente === true).length;
    
    const badgePendentes = document.getElementById('badgePendentes');
    const badgeEmAndamento = document.getElementById('badgeEmAndamento');
    const badgeFinalizados = document.getElementById('badgeFinalizados');
    const badgeDivergentes = document.getElementById('badgeDivergentes');
    
    if (badgePendentes) badgePendentes.textContent = pendentes;
    if (badgeEmAndamento) badgeEmAndamento.textContent = emAndamento;
    if (badgeFinalizados) badgeFinalizados.textContent = finalizados;
    if (badgeDivergentes) badgeDivergentes.textContent = divergentes;
    
    const countPendentes = document.getElementById('countPendentes');
    const countEstoqueConferido = document.getElementById('countEstoqueConferido');
    const countAnuncioConferido = document.getElementById('countAnuncioConferido');
    const countDivergentes = document.getElementById('countDivergentes');
    
    if (countPendentes) countPendentes.textContent = pendentes;
    if (countEstoqueConferido) countEstoqueConferido.textContent = emAndamento;
    if (countAnuncioConferido) countAnuncioConferido.textContent = finalizados;
    if (countDivergentes) countDivergentes.textContent = divergentes;
}

// ============================================
// RELATÓRIO DE CONFERÊNCIA
// ============================================
function mostrarFiltroRelatorio() {
    const hoje = new Date();
    const umMesAtras = new Date();
    umMesAtras.setMonth(hoje.getMonth() - 1);
    
    const modalHtml = `
        <div id="modalFiltroRelatorio" class="modal" style="display: flex; z-index: 10000;">
            <div class="modal-content" style="max-width: 400px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                    <h3 style="margin: 0;">
                        <i class="fas fa-filter"></i> Filtrar Relatório de Conferências
                    </h3>
                    <button onclick="window.fecharModalFiltro()" style="background: none; border: none; font-size: 24px; cursor: pointer; color: #6c757d;">
                        &times;
                    </button>
                </div>
                
                <div class="form-group mb-3">
                    <label for="relDataInicio"><i class="fas fa-calendar-alt"></i> Data Início</label>
                    <input type="date" id="relDataInicio" class="form-control" value="${umMesAtras.toISOString().split('T')[0]}">
                </div>
                
                <div class="form-group mb-4">
                    <label for="relDataFim"><i class="fas fa-calendar-alt"></i> Data Fim</label>
                    <input type="date" id="relDataFim" class="form-control" value="${hoje.toISOString().split('T')[0]}">
                </div>
                
                <div class="d-flex justify-content-end gap-2">
                    <button onclick="window.fecharModalFiltro()" class="btn btn-secondary">
                        Cancelar
                    </button>
                    <button onclick="window.gerarRelatorioConferencia()" class="btn btn-success">
                        <i class="fas fa-file-excel"></i> Gerar Relatório
                    </button>
                </div>
            </div>
        </div>
    `;
    
    const modalAnterior = document.getElementById('modalFiltroRelatorio');
    if (modalAnterior) modalAnterior.remove();
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

function fecharModalFiltro() {
    const modal = document.getElementById('modalFiltroRelatorio');
    if (modal) modal.remove();
}

async function gerarRelatorioConferencia() {
    const dataInicio = document.getElementById('relDataInicio')?.value;
    const dataFim = document.getElementById('relDataFim')?.value;
    
    fecharModalFiltro();
    
    try {
        let query = supabaseClient
            .from('vendas_ml')
            .select('*')
            .eq('status_conferencia', 'conferido_anuncio')
            .order('data_conferencia_anuncio', { ascending: false });
        
        if (dataInicio) {
            const inicio = new Date(dataInicio);
            inicio.setHours(0, 0, 0, 0);
            query = query.gte('data_conferencia_anuncio', inicio.toISOString());
        }
        
        if (dataFim) {
            const fim = new Date(dataFim);
            fim.setHours(23, 59, 59, 999);
            query = query.lte('data_conferencia_anuncio', fim.toISOString());
        }
        
        const { data, error } = await query;
        
        if (error) throw error;
        
        const relatorio = data.map(v => ({
            'ID Venda': v.id_venda_ml,
            'Data Venda': new Date(v.created_at).toLocaleDateString('pt-BR'),
            'SKU': v.sku,
            'Estoque Anúncio': v.estoque_anuncio,
            'Estoque Físico': v.estoque_fisico,
            'Divergente': v.divergente ? 'SIM' : 'NÃO',
            'Conferido Estoque por': v.conferido_por_estoque || '-',
            'Data Conferência Estoque': v.data_conferencia_estoque ? new Date(v.data_conferencia_estoque).toLocaleString('pt-BR') : '-',
            'Conferido Anúncio por': v.conferido_por_anuncio || '-',
            'Data Conferência Anúncio': v.data_conferencia_anuncio ? new Date(v.data_conferencia_anuncio).toLocaleString('pt-BR') : '-',
            'Observação': v.observacao || '-'
        }));
        
        if (relatorio.length === 0) {
            mostrarToast('Nenhum dado para o período selecionado', 'info');
            return;
        }
        
        const ws = XLSX.utils.json_to_sheet(relatorio);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Conferências");
        
        const nomeArquivo = `relatorio_conferencias_${new Date().toISOString().split('T')[0]}.xlsx`;
        XLSX.writeFile(wb, nomeArquivo);
        
        mostrarToast(`✅ Relatório gerado com ${relatorio.length} registros!`, 'success');
        
    } catch (error) {
        console.error('❌ Erro ao gerar relatório:', error);
        mostrarToast('Erro ao gerar relatório: ' + error.message, 'error');
    }
}

// ============================================
// FUNÇÃO SUPER SIMPLES PARA VERIFICAR SE É ADMIN
// ============================================
function isAdmin() {
    // Verificar direto no elemento da UI que já funciona
    const roleElement = document.getElementById('userRole');
    if (roleElement && roleElement.textContent === 'Administrador') {
        return true;
    }
    
    // Fallback: verificar no currentUser se existir
    if (window.currentUser && window.currentUser.role === 'Administrador') {
        return true;
    }
    
    return false;
}

// ============================================
// FUNÇÃO PARA ADMIN MOVER VENDA PARA PENDENTES
// ============================================
async function moverParaPendentes(idVenda) {
    // Verificar se é admin
    if (!isAdmin()) {
        mostrarToast('Apenas administradores podem usar esta função!', 'error');
        return;
    }
    
    try {
        const { data: venda, error } = await supabaseClient
            .from('vendas_ml')
            .select('*')
            .eq('id_venda_ml', idVenda)
            .single();
        
        if (error) throw error;
        
        const statusAtual = venda.status_conferencia || 'pendente';
        const nomeAdmin = getNomeUsuario();
        
        const confirmar = confirm(
            `⚠️ MOVER PARA PENDENTES\n\n` +
            `ID: ${venda.id_venda_ml}\n` +
            `SKU: ${venda.sku}\n` +
            `Status atual: ${statusAtual}\n` +
            `Admin: ${nomeAdmin}\n\n` +
            `Tem certeza que deseja mover esta venda para a aba "Pendentes"?\n` +
            `Isso permitirá que seja conferida novamente desde o início.`
        );
        
        if (!confirmar) return;
        
        // Resetar TODOS os campos de conferência
        const { error: updateError } = await supabaseClient
            .from('vendas_ml')
            .update({
                status_conferencia: 'pendente',
                divergente: false,
                conferido_por_estoque: null,
                conferido_por_anuncio: null,
                data_conferencia_estoque: null,
                data_conferencia_anuncio: null,
                observacao: `Movido para pendentes por admin ${nomeAdmin} em ${new Date().toLocaleString('pt-BR')}`
            })
            .eq('id_venda_ml', idVenda);
        
        if (updateError) throw updateError;
        
        mostrarToast(`✅ Venda movida para Pendentes por ${nomeAdmin}!`, 'success');
        await carregarVendasDoBanco();
        
    } catch (error) {
        console.error('❌ Erro ao mover para pendentes:', error);
        mostrarToast('Erro ao mover venda: ' + error.message, 'error');
    }
}

// ============================================
// EXPORTAÇÕES GLOBAIS (ATUALIZADO)
// ============================================
window.filtrarVendas = filtrarVendas;
window.filtrarPorStatus = filtrarPorStatus;
window.filtrarPorConferencia = filtrarPorConferencia;
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
window.carregarVendasDoBanco = carregarVendasDoBanco;
window.sincronizarVendasML = sincronizarVendasML;
window.copiarMLB = copiarMLB;
window.moverParaPendentes = moverParaPendentes;
window.isAdmin = isAdmin;
window.conferirEstoque = conferirEstoque;
window.conferirAnuncio = conferirAnuncio;
window.reabrirConferencia = reabrirConferencia;
window.mostrarFiltroRelatorio = mostrarFiltroRelatorio;
window.fecharModalFiltro = fecharModalFiltro;
window.gerarRelatorioConferencia = gerarRelatorioConferencia;
window.getNomeUsuario = getNomeUsuario;

console.log('✅ Sales Dashboard com Dupla Conferência carregado e pronto!');