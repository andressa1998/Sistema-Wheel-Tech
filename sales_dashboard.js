// ============================================
// SALES DASHBOARD - VERSÃO FINAL CORRIGIDA
// ============================================

let vendasML = [];
let vendasPaginadas = [];
let paginaAtual = 1;
const itensPorPagina = 20;
let filtroAtual = 'todas';
let periodoAtual = 'todas';
let filtroConferencia = 'todos';
let filtroTipoEnvio = 'todos';
let fotosTemp = [];

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
// FUNÇÃO AUXILIAR PARA SETAR TEXTO COM SEGURANÇA
// ============================================
function setElementText(id, value) {
    const element = document.getElementById(id);
    if (element) {
        element.textContent = value;
    }
}

// ============================================
// FUNÇÃO PARA PEGAR NOME DO USUÁRIO LOGADO
// ============================================
function getNomeUsuario() {
    console.log('🔍 Verificando usuário logado...');
    
    if (window.currentUser && window.currentUser.name) {
        return window.currentUser.name;
    }
    
    try {
        const userData = localStorage.getItem('wheeltech_user');
        if (userData) {
            const user = JSON.parse(userData);
            if (user.name) return user.name;
        }
    } catch (e) {}
    
    const userNameElement = document.getElementById('userName');
    if (userNameElement && userNameElement.textContent && userNameElement.textContent !== 'Usuário') {
        return userNameElement.textContent;
    }
    
    return 'Sistema';
}

// ============================================
// FUNÇÃO PARA VERIFICAR SE É ADMIN
// ============================================
function isAdmin() {
    const roleElement = document.getElementById('userRole');
    if (roleElement && roleElement.textContent === 'Administrador') {
        return true;
    }
    
    if (window.currentUser && window.currentUser.role === 'Administrador') {
        return true;
    }
    
    return false;
}

// ============================================
// FUNÇÕES AUXILIARES PARA BADGES
// ============================================
function gerarBadgeEnvio(tipoEnvio) {
    if (!tipoEnvio || tipoEnvio === 'N/I' || tipoEnvio === 'Não especificado') {
        return '<span class="badge badge-secondary"><i class="fas fa-question"></i> N/I</span>';
    }
    
    const tipo = tipoEnvio.toUpperCase();
    
    if (tipo.includes('FULL')) {
        return '<span class="badge badge-full"><i class="fas fa-warehouse"></i> FULL</span>';
    } else if (tipo.includes('FLEX')) {
        return '<span class="badge badge-flex"><i class="fas fa-motorcycle"></i> FLEX</span>';
    } else if (tipo.includes('MERCADO')) {
        return '<span class="badge badge-mercado"><i class="fas fa-truck"></i> ME</span>';
    } else if (tipo.includes('CROSS')) {
        return '<span class="badge badge-info"><i class="fas fa-warehouse"></i> CROSS</span>';
    }
    
    return `<span class="badge badge-info">${tipoEnvio}</span>`;
}

function gerarBadgeEstoque(estoque) {
    if (estoque === null || estoque === undefined) {
        return '<span class="badge badge-secondary">N/I</span>';
    }
    
    if (estoque <= 5) {
        return `<span class="badge badge-danger">${estoque} un</span>`;
    } else if (estoque <= 20) {
        return `<span class="badge badge-warning">${estoque} un</span>`;
    } else {
        return `<span class="badge badge-success">${estoque} un</span>`;
    }
}

function gerarBadgeConferencia(status, divergente) {
    if (divergente) {
        return '<span class="badge badge-fraude"><i class="fas fa-exclamation-triangle"></i> DIVERGENTE</span>';
    }
    
    switch(status) {
        case 'pendente':
        case null:
            return '<span class="badge badge-secondary"><i class="fas fa-hourglass-half"></i> Pendente</span>';
        case 'conferido_estoque':
            return '<span class="badge badge-info"><i class="fas fa-box"></i> Estoque OK</span>';
        case 'conferido_anuncio':
            return '<span class="badge badge-success"><i class="fas fa-check-double"></i> Finalizado</span>';
        default:
            return '<span class="badge badge-secondary"><i class="fas fa-hourglass-half"></i> Pendente</span>';
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
        atualizarContadoresConferencia();
        aplicarFiltroAtual();
        
    } catch (error) {
        console.error('❌ Erro no carregamento:', error);
        mostrarToast('Erro ao carregar vendas do banco', 'error');
    }
}

// ============================================
// SINCRONIZAR VENDAS DO ML
// ============================================
// ============================================
// SINCRONIZAR VENDAS DO ML (VERSÃO CORRIGIDA)
// ============================================
async function sincronizarVendasML() {
    try {
        const btn = document.getElementById('btnSincronizar');
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sincronizando...';
        btn.disabled = true;
        
        console.log('🔄 Iniciando sincronização de vendas ML...');
        mostrarToast('Sincronizando vendas do Mercado Livre...', 'info');
        
        const resultado = await window.buscarVendasML(50);
        
        // 🔥 CORREÇÃO: resultado é o array diretamente
        if (resultado && resultado.length > 0) {
            console.log(`✅ ${resultado.length} vendas recebidas do ML`);
            
            // Mostrar exemplo da primeira venda
            console.log('📦 Exemplo da primeira venda:', {
                id: resultado[0].id_venda_ml,
                titulo: resultado[0].titulo,
                sku: resultado[0].sku
            });
            
            const vendasSalvas = await processarESalvarVendas(resultado);
            await carregarVendasDoBanco();
            
            mostrarToast(`${vendasSalvas} vendas sincronizadas com sucesso!`, 'success');
            
        } else {
            console.warn('⚠️ Nenhuma venda encontrada');
            mostrarToast('Nenhuma venda encontrada', 'info');
        }
    } catch (error) {
        console.error('❌ Erro na sincronização:', error);
        mostrarToast(`Erro na sincronização: ${error.message}`, 'error');
    } finally {
        const btn = document.getElementById('btnSincronizar');
        btn.innerHTML = '<i class="fas fa-sync-alt"></i> Sincronizar Agora';
        btn.disabled = false;
    }
}

// ============================================
// PROCESSAR E SALVAR VENDAS (VERSÃO CORRIGIDA - SEM KIT)
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
                    mlb_id: venda.mlb_id || null,
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
                    
                    status_conferencia: venda.status_conferencia || 'pendente',
                    divergente: venda.divergente || false,
                    conferido_por_estoque: venda.conferido_por_estoque || null,
                    conferido_por_anuncio: venda.conferido_por_anuncio || null,
                    data_conferencia_estoque: venda.data_conferencia_estoque || null,
                    data_conferencia_anuncio: venda.data_conferencia_anuncio || null,
                    observacao: venda.observacao || null,
                    observacoes_gerais: venda.observacoes_gerais || '',
                    
                    // REMOVI fotos_anuncio, qtd_fotos_anuncio, eh_kit, skus_kit
                    fotos: venda.fotos || [],
                    qtd_fotos: venda.qtd_fotos || 0,
                    
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
// FUNÇÃO PARA CONFIGURAR KIT (CHAMADA NO BOTÃO 1)
// ============================================
async function configurarKit(idVenda) {
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
        
        // Verificar se já tem SKUs configurados
        const skusExistentes = venda.skus_kit || [];
        const temSkus = skusExistentes.length > 0;
        
        let mensagem = '';
        let skusInput = '';
        
        if (temSkus) {
            // Mostrar SKUs existentes
            mensagem = `📦 CONFIGURAR KIT\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
            mensagem += `SKU Principal: ${venda.sku}\n`;
            mensagem += `SKUs do Kit (${skusExistentes.length}):\n`;
            skusExistentes.forEach((item, idx) => {
                mensagem += `  ${idx+1}. ${item.sku} - Estoque: ${item.estoque}\n`;
            });
            mensagem += `\nUsuário: ${nomeUsuario}\n`;
            mensagem += `\nDeseja EDITAR os SKUs do kit? (OK) ou MANTER como está? (CANCELAR)`;
            
            if (!confirm(mensagem)) {
                // Se cancelar, vai para conferência normal
                await conferirEstoqueNormal(idVenda, venda, nomeUsuario);
                return;
            }
        }
        
        // Criar modal para configurar SKUs
        const modalHtml = `
            <div id="modalConfigurarKit" class="modal" style="display: flex; z-index: 10000;">
                <div class="modal-content" style="max-width: 500px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                        <h3><i class="fas fa-cubes"></i> Configurar Kit</h3>
                        <button onclick="fecharModalKit()" style="background: none; border: none; font-size: 24px;">&times;</button>
                    </div>
                    
                    <p><strong>Venda:</strong> ${venda.id_venda_ml}</p>
                    <p><strong>SKU Principal:</strong> ${venda.sku}</p>
                    <p><strong>Quantidade vendida:</strong> ${venda.quantidade} un</p>
                    
                    <div id="skusKitContainer">
                        ${skusExistentes.map((item, index) => `
                            <div class="kit-sku-item" style="display: flex; gap: 10px; margin-bottom: 10px;">
                                <input type="text" 
                                       class="kit-sku-input" 
                                       data-index="${index}"
                                       value="${item.sku}" 
                                       placeholder="SKU" 
                                       style="flex: 2; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
                                <input type="number" 
                                       class="kit-estoque-input" 
                                       data-index="${index}"
                                       value="${item.estoque}" 
                                       placeholder="Estoque" 
                                       min="0"
                                       style="flex: 1; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
                                <button onclick="removerSkuKit(${index})" 
                                        style="background: #dc3545; color: white; border: none; width: 40px; border-radius: 4px; cursor: pointer;">
                                    <i class="fas fa-times"></i>
                                </button>
                            </div>
                        `).join('')}
                        
                        ${!temSkus ? `
                            <div class="kit-sku-item" style="display: flex; gap: 10px; margin-bottom: 10px;">
                                <input type="text" 
                                       class="kit-sku-input" 
                                       data-index="0"
                                       value="" 
                                       placeholder="SKU" 
                                       style="flex: 2; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
                                <input type="number" 
                                       class="kit-estoque-input" 
                                       data-index="0"
                                       value="0" 
                                       placeholder="Estoque" 
                                       min="0"
                                       style="flex: 1; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
                                <button onclick="removerSkuKit(0)" 
                                        style="background: #dc3545; color: white; border: none; width: 40px; border-radius: 4px; cursor: pointer;">
                                    <i class="fas fa-times"></i>
                                </button>
                            </div>
                        ` : ''}
                    </div>
                    
                    <div style="margin: 15px 0;">
                        <button onclick="adicionarSkuKit()" class="btn btn-primary btn-sm">
                            <i class="fas fa-plus"></i> Adicionar SKU
                        </button>
                    </div>
                    
                    <div style="margin: 15px 0;">
                        <label><strong>Estoque Físico do Kit (total):</strong></label>
                        <input type="number" id="estoqueKitTotal" class="form-control" 
                               value="${venda.estoque_fisico || 0}" min="0" style="width: 100%;">
                        <small style="color: #666;">Este será o estoque total do kit</small>
                    </div>
                    
                    <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px;">
                        <button onclick="fecharModalKit()" class="btn btn-secondary">Cancelar</button>
                        <button onclick="salvarConfiguracaoKit('${idVenda}', '${nomeUsuario}')" class="btn btn-success">
                            <i class="fas fa-save"></i> Salvar e Conferir Estoque
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        const modalAnterior = document.getElementById('modalConfigurarKit');
        if (modalAnterior) modalAnterior.remove();
        
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        
    } catch (error) {
        console.error('Erro ao configurar kit:', error);
        mostrarToast('Erro ao configurar kit', 'error');
    }
}

