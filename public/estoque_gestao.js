// ============================================
// GESTÃO DE ESTOQUE - BÁSICO (produtos, entrada/saída)
// ============================================

let produtosEstoque = [];

// Abrir o sistema de gestão de estoque
window.abrirGestaoEstoque = function() {
    if (!currentUser) {
        showToast('⚠️ Faça login primeiro', 'warning');
        return;
    }
    // Esconder outros sistemas
    const sistemas = ['mainSystem', 'salesSystem', 'reembolsosSystem', 'caixaSystem', 'reviewsSystem', 'folgasSystem', 'shippingSystem', 'estoqueSystem', 'menuSystem'];
    sistemas.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });
    const gestaoSystem = document.getElementById('estoqueGestaoSystem');
    if (gestaoSystem) gestaoSystem.classList.remove('hidden');
    
    // Atualizar cabeçalho
    document.getElementById('estoqueGestaoUserName').textContent = currentUser.name;
    document.getElementById('estoqueGestaoUserAvatar').textContent = currentUser.avatar;
    document.getElementById('estoqueGestaoUserRole').textContent = currentUser.role;
    
    carregarProdutosEstoque();
};

// Carregar produtos do Supabase
async function carregarProdutosEstoque() {
    try {
        const { data, error } = await supabaseClient
            .from('produtos_estoque')
            .select('*')
            .order('nome', { ascending: true });
        if (error) throw error;
        produtosEstoque = data || [];
        renderizarTabelaProdutos();
    } catch (error) {
        console.error('Erro ao carregar produtos:', error);
        showToast('Erro ao carregar produtos', 'error');
    }
}

