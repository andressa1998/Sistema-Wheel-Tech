// ============================================
// SISTEMA DE CONFERÊNCIA DE CAIXA - VERSÃO CORRIGIDA
// ============================================

// ===== FUNÇÕES AUXILIARES DE DATAS =====
function isWeekend(dateString) {
    const date = new Date(dateString + 'T12:00:00');
    const day = date.getDay();
    return day === 0 || day === 6; // 0 = Domingo, 6 = Sábado
}

function getPreviousBusinessDay(dateString) {
    const date = new Date(dateString + 'T12:00:00');
    do {
        date.setDate(date.getDate() - 1);
    } while (date.getDay() === 0 || date.getDay() === 6);
    return date.toISOString().split('T')[0];
}

// ===== VARIÁVEIS GLOBAIS =====
let lancamentosCaixa = [];
let currentLancamentoFilter = 'todos';
let dataCaixaAtual = new Date().toISOString().split('T')[0];
let caixaData = null;
let usuariosConferencia = [];

// ===== VARIÁVEIS PARA HISTÓRICO =====
let historicoDias = [];
let historicoPaginado = [];
let historicoPaginaAtual = 1;
const historicoItensPorPagina = 15;
let historicoFiltroPeriodo = 30;
let historicoFiltroStatus = 'todos';

// ===== VARIÁVEL PARA CONTROLE DE EDIÇÃO =====
let lancamentoEditando = null;

// ===== INICIALIZAÇÃO =====
document.addEventListener('DOMContentLoaded', function() {
    console.log('💰 Sistema de Caixa 2.0 carregado');
    setupCaixaEventListeners();
    carregarUsuarios();
    criarBotaoReabrir(); // Cria o botão de reabrir se não existir
});

// ===== FUNÇÃO PARA CRIAR BOTÃO REABRIR (ADMIN) =====
function criarBotaoReabrir() {
    const fecharBtn = document.getElementById('fecharCaixaBtn');
    if (!fecharBtn) return;
    
    const container = fecharBtn.parentNode;
    let btn = document.getElementById('reabrirCaixaBtn');
    if (!btn) {
        btn = document.createElement('button');
        btn.id = 'reabrirCaixaBtn';
        btn.className = 'btn btn-warning';
        btn.innerHTML = '<i class="fas fa-unlock-alt"></i> Reabrir Caixa';
        btn.onclick = reabrirCaixaAdmin;
        container.appendChild(btn);
    }
}

// ===== FUNÇÃO PARA ABRIR SISTEMA DE CAIXA =====
window.abrirSistemaCaixa = function() {
    if (!currentUser) {
        showToast('⚠️ Faça login primeiro', 'warning');
        return;
    }

    const menuSystem = document.getElementById('menuSystem');
    if (menuSystem) menuSystem.classList.add('hidden');
    
    // Verifica se hoje é final de semana
    const todayStr = new Date().toISOString().split('T')[0];
    if (isWeekend(todayStr)) {
        showToast('⚠️ O sistema de caixa não está disponível nos finais de semana.', 'warning');
        return;
    }
    
    console.log('💰 Iniciando sistema de conferência de caixa...');
    
    // Esconder outros sistemas
    if (mainSystem) mainSystem.classList.add('hidden');
    if (reembolsosSystem) reembolsosSystem.classList.add('hidden');
    if (salesSystem) salesSystem.classList.add('hidden');
    if (caixaSystem) caixaSystem.classList.add('hidden');
    if (folgasSystem) folgasSystem.classList.add('hidden');
    if (shippingSystem) shippingSystem.classList.add('hidden');
    if (estoqueSystem) estoqueSystem.classList.add('hidden');
    if (perguntasSystem) perguntasSystem.classList.add('hidden');
    if (estoqueGestaoSystem) estoqueGestaoSystem.classList.add('hidden');
    if (entradasSystem) entradasSystem.classList.add('hidden');
    if (promocoesSystem) promocoesSystem.classList.add('hidden');
    
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
    dataCaixaAtual = new Date().toISOString().split('T')[0];
    
    const dataCaixaInput = document.getElementById('dataCaixa');
    if (dataCaixaInput) {
        dataCaixaInput.value = dataCaixaAtual;
        dataCaixaInput.max = new Date().toISOString().split('T')[0];
        // Impede seleção de finais de semana
        dataCaixaInput.addEventListener('change', function() {
            if (isWeekend(this.value)) {
                showToast('⚠️ Finais de semana não são permitidos. Selecione um dia útil.', 'warning');
                this.value = dataCaixaAtual;
            }
        });
    }
    
    // Atualizar título
    const caixaDateTitle = document.getElementById('caixaDateTitle');
    if (caixaDateTitle) {
        const [ano, mes, dia] = dataCaixaAtual.split('-');
        caixaDateTitle.textContent = `Caixa Wheel Tech - ${dia}/${mes}/${ano}`;
    }
    
    // Carregar dados do caixa
    carregarCaixaDia();
    
    // Carregar histórico
    carregarHistoricoDias();
    
    showToast('💰 Sistema de Conferência de Caixa carregado', 'info');
};

// ===== FUNÇÃO PARA CARREGAR USUÁRIOS =====
function carregarUsuarios() {
    usuariosConferencia = [
        { nome: 'Elaine', cargo: 'Operador' },
        { nome: 'Arthur', cargo: 'Operador' },
        { nome: 'Laura', cargo: 'Operador' },
        { nome: 'Ronald', cargo: 'Administrador' },
        { nome: 'Bruna', cargo: 'Operador' },
        { nome: 'Andressa', cargo: 'Operador' },
        { nome: 'Thalyta', cargo: 'Operador' }
    ];
    
    // Popular select de usuários no relatório
    const selectUsuario = document.getElementById('relUsuario');
    if (selectUsuario) {
        selectUsuario.innerHTML = '<option value="">Todos os usuários</option>';
        usuariosConferencia.forEach(user => {
            selectUsuario.innerHTML += `<option value="${user.nome}">${user.nome}</option>`;
        });
    }
}

