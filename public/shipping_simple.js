// shipping_simple.js - VERSÃO COMPLETA COM CÁLCULO DE FRETE, EDIÇÃO DE PESO E RECLAMAÇÕES
console.log('🚚 shipping_simple.js carregado (v19 - com tabela de fretes e reclamações)');

if (typeof window.WORKER_URL === 'undefined') {
    window.WORKER_URL = 'https://purple-bonus-3b1c.andmiotto1998.workers.dev';
}

// ============================================
// TABELA DE CUSTOS DE FRETE (fornecida)
// ============================================
const SHIPPING_COST_TABLE = [
    { priceMin: 0,    priceMax: 18.99,   weightMin: 0,    weightMax: 0.3,   cost: 5.65 },
    { priceMin: 19,    priceMax: 48.99,   weightMin: 0,    weightMax: 0.3,   cost: 6.55 },
    { priceMin: 49,    priceMax: 78.99,   weightMin: 0,    weightMax: 0.3,   cost: 7.75 },
    { priceMin: 79,    priceMax: 99.99,   weightMin: 0,    weightMax: 0.3,   cost: 12.35 },
    { priceMin: 100,    priceMax: 119.99,   weightMin: 0,    weightMax: 0.3,   cost: 14.35 },
    { priceMin: 120,    priceMax: 149.99,   weightMin: 0,    weightMax: 0.3,   cost: 16.45 },
    { priceMin: 150,    priceMax: 199.99,   weightMin: 0,    weightMax: 0.3,   cost: 18.45 },
    { priceMin: 200,    priceMax: 10000,   weightMin: 0,    weightMax: 0.3,   cost: 20.95 },
    { priceMin: 0,    priceMax: 18.99,   weightMin: 0.3,    weightMax: 0.5,   cost: 5.95 },
    { priceMin: 19,    priceMax: 48.99,   weightMin: 0.3,    weightMax: 0.5,   cost: 6.65 },
    { priceMin: 49,    priceMax: 78.99,   weightMin: 0.3,    weightMax: 0.5,   cost: 7.85 },
    { priceMin: 79,    priceMax: 99.99,   weightMin: 0.3,    weightMax: 0.5,   cost: 13.25 },
    { priceMin: 100,    priceMax: 119.99,   weightMin: 0.3,    weightMax: 0.5,   cost: 15.45 },
    { priceMin: 120,    priceMax: 149.99,   weightMin: 0.3,    weightMax: 0.5,   cost: 17.65 },
    { priceMin: 150,    priceMax: 199.99,   weightMin: 0.3,    weightMax: 0.5,   cost: 19.85 },
    { priceMin: 200,    priceMax: 10000,   weightMin: 0.3,    weightMax: 0.5,   cost: 22.55 },
    { priceMin: 0,    priceMax: 18.99,   weightMin: 0.5,    weightMax: 1,   cost: 6.05 },
    { priceMin: 19,    priceMax: 48.99,   weightMin: 0.5,    weightMax: 1,   cost: 6.75 },
    { priceMin: 49,    priceMax: 78.99,   weightMin: 0.5,    weightMax: 1,   cost: 7.95 },
    { priceMin: 79,    priceMax: 99.99,   weightMin: 0.5,    weightMax: 1,   cost: 13.85 },
    { priceMin: 100,    priceMax: 119.99,   weightMin: 0.5,    weightMax: 1,   cost: 16.15 },
    { priceMin: 120,    priceMax: 149.99,   weightMin: 0.5,    weightMax: 1,   cost: 18.45 },
    { priceMin: 150,    priceMax: 199.99,   weightMin: 0.5,    weightMax: 1,   cost: 20.75 },
    { priceMin: 200,    priceMax: 10000,   weightMin: 0.5,    weightMax: 1,   cost: 23.65 },
    { priceMin: 0,    priceMax: 18.99,   weightMin: 1,    weightMax: 1.5,   cost: 6.15 },
    { priceMin: 19,    priceMax: 48.99,   weightMin: 1,    weightMax: 1.5,   cost: 6.85 },
    { priceMin: 49,    priceMax: 78.99,   weightMin: 1,    weightMax: 1.5,   cost: 8.05 },
    { priceMin: 79,    priceMax: 99.99,   weightMin: 1,    weightMax: 1.5,   cost: 14.15 },
    { priceMin: 100,    priceMax: 119.99,   weightMin: 1,    weightMax: 1.5,   cost: 16.45 },
    { priceMin: 120,    priceMax: 149.99,   weightMin: 1,    weightMax: 1.5,   cost: 18.85 },
    { priceMin: 150,    priceMax: 199.99,   weightMin: 1,    weightMax: 1.5,   cost: 21.15 },
    { priceMin: 200,    priceMax: 10000,   weightMin: 1,    weightMax: 1.5,   cost: 24.65 },
    { priceMin: 0,    priceMax: 18.99,   weightMin: 1.5,    weightMax: 2,   cost: 6.25 },
    { priceMin: 19,    priceMax: 48.99,   weightMin: 1.5,    weightMax: 2,   cost: 6.95 },
    { priceMin: 49,    priceMax: 78.99,   weightMin: 1.5,    weightMax: 2,   cost: 8.15 },
    { priceMin: 79,    priceMax: 99.99,   weightMin: 1.5,    weightMax: 2,   cost: 14.45 },
    { priceMin: 100,    priceMax: 119.99,   weightMin: 1.5,    weightMax: 2,   cost: 16.85 },
    { priceMin: 120,    priceMax: 149.99,   weightMin: 1.5,    weightMax: 2,   cost: 19.25 },
    { priceMin: 150,    priceMax: 199.99,   weightMin: 1.5,    weightMax: 2,   cost: 21.65 },
    { priceMin: 200,    priceMax: 10000,   weightMin: 1.5,    weightMax: 2,   cost: 24.65 }
];

