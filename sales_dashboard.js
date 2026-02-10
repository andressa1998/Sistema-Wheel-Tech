// ============================================
// DASHBOARD DE VENDAS ML
// ============================================

console.log('📊 Dashboard de vendas carregando...');

// Estado do dashboard
let dashboardState = {
    vendas: [],
    filtroAtual: 'hoje',
    carregando: false,
    estatisticas: null
};

// ===== CARREGAR VENDAS DO SUPABASE =====
async function carregarVendasDashboard(filtro = 'hoje') {
    dashboardState.carregando = true;
    dashboardState.filtroAtual = filtro;
    
    try {
        console.log(`📥 Carregando vendas (filtro: ${filtro})...`);
        
        let query = supabaseClient
            .from('vendas_ml')
            .select('*')
            .order('date_created', { ascending: false });
        
        const hoje = new Date();
        
        switch (filtro) {
            case 'hoje':
                const inicioHoje = new Date(hoje);
                inicioHoje.setHours(0, 0, 0, 0);
                // Pega vendas de hoje que não foram conferidas (false ou null)
                query = query.gte('date_created', inicioHoje.toISOString())
                             .or('conferido.eq.false,conferido.is.null');
                break;
                
            case 'ontem':
                const ontem = new Date(hoje);
                ontem.setDate(ontem.getDate() - 1);
                const inicioOntem = new Date(ontem);
                inicioOntem.setHours(0, 0, 0, 0);
                const fimOntem = new Date(ontem);
                fimOntem.setHours(23, 59, 59, 999);
                query = query.gte('date_created', inicioOntem.toISOString())
                             .lte('date_created', fimOntem.toISOString());
                break;
                
            case 'semana':
                const semanaPassada = new Date(hoje);
                semanaPassada.setDate(semanaPassada.getDate() - 7);
                query = query.gte('date_created', semanaPassada.toISOString());
                break;
                
            case 'mes':
                const mesPassado = new Date(hoje);
                mesPassado.setMonth(mesPassado.getMonth() - 1);
                query = query.gte('date_created', mesPassado.toISOString());
                break;
                
            case 'pendentes':
                // Filtro crucial: Mostra tudo que não está marcado como true
                query = query.or('conferido.eq.false,conferido.is.null');
                break;

            case 'conferidas':
                // Filtro para a aba de conferidas
                query = query.eq('conferido', true);
                break;
        }
        
        const { data, error } = await query;
        if (error) throw error;
        
        dashboardState.vendas = data || [];
        
        renderizarVendasTabela(dashboardState.vendas);
        if (typeof calcularEstatisticasVendas === 'function') calcularEstatisticasVendas();
        atualizarContadoresVendas();
        
        console.log(`✅ ${dashboardState.vendas.length} vendas carregadas`);
        
    } catch (error) {
        console.error('❌ Erro ao carregar vendas:', error);
        renderizarVendasTabela([]);
    } finally {
        dashboardState.carregando = false;
        if (typeof atualizarEstadoCarregamento === 'function') atualizarEstadoCarregamento();
    }
}

// ===== ATUALIZAR CONTADORES DE VENDAS =====
function atualizarContadoresVendas() {
    const vendas = dashboardState.vendas || [];
    
    // Novas: Tudo que não é true (false ou null)
    const novas = vendas.filter(v => v.conferido !== true).length;
    // Verificadas: Somente o que é true
    const conferidas = vendas.filter(v => v.conferido === true).length;
    
    const ids = ['countNovas', 'tabNovas', 'countVerificadas', 'tabVerificadas'];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.textContent = id.includes('Novas') ? novas : conferidas;
        }
    });
}

// ===== FUNÇÕES DE AÇÃO PARA VENDAS =====
window.verDetalhesVenda = async function(vendaId) {
    try {
        const { data: venda, error } = await supabaseClient
            .from('vendas_ml')
            .select('*')
            .eq('id', vendaId)
            .single();
        
        if (error) throw error;
        
        // Mostrar modal com detalhes
        mostrarModalDetalhesVenda(venda);
        
    } catch (error) {
        console.error('❌ Erro ao buscar detalhes da venda:', error);
        showToast('Erro ao carregar detalhes da venda', 'error');
    }
};

