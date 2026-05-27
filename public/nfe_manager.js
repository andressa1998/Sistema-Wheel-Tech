// ==================== NF-e MANAGER - VERSÃO ORIGINAL + CORREÇÃO ENDEREÇO ====================
let vendasNFE = [];
let ncmPorSku = {};
const CACHE_KEY = 'wheeltech_nfe_vendas';
const CACHE_EXPIRY = 24 * 60 * 60 * 1000; // 24 horas

// ===== CACHE =====
function carregarCacheVendas() {
    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) return null;
    try {
        const { vendas, timestamp } = JSON.parse(cached);
        if (Date.now() - timestamp < CACHE_EXPIRY) return vendas;
    } catch(e) {}
    return null;
}

function salvarCacheVendas(vendas) {
    localStorage.setItem(CACHE_KEY, JSON.stringify({
        vendas: vendas,
        timestamp: Date.now()
    }));
}

// ===== FILTRO DE VENDAS FULL =====
function filtrarVendasFull(vendas) {
    if (!vendas) return [];
    return vendas.filter(v => {
        const isFull = 
            v.meio_envio === 'FULL' ||
            v.logistic_type === 'fulfillment' ||
            (v.shipping && v.shipping.logistic_type === 'fulfillment') ||
            (v.tags && v.tags.includes('fulfillment'));
        return !isFull;
    });
}

// ===== CONSULTA STATUS NF-e (USANDO WORKER) =====
async function consultarStatusNFE(orderId, token) {
    try {
        const cleanId = String(orderId).replace(/^ML/, '');
        const workerUrl = 'https://purple-bonus-3b1c.andmiotto1998.workers.dev';
        const apiUrl = `https://api.mercadolibre.com/users/me/invoices/orders/${cleanId}`;
        const proxyUrl = `${workerUrl}/api/ml/proxy?url=${encodeURIComponent(apiUrl)}&token=${token}`;
        const response = await fetch(proxyUrl);
        if (response.status === 404) return { emitida: false };
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        const emitida = data && data.status === 'authorized';
        return {
            emitida: emitida,
            chave: data.attributes?.invoice_key,
            protocolo: data.attributes?.protocol
        };
    } catch (error) {
        console.warn(`Erro consulta NF-e ${orderId}:`, error);
        return { emitida: false };
    }
}

// ===== BUSCAR DADOS DO COMPRADOR =====
const estadoParaSigla = {
    'Acre': 'AC', 'Alagoas': 'AL', 'Amapá': 'AP', 'Amazonas': 'AM',
    'Bahia': 'BA', 'Ceará': 'CE', 'Distrito Federal': 'DF', 'Espírito Santo': 'ES',
    'Goiás': 'GO', 'Maranhão': 'MA', 'Mato Grosso': 'MT', 'Mato Grosso do Sul': 'MS',
    'Minas Gerais': 'MG', 'Pará': 'PA', 'Paraíba': 'PB', 'Paraná': 'PR',
    'Pernambuco': 'PE', 'Piauí': 'PI', 'Rio de Janeiro': 'RJ', 'Rio Grande do Norte': 'RN',
    'Rio Grande do Sul': 'RS', 'Rondônia': 'RO', 'Roraima': 'RR', 'Santa Catarina': 'SC',
    'São Paulo': 'SP', 'Sergipe': 'SE', 'Tocantins': 'TO'
};