// ============================================
// FUNÇÕES AUXILIARES PARA MODAL DE KIT
// ============================================
function adicionarSkuKit() {
    const container = document.getElementById('skusKitContainer');
    const items = document.querySelectorAll('.kit-sku-item');
    const novoIndex = items.length;
    
    const div = document.createElement('div');
    div.className = 'kit-sku-item';
    div.style.cssText = 'display: flex; gap: 10px; margin-bottom: 10px;';
    div.innerHTML = `
        <input type="text" 
               class="kit-sku-input" 
               data-index="${novoIndex}"
               value="" 
               placeholder="SKU" 
               style="flex: 2; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
        <input type="number" 
               class="kit-estoque-input" 
               data-index="${novoIndex}"
               value="0" 
               placeholder="Estoque" 
               min="0"
               style="flex: 1; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
        <button onclick="removerSkuKit(${novoIndex})" 
                style="background: #dc3545; color: white; border: none; width: 40px; border-radius: 4px; cursor: pointer;">
            <i class="fas fa-times"></i>
        </button>
    `;
    
    container.appendChild(div);
}

function removerSkuKit(index) {
    const items = document.querySelectorAll('.kit-sku-item');
    if (items.length <= 1) {
        mostrarToast('O kit deve ter pelo menos 1 SKU', 'warning');
        return;
    }
    
    const item = document.querySelector(`.kit-sku-item:nth-child(${index + 1})`);
    if (item) {
        item.remove();
        
        // Reindexar os inputs restantes
        document.querySelectorAll('.kit-sku-item').forEach((item, i) => {
            item.querySelector('.kit-sku-input').dataset.index = i;
            item.querySelector('.kit-estoque-input').dataset.index = i;
        });
    }
}

function fecharModalKit() {
    document.getElementById('modalConfigurarKit')?.remove();
}

async function salvarConfiguracaoKit(idVenda, nomeUsuario) {
    try {
        const skusInputs = document.querySelectorAll('.kit-sku-input');
        const estoqueInputs = document.querySelectorAll('.kit-estoque-input');
        const estoqueTotal = document.getElementById('estoqueKitTotal').value;
        
        const skusKit = [];
        for (let i = 0; i < skusInputs.length; i++) {
            const sku = skusInputs[i].value.trim();
            const estoque = parseInt(estoqueInputs[i].value);
            
            if (sku) {
                skusKit.push({
                    sku: sku,
                    estoque: isNaN(estoque) ? 0 : estoque
                });
            }
        }
        
        if (skusKit.length === 0) {
            mostrarToast('Adicione pelo menos um SKU ao kit', 'warning');
            return;
        }
        
        const estoqueTotalNum = parseInt(estoqueTotal);
        if (isNaN(estoqueTotalNum) || estoqueTotalNum < 0) {
            mostrarToast('Estoque total inválido', 'error');
            return;
        }
        
        // Salvar configuração do kit e já marcar como conferido_estoque
        const { error } = await supabaseClient
            .from('vendas_ml')
            .update({
                eh_kit: true,
                skus_kit: skusKit,
                estoque_fisico: estoqueTotalNum,
                status_conferencia: 'conferido_estoque',
                conferido_por_estoque: nomeUsuario,
                data_conferencia_estoque: new Date().toISOString()
            })
            .eq('id_venda_ml', idVenda);
        
        if (error) throw error;
        
        mostrarToast(`✅ Kit configurado e estoque conferido por ${nomeUsuario}!`, 'success');
        fecharModalKit();
        await carregarVendasDoBanco();
        
    } catch (error) {
        console.error('Erro ao salvar kit:', error);
        mostrarToast('Erro ao salvar configuração do kit', 'error');
    }
}

// ============================================
// CONFERÊNCIA NORMAL (QUANDO NÃO É KIT)
// ============================================
// ============================================
// FUNÇÃO DE CONFERÊNCIA DE ESTOQUE (COM PERGUNTA DO KIT)
// ============================================
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
        
        // ===== PRIMEIRO: PERGUNTAR SE É KIT =====
        const ehKit = confirm(
            `📦 CONFIGURAÇÃO DE ESTOQUE\n\n` +
            `SKU Principal: ${venda.sku}\n` +
            `Produto: ${venda.titulo}\n` +
            `Quantidade vendida: ${venda.quantidade} un\n\n` +
            `Esta venda é um KIT (contém múltiplos SKUs)?\n\n` +
            `✅ OK = Sim, configurar kit (você poderá adicionar vários SKUs)\n` +
            `❌ Cancelar = Não, item normal (apenas um SKU)`
        );
        
        if (ehKit) {
            // ===== É KIT - ABRIR MODAL DE CONFIGURAÇÃO =====
            await abrirModalKit(idVenda, venda, nomeUsuario);
        } else {
            // ===== NÃO É KIT - CONFERÊNCIA NORMAL =====
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
                    eh_kit: false,
                    status_conferencia: 'conferido_estoque',
                    conferido_por_estoque: nomeUsuario,
                    data_conferencia_estoque: new Date().toISOString()
                })
                .eq('id_venda_ml', idVenda);
            
            if (updateError) throw updateError;
            
            mostrarToast(`✅ Estoque conferido por ${nomeUsuario}!`, 'success');
            await carregarVendasDoBanco();
        }
        
    } catch (error) {
        console.error('❌ Erro na conferência:', error);
        mostrarToast('Erro ao conferir estoque', 'error');
    }
}