// ===== FUNÇÃO CORRIGIDA PARA CARREGAR CAIXA DO DIA =====
window.carregarCaixaDia = async function() {
    try {
        const dataCaixaInput = document.getElementById('dataCaixa');
        if (dataCaixaInput) {
            dataCaixaAtual = dataCaixaInput.value;
        }
        
        // Bloqueia acesso em finais de semana
        if (isWeekend(dataCaixaAtual)) {
            showToast('⚠️ Não é possível acessar caixa em finais de semana.', 'warning');
            return;
        }
        
        showToast('🔄 Carregando lançamentos do dia...', 'info');
        
        if (!supabaseClient) {
            throw new Error('Supabase não conectado');
        }
        
        // PASSO 1: Buscar o saldo do último dia útil anterior
        const dataAnteriorStr = getPreviousBusinessDay(dataCaixaAtual);
        
        console.log('📅 Data atual:', dataCaixaAtual);
        console.log('📅 Data útil anterior:', dataAnteriorStr);
        
        // Buscar caixa do dia útil anterior para pegar o saldo final
        const { data: caixaAnterior, error: errorAnterior } = await supabaseClient
            .from('caixa')
            .select('saldo_final')
            .eq('data', dataAnteriorStr)
            .maybeSingle();
        
        if (errorAnterior) {
            console.error('Erro ao buscar caixa anterior:', errorAnterior);
        }
        
        const saldoAnteriorValor = caixaAnterior?.saldo_final || 0;
        console.log('💰 Saldo anterior (do dia útil anterior):', saldoAnteriorValor);
        
        // PASSO 2: Buscar OU criar caixa do dia atual
        const { data: caixaDataResult, error: caixaError } = await supabaseClient
            .from('caixa')
            .select('*')
            .eq('data', dataCaixaAtual)
            .maybeSingle();
        
        if (caixaError) throw caixaError;
        
        // Se não existe caixa para hoje, criar com o saldo do último dia útil
        if (!caixaDataResult) {
            console.log('📝 Criando novo caixa para hoje com saldo anterior:', saldoAnteriorValor);
            
            const { data: novoCaixa, error: createError } = await supabaseClient
                .from('caixa')
                .insert([{
                    data: dataCaixaAtual,
                    saldo_anterior: saldoAnteriorValor,
                    total_entradas: 0,
                    total_saidas: 0,
                    saldo_final: saldoAnteriorValor,
                    fechado_operador: false,
                    conferido_admin: false,
                    created_at: new Date().toISOString()
                }])
                .select()
                .single();
            
            if (createError) throw createError;
            caixaData = novoCaixa;
        } else {
            caixaData = caixaDataResult;
            
            // Se o caixa já existe mas o saldo_anterior está errado, corrigir (apenas se não estiver fechado)
            if (caixaData.saldo_anterior !== saldoAnteriorValor && !caixaData.fechado_operador) {
                console.log('🔄 Corrigindo saldo anterior do caixa:', caixaData.saldo_anterior, '->', saldoAnteriorValor);
                
                const { error: updateError } = await supabaseClient
                    .from('caixa')
                    .update({ saldo_anterior: saldoAnteriorValor })
                    .eq('data', dataCaixaAtual);
                
                if (!updateError) {
                    caixaData.saldo_anterior = saldoAnteriorValor;
                }
            }
        }
        
        // PASSO 3: Buscar lançamentos do dia
        const { data: lancamentosData, error: lancamentosError } = await supabaseClient
            .from('caixa_lancamentos')
            .select('*')
            .eq('data', dataCaixaAtual)
            .order('created_at', { ascending: true });
        
        if (lancamentosError) throw lancamentosError;
        
        lancamentosCaixa = lancamentosData || [];
        
        // PASSO 4: Atualizar título
        const caixaDateTitle = document.getElementById('caixaDateTitle');
        if (caixaDateTitle) {
            const [ano, mes, dia] = dataCaixaAtual.split('-');
            caixaDateTitle.textContent = `Caixa Wheel Tech - ${dia}/${mes}/${ano}`;
        }
        
        // PASSO 5: Atualizar interface
        atualizarPainelCaixa();
        renderLancamentosTable();
        
        showToast('✅ Caixa carregado com sucesso', 'success');
        
    } catch (error) {
        console.error('❌ Erro ao carregar caixa:', error);
        showToast('❌ Erro ao carregar caixa: ' + error.message, 'error');
        
        lancamentosCaixa = [];
        caixaData = null;
        atualizarPainelCaixa();
        renderLancamentosTable();
    }
};

// ===== FUNÇÃO PARA ATUALIZAR PAINEL DO CAIXA =====
function atualizarPainelCaixa() {
    // Calcular totais
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
    const saldoAnterior = caixaData?.saldo_anterior || 0;
    
    // Atualizar cards
    document.getElementById('saldoAnterior').textContent = formatarMoeda(saldoAnterior);
    document.getElementById('totalEntradas').textContent = formatarMoeda(totalEntradas);
    document.getElementById('totalSaidas').textContent = formatarMoeda(totalSaidas);
    document.getElementById('saldoCalculado').textContent = formatarMoeda(saldoCalculado);
    
    // Atualizar diferença
    const diferenca = caixaData?.diferenca || 0;
    const diferencaElement = document.getElementById('diferenca');
    if (diferencaElement) {
        if (caixaData?.tem_divergencia || Math.abs(diferenca) > 0.01) {
            diferencaElement.innerHTML = `⚠️ ${formatarMoeda(diferenca)}`;
            diferencaElement.style.color = '#dc3545';
            diferencaElement.style.fontWeight = 'bold';
        } else {
            diferencaElement.textContent = formatarMoeda(diferenca);
            diferencaElement.style.color = diferenca >= 0 ? '#28a745' : '#dc3545';
        }
    }
    
    // Atualizar cadeados
    atualizarCadeados();
    
    // Atualizar contadores
    document.getElementById('countEntradas').textContent = lancamentosCaixa.filter(l => l.tipo === 'entrada').length;
    document.getElementById('countSaidas').textContent = lancamentosCaixa.filter(l => l.tipo === 'saida').length;
    document.getElementById('countLancamentos').textContent = lancamentosCaixa.length;
}

// ===== FUNÇÃO PARA ATUALIZAR CADEADOS =====
function atualizarCadeados() {
    const isAdmin = currentUser?.role === 'Administrador';
    const reabrirBtn = document.getElementById('reabrirCaixaBtn');
    
    // Cadeado 1 - Operador
    const cadeado1 = document.getElementById('cadeado1');
    const cadeado1Icon = document.getElementById('cadeado1Icon');
    const cadeado1Status = document.getElementById('cadeado1Status');
    
    if (caixaData?.fechado_operador) {
        cadeado1Icon.innerHTML = '<i class="fas fa-lock" style="color: #28a745;"></i>';
        cadeado1Status.innerHTML = `<small>Fechado por: ${caixaData.fechado_por_operador || '-'}</small>`;
        cadeado1.style.backgroundColor = '#d4edda';
        cadeado1.style.cursor = 'default';
    } else if (caixaData?.tem_divergencia) {
        cadeado1Icon.innerHTML = '<i class="fas fa-exclamation-triangle" style="color: #dc3545;"></i>';
        cadeado1Status.innerHTML = '<small>⚠️ Divergente</small>';
        cadeado1.style.backgroundColor = '#f8d7da';
        cadeado1.style.cursor = 'pointer';
    } else {
        cadeado1Icon.innerHTML = '<i class="fas fa-unlock-alt" style="color: #ffc107;"></i>';
        cadeado1Status.innerHTML = '<small>Aguardando fechamento</small>';
        cadeado1.style.backgroundColor = '#fff3cd';
        cadeado1.style.cursor = 'pointer';
    }
    
    // Cadeado 2 - Admin
    const cadeado2 = document.getElementById('cadeado2');
    const cadeado2Icon = document.getElementById('cadeado2Icon');
    const cadeado2Status = document.getElementById('cadeado2Status');
    
    if (caixaData?.conferido_admin) {
        cadeado2Icon.innerHTML = '<i class="fas fa-lock" style="color: #8A2BE2;"></i>';
        cadeado2Status.innerHTML = `<small>Conferido por: ${caixaData.conferido_por_admin || '-'}</small>`;
        cadeado2.style.backgroundColor = '#e2d5f1';
        cadeado2.style.cursor = 'default';
    } else if (caixaData?.fechado_operador) {
        cadeado2Icon.innerHTML = '<i class="fas fa-unlock-alt" style="color: #6c757d;"></i>';
        cadeado2Status.innerHTML = isAdmin ? '<small>Clique para conferir</small>' : '<small>Aguardando admin</small>';
        cadeado2.style.backgroundColor = '#f5e6ff';
        cadeado2.style.cursor = isAdmin ? 'pointer' : 'default';
    } else {
        cadeado2Icon.innerHTML = '<i class="fas fa-lock" style="color: #6c757d; opacity: 0.5;"></i>';
        cadeado2Status.innerHTML = '<small>Operador não fechou</small>';
        cadeado2.style.backgroundColor = '#e9ecef';
        cadeado2.style.cursor = 'default';
    }
    
    // Botões de ação
    const fecharCaixaBtn = document.getElementById('fecharCaixaBtn');
    const conferirCaixaBtn = document.getElementById('conferirCaixaBtn');
    
    if (fecharCaixaBtn) {
        fecharCaixaBtn.style.display = caixaData?.fechado_operador ? 'none' : 'flex';
    }
    
    if (conferirCaixaBtn) {
        conferirCaixaBtn.style.display = (isAdmin && caixaData?.fechado_operador && !caixaData?.conferido_admin) ? 'flex' : 'none';
    }
    
    // Botão Reabrir (visível apenas para admin quando caixa está fechado)
    if (reabrirBtn) {
        reabrirBtn.style.display = (isAdmin && caixaData?.fechado_operador) ? 'inline-flex' : 'none';
    }
}

