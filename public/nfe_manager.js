// nfe_manager.js - Versão completa com edição de produtos, fallback de APIs e integração ML
window.showToast = window.showToast || showToast;

// Configurações globais
if (!window.WORKER_URL) window.WORKER_URL = 'https://purple-bonus-3b1c.andmiotto1998.workers.dev';
if (!window.API_BASE_URL) window.API_BASE_URL = 'https://sistema-wheel-tech.onrender.com';

let vendasPendentes = [];
let pendingEmitOrderId = null;
let produtosEditados = [];
let vendaIdParaEdicao = null;

// ===== VERIFICAR SE É FULL (versão robusta) =====
function isFullByAnyField(item) {
    if (item.shipping && item.shipping.logistic_type) {
        const logisticType = item.shipping.logistic_type.toLowerCase();
        if (logisticType === 'fulfillment' || logisticType.includes('full')) {
            return true;
        }
    }

    if (item.tags && Array.isArray(item.tags)) {
        const hasFulfillmentTag = item.tags.some(tag => 
            tag.toLowerCase() === 'fulfillment' || tag.toLowerCase().includes('full')
        );
        if (hasFulfillmentTag) return true;
    }

    const text = `${item.titulo || ''} ${item.mlb || ''} ${item.id || ''} ${item.shipping?.logistic_type || ''} ${item.tags?.join(' ') || ''}`.toLowerCase();
    return /full|fulfillment/.test(text);
}

window.isFullByAnyField = isFullByAnyField;

function mapearUF(nomeEstado) {
    if (!nomeEstado) return '';
    
    const estado = nomeEstado.toString().trim().toLowerCase();
    
    const mapa = {
        'acre': 'AC', 'alagoas': 'AL', 'amapá': 'AP', 'amazonas': 'AM',
        'bahia': 'BA', 'ceará': 'CE', 'distrito federal': 'DF', 'espírito santo': 'ES',
        'goiás': 'GO', 'maranhão': 'MA', 'mato grosso': 'MT', 'mato grosso do sul': 'MS',
        'minas gerais': 'MG', 'pará': 'PA', 'paraíba': 'PB', 'paraná': 'PR',
        'pernambuco': 'PE', 'piauí': 'PI', 'rio de janeiro': 'RJ', 'rio grande do norte': 'RN',
        'rio grande do sul': 'RS', 'rondônia': 'RO', 'roraima': 'RR', 'santa catarina': 'SC',
        'são paulo': 'SP', 'sergipe': 'SE', 'tocantins': 'TO',
        'sao paulo': 'SP', 'rio de janeiro': 'RJ', 'rio grande do sul': 'RS',
        'santa catarina': 'SC', 'mato grosso do sul': 'MS', 'espirito santo': 'ES',
        'distrito federal': 'DF', 'minas gerais': 'MG', 'para': 'PA',
        'pernambuco': 'PE', 'parana': 'PR', 'maranhao': 'MA', 'amazonas': 'AM',
        'bahia': 'BA', 'ceara': 'CE', 'goias': 'GO', 'mato grosso': 'MT'
    };
    
    if (mapa[estado]) return mapa[estado];
    
    if (estado.length === 2 && estado.match(/^[a-z]{2}$/)) {
        return estado.toUpperCase();
    }
    
    console.warn(`⚠️ UF não reconhecida: "${nomeEstado}"`);
    return '';
}

// =========================================================
// FUNÇÃO PARA BUSCAR VALOR EXATO DO MERCADO PAGO
// =========================================================

async function buscarValorExatoPagamento(orderId) {
    try {
        console.log(`🔍 Buscando valor exato do pagamento para venda ${orderId}...`);
        
        let token = localStorage.getItem('ml_access_token');
        if (!token && typeof window.getValidToken === 'function') {
            const tokenData = await window.getValidToken();
            token = tokenData?.access_token;
        }
        if (!token) {
            console.warn('⚠️ Token ML não disponível');
            return null;
        }

        const orderUrl = `https://api.mercadolibre.com/orders/${orderId}`;
        const orderProxyUrl = `${window.WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(orderUrl)}&token=${encodeURIComponent(token)}`;
        const orderResponse = await fetch(orderProxyUrl);
        
        if (!orderResponse.ok) {
            console.warn(`⚠️ Não foi possível buscar a venda ${orderId}: ${orderResponse.status}`);
            return null;
        }
        
        const orderData = await orderResponse.json();
        console.log('📦 Dados da venda:', orderData);
        
        let paymentId = null;
        if (orderData.payments && orderData.payments.length > 0) {
            paymentId = orderData.payments[0].id;
        } else if (orderData.payment_id) {
            paymentId = orderData.payment_id;
        } else if (orderData.payment_ids && orderData.payment_ids.length > 0) {
            paymentId = orderData.payment_ids[0];
        }
        
        if (!paymentId) {
            console.warn(`⚠️ Não foi possível encontrar o ID do pagamento para venda ${orderId}`);
            return null;
        }
        
        console.log(`💳 ID do pagamento: ${paymentId}`);
        
        const paymentUrl = `https://api.mercadopago.com/v1/payments/${paymentId}`;
        const paymentProxyUrl = `${window.WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(paymentUrl)}&token=${encodeURIComponent(token)}`;
        const paymentResponse = await fetch(paymentProxyUrl);
        
        if (!paymentResponse.ok) {
            console.warn(`⚠️ Erro ao buscar pagamento ${paymentId}: ${paymentResponse.status}`);
            return null;
        }
        
        const paymentData = await paymentResponse.json();
        console.log('💳 Dados do pagamento (Mercado Pago):', paymentData);
        
        let totalPago = parseFloat(paymentData.transaction_amount || paymentData.total_amount || 0);
        let descontoCupom = parseFloat(paymentData.coupon_amount || 0);
        let valorFrete = 0;
        
        let valorProduto = totalPago - descontoCupom;
        
        if (paymentData.additional_info?.shipments?.shipping_amount) {
            valorFrete = parseFloat(paymentData.additional_info.shipments.shipping_amount) || 0;
        } else if (paymentData.shipping_amount) {
            valorFrete = parseFloat(paymentData.shipping_amount) || 0;
        } else if (orderData.shipping?.cost) {
            valorFrete = parseFloat(orderData.shipping.cost) || 0;
        }
        
        const totalSemFrete = totalPago - valorFrete;
        if (valorProduto > totalSemFrete) {
            valorProduto = totalSemFrete;
        }
        
        console.log(`💰 VALORES EXATOS (Mercado Pago):`);
        console.log(`   💳 Total pago: R$ ${totalPago.toFixed(2)}`);
        console.log(`   🎫 Desconto cupom: R$ ${descontoCupom.toFixed(2)}`);
        console.log(`   📦 Valor do frete: R$ ${valorFrete.toFixed(2)}`);
        console.log(`   ✅ Valor do produto: R$ ${valorProduto.toFixed(2)}`);
        
        return {
            valor_produto: valorProduto,
            valor_frete: valorFrete,
            total_pago: totalPago,
            payment_id: paymentId,
            desconto_cupom: descontoCupom
        };
        
    } catch (error) {
        console.error(`❌ Erro ao buscar valor no Mercado Pago:`, error);
        return null;
    }
}

// =========================================================
// 🔥 FUNÇÃO PARA CANCELAR NF-e (SISTEMA + SEFAZ)
// =========================================================

async function cancelarNFESistema(chaveAcesso) {
    console.log('🔵 [cancelarNFESistema] FUNÇÃO INICIADA');
    
    if (!chaveAcesso) {
        chaveAcesso = prompt('Digite a chave da NF-e (44 dígitos) que deseja cancelar:');
        if (!chaveAcesso) {
            showToast('❌ Operação cancelada', 'warning');
            return;
        }
    }

    try {
        // ===== 1. BUSCAR A NF-e NO BANCO =====
        const listResponse = await fetch(`${window.API_BASE_URL}/nfe/listar-nfes`);
        const listData = await listResponse.json();
        
        if (!listData.success || !listData.notas) {
            showToast('❌ Erro ao listar NF-es', 'error');
            return;
        }
        
        const nfe = listData.notas.find(n => 
            (n.chave_acesso || n.chave) === chaveAcesso
        );
        
        if (!nfe) {
            showToast(`❌ NF-e com chave ${chaveAcesso} não encontrada`, 'error');
            return;
        }

        const vendaId = nfe.venda_id || nfe.venda_id_ml || nfe.id_venda || 'N/A';
        const cliente = nfe.cliente_nome || nfe.cliente?.nome || 'N/A';
        const valor = nfe.valor_total ? parseFloat(nfe.valor_total).toFixed(2) : 'N/A';
        const dataEmissao = nfe.data_emissao ? new Date(nfe.data_emissao).toLocaleString('pt-BR') : 'N/A';
        const protocolo = nfe.protocolo || 'Não informado';
        
        // ===== 2. VERIFICAR SE JÁ ESTÁ CANCELADA =====
        if (nfe.cancelada) {
            showToast('⚠️ Esta NF-e já está cancelada', 'warning');
            const confirmar = confirm(
                `⚠️ NF-e já está cancelada!\n\n` +
                `Venda: ${vendaId}\n` +
                `Cliente: ${cliente}\n\n` +
                `Deseja remover o registro do sistema mesmo assim?`
            );
            if (confirmar) {
                await removerNFESistema(chaveAcesso);
                await carregarNFesEmitidas();
                await carregarVendasPendentes();
            }
            return;
        }

        // ===== 3. CONFIRMAR CANCELAMENTO (SISTEMA + SEFAZ) =====
        const mensagem = `
📋 CONFIRMAR CANCELAMENTO DA NF-e:

🔑 Chave: ${chaveAcesso}
🆔 Venda: ${vendaId}
👤 Cliente: ${cliente}
💰 Valor: R$ ${valor}
📅 Data Emissão: ${dataEmissao}
📋 Protocolo: ${protocolo}

⚠️ ATENÇÃO:
- O cancelamento será feito na SEFAZ E no sistema
- A NF-e será CANCELADA na SEFAZ (IRREVERSÍVEL!)
- O XML será invalidado
- O estoque será restaurado
- A venda voltará a ficar pendente

Deseja realmente CANCELAR esta NF-e?
        `;
        
        if (!confirm(mensagem)) {
            showToast('❌ Cancelamento cancelado', 'warning');
            return;
        }

        // ===== 4. JUSTIFICATIVA =====
        const justificativa = prompt(
            'Digite a justificativa para o cancelamento:\n' +
            '(Ex: Erro no preenchimento, Cliente desistiu, etc.)\n\n' +
            '⚠️ Esta justificativa será enviada para a SEFAZ'
        );
        
        if (!justificativa) {
            showToast('❌ Justificativa obrigatória', 'warning');
            return;
        }

        // ===== 5. MOSTRAR LOADING =====
        showToast(`🔄 Cancelando NF-e na SEFAZ...`, 'info');
        
        const btn = document.querySelector(`button[onclick*="cancelarNFESistema('${chaveAcesso}')"]`);
        let originalText = '';
        if (btn) {
            originalText = btn.innerHTML;
            btn.innerHTML = '<span class="spinner"></span> Cancelando na SEFAZ...';
            btn.disabled = true;
        }

        try {
            // ===== 6. CANCELAR NA SEFAZ (VIA API) =====
            const response = await fetch(`${window.API_BASE_URL}/nfe/cancelar`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    chaveAcesso, 
                    justificativa 
                })
            });
            
            const result = await response.json();
            
            if (!result.success) {
                // ===== ERRO NO CANCELAMENTO DA SEFAZ =====
                let mensagemErro = result.error || 'Erro desconhecido';
                
                // Verificar erros comuns da SEFAZ
                const errosSEFAZ = {
                    '101': 'NF-e já está cancelada',
                    '102': 'NF-e não autorizada, não pode ser cancelada',
                    '103': 'Prazo para cancelamento expirado (24h)',
                    '104': 'Justificativa inválida ou muito curta',
                    '105': 'Usuário não autorizado a cancelar',
                    '106': 'NF-e com manifestação do destinatário, não pode cancelar',
                    '107': 'Erro interno na SEFAZ'
                };
                
                const cStatMatch = mensagemErro.match(/cStat=(\d+)/);
                if (cStatMatch) {
                    const cStat = cStatMatch[1];
                    if (errosSEFAZ[cStat]) {
                        mensagemErro = `${mensagemErro}\n\n💡 ${errosSEFAZ[cStat]}`;
                    }
                }
                
                showToast(`❌ Erro ao cancelar na SEFAZ: ${mensagemErro}`, 'error');
                
                // Se for erro de prazo expirado, oferecer alternativa
                if (mensagemErro.includes('prazo') || mensagemErro.includes('24h') || mensagemErro.includes('103')) {
                    const alternativa = confirm(
                        `❌ ${mensagemErro}\n\n` +
                        `O prazo para cancelamento na SEFAZ expirou (24h).\n\n` +
                        `Deseja apenas remover o registro do sistema?\n` +
                        `(A NF-e continuará válida na SEFAZ)`
                    );
                    if (alternativa) {
                        await removerNFESistema(chaveAcesso);
                        await carregarNFesEmitidas();
                        await carregarVendasPendentes();
                        showToast('✅ Registro removido do sistema', 'success');
                    }
                }
                return;
            }
            
            // ===== 7. CANCELAMENTO NA SEFAZ BEM SUCEDIDO =====
            console.log('✅ NF-e cancelada na SEFAZ:', result);
            showToast('✅ NF-e cancelada na SEFAZ com sucesso!', 'success');
            
            // ===== 8. REMOVER DO SISTEMA =====
            await removerNFESistema(chaveAcesso);
            
            // ===== 9. RESTAURAR ESTOQUE =====
            if (vendaId && vendaId !== 'N/A') {
                await restaurarEstoqueSistema(vendaId);
            }
            
            // ===== 10. REGISTRAR HISTÓRICO =====
            await registrarHistoricoSistema(vendaId, chaveAcesso, justificativa);
            
            // ===== 11. RECARREGAR LISTAS =====
            await carregarNFesEmitidas();
            await carregarVendasPendentes();
            
            // ===== 12. NOTIFICAR USUÁRIO =====
            alert(`
✅ NF-e CANCELADA COM SUCESSO!

📋 Venda: ${vendaId}
🔑 Chave: ${chaveAcesso}
📝 Justificativa: ${justificativa}

✅ Cancelada na SEFAZ
✅ Removida do sistema
✅ Estoque restaurado
✅ Venda voltou para pendentes

A NF-e foi invalidada na SEFAZ e o comprador foi notificado.
            `);
            
        } catch (error) {
            console.error('❌ Erro no cancelamento:', error);
            showToast(`❌ Erro: ${error.message}`, 'error');
        } finally {
            if (btn) {
                btn.innerHTML = originalText;
                btn.disabled = false;
            }
        }
        
    } catch (error) {
        console.error('❌ Erro:', error);
        showToast(`❌ Erro: ${error.message}`, 'error');
    }
}

// =========================================================
// 🔥 FUNÇÃO PARA REMOVER NF-e DO SISTEMA
// =========================================================

async function removerNFESistema(chaveAcesso) {
    try {
        // Buscar a NF-e para pegar o venda_id antes de remover
        const { data: nfe, error: buscaError } = await window.supabaseClient
            .from('nfe_emitidas')
            .select('venda_id, chave_acesso')
            .eq('chave_acesso', chaveAcesso)
            .maybeSingle();
        
        if (buscaError) {
            console.warn('⚠️ Erro ao buscar NF-e:', buscaError);
        }
        
        // Remover da tabela nfe_emitidas
        const { error } = await window.supabaseClient
            .from('nfe_emitidas')
            .delete()
            .eq('chave_acesso', chaveAcesso);
        
        if (error) {
            // Tenta remover pela chave (campo alternativo)
            const { error: error2 } = await window.supabaseClient
                .from('nfe_emitidas')
                .delete()
                .eq('chave', chaveAcesso);
            if (error2) {
                console.error('❌ Erro ao remover NF-e:', error2);
                throw new Error(`Erro ao remover NF-e: ${error2.message}`);
            }
        }
        
        console.log(`✅ NF-e ${chaveAcesso} removida do sistema`);
        
        // Atualizar status da venda se tiver venda_id
        if (nfe && nfe.venda_id) {
            await atualizarStatusVendaSistema(nfe.venda_id);
        }
        
        return true;
        
    } catch (error) {
        console.error('❌ Erro ao remover NF-e:', error);
        throw error;
    }
}

// =========================================================
// 🔥 FUNÇÃO PARA ATUALIZAR STATUS DA VENDA NO SISTEMA
// =========================================================

async function atualizarStatusVendaSistema(vendaId) {
    try {
        if (!vendaId || vendaId === 'N/A') return;
        
        // Verificar quais colunas existem na tabela
        // Algumas tabelas podem não ter certas colunas
        const updateData = {
            nfe_emitida: false,
            status_sistema: 'pendente',
            updated_at: new Date().toISOString()
        };
        
        // Tentar atualizar apenas colunas que existem
        const { error } = await window.supabaseClient
            .from('vendas_ml')
            .update(updateData)
            .eq('id_venda_ml', String(vendaId));
        
        if (error) {
            // Se der erro, tentar apenas com as colunas básicas
            if (error.message && error.message.includes('status_nfe')) {
                console.log('ℹ️ Coluna status_nfe não existe, tentando sem ela...');
                const { error: error2 } = await window.supabaseClient
                    .from('vendas_ml')
                    .update({ 
                        nfe_emitida: false,
                        updated_at: new Date().toISOString()
                    })
                    .eq('id_venda_ml', String(vendaId));
                
                if (error2) {
                    console.warn('⚠️ Erro ao atualizar status da venda:', error2);
                } else {
                    console.log(`✅ Status da venda ${vendaId} atualizado (sem status_nfe)`);
                }
            } else {
                console.warn('⚠️ Erro ao atualizar status da venda:', error);
            }
        } else {
            console.log(`✅ Status da venda ${vendaId} atualizado para pendente`);
        }
        
        // Também tentar atualizar na tabela vendas_nfe se existir
        try {
            await window.supabaseClient
                .from('vendas_nfe')
                .update({ 
                    nfe_emitida: false,
                    updated_at: new Date().toISOString()
                })
                .eq('id_venda_ml', String(vendaId));
        } catch (e) {
            // Tabela pode não existir, ignorar
        }
        
    } catch (error) {
        console.error('❌ Erro ao atualizar status da venda:', error);
    }
}