// ===== BUSCAR DADOS DO COMPRADOR (VERSÃO ROBUSTA COM LOGS) =====
async function buscarDadosComprador(venda, token) {
    console.log('🔍 Buscando dados do comprador para venda:', venda.id);
    
    let dados = {
        nome: venda.buyer_nickname || venda.cliente || '',
        documento: '',
        endereco: '',
        numero: '',
        complemento: '',
        bairro: '',
        cidade: '',
        estado: '',
        cep: ''
    };

    const workerUrl = 'https://purple-bonus-3b1c.andmiotto1998.workers.dev';
    
    // 1. Tentar obter shipping_id da venda
    let shipmentId = venda.shipping_id || venda.id_envio;
    if (!shipmentId && venda.dados_completos) {
        try {
            const completo = typeof venda.dados_completos === 'string' ? JSON.parse(venda.dados_completos) : venda.dados_completos;
            shipmentId = completo.shipping?.id;
            console.log('📦 shipmentId obtido de dados_completos:', shipmentId);
        } catch(e) { console.warn('Erro ao parsear dados_completos:', e); }
    }

    // 2. Se não tem shipmentId, tenta buscar os dados da ordem diretamente
    if (!shipmentId) {
        console.log('⚠️ Sem shipmentId, tentando buscar ordem completa...');
        try {
            const orderUrl = `https://api.mercadolibre.com/orders/${venda.id}`;
            const orderProxy = `${workerUrl}/api/ml/proxy?url=${encodeURIComponent(orderUrl)}&token=${token}`;
            const orderResp = await fetch(orderProxy);
            if (orderResp.ok) {
                const orderData = await orderResp.json();
                shipmentId = orderData.shipping?.id;
                console.log('📦 shipmentId obtido da ordem:', shipmentId);
            }
        } catch(e) { console.warn('Erro ao buscar ordem:', e); }
    }

    // 3. Se tem shipmentId, buscar billing_info e também dados do envio
    if (shipmentId) {
        // 3a. Billing info (contém endereço do comprador)
        try {
            const billingUrl = `https://api.mercadolibre.com/shipments/${shipmentId}/billing_info`;
            const billingProxy = `${workerUrl}/api/ml/proxy?url=${encodeURIComponent(billingUrl)}&token=${token}`;
            const billingResp = await fetch(billingProxy);
            console.log('📡 Billing response status:', billingResp.status);
            if (billingResp.ok) {
                const billing = await billingResp.json();
                console.log('📄 Billing data:', billing);
                if (billing.receiver) {
                    dados.nome = billing.receiver.name || dados.nome;
                    if (billing.receiver.document) {
                        dados.documento = `${billing.receiver.document.type || 'CPF'}: ${billing.receiver.document.value}`;
                    }
                    if (billing.receiver.address) {
                        const addr = billing.receiver.address;
                        dados.endereco = addr.street_name || '';
                        dados.numero = addr.street_number || '';
                        dados.bairro = addr.neighborhood || '';
                        dados.cidade = addr.city || '';
                        const estadoNome = addr.state || '';
                        dados.estado = estadoParaSigla[estadoNome] || estadoNome.toUpperCase().substring(0, 2);
                        dados.cep = addr.zip_code || '';
                        console.log('✅ Endereço obtido do billing_info:', dados);
                    }
                }
            }
        } catch(e) { console.warn('Erro ao buscar billing_info:', e); }

        // 3b. Se ainda faltam dados, buscar shipment (para complementar)
        if (!dados.endereco || !dados.cidade) {
            try {
                const shipUrl = `https://api.mercadolibre.com/shipments/${shipmentId}`;
                const shipProxy = `${workerUrl}/api/ml/proxy?url=${encodeURIComponent(shipUrl)}&token=${token}`;
                const shipResp = await fetch(shipProxy);
                if (shipResp.ok) {
                    const shipData = await shipResp.json();
                    console.log('📄 Shipment data:', shipData);
                    // Tentar extrair endereço de recebimento (receiver_address)
                    const receiverAddr = shipData.receiver_address;
                    if (receiverAddr) {
                        dados.endereco = dados.endereco || receiverAddr.street_name || '';
                        dados.numero = dados.numero || receiverAddr.street_number || '';
                        dados.bairro = dados.bairro || receiverAddr.neighborhood || '';
                        dados.cidade = dados.cidade || receiverAddr.city || {};
                        dados.estado = dados.estado || receiverAddr.state?.name || '';
                        dados.cep = dados.cep || receiverAddr.zip_code || '';
                        console.log('✅ Endereço complementado pelo shipment:', dados);
                    }
                }
            } catch(e) { console.warn('Erro ao buscar shipment:', e); }
        }
    } else {
        console.warn('❌ Nenhum shipmentId encontrado para a venda');
    }

    // 4. Fallback: se ainda não tem endereço, tentar buscar pelo CEP (caso ele exista em algum lugar)
    if ((!dados.endereco || !dados.cidade) && dados.cep && dados.cep.length === 8) {
        try {
            console.log('🔍 Buscando endereço pelo CEP:', dados.cep);
            const cepResponse = await fetch(`https://brasilapi.com.br/api/cep/v1/${dados.cep}`);
            if (cepResponse.ok) {
                const cepData = await cepResponse.json();
                dados.endereco = dados.endereco || cepData.street;
                dados.bairro = dados.bairro || cepData.neighborhood;
                dados.cidade = dados.cidade || cepData.city;
                dados.estado = dados.estado || cepData.state;
                console.log('✅ Endereço preenchido via CEP:', dados);
            }
        } catch(e) { console.warn('Erro ao buscar CEP:', e); }
    }

    console.log('🏁 Dados finais do comprador:', dados);
    return dados;
}

