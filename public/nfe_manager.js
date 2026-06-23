// nfe_manager.js - Versão com preenchimento manual de dados do cliente
window.showToast = window.showToast || showToast;

// Configurações globais
if (!window.WORKER_URL) window.WORKER_URL = 'https://purple-bonus-3b1c.andmiotto1998.workers.dev';
if (!window.API_BASE_URL) window.API_BASE_URL = 'http://localhost:3000';

let vendasPendentes = [];
let pendingEmitOrderId = null;

// ===== VERIFICAR SE É FULL (mesma lógica do shipping_simple.js) =====
function isFullByAnyField(item) {
    const text = `${item.titulo || ''} ${item.mlb || ''} ${item.id || ''} ${item.shipping?.logistic_type || ''} ${item.tags?.join(' ') || ''}`.toLowerCase();
    return /full|fulfillment/.test(text);
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

// ===================== LISTAR VENDAS PENDENTES (API ML + Worker) =====================
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
        const proxyUrl = `${window.WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(url)}&token=${token}`;
        const response = await fetch(proxyUrl);
        const data = await response.json();
        const results = data.results || [];

        if (results.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center">Nenhuma venda encontrada<\/td><\/tr>';
            return;
        }

        // Buscar IDs das vendas já emitidas
        const emitidas = JSON.parse(localStorage.getItem('nfe_emitidas_ids') || '[]');

        // Filtrar:
        // 1. Remover as já emitidas
        // 2. Remover as que são FULL (usando a mesma lógica)
        const pendentes = results.filter(v => {
            // Já emitida?
            if (emitidas.includes(String(v.id))) return false;

            // Verifica se é FULL
            const isFull = isFullByAnyField(v);
            if (isFull) {
                console.log(`🚫 Venda FULL ignorada: ${v.id}`);
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
                <td>${v.id}<\/td>
                <td>${new Date(v.date_created).toLocaleDateString('pt-BR')}<\/td>
                <td>${v.buyer?.nickname || 'N/I'}<\/td>
                <td>${v.order_items?.[0]?.item?.seller_sku || 'N/A'}<\/td>
                <td>R$ ${v.total_amount?.toFixed(2)}<\/td>
                <td>
                    <button class="btn btn-sm btn-success" data-venda-id="${v.id}">Emitir NF-e<\/button>
                 <\/td>
            </tr>`).join('');

        // Event listeners
        document.querySelectorAll('#vendasPendentesBody button[data-venda-id]').forEach(btn => {
            btn.removeEventListener('click', emitirNFEParaVendaHandler);
            btn.addEventListener('click', emitirNFEParaVendaHandler);
        });

    } catch (error) {
        console.error(error);
        tbody.innerHTML = `<tr><td colspan="6" class="text-center text-danger">Erro: ${error.message}<\/td><\/tr>`;
    }
}

function emitirNFEParaVendaHandler(event) {
    const orderId = event.currentTarget.getAttribute('data-venda-id');
    emitirNFEParaVenda(orderId);
}

// ===================== EMITIR NF-e PARA UMA VENDA =====================
// ===================== EMITIR NF-e PARA UMA VENDA =====================
async function emitirNFEParaVenda(orderId) {
    console.log('🔵 Preparar emissão NF-e para venda:', orderId);
    pendingEmitOrderId = orderId;

    // Limpa o formulário do modal
    document.getElementById('clienteNome').value = '';
    document.getElementById('clienteDocumento').value = '';
    document.getElementById('clienteEndereco').value = '';
    document.getElementById('clienteNumero').value = 'S/N';
    document.getElementById('clienteBairro').value = '';
    document.getElementById('clienteCidade').value = '';
    document.getElementById('clienteUF').value = '';
    document.getElementById('clienteCEP').value = '';

    // Função auxiliar para extrair valor de campo (string ou objeto com name)
    function getValue(field) {
        if (!field) return '';
        if (typeof field === 'string') return field;
        if (typeof field === 'object' && field.name) return field.name;
        return '';
    }

    try {
        // 1. Obter token válido do ML
        let token = localStorage.getItem('ml_access_token');
        if (!token && typeof window.getValidToken === 'function') {
            const tokenData = await window.getValidToken();
            token = tokenData?.access_token;
        }
        if (!token) {
            showToast('⚠️ Token ML não disponível. Preencha manualmente.', 'warning');
            document.getElementById('modalDadosClienteNFE').classList.remove('hidden');
            return;
        }

        // 2. Buscar dados da ordem
        const url = `https://api.mercadolibre.com/orders/${orderId}`;
        let venda = null;

        try {
            const proxyUrl = `${window.WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(url)}&token=${token}`;
            const response = await fetch(proxyUrl);
            if (response.ok) {
                venda = await response.json();
                console.log('✅ Venda obtida via Worker');
            } else {
                throw new Error(`Worker falhou: ${response.status}`);
            }
        } catch (workerError) {
            console.warn('⚠️ Worker falhou, tentando chamada direta...', workerError);
            const directResponse = await fetch(url, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (directResponse.ok) {
                venda = await directResponse.json();
                console.log('✅ Venda obtida via chamada direta');
            } else {
                throw new Error(`Falha na chamada direta: ${directResponse.status}`);
            }
        }

        if (!venda) {
            showToast('❌ Não foi possível obter os dados da venda.', 'error');
            document.getElementById('modalDadosClienteNFE').classList.remove('hidden');
            return;
        }

        // ===== VERIFICAÇÃO DE VENDA FULL =====
        if (typeof isFullByAnyField === 'function') {
            const isFull = isFullByAnyField(venda);
            if (isFull) {
                console.log('🚫 Venda FULL – NF-e não permitida.');
                showToast('🚫 Esta venda é FULL e não permite emissão manual de NF-e.', 'warning');
                // Abre o modal mesmo assim? Melhor não abrir, apenas avisa e retorna.
                // Mas se quiser permitir edição manual, pode abrir com campos desabilitados.
                // Vamos abrir e desabilitar os campos? Melhor não abrir.
                document.getElementById('modalDadosClienteNFE').classList.remove('hidden');
                // Desabilita o botão de emitir? Não, mas o backend também bloqueará.
                return;
            }
        } else {
            console.warn('⚠️ Função isFullByAnyField não definida. Verifique se nfe_manager.js a inclui.');
        }

        // 3. Buscar dados do envio (shipment) para obter o endereço completo
        let address = {};
        if (venda.shipping && venda.shipping.id) {
            try {
                const shipUrl = `https://api.mercadolibre.com/shipments/${venda.shipping.id}`;
                const shipProxyUrl = `${window.WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(shipUrl)}&token=${token}`;
                const shipResponse = await fetch(shipProxyUrl);
                if (shipResponse.ok) {
                    const shipment = await shipResponse.json();
                    console.log('📦 Dados do shipment obtidos:', shipment);
                    // O endereço está em receiver_address
                    if (shipment.receiver_address) {
                        address = shipment.receiver_address;
                    } else if (shipment.shipping_option && shipment.shipping_option.receiver_address) {
                        address = shipment.shipping_option.receiver_address;
                    }
                } else {
                    console.warn('⚠️ Não foi possível obter os dados do shipment');
                }
            } catch (shipError) {
                console.warn('⚠️ Erro ao buscar shipment:', shipError);
            }
        }

        // Fallback: se não conseguir pelo shipment, tenta buyer.address (raro)
        if (!address.address_line && !address.street_name && venda.buyer && venda.buyer.address) {
            address = venda.buyer.address;
            console.log('📦 Usando endereço do comprador (buyer.address)');
        }

        // 4. Extrair nome do comprador
        const buyer = venda.buyer || {};
        const nome = `${buyer.first_name || ''} ${buyer.last_name || ''}`.trim() || buyer.nickname || '';
        document.getElementById('clienteNome').value = nome;

        // 5. Preencher endereço
        const logradouro = address.address_line || address.street_name || '';
        document.getElementById('clienteEndereco').value = logradouro;

        const numero = address.street_number || 'S/N';
        document.getElementById('clienteNumero').value = numero;

        const bairro = getValue(address.neighborhood);
        document.getElementById('clienteBairro').value = bairro;

        const cidade = getValue(address.city);
        document.getElementById('clienteCidade').value = cidade;

        const uf = getValue(address.state);
        document.getElementById('clienteUF').value = uf;

        const cep = address.zip_code ? address.zip_code.replace(/\D/g, '') : '';
        document.getElementById('clienteCEP').value = cep;

        // 6. CPF/CNPJ – o ML NÃO fornece, fica em branco para preenchimento manual
        document.getElementById('clienteDocumento').value = '';

        // 7. Log dos dados preenchidos (para depuração)
        console.log('📋 Dados preenchidos no modal:', {
            nome,
            logradouro,
            numero,
            bairro,
            cidade,
            uf,
            cep,
            documento: '(em branco - preencher manualmente)'
        });

        // 8. Salvar token para uso na emissão
        window._mlAccessToken = token;

        // 9. Exibir modal
        document.getElementById('modalDadosClienteNFE').classList.remove('hidden');

    } catch (error) {
        console.error('❌ Erro ao buscar dados da venda:', error);
        showToast('❌ Erro ao carregar dados. Preencha manualmente.', 'error');
        document.getElementById('modalDadosClienteNFE').classList.remove('hidden');
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

    // Capturar dados do formulário
    const nome = document.getElementById('clienteNome').value.trim();
    const documento = document.getElementById('clienteDocumento').value.trim().replace(/\D/g, '');
    const endereco = document.getElementById('clienteEndereco').value.trim();
    const numero = document.getElementById('clienteNumero').value.trim() || 'S/N';
    const bairro = document.getElementById('clienteBairro').value.trim() || '';
    const cidade = document.getElementById('clienteCidade').value.trim();
    const uf = document.getElementById('clienteUF').value.trim().toUpperCase();
    const cep = document.getElementById('clienteCEP').value.trim().replace(/\D/g, '');

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
    const btn = document.querySelector(`button[data-venda-id="${orderId}"]`);
    let originalText = '';
    if (btn) {
        originalText = btn.innerHTML;
        btn.innerHTML = '<span class="spinner"></span> Emitindo...';
        btn.disabled = true;
    }

    try {
        // Obter token ML atual (do contexto)
        const mlToken = window._mlAccessToken || null;

        // Buscar produtos da venda (já temos a venda, mas podemos usar os dados salvos)
        let produtos = [];
        let token = localStorage.getItem('ml_access_token');
        if (!token && typeof window.getValidToken === 'function') {
            const tokenData = await window.getValidToken();
            token = tokenData?.access_token;
        }
        if (token) {
            const url = `https://api.mercadolibre.com/orders/${orderId}`;
            const proxyUrl = `${window.WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(url)}&token=${token}`;
            const response = await fetch(proxyUrl);
            if (response.ok) {
                const venda = await response.json();
                produtos = (venda.order_items || []).map(item => ({
                    nome: item.item.title,
                    quantidade: item.quantity,
                    valor_unitario: item.unit_price,
                    sku: item.item.seller_sku || 'SEM_SKU',
                    ncm: '87149990'
                }));
            }
        }
        if (produtos.length === 0) {
            // Fallback: produtos genéricos (caso a API falhe)
            produtos = [{
                nome: 'Produto não identificado',
                quantidade: 1,
                valor_unitario: 0,
                sku: 'SEM_SKU',
                ncm: '87149990'
            }];
        }

        const cfop = (uf === 'PR') ? '5102' : '6108';

        const payload = {
            venda_id: String(orderId),
            cliente: {
                nome: nome,
                documento: documento,
                endereco: endereco,
                numero: numero,
                bairro: bairro,
                cidade: cidade,
                uf: uf,
                cep: cep
            },
            produtos: produtos,
            cfop: cfop,
            natureza_operacao: 'VENDA',
            modalidade_frete: '9',
            transportadora_id: null,
            ml_access_token: mlToken  // <-- ENVIA O TOKEN PARA O BACKEND
        };

        const emitResponse = await fetch(`${window.API_BASE_URL}/nfe/emitir`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const result = await emitResponse.json();

        if (result.success) {
            showToast(`✅ NF-e emitida! Protocolo: ${result.protocolo}`, 'success');
            // Marcar venda como emitida no localStorage
            const emitidas = JSON.parse(localStorage.getItem('nfe_emitidas_ids') || '[]');
            if (!emitidas.includes(String(orderId))) {
                emitidas.push(String(orderId));
                localStorage.setItem('nfe_emitidas_ids', JSON.stringify(emitidas));
            }
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
        window._mlAccessToken = null; // limpa
    }
}

// ===================== DEMais FUNÇÕES (já existentes) =====================
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
        tbody.innerHTML = nfes.map(nfe => `
            <tr>
                <td><small>${nfe.chave}</small><\/td>
                <td>${nfe.protocolo || '-'}<\/td>
                <td>${nfe.clientes?.nome || '-'}<\/td>
                <td>R$ ${parseFloat(nfe.valor_total).toFixed(2)}<\/td>
                <td>${new Date(nfe.data_emissao).toLocaleDateString('pt-BR')}<\/td>
                <td>
                    <button class="btn btn-sm btn-info" onclick="visualizarNFE('${nfe.chave}')">Visualizar<\/button>
                    <button class="btn btn-sm btn-secondary" onclick="baixarXMLNFE('${nfe.chave}')">XML<\/button>
                    ${!nfe.cancelada ? `<button class="btn btn-sm btn-danger" onclick="cancelarNFE('${nfe.chave}')">Cancelar<\/button>` : '<span class="badge badge-danger">Cancelada</span>'}
                 <\/td>
            </tr>`).join('');
    } catch (error) {
        console.error(error);
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-danger">Erro ao carregar NF-es<\/td><\/tr>';
    }
}

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

// ===================== EXPOR FUNÇÕES GLOBAIS (necessário para os eventos inline do HTML) =====================
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

// ===================== INICIALIZAR EVENT LISTENERS DO MODAL =====================
document.addEventListener('DOMContentLoaded', function() {
    const confirmarBtn = document.getElementById('confirmarModalNFEBtn');
    const cancelarBtn = document.getElementById('cancelarModalNFEBtn');
    if (confirmarBtn) confirmarBtn.addEventListener('click', confirmarEmissaoNFE);
    if (cancelarBtn) cancelarBtn.addEventListener('click', fecharModalDadosClienteNFE);
});