// =========================================================
// 🔥 FUNÇÃO PARA RESTAURAR ESTOQUE (SISTEMA)
// =========================================================

async function restaurarEstoqueSistema(vendaId) {
    try {
        console.log(`📦 Restaurando estoque para venda ${vendaId}...`);
        
        if (!vendaId || vendaId === 'N/A') {
            console.warn('⚠️ Venda ID inválido para restaurar estoque');
            return;
        }
        
        // Buscar a venda no Supabase - tentar em várias tabelas
        let vendaML = null;
        let vendaError = null;
        
        // Tentar na tabela vendas_ml
        const { data: venda1, error: error1 } = await window.supabaseClient
            .from('vendas_ml')
            .select('sku, quantidade, skus_kit, eh_kit, produtos')
            .eq('id_venda_ml', String(vendaId))
            .maybeSingle();
        
        if (!error1 && venda1) {
            vendaML = venda1;
            console.log('✅ Venda encontrada na tabela vendas_ml');
        } else {
            // Tentar na tabela vendas_nfe
            const { data: venda2, error: error2 } = await window.supabaseClient
                .from('vendas_nfe')
                .select('sku, quantidade, skus_kit, eh_kit, items_json')
                .eq('id_venda_ml', String(vendaId))
                .maybeSingle();
            
            if (!error2 && venda2) {
                vendaML = venda2;
                console.log('✅ Venda encontrada na tabela vendas_nfe');
            } else {
                // Tentar buscar na tabela principal de vendas
                const { data: venda3, error: error3 } = await window.supabaseClient
                    .from('vendas')
                    .select('sku, quantidade, items')
                    .eq('id_venda_ml', String(vendaId))
                    .maybeSingle();
                
                if (!error3 && venda3) {
                    vendaML = venda3;
                    console.log('✅ Venda encontrada na tabela vendas');
                }
            }
        }
        
        if (!vendaML) {
            console.warn(`⚠️ Venda ${vendaId} não encontrada para restaurar estoque`);
            // Tentar restaurar usando os produtos da NF-e
            await restaurarEstoquePorNFE(vendaId);
            return;
        }
        
        const itensParaRestaurar = [];
        
        // Se for KIT
        if (vendaML.eh_kit && vendaML.skus_kit && vendaML.skus_kit.length > 0) {
            for (const kitItem of vendaML.skus_kit) {
                const { sku: skuReal, multiplicador } = extrairSkuEQuantidade(kitItem.sku);
                const quantidadeKit = kitItem.estoque || 1;
                const quantidadeTotal = quantidadeKit * (vendaML.quantidade || 1) * multiplicador;
                itensParaRestaurar.push({
                    sku: skuReal,
                    skuOriginal: kitItem.sku,
                    quantidade: quantidadeTotal
                });
            }
            console.log(`📦 KIT detectado: ${vendaML.skus_kit.length} SKUs para restaurar`);
        } else {
            // Produto normal
            const { sku: skuReal, multiplicador } = extrairSkuEQuantidade(vendaML.sku);
            const quantidadeTotal = (vendaML.quantidade || 1) * multiplicador;
            itensParaRestaurar.push({
                sku: skuReal,
                skuOriginal: vendaML.sku,
                quantidade: quantidadeTotal
            });
        }
        
        // Restaurar cada item
        let itensRestaurados = 0;
        
        for (const item of itensParaRestaurar) {
            if (!item.sku || item.sku === 'SEM_SKU' || item.sku === 'N/A') continue;
            
            console.log(`📦 Restaurando ${item.quantidade} un do SKU: ${item.sku}`);
            
            const { data: produto, error: prodError } = await window.supabaseClient
                .from('produtos_estoque')
                .select('id, quantidade, nome')
                .eq('sku', item.sku)
                .maybeSingle();
            
            if (prodError) {
                console.warn(`⚠️ Erro ao buscar ${item.sku}:`, prodError);
                continue;
            }
            
            if (produto) {
                const novaQuantidade = produto.quantidade + item.quantidade;
                
                const { error: updateError } = await window.supabaseClient
                    .from('produtos_estoque')
                    .update({ 
                        quantidade: novaQuantidade,
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', produto.id);
                
                if (updateError) {
                    console.warn(`⚠️ Erro ao atualizar ${item.sku}:`, updateError);
                } else {
                    itensRestaurados++;
                    console.log(`✅ Estoque do SKU ${item.sku} restaurado: ${produto.quantidade} → ${novaQuantidade}`);
                }
            } else {
                console.warn(`⚠️ Produto não encontrado: ${item.sku}`);
            }
        }
        
        // Recarregar estoque
        if (typeof window.carregarProdutosEstoque === 'function') {
            await window.carregarProdutosEstoque();
        }
        
        if (itensRestaurados > 0) {
            console.log(`✅ ${itensRestaurados} item(ns) restaurados ao estoque`);
            showToast(`✅ ${itensRestaurados} item(ns) restaurados ao estoque!`, 'success');
        }
        
        return { itensRestaurados };
        
    } catch (error) {
        console.error('❌ Erro ao restaurar estoque:', error);
        return { itensRestaurados: 0 };
    }
}

// =========================================================
// 🔥 FUNÇÃO PARA RESTAURAR ESTOQUE USANDO A NF-e
// =========================================================

async function restaurarEstoquePorNFE(vendaId) {
    try {
        console.log(`📦 Tentando restaurar estoque usando a NF-e da venda ${vendaId}...`);
        
        // Buscar a NF-e
        const listResponse = await fetch(`${window.API_BASE_URL}/nfe/listar-nfes`);
        const listData = await listResponse.json();
        
        if (!listData.success || !listData.notas) {
            console.warn('⚠️ Erro ao listar NF-es');
            return;
        }
        
        const nfe = listData.notas.find(n => 
            String(n.venda_id) === String(vendaId) || 
            String(n.venda_id_ml) === String(vendaId) ||
            String(n.id_venda) === String(vendaId)
        );
        
        if (!nfe) {
            console.warn(`⚠️ NF-e não encontrada para venda ${vendaId}`);
            return;
        }
        
        // Extrair produtos do XML
        if (nfe.xml_assinado) {
            try {
                const parser = new DOMParser();
                const xmlDoc = parser.parseFromString(nfe.xml_assinado, 'application/xml');
                const dets = xmlDoc.querySelectorAll('det');
                
                let itensRestaurados = 0;
                
                for (const det of dets) {
                    const prod = det.querySelector('prod');
                    if (!prod) continue;
                    
                    const cProd = prod.querySelector('cProd')?.textContent || '';
                    const xProd = prod.querySelector('xProd')?.textContent || '';
                    const qtd = parseFloat(prod.querySelector('qCom')?.textContent || '0');
                    const sku = cProd || xProd || 'SEM_SKU';
                    
                    if (qtd <= 0 || sku === 'SEM_SKU') continue;
                    
                    console.log(`📦 Restaurando ${qtd} un do SKU: ${sku}`);
                    
                    const { data: produto, error: prodError } = await window.supabaseClient
                        .from('produtos_estoque')
                        .select('id, quantidade')
                        .eq('sku', sku)
                        .maybeSingle();
                    
                    if (!prodError && produto) {
                        const novaQuantidade = produto.quantidade + qtd;
                        await window.supabaseClient
                            .from('produtos_estoque')
                            .update({ 
                                quantidade: novaQuantidade,
                                updated_at: new Date().toISOString()
                            })
                            .eq('id', produto.id);
                        itensRestaurados++;
                        console.log(`✅ Estoque do SKU ${sku} restaurado: ${produto.quantidade} → ${novaQuantidade}`);
                    }
                }
                
                if (itensRestaurados > 0) {
                    showToast(`✅ ${itensRestaurados} item(ns) restaurados do estoque!`, 'success');
                }
                
                return { itensRestaurados };
                
            } catch (e) {
                console.warn('⚠️ Erro ao extrair produtos do XML:', e);
            }
        }
        
        return { itensRestaurados: 0 };
        
    } catch (error) {
        console.error('❌ Erro ao restaurar estoque por NF-e:', error);
        return { itensRestaurados: 0 };
    }
}

// =========================================================
// 🔥 FUNÇÃO PARA REGISTRAR HISTÓRICO DE CANCELAMENTO
// =========================================================

async function registrarHistoricoSistema(vendaId, chaveAcesso, justificativa) {
    try {
        // Verificar se a tabela existe antes de inserir
        try {
            // Tentar inserir na tabela nfe_historico
            const { error } = await window.supabaseClient
                .from('nfe_historico')
                .insert({
                    chave_acesso: chaveAcesso,
                    venda_id: vendaId,
                    acao: 'cancelamento_sistema',
                    justificativa: justificativa || 'Cancelado pelo usuário',
                    criado_em: new Date().toISOString()
                });
            
            if (error) {
                // Se a tabela não existir, tentar criar ou ignorar
                if (error.code === 'PGRST204' || error.message?.includes('relation')) {
                    console.log('ℹ️ Tabela nfe_historico não existe, ignorando histórico');
                } else {
                    console.warn('⚠️ Erro ao registrar histórico:', error);
                }
            } else {
                console.log('✅ Histórico de cancelamento registrado');
            }
        } catch (e) {
            // Tabela pode não existir
            console.log('ℹ️ Tabela nfe_historico não disponível');
        }
        
        // Também registrar no histórico de estoque se possível
        try {
            if (vendaId && vendaId !== 'N/A') {
                await window.supabaseClient
                    .from('estoque_historico')
                    .insert({
                        venda_id: vendaId,
                        tipo: 'cancelamento',
                        observacao: `Cancelamento de NF-e no sistema - Chave: ${chaveAcesso}`,
                        criado_por: 'Sistema (Cancelamento)',
                        criado_em: new Date().toISOString()
                    });
                console.log('✅ Histórico de estoque registrado');
            }
        } catch (e) {
            // Tabela pode não existir
        }
        
    } catch (error) {
        console.warn('⚠️ Erro ao registrar histórico:', error);
    }
}

// =========================================================
// 🔥 FUNÇÃO PARA LISTAR NF-ES E PERMITIR CANCELAR NO SISTEMA
// =========================================================

async function listarNFesParaCancelarSistema() {
    try {
        const response = await fetch(`${window.API_BASE_URL}/nfe/listar-nfes`);
        const data = await response.json();
        
        if (!data.success || !data.notas) {
            showToast('❌ Erro ao listar NF-es', 'error');
            return;
        }
        
        const nfes = data.notas;
        
        if (nfes.length === 0) {
            showToast('📋 Nenhuma NF-e encontrada', 'warning');
            return;
        }
        
        let html = `
        <div style="max-height: 500px; overflow-y: auto;">
            <p style="color: #dc3545; font-weight: bold; margin-bottom: 10px;">
                ⚠️ Cancelar NF-e na SEFAZ e no Sistema
            </p>
            <table style="width:100%; border-collapse: collapse; font-size: 12px;">
                <thead>
                    <tr style="background: #f8f9fa; position: sticky; top: 0;">
                        <th style="padding: 8px; border: 1px solid #ddd;">Venda</th>
                        <th style="padding: 8px; border: 1px solid #ddd;">Cliente</th>
                        <th style="padding: 8px; border: 1px solid #ddd;">Valor</th>
                        <th style="padding: 8px; border: 1px solid #ddd;">Data</th>
                        <th style="padding: 8px; border: 1px solid #ddd;">Status</th>
                        <th style="padding: 8px; border: 1px solid #ddd;">Ação</th>
                    </tr>
                </thead>
                <tbody>
        `;
        
        for (const nfe of nfes) {
            const chave = nfe.chave_acesso || nfe.chave || 'N/A';
            const vendaId = nfe.venda_id || nfe.venda_id_ml || nfe.id_venda || 'N/A';
            const cliente = nfe.cliente_nome || nfe.cliente?.nome || 'N/A';
            const valor = nfe.valor_total ? parseFloat(nfe.valor_total).toFixed(2) : 'N/A';
            const dataEmissao = nfe.data_emissao ? new Date(nfe.data_emissao).toLocaleDateString('pt-BR') : 'N/A';
            const cancelada = nfe.cancelada ? '✅ Cancelada' : '⏳ Ativa';
            const corStatus = nfe.cancelada ? '#28a745' : '#ffc107';
            
            // Verificar se está dentro do prazo de 24h
            let prazoInfo = '';
            let corPrazo = '#28a745';
            if (nfe.data_emissao && !nfe.cancelada) {
                const dataEmissaoDate = new Date(nfe.data_emissao);
                const agora = new Date();
                const diffHoras = (agora - dataEmissaoDate) / (1000 * 60 * 60);
                if (diffHoras > 24) {
                    prazoInfo = ' ⚠️ Prazo expirado';
                    corPrazo = '#dc3545';
                } else {
                    prazoInfo = ` ✅ ${Math.round(24 - diffHoras)}h restantes`;
                }
            }
            
            html += `
                <tr style="border-bottom: 1px solid #eee;">
                    <td style="padding: 6px; border: 1px solid #ddd;"><strong>${vendaId}</strong></td>
                    <td style="padding: 6px; border: 1px solid #ddd;">${cliente}</td>
                    <td style="padding: 6px; border: 1px solid #ddd;">R$ ${valor}</td>
                    <td style="padding: 6px; border: 1px solid #ddd;">${dataEmissao}</td>
                    <td style="padding: 6px; border: 1px solid #ddd;">
                        <span style="color: ${corStatus}; font-weight: bold;">${cancelada}</span>
                        <span style="color: ${corPrazo}; font-size: 10px;">${prazoInfo}</span>
                    </td>
                    <td style="padding: 6px; border: 1px solid #ddd;">
                        ${!nfe.cancelada ? `
                            <button onclick="cancelarNFESistema('${chave}')" 
                                    style="padding: 4px 10px; background: #dc3545; color: white; border: none; border-radius: 4px; cursor: pointer;">
                                <i class="fas fa-times"></i> Cancelar
                            </button>
                        ` : `
                            <button onclick="removerNFESistema('${chave}')" 
                                    style="padding: 4px 10px; background: #6c757d; color: white; border: none; border-radius: 4px; cursor: pointer;">
                                <i class="fas fa-trash"></i> Remover
                            </button>
                        `}
                    </td>
                </tr>
            `;
        }
        
        html += `
                </tbody>
            </table>
        </div>
        <div style="margin-top: 10px; text-align: center; font-size: 12px; color: #6c757d;">
            ⚠️ O cancelamento é IRREVERSÍVEL e será feito na SEFAZ!
        </div>
        <div style="margin-top: 10px; text-align: center;">
            <button onclick="fecharModalDialog()" style="padding: 8px 20px; background: #6c757d; color: white; border: none; border-radius: 4px; cursor: pointer;">
                Fechar
            </button>
        </div>
        `;
        
        showModalDialog('📋 Cancelar NF-e (SEFAZ + Sistema)', html);
        
    } catch (error) {
        console.error('❌ Erro:', error);
        showToast(`❌ Erro: ${error.message}`, 'error');
    }
}

// =========================================================
// 🔥 FUNÇÃO PARA CANCELAR NF-e PELO ID DA VENDA (SISTEMA)
// =========================================================

async function cancelarNFEporVendaSistema(vendaId) {
    if (!vendaId) {
        vendaId = prompt('Digite o ID da venda:');
        if (!vendaId) return;
    }
    
    try {
        // Buscar a NF-e pela venda
        const listResponse = await fetch(`${window.API_BASE_URL}/nfe/listar-nfes`);
        const listData = await listResponse.json();
        
        if (!listData.success || !listData.notas) {
            showToast('❌ Erro ao listar NF-es', 'error');
            return;
        }
        
        const nfe = listData.notas.find(n => 
            String(n.venda_id) === String(vendaId) || 
            String(n.venda_id_ml) === String(vendaId) ||
            String(n.id_venda) === String(vendaId)
        );
        
        if (!nfe) {
            showToast(`❌ NF-e não encontrada para venda ${vendaId}`, 'error');
            return;
        }
        
        const chave = nfe.chave_acesso || nfe.chave;
        
        if (!chave) {
            showToast('❌ Chave da NF-e não encontrada', 'error');
            return;
        }
        
        await cancelarNFESistema(chave);
        
    } catch (error) {
        console.error('❌ Erro:', error);
        showToast(`❌ Erro: ${error.message}`, 'error');
    }
}

// =========================================================
// EXPORTAR FUNÇÕES
// =========================================================

window.cancelarNFESistema = cancelarNFESistema;
window.removerNFESistema = removerNFESistema;
window.atualizarStatusVendaSistema = atualizarStatusVendaSistema;
window.restaurarEstoqueSistema = restaurarEstoqueSistema;
window.listarNFesParaCancelarSistema = listarNFesParaCancelarSistema;
window.cancelarNFEporVendaSistema = cancelarNFEporVendaSistema;

console.log('✅ Funções de cancelamento de NF-e (SISTEMA) carregadas!');
console.log('📋 Comandos disponíveis:');
console.log('  await cancelarNFESistema("CHAVE_DA_NFE")           - Cancelar NF-e no sistema');
console.log('  await cancelarNFEporVendaSistema("ID_DA_VENDA")   - Cancelar pelo ID da venda');
console.log('  await listarNFesParaCancelarSistema()             - Listar NF-es e cancelar');
console.log('  await removerNFESistema("CHAVE_DA_NFE")           - Remover apenas o registro');

// =========================================================
// EDIÇÃO DE PRODUTOS
// =========================================================

async function abrirModalEdicaoProdutos(orderId) {
    console.log('🔧 Abrindo edição de produtos para venda:', orderId);
    vendaIdParaEdicao = orderId;

    let token = localStorage.getItem('ml_access_token');
    if (!token && typeof window.getValidToken === 'function') {
        const tokenData = await window.getValidToken();
        token = tokenData?.access_token;
    }
    if (!token) {
        showToast('Token ML não disponível', 'error');
        return;
    }

    try {
        const dadosPagamento = await buscarValorExatoPagamento(orderId);
        console.log('📊 Dados do pagamento para edição:', dadosPagamento);

        const url = `https://api.mercadolibre.com/orders/${orderId}`;
        const proxyUrl = `${window.WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(url)}&token=${encodeURIComponent(token)}`;
        const response = await fetch(proxyUrl);
        if (!response.ok) throw new Error('Erro ao buscar venda');
        const venda = await response.json();

        const items = venda.order_items || [];
        if (items.length === 0) {
            showToast('Nenhum produto encontrado', 'warning');
            return;
        }

        let valorTotalProduto = 0;
        let quantidadeTotal = 0;
        
        if (dadosPagamento && dadosPagamento.valor_produto > 0) {
            valorTotalProduto = dadosPagamento.valor_produto;
            for (const item of items) {
                quantidadeTotal += item.quantity || 1;
            }
            console.log(`💰 Valor total do produto (Mercado Pago): R$ ${valorTotalProduto.toFixed(2)}`);
        } else {
            for (const item of items) {
                const valorUnitario = item.unit_price || 0;
                const quantidade = item.quantity || 1;
                valorTotalProduto += valorUnitario * quantidade;
                quantidadeTotal += quantidade;
            }
        }

        let ncmPorSku = {};
        try {
            const { data, error } = await window.supabaseClient
                .from('produto_ncm')
                .select('sku, ncm')
                .in('sku', items.map(item => item.item.seller_sku || 'SEM_SKU'));
            if (!error && data) {
                data.forEach(row => ncmPorSku[row.sku] = row.ncm);
            }
        } catch (e) {
            console.warn('Erro ao buscar NCM:', e);
        }

        produtosEditados = items.map((item, index) => {
            const sku = item.item.seller_sku || 'SEM_SKU';
            const ncmSalvo = ncmPorSku[sku] || '87149990';
            const quantidade = item.quantity || 1;
            
            let valorUnitario = 0;
            if (quantidadeTotal > 0 && valorTotalProduto > 0) {
                valorUnitario = (valorTotalProduto / quantidadeTotal);
            } else {
                valorUnitario = item.unit_price || 0;
            }
            
            return {
                nome: item.item.title,
                quantidade: quantidade,
                valor_unitario: valorUnitario,
                sku: sku,
                ncm: ncmSalvo,
                _valor_original: item.unit_price || 0
            };
        });

        const totalCalculado = produtosEditados.reduce((acc, p) => acc + (p.valor_unitario * p.quantidade), 0);
        if (Math.abs(totalCalculado - valorTotalProduto) > 0.01 && valorTotalProduto > 0) {
            const diff = valorTotalProduto - totalCalculado;
            if (produtosEditados.length > 0) {
                const ultimoItem = produtosEditados[produtosEditados.length - 1];
                ultimoItem.valor_unitario += diff / ultimoItem.quantidade;
            }
        }

        const modalHTML = `
        <div id="modalEdicaoProdutos" class="modal" style="display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,0.5); z-index:9999;">
            <div class="modal-content" style="max-width:900px; width:95%; max-height:90vh; overflow-y:auto; background:white; padding:25px; border-radius:8px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
                    <h3 style="margin:0;"><i class="fas fa-edit"></i> Editar Produtos</h3>
                    <button onclick="fecharModalEdicaoProdutos()" style="background:none; border:none; font-size:24px; cursor:pointer;">&times;</button>
                </div>
                <p style="color:#6c757d; margin-bottom:15px;">Ajuste a quantidade, valor unitário e NCM de cada produto. O total será recalculado.</p>
                <div class="table-responsive">
                    <table class="table table-striped">
                        <thead>
                            <tr>
                                <th>Produto</th>
                                <th style="width:100px;">Qtd</th>
                                <th style="width:130px;">Valor Unit.</th>
                                <th style="width:130px;">NCM</th>
                                <th style="width:110px;">Subtotal</th>
                            </tr>
                        </thead>
                        <tbody id="produtosEditaveisBody">
                            ${produtosEditados.map((p, index) => `
                                <tr>
                                    <td><span title="${p.nome}">${p.nome.length > 40 ? p.nome.substring(0,40)+'...' : p.nome}</span></td>
                                    <td>
                                        <input type="number" class="form-control form-control-sm qtd-produto" 
                                               data-index="${index}" value="${p.quantidade}" min="0.01" step="0.01">
                                    </td>
                                    <td>
                                        <input type="number" class="form-control form-control-sm valor-produto" 
                                               data-index="${index}" value="${p.valor_unitario}" min="0" step="0.01">
                                    </td>
                                    <td>
                                        <input type="text" class="form-control form-control-sm ncm-produto" 
                                               data-index="${index}" value="${p.ncm}" placeholder="NCM" maxlength="8">
                                    </td>
                                    <td class="subtotal-produto">R$ ${(p.quantidade * p.valor_unitario).toFixed(2)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                        <tfoot>
                            <tr style="font-weight:bold; background:#f8f9fa;">
                                <td colspan="3" style="text-align:right;">Total da Nota:</td>
                                <td id="totalGeralProdutos" style="text-align:right;" colspan="2">R$ ${produtosEditados.reduce((acc, p) => acc + (p.quantidade * p.valor_unitario), 0).toFixed(2)}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>

                <div class="d-flex justify-content-end gap-2 mt-3">
                    <button class="btn btn-secondary" onclick="fecharModalEdicaoProdutos()">Cancelar</button>
                    <button class="btn btn-success" id="confirmarProdutosFinalBtn"><i class="fas fa-check"></i> Confirmar e Emitir NF-e</button>
                </div>
            </div>
        </div>`;

        const modalContainer = document.createElement('div');
        modalContainer.innerHTML = modalHTML;
        document.body.appendChild(modalContainer.firstElementChild);

        document.querySelectorAll('.qtd-produto, .valor-produto, .ncm-produto').forEach(input => {
            input.addEventListener('input', function() {
                const idx = parseInt(this.dataset.index);
                const row = this.closest('tr');
                const qtdInput = row.querySelector('.qtd-produto');
                const valorInput = row.querySelector('.valor-produto');
                const subtotalCell = row.querySelector('.subtotal-produto');
                const ncmInput = row.querySelector('.ncm-produto');
                const qtd = parseFloat(qtdInput.value) || 0;
                const valor = parseFloat(valorInput.value) || 0;
                const subtotal = qtd * valor;
                subtotalCell.textContent = `R$ ${subtotal.toFixed(2)}`;
                produtosEditados[idx].quantidade = qtd;
                produtosEditados[idx].valor_unitario = valor;
                produtosEditados[idx].ncm = ncmInput.value.trim() || '87149990';
                recalcularTotalGeral();
            });
        });

        function recalcularTotalGeral() {
            let total = 0;
            produtosEditados.forEach(p => total += p.quantidade * p.valor_unitario);
            const totalCell = document.getElementById('totalGeralProdutos');
            if (totalCell) totalCell.textContent = `R$ ${total.toFixed(2)}`;
        }

        document.getElementById('confirmarProdutosFinalBtn').addEventListener('click', function() {
            confirmarProdutosEditados();
        });

    } catch (error) {
        console.error('Erro ao carregar produtos:', error);
        showToast('Erro ao carregar produtos: ' + error.message, 'error');
    }
}

function fecharModalEdicaoProdutos() {
    const modal = document.getElementById('modalEdicaoProdutos');
    if (modal) modal.remove();
}

async function confirmarProdutosEditados() {
    console.log('🔵 [confirmarProdutosEditados] FUNÇÃO INICIADA');
    
    const vendaId = vendaIdParaEdicao;
    if (!vendaId) {
        showToast('❌ ID da venda não encontrado', 'error');
        return;
    }

    if (!produtosEditados || produtosEditados.length === 0) {
        showToast('❌ Nenhum produto para emitir', 'error');
        return;
    }

    try {
        const ncmPromises = produtosEditados.map(p => {
            if (p.sku && p.sku !== 'SEM_SKU' && p.ncm) {
                return window.supabaseClient
                    .from('produto_ncm')
                    .upsert({ sku: p.sku, ncm: p.ncm }, { onConflict: 'sku' });
            }
            return Promise.resolve();
        });
        await Promise.all(ncmPromises);

        window.produtosParaEmissao = produtosEditados.map(p => ({
            nome: p.nome || 'Produto',
            quantidade: p.quantidade || 1,
            valor_unitario: p.valor_unitario || 0,
            sku: p.sku || 'SEM_SKU',
            ncm: p.ncm || '87149990'
        }));

        fecharModalEdicaoProdutos();
        pendingEmitOrderId = vendaId;
        
        await emitirNFEParaVenda(vendaId);
        
        vendaIdParaEdicao = null;
        produtosEditados = [];

    } catch (error) {
        console.error('❌ Erro em confirmarProdutosEditados:', error);
        showToast('❌ Erro ao confirmar produtos: ' + error.message, 'error');
        vendaIdParaEdicao = null;
        produtosEditados = [];
    }
}

// =========================================================
// NCM POR SKU
// =========================================================

async function buscarNCMporSKU(sku) {
    if (!sku || sku === 'SEM_SKU' || sku === 'N/A') return null;
    try {
        const { data, error } = await window.supabaseClient
            .from('produto_ncm')
            .select('ncm')
            .eq('sku', sku)
            .maybeSingle();
        if (error) throw error;
        return data?.ncm || null;
    } catch (error) {
        console.warn(`⚠️ Erro ao buscar NCM para SKU ${sku}:`, error.message);
        return null;
    }
}

async function salvarNCMporSKU(sku, ncm) {
    if (!sku || sku === 'SEM_SKU' || sku === 'N/A' || !ncm) return;
    try {
        const { error } = await window.supabaseClient
            .from('produto_ncm')
            .upsert({ sku, ncm }, { onConflict: 'sku' });
        if (error) throw error;
        console.log(`✅ NCM ${ncm} salvo para SKU ${sku}`);
    } catch (error) {
        console.warn(`⚠️ Erro ao salvar NCM para SKU ${sku}:`, error.message);
    }
}

// =========================================================
// FUNÇÃO PARA EXTRAIR SKU E QUANTIDADE DO PREFIXO
// =========================================================

function extrairSkuEQuantidade(skuComPrefixo) {
    if (!skuComPrefixo || skuComPrefixo === 'SEM_SKU' || skuComPrefixo === 'N/A') {
        return { sku: skuComPrefixo, multiplicador: 1 };
    }
    
    // Verifica se tem prefixo numérico de 3 dígitos no início
    const match = skuComPrefixo.match(/^(\d{3})(.+)$/);
    if (match) {
        const prefixo = parseInt(match[1]);
        let skuReal = match[2];
        if (skuReal.startsWith('/') || skuReal.startsWith('\\')) {
            skuReal = skuReal.substring(1);
        }
        return { 
            sku: skuReal, 
            multiplicador: prefixo,
            skuOriginal: skuComPrefixo 
        };
    }
    
    return { 
        sku: skuComPrefixo, 
        multiplicador: 1, 
        skuOriginal: skuComPrefixo 
    };
}

// =========================================================
// FUNÇÃO PARA ENVIAR XML PARA O MERCADO LIVRE
// =========================================================

async function enviarXMLparaMercadoLivre(orderId, xmlContent, token) {
    console.log(`📤 Enviando XML da NF-e para venda ${orderId}...`);
    
    try {
        if (!token) {
            token = localStorage.getItem('ml_access_token');
            if (!token && typeof window.getValidToken === 'function') {
                const tokenData = await window.getValidToken();
                token = tokenData?.access_token;
            }
        }
        
        if (!token) {
            console.warn('⚠️ Token ML não disponível');
            return { success: false, error: 'Token ML não disponível' };
        }

        // 🔥 VERIFICAR SE JÁ EXISTE INVOICE
        const checkUrl = `https://api.mercadolibre.com/users/415176739/invoices/orders/${orderId}`;
        const checkProxyUrl = `${window.WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(checkUrl)}&token=${encodeURIComponent(token)}`;
        
        try {
            const checkResponse = await fetch(checkProxyUrl);
            if (checkResponse.ok) {
                const existing = await checkResponse.json();
                if (Array.isArray(existing) && existing.length > 0) {
                    const authorized = existing.find(inv => inv.status === 'authorized' || inv.status === 'AUTHORIZED');
                    if (authorized) {
                        console.log('ℹ️ Já existe NF-e autorizada para esta venda.');
                        return { success: true, message: 'NF-e já vinculada', existing: true };
                    }
                }
            }
        } catch (e) {
            console.warn('⚠️ Erro ao verificar invoice existente:', e);
        }

        const invoiceUrl = `https://api.mercadolibre.com/users/415176739/invoices`;
        
        const payload = {
            order_id: parseInt(orderId),
            transaction_type: 'SALE',
            xml: xmlContent
        };
        
        console.log('📤 Enviando para:', invoiceUrl);
        console.log('📤 Order ID:', orderId);
        console.log('📤 Tamanho do XML:', xmlContent?.length || 0);
        
        // TENTATIVA 1: JSON via Worker
        try {
            const proxyUrl = `${window.WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(invoiceUrl)}&token=${encodeURIComponent(token)}&method=POST`;
            
            const response = await fetch(proxyUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });
            
            if (response.ok) {
                const result = await response.json();
                console.log('✅ NF-e enviada com sucesso!', result);
                return { success: true, invoice: result };
            } else {
                const errorText = await response.text();
                console.warn('⚠️ JSON falhou:', response.status, errorText);
                
                // TENTATIVA 2: FormData
                console.log('🔄 Tentando método alternativo (FormData)...');
                
                const formData = new FormData();
                const xmlBlob = new Blob([xmlContent], { type: 'application/xml' });
                formData.append('invoice', xmlBlob, `NFE_${orderId}.xml`);
                formData.append('order_id', orderId);
                
                const formProxyUrl = `${window.WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(invoiceUrl)}&token=${encodeURIComponent(token)}&method=POST`;
                const formResponse = await fetch(formProxyUrl, {
                    method: 'POST',
                    body: formData
                });
                
                if (formResponse.ok) {
                    const result = await formResponse.json();
                    console.log('✅ NF-e enviada via FormData!', result);
                    return { success: true, invoice: result };
                } else {
                    const formError = await formResponse.text();
                    console.error('❌ FormData falhou:', formError);
                    return { success: false, error: `FormData falhou: ${formError}` };
                }
            }
        } catch (error) {
            console.error('❌ Erro ao enviar NF-e:', error);
            return { success: false, error: error.message };
        }
        
    } catch (error) {
        console.error('❌ Erro ao enviar NF-e para ML:', error);
        return { success: false, error: error.message };
    }
}

// =========================================================
// ABAS
// =========================================================

async function mostrarAbaNFE(aba) {
    const abaVendas = document.getElementById('abaVendas');
    const abaEmitidas = document.getElementById('abaEmitidas');
    const abaAvulsa = document.getElementById('abaAvulsa');
    const abaTransportadoras = document.getElementById('abaTransportadoras');
    const abaClientes = document.getElementById('abaClientes');
    
    if (abaVendas) abaVendas.classList.add('hidden');
    if (abaEmitidas) abaEmitidas.classList.add('hidden');
    if (abaAvulsa) abaAvulsa.classList.add('hidden');
    if (abaTransportadoras) abaTransportadoras.classList.add('hidden');
    if (abaClientes) abaClientes.classList.add('hidden');
    
    const target = document.getElementById(`aba${aba.charAt(0).toUpperCase() + aba.slice(1)}`);
    if (target) target.classList.remove('hidden');
    
    const botoes = ['Vendas', 'Emitidas', 'Avulsa', 'Transportadoras', 'Clientes'];
    botoes.forEach(btn => {
        const el = document.getElementById(`tab${btn}Btn`);
        if (el) {
            if (btn.toLowerCase() === aba) {
                el.classList.remove('btn-outline-primary');
                el.classList.add('btn-primary');
            } else {
                el.classList.remove('btn-primary');
                el.classList.add('btn-outline-primary');
            }
        }
    });
    
    if (aba === 'vendas') await carregarVendasPendentes();
    if (aba === 'emitidas') await carregarNFesEmitidas();
    if (aba === 'transportadoras') await carregarTransportadoras();
    if (aba === 'clientes') await carregarClientes();
}

// =========================================================
// HANDLERS PARA OS BOTÕES DA TABELA
// =========================================================

// Handler para emitir NF-e
function handleEmitirNFEClick(event) {
    const vendaId = event.currentTarget.dataset.vendaId;
    if (!vendaId) {
        showToast('❌ ID da venda não encontrado', 'error');
        return;
    }
    abrirModalEdicaoProdutos(vendaId);
}

// Handler para ver NF-e
async function handleVerNFEClick(event) {
    const vendaId = event.currentTarget.dataset.vendaId;
    if (!vendaId) {
        showToast('❌ ID da venda não encontrado', 'error');
        return;
    }
    
    try {
        // Buscar a NF-e pela venda
        const listResponse = await fetch(`${window.API_BASE_URL}/nfe/listar-nfes`);
        const listData = await listResponse.json();
        
        if (!listData.success || !listData.notas) {
            showToast('❌ Erro ao listar NF-es', 'error');
            return;
        }
        
        const nfe = listData.notas.find(n => 
            String(n.venda_id) === String(vendaId) || 
            String(n.venda_id_ml) === String(vendaId) ||
            String(n.id_venda) === String(vendaId)
        );
        
        if (!nfe) {
            showToast(`❌ NF-e não encontrada para venda ${vendaId}`, 'error');
            return;
        }
        
        const chave = nfe.chave_acesso || nfe.chave;
        if (chave) {
            await visualizarNFE(chave);
        } else {
            showToast('❌ Chave da NF-e não encontrada', 'error');
        }
        
    } catch (error) {
        console.error('❌ Erro ao ver NF-e:', error);
        showToast(`❌ Erro: ${error.message}`, 'error');
    }
}

// Handler para cancelar NF-e
async function handleCancelarNFEClick(event) {
    const vendaId = event.currentTarget.dataset.vendaId;
    if (!vendaId) {
        showToast('❌ ID da venda não encontrado', 'error');
        return;
    }
    
    try {
        // Buscar a NF-e pela venda
        const listResponse = await fetch(`${window.API_BASE_URL}/nfe/listar-nfes`);
        const listData = await listResponse.json();
        
        if (!listData.success || !listData.notas) {
            showToast('❌ Erro ao listar NF-es', 'error');
            return;
        }
        
        const nfe = listData.notas.find(n => 
            String(n.venda_id) === String(vendaId) || 
            String(n.venda_id_ml) === String(vendaId) ||
            String(n.id_venda) === String(vendaId)
        );
        
        if (!nfe) {
            showToast(`❌ NF-e não encontrada para venda ${vendaId}`, 'error');
            return;
        }
        
        const chave = nfe.chave_acesso || nfe.chave;
        if (chave) {
            await cancelarNFESistema(chave);
        } else {
            showToast('❌ Chave da NF-e não encontrada', 'error');
        }
        
    } catch (error) {
        console.error('❌ Erro ao cancelar NF-e:', error);
        showToast(`❌ Erro: ${error.message}`, 'error');
    }
}

// =========================================================
// EXPORTAR HANDLERS GLOBALMENTE
// =========================================================

window.handleEmitirNFEClick = handleEmitirNFEClick;
window.handleVerNFEClick = handleVerNFEClick;
window.handleCancelarNFEClick = handleCancelarNFEClick;

// =========================================================
// CARREGAR VENDAS PENDENTES (CORRIGIDO - VERIFICA NF-e NO ML)
// =========================================================

async function carregarVendasPendentes() {
    const tbody = document.getElementById('vendasPendentesBody');
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="8" class="text-center py-4"><div class="spinner"></div> Carregando vendas...</td></tr>`;

    try {
        let token = localStorage.getItem('ml_access_token');
        if (!token && typeof window.getValidToken === 'function') {
            const tokenData = await window.getValidToken();
            token = tokenData?.access_token;
        }
        if (!token) throw new Error('Token ML não disponível');

        // ===== 1. BUSCAR IDs COM NF-e NO MERCADO LIVRE =====
        console.log('🔍 Buscando vendas com NF-e no Mercado Livre...');
        let idsComNFE_ML = new Set();
        
        try {
            // Buscar invoices do seller
            const invoicesUrl = `https://api.mercadolibre.com/users/415176739/invoices`;
            const invoicesProxyUrl = `${window.WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(invoicesUrl)}&token=${encodeURIComponent(token)}`;
            const invoicesResponse = await fetch(invoicesProxyUrl);
            
            if (invoicesResponse.ok) {
                const invoicesData = await invoicesResponse.json();
                console.log('📋 Resposta das invoices:', invoicesData);
                
                // 🔥 VERIFICAR O FORMATO DA RESPOSTA
                let invoices = [];
                if (Array.isArray(invoicesData)) {
                    invoices = invoicesData;
                } else if (invoicesData.results && Array.isArray(invoicesData.results)) {
                    invoices = invoicesData.results;
                } else if (invoicesData.invoices && Array.isArray(invoicesData.invoices)) {
                    invoices = invoicesData.invoices;
                } else if (typeof invoicesData === 'object') {
                    // Pode ser um objeto com as invoices
                    for (const key in invoicesData) {
                        if (Array.isArray(invoicesData[key])) {
                            invoices = invoicesData[key];
                            break;
                        }
                    }
                }
                
                console.log(`📋 ${invoices.length} invoices encontradas`);
                
                for (const invoice of invoices) {
                    // Tentar extrair order_id de várias formas
                    let orderId = null;
                    
                    if (invoice.order_id) {
                        orderId = String(invoice.order_id);
                    } else if (invoice.external_order_id) {
                        orderId = String(invoice.external_order_id);
                    } else if (invoice.order) {
                        orderId = String(invoice.order);
                    } else if (invoice.pack_id) {
                        // Se tiver pack_id, buscar o order_id associado
                        try {
                            const packUrl = `https://api.mercadolibre.com/packs/${invoice.pack_id}`;
                            const packProxyUrl = `${window.WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(packUrl)}&token=${encodeURIComponent(token)}`;
                            const packResponse = await fetch(packProxyUrl);
                            if (packResponse.ok) {
                                const packData = await packResponse.json();
                                if (packData.orders && packData.orders.length > 0) {
                                    orderId = String(packData.orders[0]);
                                }
                            }
                        } catch (e) {}
                    }
                    
                    if (orderId) {
                        idsComNFE_ML.add(orderId);
                        console.log(`✅ Venda ${orderId} tem NF-e no ML`);
                    }
                }
                
                console.log(`📋 ${idsComNFE_ML.size} vendas com NF-e no ML`);
            } else {
                console.warn(`⚠️ Erro ao buscar invoices: ${invoicesResponse.status}`);
                // Tentar método alternativo - buscar invoice por venda individualmente não é viável
            }
        } catch (e) {
            console.warn('⚠️ Erro ao buscar invoices do ML:', e);
        }

        // ===== 2. BUSCAR IDs COM NF-e NO SUPABASE =====
        let idsComNFE_Supabase = new Set();
        try {
            const { data: nfes, error } = await window.supabaseClient
                .from('nfe_emitidas')
                .select('venda_id');
            if (!error && nfes) {
                idsComNFE_Supabase = new Set(nfes.map(n => String(n.venda_id)).filter(id => id !== 'null' && id !== null));
                console.log(`📋 ${idsComNFE_Supabase.size} vendas com NF-e no Supabase`);
            }
        } catch (e) {
            console.warn('⚠️ Erro ao consultar nfe_emitidas:', e);
        }

        // ===== 3. UNIR OS DOIS CONJUNTOS =====
        const idsComNFE = new Set([...idsComNFE_ML, ...idsComNFE_Supabase]);
        console.log(`📋 Total de ${idsComNFE.size} vendas com NF-e (ML + Supabase)`);

        // ===== 4. BUSCAR VENDAS DO ML =====
        const diasAtras = 15;
        const dataInicio = new Date();
        dataInicio.setDate(dataInicio.getDate() - diasAtras);
        
        let todasVendas = [];
        let offset = 0;
        const maxLimit = 50;
        let total = null;
        const MAX_PAGINAS = 4;
        
        while ((total === null || offset < total) && offset / maxLimit < MAX_PAGINAS) {
            const params = new URLSearchParams({
                seller: '415176739',
                sort: 'date_desc',
                'order.status': 'paid',
                limit: maxLimit,
                offset: offset,
                'order.date_created.from': dataInicio.toISOString()
            });
            
            const url = `https://api.mercadolibre.com/orders/search?${params}`;
            const proxyUrl = `${window.WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(url)}&token=${encodeURIComponent(token)}`;
            
            const response = await fetch(proxyUrl);
            if (!response.ok) throw new Error(`Erro na API: ${response.status}`);
            
            const data = await response.json();
            const orders = data.results || [];
            
            if (total === null) {
                total = data.paging?.total || 0;
                console.log(`📦 Total de pedidos no ML: ${total}`);
            }
            
            todasVendas = todasVendas.concat(orders);
            offset += maxLimit;
            
            if (todasVendas.length >= 200) {
                console.log(`⏹️ Limite de 200 vendas atingido`);
                break;
            }
            
            await new Promise(resolve => setTimeout(resolve, 200));
        }
        
        console.log(`📦 ${todasVendas.length} vendas obtidas do ML`);

        if (todasVendas.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center py-4">Nenhuma venda encontrada</td></tr>';
            return;
        }

        // ===== 5. PROCESSAR CADA VENDA =====
        const vendasProcessadas = [];

        for (const venda of todasVendas) {
            const idVenda = String(venda.id);
            
            // 🔥 VERIFICAR SE JÁ TEM NF-e
            const temNFE = idsComNFE.has(idVenda);
            
            // Buscar shipment
            let logisticType = '';
            let shippingMode = '';
            
            if (venda.shipping?.id) {
                try {
                    const shipUrl = `https://api.mercadolibre.com/shipments/${venda.shipping.id}`;
                    const shipProxyUrl = `${window.WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(shipUrl)}&token=${encodeURIComponent(token)}`;
                    const shipResponse = await fetch(shipProxyUrl);
                    if (shipResponse.ok) {
                        const shipment = await shipResponse.json();
                        logisticType = shipment.logistic_type || '';
                        shippingMode = shipment.shipping_mode || '';
                    }
                } catch (e) {
                    console.warn(`⚠️ Erro ao buscar shipment ${venda.shipping.id}:`, e);
                }
            }

            // Verificar FULL
            const isFull = 
                logisticType.toLowerCase() === 'fulfillment' ||
                logisticType.toLowerCase().includes('full') ||
                shippingMode.toLowerCase() === 'fulfillment' ||
                shippingMode.toLowerCase().includes('full') ||
                (venda.tags || []).some(t => t.toLowerCase() === 'fulfillment');

            // Buscar valor
            let valorProduto = 0;
            let valorFrete = 0;
            let totalPago = 0;
            
            try {
                const dadosPagamento = await buscarValorExatoPagamento(idVenda);
                if (dadosPagamento) {
                    valorProduto = dadosPagamento.valor_produto || 0;
                    valorFrete = dadosPagamento.valor_frete || 0;
                    totalPago = dadosPagamento.total_pago || 0;
                }
            } catch (e) {
                console.warn(`⚠️ Erro ao buscar pagamento para ${idVenda}:`, e);
            }

            if (valorProduto === 0 && venda.total_amount) {
                const custoFrete = venda.shipping?.cost || 0;
                valorProduto = Math.max(0, (venda.total_amount || 0) - custoFrete);
                totalPago = venda.total_amount || 0;
                valorFrete = custoFrete;
            }

            vendasProcessadas.push({
                ...venda,
                _logistic_type: logisticType,
                _shipping_mode: shippingMode,
                _is_full: isFull,
                _tem_nfe: temNFE,
                _valor_produto: valorProduto,
                _valor_frete: valorFrete,
                _total_pago: totalPago
            });
        }

        console.log(`📊 Vendas processadas: ${vendasProcessadas.length}`);

        if (vendasProcessadas.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center py-4">Nenhuma venda encontrada</td></tr>';
            return;
        }

        vendasPendentes = vendasProcessadas;

        // ===== 6. RENDERIZAR TABELA =====
        function gerarBadgeEnvio(venda) {
            const logisticType = venda._logistic_type || '';
            const shippingMode = venda._shipping_mode || '';
            const tipo = (logisticType + ' ' + shippingMode).toUpperCase();

            if (tipo.includes('FULL') || tipo.includes('FULFILLMENT')) {
                return '<span class="badge badge-danger" style="background: #dc3545; color: white; padding: 4px 10px;"><i class="fas fa-warehouse"></i> FULL</span>';
            }
            
            if (tipo.includes('DROP_OFF') || tipo.includes('SELF_SERVICE') || tipo.includes('FLEX')) {
                return '<span class="badge badge-flex" style="background: #fd7e14; color: white; padding: 4px 10px;"><i class="fas fa-motorcycle"></i> FLEX</span>';
            }
            
            if (tipo.includes('CROSS_DOCKING') || tipo.includes('ME2') || tipo.includes('MERCADO_ENVIOS')) {
                return '<span class="badge badge-mercado" style="background: #17a2b8; color: white; padding: 4px 10px;"><i class="fas fa-truck"></i> ME</span>';
            }

            if (tipo && tipo !== 'N/I' && tipo !== '') {
                return `<span class="badge badge-info" style="background: #6c757d; color: white; padding: 4px 10px;">${tipo}</span>`;
            }

            if (venda.shipping?.id) {
                return '<span class="badge badge-warning" style="background: #ffc107; color: #212529; padding: 4px 10px;"><i class="fas fa-clock"></i> PENDENTE</span>';
            }

            return '<span class="badge badge-secondary" style="padding: 4px 10px;">N/I</span>';
        }

        tbody.innerHTML = vendasProcessadas.map(v => {
            const vendaId = v.id;
            const dataVenda = v.date_created ? new Date(v.date_created).toLocaleDateString('pt-BR') : '-';
            const cliente = v.buyer?.nickname || 'N/I';
            const sku = v.order_items?.[0]?.item?.seller_sku || 'N/A';
            const valorExibir = v._valor_produto || v.total_amount || 0;
            
            let statusNFE = '';
            let botaoEmitir = '';
            const isFull = v._is_full || false;
            const temNFE = v._tem_nfe || false;

            if (isFull) {
                statusNFE = '<span class="badge badge-danger" style="background: #dc3545; color: white; padding: 4px 10px;">🚫 NF-e gerada pelo ML</span>';
                botaoEmitir = '<span class="text-muted" style="font-size: 12px;"><i class="fas fa-lock"></i> Automática</span>';
            } else if (temNFE) {
                statusNFE = '<span class="badge badge-success" style="background: #28a745; color: white; padding: 4px 10px;">✅ NF-e Emitida</span>';
                botaoEmitir = `
                    <button class="btn btn-sm btn-warning btn-ver-nfe" data-venda-id="${vendaId}" style="margin-right: 4px;">
                        <i class="fas fa-eye"></i> Ver
                    </button>
                    <button class="btn btn-sm btn-danger btn-cancelar-nfe" data-venda-id="${vendaId}">
                        <i class="fas fa-times"></i> Cancelar
                    </button>
                `;
            } else {
                statusNFE = '<span class="badge badge-warning">⏳ Pendente</span>';
                botaoEmitir = `
                    <button class="btn btn-sm btn-success btn-emitir-nfe" data-venda-id="${vendaId}">
                        <i class="fas fa-file-invoice"></i> Emitir NF-e
                    </button>
                `;
            }

            return `
            <tr>
                <td><strong>${vendaId}</strong></td>
                <td>${dataVenda}</td>
                <td>${cliente}</td>
                <td><code style="font-size: 11px;">${sku}</code></td>
                <td><strong>R$ ${parseFloat(valorExibir || 0).toFixed(2)}</strong></td>
                <td>${gerarBadgeEnvio(v)}</td>
                <td>${statusNFE}</td>
                <td>${botaoEmitir}</td>
            </tr>`;
        }).join('');

        // ===== 7. ADICIONAR EVENT LISTENERS =====
        document.querySelectorAll('#vendasPendentesBody .btn-emitir-nfe').forEach(btn => {
            btn.removeEventListener('click', window.handleEmitirNFEClick);
            btn.addEventListener('click', window.handleEmitirNFEClick);
        });

        document.querySelectorAll('#vendasPendentesBody .btn-ver-nfe').forEach(btn => {
            btn.removeEventListener('click', window.handleVerNFEClick);
            btn.addEventListener('click', window.handleVerNFEClick);
        });

        document.querySelectorAll('#vendasPendentesBody .btn-cancelar-nfe').forEach(btn => {
            btn.removeEventListener('click', window.handleCancelarNFEClick);
            btn.addEventListener('click', window.handleCancelarNFEClick);
        });

    } catch (error) {
        console.error('❌ Erro ao carregar vendas pendentes:', error);
        tbody.innerHTML = `<tr><td colspan="8" class="text-center text-danger py-4">Erro: ${error.message}</td></tr>`;
    }
}

