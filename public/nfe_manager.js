// nfe_manager.js - Versão completa com edição de produtos, fallback de APIs e integração ML
window.showToast = window.showToast || showToast;

// Configurações globais
if (!window.WORKER_URL) window.WORKER_URL = 'https://purple-bonus-3b1c.andmiotto1998.workers.dev';
if (!window.API_BASE_URL) window.API_BASE_URL = 'https://sistema-wheel-tech.onrender.com';

let vendasPendentes = [];
let pendingEmitOrderId = null;
let produtosEditados = [];
let vendaIdParaEdicao = null;

// ===== VERIFICAR SE É FULL (versão robusta) =====
// ===== VERIFICAR SE É FULL (versão robusta) =====
function isFullByAnyField(item) {
    // 1. Verifica logistic_type (campo mais direto)
    if (item.shipping && item.shipping.logistic_type) {
        const logisticType = item.shipping.logistic_type.toLowerCase();
        if (logisticType === 'fulfillment' || logisticType.includes('full')) {
            return true;
        }
    }

    // 2. Verifica tags (algumas vendas FULL têm a tag "fulfillment")
    if (item.tags && Array.isArray(item.tags)) {
        const hasFulfillmentTag = item.tags.some(tag => 
            tag.toLowerCase() === 'fulfillment' || tag.toLowerCase().includes('full')
        );
        if (hasFulfillmentTag) return true;
    }

    // 3. Fallback: busca nos campos de texto (título, MLB, etc.)
    const text = `${item.titulo || ''} ${item.mlb || ''} ${item.id || ''} ${item.shipping?.logistic_type || ''} ${item.tags?.join(' ') || ''}`.toLowerCase();
    return /full|fulfillment/.test(text);
}

window.isFullByAnyField = isFullByAnyField;

function mapearUF(nomeEstado) {
    const mapa = {
        'acre': 'AC', 'alagoas': 'AL', 'amapá': 'AP', 'amazonas': 'AM',
        'bahia': 'BA', 'ceará': 'CE', 'distrito federal': 'DF', 'espírito santo': 'ES',
        'goiás': 'GO', 'maranhão': 'MA', 'mato grosso': 'MT', 'mato grosso do sul': 'MS',
        'minas gerais': 'MG', 'pará': 'PA', 'paraíba': 'PB', 'paraná': 'PR',
        'pernambuco': 'PE', 'piauí': 'PI', 'rio de janeiro': 'RJ', 'rio grande do norte': 'RN',
        'rio grande do sul': 'RS', 'rondônia': 'RO', 'roraima': 'RR', 'santa catarina': 'SC',
        'são paulo': 'SP', 'sergipe': 'SE', 'tocantins': 'TO'
    };
    if (!nomeEstado) return '';
    const chave = nomeEstado.toLowerCase().trim();
    return mapa[chave] || nomeEstado.toUpperCase().substring(0, 2);
}

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

        // Buscar NCM salvos por SKU
        let ncmPorSku = {};
        try {
            const { data, error } = await window.supabaseClient
                .from('produto_ncm')
                .select('sku, ncm')
                .in('sku', items.map(item => item.item.seller_sku || 'SEM_SKU'));
            if (!error && data) {
                data.forEach(row => ncmPorSku[row.sku] = row.ncm);
            }
        } catch (e) {
            console.warn('Erro ao buscar NCM:', e);
        }

        produtosEditados = items.map(item => {
            const sku = item.item.seller_sku || 'SEM_SKU';
            const ncmSalvo = ncmPorSku[sku] || '87149990';
            return {
                nome: item.item.title,
                quantidade: item.quantity || 1,
                valor_unitario: item.unit_price || 0,
                sku: sku,
                ncm: ncmSalvo
            };
        });

        // Criar modal (sem CFOP)
        const modalHTML = `
        <div id="modalEdicaoProdutos" class="modal" style="display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,0.5); z-index:9999;">
            <div class="modal-content" style="max-width:900px; width:95%; max-height:90vh; overflow-y:auto; background:white; padding:25px; border-radius:8px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
                    <h3 style="margin:0;"><i class="fas fa-edit"></i> Editar Produtos</h3>
                    <button onclick="fecharModalEdicaoProdutos()" style="background:none; border:none; font-size:24px; cursor:pointer;">&times;</button>
                </div>
                <p style="color:#6c757d; margin-bottom:15px;">Ajuste a quantidade, valor unitário e NCM de cada produto. O total será recalculado.</p>
                <div class="table-responsive">
                    <table class="table table-striped">
                        <thead>
                            <tr>
                                <th>Produto</th>
                                <th style="width:100px;">Qtd</th>
                                <th style="width:130px;">Valor Unit.</th>
                                <th style="width:130px;">NCM</th>
                                <th style="width:110px;">Subtotal</th>
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
                                    <td>
                                        <input type="text" class="form-control form-control-sm ncm-produto" 
                                               data-index="${index}" value="${p.ncm}" placeholder="NCM" maxlength="8">
                                    </td>
                                    <td class="subtotal-produto">R$ ${(p.quantidade * p.valor_unitario).toFixed(2)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                        <tfoot>
                            <tr style="font-weight:bold; background:#f8f9fa;">
                                <td colspan="3" style="text-align:right;">Total da Nota:</td>
                                <td id="totalGeralProdutos" style="text-align:right;" colspan="2">R$ ${produtosEditados.reduce((acc, p) => acc + (p.quantidade * p.valor_unitario), 0).toFixed(2)}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>

                <div class="d-flex justify-content-end gap-2 mt-3">
                    <button class="btn btn-secondary" onclick="fecharModalEdicaoProdutos()">Cancelar</button>
                    <button class="btn btn-success" id="confirmarProdutosFinalBtn"><i class="fas fa-check"></i> Confirmar e Emitir NF-e</button>
                </div>
            </div>
        </div>`;

        const modalContainer = document.createElement('div');
        modalContainer.innerHTML = modalHTML;
        document.body.appendChild(modalContainer.firstElementChild);

        // Event listeners para recalcular subtotal e atualizar NCM
        document.querySelectorAll('.qtd-produto, .valor-produto, .ncm-produto').forEach(input => {
            input.addEventListener('input', function() {
                const idx = parseInt(this.dataset.index);
                const row = this.closest('tr');
                const qtdInput = row.querySelector('.qtd-produto');
                const valorInput = row.querySelector('.valor-produto');
                const subtotalCell = row.querySelector('.subtotal-produto');
                const ncmInput = row.querySelector('.ncm-produto');
                const qtd = parseFloat(qtdInput.value) || 0;
                const valor = parseFloat(valorInput.value) || 0;
                const subtotal = qtd * valor;
                subtotalCell.textContent = `R$ ${subtotal.toFixed(2)}`;
                produtosEditados[idx].quantidade = qtd;
                produtosEditados[idx].valor_unitario = valor;
                produtosEditados[idx].ncm = ncmInput.value.trim() || '87149990';
                recalcularTotalGeral();
            });
        });

        function recalcularTotalGeral() {
            let total = 0;
            produtosEditados.forEach(p => total += p.quantidade * p.valor_unitario);
            const totalCell = document.getElementById('totalGeralProdutos');
            if (totalCell) totalCell.textContent = `R$ ${total.toFixed(2)}`;
        }

        // Botão confirmar
        document.getElementById('confirmarProdutosFinalBtn').addEventListener('click', function() {
            confirmarProdutosEditados();
        });

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

