// ============================================
// SISTEMA DE CONFERÊNCIA DE CAIXA
// ============================================

// ===== VARIÁVEIS GLOBAIS PARA CAIXA =====
let lancamentosCaixa = [];
let currentLancamentoFilter = 'todos';
let dataCaixaAtual = new Date().toISOString().split('T')[0]; // Hoje
let caixaFechado = false;

// ===== FUNÇÃO PARA INICIALIZAR SISTEMA DE CAIXA =====
window.abrirSistemaCaixa = function() {
    if (!currentUser) {
        showToast('⚠️ Faça login primeiro', 'warning');
        return;
    }
    
    console.log('💰 Iniciando sistema de conferência de caixa...');
    
    // Esconder outros sistemas
    if (mainSystem) mainSystem.classList.add('hidden');
    if (reembolsosSystem) reembolsosSystem.classList.add('hidden');
    if (salesSystem) salesSystem.classList.add('hidden');
    
    // Mostrar sistema de caixa
    const caixaSystem = document.getElementById('caixaSystem');
    if (!caixaSystem) {
        showToast('❌ Sistema de caixa não encontrado', 'error');
        return;
    }
    
    caixaSystem.classList.remove('hidden');
    
    // Atualizar informações do usuário
    const caixaUserName = document.getElementById('caixaUserName');
    const caixaUserAvatar = document.getElementById('caixaUserAvatar');
    const caixaUserRole = document.getElementById('caixaUserRole');
    
    if (caixaUserName) caixaUserName.textContent = currentUser.name;
    if (caixaUserAvatar) caixaUserAvatar.textContent = currentUser.avatar;
    if (caixaUserRole) caixaUserRole.textContent = currentUser.role;
    
    // Configurar data do caixa
    const dataCaixaInput = document.getElementById('dataCaixa');
    if (dataCaixaInput) {
        dataCaixaInput.value = dataCaixaAtual;
        dataCaixaInput.max = new Date().toISOString().split('T')[0]; // Não permitir datas futuras
    }
    
    // Atualizar título
    const caixaDateTitle = document.getElementById('caixaDateTitle');
    if (caixaDateTitle) {
        const dataFormatada = formatarDataBR(dataCaixaAtual);
        caixaDateTitle.textContent = `Caixa - ${dataFormatada}`;
    }
    
    // Carregar dados do caixa
    carregarCaixaDia();
    
    showToast('💰 Sistema de Conferência de Caixa carregado', 'info');
};

// ===== FUNÇÃO PARA CARREGAR CAIXA DO DIA =====
window.carregarCaixaDia = async function() {
    try {
        const dataCaixaInput = document.getElementById('dataCaixa');
        if (dataCaixaInput) {
            dataCaixaAtual = dataCaixaInput.value;
        }
        
        showToast('🔄 Carregando lançamentos do dia...', 'info');
        
        if (!supabaseClient) {
            throw new Error('Supabase não conectado');
        }
        
        // Buscar caixa do dia
        const { data: caixaData, error: caixaError } = await supabaseClient
            .from('caixa')
            .select('*')
            .eq('data', dataCaixaAtual)
            .maybeSingle(); // Pode não existir
        
        if (caixaError) throw caixaError;
        
        // Se não existe caixa para esta data, criar um novo
        if (!caixaData) {
            caixaFechado = false;
        } else {
            caixaFechado = caixaData.fechado || false;
        }
        
        // Buscar lançamentos do dia - CORRIGIDO: removida referência à coluna hora
        const { data: lancamentosData, error: lancamentosError } = await supabaseClient
            .from('caixa_lancamentos')
            .select('*')
            .eq('data', dataCaixaAtual)
            .order('created_at', { ascending: true }); // Mudado para created_at
        
        lancamentosCaixa = lancamentosData || [];
        
        // Atualizar interface
        atualizarStatusCaixa();
        updateCaixaCounters();
        renderLancamentosTable();
        
        // Atualizar título
        const caixaDateTitle = document.getElementById('caixaDateTitle');
        if (caixaDateTitle) {
            const dataFormatada = formatarDataBR(dataCaixaAtual);
            caixaDateTitle.textContent = `Caixa - ${dataFormatada}`;
        }
        
        showToast('✅ Caixa carregado com sucesso', 'success');
        
    } catch (error) {
        console.error('❌ Erro ao carregar caixa:', error);
        showToast('❌ Erro ao carregar caixa: ' + error.message, 'error');
        
        lancamentosCaixa = [];
        caixaFechado = false;
        atualizarStatusCaixa();
        updateCaixaCounters();
        renderLancamentosTable();
    }
};