// =========================================================
// 🔥 FUNÇÃO PARA SINCRONIZAR ESTOQUE COM ML (VERSÃO MELHORADA)
// =========================================================

async function sincronizarEstoqueComML(vendaId) {
    try {
        console.log(`🔄 Sincronizando estoque com ML para venda ${vendaId}...`);
        
        let token = localStorage.getItem('ml_access_token');
        if (!token && typeof window.getValidToken === 'function') {
            const tokenData = await window.getValidToken();
            token = tokenData?.access_token;
        }
        
        if (!token) {
            console.warn('⚠️ Token ML não disponível para sincronização');
            return false;
        }

        // ===== 1. TENTAR BUSCAR A VENDA NO SUPABASE =====
        let vendaML = null;
        let itensParaSincronizar = [];
        
        // Tentar na tabela vendas_ml
        const { data: venda1, error: error1 } = await window.supabaseClient
            .from('vendas_ml')
            .select('sku, quantidade, skus_kit, eh_kit, produtos')
            .eq('id_venda_ml', String(vendaId))
            .maybeSingle();
        
        if (!error1 && venda1) {
            vendaML = venda1;
            console.log('✅ Venda encontrada na tabela vendas_ml');
        } else {
            // Tentar na tabela vendas_nfe
            const { data: venda2, error: error2 } = await window.supabaseClient
                .from('vendas_nfe')
                .select('sku, quantidade, skus_kit, eh_kit, items_json')
                .eq('id_venda_ml', String(vendaId))
                .maybeSingle();
            
            if (!error2 && venda2) {
                vendaML = venda2;
                console.log('✅ Venda encontrada na tabela vendas_nfe');
            }
        }
        
        // ===== 2. EXTRAIR SKUs DA VENDA =====
        if (vendaML) {
            if (vendaML.eh_kit && vendaML.skus_kit && vendaML.skus_kit.length > 0) {
                for (const kitItem of vendaML.skus_kit) {
                    const { sku: skuReal, multiplicador } = extrairSkuEQuantidade(kitItem.sku);
                    const quantidadeKit = kitItem.estoque || 1;
                    const quantidadeTotal = quantidadeKit * (vendaML.quantidade || 1) * multiplicador;
                    itensParaSincronizar.push({
                        sku: skuReal,
                        quantidade: quantidadeTotal
                    });
                }
                console.log(`📦 KIT detectado: ${vendaML.skus_kit.length} SKUs para sincronizar`);
            } else {
                const { sku: skuReal, multiplicador } = extrairSkuEQuantidade(vendaML.sku);
                const quantidadeTotal = (vendaML.quantidade || 1) * multiplicador;
                itensParaSincronizar.push({
                    sku: skuReal,
                    quantidade: quantidadeTotal
                });
            }
        }
        
        // ===== 3. FALLBACK: USAR OS PRODUTOS DA EMISSÃO =====
        if (itensParaSincronizar.length === 0 && window.produtosParaEmissao && window.produtosParaEmissao.length > 0) {
            console.log('📦 Usando produtos da emissão para sincronização (fallback)');
            
            for (const prod of window.produtosParaEmissao) {
                if (!prod.sku || prod.sku === 'SEM_SKU' || prod.sku === 'N/A') continue;
                const { sku: skuReal, multiplicador } = extrairSkuEQuantidade(prod.sku);
                const quantidadeTotal = (prod.quantidade || 1) * multiplicador;
                itensParaSincronizar.push({
                    sku: skuReal,
                    quantidade: quantidadeTotal
                });
            }
        }
        
        // ===== 4. SE NÃO TEM NENHUM ITEM, RETORNAR =====
        if (itensParaSincronizar.length === 0) {
            console.warn('⚠️ Nenhum SKU encontrado para sincronizar');
            return false;
        }
        
        // ===== 5. BUSCAR OS PRODUTOS NO ESTOQUE E SINCRONIZAR =====
        let itensSincronizados = 0;
        
        for (const item of itensParaSincronizar) {
            if (!item.sku || item.sku === 'SEM_SKU' || item.sku === 'N/A') continue;
            
            console.log(`🔄 Sincronizando SKU ${item.sku} com ML...`);
            
            // Buscar o produto no estoque
            const { data: produto, error: prodError } = await window.supabaseClient
                .from('produtos_estoque')
                .select('id, quantidade, mlb_codes, sku, nome')
                .eq('sku', item.sku)
                .maybeSingle();
            
            if (prodError || !produto) {
                console.warn(`⚠️ Produto ${item.sku} não encontrado no estoque`);
                continue;
            }

            // Verificar se tem sincronização bloqueada
            const syncBloqueado = produto.bloquear_sync_ml || false;
            if (syncBloqueado) {
                console.log(`🔒 Sincronização bloqueada para ${item.sku}`);
                continue;
            }

            // Extrair MLB Codes
            let mlbCodes = null;
            if (produto.mlb_codes) {
                if (Array.isArray(produto.mlb_codes) && produto.mlb_codes.length > 0) {
                    mlbCodes = produto.mlb_codes;
                } else if (typeof produto.mlb_codes === 'string') {
                    try {
                        const parsed = JSON.parse(produto.mlb_codes);
                        mlbCodes = Array.isArray(parsed) ? parsed : [parsed];
                    } catch (e) {
                        mlbCodes = produto.mlb_codes.split(',').map(s => s.trim()).filter(s => s);
                    }
                } else if (typeof produto.mlb_codes === 'object') {
                    const values = Object.values(produto.mlb_codes);
                    mlbCodes = values.length > 0 ? values : null;
                }
            }
            
            if (!mlbCodes || mlbCodes.length === 0) {
                console.warn(`⚠️ MLB Codes não encontrados para SKU ${item.sku}`);
                continue;
            }

            // Sincronizar cada MLB Code
            for (const mlbCode of mlbCodes) {
                if (!mlbCode) continue;
                
                const itemId = mlbCode.startsWith('MLB') ? mlbCode : `MLB${mlbCode}`;
                
                try {
                    // Atualizar estoque no ML
                    const updateUrl = `https://api.mercadolibre.com/items/${itemId}`;
                    const updatePayload = {
                        available_quantity: produto.quantidade
                    };
                    
                    const updateProxyUrl = `${window.WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(updateUrl)}&token=${encodeURIComponent(token)}&method=PUT`;
                    const updateResponse = await fetch(updateProxyUrl, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(updatePayload)
                    });
                    
                    if (updateResponse.ok) {
                        itensSincronizados++;
                        console.log(`✅ Estoque do SKU ${item.sku} (${itemId}) sincronizado com ML: ${produto.quantidade}`);
                    } else {
                        const errorText = await updateResponse.text();
                        console.warn(`⚠️ Erro ao sincronizar SKU ${item.sku} (${itemId}): ${errorText}`);
                    }
                } catch (e) {
                    console.warn(`⚠️ Erro ao sincronizar SKU ${item.sku}:`, e);
                }
            }
        }

        if (itensSincronizados > 0) {
            console.log(`✅ ${itensSincronizados} item(ns) sincronizados com ML`);
            showToast(`✅ ${itensSincronizados} item(ns) sincronizados com ML!`, 'success');
        } else {
            console.warn('⚠️ Nenhum item foi sincronizado com ML');
        }

        return itensSincronizados > 0;

    } catch (error) {
        console.error('❌ Erro ao sincronizar estoque com ML:', error);
        return false;
    }
}