// ============================================
// FUNÇÃO PARA CALCULAR FRETE ESPERADO
// ============================================
function calcularFreteEsperado(valorProduto, peso) {
    // Arredonda peso para 2 casas para comparação
    const pesoArredondado = Math.round(peso * 100) / 100;
    const valor = parseFloat(valorProduto);
    if (isNaN(valor) || isNaN(pesoArredondado) || pesoArredondado <= 0) return null;

    // Encontra a faixa que atende valor e peso
    for (const faixa of SHIPPING_COST_TABLE) {
        const pesoMin = faixa.weightMin;
        const pesoMax = faixa.weightMax;
        // Considera que pesoMax é inclusivo (<=)
        if (pesoArredondado >= pesoMin && pesoArredondado <= pesoMax) {
            if (valor >= faixa.priceMin && valor <= faixa.priceMax) {
                return faixa.cost;
            }
        }
    }
    return null; // Não encontrou faixa
}

// ============================================
// FUNÇÃO AUXILIAR PARA IDENTIFICAR FULL
// ============================================
function isFullByAnyField(item) {
    const text = `${item.titulo || ''} ${item.mlb || ''} ${item.id || ''}`.toLowerCase();
    return /full|fulfillment/.test(text);
}

// ============================================
// CARREGAR FRETES SALVOS (COM NÚMERO DA VENDA)
// ============================================
async function carregarFretesSalvos() {
    console.log('📂 Carregando fretes salvos com análise...');
    const tbody = document.getElementById('shippingSimpleBody');
    const contagem = document.getElementById('contagemFretes');
    if (!tbody) return;

    try {
        if (!window.supabaseClient) throw new Error('Supabase não inicializado');

        const { data, error } = await window.supabaseClient
            .from('fretes_ml')
            .select('*')
            .order('data_venda', { ascending: false })
            .limit(500);

        if (error) throw error;

        // Buscar reclamações existentes
        const { data: reclamacoes, error: errRecl } = await window.supabaseClient
            .from('reclamacoes_frete')
            .select('venda_id, status')
            .eq('status', 'aberto');

        const reclamacoesMap = {};
        if (reclamacoes) {
            reclamacoes.forEach(r => {
                reclamacoesMap[r.venda_id] = r.status;
            });
        }

        // Filtrar FULL
        const dadosFiltrados = (data || []).filter(item => {
            if (item.tipo_envio === 'FULL') return false;
            if (isFullByAnyField(item)) return false;
            if (item.titulo && /full|fulfillment/i.test(item.titulo)) return false;
            if (item.mlb && /full|fulfillment/i.test(item.mlb)) return false;
            return true;
        });

        const removidos = (data || []).length - dadosFiltrados.length;
        if (removidos > 0) {
            console.log(`🧹 ${removidos} registros FULL removidos da exibição`);
        }

        if (dadosFiltrados.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" class="text-center">Nenhum frete válido (FULL removidos).</td></tr>';
            if (contagem) contagem.textContent = '0 registros';
            return;
        }

        tbody.innerHTML = '';
        dadosFiltrados.forEach(item => {
            const row = document.createElement('tr');

            // Peso padrão 0.3
            let peso = item.peso_estimado || 0.3;
            const valorProduto = item.valor_produto || 0;
            const freteCobrado = item.frete_cobrado || 0;

            // Calcular frete esperado
            const freteEsperado = calcularFreteEsperado(valorProduto, peso);
            let statusClass = 'secondary';
            let statusText = 'Não calculado';
            let diferenca = 0;

            if (freteEsperado !== null) {
                diferenca = freteCobrado - freteEsperado;
                const diffAbs = Math.abs(diferenca);
                if (diffAbs < 0.01) {
                    statusClass = 'success';
                    statusText = '✅ Correto';
                } else if (diferenca > 0) {
                    statusClass = 'danger';
                    statusText = `❌ Acima (R$ ${diferenca.toFixed(2)})`;
                } else {
                    statusClass = 'warning';
                    statusText = `⚠️ Abaixo (R$ ${Math.abs(diferenca).toFixed(2)})`;
                }
            }

            const temReclamacao = reclamacoesMap[item.id] === 'aberto';
            const badgeReclamacao = temReclamacao
                ? '<span class="badge badge-info ml-1">Reclamação Aberta</span>'
                : '';

            // Badge tipo envio
            let badgeEnvio = '';
            const tipo = (item.tipo_envio || 'N/I').toUpperCase();
            if (tipo.includes('FULL')) {
                badgeEnvio = '<span class="badge badge-danger">FULL</span>';
            } else if (tipo.includes('FLEX')) {
                badgeEnvio = '<span class="badge badge-warning">FLEX</span>';
            } else if (tipo.includes('MERCADO') || tipo.includes('ME')) {
                badgeEnvio = '<span class="badge badge-success">ME</span>';
            } else if (tipo.includes('CROSS')) {
                badgeEnvio = '<span class="badge badge-info">CROSS</span>';
            } else {
                badgeEnvio = `<span class="badge badge-secondary">${tipo}</span>`;
            }

            row.innerHTML = `
                <td><strong>${item.id}</strong></td>  <!-- NÚMERO DA VENDA -->
                <td>${item.titulo || 'Sem título'}</td>
                <td><code>${item.mlb || 'N/A'}</code></td>
                <td>R$ ${valorProduto.toFixed(2)}</td>
                <td>
                    <input type="number" class="form-control form-control-sm peso-input" 
                           value="${peso}" step="0.01" min="0" 
                           data-venda-id="${item.id}" style="width: 80px;">
                </td>
                <td>R$ ${freteCobrado.toFixed(2)}</td>
                <td class="frete-esperado-cell">
                    ${freteEsperado !== null ? `R$ ${freteEsperado.toFixed(2)}` : 'N/A'}
                </td>
                <td>
                    <span class="badge badge-${statusClass} status-badge">${statusText}</span>
                    ${badgeReclamacao}
                </td>
                <td>
                    <button class="btn btn-sm btn-primary btn-reclamar" 
                            data-venda-id="${item.id}"
                            data-valor="${valorProduto}"
                            data-frete-cobrado="${freteCobrado}"
                            data-frete-esperado="${freteEsperado !== null ? freteEsperado : 0}"
                            ${temReclamacao ? 'disabled' : ''}>
                        <i class="fas fa-comment-dots"></i> Reclamar
                    </button>
                    ${temReclamacao ? `<button class="btn btn-sm btn-info btn-ver-reclamacao" data-venda-id="${item.id}"><i class="fas fa-eye"></i></button>` : ''}
                </td>
            `;

            tbody.appendChild(row);

            // Eventos (peso, reclamar, ver)
            const pesoInput = row.querySelector('.peso-input');
            if (pesoInput) {
                pesoInput.addEventListener('change', function() {
                    const novoPeso = parseFloat(this.value);
                    if (!isNaN(novoPeso) && novoPeso >= 0) {
                        atualizarLinhaAposPeso(row, item.id, novoPeso);
                    }
                });
            }

            const btnReclamar = row.querySelector('.btn-reclamar');
            if (btnReclamar) {
                btnReclamar.addEventListener('click', function() {
                    const vendaId = this.dataset.vendaId;
                    const valor = parseFloat(this.dataset.valor);
                    const freteCobrado = parseFloat(this.dataset.freteCobrado);
                    const freteEsperado = parseFloat(this.dataset.freteEsperado);
                    abrirModalReclamacao(vendaId, valor, freteCobrado, freteEsperado);
                });
            }

            const btnVerReclamacao = row.querySelector('.btn-ver-reclamacao');
            if (btnVerReclamacao) {
                btnVerReclamacao.addEventListener('click', function() {
                    const vendaId = this.dataset.vendaId;
                    verReclamacao(vendaId);
                });
            }
        });

        if (contagem) contagem.textContent = `${dadosFiltrados.length} registros`;
        console.log(`✅ ${dadosFiltrados.length} fretes carregados`);

    } catch (error) {
        console.error('❌ Erro ao carregar fretes:', error);
        tbody.innerHTML = `<tr><td colspan="9" class="text-center text-danger">Erro: ${error.message}</td></tr>`;
    }
}

