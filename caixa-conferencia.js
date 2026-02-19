// ============================================
// SISTEMA DE CONFERÊNCIA DE CAIXA - VERSÃO 2.0
// ============================================

// ===== VARIÁVEIS GLOBAIS =====
let lancamentosCaixa = [];
let currentLancamentoFilter = 'todos';
let dataCaixaAtual = new Date().toISOString().split('T')[0];
let caixaData = null; // Dados do caixa do dia
let usuariosConferencia = [];

// ===== INICIALIZAÇÃO =====
document.addEventListener('DOMContentLoaded', function() {
    console.log('💰 Sistema de Caixa 2.0 carregado');
    setupCaixaEventListeners();
    carregarUsuarios();
});

// ===== FUNÇÃO PARA ABRIR SISTEMA DE CAIXA =====
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
        dataCaixaInput.max = new Date().toISOString().split('T')[0];
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

// ===== FUNÇÃO PARA CARREGAR USUÁRIOS DO SISTEMA =====
function carregarUsuarios() {
    // Usuários fixos do sistema
    usuariosConferencia = [
        { nome: 'Elaine', cargo: 'Operador' },
        { nome: 'Arthur', cargo: 'Operador' },
        { nome: 'Laura', cargo: 'Operador' },
        { nome: 'Ronald', cargo: 'Administrador' },
        { nome: 'Bruna', cargo: 'Operador' },
        { nome: 'Andressa', cargo: 'Operador' },
        { nome: 'Thalyta', cargo: 'Operador' }
    ];
}

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
        const { data: caixaDataResult, error: caixaError } = await supabaseClient
            .from('caixa')
            .select('*')
            .eq('data', dataCaixaAtual)
            .maybeSingle();
        
        if (caixaError) throw caixaError;
        
        caixaData = caixaDataResult;
        
        // Buscar lançamentos do dia
        const { data: lancamentosData, error: lancamentosError } = await supabaseClient
            .from('caixa_lancamentos')
            .select('*')
            .eq('data', dataCaixaAtual)
            .order('created_at', { ascending: true });
        
        if (lancamentosError) throw lancamentosError;
        
        lancamentosCaixa = lancamentosData || [];
        
        // Atualizar interface
        atualizarPainelCaixa();
        
        // Atualizar título
        const caixaDateTitle = document.getElementById('caixaDateTitle');
        if (caixaDateTitle) {
            const dataFormatada = formatarDataBR(dataCaixaAtual);
            caixaDateTitle.textContent = `Caixa Amor Saúde Colombo - ${dataFormatada}`;
        }
        
        showToast('✅ Caixa carregado com sucesso', 'success');
        
    } catch (error) {
        console.error('❌ Erro ao carregar caixa:', error);
        showToast('❌ Erro ao carregar caixa: ' + error.message, 'error');
        
        lancamentosCaixa = [];
        caixaData = null;
        atualizarPainelCaixa();
    }
};

// ===== FUNÇÃO PARA ATUALIZAR PAINEL COMPLETO =====
function atualizarPainelCaixa() {
    // Calcular totais do dia
    let totalEntradas = 0;
    let totalSaidas = 0;
    let totalEntradasComprovadas = 0;
    let totalSaidasComprovadas = 0;
    
    lancamentosCaixa.forEach(lancamento => {
        if (lancamento.tipo === 'entrada') {
            totalEntradas += parseFloat(lancamento.valor || 0);
            if (lancamento.comprovante_aprovado === true) {
                totalEntradasComprovadas += parseFloat(lancamento.valor || 0);
            }
        } else if (lancamento.tipo === 'saida') {
            totalSaidas += parseFloat(lancamento.valor || 0);
            if (lancamento.comprovante_aprovado === true) {
                totalSaidasComprovadas += parseFloat(lancamento.valor || 0);
            }
        }
    });
    
    const saldoCalculado = totalEntradas - totalSaidas;
    
    // Saldo do dia anterior (se houver)
    let saldoAnterior = 0;
    if (caixaData && caixaData.saldo_anterior !== undefined) {
        saldoAnterior = caixaData.saldo_anterior;
    }
    
    const saldoAcumulado = saldoAnterior + saldoCalculado;
    
    // Atualizar cards
    document.getElementById('saldoAnterior').textContent = formatarMoeda(saldoAnterior);
    document.getElementById('totalEntradas').textContent = formatarMoeda(totalEntradas);
    document.getElementById('totalSaidas').textContent = formatarMoeda(totalSaidas);
    document.getElementById('saldoCalculado').textContent = formatarMoeda(saldoCalculado);
    
    // Status dos cadeados
    atualizarCadeados();
    
    // Renderizar tabela
    renderTabelaCaixa();
}

