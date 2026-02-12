// sales_dashboard.js - VERSÃO CORRIGIDA

let vendasML = [];
let vendasPaginadas = [];
let paginaAtual = 1;
const itensPorPagina = 20;
let filtroAtual = 'todas';
let periodoAtual = 'todas';

// Inicialização
document.addEventListener('DOMContentLoaded', function() {
    console.log('📊 Sistema de Vendas ML inicializando...');
    carregarVendasDoBanco();
    configurarEventListeners();
    iniciarAutoSincronizacao();
});

// Configurar event listeners
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

// Carregar vendas do banco
async function carregarVendasDoBanco() {
    try {
        console.log('📦 Carregando vendas do banco...');
        
        const { data, error } = await supabaseClient
            .from('vendas_ml')
            .select('*')
            .order('created_at', { ascending: false }); // Usar created_at em vez de data_venda
        
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

// Sincronizar vendas do ML

// ===== FUNÇÃO CORRIGIDA - sincronizarVendasML =====
async function sincronizarVendasML() {
    try {
        const btn = document.getElementById('btnSincronizar');
        const textoOriginal = btn.innerHTML;
        
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sincronizando...';
        btn.disabled = true;
        
        console.log('🔄 Iniciando sincronização de vendas ML...');
        
        // CORREÇÃO: Usar window.showToast se existir, senão console.log
        if (window.showToast) {
            window.showToast('Sincronizando vendas do Mercado Livre...', 'info');
        }
        
        // BUSCAR VENDAS - CORREÇÃO: limite MÁXIMO 50
        console.log('🔑 Chamando buscarVendasML...');
        const resultado = await window.buscarVendasML(50);
        console.log('📦 Resultado bruto:', resultado);
        
        if (resultado && resultado.success && resultado.vendas && resultado.vendas.length > 0) {
            console.log(`✅ ${resultado.vendas.length} vendas recebidas do ML`);
            
            const vendasSalvas = await processarESalvarVendas(resultado.vendas);
            await carregarVendasDoBanco();
            
            // CORREÇÃO: Usar window.showToast
            if (window.showToast) {
                window.showToast(`${vendasSalvas} vendas sincronizadas com sucesso!`, 'success');
            }
            
        } else {
            const mensagemErro = resultado?.error || 'Nenhuma venda encontrada';
            console.warn('⚠️', mensagemErro);
            
            // CORREÇÃO: Usar window.showToast
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

// Função para processar e salvar vendas no Supabase
async function processarESalvarVendas(vendasML) {
    try {
        console.log(`🔄 Processando ${vendasML.length} vendas para salvar...`);
        
        const vendasParaSalvar = [];
        const agora = new Date().toISOString();
        
        for (const venda of vendasML) {
            try {
                // Criar ID único
                const idVendaML = venda.id.startsWith('ML') ? venda.id : `ML${venda.id}`;
                
                // Extrair SKU corretamente
                let sku = venda.sku || 'SEM_SKU';
                if (sku === 'SEM_SKU' && venda.order_items && venda.order_items.length > 0) {
                    const primeiroItem = venda.order_items[0];
                    sku = primeiroItem.item?.seller_custom_field || 
                          primeiroItem.item?.seller_sku || 
                          'SEM_SKU';
                }
                
                // Preparar dados da venda
                const vendaProcessada = {
                    id_venda_ml: idVendaML,
                    titulo: venda.title || 'Venda sem título',
                    cliente: venda.buyer?.nickname || 'Cliente não identificado',
                    sku: sku,
                    quantidade: venda.quantity || 1,
                    valor_unitario: venda.unit_price || 0,
                    valor_total: venda.total_amount || 0,
                    created_at: venda.date_created || agora,
                    status_ml: venda.status || 'paid',
                    status_sistema: 'nova',
                    link: venda.permalink || null,
                    informacoes_pagamento: JSON.stringify(venda.payments || {}),
                    informacoes_envio: JSON.stringify(venda.shipping || {}),
                    updated_at: agora,
                    dados_completos: JSON.stringify(venda) // Salvar dados completos para debug
                };
                
                console.log(`➕ Processando venda ${idVendaML}:`, {
                    sku: vendaProcessada.sku,
                    quantidade: vendaProcessada.quantidade,
                    valor: vendaProcessada.valor_total
                });
                
                // Verificar se já existe
                const { data: vendaExistente, error: erroBusca } = await supabaseClient
                    .from('vendas_ml')
                    .select('id')
                    .eq('id_venda_ml', idVendaML)
                    .single();
                
                if (erroBusca && erroBusca.code !== 'PGRST116') {
                    console.warn(`⚠️ Erro buscar venda ${idVendaML}:`, erroBusca);
                }
                
                if (vendaExistente) {
                    // Atualizar
                    const { error } = await supabaseClient
                        .from('vendas_ml')
                        .update(vendaProcessada)
                        .eq('id_venda_ml', idVendaML);
                    
                    if (error) {
                        console.warn(`⚠️ Erro atualizar venda ${idVendaML}:`, error);
                    } else {
                        console.log(`✅ Venda ${idVendaML} atualizada`);
                    }
                } else {
                    vendasParaSalvar.push(vendaProcessada);
                    console.log(`➕ Nova venda ${idVendaML} adicionada para salvar`);
                }
                
            } catch (errorVenda) {
                console.error(`❌ Erro processando venda ${venda.id}:`, errorVenda);
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
                        
                        if (singleError) {
                            console.error(`❌ Erro salvar venda ${venda.id_venda_ml}:`, singleError);
                        } else {
                            sucessos++;
                        }
                    } catch (singleError) {
                        console.error(`❌ Erro individual venda ${venda.id_venda_ml}:`, singleError);
                    }
                }
                
                console.log(`✅ ${sucessos}/${vendasParaSalvar.length} vendas salvas`);
                return sucessos;
            } else {
                console.log(`✅ ${vendasParaSalvar.length} vendas salvas com sucesso`);
                return vendasParaSalvar.length;
            }
        } else {
            console.log('ℹ️ Nenhuma venda nova para salvar');
            return 0;
        }
        
    } catch (error) {
        console.error('❌ Erro processarESalvarVendas:', error);
        throw error;
    }
}

// Processar e salvar vendas no banco - VERSÃO CORRIGIDA
async function processarESalvarVendas(vendasML) {
    try {
        console.log(`🔄 Processando ${vendasML.length} vendas do ML...`);
        
        const vendasParaSalvar = [];
        const agora = new Date().toISOString();
        
        for (const venda of vendasML) {
            // Usar nomes de colunas que existem na sua tabela
            const vendaProcessada = {
                id_venda_ml: venda.id || `ML${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                titulo: venda.title || venda.titulo || 'Venda sem título',
                cliente: venda.buyer?.nickname || venda.cliente || 'Cliente não identificado',
                sku: venda.sku || venda.codigo || 'SEM_SKU',
                quantidade: parseInt(venda.quantity || venda.quantidade || 1),
                valor_unitario: parseFloat(venda.unit_price || venda.preco_unitario || 0),
                valor_total: parseFloat(venda.total_amount || venda.valor_total || 0),
                created_at: venda.date_created || venda.data_venda || agora, // Usar created_at
                status_ml: venda.status || 'confirmed',
                status_sistema: 'nova',
                link: venda.permalink || venda.link || null,
                informacoes_pagamento: venda.payments ? JSON.stringify(venda.payments) : '{}',
                informacoes_envio: venda.shipping ? JSON.stringify(venda.shipping) : '{}',
                updated_at: agora
            };
            
            // Verificar se a venda já existe
            const { data: vendaExistente } = await supabaseClient
                .from('vendas_ml')
                .select('id')
                .eq('id_venda_ml', vendaProcessada.id_venda_ml)
                .single();
            
            if (vendaExistente) {
                // Atualizar venda existente
                const { error } = await supabaseClient
                    .from('vendas_ml')
                    .update(vendaProcessada)
                    .eq('id_venda_ml', vendaProcessada.id_venda_ml);
                
                if (error) {
                    console.warn(`⚠️ Erro ao atualizar venda ${vendaProcessada.id_venda_ml}:`, error);
                }
            } else {
                vendasParaSalvar.push(vendaProcessada);
            }
        }
        
        // Inserir vendas novas em lote
        if (vendasParaSalvar.length > 0) {
            const { error } = await supabaseClient
                .from('vendas_ml')
                .insert(vendasParaSalvar);
            
            if (error) {
                console.error('❌ Erro ao inserir vendas:', error);
                // Tentar inserir uma por uma para identificar o problema
                for (const venda of vendasParaSalvar) {
                    try {
                        const { error: singleError } = await supabaseClient
                            .from('vendas_ml')
                            .insert([venda]);
                        
                        if (singleError) {
                            console.error(`❌ Erro na venda ${venda.id_venda_ml}:`, singleError);
                        }
                    } catch (singleError) {
                        console.error(`❌ Erro individual na venda:`, singleError);
                    }
                }
            } else {
                console.log(`✅ ${vendasParaSalvar.length} novas vendas salvas no banco`);
            }
        }
        
        return vendasParaSalvar.length;
        
    } catch (error) {
        console.error('❌ Erro no processamento de vendas:', error);
        throw error;
    }
}

// Atualizar estatísticas - VERSÃO CORRIGIDA
function atualizarEstatisticas() {
    if (!vendasML || vendasML.length === 0) {
        atualizarContadores(0, 0, 0, 0);
        atualizarResumoFinanceiro(0, 0, 0, 0);
        return;
    }
    
    const hoje = new Date().toISOString().split('T')[0];
    
    // Usar created_at em vez de data_venda
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

// Atualizar contadores na UI
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

// Atualizar resumo financeiro
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

// Aplicar filtro atual - VERSÃO CORRIGIDA
function aplicarFiltroAtual() {
    let vendasFiltradas = [...vendasML];
    
    // Aplicar filtro por status
    if (filtroAtual === 'nova') {
        vendasFiltradas = vendasFiltradas.filter(v => v.status_sistema === 'nova');
    } else if (filtroAtual === 'verificada') {
        vendasFiltradas = vendasFiltradas.filter(v => v.status_sistema === 'verificada');
    } else if (filtroAtual === 'fraude') {
        vendasFiltradas = vendasFiltradas.filter(v => v.status_sistema === 'fraude');
    }
    
    // Aplicar filtro por período
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
    
    // Ordenar por data (mais recente primeiro) - usando created_at
    vendasFiltradas.sort((a, b) => {
        const dataA = new Date(a.created_at || 0);
        const dataB = new Date(b.created_at || 0);
        return dataB - dataA;
    });
    
    // Paginar
    paginarVendasLista(vendasFiltradas);
}

// Paginar vendas
function paginarVendasLista(vendas) {
    const inicio = (paginaAtual - 1) * itensPorPagina;
    const fim = inicio + itensPorPagina;
    
    vendasPaginadas = vendas.slice(inicio, fim);
    
    atualizarTabelaVendas();
    atualizarControlesPaginacao(vendas.length);
}

// Atualizar tabela de vendas - VERSÃO CORRIGIDA
// ===== FUNÇÃO CORRIGIDA - MOSTRA SKU, ESTOQUE E ENVIO =====
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
        
        // Data da venda
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
        
        // ===== TIPO DE ENVIO =====
        let envioBadge = '';
        let tipoEnvio = venda.tipo_envio || venda.meio_envio || 'N/I';
        
        if (tipoEnvio.includes('FULL') || tipoEnvio.includes('fulfillment')) {
            envioBadge = '<span class="badge badge-full"><i class="fas fa-warehouse"></i> FULL</span>';
        } else if (tipoEnvio.includes('FLEX') || tipoEnvio.includes('drop_off')) {
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
        const estoqueAnuncio = venda.estoque_anuncio !== undefined ? venda.estoque_anuncio : null;
        
        if (estoqueAnuncio !== null && estoqueAnuncio !== undefined) {
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
        
        // ===== VARIAÇÕES (se houver) =====
        let variacaoDisplay = '';
        if (venda.variacao_atributos && venda.variacao_atributos.length > 0) {
            const variacoes = venda.variacao_atributos
                .map(attr => `${attr.name}: ${attr.value_name}`)
                .join(' | ');
            variacaoDisplay = `<br><small style="color: #666; font-size: 10px;">${variacoes}</small>`;
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

// Atualizar controles de paginação
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

// Funções de filtro
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

// Funções de ação
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

// sales_dashboard.js - Adicionar função para atualizar estoque físico
async function atualizarEstoqueFisico(idVenda, novoEstoque) {
    try {
        const { error } = await supabaseClient
            .from('vendas_ml')
            .update({ 
                estoque_fisico: parseInt(novoEstoque),
                updated_at: new Date().toISOString()
            })
            .eq('id_venda_ml', idVenda);
        
        if (error) throw error;
        
        mostrarToast('Estoque físico atualizado!', 'success');
        await carregarVendasDoBanco(); // Recarregar
        
    } catch (error) {
        console.error('❌ Erro ao atualizar estoque físico:', error);
        mostrarToast('Erro ao atualizar estoque', 'error');
    }
}

// Função para editar estoque físico via modal
function editarEstoqueFisico(idVenda, estoqueAtual) {
    const novoEstoque = prompt('Digite a quantidade em estoque físico:', estoqueAtual);
    if (novoEstoque !== null && !isNaN(novoEstoque) && novoEstoque >= 0) {
        atualizarEstoqueFisico(idVenda, parseInt(novoEstoque));
    }
}

// MODIFICAR a função abrirModalDetalhesVenda para mostrar as novas informações
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
    
    // Badge de envio
    let envioInfo = '';
    if (venda.tipo_envio) {
        let icone = '';
        if (venda.tipo_envio.includes('FULL')) icone = 'fa-box';
        else if (venda.tipo_envio.includes('FLEX')) icone = 'fa-motorcycle';
        else if (venda.tipo_envio.includes('MERCADO')) icone = 'fa-truck';
        else icone = 'fa-shipping-fast';
        
        envioInfo = `<span style="display: inline-block; padding: 4px 8px; background: #e9ecef; border-radius: 4px;">
                        <i class="fas ${icone}"></i> ${venda.tipo_envio}
                        ${venda.id_envio ? `<br><small style="color: #666;">ID: ${venda.id_envio}</small>` : ''}
                     </span>`;
    }
    
    // Informações de estoque
    const estoqueInfo = `
        <div style="display: flex; gap: 20px; margin-top: 10px;">
            <div style="flex: 1;">
                <strong>Estoque do Anúncio:</strong><br>
                <span style="font-size: 24px; font-weight: 700; color: ${venda.estoque_anuncio <= 5 ? '#dc3545' : venda.estoque_anuncio <= 20 ? '#ffc107' : '#28a745'}">
                    ${venda.estoque_anuncio || 0} unidades
                </span>
                ${venda.ultima_verificacao_estoque ? 
                    `<br><small style="color: #666;">Verificado em: ${new Date(venda.ultima_verificacao_estoque).toLocaleString('pt-BR')}</small>` 
                    : ''}
            </div>
            <div style="flex: 1;">
                <strong>Estoque Físico:</strong><br>
                <div style="display: flex; align-items: center; gap: 10px;">
                    <span style="font-size: 24px; font-weight: 700; color: #007bff;">
                        ${venda.estoque_fisico || 0} unidades
                    </span>
                    <button onclick="editarEstoqueFisico('${venda.id_venda_ml}', ${venda.estoque_fisico || 0})" 
                            class="btn btn-warning btn-sm">
                        <i class="fas fa-edit"></i> Editar
                    </button>
                </div>
            </div>
        </div>
    `;
    
    // SKU Original e Variação
    const variacaoInfo = venda.variacao_atributos && venda.variacao_atributos.length > 0 ? `
        <div style="margin-top: 15px; padding: 10px; background: #f8f9fa; border-radius: 4px;">
            <strong>Variação:</strong><br>
            ${venda.variacao_atributos.map(attr => 
                `<span style="display: inline-block; margin: 2px 5px; padding: 2px 8px; background: #e9ecef; border-radius: 12px;">
                    ${attr.name}: ${attr.value_name}
                </span>`
            ).join('')}
        </div>
    ` : '';
    
    content.innerHTML = `
        <div class="info-grid">
            <div class="info-card">
                <h4><i class="fas fa-info-circle"></i> Informações da Venda</h4>
                <div class="info-item">
                    <div class="info-label">ID da Venda:</div>
                    <div class="info-value">${venda.id_venda_ml || 'N/A'}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">Status:</div>
                    <div class="info-value">${statusBadge}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">Data e Hora:</div>
                    <div class="info-value">${dataFormatada} às ${horaFormatada}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">Título:</div>
                    <div class="info-value">${venda.titulo || 'Sem título'}</div>
                </div>
                ${venda.item_id ? `
                <div class="info-item">
                    <div class="info-label">Item ID:</div>
                    <div class="info-value">
                        <code style="background: #f0f0f0; padding: 2px 6px; border-radius: 4px;">
                            ${venda.item_id}
                        </code>
                    </div>
                </div>
                ` : ''}
            </div>
            
            <div class="info-card">
                <h4><i class="fas fa-user"></i> Informações do Cliente</h4>
                <div class="info-item">
                    <div class="info-label">Cliente:</div>
                    <div class="info-value">${venda.cliente || 'Cliente não identificado'}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">SKU:</div>
                    <div class="info-value">
                        <span class="badge badge-info" style="font-size: 14px;">${venda.sku || 'SEM_SKU'}</span>
                        ${venda.sku_original && venda.sku_original !== venda.sku ? 
                            `<br><small>SKU Original: ${venda.sku_original}</small>` : ''}
                    </div>
                </div>
                ${variacaoInfo}
            </div>
            
            <div class="info-card">
                <h4><i class="fas fa-truck"></i> Informações de Envio</h4>
                <div class="info-item">
                    <div class="info-label">Tipo de Envio:</div>
                    <div class="info-value">${envioInfo || 'Não especificado'}</div>
                </div>
                ${venda.id_envio ? `
                <div class="info-item">
                    <div class="info-label">ID do Envio:</div>
                    <div class="info-value">
                        <code>${venda.id_envio}</code>
                    </div>
                </div>
                ` : ''}
            </div>
            
            <div class="info-card">
                <h4><i class="fas fa-money-bill-wave"></i> Valores</h4>
                <div class="info-item">
                    <div class="info-label">Quantidade:</div>
                    <div class="info-value">${venda.quantidade || 1} unidade(s)</div>
                </div>
                <div class="info-item">
                    <div class="info-label">Valor Unitário:</div>
                    <div class="info-value">R$ ${(venda.valor_unitario || 0).toFixed(2)}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">Valor Total:</div>
                    <div class="info-value" style="font-weight: 700; color: #28a745; font-size: 18px;">
                        R$ ${(venda.valor_total || 0).toFixed(2)}
                    </div>
                </div>
            </div>
            
            <div class="info-card" style="grid-column: span 2;">
                <h4><i class="fas fa-boxes"></i> Controle de Estoque</h4>
                ${estoqueInfo}
            </div>
        </div>
        
        ${venda.link ? `
        <div class="info-card" style="margin-top: 15px;">
            <h4><i class="fas fa-link"></i> Links</h4>
            <div class="info-item">
                <div class="info-label">Link do Anúncio:</div>
                <div class="info-value">
                    <a href="${venda.link}" target="_blank" class="btn btn-sm btn-primary">
                        <i class="fas fa-external-link-alt"></i> Abrir no ML
                    </a>
                </div>
            </div>
        </div>
        ` : ''}
    `;
    
    if (codigo) codigo.textContent = venda.id_venda_ml;
    modal.classList.remove('hidden');
}

// Tornar funções globais
window.atualizarEstoqueFisico = atualizarEstoqueFisico;
window.editarEstoqueFisico = editarEstoqueFisico;

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
    
    // Formatar dados - usar created_at
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
                <div class="info-item">
                    <div class="info-label">ID da Venda:</div>
                    <div class="info-value">${venda.id_venda_ml || 'N/A'}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">Status:</div>
                    <div class="info-value">${statusBadge}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">Data e Hora:</div>
                    <div class="info-value">${dataFormatada} às ${horaFormatada}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">Título:</div>
                    <div class="info-value">${venda.titulo || 'Sem título'}</div>
                </div>
            </div>
            
            <div class="info-card">
                <h4><i class="fas fa-user"></i> Informações do Cliente</h4>
                <div class="info-item">
                    <div class="info-label">Cliente:</div>
                    <div class="info-value">${venda.cliente || 'Cliente não identificado'}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">SKU:</div>
                    <div class="info-value"><span class="badge badge-info">${venda.sku || 'SEM_SKU'}</span></div>
                </div>
            </div>
            
            <div class="info-card">
                <h4><i class="fas fa-money-bill-wave"></i> Valores</h4>
                <div class="info-item">
                    <div class="info-label">Quantidade:</div>
                    <div class="info-value">${venda.quantidade || 1} unidade(s)</div>
                </div>
                <div class="info-item">
                    <div class="info-label">Valor Unitário:</div>
                    <div class="info-value">R$ ${(venda.valor_unitario || 0).toFixed(2)}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">Valor Total:</div>
                    <div class="info-value" style="font-weight: 700; color: #28a745; font-size: 18px;">
                        R$ ${(venda.valor_total || 0).toFixed(2)}
                    </div>
                </div>
            </div>
        </div>
        
        ${venda.link ? `
        <div class="info-card">
            <h4><i class="fas fa-link"></i> Links</h4>
            <div class="info-item">
                <div class="info-label">Link do Anúncio:</div>
                <div class="info-value">
                    <a href="${venda.link}" target="_blank" class="btn btn-sm btn-primary">
                        <i class="fas fa-external-link-alt"></i> Abrir no ML
                    </a>
                </div>
            </div>
        </div>
        ` : ''}
    `;
    
    if (codigo) codigo.textContent = venda.id_venda_ml;
    modal.classList.remove('hidden');
}

function fecharDetalhesVenda() {
    const modal = document.getElementById('vendaDetalhesModal');
    if (modal) modal.classList.add('hidden');
}

// Iniciar auto-sincronização
function iniciarAutoSincronizacao() {
    setInterval(async () => {
        if (document.getElementById('salesSystem') && 
            !document.getElementById('salesSystem').classList.contains('hidden')) {
            console.log('🔄 Auto-sincronização de vendas...');
            await sincronizarVendasML();
        }
    }, 30 * 60 * 1000);
}

// Funções para exportar
function exportarVendasExcel() {
    if (vendasML.length === 0) {
        mostrarToast('Nenhuma venda para exportar', 'warning');
        return;
    }
    
    try {
        const dados = vendasML.map(venda => ({
            'ID Venda': venda.id_venda_ml,
            'Data': venda.created_at ? new Date(venda.created_at).toLocaleDateString('pt-BR') : '',
            'Hora': venda.created_at ? new Date(venda.created_at).toLocaleTimeString('pt-BR') : '',
            'Cliente': venda.cliente,
            'SKU': venda.sku,
            'Quantidade': venda.quantidade,
            'Valor Unitário': venda.valor_unitario,
            'Valor Total': venda.valor_total,
            'Status': venda.status_sistema,
            'Título': venda.titulo
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

// Helper function para mostrar toast
function mostrarToast(mensagem, tipo = 'info') {
    if (window.showToast) {
        window.showToast(mensagem, tipo);
    } else {
        console.log(`${tipo.toUpperCase()}: ${mensagem}`);
        // Fallback simples
        const toast = document.createElement('div');
        toast.className = `toast toast-${tipo}`;
        toast.innerHTML = `<i class="fas fa-${tipo === 'success' ? 'check' : tipo === 'error' ? 'times' : 'info'}-circle"></i> ${mensagem}`;
        document.body.appendChild(toast);
        
        setTimeout(() => toast.remove(), 3000);
    }
}

// Tornar funções globais
window.filtrarVendas = filtrarVendas;
window.filtrarPorStatus = filtrarPorStatus;
window.paginarVendas = function(direcao) {
    if (direcao === 'anterior' && paginaAtual > 1) {
        paginaAtual--;
    } else if (direcao === 'proxima') {
        paginaAtual++;
    }
    aplicarFiltroAtual();
};
window.verDetalhesVenda = verDetalhesVenda;
window.verificarVenda = verificarVenda;
window.marcarComoFraude = marcarComoFraude;
window.fecharDetalhesVenda = fecharDetalhesVenda;
window.exportarVendasExcel = exportarVendasExcel;