// ============================================
// ATUALIZAR LINHA APÓS ALTERAÇÃO DE PESO
// ============================================
async function atualizarLinhaAposPeso(row, vendaId, novoPeso) {
    try {
        // Atualizar no banco de dados
        await window.supabaseClient
            .from('fretes_ml')
            .update({ peso_estimado: novoPeso })
            .eq('id', vendaId);

        // Recalcular frete esperado e status
        const valorCell = row.querySelector('td:nth-child(3)');
        const valorText = valorCell.textContent.replace('R$ ', '').replace(',', '.');
        const valorProduto = parseFloat(valorText);
        const freteCobradoCell = row.querySelector('td:nth-child(5)');
        const freteCobradoText = freteCobradoCell.textContent.replace('R$ ', '').replace(',', '.');
        const freteCobrado = parseFloat(freteCobradoText);

        const freteEsperado = calcularFreteEsperado(valorProduto, novoPeso);
        const freteEsperadoCell = row.querySelector('.frete-esperado-cell');
        const statusBadge = row.querySelector('.status-badge');

        if (freteEsperado !== null) {
            freteEsperadoCell.textContent = `R$ ${freteEsperado.toFixed(2)}`;
            const diferenca = freteCobrado - freteEsperado;
            const diffAbs = Math.abs(diferenca);
            let statusClass, statusText;
            if (diffAbs < 0.01) {
                statusClass = 'success';
                statusText = '✅ Correto';
            } else if (diferenca > 0) {
                statusClass = 'danger';
                statusText = `❌ Acima (R$ ${diferenca.toFixed(2)})`;
            } else {
                statusClass = 'warning';
                statusText = `⚠️ Abaixo (R$ ${Math.abs(diferenca).toFixed(2)})`;
            }
            statusBadge.className = `badge badge-${statusClass} status-badge`;
            statusBadge.textContent = statusText;

            // Atualizar dataset do botão reclamar
            const btnReclamar = row.querySelector('.btn-reclamar');
            if (btnReclamar) {
                btnReclamar.dataset.freteEsperado = freteEsperado;
            }
        } else {
            freteEsperadoCell.textContent = 'N/A';
            statusBadge.className = 'badge badge-secondary status-badge';
            statusBadge.textContent = 'Não calculado';
        }

        showToast(`Peso atualizado para ${novoPeso.toFixed(2)} kg`, 'success');
    } catch (error) {
        console.error('Erro ao atualizar peso:', error);
        showToast('Erro ao atualizar peso', 'error');
    }
}