async function confirmarProdutosEditados() {
    const vendaId = vendaIdParaEdicao;
    if (!vendaId) {
        showToast('❌ ID da venda não encontrado', 'error');
        return;
    }

    // Salvar NCMs no banco
    const ncmPromises = produtosEditados.map(p => {
        if (p.sku && p.sku !== 'SEM_SKU' && p.ncm) {
            return window.supabaseClient
                .from('produto_ncm')
                .upsert({ sku: p.sku, ncm: p.ncm }, { onConflict: 'sku' });
        }
        return Promise.resolve();
    });
    await Promise.all(ncmPromises);

    // Preparar produtos para emissão
    window.produtosParaEmissao = produtosEditados.map(p => ({
        nome: p.nome,
        quantidade: p.quantidade,
        valor_unitario: p.valor_unitario,
        sku: p.sku,
        ncm: p.ncm || '87149990'
    }));

    fecharModalEdicaoProdutos();
    emitirNFEParaVenda(vendaId);
    vendaIdParaEdicao = null;
}

// ===================== NCM POR SKU =====================
async function buscarNCMporSKU(sku) {
    if (!sku || sku === 'SEM_SKU' || sku === 'N/A') return null;
    try {
        const { data, error } = await window.supabaseClient
            .from('produto_ncm')
            .select('ncm')
            .eq('sku', sku)
            .maybeSingle();
        if (error) throw error;
        return data?.ncm || null;
    } catch (error) {
        console.warn(`⚠️ Erro ao buscar NCM para SKU ${sku}:`, error.message);
        return null;
    }
}

