// ============================================
// SISTEMA DE ESTOQUE (estoque.js) - VERSÃO COMPLETA COM TRANSPORTADORAS
// ============================================

// ===== VARIÁVEIS GLOBAIS =====
let produtos = [];
let clientes = [];
let transportadoras = [];
let currentProdutoId = null;
let currentClienteId = null;
let currentTransportadoraId = null;

// Paginação produtos
let produtosPagina = 1;
const PRODUTOS_POR_PAGINA = 20;
let produtosFiltrados = [];

// Paginação clientes
let clientesPagina = 1;
const CLIENTES_POR_PAGINA = 20;
let clientesFiltrados = [];

// Paginação transportadoras
let transportadorasPagina = 1;
const TRANSPORTADORAS_POR_PAGINA = 20;
let transportadorasFiltradas = [];

// Elementos principais
let estoqueSystem, abaProdutos, abaClientes, abaTransportadoras, abaNFe;
let produtosTableBody, clientesTableBody, transportadorasTableBody;
let modalProduto, modalCliente, modalTransportadora, modalMovimentacao;
let formProduto, formCliente, formTransportadora, formMovimentacao;
let buscaProdutosInput, buscaClientesInput, buscaTransportadorasInput;

// Elementos da NF-e
let nfeClienteBusca, nfeClienteId, nfeClienteInfo, nfeClienteSugestoes;
let nfeProdutoBusca, nfeProdutoId, nfeProdutoInfo, nfeProdutoSugestoes;
let nfeTransportadoraBusca, nfeTransportadoraId, nfeTransportadoraInfo, nfeTransportadoraSugestoes;
let nfeQuantidade, nfeValorUnit, nfeFrete, nfeDesconto, nfeNatureza, nfeTotal, nfeResultado, nfeXml;

// Elementos da Movimentação
let movProdutoBusca, movProdutoId, movProdutoSugestoes, movTipo, movQuantidade, movObservacao, movEstoqueAtual, movEstoqueAtualValor;

// ============================================
// INICIALIZAÇÃO
// ============================================
document.addEventListener('DOMContentLoaded', function() {
    // Capturar elementos principais
    estoqueSystem = document.getElementById('estoqueSystem');
    abaProdutos = document.getElementById('abaProdutos');
    abaClientes = document.getElementById('abaClientes');
    abaTransportadoras = document.getElementById('abaTransportadoras');
    abaNFe = document.getElementById('abaNFe');
    produtosTableBody = document.getElementById('produtosTableBody');
    clientesTableBody = document.getElementById('clientesTableBody');
    transportadorasTableBody = document.getElementById('transportadorasTableBody');
    modalProduto = document.getElementById('modalProduto');
    modalCliente = document.getElementById('modalCliente');
    modalTransportadora = document.getElementById('modalTransportadora');
    modalMovimentacao = document.getElementById('modalMovimentacao');
    formProduto = document.getElementById('formProduto');
    formCliente = document.getElementById('formCliente');
    formTransportadora = document.getElementById('formTransportadora');
    formMovimentacao = document.getElementById('formMovimentacao');
    buscaProdutosInput = document.getElementById('buscaProdutos');
    buscaClientesInput = document.getElementById('buscaClientes');
    buscaTransportadorasInput = document.getElementById('buscaTransportadoras');

    // Elementos da NF-e
    nfeClienteBusca = document.getElementById('nfeClienteBusca');
    nfeClienteId = document.getElementById('nfeClienteId');
    nfeClienteInfo = document.getElementById('nfeClienteInfo');
    nfeClienteSugestoes = document.getElementById('nfeClienteSugestoes');
    nfeProdutoBusca = document.getElementById('nfeProdutoBusca');
    nfeProdutoId = document.getElementById('nfeProdutoId');
    nfeProdutoInfo = document.getElementById('nfeProdutoInfo');
    nfeProdutoSugestoes = document.getElementById('nfeProdutoSugestoes');
    nfeTransportadoraBusca = document.getElementById('nfeTransportadoraBusca');
    nfeTransportadoraId = document.getElementById('nfeTransportadoraId');
    nfeTransportadoraInfo = document.getElementById('nfeTransportadoraInfo');
    nfeTransportadoraSugestoes = document.getElementById('nfeTransportadoraSugestoes');
    nfeQuantidade = document.getElementById('nfeQuantidade');
    nfeValorUnit = document.getElementById('nfeValorUnit');
    nfeFrete = document.getElementById('nfeFrete');
    nfeDesconto = document.getElementById('nfeDesconto');
    nfeNatureza = document.getElementById('nfeNatureza');
    nfeTotal = document.getElementById('nfeTotal');
    nfeResultado = document.getElementById('nfeResultado');
    nfeXml = document.getElementById('nfeXml');

    // Elementos da Movimentação
    movProdutoBusca = document.getElementById('movProdutoBusca');
    movProdutoId = document.getElementById('movProdutoId');
    movProdutoSugestoes = document.getElementById('movProdutoSugestoes');
    movTipo = document.getElementById('movTipo');
    movQuantidade = document.getElementById('movQuantidade');
    movObservacao = document.getElementById('movObservacao');
    movEstoqueAtual = document.getElementById('movEstoqueAtual');
    movEstoqueAtualValor = document.getElementById('movEstoqueAtualValor');

    // Event listeners dos formulários
    if (formProduto) formProduto.addEventListener('submit', salvarProduto);
    if (formCliente) formCliente.addEventListener('submit', salvarCliente);
    if (formTransportadora) formTransportadora.addEventListener('submit', salvarTransportadora);
    if (formMovimentacao) formMovimentacao.addEventListener('submit', registrarMovimentacao);

    // Busca em tempo real
    if (buscaProdutosInput) buscaProdutosInput.addEventListener('input', filtrarProdutos);
    if (buscaClientesInput) buscaClientesInput.addEventListener('input', filtrarClientes);
    if (buscaTransportadorasInput) buscaTransportadorasInput.addEventListener('input', filtrarTransportadoras);

    // Autocomplete NF-e
    if (nfeClienteBusca) {
        nfeClienteBusca.addEventListener('input', function() { buscarSugestoesClientes(this.value); });
        nfeClienteBusca.addEventListener('blur', function() { setTimeout(() => { if (nfeClienteSugestoes) nfeClienteSugestoes.style.display = 'none'; }, 200); });
    }
    if (nfeProdutoBusca) {
        nfeProdutoBusca.addEventListener('input', function() { buscarSugestoesProdutos(this.value); });
        nfeProdutoBusca.addEventListener('blur', function() { setTimeout(() => { if (nfeProdutoSugestoes) nfeProdutoSugestoes.style.display = 'none'; }, 200); });
    }
    if (nfeTransportadoraBusca) {
        nfeTransportadoraBusca.addEventListener('input', function() { buscarSugestoesTransportadoras(this.value); });
        nfeTransportadoraBusca.addEventListener('blur', function() { setTimeout(() => { if (nfeTransportadoraSugestoes) nfeTransportadoraSugestoes.style.display = 'none'; }, 200); });
    }

    // Autocomplete Movimentação
    if (movProdutoBusca) {
        movProdutoBusca.addEventListener('input', function() { buscarSugestoesProdutosMov(this.value); });
        movProdutoBusca.addEventListener('blur', function() { setTimeout(() => { if (movProdutoSugestoes) movProdutoSugestoes.style.display = 'none'; }, 200); });
    }

    // Fechar modais ao clicar fora
    if (modalProduto) modalProduto.addEventListener('click', (e) => { if (e.target === modalProduto) fecharModalProduto(); });
    if (modalCliente) modalCliente.addEventListener('click', (e) => { if (e.target === modalCliente) fecharModalCliente(); });
    if (modalTransportadora) modalTransportadora.addEventListener('click', (e) => { if (e.target === modalTransportadora) fecharModalTransportadora(); });
    if (modalMovimentacao) modalMovimentacao.addEventListener('click', (e) => { if (e.target === modalMovimentacao) fecharModalMovimentacao(); });

    // Eventos da NF-e (cálculo)
    if (nfeQuantidade) nfeQuantidade.addEventListener('input', calcularTotalNFe);
    if (nfeValorUnit) nfeValorUnit.addEventListener('input', calcularTotalNFe);
    if (nfeFrete) nfeFrete.addEventListener('input', calcularTotalNFe);
    if (nfeDesconto) nfeDesconto.addEventListener('input', calcularTotalNFe);
    
    const formNFe = document.getElementById('formNFe');
    if (formNFe) formNFe.addEventListener('submit', emitirNFe);
});