// ============================================
// ABRIR MODAL PARA CONFIGURAR KIT
// ============================================
async function abrirModalKit(idVenda, venda, nomeUsuario) {
    // Verificar se já tem SKUs configurados
    const skusExistentes = venda.skus_kit || [];
    
    // Criar o modal HTML
    const modalHtml = `
        <div id="modalConfigurarKit" class="modal" style="display: flex; z-index: 10000;">
            <div class="modal-content" style="max-width: 600px; max-height: 80vh; overflow-y: auto;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; padding-bottom: 10px; border-bottom: 2px solid #8A2BE2;">
                    <h3 style="margin: 0;">
                        <i class="fas fa-cubes" style="color: #8A2BE2;"></i> 
                        Configurar Kit
                    </h3>
                    <button onclick="fecharModalKit()" style="background: none; border: none; font-size: 28px; cursor: pointer; color: #666;">&times;</button>
                </div>
                
                <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
                    <p><strong>Venda:</strong> ${venda.id_venda_ml}</p>
                    <p><strong>SKU Principal:</strong> <span class="badge badge-info">${venda.sku}</span></p>
                    <p><strong>Produto:</strong> ${venda.titulo}</p>
                    <p><strong>Quantidade vendida:</strong> ${venda.quantidade} un</p>
                    <p><strong>Conferente:</strong> ${nomeUsuario}</p>
                </div>
                
                <h4 style="margin-bottom: 15px;">
                    <i class="fas fa-list"></i> SKUs que compõem o kit
                </h4>
                <p style="font-size: 12px; color: #666; margin-bottom: 15px;">
                    Adicione todos os SKUs que fazem parte deste kit e seus respectivos estoques.
                </p>
                
                <div id="skusKitContainer" style="margin-bottom: 20px;">
                    ${skusExistentes.length > 0 ? 
                        skusExistentes.map((item, index) => `
                            <div class="kit-sku-item" style="display: flex; gap: 10px; margin-bottom: 10px; align-items: center;">
                                <div style="flex: 2;">
                                    <input type="text" 
                                           class="kit-sku-input" 
                                           data-index="${index}"
                                           value="${item.sku}" 
                                           placeholder="SKU" 
                                           style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px;">
                                </div>
                                <div style="flex: 1;">
                                    <input type="number" 
                                           class="kit-estoque-input" 
                                           data-index="${index}"
                                           value="${item.estoque}" 
                                           placeholder="Estoque" 
                                           min="0"
                                           style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px;">
                                </div>
                                <button onclick="removerSkuKit(${index})" 
                                        style="background: #dc3545; color: white; border: none; width: 40px; height: 42px; border-radius: 4px; cursor: pointer; display: flex; align-items: center; justify-content: center;">
                                    <i class="fas fa-times"></i>
                                </button>
                            </div>
                        `).join('')
                    :
                        `
                        <div class="kit-sku-item" style="display: flex; gap: 10px; margin-bottom: 10px; align-items: center;">
                            <div style="flex: 2;">
                                <input type="text" 
                                       class="kit-sku-input" 
                                       data-index="0"
                                       value="${venda.sku}" 
                                       placeholder="SKU" 
                                       style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px;">
                            </div>
                            <div style="flex: 1;">
                                <input type="number" 
                                       class="kit-estoque-input" 
                                       data-index="0"
                                       value="0" 
                                       placeholder="Estoque" 
                                       min="0"
                                       style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px;">
                            </div>
                            <button onclick="removerSkuKit(0)" 
                                    style="background: #dc3545; color: white; border: none; width: 40px; height: 42px; border-radius: 4px; cursor: pointer; display: flex; align-items: center; justify-content: center;">
                                <i class="fas fa-times"></i>
                            </button>
                        </div>
                    `}
                </div>
                
                <div style="margin: 15px 0;">
                    <button onclick="adicionarSkuKit()" class="btn btn-primary" style="padding: 8px 15px;">
                        <i class="fas fa-plus"></i> Adicionar outro SKU
                    </button>
                </div>
                
                <div style="margin: 20px 0; padding: 15px; background: #e8f5e9; border-radius: 8px;">
                    <label style="font-weight: bold; display: block; margin-bottom: 5px;">
                        <i class="fas fa-boxes"></i> Estoque Total do Kit:
                    </label>
                    <input type="number" id="estoqueKitTotal" class="form-control" 
                           value="${venda.estoque_fisico || 0}" min="0" style="width: 100%; padding: 10px;">
                    <small style="color: #666; display: block; margin-top: 5px;">
                        Este é o estoque físico total do kit (soma de todos os SKUs)
                    </small>
                </div>
                
                <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px; border-top: 1px solid #ddd; padding-top: 20px;">
                    <button onclick="fecharModalKit()" class="btn btn-secondary">Cancelar</button>
                    <button onclick="salvarConfiguracaoKit('${idVenda}', '${nomeUsuario}')" class="btn btn-success">
                        <i class="fas fa-save"></i> Salvar Kit e Conferir Estoque
                    </button>
                </div>
            </div>
        </div>
    `;
    
    // Remover modal anterior se existir
    const modalAnterior = document.getElementById('modalConfigurarKit');
    if (modalAnterior) modalAnterior.remove();
    
    // Adicionar modal ao body
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

// ============================================
// FUNÇÕES AUXILIARES DO MODAL DE KIT
// ============================================
function adicionarSkuKit() {
    const container = document.getElementById('skusKitContainer');
    const items = document.querySelectorAll('.kit-sku-item');
    const novoIndex = items.length;
    
    const div = document.createElement('div');
    div.className = 'kit-sku-item';
    div.style.cssText = 'display: flex; gap: 10px; margin-bottom: 10px; align-items: center;';
    div.innerHTML = `
        <div style="flex: 2;">
            <input type="text" 
                   class="kit-sku-input" 
                   data-index="${novoIndex}"
                   value="" 
                   placeholder="SKU" 
                   style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px;">
        </div>
        <div style="flex: 1;">
            <input type="number" 
                   class="kit-estoque-input" 
                   data-index="${novoIndex}"
                   value="0" 
                   placeholder="Estoque" 
                   min="0"
                   style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px;">
        </div>
        <button onclick="removerSkuKit(${novoIndex})" 
                style="background: #dc3545; color: white; border: none; width: 40px; height: 42px; border-radius: 4px; cursor: pointer; display: flex; align-items: center; justify-content: center;">
            <i class="fas fa-times"></i>
        </button>
    `;
    
    container.appendChild(div);
}

function removerSkuKit(index) {
    const items = document.querySelectorAll('.kit-sku-item');
    if (items.length <= 1) {
        mostrarToast('O kit deve ter pelo menos 1 SKU', 'warning');
        return;
    }
    
    // Encontrar o item pelo índice
    const item = document.querySelector(`.kit-sku-item:nth-child(${index + 1})`);
    if (item) {
        item.remove();
        
        // Reindexar os inputs restantes
        document.querySelectorAll('.kit-sku-item').forEach((item, i) => {
            item.querySelector('.kit-sku-input').dataset.index = i;
            item.querySelector('.kit-estoque-input').dataset.index = i;
            
            // Atualizar o onclick do botão de remover
            const btn = item.querySelector('button');
            btn.setAttribute('onclick', `removerSkuKit(${i})`);
        });
    }
}

function fecharModalKit() {
    document.getElementById('modalConfigurarKit')?.remove();
}

async function salvarConfiguracaoKit(idVenda, nomeUsuario) {
    try {
        // Coletar todos os SKUs e estoques
        const skuInputs = document.querySelectorAll('.kit-sku-input');
        const estoqueInputs = document.querySelectorAll('.kit-estoque-input');
        const estoqueTotal = document.getElementById('estoqueKitTotal').value;
        
        const skusKit = [];
        for (let i = 0; i < skuInputs.length; i++) {
            const sku = skuInputs[i].value.trim();
            const estoque = parseInt(estoqueInputs[i].value);
            
            if (sku) { // Só adiciona se tiver SKU preenchido
                skusKit.push({
                    sku: sku,
                    estoque: isNaN(estoque) ? 0 : estoque
                });
            }
        }
        
        if (skusKit.length === 0) {
            mostrarToast('Adicione pelo menos um SKU ao kit', 'warning');
            return;
        }
        
        const estoqueTotalNum = parseInt(estoqueTotal);
        if (isNaN(estoqueTotalNum) || estoqueTotalNum < 0) {
            mostrarToast('Estoque total inválido', 'error');
            return;
        }
        
        // Salvar configuração do kit
        const { error } = await supabaseClient
            .from('vendas_ml')
            .update({
                eh_kit: true,
                skus_kit: skusKit,
                estoque_fisico: estoqueTotalNum,
                status_conferencia: 'conferido_estoque',
                conferido_por_estoque: nomeUsuario,
                data_conferencia_estoque: new Date().toISOString()
            })
            .eq('id_venda_ml', idVenda);
        
        if (error) throw error;
        
        mostrarToast(`✅ Kit configurado e estoque conferido por ${nomeUsuario}!`, 'success');
        fecharModalKit();
        await carregarVendasDoBanco();
        
    } catch (error) {
        console.error('Erro ao salvar kit:', error);
        mostrarToast('Erro ao salvar configuração do kit', 'error');
    }
}

// ============================================
// ATUALIZAR TABELA DE VENDAS - VERSÃO CORRIGIDA E ORGANIZADA
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
            statusBadge = '<span class="badge badge-nova">NOVA</span>';
        } else if (venda.status_sistema === 'verificada') {
            statusBadge = '<span class="badge badge-verificada">VERIFICADA</span>';
        } else if (venda.status_sistema === 'fraude') {
            statusBadge = '<span class="badge badge-fraude">FRAUDE</span>';
        }
        
        // ===== SKU e MLB =====
        const sku = venda.sku || venda.item_sku || venda.codigo || 'SEM_SKU';
        const mlbId = venda.mlb_id || venda.item_id || null;
        
        // ===== VERIFICAR SE É KIT (pelo campo eh_kit) =====
        const ehKit = venda.eh_kit || false;
        const skusKit = venda.skus_kit || [];
        
        // ===== CORREÇÃO DO TIPO DE ENVIO (FLEX) =====
        let tipoEnvioOriginal = venda.tipo_envio || venda.meio_envio || 'N/I';
        let tipoEnvioCorrigido = tipoEnvioOriginal;
        
        // Se veio como 'MERCADO ENVIOS' mas logistic_type indica FLEX
        if (tipoEnvioOriginal.toLowerCase().includes('drop_off') || 
            tipoEnvioOriginal.toLowerCase().includes('self_service') ||
            tipoEnvioOriginal.toLowerCase().includes('xd_drop') ||
            tipoEnvioOriginal === 'FLEX') {
            tipoEnvioCorrigido = 'FLEX';
        }
        
        // Também verificar se no título tem indicação de FLEX
        if (tipoEnvioCorrigido === 'MERCADO ENVIOS' || tipoEnvioCorrigido === 'ME') {
            const tituloLower = (venda.titulo || '').toLowerCase();
            if (tituloLower.includes('flex') || 
                tituloLower.includes('entrega rápida') ||
                tituloLower.includes('self service')) {
                tipoEnvioCorrigido = 'FLEX';
            }
        }
        
        // ===== TIPO DE ENVIO - APENAS EXIBIÇÃO =====
        let tipoEnvio = venda.tipo_envio || venda.meio_envio || 'N/I';
        let envioBadge = '';

        // CORREÇÃO VISUAL: Se o tipo contém palavras-chave de FLEX, mostrar como FLEX
        if (tipoEnvio.includes('FULL') || tipoEnvio.includes('fulfillment')) {
            envioBadge = '<span class="badge badge-full"><i class="fas fa-warehouse"></i> FULL</span>';
        } 
        else if (tipoEnvio.includes('FLEX') || 
                tipoEnvio.includes('drop_off') || 
                tipoEnvio.includes('self_service') || 
                tipoEnvio.includes('xd_drop')) {
            envioBadge = '<span class="badge badge-flex"><i class="fas fa-motorcycle"></i> FLEX</span>';
        } 
        else if (tipoEnvio.includes('MERCADO') || tipoEnvio.includes('cross_docking')) {
            envioBadge = '<span class="badge badge-mercado"><i class="fas fa-truck"></i> ME</span>';
        } 
        else if (tipoEnvio !== 'N/I' && tipoEnvio !== 'Não especificado') {
            envioBadge = `<span class="badge badge-info">${tipoEnvio}</span>`;
        } 
        else {
            envioBadge = '<span class="badge badge-secondary"><i class="fas fa-question"></i> N/I</span>';
        }
        
        // ===== ESTOQUE DO ANÚNCIO =====
        let estoqueBadge = '';
        const estoqueAnuncio = venda.estoque_anuncio !== undefined && venda.estoque_anuncio !== null 
            ? venda.estoque_anuncio 
            : null;
        
        if (estoqueAnuncio !== null) {
            if (estoqueAnuncio <= 5) {
                estoqueBadge = `<span class="badge badge-danger">${estoqueAnuncio} un</span>`;
            } else if (estoqueAnuncio <= 20) {
                estoqueBadge = `<span class="badge badge-warning">${estoqueAnuncio} un</span>`;
            } else {
                estoqueBadge = `<span class="badge badge-success">${estoqueAnuncio} un</span>`;
            }
        } else {
            estoqueBadge = '<span class="badge badge-secondary">N/I</span>';
        }
        
        // ===== PERMISSÕES =====
        const podeEditarEstoque = venda.status_conferencia === 'pendente' || !venda.status_conferencia;
        const podeConferirEstoque = venda.status_conferencia === 'pendente' || !venda.status_conferencia;
        const podeConferirAnuncio = venda.status_conferencia === 'conferido_estoque';
        const podeReabrir = venda.status_conferencia === 'conferido_anuncio' && isAdmin();
        
        // ===== BADGE DE CONFERÊNCIA =====
        let badgeConferencia = '';
        if (venda.divergente) {
            badgeConferencia = '<span class="badge badge-fraude"><i class="fas fa-exclamation-triangle"></i> DIVERGENTE</span>';
        } else if (venda.status_conferencia === 'pendente' || !venda.status_conferencia) {
            badgeConferencia = '<span class="badge badge-secondary"><i class="fas fa-hourglass-half"></i> Pendente</span>';
        } else if (venda.status_conferencia === 'conferido_estoque') {
            badgeConferencia = '<span class="badge badge-info"><i class="fas fa-box"></i> Estoque OK</span>';
        } else if (venda.status_conferencia === 'conferido_anuncio') {
            badgeConferencia = '<span class="badge badge-success"><i class="fas fa-check-double"></i> Finalizado</span>';
        }
        // ===== ESTOQUE FÍSICO (COM SUPORTE A KIT) =====