window.conferirVenda = async function(orderId) {
    const btn = document.querySelector(`button[onclick*="${orderId}"]`);
    const row = btn ? btn.closest('tr') : null;
    const inputFisico = row ? row.querySelector('.input-estoque-fisico') : null;
    const estoqueFisicoValor = inputFisico ? inputFisico.value : "";

    if (estoqueFisicoValor === "") {
        alert("⚠️ Informe o estoque físico antes de conferir!");
        return;
    }

    try {
        const { error } = await supabaseClient
            .from('vendas_ml')
            .update({ 
                conferido: true, 
                estoque_fisico: Number(estoqueFisicoValor),
                data_conferencia: new Date().toISOString()
            })
            .eq('order_id', String(orderId));

        if (error) throw error;

        alert("✅ Conferência realizada!");
        // Recarrega a aba que você está para a venda "mudar" de lugar
        await carregarVendasDashboard(dashboardState.filtroAtual);

    } catch (err) {
        console.error("Erro:", err);
        alert("Erro ao salvar conferência.");
    }
};

// Função para mostrar modal com detalhes
function mostrarModalDetalhesVenda(venda) {
    // Implemente um modal similar ao do sistema OS
    alert(`Detalhes da venda ${venda.order_id}\n\n` +
          `Comprador: ${venda.buyer_nickname}\n` +
          `Valor: R$ ${venda.total_amount}\n` +
          `Status: ${venda.status}\n` +
          `Itens: ${venda.items_count}`);
}

// ===== CALCULAR ESTATÍSTICAS =====
function calcularEstatisticasVendas() {
    const vendas = dashboardState.vendas;
    
    if (vendas.length === 0) {
        dashboardState.estatisticas = {
            totalVendas: 0,
            valorTotal: 0,
            valorMedio: 0,
            vendasConferidas: 0,
            vendasPendentes: 0,
            produtoMaisVendido: null
        };
        return;
    }
    
    // Calcular totais
    const valorTotal = vendas.reduce((total, venda) => {
        return total + (venda.total_amount || 0);
    }, 0);
    
    const vendasConferidas = vendas.filter(v => v.conferido).length;
    
    // Encontrar produto mais vendido
    const produtosVendidos = {};
    vendas.forEach(venda => {
        const items = venda.items_json || [];
        items.forEach(item => {
            const sku = item.sku || item.item_id;
            if (sku) {
                produtosVendidos[sku] = (produtosVendidos[sku] || 0) + item.quantity;
            }
        });
    });
    
    let produtoMaisVendido = null;
    let maxQuantidade = 0;
    
    Object.entries(produtosVendidos).forEach(([sku, quantidade]) => {
        if (quantidade > maxQuantidade) {
            maxQuantidade = quantidade;
            produtoMaisVendido = {
                sku,
                quantidade
            };
        }
    });
    
    dashboardState.estatisticas = {
        totalVendas: vendas.length,
        valorTotal: valorTotal,
        valorMedio: valorTotal / vendas.length,
        vendasConferidas: vendasConferidas,
        vendasPendentes: vendas.length - vendasConferidas,
        produtoMaisVendido: produtoMaisVendido
    };
}