// ===== ABRIR SISTEMA (ORIGINAL) =====
async function abrirSistemaNFE() {
    console.log('🚀 [NFE] Abrindo sistema');

    if (!currentUser) {
        showToast('Faça login primeiro', 'warning');
        return;
    }

    // Oculta menu e outros sistemas
    const menuSystem = document.getElementById('menuSystem');
    if (menuSystem) menuSystem.classList.add('hidden');

    const sistemas = [
        'mainSystem', 'salesSystem', 'reembolsosSystem', 'caixaSystem',
        'reviewsSystem', 'folgasSystem', 'shippingSystem', 'estoqueGestaoSystem'
    ];
    sistemas.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });

    // Mostra tela NF-e
    const nfeDiv = document.getElementById('nfeSystem');
    if (!nfeDiv) return;
    nfeDiv.classList.remove('hidden');
    nfeDiv.style.display = 'block';

    // Atualiza cabeçalho
    const nomeEl = document.getElementById('nfeUserName');
    const avatarEl = document.getElementById('nfeUserAvatar');
    const roleEl = document.getElementById('nfeUserRole');
    if (nomeEl) nomeEl.textContent = currentUser.name;
    if (avatarEl) avatarEl.textContent = currentUser.avatar;
    if (roleEl) roleEl.textContent = currentUser.role;

    await carregarNcmPorSku();

    // Tenta carregar do cache
    const cache = carregarCacheVendas();
    if (cache && cache.length > 0) {
        vendasNFE = cache;
        renderizarTabelaNFE(vendasNFE);
        showToast(`📋 ${vendasNFE.length} vendas em cache (use "Atualizar" para novas)`, 'info');
    } else {
        const tbody = document.getElementById('nfeVendasBody');
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="7" class="text-center">
                <i class="fas fa-info-circle"></i> Nenhuma venda em cache.<br>
                Clique em <strong>"Atualizar Lista"</strong> para carregar as vendas.
             </div><tr>`;
        }
        showToast('⚠️ Nenhuma venda em cache. Clique em "Atualizar Lista"', 'warning');
    }
}

// ===== CARREGAR VENDAS (BOTÃO ATUALIZAR) =====
async function carregarVendasParaNFE(forcarBusca = true) {
    const filtro = document.getElementById('filtroStatusNFE')?.value || 'pendente';
    const tbody = document.getElementById('nfeVendasBody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="text-center"><div class="spinner"></div> Carregando...</div></tr>';

    try {
        let vendas;
        if (!forcarBusca) {
            vendas = carregarCacheVendas();
            if (vendas) {
                vendasNFE = vendas;
                renderizarTabelaNFE(vendas);
                return;
            }
        }
        const token = await autoManageMLToken();
        if (!token) throw new Error('Token ML não disponível');
        const resultado = await buscarVendasML(50);
        if (!resultado.success) throw new Error(resultado.error);
        vendas = resultado.vendas;
        vendas = filtrarVendasFull(vendas);

        // Consulta status NF-e para cada venda
        for (let i = 0; i < vendas.length; i++) {
            const statusNFE = await consultarStatusNFE(vendas[i].id, token);
            vendas[i].nfe_emitida = statusNFE.emitida;
            vendas[i].nfe_chave = statusNFE.chave;
            vendas[i].nfe_protocolo = statusNFE.protocolo;
            if (statusNFE.emitida && supabaseClient) {
                await supabaseClient.from('vendas_ml').upsert({
                    id_venda_ml: vendas[i].id,
                    nfe_emitida: true,
                    nfe_chave: statusNFE.chave,
                    nfe_protocolo: statusNFE.protocolo,
                    data_consulta: new Date().toISOString()
                }, { onConflict: 'id_venda_ml' });
            }
        }
        if (filtro === 'pendente') vendas = vendas.filter(v => !v.nfe_emitida);
        else if (filtro === 'emitida') vendas = vendas.filter(v => v.nfe_emitida);
        vendasNFE = vendas;
        salvarCacheVendas(vendas);
        renderizarTabelaNFE(vendas);
        showToast(`✅ ${vendas.length} vendas carregadas`, 'success');
    } catch (err) {
        console.error(err);
        if (tbody) tbody.innerHTML = `<tr><td colspan="7" class="text-center text-danger">Erro: ${err.message} </div></tr>`;
    }
}

// ===== RENDERIZAR TABELA (COM STATUS E BOTÃO CANCELAR) =====
function renderizarTabelaNFE(vendas) {
    const tbody = document.getElementById('nfeVendasBody');
    if (!tbody) return;
    if (!vendas.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center">Nenhuma venda encontrada (FULL removidas)</div></tr>';
        return;
    }
    tbody.innerHTML = vendas.map(v => {
        let statusNFE = '';
        if (v.nfe_cancelada) {
            statusNFE = '<span class="badge badge-danger"><i class="fas fa-ban"></i> Cancelada</span>';
        } else if (v.nfe_emitida) {
            statusNFE = '<span class="badge badge-success"><i class="fas fa-check-circle"></i> NF-e Emitida</span>';
        } else {
            statusNFE = '<span class="badge badge-warning"><i class="fas fa-clock"></i> Pendente</span>';
        }
        return `
        <tr>
            <td>${v.id || ''} </div>
            <td>${v.titulo || v.produto_titulo || '-'} </div>
            <td>${v.cliente || v.buyer_nickname || '-'} </div>
            <td>R$ ${parseFloat(v.valor_total || 0).toFixed(2)}</div>
            <td>${statusNFE}</div>
            <td>
                ${v.nfe_emitida && !v.nfe_cancelada ? `
                    <button class="btn btn-secondary btn-sm" onclick="verDetalhesNFE('${v.id}')">Ver NF-e</button>
                    <button class="btn btn-danger btn-sm" onclick="cancelarNFE('${v.id}', '${v.nfe_chave}', '${v.nfe_protocolo}')">Cancelar</button>
                ` : v.nfe_cancelada ? `
                    <button class="btn btn-secondary btn-sm" onclick="verDetalhesNFE('${v.id}')">Ver NF-e</button>
                    <span class="badge badge-danger">Cancelada</span>
                ` : `
                    <button class="btn btn-primary btn-sm" onclick="abrirModalEmissaoNFE('${v.id}')">Emitir</button>
                `}
             </div>
        </td>`;
    }).join('');
}

window.atualizarVendasNFE = async function() {
    const btn = document.querySelector('#nfeSystem button[onclick="atualizarVendasNFE()"]');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span> Buscando...';
    }
    await carregarVendasParaNFE(true);
    if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-sync-alt"></i> Atualizar Lista';
    }
};

// ===== MODAL DE EMISSÃO (COM CORREÇÃO DE ENDEREÇO - BUSCA POR CEP) =====
async function abrirModalEmissaoNFE(vendaId) {
    const venda = vendasNFE.find(v => String(v.id) === String(vendaId));
    if (!venda) { showToast('Venda não encontrada', 'error'); return; }
    const token = await autoManageMLToken();
    let dadosComprador = { nome: '', documento: '', endereco: '', numero: '', bairro: '', cidade: '', estado: '', cep: '' };
    if (token) dadosComprador = await buscarDadosComprador(venda, token);
    document.getElementById('nfeVendaId').value = venda.id;
    document.getElementById('nfeNumeroVenda').value = venda.id;
    document.getElementById('nfeDataVenda').value = new Date(venda.data_venda).toLocaleString('pt-BR');
    document.getElementById('nfeClienteNome').value = dadosComprador.nome;
    document.getElementById('nfeClienteDocumento').value = dadosComprador.documento;
    document.getElementById('nfeClienteCep').value = dadosComprador.cep;
    document.getElementById('nfeClienteUf').value = dadosComprador.estado;
    document.getElementById('nfeClienteCidade').value = dadosComprador.cidade;
    document.getElementById('nfeClienteEndereco').value = dadosComprador.endereco;
    document.getElementById('nfeClienteNumero').value = dadosComprador.numero;
    document.getElementById('nfeClienteBairro').value = dadosComprador.bairro;

    // --- ADIÇÃO: BUSCA AUTOMÁTICA DE ENDEREÇO PELO CEP ---
    const cepInput = document.getElementById('nfeClienteCep');
    if (cepInput && !cepInput.hasAttribute('data-cep-listener')) {
        cepInput.setAttribute('data-cep-listener', 'true');
        cepInput.addEventListener('blur', async function() {
            let cep = this.value.replace(/\D/g, '');
            if (cep.length === 8) {
                try {
                    const response = await fetch(`https://brasilapi.com.br/api/cep/v1/${cep}`);
                    if (response.ok) {
                        const data = await response.json();
                        document.getElementById('nfeClienteEndereco').value = data.street || '';
                        document.getElementById('nfeClienteBairro').value = data.neighborhood || '';
                        document.getElementById('nfeClienteCidade').value = data.city || '';
                        document.getElementById('nfeClienteUf').value = data.state || '';
                        showToast('Endereço preenchido automaticamente pelo CEP', 'success');
                    } else {
                        showToast('CEP não encontrado', 'warning');
                    }
                } catch(e) {
                    console.warn('Erro ao buscar CEP:', e);
                }
            }
        });
    }

    const container = document.getElementById('nfeProdutosContainer');
    if (container) {
        container.innerHTML = '';
        const items = venda.dados_completos ? (JSON.parse(venda.dados_completos)?.order_items || []) : [];
        if (items.length) {
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                const sku = item.item?.seller_sku || 'SEM_SKU';
                const ncmSalvo = ncmPorSku[sku] || '';
                const div = document.createElement('div');
                div.className = 'row mb-2';
                div.innerHTML = `
                    <div class="col-md-4"><input type="text" class="form-control" value="${item.item?.title || 'Produto'}" readonly></div>
                    <div class="col-md-2"><input type="number" class="form-control" value="${item.quantity || 1}" id="qtd_${i}" step="1" min="1"></div>
                    <div class="col-md-2"><input type="number" class="form-control" value="${item.unit_price || 0}" id="preco_${i}" step="0.01"></div>
                    <div class="col-md-3"><input type="text" class="form-control" placeholder="NCM" id="ncm_${i}" value="${ncmSalvo}"></div>
                    <input type="hidden" id="sku_${i}" value="${sku}">
                    <div class="col-md-1"><i class="fas fa-trash-alt text-danger" style="cursor:pointer" onclick="this.parentElement.parentElement.remove()"></i></div>
                `;
                container.appendChild(div);
            }
        } else {
            container.innerHTML = '<div class="alert alert-warning">Nenhum produto encontrado na venda.</div>';
        }
    }
    document.getElementById('modalEmissaoNFE').classList.remove('hidden');
}