// ============================================
// FUNÇÃO PARA ABRIR O SISTEMA
// ============================================
window.abrirSistemaEstoque = function() {
    if (!currentUser) {
        showToast('⚠️ Faça login primeiro', 'warning');
        return;
    }

    // Esconder outros sistemas
    const sistemas = ['mainSystem','salesSystem','reembolsosSystem','caixaSystem','reviewsSystem','folgasSystem','shippingSystem'];
    sistemas.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });

    if (estoqueSystem) {
        estoqueSystem.classList.remove('hidden');
        // Atualizar dados do usuário
        document.getElementById('estoqueUserName').textContent = currentUser.name;
        document.getElementById('estoqueUserAvatar').textContent = currentUser.avatar;
        document.getElementById('estoqueUserRole').textContent = currentUser.role;

        // Carregar dados
        carregarProdutos();
        carregarClientes();
        carregarTransportadoras();
        mudarAbaEstoque('produtos'); // Abre a aba produtos por padrão
    }
};

// ============================================
// CONTROLE DE ABAS (FUNÇÃO GLOBAL)
// ============================================
window.mudarAbaEstoque = function(aba) {
    // Esconde todas as abas
    if (abaProdutos) abaProdutos.classList.add('hidden');
    if (abaClientes) abaClientes.classList.add('hidden');
    if (abaTransportadoras) abaTransportadoras.classList.add('hidden');
    if (abaNFe) abaNFe.classList.add('hidden');

    // Remove classe active de todos os botões
    document.querySelectorAll('#estoqueTabs button').forEach(btn => btn.classList.remove('active'));

    // Mostra a aba selecionada e ativa o botão correspondente
    if (aba === 'produtos') {
        if (abaProdutos) abaProdutos.classList.remove('hidden');
        const btn = document.querySelector('#estoqueTabs button[onclick*="produtos"]');
        if (btn) btn.classList.add('active');
    } else if (aba === 'clientes') {
        if (abaClientes) abaClientes.classList.remove('hidden');
        const btn = document.querySelector('#estoqueTabs button[onclick*="clientes"]');
        if (btn) btn.classList.add('active');
    } else if (aba === 'transportadoras') {
        if (abaTransportadoras) abaTransportadoras.classList.remove('hidden');
        const btn = document.querySelector('#estoqueTabs button[onclick*="transportadoras"]');
        if (btn) btn.classList.add('active');
    } else if (aba === 'nfe') {
        if (abaNFe) abaNFe.classList.remove('hidden');
        const btn = document.querySelector('#estoqueTabs button[onclick*="nfe"]');
        if (btn) btn.classList.add('active');
    }
};

// ============================================
// FUNÇÕES PARA PRODUTOS
// ============================================
async function carregarProdutos() {
    produtosTableBody.innerHTML = '<tr><td colspan="9" class="text-center"><span class="spinner"></span> Carregando...</td></tr>';
    try {
        if (!supabaseClient) throw new Error('Supabase não inicializado');
        const { data, error } = await supabaseClient
            .from('produtos_estoque')
            .select('*')
            .order('nome', { ascending: true });
        if (error) throw error;
        produtos = data || [];
        filtrarProdutos();
    } catch (error) {
        console.error('❌ Erro ao carregar produtos:', error);
        produtosTableBody.innerHTML = '<tr><td colspan="9" class="text-center text-danger">Erro ao carregar produtos</td></tr>';
    }
}

function filtrarProdutos() {
    const termo = (buscaProdutosInput?.value || '').toLowerCase().trim();
    if (termo === '') {
        produtosFiltrados = [...produtos];
    } else {
        produtosFiltrados = produtos.filter(p => 
            (p.nome && p.nome.toLowerCase().includes(termo)) ||
            (p.sku && p.sku.toLowerCase().includes(termo)) ||
            (p.ean && p.ean.toLowerCase().includes(termo))
        );
    }
    produtosPagina = 1;
    atualizarPaginacaoProdutos();
    renderizarProdutos();
}

