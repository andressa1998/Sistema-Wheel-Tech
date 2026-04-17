// ============================================
// PERGUNTAS MANAGER - COM PERSISTÊNCIA NO SUPABASE
// ============================================

console.log('perguntas_manager.js carregado');

// Variáveis globais
let perguntas = [];
let currentPerguntaFilter = 'todas';
let perguntasPagination = { offset: 0, limit: 20, total: 0 };
let municipiosCache = null; // cache da base de municípios

// Mapeamento de código UF para sigla (IBGE)
const codigoUfParaSigla = {
    11: 'RO', 12: 'AC', 13: 'AM', 14: 'RR', 15: 'PA', 16: 'AP', 17: 'TO',
    21: 'MA', 22: 'PI', 23: 'CE', 24: 'RN', 25: 'PB', 26: 'PE', 27: 'AL', 28: 'SE', 29: 'BA',
    31: 'MG', 32: 'ES', 33: 'RJ', 35: 'SP',
    41: 'PR', 42: 'SC', 43: 'RS',
    50: 'MS', 51: 'MT', 52: 'GO', 53: 'DF'
};

// ============================================
// FUNÇÃO PRINCIPAL PARA ABRIR O SISTEMA
// ============================================
window.abrirSistemaPerguntas = async function() {
    console.log('abrirSistemaPerguntas chamada');
    
    if (typeof currentUser === 'undefined' || !currentUser) {
        showToast('⚠️ Faça login primeiro', 'warning');
        return;
    }
    
    const menuSystem = document.getElementById('menuSystem');
    if (menuSystem) menuSystem.classList.add('hidden');
    
    const sistemas = ['mainSystem', 'salesSystem', 'reembolsosSystem', 'caixaSystem', 
                      'reviewsSystem', 'folgasSystem', 'shippingSystem', 'estoqueSystem', 
                      'estoqueGestaoSystem', 'nfeSystem'];
    sistemas.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });
    
    const perguntasSystem = document.getElementById('perguntasSystem');
    if (perguntasSystem) {
        perguntasSystem.classList.remove('hidden');
    } else {
        console.error('Elemento perguntasSystem não encontrado');
        showToast('Erro: Sistema de perguntas não encontrado', 'error');
        return;
    }
    
    const userNameEl = document.getElementById('perguntasUserName');
    const userAvatarEl = document.getElementById('perguntasUserAvatar');
    const userRoleEl = document.getElementById('perguntasUserRole');
    if (userNameEl) userNameEl.textContent = currentUser.name;
    if (userAvatarEl) userAvatarEl.textContent = currentUser.avatar;
    if (userRoleEl) userRoleEl.textContent = currentUser.role;
    
    await carregarPerguntasDoBanco();
    await sincronizarPerguntasComML();
    
    showToast('📢 Sistema de Perguntas carregado', 'info');
};

// ============================================
// CARREGAR PERGUNTAS DO SUPABASE
// ============================================
async function carregarPerguntasDoBanco() {
    if (!window.supabaseClient) {
        console.warn('Supabase não disponível');
        return;
    }
    try {
        const { data, error } = await window.supabaseClient
            .from('perguntas_ml')
            .select('*')
            .order('data_pergunta', { ascending: false });
        
        if (error) throw error;
        
        if (data && data.length > 0) {
            perguntas = data;
            perguntasPagination.total = data.length;
            renderizarPerguntas();
            atualizarPaginacao();
            console.log(`📦 ${perguntas.length} perguntas carregadas do Supabase`);
        }
    } catch (error) {
        console.error('Erro ao carregar perguntas do banco:', error);
    }
}

