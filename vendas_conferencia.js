// ============================================
// SISTEMA DE CONFERÊNCIA DE VENDAS
// ============================================

console.log('📋 Sistema de conferência de vendas carregando...');

// Configurações
const CONFERENCIA_CONFIG = {
    SUPABASE_TABLE: 'vendas_conferencia',
    ESTOQUE_TABLE: 'estoque_produtos',
    HISTORICO_TABLE: 'historico_conferencia'
};

// Estado do sistema
let conferenciaState = {
    vendasPendentes: [],
    vendasConferidas: [],
    produtoSelecionado: null
};

// ===== FUNÇÃO PARA ABRIR CONFERÊNCIA DE VENDA =====
window.abrirConferenciaVenda = async function(vendaId) {
    try {
        console.log(`🔍 Abrindo conferência para venda ${vendaId}...`);
        
        // Buscar dados da venda
        const { data: venda, error } = await supabaseClient
            .from('vendas_ml')
            .select('*')
            .eq('id', vendaId)
            .single();
        
        if (error) throw error;
        
        // Buscar conferência existente
        const { data: conferenciaExistente } = await supabaseClient
            .from(CONFERENCIA_CONFIG.SUPABASE_TABLE)
            .select('*')
            .eq('venda_id', vendaId)
            .single();
        
        // Preparar dados dos itens
        const items = venda.items_json || [];
        
        // Para cada item, buscar estoque atual
        const itemsComEstoque = await Promise.all(
            items.map(async (item) => {
                let estoqueAtual = null;
                
                // Buscar estoque se tiver SKU
                if (item.sku && item.sku !== 'SEM_SKU') {
                    const { data: produtoEstoque } = await supabaseClient
                        .from(CONFERENCIA_CONFIG.ESTOQUE_TABLE)
                        .select('quantidade_estoque')
                        .eq('sku', item.sku)
                        .single();
                    
                    estoqueAtual = produtoEstoque?.quantidade_estoque || 0;
                }
                
                // Buscar conferência existente para este item
                const itemConferido = conferenciaExistente?.itens_conferidos?.find(
                    i => i.item_id === item.item_id
                );
                
                return {
                    ...item,
                    estoque_atual: estoqueAtual,
                    quantidade_fisica: itemConferido?.quantidade_fisica || 0,
                    conferido: itemConferido?.conferido || false,
                    comentarios: itemConferido?.comentarios || '',
                    sku_confirmado: itemConferido?.sku_confirmado || item.sku
                };
            })
        );
        
        // Abrir modal de conferência
        abrirModalConferenciaVenda({
            ...venda,
            itens_detalhados: itemsComEstoque,
            conferencia_existente: conferenciaExistente,
            venda_id: venda.id
        });
        
    } catch (error) {
        console.error('❌ Erro ao abrir conferência:', error);
        showToast('Erro ao abrir conferência: ' + error.message, 'error');
    }
};

