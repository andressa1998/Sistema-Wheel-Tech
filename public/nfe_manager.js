// nfe_manager.js – versão corrigida com gestão de transportadoras e produto
const NFE_API_URL = 'https://purple-bonus-3b1c.andmiotto1998.workers.dev';
console.log('✅ nfe_manager.js carregado – v2');

let vendasSemNFE = [];
let vendasSelecionadas = new Set();
let transportadoras = [];

// ========== TRANSPORTADORAS (CRUD) ==========
async function carregarTransportadoras() {
    const client = window.supabaseClient || supabaseClient;
    if (!client) {
        console.warn('Supabase não inicializado');
        return;
    }

    // Tenta criar a tabela se não existir (executa uma vez)
    try {
        const { error: createError } = await client.rpc('create_transportadoras_table');
        if (createError && !createError.message.includes('already exists')) {
            console.warn('Não foi possível criar tabela automática:', createError);
        }
    } catch (e) {
        // ignora erro do RPC
    }

    const { data, error } = await client
        .from('transportadoras')
        .select('*')
        .order('nome');

    if (error) {
        console.error('Erro ao carregar transportadoras:', error);
        showToast('Erro ao carregar transportadoras: ' + error.message, 'error');
        return;
    }

    transportadoras = data || [];
    const select = document.getElementById('nfeTransportadora');
    if (select) {
        select.innerHTML = '<option value="">Selecione uma transportadora</option>';
        transportadoras.forEach(t => {
            select.innerHTML += `<option value="${t.id}">${t.nome} - ${t.cnpj}</option>`;
        });
        if (transportadoras.length === 0) {
            select.innerHTML = '<option value="">Nenhuma transportadora cadastrada. Clique em "Gerenciar" para adicionar.</option>';
        }
    }
}

async function abrirModalTransportadoras() {
    // Garante que a tabela exista antes de listar
    await carregarListaTransportadoras();
    const modal = document.getElementById('modalTransportadoras');
    if (modal) modal.classList.remove('hidden');
}

function fecharModalTransportadoras() {
    const modal = document.getElementById('modalTransportadoras');
    if (modal) modal.classList.add('hidden');
}

async function carregarListaTransportadoras() {
    const client = window.supabaseClient || supabaseClient;
    const { data, error } = await client.from('transportadoras').select('*');
    if (error) {
        showToast('Erro ao listar transportadoras: ' + error.message, 'error');
        return;
    }
    const tbody = document.getElementById('transportadorasTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    if (!data || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="text-center">Nenhuma transportadora cadastrada</td></tr>';
        return;
    }
    data.forEach(t => {
        tbody.innerHTML += `
            <tr>
                <td>${escapeHtml(t.nome)}</td>
                <td>${escapeHtml(t.cnpj)}</td>
                <td>
                    <button class="btn btn-sm btn-danger" onclick="excluirTransportadora(${t.id})">Excluir</button>
                </td>
            </tr>
        `;
    });
}

async function novaTransportadora() {
    const nome = prompt('Nome da transportadora:');
    if (!nome) return;
    const cnpj = prompt('CNPJ (apenas números):');
    if (!cnpj) return;
    const client = window.supabaseClient || supabaseClient;
    const { error } = await client.from('transportadoras').insert([{ nome, cnpj }]);
    if (error) {
        showToast('Erro: ' + error.message, 'error');
        return;
    }
    await carregarListaTransportadoras();
    await carregarTransportadoras();
    showToast('Transportadora adicionada!', 'success');
}

async function excluirTransportadora(id) {
    if (!confirm('Excluir esta transportadora?')) return;
    const client = window.supabaseClient || supabaseClient;
    const { error } = await client.from('transportadoras').delete().eq('id', id);
    if (error) {
        showToast('Erro ao excluir: ' + error.message, 'error');
        return;
    }
    await carregarListaTransportadoras();
    await carregarTransportadoras();
    showToast('Transportadora excluída', 'success');
}

