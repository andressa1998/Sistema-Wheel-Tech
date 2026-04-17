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
        if (!tokenData || !tokenData.access_token) {
            throw new Error('Token ML não disponível');
        }
        
        const sellerId = ML_CONFIG?.USER_ID || '415176739';
        let offset = 0;
        let total = 0;
        let novasPerguntas = 0;
        
        do {
            const url = `https://api.mercadolibre.com/questions/search?seller_id=${sellerId}&offset=${offset}&limit=50&sort=date_desc&api_version=4`;
            const proxyUrl = `${WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(url)}&token=${tokenData.access_token}`;
            const response = await fetch(proxyUrl);
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }
            
            const data = await response.json();
            if (offset === 0) total = data.paging?.total || 0;
            
            const questions = data.questions || [];
            if (questions.length === 0) break;
            
            for (const q of questions) {
                const existe = perguntas.some(p => p.id === q.id);
                
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
                
                // Buscar título e imagem do anúncio
                let itemTitulo = 'Produto não encontrado';
                let itemImagem = '';
                if (q.item_id) {
                    try {
                        const itemUrl = `https://api.mercadolibre.com/items/${q.item_id}`;
                        const itemProxy = `${WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(itemUrl)}&token=${tokenData.access_token}`;
                        const itemRes = await fetch(itemProxy);
                        if (itemRes.ok) {
                            const itemData = await itemRes.json();
                            itemTitulo = itemData.title || 'Sem título';
                            itemImagem = (itemData.pictures && itemData.pictures[0] && itemData.pictures[0].url) || '';
                        }
                    } catch (e) {
                        console.warn(`Erro ao buscar item ${q.item_id}:`, e);
                    }
                }
                
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
                    comprador_estado: estado,
                    item_titulo: itemTitulo,
                    item_imagem: itemImagem
                };
                
                if (!existe) {
                    const { error } = await window.supabaseClient
                        .from('perguntas_ml')
                        .upsert(perguntaData, { onConflict: 'id' });
                    
                    if (!error) {
                        perguntas.unshift(perguntaData);
                        novasPerguntas++;
                    }
                } else {
                    // Atualizar se resposta mudou ou faltam dados do item
                    const local = perguntas.find(p => p.id === q.id);
                    let precisaUpdate = false;
                    const updateData = { updated_at: new Date().toISOString() };
                    
                    if (local.status === 'pendente' && q.answer) {
                        updateData.status = 'respondida';
                        updateData.resposta = q.answer.text;
                        updateData.data_resposta = q.answer.date_created;
                        precisaUpdate = true;
                    }
                    
                    if (!local.item_titulo || !local.item_imagem) {
                        updateData.item_titulo = itemTitulo;
                        updateData.item_imagem = itemImagem;
                        precisaUpdate = true;
                    }
                    
                    if (precisaUpdate) {
                        const { error } = await window.supabaseClient
                            .from('perguntas_ml')
                            .update(updateData)
                            .eq('id', q.id);
                        if (!error) {
                            Object.assign(local, updateData);
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
        
        // Reordenar por data (mais recente primeiro)
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

// Buscar título e imagem principal do anúncio
async function buscarDetalhesItem(itemId, token) {
    if (!itemId) return { titulo: 'Produto não encontrado', imagem: '' };
    try {
        const url = `https://api.mercadolibre.com/items/${itemId}`;
        const proxyUrl = `${WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(url)}&token=${token}`;
        const response = await fetch(proxyUrl);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        const titulo = data.title || 'Sem título';
        const imagem = (data.pictures && data.pictures[0] && data.pictures[0].url) || '';
        return { titulo, imagem };
    } catch (error) {
        console.error(`Erro ao buscar item ${itemId}:`, error);
        return { titulo: 'Erro ao carregar', imagem: '' };
    }
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
    
    // Agrupar perguntas por comprador + item
    const grupos = agruparPerguntas(perguntasFiltradas);
    
    if (grupos.length === 0) {
        tbody.innerHTML = `... (mesmo código de vazio) ...`;
        return;
    }
    
    tbody.innerHTML = grupos.map(grupo => {
        const p = grupo.ultima_pergunta; // última pergunta do grupo
        const dataPergunta = new Date(p.data_pergunta);
        const dataFormatada = dataPergunta.toLocaleDateString('pt-BR') + ' ' + 
                             dataPergunta.toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'});
        
        const statusBadge = p.status === 'respondida' 
            ? '<span class="badge badge-success"><i class="fas fa-check-circle"></i> Respondida</span>'
            : '<span class="badge badge-warning"><i class="fas fa-hourglass-half"></i> Aguardando</span>';
        
        const respostaPreview = p.resposta 
            ? `<div style="font-size: 12px; color: #28a745; margin-top: 5px; border-left: 2px solid #28a745; padding-left: 8px;">
                   <i class="fas fa-reply"></i> ${escapeHtml(p.resposta.substring(0, 100))}${p.resposta.length > 100 ? '...' : ''}
               </div>`
            : '';
        
        let localizacao = '';
        if (p.comprador_cidade && p.comprador_cidade !== 'Não informado') {
            localizacao = `${escapeHtml(p.comprador_cidade)}`;
            if (p.comprador_estado && p.comprador_estado !== 'UF não informada') {
                localizacao += ` / ${escapeHtml(p.comprador_estado)}`;
            }
        } else {
            localizacao = 'Local não informado';
        }
        
        // Link do produto
        let itemNumero = p.item_id;
        if (itemNumero && itemNumero.toUpperCase().startsWith('MLB')) {
            itemNumero = itemNumero.substring(3);
        }
        const linkProduto = itemNumero ? `https://produto.mercadolivre.com.br/MLB-${itemNumero}` : '#';
        
        return `
            <tr class="pergunta-item" data-id="${p.id}">
                <td>
                    <strong>${escapeHtml(p.comprador_nome || 'Anônimo')}</strong><br>
                    <small class="text-muted">
                        <i class="fas fa-map-marker-alt"></i> ${localizacao}
                    </small>
                    ${grupo.total > 1 ? `<br><small class="text-info"><i class="fas fa-comments"></i> ${grupo.total} perguntas</small>` : ''}
                </td>
                <td>${escapeHtml(p.pergunta)}${respostaPreview}</td>
                <td style="min-width: 200px;">
                    <a href="${linkProduto}" target="_blank" rel="noopener noreferrer" 
                       style="display: flex; align-items: center; gap: 8px; text-decoration: none; color: #333;">
                        ${p.item_imagem ? 
                            `<img src="${p.item_imagem}" style="width: 40px; height: 40px; object-fit: cover; border-radius: 4px;" alt="foto">` : 
                            `<i class="fas fa-image" style="font-size: 24px; color: #ccc;"></i>`
                        }
                        <span style="font-size: 13px; font-weight: 500;">${escapeHtml(p.item_titulo || 'Ver anúncio')}</span>
                    </a>
                 </td>
                <td>${dataFormatada}</td>
                <td>${statusBadge}</td>
                <td>
                    <button class="btn btn-sm btn-primary" onclick="abrirModalResponderPergunta('${p.id}')" ${p.status === 'respondida' ? 'disabled' : ''}>
                        <i class="fas fa-reply"></i> Responder
                    </button>
                    ${grupo.total > 1 ? 
                        `<button class="btn btn-sm btn-info" onclick="abrirHistoricoPerguntas('${escapeHtml(p.comprador_nome)}', '${p.item_id}')" title="Ver todas as perguntas deste comprador">
                            <i class="fas fa-history"></i> Histórico (${grupo.total})
                        </button>` : 
                        ''
                    }
                    ${p.resposta ? `<button class="btn btn-sm btn-info" onclick="verRespostaPergunta('${p.id}')"><i class="fas fa-eye"></i> Ver resposta</button>` : ''}
                 </td>
             </tr>
        `;
    }).join('');
}

// ============================================
// AGRUPAR PERGUNTAS (uma linha por comprador+item)
// ============================================
function agruparPerguntas(perguntasLista) {
    const grupos = new Map(); // chave: `${comprador_nome}|${item_id}`
    
    for (const p of perguntasLista) {
        const chave = `${p.comprador_nome}|${p.item_id}`;
        if (!grupos.has(chave)) {
            grupos.set(chave, {
                comprador_nome: p.comprador_nome,
                comprador_cidade: p.comprador_cidade,
                comprador_estado: p.comprador_estado,
                item_id: p.item_id,
                item_titulo: p.item_titulo,
                item_imagem: p.item_imagem,
                ultima_pergunta: p, // a mais recente (já que a lista vem ordenada)
                total: 1,
                todas: [p]
            });
        } else {
            const grupo = grupos.get(chave);
            grupo.total++;
            grupo.todas.push(p);
            // Atualizar última pergunta (a mais recente, que é a primeira do array)
            if (new Date(p.data_pergunta) > new Date(grupo.ultima_pergunta.data_pergunta)) {
                grupo.ultima_pergunta = p;
            }
        }
    }
    
    // Retorna array com um objeto por grupo, ordenado pela data da última pergunta
    return Array.from(grupos.values()).sort((a, b) => 
        new Date(b.ultima_pergunta.data_pergunta) - new Date(a.ultima_pergunta.data_pergunta)
    );
}

// ============================================
// ABRIR MODAL COM HISTÓRICO DE PERGUNTAS
// ============================================
window.abrirHistoricoPerguntas = function(compradorNome, itemId) {
    // Filtrar todas as perguntas desse comprador e item
    const perguntasDoGrupo = perguntas.filter(p => 
        p.comprador_nome === compradorNome && p.item_id === itemId
    ).sort((a, b) => new Date(a.data_pergunta) - new Date(b.data_pergunta)); // ordem cronológica
    
    if (perguntasDoGrupo.length === 0) {
        showToast('Nenhuma pergunta encontrada para este comprador.', 'warning');
        return;
    }
    
    const content = document.getElementById('historicoPerguntasContent');
    const tituloItem = perguntasDoGrupo[0].item_titulo || 'Anúncio';
    
    // Montar HTML do histórico
    let html = `
        <div style="margin-bottom: 20px; padding: 10px; background: #f8f9fa; border-radius: 8px;">
            <strong><i class="fas fa-user"></i> Comprador:</strong> ${escapeHtml(compradorNome)}<br>
            <strong><i class="fas fa-box"></i> Produto:</strong> ${escapeHtml(tituloItem)}<br>
            <strong><i class="fas fa-comments"></i> Total de perguntas:</strong> ${perguntasDoGrupo.length}
        </div>
        <div class="timeline-historico">
    `;
    
    for (const p of perguntasDoGrupo) {
        const dataPergunta = new Date(p.data_pergunta).toLocaleString('pt-BR');
        const status = p.status === 'respondida' ? 'Respondida' : 'Não respondida';
        const respostaHtml = p.resposta ? `
            <div style="margin-top: 8px; padding: 8px; background: #e8f5e9; border-radius: 6px;">
                <i class="fas fa-reply" style="color: #28a745;"></i>
                <strong>Resposta:</strong> ${escapeHtml(p.resposta)}<br>
                <small>${new Date(p.data_resposta).toLocaleString('pt-BR')}</small>
            </div>
        ` : '';
        
        html += `
            <div class="historico-item" style="border-left: 3px solid ${p.status === 'respondida' ? '#28a745' : '#ffc107'}; padding: 12px; margin-bottom: 15px; background: white; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                    <strong style="color: #495057;">📅 ${dataPergunta}</strong>
                    <span class="badge ${p.status === 'respondida' ? 'badge-success' : 'badge-warning'}">${status}</span>
                </div>
                <div style="margin-bottom: 8px;">
                    <strong>Pergunta:</strong> ${escapeHtml(p.pergunta)}
                </div>
                ${respostaHtml}
            </div>
        `;
    }
    
    html += `</div>`;
    content.innerHTML = html;
    
    document.getElementById('modalHistoricoPerguntas').classList.remove('hidden');
};

window.fecharModalHistorico = function() {
    document.getElementById('modalHistoricoPerguntas').classList.add('hidden');
};

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