// ============================================
// MODAL DE RECLAMAÇÃO
// ============================================
function abrirModalReclamacao(vendaId, valorProduto, freteCobrado, freteEsperado) {
    const modal = document.getElementById('modalReclamacaoFrete');
    if (!modal) {
        console.error('Modal de reclamação não encontrado');
        showToast('Erro: modal não encontrado', 'error');
        return;
    }

    const diferenca = freteCobrado - freteEsperado;
    // Preencher campos
    document.getElementById('reclamacaoVendaId').value = vendaId;
    document.getElementById('reclamacaoValorProduto').value = valorProduto.toFixed(2);
    document.getElementById('reclamacaoFreteCobrado').value = freteCobrado.toFixed(2);
    document.getElementById('reclamacaoFreteEsperado').value = freteEsperado.toFixed(2);
    document.getElementById('reclamacaoDiferenca').value = diferenca.toFixed(2);
    document.getElementById('reclamacaoStatus').value = 'aberto';
    document.getElementById('reclamacaoObservacoes').value = '';

    // Se já existir uma reclamação para esta venda, carregar
    carregarReclamacaoExistente(vendaId);

    modal.classList.remove('hidden');
}

async function carregarReclamacaoExistente(vendaId) {
    try {
        const { data, error } = await window.supabaseClient
            .from('reclamacoes_frete')
            .select('*')
            .eq('venda_id', vendaId)
            .order('data_criacao', { ascending: false })
            .limit(1);

        if (error) throw error;

        if (data && data.length > 0) {
            const recl = data[0];
            document.getElementById('reclamacaoId').value = recl.id;
            document.getElementById('reclamacaoStatus').value = recl.status;
            document.getElementById('reclamacaoObservacoes').value = recl.observacoes || '';
            document.getElementById('reclamacaoMotivo').value = recl.motivo || '';
            // Desabilitar campos que não devem ser editados? Não, pode editar.
        } else {
            document.getElementById('reclamacaoId').value = '';
            document.getElementById('reclamacaoMotivo').value = '';
        }
    } catch (error) {
        console.error('Erro ao carregar reclamação existente:', error);
    }
}

function fecharModalReclamacao() {
    document.getElementById('modalReclamacaoFrete').classList.add('hidden');
}