// ===== FUNÇÃO PARA RENDERIZAR VENDAS NA TABELA =====
function renderizarVendasTabela(vendas) {
    const salesTableBody = document.getElementById('salesTableBody');
    const salesEmpty = document.getElementById('salesEmpty');
    if (!salesTableBody) return;
    
    salesTableBody.innerHTML = '';
    
    if (!vendas || vendas.length === 0) {
        if (salesEmpty) salesEmpty.classList.remove('hidden');
        return;
    } else {
        if (salesEmpty) salesEmpty.classList.add('hidden');
    }
    
    vendas.forEach((venda) => {
        try {
            const row = document.createElement('tr');
            row.className = 'venda-item';
            
            // Lógica de Envio (PRESERVADA)
            const meio = (venda.meio_envio || 'MERCADO ENVIOS').toUpperCase();
            let envioBadge = `<span class="badge border" style="padding: 6px 10px; color: #666;">MERCADO ENVIOS</span>`;
            if (meio.includes('FULL')) {
                envioBadge = `<span class="badge" style="background-color: #ffdb15; color: #000; font-weight: bold; padding: 6px 10px;"><i class="fas fa-bolt"></i> FULL</span>`;
            } else if (meio.includes('FLEX')) {
                envioBadge = `<span class="badge" style="background-color: #00B1EA; color: #fff; font-weight: bold; padding: 6px 10px;"><i class="fas fa-truck-fast"></i> FLEX</span>`;
            }

            // Lógica de Estoque (PRESERVADA)
            const estoqueML = (venda.estoque_restante !== null && venda.estoque_restante !== undefined) ? Number(venda.estoque_restante) : 0;
            const valorFisicoSalvo = venda.estoque_fisico || "";
            const estaConferida = venda.conferido === true;

            // NOVA LÓGICA: Formatação de Data e ID
            const dataVenda = venda.date_created ? new Date(venda.date_created).toLocaleString('pt-BR') : 'N/A';
            const mlb = venda.item_id || 'N/A';

            row.innerHTML = `
                <td style="text-align: left; padding-left: 20px;">
                    <div style="font-size: 0.75rem; color: #888; margin-bottom: 2px;">${dataVenda}</div>
                    <div style="font-weight: 600; font-size: 0.85rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 300px;">
                        ${venda.produto_titulo || 'Sem título'}
                    </div>
                    <div style="display: flex; gap: 10px;">
                        <small class="text-muted">SKU: <strong>${venda.sku || 'N/A'}</strong></small>
                        <small class="text-primary"><strong>${mlb}</strong></small>
                    </div>
                </td>

                <td style="text-align: center; font-weight: bold; color: #28a745;">
                    R$ ${Number(venda.unit_price || 0).toFixed(2)}
                </td>

                <td style="text-align: center;">${venda.buyer_nickname || 'N/A'}</td>

                <td style="text-align: center;">
                    <div style="display: flex; align-items: center; justify-content: center; gap: 8px;">
                        <span style="font-weight: bold;">${estoqueML}</span>
                        <span class="text-muted">|</span>
                        <input type="number" class="form-control input-estoque-fisico" value="${valorFisicoSalvo}" 
                               ${estaConferida ? 'disabled' : ''} style="width: 60px; height: 25px; text-align: center;">
                    </div>
                </td>

                <td style="text-align: center;">${envioBadge}</td>

                <td style="text-align: center;">
                    <span class="badge ${estaConferida ? 'badge-success' : 'badge-info'}">
                        ${estaConferida ? 'CONFERIDA' : 'PAGA'}
                    </span>
                </td>

                <td style="text-align: center;">
                    <div style="display: flex; gap: 4px; justify-content: center;">
                        <button class="btn btn-info btn-sm" onclick="verDetalhesVenda('${venda.order_id}')">
                            <i class="fas fa-eye"></i>
                        </button>
                        
                        <button class="btn btn-warning btn-sm" title="Editar Anúncio no ML" 
                            onclick="abrirModalEdicaoML('${venda.item_id}', '${venda.produto_titulo.replace(/'/g, "")}', ${venda.unit_price}, ${venda.estoque_restante}, '${venda.listing_type_id}')">
                            <i class="fas fa-edit"></i>
                        </button>

                        ${!estaConferida ? `
                            <button class="btn btn-success btn-sm" onclick="conferirVenda('${venda.order_id}')">
                                <i class="fas fa-check"></i>
                            </button>
                        ` : ''}
                    </div>
                </td>
            `;
            salesTableBody.appendChild(row);
        } catch (err) { console.error(err); }
    });
}

/**
 * Função para comparar estoques em tempo real
 */
window.compararEstoque = function(input, estoqueML) {
    if (input.value === "") {
        input.style.backgroundColor = "";
        input.style.color = "";
        return;
    }
    
    const valorFisico = Number(input.value);
    const ml = Number(estoqueML);

    if (valorFisico !== ml) {
        input.style.backgroundColor = "#fff3cd"; // Amarelo alerta
        input.style.color = "#856404";
        input.style.borderColor = "#ffc107";
    } else {
        input.style.backgroundColor = "#d4edda"; // Verde sucesso
        input.style.color = "#155724";
        input.style.borderColor = "#28a745";
    }
};