// ========== VENDAS COM NF-e EMITIDA ==========
async function carregarVendasComNFE() {
    const client = window.supabaseClient || supabaseClient;
    if (!client) return;
    const { data, error } = await client
        .from('vendas_ml')
        .select('id_venda_ml, cliente, valor_total, nfe_protocolo, nfe_emitida_em')
        .eq('nfe_emitida', true)
        .order('nfe_emitida_em', { ascending: false });
    if (error) {
        console.error('Erro ao carregar vendas com NF-e:', error);
        return;
    }
    const tbody = document.getElementById('vendasComNFETableBody');
    if (!tbody) return;
    if (!data || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="text-center">Nenhuma NF-e emitida</td></tr>';
        return;
    }
    tbody.innerHTML = data.map(v => `
        <tr>
            <td><strong>${v.id_venda_ml}</strong><br><small>${v.cliente || '-'}</small></td>
            <td>${v.nfe_protocolo || '-'}</td>
            <td>${v.nfe_emitida_em ? new Date(v.nfe_emitida_em).toLocaleDateString() : '-'}</td>
        </tr>
    `).join('');
}

// ========== VENDAS SEM NF-e ==========
async function carregarVendasSemNFE() {
    console.log('🔍 Carregando vendas sem NF-e...');
    const tbody = document.getElementById('listaVendasNFE');
    if (!tbody) return;
    vendasSelecionadas.clear();
    atualizarBarraSelecao();
    tbody.innerHTML = '<tr><td colspan="5" class="text-center">Carregando...</td></tr>';
    try {
        const client = window.supabaseClient || supabaseClient;
        if (!client) throw new Error('Supabase não conectado');
        const { data, error } = await client
            .from('vendas_ml')
            .select('id_venda_ml, cliente, valor_total, data_venda, produto_titulo, nfe_emitida')
            .or('nfe_emitida.is.null,nfe_emitida.eq.false')
            .order('data_venda', { ascending: false });
        if (error) throw error;
        vendasSemNFE = data || [];
        if (vendasSemNFE.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center">Nenhuma venda pendente</td></tr>';
            return;
        }
        let html = '';
        vendasSemNFE.forEach(v => {
            html += `
                <tr>
                    <td><input type="checkbox" class="venda-select-checkbox" data-id="${v.id_venda_ml}" onchange="toggleSelecionarVenda('${v.id_venda_ml}', this.checked)"></td>
                    <td><strong>${v.id_venda_ml}</strong><br><small>${v.produto_titulo ? v.produto_titulo.substring(0, 40) : 'Sem título'}</small></td>
                    <td>${v.cliente || 'N/I'}</td>
                    <td>R$ ${(v.valor_total || 0).toFixed(2)}</td>
                    <td><button class="btn btn-sm btn-primary" onclick="selecionarVendaNFE('${v.id_venda_ml}')">Selecionar</button></td>
                </tr>
            `;
        });
        tbody.innerHTML = html;
        const checkAll = document.getElementById('checkAllVendas');
        if (checkAll) {
            checkAll.checked = false;
            checkAll.onchange = (e) => selecionarTodasVendas(e.target.checked);
        }
    } catch (error) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center text-danger">Erro: ${error.message}</td></tr>`;
        showToast('Erro ao carregar vendas', 'error');
    }
}

// ========== SELEÇÃO MÚLTIPLA ==========
function selecionarTodasVendas(checked) {
    document.querySelectorAll('#listaVendasNFE .venda-select-checkbox').forEach(cb => {
        if (cb.checked !== checked) {
            cb.checked = checked;
            const id = cb.getAttribute('data-id');
            if (checked) vendasSelecionadas.add(id);
            else vendasSelecionadas.delete(id);
        }
    });
    atualizarBarraSelecao();
}

function toggleSelecionarVenda(id, checked) {
    if (checked) vendasSelecionadas.add(id);
    else vendasSelecionadas.delete(id);
    atualizarBarraSelecao();
}

function atualizarBarraSelecao() {
    const barra = document.getElementById('barraSelecaoMultipla');
    const contador = document.getElementById('selecionadasContador');
    if (!barra) return;
    const total = vendasSelecionadas.size;
    if (total > 0) {
        barra.classList.remove('hidden');
        if (contador) contador.textContent = total;
    } else {
        barra.classList.add('hidden');
    }
}