// ===== FUNÇÃO PARA ATUALIZAR STATUS DO CAIXA =====
function atualizarStatusCaixa() {
    const statusCaixa = document.getElementById('statusCaixa');
    const saldoAtual = document.getElementById('saldoAtual');
    const fecharCaixaBtn = document.getElementById('fecharCaixaBtn');
    const reabrirCaixaBtn = document.getElementById('reabrirCaixaBtn');
    const formLancamentoCard = document.getElementById('formLancamentoCard');
    
    // Calcular totais
    let totalEntradas = 0;
    let totalSaidas = 0;
    
    lancamentosCaixa.forEach(lancamento => {
        if (lancamento.tipo === 'entrada') {
            totalEntradas += parseFloat(lancamento.valor || 0);
        } else if (lancamento.tipo === 'saida') {
            totalSaidas += parseFloat(lancamento.valor || 0);
        }
    });
    
    const saldo = totalEntradas - totalSaidas;
    
    // Atualizar status
    if (statusCaixa) {
        if (caixaFechado) {
            statusCaixa.textContent = 'FECHADO';
            statusCaixa.style.color = '#dc3545';
            statusCaixa.style.fontWeight = 'bold';
        } else {
            statusCaixa.textContent = 'ABERTO';
            statusCaixa.style.color = '#28a745';
            statusCaixa.style.fontWeight = 'bold';
        }
    }
    
    if (saldoAtual) {
        saldoAtual.textContent = saldo.toFixed(2);
        saldoAtual.style.color = saldo >= 0 ? '#28a745' : '#dc3545';
        saldoAtual.style.fontWeight = 'bold';
    }
    
    // Atualizar contadores de totais
    const totalEntradasSpan = document.getElementById('totalEntradas');
    const totalSaidasSpan = document.getElementById('totalSaidas');
    
    if (totalEntradasSpan) totalEntradasSpan.textContent = lancamentosCaixa.filter(l => l.tipo === 'entrada').length;
    if (totalSaidasSpan) totalSaidasSpan.textContent = lancamentosCaixa.filter(l => l.tipo === 'saida').length;
    
    // Mostrar/ocultar botões baseado no status
    if (fecharCaixaBtn) {
        if (caixaFechado) {
            fecharCaixaBtn.classList.add('hidden');
        } else {
            fecharCaixaBtn.classList.remove('hidden');
        }
    }
    
    if (reabrirCaixaBtn) {
        if (caixaFechado) {
            reabrirCaixaBtn.classList.remove('hidden');
        } else {
            reabrirCaixaBtn.classList.add('hidden');
        }
    }
    
    // Mostrar/ocultar formulário baseado no status
    if (formLancamentoCard) {
        if (caixaFechado) {
            formLancamentoCard.style.opacity = '0.6';
            formLancamentoCard.style.pointerEvents = 'none';
            
            const inputs = formLancamentoCard.querySelectorAll('input, select, textarea, button');
            inputs.forEach(input => {
                input.disabled = true;
            });
            
            const salvarBtn = document.getElementById('salvarLancamentoBtn');
            if (salvarBtn) salvarBtn.disabled = true;
        } else {
            formLancamentoCard.style.opacity = '1';
            formLancamentoCard.style.pointerEvents = 'auto';
            
            const inputs = formLancamentoCard.querySelectorAll('input, select, textarea, button');
            inputs.forEach(input => {
                input.disabled = false;
            });
            
            const salvarBtn = document.getElementById('salvarLancamentoBtn');
            if (salvarBtn) salvarBtn.disabled = false;
        }
    }
}

// ===== FUNÇÃO PARA ATUALIZAR CONTADORES DO CAIXA =====
function updateCaixaCounters() {
    const countEntradas = document.getElementById('countEntradas');
    const countSaidas = document.getElementById('countSaidas');
    const countLancamentos = document.getElementById('countLancamentos');
    
    const entradas = lancamentosCaixa.filter(l => l.tipo === 'entrada').length;
    const saidas = lancamentosCaixa.filter(l => l.tipo === 'saida').length;
    const total = lancamentosCaixa.length;
    
    if (countEntradas) countEntradas.textContent = entradas;
    if (countSaidas) countSaidas.textContent = saidas;
    if (countLancamentos) countLancamentos.textContent = total;
}

// ===== FUNÇÃO PARA RENDERIZAR TABELA DE LANÇAMENTOS =====
function renderLancamentosTable() {
    const lancamentosTableBody = document.getElementById('lancamentosTableBody');
    if (!lancamentosTableBody) return;
    
    lancamentosTableBody.innerHTML = '';
    
    if (lancamentosCaixa.length === 0) {
        lancamentosTableBody.innerHTML = `
            <tr>
                <td colspan="8" class="text-center" style="padding: 40px;">
                    <i class="fas fa-cash-register fa-3x" style="color: #6c757d; opacity: 0.5; margin-bottom: 15px;"></i>
                    <h4 style="color: #6c757d;">Nenhum lançamento encontrado</h4>
                    <p style="color: #6c757d;">Clique em "Novo Lançamento" para começar.</p>
                </td>
            </tr>
        `;
        document.getElementById('lancamentosEmpty')?.classList.add('hidden');
        return;
    }
    
    // Filtrar lançamentos baseado no filtro atual
    let filteredLancamentos = lancamentosCaixa;
    if (currentLancamentoFilter !== 'todos') {
        filteredLancamentos = lancamentosCaixa.filter(l => l.tipo === currentLancamentoFilter);
    }
    
    // Ordenar por hora (mais recente primeiro)
    filteredLancamentos.sort((a, b) => new Date(b.hora) - new Date(a.hora));
    
    filteredLancamentos.forEach(lancamento => {
        const row = document.createElement('tr');
        
        // Estilo baseado no tipo
        if (lancamento.tipo === 'entrada') {
            row.style.backgroundColor = 'rgba(40, 167, 69, 0.05)';
        } else {
            row.style.backgroundColor = 'rgba(220, 53, 69, 0.05)';
        }
        
        // Ícone de conferência
        let conferenciaIcon = '';
        if (lancamento.tipo === 'saida') {
            if (lancamento.comprovante_aprovado === true) {
                conferenciaIcon = '<i class="fas fa-check-circle" style="color: #28a745; margin-left: 5px;" title="Comprovante aprovado"></i>';
            } else if (lancamento.comprovante_aprovado === false) {
                conferenciaIcon = '<i class="fas fa-times-circle" style="color: #dc3545; margin-left: 5px;" title="Comprovante rejeitado"></i>';
            } else if (lancamento.comprovante_url) {
                conferenciaIcon = '<i class="fas fa-question-circle" style="color: #ffc107; margin-left: 5px;" title="Aguardando aprovação"></i>';
            }
        }
        
        // Ações
        let acoes = '';
        
        // Verificar permissão - apenas admin ou criador pode editar/excluir
        const isAdmin = currentUser.role === 'Administrador';
        const isCriador = lancamento.criado_por === currentUser.name;
        
        if (isAdmin || isCriador) {
            // Botão de conferir comprovante (apenas para admin em saídas com comprovante)
            if (isAdmin && lancamento.tipo === 'saida' && lancamento.comprovante_url) {
                acoes += `
                    <button class="btn btn-info btn-sm" onclick="conferirComprovante(${lancamento.id})" title="Conferir comprovante">
                        <i class="fas fa-receipt"></i>
                    </button>
                `;
            }
            
            // Botão de excluir
            acoes += `
                <button class="btn btn-danger btn-sm" onclick="excluirLancamento(${lancamento.id})" title="Excluir">
                    <i class="fas fa-trash"></i>
                </button>
            `;
        } else {
            // Visualizar comprovante (se houver e for saída)
            if (lancamento.tipo === 'saida' && lancamento.comprovante_url) {
                acoes += `
                    <button class="btn btn-info btn-sm" onclick="verComprovante('${lancamento.comprovante_url}')" title="Ver comprovante">
                        <i class="fas fa-eye"></i>
                    </button>
                `;
            }
        }
        
        /// Formatar hora - CORRIGIDO: usando created_at em vez de hora
        const hora = new Date(lancamento.created_at); // Mudado de lancamento.hora para lancamento.created_at
        const horaFormatada = hora.toLocaleTimeString('pt-BR', { 
            hour: '2-digit', 
            minute: '2-digit' 
});
        
        row.innerHTML = `
            <td>
                <span class="badge ${lancamento.tipo === 'entrada' ? 'badge-success' : 'badge-danger'}">
                    ${lancamento.tipo === 'entrada' ? 'ENTRADA' : 'SAÍDA'}
                </span>
            </td>
            <td class="${lancamento.tipo === 'entrada' ? 'text-success' : 'text-danger'}" style="font-weight: bold;">
                R$ ${parseFloat(lancamento.valor).toFixed(2)}
            </td>
            <td>${lancamento.descricao}</td>
            <td>
                ${lancamento.comprovante_url ? 
                    `<a href="${lancamento.comprovante_url}" target="_blank" title="Ver comprovante">
                        <i class="fas fa-file-invoice-dollar"></i> Comprovante
                    </a>` : 
                    '<span class="text-muted">-</span>'
                }
                ${conferenciaIcon}
            </td>
            <td>
                ${lancamento.comprovante_aprovado === true ? 
                    '<span class="badge badge-success">Aprovado</span>' :
                lancamento.comprovante_aprovado === false ? 
                    '<span class="badge badge-danger">Rejeitado</span>' :
                lancamento.comprovante_url ? 
                    '<span class="badge badge-warning">Pendente</span>' :
                    '<span class="text-muted">-</span>'
                }
            </td>
            <td>${lancamento.criado_por}</td>
            <td>${horaFormatada}</td>
            <td>
                <div class="d-flex gap-2">
                    ${acoes}
                </div>
            </td>
        `;
        
        lancamentosTableBody.appendChild(row);
    });
    
    document.getElementById('lancamentosEmpty')?.classList.add('hidden');
}