// ===== FUNÇÕES DE AÇÃO =====
window.verDetalhesVenda = async function(vendaId) {
    try {
        const { data: venda, error } = await supabaseClient
            .from('vendas_ml')
            .select('*')
            .eq('id', vendaId)
            .single();
        
        if (error) throw error;
        
        abrirModalDetalhesVenda(venda);
        
    } catch (error) {
        console.error('❌ Erro ao buscar detalhes da venda:', error);
        showToast('Erro ao carregar detalhes da venda', 'error');
    }
};

window.conferirVenda = async function(orderId) {
    const btn = document.querySelector(`button[onclick*="conferirVenda('${orderId}')"]`);
    const row = btn.closest('tr');
    const inputFisico = row.querySelector('.input-estoque-fisico');
    const estoqueFisicoValor = inputFisico ? inputFisico.value : "";

    if (estoqueFisicoValor === "") {
        alert("⚠️ Digite o estoque físico antes de conferir!");
        inputFisico.focus();
        return;
    }

    try {
        const { error } = await supabaseClient
            .from('vendas_ml')
            .update({ 
                conferido: true, 
                estoque_fisico: Number(estoqueFisicoValor),
                data_conferencia: new Date().toISOString()
            })
            .eq('order_id', String(orderId));

        if (error) throw error;

        alert("✅ Conferência salva!");
        await carregarVendasDashboard(dashboardState.filtroAtual);

    } catch (err) {
        console.error(err);
        alert("Erro ao salvar conferência.");
    }
};

window.imprimirVenda = function(vendaId) {
    // Implementar impressão da venda
    showToast('Funcionalidade de impressão em desenvolvimento', 'info');
};

// ===== MODAL DE DETALHES =====
function abrirModalDetalhesVenda(venda) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.cssText = `
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(0,0,0,0.5);
        z-index: 2000;
    `;
    
    const itemsHTML = (venda.items_json || []).map(item => `
        <tr>
            <td>${item.sku || '-'}</td>
            <td>${item.title}</td>
            <td>${item.quantity}</td>
            <td>R$ ${item.unit_price?.toFixed(2)}</td>
            <td>R$ ${(item.unit_price * item.quantity).toFixed(2)}</td>
        </tr>
    `).join('');
    
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 800px; max-height: 90vh; overflow-y: auto;">
            <div style="background: linear-gradient(135deg, #28a745 0%, #218838 100%); color: white; padding: 20px 30px;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <h3 style="margin: 0;">
                            <i class="fas fa-receipt"></i> Detalhes da Venda
                        </h3>
                        <p style="margin: 5px 0 0 0; opacity: 0.9;">
                            #${venda.order_id}
                        </p>
                    </div>
                    <button onclick="this.parentElement.parentElement.parentElement.remove()" 
                            style="background: rgba(255,255,255,0.2); border: none; width: 40px; height: 40px; border-radius: 50%; cursor: pointer; color: white; font-size: 20px;">
                        &times;
                    </button>
                </div>
            </div>
            
            <div style="padding: 20px;">
                <div class="row mb-4">
                    <div class="col-md-6">
                        <div class="info-card">
                            <h4><i class="fas fa-user"></i> Informações do Comprador</h4>
                            <p><strong>ID:</strong> ${venda.buyer_id || '-'}</p>
                            <p><strong>Nickname:</strong> ${venda.buyer_nickname || '-'}</p>
                        </div>
                    </div>
                    <div class="col-md-6">
                        <div class="info-card">
                            <h4><i class="fas fa-calendar"></i> Datas</h4>
                            <p><strong>Criação:</strong> ${new Date(venda.date_created).toLocaleString('pt-BR')}</p>
                            <p><strong>Fechamento:</strong> ${venda.date_closed ? new Date(venda.date_closed).toLocaleString('pt-BR') : '-'}</p>
                            ${venda.data_conferencia ? `
                            <p><strong>Conferido em:</strong> ${new Date(venda.data_conferencia).toLocaleString('pt-BR')}</p>
                            <p><strong>Conferido por:</strong> ${venda.conferido_por}</p>
                            ` : ''}
                        </div>
                    </div>
                </div>
                
                <div class="info-card mb-4">
                    <h4><i class="fas fa-box"></i> Itens da Venda</h4>
                    <div class="table-responsive">
                        <table class="table">
                            <thead>
                                <tr>
                                    <th>SKU</th>
                                    <th>Produto</th>
                                    <th>Quantidade</th>
                                    <th>Preço Unitário</th>
                                    <th>Subtotal</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${itemsHTML}
                            </tbody>
                            <tfoot>
                                <tr style="background: #f8f9fa;">
                                    <td colspan="4" style="text-align: right; font-weight: bold;">Total:</td>
                                    <td style="font-weight: bold; color: #28a745;">
                                        R$ ${venda.total_amount?.toFixed(2)}
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>
                
                ${venda.shipping_info ? `
                <div class="info-card mb-4">
                    <h4><i class="fas fa-truck"></i> Informações de Envio</h4>
                    <p><strong>ID do Envio:</strong> ${venda.shipping_info.shipping_id}</p>
                    <p><strong>Modalidade:</strong> ${venda.shipping_info.shipping_mode}</p>
                    <p><strong>Status:</strong> ${venda.shipping_info.shipping_status}</p>
                </div>
                ` : ''}
                
                ${venda.tags && venda.tags.length > 0 ? `
                <div class="info-card">
                    <h4><i class="fas fa-tags"></i> Tags</h4>
                    <div>
                        ${venda.tags.map(tag => `<span class="badge badge-info mr-2">${tag}</span>`).join('')}
                    </div>
                </div>
                ` : ''}
            </div>
            
            <div style="background: #f8f9fa; padding: 15px 20px; border-top: 1px solid #dee2e6; text-align: center;">
                <button class="btn btn-primary" onclick="imprimirDetalhesVenda('${venda.id}')">
                    <i class="fas fa-print"></i> Imprimir
                </button>
                ${!venda.conferido ? `
                <button class="btn btn-success" onclick="conferirVenda('${venda.id}'); this.parentElement.parentElement.parentElement.remove();">
                    <i class="fas fa-check"></i> Marcar como Conferida
                </button>
                ` : ''}
                <button class="btn btn-secondary" onclick="this.parentElement.parentElement.parentElement.remove()">
                    <i class="fas fa-times"></i> Fechar
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Fechar com ESC
    const closeOnEsc = (e) => {
        if (e.key === 'Escape') {
            modal.remove();
            document.removeEventListener('keydown', closeOnEsc);
        }
    };
    document.addEventListener('keydown', closeOnEsc);
}

