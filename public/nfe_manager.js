const NFE_API_URL = 'https://purple-bonus-3b1c.andmiotto1998.workers.dev';
// nfe_manager.js
console.log('✅ nfe_manager.js carregado');

let vendasSemNFE = [];
let vendaSelecionada = null;
let vendasSelecionadas = new Set();

// ============================================
// CARREGAR VENDAS PENDENTES (exclui FULL e já emitidas)
// ============================================
async function carregarVendasSemNFE() {
    console.log('🔍 Carregando vendas sem NF-e...');
    const tbody = document.getElementById('listaVendasNFE');
    if (!tbody) {
        console.error('❌ Elemento listaVendasNFE não encontrado');
        return;
    }

    // Limpar seleções anteriores
    vendasSelecionadas.clear();
    atualizarBarraSelecao();

    tbody.innerHTML = '<tr><td colspan="7" class="text-center">Carregando...</td></tr>';

    try {
        const client = window.supabaseClient || supabaseClient;
        if (!client) throw new Error('Supabase não inicializado');

        // Buscar vendas que não têm NF-e emitida (flag false/null) E não têm XML salvo
        // Também exclui FULL
        const { data, error } = await client
            .from('vendas_ml')
            .select('id_venda_ml, cliente, valor_total, data_venda, sku, quantidade, produto_titulo, tipo_envio, nfe_emitida, nfe_xml')
            .or('nfe_emitida.is.null,nfe_emitida.eq.false')
            .or('nfe_xml.is.null,nfe_xml.eq.null')
            .neq('tipo_envio', 'FULL')
            .order('data_venda', { ascending: false });

        if (error) {
            // Se a coluna tipo_envio não existir, tenta sem filtro
            if (error.message.includes('column "tipo_envio" does not exist')) {
                console.warn('⚠️ Coluna tipo_envio não encontrada. Tentando sem filtro FULL.');
                const { data: dataFallback, error: errorFallback } = await client
                    .from('vendas_ml')
                    .select('id_venda_ml, cliente, valor_total, data_venda, sku, quantidade, produto_titulo, nfe_emitida, nfe_xml')
                    .or('nfe_emitida.is.null,nfe_emitida.eq.false')
                    .or('nfe_xml.is.null,nfe_xml.eq.null')
                    .order('data_venda', { ascending: false });
                if (errorFallback) throw errorFallback;
                vendasSemNFE = dataFallback || [];
                console.log(`⚠️ Carregadas ${vendasSemNFE.length} vendas sem filtro FULL (coluna ausente)`);
            } else {
                throw error;
            }
        } else {
            vendasSemNFE = data || [];
            console.log(`✅ ${vendasSemNFE.length} vendas sem NF-e (excluindo FULL e já emitidas)`);
        }

        if (vendasSemNFE.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center">Nenhuma venda pendente</td></tr>';
            return;
        }

        let html = '';
        vendasSemNFE.forEach(v => {
            const nfeStatus = '<span class="badge badge-warning"><i class="fas fa-hourglass-half"></i> Pendente</span>';
            html += `
                <tr>
                    <td style="text-align: center;">
                        <input type="checkbox" class="venda-select-checkbox" data-id="${v.id_venda_ml}" onchange="toggleSelecionarVenda('${v.id_venda_ml}', this.checked)">
                    </td>
                    <td><strong>${v.id_venda_ml}</strong><br><small>${v.produto_titulo?.substring(0, 30) || ''}</small></td>
                    <td>${v.cliente || 'N/I'}</td>
                    <td class="valor-cell">R$ ${(v.valor_total || 0).toFixed(2)}</td>
                    <td>${nfeStatus}</td>
                    <td>
                        <button class="btn btn-sm btn-primary" onclick="selecionarVendaNFE('${v.id_venda_ml}')">Selecionar</button>
                        <button class="btn btn-sm btn-danger" onclick="forcarMarcarComoEmitida('${v.id_venda_ml}')" title="Forçar marcação (uso manual)">
                            <i class="fas fa-check-double"></i> Forçar Emitida
                        </button>
                    </td>
                </tr>
            `;
        });
        tbody.innerHTML = html;
    } catch (error) {
        console.error('❌ Erro ao carregar vendas:', error);
        tbody.innerHTML = `<tr><td colspan="7" class="text-center text-danger">Erro: ${error.message}</td></tr>`;
        showToast('Erro ao carregar vendas: ' + error.message, 'error');
    }
}