// ===== FUNÇÃO PARA SALVAR LANÇAMENTO =====
window.salvarLancamento = async function() {
    const tipoLancamento = document.getElementById('tipoLancamento').value;
    const valorLancamento = parseFloat(document.getElementById('valorLancamento').value);
    const descricaoLancamento = document.getElementById('descricaoLancamento').value.trim();
    
    // Validação
    if (!tipoLancamento || !valorLancamento || valorLancamento <= 0 || !descricaoLancamento) {
        showToast('Preencha todos os campos obrigatórios!', 'warning');
        return;
    }
    
    // Validação especial para saídas (comprovante obrigatório)
    if (tipoLancamento === 'saida') {
        const comprovanteFile = document.getElementById('comprovanteFile');
        if (!comprovanteFile.files || comprovanteFile.files.length === 0) {
            showToast('Para saídas, é obrigatório anexar um comprovante!', 'warning');
            return;
        }
    }
    
    const btn = document.getElementById('salvarLancamentoBtn');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<span class="spinner"></span> Salvando...';
    btn.disabled = true;
    
    try {
        let comprovanteUrl = null;
        
        // Upload do comprovante (se houver)
        const comprovanteFile = document.getElementById('comprovanteFile');
        if (comprovanteFile.files && comprovanteFile.files.length > 0) {
            comprovanteUrl = await uploadComprovante(comprovanteFile.files[0]);
            if (!comprovanteUrl) {
                throw new Error('Falha no upload do comprovante');
            }
        }
        
        // Verificar se já existe caixa para esta data
        const { data: caixaExistente, error: caixaError } = await supabaseClient
            .from('caixa')
            .select('id')
            .eq('data', dataCaixaAtual)
            .maybeSingle();
        
        if (caixaError) throw caixaError;
        
        // Se não existe, criar um novo caixa
        if (!caixaExistente) {
            const { error: criarCaixaError } = await supabaseClient
                .from('caixa')
                .insert([{
                    data: dataCaixaAtual,
                    saldo_inicial: 0,
                    saldo_final: 0,
                    fechado: false,
                    criado_por: currentUser.name
                }]);
            
            if (criarCaixaError) throw criarCaixaError;
        }
        
        // Inserir lançamento
        const lancamentoData = {
            data: dataCaixaAtual,
            tipo: tipoLancamento,
            valor: valorLancamento,
            descricao: descricaoLancamento,
            comprovante_url: comprovanteUrl,
            comprovante_aprovado: tipoLancamento === 'saida' ? null : true, // Entradas são aprovadas automaticamente
            criado_por: currentUser.name,
        };
        
        const { data, error } = await supabaseClient
            .from('caixa_lancamentos')
            .insert([lancamentoData])
            .select();
        
        if (error) throw error;
        
        // Atualizar lista local
        lancamentosCaixa.push(data[0]);
        
        // Limpar formulário
        limparFormLancamento();
        
        // Atualizar interface
        atualizarStatusCaixa();
        updateCaixaCounters();
        renderLancamentosTable();
        
        showToast('✅ Lançamento salvo com sucesso!', 'success');
        
    } catch (error) {
        console.error('❌ Erro ao salvar lançamento:', error);
        showToast('❌ Erro ao salvar lançamento: ' + error.message, 'error');
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
};

// ===== FUNÇÃO PARA UPLOAD DE COMPROVANTE =====
async function uploadComprovante(file) {
    try {
        showToast('📤 Enviando comprovante...', 'info');
        
        // Em um sistema real, você enviaria para um bucket de storage
        // Aqui estamos simulando o upload e retornando uma URL fictícia
        
        // Para simulação, criamos uma URL de data URL (base64)
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                // Em produção, você enviaria para o Supabase Storage
                // const { data, error } = await supabaseClient.storage
                //     .from('comprovantes')
                //     .upload(`caixa/${Date.now()}_${file.name}`, file);
                
                // Simulação: criar URL de dados
                setTimeout(() => {
                    resolve(e.target.result);
                }, 1000);
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
        
    } catch (error) {
        console.error('❌ Erro no upload do comprovante:', error);
        throw error;
    }
}

// ===== FUNÇÃO PARA LIMPAR FORMULÁRIO DE LANÇAMENTO =====
window.limparFormLancamento = function() {
    document.getElementById('tipoLancamento').value = 'entrada';
    document.getElementById('valorLancamento').value = '';
    document.getElementById('descricaoLancamento').value = '';
    
    // Limpar preview do comprovante
    document.getElementById('comprovanteFile').value = '';
    document.getElementById('comprovantePreview').style.display = 'none';
    
    // Resetar validação visual
    const comprovanteSection = document.getElementById('comprovanteSection');
    if (comprovanteSection) {
        comprovanteSection.style.borderColor = '';
        comprovanteSection.style.boxShadow = '';
    }
};

// ===== FUNÇÃO PARA EXCLUIR LANÇAMENTO =====
window.excluirLancamento = async function(id) {
    const lancamento = lancamentosCaixa.find(l => l.id === id);
    if (!lancamento) {
        showToast('Lançamento não encontrado', 'error');
        return;
    }
    
    // Verificar permissão
    const isAdmin = currentUser.role === 'Administrador';
    const isCriador = lancamento.criado_por === currentUser.name;
    
    if (!isAdmin && !isCriador) {
        showToast('Você não tem permissão para excluir este lançamento', 'warning');
        return;
    }
    
    if (!confirm(`Excluir lançamento de ${lancamento.tipo === 'entrada' ? 'entrada' : 'saída'} no valor de R$ ${lancamento.valor}?`)) {
        return;
    }
    
    try {
        const { error } = await supabaseClient
            .from('caixa_lancamentos')
            .delete()
            .eq('id', id);
        
        if (error) throw error;
        
        // Remover da lista local
        lancamentosCaixa = lancamentosCaixa.filter(l => l.id !== id);
        
        // Atualizar interface
        atualizarStatusCaixa();
        updateCaixaCounters();
        renderLancamentosTable();
        
        showToast('🗑️ Lançamento excluído com sucesso!', 'success');
        
    } catch (error) {
        console.error('❌ Erro ao excluir lançamento:', error);
        showToast('❌ Erro ao excluir lançamento: ' + error.message, 'error');
    }
};

// ===== FUNÇÃO PARA CONFERIR COMPROVANTE =====
window.conferirComprovante = async function(id) {
    const lancamento = lancamentosCaixa.find(l => l.id === id);
    if (!lancamento || lancamento.tipo !== 'saida') {
        showToast('Lançamento inválido para conferência', 'error');
        return;
    }
    
    // Armazenar ID do lançamento atual
    window.currentLancamentoConferencia = id;
    
    // Preencher modal
    document.getElementById('modalValor').textContent = parseFloat(lancamento.valor).toFixed(2);
    document.getElementById('modalDescricao').textContent = lancamento.descricao;
    document.getElementById('modalUsuario').textContent = lancamento.criado_por;
    
    // Carregar comprovante
    const comprovanteImage = document.getElementById('comprovanteImage');
    if (lancamento.comprovante_url) {
        if (lancamento.comprovante_url.startsWith('data:')) {
            // É uma data URL (base64)
            comprovanteImage.innerHTML = `
                <img src="${lancamento.comprovante_url}" 
                     alt="Comprovante" 
                     style="max-width: 100%; border-radius: 8px;">
            `;
        } else {
            // É uma URL normal
            comprovanteImage.innerHTML = `
                <img src="${lancamento.comprovante_url}" 
                     alt="Comprovante" 
                     style="max-width: 100%; border-radius: 8px;">
            `;
        }
    } else {
        comprovanteImage.innerHTML = `
            <div class="text-center" style="padding: 40px;">
                <i class="fas fa-file-invoice-dollar fa-3x" style="color: #6c757d; opacity: 0.5; margin-bottom: 15px;"></i>
                <p style="color: #6c757d;">Comprovante não disponível</p>
            </div>
        `;
    }
    
    // Mostrar modal
    document.getElementById('comprovanteModal').classList.remove('hidden');
};

// ===== FUNÇÃO PARA APROVAR COMPROVANTE =====
window.aprovarComprovante = async function() {
    const id = window.currentLancamentoConferencia;
    if (!id) return;
    
    try {
        const { error } = await supabaseClient
            .from('caixa_lancamentos')
            .update({ 
                comprovante_aprovado: true,
                conferido_por: currentUser.name,
                data_conferencia: new Date().toISOString()
            })
            .eq('id', id);
        
        if (error) throw error;
        
        // Atualizar lista local
        const index = lancamentosCaixa.findIndex(l => l.id === id);
        if (index !== -1) {
            lancamentosCaixa[index].comprovante_aprovado = true;
            lancamentosCaixa[index].conferido_por = currentUser.name;
            lancamentosCaixa[index].data_conferencia = new Date().toISOString();
        }
        
        // Fechar modal e atualizar tabela
        closeComprovanteModal();
        renderLancamentosTable();
        
        showToast('✅ Comprovante aprovado!', 'success');
        
    } catch (error) {
        console.error('❌ Erro ao aprovar comprovante:', error);
        showToast('❌ Erro ao aprovar comprovante: ' + error.message, 'error');
    }
};

// ===== FUNÇÃO PARA REJEITAR COMPROVANTE =====
window.rejeitarComprovante = async function() {
    const id = window.currentLancamentoConferencia;
    if (!id) return;
    
    try {
        const { error } = await supabaseClient
            .from('caixa_lancamentos')
            .update({ 
                comprovante_aprovado: false,
                conferido_por: currentUser.name,
                data_conferencia: new Date().toISOString()
            })
            .eq('id', id);
        
        if (error) throw error;
        
        // Atualizar lista local
        const index = lancamentosCaixa.findIndex(l => l.id === id);
        if (index !== -1) {
            lancamentosCaixa[index].comprovante_aprovado = false;
            lancamentosCaixa[index].conferido_por = currentUser.name;
            lancamentosCaixa[index].data_conferencia = new Date().toISOString();
        }
        
        // Fechar modal e atualizar tabela
        closeComprovanteModal();
        renderLancamentosTable();
        
        showToast('❌ Comprovante rejeitado!', 'warning');
        
    } catch (error) {
        console.error('❌ Erro ao rejeitar comprovante:', error);
        showToast('❌ Erro ao rejeitar comprovante: ' + error.message, 'error');
    }
};

// ===== FUNÇÃO PARA VER COMPROVANTE =====
window.verComprovante = function(url) {
    window.open(url, '_blank');
};

// ===== FUNÇÃO PARA FECHAR MODAL DE COMPROVANTE =====
window.closeComprovanteModal = function() {
    document.getElementById('comprovanteModal').classList.add('hidden');
    window.currentLancamentoConferencia = null;
};

// ===== FUNÇÃO PARA FECHAR CAIXA =====
window.fecharCaixa = async function() {
    if (!confirm('Deseja fechar o caixa do dia?\n\nApós fechar, não será possível adicionar novos lançamentos.')) {
        return;
    }
    
    try {
        // Calcular totais
        let totalEntradas = 0;
        let totalSaidas = 0;
        
        lancamentosCaixa.forEach(lancamento => {
            if (lancamento.tipo === 'entrada') {
                totalEntradas += parseFloat(lancamento.valor || 0);
            } else if (lancamento.tipo === 'saida') {
                totalSaidas += parseFloat(lancamento.valor || 0);
            }
        });
        
        const saldoFinal = totalEntradas - totalSaidas;
        
        // Atualizar registro do caixa
        const { error } = await supabaseClient
            .from('caixa')
            .update({
                total_entradas: totalEntradas,
                total_saidas: totalSaidas,
                saldo_final: saldoFinal,
                fechado: true,
                fechado_por: currentUser.name,
                data_fechamento: new Date().toISOString()
            })
            .eq('data', dataCaixaAtual);
        
        if (error) throw error;
        
        caixaFechado = true;
        atualizarStatusCaixa();
        
        showToast('🔒 Caixa fechado com sucesso!', 'success');
        
    } catch (error) {
        console.error('❌ Erro ao fechar caixa:', error);
        showToast('❌ Erro ao fechar caixa: ' + error.message, 'error');
    }
};

// ===== FUNÇÃO PARA REABRIR CAIXA =====
window.reabrirCaixa = async function() {
    if (!confirm('Deseja reabrir o caixa do dia?\n\nApenas administradores podem reabrir caixas fechados.')) {
        return;
    }
    
    // Verificar se é admin
    if (currentUser.role !== 'Administrador') {
        showToast('Apenas administradores podem reabrir caixas', 'warning');
        return;
    }
    
    try {
        const { error } = await supabaseClient
            .from('caixa')
            .update({
                fechado: false,
                reaberto_por: currentUser.name,
                data_reabertura: new Date().toISOString()
            })
            .eq('data', dataCaixaAtual);
        
        if (error) throw error;
        
        caixaFechado = false;
        atualizarStatusCaixa();
        
        showToast('🔓 Caixa reaberto com sucesso!', 'success');
        
    } catch (error) {
        console.error('❌ Erro ao reabrir caixa:', error);
        showToast('❌ Erro ao reabrir caixa: ' + error.message, 'error');
    }
};

// ===== FUNÇÃO PARA FILTRAR LANÇAMENTOS =====
window.filtrarLancamentos = function(filtro) {
    currentLancamentoFilter = filtro;
    renderLancamentosTable();
    
    // Atualizar botões ativos
    document.querySelectorAll('#caixaSystem .btn-sm').forEach(btn => {
        btn.classList.remove('filtro-ativo');
    });
    
    const activeButton = document.querySelector(`#caixaSystem .btn-sm[onclick*="${filtro}"]`);
    if (activeButton) {
        activeButton.classList.add('filtro-ativo');
    }
};

// ===== FUNÇÃO PARA EXPORTAR CAIXA PARA EXCEL =====
window.exportarCaixaExcel = function() {
    if (lancamentosCaixa.length === 0) {
        showToast('Nenhum lançamento para exportar', 'warning');
        return;
    }
    
    // Preparar dados para Excel
    const dados = [
        ['Data', 'Tipo', 'Valor', 'Descrição', 'Comprovante', 'Status', 'Usuário', 'Hora']
    ];
    
    lancamentosCaixa.forEach(lancamento => {
        const hora = new Date(lancamento.hora);
        const horaFormatada = hora.toLocaleTimeString('pt-BR', { 
            hour: '2-digit', 
            minute: '2-digit' 
        });
        
        let status = '-';
        if (lancamento.tipo === 'saida') {
            if (lancamento.comprovante_aprovado === true) status = 'Aprovado';
            else if (lancamento.comprovante_aprovado === false) status = 'Rejeitado';
            else if (lancamento.comprovante_url) status = 'Pendente';
        }
        
        dados.push([
            formatarDataBR(lancamento.data),
            lancamento.tipo === 'entrada' ? 'Entrada' : 'Saída',
            parseFloat(lancamento.valor).toFixed(2),
            lancamento.descricao,
            lancamento.comprovante_url ? 'Sim' : 'Não',
            status,
            lancamento.criado_por,
            horaFormatada
        ]);
    });
    
    // Adicionar totais
    const totalEntradas = lancamentosCaixa
        .filter(l => l.tipo === 'entrada')
        .reduce((sum, l) => sum + parseFloat(l.valor), 0);
    
    const totalSaidas = lancamentosCaixa
        .filter(l => l.tipo === 'saida')
        .reduce((sum, l) => sum + parseFloat(l.valor), 0);
    
    const saldo = totalEntradas - totalSaidas;
    
    dados.push([]);
    dados.push(['TOTAL ENTRADAS', '', totalEntradas.toFixed(2), '', '', '', '', '']);
    dados.push(['TOTAL SAÍDAS', '', totalSaidas.toFixed(2), '', '', '', '', '']);
    dados.push(['SALDO FINAL', '', saldo.toFixed(2), '', '', '', '', '']);
    
    // Criar workbook
    const ws = XLSX.utils.aoa_to_sheet(dados);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Caixa");
    
    // Gerar nome do arquivo
    const dataFormatada = formatarDataBR(dataCaixaAtual).replace(/\//g, '-');
    const filename = `caixa_${dataFormatada}.xlsx`;
    
    // Baixar arquivo
    XLSX.writeFile(wb, filename);
    
    showToast('✅ Caixa exportado com sucesso!', 'success');
};

// ===== FUNÇÃO PARA ABRIR RELATÓRIO DE CAIXA =====
window.abrirRelatorioCaixa = function() {
    // Verificar se é admin
    if (currentUser.role !== 'Administrador') {
        showToast('Apenas administradores podem acessar relatórios', 'warning');
        return;
    }
    
    // Configurar datas padrão (últimos 7 dias)
    const hoje = new Date();
    const seteDiasAtras = new Date();
    seteDiasAtras.setDate(hoje.getDate() - 7);
    
    document.getElementById('relDataInicio').value = seteDiasAtras.toISOString().split('T')[0];
    document.getElementById('relDataFim').value = hoje.toISOString().split('T')[0];
    document.getElementById('relUsuario').value = '';
    
    document.getElementById('relatorioCaixaModal').classList.remove('hidden');
};

// ===== FUNÇÃO PARA FECHAR RELATÓRIO DE CAIXA =====
window.closeRelatorioCaixaModal = function() {
    document.getElementById('relatorioCaixaModal').classList.add('hidden');
};

// ===== FUNÇÃO PARA GERAR RELATÓRIO DE CAIXA =====
window.gerarRelatorioCaixa = async function() {
    const dataInicio = document.getElementById('relDataInicio').value;
    const dataFim = document.getElementById('relDataFim').value;
    const usuario = document.getElementById('relUsuario').value;
    
    // Validar datas
    if (!dataInicio || !dataFim) {
        showToast('Selecione as datas de início e fim', 'warning');
        return;
    }
    
    if (new Date(dataInicio) > new Date(dataFim)) {
        showToast('Data início não pode ser maior que data fim', 'warning');
        return;
    }
    
    try {
        showToast('📊 Gerando relatório...', 'info');
        
        // Buscar caixas no período
        let query = supabaseClient
            .from('caixa')
            .select('*')
            .gte('data', dataInicio)
            .lte('data', dataFim)
            .order('data', { ascending: false });
        
        if (usuario) {
            query = query.or(`criado_por.eq.${usuario},fechado_por.eq.${usuario},reaberto_por.eq.${usuario}`);
        }
        
        const { data: caixas, error } = await query;
        
        if (error) throw error;
        
        // Buscar lançamentos no período
        const { data: lancamentos, error: errorLancamentos } = await supabaseClient
            .from('caixa_lancamentos')
            .select('*')
            .gte('data', dataInicio)
            .lte('data', dataFim)
            .order('data', { ascending: false });
        
        if (errorLancamentos) throw errorLancamentos;
        
        // Calcular estatísticas
        let totalEntradasPeriodo = 0;
        let totalSaidasPeriodo = 0;
        let totalDias = caixas?.length || 0;
        
        caixas?.forEach(caixa => {
            totalEntradasPeriodo += caixa.total_entradas || 0;
            totalSaidasPeriodo += caixa.total_saidas || 0;
        });
        
        const saldoFinalPeriodo = totalEntradasPeriodo - totalSaidasPeriodo;
        
        // Atualizar resumo
        document.getElementById('relTotalEntradas').textContent = totalEntradasPeriodo.toFixed(2);
        document.getElementById('relTotalSaidas').textContent = totalSaidasPeriodo.toFixed(2);
        document.getElementById('relSaldoFinal').textContent = saldoFinalPeriodo.toFixed(2);
        document.getElementById('relTotalDias').textContent = totalDias;
        
        // Atualizar tabela
        const tbody = document.getElementById('relatorioCaixaTableBody');
        tbody.innerHTML = '';
        
        if (caixas?.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="text-center" style="padding: 20px;">
                        Nenhum dado encontrado para o período selecionado
                    </td>
                </tr>
            `;
        } else {
            caixas?.forEach(caixa => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${formatarDataBR(caixa.data)}</td>
                    <td class="text-success">R$ ${(caixa.total_entradas || 0).toFixed(2)}</td>
                    <td class="text-danger">R$ ${(caixa.total_saidas || 0).toFixed(2)}</td>
                    <td class="${(caixa.saldo_final || 0) >= 0 ? 'text-success' : 'text-danger'}">
                        R$ ${(caixa.saldo_final || 0).toFixed(2)}
                    </td>
                    <td>
                        ${caixa.fechado ? 
                            `<span class="badge badge-danger">Fechado</span><br>
                             <small>${caixa.fechado_por || '-'}</small>` : 
                            `<span class="badge badge-success">Aberto</span>`
                        }
                    </td>
                    <td>${caixa.criado_por || '-'}</td>
                `;
                tbody.appendChild(row);
            });
        }
        
        // Gerar gráfico
        gerarGraficoCaixa(caixas);
        
        showToast('✅ Relatório gerado com sucesso!', 'success');
        
    } catch (error) {
        console.error('❌ Erro ao gerar relatório:', error);
        showToast('❌ Erro ao gerar relatório: ' + error.message, 'error');
    }
};