async function salvarNCMporSKU(sku, ncm) {
    if (!sku || sku === 'SEM_SKU' || sku === 'N/A' || !ncm) return;
    try {
        const { error } = await window.supabaseClient
            .from('produto_ncm')
            .upsert({ sku, ncm }, { onConflict: 'sku' });
        if (error) throw error;
        console.log(`✅ NCM ${ncm} salvo para SKU ${sku}`);
    } catch (error) {
        console.warn(`⚠️ Erro ao salvar NCM para SKU ${sku}:`, error.message);
    }
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

async function carregarVendasPendentes() {
    const tbody = document.getElementById('vendasPendentesBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="6" class="text-center"><div class="spinner"></div> Carregando vendas do ML...<\/td><\/tr>';

    try {
        // 1. Obter token ML
        let token = localStorage.getItem('ml_access_token');
        if (!token && typeof window.getValidToken === 'function') {
            const tokenData = await window.getValidToken();
            token = tokenData?.access_token;
        }
        if (!token) throw new Error('Token ML não disponível');

        // 2. Buscar vendas do ML (últimas 50 pagas)
        const url = `https://api.mercadolibre.com/orders/search?seller=415176739&sort=date_desc&order.status=paid&limit=50`;
        const proxyUrl = `${window.WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(url)}&token=${encodeURIComponent(token)}`;
        const response = await fetch(proxyUrl);
        const data = await response.json();
        const results = data.results || [];

        if (results.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center">Nenhuma venda encontrada<\/td><\/tr>';
            return;
        }

        // 3. Buscar IDs com NF-e no Supabase (tabela nfe_emitidas)
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

        // 4. Filtrar pendentes: não têm NF-e e NÃO são FULL
        const pendentes = results.filter(v => {
            const idVenda = String(v.id);
            if (idsComNFE.has(idVenda)) return false;

            // 🔥 VERIFICAÇÃO DE FULL (AGORA COM includes)
            const tipoEnvio = (v.shipping?.logistic_type || '').toLowerCase();
            const tags = (v.tags || []).map(t => t.toLowerCase());
            const isFull = tipoEnvio.includes('fulfillment') ||
                           tags.includes('fulfillment') ||
                           (v.order_items?.[0]?.item?.title || '').toLowerCase().includes('full');

            if (isFull) {
                console.log(`🚫 Venda FULL ignorada: ${idVenda} (logistic_type: ${tipoEnvio})`);
                return false;
            }
            return true;
        });

        if (pendentes.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center">Todas as vendas já possuem NF-e ou são FULL<\/td><\/tr>';
            return;
        }

        // Armazena globalmente para uso posterior
        vendasPendentes = pendentes;

        // Renderiza a tabela
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

        // Atrela evento de clique para emissão
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
    
    if (!orderId || orderId === 'null' || orderId === 'undefined') {
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

    function mapearUF(nomeEstado) {
        if (!nomeEstado) return '';
        const mapa = {
            'acre': 'AC', 'alagoas': 'AL', 'amapá': 'AP', 'amazonas': 'AM',
            'bahia': 'BA', 'ceará': 'CE', 'distrito federal': 'DF', 'espírito santo': 'ES',
            'goiás': 'GO', 'maranhão': 'MA', 'mato grosso': 'MT', 'mato grosso do sul': 'MS',
            'minas gerais': 'MG', 'pará': 'PA', 'paraíba': 'PB', 'paraná': 'PR',
            'pernambuco': 'PE', 'piauí': 'PI', 'rio de janeiro': 'RJ', 'rio grande do norte': 'RN',
            'rio grande do sul': 'RS', 'rondônia': 'RO', 'roraima': 'RR', 'santa catarina': 'SC',
            'são paulo': 'SP', 'sergipe': 'SE', 'tocantins': 'TO'
        };
        const chave = nomeEstado.toLowerCase().trim();
        return mapa[chave] || nomeEstado.toUpperCase().substring(0, 2);
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

        // Preencher endereço com conversão de UF
        document.getElementById('clienteEndereco').value = address.address_line || address.street_name || '';
        document.getElementById('clienteNumero').value = address.street_number || 'S/N';
        document.getElementById('clienteBairro').value = getValue(address.neighborhood);
        document.getElementById('clienteCidade').value = getValue(address.city);

        // 🔥 CONVERTER UF PARA SIGLA
        const ufOriginal = getValue(address.state);
        const ufSigla = mapearUF(ufOriginal);
        document.getElementById('clienteUF').value = ufSigla;

        document.getElementById('clienteCEP').value = address.zip_code ? address.zip_code.replace(/\D/g, '') : '';

        // CPF/CNPJ em branco
        document.getElementById('clienteDocumento').value = '';

        console.log('📋 Dados preenchidos:', {
            nome,
            endereco: document.getElementById('clienteEndereco').value,
            cidade: document.getElementById('clienteCidade').value,
            uf: ufSigla
        });

        // 🔥 Definir CFOP automaticamente no dropdown
        const cfopSelect = document.getElementById('nfeCfop');
        if (cfopSelect) {
            const cfopSugerido = (ufSigla === 'PR') ? '5102' : '6108';
            cfopSelect.value = cfopSugerido;
            console.log(`🔧 CFOP definido automaticamente: ${cfopSugerido} (UF: ${ufSigla})`);
        }

        window._mlAccessToken = token;

        // Carregar lista de transportadoras no select
        await carregarTransportadorasSelect();

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

// ===================== SALVAR CLIENTE NO BANCO =====================
// ===================== SALVAR CLIENTE NO BANCO =====================
async function salvarClienteNoBanco(dadosCliente) {
    // dadosCliente = { nome, documento, endereco, numero, bairro, cidade, uf, cep }
    try {
        // 1. Verificar se o cliente já existe pelo documento
        const responseBusca = await fetch(`${window.API_BASE_URL}/nfe/clientes?documento=${dadosCliente.documento}`);
        if (responseBusca.ok) {
            const data = await responseBusca.json();
            if (data.clientes && data.clientes.length > 0) {
                // Cliente já existe – não faz nada (ou atualiza? vamos pular)
                console.log('ℹ️ Cliente já cadastrado:', dadosCliente.documento);
                return;
            }
        }

        // 2. Se não existir, cadastra
        const payload = {
            nome: dadosCliente.nome,
            documento: dadosCliente.documento,
            logradouro: dadosCliente.endereco,
            numero: dadosCliente.numero,
            bairro: dadosCliente.bairro,
            cidade: dadosCliente.cidade,
            uf: dadosCliente.uf,
            cep: dadosCliente.cep
        };

        const response = await fetch(`${window.API_BASE_URL}/nfe/clientes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            console.log('✅ Cliente salvo com sucesso:', dadosCliente.nome);
            // Recarregar a lista de clientes (se a aba estiver aberta)
            if (document.getElementById('abaClientes') && !document.getElementById('abaClientes').classList.contains('hidden')) {
                await carregarClientes();
            }
        } else {
            console.warn('⚠️ Erro ao salvar cliente:', await response.text());
        }
    } catch (error) {
        console.error('❌ Erro ao salvar cliente:', error);
    }
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
    const transportadoraId = document.getElementById('nfeTransportadora')?.value || null;

    // 🔥 CAPTURAR CFOP – com fallback e log
    const cfopSelect = document.getElementById('nfeCfop');
    let cfop = '';
    if (cfopSelect) {
        cfop = cfopSelect.value;
        console.log(`📊 CFOP do dropdown: "${cfop}"`);
    } else {
        console.warn('⚠️ Elemento #nfeCfop não encontrado');
    }
    // Se estiver vazio, define fallback
    if (!cfop) {
        cfop = (uf === 'PR') ? '5102' : '6108';
        console.warn(`⚠️ CFOP vazio, usando fallback: ${cfop}`);
    }

    // Validações
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
        // Produtos
        let produtos = window.produtosParaEmissao;
        if (!produtos || produtos.length === 0) {
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

        // NCM
        const produtosFinal = await Promise.all(produtos.map(async (prod) => {
            let ncmFinal = prod.ncm || '87149990';
            if (prod.sku && prod.sku !== 'SEM_SKU' && prod.sku !== 'N/A') {
                const ncmSalvo = await buscarNCMporSKU(prod.sku);
                if (ncmSalvo) ncmFinal = ncmSalvo;
                else await salvarNCMporSKU(prod.sku, ncmFinal);
            }
            return { ...prod, ncm: ncmFinal };
        }));

        const mlToken = window._mlAccessToken || null;

        const payload = {
            venda_id: String(orderId),
            cliente: { nome, documento, endereco, numero, bairro, cidade, uf, cep },
            produtos: produtosFinal,
            cfop: cfop,
            natureza_operacao: 'VENDA',
            modalidade_frete: transportadoraId ? '0' : '9',
            transportadora_id: transportadoraId,
            ml_access_token: mlToken
        };

        console.log('📤 Payload CFOP:', cfop, 'UF:', uf);
        console.log('📤 Payload completo:', JSON.stringify(payload, null, 2));

        const emitResponse = await fetch(`${window.API_BASE_URL}/nfe/emitir`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const result = await emitResponse.json();

        if (result.success) {
            showToast(`✅ NF-e emitida! Protocolo: ${result.protocolo}`, 'success');
            await salvarClienteNoBanco({ nome, documento, endereco, numero, bairro, cidade, uf, cep });
            window.produtosParaEmissao = null;
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
            
            // 🔥 CORREÇÃO: Buscar cliente e valor do XML ou de campos alternativos
            let clienteNome = nfe.cliente_nome || nfe.cliente?.nome || '-';
            let valorTotal = nfe.valor_total ? parseFloat(nfe.valor_total).toFixed(2) : '—';
            
            // Se não tiver cliente_nome ou valor_total, tentar extrair do XML
            if (clienteNome === '-' || valorTotal === '—') {
                try {
                    if (nfe.xml_assinado) {
                        const parser = new DOMParser();
                        const xmlDoc = parser.parseFromString(nfe.xml_assinado, 'application/xml');
                        const infNFe = xmlDoc.querySelector('infNFe');
                        if (infNFe) {
                            const dest = infNFe.querySelector('dest');
                            if (dest) {
                                const xNome = dest.querySelector('xNome');
                                if (xNome) clienteNome = xNome.textContent || '-';
                            }
                            const ICMSTot = infNFe.querySelector('ICMSTot');
                            if (ICMSTot) {
                                const vNF = ICMSTot.querySelector('vNF');
                                if (vNF) valorTotal = parseFloat(vNF.textContent || '0').toFixed(2);
                            }
                        }
                    }
                } catch (e) {
                    console.warn('Erro ao extrair dados do XML:', e);
                }
            }

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
        if (!infNFe) {
            window.showToast('XML inválido', 'error');
            return;
        }

        // Extrai dados (mantido igual)
        const chave = infNFe.getAttribute('Id').replace('NFe', '');
        const nNF = infNFe.querySelector('nNF')?.textContent || '';
        const serie = infNFe.querySelector('serie')?.textContent || '';
        const natOp = infNFe.querySelector('natOp')?.textContent || '';
        const dhEmi = infNFe.querySelector('dhEmi')?.textContent || '';
        const dhSaiEnt = infNFe.querySelector('dhSaiEnt')?.textContent || '';
        const modFrete = infNFe.querySelector('modFrete')?.textContent || '9';
        const protocolo = infNFe.querySelector('nProt')?.textContent || 'Não informado';

        // Emitente
        const emit = infNFe.querySelector('emit');
        const emitNome = emit.querySelector('xNome')?.textContent || '';
        const emitCNPJ = emit.querySelector('CNPJ')?.textContent || '';
        const emitIE = emit.querySelector('IE')?.textContent || '';
        const emitEnd = emit.querySelector('enderEmit');
        const emitLogr = emitEnd?.querySelector('xLgr')?.textContent || '';
        const emitNro = emitEnd?.querySelector('nro')?.textContent || '';
        const emitBairro = emitEnd?.querySelector('xBairro')?.textContent || '';
        const emitMun = emitEnd?.querySelector('xMun')?.textContent || '';
        const emitUF = emitEnd?.querySelector('UF')?.textContent || '';
        const emitCEP = emitEnd?.querySelector('CEP')?.textContent || '';
        const emitFone = emitEnd?.querySelector('fone')?.textContent || '';

        // Destinatário
        const dest = infNFe.querySelector('dest');
        const destNome = dest.querySelector('xNome')?.textContent || '';
        const destDoc = dest.querySelector('CPF')?.textContent || dest.querySelector('CNPJ')?.textContent || '';
        const destEnd = dest.querySelector('enderDest');
        const destLogr = destEnd?.querySelector('xLgr')?.textContent || '';
        const destNro = destEnd?.querySelector('nro')?.textContent || '';
        const destBairro = destEnd?.querySelector('xBairro')?.textContent || '';
        const destMun = destEnd?.querySelector('xMun')?.textContent || '';
        const destUF = destEnd?.querySelector('UF')?.textContent || '';
        const destCEP = destEnd?.querySelector('CEP')?.textContent || '';

        // Produtos – forçar UNID = PC
        const dets = xmlDoc.querySelectorAll('det');
        let produtosHTML = '';
        let totalProd = 0;
        dets.forEach((det, idx) => {
            const prod = det.querySelector('prod');
            const nome = prod.querySelector('xProd')?.textContent || '';
            const ncm = prod.querySelector('NCM')?.textContent || '';
            const cfop = prod.querySelector('CFOP')?.textContent || '';
            const qtd = prod.querySelector('qCom')?.textContent || '0';
            const vUn = prod.querySelector('vUnCom')?.textContent || '0';
            const vProd = prod.querySelector('vProd')?.textContent || '0';
            const unidade = 'PC'; // forçar sempre PC
            totalProd += parseFloat(vProd) || 0;
            produtosHTML += `
                <tr>
                    <td>${idx+1}</td>
                    <td style="text-align:left;">${nome}</td>
                    <td>${ncm}</td>
                    <td>${cfop}</td>
                    <td>${unidade}</td>
                    <td style="text-align:right;">${qtd}</td>
                    <td style="text-align:right;">${parseFloat(vUn).toFixed(2)}</td>
                    <td style="text-align:right;">${parseFloat(vProd).toFixed(2)}</td>
                </tr>
            `;
        });

        // Totais
        const ICMSTot = infNFe.querySelector('ICMSTot');
        const vNF = ICMSTot?.querySelector('vNF')?.textContent || totalProd.toFixed(2);
        const vProdTotal = ICMSTot?.querySelector('vProd')?.textContent || totalProd.toFixed(2);
        const vFrete = ICMSTot?.querySelector('vFrete')?.textContent || '0';
        const vSeg = ICMSTot?.querySelector('vSeg')?.textContent || '0';
        const vDesc = ICMSTot?.querySelector('vDesc')?.textContent || '0';
        const vTotTrib = ICMSTot?.querySelector('vTotTrib')?.textContent || '0';

        // Transportadora
        // ===== DENTRO DA FUNÇÃO visualizarNFE =====
// Substitua o bloco que monta transpHTML por este:

const transp = infNFe.querySelector('transp');
const transporta = transp?.querySelector('transporta');
const vol = transp?.querySelector('vol'); // <-- pega o primeiro volume

let qVol = '0';
let pesoL = '0,000';
let pesoB = '0,000';
if (vol) {
    qVol = vol.querySelector('qVol')?.textContent || '0';
    pesoL = vol.querySelector('pesoL')?.textContent || '0,000';
    pesoB = vol.querySelector('pesoB')?.textContent || '0,000';
    // Formata com 3 casas decimais, se necessário
    if (!isNaN(parseFloat(pesoL))) pesoL = parseFloat(pesoL).toFixed(3);
    if (!isNaN(parseFloat(pesoB))) pesoB = parseFloat(pesoB).toFixed(3);
}

let transpHTML = '';
if (transporta) {
    const tpCNPJ = transporta.querySelector('CNPJ')?.textContent || '';
    const tpNome = transporta.querySelector('xNome')?.textContent || '';
    const tpIE = transporta.querySelector('IE')?.textContent || '';
    const tpEnd = transporta.querySelector('xEnder')?.textContent || '';
    const tpMun = transporta.querySelector('xMun')?.textContent || '';
    const tpUF = transporta.querySelector('UF')?.textContent || '';
    const freteLabel = modFrete === '0' ? 'Emitente' : modFrete === '1' ? 'Destinatário' : modFrete === '2' ? 'Terceiros' : 'Sem frete';
    transpHTML = `
        <div class="transp-section">
            <table class="transp-table">
                <tr><th colspan="4">TRANSPORTADOR / VOLUMES TRANSPORTADOS</th></tr>
                <tr>
                    <td><strong>RAZÃO SOCIAL</strong><br>${tpNome}</td>
                    <td><strong>FRETE POR CONTA</strong><br>${freteLabel}</td>
                    <td><strong>CNPJ/CPF</strong><br>${tpCNPJ}</td>
                    <td><strong>INSCRIÇÃO ESTADUAL</strong><br>${tpIE}</td>
                </tr>
                <tr>
                    <td colspan="2"><strong>ENDEREÇO</strong><br>${tpEnd}</td>
                    <td><strong>MUNICÍPIO</strong><br>${tpMun}</td>
                    <td><strong>UF</strong><br>${tpUF}</td>
                </tr>
                <tr>
                    <td><strong>QUANTIDADE</strong><br>${qVol}</td>
                    <td><strong>ESPÉCIE</strong><br></td>
                    <td><strong>MARCA</strong><br></td>
                    <td><strong>NUMERAÇÃO</strong><br></td>
                </tr>
                <tr>
                    <td><strong>PESO BRUTO</strong><br>${pesoB}</td>
                    <td><strong>PESO LÍQUIDO</strong><br>${pesoL}</td>
                    <td colspan="2"></td>
                </tr>
            </table>
        </div>
    `;
} else {
    transpHTML = `<p><strong>Frete:</strong> ${modFrete === '9' ? 'Sem frete' : 'Não informado'}</p>`;
}

        // ===== INFORMAÇÕES COMPLEMENTARES (infAdic) =====
        const infAdic = infNFe.querySelector('infAdic infCpl')?.textContent || '';

        // Monta HTML completo com CSS DANFE
        const html = `
<!DOCTYPE html>
<html>
<head>
    <title>DANFE - ${chave}</title>
    <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"></script>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Courier New', Courier, monospace;
            background: #fff;
            padding: 20px;
            color: #000;
            font-size: 11px;
            line-height: 1.3;
        }
        .danfe {
            max-width: 1000px;
            margin: 0 auto;
            border: 2px solid #000;
            padding: 15px;
            background: #fff;
            position: relative;
        }
        .header {
            border-bottom: 2px solid #000;
            padding-bottom: 8px;
            margin-bottom: 10px;
            text-align: center;
            position: relative;
        }
        .logo-container {
            position: absolute;
            top: 0;
            left: 0;
            width: 60px;
            height: 60px;
        }
        .logo-container img {
            max-width: 100%;
            max-height: 60px;
            object-fit: contain;
        }
        .header .emitente-nome { font-size: 16px; font-weight: bold; }
        .header .emitente-end { font-size: 10px; }
        .header .titulo { font-size: 20px; font-weight: bold; letter-spacing: 2px; }
        .header .subtitulo { font-size: 12px; }
        .chave {
            font-size: 14px;
            font-weight: bold;
            letter-spacing: 2px;
            background: #eee;
            padding: 4px 8px;
            margin: 5px 0;
            border: 1px solid #000;
        }
        .barcode-container {
            text-align: center;
            margin: 5px 0;
        }
        .barcode-container svg {
            max-width: 100%;
            height: auto;
        }
        .recibo {
            border: 1px solid #000;
            padding: 8px;
            margin: 0 0 10px 0;
            font-size: 10px;
            text-align: center;
        }
        .recibo .assinatura {
            margin-top: 10px;
            padding-top: 10px;
            border-top: 1px solid #000;
            display: flex;
            justify-content: space-between;
        }
        .dados-gerais {
            display: flex;
            justify-content: space-between;
            border-top: 1px solid #000;
            border-bottom: 1px solid #000;
            padding: 6px 0;
            margin: 6px 0;
        }
        .dados-gerais > div { width: 48%; }
        .dados-gerais p { margin: 2px 0; }
        .dados-gerais .label { font-weight: bold; }
        .table-produtos {
            width: 100%;
            border-collapse: collapse;
            margin: 10px 0;
            font-size: 10px;
        }
        .table-produtos th, .table-produtos td {
            border: 1px solid #000;
            padding: 3px 4px;
            text-align: center;
        }
        .table-produtos th { background: #ddd; font-weight: bold; }
        .table-produtos td:first-child { width: 30px; }
        .table-produtos td:nth-child(2) { text-align: left; min-width: 200px; }
        .table-produtos td:nth-child(6), .table-produtos td:nth-child(7), .table-produtos td:nth-child(8) { text-align: right; padding-right: 6px; }

        .totais {
            display: flex;
            justify-content: flex-end;
            border-top: 1px solid #000;
            border-bottom: 1px solid #000;
            padding: 6px 0;
            margin: 6px 0;
        }
        .totais > div { margin-left: 30px; text-align: right; }
        .totais .valor-grande { font-size: 14px; font-weight: bold; }

        .transp-section { margin: 10px 0; border-top: 1px solid #000; padding-top: 6px; }
        .transp-table { width: 100%; border-collapse: collapse; }
        .transp-table th, .transp-table td { border: 1px solid #000; padding: 3px 5px; text-align: left; vertical-align: top; }
        .transp-table th { background: #ddd; text-align: center; }

        .dados-adicionais {
            border: 2px solid #000;
            padding: 10px;
            margin: 10px 0;
            font-size: 9px;
            white-space: pre-wrap;
            position: relative;
            background: #fcfcfc;
        }
        .dados-adicionais .titulo {
            font-weight: bold;
            font-size: 10px;
            background: #fff;
            padding: 0 6px;
            position: absolute;
            top: -8px;
            left: 10px;
            border: 1px solid #000;
            background: #fff;
            border-radius: 2px;
        }
        .dados-adicionais .conteudo {
            margin-top: 6px;
            text-align: center;
        }

        .footer {
            text-align: center;
            font-size: 9px;
            border-top: 1px solid #000;
            padding-top: 6px;
            margin-top: 10px;
        }

        .no-print { text-align: center; margin-bottom: 15px; }
        .no-print button { padding: 8px 20px; margin: 0 5px; cursor: pointer; }
        @media print {
            .no-print { display: none; }
            body { padding: 0; }
            .danfe { border: none; padding: 10px; }
        }
    </style>
</head>
<body>
    <div class="no-print">
        <button onclick="window.print()">🖨️ Imprimir DANFE</button>
        <button onclick="window.close()">❌ Fechar</button>
    </div>
    <div class="danfe">
        <!-- Recibo (acima do cabeçalho) -->
        <div class="recibo">
            <div><strong>RECEBEMOS DE ${emitNome} OS PRODUTOS CONSTANTES DA NOTA FISCAL INDICADA ABAIXO</strong></div>
            <div style="margin-top:5px;">NF-e Nº ${nNF.padStart(6, '0')} - SÉRIE ${serie}</div>
            <div style="margin-top:8px;">DATA DE RECEBIMENTO: ____________________</div>
            <div class="assinatura">
                <span>IDENTIFICAÇÃO E ASSINATURA DO RECEBEDOR _____________________________________________________________________________________________________________</span>
            </div>
        </div>

        <!-- Cabeçalho com logo -->
        <div class="header">
            <div class="logo-container">
                <img src="logo.png" alt="Logo Wheel Tech">
            </div>
            <div class="emitente-nome">${emitNome}</div>
            <div class="emitente-end">${emitLogr}, ${emitNro} - ${emitBairro} - ${emitMun}/${emitUF} - CEP: ${emitCEP} - Fone: ${emitFone}</div>
            <div style="margin-top:6px;">
                <span class="titulo">DANFE</span>
                <span class="subtitulo">Documento Auxiliar da Nota Fiscal Eletrônica</span>
            </div>
            <div style="display:flex; justify-content:space-between; margin-top:4px;">
                <span><strong>1 - SAÍDA</strong></span>
                <span><strong>Nº ${nNF.padStart(6, '0')}</strong> | SÉRIE ${serie} | FOLHA 1/1</span>
            </div>
            <div class="chave">CHAVE DE ACESSO: ${chave.replace(/(.{4})/g, '$1 ')}</div>
            <div style="font-size:9px;">Consulta: www.nfe.fazenda.gov.br/portal ou site da Sefaz Autorizadora</div>
            <div style="margin-top:2px;"><strong>Protocolo:</strong> ${protocolo}</div>
            <div class="barcode-container">
                <svg id="barcode"></svg>
            </div>
        </div>

        <!-- Dados Gerais -->
        <div class="dados-gerais">
            <div>
                <p><span class="label">NATUREZA DA OPERAÇÃO</span><br>${natOp}</p>
                <p><span class="label">INSCRIÇÃO ESTADUAL</span><br>${emitIE}</p>
                <p><span class="label">CNPJ/CPF</span><br>${emitCNPJ}</p>
            </div>
            <div>
                <p><span class="label">DESTINATÁRIO / REMETENTE</span><br>${destNome}</p>
                <p><span class="label">ENDEREÇO</span><br>${destLogr}, ${destNro} - ${destBairro} - ${destMun}/${destUF}</p>
                <p><span class="label">CNPJ/CPF</span><br>${destDoc}</p>
                <p><span class="label">DATA DA EMISSÃO</span><br>${dhEmi.split('T')[0].replace(/-/g, '/')}</p>
                <p><span class="label">DATA DA SAÍDA/ENTRADA</span><br>${dhSaiEnt.split('T')[0].replace(/-/g, '/')}</p>
                <p><span class="label">HORA DE SAÍDA</span><br>${dhSaiEnt.split('T')[1]?.substring(0,5) || ''}</p>
            </div>
        </div>

        <!-- Cálculo do imposto (resumo) -->
        <div style="display:flex; justify-content:space-between; border:1px solid #000; padding:4px 8px; margin:6px 0;">
            <div><strong>BASE DE CÁLCULO DO ICMS</strong><br>0,00</div>
            <div><strong>VALOR DO ICMS</strong><br>0,00</div>
            <div><strong>BASE DE CÁLCULO DO ICMS ST</strong><br>0,00</div>
            <div><strong>VALOR DO ICMS ST</strong><br>0,00</div>
            <div><strong>VALOR TOTAL DOS PRODUTOS</strong><br>${parseFloat(vProdTotal).toFixed(2)}</div>
        </div>
        <div style="display:flex; justify-content:space-between; border:1px solid #000; padding:4px 8px; margin-bottom:6px;">
            <div><strong>VALOR DO FRETE</strong><br>${parseFloat(vFrete).toFixed(2)}</div>
            <div><strong>VALOR DO SEGURO</strong><br>${parseFloat(vSeg).toFixed(2)}</div>
            <div><strong>DESCONTO</strong><br>${parseFloat(vDesc).toFixed(2)}</div>
            <div><strong>OUTRAS DESPESAS</strong><br>0,00</div>
            <div><strong>VALOR DO IPI</strong><br>0,00</div>
            <div><strong>VALOR TOTAL DA NOTA</strong><br>${parseFloat(vNF).toFixed(2)}</div>
        </div>

        <!-- Produtos -->
        <table class="table-produtos">
            <thead>
                <tr>
                    <th>CÓDIGO</th>
                    <th>DESCRIÇÃO DOS PRODUTOS / SERVIÇOS</th>
                    <th>NCM/SH</th>
                    <th>CFOP</th>
                    <th>UNID.</th>
                    <th>QTD.</th>
                    <th>VLR UNIT.</th>
                    <th>VALOR TOTAL</th>
                </tr>
            </thead>
            <tbody>${produtosHTML}</tbody>
        </table>

        <!-- Transportadora -->
        ${transpHTML}

        <!-- Dados Adicionais -->
        <div class="dados-adicionais">
            <div class="titulo">DADOS ADICIONAIS</div>
            <div class="conteudo">${infAdic || 'Nenhuma informação complementar.'}</div>
        </div>

        <!-- Rodapé -->
        <div class="footer">
            <p>Documento gerado eletronicamente - Sistema Wheel Tech</p>
            <p>Chave: ${chave}</p>
        </div>
    </div>

    <script>
        // Gerar código de barras
        JsBarcode("#barcode", "${chave}", {
            format: "CODE128",
            width: 1.2,
            height: 40,
            displayValue: false,
            fontSize: 12,
            background: "#ffffff",
            lineColor: "#000000"
        });
    </script>
</body>
</html>`;

        const win = window.open('', '_blank', 'width=1000,height=800');
        win.document.write(html);
        win.document.close();

    } catch (error) {
        console.error('Erro ao visualizar NF-e:', error);
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

// ===================== MODAL NOVA TRANSPORTADORA =====================
function abrirModalTransportadora() {
    // Verifica se o modal já existe
    let modal = document.getElementById('modalNovaTransportadora');
    if (modal) {
        modal.classList.remove('hidden');
        return;
    }

    // Cria o modal
    const modalHTML = `
    <div id="modalNovaTransportadora" class="modal" style="display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,0.5); z-index:9999;">
        <div class="modal-content" style="max-width:500px; width:90%; background:white; padding:25px; border-radius:8px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
                <h3 style="margin:0;"><i class="fas fa-truck"></i> Nova Transportadora</h3>
                <button onclick="fecharModalTransportadora()" style="background:none; border:none; font-size:24px; cursor:pointer;">&times;</button>
            </div>
            <form id="formNovaTransportadora">
                <div class="form-group">
                    <label>Nome *</label>
                    <input type="text" id="novaTransportadoraNome" class="form-control" required>
                </div>
                <div class="form-group">
                    <label>CNPJ * (apenas números)</label>
                    <input type="text" id="novaTransportadoraCnpj" class="form-control" placeholder="00000000000000" required>
                </div>
                <div class="form-group">
                    <label>Inscrição Estadual</label>
                    <input type="text" id="novaTransportadoraIe" class="form-control">
                </div>
                <div class="form-group">
                    <label>Endereço</label>
                    <input type="text" id="novaTransportadoraEndereco" class="form-control">
                </div>
                <div class="row">
                    <div class="col-md-6">
                        <div class="form-group">
                            <label>Cidade</label>
                            <input type="text" id="novaTransportadoraCidade" class="form-control">
                        </div>
                    </div>
                    <div class="col-md-6">
                        <div class="form-group">
                            <label>UF</label
                            <input type="text" id="novaTransportadoraUf" class="form-control" maxlength="2">
                        </div>
                    </div>
                </div>
                <div class="d-flex justify-content-end gap-2 mt-3">
                    <button type="button" class="btn btn-secondary" onclick="fecharModalTransportadora()">Cancelar</button>
                    <button type="button" class="btn btn-success" onclick="salvarNovaTransportadora()"><i class="fas fa-save"></i> Salvar</button>
                </div>
            </form>
        </div>
    </div>`;

    const container = document.createElement('div');
    container.innerHTML = modalHTML;
    document.body.appendChild(container.firstElementChild);
}

function fecharModalTransportadora() {
    const modal = document.getElementById('modalNovaTransportadora');
    if (modal) modal.classList.add('hidden');
}

async function salvarNovaTransportadora() {
    const nome = document.getElementById('novaTransportadoraNome').value.trim();
    const cnpj = document.getElementById('novaTransportadoraCnpj').value.trim().replace(/\D/g, '');
    const ie = document.getElementById('novaTransportadoraIe').value.trim();
    const endereco = document.getElementById('novaTransportadoraEndereco').value.trim();
    const cidade = document.getElementById('novaTransportadoraCidade').value.trim();
    const uf = document.getElementById('novaTransportadoraUf').value.trim().toUpperCase();

    if (!nome || !cnpj) {
        showToast('Nome e CNPJ são obrigatórios', 'warning');
        return;
    }
    if (cnpj.length !== 14) {
        showToast('CNPJ deve ter 14 dígitos', 'warning');
        return;
    }

    const payload = { nome, cnpj, ie, endereco, cidade, uf };

    try {
        const response = await fetch(`${window.API_BASE_URL}/nfe/transportadoras`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const result = await response.json();
        if (result.success) {
            showToast('Transportadora cadastrada com sucesso!', 'success');
            fecharModalTransportadora();
            // Recarregar lista de transportadoras (na aba atual)
            await carregarTransportadoras();
            // Atualizar também o select do modal de emissão se estiver aberto
            await carregarTransportadorasSelect();
        } else {
            showToast('Erro: ' + result.error, 'error');
        }
    } catch (error) {
        console.error(error);
        showToast('Erro ao salvar transportadora', 'error');
    }
}

// Função auxiliar para carregar apenas o select de transportadoras (usado no modal de emissão)
async function carregarTransportadorasSelect() {
    const select = document.getElementById('nfeTransportadora');
    if (!select) return;
    try {
        const response = await fetch(`${window.API_BASE_URL}/nfe/transportadoras`);
        const data = await response.json();
        if (!data.success) throw new Error(data.error);
        const transportadoras = data.transportadoras || [];
        select.innerHTML = '<option value="">Selecione uma transportadora</option>' +
            transportadoras.map(t => `<option value="${t.id}">${t.nome} (${t.cnpj})</option>`).join('');
    } catch (error) {
        console.error('Erro ao carregar transportadoras:', error);
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
                <td>
                <button class="btn btn-sm btn-info" onclick="visualizarCliente(${c.id})" title="Ver detalhes">
                <i class="fas fa-eye"></i>
                </button>
                <button class="btn btn-sm btn-danger" onclick="excluirCliente(${c.id})">Excluir<\/button><\/td>
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

window.visualizarCliente = async function(id) {
  try {
    const response = await fetch(`${API_BASE_URL}/nfe/clientes/${id}`);
    const data = await response.json();
    if (!data.success) throw new Error(data.error);
    const cliente = data.cliente;

    const modalContent = `
      <div style="padding: 10px;">
        <h4>${cliente.nome}</h4>
        <p><strong>Documento:</strong> ${cliente.documento || '-'}</p>
        <p><strong>Endereço:</strong> ${cliente.logradouro || ''}, ${cliente.numero || 'S/N'} - ${cliente.bairro || ''}</p>
        <p><strong>Cidade/UF:</strong> ${cliente.cidade || ''} / ${cliente.uf || ''}</p>
        <p><strong>CEP:</strong> ${cliente.cep || ''}</p>
      </div>
    `;

    // Exibe um modal genérico (você pode criar um modal específico)
    showModalDialog('Detalhes do Cliente', modalContent);
  } catch (error) {
    console.error('Erro ao buscar cliente:', error);
    showToast('Erro ao carregar dados do cliente', 'error');
  }
};

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

// ===================== ATUALIZAR LISTA DE VENDAS NA ABA NF-E =====================
async function atualizarListaNFE() {
    const btn = document.getElementById('btnAtualizarNFE');
    if (btn) {
        btn.innerHTML = '<span class="spinner"></span> Atualizando...';
        btn.disabled = true;
    }

    try {
        // 1. Sincronizar vendas do ML (usa a função já existente)
        if (typeof window.sincronizarVendasMLDashboard === 'function') {
            await window.sincronizarVendasMLDashboard();
        } else {
            // Fallback: chama a função do ml_token_manager se existir
            if (typeof window.sincronizarVendasComSupabase === 'function') {
                await window.sincronizarVendasComSupabase();
            } else {
                console.warn('⚠️ Nenhuma função de sincronização disponível');
            }
        }

        // 2. Recarregar a lista de vendas pendentes
        await carregarVendasPendentes();

    } catch (error) {
        console.error('❌ Erro ao atualizar lista:', error);
        showToast('Erro ao sincronizar vendas', 'error');
    } finally {
        if (btn) {
            btn.innerHTML = '<i class="fas fa-sync-alt"></i> Atualizar Lista';
            btn.disabled = false;
        }
    }
}

// Exportar para uso global
window.atualizarListaNFE = atualizarListaNFE;

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
window.abrirModalTransportadora = abrirModalTransportadora;
window.fecharModalTransportadora = fecharModalTransportadora;
window.salvarNovaTransportadora = salvarNovaTransportadora;

// ===================== INICIALIZAR EVENT LISTENERS DO MODAL =====================
document.addEventListener('DOMContentLoaded', function() {
    const confirmarBtn = document.getElementById('confirmarModalNFEBtn');
    const cancelarBtn = document.getElementById('cancelarModalNFEBtn');
    if (confirmarBtn) confirmarBtn.addEventListener('click', confirmarEmissaoNFE);
    if (cancelarBtn) cancelarBtn.addEventListener('click', fecharModalDadosClienteNFE);
});

console.log('✅ nfe_manager.js carregado (versão completa com fallback)');