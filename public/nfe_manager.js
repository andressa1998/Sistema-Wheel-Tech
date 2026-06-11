window.showToast = window.showToast || showToast;

// URL do back-end (Render)
const API_BASE_URL = 'https://backend-nfe.onrender.com';

let vendasPendentes = [];

// ===================== ABAS =====================
async function mostrarAbaNFE(aba) {
    document.getElementById('abaVendas').classList.add('hidden');
    document.getElementById('abaEmitidas').classList.add('hidden');
    document.getElementById('abaAvulsa').classList.add('hidden');
    document.getElementById('abaTransportadoras').classList.add('hidden');
    document.getElementById('abaClientes').classList.add('hidden');
    
    document.getElementById(`aba${aba.charAt(0).toUpperCase() + aba.slice(1)}`).classList.remove('hidden');
    
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

// ===================== VENDAS SEM NF-e =====================
async function carregarVendasPendentes() {
    const tbody = document.getElementById('vendasPendentesBody');
    tbody.innerHTML = '<table><td colspan="6" class="text-center"><div class="spinner"></div> Carregando...<\/td><\/tr>';
    try {
        // Usa o cliente Supabase já existente no window (criado em script.js)
        const { data, error } = await window.supabaseClient
            .from('vendas_ml')
            .select('id, cliente, sku, valor_total, data_venda, dados_completos, meio_envio')
            .eq('nfe_emitida', false);

        if (error) throw error;

        if (!data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center">Nenhuma venda pendente de NF-e<\/td><\/tr>';
            return;
        }

        // Mapeia os campos (ajuste o nome da coluna do JSON: pode ser 'dados_completos' ou 'order_data')
        const vendas = data.map(v => ({
            id: v.id,
            order_id: String(v.id),
            cliente_nome: v.cliente || 'Cliente',
            sku: v.sku,
            valor_total: v.valor_total,
            data_venda: v.data_venda,
            produtos: v.dados_completos, // usa a coluna que tem o JSON da venda
            meio_envio: v.meio_envio
        }));
        vendasPendentes = vendas;

        tbody.innerHTML = vendas.map(v => `
            <tr>
                <td>${v.order_id}<\/td>
                <td>${new Date(v.data_venda).toLocaleDateString('pt-BR')}<\/td>
                <td>${v.cliente_nome}<\/td>
                <td>${v.sku}<\/td>
                <td>R$ ${v.valor_total.toFixed(2)}<\/td>
                <td>
                    <button class="btn btn-sm btn-success" onclick="emitirNFEParaVenda('${v.order_id}')">Emitir NF-e<\/button>
                 <\/td>
            </tr>`).join('');
    } catch (error) {
        console.error('Erro carregarVendasPendentes do Supabase:', error);
        tbody.innerHTML = '<td><td colspan="6" class="text-center text-danger">Erro ao carregar vendas. Verifique o console.<\/td><\/tr>';
    }
}

// ===================== EMISSÃO =====================
async function emitirNFEParaVenda(orderId) {
    console.log('🔵 emitirNFEParaVenda chamada com orderId:', orderId);
    if (!orderId || orderId === 'null' || orderId === 'undefined') {
        showToast('Identificador da venda inválido', 'error');
        return;
    }

    const venda = vendasPendentes.find(v => String(v.order_id) === String(orderId));
    if (!venda) {
        showToast('Venda não encontrada', 'error');
        return;
    }

    const btn = document.querySelector(`button[onclick*="emitirNFEParaVenda('${orderId}')"]`);
    let originalText = '';
    if (btn) {
        originalText = btn.innerHTML;
        btn.innerHTML = '<span class="spinner"></span> Emitindo...';
        btn.disabled = true;
    }

    // Montar produtos (fallback se não houver detalhes)
    let produtos = [];
    try {
        let rawProdutos = venda.produtos;
        if (rawProdutos && typeof rawProdutos === 'string') {
            rawProdutos = JSON.parse(rawProdutos);
        }
        if (rawProdutos && rawProdutos.order_items && rawProdutos.order_items.length) {
            produtos = rawProdutos.order_items.map(item => ({
                nome: item.item.title,
                quantidade: item.quantity,
                valor_unitario: item.unit_price,
                sku: item.item.seller_sku || 'SEM_SKU',
                ncm: '87149990'
            }));
        } else {
            produtos = [{
                nome: 'Produto ML',
                quantidade: 1,
                valor_unitario: venda.valor_total || 0,
                sku: venda.sku || 'SEM_SKU',
                ncm: '87149990'
            }];
        }
    } catch (e) {
        console.warn('Erro ao parsear produtos, usando fallback', e);
        produtos = [{
            nome: 'Produto ML',
            quantidade: 1,
            valor_unitario: venda.valor_total || 0,
            sku: venda.sku || 'SEM_SKU',
            ncm: '87149990'
        }];
    }

    const dados = {
        venda_id: orderId,
        cliente: {
            nome: venda.cliente_nome || 'Cliente ML',
            documento: '',
            endereco: '',
            numero: '',
            bairro: '',
            cidade: '',
            uf: 'PR',
            cep: '83702090'
        },
        produtos: produtos,
        cfop: '5102', // padrão para vendas dentro do PR (ajuste se necessário)
        natureza_operacao: 'VENDA',
        modalidade_frete: '9',
        transportadora_id: null
    };

    try {
        const response = await fetch(`${API_BASE_URL}/nfe/emitir`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dados)
        });
        const result = await response.json();
        if (result.success) {
            showToast(`✅ NF-e emitida com sucesso! Protocolo: ${result.protocolo}`, 'success');
            await carregarVendasPendentes();  // atualiza lista
            await carregarNFesEmitidas();
        } else {
            showToast(`❌ Erro na emissão: ${result.error}`, 'error');
        }
    } catch (error) {
        console.error('Erro ao emitir:', error);
        showToast(`Erro de comunicação: ${error.message}`, 'error');
    } finally {
        if (btn) {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    }
}