// ===== FUNÇÃO PARA GERAR GRÁFICO DE CAIXA =====
function gerarGraficoCaixa(caixas) {
    const container = document.getElementById('graficoCaixaContainer');
    
    if (!caixas || caixas.length === 0) {
        container.innerHTML = `
            <div style="text-align: center;">
                <i class="fas fa-chart-line fa-3x" style="color: #6c757d; opacity: 0.3;"></i>
                <p style="color: #6c757d; margin-top: 10px;">Sem dados para exibir</p>
            </div>
        `;
        return;
    }
    
    // Ordenar por data
    caixas.sort((a, b) => new Date(a.data) - new Date(b.data));
    
    // Preparar dados para o gráfico
    const labels = caixas.map(c => formatarDataBR(c.data));
    const entradas = caixas.map(c => c.total_entradas || 0);
    const saidas = caixas.map(c => c.total_saidas || 0);
    const saldos = caixas.map(c => c.saldo_final || 0);
    
    // Criar gráfico simples com HTML/CSS
    const maxValor = Math.max(...entradas, ...saidas);
    const chartHeight = 200;
    
    let html = `
        <div style="width: 100%;">
            <div style="display: flex; height: ${chartHeight}px; align-items: flex-end; gap: 10px; padding: 0 10px;">
    `;
    
    caixas.forEach((caixa, index) => {
        const alturaEntrada = (caixa.total_entradas / maxValor) * chartHeight;
        const alturaSaida = (caixa.total_saidas / maxValor) * chartHeight;
        
        html += `
            <div style="flex: 1; display: flex; flex-direction: column; align-items: center;">
                <div style="position: relative; height: ${chartHeight}px; width: 30px;">
                    <div style="position: absolute; bottom: 0; left: 0; right: 0; 
                                height: ${alturaEntrada}px; background: #28a745; 
                                border-radius: 3px 3px 0 0;" 
                         title="Entradas: R$ ${caixa.total_entradas?.toFixed(2) || '0,00'}">
                    </div>
                    <div style="position: absolute; bottom: 0; left: 0; right: 0; 
                                height: ${alturaSaida}px; background: #dc3545; 
                                border-radius: 3px 3px 0 0;" 
                         title="Saídas: R$ ${caixa.total_saidas?.toFixed(2) || '0,00'}">
                    </div>
                </div>
                <div style="font-size: 10px; color: #6c757d; margin-top: 5px; text-align: center;">
                    ${formatarDataBR(caixa.data).split('/')[0]}/${formatarDataBR(caixa.data).split('/')[1]}
                </div>
            </div>
        `;
    });
    
    html += `
            </div>
            <div style="display: flex; justify-content: center; gap: 20px; margin-top: 20px;">
                <div style="display: flex; align-items: center; gap: 5px;">
                    <div style="width: 15px; height: 15px; background: #28a745; border-radius: 3px;"></div>
                    <span style="font-size: 12px; color: #495057;">Entradas</span>
                </div>
                <div style="display: flex; align-items: center; gap: 5px;">
                    <div style="width: 15px; height: 15px; background: #dc3545; border-radius: 3px;"></div>
                    <span style="font-size: 12px; color: #495057;">Saídas</span>
                </div>
            </div>
        </div>
    `;
    
    container.innerHTML = html;
}