function limparSelecao() {
    document.querySelectorAll('#listaVendasNFE .venda-select-checkbox').forEach(cb => {
        if (cb.checked) {
            cb.checked = false;
            const id = cb.getAttribute('data-id');
            vendasSelecionadas.delete(id);
        }
    });
    atualizarBarraSelecao();
}

function selecionarTodas() {
    document.querySelectorAll('#listaVendasNFE .venda-select-checkbox').forEach(cb => {
        if (!cb.checked) {
            cb.checked = true;
            const id = cb.getAttribute('data-id');
            vendasSelecionadas.add(id);
        }
    });
    atualizarBarraSelecao();
}

async function marcarSelecionadasComoEmitidas() {
    if (vendasSelecionadas.size === 0) {
        showToast('Nenhuma venda selecionada', 'warning');
        return;
    }
    if (!confirm(`Marcar ${vendasSelecionadas.size} venda(s) como emitidas?`)) return;
    const client = window.supabaseClient || supabaseClient;
    let ok = 0;
    for (const id of vendasSelecionadas) {
        const { error } = await client
            .from('vendas_ml')
            .update({ nfe_emitida: true, nfe_emitida_em: new Date().toISOString() })
            .eq('id_venda_ml', id);
        if (!error) ok++;
    }
    showToast(`${ok} vendas marcadas`, 'success');
    await carregarVendasSemNFE();
    await carregarVendasComNFE();
    novaNFEDoZero();
}

// ========== SELECIONAR VENDA ==========
async function selecionarVendaNFE(vendaId) {
    try {
        const client = window.supabaseClient || supabaseClient;
        const { data: vendaAtual, error } = await client
            .from('vendas_ml')
            .select('nfe_emitida')
            .eq('id_venda_ml', vendaId)
            .single();
        if (error) throw error;
        if (vendaAtual.nfe_emitida) {
            showToast('Esta venda já possui NF-e!', 'warning');
            return;
        }
        const venda = vendasSemNFE.find(v => v.id_venda_ml === vendaId);
        if (!venda) throw new Error('Venda não encontrada');
        document.getElementById('nfeVendaId').value = venda.id_venda_ml;
        document.getElementById('btnMarcarEmitida').disabled = true;
        // Preenche produto com título do anúncio (campo produto_titulo)
        if (venda.produto_titulo) {
            document.getElementById('nfeProduto').value = venda.produto_titulo;
        } else {
            // fallback: tenta buscar do ML
            document.getElementById('nfeProduto').value = await buscarTituloProdutoML(venda.id_venda_ml) || 'Produto';
        }
        document.getElementById('nfeQuantidade').value = venda.quantidade || 1;
        const valorUnit = (venda.valor_total / (venda.quantidade || 1)).toFixed(2);
        document.getElementById('nfeValorUnit').value = valorUnit;
        document.getElementById('nfeValorTotal').value = venda.valor_total?.toFixed(2) || '';
        const spanOriginal = document.getElementById('valorOriginalVenda');
        if (spanOriginal) spanOriginal.innerText = `Valor original: R$ ${(venda.valor_total || 0).toFixed(2)}`;
        // limpa campos do destinatário
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
        console.error(error);
        showToast('Erro ao selecionar venda', 'error');
    }
}

async function buscarTituloProdutoML(orderId) {
    try {
        const token = await window.autoManageMLToken();
        if (!token) return null;
        const numericId = orderId.replace(/^ML/, '');
        const url = `https://api.mercadolibre.com/orders/${numericId}`;
        const response = await fetch(`${window.WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(url)}&token=${token}`);
        if (!response.ok) return null;
        const order = await response.json();
        const item = order.order_items?.[0]?.item;
        return item?.title || null;
    } catch (e) {
        console.warn('Erro ao buscar título do ML:', e);
        return null;
    }
}