let estoqueFisicoDisplay = '';
if (venda.eh_kit && venda.skus_kit && venda.skus_kit.length > 0) {
    // Criar tooltip com os SKUs do kit
    const tooltipSkus = venda.skus_kit.map(item => `${item.sku}: ${item.estoque} un`).join('\n');
    
    estoqueFisicoDisplay = `
        <div style="margin-bottom: 5px;">
            <span class="badge badge-warning" style="background: #ffc107; color: #212529;">
                <i class="fas fa-cubes"></i> KIT
            </span>
            <span style="font-size: 11px; color: #666; margin-left: 5px; cursor: help;" 
                  title="${tooltipSkus}">
                ${venda.skus_kit.length} SKU(s)
            </span>
        </div>
        <div>
            <span style="font-weight: bold; color: #28a745;">Total: ${venda.estoque_fisico || 0} un</span>
        </div>
    `;
} else {
    estoqueFisicoDisplay = podeEditarEstoque
        ? `<input type="number" 
                class="estoque-fisico-input" 
                value="${venda.estoque_fisico || 0}" 
                min="0"
                data-id="${venda.id_venda_ml || venda.id}"
                onchange="window.atualizarEstoqueFisico('${venda.id_venda_ml || venda.id}', this.value)"
                style="width: 70px; padding: 4px; border-radius: 4px; border: 1px solid #ddd;">`
        : `<span style="font-weight: bold; color: ${venda.estoque_fisico > 0 ? '#28a745' : '#6c757d'};">${venda.estoque_fisico || 0} un</span>`;
}
        
        // ===== BOTÕES DE AÇÃO =====
        let acoesHtml = '<div style="display: flex; gap: 4px; flex-wrap: wrap;">';
        
        // Botão ver detalhes
        acoesHtml += `<button onclick="verDetalhesVenda('${venda.id_venda_ml || venda.id}')" class="btn btn-sm btn-info" title="Ver detalhes">
                        <i class="fas fa-eye"></i>
                      </button>`;
        
        // Botão de fotos (se houver)
        if (venda.fotos && venda.fotos.length > 0) {
            acoesHtml += `<button onclick="verFotosVenda('${venda.id_venda_ml || venda.id}')" class="btn btn-sm btn-primary" title="Ver ${venda.fotos.length} foto(s)">
                            <i class="fas fa-images"></i> ${venda.fotos.length}
                          </button>`;
        } else {
            acoesHtml += `<button onclick="abrirUploadFotos('${venda.id_venda_ml || venda.id}')" class="btn btn-sm btn-outline-primary" title="Adicionar fotos">
                            <i class="fas fa-camera"></i>
                          </button>`;
        }
        
        // Botões de conferência - se for kit, mostrar botão específico
        if (podeConferirEstoque) {
            if (ehKit) {
                acoesHtml += `<button onclick="configurarKit('${venda.id_venda_ml || venda.id}')" class="btn btn-sm btn-warning" title="Configurar Kit">
                                <i class="fas fa-cubes"></i> Kit
                              </button>`;
            } else {
                acoesHtml += `<button onclick="conferirEstoque('${venda.id_venda_ml || venda.id}')" class="btn btn-sm btn-primary" title="1ª Conferência: Estoque Físico">
                                <i class="fas fa-boxes"></i> 1
                              </button>`;
            }
        }
        
        if (podeConferirAnuncio) {
            acoesHtml += `<button onclick="conferirAnuncio('${venda.id_venda_ml || venda.id}')" class="btn btn-sm btn-success" title="2ª Conferência: Comparar Anúncio">
                            <i class="fas fa-check-double"></i> 2
                          </button>`;
        }
        
        if (podeReabrir) {
            acoesHtml += `<button onclick="reabrirConferencia('${venda.id_venda_ml || venda.id}')" class="btn btn-sm btn-warning" title="Reabrir Conferência">
                            <i class="fas fa-unlock"></i> ↺
                          </button>`;
        }
        
        // Botão mover para pendentes (admin)
        if (isAdmin() && venda.status_conferencia && venda.status_conferencia !== 'pendente') {
            acoesHtml += `<button onclick="moverParaPendentes('${venda.id_venda_ml || venda.id}')" class="btn btn-sm btn-secondary" title="Mover para Pendentes">
                            <i class="fas fa-undo-alt"></i> Mover
                          </button>`;
        }
        
        // Botões verificar/fraude
        if (venda.status_sistema === 'nova') {
            acoesHtml += `<button onclick="verificarVenda('${venda.id_venda_ml || venda.id}')" class="btn btn-sm btn-success" title="Verificar">
                            <i class="fas fa-check"></i>
                          </button>
                          <button onclick="marcarComoFraude('${venda.id_venda_ml || venda.id}')" class="btn btn-sm btn-danger" title="Fraude">
                            <i class="fas fa-ban"></i>
                          </button>`;
        }
        
        acoesHtml += '</div>';
        acoesHtml += `<div style="margin-top: 6px;">${badgeConferencia}</div>`;
        
        // ===== FOTOS DO ANÚNCIO (BUSCADAS AUTOMATICAMENTE) =====
        let fotoThumbnail = '';
        if (venda.fotos_anuncio && venda.fotos_anuncio.length > 0) {
            const primeiraFoto = venda.fotos_anuncio[0];
            fotoThumbnail = `
                <div style="display: flex; align-items: center; gap: 8px; margin-top: 8px; padding-top: 8px; border-top: 1px dashed #dee2e6;">
                    <img src="${primeiraFoto.thumbnail || primeiraFoto.url}" 
                         style="width: 50px; height: 50px; object-fit: cover; border-radius: 4px; cursor: pointer; border: 1px solid #dee2e6;"
                         onclick="verFotosAnuncio('${venda.id_venda_ml || venda.id}')"
                         title="Clique para ver as fotos do anúncio (${venda.fotos_anuncio.length})">
                    <div>
                        <span style="font-size: 11px; color: #666; display: block;">
                            <i class="fas fa-camera"></i> ${venda.fotos_anuncio.length} foto(s)
                        </span>
                        <span style="font-size: 10px; color: #999;">do anúncio</span>
                    </div>
                </div>
            `;
        } else if (venda.fotos && venda.fotos.length > 0) {
            // Fallback para fotos manuais (se existirem)
            fotoThumbnail = `
                <div style="display: flex; align-items: center; gap: 8px; margin-top: 8px; padding-top: 8px; border-top: 1px dashed #dee2e6;">
                    <img src="${venda.fotos[0].data}" 
                         style="width: 50px; height: 50px; object-fit: cover; border-radius: 4px; cursor: pointer; border: 1px solid #dee2e6;"
                         onclick="verFotosVenda('${venda.id_venda_ml || venda.id}')"
                         title="Clique para ver as fotos (${venda.fotos.length})">
                    <div>
                        <span style="font-size: 11px; color: #666; display: block;">
                            <i class="fas fa-camera"></i> ${venda.fotos.length} foto(s)
                        </span>
                        <span style="font-size: 10px; color: #999;">manual</span>
                    </div>
                </div>
            `;
        }
        
        // ===== SKU DISPLAY ORGANIZADO =====
        let skuDisplay = '';
        if (ehKit) {
            skuDisplay = `
                <div style="display: flex; align-items: center; gap: 4px; margin-bottom: 4px;">
                    <span class="badge badge-warning" style="background: #ffc107; color: #212529;">
                        <i class="fas fa-layer-group"></i> KIT
                    </span>
                    <span class="badge badge-info">${sku}</span>
                </div>
            `;
        } else {
            skuDisplay = `<span class="badge badge-info" style="display: inline-block; margin-bottom: 4px;">${sku}</span>`;
        }
        
        // ===== MLB DISPLAY =====
        let mlbDisplay = '';
        if (mlbId) {
            mlbDisplay = `
                <div style="display: flex; align-items: center; gap: 4px; margin-bottom: 4px;">
                    <span style="font-size: 10px; color: #666;">
                        <i class="fas fa-tag"></i> 
                        <span style="font-family: monospace;">${mlbId.substring(0, 8)}...</span>
                    </span>
                    <button onclick="copiarMLB('${mlbId}')" style="border: none; background: none; color: #007bff; cursor: pointer;" title="Copiar MLB">
                        <i class="fas fa-copy"></i>
                    </button>
                </div>
            `;
        }
        
        // ===== MONTAR LINHA DA TABELA (ORGANIZADA) =====
        row.innerHTML = `
            <td style="min-width: 150px;">
                <div><strong>${(venda.id_venda_ml || '').substring(0, 15)}...</strong></div>
                <div style="font-size: 12px; color: #495057;">${(venda.titulo || '').substring(0, 30)}${(venda.titulo || '').length > 30 ? '...' : ''}</div>
                ${fotoThumbnail}
            </td>
            <td style="white-space: nowrap;">
                <div>${dataFormatada}</div>
                <div style="font-size: 11px; color: #666;">${horaFormatada}</div>
            </td>
            <td class="valor-cell" style="white-space: nowrap;">
                <div><strong>R$ ${(venda.valor_total || 0).toFixed(2)}</strong></div>
                <div style="font-size: 11px; color: #666;">${venda.quantidade || 1} un</div>
            </td>
            <td style="max-width: 150px;">
                <div style="font-size: 12px;">${venda.cliente || 'N/I'}</div>
            </td>
            <td style="min-width: 200px;">
                ${skuDisplay}
                ${mlbDisplay}
                <div style="margin-top: 4px;">${envioBadge}</div>
            </td>
            <td style="min-width: 120px;">
                <div style="margin-bottom: 8px;">
                    <small style="display: block; color: #666;">Anúncio:</small>
                    ${estoqueBadge}
                </div>
                <div>
                    <small style="display: block; color: #666;">Físico:</small>
                    ${estoqueFisicoDisplay}
                </div>
            </td>
            <td>
                ${statusBadge}
            </td>
            <td style="min-width: 200px;">
                ${acoesHtml}
            </td>
        `;
        
        tbody.appendChild(row);
    });
}