function fecharModalEmissaoNFE() {
    document.getElementById('modalEmissaoNFE').classList.add('hidden');
}

// ===== EMITIR NF-E (COM VALIDAÇÃO DE ENDEREÇO) =====
async function emitirNFE() {
    const vendaId = document.getElementById('nfeVendaId').value;
    const venda = vendasNFE.find(v => String(v.id) === String(vendaId));
    if (!venda) { showToast('Venda não encontrada', 'error'); return; }

    const dadosCliente = {
        nome: document.getElementById('nfeClienteNome').value.trim(),
        documento: document.getElementById('nfeClienteDocumento').value.trim(),
        cep: document.getElementById('nfeClienteCep').value.replace(/\D/g, ''),
        uf: document.getElementById('nfeClienteUf').value.toUpperCase().trim(),
        cidade: document.getElementById('nfeClienteCidade').value.trim(),
        endereco: document.getElementById('nfeClienteEndereco').value.trim(),
        numero: document.getElementById('nfeClienteNumero').value.trim(),
        bairro: document.getElementById('nfeClienteBairro').value.trim()
    };

    // Validação de campos obrigatórios
    if (!dadosCliente.nome) { showToast('Nome do cliente é obrigatório', 'error'); return; }
    if (!dadosCliente.documento) { showToast('CPF/CNPJ do cliente é obrigatório', 'error'); return; }
    if (!dadosCliente.cep || dadosCliente.cep.length !== 8) { showToast('CEP inválido (8 dígitos)', 'error'); return; }
    if (!dadosCliente.uf || dadosCliente.uf.length !== 2) { showToast('UF inválida (ex: SP, RJ, PR)', 'error'); return; }
    if (!dadosCliente.cidade) { showToast('Cidade é obrigatória', 'error'); return; }
    if (!dadosCliente.endereco) { showToast('Logradouro é obrigatório', 'error'); return; }
    if (!dadosCliente.numero) { showToast('Número é obrigatório', 'error'); return; }

    const cfop = document.getElementById('nfeCfop').value;
    const cfopNum = parseInt(cfop);
    const SELLER_UF = 'PR';
    if (dadosCliente.uf === SELLER_UF && cfopNum !== 5102) {
        showToast(`Venda dentro do estado exige CFOP 5102.`, 'error'); return;
    }
    if (dadosCliente.uf !== SELLER_UF && cfopNum !== 6108) {
        showToast(`Venda fora do estado exige CFOP 6108.`, 'error'); return;
    }

    const produtos = [];
    const container = document.getElementById('nfeProdutosContainer');
    const rows = container.querySelectorAll('.row');
    for (let i = 0; i < rows.length; i++) {
        const skuInput = rows[i].querySelector(`input[id^="sku_"]`);
        const qtdInput = rows[i].querySelector(`input[id^="qtd_"]`);
        const precoInput = rows[i].querySelector(`input[id^="preco_"]`);
        const ncmInput = rows[i].querySelector(`input[id^="ncm_"]`);
        if (skuInput && qtdInput && precoInput && ncmInput) {
            const sku = skuInput.value;
            const ncm = ncmInput.value;
            if (ncm) await salvarNcmParaSku(sku, ncm);
            produtos.push({
                sku: sku,
                nome: rows[i].querySelector('input:first-child').value,
                quantidade: parseFloat(qtdInput.value),
                valor_unitario: parseFloat(precoInput.value),
                ncm: ncm
            });
        }
    }
    if (produtos.length === 0) { showToast('Nenhum produto válido', 'warning'); return; }

    const payload = {
        venda_id: venda.id,
        cliente: dadosCliente,
        produtos,
        cfop,
        natureza_operacao: document.getElementById('nfeNatOp').value,
        modalidade_frete: document.getElementById('nfeModFrete').value,
        access_token: await autoManageMLToken(),
        shipment_id: venda.id_envio,
        pack_id: venda.pack_id
    };

    console.log('📤 Enviando para backend:', payload); // LOG

    const btn = document.getElementById('btnEmitirNFE');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<span class="spinner"></span> Emitindo...';
    btn.disabled = true;

    try {
        const backendUrl = 'http://localhost:3000/nfe/emitir';
        const response = await fetch(backendUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const text = await response.text();
        let result;
        try { result = JSON.parse(text); } catch(e) { throw new Error(`Resposta inválida do servidor: ${text.substring(0,200)}`); }
        if (!response.ok) throw new Error(result.error);
        const index = vendasNFE.findIndex(v => String(v.id) === String(venda.id));
        if (index !== -1) {
            vendasNFE[index].nfe_emitida = true;
            vendasNFE[index].nfe_chave = result.chaveAcesso;
            vendasNFE[index].nfe_protocolo = result.protocolo;
        }
        salvarCacheVendas(vendasNFE);
        renderizarTabelaNFE(vendasNFE);
        showToast('✅ NF-e emitida com sucesso!', 'success');
        fecharModalEmissaoNFE();
    } catch (err) {
        console.error(err);
        showToast('Erro: ' + err.message, 'error');
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

// ===== VER DETALHES DA NF-e =====
async function verDetalhesNFE(vendaId) {
    const venda = vendasNFE.find(v => String(v.id) === String(vendaId));
    if (!venda) { showToast('Venda não encontrada', 'error'); return; }
    if (venda.nfe_cancelada) {
        alert(`NF-e CANCELADA\nChave: ${venda.nfe_chave}\nProtocolo original: ${venda.nfe_protocolo}\nCancelamento: ${venda.nfe_cancelamento_protocolo || 'N/A'}`);
    } else if (venda.nfe_emitida) {
        alert(`NF-e Emitida\nChave: ${venda.nfe_chave}\nProtocolo: ${venda.nfe_protocolo}`);
    } else {
        showToast('Nenhuma NF-e encontrada para esta venda', 'warning');
    }
}

// ===== CANCELAR NF-e =====
window.cancelarNFE = async function(vendaId, chaveAcesso, protocolo) {
    if (!confirm('Tem certeza que deseja cancelar esta NF-e?\n\nEsta ação não pode ser desfeita.')) return;
    const justificativa = prompt('Digite a justificativa para o cancelamento (máx. 255 caracteres):');
    if (!justificativa) return;
    const btn = event.target;
    const originalText = btn.innerHTML;
    btn.innerHTML = '<span class="spinner"></span> Cancelando...';
    btn.disabled = true;
    try {
        const response = await fetch('http://localhost:3000/nfe/cancelar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ venda_id: vendaId, chaveAcesso, protocolo, justificativa })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        const index = vendasNFE.findIndex(v => v.id === vendaId);
        if (index !== -1) {
            vendasNFE[index].nfe_cancelada = true;
            vendasNFE[index].nfe_emitida = false;
        }
        renderizarTabelaNFE(vendasNFE);
        showToast('✅ NF-e cancelada com sucesso!', 'success');
    } catch (err) {
        console.error(err);
        showToast('Erro ao cancelar: ' + err.message, 'error');
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
};

// ===== NCM =====
async function carregarNcmPorSku() {
    try {
        if (!supabaseClient) return;
        const { data, error } = await supabaseClient.from('ncm_por_sku').select('sku, ncm');
        if (error) throw error;
        if (data) {
            ncmPorSku = {};
            data.forEach(item => { ncmPorSku[item.sku] = item.ncm; });
        }
    } catch (err) { console.error('Erro ao carregar NCM:', err); }
}
async function salvarNcmParaSku(sku, ncm) {
    try {
        if (!supabaseClient) return;
        await supabaseClient.from('ncm_por_sku').upsert({ sku, ncm }, { onConflict: 'sku' });
        ncmPorSku[sku] = ncm;
    } catch (err) { console.warn(err); }
}

// ===== EXPORTA GLOBAL =====
window.abrirSistemaNFE = abrirSistemaNFE;
window.atualizarVendasNFE = atualizarVendasNFE;
window.carregarVendasParaNFE = carregarVendasParaNFE;
window.abrirModalEmissaoNFE = abrirModalEmissaoNFE;
window.fecharModalEmissaoNFE = fecharModalEmissaoNFE;
window.emitirNFE = emitirNFE;
window.verDetalhesNFE = verDetalhesNFE;
window.cancelarNFE = cancelarNFE;