// ========== BUSCAR DADOS FISCAIS (ML) ==========
async function buscarDadosFiscaisML(orderId) {
    try {
        const token = await window.autoManageMLToken();
        if (!token) throw new Error('Token ML não disponível');
        const numericOrderId = orderId.replace(/^ML/, '');
        const orderUrl = `https://api.mercadolibre.com/orders/${numericOrderId}`;
        const orderRes = await fetch(`${window.WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(orderUrl)}&token=${token}`);
        if (!orderRes.ok) throw new Error('Erro ao buscar pedido');
        const order = await orderRes.json();
        if (!order.buyer?.billing_info?.id) {
            if (order.buyer?.nickname) document.getElementById('nfeNomeDest').value = order.buyer.nickname;
            showToast('Dados fiscais não encontrados, preencha manualmente', 'warning');
            return;
        }
        const billingInfoId = order.buyer.billing_info.id;
        const billingUrl = `https://api.mercadolibre.com/orders/billing-info/MLB/${billingInfoId}`;
        const billingRes = await fetch(`${window.WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(billingUrl)}&token=${token}`);
        if (!billingRes.ok) throw new Error('Erro ao obter billing-info');
        const billing = await billingRes.json();
        const info = billing.buyer?.billing_info;
        if (info) {
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
        }
    } catch (error) {
        console.error(error);
        showToast('Erro ao obter dados fiscais do ML', 'error');
    }
}

// ========== NOVA NF-e DO ZERO ==========
function novaNFEDoZero() {
    document.getElementById('nfeVendaId').value = '';
    document.getElementById('nfeDocDest').value = '';
    document.getElementById('nfeNomeDest').value = '';
    document.getElementById('nfeProduto').value = '';
    document.getElementById('nfeQuantidade').value = '1';
    document.getElementById('nfeValorUnit').value = '';
    document.getElementById('nfeValorTotal').value = '';
    document.getElementById('nfeCep').value = '';
    document.getElementById('nfeEndereco').value = '';
    document.getElementById('nfeNumero').value = '';
    document.getElementById('nfeBairro').value = '';
    document.getElementById('nfeCidadeUF').value = '';
    document.getElementById('nfeNCM').value = '99999999';
    document.getElementById('nfeCFOP').value = '5102';
    document.getElementById('btnMarcarEmitida').disabled = true;
    document.getElementById('xmlResultado').style.display = 'none';
    const spanOriginal = document.getElementById('valorOriginalVenda');
    if (spanOriginal) spanOriginal.innerText = '';
    showToast('Preencha os dados para emitir uma nova NF-e', 'info');
}