async function salvarReclamacao() {
    const vendaId = document.getElementById('reclamacaoVendaId').value;
    const valorProduto = parseFloat(document.getElementById('reclamacaoValorProduto').value);
    const freteCobrado = parseFloat(document.getElementById('reclamacaoFreteCobrado').value);
    const freteEsperado = parseFloat(document.getElementById('reclamacaoFreteEsperado').value);
    const diferenca = parseFloat(document.getElementById('reclamacaoDiferenca').value);
    const status = document.getElementById('reclamacaoStatus').value;
    const observacoes = document.getElementById('reclamacaoObservacoes').value.trim();
    const motivo = document.getElementById('reclamacaoMotivo').value.trim() || 'Diferença de frete';
    const reclId = document.getElementById('reclamacaoId').value;

    if (!vendaId) {
        showToast('Erro: venda não identificada', 'error');
        return;
    }

    const dados = {
        venda_id: vendaId,
        valor_produto: valorProduto,
        frete_cobrado: freteCobrado,
        frete_esperado: freteEsperado,
        diferenca: diferenca,
        motivo: motivo,
        status: status,
        observacoes: observacoes,
        atualizado_em: new Date().toISOString()
    };

    try {
        let result;
        if (reclId) {
            // Atualizar
            result = await window.supabaseClient
                .from('reclamacoes_frete')
                .update(dados)
                .eq('id', reclId);
        } else {
            // Inserir
            dados.data_criacao = new Date().toISOString();
            dados.criado_por = window.currentUser?.name || 'Sistema';
            result = await window.supabaseClient
                .from('reclamacoes_frete')
                .insert([dados]);
        }

        if (result.error) throw result.error;

        showToast('Reclamação salva com sucesso!', 'success');
        fecharModalReclamacao();
        // Recarregar a lista de fretes para atualizar badges
        carregarFretesSalvos();
    } catch (error) {
        console.error('Erro ao salvar reclamação:', error);
        showToast('Erro ao salvar: ' + error.message, 'error');
    }
}

// ============================================
// VER RECLAMAÇÃO (exibir detalhes em um modal ou alert)
// ============================================
async function verReclamacao(vendaId) {
    try {
        const { data, error } = await window.supabaseClient
            .from('reclamacoes_frete')
            .select('*')
            .eq('venda_id', vendaId)
            .order('data_criacao', { ascending: false });

        if (error) throw error;

        if (!data || data.length === 0) {
            showToast('Nenhuma reclamação encontrada para esta venda', 'info');
            return;
        }

        // Exibir em um modal simples ou alerta
        const recl = data[0];
        const msg = `
            Reclamação de Frete - Venda ${vendaId}
            -----------------------------------------
            Valor Produto: R$ ${recl.valor_produto.toFixed(2)}
            Frete Cobrado: R$ ${recl.frete_cobrado.toFixed(2)}
            Frete Esperado: R$ ${recl.frete_esperado.toFixed(2)}
            Diferença: R$ ${recl.diferenca.toFixed(2)}
            Status: ${recl.status}
            Motivo: ${recl.motivo || 'Não informado'}
            Observações: ${recl.observacoes || 'Nenhuma'}
            Criado em: ${new Date(recl.data_criacao).toLocaleString('pt-BR')}
            Última atualização: ${new Date(recl.atualizado_em).toLocaleString('pt-BR')}
            Criado por: ${recl.criado_por || 'Sistema'}
        `;
        alert(msg);
        // Poderia abrir o modal de edição com os dados carregados
        // Vamos abrir o modal de edição
        abrirModalReclamacao(vendaId, recl.valor_produto, recl.frete_cobrado, recl.frete_esperado);
        document.getElementById('reclamacaoId').value = recl.id;
        document.getElementById('reclamacaoStatus').value = recl.status;
        document.getElementById('reclamacaoObservacoes').value = recl.observacoes || '';
        document.getElementById('reclamacaoMotivo').value = recl.motivo || '';
    } catch (error) {
        console.error('Erro ao buscar reclamação:', error);
        showToast('Erro ao buscar reclamação', 'error');
    }
}

