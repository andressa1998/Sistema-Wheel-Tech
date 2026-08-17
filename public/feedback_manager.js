// ============================================
// SISTEMA DE FEEDBACK - 5 ESTRELAS POR TÓPICO
// ============================================

console.log('📝 feedback_manager.js carregado');

let feedbacks = [];
let sugestoes = [];
let notasTopicos = {}; // { topico: nota (1-5) }

// ===== LISTA COMPLETA DE TÓPICOS POR CATEGORIA =====
const TOPICOS_POR_CATEGORIA = [
  {
    categoria: 'Esforço',
    topicos: [
      'Pontualidade', 'Comunicação', 'Organização e disciplina / 5S', 'Proatividade',
      'Criatividade', 'Interesse em aprender', 'Flexibilidade', 'Compartilhamento de conhecimento', 'Capacidade de priorização'
    ]
  },
  {
    categoria: 'Desempenho',
    topicos: [
      'Trabalho em equipe', 'Eficiência', 'Gestão de tempo', 'Cumprimento de prazos', 'Atenção aos detalhes'
    ]
  }
];

// ===== ABRIR SISTEMA =====
window.abrirSistemaFeedback = function() {
  if (!window.currentUser) {
    showToast('⚠️ Faça login primeiro', 'warning');
    return;
  }

  const menuSystem = document.getElementById('menuSystem');
  if (menuSystem) menuSystem.classList.add('hidden');

  const sistemas = ['mainSystem','salesSystem','reembolsosSystem','precificacaoSystem','caixaSystem',
                    'reviewsSystem','folgasSystem','shippingSystem','estoqueSystem', 'promocoesSystem',
                    'estoqueGestaoSystem','nfeSystem'];
  sistemas.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  });

  const feedbackSystem = document.getElementById('feedbackSystem');
  if (feedbackSystem) feedbackSystem.classList.remove('hidden');

  document.getElementById('feedbackUserName').textContent = window.currentUser.name;
  document.getElementById('feedbackUserAvatar').textContent = window.currentUser.avatar;
  document.getElementById('feedbackUserRole').textContent = window.currentUser.role;

  const btnNovo = document.getElementById('btnNovoFeedback');
  if (btnNovo) {
    btnNovo.style.display = (window.currentUser.role === 'Administrador') ? 'inline-flex' : 'none';
  }

  popularSelectUsuarios();
  carregarFeedbacks();
  carregarSugestoes();
  showToast('💬 Sistema de Feedback carregado', 'info');
};

// ===== POPULAR SELECTS =====
function popularSelectUsuarios() {
  const select = document.getElementById('feedbackUsuario');
  if (!select) return;
  select.innerHTML = '<option value="">Selecione</option>';
  let usuarios = window.SYSTEM_USERS || [];
  let nomes = [];
  if (usuarios.length > 0) {
    nomes = usuarios.map(u => u.name);
  } else {
    nomes = ['Elaine', 'Arthur', 'Laura', 'Ronald', 'Bruna', 'Andressa', 'Thalyta', 'Leticia', 'Mirella', 'Suelen'];
  }
  nomes.forEach(n => {
    select.innerHTML += `<option value="${n}">${n}</option>`;
  });

  const filtroSelect = document.getElementById('filtroFeedbackUsuario');
  if (filtroSelect) {
    filtroSelect.innerHTML = '<option value="">Todos os usuários</option>';
    nomes.forEach(n => {
      filtroSelect.innerHTML += `<option value="${n}">${n}</option>`;
    });
  }
}

// ===== CARREGAR FEEDBACKS =====
async function carregarFeedbacks() {
  if (!window.supabaseClient) {
    showToast('Erro: Supabase não conectado', 'error');
    return;
  }
  try {
    const { data, error } = await window.supabaseClient
      .from('feedbacks')
      .select('*')
      .order('data_criacao', { ascending: false });
    if (error) throw error;
    feedbacks = data || [];
    renderizarFeedbacks();
    atualizarResumo();
  } catch (error) {
    console.error('Erro ao carregar feedbacks:', error);
    showToast('Erro ao carregar feedbacks', 'error');
  }
}