async function handleVerNFEClick(event) {
    const vendaId = event.currentTarget.dataset.vendaId;
    if (!vendaId) {
        showToast('❌ ID da venda não encontrado', 'error');
        return;
    }
    
    try {
        // Buscar a NF-e pela venda
        const listResponse = await fetch(`${window.API_BASE_URL}/nfe/listar-nfes`);
        const listData = await listResponse.json();
        
        if (!listData.success || !listData.notas) {
            showToast('❌ Erro ao listar NF-es', 'error');
            return;
        }
        
        const nfe = listData.notas.find(n => 
            String(n.venda_id) === String(vendaId) || 
            String(n.venda_id_ml) === String(vendaId) ||
            String(n.id_venda) === String(vendaId)
        );
        
        if (!nfe) {
            showToast(`❌ NF-e não encontrada para venda ${vendaId}`, 'error');
            return;
        }
        
        const chave = nfe.chave_acesso || nfe.chave;
        if (chave) {
            await visualizarNFE(chave);
        } else {
            showToast('❌ Chave da NF-e não encontrada', 'error');
        }
        
    } catch (error) {
        console.error('❌ Erro ao ver NF-e:', error);
        showToast(`❌ Erro: ${error.message}`, 'error');
    }
}

// =========================================================
// HANDLER PARA CANCELAR NF-e
// =========================================================