// ===== FUNÇÃO PARA EXPORTAR RELATÓRIO DE CAIXA =====
window.exportarRelatorioCaixa = function() {
    const tbody = document.getElementById('relatorioCaixaTableBody');
    const rows = tbody.querySelectorAll('tr');
    
    if (rows.length === 0 || (rows.length === 1 && rows[0].querySelector('td[colspan]'))) {
        showToast('Nenhum dado para exportar', 'warning');
        return;
    }
    
    // Criar dados para Excel
    const dados = [];
    
    // Cabeçalho
    dados.push(['Data', 'Entradas', 'Saídas', 'Saldo', 'Status', 'Usuário']);
    
    // Dados
    rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 6) {
            dados.push([
                cells[0].textContent,
                cells[1].textContent,
                cells[2].textContent,
                cells[3].textContent,
                cells[4].textContent,
                cells[5].textContent
            ]);
        }
    });
    
    // Adicionar totais do período
    const totalEntradas = document.getElementById('relTotalEntradas').textContent;
    const totalSaidas = document.getElementById('relTotalSaidas').textContent;
    const saldoFinal = document.getElementById('relSaldoFinal').textContent;
    const totalDias = document.getElementById('relTotalDias').textContent;
    
    dados.push([]);
    dados.push(['TOTAL DO PERÍODO', '', '', '', '', '']);
    dados.push(['Total Entradas', totalEntradas, '', '', '', '']);
    dados.push(['Total Saídas', totalSaidas, '', '', '', '']);
    dados.push(['Saldo Final', saldoFinal, '', '', '', '']);
    dados.push(['Dias Analisados', totalDias, '', '', '', '']);
    
    // Criar workbook
    const ws = XLSX.utils.aoa_to_sheet(dados);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Relatório Caixa");
    
    // Gerar nome do arquivo
    const dataInicio = document.getElementById('relDataInicio').value || 'inicio';
    const dataFim = document.getElementById('relDataFim').value || 'fim';
    const filename = `relatorio_caixa_${dataInicio}_a_${dataFim}.xlsx`;
    
    // Baixar arquivo
    XLSX.writeFile(wb, filename);
    
    showToast('✅ Relatório exportado com sucesso!', 'success');
};