// ============================================
// SINCRONIZAR COM MERCADO LIVRE
// ============================================
async function sincronizarPerguntasComML() {
    if (!window.supabaseClient) {
        console.warn('Supabase não disponível, carregando apenas do ML');
        return await carregarPerguntasML(0);
    }
    
    try {
        const tokenData = await getValidToken();
        if (!tokenData || !tokenData.access_token) throw new Error('Token ML não disponível');
        
        const sellerId = ML_CONFIG?.USER_ID || '415176739';
        let offset = 0;
        let total = 0;
        let novasPerguntas = 0;
        
        do {
            const url = `https://api.mercadolibre.com/questions/search?seller_id=${sellerId}&offset=${offset}&limit=50&sort=date_desc&api_version=4`;
            const proxyUrl = `${WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(url)}&token=${tokenData.access_token}`;
            const response = await fetch(proxyUrl);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const data = await response.json();
            if (offset === 0) total = data.paging?.total || 0;
            
            const questions = data.questions || [];
            if (questions.length === 0) break;
            
            for (const q of questions) {
                const existe = perguntas.some(p => p.id === q.id);
                if (!existe) {
                    // Buscar dados do comprador (nome e cidade)
                    let compradorNome = 'Anônimo';
                    let compradorCidade = 'Não informado';
                    
                    if (q.from?.id) {
                        try {
                            const userUrl = `https://api.mercadolibre.com/users/${q.from.id}`;
                            const userProxy = `${WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(userUrl)}&token=${tokenData.access_token}`;
                            const userRes = await fetch(userProxy);
                            if (userRes.ok) {
                                const userData = await userRes.json();
                                compradorNome = userData.nickname || userData.first_name || userData.email || `Usuário ${q.from.id}`;
                                compradorCidade = userData.address?.city || userData.address?.state || 'Não informado';
                            } else {
                                compradorNome = q.from?.nickname || `Usuário ${q.from.id}`;
                            }
                        } catch (e) {
                            console.warn('Erro ao buscar dados do comprador:', e);
                            compradorNome = q.from?.nickname || `Usuário ${q.from.id}`;
                        }
                    } else if (q.from?.nickname) {
                        compradorNome = q.from.nickname;
                    }
                    
                    // Buscar UF da cidade
                    const estado = await buscarEstadoPorCidade(compradorCidade);
                    
                    const perguntaData = {
                        id: q.id,
                        item_id: q.item_id,
                        seller_id: sellerId,
                        pergunta: q.text,
                        data_pergunta: q.date_created,
                        status: q.answer ? 'respondida' : 'pendente',
                        resposta: q.answer?.text || null,
                        data_resposta: q.answer?.date_created || null,
                        comprador_nome: compradorNome,
                        comprador_cidade: compradorCidade,
                        comprador_estado: estado
                    };
                    
                    const { error } = await window.supabaseClient
                        .from('perguntas_ml')
                        .upsert(perguntaData, { onConflict: 'id' });
                    
                    if (!error) {
                        perguntas.unshift(perguntaData);
                        novasPerguntas++;
                    }
                } else {
                    // Atualizar se a resposta mudou
                    const local = perguntas.find(p => p.id === q.id);
                    if (local.status === 'pendente' && q.answer) {
                        const { error } = await window.supabaseClient
                            .from('perguntas_ml')
                            .update({
                                status: 'respondida',
                                resposta: q.answer.text,
                                data_resposta: q.answer.date_created,
                                updated_at: new Date().toISOString()
                            })
                            .eq('id', q.id);
                        if (!error) {
                            local.status = 'respondida';
                            local.resposta = q.answer.text;
                            local.data_resposta = q.answer.date_created;
                        }
                    }
                }
            }
            offset += questions.length;
        } while (offset < total);
        
        if (novasPerguntas > 0) {
            console.log(`✅ ${novasPerguntas} novas perguntas salvas no Supabase`);
            showToast(`📥 ${novasPerguntas} nova(s) pergunta(s) sincronizada(s)`, 'success');
        }
        
        perguntas.sort((a, b) => new Date(b.data_pergunta) - new Date(a.data_pergunta));
        perguntasPagination.total = perguntas.length;
        renderizarPerguntas();
        atualizarPaginacao();
        
    } catch (error) {
        console.error('Erro na sincronização com ML:', error);
        showToast('Erro ao sincronizar perguntas: ' + error.message, 'error');
    }
}