// ============================================
// VISUALIZAR FOTOS DO ANÚNCIO
// ============================================
async function verFotosAnuncio(idVenda) {
    const venda = vendasML.find(v => v.id_venda_ml === idVenda);
    if (!venda || !venda.fotos_anuncio || venda.fotos_anuncio.length === 0) {
        mostrarToast('Nenhuma foto do anúncio disponível', 'info');
        return;
    }
    
    // Formatar as fotos para o visualizador existente
    const fotosParaViewer = venda.fotos_anuncio.map(foto => ({
        data: foto.url,
        thumbnail: foto.thumbnail || foto.url,
        name: `Foto do anúncio`
    }));
    
    if (window.openPhotoViewer) {
        window.openPhotoViewer(fotosParaViewer, `Anúncio - ${venda.sku}`);
    }
}

// ============================================
// ATUALIZAR ESTATÍSTICAS (VERSÃO CORRIGIDA)
// ============================================
function atualizarEstatisticas() {
    if (!vendasML || vendasML.length === 0) {
        setElementText('countVendasHoje', '0');
        setElementText('countVendasSemana', '0');
        setElementText('countVendasNaoVerificadas', '0');
        setElementText('totalVendasPeriodo', '0,00');
        setElementText('totalHoje', '0,00');
        setElementText('quantidadeHoje', '0');
        setElementText('ticketMedio', '0,00');
        setElementText('pendentesVerificacao', '0');
        setElementText('countNovas', '0');
        setElementText('countVerificadas', '0');
        setElementText('countFraudes', '0');
        setElementText('countTotalVendas', '0');
        return;
    }
    
    const hoje = new Date().toISOString().split('T')[0];
    
    const vendasHoje = vendasML.filter(v => {
        if (!v.created_at) return false;
        return new Date(v.created_at).toISOString().split('T')[0] === hoje;
    });
    
    const umaSemanaAtras = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const vendasSemana = vendasML.filter(v => {
        if (!v.created_at) return false;
        return new Date(v.created_at) >= umaSemanaAtras;
    });
    
    const vendasNaoVerificadas = vendasML.filter(v => v.status_sistema === 'nova');
    
    setElementText('countVendasHoje', vendasHoje.length);
    setElementText('countVendasSemana', vendasSemana.length);
    setElementText('countVendasNaoVerificadas', vendasNaoVerificadas.length);
    setElementText('totalVendasPeriodo', vendasML.reduce((sum, v) => sum + (v.valor_total || 0), 0).toFixed(2));
    
    const totalHoje = vendasHoje.reduce((sum, v) => sum + (v.valor_total || 0), 0);
    const quantidadeHoje = vendasHoje.reduce((sum, v) => sum + (v.quantidade || 0), 0);
    const ticketMedio = quantidadeHoje > 0 ? totalHoje / quantidadeHoje : 0;
    
    setElementText('totalHoje', totalHoje.toFixed(2));
    setElementText('quantidadeHoje', quantidadeHoje);
    setElementText('ticketMedio', ticketMedio.toFixed(2));
    setElementText('pendentesVerificacao', vendasNaoVerificadas.length);
    
    setElementText('countNovas', vendasML.filter(v => v.status_sistema === 'nova').length);
    setElementText('countVerificadas', vendasML.filter(v => v.status_sistema === 'verificada').length);
    setElementText('countFraudes', vendasML.filter(v => v.status_sistema === 'fraude').length);
    setElementText('countTotalVendas', vendasML.length);
}