window.abrirModalEdicaoML = function(itemId, titulo, preco, estoque, listingType) {
    document.getElementById('editItemId').value = itemId;
    document.getElementById('editTituloItem').textContent = titulo;
    document.getElementById('editPreco').value = preco;
    document.getElementById('editEstoque').value = estoque;
    document.getElementById('editListingType').value = listingType || 'gold_special';
    
    document.getElementById('modalEdicaoML').style.display = 'flex';
};

window.salvarAlteracoesML = async function() {
    const itemId = document.getElementById('editItemId').value;
    const price = parseFloat(document.getElementById('editPreco').value);
    const stock = parseInt(document.getElementById('editEstoque').value);
    const type = document.getElementById('editListingType').value;

    const btn = document.querySelector('#modalEdicaoML .btn-primary');
    btn.disabled = true;
    btn.innerText = "Salvando...";

    try {
        // Usamos o seu Worker que já está definido no ml_sales_sync.js
        const urlWorker = window.WORKER_URL || 'https://purple-bonus-3b1c.andmiotto1998.workers.dev';
        
        const response = await fetch(`${urlWorker}/update-item`, {
            method: 'POST', // O Worker recebe POST e repassa como PUT pro ML
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                itemId: itemId,
                price: price,
                available_quantity: stock,
                listing_type_id: type
            })
        });

        const resultado = await response.json();

        if (response.ok && resultado.success) {
            alert("✅ Anúncio atualizado com sucesso!");
            document.getElementById('modalEdicaoML').style.display = 'none';
            // Recarrega a tabela
            if (typeof carregarVendasDashboard === 'function') {
                carregarVendasDashboard(dashboardState.filtroAtual);
            }
        } else {
            alert("❌ Erro ao atualizar: " + (resultado.error || "Verifique o log do Worker"));
        }
    } catch (error) {
        console.error("Erro na chamada:", error);
        alert("Erro ao conectar com o Worker. Verifique se ele está online.");
    } finally {
        btn.disabled = false;
        btn.innerText = "Salvar no Mercado Livre";
    }
};