// ===== FUNÇÃO PARA ATUALIZAR CADEADOS =====
function atualizarCadeados() {
    const isAdmin = currentUser.role === 'Administrador';
    
    // Cadeado 1 - Fechamento do dia (operador)
    const cadeado1 = document.getElementById('cadeado1');
    const cadeado1Icon = document.getElementById('cadeado1Icon');
    const cadeado1Status = document.getElementById('cadeado1Status');
    
    if (caixaData && caixaData.fechado_operador) {
        cadeado1Icon.className = 'fas fa-lock';
        cadeado1.style.backgroundColor = '#28a745';
        cadeado1Status.innerHTML = `
            <small>Fechado por: ${caixaData.fechado_por_operador || '-'}</small><br>
            <small>Valor real: ${formatarMoeda(caixaData.valor_real_operador || 0)}</small>
        `;
    } else {
        cadeado1Icon.className = 'fas fa-unlock';
        cadeado1.style.backgroundColor = '#ffc107';
        cadeado1Status.innerHTML = '<small>Aguardando fechamento do operador</small>';
    }
    
    // Cadeado 2 - Conferência administrativa
    const cadeado2 = document.getElementById('cadeado2');
    const cadeado2Icon = document.getElementById('cadeado2Icon');
    const cadeado2Status = document.getElementById('cadeado2Status');
    
    if (caixaData && caixaData.fechado_operador) {
        if (caixaData.conferido_admin) {
            cadeado2Icon.className = 'fas fa-lock';
            cadeado2.style.backgroundColor = '#28a745';
            cadeado2Status.innerHTML = `
                <small>Conferido por: ${caixaData.conferido_por_admin || '-'}</small><br>
                <small>Diferença: ${formatarMoeda(caixaData.diferenca || 0)}</small>
            `;
        } else {
            cadeado2Icon.className = 'fas fa-unlock';
            cadeado2.style.backgroundColor = isAdmin ? '#dc3545' : '#6c757d';
            cadeado2Status.innerHTML = isAdmin ? 
                '<small>Clique para conferir</small>' : 
                '<small>Aguardando conferência do admin</small>';
        }
    } else {
        cadeado2Icon.className = 'fas fa-lock';
        cadeado2.style.backgroundColor = '#6c757d';
        cadeado2.style.opacity = '0.5';
        cadeado2Status.innerHTML = '<small>Disponível após fechamento</small>';
    }
    
    // Mostrar/esconder botões baseado em permissões
    const fecharCaixaBtn = document.getElementById('fecharCaixaBtn');
    const conferirCaixaBtn = document.getElementById('conferirCaixaBtn');
    
    if (fecharCaixaBtn) {
        if (!caixaData || !caixaData.fechado_operador) {
            fecharCaixaBtn.classList.remove('hidden');
        } else {
            fecharCaixaBtn.classList.add('hidden');
        }
    }
    
    if (conferirCaixaBtn) {
        if (isAdmin && caixaData && caixaData.fechado_operador && !caixaData.conferido_admin) {
            conferirCaixaBtn.classList.remove('hidden');
        } else {
            conferirCaixaBtn.classList.add('hidden');
        }
    }
}