// ===================== NF-ES EMITIDAS =====================
async function carregarNFesEmitidas() {
    const tbody = document.getElementById('nfesEmitidasBody');
    tbody.innerHTML = '<tr><td colspan="6" class="text-center"><div class="spinner"></div> Carregando...<\/td><\/tr>';
    try {
        const response = await fetch(`${API_BASE_URL}/nfe/listar-nfes`);
        const data = await response.json();
        if (!data.success) throw new Error(data.error);
        const nfes = data.notas || [];
        if (!nfes.length) {
            tbody.innerHTML = '<td><td colspan="6" class="text-center">Nenhuma NF-e emitida<\/td><\/tr>';
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
        const response = await fetch(`${API_BASE_URL}/nfe/buscar-xml?chave=${chaveAcesso}`);
        const data = await response.json();
        if (!data.xml) {
            showToast('XML não encontrado', 'error');
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
        <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            .header { text-align: center; margin-bottom: 20px; }
            .card { border: 1px solid #ccc; padding: 15px; margin-bottom: 15px; border-radius: 5px; }
            .row { display: flex; margin-bottom: 5px; }
            .label { width: 130px; font-weight: bold; }
            @media print { body { margin: 0; } .no-print { display: none; } }
        </style>
        </head>
        <body>
            <div class="no-print" style="text-align:center; margin-bottom:20px;">
                <button onclick="window.print()">Imprimir</button>
                <button onclick="window.close()">Fechar</button>
            </div>
            <div class="header">
                <h2>Nota Fiscal Eletrônica</h2>
                <p>Chave de Acesso: ${chave}</p>
                <p>Protocolo: ${protocolo}</p>
            </div>
            <div class="card">
                <h3>Emitente</h3>
                <div class="row"><div class="label">Nome:</div><div>${emitNome}</div></div>
            </div>
            <div class="card">
                <h3>Destinatário</h3>
                <div class="row"><div class="label">Nome:</div><div>${destNome}</div></div>
            </div>
            <div class="card">
                <h3>Valor Total</h3>
                <div class="row"><div class="label">R$:</div><div>${vNF}</div></div>
            </div>
            <div class="card">
                <h3>Produtos</h3>
                ${Array.from(xmlDoc.querySelectorAll('det')).map(det => {
                    const prod = det.querySelector('prod');
                    return `<div>${prod.querySelector('xProd')?.textContent} - Quant: ${prod.querySelector('qCom')?.textContent} - Valor: R$ ${prod.querySelector('vProd')?.textContent}</div>`;
                }).join('')}
            </div>
        </body>
        </html>`;
        const win = window.open();
        win.document.write(html);
        win.document.close();
    } catch (error) {
        showToast('Erro ao visualizar NF-e', 'error');
    }
}

async function baixarXMLNFE(chaveAcesso) {
    try {
        const response = await fetch(`${API_BASE_URL}/nfe/buscar-xml?chave=${chaveAcesso}`);
        const data = await response.json();
        if (!data.xml) {
            showToast('XML não encontrado', 'error');
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
        showToast('Erro ao baixar XML', 'error');
    }
}

async function cancelarNFE(chaveAcesso) {
    const justificativa = prompt('Informe a justificativa para cancelamento:');
    if (!justificativa) return;
    try {
        const response = await fetch(`${API_BASE_URL}/nfe/cancelar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chaveAcesso, justificativa })
        });
        const result = await response.json();
        if (result.success) {
            showToast('NF-e cancelada com sucesso', 'success');
            await carregarNFesEmitidas();
        } else {
            showToast('Erro ao cancelar: ' + result.error, 'error');
        }
    } catch (error) {
        showToast('Erro de comunicação', 'error');
    }
}