function atualizarPaginacaoProdutos() {
    const total = produtosFiltrados.length;
    const inicio = (produtosPagina - 1) * PRODUTOS_POR_PAGINA + 1;
    const fim = Math.min(produtosPagina * PRODUTOS_POR_PAGINA, total);

    document.getElementById('produtosInicio').textContent = total > 0 ? inicio : 0;
    document.getElementById('produtosFim').textContent = fim;
    document.getElementById('produtosTotal').textContent = total;
    document.getElementById('produtosPaginaAtual').textContent = produtosPagina;

    document.getElementById('btnProdutosAnterior').disabled = produtosPagina <= 1;
    document.getElementById('btnProdutosProxima').disabled = produtosPagina * PRODUTOS_POR_PAGINA >= total;
}

function renderizarProdutos() {
    if (!produtosTableBody) return;
    const inicio = (produtosPagina - 1) * PRODUTOS_POR_PAGINA;
    const fim = inicio + PRODUTOS_POR_PAGINA;
    const produtosPaginaAtual = produtosFiltrados.slice(inicio, fim);

    if (produtosFiltrados.length === 0) {
        produtosTableBody.innerHTML = '<tr><td colspan="9" class="text-center">Nenhum produto encontrado</td></tr>';
        return;
    }

    let html = '';
    produtosPaginaAtual.forEach(prod => {
        let linksHtml = '';
        if (prod.links && prod.links.length) {
            const linksArray = Array.isArray(prod.links) ? prod.links : [prod.links];
            linksHtml = linksArray.map(link => `<a href="${link}" target="_blank" class="d-block small"><i class="fas fa-link"></i> Link</a>`).join('');
        }

        html += `
            <tr>
                <td><strong>${escapeHtml(prod.nome)}</strong></td>
                <td>${escapeHtml(prod.sku || '')}</td>
                <td>${escapeHtml(prod.ean || '')}</td>
                <td>${escapeHtml(prod.tamanho || '')}</td>
                <td>${escapeHtml(prod.cor || '')}</td>
                <td>${escapeHtml(prod.ncm || '')}</td>
                <td>${escapeHtml(prod.cfop || '')}</td>
                <td class="text-center">${prod.quantidade !== undefined ? prod.quantidade : 0}</td>
                <td>
                    <div class="d-flex gap-2">
                        <button class="btn btn-info btn-sm" onclick="editarProduto('${prod.id}')" title="Editar">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn btn-danger btn-sm" onclick="excluirProduto('${prod.id}')" title="Excluir">
                            <i class="fas fa-trash"></i>
                        </button>
                        ${linksHtml}
                    </div>
                </td>
            </tr>
        `;
    });
    produtosTableBody.innerHTML = html;
    atualizarPaginacaoProdutos();
}

window.paginarProdutos = function(direcao) {
    if (direcao === 'anterior' && produtosPagina > 1) {
        produtosPagina--;
    } else if (direcao === 'proxima' && produtosPagina * PRODUTOS_POR_PAGINA < produtosFiltrados.length) {
        produtosPagina++;
    }
    renderizarProdutos();
};

// ============================================
// FUNÇÕES PARA CLIENTES
// ============================================
async function carregarClientes() {
    clientesTableBody.innerHTML = '<tr><td colspan="6" class="text-center"><span class="spinner"></span> Carregando...</td></tr>';
    try {
        if (!supabaseClient) throw new Error('Supabase não inicializado');
        const { data, error } = await supabaseClient
            .from('clientes_nfe')
            .select('*')
            .order('nome', { ascending: true });
        if (error) throw error;
        clientes = data || [];
        filtrarClientes();
    } catch (error) {
        console.error('❌ Erro ao carregar clientes:', error);
        clientesTableBody.innerHTML = '<tr><td colspan="6" class="text-center text-danger">Erro ao carregar clientes</td></tr>';
    }
}

function filtrarClientes() {
    const termo = (buscaClientesInput?.value || '').toLowerCase().trim();
    if (termo === '') {
        clientesFiltrados = [...clientes];
    } else {
        clientesFiltrados = clientes.filter(c => 
            (c.nome && c.nome.toLowerCase().includes(termo)) ||
            (c.documento && c.documento.toLowerCase().includes(termo))
        );
    }
    clientesPagina = 1;
    atualizarPaginacaoClientes();
    renderizarClientes();
}

function atualizarPaginacaoClientes() {
    const total = clientesFiltrados.length;
    const inicio = (clientesPagina - 1) * CLIENTES_POR_PAGINA + 1;
    const fim = Math.min(clientesPagina * CLIENTES_POR_PAGINA, total);

    document.getElementById('clientesInicio').textContent = total > 0 ? inicio : 0;
    document.getElementById('clientesFim').textContent = fim;
    document.getElementById('clientesTotal').textContent = total;
    document.getElementById('clientesPaginaAtual').textContent = clientesPagina;

    document.getElementById('btnClientesAnterior').disabled = clientesPagina <= 1;
    document.getElementById('btnClientesProxima').disabled = clientesPagina * CLIENTES_POR_PAGINA >= total;
}