// ===== FUNÇÃO PARA RENDERIZAR TABELA =====
function renderTabelaCaixa() {
    const tbody = document.getElementById('tabelaCaixaBody');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    // Agrupar lançamentos por tipo
    const entradas = lancamentosCaixa.filter(l => l.tipo === 'entrada');
    const saidas = lancamentosCaixa.filter(l => l.tipo === 'saida');
    
    // Mostrar entradas
    entradas.forEach(lancamento => {
        const row = criarLinhaLancamento(lancamento, 'entrada');
        tbody.appendChild(row);
    });
    
    // Mostrar saídas
    saidas.forEach(lancamento => {
        const row = criarLinhaLancamento(lancamento, 'saida');
        tbody.appendChild(row);
    });
    
    // Se não houver lançamentos, mostrar mensagem
    if (lancamentosCaixa.length === 0) {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td colspan="8" class="text-center" style="padding: 40px;">
                <i class="fas fa-cash-register fa-3x" style="color: #6c757d; opacity: 0.5;"></i>
                <p style="color: #6c757d; margin-top: 10px;">Nenhum lançamento para esta data</p>
            </td>
        `;
        tbody.appendChild(row);
    }
}

// ===== FUNÇÃO PARA CRIAR LINHA DE LANÇAMENTO =====
function criarLinhaLancamento(lancamento, tipo) {
    const row = document.createElement('tr');
    
    // Ícone de comprovante para saídas
    let comprovanteIcon = '';
    if (tipo === 'saida') {
        if (lancamento.comprovante_aprovado === true) {
            comprovanteIcon = '<i class="fas fa-check-circle" style="color: #28a745;" title="Comprovante aprovado"></i>';
        } else if (lancamento.comprovante_aprovado === false) {
            comprovanteIcon = '<i class="fas fa-times-circle" style="color: #dc3545;" title="Comprovante rejeitado"></i>';
        } else if (lancamento.comprovante_url) {
            comprovanteIcon = '<i class="fas fa-question-circle" style="color: #ffc107;" title="Aguardando aprovação"></i>';
        } else {
            comprovanteIcon = '<i class="fas fa-exclamation-triangle" style="color: #dc3545;" title="Comprovante obrigatório não anexado!"></i>';
        }
    }
    
    // Ações
    let acoes = '';
    const isAdmin = currentUser.role === 'Administrador';
    const isCriador = lancamento.criado_por === currentUser.name;
    const podeEditar = !caixaData?.fechado_operador && (isAdmin || isCriador);
    
    if (podeEditar) {
        acoes = `
            <button class="btn btn-danger btn-sm" onclick="excluirLancamento(${lancamento.id})" title="Excluir">
                <i class="fas fa-trash"></i>
            </button>
        `;
    }
    
    // Se for admin e tiver comprovante pendente
    if (isAdmin && tipo === 'saida' && lancamento.comprovante_url && lancamento.comprovante_aprovado === null) {
        acoes += `
            <button class="btn btn-success btn-sm" onclick="aprovarComprovante(${lancamento.id})" title="Aprovar comprovante">
                <i class="fas fa-check"></i>
            </button>
            <button class="btn btn-danger btn-sm" onclick="rejeitarComprovante(${lancamento.id})" title="Rejeitar comprovante">
                <i class="fas fa-times"></i>
            </button>
        `;
    }
    
    // Ver comprovante
    if (lancamento.comprovante_url) {
        acoes += `
            <button class="btn btn-info btn-sm" onclick="verComprovante('${lancamento.comprovante_url}')" title="Ver comprovante">
                <i class="fas fa-eye"></i>
            </button>
        `;
    }
    
    const hora = new Date(lancamento.created_at);
    const horaFormatada = hora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    
    row.innerHTML = `
        <td>${formatarDataBR(lancamento.data)}</td>
        <td class="${tipo === 'entrada' ? 'text-success' : 'text-danger'}">
            ${tipo === 'entrada' ? '+' : '-'} ${formatarMoeda(lancamento.valor)}
        </td>
        <td>${lancamento.descricao}</td>
        <td class="text-center">${comprovanteIcon}</td>
        <td>${lancamento.criado_por}</td>
        <td>${horaFormatada}</td>
        <td>
            <div class="d-flex gap-2 justify-content-center">
                ${acoes}
            </div>
        </td>
    `;
    
    return row;
}

// ===== FUNÇÃO PARA SALVAR LANÇAMENTO =====
window.salvarLancamento = async function() {
    const tipoLancamento = document.getElementById('tipoLancamento').value;
    const valorLancamento = parseFloat(document.getElementById('valorLancamento').value);
    const descricaoLancamento = document.getElementById('descricaoLancamento').value.trim();
    
    // Validações
    if (!tipoLancamento || !valorLancamento || valorLancamento <= 0 || !descricaoLancamento) {
        showToast('Preencha todos os campos obrigatórios!', 'warning');
        return;
    }
    
    // SAÍDA: comprovante obrigatório
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
        if (tipoLancamento === 'saida') {
            const comprovanteFile = document.getElementById('comprovanteFile');
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
            // Buscar saldo do dia anterior
            const dataAnterior = new Date(dataCaixaAtual);
            dataAnterior.setDate(dataAnterior.getDate() - 1);
            const dataAnteriorStr = dataAnterior.toISOString().split('T')[0];
            
            const { data: caixaAnterior } = await supabaseClient
                .from('caixa')
                .select('saldo_final')
                .eq('data', dataAnteriorStr)
                .maybeSingle();
            
            const saldoAnterior = caixaAnterior ? caixaAnterior.saldo_final : 0;
            
            const { error: criarCaixaError } = await supabaseClient
                .from('caixa')
                .insert([{
                    data: dataCaixaAtual,
                    saldo_anterior: saldoAnterior,
                    saldo_inicial: saldoAnterior,
                    saldo_final: 0,
                    total_entradas: 0,
                    total_saidas: 0,
                    fechado_operador: false
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
            comprovante_aprovado: tipoLancamento === 'saida' ? null : true,
            criado_por: currentUser.name,
            created_at: new Date().toISOString()
        };
        
        const { data, error } = await supabaseClient
            .from('caixa_lancamentos')
            .insert([lancamentoData])
            .select();
        
        if (error) throw error;
        
        // Atualizar lista local
        lancamentosCaixa.push(data[0]);
        
        // Atualizar totais no caixa
        await atualizarTotaisCaixa();
        
        // Limpar formulário
        limparFormLancamento();
        
        // Atualizar interface
        atualizarPainelCaixa();
        
        showToast('✅ Lançamento salvo com sucesso!', 'success');
        
    } catch (error) {
        console.error('❌ Erro ao salvar lançamento:', error);
        showToast('❌ Erro ao salvar lançamento: ' + error.message, 'error');
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
};

// ===== FUNÇÃO PARA ATUALIZAR TOTAIS DO CAIXA =====
async function atualizarTotaisCaixa() {
    try {
        let totalEntradas = 0;
        let totalSaidas = 0;
        
        lancamentosCaixa.forEach(lancamento => {
            if (lancamento.tipo === 'entrada') {
                totalEntradas += parseFloat(lancamento.valor || 0);
            } else {
                totalSaidas += parseFloat(lancamento.valor || 0);
            }
        });
        
        const saldoCalculado = totalEntradas - totalSaidas;
        
        // Buscar saldo anterior
        const dataAnterior = new Date(dataCaixaAtual);
        dataAnterior.setDate(dataAnterior.getDate() - 1);
        const dataAnteriorStr = dataAnterior.toISOString().split('T')[0];
        
        const { data: caixaAnterior } = await supabaseClient
            .from('caixa')
            .select('saldo_final')
            .eq('data', dataAnteriorStr)
            .maybeSingle();
        
        const saldoAnterior = caixaAnterior ? caixaAnterior.saldo_final : 0;
        const saldoAcumulado = saldoAnterior + saldoCalculado;
        
        // Atualizar caixa
        const { error } = await supabaseClient
            .from('caixa')
            .update({
                total_entradas: totalEntradas,
                total_saidas: totalSaidas,
                saldo_final: saldoAcumulado,
                updated_at: new Date().toISOString()
            })
            .eq('data', dataCaixaAtual);
        
        if (error) throw error;
        
        // Recarregar caixaData
        const { data } = await supabaseClient
            .from('caixa')
            .select('*')
            .eq('data', dataCaixaAtual)
            .single();
        
        caixaData = data;
        
    } catch (error) {
        console.error('Erro ao atualizar totais:', error);
    }
}

// ===== FUNÇÃO PARA FECHAR CAIXA (CADEADO 1 - OPERADOR) =====
window.fecharCaixaOperador = async function() {
    if (!caixaData) {
        showToast('Caixa não encontrado', 'error');
        return;
    }
    
    // Perguntar valor real do caixa
    const valorReal = prompt(
        '💰 FECHAMENTO DO CAIXA\n\n' +
        'Digite o valor REAL que está no caixa físico:',
        '0,00'
    );
    
    if (valorReal === null) return;
    
    const valorRealNum = parseFloat(valorReal.replace(',', '.'));
    if (isNaN(valorRealNum)) {
        showToast('Valor inválido', 'error');
        return;
    }
    
    if (!confirm('Confirmar fechamento do caixa? Após fechar, não será possível adicionar novos lançamentos.')) {
        return;
    }
    
    try {
        const { error } = await supabaseClient
            .from('caixa')
            .update({
                fechado_operador: true,
                fechado_por_operador: currentUser.name,
                data_fechamento_operador: new Date().toISOString(),
                valor_real_operador: valorRealNum
            })
            .eq('data', dataCaixaAtual);
        
        if (error) throw error;
        
        caixaData.fechado_operador = true;
        caixaData.fechado_por_operador = currentUser.name;
        caixaData.valor_real_operador = valorRealNum;
        
        atualizarCadeados();
        showToast('🔒 Caixa fechado com sucesso!', 'success');
        
    } catch (error) {
        console.error('❌ Erro ao fechar caixa:', error);
        showToast('❌ Erro ao fechar caixa: ' + error.message, 'error');
    }
};

// ===== FUNÇÃO PARA CONFERIR CAIXA (CADEADO 2 - ADMIN) =====
window.conferirCaixaAdmin = async function() {
    if (!caixaData || !caixaData.fechado_operador) {
        showToast('Operador ainda não fechou o caixa', 'warning');
        return;
    }
    
    if (caixaData.conferido_admin) {
        showToast('Caixa já foi conferido', 'info');
        return;
    }
    
    // Calcular saldo esperado
    let totalEntradas = 0;
    let totalSaidas = 0;
    
    lancamentosCaixa.forEach(lancamento => {
        if (lancamento.tipo === 'entrada') {
            totalEntradas += parseFloat(lancamento.valor || 0);
        } else {
            totalSaidas += parseFloat(lancamento.valor || 0);
        }
    });
    
    const saldoEsperado = totalEntradas - totalSaidas;
    const diferenca = caixaData.valor_real_operador - saldoEsperado;
    
    const mensagem = 
        '🔍 CONFERÊNCIA ADMINISTRATIVA\n\n' +
        `📊 Saldo esperado: ${formatarMoeda(saldoEsperado)}\n` +
        `💰 Valor real informado: ${formatarMoeda(caixaData.valor_real_operador)}\n` +
        `⚠️ Diferença: ${formatarMoeda(diferenca)}\n\n` +
        `Confirmar conferência?`;
    
    if (!confirm(mensagem)) return;
    
    try {
        const { error } = await supabaseClient
            .from('caixa')
            .update({
                conferido_admin: true,
                conferido_por_admin: currentUser.name,
                data_conferencia_admin: new Date().toISOString(),
                diferenca: diferenca
            })
            .eq('data', dataCaixaAtual);
        
        if (error) throw error;
        
        caixaData.conferido_admin = true;
        caixaData.conferido_por_admin = currentUser.name;
        caixaData.diferenca = diferenca;
        
        atualizarCadeados();
        showToast('✅ Caixa conferido com sucesso!', 'success');
        
    } catch (error) {
        console.error('❌ Erro ao conferir caixa:', error);
        showToast('❌ Erro ao conferir caixa: ' + error.message, 'error');
    }
};

// ===== FUNÇÕES AUXILIARES =====
function formatarMoeda(valor) {
    return 'R$ ' + parseFloat(valor || 0).toFixed(2).replace('.', ',');
}

function formatarDataBR(dataString) {
    if (!dataString) return '-';
    const data = new Date(dataString);
    return data.toLocaleDateString('pt-BR');
}

function limparFormLancamento() {
    document.getElementById('tipoLancamento').value = 'entrada';
    document.getElementById('valorLancamento').value = '';
    document.getElementById('descricaoLancamento').value = '';
    document.getElementById('comprovanteFile').value = '';
    document.getElementById('comprovantePreview').style.display = 'none';
    
    // Resetar validação visual
    const comprovanteSection = document.getElementById('comprovanteSection');
    if (comprovanteSection) {
        comprovanteSection.style.borderColor = '';
        comprovanteSection.style.boxShadow = '';
    }
}

function setupCaixaEventListeners() {
    // Upload de comprovante
    const comprovanteFile = document.getElementById('comprovanteFile');
    if (comprovanteFile) {
        comprovanteFile.addEventListener('change', function(e) {
            if (this.files && this.files[0]) {
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
    
    // Botão de upload
    const addComprovanteBtn = document.getElementById('addComprovanteBtn');
    if (addComprovanteBtn) {
        addComprovanteBtn.addEventListener('click', function() {
            document.getElementById('comprovanteFile').click();
        });
    }
}

// ===== EXPORTAR FUNÇÕES =====
window.fecharCaixaOperador = fecharCaixaOperador;
window.conferirCaixaAdmin = conferirCaixaAdmin;
window.carregarCaixaDia = carregarCaixaDia;