// ============================================
// ATUALIZAR CONTADORES DE CONFERÊNCIA
// ============================================
function atualizarContadoresConferencia() {
    const pendentes = vendasML.filter(v => v.status_conferencia === 'pendente' || !v.status_conferencia).length;
    const emAndamento = vendasML.filter(v => v.status_conferencia === 'conferido_estoque').length;
    const finalizados = vendasML.filter(v => v.status_conferencia === 'conferido_anuncio' && !v.divergente).length;
    const divergentes = vendasML.filter(v => v.divergente === true).length;
    
    setElementText('badgePendentes', pendentes);
    setElementText('badgeEmAndamento', emAndamento);
    setElementText('badgeFinalizados', finalizados);
    setElementText('badgeDivergentes', divergentes);
    
    setElementText('countPendentes', pendentes);
    setElementText('countEstoqueConferido', emAndamento);
    setElementText('countAnuncioConferido', finalizados);
    setElementText('countDivergentes', divergentes);
}

// ============================================
// FILTROS
// ============================================
function aplicarFiltroAtual() {
    let vendasFiltradas = [...vendasML];
    
    if (filtroConferencia === 'pendente') {
        vendasFiltradas = vendasFiltradas.filter(v => v.status_conferencia === 'pendente' || !v.status_conferencia);
    } else if (filtroConferencia === 'conferido_estoque') {
        vendasFiltradas = vendasFiltradas.filter(v => v.status_conferencia === 'conferido_estoque');
    } else if (filtroConferencia === 'conferido_anuncio') {
        vendasFiltradas = vendasFiltradas.filter(v => v.status_conferencia === 'conferido_anuncio' && !v.divergente);
    } else if (filtroConferencia === 'divergente') {
        vendasFiltradas = vendasFiltradas.filter(v => v.divergente === true);
    }
    
    if (filtroTipoEnvio !== 'todos') {
        vendasFiltradas = vendasFiltradas.filter(v => {
            const tipo = v.tipo_envio || 'N/I';
            if (filtroTipoEnvio === 'N/I') {
                return tipo === 'N/I' || tipo === 'Não especificado';
            }
            return tipo.includes(filtroTipoEnvio);
        });
    }
    
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
            return new Date(v.created_at) >= dataLimite;
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
    
    setElementText('vendasInicio', vendas.length > 0 ? inicio + 1 : 0);
    setElementText('vendasFim', Math.min(fim, vendas.length));
    setElementText('vendasTotal', vendas.length);
    
    const btnAnterior = document.getElementById('btnAnterior');
    const btnProxima = document.getElementById('btnProxima');
    
    if (btnAnterior) btnAnterior.disabled = paginaAtual <= 1;
    if (btnProxima) btnProxima.disabled = fim >= vendas.length;
}

function filtrarPorConferencia(status) {
    filtroConferencia = status;
    paginaAtual = 1;
    aplicarFiltroAtual();
}

function filtrarPorStatus(status) {
    filtroAtual = status;
    paginaAtual = 1;
    aplicarFiltroAtual();
}

function filtrarVendas(periodo) {
    periodoAtual = periodo;
    paginaAtual = 1;
    aplicarFiltroAtual();
}