// ===== RENDERIZAR FEEDBACKS =====
function renderizarFeedbacks() {
  const container = document.getElementById('feedbacksContainer');
  if (!container) return;
  const isAdmin = window.currentUser?.role === 'Administrador';
  let lista = feedbacks;
  const filtroUsuario = document.getElementById('filtroFeedbackUsuario')?.value || '';
  const filtroTipo = document.getElementById('filtroFeedbackTipo')?.value || '';
  const filtroEstrela = document.getElementById('filtroFeedbackEstrela')?.value || '';
  if (!isAdmin) {
    lista = lista.filter(f => f.usuario_nome === window.currentUser.name);
  }
  if (filtroUsuario && isAdmin) {
    lista = lista.filter(f => f.usuario_nome === filtroUsuario);
  }
  if (filtroTipo) {
    lista = lista.filter(f => f.tipo === filtroTipo);
  }
  if (filtroEstrela) {
    lista = lista.filter(f => f.estrela === filtroEstrela);
  }
  document.getElementById('contadorFeedbacks').textContent = lista.length;
  if (lista.length === 0) {
    container.innerHTML = `<div class="text-center py-5 text-muted">Nenhum feedback encontrado.</div>`;
    return;
  }
  let html = '';
  lista.forEach(fb => {
    const dataCriacao = new Date(fb.data_criacao).toLocaleString('pt-BR');
    const podeResponder = (fb.usuario_nome === window.currentUser.name) || isAdmin;
    const jaRespondeu = fb.respondido;
    let estrelaHtml = '', estrelaCor = '';
    if (fb.estrela === 'ruim') { estrelaHtml = '★'; estrelaCor = '#dc3545'; }
    else if (fb.estrela === 'bom') { estrelaHtml = '★'; estrelaCor = '#28a745'; }
    else if (fb.estrela === 'excelente') { estrelaHtml = '★'; estrelaCor = '#007bff'; }

    let topicosHtml = '';
    if (fb.topicos && typeof fb.topicos === 'object') {
      topicosHtml = '<ul class="list-unstyled small">';
      for (let [topico, nota] of Object.entries(fb.topicos)) {
        const estrelas = '★'.repeat(nota) + '☆'.repeat(5 - nota);
        topicosHtml += `<li><strong>${topico}:</strong> ${estrelas} (${nota}/5)</li>`;
      }
      topicosHtml += '</ul>';
    }

    let notaMediaHtml = '';
    if (fb.tipo === 'mensal' && fb.nota_media !== null) {
      notaMediaHtml = `<span class="badge badge-info">Média: ${fb.nota_media.toFixed(1)}</span>`;
    }

    html += `
      <div class="card mb-3" style="border-left: 4px solid ${estrelaCor || '#6c757d'};">
        <div class="card-body">
          <div class="d-flex justify-content-between align-items-start">
            <div>
              <h5 class="card-title">
                <i class="fas fa-user"></i> <strong>${escapeHtml(fb.usuario_nome)}</strong>
                <span class="badge badge-${fb.tipo === 'mensal' ? 'primary' : 'secondary'}">${fb.tipo === 'mensal' ? 'Mensal' : 'Pontual'}</span>
                ${fb.estrela ? `<span style="font-size:1.5rem; color:${estrelaCor};">${estrelaHtml}</span>` : ''}
                ${notaMediaHtml}
              </h5>
              <div class="small text-muted">Criado por ${escapeHtml(fb.criado_por)} em ${dataCriacao}</div>
            </div>
            <div>
              ${!jaRespondeu && podeResponder ? `<button class="btn btn-primary btn-sm" onclick="abrirModalResponderFeedback('${fb.id}')"><i class="fas fa-reply"></i> Responder</button>` : ''}
              ${isAdmin ? `<button class="btn btn-danger btn-sm" onclick="excluirFeedback('${fb.id}')"><i class="fas fa-trash"></i></button>` : ''}
            </div>
          </div>
          ${fb.texto ? `<p class="card-text">${escapeHtml(fb.texto)}</p>` : ''}
          ${fb.pontos_positivos ? `<div><strong>✅ Positivos:</strong> ${escapeHtml(fb.pontos_positivos)}</div>` : ''}
          ${fb.pontos_negativos ? `<div><strong>❌ Negativos:</strong> ${escapeHtml(fb.pontos_negativos)}</div>` : ''}
          ${fb.pontos_melhorar ? `<div><strong>📈 A melhorar:</strong> ${escapeHtml(fb.pontos_melhorar)}</div>` : ''}
          ${topicosHtml}
          ${fb.respondido ? `<div class="alert alert-success mt-2"><i class="fas fa-check-circle"></i> Usuário respondeu a este feedback.</div>` : ''}
          <div id="respostas-${fb.id}" class="mt-2"></div>
        </div>
      </div>
    `;
  });
  container.innerHTML = html;
  lista.forEach(fb => carregarRespostas(fb.id));
}