// ============================================
// CARREGAR PERGUNTAS DIRETO DO ML (FALLBACK)
// ============================================
async function carregarPerguntasML(offset = 0) {
    try {
        const tokenData = await getValidToken();
        if (!tokenData?.access_token) throw new Error('Token não disponível');
        
        const sellerId = ML_CONFIG?.USER_ID || '415176739';
        const url = `https://api.mercadolibre.com/questions/search?seller_id=${sellerId}&offset=${offset}&limit=50&sort=date_desc&api_version=4`;
        const proxyUrl = `${WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(url)}&token=${tokenData.access_token}`;
        
        const response = await fetch(proxyUrl);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const data = await response.json();
        perguntas = data.questions || [];
        perguntasPagination.total = data.paging?.total || 0;
        perguntasPagination.offset = offset;
        
        await enriquecerPerguntasComDadosComprador();
        renderizarPerguntas();
        atualizarPaginacao();
        
    } catch (error) {
        console.error('Erro ao carregar perguntas ML (fallback):', error);
        showToast('Erro ao carregar perguntas: ' + error.message, 'error');
    }
}

// ============================================
// CARREGAR BASE DE MUNICÍPIOS (IBGE)
// ============================================

async function carregarMunicipios() {
    if (municipiosCache) return municipiosCache;
    try {
        const response = await fetch('municipios.json');
        if (!response.ok) throw new Error('Erro ao carregar municipios.json');
        const data = await response.json();
        if (Array.isArray(data)) {
            const mapa = new Map();
            for (const mun of data) {
                const nomeNorm = mun.nome.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                const sigla = codigoUfParaSigla[mun.codigo_uf];
                if (sigla) mapa.set(nomeNorm, sigla);
            }
            municipiosCache = mapa;
            console.log(`✅ ${mapa.size} municípios carregados`);
        } else {
            municipiosCache = new Map();
        }
        return municipiosCache;
    } catch (error) {
        console.error('Erro ao carregar municipios:', error);
        return new Map();
    }
}

// ============================================
// BUSCAR ESTADO (UF) A PARTIR DO NOME DA CIDADE
// ============================================
async function buscarEstadoPorCidade(cidade) {
    if (!cidade || cidade === 'Não informado') return 'UF não informada';
    const mapa = await carregarMunicipios();
    const cidadeNorm = cidade.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    let uf = mapa.get(cidadeNorm);
    if (!uf) {
        for (let [nome, sigla] of mapa.entries()) {
            if (nome.includes(cidadeNorm) || cidadeNorm.includes(nome)) {
                uf = sigla;
                break;
            }
        }
    }
    return uf || 'UF não informada';
}

// ============================================
// ENRIQUECER PERGUNTAS COM NOME E CIDADE/ESTADO
// ============================================
async function enriquecerPerguntasComDadosComprador() {
    for (let pergunta of perguntas) {
        // Se já temos os dados completos, apenas garante o estado
        if (pergunta.comprador_nome && pergunta.comprador_nome !== 'Anônimo' &&
            pergunta.comprador_cidade && pergunta.comprador_cidade !== 'Não informado') {
            if (!pergunta.comprador_estado) {
                pergunta.comprador_estado = await buscarEstadoPorCidade(pergunta.comprador_cidade);
            }
            continue;
        }
        
        const userId = pergunta.from?.id;
        let nome = pergunta.from?.nickname;
        let cidade = 'Não informado';
        
        if (userId) {
            try {
                const tokenData = await getValidToken();
                if (tokenData?.access_token) {
                    const userUrl = `https://api.mercadolibre.com/users/${userId}`;
                    const proxyUrl = `${WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(userUrl)}&token=${tokenData.access_token}`;
                    const userRes = await fetch(proxyUrl);
                    if (userRes.ok) {
                        const userData = await userRes.json();
                        nome = userData.nickname || userData.first_name || userData.email || `Usuário ${userId}`;
                        cidade = userData.address?.city || userData.address?.state || 'Não informado';
                    } else {
                        nome = pergunta.from?.nickname || `Usuário ${userId}`;
                    }
                } else {
                    nome = pergunta.from?.nickname || `Usuário ${userId}`;
                }
            } catch (e) {
                console.warn(`Erro ao buscar dados do comprador ${userId}:`, e);
                nome = pergunta.from?.nickname || `Usuário ${userId}`;
            }
        } else if (!nome) {
            nome = 'Anônimo';
        }
        
        pergunta.comprador_nome = nome;
        pergunta.comprador_cidade = cidade;
        pergunta.comprador_estado = await buscarEstadoPorCidade(cidade);
        
        await new Promise(resolve => setTimeout(resolve, 50));
    }
}

