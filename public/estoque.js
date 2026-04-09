console.log('estoque.js carregado');
// estoque.js - minimal tab control
function mudarAbaEstoque(abaId) {
    // Ocultar todas as abas
    document.querySelectorAll('.tab-content-estoque').forEach(tab => {
        tab.classList.add('hidden');
    });
    // Mostrar a aba selecionada
    const abaElement = document.getElementById(`aba${abaId.charAt(0).toUpperCase() + abaId.slice(1)}`);
    if (abaElement) abaElement.classList.remove('hidden');

    // Atualizar estilo dos botões
    document.querySelectorAll('#estoqueTabs .btn').forEach(btn => {
        btn.classList.remove('active');
    });
    const activeBtn = document.querySelector(`#estoqueTabs .btn[onclick*="'${abaId}'"]`);
    if (activeBtn) activeBtn.classList.add('active');
}

// Função para abrir o sistema de estoque (que contém a aba NF-e)
window.abrirSistemaEstoque = function() {
    if (!currentUser) {
        showToast('⚠️ Faça login primeiro', 'warning');
        return;
    }

    const menuSystem = document.getElementById('menuSystem');
    if (menuSystem) menuSystem.classList.add('hidden');

    console.log('📦 Abrindo sistema de estoque...');

    // Esconder todos os outros sistemas
    const sistemas = ['mainSystem', 'salesSystem', 'reembolsosSystem', 'caixaSystem', 'reviewsSystem', 'folgasSystem', 'shippingSystem'];
    sistemas.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });

    // Mostrar sistema de estoque
    const estoqueSystem = document.getElementById('estoqueSystem');
    if (!estoqueSystem) {
        showToast('❌ Sistema de estoque não encontrado', 'error');
        return;
    }
    estoqueSystem.classList.remove('hidden');

    // Atualizar informações do usuário na interface do estoque
    const estoqueUserName = document.getElementById('estoqueUserName');
    const estoqueUserAvatar = document.getElementById('estoqueUserAvatar');
    const estoqueUserRole = document.getElementById('estoqueUserRole');
    if (estoqueUserName) estoqueUserName.textContent = currentUser.name;
    if (estoqueUserAvatar) estoqueUserAvatar.textContent = currentUser.avatar;
    if (estoqueUserRole) estoqueUserRole.textContent = currentUser.role;

    // Ativar a aba NF-e (se existir a função de troca de abas)
    if (typeof mudarAbaEstoque === 'function') {
        mudarAbaEstoque('nfe');
    }

    // Carregar vendas pendentes para NF-e (se a função estiver disponível)
    if (typeof carregarVendasSemNFE === 'function') {
        carregarVendasSemNFE();
    }

    showToast('📦 Sistema de estoque carregado', 'info');
};

// Função para alternar abas dentro do sistema de estoque
window.mudarAbaEstoque = function(abaId) {
    // Esconder todas as abas
    const abas = document.querySelectorAll('.tab-content-estoque');
    abas.forEach(tab => tab.classList.add('hidden'));

    // Mostrar a aba correspondente
    const abaSelecionada = document.getElementById(`aba${abaId.charAt(0).toUpperCase() + abaId.slice(1)}`);
    if (abaSelecionada) {
        abaSelecionada.classList.remove('hidden');
    } else {
        console.warn(`Aba ${abaId} não encontrada.`);
    }

    // Atualizar estilo dos botões
    const botoes = document.querySelectorAll('#estoqueTabs .btn');
    botoes.forEach(btn => btn.classList.remove('active'));
    const botaoAtivo = document.querySelector(`#estoqueTabs .btn[onclick*="'${abaId}'"]`);
    if (botaoAtivo) botaoAtivo.classList.add('active');
};