// ===== CARREGAR RESPOSTAS =====
async function carregarRespostas(feedbackId) {
  try {
    const { data, error } = await window.supabaseClient
      .from('feedback_respostas')
      .select('*')
      .eq('feedback_id', feedbackId)
      .order('data_resposta', { ascending: true });
    if (error) throw error;
    const container = document.getElementById(`respostas-${feedbackId}`);
    if (!container) return;
    if (!data || data.length === 0) {
      container.innerHTML = '';
      return;
    }
    let html = '<hr><div class="small"><strong>Respostas:</strong></div>';
    data.forEach(r => {
      html += `
        <div class="bg-light p-2 rounded mb-1">
          <strong>${escapeHtml(r.usuario_nome)}</strong> 
          <span class="text-muted">${new Date(r.data_resposta).toLocaleString('pt-BR')}</span>
          <p class="mb-0">${escapeHtml(r.resposta)}</p>
        </div>
      `;
    });
    container.innerHTML = html;
  } catch (error) {
    console.error('Erro ao carregar respostas:', error);
  }
}

function atualizarResumo() {
  const el = document.getElementById('feedbackResumo');
  if (!el) return;
  const total = feedbacks.length;
  const pendentes = feedbacks.filter(f => !f.respondido && f.usuario_nome === window.currentUser?.name).length;
  const mensais = feedbacks.filter(f => f.tipo === 'mensal').length;
  el.textContent = `Total: ${total} | Pendentes: ${pendentes} | Mensais: ${mensais}`;
}

// ============================================
// GERAR TÓPICOS COM 5 ESTRELAS
// ============================================
function gerarTopicos() {
  const container = document.getElementById('containerTopicos');
  if (!container) return;
  container.innerHTML = '';
  notasTopicos = {};

  TOPICOS_POR_CATEGORIA.forEach(cat => {
    const catHeader = document.createElement('h6');
    catHeader.className = 'mt-3 mb-2';
    catHeader.innerHTML = `<i class="fas fa-tag"></i> ${cat.categoria}`;
    container.appendChild(catHeader);

    const grid = document.createElement('div');
    grid.className = 'row g-2';
    cat.topicos.forEach(topico => {
      const col = document.createElement('div');
      col.className = 'col-md-6';
      col.innerHTML = `
        <div class="form-group mb-1 d-flex align-items-center justify-content-between">
          <label class="mb-0" style="font-size:0.9rem; flex:1;"><strong>${topico}</strong></label>
          <div class="estrelas-topico" data-topico="${topico}" style="display:flex; gap:2px; font-size:1.6rem;">
            ${[1,2,3,4,5].map(n => `
              <span class="star-topico" data-nota="${n}" style="cursor:pointer; color:#ccc; transition:0.2s;" onclick="window.definirNotaTopico('${topico}', ${n})">★</span>
            `).join('')}
          </div>
          <input type="hidden" class="nota-topico" data-topico="${topico}" value="0">
        </div>
      `;
      grid.appendChild(col);
    });
    container.appendChild(grid);
  });
}

// ===== DEFINIR NOTA DE UM TÓPICO =====
window.definirNotaTopico = function(topico, nota) {
  notasTopicos[topico] = nota;
  // Atualizar visual
  const container = document.querySelector(`.estrelas-topico[data-topico="${topico}"]`);
  if (container) {
    container.querySelectorAll('.star-topico').forEach(star => {
      const n = parseInt(star.dataset.nota);
      star.style.color = (n <= nota) ? '#ffc107' : '#ccc';
      star.style.transform = (n === nota) ? 'scale(1.2)' : 'scale(1)';
    });
  }
  const hidden = document.querySelector(`.nota-topico[data-topico="${topico}"]`);
  if (hidden) hidden.value = nota;
  calcularEstatisticas();
};