async function handleCancelarNFEClick(event) {
    const vendaId = event.currentTarget.dataset.vendaId;
    if (!vendaId) {
        showToast('❌ ID da venda não encontrado', 'error');
        return;
    }
    
    try {
        // Buscar a NF-e pela venda
        const listResponse = await fetch(`${window.API_BASE_URL}/nfe/listar-nfes`);
        const listData = await listResponse.json();
        
        if (!listData.success || !listData.notas) {
            showToast('❌ Erro ao listar NF-es', 'error');
            return;
        }
        
        const nfe = listData.notas.find(n => 
            String(n.venda_id) === String(vendaId) || 
            String(n.venda_id_ml) === String(vendaId) ||
            String(n.id_venda) === String(vendaId)
        );
        
        if (!nfe) {
            showToast(`❌ NF-e não encontrada para venda ${vendaId}`, 'error');
            return;
        }
        
        const chave = nfe.chave_acesso || nfe.chave;
        if (chave) {
            await cancelarNFESistema(chave);
        } else {
            showToast('❌ Chave da NF-e não encontrada', 'error');
        }
        
    } catch (error) {
        console.error('❌ Erro ao cancelar NF-e:', error);
        showToast(`❌ Erro: ${error.message}`, 'error');
    }
}

// =========================================================
// EXPORTAR HANDLERS
// =========================================================

window.handleVerNFEClick = handleVerNFEClick;
window.handleCancelarNFEClick = handleCancelarNFEClick;

// =========================================================
// EMITIR NF-e PARA VENDA
// =========================================================

async function emitirNFEParaVenda(orderId) {
    console.log('🔵 [emitirNFEParaVenda] FUNÇÃO INICIADA');
    console.log(`🔵 orderId recebido: ${orderId}`);

    if (!orderId || orderId === 'null' || orderId === 'undefined') {
        showToast('❌ ID da venda inválido', 'error');
        return;
    }

    pendingEmitOrderId = orderId;
    console.log('📋 Abrindo modal de dados do cliente...');
    abrirModalCliente();
    
    const camposLoading = ['clienteNome', 'clienteDocumento', 'clienteEndereco', 'clienteNumero', 'clienteBairro', 'clienteCidade', 'clienteUF', 'clienteCEP'];
    camposLoading.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.placeholder = '⏳ Carregando...';
            el.value = '';
            el.disabled = true;
        }
    });
    
    const numeroEl = document.getElementById('clienteNumero');
    if (numeroEl) numeroEl.value = 'S/N';

    try {
        let token = localStorage.getItem('ml_access_token');
        if (!token && typeof window.getValidToken === 'function') {
            const tokenData = await window.getValidToken();
            token = tokenData?.access_token;
        }
        
        if (!token) {
            console.warn('⚠️ Token ML não disponível.');
            habilitarCamposCliente();
            showToast('⚠️ Token ML não disponível. Preencha os dados manualmente.', 'warning');
            return;
        }

        const url = `https://api.mercadolibre.com/orders/${orderId}`;
        let venda = null;

        try {
            const proxyUrl = `${window.WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(url)}&token=${encodeURIComponent(token)}`;
            const response = await fetch(proxyUrl);
            if (response.ok) {
                venda = await response.json();
                console.log('✅ Venda obtida com sucesso');
            }
        } catch (error) {
            console.warn('⚠️ Erro no worker:', error);
        }

        if (!venda) {
            habilitarCamposCliente();
            showToast('⚠️ Preencha os dados manualmente.', 'warning');
            return;
        }

        if (typeof isFullByAnyField === 'function' && isFullByAnyField(venda)) {
            showToast('🚫 Esta venda é FULL e não permite emissão manual.', 'warning');
            habilitarCamposCliente();
            pendingEmitOrderId = null;
            return;
        }

        let address = {};
        if (venda.shipping && venda.shipping.id) {
            try {
                const shipUrl = `https://api.mercadolibre.com/shipments/${venda.shipping.id}`;
                const shipProxyUrl = `${window.WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(shipUrl)}&token=${encodeURIComponent(token)}`;
                const shipResponse = await fetch(shipProxyUrl);
                if (shipResponse.ok) {
                    const shipment = await shipResponse.json();
                    if (shipment.receiver_address) {
                        address = shipment.receiver_address;
                    }
                }
            } catch (error) {
                console.warn('⚠️ Erro ao buscar shipment:', error);
            }
        }

        if (!address.address_line && !address.street_name && venda.buyer && venda.buyer.address) {
            address = venda.buyer.address;
        }

        const buyer = venda.buyer || {};
        const nome = `${buyer.first_name || ''} ${buyer.last_name || ''}`.trim() || buyer.nickname || '';

        habilitarCamposCliente();
        
        document.getElementById('clienteNome').value = nome;
        document.getElementById('clienteEndereco').value = address.address_line || address.street_name || '';
        document.getElementById('clienteNumero').value = address.street_number || 'S/N';
        document.getElementById('clienteBairro').value = address.neighborhood?.name || address.neighborhood || '';
        document.getElementById('clienteCidade').value = address.city?.name || address.city || '';
        
        const ufOriginal = address.state?.name || address.state || '';
        const ufSigla = mapearUF(ufOriginal);
        document.getElementById('clienteUF').value = ufSigla;
        document.getElementById('clienteCEP').value = address.zip_code ? address.zip_code.replace(/\D/g, '') : '';
        document.getElementById('clienteDocumento').value = '';

        const cfopSelect = document.getElementById('nfeCfop');
        if (cfopSelect) {
            const cfopSugerido = (ufSigla === 'PR') ? '5102' : '6108';
            cfopSelect.value = cfopSugerido;
        }

        window._mlAccessToken = token;
        await carregarTransportadorasSelect();

    } catch (error) {
        console.error('❌ Erro ao buscar dados da venda:', error);
        habilitarCamposCliente();
        showToast('❌ Erro ao carregar dados. Preencha manualmente.', 'error');
    }
}

function habilitarCamposCliente() {
    const campos = ['clienteNome', 'clienteEndereco', 'clienteNumero', 'clienteBairro', 'clienteCidade', 'clienteUF', 'clienteCEP', 'clienteDocumento'];
    campos.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.disabled = false;
            if (el.placeholder === '⏳ Carregando...') {
                el.placeholder = '';
            }
        }
    });
}

function abrirModalCliente() {
    let modal = document.getElementById('modalDadosClienteNFE');
    
    if (!modal) {
        modal = criarModalClienteEmergencia();
    }
    
    if (modal) {
        modal.classList.remove('hidden');
        modal.style.display = 'flex';
        modal.style.alignItems = 'center';
        modal.style.justifyContent = 'center';
        modal.style.position = 'fixed';
        modal.style.top = '0';
        modal.style.left = '0';
        modal.style.width = '100%';
        modal.style.height = '100%';
        modal.style.backgroundColor = 'rgba(0,0,0,0.5)';
        modal.style.zIndex = '10000';
        
        setTimeout(() => {
            fixModalButtons();
        }, 200);
    }
}

function criarModalClienteEmergencia() {
    const oldModal = document.getElementById('modalDadosClienteNFE');
    if (oldModal) oldModal.remove();
    
    const modalHTML = `
    <div id="modalDadosClienteNFE" class="modal" style="display:none; align-items:center; justify-content:center; background:rgba(0,0,0,0.5); z-index:10000; position:fixed; top:0; left:0; width:100%; height:100%;">
        <div class="modal-content" style="max-width:600px; background:white; padding:25px; border-radius:8px; max-height:90vh; overflow-y:auto; width:95%;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
                <h3 style="margin:0;"><i class="fas fa-user-edit"></i> Dados do Cliente para NF-e</h3>
                <button onclick="fecharModalDadosClienteNFE()" style="background:none; border:none; font-size:28px; cursor:pointer; color:#6c757d; line-height:1;">&times;</button>
            </div>
            <form id="formDadosClienteNFE">
                <div class="form-group">
                    <label>Nome completo *</label>
                    <input type="text" id="clienteNome" class="form-control" required>
                </div>
                <div class="form-group">
                    <label>CPF / CNPJ * (apenas números)</label>
                    <input type="text" id="clienteDocumento" class="form-control" placeholder="00000000000" required>
                </div>
                <div class="form-group">
                    <label>Endereço (logradouro) *</label>
                    <input type="text" id="clienteEndereco" class="form-control" required>
                </div>
                <div class="row">
                    <div class="col-md-4">
                        <div class="form-group">
                            <label>Número</label>
                            <input type="text" id="clienteNumero" class="form-control" value="S/N">
                        </div>
                    </div>
                    <div class="col-md-8">
                        <div class="form-group">
                            <label>Bairro</label>
                            <input type="text" id="clienteBairro" class="form-control">
                        </div>
                    </div>
                </div>
                <div class="row">
                    <div class="col-md-5">
                        <div class="form-group">
                            <label>Cidade *</label>
                            <input type="text" id="clienteCidade" class="form-control" required>
                        </div>
                    </div>
                    <div class="col-md-3">
                        <div class="form-group">
                            <label>UF *</label>
                            <input type="text" id="clienteUF" class="form-control" maxlength="2" required>
                        </div>
                    </div>
                    <div class="col-md-4">
                        <div class="form-group">
                            <label>CEP</label>
                            <input type="text" id="clienteCEP" class="form-control" placeholder="00000000">
                        </div>
                    </div>
                </div>
                <div class="row">
                    <div class="col-md-6">
                        <div class="form-group">
                            <label>NCM</label>
                            <input type="text" id="nfeNcm" class="form-control" value="87149990">
                        </div>
                    </div>
                    <div class="col-md-6">
                        <div class="form-group">
                            <label>CFOP</label>
                            <select id="nfeCfop" class="form-control">
                                <option value="5102">5102 - Venda dentro do estado</option>
                                <option value="6108">6108 - Venda interestadual</option>
                                <option value="5405">5405 - Venda de produção</option>
                            </select>
                        </div>
                    </div>
                </div>
                <div class="form-group">
                    <label>Transportadora</label>
                    <select id="nfeTransportadora" class="form-control">
                        <option value="">Selecione uma transportadora</option>
                    </select>
                </div>
                
                <div class="d-flex justify-content-end gap-2 mt-3">
                    <button type="button" class="btn btn-secondary" id="cancelarModalNFEBtn">
                        <i class="fas fa-times"></i> Cancelar
                    </button>
                    <button type="button" class="btn btn-success" id="confirmarModalNFEBtn">
                        <i class="fas fa-file-invoice"></i> Confirmar e Emitir NF-e
                    </button>
                </div>
            </form>
        </div>
    </div>`;
    
    const container = document.createElement('div');
    container.innerHTML = modalHTML;
    document.body.appendChild(container.firstElementChild);
    
    const modal = document.getElementById('modalDadosClienteNFE');
    
    setTimeout(carregarTransportadorasSelect, 300);
    setTimeout(fixModalButtons, 100);
    
    return modal;
}

function fixModalButtons() {
    const btnConfirmar = document.getElementById('confirmarModalNFEBtn');
    if (btnConfirmar) {
        const novoBtn = btnConfirmar.cloneNode(true);
        btnConfirmar.parentNode.replaceChild(novoBtn, btnConfirmar);
        
        novoBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            confirmarEmissaoNFE();
        });
    }
    
    const btnCancelar = document.getElementById('cancelarModalNFEBtn');
    if (btnCancelar) {
        const novoBtn = btnCancelar.cloneNode(true);
        btnCancelar.parentNode.replaceChild(novoBtn, btnCancelar);
        
        novoBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            fecharModalDadosClienteNFE();
        });
    }
}

function fecharModalDadosClienteNFE() {
    const modal = document.getElementById('modalDadosClienteNFE');
    if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
    }
}

// =========================================================
// SALVAR CLIENTE NO BANCO
// =========================================================