// ============================================
// GERENCIAR SELEÇÃO MÚLTIPLA
// ============================================
function toggleSelecionarVenda(id, checked) {
    if (checked) {
        vendasSelecionadas.add(id);
    } else {
        vendasSelecionadas.delete(id);
    }
    atualizarBarraSelecao();
}

function atualizarBarraSelecao() {
    const barra = document.getElementById('barraSelecaoMultipla');
    const contador = document.getElementById('selecionadasContador');
    if (!barra) return;

    const totalSelecionadas = vendasSelecionadas.size;
    if (totalSelecionadas > 0) {
        barra.classList.remove('hidden');
        contador.textContent = totalSelecionadas;
    } else {
        barra.classList.add('hidden');
    }
}

function selecionarTodas() {
    const checkboxes = document.querySelectorAll('#listaVendasNFE .venda-select-checkbox');
    checkboxes.forEach(cb => {
        if (!cb.checked) {
            cb.checked = true;
            const id = cb.getAttribute('data-id');
            vendasSelecionadas.add(id);
        }
    });
    atualizarBarraSelecao();
}

function limparSelecao() {
    const checkboxes = document.querySelectorAll('#listaVendasNFE .venda-select-checkbox');
    checkboxes.forEach(cb => {
        if (cb.checked) {
            cb.checked = false;
            const id = cb.getAttribute('data-id');
            vendasSelecionadas.delete(id);
        }
    });
    atualizarBarraSelecao();
}

async function marcarSelecionadasComoEmitidas() {
    if (vendasSelecionadas.size === 0) {
        showToast('Nenhuma venda selecionada', 'warning');
        return;
    }

    if (!confirm(`Marcar ${vendasSelecionadas.size} venda(s) como NF-e emitida?\n\nEsta ação não pode ser desfeita.`)) return;

    const client = window.supabaseClient || supabaseClient;
    let sucessos = 0;
    let erros = 0;

    for (const id of vendasSelecionadas) {
        try {
            const { error } = await client
                .from('vendas_ml')
                .update({ 
                    nfe_emitida: true, 
                    nfe_emitida_em: new Date().toISOString(),
                    observacao: `Marcada como emitida em lote em ${new Date().toLocaleString()}`
                })
                .eq('id_venda_ml', id);
            if (error) throw error;
            sucessos++;
        } catch (err) {
            console.error(`Erro ao marcar ${id}:`, err);
            erros++;
        }
    }

    showToast(`${sucessos} vendas marcadas como emitidas. ${erros} falhas.`, sucessos > 0 ? 'success' : 'error');
    
    vendasSelecionadas.clear();
    await carregarVendasSemNFE();
    novaNFEDoZero();
}

// ============================================
// SELECIONAR VENDA (com verificação de duplicidade)
// ============================================
async function selecionarVendaNFE(vendaId) {
    try {
        const client = window.supabaseClient || supabaseClient;
        const { data: vendaAtual, error } = await client
            .from('vendas_ml')
            .select('id_venda_ml, nfe_emitida, nfe_xml')
            .eq('id_venda_ml', vendaId)
            .single();

        if (error) throw error;

        if (vendaAtual.nfe_emitida === true || vendaAtual.nfe_xml) {
            showToast('Esta venda já possui NF-e emitida!', 'warning');
            return;
        }

        const venda = vendasSemNFE.find(v => v.id_venda_ml === vendaId);
        if (!venda) {
            showToast('Venda não encontrada', 'error');
            return;
        }

        vendaSelecionada = venda;
        document.getElementById('nfeVendaId').value = venda.id_venda_ml;
        document.getElementById('btnMarcarEmitida').disabled = true;

        document.getElementById('nfeProduto').value = venda.produto_titulo || 'Produto';
        document.getElementById('nfeQuantidade').value = venda.quantidade || 1;
        const valorUnit = (venda.valor_total / (venda.quantidade || 1)).toFixed(2);
        document.getElementById('nfeValorUnit').value = valorUnit;

        document.getElementById('nfeDocDest').value = '';
        document.getElementById('nfeNomeDest').value = '';
        document.getElementById('nfeCep').value = '';
        document.getElementById('nfeEndereco').value = '';
        document.getElementById('nfeNumero').value = '';
        document.getElementById('nfeBairro').value = '';
        document.getElementById('nfeCidadeUF').value = '';

        await buscarDadosFiscaisML(venda.id_venda_ml);

        document.getElementById('btnMarcarEmitida').disabled = false;
        showToast(`Venda ${venda.id_venda_ml} selecionada`, 'success');
    } catch (error) {
        console.error('Erro ao selecionar venda:', error);
        showToast('Erro ao selecionar venda', 'error');
    }
}

