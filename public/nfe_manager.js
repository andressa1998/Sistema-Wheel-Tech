// nfe_manager.js - Versão completa com edição de produtos, fallback de APIs e integração ML
window.showToast = window.showToast || showToast;

// Configurações globais
if (!window.WORKER_URL) window.WORKER_URL = 'https://purple-bonus-3b1c.andmiotto1998.workers.dev';
if (!window.API_BASE_URL) window.API_BASE_URL = 'http://localhost:3000';

let vendasPendentes = [];
let pendingEmitOrderId = null;
let produtosEditados = [];
let vendaIdParaEdicao = null;

// ===== VERIFICAR SE É FULL (mesma lógica do shipping_simple.js) =====
function isFullByAnyField(item) {
    const text = `${item.titulo || ''} ${item.mlb || ''} ${item.id || ''} ${item.shipping?.logistic_type || ''} ${item.tags?.join(' ') || ''}`.toLowerCase();
    return /full|fulfillment/.test(text);
}
window.isFullByAnyField = isFullByAnyField;

// ===================== EDITAR PRODUTOS ANTES DA EMISSÃO =====================
async function abrirModalEdicaoProdutos(orderId) {
    console.log('🔧 Abrindo edição de produtos para venda:', orderId);
    vendaIdParaEdicao = orderId;

    let token = localStorage.getItem('ml_access_token');
    if (!token && typeof window.getValidToken === 'function') {
        const tokenData = await window.getValidToken();
        token = tokenData?.access_token;
    }
    if (!token) {
        showToast('Token ML não disponível', 'error');
        return;
    }

    try {
        const url = `https://api.mercadolibre.com/orders/${orderId}`;
        const proxyUrl = `${window.WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(url)}&token=${encodeURIComponent(token)}`;
        const response = await fetch(proxyUrl);
        if (!response.ok) throw new Error('Erro ao buscar venda');
        const venda = await response.json();

        const items = venda.order_items || [];
        if (items.length === 0) {
            showToast('Nenhum produto encontrado', 'warning');
            return;
        }

        produtosEditados = items.map(item => ({
            nome: item.item.title,
            quantidade: item.quantity || 1,
            valor_unitario: item.unit_price || 0,
            sku: item.item.seller_sku || 'SEM_SKU',
            ncm: '87149990'
        }));

        // Criar modal
        const modalHTML = `
        <div id="modalEdicaoProdutos" class="modal" style="display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,0.5); z-index:9999;">
            <div class="modal-content" style="max-width:800px; width:90%; max-height:90vh; overflow-y:auto; background:white; padding:25px; border-radius:8px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
                    <h3 style="margin:0;"><i class="fas fa-edit"></i> Editar Produtos</h3>
                    <button onclick="fecharModalEdicaoProdutos()" style="background:none; border:none; font-size:24px; cursor:pointer;">&times;</button>
                </div>
                <p style="color:#6c757d; margin-bottom:15px;">Ajuste a quantidade e o valor unitário de cada produto. O total será recalculado.</p>
                <div class="table-responsive">
                    <table class="table table-striped">
                        <thead>
                            <tr>
                                <th>Produto</th>
                                <th style="width:100px;">Quantidade</th>
                                <th style="width:150px;">Valor Unitário (R$)</th>
                                <th style="width:120px;">Subtotal</th>
                            </tr>
                        </thead>
                        <tbody id="produtosEditaveisBody">
                            ${produtosEditados.map((p, index) => `
                                <tr>
                                    <td><span title="${p.nome}">${p.nome.length > 40 ? p.nome.substring(0,40)+'...' : p.nome}</span></td>
                                    <td>
                                        <input type="number" class="form-control form-control-sm qtd-produto" 
                                               data-index="${index}" value="${p.quantidade}" min="0.01" step="0.01">
                                    </td>
                                    <td>
                                        <input type="number" class="form-control form-control-sm valor-produto" 
                                               data-index="${index}" value="${p.valor_unitario}" min="0" step="0.01">
                                    </td>
                                    <td class="subtotal-produto">R$ ${(p.quantidade * p.valor_unitario).toFixed(2)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                        <tfoot>
                            <tr style="font-weight:bold; background:#f8f9fa;">
                                <td colspan="3" style="text-align:right;">Total da Nota:</td>
                                <td id="totalGeralProdutos">R$ ${produtosEditados.reduce((acc, p) => acc + (p.quantidade * p.valor_unitario), 0).toFixed(2)}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
                <div class="d-flex justify-content-end gap-2 mt-3">
                    <button class="btn btn-secondary" onclick="fecharModalEdicaoProdutos()">Cancelar</button>
                    <button class="btn btn-success" onclick="confirmarProdutosEditados()"><i class="fas fa-check"></i> Confirmar Valores</button>
                </div>
            </div>
        </div>`;

        const modalContainer = document.createElement('div');
        modalContainer.innerHTML = modalHTML;
        document.body.appendChild(modalContainer.firstElementChild);

        // Event listeners para recalcular subtotal
        document.querySelectorAll('.qtd-produto, .valor-produto').forEach(input => {
            input.addEventListener('input', function() {
                const idx = parseInt(this.dataset.index);
                const row = this.closest('tr');
                const qtdInput = row.querySelector('.qtd-produto');
                const valorInput = row.querySelector('.valor-produto');
                const subtotalCell = row.querySelector('.subtotal-produto');
                const qtd = parseFloat(qtdInput.value) || 0;
                const valor = parseFloat(valorInput.value) || 0;
                const subtotal = qtd * valor;
                subtotalCell.textContent = `R$ ${subtotal.toFixed(2)}`;
                produtosEditados[idx].quantidade = qtd;
                produtosEditados[idx].valor_unitario = valor;
                recalcularTotalGeral();
            });
        });

        function recalcularTotalGeral() {
            let total = 0;
            produtosEditados.forEach(p => total += p.quantidade * p.valor_unitario);
            document.getElementById('totalGeralProdutos').textContent = `R$ ${total.toFixed(2)}`;
        }

    } catch (error) {
        console.error('Erro ao carregar produtos:', error);
        showToast('Erro ao carregar produtos: ' + error.message, 'error');
    }
}

function fecharModalEdicaoProdutos() {
    const modal = document.getElementById('modalEdicaoProdutos');
    if (modal) modal.remove();
    // Não reseta vendaIdParaEdicao aqui
}

function confirmarProdutosEditados() {
    const vendaId = vendaIdParaEdicao;
    if (!vendaId) {
        showToast('❌ ID da venda não encontrado', 'error');
        return;
    }
    window.produtosParaEmissao = produtosEditados.map(p => ({
        nome: p.nome,
        quantidade: p.quantidade,
        valor_unitario: p.valor_unitario,
        sku: p.sku,
        ncm: p.ncm
    }));
    fecharModalEdicaoProdutos();
    emitirNFEParaVenda(vendaId);
    // Reset após uso (opcional, pois emitirNFEParaVenda também valida)
    vendaIdParaEdicao = null;
}

// ===================== ABAS =====================
async function mostrarAbaNFE(aba) {
    const abaVendas = document.getElementById('abaVendas');
    const abaEmitidas = document.getElementById('abaEmitidas');
    const abaAvulsa = document.getElementById('abaAvulsa');
    const abaTransportadoras = document.getElementById('abaTransportadoras');
    const abaClientes = document.getElementById('abaClientes');
    
    if (abaVendas) abaVendas.classList.add('hidden');
    if (abaEmitidas) abaEmitidas.classList.add('hidden');
    if (abaAvulsa) abaAvulsa.classList.add('hidden');
    if (abaTransportadoras) abaTransportadoras.classList.add('hidden');
    if (abaClientes) abaClientes.classList.add('hidden');
    
    const target = document.getElementById(`aba${aba.charAt(0).toUpperCase() + aba.slice(1)}`);
    if (target) target.classList.remove('hidden');
    
    const botoes = ['Vendas', 'Emitidas', 'Avulsa', 'Transportadoras', 'Clientes'];
    botoes.forEach(btn => {
        const el = document.getElementById(`tab${btn}Btn`);
        if (el) {
            if (btn.toLowerCase() === aba) {
                el.classList.remove('btn-outline-primary');
                el.classList.add('btn-primary');
            } else {
                el.classList.remove('btn-primary');
                el.classList.add('btn-outline-primary');
            }
        }
    });
    
    if (aba === 'vendas') await carregarVendasPendentes();
    if (aba === 'emitidas') await carregarNFesEmitidas();
    if (aba === 'transportadoras') await carregarTransportadoras();
    if (aba === 'clientes') await carregarClientes();
}

// ===================== LISTAR VENDAS PENDENTES =====================
async function carregarVendasPendentes() {
    const tbody = document.getElementById('vendasPendentesBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="6" class="text-center"><div class="spinner"></div> Carregando vendas do ML...<\/td><\/tr>';

    try {
        let token = localStorage.getItem('ml_access_token');
        if (!token && typeof window.getValidToken === 'function') {
            const tokenData = await window.getValidToken();
            token = tokenData?.access_token;
        }
        if (!token) throw new Error('Token ML não disponível');

        const url = `https://api.mercadolibre.com/orders/search?seller=415176739&sort=date_desc&order.status=paid&limit=50`;
        const proxyUrl = `${window.WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(url)}&token=${encodeURIComponent(token)}`;
        const response = await fetch(proxyUrl);
        const data = await response.json();
        const results = data.results || [];

        if (results.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center">Nenhuma venda encontrada<\/td><\/tr>';
            return;
        }

        // Buscar IDs com NF-e no Supabase (tabela nfe_emitidas)
        let idsComNFE = new Set();
        try {
            const { data: nfes, error } = await window.supabaseClient
                .from('nfe_emitidas')
                .select('venda_id');
            if (!error && nfes) {
                idsComNFE = new Set(nfes.map(n => String(n.venda_id)).filter(id => id !== 'null' && id !== null));
                console.log(`📋 ${idsComNFE.size} vendas com NF-e (tabela nfe_emitidas)`);
            }
        } catch (e) {
            console.warn('⚠️ Erro ao consultar nfe_emitidas:', e);
        }

        // Filtrar pendentes: não têm NF-e e não são FULL
        const pendentes = results.filter(v => {
            const idVenda = String(v.id);
            if (idsComNFE.has(idVenda)) return false;
            if (typeof isFullByAnyField === 'function' && isFullByAnyField(v)) {
                console.log(`🚫 Venda FULL ignorada: ${idVenda}`);
                return false;
            }
            return true;
        });

        if (pendentes.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center">Todas as vendas já possuem NF-e ou são FULL<\/td><\/tr>';
            return;
        }

        vendasPendentes = pendentes;

        tbody.innerHTML = pendentes.map(v => `
            <tr>
                <td>${v.id}</td>
                <td>${new Date(v.date_created).toLocaleDateString('pt-BR')}</td>
                <td>${v.buyer?.nickname || 'N/I'}</td>
                <td>${v.order_items?.[0]?.item?.seller_sku || 'N/A'}</td>
                <td>R$ ${v.total_amount?.toFixed(2)}</td>
                <td>
                    <button class="btn btn-sm btn-success btn-emitir-nfe" data-venda-id="${v.id}">
                        <i class="fas fa-file-invoice"></i> Emitir NF-e
                    </button>
                </td>
            </tr>`).join('');

        document.querySelectorAll('#vendasPendentesBody .btn-emitir-nfe').forEach(btn => {
            btn.removeEventListener('click', handleEmitirNFEClick);
            btn.addEventListener('click', handleEmitirNFEClick);
        });

    } catch (error) {
        console.error('❌ Erro ao carregar vendas pendentes:', error);
        tbody.innerHTML = `<tr><td colspan="6" class="text-center text-danger">Erro: ${error.message}<\/td><\/tr>`;
    }
}

function handleEmitirNFEClick(event) {
    const vendaId = event.currentTarget.dataset.vendaId;
    if (!vendaId) {
        showToast('❌ ID da venda não encontrado', 'error');
        return;
    }
    abrirModalEdicaoProdutos(vendaId);
}

// ===================== EMITIR NF-e PARA UMA VENDA =====================
async function emitirNFEParaVenda(orderId) {
    console.log('🔵 Iniciando emitirNFEParaVenda para:', orderId);
    
    // VALIDAÇÃO MAIS ROBUSTA
    if (!orderId || orderId === 'null' || orderId === 'undefined' || orderId === '') {
        showToast('❌ ID da venda inválido', 'error');
        return;
    }
    
    pendingEmitOrderId = orderId;

    // Limpa o formulário do modal
    const campos = ['clienteNome', 'clienteDocumento', 'clienteEndereco', 'clienteNumero', 'clienteBairro', 'clienteCidade', 'clienteUF', 'clienteCEP'];
    campos.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            if (id === 'clienteNumero') el.value = 'S/N';
            else el.value = '';
        } else {
            console.warn(`⚠️ Elemento ${id} não encontrado no DOM`);
        }
    });

    function getValue(field) {
        if (!field) return '';
        if (typeof field === 'string') return field;
        if (typeof field === 'object' && field.name) return field.name;
        return '';
    }

    try {
        let token = localStorage.getItem('ml_access_token');
        if (!token && typeof window.getValidToken === 'function') {
            const tokenData = await window.getValidToken();
            token = tokenData?.access_token;
        }
        if (!token) {
            showToast('⚠️ Token ML não disponível. Preencha manualmente.', 'warning');
            abrirModalCliente();
            return;
        }

        // Buscar dados da ordem
        const url = `https://api.mercadolibre.com/orders/${orderId}`;
        let venda = null;
        let ultimoErro = null;

        // Tentativa 1: via Worker
        try {
            const proxyUrl = `${window.WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(url)}&token=${encodeURIComponent(token)}`;
            console.log('📤 Chamando Worker:', proxyUrl.substring(0, 100) + '...');
            const response = await fetch(proxyUrl);
            if (response.ok) {
                venda = await response.json();
                console.log('✅ Venda obtida via Worker');
            } else {
                const errorText = await response.text();
                ultimoErro = `Worker falhou: ${response.status} - ${errorText}`;
                console.warn('⚠️', ultimoErro);
            }
        } catch (workerError) {
            ultimoErro = workerError.message;
            console.warn('⚠️ Worker falhou:', workerError);
        }

        // Tentativa 2: fallback via proxy CORS
        if (!venda) {
            try {
                console.log('📤 Tentando fallback via CORS proxy...');
                const fallbackUrl = `https://cors-anywhere.herokuapp.com/${url}`;
                const response = await fetch(fallbackUrl, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (response.ok) {
                    venda = await response.json();
                    console.log('✅ Venda obtida via CORS proxy');
                } else {
                    ultimoErro = `CORS proxy falhou: ${response.status}`;
                    console.warn('⚠️', ultimoErro);
                }
            } catch (fallbackError) {
                ultimoErro = fallbackError.message;
                console.warn('⚠️ Fallback falhou:', fallbackError);
            }
        }

        // Tentativa 3: chamada direta
        if (!venda) {
            try {
                console.log('📤 Tentando chamada direta...');
                const response = await fetch(url, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (response.ok) {
                    venda = await response.json();
                    console.log('✅ Venda obtida via chamada direta');
                } else {
                    ultimoErro = `Chamada direta falhou: ${response.status}`;
                    console.warn('⚠️', ultimoErro);
                }
            } catch (directError) {
                ultimoErro = directError.message;
                console.warn('⚠️ Chamada direta falhou:', directError);
            }
        }

        if (!venda) {
            showToast(`❌ Não foi possível obter os dados da venda. ${ultimoErro || ''}`, 'error');
            abrirModalCliente();
            return;
        }

        // Verificar FULL
        if (typeof isFullByAnyField === 'function' && isFullByAnyField(venda)) {
            console.log('🚫 Venda FULL – NF-e não permitida.');
            showToast('🚫 Esta venda é FULL e não permite emissão manual de NF-e.', 'warning');
            abrirModalCliente();
            return;
        }

        // Buscar shipment para endereço
        let address = {};
        if (venda.shipping && venda.shipping.id) {
            try {
                const shipUrl = `https://api.mercadolibre.com/shipments/${venda.shipping.id}`;
                const shipProxyUrl = `${window.WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(shipUrl)}&token=${encodeURIComponent(token)}`;
                const shipResponse = await fetch(shipProxyUrl);
                if (shipResponse.ok) {
                    const shipment = await shipResponse.json();
                    if (shipment.receiver_address) {
                        address = shipment.receiver_address;
                    } else if (shipment.shipping_option && shipment.shipping_option.receiver_address) {
                        address = shipment.shipping_option.receiver_address;
                    }
                }
            } catch (shipError) {
                console.warn('⚠️ Erro ao buscar shipment:', shipError);
            }
        }

        // Fallback para endereço do comprador
        if (!address.address_line && !address.street_name && venda.buyer && venda.buyer.address) {
            address = venda.buyer.address;
        }

        // Preencher nome
        const buyer = venda.buyer || {};
        const nome = `${buyer.first_name || ''} ${buyer.last_name || ''}`.trim() || buyer.nickname || '';
        document.getElementById('clienteNome').value = nome;

        // Preencher endereço
        document.getElementById('clienteEndereco').value = address.address_line || address.street_name || '';
        document.getElementById('clienteNumero').value = address.street_number || 'S/N';
        document.getElementById('clienteBairro').value = getValue(address.neighborhood);
        document.getElementById('clienteCidade').value = getValue(address.city);
        document.getElementById('clienteUF').value = getValue(address.state);
        document.getElementById('clienteCEP').value = address.zip_code ? address.zip_code.replace(/\D/g, '') : '';

        // CPF/CNPJ em branco
        document.getElementById('clienteDocumento').value = '';

        console.log('📋 Dados preenchidos:', {
            nome,
            endereco: document.getElementById('clienteEndereco').value,
            cidade: document.getElementById('clienteCidade').value,
            uf: document.getElementById('clienteUF').value
        });

        window._mlAccessToken = token;
        abrirModalCliente();

    } catch (error) {
        console.error('❌ Erro ao buscar dados da venda:', error);
        showToast('❌ Erro ao carregar dados. Preencha manualmente.', 'error');
        abrirModalCliente();
    }
}

function abrirModalCliente() {
    const modal = document.getElementById('modalDadosClienteNFE');
    if (modal) {
        modal.classList.remove('hidden');
        console.log('✅ Modal de dados do cliente aberto');
    } else {
        console.error('❌ Modal modalDadosClienteNFE não encontrado');
        showToast('Erro: modal não encontrado', 'error');
    }
}

function fecharModalDadosClienteNFE() {
    const modal = document.getElementById('modalDadosClienteNFE');
    if (modal) modal.classList.add('hidden');
    pendingEmitOrderId = null;
}

// ===================== CONFIRMAR E EMITIR NF-e =====================
async function confirmarEmissaoNFE() {
    const orderId = pendingEmitOrderId;
    if (!orderId) {
        showToast('Nenhuma venda selecionada', 'error');
        fecharModalDadosClienteNFE();
        return;
    }

    // Capturar dados do cliente
    const nome = document.getElementById('clienteNome').value.trim();
    const documento = document.getElementById('clienteDocumento').value.trim().replace(/\D/g, '');
    const endereco = document.getElementById('clienteEndereco').value.trim();
    const numero = document.getElementById('clienteNumero').value.trim() || 'S/N';
    const bairro = document.getElementById('clienteBairro').value.trim() || '';
    const cidade = document.getElementById('clienteCidade').value.trim();
    const uf = document.getElementById('clienteUF').value.trim().toUpperCase();
    const cep = document.getElementById('clienteCEP').value.trim().replace(/\D/g, '');

    if (!nome) { showToast('Nome é obrigatório', 'warning'); return; }
    if (!documento || (documento.length !== 11 && documento.length !== 14)) {
        showToast('CPF/CNPJ inválido (11 ou 14 dígitos)', 'warning');
        return;
    }
    if (!endereco) { showToast('Endereço é obrigatório', 'warning'); return; }
    if (!cidade) { showToast('Cidade é obrigatória', 'warning'); return; }
    if (uf.length !== 2) { showToast('UF deve ter 2 letras', 'warning'); return; }

    fecharModalDadosClienteNFE();

    // Mostrar loading no botão
    const btn = document.querySelector(`#vendasPendentesBody .btn-emitir-nfe[data-venda-id="${orderId}"]`);
    let originalText = '';
    if (btn) {
        originalText = btn.innerHTML;
        btn.innerHTML = '<span class="spinner"></span> Emitindo...';
        btn.disabled = true;
    }

    try {
        // 1. Produtos: usar os editados (window.produtosParaEmissao) ou buscar da API
        let produtos = window.produtosParaEmissao;
        if (!produtos || produtos.length === 0) {
            // Fallback: buscar da venda
            let token = localStorage.getItem('ml_access_token');
            if (!token && typeof window.getValidToken === 'function') {
                const tokenData = await window.getValidToken();
                token = tokenData?.access_token;
            }
            if (token) {
                const url = `https://api.mercadolibre.com/orders/${orderId}`;
                const proxyUrl = `${window.WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(url)}&token=${encodeURIComponent(token)}`;
                const response = await fetch(proxyUrl);
                if (response.ok) {
                    const venda = await response.json();
                    produtos = (venda.order_items || []).map(item => ({
                        nome: item.item.title,
                        quantidade: item.quantity || 1,
                        valor_unitario: item.unit_price || 0,
                        sku: item.item.seller_sku || 'SEM_SKU',
                        ncm: '87149990'
                    }));
                }
            }
        }
        if (!produtos || produtos.length === 0) {
            produtos = [{
                nome: 'Produto não identificado',
                quantidade: 1,
                valor_unitario: 0,
                sku: 'SEM_SKU',
                ncm: '87149990'
            }];
        }

        const cfop = (uf === 'PR') ? '5102' : '6108';
        const mlToken = window._mlAccessToken || null;

        const payload = {
            venda_id: String(orderId),
            cliente: {
                nome, documento, endereco, numero, bairro, cidade, uf, cep
            },
            produtos: produtos,
            cfop: cfop,
            natureza_operacao: 'VENDA',
            modalidade_frete: '9',
            transportadora_id: null,
            ml_access_token: mlToken
        };

        const emitResponse = await fetch(`${window.API_BASE_URL}/nfe/emitir`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const result = await emitResponse.json();

        if (result.success) {
            showToast(`✅ NF-e emitida! Protocolo: ${result.protocolo}`, 'success');
            // Limpar cache local
            window.produtosParaEmissao = null;
            // Recarregar listas
            await carregarVendasPendentes();
            await carregarNFesEmitidas();
        } else {
            showToast(`❌ Erro: ${result.error}`, 'error');
        }
    } catch (error) {
        console.error('❌ Erro na emissão:', error);
        showToast(`Erro: ${error.message}`, 'error');
    } finally {
        if (btn) {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
        window._mlAccessToken = null;
        window.produtosParaEmissao = null;
    }
}

// ===================== NF-ES EMITIDAS =====================
async function carregarNFesEmitidas() {
    const tbody = document.getElementById('nfesEmitidasBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="6" class="text-center"><div class="spinner"></div> Carregando...<\/td><\/tr>';
    try {
        const response = await fetch(`${window.API_BASE_URL}/nfe/listar-nfes`);
        const data = await response.json();
        if (!data.success) throw new Error(data.error);
        const nfes = data.notas || [];
        if (!nfes.length) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center">Nenhuma NF-e emitida<\/td><\/tr>';
            return;
        }
        tbody.innerHTML = nfes.map(nfe => {
            const chave = nfe.chave_acesso || nfe.chave || 'N/A';
            const protocolo = nfe.protocolo || '-';
            const dataEmissao = nfe.data_emissao ? new Date(nfe.data_emissao).toLocaleDateString('pt-BR') : '-';
            const valorTotal = nfe.valor_total ? parseFloat(nfe.valor_total).toFixed(2) : '—';
            const clienteNome = nfe.cliente_nome || nfe.cliente?.nome || '-';

            return `
            <tr>
                <td><small>${chave}</small></td>
                <td>${protocolo}</td>
                <td>${clienteNome}</td>
                <td>R$ ${valorTotal}</td>
                <td>${dataEmissao}</td>
                <td>
                    <button class="btn btn-sm btn-info" onclick="visualizarNFE('${chave}')">Visualizar</button>
                    <button class="btn btn-sm btn-secondary" onclick="baixarXMLNFE('${chave}')">XML</button>
                    ${!nfe.cancelada ? `<button class="btn btn-sm btn-danger" onclick="cancelarNFE('${chave}')">Cancelar</button>` : '<span class="badge badge-danger">Cancelada</span>'}
                </td>
            </tr>`;
        }).join('');
    } catch (error) {
        console.error(error);
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-danger">Erro ao carregar NF-es<\/td><\/tr>';
    }
}

// ===== VISUALIZAR, BAIXAR, CANCELAR =====
async function visualizarNFE(chaveAcesso) {
    try {
        const response = await fetch(`${window.API_BASE_URL}/nfe/buscar-xml?chave=${chaveAcesso}`);
        const data = await response.json();
        if (!data.xml) {
            window.showToast('XML não encontrado', 'error');
            return;
        }
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(data.xml, 'application/xml');
        const infNFe = xmlDoc.querySelector('infNFe');
        const chave = infNFe.getAttribute('Id').replace('NFe', '');
        const emitNome = infNFe.querySelector('emit xNome')?.textContent || '';
        const destNome = infNFe.querySelector('dest xNome')?.textContent || '';
        const vNF = infNFe.querySelector('ICMSTot vNF')?.textContent || '0';
        const protocolo = infNFe.querySelector('nProt')?.textContent || 'Não informado';
        
        const html = `<!DOCTYPE html>
        <html>
        <head><title>DANFE - ${chave}</title>
        <style>body { font-family: Arial; margin: 20px; } .card { border:1px solid #ccc; padding:15px; margin-bottom:15px; } .row{display:flex;} .label{width:130px;font-weight:bold;} @media print{ .no-print{display:none;} }</style>
        </head>
        <body>
            <div class="no-print" style="text-align:center; margin-bottom:20px;">
                <button onclick="window.print()">Imprimir</button>
                <button onclick="window.close()">Fechar</button>
            </div>
            <div class="header"><h2>Nota Fiscal Eletrônica</h2><p>Chave: ${chave}</p><p>Protocolo: ${protocolo}</p></div>
            <div class="card"><h3>Emitente</h3><div class="row"><div class="label">Nome:</div><div>${emitNome}</div></div></div>
            <div class="card"><h3>Destinatário</h3><div class="row"><div class="label">Nome:</div><div>${destNome}</div></div></div>
            <div class="card"><h3>Valor Total</h3><div class="row"><div class="label">R$:</div><div>${vNF}</div></div></div>
            <div class="card"><h3>Produtos</h3>${Array.from(xmlDoc.querySelectorAll('det')).map(det => {
                const prod = det.querySelector('prod');
                return `<div>${prod.querySelector('xProd')?.textContent} - Quant: ${prod.querySelector('qCom')?.textContent} - Valor: R$ ${prod.querySelector('vProd')?.textContent}</div>`;
            }).join('')}</div>
        </body>
        </html>`;
        const win = window.open();
        win.document.write(html);
        win.document.close();
    } catch (error) {
        window.showToast('Erro ao visualizar NF-e', 'error');
    }
}

async function baixarXMLNFE(chaveAcesso) {
    try {
        const response = await fetch(`${window.API_BASE_URL}/nfe/buscar-xml?chave=${chaveAcesso}`);
        const data = await response.json();
        if (!data.xml) {
            window.showToast('XML não encontrado', 'error');
            return;
        }
        const blob = new Blob([data.xml], { type: 'application/xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `NFe_${chaveAcesso}.xml`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (error) {
        window.showToast('Erro ao baixar XML', 'error');
    }
}

async function cancelarNFE(chaveAcesso) {
    const justificativa = prompt('Informe a justificativa para cancelamento:');
    if (!justificativa) return;
    try {
        const response = await fetch(`${window.API_BASE_URL}/nfe/cancelar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chaveAcesso, justificativa })
        });
        const result = await response.json();
        if (result.success) {
            window.showToast('NF-e cancelada com sucesso', 'success');
            await carregarNFesEmitidas();
        } else {
            window.showToast('Erro ao cancelar: ' + result.error, 'error');
        }
    } catch (error) {
        window.showToast('Erro de comunicação', 'error');
    }
}

// ===================== TRANSPORTADORAS =====================
async function carregarTransportadoras() {
    const tbody = document.getElementById('transportadorasBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="4" class="text-center"><div class="spinner"></div> Carregando...<\/td><\/tr>';
    try {
        const response = await fetch(`${window.API_BASE_URL}/nfe/transportadoras`);
        const data = await response.json();
        if (!data.success) throw new Error(data.error);
        const transportadoras = data.transportadoras || [];
        if (!transportadoras.length) {
            tbody.innerHTML = '<td><td colspan="4" class="text-center">Nenhuma transportadora cadastrada<\/td><\/tr>';
            return;
        }
        tbody.innerHTML = transportadoras.map(t => `
            <tr>
                <td>${t.nome}<\/td>
                <td>${t.cnpj}<\/td>
                <td>${t.ie || '-'}<\/td>
                <td><button class="btn btn-sm btn-danger" onclick="excluirTransportadora(${t.id})">Excluir<\/button><\/td>
            </tr>`).join('');
        const select = document.getElementById('avulsaTransportadoraId');
        if (select) select.innerHTML = '<option value="">Selecione</option>' + transportadoras.map(t => `<option value="${t.id}">${t.nome}</option>`).join('');
    } catch (error) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center text-danger">Erro ao carregar<\/td><\/tr>';
    }
}

async function excluirTransportadora(id) {
    if (!confirm('Excluir esta transportadora?')) return;
    try {
        const response = await fetch(`${window.API_BASE_URL}/nfe/transportadoras/${id}`, { method: 'DELETE' });
        if (response.ok) {
            window.showToast('Transportadora excluída', 'success');
            await carregarTransportadoras();
        } else {
            window.showToast('Erro ao excluir', 'error');
        }
    } catch (error) {
        window.showToast('Erro de comunicação', 'error');
    }
}

// ===================== CLIENTES =====================
async function carregarClientes() {
    const tbody = document.getElementById('clientesBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="4" class="text-center"><div class="spinner"></div> Carregando...<\/td><\/tr>';
    try {
        const response = await fetch(`${window.API_BASE_URL}/nfe/clientes`);
        const data = await response.json();
        if (!data.success) throw new Error(data.error);
        const clientes = data.clientes || [];
        if (!clientes.length) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center">Nenhum cliente cadastrado<\/td><\/tr>';
            return;
        }
        tbody.innerHTML = clientes.map(c => `
            <tr>
                <td>${c.nome}<\/td>
                <td>${c.documento || '-'}<\/td>
                <td>${c.logradouro || ''}, ${c.numero || ''} - ${c.cidade || ''}<\/td>
                <td><button class="btn btn-sm btn-danger" onclick="excluirCliente(${c.id})">Excluir<\/button><\/td>
            </tr>`).join('');
        const select = document.getElementById('avulsaClienteId');
        if (select) select.innerHTML = '<option value="">Selecione</option>' + clientes.map(c => `<option value="${c.id}">${c.nome} (${c.documento})</option>`).join('');
    } catch (error) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center text-danger">Erro ao carregar<\/td><\/tr>';
    }
}

async function excluirCliente(id) {
    if (!confirm('Excluir este cliente?')) return;
    try {
        const response = await fetch(`${window.API_BASE_URL}/nfe/clientes/${id}`, { method: 'DELETE' });
        if (response.ok) {
            window.showToast('Cliente excluído', 'success');
            await carregarClientes();
        } else {
            window.showToast('Erro ao excluir', 'error');
        }
    } catch (error) {
        window.showToast('Erro de comunicação', 'error');
    }
}

// ===================== EMISSÃO AVULSA =====================
async function emitirNFEAvulsa() {
    const clienteId = document.getElementById('avulsaClienteId').value;
    if (!clienteId) {
        window.showToast('Selecione um cliente', 'warning');
        return;
    }
    const transportadoraId = document.getElementById('avulsaTransportadoraId').value || null;
    const cfop = document.getElementById('avulsaCfop').value;
    const natOp = document.getElementById('avulsaNatOp').value;
    const modFrete = document.getElementById('avulsaModFrete').value;
    let produtos;
    try {
        produtos = JSON.parse(document.getElementById('avulsaProdutos').value);
        if (!Array.isArray(produtos) || !produtos.length) throw new Error();
    } catch (e) {
        window.showToast('Produtos inválidos. Use um array JSON válido.', 'error');
        return;
    }
    const dados = { cliente: { id: clienteId }, produtos, cfop, natureza_operacao: natOp, modalidade_frete: modFrete, transportadora_id: transportadoraId };
    const btn = event.target;
    const original = btn.innerHTML;
    btn.innerHTML = '<span class="spinner"></span> Emitindo...';
    btn.disabled = true;
    try {
        const response = await fetch(`${window.API_BASE_URL}/nfe/emitir-avulsa`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dados)
        });
        const result = await response.json();
        if (result.success) {
            window.showToast('NF-e avulsa emitida com sucesso!', 'success');
            limparFormAvulsa();
            await carregarNFesEmitidas();
        } else {
            window.showToast('Erro: ' + result.error, 'error');
        }
    } catch (error) {
        window.showToast('Erro de comunicação', 'error');
    } finally {
        btn.innerHTML = original;
        btn.disabled = false;
    }
}

function limparFormAvulsa() {
    document.getElementById('avulsaClienteId').value = '';
    document.getElementById('avulsaTransportadoraId').value = '';
    document.getElementById('avulsaCfop').value = '5102';
    document.getElementById('avulsaNatOp').value = 'VENDA';
    document.getElementById('avulsaModFrete').value = '9';
    document.getElementById('avulsaProdutos').value = '';
}

async function sincronizarVendasML() {
    window.showToast('A sincronização de vendas é feita automaticamente ao acessar a aba. Use o botão "Emitir NF-e" para cada venda.', 'info');
}

function inicializarAbaNFE() {
    mostrarAbaNFE('vendas');
}

// ===================== EXPORTAÇÕES GLOBAIS =====================
window.mostrarAbaNFE = mostrarAbaNFE;
window.emitirNFEParaVenda = emitirNFEParaVenda;
window.sincronizarVendasML = sincronizarVendasML;
window.carregarNFesEmitidas = carregarNFesEmitidas;
window.visualizarNFE = visualizarNFE;
window.baixarXMLNFE = baixarXMLNFE;
window.cancelarNFE = cancelarNFE;
window.emitirNFEAvulsa = emitirNFEAvulsa;
window.limparFormAvulsa = limparFormAvulsa;
window.inicializarAbaNFE = inicializarAbaNFE;
window.confirmarEmissaoNFE = confirmarEmissaoNFE;
window.fecharModalDadosClienteNFE = fecharModalDadosClienteNFE;
window.isFullByAnyField = isFullByAnyField;
window.abrirModalEdicaoProdutos = abrirModalEdicaoProdutos;
window.fecharModalEdicaoProdutos = fecharModalEdicaoProdutos;
window.confirmarProdutosEditados = confirmarProdutosEditados;

// ===================== INICIALIZAR EVENT LISTENERS DO MODAL =====================
document.addEventListener('DOMContentLoaded', function() {
    const confirmarBtn = document.getElementById('confirmarModalNFEBtn');
    const cancelarBtn = document.getElementById('cancelarModalNFEBtn');
    if (confirmarBtn) confirmarBtn.addEventListener('click', confirmarEmissaoNFE);
    if (cancelarBtn) cancelarBtn.addEventListener('click', fecharModalDadosClienteNFE);
});

console.log('✅ nfe_manager.js carregado (versão completa com fallback)');