// ===== FUNÇÃO PARA IMPRIMIR RELATÓRIO DE CAIXA =====
window.imprimirRelatorioCaixa = function() {
    const printWindow = window.open('', '_blank');
    
    const hoje = new Date().toLocaleDateString('pt-BR');
    const dataInicio = document.getElementById('relDataInicio').value || '-';
    const dataFim = document.getElementById('relDataFim').value || '-';
    const totalEntradas = document.getElementById('relTotalEntradas').textContent;
    const totalSaidas = document.getElementById('relTotalSaidas').textContent;
    const saldoFinal = document.getElementById('relSaldoFinal').textContent;
    const totalDias = document.getElementById('relTotalDias').textContent;
    
    // Pegar dados da tabela
    const tbody = document.getElementById('relatorioCaixaTableBody');
    let tabelaHTML = '';
    
    tbody.querySelectorAll('tr').forEach(row => {
        tabelaHTML += '<tr>';
        row.querySelectorAll('td').forEach(cell => {
            tabelaHTML += `<td>${cell.textContent}</td>`;
        });
        tabelaHTML += '</tr>';
    });
    
    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Relatório de Caixa</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 20px; }
                h1 { color: #333; }
                .info { background: #f5f5f5; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                th { background: #28a745; color: white; padding: 10px; text-align: left; }
                td { padding: 8px; border-bottom: 1px solid #ddd; }
                .resumo { display: flex; justify-content: space-between; margin: 20px 0; }
                .resumo-item { text-align: center; }
                .resumo-valor { font-size: 24px; font-weight: bold; }
                .text-success { color: #28a745; }
                .text-danger { color: #dc3545; }
                @media print {
                    .no-print { display: none; }
                    body { margin: 0; }
                }
            </style>
        </head>
        <body>
            <h1>Relatório de Caixa</h1>
            <div class="info">
                <p><strong>Período:</strong> ${formatarDataBR(dataInicio)} a ${formatarDataBR(dataFim)}</p>
                <p><strong>Gerado em:</strong> ${hoje}</p>
                <p><strong>Gerado por:</strong> ${currentUser.name}</p>
            </div>
            
            <div class="resumo">
                <div class="resumo-item">
                    <div class="resumo-valor text-success">R$ ${totalEntradas}</div>
                    <div>Total Entradas</div>
                </div>
                <div class="resumo-item">
                    <div class="resumo-valor text-danger">R$ ${totalSaidas}</div>
                    <div>Total Saídas</div>
                </div>
                <div class="resumo-item">
                    <div class="resumo-valor" style="color: #8A2BE2;">R$ ${saldoFinal}</div>
                    <div>Saldo Final</div>
                </div>
                <div class="resumo-item">
                    <div class="resumo-valor" style="color: #17a2b8;">${totalDias}</div>
                    <div>Dias</div>
                </div>
            </div>
            
            <table>
                <thead>
                    <tr>
                        <th>Data</th>
                        <th>Entradas</th>
                        <th>Saídas</th>
                        <th>Saldo</th>
                        <th>Status</th>
                        <th>Usuário</th>
                    </tr>
                </thead>
                <tbody>
                    ${tabelaHTML}
                </tbody>
            </table>
            
            <div class="no-print" style="margin-top: 30px;">
                <button onclick="window.print()" style="padding: 10px 20px; background: #28a745; color: white; border: none; cursor: pointer;">
                    Imprimir
                </button>
                <button onclick="window.close()" style="padding: 10px 20px; background: #6c757d; color: white; border: none; cursor: pointer; margin-left: 10px;">
                    Fechar
                </button>
            </div>
            
            <script>
                window.onload = function() {
                    setTimeout(function() {
                        window.print();
                    }, 500);
                };
            </script>
        </body>
        </html>
    `);
    
    printWindow.document.close();
};

// ===== FUNÇÕES AUXILIARES =====
function formatarDataBR(dataString) {
    if (!dataString) return '-';
    const data = new Date(dataString);
    return data.toLocaleDateString('pt-BR');
}

function removerComprovante() {
    document.getElementById('comprovanteFile').value = '';
    document.getElementById('comprovantePreview').style.display = 'none';
}

// ===== CONFIGURAR EVENT LISTENERS PARA CAIXA =====
function setupCaixaEventListeners() {
    // Upload de comprovante
    const comprovanteFile = document.getElementById('comprovanteFile');
    if (comprovanteFile) {
        comprovanteFile.addEventListener('change', function(e) {
            if (this.files && this.files[0]) {
                const fileName = this.files[0].name;
                document.getElementById('comprovanteName').textContent = fileName;
                document.getElementById('comprovantePreview').style.display = 'block';
            }
        });
    }
    
    // Mudança no tipo de lançamento
    const tipoLancamento = document.getElementById('tipoLancamento');
    if (tipoLancamento) {
        tipoLancamento.addEventListener('change', function() {
            const comprovanteSection = document.getElementById('comprovanteSection');
            if (this.value === 'saida') {
                comprovanteSection.style.borderColor = '#dc3545';
                comprovanteSection.style.boxShadow = '0 0 0 3px rgba(220, 53, 69, 0.15)';
            } else {
                comprovanteSection.style.borderColor = '';
                comprovanteSection.style.boxShadow = '';
            }
        });
    }
    
    // Botão de upload de comprovante
    const addComprovanteBtn = document.getElementById('addComprovanteBtn');
    if (addComprovanteBtn) {
        addComprovanteBtn.addEventListener('click', function() {
            document.getElementById('comprovanteFile').click();
        });
    }
    
    // Configurar botão do header
    const caixaBtn = document.getElementById('caixaBtn');
    if (caixaBtn) {
        caixaBtn.addEventListener('click', function() {
            abrirSistemaCaixa();
        });
    }
}

// ===== INICIALIZAÇÃO DO SISTEMA DE CAIXA =====
document.addEventListener('DOMContentLoaded', function() {
    console.log('💰 Sistema de Caixa carregado');
    setupCaixaEventListeners();
});