// ============================================
// LISTAR TODAS AS RECLAMAÇÕES (em um modal)
// ============================================
async function abrirListaReclamacoes() {
    try {
        const { data, error } = await window.supabaseClient
            .from('reclamacoes_frete')
            .select('*')
            .order('data_criacao', { ascending: false });

        if (error) throw error;

        if (!data || data.length === 0) {
            alert('Nenhuma reclamação registrada.');
            return;
        }

        // Gerar lista em um modal simples (pode ser melhorado)
        let html = `<h4>Reclamações de Frete (${data.length})</h4><table class="table table-sm"><thead><tr><th>Venda</th><th>Diferença</th><th>Status</th><th>Data</th><th>Ações</th></tr></thead><tbody>`;
        data.forEach(r => {
            const statusBadge = r.status === 'aberto' ? 'warning' : (r.status === 'em_andamento' ? 'info' : 'success');
            html += `<tr>
                <td>${r.venda_id}</td>
                <td>R$ ${r.diferenca.toFixed(2)}</td>
                <td><span class="badge badge-${statusBadge}">${r.status}</span></td>
                <td>${new Date(r.data_criacao).toLocaleDateString('pt-BR')}</td>
                <td><button class="btn btn-sm btn-primary" onclick="verReclamacao('${r.venda_id}')">Ver</button></td>
            </tr>`;
        });
        html += `</tbody></table>`;

        // Exibir em um modal específico (vou criar um modal genérico)
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.style.display = 'flex';
        modal.style.alignItems = 'center';
        modal.style.justifyContent = 'center';
        modal.style.background = 'rgba(0,0,0,0.5)';
        modal.style.zIndex = '9999';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 800px; max-height: 80vh; overflow-y: auto;">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <h3><i class="fas fa-list"></i> Reclamações de Frete</h3>
                    <button onclick="this.closest('.modal').remove()" style="background:none; border:none; font-size:24px;">&times;</button>
                </div>
                <div style="margin-top:15px;">
                    ${html}
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    } catch (error) {
        console.error('Erro ao listar reclamações:', error);
        showToast('Erro ao listar reclamações', 'error');
    }
}

// ============================================
// EXTRAIR FRETE DA VENDA (mantido)
// ============================================
async function extrairFreteDaVenda(order, token) {
    const shipping = order.shipping || {};
    let frete = 0;

    if (shipping.receiver_cost !== undefined && shipping.receiver_cost !== null && shipping.receiver_cost > 0) {
        frete = shipping.receiver_cost;
        console.log(`   📦 Frete receiver_cost: R$ ${frete}`);
        return frete;
    }

    if (shipping.cost !== undefined && shipping.cost !== null && shipping.cost > 0) {
        if (order.total_amount && shipping.cost < order.total_amount * 0.5) {
            frete = shipping.cost;
            console.log(`   📦 Frete shipping.cost: R$ ${frete}`);
            return frete;
        }
    }

    if (shipping.id && token) {
        try {
            const shipUrl = `https://api.mercadolibre.com/shipments/${shipping.id}`;
            const shipProxy = `${window.WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(shipUrl)}&token=${encodeURIComponent(token)}`;
            const resp = await fetch(shipProxy);
            if (resp.ok) {
                const shipData = await resp.json();
                if (shipData.receiver_cost && shipData.receiver_cost > 0) {
                    frete = shipData.receiver_cost;
                    console.log(`   📦 Frete shipment.receiver_cost: R$ ${frete}`);
                    return frete;
                }
                if (frete === 0 && shipData.cost && shipData.cost > 0) {
                    frete = shipData.cost;
                    console.log(`   📦 Frete shipment.cost: R$ ${frete}`);
                    return frete;
                }
                const costsUrl = `https://api.mercadolibre.com/shipments/${shipping.id}/costs`;
                const costsProxy = `${window.WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(costsUrl)}&token=${encodeURIComponent(token)}`;
                const costsResp = await fetch(costsProxy);
                if (costsResp.ok) {
                    const costsData = await costsResp.json();
                    if (costsData.receiver && costsData.receiver.cost !== undefined && costsData.receiver.cost > 0) {
                        frete = costsData.receiver.cost;
                        console.log(`   📦 Frete costs.receiver.cost: R$ ${frete}`);
                        return frete;
                    }
                    if (frete === 0 && costsData.senders && costsData.senders.length > 0 && costsData.senders[0].cost > 0) {
                        frete = costsData.senders[0].cost;
                        console.log(`   📦 Frete costs.senders[0].cost: R$ ${frete}`);
                        return frete;
                    }
                }
            }
        } catch (e) {
            console.warn(`   ⏱️ Erro ao buscar shipment ${shipping.id}:`, e.message);
        }
    }

    console.warn(`   ⚠️ Nenhum frete para venda ${order.id}`);
    return 0;
}