// ============================================
// RENDERIZAR TABELA (COM CIDADE/ESTADO)
// ============================================
function renderizarPerguntas() {
    const tbody = document.getElementById('perguntasTableBody');
    if (!tbody) return;
    
    let perguntasFiltradas = [...perguntas];
    
    if (currentPerguntaFilter === 'nao_respondidas') {
        perguntasFiltradas = perguntasFiltradas.filter(p => p.status === 'pendente');
    } else if (currentPerguntaFilter === 'respondidas') {
        perguntasFiltradas = perguntasFiltradas.filter(p => p.status === 'respondida');
    }
    
    if (perguntasFiltradas.length === 0) {
        tbody.innerHTML = `
            <tr><td colspan="6" class="text-center py-5">
                <i class="fas fa-comment-slash fa-3x mb-3" style="color: #6c757d; opacity: 0.5;"></i>
                <h4 style="color: #6c757d;">Nenhuma pergunta encontrada</h4>
                <p style="color: #6c757d;">Não há perguntas para os anúncios do Mercado Livre.</p>
            </td></tr>
        `;
        return;
    }
    
    tbody.innerHTML = perguntasFiltradas.map(pergunta => {
        const dataPergunta = new Date(pergunta.data_pergunta);
        const dataFormatada = dataPergunta.toLocaleDateString('pt-BR') + ' ' + 
                             dataPergunta.toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'});
        
        const statusBadge = pergunta.status === 'respondida' 
            ? '<span class="badge badge-success"><i class="fas fa-check-circle"></i> Respondida</span>'
            : '<span class="badge badge-warning"><i class="fas fa-hourglass-half"></i> Aguardando</span>';
        
        const respostaPreview = pergunta.resposta 
            ? `<div style="font-size: 12px; color: #28a745; margin-top: 5px; border-left: 2px solid #28a745; padding-left: 8px;">
                   <i class="fas fa-reply"></i> ${escapeHtml(pergunta.resposta.substring(0, 100))}${pergunta.resposta.length > 100 ? '...' : ''}
               </div>`
            : '';
        
        // Exibe cidade e estado formatados
        let localizacao = '';
        if (pergunta.comprador_cidade && pergunta.comprador_cidade !== 'Não informado') {
            localizacao = `${escapeHtml(pergunta.comprador_cidade)}`;
            if (pergunta.comprador_estado && pergunta.comprador_estado !== 'UF não informada') {
                localizacao += ` / ${escapeHtml(pergunta.comprador_estado)}`;
            }
        } else {
            localizacao = 'Local não informado';
        }
        
        return `
            <tr class="pergunta-item" data-id="${pergunta.id}">
                <td>
                    <strong>${escapeHtml(pergunta.comprador_nome || 'Anônimo')}</strong><br>
                    <small class="text-muted">
                        <i class="fas fa-map-marker-alt"></i> ${localizacao}
                    </small>
                </td>
                <td>${escapeHtml(pergunta.pergunta)}</td>
                <td><a href="https://produto.mercadolivre.com.br/${pergunta.item_id}" target="_blank">Ver anúncio</a></td>
                <td>${dataFormatada}</td>
                <td>${statusBadge}</td>
                <td>
                    <button class="btn btn-sm btn-primary" onclick="abrirModalResponderPergunta('${pergunta.id}')" ${pergunta.status === 'respondida' ? 'disabled' : ''}>
                        <i class="fas fa-reply"></i> Responder
                    </button>
                    ${pergunta.resposta ? `<button class="btn btn-sm btn-info" onclick="verRespostaPergunta('${pergunta.id}')"><i class="fas fa-eye"></i> Ver resposta</button>` : ''}
                </td>
            </tr>
            ${respostaPreview}
        `;
    }).join('');
}

// ============================================
// MODAL PARA RESPONDER
// ============================================
window.abrirModalResponderPergunta = function(questionId) {
    const pergunta = perguntas.find(p => p.id == questionId);
    if (!pergunta) {
        showToast('Pergunta não encontrada', 'error');
        return;
    }
    if (pergunta.status === 'respondida') {
        showToast('Esta pergunta já foi respondida', 'warning');
        return;
    }
    
    const modal = document.getElementById('modalResponderPergunta');
    if (!modal) return;
    
    document.getElementById('responderQuestionId').value = questionId;
    document.getElementById('responderPerguntaText').innerHTML = `<strong>Pergunta:</strong> ${escapeHtml(pergunta.pergunta)}`;
    document.getElementById('respostaTexto').value = '';
    modal.classList.remove('hidden');
};