// ============================================
// FORÇAR MARCAÇÃO COMO EMITIDA (correção manual)
// ============================================
async function forcarMarcarComoEmitida(vendaId) {
    if (!confirm(`Tem certeza que deseja marcar a venda ${vendaId} como NF-e emitida?\n\nIsso é útil para vendas que já foram emitidas mas ainda aparecem na lista.`)) return;

    try {
        const client = window.supabaseClient || supabaseClient;
        const { error } = await client
            .from('vendas_ml')
            .update({ 
                nfe_emitida: true, 
                nfe_emitida_em: new Date().toISOString(),
                observacao: `Marcada como emitida manualmente em ${new Date().toLocaleString()}`
            })
            .eq('id_venda_ml', vendaId);
        if (error) throw error;

        showToast(`Venda ${vendaId} marcada como emitida!`, 'success');
        await carregarVendasSemNFE();
        novaNFEDoZero();
    } catch (error) {
        console.error('Erro ao forçar marcação:', error);
        showToast('Erro ao marcar venda', 'error');
    }
}

// ============================================
// BUSCAR DADOS FISCAIS DO ML
// ============================================
async function buscarDadosFiscaisML(orderId) {
    try {
        const token = await window.autoManageMLToken();
        if (!token) throw new Error('Token ML não disponível');

        const numericOrderId = orderId.replace(/^ML/, '');
        const orderUrl = `https://api.mercadolibre.com/orders/${numericOrderId}`;
        console.log('📡 Buscando pedido:', orderUrl);

        const orderRes = await fetch(`${window.WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(orderUrl)}&token=${token}`);
        if (!orderRes.ok) {
            const errorText = await orderRes.text();
            console.error('❌ Erro na resposta do pedido:', orderRes.status, errorText);
            throw new Error(`Erro ${orderRes.status} ao buscar pedido`);
        }

        const order = await orderRes.json();
        
        if (!order.buyer?.billing_info?.id) {
            console.warn('⚠️ Comprador sem billing_info. Preencha manualmente.');
            if (order.buyer?.nickname) {
                document.getElementById('nfeNomeDest').value = order.buyer.nickname;
            }
            if (window.showToast) window.showToast('Comprador sem dados fiscais. Preencha manualmente.', 'warning');
            return;
        }

        const billingInfoId = order.buyer.billing_info.id;
        const billingUrl = `https://api.mercadolibre.com/orders/billing-info/MLB/${billingInfoId}`;
        console.log('📡 Buscando billing-info:', billingUrl);

        const billingRes = await fetch(`${window.WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(billingUrl)}&token=${token}`);
        if (!billingRes.ok) {
            console.warn('⚠️ Erro ao obter billing-info:', billingRes.status);
            document.getElementById('nfeNomeDest').value = order.buyer.nickname;
            if (window.showToast) window.showToast('Não foi possível obter dados fiscais detalhados', 'warning');
            return;
        }

        const billing = await billingRes.json();
        if (billing && billing.buyer && billing.buyer.billing_info) {
            const info = billing.buyer.billing_info;
            document.getElementById('nfeDocDest').value = info.identification?.number || '';
            document.getElementById('nfeNomeDest').value = info.name || order.buyer.nickname;
            if (info.address) {
                document.getElementById('nfeCep').value = info.address.zip_code || '';
                document.getElementById('nfeEndereco').value = info.address.street_name || '';
                document.getElementById('nfeNumero').value = info.address.street_number || '';
                document.getElementById('nfeBairro').value = info.address.neighborhood || '';
                const cidadeUF = `${info.address.city_name || ''} - ${info.address.state_name || ''}`;
                document.getElementById('nfeCidadeUF').value = cidadeUF;
            }
        } else {
            document.getElementById('nfeNomeDest').value = order.buyer.nickname;
            if (window.showToast) window.showToast('Dados fiscais não encontrados, preencha manualmente', 'warning');
        }
    } catch (error) {
        console.error('Erro ao buscar dados fiscais:', error);
        if (window.showToast) window.showToast('Erro ao obter dados fiscais do ML', 'error');
    }
}