// ============================================
// BUSCAR FRETES (sincronização)
// ============================================
async function buscarFretes() {
    console.log('🔍 Iniciando sincronização de fretes...');
    const tbody = document.getElementById('shippingSimpleBody');
    const contagem = document.getElementById('contagemFretes');
    const btn = document.getElementById('btnBuscarFretes');

    if (!tbody) return;

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span> Sincronizando...';
    }

    tbody.innerHTML = '<tr><td colspan="8" class="text-center"><div class="spinner"></div> Buscando vendas...</td></tr>';
    if (contagem) contagem.textContent = 'Sincronizando...';

    try {
        const tokenData = await window.getValidToken();
        const token = tokenData?.access_token;
        if (!token) {
            throw new Error('Token ML não disponível. Verifique a conexão.');
        }

        if (typeof window.buscarVendasML !== 'function') {
            throw new Error('Função buscarVendasML não disponível. Verifique se ml_token_manager.js está carregado.');
        }

        const resultado = await window.buscarVendasML(50);
        console.log(`📦 ${resultado.vendas?.length || 0} vendas retornadas da busca`);

        if (!resultado || !resultado.vendas || resultado.vendas.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center">Nenhuma venda encontrada.</td></tr>';
            if (contagem) contagem.textContent = '0 registros';
            return;
        }

        const { data: salvos, error: erroSalvos } = await window.supabaseClient
            .from('fretes_ml')
            .select('id');
        if (erroSalvos) throw erroSalvos;
        const idsSalvos = new Set(salvos.map(item => item.id));

        const registrosParaInserir = [];
        let totalFullIgnorados = 0;
        let totalSemFrete = 0;

        for (const venda of resultado.vendas) {
            const idVenda = venda.id_venda_ml || venda.id;
            if (idsSalvos.has(idVenda)) continue;

            if (venda.tipo_envio === 'FULL' || isFullByAnyField(venda)) {
                totalFullIgnorados++;
                continue;
            }

            const orderId = venda.id_venda_ml || venda.id;
            const idML = orderId.replace(/^ML/, '');
            const orderUrl = `https://api.mercadolibre.com/orders/${idML}`;
            const orderProxy = `${window.WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(orderUrl)}&token=${encodeURIComponent(token)}`;
            let order = null;
            try {
                const resp = await fetch(orderProxy);
                if (resp.ok) {
                    order = await resp.json();
                } else {
                    console.warn(`⚠️ Não foi possível buscar ordem ${idML}`);
                }
            } catch (e) {
                console.warn(`Erro ao buscar ordem ${idML}:`, e.message);
            }

            let freteCobrado = 0;
            if (order) {
                freteCobrado = await extrairFreteDaVenda(order, token);
            }

            if (freteCobrado === 0) {
                totalSemFrete++;
            }

            const titulo = venda.titulo || 'Sem título';
            const mlb = venda.mlb_id || 'N/A';
            const valorProduto = venda.valor_total || 0;

            registrosParaInserir.push({
                id: idVenda,
                titulo: titulo,
                mlb: mlb,
                valor_produto: valorProduto,
                frete_cobrado: freteCobrado,
                data_venda: venda.data_venda || venda.created_at || new Date().toISOString(),
                tipo_envio: venda.tipo_envio || 'N/I',
                peso_estimado: 0.3 // padrão
            });

            await new Promise(resolve => setTimeout(resolve, 200));
        }

        console.log(`📊 Resumo: ${registrosParaInserir.length} para inserir, ${totalFullIgnorados} FULL ignorados, ${totalSemFrete} sem frete`);

        if (registrosParaInserir.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8" class="text-center">Nenhuma venda nova (${totalFullIgnorados} FULL ignorados).</td></tr>`;
            if (contagem) contagem.textContent = 'Nenhuma nova';
            return;
        }

        const { error: insertError } = await window.supabaseClient
            .from('fretes_ml')
            .insert(registrosParaInserir);

        if (insertError) {
            console.error('❌ Erro ao inserir fretes:', insertError);
            throw insertError;
        }

        console.log(`✅ ${registrosParaInserir.length} fretes inseridos`);
        await carregarFretesSalvos();

        if (contagem) {
            const { count } = await window.supabaseClient.from('fretes_ml').select('id', { count: 'exact', head: true });
            contagem.textContent = `${count || 0} registros (${registrosParaInserir.length} novos, ${totalFullIgnorados} FULL ignorados)`;
        }

        showToast(`✅ ${registrosParaInserir.length} fretes adicionados (${totalFullIgnorados} FULL ignorados)`, 'success');

    } catch (error) {
        console.error('❌ Erro na sincronização:', error);
        tbody.innerHTML = `<tr><td colspan="8" class="text-center text-danger">Erro: ${error.message}</td></tr>`;
        if (contagem) contagem.textContent = 'Erro';
        showToast('Erro ao sincronizar: ' + error.message, 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-sync-alt"></i> Buscar Fretes';
        }
    }
}