function renderizarClientes() {
    if (!clientesTableBody) return;
    const inicio = (clientesPagina - 1) * CLIENTES_POR_PAGINA;
    const fim = inicio + CLIENTES_POR_PAGINA;
    const clientesPaginaAtual = clientesFiltrados.slice(inicio, fim);

    if (clientesFiltrados.length === 0) {
        clientesTableBody.innerHTML = '<tr><td colspan="6" class="text-center">Nenhum cliente encontrado</td></tr>';
        return;
    }

    let html = '';
    clientesPaginaAtual.forEach(cli => {
        html += `
            <tr>
                <td><strong>${escapeHtml(cli.nome)}</strong></td>
                <td>${escapeHtml(cli.documento || '')}</td>
                <td>${escapeHtml(cli.email || '')}</td>
                <td>${escapeHtml(cli.telefone || '')}</td>
                <td>${escapeHtml(cli.endereco || '')}</td>
                <td>
                    <div class="d-flex gap-2">
                        <button class="btn btn-info btn-sm" onclick="editarCliente('${cli.id}')" title="Editar">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn btn-danger btn-sm" onclick="excluirCliente('${cli.id}')" title="Excluir">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    });
    clientesTableBody.innerHTML = html;
    atualizarPaginacaoClientes();
}

window.paginarClientes = function(direcao) {
    if (direcao === 'anterior' && clientesPagina > 1) {
        clientesPagina--;
    } else if (direcao === 'proxima' && clientesPagina * CLIENTES_POR_PAGINA < clientesFiltrados.length) {
        clientesPagina++;
    }
    renderizarClientes();
};

// ============================================
// FUNÇÕES PARA TRANSPORTADORAS
// ============================================
async function carregarTransportadoras() {
    transportadorasTableBody.innerHTML = '<tr><td colspan="6" class="text-center"><span class="spinner"></span> Carregando...</td></tr>';
    try {
        if (!supabaseClient) throw new Error('Supabase não inicializado');
        const { data, error } = await supabaseClient
            .from('transportadoras')
            .select('*')
            .order('nome', { ascending: true });
        if (error) throw error;
        transportadoras = data || [];
        filtrarTransportadoras();
    } catch (error) {
        console.error('❌ Erro ao carregar transportadoras:', error);
        transportadorasTableBody.innerHTML = '<tr><td colspan="6" class="text-center text-danger">Erro ao carregar transportadoras</td></tr>';
    }
}

function filtrarTransportadoras() {
    const termo = (buscaTransportadorasInput?.value || '').toLowerCase().trim();
    if (termo === '') {
        transportadorasFiltradas = [...transportadoras];
    } else {
        transportadorasFiltradas = transportadoras.filter(t => 
            (t.nome && t.nome.toLowerCase().includes(termo)) ||
            (t.cnpj && t.cnpj.toLowerCase().includes(termo))
        );
    }
    transportadorasPagina = 1;
    atualizarPaginacaoTransportadoras();
    renderizarTransportadoras();
}

function atualizarPaginacaoTransportadoras() {
    const total = transportadorasFiltradas.length;
    const inicio = (transportadorasPagina - 1) * TRANSPORTADORAS_POR_PAGINA + 1;
    const fim = Math.min(transportadorasPagina * TRANSPORTADORAS_POR_PAGINA, total);

    const elInicio = document.getElementById('transportadorasInicio');
    const elFim = document.getElementById('transportadorasFim');
    const elTotal = document.getElementById('transportadorasTotal');
    const elPagina = document.getElementById('transportadorasPaginaAtual');
    const btnAnterior = document.getElementById('btnTransportadorasAnterior');
    const btnProxima = document.getElementById('btnTransportadorasProxima');

    if (elInicio) elInicio.textContent = total > 0 ? inicio : 0;
    if (elFim) elFim.textContent = fim;
    if (elTotal) elTotal.textContent = total;
    if (elPagina) elPagina.textContent = transportadorasPagina;
    if (btnAnterior) btnAnterior.disabled = transportadorasPagina <= 1;
    if (btnProxima) btnProxima.disabled = transportadorasPagina * TRANSPORTADORAS_POR_PAGINA >= total;
}

function renderizarTransportadoras() {
    if (!transportadorasTableBody) return;
    const inicio = (transportadorasPagina - 1) * TRANSPORTADORAS_POR_PAGINA;
    const fim = inicio + TRANSPORTADORAS_POR_PAGINA;
    const transportadorasPaginaAtual = transportadorasFiltradas.slice(inicio, fim);

    if (transportadorasFiltradas.length === 0) {
        transportadorasTableBody.innerHTML = '<tr><td colspan="6" class="text-center">Nenhuma transportadora encontrada</td></tr>';
        return;
    }

    let html = '';
    transportadorasPaginaAtual.forEach(t => {
        html += `
            <tr>
                <td><strong>${escapeHtml(t.nome)}</strong></td>
                <td>${escapeHtml(t.cnpj || '')}</td>
                <td>${escapeHtml(t.telefone || '')}</td>
                <td>${escapeHtml(t.email || '')}</td>
                <td>${escapeHtml(t.endereco || '')}</td>
                <td>
                    <div class="d-flex gap-2">
                        <button class="btn btn-info btn-sm" onclick="editarTransportadora('${t.id}')" title="Editar">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn btn-danger btn-sm" onclick="excluirTransportadora('${t.id}')" title="Excluir">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    });
    transportadorasTableBody.innerHTML = html;
    atualizarPaginacaoTransportadoras();
}

window.paginarTransportadoras = function(direcao) {
    if (direcao === 'anterior' && transportadorasPagina > 1) {
        transportadorasPagina--;
    } else if (direcao === 'proxima' && transportadorasPagina * TRANSPORTADORAS_POR_PAGINA < transportadorasFiltradas.length) {
        transportadorasPagina++;
    }
    renderizarTransportadoras();
};

// ============================================
// CRUD PRODUTOS
// ============================================
window.abrirModalProduto = function() {
    currentProdutoId = null;
    document.getElementById('modalProdutoTitle').innerHTML = '<i class="fas fa-box"></i> Novo Produto';
    document.getElementById('produtoId').value = '';
    document.getElementById('produtoNome').value = '';
    document.getElementById('produtoSKU').value = '';
    document.getElementById('produtoEAN').value = '';
    document.getElementById('produtoTamanho').value = '';
    document.getElementById('produtoCor').value = '';
    document.getElementById('produtoLinks').value = '';
    document.getElementById('produtoNCM').value = '';
    document.getElementById('produtoCFOP').value = '';
    document.getElementById('produtoQuantidade').value = '0';
    modalProduto.classList.remove('hidden');
};

window.fecharModalProduto = function() {
    modalProduto.classList.add('hidden');
};

window.editarProduto = function(id) {
    const produto = produtos.find(p => p.id == id);
    if (!produto) return;

    currentProdutoId = id;
    document.getElementById('modalProdutoTitle').innerHTML = '<i class="fas fa-box"></i> Editar Produto';
    document.getElementById('produtoId').value = produto.id;
    document.getElementById('produtoNome').value = produto.nome || '';
    document.getElementById('produtoSKU').value = produto.sku || '';
    document.getElementById('produtoEAN').value = produto.ean || '';
    document.getElementById('produtoTamanho').value = produto.tamanho || '';
    document.getElementById('produtoCor').value = produto.cor || '';
    const links = produto.links ? (Array.isArray(produto.links) ? produto.links.join('\n') : produto.links) : '';
    document.getElementById('produtoLinks').value = links;
    document.getElementById('produtoNCM').value = produto.ncm || '';
    document.getElementById('produtoCFOP').value = produto.cfop || '';
    document.getElementById('produtoQuantidade').value = produto.quantidade || 0;

    modalProduto.classList.remove('hidden');
};

async function salvarProduto(e) {
    e.preventDefault();

    const nome = document.getElementById('produtoNome').value.trim();
    const sku = document.getElementById('produtoSKU').value.trim();
    if (!nome || !sku) {
        showToast('Nome e SKU são obrigatórios', 'warning');
        return;
    }

    const linksRaw = document.getElementById('produtoLinks').value.trim();
    const linksArray = linksRaw.split('\n').map(l => l.trim()).filter(l => l !== '');

    const produtoData = {
        nome,
        sku,
        ean: document.getElementById('produtoEAN').value.trim() || null,
        ncm: document.getElementById('produtoNCM').value.trim() || null,
        origem: document.getElementById('produtoOrigem').value,
        combustivel: document.getElementById('produtoCombustivel').checked,
        medicamento: document.getElementById('produtoMedicamento').checked,
        unidade: document.getElementById('produtoUnidade').value,
        preco: parseFloat(document.getElementById('produtoPreco').value) || 0,
        quantidade: parseInt(document.getElementById('produtoQuantidade').value) || 0,
        cfop: document.getElementById('produtoCFOP').value.trim() || null,
        tamanho: document.getElementById('produtoTamanho').value.trim() || null,
        cor: document.getElementById('produtoCor').value.trim() || null,
        links: linksArray,
        updated_at: new Date().toISOString()
    };

    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<span class="spinner"></span> Salvando...';
    btn.disabled = true;

    try {
        if (currentProdutoId) {
            const { error } = await supabaseClient
                .from('produtos_estoque')
                .update(produtoData)
                .eq('id', currentProdutoId);
            if (error) throw error;
        } else {
            const { error } = await supabaseClient
                .from('produtos_estoque')
                .insert([produtoData]);
            if (error) throw error;
        }

        showToast(currentProdutoId ? '✅ Produto atualizado!' : '✅ Produto criado!', 'success');
        fecharModalProduto();
        await carregarProdutos();
    } catch (error) {
        console.error('❌ Erro ao salvar produto:', error);
        showToast('Erro: ' + error.message, 'error');
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

window.excluirProduto = async function(id) {
    if (!confirm('Tem certeza que deseja excluir este produto?')) return;
    try {
        const { error } = await supabaseClient
            .from('produtos_estoque')
            .delete()
            .eq('id', id);
        if (error) throw error;
        showToast('🗑️ Produto excluído', 'success');
        await carregarProdutos();
    } catch (error) {
        console.error('❌ Erro ao excluir produto:', error);
        showToast('Erro: ' + error.message, 'error');
    }
};

// ============================================
// CRUD CLIENTES
// ============================================
window.abrirModalCliente = function() {
    currentClienteId = null;
    document.getElementById('modalClienteTitle').innerHTML = '<i class="fas fa-user"></i> Novo Cliente';
    document.getElementById('clienteId').value = '';
    document.getElementById('clienteNome').value = '';
    document.getElementById('clienteDocumento').value = '';
    document.getElementById('clienteEmail').value = '';
    document.getElementById('clienteTelefone').value = '';
    document.getElementById('clienteEndereco').value = '';
    document.getElementById('clienteIE').value = '';
    modalCliente.classList.remove('hidden');
};

window.fecharModalCliente = function() {
    modalCliente.classList.add('hidden');
};

window.editarCliente = function(id) {
    const cliente = clientes.find(c => c.id == id);
    if (!cliente) return;

    currentClienteId = id;
    document.getElementById('modalClienteTitle').innerHTML = '<i class="fas fa-user"></i> Editar Cliente';
    document.getElementById('clienteId').value = cliente.id;
    document.getElementById('clienteNome').value = cliente.nome || '';
    document.getElementById('clienteDocumento').value = cliente.documento || '';
    document.getElementById('clienteEmail').value = cliente.email || '';
    document.getElementById('clienteTelefone').value = cliente.telefone || '';
    document.getElementById('clienteEndereco').value = cliente.endereco || '';
    document.getElementById('clienteIE').value = cliente.ie || '';

    modalCliente.classList.remove('hidden');
};

async function salvarCliente(e) {
    e.preventDefault();

    const nome = document.getElementById('clienteNome').value.trim();
    const documento = document.getElementById('clienteDocumento').value.trim();
    if (!nome || !documento) {
        showToast('Nome e CPF/CNPJ são obrigatórios', 'warning');
        return;
    }

    const clienteData = {
        tipo: document.getElementById('clienteTipo').value,
        contribuinte: document.getElementById('clienteContribuinte').value,
        motivo_nif: document.getElementById('clienteMotivoNIF').value.trim() || null,
        nome_fantasia: document.getElementById('clienteNomeFantasia').value.trim() || null,
        email: document.getElementById('clienteEmail').value.trim() || null,
        telefone: document.getElementById('clienteTelefone').value.trim() || null,
        insc_suframa: document.getElementById('clienteInscSuframa').value.trim() || null,
        razao_social: document.getElementById('clienteRazaoSocial').value.trim(),
        documento: document.getElementById('clienteDocumento').value.trim(),
        ie: document.getElementById('clienteIE').value.trim() || null,
        im: document.getElementById('clienteIM').value.trim() || null,
        isento_ie: document.getElementById('clienteIsentoIE').checked,
        cep: document.getElementById('clienteCEP').value.trim() || null,
        logradouro: document.getElementById('clienteLogradouro').value.trim() || null,
        numero: document.getElementById('clienteNumero').value.trim() || null,
        complemento: document.getElementById('clienteComplemento').value.trim() || null,
        bairro: document.getElementById('clienteBairro').value.trim() || null,
        cidade: document.getElementById('clienteCidade').value.trim() || null,
        pais: document.getElementById('clientePais').value.trim() || 'BRASIL',
        updated_at: new Date().toISOString()
    };

    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<span class="spinner"></span> Salvando...';
    btn.disabled = true;

    try {
        if (currentClienteId) {
            const { error } = await supabaseClient
                .from('clientes_nfe')
                .update(clienteData)
                .eq('id', currentClienteId);
            if (error) throw error;
        } else {
            const { error } = await supabaseClient
                .from('clientes_nfe')
                .insert([clienteData]);
            if (error) throw error;
        }

        showToast(currentClienteId ? '✅ Cliente atualizado!' : '✅ Cliente criado!', 'success');
        fecharModalCliente();
        await carregarClientes();
    } catch (error) {
        console.error('❌ Erro ao salvar cliente:', error);
        showToast('Erro: ' + error.message, 'error');
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

window.excluirCliente = async function(id) {
    if (!confirm('Tem certeza que deseja excluir este cliente?')) return;
    try {
        const { error } = await supabaseClient
            .from('clientes_nfe')
            .delete()
            .eq('id', id);
        if (error) throw error;
        showToast('🗑️ Cliente excluído', 'success');
        await carregarClientes();
    } catch (error) {
        console.error('❌ Erro ao excluir cliente:', error);
        showToast('Erro: ' + error.message, 'error');
    }
};

// ============================================
// CRUD TRANSPORTADORAS
// ============================================
window.abrirModalTransportadora = function() {
    currentTransportadoraId = null;
    document.getElementById('modalTransportadoraTitle').innerHTML = '<i class="fas fa-truck"></i> Nova Transportadora';
    document.getElementById('transportadoraId').value = '';
    document.getElementById('transportadoraNome').value = '';
    document.getElementById('transportadoraCNPJ').value = '';
    document.getElementById('transportadoraTelefone').value = '';
    document.getElementById('transportadoraEmail').value = '';
    document.getElementById('transportadoraEndereco').value = '';
    modalTransportadora.classList.remove('hidden');
};

window.fecharModalTransportadora = function() {
    modalTransportadora.classList.add('hidden');
};

window.editarTransportadora = function(id) {
    const transportadora = transportadoras.find(t => t.id == id);
    if (!transportadora) return;

    currentTransportadoraId = id;
    document.getElementById('modalTransportadoraTitle').innerHTML = '<i class="fas fa-truck"></i> Editar Transportadora';
    document.getElementById('transportadoraId').value = transportadora.id;
    document.getElementById('transportadoraNome').value = transportadora.nome || '';
    document.getElementById('transportadoraCNPJ').value = transportadora.cnpj || '';
    document.getElementById('transportadoraTelefone').value = transportadora.telefone || '';
    document.getElementById('transportadoraEmail').value = transportadora.email || '';
    document.getElementById('transportadoraEndereco').value = transportadora.endereco || '';

    modalTransportadora.classList.remove('hidden');
};

async function salvarTransportadora(e) {
    e.preventDefault();

    const nome = document.getElementById('transportadoraNome').value.trim();
    const cnpj = document.getElementById('transportadoraCNPJ').value.trim();
    if (!nome || !cnpj) {
        showToast('Nome e CNPJ são obrigatórios', 'warning');
        return;
    }

    const transportadoraData = {
        nome,
        cnpj,
        tipo: document.getElementById('transportadoraTipo').value,
        cnpj: document.getElementById('transportadoraCNPJ').value.trim(),
        nome_fantasia: document.getElementById('transportadoraNomeFantasia').value.trim(),
        insc_municipal: document.getElementById('transportadoraInscMunicipal').value.trim() || null,
        endereco: document.getElementById('transportadoraEndereco').value.trim() || null,
        cep: document.getElementById('transportadoraCEP').value.trim() || null,
        numero: document.getElementById('transportadoraNumero').value.trim() || null,
        logradouro: document.getElementById('transportadoraLogradouro').value.trim() || null,
        bairro: document.getElementById('transportadoraBairro').value.trim() || null,
        cidade: document.getElementById('transportadoraCidade').value.trim() || null,
        codigo_antt: document.getElementById('transportadoraCodigoANTT').value.trim() || null,
        razao_social: document.getElementById('transportadoraRazaoSocial').value.trim(),
        ie: document.getElementById('transportadoraIE').value.trim() || null,
        email: document.getElementById('transportadoraEmail').value.trim() || null,
        telefone: document.getElementById('transportadoraTelefone').value.trim() || null,
        pais: document.getElementById('transportadoraPais').value.trim() || 'BRASIL',
        updated_at: new Date().toISOString()
    };

    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<span class="spinner"></span> Salvando...';
    btn.disabled = true;

    try {
        if (currentTransportadoraId) {
            const { error } = await supabaseClient
                .from('transportadoras')
                .update(transportadoraData)
                .eq('id', currentTransportadoraId);
            if (error) throw error;
        } else {
            const { error } = await supabaseClient
                .from('transportadoras')
                .insert([transportadoraData]);
            if (error) throw error;
        }

        showToast(currentTransportadoraId ? '✅ Transportadora atualizada!' : '✅ Transportadora criada!', 'success');
        fecharModalTransportadora();
        await carregarTransportadoras();
    } catch (error) {
        console.error('❌ Erro ao salvar transportadora:', error);
        showToast('Erro: ' + error.message, 'error');
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

window.excluirTransportadora = async function(id) {
    if (!confirm('Tem certeza que deseja excluir esta transportadora?')) return;
    try {
        const { error } = await supabaseClient
            .from('transportadoras')
            .delete()
            .eq('id', id);
        if (error) throw error;
        showToast('🗑️ Transportadora excluída', 'success');
        await carregarTransportadoras();
    } catch (error) {
        console.error('❌ Erro ao excluir transportadora:', error);
        showToast('Erro: ' + error.message, 'error');
    }
};

// ============================================
// AUTOCOMPLETE PARA NF-E
// ============================================
function buscarSugestoesClientes(termo) {
    if (!termo || termo.length < 2) {
        nfeClienteSugestoes.style.display = 'none';
        return;
    }
    termo = termo.toLowerCase();
    const resultados = clientes.filter(c => 
        (c.nome && c.nome.toLowerCase().includes(termo)) ||
        (c.documento && c.documento.toLowerCase().includes(termo))
    ).slice(0, 10);

    if (resultados.length === 0) {
        nfeClienteSugestoes.style.display = 'none';
        return;
    }

    let html = '';
    resultados.forEach(c => {
        html += `<div class="sugestao-item" onclick="selecionarCliente('${c.id}', '${escapeHtml(c.nome)}', '${escapeHtml(c.documento)}', '${escapeHtml(c.endereco || '')}', '${escapeHtml(c.email || '')}', '${escapeHtml(c.telefone || '')}')">
            <strong>${escapeHtml(c.nome)}</strong><br>
            <small>${escapeHtml(c.documento)}</small>
        </div>`;
    });
    nfeClienteSugestoes.innerHTML = html;
    nfeClienteSugestoes.style.display = 'block';
}

window.selecionarCliente = function(id, nome, documento, endereco, email, telefone) {
    nfeClienteId.value = id;
    nfeClienteBusca.value = nome;
    nfeClienteSugestoes.style.display = 'none';
    nfeClienteInfo.innerHTML = `
        <strong>${nome}</strong><br>
        ${documento}<br>
        ${endereco}<br>
        ${email ? '📧 ' + email : ''} ${telefone ? '📞 ' + telefone : ''}
    `;
    nfeClienteInfo.style.display = 'block';
};

function buscarSugestoesProdutos(termo) {
    if (!termo || termo.length < 2) {
        nfeProdutoSugestoes.style.display = 'none';
        return;
    }
    termo = termo.toLowerCase();
    const resultados = produtos.filter(p => 
        (p.nome && p.nome.toLowerCase().includes(termo)) ||
        (p.sku && p.sku.toLowerCase().includes(termo)) ||
        (p.ean && p.ean.toLowerCase().includes(termo))
    ).slice(0, 10);

    if (resultados.length === 0) {
        nfeProdutoSugestoes.style.display = 'none';
        return;
    }

    let html = '';
    resultados.forEach(p => {
        html += `<div class="sugestao-item" onclick="selecionarProduto('${p.id}', '${escapeHtml(p.nome)}', '${escapeHtml(p.sku)}', '${p.ncm || ''}', '${p.cfop || ''}', '${p.ean || ''}')">
            <strong>${escapeHtml(p.nome)}</strong><br>
            <small>SKU: ${escapeHtml(p.sku)} | Estoque: ${p.quantidade || 0}</small>
        </div>`;
    });
    nfeProdutoSugestoes.innerHTML = html;
    nfeProdutoSugestoes.style.display = 'block';
}

window.selecionarProduto = function(id, nome, sku, ncm, cfop, ean) {
    nfeProdutoId.value = id;
    nfeProdutoBusca.value = nome;
    nfeProdutoSugestoes.style.display = 'none';
    nfeProdutoInfo.innerHTML = `
        <strong>${nome}</strong><br>
        SKU: ${sku}<br>
        NCM: ${ncm || '---'} | CFOP: ${cfop || '---'}<br>
        ${ean ? 'EAN: ' + ean : ''}
    `;
    nfeProdutoInfo.style.display = 'block';
};

function buscarSugestoesTransportadoras(termo) {
    if (!termo || termo.length < 2) {
        nfeTransportadoraSugestoes.style.display = 'none';
        return;
    }
    termo = termo.toLowerCase();
    const resultados = transportadoras.filter(t => 
        (t.nome && t.nome.toLowerCase().includes(termo)) ||
        (t.cnpj && t.cnpj.toLowerCase().includes(termo))
    ).slice(0, 10);

    if (resultados.length === 0) {
        nfeTransportadoraSugestoes.style.display = 'none';
        return;
    }

    let html = '';
    resultados.forEach(t => {
        html += `<div class="sugestao-item" onclick="selecionarTransportadora('${t.id}', '${escapeHtml(t.nome)}', '${escapeHtml(t.cnpj)}', '${escapeHtml(t.endereco || '')}', '${escapeHtml(t.telefone || '')}')">
            <strong>${escapeHtml(t.nome)}</strong><br>
            <small>CNPJ: ${escapeHtml(t.cnpj)}</small>
        </div>`;
    });
    nfeTransportadoraSugestoes.innerHTML = html;
    nfeTransportadoraSugestoes.style.display = 'block';
}

window.selecionarTransportadora = function(id, nome, cnpj, endereco, telefone) {
    nfeTransportadoraId.value = id;
    nfeTransportadoraBusca.value = nome;
    nfeTransportadoraSugestoes.style.display = 'none';
    nfeTransportadoraInfo.innerHTML = `
        <strong>${nome}</strong><br>
        CNPJ: ${cnpj}<br>
        ${endereco}<br>
        ${telefone ? '📞 ' + telefone : ''}
    `;
    nfeTransportadoraInfo.style.display = 'block';
};

// ============================================
// MOVIMENTAÇÃO DE ESTOQUE
// ============================================
function buscarSugestoesProdutosMov(termo) {
    if (!termo || termo.length < 2) {
        movProdutoSugestoes.style.display = 'none';
        return;
    }
    termo = termo.toLowerCase();
    const resultados = produtos.filter(p => 
        (p.nome && p.nome.toLowerCase().includes(termo)) ||
        (p.sku && p.sku.toLowerCase().includes(termo))
    ).slice(0, 10);

    if (resultados.length === 0) {
        movProdutoSugestoes.style.display = 'none';
        return;
    }

    let html = '';
    resultados.forEach(p => {
        html += `<div class="sugestao-item" onclick="selecionarProdutoMov('${p.id}', '${escapeHtml(p.nome)}', ${p.quantidade || 0})">
            <strong>${escapeHtml(p.nome)}</strong><br>
            <small>SKU: ${escapeHtml(p.sku)} | Estoque: ${p.quantidade || 0}</small>
        </div>`;
    });
    movProdutoSugestoes.innerHTML = html;
    movProdutoSugestoes.style.display = 'block';
}

window.selecionarProdutoMov = function(id, nome, estoqueAtual) {
    movProdutoId.value = id;
    movProdutoBusca.value = nome;
    movProdutoSugestoes.style.display = 'none';
    movEstoqueAtualValor.textContent = estoqueAtual;
    movEstoqueAtual.style.display = 'block';
};

window.abrirModalMovimentacao = function() {
    movProdutoBusca.value = '';
    movProdutoId.value = '';
    movTipo.value = 'entrada';
    movQuantidade.value = '';
    movObservacao.value = '';
    movEstoqueAtual.style.display = 'none';
    modalMovimentacao.classList.remove('hidden');
};

window.fecharModalMovimentacao = function() {
    modalMovimentacao.classList.add('hidden');
};

async function registrarMovimentacao(e) {
    e.preventDefault();

    const produtoId = movProdutoId.value;
    const tipo = movTipo.value;
    const quantidade = parseInt(movQuantidade.value);
    const observacao = movObservacao.value.trim();

    if (!produtoId || !quantidade || quantidade <= 0) {
        showToast('Selecione um produto e informe uma quantidade válida', 'warning');
        return;
    }

    const produto = produtos.find(p => p.id == produtoId);
    if (!produto) return;

    let novaQuantidade;
    if (tipo === 'entrada') {
        novaQuantidade = (produto.quantidade || 0) + quantidade;
    } else {
        if ((produto.quantidade || 0) < quantidade) {
            showToast('Estoque insuficiente para esta saída', 'error');
            return;
        }
        novaQuantidade = (produto.quantidade || 0) - quantidade;
    }

    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<span class="spinner"></span> Registrando...';
    btn.disabled = true;

    try {
        const { error } = await supabaseClient
            .from('produtos_estoque')
            .update({ quantidade: novaQuantidade, updated_at: new Date().toISOString() })
            .eq('id', produtoId);

        if (error) throw error;

        // Registrar histórico de movimentação (opcional)
        await supabaseClient
            .from('movimentacoes_estoque')
            .insert([{
                produto_id: produtoId,
                tipo: tipo,
                quantidade: quantidade,
                observacao: observacao,
                usuario: currentUser.name,
                created_at: new Date().toISOString()
            }])
            .then(() => console.log('Histórico registrado'))
            .catch(err => console.warn('Erro ao registrar histórico:', err));

        showToast(`✅ ${tipo === 'entrada' ? 'Entrada' : 'Saída'} registrada! Novo estoque: ${novaQuantidade}`, 'success');
        fecharModalMovimentacao();
        await carregarProdutos();
    } catch (error) {
        console.error('❌ Erro ao registrar movimentação:', error);
        showToast('Erro: ' + error.message, 'error');
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

// ============================================
// FUNÇÕES DA NF-E
// ============================================
function calcularTotalNFe() {
    const qtd = parseFloat(nfeQuantidade?.value) || 0;
    const valor = parseFloat(nfeValorUnit?.value) || 0;
    const frete = parseFloat(nfeFrete?.value) || 0;
    const desconto = parseFloat(nfeDesconto?.value) || 0;

    const subtotal = qtd * valor;
    const total = subtotal + frete - desconto;
    nfeTotal.innerHTML = `R$ ${total.toFixed(2)}`;
}

function limparFormNFe() {
    nfeClienteBusca.value = '';
    nfeClienteId.value = '';
    nfeClienteInfo.style.display = 'none';
    nfeProdutoBusca.value = '';
    nfeProdutoId.value = '';
    nfeProdutoInfo.style.display = 'none';
    nfeTransportadoraBusca.value = '';
    nfeTransportadoraId.value = '';
    nfeTransportadoraInfo.style.display = 'none';
    nfeQuantidade.value = '1';
    nfeValorUnit.value = '';
    nfeFrete.value = '0';
    nfeDesconto.value = '0';
    nfeNatureza.value = 'Venda de mercadoria';
    nfeResultado.style.display = 'none';
    calcularTotalNFe();
}

async function emitirNFe(e) {
    e.preventDefault();

    const clienteId = nfeClienteId.value;
    const produtoId = nfeProdutoId.value;
    const transportadoraId = nfeTransportadoraId.value;
    const quantidade = parseFloat(nfeQuantidade.value) || 0;
    const valorUnit = parseFloat(nfeValorUnit.value) || 0;
    const frete = parseFloat(nfeFrete.value) || 0;
    const desconto = parseFloat(nfeDesconto.value) || 0;
    const natureza = nfeNatureza.value || 'Venda de mercadoria';

    if (!clienteId || !produtoId || quantidade <= 0 || valorUnit <= 0) {
        showToast('Preencha cliente, produto, quantidade e valor unitário', 'warning');
        return;
    }

    const cliente = clientes.find(c => c.id == clienteId);
    const produto = produtos.find(p => p.id == produtoId);
    if (!cliente || !produto) {
        showToast('Cliente ou produto não encontrado', 'error');
        return;
    }

    // Verificar estoque
    if ((produto.quantidade || 0) < quantidade) {
        showToast(`Estoque insuficiente! Disponível: ${produto.quantidade || 0}`, 'error');
        return;
    }

    const transportadora = transportadoras.find(t => t.id == transportadoraId);

    const subtotal = quantidade * valorUnit;
    const total = subtotal + frete - desconto;

    // XML de exemplo (incluindo transportadora)
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<NF-e>
    <infNFe>
        <ide>
            <natOp>${escapeHtml(natureza)}</natOp>
            <dhEmi>${new Date().toISOString()}</dhEmi>
        </ide>
        <emit>
            <CNPJ>12345678000199</CNPJ>
            <xNome>WHEEL TECH COMERCIO LTDA</xNome>
        </emit>
        <dest>
            <CNPJ>${cliente.documento.length > 11 ? cliente.documento : ''}</CNPJ>
            <CPF>${cliente.documento.length <= 11 ? cliente.documento : ''}</CPF>
            <xNome>${escapeHtml(cliente.nome)}</xNome>
            <enderDest>
                <xLgr>${escapeHtml(cliente.endereco || '')}</xLgr>
            </enderDest>
        </dest>
        ${transportadora ? `
        <transporta>
            <CNPJ>${transportadora.cnpj}</CNPJ>
            <xNome>${escapeHtml(transportadora.nome)}</xNome>
            <enderTrans>
                <xLgr>${escapeHtml(transportadora.endereco || '')}</xLgr>
            </enderTrans>
        </transporta>` : ''}
        <det nItem="1">
            <prod>
                <cProd>${escapeHtml(produto.sku)}</cProd>
                <xProd>${escapeHtml(produto.nome)}</xProd>
                <NCM>${produto.ncm || '00000000'}</NCM>
                <CFOP>${produto.cfop || '5102'}</CFOP>
                <qCom>${quantidade.toFixed(2)}</qCom>
                <vUnCom>${valorUnit.toFixed(2)}</vUnCom>
                <vProd>${subtotal.toFixed(2)}</vProd>
            </prod>
        </det>
        <total>
            <ICMSTot>
                <vNF>${total.toFixed(2)}</vNF>
            </ICMSTot>
        </total>
    </infNFe>
</NF-e>`;

    nfeXml.textContent = xml;
    nfeResultado.style.display = 'block';
    showToast('✅ NF-e simulada gerada!', 'success');
}

// ============================================
// FUNÇÃO AUXILIAR
// ============================================
function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return String(unsafe)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}