async function salvarClienteNoBanco(dadosCliente) {
    try {
        const responseBusca = await fetch(`${window.API_BASE_URL}/nfe/clientes?documento=${dadosCliente.documento}`);
        if (responseBusca.ok) {
            const data = await responseBusca.json();
            if (data.clientes && data.clientes.length > 0) {
                return;
            }
        }

        const payload = {
            nome: dadosCliente.nome,
            documento: dadosCliente.documento,
            logradouro: dadosCliente.endereco,
            numero: dadosCliente.numero,
            bairro: dadosCliente.bairro,
            cidade: dadosCliente.cidade,
            uf: dadosCliente.uf,
            cep: dadosCliente.cep
        };

        await fetch(`${window.API_BASE_URL}/nfe/clientes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
    } catch (error) {
        console.error('❌ Erro ao salvar cliente:', error);
    }
}

// =========================================================
// CONFIRMAR EMISSÃO NF-E (COMPLETA COM SINCRONIZAÇÃO ML)
// =========================================================

async function confirmarEmissaoNFE() {
    console.log('🔵 [confirmarEmissaoNFE] FUNÇÃO INICIADA');
    
    const orderId = pendingEmitOrderId;
    if (!orderId) {
        showToast('❌ Nenhuma venda selecionada', 'error');
        fecharModalDadosClienteNFE();
        return;
    }

    // Capturar dados do cliente
    const nome = document.getElementById('clienteNome').value.trim();
    const documento = document.getElementById('clienteDocumento').value.trim().replace(/\D/g, '');
    const endereco = document.getElementById('clienteEndereco').value.trim();
    const numero = document.getElementById('clienteNumero').value.trim() || 'S/N';
    const bairro = document.getElementById('clienteBairro').value.trim() || '';
    const cidade = document.getElementById('clienteCidade').value.trim();
    const uf = document.getElementById('clienteUF').value.trim().toUpperCase();
    const cep = document.getElementById('clienteCEP').value.trim().replace(/\D/g, '');
    const transportadoraId = document.getElementById('nfeTransportadora')?.value || null;

    const cfopSelect = document.getElementById('nfeCfop');
    let cfop = cfopSelect ? cfopSelect.value : '';
    if (!cfop) {
        cfop = (uf === 'PR') ? '5102' : '6108';
    }

    // Validações
    if (!nome) { showToast('⚠️ Nome é obrigatório', 'warning'); return; }
    if (!documento || (documento.length !== 11 && documento.length !== 14)) {
        showToast('⚠️ CPF/CNPJ inválido (11 ou 14 dígitos)', 'warning');
        return;
    }
    if (!endereco) { showToast('⚠️ Endereço é obrigatório', 'warning'); return; }
    if (!cidade) { showToast('⚠️ Cidade é obrigatória', 'warning'); return; }
    if (uf.length !== 2) { showToast('⚠️ UF deve ter 2 letras', 'warning'); return; }

    const ufValidas = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];
    if (!ufValidas.includes(uf)) {
        showToast(`⚠️ UF "${uf}" inválida`, 'warning');
        return;
    }

    fecharModalDadosClienteNFE();

    // Loading no botão
    const btn = document.querySelector(`#vendasPendentesBody .btn-emitir-nfe[data-venda-id="${orderId}"]`);
    let originalText = '';
    if (btn) {
        originalText = btn.innerHTML;
        btn.innerHTML = '<span class="spinner"></span> Emitindo...';
        btn.disabled = true;
    }

    try {
        let token = localStorage.getItem('ml_access_token');
        if (!token && typeof window.getValidToken === 'function') {
            const tokenData = await window.getValidToken();
            token = tokenData?.access_token;
        }

        // Buscar produtos
        let produtos = window.produtosParaEmissao || [];
        
        if (produtos.length === 0 && token) {
            try {
                const url = `https://api.mercadolibre.com/orders/${orderId}`;
                const proxyUrl = `${window.WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(url)}&token=${encodeURIComponent(token)}`;
                const response = await fetch(proxyUrl);
                if (response.ok) {
                    const venda = await response.json();
                    const orderItems = venda.order_items || [];
                    
                    for (const item of orderItems) {
                        const sku = item.item.seller_sku || 'SEM_SKU';
                        const quantidade = item.quantity || 1;
                        const valorPago = item.unit_price || 0;
                        
                        let ncmSalvo = '87149990';
                        try {
                            const ncmData = await buscarNCMporSKU(sku);
                            if (ncmData) ncmSalvo = ncmData;
                        } catch (e) {}
                        
                        produtos.push({
                            nome: item.item.title || 'Produto',
                            quantidade: quantidade,
                            valor_unitario: valorPago,
                            sku: sku,
                            ncm: ncmSalvo
                        });
                    }
                }
            } catch (error) {
                console.warn('⚠️ Erro ao buscar dados da venda:', error);
            }
        }

        if (produtos.length === 0) {
            produtos = [{
                nome: 'Produto não identificado',
                quantidade: 1,
                valor_unitario: 0,
                sku: 'SEM_SKU',
                ncm: '87149990'
            }];
        }

        // NCM
        const produtosFinal = await Promise.all(produtos.map(async (prod) => {
            let ncmFinal = prod.ncm || '87149990';
            if (prod.sku && prod.sku !== 'SEM_SKU' && prod.sku !== 'N/A') {
                const ncmSalvo = await buscarNCMporSKU(prod.sku);
                if (ncmSalvo) ncmFinal = ncmSalvo;
                else await salvarNCMporSKU(prod.sku, ncmFinal);
            }
            return { ...prod, ncm: ncmFinal };
        }));

        const mlToken = window._mlAccessToken || token;

        const payload = {
            venda_id: String(orderId),
            cliente: { nome, documento, endereco, numero, bairro, cidade, uf, cep },
            produtos: produtosFinal,
            cfop: cfop,
            natureza_operacao: 'VENDA',
            modalidade_frete: transportadoraId ? '0' : '9',
            transportadora_id: transportadoraId,
            ml_access_token: mlToken
        };

        console.log('📤 Payload para emissão:', JSON.stringify(payload, null, 2));

        // ===== EMITIR NF-E =====
        const emitResponse = await fetch(`${window.API_BASE_URL}/nfe/emitir`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const result = await emitResponse.json();

        if (result.success) {
            showToast(`✅ NF-e emitida! Protocolo: ${result.protocolo}`, 'success');
            console.log('✅ NF-e emitida com sucesso:', result);
            
            // ===== SALVAR NA TABELA nfe_emitidas =====
            try {
                const chaveAcesso = result.chave_acesso || result.chave;
                if (chaveAcesso) {
                    // Verificar se já existe
                    const { data: existing } = await window.supabaseClient
                        .from('nfe_emitidas')
                        .select('id')
                        .eq('chave_acesso', chaveAcesso)
                        .maybeSingle();
                    
                    if (!existing) {
                        await window.supabaseClient
                            .from('nfe_emitidas')
                            .insert({
                                chave_acesso: chaveAcesso,
                                venda_id: orderId,
                                protocolo: result.protocolo,
                                data_emissao: new Date().toISOString(),
                                cliente_nome: nome,
                                valor_total: produtosFinal.reduce((acc, p) => acc + (p.valor_unitario * p.quantidade), 0),
                                xml_assinado: result.xml || null,
                                cancelada: false
                            });
                        console.log('✅ NF-e salva na tabela nfe_emitidas');
                    }
                }
            } catch (saveError) {
                console.warn('⚠️ Erro ao salvar NF-e no banco:', saveError);
            }
            
            // ===== ATUALIZAR STATUS DA VENDA =====
            try {
                await window.supabaseClient
                    .from('vendas_ml')
                    .update({ 
                        nfe_emitida: true,
                        status_nfe: 'emitida',
                        status_sistema: 'finalizada',
                        updated_at: new Date().toISOString()
                    })
                    .eq('id_venda_ml', String(orderId));
                console.log('✅ Status da venda atualizado');
            } catch (statusError) {
                console.warn('⚠️ Erro ao atualizar status da venda:', statusError);
            }
            
            // ===== ENVIAR XML PARA O ML =====
            try {
                const chaveAcesso = result.chave_acesso || result.chave;
                if (chaveAcesso) {
                    const xmlResponse = await fetch(`${window.API_BASE_URL}/nfe/buscar-xml?chave=${chaveAcesso}`);
                    const xmlData = await xmlResponse.json();
                    
                    if (xmlData.xml) {
                        let xmlContent = xmlData.xml;
                        
                        if (!xmlContent.startsWith('<?xml')) {
                            xmlContent = '<?xml version="1.0" encoding="UTF-8"?>\n' + xmlContent;
                        }
                        
                        if (xmlContent.includes('<NFe') && !xmlContent.includes('<nfeProc')) {
                            const nfeMatch = xmlContent.match(/<NFe[^>]*>([\s\S]*?)<\/NFe>/);
                            if (nfeMatch) {
                                const nfeContent = nfeMatch[0];
                                const protMatch = xmlContent.match(/<protNFe[^>]*>([\s\S]*?)<\/protNFe>/);
                                const protContent = protMatch ? protMatch[0] : '';
                                xmlContent = `<?xml version="1.0" encoding="UTF-8"?>\n<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">\n${nfeContent}\n${protContent}\n</nfeProc>`;
                            }
                        }
                        
                        xmlContent = xmlContent.replace(/>\s+</g, '><').replace(/^\s*[\r\n]/gm, '');
                        
                        const uploadResult = await enviarXMLparaMercadoLivre(orderId, xmlContent, mlToken);
                        
                        if (uploadResult.success) {
                            showToast('✅ NF-e vinculada ao ML com sucesso!', 'success');
                        } else {
                            showToast('⚠️ NF-e emitida, mas erro ao vincular ao ML', 'warning');
                        }
                    }
                }
            } catch (uploadError) {
                console.error('❌ Erro ao enviar XML para o ML:', uploadError);
                showToast('⚠️ NF-e emitida, mas erro ao vincular ao ML', 'warning');
            }
            
            // ===== BAIXAR ESTOQUE =====
            let itensBaixados = 0;
            try {
                console.log('📦 Baixando estoque...');
                
                const { data: vendaML, error: vendaError } = await window.supabaseClient
                    .from('vendas_ml')
                    .select('sku, quantidade, skus_kit, eh_kit')
                    .eq('id_venda_ml', String(orderId))
                    .maybeSingle();
                
                const itensParaBaixar = [];
                
                if (vendaML && !vendaError) {
                    if (vendaML.eh_kit && vendaML.skus_kit && vendaML.skus_kit.length > 0) {
                        for (const kitItem of vendaML.skus_kit) {
                            const { sku: skuReal, multiplicador } = extrairSkuEQuantidade(kitItem.sku);
                            const quantidadeKit = kitItem.estoque || 1;
                            const quantidadeTotal = quantidadeKit * (vendaML.quantidade || 1) * multiplicador;
                            itensParaBaixar.push({
                                sku: skuReal,
                                skuOriginal: kitItem.sku,
                                quantidade: quantidadeTotal
                            });
                        }
                        console.log(`📦 KIT detectado: ${vendaML.skus_kit.length} SKUs para baixar`);
                    } else {
                        const { sku: skuReal, multiplicador } = extrairSkuEQuantidade(vendaML.sku);
                        const quantidadeTotal = (vendaML.quantidade || 1) * multiplicador;
                        itensParaBaixar.push({
                            sku: skuReal,
                            skuOriginal: vendaML.sku,
                            quantidade: quantidadeTotal
                        });
                    }
                }
                
                if (itensParaBaixar.length === 0) {
                    for (const prod of produtosFinal) {
                        if (!prod.sku || prod.sku === 'SEM_SKU' || prod.sku === 'N/A') continue;
                        const { sku: skuReal, multiplicador } = extrairSkuEQuantidade(prod.sku);
                        const quantidadeTotal = (prod.quantidade || 1) * multiplicador;
                        itensParaBaixar.push({
                            sku: skuReal,
                            skuOriginal: prod.sku,
                            quantidade: quantidadeTotal
                        });
                    }
                }
                
                for (const item of itensParaBaixar) {
                    if (!item.sku || item.sku === 'SEM_SKU' || item.sku === 'N/A') continue;
                    
                    const { data: produto, error: prodError } = await window.supabaseClient
                        .from('produtos_estoque')
                        .select('id, quantidade, nome')
                        .eq('sku', item.sku)
                        .maybeSingle();
                    
                    if (!prodError && produto) {
                        const novaQuantidade = Math.max(0, produto.quantidade - item.quantidade);
                        
                        await window.supabaseClient
                            .from('produtos_estoque')
                            .update({ 
                                quantidade: novaQuantidade,
                                updated_at: new Date().toISOString()
                            })
                            .eq('id', produto.id);
                        
                        itensBaixados++;
                        console.log(`✅ Estoque do SKU ${item.sku} atualizado: ${produto.quantidade} → ${novaQuantidade}`);
                        
                        // Registrar movimentação
                        if (typeof window.registrarMovimentacao === 'function') {
                            try {
                                await window.registrarMovimentacao(
                                    produto.id,
                                    'saida',
                                    item.quantidade,
                                    `NFE-${orderId}`,
                                    'venda'
                                );
                            } catch (movError) {
                                console.warn(`⚠️ Erro ao registrar movimentação:`, movError);
                            }
                        }
                    } else {
                        console.warn(`⚠️ Produto não encontrado: ${item.sku}`);
                    }
                }
                
                if (itensBaixados > 0) {
                    showToast(`✅ ${itensBaixados} item(ns) baixados do estoque!`, 'success');
                }
                
                // Recarregar estoque
                if (typeof window.carregarProdutosEstoque === 'function') {
                    await window.carregarProdutosEstoque();
                }
                
            } catch (stockError) {
                console.error('❌ Erro ao baixar estoque:', stockError);
                showToast('⚠️ NF-e emitida, mas houve erro ao baixar o estoque', 'warning');
            }
            
            // =========================================================
            // 🔥 SINCRONIZAR ESTOQUE COM ML APÓS A BAIXA
            // =========================================================
            try {
                console.log('🔄 Sincronizando estoque com ML...');
                const sincronizado = await sincronizarEstoqueComML(orderId);
                if (sincronizado) {
                    console.log('✅ Estoque sincronizado com ML com sucesso!');
                } else {
                    console.warn('⚠️ Falha na sincronização com ML');
                }
            } catch (syncError) {
                console.error('❌ Erro na sincronização com ML:', syncError);
                showToast('⚠️ NF-e emitida, mas erro na sincronização com ML', 'warning');
            }
            
            // ===== SALVAR CLIENTE =====
            await salvarClienteNoBanco({ nome, documento, endereco, numero, bairro, cidade, uf, cep });
            
            // ===== REGISTRAR NO HISTÓRICO =====
            try {
                await window.supabaseClient
                    .from('estoque_historico')
                    .insert({
                        venda_id: orderId,
                        tipo: 'venda',
                        observacao: `NF-e emitida - Venda ${orderId} - Cliente: ${nome}`,
                        criado_por: nome || 'Sistema',
                        criado_em: new Date().toISOString()
                    });
                console.log('✅ Histórico registrado');
            } catch (histError) {
                console.warn('⚠️ Erro ao registrar histórico:', histError);
            }
            
            // ===== LIMPAR E RECARREGAR =====
            window.produtosParaEmissao = null;
            window._mlAccessToken = null;
            pendingEmitOrderId = null;
            vendaIdParaEdicao = null;
            
            await carregarVendasPendentes();
            await carregarNFesEmitidas();
            
            showToast('✅ Processo concluído com sucesso!', 'success');
            
        } else {
            // ===== ERRO NA EMISSÃO =====
            let mensagemErro = result.error || 'Erro desconhecido';
            
            // Mapear erros da SEFAZ
            const errosSEFAZ = {
                '275': 'Código do Município do Destinatário difere da UF do Destinatário.',
                '245': 'Código do Município do Destinatário não informado.',
                '246': 'Código do Município do Destinatário inválido.',
                '247': 'UF do Destinatário inválida.',
                '248': 'CEP do Destinatário inválido.',
                '249': 'Endereço do Destinatário não informado.',
                '250': 'Bairro do Destinatário não informado.',
                '251': 'Cidade do Destinatário não informada.'
            };
            
            const cStatMatch = mensagemErro.match(/cStat=(\d+)/);
            if (cStatMatch) {
                const cStat = cStatMatch[1];
                if (errosSEFAZ[cStat]) {
                    mensagemErro = `${mensagemErro}\n\n💡 ${errosSEFAZ[cStat]}`;
                }
            }
            
            showToast(`❌ Erro: ${mensagemErro}`, 'error');
            
            if (mensagemErro.includes('Municipio') || mensagemErro.includes('município')) {
                showToast('⚠️ Verifique a UF e a Cidade.', 'warning');
                setTimeout(() => abrirModalCliente(), 1000);
            }
        }
        
    } catch (error) {
        console.error('❌ Erro na emissão:', error);
        showToast(`❌ Erro: ${error.message}`, 'error');
    } finally {
        if (btn) {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
        window._mlAccessToken = null;
        window.produtosParaEmissao = null;
    }
}

// =========================================================
// NF-ES EMITIDAS
// =========================================================

async function carregarNFesEmitidas() {
    const tbody = document.getElementById('nfesEmitidasBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="6" class="text-center"><div class="spinner"></div> Carregando...</td></tr>';
    try {
        const response = await fetch(`${window.API_BASE_URL}/nfe/listar-nfes`);
        const data = await response.json();
        if (!data.success) throw new Error(data.error);
        const nfes = data.notas || [];
        if (!nfes.length) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center">Nenhuma NF-e emitida</td></tr>';
            return;
        }
        tbody.innerHTML = nfes.map(nfe => {
            const chave = nfe.chave_acesso || nfe.chave || 'N/A';
            const protocolo = nfe.protocolo || '-';
            const dataEmissao = nfe.data_emissao ? new Date(nfe.data_emissao).toLocaleDateString('pt-BR') : '-';
            
            let clienteNome = nfe.cliente_nome || nfe.cliente?.nome || '-';
            let valorTotal = nfe.valor_total ? parseFloat(nfe.valor_total).toFixed(2) : '—';
            
            if (clienteNome === '-' || valorTotal === '—') {
                try {
                    if (nfe.xml_assinado) {
                        const parser = new DOMParser();
                        const xmlDoc = parser.parseFromString(nfe.xml_assinado, 'application/xml');
                        const infNFe = xmlDoc.querySelector('infNFe');
                        if (infNFe) {
                            const dest = infNFe.querySelector('dest');
                            if (dest) {
                                const xNome = dest.querySelector('xNome');
                                if (xNome) clienteNome = xNome.textContent || '-';
                            }
                            const ICMSTot = infNFe.querySelector('ICMSTot');
                            if (ICMSTot) {
                                const vNF = ICMSTot.querySelector('vNF');
                                if (vNF) valorTotal = parseFloat(vNF.textContent || '0').toFixed(2);
                            }
                        }
                    }
                } catch (e) {
                    console.warn('Erro ao extrair dados do XML:', e);
                }
            }

            return `
            <tr>
                <td><small>${chave}</small></td>
                <td>${protocolo}</td>
                <td>${clienteNome}</td>
                <td>R$ ${valorTotal}</td>
                <td>${dataEmissao}</td>
                <td>
                    <button class="btn btn-sm btn-info" onclick="visualizarNFE('${chave}')">Visualizar</button>
                    <button class="btn btn-sm btn-secondary" onclick="baixarXMLNFE('${chave}')">XML</button>
                    ${!nfe.cancelada ? `<button class="btn btn-sm btn-danger" onclick="cancelarNFE('${chave}')">Cancelar</button>` : '<span class="badge badge-danger">Cancelada</span>'}
                </td>
            </tr>`;
        }).join('');
    } catch (error) {
        console.error(error);
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-danger">Erro ao carregar NF-es</td></tr>';
    }
}

// ===== VISUALIZAR, BAIXAR, CANCELAR =====
async function visualizarNFE(chaveAcesso) {
    try {
        const response = await fetch(`${window.API_BASE_URL}/nfe/buscar-xml?chave=${chaveAcesso}`);
        const data = await response.json();
        if (!data.xml) {
            window.showToast('XML não encontrado', 'error');
            return;
        }

        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(data.xml, 'application/xml');
        const infNFe = xmlDoc.querySelector('infNFe');
        if (!infNFe) {
            window.showToast('XML inválido', 'error');
            return;
        }

        const chave = infNFe.getAttribute('Id').replace('NFe', '');
        const nNF = infNFe.querySelector('nNF')?.textContent || '';
        const serie = infNFe.querySelector('serie')?.textContent || '';
        const natOp = infNFe.querySelector('natOp')?.textContent || '';
        const dhEmi = infNFe.querySelector('dhEmi')?.textContent || '';
        const dhSaiEnt = infNFe.querySelector('dhSaiEnt')?.textContent || '';
        const modFrete = infNFe.querySelector('modFrete')?.textContent || '9';
        const protocolo = infNFe.querySelector('nProt')?.textContent || 'Não informado';

        const emit = infNFe.querySelector('emit');
        const emitNome = emit.querySelector('xNome')?.textContent || '';
        const emitCNPJ = emit.querySelector('CNPJ')?.textContent || '';
        const emitIE = emit.querySelector('IE')?.textContent || '';
        const emitEnd = emit.querySelector('enderEmit');
        const emitLogr = emitEnd?.querySelector('xLgr')?.textContent || '';
        const emitNro = emitEnd?.querySelector('nro')?.textContent || '';
        const emitBairro = emitEnd?.querySelector('xBairro')?.textContent || '';
        const emitMun = emitEnd?.querySelector('xMun')?.textContent || '';
        const emitUF = emitEnd?.querySelector('UF')?.textContent || '';
        const emitCEP = emitEnd?.querySelector('CEP')?.textContent || '';
        const emitFone = emitEnd?.querySelector('fone')?.textContent || '';

        const dest = infNFe.querySelector('dest');
        const destNome = dest.querySelector('xNome')?.textContent || '';
        const destDoc = dest.querySelector('CPF')?.textContent || dest.querySelector('CNPJ')?.textContent || '';
        const destEnd = dest.querySelector('enderDest');
        const destLogr = destEnd?.querySelector('xLgr')?.textContent || '';
        const destNro = destEnd?.querySelector('nro')?.textContent || '';
        const destBairro = destEnd?.querySelector('xBairro')?.textContent || '';
        const destMun = destEnd?.querySelector('xMun')?.textContent || '';
        const destUF = destEnd?.querySelector('UF')?.textContent || '';
        const destCEP = destEnd?.querySelector('CEP')?.textContent || '';

        const dets = xmlDoc.querySelectorAll('det');
        let produtosHTML = '';
        let totalProd = 0;
        dets.forEach((det, idx) => {
            const prod = det.querySelector('prod');
            const nome = prod.querySelector('xProd')?.textContent || '';
            const ncm = prod.querySelector('NCM')?.textContent || '';
            const cfop = prod.querySelector('CFOP')?.textContent || '';
            const qtd = prod.querySelector('qCom')?.textContent || '0';
            const vUn = prod.querySelector('vUnCom')?.textContent || '0';
            const vProd = prod.querySelector('vProd')?.textContent || '0';
            const unidade = 'PC';
            totalProd += parseFloat(vProd) || 0;
            produtosHTML += `
                <tr>
                    <td>${idx+1}</td>
                    <td style="text-align:left;">${nome}</td>
                    <td>${ncm}</td>
                    <td>${cfop}</td>
                    <td>${unidade}</td>
                    <td style="text-align:right;">${qtd}</td>
                    <td style="text-align:right;">${parseFloat(vUn).toFixed(2)}</td>
                    <td style="text-align:right;">${parseFloat(vProd).toFixed(2)}</td>
                </tr>
            `;
        });

        const ICMSTot = infNFe.querySelector('ICMSTot');
        const vNF = ICMSTot?.querySelector('vNF')?.textContent || totalProd.toFixed(2);
        const vProdTotal = ICMSTot?.querySelector('vProd')?.textContent || totalProd.toFixed(2);
        const vFrete = ICMSTot?.querySelector('vFrete')?.textContent || '0';
        const vSeg = ICMSTot?.querySelector('vSeg')?.textContent || '0';
        const vDesc = ICMSTot?.querySelector('vDesc')?.textContent || '0';
        const vTotTrib = ICMSTot?.querySelector('vTotTrib')?.textContent || '0';

        const transp = infNFe.querySelector('transp');
        const transporta = transp?.querySelector('transporta');
        const vol = transp?.querySelector('vol');

        let qVol = '0';
        let pesoL = '0,000';
        let pesoB = '0,000';
        if (vol) {
            qVol = vol.querySelector('qVol')?.textContent || '0';
            pesoL = vol.querySelector('pesoL')?.textContent || '0,000';
            pesoB = vol.querySelector('pesoB')?.textContent || '0,000';
            if (!isNaN(parseFloat(pesoL))) pesoL = parseFloat(pesoL).toFixed(3);
            if (!isNaN(parseFloat(pesoB))) pesoB = parseFloat(pesoB).toFixed(3);
        }

        let transpHTML = '';
        if (transporta) {
            const tpCNPJ = transporta.querySelector('CNPJ')?.textContent || '';
            const tpNome = transporta.querySelector('xNome')?.textContent || '';
            const tpIE = transporta.querySelector('IE')?.textContent || '';
            const tpEnd = transporta.querySelector('xEnder')?.textContent || '';
            const tpMun = transporta.querySelector('xMun')?.textContent || '';
            const tpUF = transporta.querySelector('UF')?.textContent || '';
            const freteLabel = modFrete === '0' ? 'Emitente' : modFrete === '1' ? 'Destinatário' : modFrete === '2' ? 'Terceiros' : 'Sem frete';
            transpHTML = `
                <div class="transp-section">
                    <table class="transp-table">
                        <tr><th colspan="4">TRANSPORTADOR / VOLUMES TRANSPORTADOS</th></tr>
                        <tr>
                            <td><strong>RAZÃO SOCIAL</strong><br>${tpNome}</td>
                            <td><strong>FRETE POR CONTA</strong><br>${freteLabel}</td>
                            <td><strong>CNPJ/CPF</strong><br>${tpCNPJ}</td>
                            <td><strong>INSCRIÇÃO ESTADUAL</strong><br>${tpIE}</td>
                        </tr>
                        <tr>
                            <td colspan="2"><strong>ENDEREÇO</strong><br>${tpEnd}</td>
                            <td><strong>MUNICÍPIO</strong><br>${tpMun}</td>
                            <td><strong>UF</strong><br>${tpUF}</td>
                        </tr>
                        <tr>
                            <td><strong>QUANTIDADE</strong><br>${qVol}</td>
                            <td><strong>ESPÉCIE</strong><br></td>
                            <td><strong>MARCA</strong><br></td>
                            <td><strong>NUMERAÇÃO</strong><br></td>
                        </tr>
                        <tr>
                            <td><strong>PESO BRUTO</strong><br>${pesoB}</td>
                            <td><strong>PESO LÍQUIDO</strong><br>${pesoL}</td>
                            <td colspan="2"></td>
                        </tr>
                    </table>
                </div>
            `;
        } else {
            transpHTML = `<p><strong>Frete:</strong> ${modFrete === '9' ? 'Sem frete' : 'Não informado'}</p>`;
        }

        const infAdic = infNFe.querySelector('infAdic infCpl')?.textContent || '';

        const html = `
<!DOCTYPE html>
<html>
<head>
    <title>DANFE - ${chave}</title>
    <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"></script>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Courier New', Courier, monospace;
            background: #fff;
            padding: 20px;
            color: #000;
            font-size: 11px;
            line-height: 1.3;
        }
        .danfe {
            max-width: 1000px;
            margin: 0 auto;
            border: 2px solid #000;
            padding: 15px;
            background: #fff;
            position: relative;
        }
        .header {
            border-bottom: 2px solid #000;
            padding-bottom: 8px;
            margin-bottom: 10px;
            text-align: center;
            position: relative;
        }
        .logo-container {
            position: absolute;
            top: 0;
            left: 0;
            width: 60px;
            height: 60px;
        }
        .logo-container img {
            max-width: 100%;
            max-height: 60px;
            object-fit: contain;
        }
        .header .emitente-nome { font-size: 16px; font-weight: bold; }
        .header .emitente-end { font-size: 10px; }
        .header .titulo { font-size: 20px; font-weight: bold; letter-spacing: 2px; }
        .header .subtitulo { font-size: 12px; }
        .chave {
            font-size: 14px;
            font-weight: bold;
            letter-spacing: 2px;
            background: #eee;
            padding: 4px 8px;
            margin: 5px 0;
            border: 1px solid #000;
        }
        .barcode-container {
            text-align: center;
            margin: 5px 0;
        }
        .barcode-container svg {
            max-width: 100%;
            height: auto;
        }
        .recibo {
            border: 1px solid #000;
            padding: 8px;
            margin: 0 0 10px 0;
            font-size: 10px;
            text-align: center;
        }
        .recibo .assinatura {
            margin-top: 10px;
            padding-top: 10px;
            border-top: 1px solid #000;
            display: flex;
            justify-content: space-between;
        }
        .dados-gerais {
            display: flex;
            justify-content: space-between;
            border-top: 1px solid #000;
            border-bottom: 1px solid #000;
            padding: 6px 0;
            margin: 6px 0;
        }
        .dados-gerais > div { width: 48%; }
        .dados-gerais p { margin: 2px 0; }
        .dados-gerais .label { font-weight: bold; }
        .table-produtos {
            width: 100%;
            border-collapse: collapse;
            margin: 10px 0;
            font-size: 10px;
        }
        .table-produtos th, .table-produtos td {
            border: 1px solid #000;
            padding: 3px 4px;
            text-align: center;
        }
        .table-produtos th { background: #ddd; font-weight: bold; }
        .table-produtos td:first-child { width: 30px; }
        .table-produtos td:nth-child(2) { text-align: left; min-width: 200px; }
        .table-produtos td:nth-child(6), .table-produtos td:nth-child(7), .table-produtos td:nth-child(8) { text-align: right; padding-right: 6px; }

        .totais {
            display: flex;
            justify-content: flex-end;
            border-top: 1px solid #000;
            border-bottom: 1px solid #000;
            padding: 6px 0;
            margin: 6px 0;
        }
        .totais > div { margin-left: 30px; text-align: right; }
        .totais .valor-grande { font-size: 14px; font-weight: bold; }

        .transp-section { margin: 10px 0; border-top: 1px solid #000; padding-top: 6px; }
        .transp-table { width: 100%; border-collapse: collapse; }
        .transp-table th, .transp-table td { border: 1px solid #000; padding: 3px 5px; text-align: left; vertical-align: top; }
        .transp-table th { background: #ddd; text-align: center; }

        .dados-adicionais {
            border: 2px solid #000;
            padding: 10px;
            margin: 10px 0;
            font-size: 9px;
            white-space: pre-wrap;
            position: relative;
            background: #fcfcfc;
        }
        .dados-adicionais .titulo {
            font-weight: bold;
            font-size: 10px;
            background: #fff;
            padding: 0 6px;
            position: absolute;
            top: -8px;
            left: 10px;
            border: 1px solid #000;
            background: #fff;
            border-radius: 2px;
        }
        .dados-adicionais .conteudo {
            margin-top: 6px;
            text-align: center;
        }

        .footer {
            text-align: center;
            font-size: 9px;
            border-top: 1px solid #000;
            padding-top: 6px;
            margin-top: 10px;
        }

        .no-print { text-align: center; margin-bottom: 15px; }
        .no-print button { padding: 8px 20px; margin: 0 5px; cursor: pointer; }
        @media print {
            .no-print { display: none; }
            body { padding: 0; }
            .danfe { border: none; padding: 10px; }
        }
    </style>
</head>
<body>
    <div class="no-print">
        <button onclick="window.print()">🖨️ Imprimir DANFE</button>
        <button onclick="window.close()">❌ Fechar</button>
    </div>
    <div class="danfe">
        <div class="recibo">
            <div><strong>RECEBEMOS DE ${emitNome} OS PRODUTOS CONSTANTES DA NOTA FISCAL INDICADA ABAIXO</strong></div>
            <div style="margin-top:5px;">NF-e Nº ${nNF.padStart(6, '0')} - SÉRIE ${serie}</div>
            <div style="margin-top:8px;">DATA DE RECEBIMENTO: ____________________</div>
            <div class="assinatura">
                <span>IDENTIFICAÇÃO E ASSINATURA DO RECEBEDOR _____________________________________________________________________________________________________________</span>
            </div>
        </div>

        <div class="header">
            <div class="logo-container">
                <img src="logo.png" alt="Logo Wheel Tech">
            </div>
            <div class="emitente-nome">${emitNome}</div>
            <div class="emitente-end">${emitLogr}, ${emitNro} - ${emitBairro} - ${emitMun}/${emitUF} - CEP: ${emitCEP} - Fone: ${emitFone}</div>
            <div style="margin-top:6px;">
                <span class="titulo">DANFE</span>
                <span class="subtitulo">Documento Auxiliar da Nota Fiscal Eletrônica</span>
            </div>
            <div style="display:flex; justify-content:space-between; margin-top:4px;">
                <span><strong>1 - SAÍDA</strong></span>
                <span><strong>Nº ${nNF.padStart(6, '0')}</strong> | SÉRIE ${serie} | FOLHA 1/1</span>
            </div>
            <div class="chave">CHAVE DE ACESSO: ${chave.replace(/(.{4})/g, '$1 ')}</div>
            <div style="font-size:9px;">Consulta: www.nfe.fazenda.gov.br/portal ou site da Sefaz Autorizadora</div>
            <div style="margin-top:2px;"><strong>Protocolo:</strong> ${protocolo}</div>
            <div class="barcode-container">
                <svg id="barcode"></svg>
            </div>
        </div>

        <div class="dados-gerais">
            <div>
                <p><span class="label">NATUREZA DA OPERAÇÃO</span><br>${natOp}</p>
                <p><span class="label">INSCRIÇÃO ESTADUAL</span><br>${emitIE}</p>
                <p><span class="label">CNPJ/CPF</span><br>${emitCNPJ}</p>
            </div>
            <div>
                <p><span class="label">DESTINATÁRIO / REMETENTE</span><br>${destNome}</p>
                <p><span class="label">ENDEREÇO</span><br>${destLogr}, ${destNro} - ${destBairro} - ${destMun}/${destUF}</p>
                <p><span class="label">CNPJ/CPF</span><br>${destDoc}</p>
                <p><span class="label">DATA DA EMISSÃO</span><br>${dhEmi.split('T')[0].replace(/-/g, '/')}</p>
                <p><span class="label">DATA DA SAÍDA/ENTRADA</span><br>${dhSaiEnt.split('T')[0].replace(/-/g, '/')}</p>
                <p><span class="label">HORA DE SAÍDA</span><br>${dhSaiEnt.split('T')[1]?.substring(0,5) || ''}</p>
            </div>
        </div>

        <div style="display:flex; justify-content:space-between; border:1px solid #000; padding:4px 8px; margin:6px 0;">
            <div><strong>BASE DE CÁLCULO DO ICMS</strong><br>0,00</div>
            <div><strong>VALOR DO ICMS</strong><br>0,00</div>
            <div><strong>BASE DE CÁLCULO DO ICMS ST</strong><br>0,00</div>
            <div><strong>VALOR DO ICMS ST</strong><br>0,00</div>
            <div><strong>VALOR TOTAL DOS PRODUTOS</strong><br>${parseFloat(vProdTotal).toFixed(2)}</div>
        </div>
        <div style="display:flex; justify-content:space-between; border:1px solid #000; padding:4px 8px; margin-bottom:6px;">
            <div><strong>VALOR DO FRETE</strong><br>${parseFloat(vFrete).toFixed(2)}</div>
            <div><strong>VALOR DO SEGURO</strong><br>${parseFloat(vSeg).toFixed(2)}</div>
            <div><strong>DESCONTO</strong><br>${parseFloat(vDesc).toFixed(2)}</div>
            <div><strong>OUTRAS DESPESAS</strong><br>0,00</div>
            <div><strong>VALOR DO IPI</strong><br>0,00</div>
            <div><strong>VALOR TOTAL DA NOTA</strong><br>${parseFloat(vNF).toFixed(2)}</div>
        </div>

        <table class="table-produtos">
            <thead>
                <tr>
                    <th>CÓDIGO</th>
                    <th>DESCRIÇÃO DOS PRODUTOS / SERVIÇOS</th>
                    <th>NCM/SH</th>
                    <th>CFOP</th>
                    <th>UNID.</th>
                    <th>QTD.</th>
                    <th>VLR UNIT.</th>
                    <th>VALOR TOTAL</th>
                </tr>
            </thead>
            <tbody>${produtosHTML}</tbody>
        </table>

        ${transpHTML}

        <div class="dados-adicionais">
            <div class="titulo">DADOS ADICIONAIS</div>
            <div class="conteudo">${infAdic || 'Nenhuma informação complementar.'}</div>
        </div>

        <div class="footer">
            <p>Documento gerado eletronicamente - Sistema Wheel Tech</p>
            <p>Chave: ${chave}</p>
        </div>
    </div>

    <script>
        JsBarcode("#barcode", "${chave}", {
            format: "CODE128",
            width: 1.2,
            height: 40,
            displayValue: false,
            fontSize: 12,
            background: "#ffffff",
            lineColor: "#000000"
        });
    </script>
</body>
</html>`;

        const win = window.open('', '_blank', 'width=1000,height=800');
        win.document.write(html);
        win.document.close();

    } catch (error) {
        console.error('Erro ao visualizar NF-e:', error);
        window.showToast('Erro ao visualizar NF-e', 'error');
    }
}

async function baixarXMLNFE(chaveAcesso) {
    try {
        const response = await fetch(`${window.API_BASE_URL}/nfe/buscar-xml?chave=${chaveAcesso}`);
        const data = await response.json();
        if (!data.xml) {
            window.showToast('XML não encontrado', 'error');
            return;
        }
        const blob = new Blob([data.xml], { type: 'application/xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `NFe_${chaveAcesso}.xml`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (error) {
        window.showToast('Erro ao baixar XML', 'error');
    }
}

async function cancelarNFE(chaveAcesso) {
    const justificativa = prompt('Informe a justificativa para cancelamento:');
    if (!justificativa) return;
    try {
        const response = await fetch(`${window.API_BASE_URL}/nfe/cancelar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chaveAcesso, justificativa })
        });
        const result = await response.json();
        if (result.success) {
            window.showToast('NF-e cancelada com sucesso', 'success');
            await carregarNFesEmitidas();
        } else {
            window.showToast('Erro ao cancelar: ' + result.error, 'error');
        }
    } catch (error) {
        window.showToast('Erro de comunicação', 'error');
    }
}

// ===================== TRANSPORTADORAS =====================
async function carregarTransportadoras() {
    const tbody = document.getElementById('transportadorasBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="4" class="text-center"><div class="spinner"></div> Carregando...</td></tr>';
    try {
        const response = await fetch(`${window.API_BASE_URL}/nfe/transportadoras`);
        const data = await response.json();
        if (!data.success) throw new Error(data.error);
        const transportadoras = data.transportadoras || [];
        if (!transportadoras.length) {
            tbody.innerHTML = '<td><td colspan="4" class="text-center">Nenhuma transportadora cadastrada</td></tr>';
            return;
        }
        tbody.innerHTML = transportadoras.map(t => `
            <tr>
                <td>${t.nome}</td>
                <td>${t.cnpj}</td>
                <td>${t.ie || '-'}</td>
                <td><button class="btn btn-sm btn-danger" onclick="excluirTransportadora(${t.id})">Excluir</button></td>
            </tr>`).join('');
        const select = document.getElementById('avulsaTransportadoraId');
        if (select) select.innerHTML = '<option value="">Selecione</option>' + transportadoras.map(t => `<option value="${t.id}">${t.nome}</option>`).join('');
    } catch (error) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center text-danger">Erro ao carregar</td></tr>';
    }
}

async function excluirTransportadora(id) {
    if (!confirm('Excluir esta transportadora?')) return;
    try {
        const response = await fetch(`${window.API_BASE_URL}/nfe/transportadoras/${id}`, { method: 'DELETE' });
        if (response.ok) {
            window.showToast('Transportadora excluída', 'success');
            await carregarTransportadoras();
        } else {
            window.showToast('Erro ao excluir', 'error');
        }
    } catch (error) {
        window.showToast('Erro de comunicação', 'error');
    }
}

function abrirModalTransportadora() {
    let modal = document.getElementById('modalNovaTransportadora');
    if (modal) {
        modal.classList.remove('hidden');
        return;
    }

    const modalHTML = `
    <div id="modalNovaTransportadora" class="modal" style="display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,0.5); z-index:9999;">
        <div class="modal-content" style="max-width:500px; width:90%; background:white; padding:25px; border-radius:8px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
                <h3 style="margin:0;"><i class="fas fa-truck"></i> Nova Transportadora</h3>
                <button onclick="fecharModalTransportadora()" style="background:none; border:none; font-size:24px; cursor:pointer;">&times;</button>
            </div>
            <form id="formNovaTransportadora">
                <div class="form-group">
                    <label>Nome *</label>
                    <input type="text" id="novaTransportadoraNome" class="form-control" required>
                </div>
                <div class="form-group">
                    <label>CNPJ * (apenas números)</label>
                    <input type="text" id="novaTransportadoraCnpj" class="form-control" placeholder="00000000000000" required>
                </div>
                <div class="form-group">
                    <label>Inscrição Estadual</label>
                    <input type="text" id="novaTransportadoraIe" class="form-control">
                </div>
                <div class="form-group">
                    <label>Endereço</label>
                    <input type="text" id="novaTransportadoraEndereco" class="form-control">
                </div>
                <div class="row">
                    <div class="col-md-6">
                        <div class="form-group">
                            <label>Cidade</label>
                            <input type="text" id="novaTransportadoraCidade" class="form-control">
                        </div>
                    </div>
                    <div class="col-md-6">
                        <div class="form-group">
                            <label>UF</label>
                            <input type="text" id="novaTransportadoraUf" class="form-control" maxlength="2">
                        </div>
                    </div>
                </div>
                <div class="d-flex justify-content-end gap-2 mt-3">
                    <button type="button" class="btn btn-secondary" onclick="fecharModalTransportadora()">Cancelar</button>
                    <button type="button" class="btn btn-success" onclick="salvarNovaTransportadora()"><i class="fas fa-save"></i> Salvar</button>
                </div>
            </form>
        </div>
    </div>`;

    const container = document.createElement('div');
    container.innerHTML = modalHTML;
    document.body.appendChild(container.firstElementChild);
}

function fecharModalTransportadora() {
    const modal = document.getElementById('modalNovaTransportadora');
    if (modal) modal.classList.add('hidden');
}

async function salvarNovaTransportadora() {
    const nome = document.getElementById('novaTransportadoraNome').value.trim();
    const cnpj = document.getElementById('novaTransportadoraCnpj').value.trim().replace(/\D/g, '');
    const ie = document.getElementById('novaTransportadoraIe').value.trim();
    const endereco = document.getElementById('novaTransportadoraEndereco').value.trim();
    const cidade = document.getElementById('novaTransportadoraCidade').value.trim();
    const uf = document.getElementById('novaTransportadoraUf').value.trim().toUpperCase();

    if (!nome || !cnpj) {
        showToast('Nome e CNPJ são obrigatórios', 'warning');
        return;
    }
    if (cnpj.length !== 14) {
        showToast('CNPJ deve ter 14 dígitos', 'warning');
        return;
    }

    const payload = { nome, cnpj, ie, endereco, cidade, uf };

    try {
        const response = await fetch(`${window.API_BASE_URL}/nfe/transportadoras`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const result = await response.json();
        if (result.success) {
            showToast('Transportadora cadastrada com sucesso!', 'success');
            fecharModalTransportadora();
            await carregarTransportadoras();
            await carregarTransportadorasSelect();
        } else {
            showToast('Erro: ' + result.error, 'error');
        }
    } catch (error) {
        console.error(error);
        showToast('Erro ao salvar transportadora', 'error');
    }
}

async function carregarTransportadorasSelect() {
    const select = document.getElementById('nfeTransportadora');
    if (!select) return;
    try {
        const response = await fetch(`${window.API_BASE_URL}/nfe/transportadoras`);
        const data = await response.json();
        if (!data.success) throw new Error(data.error);
        const transportadoras = data.transportadoras || [];
        select.innerHTML = '<option value="">Selecione uma transportadora</option>' +
            transportadoras.map(t => `<option value="${t.id}">${t.nome} (${t.cnpj})</option>`).join('');
    } catch (error) {
        console.error('Erro ao carregar transportadoras:', error);
    }
}

// ===================== CLIENTES =====================
async function carregarClientes() {
    const tbody = document.getElementById('clientesBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="4" class="text-center"><div class="spinner"></div> Carregando...</td></tr>';
    try {
        const response = await fetch(`${window.API_BASE_URL}/nfe/clientes`);
        const data = await response.json();
        if (!data.success) throw new Error(data.error);
        const clientes = data.clientes || [];
        if (!clientes.length) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center">Nenhum cliente cadastrado</td></tr>';
            return;
        }
        tbody.innerHTML = clientes.map(c => `
            <tr>
                <td>${c.nome}</td>
                <td>${c.documento || '-'}</td>
                <td>${c.logradouro || ''}, ${c.numero || ''} - ${c.cidade || ''}</td>
                <td>
                <button class="btn btn-sm btn-info" onclick="visualizarCliente(${c.id})" title="Ver detalhes">
                <i class="fas fa-eye"></i>
                </button>
                <button class="btn btn-sm btn-danger" onclick="excluirCliente(${c.id})">Excluir</button></td>
            </tr>`).join('');
        const select = document.getElementById('avulsaClienteId');
        if (select) select.innerHTML = '<option value="">Selecione</option>' + clientes.map(c => `<option value="${c.id}">${c.nome} (${c.documento})</option>`).join('');
    } catch (error) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center text-danger">Erro ao carregar</td></tr>';
    }
}

async function excluirCliente(id) {
    if (!confirm('Excluir este cliente?')) return;
    try {
        const response = await fetch(`${window.API_BASE_URL}/nfe/clientes/${id}`, { method: 'DELETE' });
        if (response.ok) {
            window.showToast('Cliente excluído', 'success');
            await carregarClientes();
        } else {
            window.showToast('Erro ao excluir', 'error');
        }
    } catch (error) {
        window.showToast('Erro de comunicação', 'error');
    }
}

window.visualizarCliente = async function(id) {
    try {
        const response = await fetch(`${API_BASE_URL}/nfe/clientes/${id}`);
        const data = await response.json();
        if (!data.success) throw new Error(data.error);
        const cliente = data.cliente;

        const modalContent = `
            <div style="padding: 10px;">
                <h4>${cliente.nome}</h4>
                <p><strong>Documento:</strong> ${cliente.documento || '-'}</p>
                <p><strong>Endereço:</strong> ${cliente.logradouro || ''}, ${cliente.numero || 'S/N'} - ${cliente.bairro || ''}</p>
                <p><strong>Cidade/UF:</strong> ${cliente.cidade || ''} / ${cliente.uf || ''}</p>
                <p><strong>CEP:</strong> ${cliente.cep || ''}</p>
            </div>
        `;

        showModalDialog('Detalhes do Cliente', modalContent);
    } catch (error) {
        console.error('Erro ao buscar cliente:', error);
        showToast('Erro ao carregar dados do cliente', 'error');
    }
};

// ===================== EMISSÃO AVULSA =====================
async function emitirNFEAvulsa() {
    const clienteId = document.getElementById('avulsaClienteId').value;
    if (!clienteId) {
        window.showToast('Selecione um cliente', 'warning');
        return;
    }
    const transportadoraId = document.getElementById('avulsaTransportadoraId').value || null;
    const cfop = document.getElementById('avulsaCfop').value;
    const natOp = document.getElementById('avulsaNatOp').value;
    const modFrete = document.getElementById('avulsaModFrete').value;
    let produtos;
    try {
        produtos = JSON.parse(document.getElementById('avulsaProdutos').value);
        if (!Array.isArray(produtos) || !produtos.length) throw new Error();
    } catch (e) {
        window.showToast('Produtos inválidos. Use um array JSON válido.', 'error');
        return;
    }
    const dados = { cliente: { id: clienteId }, produtos, cfop, natureza_operacao: natOp, modalidade_frete: modFrete, transportadora_id: transportadoraId };
    const btn = event.target;
    const original = btn.innerHTML;
    btn.innerHTML = '<span class="spinner"></span> Emitindo...';
    btn.disabled = true;
    try {
        const response = await fetch(`${window.API_BASE_URL}/nfe/emitir-avulsa`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dados)
        });
        const result = await response.json();
        if (result.success) {
            window.showToast('NF-e avulsa emitida com sucesso!', 'success');
            limparFormAvulsa();
            await carregarNFesEmitidas();
        } else {
            window.showToast('Erro: ' + result.error, 'error');
        }
    } catch (error) {
        window.showToast('Erro de comunicação', 'error');
    } finally {
        btn.innerHTML = original;
        btn.disabled = false;
    }
}

function limparFormAvulsa() {
    document.getElementById('avulsaClienteId').value = '';
    document.getElementById('avulsaTransportadoraId').value = '';
    document.getElementById('avulsaCfop').value = '5102';
    document.getElementById('avulsaNatOp').value = 'VENDA';
    document.getElementById('avulsaModFrete').value = '9';
    document.getElementById('avulsaProdutos').value = '';
}

async function sincronizarVendasML() {
    window.showToast('A sincronização de vendas é feita automaticamente ao acessar a aba.', 'info');
}

function inicializarAbaNFE() {
    mostrarAbaNFE('vendas');
}

// =========================================================
// ATUALIZAR LISTA DE VENDAS
// =========================================================

async function atualizarListaNFE() {
    const btn = document.getElementById('btnAtualizarNFE');
    if (btn) {
        btn.innerHTML = '<span class="spinner"></span> Atualizando...';
        btn.disabled = true;
    }

    try {
        await carregarVendasPendentes();
        await carregarNFesEmitidas();
        showToast('✅ Lista atualizada!', 'success');
    } catch (error) {
        console.error('❌ Erro ao atualizar lista:', error);
        showToast('Erro ao atualizar vendas', 'error');
    } finally {
        if (btn) {
            btn.innerHTML = '<i class="fas fa-sync-alt"></i> Atualizar Lista';
            btn.disabled = false;
        }
    }
}

window.atualizarListaNFE = atualizarListaNFE;

// =========================================================
// FUNÇÕES PARA BAIXAR XML COMPLETO (UPLOAD MANUAL)
// =========================================================

async function baixarXMLCompletoML(orderId) {
    if (!orderId) {
        orderId = prompt('Digite o ID da venda:');
        if (!orderId) return;
    }
    
    try {
        const listResponse = await fetch(`${window.API_BASE_URL}/nfe/listar-nfes`);
        const listData = await listResponse.json();
        
        if (!listData.success || !listData.notas) {
            showToast('❌ Erro ao listar NF-es', 'error');
            return;
        }
        
        const nfe = listData.notas.find(n => 
            String(n.venda_id) === String(orderId) || 
            String(n.venda_id_ml) === String(orderId)
        );
        
        if (!nfe) {
            showToast(`❌ NF-e não encontrada para venda ${orderId}`, 'error');
            return;
        }
        
        const chave = nfe.chave_acesso || nfe.chave;
        const protocolo = nfe.protocolo || null;
        
        const xmlResponse = await fetch(`${window.API_BASE_URL}/nfe/buscar-xml?chave=${chave}`);
        const xmlData = await xmlResponse.json();
        
        if (!xmlData.xml) {
            showToast('❌ XML não encontrado', 'error');
            return;
        }
        
        let xmlContent = xmlData.xml;
        
        if (!xmlContent.startsWith('<?xml')) {
            xmlContent = '<?xml version="1.0" encoding="UTF-8"?>\n' + xmlContent;
        }
        
        if (xmlContent.includes('<NFe') && !xmlContent.includes('<nfeProc')) {
            const nfeMatch = xmlContent.match(/<NFe[^>]*>([\s\S]*?)<\/NFe>/);
            if (nfeMatch) {
                const nfeContent = nfeMatch[0];
                const protMatch = xmlContent.match(/<protNFe[^>]*>([\s\S]*?)<\/protNFe>/);
                const protContent = protMatch ? protMatch[0] : '';
                xmlContent = `<?xml version="1.0" encoding="UTF-8"?>\n<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">\n${nfeContent}\n${protContent}\n</nfeProc>`;
            }
        }
        
        xmlContent = xmlContent.replace(/>\s+</g, '><').replace(/^\s*[\r\n]/gm, '');
        
        const blob = new Blob([xmlContent], { type: 'application/xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const nomeArquivo = `NFE_${orderId}.xml`;
        
        const a = document.createElement('a');
        a.href = url;
        a.download = nomeArquivo;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        setTimeout(() => URL.revokeObjectURL(url), 5000);
        
        showToast(`✅ XML baixado: ${nomeArquivo}`, 'success');
        
        const temProt = xmlContent.includes('<nProt>');
        alert(`
📁 XML BAIXADO!

📋 Venda: ${orderId}
📁 Arquivo: ${nomeArquivo}
✅ Protocolo no XML: ${temProt ? '✅ SIM' : '❌ NÃO'}

${temProt ? 
'✅ O XML está completo com protocolo. Pode enviar ao ML!' : 
'⚠️ O XML NÃO tem protocolo. O ML pode rejeitar.'}

📌 No Mercado Livre:
1. Abra a venda
2. Clique em "Anexar Nota Fiscal"
3. Selecione o arquivo ${nomeArquivo}
4. Confirme
        `);
        
    } catch (error) {
        console.error('❌ Erro:', error);
        showToast(`❌ Erro: ${error.message}`, 'error');
    }
}

// =========================================================
// EXPORTAÇÕES GLOBAIS
// =========================================================

window.mostrarAbaNFE = mostrarAbaNFE;
window.emitirNFEParaVenda = emitirNFEParaVenda;
window.sincronizarVendasML = sincronizarVendasML;
window.carregarNFesEmitidas = carregarNFesEmitidas;
window.visualizarNFE = visualizarNFE;
window.baixarXMLNFE = baixarXMLNFE;
window.cancelarNFE = cancelarNFE;
window.emitirNFEAvulsa = emitirNFEAvulsa;
window.limparFormAvulsa = limparFormAvulsa;
window.inicializarAbaNFE = inicializarAbaNFE;
window.confirmarEmissaoNFE = confirmarEmissaoNFE;
window.fecharModalDadosClienteNFE = fecharModalDadosClienteNFE;
window.isFullByAnyField = isFullByAnyField;
window.abrirModalEdicaoProdutos = abrirModalEdicaoProdutos;
window.fecharModalEdicaoProdutos = fecharModalEdicaoProdutos;
window.confirmarProdutosEditados = confirmarProdutosEditados;
window.abrirModalTransportadora = abrirModalTransportadora;
window.fecharModalTransportadora = fecharModalTransportadora;
window.salvarNovaTransportadora = salvarNovaTransportadora;
window.atualizarListaNFE = atualizarListaNFE;
window.enviarXMLparaMercadoLivre = enviarXMLparaMercadoLivre;
window.buscarValorExatoPagamento = buscarValorExatoPagamento;
window.baixarXMLCompletoML = baixarXMLCompletoML;
window.sincronizarEstoqueComML = sincronizarEstoqueComML;

// ===================== INICIALIZAR =====================
document.addEventListener('DOMContentLoaded', function() {
    const confirmarBtn = document.getElementById('confirmarModalNFEBtn');
    const cancelarBtn = document.getElementById('cancelarModalNFEBtn');
    
    if (confirmarBtn) {
        confirmarBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            confirmarEmissaoNFE();
        });
    }
    
    if (cancelarBtn) {
        cancelarBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            fecharModalDadosClienteNFE();
        });
    }
    
    console.log('✅ Event listeners configurados');
});

console.log('✅ nfe_manager.js carregado');