// ===== CALCULAR MÉDIA E DEFINIR ESTRELA GERAL =====
function calcularEstatisticas() {
  const notas = Object.values(notasTopicos).filter(n => n > 0);
  const total = notas.length;
  if (total === 0) {
    document.getElementById('feedbackNotaMedia').value = '--';
    document.querySelectorAll('.estrela-opcao').forEach(el => {
      el.classList.remove('selected');
      el.style.color = '#ccc';
    });
    return;
  }

  const soma = notas.reduce((a, b) => a + b, 0);
  const media = soma / total;
  document.getElementById('feedbackNotaMedia').value = media.toFixed(1);

  // Definir estrela geral baseada na média
  let cor = '';
  let valor = '';
  if (media < 3) {
    valor = 'ruim';
    cor = '#dc3545';
  } else if (media < 4) {
    valor = 'bom';
    cor = '#28a745';
  } else {
    valor = 'excelente';
    cor = '#007bff';
  }

  document.querySelectorAll('.estrela-opcao').forEach(el => {
    const isSelected = el.dataset.valor === valor;
    el.classList.toggle('selected', isSelected);
    el.style.color = isSelected ? cor : '#ccc';
  });

  window._estrelaSelecionada = valor;
}

// ============================================
// ABRIR / FECHAR MODAL NOVO FEEDBACK
// ============================================
window.abrirModalNovoFeedback = function() {
  if (window.currentUser?.role !== 'Administrador') {
    showToast('Apenas administradores podem criar feedbacks', 'warning');
    return;
  }
  document.getElementById('modalFeedbackTitle').textContent = 'Novo Feedback';
  document.getElementById('editFeedbackId').value = '';
  document.getElementById('formNovoFeedback').reset();
  document.getElementById('camposMensal').classList.add('hidden');
  document.getElementById('feedbackNotaMedia').value = '--';
  document.querySelectorAll('.estrela-opcao').forEach(el => {
    el.classList.remove('selected');
    el.style.color = '#ccc';
  });
  notasTopicos = {};
  gerarTopicos();
  document.getElementById('modalNovoFeedback').classList.remove('hidden');
};

window.fecharModalNovoFeedback = function() {
  document.getElementById('modalNovoFeedback').classList.add('hidden');
};

// ===== EVENTO CHANGE PARA TIPO =====
document.addEventListener('change', function(e) {
  if (e.target.id === 'feedbackTipo') {
    const campos = document.getElementById('camposMensal');
    if (e.target.value === 'mensal') {
      campos.classList.remove('hidden');
      const container = document.getElementById('containerTopicos');
      if (container && container.children.length === 0) {
        gerarTopicos();
      }
    } else {
      campos.classList.add('hidden');
    }
  }
});

