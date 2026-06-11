// nfe_manager.js - Versão com preenchimento manual de dados do cliente
window.showToast = window.showToast || showToast;

// Configurações globais
if (!window.WORKER_URL) window.WORKER_URL = 'https://purple-bonus-3b1c.andmiotto1998.workers.dev';
if (!window.API_BASE_URL) window.API_BASE_URL = 'https://backend-nfe.onrender.com';

let vendasPendentes = [];
let pendingEmitOrderId = null;

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

        const emitidas = JSON.parse(localStorage.getItem('nfe_emitidas_ids') || '[]');
        const pendentes = results.filter(v => !emitidas.includes(String(v.id)));

        if (pendentes.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center">Todas as vendas já possuem NF-e emitida<\/td><\/tr>';
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
        
        // Adiciona event listeners para os botões (evita onclick)
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

// ===================== ABRIR MODAL PARA PREENCHER DADOS DO CLIENTE =====================
async function emitirNFEParaVenda(orderId) {
    console.log('🔵 Preparar emissão NF-e para venda:', orderId);
    pendingEmitOrderId = orderId;
    
    // Limpar formulário
    document.getElementById('clienteNome').value = '';
    document.getElementById('clienteDocumento').value = '';
    document.getElementById('clienteEndereco').value = '';
    document.getElementById('clienteNumero').value = 'S/N';
    document.getElementById('clienteBairro').value = '';
    document.getElementById('clienteCidade').value = '';
    document.getElementById('clienteUF').value = '';
    document.getElementById('clienteCEP').value = '';
    
    // Tenta pré‑preencher com dados da venda (opcional)
    try {
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
                const buyer = venda.buyer || {};
                const address = venda.shipping?.receiver_address || {};
                document.getElementById('clienteNome').value = `${buyer.first_name || ''} ${buyer.last_name || ''}`.trim() || buyer.nickname || '';
                document.getElementById('clienteEndereco').value = address.address_line || address.street_name || '';
                document.getElementById('clienteNumero').value = address.street_number || 'S/N';
                document.getElementById('clienteBairro').value = address.neighborhood || '';
                document.getElementById('clienteCidade').value = address.city || '';
                document.getElementById('clienteUF').value = address.state || '';
                document.getElementById('clienteCEP').value = address.zip_code?.replace(/\D/g, '') || '';
            }
        }
    } catch (e) { console.warn('Não foi possível pré‑carregar dados:', e); }
    
    // Exibe modal
    const modal = document.getElementById('modalDadosClienteNFE');
    if (modal) modal.classList.remove('hidden');
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
        window.showToast('Nenhuma venda selecionada', 'error');
        fecharModalDadosClienteNFE();
        return;
    }
    
    // Capturar dados do formulário
    const nome = document.getElementById('clienteNome').value.trim();
    let documento = document.getElementById('clienteDocumento').value.trim().replace(/\D/g, '');
    const endereco = document.getElementById('clienteEndereco').value.trim();
    const numero = document.getElementById('clienteNumero').value.trim() || 'S/N';
    const bairro = document.getElementById('clienteBairro').value.trim() || '';
    const cidade = document.getElementById('clienteCidade').value.trim();
    const uf = document.getElementById('clienteUF').value.trim().toUpperCase();
    const cep = document.getElementById('clienteCEP').value.trim().replace(/\D/g, '');
    
    // Validações
    if (!nome) { window.showToast('Nome é obrigatório', 'warning'); return; }
    if (!documento || (documento.length !== 11 && documento.length !== 14)) {
        window.showToast('CPF/CNPJ inválido (11 ou 14 dígitos)', 'warning');
        return;
    }
    if (!endereco) { window.showToast('Endereço é obrigatório', 'warning'); return; }
    if (!cidade) { window.showToast('Cidade é obrigatória', 'warning'); return; }
    if (uf.length !== 2) { window.showToast('UF deve ter 2 letras', 'warning'); return; }
    
    fecharModalDadosClienteNFE();
    
    // Mostrar loading no botão que chamou (opcional)
    const btn = document.querySelector(`button[data-venda-id="${orderId}"]`);
    let originalText = '';
    if (btn) {
        originalText = btn.innerHTML;
        btn.innerHTML = '<span class="spinner"></span> Emitindo...';
        btn.disabled = true;
    }
    
    try {
        // Obter produtos da venda via API ML
        let token = localStorage.getItem('ml_access_token');
        if (!token && typeof window.getValidToken === 'function') {
            const tokenData = await window.getValidToken();
            token = tokenData?.access_token;
        }
        if (!token) throw new Error('Token ML não disponível');
        
        const url = `https://api.mercadolibre.com/orders/${orderId}`;
        const proxyUrl = `${window.WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(url)}&token=${token}`;
        const response = await fetch(proxyUrl);
        if (!response.ok) throw new Error(`Erro ao buscar venda: ${response.status}`);
        const venda = await response.json();
        
        const produtos = (venda.order_items || []).map(item => ({
            nome: item.item.title,
            quantidade: item.quantity,
            valor_unitario: item.unit_price,
            sku: item.item.seller_sku || 'SEM_SKU',
            ncm: '87149990'
        }));
        if (produtos.length === 0) throw new Error('Nenhum produto encontrado');
        
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
            transportadora_id: null
        };
        
        const emitResponse = await fetch(`${window.API_BASE_URL}/nfe/emitir`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const result = await emitResponse.json();
        
        if (result.success) {
            window.showToast(`✅ NF-e emitida! Protocolo: ${result.protocolo}`, 'success');
            const emitidas = JSON.parse(localStorage.getItem('nfe_emitidas_ids') || '[]');
            if (!emitidas.includes(String(orderId))) {
                emitidas.push(String(orderId));
                localStorage.setItem('nfe_emitidas_ids', JSON.stringify(emitidas));
            }
            await carregarVendasPendentes();
            await carregarNFesEmitidas();
        } else {
            window.showToast(`❌ Erro: ${result.error}`, 'error');
        }
    } catch (error) {
        console.error(error);
        window.showToast(`Erro: ${error.message}`, 'error');
    } finally {
        if (btn) {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
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

// ===================== INICIALIZAR EVENT LISTENERS DO MODAL =====================
document.addEventListener('DOMContentLoaded', function() {
    const confirmarBtn = document.getElementById('confirmarModalNFEBtn');
    const cancelarBtn = document.getElementById('cancelarModalNFEBtn');
    if (confirmarBtn) confirmarBtn.addEventListener('click', confirmarEmissaoNFE);
    if (cancelarBtn) cancelarBtn.addEventListener('click', fecharModalDadosClienteNFE);
});