// ===== FUNÇÃO PARA ABRIR MODAL DE CONFERÊNCIA =====
function abrirModalConferenciaVenda(venda) {
    // Criar modal
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.cssText = `
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(0,0,0,0.7);
        z-index: 2000;
    `;
    
    // Gerar HTML dos itens
    const itemsHTML = venda.itens_detalhados?.map((item, index) => `
        <div class="item-conferencia" style="background: #f8f9fa; border-radius: 8px; padding: 15px; margin-bottom: 15px; border: 1px solid #dee2e6;">
            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 10px;">
                <div style="flex: 1;">
                    <h4 style="margin: 0 0 5px 0; font-size: 14px; color: #495057;">
                        ${item.title}
                    </h4>
                    <div style="display: flex; gap: 15px; font-size: 12px; color: #6c757d;">
                        <div>
                            <i class="fas fa-barcode"></i> 
                            SKU: <strong>${item.sku || 'Não informado'}</strong>
                        </div>
                        <div>
                            <i class="fas fa-shopping-cart"></i>
                            Vendido: <strong>${item.quantity}</strong>
                        </div>
                        <div>
                            <i class="fas fa-warehouse"></i>
                            Estoque atual: <strong>${item.estoque_atual !== null ? item.estoque_atual : 'Não cadastrado'}</strong>
                        </div>
                    </div>
                </div>
                
                <div style="display: flex; align-items: center; gap: 10px;">
                    <label style="font-size: 12px; color: #495057; font-weight: 600;">
                        <input type="checkbox" 
                               id="conferido_${index}" 
                               ${item.conferido ? 'checked' : ''}
                               style="margin-right: 5px;">
                        Conferido
                    </label>
                </div>
            </div>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-top: 10px;">
                <!-- SKU Confirmado -->
                <div>
                    <label style="display: block; font-size: 11px; color: #6c757d; margin-bottom: 5px; font-weight: 600;">
                        <i class="fas fa-check-circle"></i> SKU Confirmado
                    </label>
                    <input type="text" 
                           id="sku_confirmado_${index}" 
                           class="form-control form-control-sm" 
                           value="${item.sku_confirmado || item.sku || ''}"
                           placeholder="Confirmar SKU..."
                           style="font-size: 12px;">
                </div>
                
                <!-- Quantidade Física -->
                <div>
                    <label style="display: block; font-size: 11px; color: #6c757d; margin-bottom: 5px; font-weight: 600;">
                        <i class="fas fa-balance-scale"></i> Quantidade Física
                    </label>
                    <div style="display: flex; gap: 5px;">
                        <input type="number" 
                               id="quantidade_fisica_${index}" 
                               class="form-control form-control-sm" 
                               value="${item.quantidade_fisica || 0}"
                               min="0"
                               style="font-size: 12px; width: 100px;">
                        <div style="display: flex; align-items: center; gap: 5px; font-size: 11px;">
                            <span style="color: ${item.quantity === item.quantidade_fisica ? '#28a745' : '#dc3545'}; font-weight: bold;">
                                ${item.quantity === item.quantidade_fisica ? '✓ OK' : '✗ Diferença'}
                            </span>
                            ${item.quantity !== item.quantidade_fisica ? 
                            `<span style="color: #dc3545; font-weight: bold;">
                                (${Math.abs(item.quantity - item.quantidade_fisica)})
                            </span>` : ''}
                        </div>
                    </div>
                </div>
                
                <!-- Comentários -->
                <div style="grid-column: span 2;">
                    <label style="display: block; font-size: 11px; color: #6c757d; margin-bottom: 5px; font-weight: 600;">
                        <i class="fas fa-comment"></i> Comentários
                    </label>
                    <textarea id="comentarios_${index}" 
                              class="form-control form-control-sm" 
                              rows="2"
                              placeholder="Observações sobre este item..."
                              style="font-size: 12px; resize: vertical;">${item.comentarios || ''}</textarea>
                </div>
            </div>
            
            <!-- Comparativo -->
            ${item.estoque_atual !== null ? `
            <div style="margin-top: 10px; padding-top: 10px; border-top: 1px dashed #dee2e6;">
                <div style="display: flex; justify-content: space-between; font-size: 11px;">
                    <div>
                        <span style="color: #6c757d;">Estoque após venda:</span>
                        <strong style="color: ${item.estoque_atual - item.quantity >= 0 ? '#28a745' : '#dc3545'}; margin-left: 5px;">
                            ${item.estoque_atual - item.quantity} unidades
                        </strong>
                    </div>
                    <div>
                        <span style="color: #6c757d;">Estoque físico:</span>
                        <strong style="color: ${item.estoque_atual >= item.quantidade_fisica ? '#28a745' : '#dc3545'}; margin-left: 5px;">
                            ${item.quantidade_fisica || 0} unidades
                        </strong>
                    </div>
                    <div>
                        <span style="color: #6c757d;">Diferença:</span>
                        <strong style="color: ${Math.abs((item.estoque_atual - item.quantity) - item.quantidade_fisica) === 0 ? '#28a745' : '#dc3545'}; margin-left: 5px;">
                            ${Math.abs((item.estoque_atual - item.quantity) - (item.quantidade_fisica || 0))} unidades
                        </strong>
                    </div>
                </div>
            </div>
            ` : ''}
        </div>
    `).join('') || '<p>Nenhum item encontrado para esta venda.</p>';
    
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 800px; max-height: 90vh; overflow-y: auto; padding: 0;">
            <!-- Cabeçalho -->
            <div style="background: linear-gradient(135deg, #28a745 0%, #218838 100%); color: white; padding: 20px 30px;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <h3 style="margin: 0; font-weight: 600;">
                            <i class="fas fa-clipboard-check"></i> Conferência de Venda
                        </h3>
                        <p style="margin: 5px 0 0 0; opacity: 0.9; font-size: 14px;">
                            Venda #${venda.order_id} • ${venda.buyer_nickname}
                        </p>
                    </div>
                    <button onclick="this.parentElement.parentElement.parentElement.parentElement.remove()" 
                            style="background: rgba(255,255,255,0.2); border: none; width: 40px; height: 40px; border-radius: 50%; cursor: pointer; color: white; font-size: 20px; display: flex; align-items: center; justify-content: center;">
                        &times;
                    </button>
                </div>
            </div>
            
            <!-- Informações Gerais -->
            <div style="padding: 20px 30px; background: #f8f9fa; border-bottom: 1px solid #dee2e6;">
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px;">
                    <div>
                        <label style="font-size: 11px; color: #6c757d; font-weight: 600;">Data da Venda</label>
                        <div style="font-size: 14px; color: #495057;">
                            ${new Date(venda.date_created).toLocaleString('pt-BR')}
                        </div>
                    </div>
                    <div>
                        <label style="font-size: 11px; color: #6c757d; font-weight: 600;">Valor Total</label>
                        <div style="font-size: 14px; color: #495057; font-weight: 600;">
                            R$ ${parseFloat(venda.total_amount || 0).toFixed(2)}
                        </div>
                    </div>
                    <div>
                        <label style="font-size: 11px; color: #6c757d; font-weight: 600;">Status ML</label>
                        <div>
                            <span class="badge ${venda.status === 'paid' ? 'badge-success' : 'badge-warning'}" 
                                  style="font-size: 11px;">
                                ${venda.status || 'N/A'}
                            </span>
                        </div>
                    </div>
                    <div>
                        <label style="font-size: 11px; color: #6c757d; font-weight: 600;">Itens</label>
                        <div style="font-size: 14px; color: #495057;">
                            ${venda.itens_detalhados?.length || 0} produto(s)
                        </div>
                    </div>
                </div>
                
                ${venda.conferencia_existente ? `
                <div style="margin-top: 15px; padding: 10px; background: #d4edda; border-radius: 5px; border: 1px solid #c3e6cb;">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <i class="fas fa-info-circle" style="color: #155724;"></i>
                        <div>
                            <strong style="color: #155724; font-size: 13px;">Conferência anterior registrada</strong>
                            <div style="font-size: 12px; color: #155724;">
                                Conferido por: ${venda.conferencia_existente.conferido_por} em 
                                ${new Date(venda.conferencia_existente.data_conferencia).toLocaleString('pt-BR')}
                            </div>
                        </div>
                    </div>
                </div>
                ` : ''}
            </div>
            
            <!-- Itens da Venda -->
            <div style="padding: 20px 30px;">
                <h4 style="margin-bottom: 15px; color: #495057; display: flex; align-items: center; gap: 10px;">
                    <i class="fas fa-box"></i> Itens para Conferência
                </h4>
                
                ${itemsHTML}
                
                <!-- Comentários Gerais -->
                <div style="margin-top: 25px;">
                    <label style="display: block; font-size: 13px; color: #495057; margin-bottom: 10px; font-weight: 600;">
                        <i class="fas fa-sticky-note"></i> Comentários Gerais da Conferência
                    </label>
                    <textarea id="comentarios_gerais" 
                              class="form-control" 
                              rows="3"
                              placeholder="Observações gerais sobre esta conferência..."
                              style="font-size: 13px; resize: vertical;">${venda.conferencia_existente?.comentarios_gerais || ''}</textarea>
                </div>
                
                <!-- Data de Conferência -->
                <div style="margin-top: 20px; display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                    <div>
                        <label style="display: block; font-size: 13px; color: #495057; margin-bottom: 10px; font-weight: 600;">
                            <i class="fas fa-calendar-alt"></i> Data da Conferência
                        </label>
                        <input type="date" 
                               id="data_conferencia" 
                               class="form-control"
                               value="${new Date().toISOString().split('T')[0]}">
                    </div>
                    
                    <div>
                        <label style="display: block; font-size: 13px; color: #495057; margin-bottom: 10px; font-weight: 600;">
                            <i class="fas fa-user-check"></i> Conferido por
                        </label>
                        <input type="text" 
                               id="conferido_por" 
                               class="form-control"
                               value="${currentUser?.name || 'Usuário'}"
                               readonly>
                    </div>
                </div>
            </div>
            
            <!-- Rodapé com Botões -->
            <div style="padding: 20px 30px; background: #f8f9fa; border-top: 1px solid #dee2e6; display: flex; justify-content: space-between;">
                <div>
                    <button class="btn btn-secondary" 
                            onclick="this.parentElement.parentElement.parentElement.parentElement.remove()">
                        <i class="fas fa-times"></i> Cancelar
                    </button>
                </div>
                
                <div style="display: flex; gap: 10px;">
                    <button class="btn btn-info" onclick="exportarConferencia(${venda.venda_id})">
                        <i class="fas fa-file-export"></i> Exportar
                    </button>
                    <button class="btn btn-success" onclick="salvarConferenciaVenda(${venda.venda_id})">
                        <i class="fas fa-save"></i> Salvar Conferência
                    </button>
                </div>
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

// ===== FUNÇÃO PARA SALVAR CONFERÊNCIA =====
window.salvarConferenciaVenda = async function(vendaId) {
    try {
        console.log(`💾 Salvando conferência da venda ${vendaId}...`);
        
        // Coletar dados do formulário
        const itensConferidos = [];
        const itens = document.querySelectorAll('.item-conferencia');
        
        itens.forEach((itemElement, index) => {
            const conferido = document.getElementById(`conferido_${index}`)?.checked || false;
            const skuConfirmado = document.getElementById(`sku_confirmado_${index}`)?.value || '';
            const quantidadeFisica = parseInt(document.getElementById(`quantidade_fisica_${index}`)?.value || 0);
            const comentarios = document.getElementById(`comentarios_${index}`)?.value || '';
            
            itensConferidos.push({
                index: index,
                conferido: conferido,
                sku_confirmado: skuConfirmado,
                quantidade_fisica: quantidadeFisica,
                comentarios: comentarios,
                data_registro: new Date().toISOString()
            });
        });
        
        const dadosConferencia = {
            venda_id: vendaId,
            itens_conferidos: itensConferidos,
            comentarios_gerais: document.getElementById('comentarios_gerais')?.value || '',
            data_conferencia: document.getElementById('data_conferencia')?.value || new Date().toISOString().split('T')[0],
            conferido_por: document.getElementById('conferido_por')?.value || currentUser?.name || 'Sistema',
            data_registro: new Date().toISOString(),
            usuario_id: currentUser?.id || null,
            status_conferencia: itensConferidos.every(item => item.conferido) ? 'completa' : 'parcial'
        };
        
        // Verificar se já existe conferência
        const { data: conferenciaExistente } = await supabaseClient
            .from(CONFERENCIA_CONFIG.SUPABASE_TABLE)
            .select('id')
            .eq('venda_id', vendaId)
            .single();
        
        let resultado;
        
        if (conferenciaExistente) {
            // Atualizar conferência existente
            const { data, error } = await supabaseClient
                .from(CONFERENCIA_CONFIG.SUPABASE_TABLE)
                .update(dadosConferencia)
                .eq('venda_id', vendaId)
                .select();
            
            if (error) throw error;
            resultado = { sucesso: true, atualizado: true, data };
        } else {
            // Criar nova conferência
            const { data, error } = await supabaseClient
                .from(CONFERENCIA_CONFIG.SUPABASE_TABLE)
                .insert([dadosConferencia])
                .select();
            
            if (error) throw error;
            resultado = { sucesso: true, atualizado: false, data };
        }
        
        if (resultado.sucesso) {
            // Registrar no histórico
            await registrarHistoricoConferencia(vendaId, dadosConferencia);
            
            // Atualizar estoque se necessário
            await atualizarEstoqueBaseadoNaConferencia(vendaId, itensConferidos);
            
            // Atualizar status da venda
            await atualizarStatusVendaConferida(vendaId);
            
            showToast('✅ Conferência salva com sucesso!', 'success');
            
            // Fechar modal após 2 segundos
            setTimeout(() => {
                const modal = document.querySelector('.modal');
                if (modal) modal.remove();
                
                // Recarregar lista de vendas se estiver na tela de vendas
                if (window.carregarVendasDashboard) {
                    carregarVendasDashboard(window.dashboardState?.filtroAtual || 'hoje');
                }
            }, 2000);
        }
        
    } catch (error) {
        console.error('❌ Erro ao salvar conferência:', error);
        showToast('❌ Erro ao salvar conferência: ' + error.message, 'error');
    }
};

// ===== FUNÇÃO PARA REGISTRAR NO HISTÓRICO =====
async function registrarHistoricoConferencia(vendaId, dadosConferencia) {
    try {
        const historicoData = {
            venda_id: vendaId,
            acao: 'conferencia',
            dados: dadosConferencia,
            usuario: currentUser?.name || 'Sistema',
            data_registro: new Date().toISOString(),
            ip: await obterIPUsuario()
        };
        
        const { error } = await supabaseClient
            .from(CONFERENCIA_CONFIG.HISTORICO_TABLE)
            .insert([historicoData]);
        
        if (error) throw error;
        
        console.log('📝 Histórico de conferência registrado');
        
    } catch (error) {
        console.error('❌ Erro ao registrar histórico:', error);
    }
}

// ===== FUNÇÃO PARA ATUALIZAR ESTOQUE =====
async function atualizarEstoqueBaseadoNaConferencia(vendaId, itensConferidos) {
    try {
        console.log('📦 Atualizando estoque baseado na conferência...');
        
        for (const item of itensConferidos) {
            if (!item.sku_confirmado || item.sku_confirmado === 'SEM_SKU') {
                continue;
            }
            
            // Buscar produto no estoque
            const { data: produto, error: erroBusca } = await supabaseClient
                .from(CONFERENCIA_CONFIG.ESTOQUE_TABLE)
                .select('*')
                .eq('sku', item.sku_confirmado)
                .single();
            
            if (erroBusca && erroBusca.code === 'PGRST116') {
                // Produto não encontrado - criar registro
                console.log(`➕ Criando novo produto no estoque: ${item.sku_confirmado}`);
                
                const { error: erroInsercao } = await supabaseClient
                    .from(CONFERENCIA_CONFIG.ESTOQUE_TABLE)
                    .insert([{
                        sku: item.sku_confirmado,
                        nome_produto: `Produto SKU ${item.sku_confirmado}`,
                        quantidade_estoque: item.quantidade_fisica || 0,
                        quantidade_minima: 10,
                        quantidade_maxima: 100,
                        ultima_conferencia: new Date().toISOString(),
                        conferido_por: currentUser?.name || 'Sistema',
                        historico_ajustes: [{
                            venda_id: vendaId,
                            tipo: 'conferencia',
                            quantidade_anterior: 0,
                            quantidade_nova: item.quantidade_fisica || 0,
                            data: new Date().toISOString(),
                            usuario: currentUser?.name || 'Sistema',
                            comentarios: item.comentarios || ''
                        }]
                    }]);
                
                if (erroInsercao) {
                    console.error(`❌ Erro ao criar produto ${item.sku_confirmado}:`, erroInsercao);
                }
                
            } else if (produto) {
                // Calcular diferença
                const diferenca = item.quantidade_fisica - (produto.quantidade_estoque || 0);
                
                // Registrar ajuste no histórico
                const historicoAtual = produto.historico_ajustes || [];
                const novoHistorico = [
                    ...historicoAtual,
                    {
                        venda_id: vendaId,
                        tipo: 'conferencia',
                        quantidade_anterior: produto.quantidade_estoque || 0,
                        quantidade_nova: item.quantidade_fisica || 0,
                        diferenca: diferenca,
                        data: new Date().toISOString(),
                        usuario: currentUser?.name || 'Sistema',
                        comentarios: item.comentarios || ''
                    }
                ];
                
                // Atualizar estoque
                const { error: erroAtualizacao } = await supabaseClient
                    .from(CONFERENCIA_CONFIG.ESTOQUE_TABLE)
                    .update({
                        quantidade_estoque: item.quantidade_fisica || 0,
                        ultima_conferencia: new Date().toISOString(),
                        conferido_por: currentUser?.name || 'Sistema',
                        ultima_atualizacao: new Date().toISOString(),
                        historico_ajustes: novoHistorico,
                        // Marcar se precisa atenção
                        precisa_atencao: Math.abs(diferenca) > 5 // Se diferença maior que 5 unidades
                    })
                    .eq('sku', item.sku_confirmado);
                
                if (erroAtualizacao) {
                    console.error(`❌ Erro ao atualizar estoque ${item.sku_confirmado}:`, erroAtualizacao);
                } else {
                    console.log(`✅ Estoque ${item.sku_confirmado} atualizado: ${item.quantidade_fisica} unidades`);
                    
                    // Mostrar notificação se houver grande diferença
                    if (Math.abs(diferenca) > 5) {
                        showToast(`⚠️ Grande diferença no SKU ${item.sku_confirmado}: ${diferenca} unidades`, 'warning');
                    }
                }
            }
        }
        
    } catch (error) {
        console.error('❌ Erro ao atualizar estoque:', error);
    }
}

// ===== FUNÇÃO PARA ATUALIZAR STATUS DA VENDA =====
async function atualizarStatusVendaConferida(vendaId) {
    try {
        const { error } = await supabaseClient
            .from('vendas_ml')
            .update({
                conferido: true,
                conferido_por: currentUser?.name || 'Sistema',
                data_conferencia: new Date().toISOString(),
                status_sistema: 'conferido',
                atualizado_em: new Date().toISOString()
            })
            .eq('id', vendaId);
        
        if (error) throw error;
        
        console.log(`✅ Status da venda ${vendaId} atualizado para "conferido"`);
        
    } catch (error) {
        console.error('❌ Erro ao atualizar status da venda:', error);
    }
}

// ===== FUNÇÃO PARA OBTER IP DO USUÁRIO =====
async function obterIPUsuario() {
    try {
        const response = await fetch('https://api.ipify.org?format=json');
        const data = await response.json();
        return data.ip;
    } catch (error) {
        console.error('❌ Erro ao obter IP:', error);
        return 'IP_NAO_DISPONIVEL';
    }
}

// ===== FUNÇÃO PARA EXPORTAR CONFERÊNCIA =====
window.exportarConferencia = function(vendaId) {
    // Coletar dados do formulário
    const dados = {
        venda_id: vendaId,
        data_exportacao: new Date().toISOString(),
        exportado_por: currentUser?.name || 'Sistema',
        itens: []
    };
    
    const itens = document.querySelectorAll('.item-conferencia');
    itens.forEach((itemElement, index) => {
        dados.itens.push({
            sku: document.getElementById(`sku_confirmado_${index}`)?.value || '',
            quantidade_fisica: document.getElementById(`quantidade_fisica_${index}`)?.value || 0,
            conferido: document.getElementById(`conferido_${index}`)?.checked || false,
            comentarios: document.getElementById(`comentarios_${index}`)?.value || ''
        });
    });
    
    // Criar arquivo JSON
    const blob = new Blob([JSON.stringify(dados, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    // Criar link de download
    const a = document.createElement('a');
    a.href = url;
    a.download = `conferencia_venda_${vendaId}_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showToast('📄 Conferência exportada como JSON', 'success');
};

// ===== FUNÇÃO PARA VISUALIZAR HISTÓRICO DE CONFERÊNCIA =====
window.verHistoricoConferencia = async function(vendaId) {
    try {
        const { data: historico, error } = await supabaseClient
            .from(CONFERENCIA_CONFIG.HISTORICO_TABLE)
            .select('*')
            .eq('venda_id', vendaId)
            .order('data_registro', { ascending: false });
        
        if (error) throw error;
        
        if (historico && historico.length > 0) {
            abrirModalHistoricoConferencia(historico, vendaId);
        } else {
            showToast('Nenhum histórico encontrado para esta venda', 'info');
        }
        
    } catch (error) {
        console.error('❌ Erro ao buscar histórico:', error);
        showToast('Erro ao buscar histórico: ' + error.message, 'error');
    }
};

// ===== INICIALIZAR SISTEMA DE CONFERÊNCIA =====
function inicializarSistemaConferencia() {
    console.log('✅ Sistema de conferência de vendas inicializado');
    
    // Adicionar botão de conferência na tabela de vendas
    adicionarBotaoConferenciaTabela();
    
    // Criar tabelas se não existirem
    criarTabelasConferencia();
}

// ===== ADICIONAR BOTÃO NA TABELA DE VENDAS =====
function adicionarBotaoConferenciaTabela() {
    // Esta função será chamada quando a tabela de vendas for renderizada
    // O botão já foi adicionado na função renderizarVendasTabela
    console.log('🔧 Botão de conferência adicionado à tabela de vendas');
}

// ===== CRIAR TABELAS DE CONFERÊNCIA =====
async function criarTabelasConferencia() {
    try {
        console.log('🛠️ Verificando tabelas de conferência...');
        
        // Tabela de conferência
        const { error: errorConferencia } = await supabaseClient
            .from(CONFERENCIA_CONFIG.SUPABASE_TABLE)
            .select('id')
            .limit(1);
        
        if (errorConferencia && errorConferencia.code === '42P01') {
            console.log('📋 Tabela de conferência será criada automaticamente');
        }
        
        // Tabela de histórico
        const { error: errorHistorico } = await supabaseClient
            .from(CONFERENCIA_CONFIG.HISTORICO_TABLE)
            .select('id')
            .limit(1);
        
        if (errorHistorico && errorHistorico.code === '42P01') {
            console.log('📋 Tabela de histórico será criada automaticamente');
        }
        
    } catch (error) {
        console.error('❌ Erro ao verificar tabelas de conferência:', error);
    }
}

// ===== EXPORTAR FUNÇÕES =====
window.abrirConferenciaVenda = abrirConferenciaVenda;
window.salvarConferenciaVenda = salvarConferenciaVenda;
window.verHistoricoConferencia = verHistoricoConferencia;
window.exportarConferencia = exportarConferencia;
window.inicializarSistemaConferencia = inicializarSistemaConferencia;

// ===== INICIAR QUANDO PRONTO =====
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => {
            if (window.supabaseClient) {
                inicializarSistemaConferencia();
            }
        }, 3000);
    });
} else {
    setTimeout(() => {
        if (window.supabaseClient) {
            inicializarSistemaConferencia();
        }
    }, 3000);
}

console.log('✅ Sistema de conferência de vendas carregado!');