// ========== EMITIR NF-e ==========
async function gerarNFE() {
    const vendaId = document.getElementById('nfeVendaId').value;
    const transportadoraId = document.getElementById('nfeTransportadora').value;
    if (!transportadoraId) {
        showToast('Selecione uma transportadora', 'warning');
        return;
    }
    const client = window.supabaseClient || supabaseClient;
    const { data: transp, error: errT } = await client
        .from('transportadoras')
        .select('*')
        .eq('id', transportadoraId)
        .single();
    if (errT || !transp) {
        showToast('Transportadora inválida', 'error');
        return;
    }
    const quantidade = parseFloat(document.getElementById('nfeQuantidade').value);
    let valorTotal = parseFloat(document.getElementById('nfeValorTotal').value);
    if (isNaN(valorTotal) || valorTotal <= 0) {
        const valorUnit = parseFloat(document.getElementById('nfeValorUnit').value);
        if (!isNaN(valorUnit) && valorUnit > 0 && !isNaN(quantidade)) {
            valorTotal = valorUnit * quantidade;
        } else {
            showToast('Informe o valor total ou unitário', 'warning');
            return;
        }
    }
    const valorUnitario = (valorTotal / quantidade).toFixed(2);
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
            quantidade: quantidade,
            valorUnitario: parseFloat(valorUnitario),
            ncm: document.getElementById('nfeNCM').value,
            cfop: document.getElementById('nfeCFOP').value
        },
        transportadora: {
            nome: transp.nome,
            cnpj: transp.cnpj,
            ie: transp.ie || '',
            endereco: transp.endereco || '',
            cidade: transp.cidade || '',
            uf: transp.uf || ''
        }
    };
    if (!dados.cliente.documento || !dados.cliente.nome || !dados.produto.descricao) {
        showToast('Preencha todos os campos obrigatórios', 'warning');
        return;
    }
    const btn = document.querySelector('#formNFE button[onclick="gerarNFE()"]');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<span class="spinner"></span> Emitindo...';
    btn.disabled = true;
    try {
        const response = await fetch(`${NFE_API_URL}/api/nfe/emitir`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dados)
        });
        const text = await response.text();
        if (!text) throw new Error('Resposta vazia');
        let result;
        try { result = JSON.parse(text); } catch (e) { throw new Error(`Resposta inválida: ${text.substring(0,100)}`); }
        if (!response.ok) throw new Error(result.error || `Erro ${response.status}`);
        if (result.success && result.protocolo) {
            document.getElementById('xmlGerado').value = result.xml;
            document.getElementById('xmlResultado').style.display = 'block';
            showToast(`✅ NF-e emitida! Protocolo: ${result.protocolo}`, 'success');
            if (vendaId) {
                await marcarComoEmitidaComProtocolo(vendaId, result.protocolo, result.xml);
            } else {
                showToast('NF-e avulsa gerada', 'success');
            }
        } else {
            throw new Error(result.error || 'Erro desconhecido');
        }
    } catch (error) {
        console.error(error);
        showToast('Erro ao emitir NF-e: ' + error.message, 'error');
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

async function marcarComoEmitidaComProtocolo(vendaId, protocolo, xml) {
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
    showToast('Venda marcada como emitida', 'success');
    await carregarVendasSemNFE();
    await carregarVendasComNFE();
    novaNFEDoZero();
}

// ========== UTILITÁRIOS ==========
function copiarXML() {
    const xml = document.getElementById('xmlGerado').value;
    if (!xml) return;
    navigator.clipboard.writeText(xml).then(() => showToast('XML copiado!', 'success'));
}
function baixarXML() {
    const xml = document.getElementById('xmlGerado').value;
    if (!xml) return;
    const blob = new Blob([xml], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `NFE_${new Date().toISOString().slice(0,19)}.xml`;
    a.click();
    URL.revokeObjectURL(url);
}
async function marcarComoEmitida() {
    const vendaId = document.getElementById('nfeVendaId').value;
    const xml = document.getElementById('xmlGerado').value;
    if (!vendaId) { showToast('Esta NF-e não está vinculada a uma venda', 'warning'); return; }
    if (!xml) { showToast('Gere o XML antes', 'warning'); return; }
    if (!confirm('Marcar como emitida? Esta ação não pode ser desfeita.')) return;
    try {
        const client = window.supabaseClient || supabaseClient;
        await client.from('vendas_ml').update({
            nfe_emitida: true,
            nfe_xml: xml,
            nfe_emitida_em: new Date().toISOString()
        }).eq('id_venda_ml', vendaId);
        showToast('Venda marcada como emitida!', 'success');
        await carregarVendasSemNFE();
        await carregarVendasComNFE();
        novaNFEDoZero();
    } catch (error) {
        showToast('Erro ao atualizar status', 'error');
    }
}
async function forcarMarcarComoEmitida(vendaId) {
    if (!confirm(`Forçar marcação da venda ${vendaId} como emitida?`)) return;
    try {
        const client = window.supabaseClient || supabaseClient;
        await client.from('vendas_ml').update({ nfe_emitida: true, nfe_emitida_em: new Date().toISOString() }).eq('id_venda_ml', vendaId);
        showToast(`Venda ${vendaId} marcada!`, 'success');
        await carregarVendasSemNFE();
        await carregarVendasComNFE();
        novaNFEDoZero();
    } catch (error) {
        showToast('Erro', 'error');
    }
}
async function sincronizarVendasMLparaNFE() {
    showToast('Sincronizando vendas...', 'info');
    if (window.sincronizarVendasML) await window.sincronizarVendasML();
    await carregarVendasSemNFE();
    showToast('Sincronização concluída!', 'success');
}
function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

// ========== EXPORTAR GLOBALMENTE ==========
window.carregarVendasSemNFE = carregarVendasSemNFE;
window.carregarVendasComNFE = carregarVendasComNFE;
window.carregarTransportadoras = carregarTransportadoras;
window.abrirModalTransportadoras = abrirModalTransportadoras;
window.fecharModalTransportadoras = fecharModalTransportadoras;
window.novaTransportadora = novaTransportadora;
window.excluirTransportadora = excluirTransportadora;
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
window.selecionarTodasVendas = selecionarTodasVendas;