// ===== SALVAR FEEDBACK =====
document.getElementById('formNovoFeedback')?.addEventListener('submit', async function(e) {
  e.preventDefault();

  const usuario = document.getElementById('feedbackUsuario').value;
  const tipo = document.getElementById('feedbackTipo').value;
  const texto = document.getElementById('feedbackTexto').value.trim();
  const positivos = document.getElementById('feedbackPositivos').value.trim();
  const negativos = document.getElementById('feedbackNegativos').value.trim();
  const melhorar = document.getElementById('feedbackMelhorar').value.trim();

  if (!usuario) {
    showToast('Selecione um usuário', 'warning');
    return;
  }

  let estrela = null, topicos = null, notaMedia = null;

  if (tipo === 'mensal') {
    const todasNotas = Object.values(notasTopicos);
    const totalTopicos = TOPICOS_POR_CATEGORIA.reduce((acc, cat) => acc + cat.topicos.length, 0);
    if (todasNotas.length < totalTopicos || todasNotas.some(n => n === 0)) {
      showToast('Avalie todos os tópicos com uma nota (1 a 5 estrelas)', 'warning');
      return;
    }
    const estrelaGeral = window._estrelaSelecionada;
    if (!estrelaGeral) {
      showToast('Erro ao calcular a estrela geral', 'error');
      return;
    }
    estrela = estrelaGeral;
    topicos = { ...notasTopicos };
    const soma = todasNotas.reduce((a, b) => a + b, 0);
    notaMedia = soma / todasNotas.length;
  }

  const dados = {
    usuario_nome: usuario,
    tipo,
    texto: texto || null,
    pontos_positivos: positivos || null,
    pontos_negativos: negativos || null,
    pontos_melhorar: melhorar || null,
    estrela: estrela,
    topicos: topicos,
    nota_media: notaMedia,
    criado_por: window.currentUser.name,
    respondido: false,
    data_criacao: new Date().toISOString()
  };

  try {
    const { error } = await window.supabaseClient.from('feedbacks').insert([dados]);
    if (error) throw error;
    showToast('✅ Feedback criado!', 'success');
    window.fecharModalNovoFeedback();
    carregarFeedbacks();
  } catch (error) {
    console.error('Erro ao salvar feedback:', error);
    showToast('Erro ao salvar: ' + error.message, 'error');
  }
});

// ============================================
// RESPONDER FEEDBACK
// ============================================
window.abrirModalResponderFeedback = async function(feedbackId) {
  const fb = feedbacks.find(f => f.id == feedbackId);
  if (!fb) { showToast('Feedback não encontrado', 'error'); return; }
  document.getElementById('respostaFeedbackId').value = feedbackId;
  document.getElementById('respostaFeedbackTexto').innerHTML = `
    <strong>${escapeHtml(fb.usuario_nome)}</strong> - ${fb.texto || 'Sem texto'}<br>
    <span class="text-muted">${new Date(fb.data_criacao).toLocaleString('pt-BR')}</span>
  `;
  document.getElementById('respostaTexto').value = '';
  document.getElementById('modalResponderFeedback').classList.remove('hidden');
};

window.fecharModalResponderFeedback = function() {
  document.getElementById('modalResponderFeedback').classList.add('hidden');
};

window.enviarRespostaFeedback = async function() {
  const feedbackId = document.getElementById('respostaFeedbackId').value;
  const resposta = document.getElementById('respostaTexto').value.trim();
  if (!resposta) { showToast('Digite sua resposta', 'warning'); return; }
  try {
    const { error: insertError } = await window.supabaseClient.from('feedback_respostas').insert([{
      feedback_id: feedbackId,
      usuario_nome: window.currentUser.name,
      resposta: resposta,
      data_resposta: new Date().toISOString()
    }]);
    if (insertError) throw insertError;
    await window.supabaseClient.from('feedbacks').update({ respondido: true }).eq('id', feedbackId);
    showToast('✅ Resposta enviada!', 'success');
    window.fecharModalResponderFeedback();
    carregarFeedbacks();
  } catch (error) {
    console.error('Erro ao enviar resposta:', error);
    showToast('Erro: ' + error.message, 'error');
  }
};

window.excluirFeedback = async function(feedbackId) {
  if (!confirm('Excluir este feedback?')) return;
  try {
    await window.supabaseClient.from('feedbacks').delete().eq('id', feedbackId);
    showToast('🗑️ Feedback excluído', 'success');
    carregarFeedbacks();
  } catch (error) {
    console.error('Erro ao excluir:', error);
    showToast('Erro: ' + error.message, 'error');
  }
};

// ============================================
// SUGESTÕES DE MELHORIA
// ============================================
async function carregarSugestoes() {
  if (!window.supabaseClient) return;
  try {
    const { data, error } = await window.supabaseClient.from('feedback_sugestoes').select('*').order('data_criacao', { ascending: false });
    if (error) throw error;
    sugestoes = data || [];
    renderizarSugestoes();
  } catch (error) {
    console.error('Erro ao carregar sugestões:', error);
  }
}