// ===== INICIALIZAR DASHBOARD =====
function inicializarDashboardVendas() {
    console.log('📊 Inicializando dashboard de vendas...');
    
    // Carregar vendas ao abrir o sistema de vendas
    if (window.abrirSistemaVendas) {
        const originalAbrirSistemaVendas = window.abrirSistemaVendas;
        window.abrirSistemaVendas = async function() {
            await originalAbrirSistemaVendas.apply(this, arguments);
            await carregarVendasDashboard('hoje');
        };
    }
    
    // Adicionar botões de filtro
    adicionarFiltrosDashboard();
    
    console.log('✅ Dashboard de vendas inicializado!');
}

// ===== ADICIONAR FILTROS =====
function adicionarFiltrosDashboard() {
    const salesSystem = document.getElementById('salesSystem');
    if (!salesSystem) return;
    
    // Adicionar botões de filtro ao cabeçalho da tabela
    const tableHeader = salesSystem.querySelector('.card-header');
    if (tableHeader) {
        const filterButtons = document.createElement('div');
        filterButtons.className = 'd-flex flex-wrap gap-2 mt-2';
        filterButtons.innerHTML = `
            <button class="btn btn-sm btn-primary" onclick="filtrarVendas('hoje')">
                Hoje
            </button>
            <button class="btn btn-sm btn-outline-primary" onclick="filtrarVendas('ontem')">
                Ontem
            </button>
            <button class="btn btn-sm btn-outline-primary" onclick="filtrarVendas('semana')">
                Esta Semana
            </button>
            <button class="btn btn-sm btn-outline-primary" onclick="filtrarVendas('mes')">
                Este Mês
            </button>
            <button class="btn btn-sm btn-outline-warning" onclick="filtrarVendas('pendentes')">
                Pendentes
            </button>
        `;
        
        tableHeader.appendChild(filterButtons);
    }
}

// ===== FILTRAR VENDAS =====
window.filtrarVendas = async function(filtro) {
    await carregarVendasDashboard(filtro);
    
    // Atualizar botões ativos
    document.querySelectorAll('#salesSystem .btn-sm').forEach(btn => {
        btn.classList.remove('active');
        btn.classList.remove('btn-primary');
        btn.classList.add('btn-outline-primary');
    });
    
    const activeButton = document.querySelector(`#salesSystem .btn-sm[onclick*="${filtro}"]`);
    if (activeButton) {
        activeButton.classList.add('active');
        activeButton.classList.add('btn-primary');
        activeButton.classList.remove('btn-outline-primary');
    }
};

// ===== ATUALIZAR ESTADO DE CARREGAMENTO =====
function atualizarEstadoCarregamento() {
    const container = document.getElementById('salesDashboardContent');
    if (!container) return;
    
    if (dashboardState.carregando) {
        const loadingDiv = container.querySelector('.loading-overlay');
        if (!loadingDiv) {
            const overlay = document.createElement('div');
            overlay.className = 'loading-overlay';
            overlay.style.cssText = `
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(255,255,255,0.8);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10;
            `;
            overlay.innerHTML = `
                <div class="text-center">
                    <div class="spinner" style="width: 40px; height: 40px; border-width: 4px;"></div>
                    <p class="mt-2">Carregando vendas...</p>
                </div>
            `;
            container.style.position = 'relative';
            container.appendChild(overlay);
        }
    } else {
        const loadingDiv = container.querySelector('.loading-overlay');
        if (loadingDiv) {
            loadingDiv.remove();
        }
    }
}

// ===== EXPORTAR FUNÇÕES =====
window.carregarVendasDashboard = carregarVendasDashboard;
window.inicializarDashboardVendas = inicializarDashboardVendas;

console.log('✅ Dashboard de vendas carregado!');

// ===== INICIALIZAR QUANDO PRONTO =====
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => {
            if (window.supabaseClient) {
                inicializarDashboardVendas();
            }
        }, 2000);
    });
} else {
    setTimeout(() => {
        if (window.supabaseClient) {
            inicializarDashboardVendas();
        }
    }, 2000);
}