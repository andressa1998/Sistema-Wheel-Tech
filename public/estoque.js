// estoque.js - Controle das abas do sistema de estoque/NF-e
function mudarAbaEstoque(aba) {
    // Oculta todas as abas (elementos com classe 'tab-content-estoque')
    document.querySelectorAll('.tab-content-estoque').forEach(el => {
        el.classList.add('hidden');
        // Remove qualquer display inline que possa travar
        el.style.display = '';
    });

    // Mostra a aba selecionada
    const abaId = `aba${aba.charAt(0).toUpperCase() + aba.slice(1)}`;
    const abaAtiva = document.getElementById(abaId);
    if (abaAtiva) {
        abaAtiva.classList.remove('hidden');
        abaAtiva.style.display = ''; // garante que o display padrão (block) seja restaurado
    } else {
        console.error(`Aba não encontrada: ${abaId}`);
        return;
    }

    // Atualiza estilo dos botões (opcional)
    document.querySelectorAll('#estoqueTabs .btn').forEach(btn => {
        btn.classList.remove('btn-primary');
        btn.classList.add('btn-outline-primary');
    });
    const botaoAtivo = document.querySelector(`#estoqueTabs .btn[onclick*="'${aba}'"]`);
    if (botaoAtivo) {
        botaoAtivo.classList.remove('btn-outline-primary');
        botaoAtivo.classList.add('btn-primary');
    }

    // Carrega dados específicos da aba nfe
    if (aba === 'nfe') {
        if (typeof carregarVendasSemNFE === 'function') carregarVendasSemNFE();
        if (typeof carregarVendasComNFE === 'function') carregarVendasComNFE();
        if (typeof carregarTransportadoras === 'function') carregarTransportadoras();
    }
}

// Função auxiliar showToast (caso não exista globalmente)
if (typeof showToast !== 'function') {
    window.showToast = function(message, type = 'info') {
        // Cria um toast simples se a função original não existir
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.style.position = 'fixed';
        toast.style.bottom = '20px';
        toast.style.right = '20px';
        toast.style.zIndex = '9999';
        toast.style.background = type === 'error' ? '#dc3545' : (type === 'success' ? '#28a745' : '#17a2b8');
        toast.style.color = 'white';
        toast.style.padding = '12px 20px';
        toast.style.borderRadius = '8px';
        toast.style.fontSize = '14px';
        toast.style.boxShadow = '0 2px 10px rgba(0,0,0,0.2)';
        toast.innerText = message;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    };
}