function renderizarSugestoes() {
  const container = document.getElementById('sugestoesContainer');
  if (!container) return;
  const isAdmin = window.currentUser?.role === 'Administrador';
  let lista = sugestoes;
  if (!isAdmin) lista = lista.filter(s => s.usuario_nome === window.currentUser.name);
  if (lista.length === 0) {
    container.innerHTML = `<div class="text-center py-5 text-muted">Nenhuma sugestão enviada.</div>`;
    return;
  }
  let html = '';
  lista.forEach(s => {
    const data = new Date(s.data_criacao).toLocaleString('pt-BR');
    const implementada = s.implementada;
    const badgeImplementada = implementada ? '<span class="badge badge-success"><i class="fas fa-check"></i> Implementada</span>' : '<span class="badge badge-warning">Pendente</span>';
    html += `
      <div class="card mb-2">
        <div class="card-body d-flex justify-content-between align-items-center">
          <div>
            <div><strong>${escapeHtml(s.usuario_nome)}</strong> - ${data}</div>
            <p class="mb-0">${escapeHtml(s.sugestao)}</p>
            ${s.implementada_por ? `<small class="text-muted">Implementada por ${escapeHtml(s.implementada_por)} em ${new Date(s.data_implementacao).toLocaleString('pt-BR')}</small>` : ''}
          </div>
          <div class="text-right">
            ${badgeImplementada}
            ${isAdmin && !implementada ? `<button class="btn btn-sm btn-primary ml-2" onclick="marcarSugestaoImplementada('${s.id}')"><i class="fas fa-check"></i> Marcar como implementada</button>` : ''}
            ${isAdmin ? `<button class="btn btn-sm btn-danger ml-2" onclick="excluirSugestao('${s.id}')"><i class="fas fa-trash"></i></button>` : ''}
          </div>
        </div>
      </div>
    `;
  });
  container.innerHTML = html;
}

window.abrirModalSugestao = function() {
  document.getElementById('sugestaoTexto').value = '';
  document.getElementById('modalNovaSugestao').classList.remove('hidden');
};
window.fecharModalNovaSugestao = function() {
  document.getElementById('modalNovaSugestao').classList.add('hidden');
};
window.enviarSugestao = async function() {
  const texto = document.getElementById('sugestaoTexto').value.trim();
  if (!texto) { showToast('Digite sua sugestão', 'warning'); return; }
  try {
    await window.supabaseClient.from('feedback_sugestoes').insert([{
      usuario_nome: window.currentUser.name,
      sugestao: texto,
      data_criacao: new Date().toISOString(),
      implementada: false
    }]);
    showToast('✅ Sugestão enviada!', 'success');
    window.fecharModalNovaSugestao();
    carregarSugestoes();
  } catch (error) {
    console.error('Erro ao enviar sugestão:', error);
    showToast('Erro: ' + error.message, 'error');
  }
};
window.marcarSugestaoImplementada = async function(id) {
  if (!confirm('Confirmar que esta sugestão foi implementada?')) return;
  try {
    await window.supabaseClient.from('feedback_sugestoes').update({
      implementada: true,
      implementada_por: window.currentUser.name,
      data_implementacao: new Date().toISOString()
    }).eq('id', id);
    showToast('✅ Sugestão implementada!', 'success');
    carregarSugestoes();
  } catch (error) {
    console.error('Erro:', error);
    showToast('Erro: ' + error.message, 'error');
  }
};
window.excluirSugestao = async function(id) {
  if (!confirm('Excluir esta sugestão?')) return;
  try {
    await window.supabaseClient.from('feedback_sugestoes').delete().eq('id', id);
    showToast('🗑️ Sugestão excluída', 'success');
    carregarSugestoes();
  } catch (error) {
    console.error('Erro:', error);
    showToast('Erro: ' + error.message, 'error');
  }
};

// ============================================
// FILTROS
// ============================================
window.aplicarFiltrosFeedback = function() { renderizarFeedbacks(); };
window.limparFiltrosFeedback = function() {
  document.getElementById('filtroFeedbackUsuario').value = '';
  document.getElementById('filtroFeedbackTipo').value = '';
  document.getElementById('filtroFeedbackEstrela').value = '';
  renderizarFeedbacks();
};

// ============================================
// UTILITÁRIO
// ============================================
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

console.log('✅ feedback_manager.js carregado com sucesso');