function filtrarPorTipoEnvio(tipo) {
    filtroTipoEnvio = tipo;
    paginaAtual = 1;
    aplicarFiltroAtual();
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
// FUNÇÕES DE CONFERÊNCIA (ANÚNCIO)
// ============================================
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
                `Confirmar conferência do anúncio?`
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

async function finalizarConferencia(idVenda, divergente, nomeUsuario) {
    try {
        const { error } = await supabaseClient
            .from('vendas_ml')
            .update({
                status_conferencia: 'conferido_anuncio',
                divergente: divergente,
                conferido_por_anuncio: nomeUsuario,
                data_conferencia_anuncio: new Date().toISOString(),
                observacao: divergente ? 'Divergência de estoque' : 'Conferido'
            })
            .eq('id_venda_ml', idVenda);
        
        if (error) throw error;
        
    } catch (error) {
        console.error('❌ Erro ao finalizar:', error);
        throw error;
    }
}

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
            `Deseja reabrir esta venda?`
        )) {
            const { error: updateError } = await supabaseClient
                .from('vendas_ml')
                .update({
                    status_conferencia: 'conferido_estoque',
                    conferido_por_anuncio: null,
                    data_conferencia_anuncio: null,
                    observacao: 'Reaberto'
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

async function moverParaPendentes(idVenda) {
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
        
        const nomeAdmin = getNomeUsuario();
        
        if (confirm(
            `⚠️ MOVER PARA PENDENTES\n\n` +
            `ID: ${venda.id_venda_ml}\n` +
            `SKU: ${venda.sku}\n` +
            `Status atual: ${venda.status_conferencia || 'pendente'}\n\n` +
            `Tem certeza?`
        )) {
            const { error: updateError } = await supabaseClient
                .from('vendas_ml')
                .update({
                    status_conferencia: 'pendente',
                    divergente: false,
                    conferido_por_estoque: null,
                    conferido_por_anuncio: null,
                    data_conferencia_estoque: null,
                    data_conferencia_anuncio: null,
                    observacao: `Movido por ${nomeAdmin}`
                })
                .eq('id_venda_ml', idVenda);
            
            if (updateError) throw updateError;
            
            mostrarToast(`✅ Venda movida por ${nomeAdmin}!`, 'success');
            await carregarVendasDoBanco();
        }
        
    } catch (error) {
        console.error('❌ Erro ao mover:', error);
        mostrarToast('Erro ao mover venda', 'error');
    }
}

// ============================================
// FUNÇÕES DE AÇÃO
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

async function atualizarEstoqueFisico(idVenda, valor) {
    const venda = vendasML.find(v => v.id_venda_ml === idVenda);
    if (venda && venda.status_conferencia !== 'pendente' && venda.status_conferencia !== null) {
        mostrarToast('Não é possível editar estoque após conferido!', 'warning');
        await carregarVendasDoBanco();
        return;
    }
    
    try {
        const quantidade = parseInt(valor);
        if (isNaN(quantidade) || quantidade < 0) {
            mostrarToast('Valor inválido', 'error');
            return;
        }
        
        const { error } = await supabaseClient
            .from('vendas_ml')
            .update({ 
                estoque_fisico: quantidade,
                updated_at: new Date().toISOString()
            })
            .eq('id_venda_ml', idVenda);
        
        if (error) throw error;
        
        mostrarToast(`Estoque físico: ${quantidade} un`, 'success');
        
    } catch (error) {
        console.error('❌ Erro ao atualizar estoque:', error);
        mostrarToast('Erro ao atualizar estoque', 'error');
    }
}

// ============================================
// DETALHES DA VENDA - MODAL COM OBSERVAÇÕES
// ============================================
async function verDetalhesVenda(idVenda) {
    try {
        const { data: venda, error } = await supabaseClient
            .from('vendas_ml')
            .select('*')
            .eq('id_venda_ml', idVenda)
            .single();
        
        if (error) throw error;
        
        const modal = document.getElementById('vendaDetalhesModal');
        const content = document.getElementById('vendaDetalhesContent');
        const codigo = document.getElementById('vendaCodigo');
        
        const dataVenda = venda.created_at ? new Date(venda.created_at) : new Date();
        const dataFormatada = dataVenda.toLocaleDateString('pt-BR');
        const horaFormatada = dataVenda.toLocaleTimeString('pt-BR');
        
        let statusBadge = '';
        if (venda.status_sistema === 'nova') statusBadge = '<span class="badge badge-nova">NOVA</span>';
        else if (venda.status_sistema === 'verificada') statusBadge = '<span class="badge badge-verificada">VERIFICADA</span>';
        else if (venda.status_sistema === 'fraude') statusBadge = '<span class="badge badge-fraude">FRAUDE</span>';
        
        let conferenciaBadge = gerarBadgeConferencia(venda.status_conferencia, venda.divergente);
        
        let skusList = '';
        if (venda.eh_kit && venda.skus_kit && venda.skus_kit.length > 0) {
            skusList = `
                <div class="info-card">
                    <h4><i class="fas fa-layer-group"></i> SKUs do Kit (${venda.skus_kit.length})</h4>
                    <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                        ${venda.skus_kit.map(item => 
                            `<span class="badge badge-info" style="font-size: 12px; padding: 5px 10px;">
                                ${item.sku}: ${item.estoque} un
                            </span>`
                        ).join('')}
                    </div>
                </div>
            `;
        }
        
        let fotosHtml = '';
        if (venda.fotos && venda.fotos.length > 0) {
            fotosHtml = `
                <div class="info-card">
                    <h4><i class="fas fa-images"></i> Fotos (${venda.fotos.length})</h4>
                    <div style="display: flex; flex-wrap: wrap; gap: 10px;">
                        ${venda.fotos.slice(0, 4).map(foto => `
                            <img src="${foto.data}" style="width: 80px; height: 80px; object-fit: cover; border-radius: 4px; cursor: pointer;" 
                                 onclick="verFotosVenda('${venda.id_venda_ml}')">
                        `).join('')}
                        ${venda.fotos.length > 4 ? `<div style="width: 80px; height: 80px; background: #f0f0f0; border-radius: 4px; display: flex; align-items: center; justify-content: center;">+${venda.fotos.length-4}</div>` : ''}
                    </div>
                </div>
            `;
        }
        
        let fotosAnuncioHtml = '';
        if (venda.fotos_anuncio && venda.fotos_anuncio.length > 0) {
            fotosAnuncioHtml = `
                <div class="info-card">
                    <h4><i class="fas fa-images"></i> Fotos do Anúncio (${venda.fotos_anuncio.length})</h4>
                    <div style="display: flex; flex-wrap: wrap; gap: 10px;">
                        ${venda.fotos_anuncio.slice(0, 4).map(foto => `
                            <img src="${foto.url}" style="width: 80px; height: 80px; object-fit: cover; border-radius: 4px; cursor: pointer;" 
                                 onclick="verFotosAnuncio('${venda.id_venda_ml}')">
                        `).join('')}
                        ${venda.fotos_anuncio.length > 4 ? `<div style="width: 80px; height: 80px; background: #f0f0f0; border-radius: 4px; display: flex; align-items: center; justify-content: center;">+${venda.fotos_anuncio.length-4}</div>` : ''}
                    </div>
                </div>
            `;
        }
        
        content.innerHTML = `
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                <div class="info-card">
                    <h4><i class="fas fa-info-circle"></i> Informações</h4>
                    <p><strong>ID:</strong> ${venda.id_venda_ml}</p>
                    <p><strong>Status:</strong> ${statusBadge} ${conferenciaBadge}</p>
                    <p><strong>Data:</strong> ${dataFormatada} às ${horaFormatada}</p>
                    <p><strong>Produto:</strong> ${venda.titulo}</p>
                    ${venda.mlb_id ? `<p><strong>MLB:</strong> <code>${venda.mlb_id}</code></p>` : ''}
                </div>
                
                <div class="info-card">
                    <h4><i class="fas fa-user"></i> Cliente</h4>
                    <p><strong>Nome:</strong> ${venda.cliente}</p>
                    <p><strong>SKU Principal:</strong> <span class="badge badge-info">${venda.sku}</span></p>
                    ${venda.sku_original ? `<p><strong>SKU Original:</strong> ${venda.sku_original}</p>` : ''}
                </div>
                
                <div class="info-card">
                    <h4><i class="fas fa-truck"></i> Envio</h4>
                    <p><strong>Tipo:</strong> ${gerarBadgeEnvio(venda.tipo_envio)}</p>
                    ${venda.id_envio ? `<p><strong>ID:</strong> ${venda.id_envio}</p>` : ''}
                </div>
                
                <div class="info-card">
                    <h4><i class="fas fa-money-bill-wave"></i> Valores</h4>
                    <p><strong>Quantidade:</strong> ${venda.quantidade} un</p>
                    <p><strong>Total:</strong> R$ ${(venda.valor_total || 0).toFixed(2)}</p>
                </div>
                
                <div class="info-card" style="grid-column: span 2;">
                    <h4><i class="fas fa-boxes"></i> Estoque e Conferência</h4>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                        <div>
                            <p><strong>Anúncio:</strong> ${venda.estoque_anuncio || 0} un</p>
                            <p><strong>Físico:</strong> ${venda.estoque_fisico || 0} un</p>
                        </div>
                        <div>
                            <p><strong>1ª Conf.:</strong> ${venda.conferido_por_estoque || '-'}</p>
                            <p><strong>Data:</strong> ${venda.data_conferencia_estoque ? new Date(venda.data_conferencia_estoque).toLocaleString('pt-BR') : '-'}</p>
                            <p><strong>2ª Conf.:</strong> ${venda.conferido_por_anuncio || '-'}</p>
                            <p><strong>Data:</strong> ${venda.data_conferencia_anuncio ? new Date(venda.data_conferencia_anuncio).toLocaleString('pt-BR') : '-'}</p>
                        </div>
                    </div>
                </div>
            </div>
            
            ${skusList}
            ${fotosHtml}
            ${fotosAnuncioHtml}
            
            <div class="info-card" style="margin-top: 15px;">
                <h4><i class="fas fa-sticky-note"></i> Observações</h4>
                <textarea id="observacoesVendaModal" class="form-control" rows="3" style="width: 100%; margin-bottom: 10px;">${venda.observacoes_gerais || ''}</textarea>
                <button onclick="salvarObservacoesVenda('${venda.id_venda_ml}')" class="btn btn-success btn-sm">
                    <i class="fas fa-save"></i> Salvar
                </button>
            </div>
        `;
        
        if (codigo) codigo.textContent = venda.id_venda_ml;
        modal.classList.remove('hidden');
        
    } catch (error) {
        console.error('❌ Erro ao carregar detalhes:', error);
        mostrarToast('Erro ao carregar detalhes', 'error');
    }
}

async function salvarObservacoesVenda(idVenda) {
    const observacoes = document.getElementById('observacoesVendaModal')?.value;
    if (observacoes === undefined) return;
    
    try {
        const { error } = await supabaseClient
            .from('vendas_ml')
            .update({
                observacoes_gerais: observacoes,
                updated_at: new Date().toISOString()
            })
            .eq('id_venda_ml', idVenda);
        
        if (error) throw error;
        
        mostrarToast('✅ Observações salvas!', 'success');
        
    } catch (error) {
        console.error('Erro ao salvar observações:', error);
        mostrarToast('Erro ao salvar observações', 'error');
    }
}

function fecharDetalhesVenda() {
    document.getElementById('vendaDetalhesModal').classList.add('hidden');
}

// ============================================
// FUNÇÕES PARA FOTOS
// ============================================
async function abrirUploadFotos(idVenda) {
    const venda = vendasML.find(v => v.id_venda_ml === idVenda);
    if (!venda) return;
    
    const modalHtml = `
        <div id="modalUploadFotosVenda" class="modal" style="display: flex; z-index: 10000;">
            <div class="modal-content" style="max-width: 600px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                    <h3><i class="fas fa-camera"></i> Fotos da Venda</h3>
                    <button onclick="fecharUploadFotos()" style="background: none; border: none; font-size: 24px; cursor: pointer;">&times;</button>
                </div>
                
                <p><strong>Venda:</strong> ${venda.id_venda_ml}</p>
                <p><strong>SKU:</strong> ${venda.sku}</p>
                
                <div style="border: 2px dashed #dee2e6; border-radius: 8px; padding: 20px; text-align: center; background: #f8f9fa; cursor: pointer; margin: 20px 0;" 
                     id="uploadAreaVenda" onclick="document.getElementById('fotosVendaInput').click()">
                    <i class="fas fa-cloud-upload-alt fa-2x"></i>
                    <p>Clique ou arraste fotos aqui</p>
                    <p style="font-size: 12px;">JPG, PNG (Máx. 5MB)</p>
                </div>
                
                <input type="file" id="fotosVendaInput" multiple accept="image/*" style="display: none;">
                <div id="previewsVenda" style="display: flex; flex-wrap: wrap; gap: 10px; margin: 20px 0;"></div>
                
                <div style="display: flex; justify-content: flex-end; gap: 10px;">
                    <button onclick="fecharUploadFotos()" class="btn btn-secondary">Cancelar</button>
                    <button onclick="salvarFotosVenda('${idVenda}')" class="btn btn-success">Salvar Fotos</button>
                </div>
            </div>
        </div>
    `;
    
    const modalAnterior = document.getElementById('modalUploadFotosVenda');
    if (modalAnterior) modalAnterior.remove();
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    
    document.getElementById('fotosVendaInput').addEventListener('change', (e) => handleFotosVenda(e.target.files));
    
    const area = document.getElementById('uploadAreaVenda');
    area.addEventListener('dragover', (e) => {
        e.preventDefault();
        area.style.borderColor = '#8A2BE2';
        area.style.background = '#f0e6ff';
    });
    
    area.addEventListener('dragleave', () => {
        area.style.borderColor = '#dee2e6';
        area.style.background = '#f8f9fa';
    });
    
    area.addEventListener('drop', (e) => {
        e.preventDefault();
        area.style.borderColor = '#dee2e6';
        area.style.background = '#f8f9fa';
        handleFotosVenda(e.dataTransfer.files);
    });
}

function handleFotosVenda(files) {
    const previews = document.getElementById('previewsVenda');
    
    for (let file of files) {
        if (file.size > 5 * 1024 * 1024) {
            mostrarToast(`Arquivo muito grande: ${file.name}`, 'error');
            continue;
        }
        
        if (!file.type.startsWith('image/')) {
            mostrarToast(`Apenas imagens: ${file.name}`, 'error');
            continue;
        }
        
        const reader = new FileReader();
        reader.onload = (e) => {
            fotosTemp.push({
                id: Date.now() + Math.random(),
                name: file.name,
                data: e.target.result
            });
            
            const preview = document.createElement('div');
            preview.style.cssText = 'position: relative; width: 100px; height: 100px; border-radius: 8px; overflow: hidden; border: 2px solid #dee2e6;';
            preview.innerHTML = `
                <img src="${e.target.result}" style="width: 100%; height: 100%; object-fit: cover;">
                <div style="position: absolute; top: 5px; right: 5px; background: rgba(0,0,0,0.7); color: white; border-radius: 50%; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; font-size: 12px; cursor: pointer;"
                     onclick="removerFotoTemp(${fotosTemp.length - 1})">×</div>
            `;
            previews.appendChild(preview);
        };
        reader.readAsDataURL(file);
    }
}

function removerFotoTemp(index) {
    fotosTemp.splice(index, 1);
    const previews = document.getElementById('previewsVenda');
    if (previews) {
        previews.innerHTML = '';
        fotosTemp.forEach((foto, i) => {
            const preview = document.createElement('div');
            preview.style.cssText = 'position: relative; width: 100px; height: 100px; border-radius: 8px; overflow: hidden; border: 2px solid #dee2e6;';
            preview.innerHTML = `
                <img src="${foto.data}" style="width: 100%; height: 100%; object-fit: cover;">
                <div style="position: absolute; top: 5px; right: 5px; background: rgba(0,0,0,0.7); color: white; border-radius: 50%; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; font-size: 12px; cursor: pointer;"
                     onclick="removerFotoTemp(${i})">×</div>
            `;
            previews.appendChild(preview);
        });
    }
}

async function salvarFotosVenda(idVenda) {
    if (fotosTemp.length === 0) {
        mostrarToast('Selecione pelo menos uma foto', 'warning');
        return;
    }
    
    try {
        const { data: venda } = await supabaseClient
            .from('vendas_ml')
            .select('fotos')
            .eq('id_venda_ml', idVenda)
            .single();
        
        const fotosExistentes = venda?.fotos || [];
        const todasFotos = [...fotosExistentes, ...fotosTemp];
        
        const { error } = await supabaseClient
            .from('vendas_ml')
            .update({
                fotos: todasFotos,
                qtd_fotos: todasFotos.length,
                updated_at: new Date().toISOString()
            })
            .eq('id_venda_ml', idVenda);
        
        if (error) throw error;
        
        mostrarToast(`✅ ${fotosTemp.length} foto(s) salva(s)!`, 'success');
        fotosTemp = [];
        fecharUploadFotos();
        await carregarVendasDoBanco();
        
    } catch (error) {
        console.error('Erro ao salvar fotos:', error);
        mostrarToast('Erro ao salvar fotos', 'error');
    }
}

function fecharUploadFotos() {
    document.getElementById('modalUploadFotosVenda')?.remove();
    fotosTemp = [];
}

async function verFotosVenda(idVenda) {
    const { data: venda } = await supabaseClient
        .from('vendas_ml')
        .select('fotos, titulo, sku')
        .eq('id_venda_ml', idVenda)
        .single();
    
    if (!venda || !venda.fotos || venda.fotos.length === 0) {
        mostrarToast('Nenhuma foto', 'info');
        return;
    }
    
    if (window.openPhotoViewer) {
        window.openPhotoViewer(venda.fotos, `Venda ${idVenda} - ${venda.sku}`);
    }
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
                    <h3><i class="fas fa-filter"></i> Filtrar Relatório de Conferências</h3>
                    <button onclick="fecharModalFiltro()" style="background: none; border: none; font-size: 24px;">&times;</button>
                </div>
                
                <div class="form-group">
                    <label>Data Início</label>
                    <input type="date" id="relDataInicio" class="form-control" value="${umMesAtras.toISOString().split('T')[0]}">
                </div>
                
                <div class="form-group">
                    <label>Data Fim</label>
                    <input type="date" id="relDataFim" class="form-control" value="${hoje.toISOString().split('T')[0]}">
                </div>
                
                <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px;">
                    <button onclick="fecharModalFiltro()" class="btn btn-secondary">Cancelar</button>
                    <button onclick="gerarRelatorioConferencia()" class="btn btn-success">Gerar</button>
                </div>
            </div>
        </div>
    `;
    
    const modalAnterior = document.getElementById('modalFiltroRelatorio');
    if (modalAnterior) modalAnterior.remove();
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

function fecharModalFiltro() {
    document.getElementById('modalFiltroRelatorio')?.remove();
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
            'SKU Principal': v.sku,
            'É Kit': v.eh_kit ? 'SIM' : 'NÃO',
            'SKUs do Kit': v.eh_kit && v.skus_kit ? v.skus_kit.map(item => `${item.sku}:${item.estoque}`).join('; ') : '-',
            'Estoque Anúncio': v.estoque_anuncio,
            'Estoque Físico': v.estoque_fisico,
            'Divergente': v.divergente ? 'SIM' : 'NÃO',
            'Conferiu Estoque': v.conferido_por_estoque || '-',
            'Data 1ª Conf.': v.data_conferencia_estoque ? new Date(v.data_conferencia_estoque).toLocaleString('pt-BR') : '-',
            'Conferiu Anúncio': v.conferido_por_anuncio || '-',
            'Data 2ª Conf.': v.data_conferencia_anuncio ? new Date(v.data_conferencia_anuncio).toLocaleString('pt-BR') : '-',
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
        mostrarToast('Erro ao gerar relatório', 'error');
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
        mostrarToast('MLB copiado!', 'success');
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
// AUTO-SINCRONIZAÇÃO
// ============================================
function iniciarAutoSincronizacao() {
    setInterval(() => {
        if (document.getElementById('salesSystem') && 
            !document.getElementById('salesSystem').classList.contains('hidden')) {
            sincronizarVendasML();
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
    
    const dados = vendasML.map(v => ({
        'ID Venda': v.id_venda_ml,
        'Data': v.created_at ? new Date(v.created_at).toLocaleDateString('pt-BR') : '',
        'Cliente': v.cliente,
        'SKU': v.sku,
        'É Kit': v.eh_kit ? 'SIM' : 'NÃO',
        'Qtd': v.quantidade,
        'Valor': v.valor_total,
        'Envio': v.tipo_envio,
        'Estoque Anúncio': v.estoque_anuncio,
        'Estoque Físico': v.estoque_fisico,
        'Status': v.status_sistema
    }));
    
    const ws = XLSX.utils.json_to_sheet(dados);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Vendas");
    XLSX.writeFile(wb, `vendas_${new Date().toISOString().split('T')[0]}.xlsx`);
}

// ============================================
// TOAST
// ============================================
function mostrarToast(mensagem, tipo = 'info') {
    if (window.showToast) {
        window.showToast(mensagem, tipo);
    } else {
        console.log(`[${tipo}] ${mensagem}`);
        const toast = document.createElement('div');
        toast.style.cssText = `
            position: fixed; bottom: 20px; right: 20px; padding: 12px 20px;
            background: ${tipo === 'success' ? '#28a745' : tipo === 'error' ? '#dc3545' : '#17a2b8'};
            color: white; border-radius: 4px; z-index: 9999;
        `;
        toast.innerHTML = mensagem;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }
}

// ============================================
// EXPORTAÇÕES GLOBAIS
// ============================================
window.carregarVendasDoBanco = carregarVendasDoBanco;
window.sincronizarVendasML = sincronizarVendasML;
window.filtrarVendas = filtrarVendas;
window.filtrarPorStatus = filtrarPorStatus;
window.filtrarPorConferencia = filtrarPorConferencia;
window.filtrarPorTipoEnvio = filtrarPorTipoEnvio;
window.paginarVendas = function(direcao) {
    if (direcao === 'anterior' && paginaAtual > 1) paginaAtual--;
    else if (direcao === 'proxima') paginaAtual++;
    aplicarFiltroAtual();
};
window.verDetalhesVenda = verDetalhesVenda;
window.verificarVenda = verificarVenda;
window.marcarComoFraude = marcarComoFraude;
window.fecharDetalhesVenda = fecharDetalhesVenda;
window.atualizarEstoqueFisico = atualizarEstoqueFisico;
window.conferirEstoque = conferirEstoque;
window.conferirAnuncio = conferirAnuncio;
window.reabrirConferencia = reabrirConferencia;
window.moverParaPendentes = moverParaPendentes;
window.mostrarFiltroRelatorio = mostrarFiltroRelatorio;
window.gerarRelatorioConferencia = gerarRelatorioConferencia;
window.fecharModalFiltro = fecharModalFiltro;
window.getNomeUsuario = getNomeUsuario;
window.isAdmin = isAdmin;
window.abrirUploadFotos = abrirUploadFotos;
window.verFotosVenda = verFotosVenda;
window.fecharUploadFotos = fecharUploadFotos;
window.removerFotoTemp = removerFotoTemp;
window.salvarObservacoesVenda = salvarObservacoesVenda;
window.configurarKit = configurarKit;
window.copiarMLB = copiarMLB;
window.exportarVendasExcel = exportarVendasExcel;

console.log('✅ Sales Dashboard com Dupla Conferência e Kits carregado e pronto!');