// ============================================
// LIMPEZA DE FULL
// ============================================
async function limparFretesFull() {
    try {
        console.log('🧹 Removendo registros FULL da tabela fretes_ml...');
        const { data, error } = await window.supabaseClient
            .from('fretes_ml')
            .select('*');
        if (error) throw error;

        const fullIds = data.filter(item => 
            item.tipo_envio === 'FULL' || isFullByAnyField(item)
        ).map(item => item.id);

        if (fullIds.length === 0) {
            console.log('✅ Nenhum FULL encontrado.');
            return;
        }
        console.log(`🗑️ Removendo ${fullIds.length} registros FULL...`);
        await window.supabaseClient.from('fretes_ml').delete().in('id', fullIds);
        console.log(`✅ ${fullIds.length} FULL removidos.`);
        await carregarFretesSalvos();
    } catch (error) {
        console.error('❌ Erro na limpeza:', error);
    }
}

// ============================================
// INICIALIZAR MODAL DE RECLAMAÇÃO (criar se não existir)
// ============================================
function criarModalReclamacao() {
    if (document.getElementById('modalReclamacaoFrete')) return;

    const modalHTML = `
        <div id="modalReclamacaoFrete" class="modal hidden">
            <div class="modal-content" style="max-width: 600px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                    <h3><i class="fas fa-comment-dots"></i> Reclamação de Frete</h3>
                    <button onclick="fecharModalReclamacao()" style="background: none; border: none; font-size: 24px; cursor: pointer;">&times;</button>
                </div>
                <form id="formReclamacaoFrete">
                    <input type="hidden" id="reclamacaoId" value="">
                    <input type="hidden" id="reclamacaoVendaId" value="">
                    <div class="row">
                        <div class="col-md-6">
                            <div class="form-group">
                                <label>Valor Produto</label>
                                <input type="text" id="reclamacaoValorProduto" class="form-control" readonly>
                            </div>
                        </div>
                        <div class="col-md-6">
                            <div class="form-group">
                                <label>Frete Cobrado</label>
                                <input type="text" id="reclamacaoFreteCobrado" class="form-control" readonly>
                            </div>
                        </div>
                    </div>
                    <div class="row">
                        <div class="col-md-6">
                            <div class="form-group">
                                <label>Frete Esperado</label>
                                <input type="text" id="reclamacaoFreteEsperado" class="form-control" readonly>
                            </div>
                        </div>
                        <div class="col-md-6">
                            <div class="form-group">
                                <label>Diferença</label>
                                <input type="text" id="reclamacaoDiferenca" class="form-control" readonly style="font-weight: bold;">
                            </div>
                        </div>
                    </div>
                    <div class="form-group">
                        <label>Motivo</label>
                        <input type="text" id="reclamacaoMotivo" class="form-control" placeholder="Ex: Frete acima do esperado">
                    </div>
                    <div class="form-group">
                        <label>Status</label>
                        <select id="reclamacaoStatus" class="form-control">
                            <option value="aberto">Aberto</option>
                            <option value="em_andamento">Em andamento</option>
                            <option value="resolvido">Resolvido</option>
                            <option value="rejeitado">Rejeitado</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Observações</label>
                        <textarea id="reclamacaoObservacoes" class="form-control" rows="3" placeholder="Detalhes sobre a reclamação..."></textarea>
                    </div>
                    <div class="d-flex justify-content-end gap-2 mt-3">
                        <button type="button" class="btn btn-secondary" onclick="fecharModalReclamacao()">Cancelar</button>
                        <button type="button" class="btn btn-success" onclick="salvarReclamacao()">Salvar</button>
                    </div>
                </form>
            </div>
        </div>
    `;

    const div = document.createElement('div');
    div.innerHTML = modalHTML;
    document.body.appendChild(div.firstElementChild);
}

// ============================================
// EXPORTAÇÕES
// ============================================
window.carregarFretesSalvos = carregarFretesSalvos;
window.buscarFretes = buscarFretes;
window.limparFretesFull = limparFretesFull;
window.abrirModalReclamacao = abrirModalReclamacao;
window.fecharModalReclamacao = fecharModalReclamacao;
window.salvarReclamacao = salvarReclamacao;
window.verReclamacao = verReclamacao;
window.abrirListaReclamacoes = abrirListaReclamacoes;
window.calcularFreteEsperado = calcularFreteEsperado;

// ============================================
// INICIALIZAR QUANDO DOM CARREGAR
// ============================================
document.addEventListener('DOMContentLoaded', function() {
    criarModalReclamacao();
    // Adicionar botão "Ver Reclamações" na interface, se desejar
    const container = document.querySelector('.card-header .d-flex');
    if (container) {
        const btn = document.createElement('button');
        btn.className = 'btn btn-info';
        btn.innerHTML = '<i class="fas fa-list"></i> Reclamações';
        btn.onclick = window.abrirListaReclamacoes;
        container.appendChild(btn);
    }
    // Carregar fretes ao entrar na aba
    if (document.getElementById('shippingSimpleBody')) {
        carregarFretesSalvos();
    }
});

console.log('✅ shipping_simple.js PRONTO (v19 - com cálculo, peso editável e reclamações)');