// ============================================
// NOVA NF-e (do zero)
// ============================================
function novaNFEDoZero() {
    vendaSelecionada = null;
    document.getElementById('nfeVendaId').value = '';
    document.getElementById('nfeDocDest').value = '';
    document.getElementById('nfeNomeDest').value = '';
    document.getElementById('nfeProduto').value = '';
    document.getElementById('nfeQuantidade').value = '1';
    document.getElementById('nfeValorUnit').value = '';
    document.getElementById('nfeCep').value = '';
    document.getElementById('nfeEndereco').value = '';
    document.getElementById('nfeNumero').value = '';
    document.getElementById('nfeBairro').value = '';
    document.getElementById('nfeCidadeUF').value = '';
    document.getElementById('nfeNCM').value = '99999999';
    document.getElementById('nfeCFOP').value = '5102';
    document.getElementById('btnMarcarEmitida').disabled = true;
    document.getElementById('xmlResultado').style.display = 'none';
    showToast('Preencha os dados para emitir uma nova NF-e', 'info');
}

// ============================================
// GERAR XML (chamada ao backend)
// ============================================
async function gerarNFE() {
    const vendaId = document.getElementById('nfeVendaId').value;
    const dados = {
        vendaId: vendaId || null,
        cliente: {
            documento: document.getElementById('nfeDocDest').value,
            nome: document.getElementById('nfeNomeDest').value,
            endereco: {
                cep: document.getElementById('nfeCep').value,
                logradouro: document.getElementById('nfeEndereco').value,
                numero: document.getElementById('nfeNumero').value,
                bairro: document.getElementById('nfeBairro').value,
                cidadeUF: document.getElementById('nfeCidadeUF').value
            }
        },
        produto: {
            descricao: document.getElementById('nfeProduto').value,
            quantidade: parseFloat(document.getElementById('nfeQuantidade').value),
            valorUnitario: parseFloat(document.getElementById('nfeValorUnit').value),
            ncm: document.getElementById('nfeNCM').value,
            cfop: document.getElementById('nfeCFOP').value
        }
    };

    if (!dados.cliente.documento || !dados.cliente.nome || !dados.produto.descricao || isNaN(dados.produto.quantidade) || isNaN(dados.produto.valorUnitario)) {
        showToast('Preencha todos os campos obrigatórios', 'warning');
        return;
    }

    const btn = document.querySelector('#formNFE button[onclick="gerarNFE()"]');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<span class="spinner"></span> Emitindo NF-e...';
    btn.disabled = true;

    try {
        // Usa a URL completa do backend
        const response = await fetch(`${NFE_API_URL}/api/nfe/emitir`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dados)
        });

        // Verifica se a resposta tem conteúdo antes de tentar parsear JSON
        const text = await response.text();
        if (!text) {
            throw new Error('Resposta vazia do servidor');
        }

        let result;
        try {
            result = JSON.parse(text);
        } catch (e) {
            throw new Error(`Resposta inválida: ${text.substring(0, 100)}`);
        }

        if (!response.ok) {
            throw new Error(result.error || `Erro ${response.status}: ${result.message || 'Falha na emissão'}`);
        }

        if (result.success && result.protocolo) {
            if (result.xml) {
                document.getElementById('xmlGerado').value = result.xml;
                document.getElementById('xmlResultado').style.display = 'block';
            }
            showToast(`✅ NF-e emitida com sucesso! Protocolo: ${result.protocolo}`, 'success');

            if (vendaId) {
                await marcarComoEmitidaComProtocolo(vendaId, result.protocolo, result.xml);
            }
        } else {
            throw new Error(result.error || 'Erro desconhecido na emissão');
        }
    } catch (error) {
        console.error('❌ Erro na emissão:', error);
        showToast('Erro ao emitir NF-e: ' + error.message, 'error');
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

// Função auxiliar para marcar a venda como emitida após sucesso
async function marcarComoEmitidaComProtocolo(vendaId, protocolo, xml) {
    try {
        const client = window.supabaseClient || supabaseClient;
        const { error } = await client
            .from('vendas_ml')
            .update({
                nfe_emitida: true,
                nfe_protocolo: protocolo,
                nfe_xml: xml,
                nfe_emitida_em: new Date().toISOString()
            })
            .eq('id_venda_ml', vendaId);
        if (error) throw error;
        showToast('Venda marcada como emitida no sistema', 'success');
        await carregarVendasSemNFE();
        novaNFEDoZero();
    } catch (error) {
        console.error('Erro ao atualizar status no banco:', error);
        showToast('Erro ao atualizar status da venda', 'error');
    }
}

// ============================================
// COPIAR XML
// ============================================
function copiarXML() {
    const xml = document.getElementById('xmlGerado').value;
    if (!xml) return;
    navigator.clipboard.writeText(xml).then(() => {
        showToast('XML copiado!', 'success');
    }).catch(() => {
        alert('Não foi possível copiar automaticamente. Selecione o texto e copie manualmente.');
    });
}

// ============================================
// BAIXAR XML
// ============================================
function baixarXML() {
    const xml = document.getElementById('xmlGerado').value;
    if (!xml) return;
    const blob = new Blob([xml], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `NFE_${new Date().toISOString().slice(0,19)}.xml`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// ============================================
// MARCAR COMO EMITIDA (após gerar XML manual)
// ============================================
async function marcarComoEmitida() {
    const vendaId = document.getElementById('nfeVendaId').value;
    if (!vendaId) {
        showToast('Esta NF-e não está vinculada a uma venda', 'warning');
        return;
    }
    const xml = document.getElementById('xmlGerado').value;
    if (!xml) {
        showToast('Gere o XML antes de marcar como emitida', 'warning');
        return;
    }

    if (!confirm('Deseja marcar esta venda como NF-e emitida? Esta ação não pode ser desfeita.')) return;

    try {
        const client = window.supabaseClient || supabaseClient;
        const { error } = await client
            .from('vendas_ml')
            .update({ nfe_emitida: true, nfe_xml: xml, nfe_emitida_em: new Date().toISOString() })
            .eq('id_venda_ml', vendaId);
        if (error) throw error;

        showToast('Venda marcada como NF-e emitida!', 'success');
        await carregarVendasSemNFE();
        novaNFEDoZero();
    } catch (error) {
        console.error('Erro ao marcar emitida:', error);
        showToast('Erro ao atualizar status', 'error');
    }
}

// ============================================
// SINCRONIZAR VENDAS COM ML E ATUALIZAR LISTA
// ============================================
async function sincronizarVendasMLparaNFE() {
    showToast('Sincronizando vendas do Mercado Livre...', 'info');
    const btn = document.getElementById('btnSincronizarNFE');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sincronizando...';
    }
    try {
        if (window.sincronizarVendasML) {
            await window.sincronizarVendasML();
        } else {
            console.warn('Função sincronizarVendasML não disponível');
        }
        await carregarVendasSemNFE();
        showToast('Sincronização concluída!', 'success');
    } catch (error) {
        console.error('Erro na sincronização:', error);
        showToast('Erro na sincronização', 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-sync-alt"></i> Sincronizar Vendas';
        }
    }
}

// ============================================
// FUNÇÃO PARA ABRIR O SISTEMA (chamada pelo sidebar)
// ============================================
window.abrirSistemaEstoque = function() {
    let userData = null;
    
    if (window.currentUser) {
        userData = window.currentUser;
    } else {
        const storedUser = localStorage.getItem('wheeltech_user');
        if (storedUser) {
            try {
                userData = JSON.parse(storedUser);
            } catch(e) {}
        }
    }
    if (!userData) {
        const userNameElem = document.getElementById('userName');
        const userRoleElem = document.getElementById('userRole');
        if (userNameElem && userNameElem.textContent !== 'Usuário') {
            userData = {
                name: userNameElem.textContent,
                role: userRoleElem ? userRoleElem.textContent : 'Usuário',
                avatar: userNameElem.textContent.charAt(0).toUpperCase()
            };
        }
    }
    
    if (!userData) {
        console.warn('⚠️ Dados do usuário não encontrados, mas permitindo acesso');
        userData = { name: 'Usuário', role: 'Usuário', avatar: 'U' };
    }
    
    if (!window.currentUser) {
        window.currentUser = userData;
    }
    
    const sistemas = ['mainSystem', 'salesSystem', 'reembolsosSystem', 'caixaSystem', 'reviewsSystem', 'folgasSystem', 'shippingSystem'];
    sistemas.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });
    
    const estoqueSystem = document.getElementById('estoqueSystem');
    if (!estoqueSystem) {
        showToast('Sistema de estoque não encontrado', 'error');
        return;
    }
    estoqueSystem.classList.remove('hidden');
    
    const estoqueUserName = document.getElementById('estoqueUserName');
    const estoqueUserAvatar = document.getElementById('estoqueUserAvatar');
    const estoqueUserRole = document.getElementById('estoqueUserRole');
    if (estoqueUserName) estoqueUserName.textContent = userData.name;
    if (estoqueUserAvatar) estoqueUserAvatar.textContent = userData.avatar || userData.name.charAt(0).toUpperCase();
    if (estoqueUserRole) estoqueUserRole.textContent = userData.role;
    
    // Garantir que os botões estejam presentes
    const header = document.querySelector('#abaNfe .card-header .d-flex');
    if (header) {
        if (!document.getElementById('btnSincronizarNFE')) {
            const syncBtn = document.createElement('button');
            syncBtn.id = 'btnSincronizarNFE';
            syncBtn.className = 'btn btn-info ml-2';
            syncBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Sincronizar Vendas';
            syncBtn.onclick = sincronizarVendasMLparaNFE;
            header.appendChild(syncBtn);
        }
        if (!document.getElementById('btnAtualizarListaNFE')) {
            const refreshBtn = document.createElement('button');
            refreshBtn.id = 'btnAtualizarListaNFE';
            refreshBtn.className = 'btn btn-primary ml-2';
            refreshBtn.innerHTML = '<i class="fas fa-refresh"></i> Atualizar Lista';
            refreshBtn.onclick = carregarVendasSemNFE;
            header.appendChild(refreshBtn);
        }
    } else {
        console.warn('⚠️ Seletor #abaNfe .card-header .d-flex não encontrado. Os botões não serão criados.');
    }
    
    if (typeof mudarAbaEstoque === 'function') {
        mudarAbaEstoque('nfe');
    }
    
    carregarVendasSemNFE();
    showToast('Sistema de estoque carregado', 'info');
};

// ============================================
// EXPORTAR FUNÇÕES PARA O ESCOPO GLOBAL
// ============================================
window.carregarVendasSemNFE = carregarVendasSemNFE;
window.selecionarVendaNFE = selecionarVendaNFE;
window.forcarMarcarComoEmitida = forcarMarcarComoEmitida;
window.novaNFEDoZero = novaNFEDoZero;
window.gerarNFE = gerarNFE;
window.copiarXML = copiarXML;
window.baixarXML = baixarXML;
window.marcarComoEmitida = marcarComoEmitida;
window.sincronizarVendasMLparaNFE = sincronizarVendasMLparaNFE;
window.toggleSelecionarVenda = toggleSelecionarVenda;
window.selecionarTodas = selecionarTodas;
window.limparSelecao = limparSelecao;
window.marcarSelecionadasComoEmitidas = marcarSelecionadasComoEmitidas;