function renderizarTabelaProdutos() {
    const tbody = document.getElementById('produtosEstoqueBody');
    if (!tbody) return;
    if (produtosEstoque.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center">Nenhum produto cadastrado.</td></tr>';
        return;
    }
    tbody.innerHTML = '';
    produtosEstoque.forEach(prod => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${prod.id}</td>
            <td><strong>${escapeHtml(prod.nome)}</strong></td>
            <td>${escapeHtml(prod.sku)}</td>
            <td class="${prod.quantidade <= 5 ? 'text-danger fw-bold' : ''}">${prod.quantidade}</td>
            <td>R$ ${(prod.preco || 0).toFixed(2)}</td>
            <td>${escapeHtml(prod.descricao || '')}</td>
            <td>
                <button class="btn btn-sm btn-info" onclick="editarProdutoEstoque(${prod.id})"><i class="fas fa-edit"></i></button>
                <button class="btn btn-sm btn-warning" onclick="abrirModalMovimentacaoEstoque(${prod.id}, '${escapeHtml(prod.nome)}')"><i class="fas fa-exchange-alt"></i></button>
                <button class="btn btn-sm btn-danger" onclick="excluirProdutoEstoque(${prod.id})"><i class="fas fa-trash"></i></button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

// ABRIR MODAL NOVO/EDITAR
function abrirModalProdutoEstoque(produto = null) {
    const modal = document.getElementById('modalProdutoEstoque');
    const title = document.getElementById('modalProdutoTitle');
    const idInput = document.getElementById('produtoId');
    const nomeInput = document.getElementById('produtoNome');
    const skuInput = document.getElementById('produtoSKU');
    const qtdInput = document.getElementById('produtoQuantidade');
    const precoInput = document.getElementById('produtoPreco');
    const descInput = document.getElementById('produtoDescricao');
    
    if (produto) {
        title.textContent = 'Editar Produto';
        idInput.value = produto.id;
        nomeInput.value = produto.nome;
        skuInput.value = produto.sku;
        qtdInput.value = produto.quantidade;
        precoInput.value = produto.preco || 0;
        descInput.value = produto.descricao || '';
    } else {
        title.textContent = 'Novo Produto';
        idInput.value = '';
        nomeInput.value = '';
        skuInput.value = '';
        qtdInput.value = '0';
        precoInput.value = '0';
        descInput.value = '';
    }
    modal.classList.remove('hidden');
}

function fecharModalProdutoEstoque() {
    document.getElementById('modalProdutoEstoque').classList.add('hidden');
}

async function salvarProdutoEstoque() {
    const id = document.getElementById('produtoId').value;
    const nome = document.getElementById('produtoNome').value.trim();
    const sku = document.getElementById('produtoSKU').value.trim();
    const quantidade = parseInt(document.getElementById('produtoQuantidade').value) || 0;
    const preco = parseFloat(document.getElementById('produtoPreco').value) || 0;
    const descricao = document.getElementById('produtoDescricao').value.trim();
    
    if (!nome || !sku) {
        showToast('Nome e SKU são obrigatórios', 'warning');
        return;
    }
    
    const produto = { nome, sku, quantidade, preco, descricao };
    
    try {
        if (id) {
            // Atualizar
            const { error } = await supabaseClient
                .from('produtos_estoque')
                .update(produto)
                .eq('id', id);
            if (error) throw error;
            showToast('Produto atualizado!', 'success');
        } else {
            // Inserir
            const { error } = await supabaseClient
                .from('produtos_estoque')
                .insert([produto]);
            if (error) throw error;
            showToast('Produto adicionado!', 'success');
        }
        fecharModalProdutoEstoque();
        await carregarProdutosEstoque();
    } catch (error) {
        console.error('Erro ao salvar produto:', error);
        showToast('Erro: ' + error.message, 'error');
    }
}

function editarProdutoEstoque(id) {
    const produto = produtosEstoque.find(p => p.id == id);
    if (produto) abrirModalProdutoEstoque(produto);
}

async function excluirProdutoEstoque(id) {
    if (!confirm('Tem certeza que deseja excluir este produto?')) return;
    try {
        const { error } = await supabaseClient
            .from('produtos_estoque')
            .delete()
            .eq('id', id);
        if (error) throw error;
        showToast('Produto excluído', 'success');
        await carregarProdutosEstoque();
    } catch (error) {
        console.error(error);
        showToast('Erro ao excluir', 'error');
    }
}

// MOVIMENTAÇÃO DE ESTOQUE
let produtoMovimentacaoAtual = null;

function abrirModalMovimentacaoEstoque(id, nome) {
    produtoMovimentacaoAtual = id;
    document.getElementById('movProdutoId').value = id;
    document.getElementById('movProdutoNome').textContent = nome;
    document.getElementById('movQuantidade').value = '1';
    document.getElementById('movTipo').value = 'entrada';
    document.getElementById('modalMovimentacaoEstoque').classList.remove('hidden');
}

function fecharModalMovimentacaoEstoque() {
    document.getElementById('modalMovimentacaoEstoque').classList.add('hidden');
    produtoMovimentacaoAtual = null;
}

async function confirmarMovimentacaoEstoque() {
    const id = document.getElementById('movProdutoId').value;
    const tipo = document.getElementById('movTipo').value;
    let quantidade = parseInt(document.getElementById('movQuantidade').value);
    if (isNaN(quantidade) || quantidade <= 0) {
        showToast('Quantidade inválida', 'warning');
        return;
    }
    
    const produto = produtosEstoque.find(p => p.id == id);
    if (!produto) return;
    
    let novaQuantidade = produto.quantidade;
    if (tipo === 'entrada') {
        novaQuantidade += quantidade;
    } else {
        if (produto.quantidade < quantidade) {
            showToast('Estoque insuficiente!', 'error');
            return;
        }
        novaQuantidade -= quantidade;
    }
    
    try {
        const { error } = await supabaseClient
            .from('produtos_estoque')
            .update({ quantidade: novaQuantidade })
            .eq('id', id);
        if (error) throw error;
        showToast(`Movimentação realizada: ${tipo === 'entrada' ? '+' : '-'}${quantidade}`, 'success');
        fecharModalMovimentacaoEstoque();
        await carregarProdutosEstoque();
    } catch (error) {
        console.error(error);
        showToast('Erro ao movimentar', 'error');
    }
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

// Inicializar tabela se necessário
document.addEventListener('DOMContentLoaded', () => {
    // Garantir que a tabela produtos_estoque exista (criar se não existir)
    setTimeout(async () => {
        try {
            const { error } = await supabaseClient
                .from('produtos_estoque')
                .select('id')
                .limit(1);
            if (error && error.message.includes('does not exist')) {
                console.warn('Tabela produtos_estoque não existe. Crie manualmente ou execute SQL.');
                // Sugestão SQL:
                // CREATE TABLE produtos_estoque (
                //   id SERIAL PRIMARY KEY,
                //   nome TEXT NOT NULL,
                //   sku TEXT UNIQUE NOT NULL,
                //   quantidade INTEGER DEFAULT 0,
                //   preco NUMERIC DEFAULT 0,
                //   descricao TEXT,
                //   created_at TIMESTAMP DEFAULT NOW()
                // );
            }
        } catch(e) {}
    }, 2000);
});