// ===== FUNÇÃO PARA REABRIR CAIXA (ADMIN) =====
window.reabrirCaixaAdmin = async function() {
    if (!caixaData?.fechado_operador) {
        showToast('Caixa não está fechado', 'warning');
        return;
    }
    
    const isAdmin = currentUser?.role === 'Administrador';
    if (!isAdmin) {
        showToast('Apenas administradores podem reabrir caixa', 'error');
        return;
    }
    
    if (!confirm('⚠️ Atenção! Reabrir o caixa permitirá edições. Tem certeza?')) return;
    
    const btn = document.getElementById('reabrirCaixaBtn');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<span class="spinner"></span> Reabrindo...';
    btn.disabled = true;
    
    try {
        const { error } = await supabaseClient
            .from('caixa')
            .update({
                fechado_operador: false,
                fechado_por_operador: null,
                data_fechamento_operador: null,
                valor_real_operador: null,
                conferido_admin: false,
                conferido_por_admin: null,
                data_conferencia_admin: null,
                tem_divergencia: false,
                diferenca: 0
            })
            .eq('data', dataCaixaAtual);
        
        if (error) throw error;
        
        // Atualizar localmente
        caixaData.fechado_operador = false;
        caixaData.fechado_por_operador = null;
        caixaData.data_fechamento_operador = null;
        caixaData.valor_real_operador = null;
        caixaData.conferido_admin = false;
        caixaData.conferido_por_admin = null;
        caixaData.data_conferencia_admin = null;
        caixaData.tem_divergencia = false;
        caixaData.diferenca = 0;
        
        // Recarregar dados para garantir consistência
        await carregarCaixaDia();
        
        showToast('🔓 Caixa reaberto com sucesso!', 'success');
        
    } catch (error) {
        console.error('❌ Erro ao reabrir caixa:', error);
        showToast('❌ Erro ao reabrir caixa: ' + error.message, 'error');
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
};

// ===== FUNÇÃO PARA RENDERIZAR TABELA DE LANÇAMENTOS =====
function renderLancamentosTable() {
    const tbody = document.getElementById('tabelaCaixaBody');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    if (lancamentosCaixa.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="text-center p-5">
                    <i class="fas fa-cash-register fa-3x mb-3" style="color: #6c757d; opacity: 0.5;"></i>
                    <h4 style="color: #6c757d;">Nenhum lançamento encontrado</h4>
                    <p style="color: #6c757d;">Clique em "Salvar Lançamento" para começar.</p>
                </td>
            </tr>
        `;
        return;
    }
    
    // Filtrar por tipo
    let filteredLancamentos = lancamentosCaixa;
    if (currentLancamentoFilter !== 'todos') {
        filteredLancamentos = lancamentosCaixa.filter(l => l.tipo === currentLancamentoFilter);
    }
    
    filteredLancamentos.forEach(lancamento => {
        const row = criarLinhaLancamento(lancamento);
        tbody.appendChild(row);
    });
}

// ===== FUNÇÃO PARA CRIAR LINHA DE LANÇAMENTO =====
function criarLinhaLancamento(lancamento) {
    const row = document.createElement('tr');
    const isAdmin = currentUser?.role === 'Administrador';
    const isCriador = lancamento.criado_por === currentUser?.name;
    const podeEditar = !caixaData?.fechado_operador && (isAdmin || isCriador);
    const comprovanteRejeitado = lancamento.comprovante_aprovado === false;
    
    // Se o comprovante foi rejeitado, destacar a linha
    if (comprovanteRejeitado) {
        row.style.backgroundColor = '#fff3cd';
    }
    
    // Ícone do comprovante
    let comprovanteIcon = '';
    if (lancamento.tipo === 'saida') {
        if (lancamento.comprovante_aprovado === true) {
            comprovanteIcon = '<i class="fas fa-check-circle" style="color: #28a745;" title="Comprovante aprovado"></i>';
        } else if (lancamento.comprovante_aprovado === false) {
            comprovanteIcon = '<i class="fas fa-exclamation-triangle" style="color: #dc3545;" title="Comprovante rejeitado - Clique em editar para corrigir"></i>';
        } else if (lancamento.comprovante_url) {
            comprovanteIcon = '<i class="fas fa-question-circle" style="color: #ffc107;" title="Aguardando aprovação"></i>';
        } else {
            comprovanteIcon = '<i class="fas fa-exclamation-triangle" style="color: #dc3545;" title="Comprovante obrigatório!"></i>';
        }
    }
    
    // Ações
    let acoes = '';
    if (podeEditar) {
        // Se o comprovante foi rejeitado, mostrar botão de editar em destaque
        if (comprovanteRejeitado) {
            acoes += `
                <button class="btn btn-sm btn-warning" onclick="editarLancamento(${lancamento.id})" title="Editar (Comprovante rejeitado)">
                    <i class="fas fa-edit"></i> Corrigir
                </button>
            `;
        } else {
            acoes += `
                <button class="btn btn-sm btn-primary" onclick="editarLancamento(${lancamento.id})" title="Editar">
                    <i class="fas fa-edit"></i>
                </button>
            `;
        }
        
        acoes += `
            <button class="btn btn-sm btn-danger" onclick="excluirLancamento(${lancamento.id})" title="Excluir">
                <i class="fas fa-trash"></i>
            </button>
        `;
    }
    
    if (isAdmin && lancamento.tipo === 'saida' && lancamento.comprovante_url && lancamento.comprovante_aprovado === null) {
        acoes += `
            <button class="btn btn-sm btn-success" onclick="aprovarComprovante(${lancamento.id})" title="Aprovar">
                <i class="fas fa-check"></i>
            </button>
            <button class="btn btn-sm btn-danger" onclick="rejeitarComprovante(${lancamento.id})" title="Rejeitar">
                <i class="fas fa-times"></i>
            </button>
        `;
    }
    
    if (lancamento.comprovante_url) {
        acoes += `
            <button class="btn btn-sm btn-info" onclick="verComprovante('${lancamento.comprovante_url.replace(/'/g, "\\'")}')" title="Ver">
                <i class="fas fa-eye"></i>
            </button>
        `;
    }
    
    const data = new Date(lancamento.created_at);
    const horaFormatada = data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const [ano, mes, dia] = lancamento.data.split('-');
    const dataFormatada = `${dia}/${mes}/${ano}`;
    
    // Adicionar badge de rejeitado se necessário
    const statusBadge = comprovanteRejeitado ? 
        '<span class="badge bg-danger" style="font-size: 0.7rem; margin-left: 5px;">Rejeitado</span>' : '';
    
    row.innerHTML = `
        <td>${dataFormatada}</td>
        <td class="${lancamento.tipo === 'entrada' ? 'text-success' : 'text-danger'}">
            ${lancamento.tipo === 'entrada' ? '+' : '-'} ${formatarMoeda(lancamento.valor)}
        </td>
        <td>${lancamento.descricao} ${statusBadge}</td>
        <td style="text-align: center;">${comprovanteIcon}</td>
        <td>${lancamento.criado_por}</td>
        <td>${horaFormatada}</td>
        <td style="text-align: center;">
            <div class="d-flex gap-1 justify-content-center">
                ${acoes}
            </div>
        </td>
    `;
    
    return row;
}

// ===== FUNÇÃO PARA EDITAR LANÇAMENTO =====
window.editarLancamento = function(id) {
    const lancamento = lancamentosCaixa.find(l => l.id === id);
    if (!lancamento) return;
    
    // Verificar se pode editar
    if (caixaData?.fechado_operador) {
        showToast('❌ Caixa já está fechado, não é possível editar', 'error');
        return;
    }
    
    const isAdmin = currentUser?.role === 'Administrador';
    const isCriador = lancamento.criado_por === currentUser?.name;
    
    if (!isAdmin && !isCriador) {
        showToast('❌ Você só pode editar seus próprios lançamentos', 'error');
        return;
    }
    
    // Preencher formulário com dados do lançamento
    lancamentoEditando = lancamento;
    
    document.getElementById('tipoLancamento').value = lancamento.tipo;
    document.getElementById('valorLancamento').value = lancamento.valor;
    document.getElementById('descricaoLancamento').value = lancamento.descricao;
    
    // Mostrar seção de comprovante
    const comprovanteSection = document.getElementById('comprovanteSection');
    comprovanteSection.style.display = 'block';
    
    // Atualizar mensagem baseada no tipo
    const comprovanteMsg = document.getElementById('comprovanteMessage');
    if (lancamento.tipo === 'saida') {
        comprovanteMsg.innerHTML = '⚠️ Para saídas, faça upload de um novo comprovante se necessário';
        document.getElementById('tipoLancamento').disabled = true;
    } else {
        comprovanteMsg.innerHTML = 'Entradas não precisam de comprovante.';
        document.getElementById('tipoLancamento').disabled = false;
    }
    
    // Mudar texto do botão
    const btn = document.getElementById('salvarLancamentoBtn');
    btn.innerHTML = '<i class="fas fa-save"></i> Atualizar Lançamento';
    btn.onclick = function() { atualizarLancamento(); };
    
    // Adicionar botão de cancelar
    let cancelBtn = document.getElementById('cancelarEdicaoBtn');
    if (!cancelBtn) {
        cancelBtn = document.createElement('button');
        cancelBtn.id = 'cancelarEdicaoBtn';
        cancelBtn.className = 'btn btn-secondary';
        cancelBtn.innerHTML = '<i class="fas fa-times"></i> Cancelar';
        cancelBtn.onclick = cancelarEdicao;
        btn.parentNode.insertBefore(cancelBtn, btn.nextSibling);
    }
    
    showToast('✏️ Editando lançamento...', 'info');
    
    // Rolar para o formulário
    document.querySelector('.form-card').scrollIntoView({ behavior: 'smooth' });
};

// ===== FUNÇÃO PARA ATUALIZAR LANÇAMENTO =====
window.atualizarLancamento = async function() {
    if (!lancamentoEditando) return;
    
    const tipoLancamento = document.getElementById('tipoLancamento').value;
    const valorLancamento = parseFloat(document.getElementById('valorLancamento').value);
    const descricaoLancamento = document.getElementById('descricaoLancamento').value.trim();
    const comprovanteFile = document.getElementById('comprovanteFile').files[0];
    
    if (!tipoLancamento || !valorLancamento || valorLancamento <= 0 || !descricaoLancamento) {
        showToast('Preencha todos os campos obrigatórios!', 'warning');
        return;
    }
    
    const btn = document.getElementById('salvarLancamentoBtn');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<span class="spinner"></span> Atualizando...';
    btn.disabled = true;
    
    try {
        let comprovanteUrl = lancamentoEditando.comprovante_url;
        
        // Se novo comprovante foi enviado
        if (comprovanteFile) {
            comprovanteUrl = await uploadComprovante(comprovanteFile);
        }
        
        // Se é uma saída e não tem comprovante
        if (tipoLancamento === 'saida' && !comprovanteUrl) {
            showToast('Para saídas, é obrigatório ter um comprovante!', 'warning');
            btn.innerHTML = originalText;
            btn.disabled = false;
            return;
        }
        
        // Atualizar no banco
        const { error } = await supabaseClient
            .from('caixa_lancamentos')
            .update({
                tipo: tipoLancamento,
                valor: valorLancamento,
                descricao: descricaoLancamento,
                comprovante_url: comprovanteUrl,
                comprovante_aprovado: tipoLancamento === 'saida' ? null : true, // Resetar aprovação se for saída
                editado_por: currentUser.name,
                editado_em: new Date().toISOString()
            })
            .eq('id', lancamentoEditando.id);
        
        if (error) throw error;
        
        // Atualizar no array local
        const index = lancamentosCaixa.findIndex(l => l.id === lancamentoEditando.id);
        if (index !== -1) {
            lancamentosCaixa[index] = {
                ...lancamentosCaixa[index],
                tipo: tipoLancamento,
                valor: valorLancamento,
                descricao: descricaoLancamento,
                comprovante_url: comprovanteUrl,
                comprovante_aprovado: tipoLancamento === 'saida' ? null : true,
                editado_por: currentUser.name,
                editado_em: new Date().toISOString()
            };
        }
        
        await atualizarTotaisCaixa();
        cancelarEdicao();
        atualizarPainelCaixa();
        renderLancamentosTable();
        
        showToast('✅ Lançamento atualizado!', 'success');
        
    } catch (error) {
        console.error('❌ Erro:', error);
        showToast('❌ Erro: ' + error.message, 'error');
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
};

// ===== FUNÇÃO PARA CANCELAR EDIÇÃO =====
window.cancelarEdicao = function() {
    lancamentoEditando = null;
    limparFormLancamento();
    
    document.getElementById('tipoLancamento').disabled = false;
    
    // Remover botão de cancelar
    const cancelBtn = document.getElementById('cancelarEdicaoBtn');
    if (cancelBtn) cancelBtn.remove();
    
    // Restaurar botão original
    const btn = document.getElementById('salvarLancamentoBtn');
    btn.innerHTML = '<i class="fas fa-save"></i> Salvar Lançamento';
    btn.onclick = salvarLancamento;
};

// ===== FUNÇÃO CORRIGIDA PARA VER COMPROVANTE =====
window.verComprovante = function(url) {
    console.log('📎 Tentando abrir comprovante:', url);
    
    if (!url) {
        showToast('❌ Nenhum comprovante encontrado', 'error');
        return;
    }
    
    try {
        // Se for data URL (base64)
        if (url.startsWith('data:')) {
            // Verificar se é imagem
            if (url.startsWith('data:image/')) {
                // Abrir em nova aba
                const win = window.open('', '_blank');
                if (win) {
                    win.document.write(`
                        <!DOCTYPE html>
                        <html>
                        <head>
                            <title>Comprovante</title>
                            <style>
                                body { 
                                    margin: 0; 
                                    display: flex; 
                                    justify-content: center; 
                                    align-items: center; 
                                    min-height: 100vh; 
                                    background: #f5f5f5;
                                    font-family: Arial, sans-serif;
                                }
                                .container {
                                    text-align: center;
                                    padding: 20px;
                                }
                                img { 
                                    max-width: 90vw; 
                                    max-height: 90vh; 
                                    object-fit: contain; 
                                    box-shadow: 0 0 20px rgba(0,0,0,0.2);
                                    border-radius: 8px;
                                }
                                .btn {
                                    display: inline-block;
                                    margin-top: 20px;
                                    padding: 10px 20px;
                                    background: #dc3545;
                                    color: white;
                                    text-decoration: none;
                                    border-radius: 5px;
                                    font-weight: bold;
                                }
                                .btn:hover {
                                    background: #c82333;
                                }
                            </style>
                        </head>
                        <body>
                            <div class="container">
                                <img src="${url}" alt="Comprovante">
                                <br>
                                <a href="#" class="btn" onclick="window.close()">Fechar</a>
                            </div>
                        </body>
                        </html>
                    `);
                    win.document.close();
                } else {
                    // Fallback: tentar abrir diretamente
                    window.open(url, '_blank');
                }
            } else {
                // Se não for imagem, tentar download
                const link = document.createElement('a');
                link.href = url;
                link.download = 'comprovante.' + (url.includes('application/pdf') ? 'pdf' : 'bin');
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            }
        } 
        // Se for URL normal
        else {
            window.open(url, '_blank');
        }
    } catch (error) {
        console.error('❌ Erro ao abrir comprovante:', error);
        showToast('❌ Erro ao abrir comprovante', 'error');
    }
};

// ===== FUNÇÃO PARA SALVAR LANÇAMENTO =====
window.salvarLancamento = async function() {
    const tipoLancamento = document.getElementById('tipoLancamento').value;
    const valorLancamento = parseFloat(document.getElementById('valorLancamento').value);
    const descricaoLancamento = document.getElementById('descricaoLancamento').value.trim();
    
    if (!tipoLancamento || !valorLancamento || valorLancamento <= 0 || !descricaoLancamento) {
        showToast('Preencha todos os campos obrigatórios!', 'warning');
        return;
    }
    
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
        
        if (tipoLancamento === 'saida') {
            const comprovanteFile = document.getElementById('comprovanteFile');
            comprovanteUrl = await uploadComprovante(comprovanteFile.files[0]);
        }
        
        // Inserir lançamento
        const { data, error } = await supabaseClient
            .from('caixa_lancamentos')
            .insert([{
                data: dataCaixaAtual,
                tipo: tipoLancamento,
                valor: valorLancamento,
                descricao: descricaoLancamento,
                comprovante_url: comprovanteUrl,
                comprovante_aprovado: tipoLancamento === 'saida' ? null : true,
                criado_por: currentUser.name,
                created_at: new Date().toISOString()
            }])
            .select();
        
        if (error) throw error;
        
        lancamentosCaixa.push(data[0]);
        await atualizarTotaisCaixa();
        limparFormLancamento();
        atualizarPainelCaixa();
        renderLancamentosTable();
        
        showToast('✅ Lançamento salvo!', 'success');
        
    } catch (error) {
        console.error('❌ Erro:', error);
        showToast('❌ Erro: ' + error.message, 'error');
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
};

// ===== FUNÇÃO PARA ATUALIZAR TOTAIS DO CAIXA =====
async function atualizarTotaisCaixa() {
    let totalEntradas = 0;
    let totalSaidas = 0;
    
    lancamentosCaixa.forEach(l => {
        if (l.tipo === 'entrada') totalEntradas += parseFloat(l.valor);
        else totalSaidas += parseFloat(l.valor);
    });
    
    const saldoCalculado = totalEntradas - totalSaidas;
    const saldoAcumulado = (caixaData?.saldo_anterior || 0) + saldoCalculado;
    
    const { error } = await supabaseClient
        .from('caixa')
        .update({
            total_entradas: totalEntradas,
            total_saidas: totalSaidas,
            saldo_final: saldoAcumulado
        })
        .eq('data', dataCaixaAtual);
    
    if (error) throw error;
    
    // Recarregar caixa para garantir dados atualizados
    const { data } = await supabaseClient
        .from('caixa')
        .select('*')
        .eq('data', dataCaixaAtual)
        .single();
    
    caixaData = data;
}

// ===== FUNÇÃO PARA FECHAR CAIXA (OPERADOR) - VERSÃO FINAL SEM INFORMAÇÕES =====
window.fecharCaixaOperador = async function() {
    if (!caixaData) {
        showToast('Caixa não encontrado', 'error');
        return;
    }

    // Verificar se já está fechado
    if (caixaData.fechado_operador) {
        showToast('Caixa já está fechado', 'warning');
        return;
    }

    // ---------- VALIDAR DIA DA SEMANA ----------
    const dataSelecionada = new Date(dataCaixaAtual + 'T12:00:00');
    const diaSemana = dataSelecionada.getDay();
    
    if (diaSemana === 0 || diaSemana === 6) {
        showToast('⛔ Fechamento de caixa não permitido em sábados e domingos', 'warning');
        return;
    }

    // Calcular saldo esperado internamente (não exibido)
    let totalEntradas = 0, totalSaidas = 0;
    lancamentosCaixa.forEach(l => {
        if (l.tipo === 'entrada') totalEntradas += parseFloat(l.valor);
        else totalSaidas += parseFloat(l.valor);
    });
    
    const saldoEsperado = totalEntradas - totalSaidas;
    const saldoComAnterior = (caixaData.saldo_anterior || 0) + saldoEsperado;

    // ---------- PROMPT SIMPLES: APENAS SOLICITA O VALOR REAL ----------
    const valorRealStr = prompt(
        '💰 FECHAMENTO DO CAIXA\n\n' +
        'Digite o valor real em dinheiro que está no caixa:',
        '' // Campo vazio, sem valor padrão
    );
    
    if (valorRealStr === null) return;

    // Limpar formatação (vírgula, pontos, espaços)
    const valorRealNum = parseFloat(valorRealStr.replace(',', '.').replace(/[^\d.-]/g, ''));
    
    if (isNaN(valorRealNum)) {
        showToast('❌ Valor inválido. Digite apenas números.', 'error');
        return;
    }

    // ---------- VERIFICAR DIVERGÊNCIA ----------
    const diferenca = valorRealNum - saldoComAnterior;
    const isDivergente = Math.abs(diferenca) > 0.01;

    if (isDivergente) {
        showToast(`⚠️ DIVERGÊNCIA DETECTADA! Diferença de R$ ${diferenca.toFixed(2)}. Corrija os lançamentos antes de fechar.`, 'error');
        return; // Impede fechamento
    }

    // ---------- FECHAR CAIXA ----------
    const btn = document.getElementById('fecharCaixaBtn');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<span class="spinner"></span> Processando...';
    btn.disabled = true;

    try {
        const { error } = await supabaseClient
            .from('caixa')
            .update({
                fechado_operador: true,
                fechado_por_operador: currentUser.name,
                data_fechamento_operador: new Date().toISOString(),
                valor_real_operador: valorRealNum,
                tem_divergencia: false,
                diferenca: 0
            })
            .eq('data', dataCaixaAtual);

        if (error) throw error;

        caixaData.fechado_operador = true;
        caixaData.fechado_por_operador = currentUser.name;
        caixaData.tem_divergencia = false;
        caixaData.diferenca = 0;

        atualizarPainelCaixa();
        showToast('🔒 Caixa fechado com sucesso!', 'success');
        carregarHistoricoDias();

    } catch (error) {
        console.error('❌ Erro ao fechar caixa:', error);
        showToast('❌ Erro ao fechar caixa: ' + error.message, 'error');
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
};

// ===== FUNÇÃO PARA CONFERIR CAIXA (ADMIN) =====
window.conferirCaixaAdmin = async function() {
    if (!caixaData?.fechado_operador) {
        showToast('Operador ainda não fechou o caixa', 'warning');
        return;
    }
    
    if (caixaData.conferido_admin) {
        showToast('Caixa já foi conferido', 'info');
        return;
    }
    
    const saldoCalculado = (caixaData.total_entradas || 0) - (caixaData.total_saidas || 0);
    const saldoComAnterior = (caixaData.saldo_anterior || 0) + saldoCalculado;
    
    const mensagem = 
        '🔍 CONFERÊNCIA ADMIN\n\n' +
        `Saldo anterior: R$ ${(caixaData.saldo_anterior || 0).toFixed(2)}\n` +
        `Esperado: R$ ${saldoComAnterior.toFixed(2)}\n` +
        `Real informado: R$ ${(caixaData.valor_real_operador || 0).toFixed(2)}\n` +
        `Diferença: R$ ${(caixaData.diferenca || 0).toFixed(2)}\n\n` +
        `Confirmar conferência?`;
    
    if (!confirm(mensagem)) return;
    
    const btn = document.getElementById('conferirCaixaBtn');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<span class="spinner"></span> Conferindo...';
    btn.disabled = true;
    
    try {
        const { error } = await supabaseClient
            .from('caixa')
            .update({
                conferido_admin: true,
                conferido_por_admin: currentUser.name,
                data_conferencia_admin: new Date().toISOString()
            })
            .eq('data', dataCaixaAtual);
        
        if (error) throw error;
        
        caixaData.conferido_admin = true;
        caixaData.conferido_por_admin = currentUser.name;
        
        atualizarPainelCaixa();
        showToast('✅ Caixa conferido com sucesso!', 'success');
        
        // Recarregar histórico
        carregarHistoricoDias();
        
    } catch (error) {
        console.error('❌ Erro ao conferir caixa:', error);
        showToast('❌ Erro ao conferir caixa: ' + error.message, 'error');
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
};

// ===== FUNÇÃO PARA EXCLUIR LANÇAMENTO =====
window.excluirLancamento = async function(id) {
    const lancamento = lancamentosCaixa.find(l => l.id === id);
    if (!lancamento) return;
    
    // Verificar permissão
    const isAdmin = currentUser?.role === 'Administrador';
    const isCriador = lancamento.criado_por === currentUser?.name;
    
    if (!isAdmin && !isCriador) {
        showToast('❌ Você só pode excluir seus próprios lançamentos', 'error');
        return;
    }
    
    if (caixaData?.fechado_operador) {
        showToast('❌ Caixa já está fechado, não é possível excluir', 'error');
        return;
    }
    
    if (!confirm(`Excluir lançamento de R$ ${lancamento.valor.toFixed(2)}?`)) return;
    
    try {
        const { error } = await supabaseClient
            .from('caixa_lancamentos')
            .delete()
            .eq('id', id);
        
        if (error) throw error;
        
        lancamentosCaixa = lancamentosCaixa.filter(l => l.id !== id);
        await atualizarTotaisCaixa();
        atualizarPainelCaixa();
        renderLancamentosTable();
        
        showToast('🗑️ Lançamento excluído!', 'success');
        
    } catch (error) {
        console.error('❌ Erro ao excluir:', error);
        showToast('❌ Erro: ' + error.message, 'error');
    }
};

// ===== FUNÇÃO PARA UPLOAD DE COMPROVANTE =====
async function uploadComprovante(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.readAsDataURL(file);
    });
}

// ===== FUNÇÃO PARA APROVAR COMPROVANTE =====
window.aprovarComprovante = async function(id) {
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
        
        const index = lancamentosCaixa.findIndex(l => l.id === id);
        if (index !== -1) {
            lancamentosCaixa[index].comprovante_aprovado = true;
        }
        
        renderLancamentosTable();
        showToast('✅ Comprovante aprovado!', 'success');
        
    } catch (error) {
        console.error('❌ Erro:', error);
        showToast('❌ Erro: ' + error.message, 'error');
    }
};

// ===== FUNÇÃO PARA REJEITAR COMPROVANTE =====
window.rejeitarComprovante = async function(id) {
    const motivo = prompt('Motivo da rejeição (opcional):');
    
    try {
        const { error } = await supabaseClient
            .from('caixa_lancamentos')
            .update({ 
                comprovante_aprovado: false,
                motivo_rejeicao: motivo || 'Não informado',
                conferido_por: currentUser.name,
                data_conferencia: new Date().toISOString()
            })
            .eq('id', id);
        
        if (error) throw error;
        
        const index = lancamentosCaixa.findIndex(l => l.id === id);
        if (index !== -1) {
            lancamentosCaixa[index].comprovante_aprovado = false;
            lancamentosCaixa[index].motivo_rejeicao = motivo;
        }
        
        renderLancamentosTable();
        showToast('❌ Comprovante rejeitado! O criador poderá editar.', 'warning');
        
    } catch (error) {
        console.error('❌ Erro:', error);
        showToast('❌ Erro: ' + error.message, 'error');
    }
};

// ===== FUNÇÃO PARA LIMPAR FORMULÁRIO =====
window.limparFormLancamento = function() {
    document.getElementById('tipoLancamento').value = 'entrada';
    document.getElementById('valorLancamento').value = '';
    document.getElementById('descricaoLancamento').value = '';
    document.getElementById('comprovanteFile').value = '';
    document.getElementById('comprovantePreview').style.display = 'none';
    
    // Resetar mensagem
    const comprovanteMsg = document.getElementById('comprovanteMessage');
    comprovanteMsg.innerHTML = 'Entradas não precisam de comprovante.';
    
    // Garantir que não está em modo de edição
    if (lancamentoEditando) {
        cancelarEdicao();
    }
};

// ===== FUNÇÃO PARA FILTRAR LANÇAMENTOS =====
window.filtrarLancamentos = function(filtro) {
    currentLancamentoFilter = filtro;
    renderLancamentosTable();
    
    document.querySelectorAll('#caixaSystem .filter-group .btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    const activeButton = document.querySelector(`#caixaSystem .filter-group .btn[onclick*="${filtro}"]`);
    if (activeButton) activeButton.classList.add('active');
};

// ===== FUNÇÕES DO HISTÓRICO =====
window.carregarHistoricoDias = async function() {
    try {
        let query = supabaseClient
            .from('caixa')
            .select('*')
            .order('data', { ascending: false });
        
        if (historicoFiltroPeriodo > 0) {
            const dataLimite = new Date();
            dataLimite.setDate(dataLimite.getDate() - historicoFiltroPeriodo);
            query = query.gte('data', dataLimite.toISOString().split('T')[0]);
        }
        
        const { data, error } = await query;
        if (error) throw error;
        
        historicoDias = data || [];
        aplicarFiltroStatusHistorico();
        historicoPaginaAtual = 1;
        renderizarHistorico();
        
    } catch (error) {
        console.error('❌ Erro no histórico:', error);
    }
};

function aplicarFiltroStatusHistorico() {
    if (historicoFiltroStatus === 'aberto') {
        historicoDias = historicoDias.filter(d => !d.fechado_operador);
    } else if (historicoFiltroStatus === 'fechado_operador') {
        historicoDias = historicoDias.filter(d => d.fechado_operador && !d.conferido_admin);
    } else if (historicoFiltroStatus === 'conferido_admin') {
        historicoDias = historicoDias.filter(d => d.conferido_admin);
    } else if (historicoFiltroStatus === 'divergente') {
        historicoDias = historicoDias.filter(d => d.tem_divergencia || Math.abs(d.diferenca || 0) > 0.01);
    }
}

window.filtrarHistoricoPeriodo = function() {
    historicoFiltroPeriodo = parseInt(document.getElementById('filtroPeriodoHistorico').value);
    carregarHistoricoDias();
};

window.filtrarHistoricoStatus = function() {
    historicoFiltroStatus = document.getElementById('filtroStatusHistorico').value;
    carregarHistoricoDias();
};

function renderizarHistorico() {
    const tbody = document.getElementById('historicoDiasTableBody');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    const inicio = (historicoPaginaAtual - 1) * historicoItensPorPagina;
    const fim = inicio + historicoItensPorPagina;
    historicoPaginado = historicoDias.slice(inicio, fim);
    
    if (historicoPaginado.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="text-center p-5">
                    <i class="fas fa-history fa-3x mb-3" style="color: #6c757d; opacity: 0.5;"></i>
                    <h4 style="color: #6c757d;">Nenhum dia encontrado</h4>
                </td>
            </tr>
        `;
        return;
    }
    
    historicoPaginado.forEach(dia => {
        const row = document.createElement('tr');
        const [ano, mes, diaNum] = dia.data.split('-');
        const dataFormatada = `${diaNum}/${mes}/${ano}`;
        const saldoInicio = dia.saldo_anterior || 0;
        const saldoFim = dia.saldo_final || 0;
        const divergencia = dia.diferenca || 0;
        const temDivergencia = dia.tem_divergencia || Math.abs(divergencia) > 0.01;
        
        const cadeado1Icon = dia.fechado_operador 
            ? '<i class="fas fa-lock" style="color: #28a745;" title="Fechado"></i>' 
            : '<i class="fas fa-unlock-alt" style="color: #ffc107;" title="Aberto"></i>';
        
        const cadeado2Icon = dia.conferido_admin 
            ? '<i class="fas fa-lock" style="color: #8A2BE2;" title="Conferido"></i>' 
            : dia.fechado_operador 
                ? '<i class="fas fa-unlock-alt" style="color: #6c757d;" title="Aguardando"></i>' 
                : '<i class="fas fa-lock" style="color: #6c757d; opacity: 0.3;" title="Bloqueado"></i>';
        
        row.innerHTML = `
            <td><strong>${dataFormatada}</strong></td>
            <td>R$ ${saldoInicio.toFixed(2)}</td>
            <td class="${saldoFim >= 0 ? 'text-success' : 'text-danger'}">R$ ${saldoFim.toFixed(2)}</td>
            <td class="${temDivergencia ? 'text-danger' : 'text-success'}">
                ${temDivergencia ? `⚠️ R$ ${divergencia.toFixed(2)}` : 'R$ 0,00'}
            </td>
            <td style="text-align: center;">${cadeado1Icon}</td>
            <td style="text-align: center;">${cadeado2Icon}</td>
            <td style="text-align: center;">
                <button class="btn btn-sm btn-info" onclick="verDetalhesDia('${dia.data}')" title="Ver dia">
                    <i class="fas fa-eye"></i>
                </button>
            </td>
        `;
        tbody.appendChild(row);
    });
    
    // Atualizar paginação
    document.getElementById('historicoInfo').textContent = 
        `Mostrando ${inicio + 1}-${Math.min(fim, historicoDias.length)} de ${historicoDias.length} dias`;
    
    document.getElementById('btnHistoricoAnterior').disabled = historicoPaginaAtual <= 1;
    document.getElementById('btnHistoricoProxima').disabled = fim >= historicoDias.length;
}

window.paginarHistorico = function(direcao) {
    if (direcao === 'anterior' && historicoPaginaAtual > 1) {
        historicoPaginaAtual--;
    } else if (direcao === 'proxima') {
        const maxPagina = Math.ceil(historicoDias.length / historicoItensPorPagina);
        if (historicoPaginaAtual < maxPagina) {
            historicoPaginaAtual++;
        }
    }
    renderizarHistorico();
};

window.verDetalhesDia = function(data) {
    document.getElementById('dataCaixa').value = data;
    carregarCaixaDia();
    
    // Rolar para o topo
    document.querySelector('.cards-grid').scrollIntoView({ behavior: 'smooth' });
};

// ===== FUNÇÕES DE EXPORTAÇÃO =====
window.exportarCaixaExcel = function() {
    if (lancamentosCaixa.length === 0) {
        showToast('Nenhum lançamento para exportar', 'warning');
        return;
    }
    
    const dados = [['Data', 'Tipo', 'Valor', 'Descrição', 'Status Comprovante', 'Usuário', 'Hora']];
    
    lancamentosCaixa.forEach(l => {
        const data = new Date(l.created_at);
        let statusComprovante = 'N/A';
        if (l.tipo === 'saida') {
            if (l.comprovante_aprovado === true) statusComprovante = 'Aprovado';
            else if (l.comprovante_aprovado === false) statusComprovante = 'Rejeitado';
            else if (l.comprovante_url) statusComprovante = 'Pendente';
            else statusComprovante = 'Faltando';
        }
        
        dados.push([
            l.data,
            l.tipo === 'entrada' ? 'Entrada' : 'Saída',
            l.valor,
            l.descricao,
            statusComprovante,
            l.criado_por,
            data.toLocaleTimeString('pt-BR')
        ]);
    });
    
    const ws = XLSX.utils.aoa_to_sheet(dados);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Caixa');
    XLSX.writeFile(wb, `caixa_${dataCaixaAtual}.xlsx`);
    showToast('✅ Exportado!', 'success');
};

window.exportarHistoricoExcel = function() {
    if (historicoDias.length === 0) {
        showToast('Nenhum dado para exportar', 'warning');
        return;
    }
    
    const dados = [['Data', 'Saldo Anterior', 'Entradas', 'Saídas', 'Saldo Final', 'Diferença', 'Status Operador', 'Status Admin']];
    
    historicoDias.forEach(d => {
        dados.push([
            d.data,
            d.saldo_anterior || 0,
            d.total_entradas || 0,
            d.total_saidas || 0,
            d.saldo_final || 0,
            d.diferenca || 0,
            d.fechado_operador ? 'Fechado' : 'Aberto',
            d.conferido_admin ? 'Conferido' : 'Pendente'
        ]);
    });
    
    const ws = XLSX.utils.aoa_to_sheet(dados);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Histórico');
    XLSX.writeFile(wb, `historico_caixa_${new Date().toISOString().split('T')[0]}.xlsx`);
    showToast('✅ Histórico exportado!', 'success');
};

// ===== FUNÇÕES DO RELATÓRIO =====
window.abrirRelatorioCaixa = function() {
    if (currentUser?.role !== 'Administrador') {
        showToast('Apenas administradores', 'warning');
        return;
    }
    
    const hoje = new Date();
    const seteDiasAtras = new Date();
    seteDiasAtras.setDate(hoje.getDate() - 7);
    
    document.getElementById('relDataInicio').value = seteDiasAtras.toISOString().split('T')[0];
    document.getElementById('relDataFim').value = hoje.toISOString().split('T')[0];
    document.getElementById('relatorioCaixaModal').classList.remove('hidden');
};

window.closeRelatorioCaixaModal = function() {
    document.getElementById('relatorioCaixaModal').classList.add('hidden');
};

window.gerarRelatorioCaixa = async function() {
    const dataInicio = document.getElementById('relDataInicio').value;
    const dataFim = document.getElementById('relDataFim').value;
    const usuario = document.getElementById('relUsuario').value;
    
    if (!dataInicio || !dataFim) {
        showToast('Selecione as datas', 'warning');
        return;
    }
    
    let query = supabaseClient
        .from('caixa')
        .select('*')
        .gte('data', dataInicio)
        .lte('data', dataFim)
        .order('data', { ascending: true });
    
    const { data, error } = await query;
    if (error) throw error;
    
    // Filtrar por usuário se necessário
    let diasFiltrados = data;
    if (usuario) {
        // Buscar lançamentos do usuário
        const { data: lancamentos } = await supabaseClient
            .from('caixa_lancamentos')
            .select('data')
            .eq('criado_por', usuario)
            .gte('data', dataInicio)
            .lte('data', dataFim);
        
        const datasComLancamentos = new Set(lancamentos?.map(l => l.data) || []);
        diasFiltrados = data.filter(d => datasComLancamentos.has(d.data));
    }
    
    // Calcular totais
    let totalEntradas = 0, totalSaidas = 0;
    diasFiltrados.forEach(d => {
        totalEntradas += d.total_entradas || 0;
        totalSaidas += d.total_saidas || 0;
    });
    
    document.getElementById('relTotalEntradas').textContent = totalEntradas.toFixed(2);
    document.getElementById('relTotalSaidas').textContent = totalSaidas.toFixed(2);
    document.getElementById('relSaldoFinal').textContent = (totalEntradas - totalSaidas).toFixed(2);
    document.getElementById('relTotalDias').textContent = diasFiltrados.length;
    
    // Renderizar tabela
    const tbody = document.getElementById('relatorioCaixaTableBody');
    tbody.innerHTML = '';
    
    diasFiltrados.forEach(d => {
        const row = document.createElement('tr');
        const [ano, mes, dia] = d.data.split('-');
        row.innerHTML = `
            <td>${dia}/${mes}/${ano}</td>
            <td>R$ ${(d.total_entradas || 0).toFixed(2)}</td>
            <td>R$ ${(d.total_saidas || 0).toFixed(2)}</td>
            <td class="${(d.saldo_final || 0) >= 0 ? 'text-success' : 'text-danger'}">
                R$ ${(d.saldo_final || 0).toFixed(2)}
            </td>
            <td>${d.fechado_operador ? 'Fechado' : 'Aberto'}</td>
            <td>${d.conferido_admin ? 'Conferido' : 'Pendente'}</td>
        `;
        tbody.appendChild(row);
    });
    
    // Gráfico simples
    const container = document.getElementById('graficoCaixaContainer');
    container.innerHTML = '<p class="text-center">Gráfico gerado! (implementar com Chart.js depois)</p>';
};

// ===== FUNÇÕES AUXILIARES =====
function formatarMoeda(valor) {
    return 'R$ ' + parseFloat(valor || 0).toFixed(2).replace('.', ',');
}

function removerComprovante() {
    document.getElementById('comprovanteFile').value = '';
    document.getElementById('comprovantePreview').style.display = 'none';
}

function setupCaixaEventListeners() {
    const comprovanteFile = document.getElementById('comprovanteFile');
    if (comprovanteFile) {
        comprovanteFile.addEventListener('change', function() {
            if (this.files && this.files[0]) {
                document.getElementById('comprovantePreview').style.display = 'block';
                document.getElementById('comprovanteName').textContent = this.files[0].name;
            }
        });
    }
    
    const tipoLancamento = document.getElementById('tipoLancamento');
    if (tipoLancamento) {
        tipoLancamento.addEventListener('change', function() {
            const section = document.getElementById('comprovanteSection');
            const msg = document.getElementById('comprovanteMessage');
            if (this.value === 'saida') {
                section.style.borderLeft = '3px solid #dc3545';
                section.style.paddingLeft = '10px';
                msg.innerHTML = '⚠️ Saídas exigem comprovante obrigatório!';
            } else {
                section.style.borderLeft = '';
                section.style.paddingLeft = '';
                msg.innerHTML = 'Entradas não precisam de comprovante.';
            }
        });
    }
}