window.fecharModalResponder = function() {
    const modal = document.getElementById('modalResponderPergunta');
    if (modal) modal.classList.add('hidden');
};

window.enviarRespostaPergunta = async function() {
    const questionId = document.getElementById('responderQuestionId').value;
    const resposta = document.getElementById('respostaTexto').value.trim();
    if (!resposta) {
        showToast('Digite uma resposta', 'warning');
        return;
    }
    
    const pergunta = perguntas.find(p => p.id == questionId);
    if (!pergunta) {
        showToast('Pergunta não encontrada', 'error');
        return;
    }
    
    const btn = document.querySelector('#modalResponderPergunta .btn-success');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<span class="spinner"></span> Enviando...';
    btn.disabled = true;
    
    try {
        const tokenData = await getValidToken();
        if (!tokenData || !tokenData.access_token) throw new Error('Token não disponível');
        
        const answerUrl = `https://api.mercadolibre.com/answers`;
        const response = await fetch(`${WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(answerUrl)}&token=${tokenData.access_token}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                question_id: questionId,
                text: resposta
            })
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Erro ao enviar resposta');
        }
        
        if (window.supabaseClient) {
            await window.supabaseClient
                .from('perguntas_ml')
                .update({
                    status: 'respondida',
                    resposta: resposta,
                    data_resposta: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                })
                .eq('id', questionId);
        }
        
        pergunta.status = 'respondida';
        pergunta.resposta = resposta;
        pergunta.data_resposta = new Date().toISOString();
        
        showToast('✅ Resposta enviada com sucesso!', 'success');
        fecharModalResponder();
        renderizarPerguntas();
        
    } catch (error) {
        console.error('Erro ao responder:', error);
        showToast('Erro ao enviar resposta: ' + error.message, 'error');
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
};

// ============================================
// FILTROS E PAGINAÇÃO
// ============================================
window.filtrarPerguntas = function(filtro) {
    currentPerguntaFilter = filtro;
    renderizarPerguntas();
    
    document.querySelectorAll('#perguntasSystem .btn-group .btn').forEach(btn => {
        btn.classList.remove('active');
    });
    const activeBtn = document.querySelector(`#perguntasSystem .btn-group .btn[onclick*="${filtro}"]`);
    if (activeBtn) activeBtn.classList.add('active');
};

window.paginarPerguntas = function(direcao) {
    let newOffset = perguntasPagination.offset;
    if (direcao === 'anterior') {
        newOffset = Math.max(0, newOffset - perguntasPagination.limit);
    } else if (direcao === 'proxima') {
        newOffset = newOffset + perguntasPagination.limit;
        if (newOffset >= perguntasPagination.total) return;
    }
    perguntasPagination.offset = newOffset;
    renderizarPerguntas();
    atualizarPaginacao();
};

function atualizarPaginacao() {
    const inicio = perguntasPagination.offset + 1;
    const fim = Math.min(perguntasPagination.offset + perguntas.length, perguntasPagination.total);
    const info = document.getElementById('perguntasInfo');
    if (info) info.textContent = `Mostrando ${inicio}-${fim} de ${perguntasPagination.total}`;
    
    const btnAnterior = document.getElementById('btnPerguntasAnterior');
    const btnProxima = document.getElementById('btnPerguntasProxima');
    if (btnAnterior) btnAnterior.disabled = perguntasPagination.offset === 0;
    if (btnProxima) btnProxima.disabled = (perguntasPagination.offset + perguntasPagination.limit) >= perguntasPagination.total;
}

// ============================================
// UTILITÁRIOS
// ============================================
function escapeHtml(text) {
    if (!text) return '';
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

window.verRespostaPergunta = function(questionId) {
    const pergunta = perguntas.find(p => p.id == questionId);
    if (!pergunta || !pergunta.resposta) return;
    alert(`Resposta:\n\n${pergunta.resposta}\n\nEnviada em: ${new Date(pergunta.data_resposta).toLocaleString('pt-BR')}`);
};

console.log('perguntas_manager.js - pronto');

window.buscarEstadoPorCidade = buscarEstadoPorCidade;