// ===================== TRANSPORTADORAS =====================
async function carregarTransportadoras() {
    const tbody = document.getElementById('transportadorasBody');
    tbody.innerHTML = '<tr><td colspan="4" class="text-center"><div class="spinner"></div> Carregando...<\/td><\/tr>';
    try {
        const response = await fetch(`${API_BASE_URL}/nfe/transportadoras`);
        const data = await response.json();
        if (!data.success) throw new Error(data.error);
        const transportadoras = data.transportadoras || [];
        if (!transportadoras.length) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center">Nenhuma transportadora cadastrada<\/td><\/tr>';
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
        const response = await fetch(`${API_BASE_URL}/nfe/transportadoras/${id}`, { method: 'DELETE' });
        if (response.ok) {
            showToast('Transportadora excluída', 'success');
            await carregarTransportadoras();
        } else {
            showToast('Erro ao excluir', 'error');
        }
    } catch (error) {
        showToast('Erro de comunicação', 'error');
    }
}

// ===================== CLIENTES =====================
async function carregarClientes() {
    const tbody = document.getElementById('clientesBody');
    tbody.innerHTML = '<tr><td colspan="4" class="text-center"><div class="spinner"></div> Carregando...<\/td><\/tr>';
    try {
        const response = await fetch(`${API_BASE_URL}/nfe/clientes`);
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
        tbody.innerHTML = '<td><td colspan="4" class="text-center text-danger">Erro ao carregar<\/td><\/tr>';
    }
}

async function excluirCliente(id) {
    if (!confirm('Excluir este cliente?')) return;
    try {
        const response = await fetch(`${API_BASE_URL}/nfe/clientes/${id}`, { method: 'DELETE' });
        if (response.ok) {
            showToast('Cliente excluído', 'success');
            await carregarClientes();
        } else {
            showToast('Erro ao excluir', 'error');
        }
    } catch (error) {
        showToast('Erro de comunicação', 'error');
    }
}

// ===================== EMISSÃO AVULSA =====================
async function emitirNFEAvulsa() {
    const clienteId = document.getElementById('avulsaClienteId').value;
    if (!clienteId) {
        showToast('Selecione um cliente', 'warning');
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
        showToast('Produtos inválidos. Use um array JSON válido.', 'error');
        return;
    }
    const dados = { cliente: { id: clienteId }, produtos, cfop, natureza_operacao: natOp, modalidade_frete: modFrete, transportadora_id: transportadoraId };
    const btn = event.target;
    const original = btn.innerHTML;
    btn.innerHTML = '<span class="spinner"></span> Emitindo...';
    btn.disabled = true;
    try {
        const response = await fetch(`${API_BASE_URL}/nfe/emitir-avulsa`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dados)
        });
        const result = await response.json();
        if (result.success) {
            showToast('NF-e avulsa emitida com sucesso!', 'success');
            limparFormAvulsa();
            await carregarNFesEmitidas();
        } else {
            showToast('Erro: ' + result.error, 'error');
        }
    } catch (error) {
        showToast('Erro de comunicação', 'error');
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

// ===================== SINCRONIZAÇÃO DESABILITADA =====================
async function sincronizarVendasML() {
    showToast('A sincronização de vendas é feita automaticamente pelo módulo de Vendas ML. Utilize o botão "Sincronizar Agora" na aba de Vendas.', 'info');
}

// ===================== INICIALIZAÇÃO =====================
function inicializarAbaNFE() {
    mostrarAbaNFE('vendas');
}

// Expor funções globalmente
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