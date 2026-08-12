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
// FUNÇÃO PARA BUSCAR VALOR EXATO DO MERCADO PAGO (CORRIGIDA)
// =========================================================

async function buscarValorExatoPagamento(orderId) {
    try {
        orderId =
            normalizarOrderIdML(
                orderId
            );
            if (!orderId) {

            console.warn(
                '⚠️ ID da venda inválido para buscar pagamento'
            );

            return null;
        }

        console.log(
            `🔍 Buscando valor exato do pagamento para venda ${orderId}...`
        );
        
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
        
        // 🔥 PEGAR O VALOR DA VENDA (total_amount)
        let valorVenda = parseFloat(orderData.total_amount || 0);
        console.log(`💰 Valor da venda (total_amount): R$ ${valorVenda.toFixed(2)}`);
        
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
            return {
                valor_produto: valorVenda,
                valor_frete: 0,
                total_pago: valorVenda,
                payment_id: null,
                desconto_cupom: 0,
                fonte: 'venda'
            };
        }
        
        console.log(`💳 ID do pagamento: ${paymentId}`);
        
        const paymentUrl = `https://api.mercadopago.com/v1/payments/${paymentId}`;
        const paymentProxyUrl = `${window.WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(paymentUrl)}&token=${encodeURIComponent(token)}`;
        const paymentResponse = await fetch(paymentProxyUrl);
        
        if (!paymentResponse.ok) {
            console.warn(`⚠️ Erro ao buscar pagamento ${paymentId}: ${paymentResponse.status}`);
            return {
                valor_produto: valorVenda,
                valor_frete: 0,
                total_pago: valorVenda,
                payment_id: paymentId,
                desconto_cupom: 0,
                fonte: 'venda'
            };
        }
        
        const paymentData = await paymentResponse.json();
        console.log('💳 Dados do pagamento (Mercado Pago):', paymentData);
        
        let totalPago = parseFloat(paymentData.transaction_amount || paymentData.total_amount || 0);
        let descontoCupom = parseFloat(paymentData.coupon_amount || 0);
        let valorFrete = 0;
        
        let valorProdutoMP = totalPago - descontoCupom;
        
        if (paymentData.additional_info?.shipments?.shipping_amount) {
            valorFrete = parseFloat(paymentData.additional_info.shipments.shipping_amount) || 0;
        } else if (paymentData.shipping_amount) {
            valorFrete = parseFloat(paymentData.shipping_amount) || 0;
        } else if (orderData.shipping?.cost) {
            valorFrete = parseFloat(orderData.shipping.cost) || 0;
        }
        
        const totalSemFrete = totalPago - valorFrete;
        if (valorProdutoMP > totalSemFrete) {
            valorProdutoMP = totalSemFrete;
        }
        
        console.log(`💰 VALORES (Mercado Pago):`);
        console.log(`   💳 Total pago: R$ ${totalPago.toFixed(2)}`);
        console.log(`   🎫 Desconto cupom: R$ ${descontoCupom.toFixed(2)}`);
        console.log(`   📦 Valor do frete: R$ ${valorFrete.toFixed(2)}`);
        console.log(`   ✅ Valor do produto (MP): R$ ${valorProdutoMP.toFixed(2)}`);
        console.log(`   📊 Valor da venda (total_amount): R$ ${valorVenda.toFixed(2)}`);
        
        // 🔥 PEGAR O MENOR VALOR ENTRE O DA VENDA E O DO MERCADO PAGO
        let valorProdutoFinal = Math.min(valorProdutoMP, valorVenda);
        let fonte = valorProdutoMP <= valorVenda ? 'mercado_pago' : 'venda';
        
        console.log(`✅ VALOR FINAL (menor): R$ ${valorProdutoFinal.toFixed(2)} (fonte: ${fonte})`);
        
        return {
            valor_produto: valorProdutoFinal,
            valor_frete: valorFrete,
            total_pago: totalPago,
            payment_id: paymentId,
            desconto_cupom: descontoCupom,
            fonte: fonte,
            valor_venda: valorVenda,
            valor_mp: valorProdutoMP
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

async function buscarOrdersPackParaNFE(
    orderId,
    token
) {

    orderId =
        normalizarOrderIdML(
            orderId
        );

    if (!orderId) {

        throw new Error(
            'ID principal da venda inválido'
        );
    }

    // =====================================================
    // LOCALIZAR GRUPO
    //
    // Não dependemos somente do handler.
    // Se por qualquer motivo o global não existir,
    // procuramos novamente em vendasPendentes.
    // =====================================================

    let grupo =
        window._nfeVendaGrupoAtual ||
        null;

    if (
        !grupo &&
        Array.isArray(
            vendasPendentes
        )
    ) {

        grupo =
            vendasPendentes.find(
                venda => {

                    const principal =
                        normalizarOrderIdML(
                            venda.id_venda_ml ||
                            venda.id
                        );

                    if (
                        principal ===
                        orderId
                    ) {

                        return true;
                    }

                    return (
                        Array.isArray(
                            venda._order_ids_pack
                        ) &&
                        venda
                            ._order_ids_pack
                            .map(
                                normalizarOrderIdML
                            )
                            .includes(
                                orderId
                            )
                    );
                }
            ) ||
            null;
    }

    // =====================================================
    // IDS DAS ORDERS
    // =====================================================

    let orderIds =
        grupo
            ?._order_ids_pack ||

        window
            ._nfeOrderIdsAtuais ||

        [
            orderId
        ];

    orderIds =
        [
            ...new Set(

                orderIds
                    .map(
                        normalizarOrderIdML
                    )
                    .filter(Boolean)
            )
        ];

    if (
        !orderIds.includes(
            orderId
        )
    ) {

        orderIds.unshift(
            orderId
        );
    }

    console.log(
        '📦 Orders que formarão a NF-e:',
        orderIds
    );

    // =====================================================
    // BUSCAR CADA ORDER
    //
    // MUITO IMPORTANTE:
    //
    // Cada order tem:
    // - produtos próprios
    // - pagamento próprio
    //
    // Precisamos somar tudo.
    // =====================================================

    const resultados =
        await Promise.all(

            orderIds.map(
                async id => {

                    // =========================================
                    // ORDER ML
                    // =========================================

                    const orderUrl =
                        `https://api.mercadolibre.com/orders/${id}`;

                    const orderProxyUrl =
                        `${window.WORKER_URL}/api/ml/proxy?url=` +
                        `${encodeURIComponent(orderUrl)}` +
                        `&token=${encodeURIComponent(token)}`;

                    const response =
                        await fetch(
                            orderProxyUrl,
                            {
                                cache:
                                    'no-store'
                            }
                        );

                    if (
                        !response.ok
                    ) {

                        throw new Error(
                            `Erro ao buscar venda ${id}: HTTP ${response.status}`
                        );
                    }

                    const order =
                        await response.json();

                    // =========================================
                    // PAGAMENTO CORRETO
                    //
                    // Continua usando:
                    // Mercado Pago x total_amount
                    // menor valor
                    // =========================================

                    let pagamento =
                        null;

                    try {

                        pagamento =
                            await buscarValorExatoPagamento(
                                id
                            );

                    } catch (error) {

                        console.warn(
                            `⚠️ Erro ao buscar pagamento da order ${id}:`,
                            error
                        );
                    }

                    // =========================================
                    // TOTAL ORIGINAL DOS ITENS
                    // =========================================

                    const itens =
                        Array.isArray(
                            order.order_items
                        )
                            ? order.order_items
                            : [];

                    const totalOriginalItens =
                        itens.reduce(
                            (
                                total,
                                item
                            ) => {

                                return (
                                    total +
                                    (
                                        Number(
                                            item.unit_price ||
                                            0
                                        ) *
                                        Number(
                                            item.quantity ||
                                            1
                                        )
                                    )
                                );
                            },
                            0
                        );

                    // =========================================
                    // VALOR REAL DA ORDER
                    // =========================================

                    const valorCorrigido =
                        Number(
                            pagamento
                                ?.valor_produto ??
                            order.total_amount ??
                            totalOriginalItens ??
                            0
                        );

                    return {

                        id,

                        order,

                        pagamento,

                        itens,

                        totalOriginalItens,

                        valorCorrigido
                    };
                }
            )
        );

    // =====================================================
    // SOMA DE TODAS AS ORDERS
    // =====================================================

    const valorTotalProduto =
        resultados.reduce(
            (
                total,
                resultado
            ) => {

                return (
                    total +
                    Number(
                        resultado
                            .valorCorrigido ||
                        0
                    )
                );
            },
            0
        );

    // =====================================================
    // JUNTAR TODOS OS PRODUTOS
    // =====================================================

    const items =
        [];

    for (
        const resultado
        of resultados
    ) {

        const {
            id,
            itens,
            valorCorrigido,
            totalOriginalItens
        } =
            resultado;

        // =================================================
        // DISTRIBUIR O VALOR CORRIGIDO DA ORDER
        // ENTRE OS ITENS DELA
        //
        // Normalmente essas orders possuem 1 item,
        // então recebe exatamente o valor corrigido.
        //
        // Se houver vários itens na mesma order,
        // distribuímos proporcionalmente.
        // =================================================

        for (
            const item
            of itens
        ) {

            const quantidade =
                Number(
                    item.quantity ||
                    1
                );

            const valorUnitarioOriginal =
                Number(
                    item.unit_price ||
                    0
                );

            const subtotalOriginal =
                quantidade *
                valorUnitarioOriginal;

            let subtotalCorrigido =
                subtotalOriginal;

            if (
                valorCorrigido >
                    0 &&
                totalOriginalItens >
                    0
            ) {

                subtotalCorrigido =
                    valorCorrigido *
                    (
                        subtotalOriginal /
                        totalOriginalItens
                    );
            }

            const valorUnitarioCorrigido =
                quantidade > 0
                    ? subtotalCorrigido /
                      quantidade
                    : subtotalCorrigido;

            items.push({

                ...item,

                _order_id:
                    id,

                _valor_total_corrigido:
                    subtotalCorrigido,

                _valor_unitario_corrigido:
                    valorUnitarioCorrigido
            });
        }
    }

    // =====================================================
    // VENDA PRINCIPAL
    //
    // Usamos para:
    // - comprador
    // - endereço
    // - billing_info
    // =====================================================

    const vendaPrincipal =
        resultados[0]
            ?.order ||
        null;

    const packId =
        grupo
            ?._pack_id ||
        null;

    const shipmentId =
        grupo
            ?._shipment_id ||
        vendaPrincipal
            ?.shipping
            ?.id ||
        null;

    console.log(
        '✅ PACK preparado para emissão:',
        {
            ehPack:
                orderIds.length > 1,

            packId,

            shipmentId,

            orders:
                orderIds,

            produtos:
                items.map(
                    item => ({
                        order:
                            item._order_id,

                        sku:
                            item.item
                                ?.seller_sku,

                        quantidade:
                            item.quantity,

                        valor:
                            item
                                ._valor_unitario_corrigido
                    })
                ),

            valorTotalProduto
        }
    );

    return {

        ehPack:
            orderIds.length >
            1,

        packId,

        shipmentId,

        orderIds,

        resultados,

        vendaPrincipal,

        items,

        valorTotalProduto
    };
}

async function abrirModalEdicaoProdutos(
    orderId
) {

    console.log(
        '🔧 Abrindo modal de emissão:',
        orderId
    );

    orderId =
        normalizarOrderIdML(
            orderId
        );

    // =====================================================
    // REMOVER MODAIS ANTIGOS
    // =====================================================

    document
        .getElementById(
            'modalDadosClienteNFE'
        )
        ?.remove();

    document
        .getElementById(
            'modalEdicaoProdutos'
        )
        ?.remove();

    if (!orderId) {

        showToast(
            '❌ ID da venda inválido',
            'error'
        );

        return;
    }

    vendaIdParaEdicao =
        orderId;

    pendingEmitOrderId =
        orderId;

    // =====================================================
    // IDENTIFICAR O PACK
    //
    // Mesmo que o handler não tenha configurado,
    // procuramos diretamente nas vendas da tabela.
    // =====================================================

    let vendaGrupo =
        window._nfeVendaGrupoAtual ||
        null;

    if (
        !vendaGrupo &&
        Array.isArray(
            vendasPendentes
        )
    ) {

        vendaGrupo =
            vendasPendentes.find(
                venda => {

                    const principal =
                        normalizarOrderIdML(
                            venda.id_venda_ml ||
                            venda.id
                        );

                    if (
                        principal ===
                        orderId
                    ) {

                        return true;
                    }

                    return (
                        Array.isArray(
                            venda._order_ids_pack
                        ) &&
                        venda
                            ._order_ids_pack
                            .map(
                                normalizarOrderIdML
                            )
                            .includes(
                                orderId
                            )
                    );
                }
            ) ||
            null;
    }

    window._nfeVendaGrupoAtual =
        vendaGrupo;

    if (vendaGrupo) {

        window._nfeOrderIdsAtuais =
            [
                ...new Set(

                    (
                        vendaGrupo
                            ._order_ids_pack ||
                        [orderId]
                    )
                        .map(
                            normalizarOrderIdML
                        )
                        .filter(Boolean)
                )
            ];

        window._nfePackIdAtual =
            vendaGrupo
                ._pack_id ||
            null;

        window._nfeShipmentIdAtual =
            vendaGrupo
                ._shipment_id ||
            null;
    }

    // =====================================================
    // TOKEN
    // =====================================================

    let token =
        localStorage.getItem(
            'ml_access_token'
        );

    if (
        !token &&
        typeof window
            .getValidToken ===
        'function'
    ) {

        const tokenData =
            await window
                .getValidToken();

        token =
            tokenData
                ?.access_token;
    }

    if (!token) {

        showToast(
            '❌ Token ML não disponível',
            'error'
        );

        return;
    }

    window._mlAccessToken =
        token;

    fecharModalEdicaoProdutos();

    try {

        showToast(
            '🔄 Carregando produtos da venda...',
            'info'
        );

        // =====================================================
        // BUSCAR TODAS AS ORDERS DO PACK
        // =====================================================

        const dadosPack =
            await buscarOrdersPackParaNFE(
                orderId,
                token
            );

        const venda =
            dadosPack
                .vendaPrincipal;

        const items =
            dadosPack
                .items ||
            [];

        if (!venda) {

            throw new Error(
                'Venda principal não encontrada'
            );
        }

        if (
            items.length ===
            0
        ) {

            throw new Error(
                'Nenhum produto encontrado para emissão'
            );
        }

        // =====================================================
        // SALVAR IDS
        // =====================================================

        window._nfeOrderIdsAtuais =
            dadosPack
                .orderIds;

        window._nfePackIdAtual =
            dadosPack
                .packId ||
            window
                ._nfePackIdAtual ||
            null;

        window._nfeShipmentIdAtual =
            dadosPack
                .shipmentId ||
            window
                ._nfeShipmentIdAtual ||
            null;

        console.log(
            '📦 Modal NF-e:',
            {
                ehPack:
                    dadosPack.ehPack,

                orders:
                    window
                        ._nfeOrderIdsAtuais,

                produtos:
                    items.length,

                valor:
                    dadosPack
                        .valorTotalProduto
            }
        );

        // =====================================================
        // FULL
        // =====================================================

        if (
            (
                typeof isFullByAnyField ===
                    'function' &&
                isFullByAnyField(
                    venda
                )
            ) ||
            vendaGrupo
                ?._is_full
        ) {

            pendingEmitOrderId =
                null;

            vendaIdParaEdicao =
                null;

            showToast(
                '🚫 Esta venda é FULL e não permite emissão manual.',
                'warning'
            );

            return;
        }

        // =====================================================
        // ENDEREÇO
        // =====================================================

        let address = {};

        const shipmentId =
            dadosPack
                .shipmentId ||
            venda.shipping
                ?.id ||
            null;

        if (shipmentId) {

            try {

                const shipUrl =
                    `https://api.mercadolibre.com/shipments/${shipmentId}`;

                const proxyUrl =
                    `${window.WORKER_URL}/api/ml/proxy?url=` +
                    `${encodeURIComponent(shipUrl)}` +
                    `&token=${encodeURIComponent(token)}`;

                const response =
                    await fetch(
                        proxyUrl
                    );

                if (
                    response.ok
                ) {

                    const shipment =
                        await response
                            .json();

                    address =
                        shipment
                            .receiver_address ||
                        {};
                }

            } catch (error) {

                console.warn(
                    '⚠️ Erro buscando endereço:',
                    error
                );
            }
        }

        if (
            !address.address_line &&
            !address.street_name &&
            venda.buyer?.address
        ) {

            address =
                venda.buyer
                    .address;
        }

        // =====================================================
        // BILLING INFO
        //
        // O comprador é o mesmo do pack,
        // então usamos a order principal.
        // =====================================================

        let billingInfo = {};

        try {

            const billingUrl =
                `https://api.mercadolibre.com/orders/${orderId}/billing_info`;

            const billingProxyUrl =
                `${window.WORKER_URL}/api/ml/proxy?url=` +
                `${encodeURIComponent(billingUrl)}` +
                `&token=${encodeURIComponent(token)}`;

            const billingResponse =
                await fetch(
                    billingProxyUrl
                );

            if (
                billingResponse.ok
            ) {

                const billingResult =
                    await billingResponse
                        .json();

                billingInfo =
                    billingResult
                        ?.billing_info ||
                    billingResult ||
                    {};
            }

        } catch (error) {

            console.warn(
                '⚠️ Erro buscando billing_info:',
                error
            );
        }

        // =====================================================
        // ADDITIONAL INFO
        // =====================================================

        const infoExtra = {};

        if (
            Array.isArray(
                billingInfo
                    .additional_info
            )
        ) {

            billingInfo
                .additional_info
                .forEach(
                    item => {

                        if (
                            item?.type
                        ) {

                            infoExtra[
                                String(
                                    item.type
                                ).toUpperCase()
                            ] =
                                item.value ??
                                '';
                        }
                    }
                );
        }

        // =====================================================
        // CLIENTE
        // =====================================================

        const buyer =
            venda.buyer ||
            {};

        const nomeBuyer =
            `${buyer.first_name || ''} ${buyer.last_name || ''}`
                .trim();

        const nomeBilling =
            `${infoExtra.FIRST_NAME || ''} ${infoExtra.LAST_NAME || ''}`
                .trim();

        const nomeCliente =

            nomeBilling ||

            nomeBuyer ||

            buyer.nickname ||

            billingInfo.name ||

            vendaGrupo
                ?.cliente ||

            '';

        const documentoCliente =
            String(

                infoExtra.DOC_NUMBER ||

                billingInfo
                    .doc_number ||

                billingInfo
                    .document_number ||

                billingInfo
                    .identification
                    ?.number ||

                buyer
                    .identification
                    ?.number ||

                ''
            )
                .replace(
                    /\D/g,
                    ''
                );

        // =====================================================
        // ENDEREÇO
        // =====================================================

        let logradouro =

            address
                .address_line ||

            address
                .street_name ||

            infoExtra
                .STREET_NAME ||

            '';

        let numero =

            address
                .street_number ||

            infoExtra
                .STREET_NUMBER ||

            'S/N';

        if (
            logradouro &&
            numero &&
            numero !==
                'S/N'
        ) {

            const numeroEscapado =
                String(numero)
                    .replace(
                        /[.*+?^${}()|[\]\\]/g,
                        '\\$&'
                    );

            const numeroPattern =
                new RegExp(
                    `\\s*[,.]?\\s*${numeroEscapado}\\s*$`
                );

            logradouro =
                logradouro
                    .replace(
                        numeroPattern,
                        ''
                    )
                    .replace(
                        /,\s*$/,
                        ''
                    )
                    .trim();
        }

        const bairro =

            address
                .neighborhood
                ?.name ||

            address
                .neighborhood ||

            infoExtra
                .NEIGHBORHOOD ||

            '';

        const cidade =

            address
                .city
                ?.name ||

            address
                .city ||

            infoExtra
                .CITY_NAME ||

            infoExtra
                .CITY ||

            '';

        const ufOriginal =

            address
                .state
                ?.name ||

            address
                .state ||

            infoExtra
                .STATE_NAME ||

            infoExtra
                .STATE ||

            '';

        const uf =
            mapearUF(
                ufOriginal
            );

        const cep =
            String(

                address
                    .zip_code ||

                infoExtra
                    .ZIP_CODE ||

                ''
            )
                .replace(
                    /\D/g,
                    ''
                );

        // =====================================================
        // VALOR TOTAL DO PACK
        //
        // ESTE É O PONTO PRINCIPAL DA CORREÇÃO.
        // =====================================================

        const valorTotalProduto =
            Number(
                dadosPack
                    .valorTotalProduto ||
                0
            );

        // =====================================================
        // NCM
        // =====================================================

        const ncmPorSku = {};

        try {

            const skus =
                [
                    ...new Set(

                        items
                            .map(
                                item =>
                                    item.item
                                        ?.seller_sku ||
                                    'SEM_SKU'
                            )
                            .filter(
                                sku =>
                                    sku &&
                                    sku !==
                                    'SEM_SKU'
                            )
                    )
                ];

            if (
                skus.length >
                0
            ) {

                const {
                    data,
                    error
                } =
                    await window
                        .supabaseClient
                        .from(
                            'produto_ncm'
                        )
                        .select(
                            'sku, ncm'
                        )
                        .in(
                            'sku',
                            skus
                        );

                if (
                    !error &&
                    Array.isArray(
                        data
                    )
                ) {

                    data.forEach(
                        row => {

                            ncmPorSku[
                                row.sku
                            ] =
                                row.ncm;
                        }
                    );
                }
            }

        } catch (error) {

            console.warn(
                '⚠️ Erro buscando NCM:',
                error
            );
        }

        // =====================================================
        // PRODUTOS DO MODAL
        //
        // TODOS os itens de TODAS as orders.
        // =====================================================

        produtosEditados =
            items.map(
                item => {

                    const sku =
                        item.item
                            ?.seller_sku ||
                        'SEM_SKU';

                    const quantidade =
                        Number(
                            item.quantity ||
                            1
                        );

                    const valorUnitario =
                        Number(
                            item
                                ._valor_unitario_corrigido ??
                            item
                                .unit_price ??
                            0
                        );

                    return {

                        nome:
                            item.item
                                ?.title ||
                            'Produto',

                        quantidade,

                        valor_unitario:
                            valorUnitario,

                        sku,

                        ncm:
                            ncmPorSku[
                                sku
                            ] ||
                            '87149990',

                        _order_id:
                            item._order_id,

                        _valor_original:
                            Number(
                                item
                                    .unit_price ||
                                0
                            )
                    };
                }
            );

        // =====================================================
        // AJUSTAR EVENTUAL DIFERENÇA DE CENTAVOS
        // =====================================================

        const totalCalculado =
            produtosEditados.reduce(
                (
                    total,
                    produto
                ) => {

                    return (
                        total +
                        (
                            Number(
                                produto
                                    .quantidade ||
                                0
                            ) *
                            Number(
                                produto
                                    .valor_unitario ||
                                0
                            )
                        )
                    );
                },
                0
            );

        const diferenca =
            valorTotalProduto -
            totalCalculado;

        if (
            Math.abs(
                diferenca
            ) >
                0.001 &&
            produtosEditados.length >
                0
        ) {

            const ultimo =
                produtosEditados[
                    produtosEditados
                        .length -
                    1
                ];

            const qtdUltimo =
                Number(
                    ultimo.quantidade ||
                    1
                );

            ultimo.valor_unitario +=
                diferenca /
                qtdUltimo;
        }

        // =====================================================
        // HTML ESCAPE
        // =====================================================

        const esc =
            value =>
                String(
                    value ??
                    ''
                )
                    .replace(
                        /&/g,
                        '&amp;'
                    )
                    .replace(
                        /</g,
                        '&lt;'
                    )
                    .replace(
                        />/g,
                        '&gt;'
                    )
                    .replace(
                        /"/g,
                        '&quot;'
                    )
                    .replace(
                        /'/g,
                        '&#039;'
                    );

        const ehPack =
            dadosPack
                .orderIds
                .length >
            1;

        const descricaoVenda =
            ehPack

                ? `
                    Pacote Mercado Livre:
                    <strong>
                        ${esc(
                            window._nfePackIdAtual ||
                            window._nfeShipmentIdAtual ||
                            'PACK'
                        )}
                    </strong>

                    <br>

                    <span
                        style="
                            font-size:11px;
                            color:#6c757d;
                        "
                    >
                        ${dadosPack.orderIds.length}
                        pedidos:
                        ${dadosPack.orderIds
                            .map(
                                esc
                            )
                            .join(' + ')}
                    </span>
                `

                : `
                    Venda Mercado Livre:
                    ${esc(orderId)}
                `;

        // =====================================================
        // MODAL
        // =====================================================

        const modalHTML = `

            <div
                id="modalEdicaoProdutos"
                class="modal"
                style="
                    display:flex;
                    align-items:center;
                    justify-content:center;
                    background:rgba(0,0,0,0.5);
                    z-index:10000;
                    position:fixed;
                    inset:0;
                "
            >

                <div
                    class="modal-content"
                    style="
                        max-width:1150px;
                        width:96%;
                        max-height:94vh;
                        overflow-y:auto;
                        background:white;
                        padding:25px;
                        border-radius:10px;
                    "
                >

                    <div
                        style="
                            display:flex;
                            justify-content:space-between;
                            align-items:flex-start;
                            margin-bottom:18px;
                        "
                    >

                        <div>

                            <h3
                                style="
                                    margin:0 0 4px 0;
                                "
                            >

                                <i class="fas fa-file-invoice"></i>

                                Emitir NF-e

                            </h3>

                            <small
                                style="
                                    color:#6c757d;
                                "
                            >
                                ${descricaoVenda}
                            </small>

                        </div>

                        <button
                            type="button"
                            onclick="fecharModalEdicaoProdutos()"
                            style="
                                background:none;
                                border:none;
                                font-size:28px;
                                cursor:pointer;
                                color:#6c757d;
                            "
                        >
                            &times;
                        </button>

                    </div>


                    <div
                        style="
                            background:#f8f9fa;
                            padding:14px;
                            border-radius:8px;
                            margin-bottom:20px;
                        "
                    >

                        <strong>

                            Valor sugerido da nota:

                            R$

                            ${valorTotalProduto.toFixed(2)}

                        </strong>

                        ${
                            ehPack
                                ? `
                                    <span
                                        style="
                                            margin-left:10px;
                                            padding:4px 8px;
                                            background:#17a2b8;
                                            color:white;
                                            border-radius:5px;
                                            font-size:11px;
                                        "
                                    >
                                        ${dadosPack.orderIds.length}
                                        pedidos agrupados
                                    </span>
                                `
                                : ''
                        }

                        <span
                            style="
                                color:#6c757d;
                                margin-left:8px;
                            "
                        >
                            Você pode ajustar os valores abaixo.
                        </span>

                    </div>


                    <h4>

                        <i class="fas fa-box"></i>

                        Produtos

                    </h4>


                    <div
                        class="table-responsive"
                        style="
                            margin-bottom:22px;
                        "
                    >

                        <table
                            class="table table-striped"
                            style="
                                min-width:980px;
                            "
                        >

                            <thead>

                                <tr>

                                    <th>
                                        Nome do produto
                                    </th>

                                    <th>
                                        SKU
                                    </th>

                                    <th>
                                        Qtd
                                    </th>

                                    <th>
                                        Valor unit.
                                    </th>

                                    <th>
                                        NCM
                                    </th>

                                    <th>
                                        Subtotal
                                    </th>

                                </tr>

                            </thead>


                            <tbody
                                id="produtosEditaveisBody"
                            >

                                ${produtosEditados
                                    .map(
                                        (
                                            p,
                                            index
                                        ) => `

                                        <tr
                                            data-index="${index}"
                                        >

                                            <td>

                                                <input
                                                    type="text"
                                                    class="
                                                        form-control
                                                        form-control-sm
                                                        nome-produto
                                                    "
                                                    data-index="${index}"
                                                    value="${esc(p.nome)}"
                                                >

                                            </td>


                                            <td>

                                                <input
                                                    type="text"
                                                    class="
                                                        form-control
                                                        form-control-sm
                                                        sku-produto
                                                    "
                                                    data-index="${index}"
                                                    value="${esc(p.sku)}"
                                                >

                                            </td>


                                            <td>

                                                <input
                                                    type="number"
                                                    class="
                                                        form-control
                                                        form-control-sm
                                                        qtd-produto
                                                    "
                                                    data-index="${index}"
                                                    value="${p.quantidade}"
                                                    min="0.01"
                                                    step="0.01"
                                                >

                                            </td>


                                            <td>

                                                <input
                                                    type="number"
                                                    class="
                                                        form-control
                                                        form-control-sm
                                                        valor-produto
                                                    "
                                                    data-index="${index}"
                                                    value="${Number(
                                                        p.valor_unitario
                                                    ).toFixed(2)}"
                                                    min="0"
                                                    step="0.01"
                                                >

                                            </td>


                                            <td>

                                                <input
                                                    type="text"
                                                    class="
                                                        form-control
                                                        form-control-sm
                                                        ncm-produto
                                                    "
                                                    data-index="${index}"
                                                    value="${esc(p.ncm)}"
                                                    maxlength="8"
                                                >

                                            </td>


                                            <td
                                                class="subtotal-produto"
                                            >

                                                R$

                                                ${(
                                                    Number(
                                                        p.quantidade
                                                    ) *
                                                    Number(
                                                        p.valor_unitario
                                                    )
                                                ).toFixed(2)}

                                            </td>

                                        </tr>

                                    `
                                    )
                                    .join('')}

                            </tbody>


                            <tfoot>

                                <tr
                                    style="
                                        font-weight:bold;
                                        background:#f8f9fa;
                                    "
                                >

                                    <td
                                        colspan="5"
                                        style="
                                            text-align:right;
                                        "
                                    >
                                        Total da Nota:
                                    </td>

                                    <td
                                        id="totalGeralProdutos"
                                    >

                                        R$

                                        ${produtosEditados
                                            .reduce(
                                                (
                                                    total,
                                                    p
                                                ) => {

                                                    return (
                                                        total +
                                                        (
                                                            Number(
                                                                p.quantidade
                                                            ) *
                                                            Number(
                                                                p.valor_unitario
                                                            )
                                                        )
                                                    );
                                                },
                                                0
                                            )
                                            .toFixed(2)}

                                    </td>

                                </tr>

                            </tfoot>

                        </table>

                    </div>


                    <!-- CLIENTE -->

                    <div
                        style="
                            margin-top:20px;
                            margin-bottom:20px;
                            padding:16px;
                            background:#f8f9fa;
                            border:1px solid #e1e5eb;
                            border-radius:10px;
                        "
                    >

                        <h4
                            style="
                                margin:0 0 14px 0;
                            "
                        >

                            <i class="fas fa-user"></i>

                            Dados do cliente

                        </h4>


                        <div
                            style="
                                display:grid;
                                grid-template-columns:repeat(12,1fr);
                                gap:12px;
                                align-items:end;
                            "
                        >

                            <div
                                style="
                                    grid-column:span 8;
                                "
                            >

                                <label>
                                    Nome completo *
                                </label>

                                <input
                                    type="text"
                                    id="clienteNome"
                                    class="form-control"
                                    value="${esc(nomeCliente)}"
                                    required
                                >

                            </div>


                            <div
                                style="
                                    grid-column:span 4;
                                "
                            >

                                <label>
                                    CPF / CNPJ *
                                </label>

                                <input
                                    type="text"
                                    id="clienteDocumento"
                                    class="form-control"
                                    value="${esc(documentoCliente)}"
                                    required
                                >

                            </div>


                            <div
                                style="
                                    grid-column:span 6;
                                "
                            >

                                <label>
                                    Endereço *
                                </label>

                                <input
                                    type="text"
                                    id="clienteEndereco"
                                    class="form-control"
                                    value="${esc(logradouro)}"
                                    required
                                >

                            </div>


                            <div
                                style="
                                    grid-column:span 2;
                                "
                            >

                                <label>
                                    Número
                                </label>

                                <input
                                    type="text"
                                    id="clienteNumero"
                                    class="form-control"
                                    value="${esc(numero || 'S/N')}"
                                >

                            </div>


                            <div
                                style="
                                    grid-column:span 4;
                                "
                            >

                                <label>
                                    Bairro
                                </label>

                                <input
                                    type="text"
                                    id="clienteBairro"
                                    class="form-control"
                                    value="${esc(bairro)}"
                                >

                            </div>


                            <div
                                style="
                                    grid-column:span 6;
                                "
                            >

                                <label>
                                    Cidade *
                                </label>

                                <input
                                    type="text"
                                    id="clienteCidade"
                                    class="form-control"
                                    value="${esc(cidade)}"
                                    required
                                >

                            </div>


                            <div
                                style="
                                    grid-column:span 2;
                                "
                            >

                                <label>
                                    UF *
                                </label>

                                <input
                                    type="text"
                                    id="clienteUF"
                                    class="form-control"
                                    value="${esc(uf)}"
                                    maxlength="2"
                                    required
                                >

                            </div>


                            <div
                                style="
                                    grid-column:span 4;
                                "
                            >

                                <label>
                                    CEP
                                </label>

                                <input
                                    type="text"
                                    id="clienteCEP"
                                    class="form-control"
                                    value="${esc(cep)}"
                                >

                            </div>

                        </div>

                    </div>


                    <!-- FISCAL -->

                    <h4>

                        <i class="fas fa-receipt"></i>

                        Dados fiscais e transporte

                    </h4>


                    <div
                        class="row"
                    >

                        <div
                            class="col-md-4"
                        >

                            <div
                                class="form-group"
                            >

                                <label>
                                    CFOP
                                </label>

                                <select
                                    id="nfeCfop"
                                    class="form-control"
                                >

                                    <option
                                        value="6108"
                                        selected
                                    >
                                        6108 - Venda interestadual
                                    </option>

                                    <option
                                        value="5102"
                                    >
                                        5102 - Venda dentro do estado
                                    </option>

                                    <option
                                        value="5405"
                                    >
                                        5405 - Venda de produção
                                    </option>

                                </select>

                            </div>

                        </div>


                        <div
                            class="col-md-8"
                        >

                            <div
                                class="form-group"
                            >

                                <label>
                                    Transportadora
                                </label>

                                <select
                                    id="nfeTransportadora"
                                    class="form-control"
                                >

                                    <option
                                        value=""
                                    >
                                        Selecione uma transportadora
                                    </option>

                                </select>

                            </div>

                        </div>

                    </div>


                    <div
                        class="
                            d-flex
                            justify-content-end
                            gap-2
                            mt-3
                        "
                    >

                        <button
                            type="button"
                            class="btn btn-secondary"
                            onclick="fecharModalEdicaoProdutos()"
                        >
                            Cancelar
                        </button>


                        <button
                            type="button"
                            class="btn btn-success"
                            id="confirmarProdutosFinalBtn"
                        >

                            <i class="fas fa-file-invoice"></i>

                            Confirmar e Emitir NF-e

                        </button>

                    </div>

                </div>

            </div>
        `;

        // =====================================================
        // ADICIONAR MODAL
        // =====================================================

        const modalContainer =
            document.createElement(
                'div'
            );

        modalContainer.innerHTML =
            modalHTML;

        document.body
            .appendChild(
                modalContainer
                    .firstElementChild
            );

        const modal =
            document.getElementById(
                'modalEdicaoProdutos'
            );

        // =====================================================
        // TRANSPORTADORAS
        // =====================================================

        await carregarTransportadorasSelect();

        // =====================================================
        // CFOP
        // =====================================================

        const cfopSelect =
            modal
                ?.querySelector(
                    '#nfeCfop'
                );

        if (cfopSelect) {

            cfopSelect.value =
                '6108';
        }

        // =====================================================
        // RECALCULAR TOTAL
        // =====================================================

        const recalcularTotalGeral =
            () => {

                let total = 0;

                modal
                    ?.querySelectorAll(
                        '#produtosEditaveisBody tr'
                    )
                    .forEach(
                        (
                            row,
                            index
                        ) => {

                            const produto =
                                produtosEditados[
                                    index
                                ];

                            if (!produto) {

                                return;
                            }

                            produto.nome =
                                row
                                    .querySelector(
                                        '.nome-produto'
                                    )
                                    ?.value
                                    .trim() ||
                                'Produto';

                            produto.sku =
                                row
                                    .querySelector(
                                        '.sku-produto'
                                    )
                                    ?.value
                                    .trim() ||
                                'SEM_SKU';

                            produto.quantidade =
                                parseFloat(
                                    row
                                        .querySelector(
                                            '.qtd-produto'
                                        )
                                        ?.value
                                ) ||
                                0;

                            produto.valor_unitario =
                                parseFloat(
                                    row
                                        .querySelector(
                                            '.valor-produto'
                                        )
                                        ?.value
                                ) ||
                                0;

                            produto.ncm =
                                row
                                    .querySelector(
                                        '.ncm-produto'
                                    )
                                    ?.value
                                    .trim() ||
                                '87149990';

                            const subtotal =
                                produto.quantidade *
                                produto.valor_unitario;

                            total +=
                                subtotal;

                            const subtotalCell =
                                row.querySelector(
                                    '.subtotal-produto'
                                );

                            if (
                                subtotalCell
                            ) {

                                subtotalCell
                                    .textContent =
                                    `R$ ${subtotal.toFixed(2)}`;
                            }
                        }
                    );

                const totalCell =
                    modal
                        ?.querySelector(
                            '#totalGeralProdutos'
                        );

                if (totalCell) {

                    totalCell.textContent =
                        `R$ ${total.toFixed(2)}`;
                }
            };

        // =====================================================
        // EVENTOS PRODUTOS
        // =====================================================

        modal
            ?.querySelectorAll(
                `
                .nome-produto,
                .sku-produto,
                .qtd-produto,
                .valor-produto,
                .ncm-produto
                `
            )
            .forEach(
                input => {

                    input.addEventListener(
                        'input',
                        recalcularTotalGeral
                    );
                }
            );

        // =====================================================
        // BOTÃO FINAL
        // =====================================================

        modal
            ?.querySelector(
                '#confirmarProdutosFinalBtn'
            )
            ?.addEventListener(
                'click',
                async event => {

                    event.preventDefault();

                    event.stopPropagation();

                    await confirmarProdutosEditados();
                }
            );

        console.log(
            '✅ Modal NF-e carregado:',
            {
                orders:
                    window
                        ._nfeOrderIdsAtuais,

                itens:
                    produtosEditados
                        .length,

                total:
                    produtosEditados.reduce(
                        (
                            total,
                            p
                        ) =>
                            total +
                            (
                                Number(
                                    p.quantidade
                                ) *
                                Number(
                                    p.valor_unitario
                                )
                            ),
                        0
                    )
            }
        );

    } catch (error) {

        console.error(
            '❌ Erro ao abrir modal de emissão:',
            error
        );

        showToast(
            '❌ Erro ao carregar dados da emissão: ' +
            error.message,
            'error'
        );

        pendingEmitOrderId =
            null;

        vendaIdParaEdicao =
            null;
    }
}

function extrairDataEnvioML(venda) {

    if (!venda) {
        return null;
    }

    const info =
        parseInformacoesEnvioNFE(
            venda
        );

    // =====================================================
    // PRINCIPAL
    // SLA DO MERCADO LIVRE
    // =====================================================

    const expectedDate =
        normalizarDataEnvioML(
            info?.sla
                ?.expected_date
        );

    // =====================================================
    // DATA DE LIBERAÇÃO
    //
    // IMPORTANTE PARA:
    // venda feita em 01/08
    // mas liberada para despacho em 12/08.
    // =====================================================

    const dataLiberacao =
        normalizarDataEnvioML(
            venda.data_liberacao ||
            info.data_liberacao
        );

    const statusLiberacao =
        String(
            venda.status_liberacao ||
            info.status_liberacao ||
            ''
        )
            .toLowerCase();

    if (
        dataLiberacao &&
        (
            !expectedDate ||

            (
                [
                    'liberado',
                    'agendado',
                    'pendente'
                ].includes(
                    statusLiberacao
                ) &&
                dataLiberacao >=
                    expectedDate
            )
        )
    ) {

        return dataLiberacao;
    }

    if (expectedDate) {
        return expectedDate;
    }

    // =====================================================
    // DATA JÁ PROCESSADA
    // =====================================================

    const processada =
        normalizarDataEnvioML(
            venda._data_envio
        );

    if (processada) {
        return processada;
    }

    // =====================================================
    // FALLBACKS
    // =====================================================

    const candidatos = [

        info?.lead_time
            ?.estimated_handling_limit
            ?.date,

        info?.shipping_option
            ?.estimated_handling_limit
            ?.date,

        info
            ?.estimated_handling_limit
            ?.date,

        info?.lead_time
            ?.handling_time
            ?.limit
            ?.date

    ];

    for (
        const candidato
        of candidatos
    ) {

        const data =
            normalizarDataEnvioML(
                candidato
            );

        if (data) {
            return data;
        }
    }

    return null;
}

function extrairPrazoEnvioCompletoML(
    venda
) {

    if (!venda) {
        return null;
    }

    const info =
        parseInformacoesEnvioNFE(
            venda
        );

    const candidatos = [

        info?.sla
            ?.expected_date,

        venda.data_liberacao,

        info.data_liberacao,

        info?.lead_time
            ?.estimated_handling_limit
            ?.date,

        info?.shipping_option
            ?.estimated_handling_limit
            ?.date,

        info
            ?.estimated_handling_limit
            ?.date,

        venda._prazo_envio
    ];

    for (
        const candidato
        of candidatos
    ) {

        if (candidato) {
            return candidato;
        }
    }

    return null;
}

// =========================================================
// VENDA PERTENCE À DATA SELECIONADA?
// =========================================================

function vendaPertenceDataSelecionadaNFE(
    venda,
    dataSelecionada
) {

    if (!dataSelecionada) {
        return true;
    }

    const isFull =
        detectarVendaFullNFE(
            venda
        );

    // =====================================================
    // FULL
    //
    // FULL não tem prazo de despacho do vendedor.
    // Para não desaparecer da tabela, usamos a data
    // em que a venda caiu.
    // =====================================================

    if (isFull) {

        return (
            obterDataVendaNFE(
                venda
            ) ===
            dataSelecionada
        );
    }

    // =====================================================
    // NORMAL
    // =====================================================

    return (
        extrairDataEnvioML(
            venda
        ) ===
        dataSelecionada
    );
}

async function carregarIdsNFEAtivas() {

    const ids =
        new Set();

    // =====================================================
    // 1. BACKEND
    // =====================================================

    try {

        const response =
            await fetch(
                `${window.API_BASE_URL}/nfe/listar-nfes`,
                {
                    cache:
                        'no-store'
                }
            );

        if (
            response.ok
        ) {

            const data =
                await response.json();

            const notas =
                Array.isArray(
                    data?.notas
                )
                    ? data.notas
                    : [];

            notas.forEach(
                nfe => {

                    if (
                        nfe?.cancelada
                    ) {
                        return;
                    }

                    const id =
                        normalizarOrderIdML(
                            nfe?.venda_id ||
                            nfe?.venda_id_ml ||
                            nfe?.id_venda
                        );

                    if (id) {
                        ids.add(
                            id
                        );
                    }
                }
            );
        }

    } catch (
        error
    ) {

        console.warn(
            '⚠️ Erro ao consultar NF-es no backend:',
            error
        );
    }

    // =====================================================
    // 2. SUPABASE
    // =====================================================

    try {

        const {
            data,
            error
        } =
            await window
                .supabaseClient
                .from(
                    'nfe_emitidas'
                )
                .select(
                    'venda_id, cancelada'
                );

        if (
            !error &&
            Array.isArray(
                data
            )
        ) {

            data.forEach(
                nfe => {

                    if (
                        nfe?.cancelada
                    ) {
                        return;
                    }

                    const id =
                        normalizarOrderIdML(
                            nfe.venda_id
                        );

                    if (id) {
                        ids.add(
                            id
                        );
                    }
                }
            );
        }

    } catch (
        error
    ) {

        console.warn(
            '⚠️ Erro ao consultar nfe_emitidas:',
            error
        );
    }

    console.log(
        `🧾 ${ids.size} venda(s) identificadas com NF-e`
    );

    return ids;
}

function mesclarVendasFonteNFE(
    vendasBanco = [],
    vendasRecentes = []
) {

    const mapa =
        new Map();

    const aplicar =
        (
            venda,
            recente = false
        ) => {

            if (!venda) {
                return;
            }

            const id =
                normalizarOrderIdML(
                    venda.id_venda_ml ||
                    venda.id
                );

            if (!id) {
                return;
            }

            const anterior =
                mapa.get(id) ||
                {};

            const infoAnterior =
                parseInformacoesEnvioNFE(
                    anterior
                );

            const infoNovo =
                parseInformacoesEnvioNFE(
                    venda
                );

            // =================================================
            // NÃO DEIXAR DADOS NOVOS APAGAREM O SLA ANTIGO
            // E VICE-VERSA
            // =================================================

            const infoMesclado = {

                ...infoAnterior,
                ...infoNovo,

                id:
                    infoNovo.id ||
                    infoAnterior.id ||
                    venda.id_envio ||
                    anterior.id_envio ||
                    null,

                tipo:
                    infoNovo.tipo ||
                    infoAnterior.tipo ||
                    venda.tipo_envio ||
                    anterior.tipo_envio ||
                    null,

                sla:
                    infoNovo.sla ||
                    infoAnterior.sla ||
                    null,

                lead_time:
                    infoNovo.lead_time ||
                    infoAnterior.lead_time ||
                    null
            };

            const combinado = {

                ...anterior,
                ...venda,

                id:
                    id,

                id_venda_ml:
                    id,

                informacoes_envio:
                    infoMesclado,

                nfe_emitida:
                    Boolean(
                        anterior
                            .nfe_emitida ||
                        venda
                            .nfe_emitida
                    ),

                _fonte_recente:
                    recente ||
                    anterior
                        ._fonte_recente ||
                    false
            };

            mapa.set(
                id,
                combinado
            );
        };

    vendasBanco.forEach(
        venda =>
            aplicar(
                venda,
                false
            )
    );

    vendasRecentes.forEach(
        venda =>
            aplicar(
                venda,
                true
            )
    );

    return [
        ...mapa.values()
    ];
}

async function buscarVendasAtualizadasRecentementeNFE(
    dataReferencia = null,
    diasJanela = 4,
    maximo = 150
) {

    const token =
        await obterTokenMLNFE();

    if (!token) {

        console.warn(
            '⚠️ Token ML não disponível'
        );

        return [];
    }

    const dataBase =
        dataReferencia
            ? new Date(
                `${dataReferencia}T12:00:00`
            )
            : new Date();

    const inicio =
        new Date(
            dataBase
        );

    inicio.setDate(
        inicio.getDate() -
        diasJanela
    );

    inicio.setHours(
        0,
        0,
        0,
        0
    );

    const vendas =
        [];

    const LIMIT =
        50;

    let offset =
        0;

    let total =
        null;

    try {

        while (
            vendas.length <
                maximo &&
            (
                total === null ||
                offset < total
            )
        ) {

            const params =
                new URLSearchParams({
                    seller:
                        '415176739',

                    'order.status':
                        'paid',

                    'order.date_last_updated.from':
                        inicio.toISOString(),

                    sort:
                        'date_desc',

                    limit:
                        String(
                            LIMIT
                        ),

                    offset:
                        String(
                            offset
                        )
                });

            const url =
                `https://api.mercadolibre.com/orders/search?${params.toString()}`;

            const proxyUrl =
                `${window.WORKER_URL}/api/ml/proxy?url=` +
                `${encodeURIComponent(url)}` +
                `&token=${encodeURIComponent(token)}`;

            const response =
                await fetch(
                    proxyUrl,
                    {
                        cache:
                            'no-store'
                    }
                );

            if (
                !response.ok
            ) {

                console.warn(
                    `⚠️ Busca de orders atualizadas: HTTP ${response.status}`
                );

                break;
            }

            const payload =
                await response.json();

            const resultados =
                Array.isArray(
                    payload?.results
                )
                    ? payload.results
                    : [];

            if (
                total ===
                null
            ) {

                total =
                    Number(
                        payload
                            ?.paging
                            ?.total ||
                        resultados
                            .length ||
                        0
                    );
            }

            vendas.push(
                ...resultados
            );

            offset +=
                LIMIT;

            if (
                resultados.length <
                LIMIT
            ) {

                break;
            }
        }

    } catch (
        error
    ) {

        console.warn(
            '⚠️ Erro ao buscar orders atualizadas:',
            error
        );

        return [];
    }

    // =====================================================
    // BUSCAR SLA DAS ORDERS
    // =====================================================

    const lista =
        vendas.slice(
            0,
            maximo
        );

    const enriquecidas =
        [];

    const TAMANHO_LOTE =
        10;

    for (
        let i = 0;
        i < lista.length;
        i += TAMANHO_LOTE
    ) {

        const lote =
            lista.slice(
                i,
                i +
                    TAMANHO_LOTE
            );

        const resultados =
            await Promise.all(

                lote.map(
                    async venda => {

                        const idVenda =
                            normalizarOrderIdML(
                                venda.id
                            );

                        const shipmentId =
                            venda.shipping
                                ?.id ||
                            null;

                        if (
                            !shipmentId
                        ) {

                            return {

                                ...venda,

                                id:
                                    idVenda,

                                id_venda_ml:
                                    idVenda
                            };
                        }

                        let sla =
                            null;

                        try {

                            const slaUrl =
                                `https://api.mercadolibre.com/shipments/${shipmentId}/sla`;

                            const slaProxy =
                                `${window.WORKER_URL}/api/ml/proxy?url=` +
                                `${encodeURIComponent(slaUrl)}` +
                                `&token=${encodeURIComponent(token)}`;

                            const slaResponse =
                                await fetch(
                                    slaProxy,
                                    {
                                        cache:
                                            'no-store'
                                    }
                                );

                            if (
                                slaResponse.ok
                            ) {

                                sla =
                                    await slaResponse
                                        .json();
                            }

                        } catch (
                            error
                        ) {

                            console.debug(
                                `ℹ️ SLA indisponível para ${shipmentId}`
                            );
                        }

                        return {

                            ...venda,

                            id:
                                idVenda,

                            id_venda_ml:
                                idVenda,

                            id_envio:
                                shipmentId,

                            informacoes_envio: {

                                id:
                                    shipmentId,

                                sla:
                                    sla
                            }
                        };
                    }
                )
            );

        enriquecidas.push(
            ...resultados.filter(
                Boolean
            )
        );
    }

    console.log(
        `🕒 ${enriquecidas.length} order(s) atualizadas recentemente`
    );

    return enriquecidas;
}

async function carregarVendasFonteBancoML() {

    if (
        !window
            .supabaseClient
    ) {
        return [];
    }

    const vendas =
        [];

    const POR_PAGINA =
        1000;

    const MAXIMO =
        5000;

    try {

        for (
            let inicio = 0;
            inicio < MAXIMO;
            inicio += POR_PAGINA
        ) {

            const {
                data,
                error
            } =
                await window
                    .supabaseClient
                    .from(
                        'vendas_ml'
                    )
                    .select('*')
                    .order(
                        'data_venda',
                        {
                            ascending:
                                false
                        }
                    )
                    .range(
                        inicio,
                        inicio +
                            POR_PAGINA -
                            1
                    );

            if (error) {
                throw error;
            }

            if (
                !Array.isArray(
                    data
                ) ||
                data.length ===
                    0
            ) {
                break;
            }

            vendas.push(
                ...data
            );

            if (
                data.length <
                POR_PAGINA
            ) {
                break;
            }
        }

    } catch (
        error
    ) {

        console.warn(
            '⚠️ Erro ao carregar vendas_ml:',
            error
        );
    }

    console.log(
        `📚 ${vendas.length} venda(s) carregadas de vendas_ml`
    );

    return vendas;
}

// =========================================================
// TOKEN ML
// =========================================================

async function obterTokenMLNFE() {

    let token =
        localStorage.getItem(
            'ml_access_token'
        );

    if (
        !token &&
        typeof window
            .getValidToken ===
        'function'
    ) {

        try {

            const tokenData =
                await window
                    .getValidToken();

            token =
                tokenData
                    ?.access_token ||
                null;

        } catch (
            error
        ) {

            console.warn(
                '⚠️ Erro ao renovar token ML:',
                error
            );
        }
    }

    return token || null;
}

function obterDataHojeLocal() {

    const agora =
        new Date();

    const ano =
        agora.getFullYear();

    const mes =
        String(
            agora.getMonth() + 1
        ).padStart(
            2,
            '0'
        );

    const dia =
        String(
            agora.getDate()
        ).padStart(
            2,
            '0'
        );

    return `${ano}-${mes}-${dia}`;
}

function formatarDataNFE(data) {

    if (!data) {
        return '-';
    }

    const normalizada =
        normalizarDataEnvioML(
            data
        );

    if (!normalizada) {
        return '-';
    }

    const [
        ano,
        mes,
        dia
    ] =
        normalizada.split('-');

    return `${dia}/${mes}/${ano}`;
}

function escaparHTMLNFE(valor) {

    return String(
        valor ??
        ''
    )
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// =========================================================
// IDENTIFICAR FULL
// =========================================================

function detectarVendaFullNFE(venda) {

    if (!venda) {
        return false;
    }

    if (
        venda._is_full ===
        true
    ) {
        return true;
    }

    const info =
        parseInformacoesEnvioNFE(
            venda
        );

    const textos = [
        venda._logistic_type,
        venda._shipping_mode,
        venda.tipo_envio,
        venda.meio_envio,
        info.tipo,
        venda.shipping?.logistic_type,
        venda.shipping?.shipping_mode,
        venda.shipping?.logistic?.type,
        venda.shipping?.logistic?.mode,
        ...(Array.isArray(venda.tags)
            ? venda.tags
            : [])
    ];

    const texto =
        textos
            .filter(Boolean)
            .join(' ')
            .toLowerCase();

    return (
        texto.includes(
            'fulfillment'
        ) ||
        texto.includes(
            'full'
        )
    );
}

function garantirControlesVendasNFE() {

    const tbody =
        document.getElementById(
            'vendasPendentesBody'
        );

    if (!tbody) {
        return;
    }

    const tabela =
        tbody.closest(
            'table'
        );

    if (!tabela) {
        return;
    }

    // =====================================================
    // CABEÇALHO
    // =====================================================

    const header =
        tabela.querySelector(
            'thead tr'
        );

    if (header) {

        header.innerHTML = `
            <th>Venda</th>
            <th>Envio</th>
            <th>Cliente</th>
            <th>SKU</th>
            <th>Valor</th>
            <th>Modalidade</th>
            <th>NF-e</th>
            <th>Estoque</th>
            <th>Ações</th>
        `;
    }

    if (
        document.getElementById(
            'controlesVendasNFE'
        )
    ) {

        return;
    }

    const container =
        document.createElement(
            'div'
        );

    container.id =
        'controlesVendasNFE';

    container.style.cssText = `
        display:flex;
        align-items:flex-end;
        gap:10px;
        flex-wrap:wrap;
        padding:12px;
        margin-bottom:12px;
        background:#f8f9fa;
        border:1px solid #e2e6ea;
        border-radius:8px;
    `;

    container.innerHTML = `

        <div>

            <label
                style="
                    display:block;
                    font-weight:600;
                    margin-bottom:4px;
                "
            >
                Data de envio
            </label>

            <input
                type="date"
                id="filtroDataEnvioNFE"
                class="form-control"
                style="width:175px;"
            >

        </div>


        <button
            type="button"
            class="btn btn-primary"
            id="btnAtualizarDataNFE"
        >
            <i class="fas fa-sync-alt"></i>
            Atualizar esta data
        </button>


        <button
            type="button"
            class="btn btn-secondary"
            id="btnTodasVendasNFE"
        >
            <i class="fas fa-list"></i>
            Todas salvas
        </button>


        <span
            id="statusAtualizacaoNFE"
            style="
                color:#6c757d;
                font-size:13px;
            "
        ></span>
    `;

    const wrapper =
        tabela.parentElement;

    wrapper.parentElement
        .insertBefore(
            container,
            wrapper
        );

    const input =
        document.getElementById(
            'filtroDataEnvioNFE'
        );

    input.value =
        obterDataHojeLocal();

    input.addEventListener(
        'change',
        async () => {

            window
                ._nfeFiltroTodas =
                false;

            await atualizarVendasDataSelecionada();
        }
    );

    document
        .getElementById(
            'btnAtualizarDataNFE'
        )
        ?.addEventListener(
            'click',
            atualizarVendasDataSelecionada
        );

    document
        .getElementById(
            'btnTodasVendasNFE'
        )
        ?.addEventListener(
            'click',
            mostrarTodasVendasCacheNFE
        );
}

async function mostrarTodasVendasCacheNFE() {

    window
        ._nfeFiltroTodas =
        true;

    const status =
        document.getElementById(
            'statusAtualizacaoNFE'
        );

    if (status) {

        status.textContent =
            'Exibindo todas as vendas salvas';
    }

    const vendas =
        await carregarVendasCacheNFE(
            null
        );

    renderizarVendasNFETabela(
        vendas
    );
}

async function atualizarVendasDataSelecionada() {

    window
        ._nfeFiltroTodas =
        false;

    const input =
        document.getElementById(
            'filtroDataEnvioNFE'
        );

    const data =
        input?.value ||
        obterDataHojeLocal();

    const status =
        document.getElementById(
            'statusAtualizacaoNFE'
        );

    const btn =
        document.getElementById(
            'btnAtualizarDataNFE'
        );

    const textoOriginal =
        btn?.innerHTML ||
        '';

    try {

        if (status) {

            status.textContent =
                'Atualizando vendas...';
        }

        if (btn) {

            btn.disabled =
                true;

            btn.innerHTML =
                '<span class="spinner"></span> Atualizando...';
        }

        // =====================================================
        // MOSTRAR CACHE IMEDIATAMENTE
        // =====================================================

        const cache =
            await carregarVendasCacheNFE(
                data
            );

        renderizarVendasNFETabela(
            cache
        );

        // =====================================================
        // SINCRONIZAR
        // =====================================================

        await sincronizarVendasPendentesML(
            data,
            true
        );

        // =====================================================
        // RECARREGAR CACHE
        // =====================================================

        const atualizado =
            await carregarVendasCacheNFE(
                data
            );

        renderizarVendasNFETabela(
            atualizado
        );

        localStorage.setItem(
            `nfe_sync_${data}`,
            String(
                Date.now()
            )
        );

        if (status) {

            status.textContent =
                `Atualizado às ${new Date().toLocaleTimeString('pt-BR')}`;
        }

        showToast(
            `✅ ${atualizado.length} venda(s) com envio em ${formatarDataNFE(data)}`,
            'success'
        );

    } catch (
        error
    ) {

        console.error(
            '❌ Erro atualizando vendas:',
            error
        );

        if (status) {

            status.textContent =
                'Erro na atualização';
        }

        showToast(
            `❌ Erro ao atualizar vendas: ${error.message}`,
            'error'
        );

    } finally {

        if (btn) {

            btn.disabled =
                false;

            btn.innerHTML =
                textoOriginal ||
                '<i class="fas fa-sync-alt"></i> Atualizar esta data';
        }
    }
}


function inicializarFiltroDataNFE() {

    garantirControlesVendasNFE();

    const input =
        document.getElementById(
            'filtroDataEnvioNFE'
        );

    if (
        input &&
        !input.value
    ) {

        input.value =
            obterDataHojeLocal();
    }
}

// =========================================================
// NORMALIZAR DATA
// =========================================================

function normalizarDataEnvioML(valor) {

    if (!valor) {
        return null;
    }

    const match =
        String(valor).match(
            /(\d{4}-\d{2}-\d{2})/
        );

    return match
        ? match[1]
        : null;
}

async function verificarEstoqueVenda(
    venda
) {

    try {

        // =====================================================
        // DESCOBRIR TODOS OS PRODUTOS FÍSICOS DA VENDA
        // =====================================================

        const itensParaVerificar =
            montarItensEstoqueVendaNFE(
                venda
            );

        console.log(
            '📦 Produtos físicos que precisam sair do estoque:',
            itensParaVerificar
        );

        if (
            itensParaVerificar.length ===
            0
        ) {

            return {

                status:
                    'sem_cadastro',

                produtos:
                    []
            };
        }

        // =====================================================
        // CONSULTAR TODOS OS SKUs
        // =====================================================

        const resultado =
            [];

        for (
            const item
            of itensParaVerificar
        ) {

            if (
                !item.sku ||
                item.sku ===
                    'SEM_SKU'
            ) {

                resultado.push({

                    ...item,

                    encontrado:
                        false,

                    motivo:
                        'Venda sem SKU'
                });

                continue;
            }

            const {
                data:
                    produto,

                error
            } =
                await window
                    .supabaseClient
                    .from(
                        'produtos_estoque'
                    )
                    .select(`
                        id,
                        sku,
                        nome,
                        quantidade,
                        mlb_codes,
                        bloquear_sync_ml
                    `)
                    .eq(
                        'sku',
                        item.sku
                    )
                    .maybeSingle();

            if (
                error
            ) {

                console.warn(
                    `⚠️ Erro consultando SKU ${item.sku}:`,
                    error
                );
            }

            if (
                error ||
                !produto
            ) {

                console.warn(
                    `❌ SKU físico não cadastrado: ${item.sku}`
                );

                resultado.push({

                    ...item,

                    encontrado:
                        false,

                    motivo:
                        'SKU não cadastrado'
                });

                continue;
            }

            console.log(
                `✅ SKU físico encontrado: ${item.sku} | baixa=${item.quantidade_venda} | estoque=${produto.quantidade}`
            );

            resultado.push({

                ...item,

                encontrado:
                    true,

                produto_id:
                    produto.id,

                nome:
                    produto.nome,

                estoque_atual:
                    Number(
                        produto.quantidade ||
                        0
                    ),

                mlb_codes:
                    produto.mlb_codes,

                bloquear_sync_ml:
                    Boolean(
                        produto.bloquear_sync_ml
                    )
            });
        }

        // =====================================================
        // TODOS PRECISAM EXISTIR
        // =====================================================

        const todosEncontrados =
            resultado.length >
                0 &&
            resultado.every(
                produto =>
                    produto.encontrado ===
                    true
            );

        if (
            !todosEncontrados
        ) {

            const faltantes =
                resultado
                    .filter(
                        item =>
                            !item.encontrado
                    )
                    .map(
                        item =>
                            item.sku
                    );

            console.warn(
                '⚠️ Baixa bloqueada. SKUs não encontrados:',
                faltantes
            );
        }

        return {

            status:
                todosEncontrados
                    ? 'disponivel'
                    : 'sem_cadastro',

            produtos:
                resultado
        };

    } catch (error) {

        console.error(
            '❌ Erro ao verificar estoque:',
            error
        );

        return {

            status:
                'erro',

            produtos:
                []
        };
    }
}

function fecharModalEdicaoProdutos() {
    const modal =
        document.getElementById(
            'modalEdicaoProdutos'
        );
    if (modal) {
        modal.remove();
    }
}

async function confirmarProdutosEditados() {

    console.log(
        '🔵 [confirmarProdutosEditados] MODAL ÚNICO'
    );

    const vendaId =
        vendaIdParaEdicao ||
        pendingEmitOrderId;

    if (!vendaId) {

        showToast(
            '❌ ID da venda não encontrado',
            'error'
        );

        return;
    }

    // =====================================================
    // CAPTURAR VALORES VISÍVEIS DA TABELA
    // =====================================================

    document
        .querySelectorAll(
            '#modalEdicaoProdutos #produtosEditaveisBody tr'
        )
        .forEach(
            (row, index) => {

                if (!produtosEditados[index]) {
                    return;
                }

                produtosEditados[index].nome =
                    row.querySelector(
                        '.nome-produto'
                    )?.value.trim() ||
                    'Produto';

                produtosEditados[index].sku =
                    row.querySelector(
                        '.sku-produto'
                    )?.value.trim() ||
                    'SEM_SKU';

                produtosEditados[index].quantidade =
                    parseFloat(
                        row.querySelector(
                            '.qtd-produto'
                        )?.value
                    ) || 0;

                produtosEditados[index].valor_unitario =
                    parseFloat(
                        row.querySelector(
                            '.valor-produto'
                        )?.value
                    ) || 0;

                produtosEditados[index].ncm =
                    row.querySelector(
                        '.ncm-produto'
                    )?.value.trim() ||
                    '87149990';
            }
        );

    // =====================================================
    // VALIDAR PRODUTOS
    // =====================================================

    if (
        !produtosEditados ||
        produtosEditados.length === 0
    ) {

        showToast(
            '❌ Nenhum produto para emitir',
            'error'
        );

        return;
    }

    const produtoInvalido =
        produtosEditados.find(
            p =>
                !p.nome ||
                p.quantidade <= 0 ||
                p.valor_unitario < 0
        );

    if (produtoInvalido) {

        showToast(
            '⚠️ Revise nome, quantidade e valor dos produtos.',
            'warning'
        );

        return;
    }

    try {

        // =====================================================
        // SALVAR NCM
        // =====================================================

        const ncmPromises =
            produtosEditados.map(
                p => {

                    if (
                        p.sku &&
                        p.sku !== 'SEM_SKU' &&
                        p.ncm
                    ) {

                        return window
                            .supabaseClient
                            .from(
                                'produto_ncm'
                            )
                            .upsert(
                                {
                                    sku:
                                        p.sku,

                                    ncm:
                                        p.ncm
                                },
                                {
                                    onConflict:
                                        'sku'
                                }
                            );
                    }

                    return Promise.resolve();
                }
            );

        await Promise.all(
            ncmPromises
        );

        // =====================================================
        // PRODUTOS QUE SERÃO ENVIADOS PARA A NF-E
        // =====================================================

        window.produtosParaEmissao =
            produtosEditados.map(
                p => ({

                    nome:
                        p.nome ||
                        'Produto',

                    quantidade:
                        p.quantidade ||
                        1,

                    valor_unitario:
                        p.valor_unitario ||
                        0,

                    sku:
                        p.sku ||
                        'SEM_SKU',

                    ncm:
                        p.ncm ||
                        '87149990'
                })
            );

        pendingEmitOrderId =
            vendaId;

        // =====================================================
        // EMITIR DIRETAMENTE
        // =====================================================

        await confirmarEmissaoNFE();
             } catch (error) {
        console.error(
            '❌ Erro em confirmarProdutosEditados:',
            error
        );
        showToast(
            '❌ Erro ao confirmar produtos: ' +
            error.message,
            'error'
        );
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

function extrairSkuEQuantidade(
    skuComPrefixo
) {

    if (
        !skuComPrefixo ||
        skuComPrefixo === 'SEM_SKU' ||
        skuComPrefixo === 'N/A'
    ) {

        return {

            sku:
                skuComPrefixo,

            multiplicador:
                1,

            skuOriginal:
                skuComPrefixo
        };
    }

    const texto =
        String(
            skuComPrefixo
        ).trim();

    // =====================================================
    // PREFIXO DE 3 DÍGITOS
    //
    // 001ABC = 1 x ABC
    // 002ABC = 2 x ABC
    // 010ABC = 10 x ABC
    // =====================================================

    const match =
        texto.match(
            /^(\d{3})(.+)$/
        );

    if (match) {

        let quantidade =
            parseInt(
                match[1],
                10
            );

        let skuReal =
            String(
                match[2] ||
                ''
            ).trim();

        if (
            !Number.isFinite(
                quantidade
            ) ||
            quantidade <=
                0
        ) {

            quantidade = 1;
        }

        if (
            skuReal.startsWith(
                '/'
            ) ||
            skuReal.startsWith(
                '\\'
            )
        ) {

            skuReal =
                skuReal.substring(
                    1
                );
        }

        return {

            sku:
                skuReal,

            multiplicador:
                quantidade,

            skuOriginal:
                texto
        };
    }

    return {

        sku:
            texto,

        multiplicador:
            1,

        skuOriginal:
            texto
    };
}

function decomporSkuCompostoNFE(
    skuOriginal,
    quantidadeVenda = 1
) {

    if (
        !skuOriginal ||
        skuOriginal === 'SEM_SKU' ||
        skuOriginal === 'N/A'
    ) {

        return [];
    }

    const quantidadeDoAnuncio =
        Number(
            quantidadeVenda
        ) || 1;

    // =====================================================
    // "." SEPARA PRODUTOS FÍSICOS DIFERENTES
    // =====================================================

    const partes =
        String(
            skuOriginal
        )
            .split('.')
            .map(
                parte =>
                    parte.trim()
            )
            .filter(Boolean);

    const resultado =
        [];

    for (
        const parte
        of partes
    ) {

        const {
            sku,
            multiplicador
        } =
            extrairSkuEQuantidade(
                parte
            );

        if (
            !sku ||
            sku === 'SEM_SKU' ||
            sku === 'N/A'
        ) {

            continue;
        }

        const qtdComponente =
            Number(
                multiplicador ||
                1
            );

        resultado.push({

            // SKU REAL cadastrado em produtos_estoque
            sku,

            // Ex.: 00200161POREIESTRP15000
            sku_original:
                parte,

            // SKU inteiro do anúncio
            sku_anuncio:
                String(
                    skuOriginal
                ),

            multiplicador:
                qtdComponente,

            // quantidade realmente retirada do estoque
            quantidade_venda:
                quantidadeDoAnuncio *
                qtdComponente
        });
    }

    console.log(
        '🧩 SKU composto decomposto:',
        skuOriginal,
        resultado
    );

    return resultado;
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

async function mostrarAbaNFE(
    aba
) {

    const abaVendas =
        document.getElementById(
            'abaVendas'
        );

    const abaEmitidas =
        document.getElementById(
            'abaEmitidas'
        );

    const abaAvulsa =
        document.getElementById(
            'abaAvulsa'
        );

    const abaTransportadoras =
        document.getElementById(
            'abaTransportadoras'
        );

    const abaClientes =
        document.getElementById(
            'abaClientes'
        );

    if (abaVendas) {
        abaVendas.classList.add(
            'hidden'
        );
    }

    if (abaEmitidas) {
        abaEmitidas.classList.add(
            'hidden'
        );
    }

    if (abaAvulsa) {
        abaAvulsa.classList.add(
            'hidden'
        );
    }

    if (abaTransportadoras) {
        abaTransportadoras.classList.add(
            'hidden'
        );
    }

    if (abaClientes) {
        abaClientes.classList.add(
            'hidden'
        );
    }

    const target =
        document.getElementById(
            `aba${aba.charAt(0).toUpperCase() + aba.slice(1)}`
        );

    if (target) {

        target.classList.remove(
            'hidden'
        );
    }

    const botoes = [
        'Vendas',
        'Emitidas',
        'Avulsa',
        'Transportadoras',
        'Clientes'
    ];

    botoes.forEach(
        btn => {

            const el =
                document.getElementById(
                    `tab${btn}Btn`
                );

            if (!el) {
                return;
            }

            if (
                btn.toLowerCase() ===
                aba
            ) {

                el.classList.remove(
                    'btn-outline-primary'
                );

                el.classList.add(
                    'btn-primary'
                );

            } else {

                el.classList.remove(
                    'btn-primary'
                );

                el.classList.add(
                    'btn-outline-primary'
                );
            }
        }
    );

    if (
        aba ===
        'vendas'
    ) {

        inicializarFiltroDataNFE();

        await carregarVendasPendentes(
            false
        );
    }

    if (
        aba ===
        'emitidas'
    ) {

        await carregarNFesEmitidas();
    }

    if (
        aba ===
        'transportadoras'
    ) {

        await carregarTransportadoras();
    }

    if (
        aba ===
        'clientes'
    ) {

        await carregarClientes();
    }
}

function handleEmitirNFEClick(
    event
) {

    const vendaId =
        normalizarOrderIdML(
            event
                .currentTarget
                .dataset
                .vendaId
        );

    if (!vendaId) {

        showToast(
            '❌ ID da venda não encontrado',
            'error'
        );

        return;
    }

    // =====================================================
    // LOCALIZAR A VENDA / PACK NA TABELA ATUAL
    // =====================================================

    const vendaGrupo =
        Array.isArray(
            vendasPendentes
        )
            ? vendasPendentes.find(
                venda => {

                    const idPrincipal =
                        normalizarOrderIdML(
                            venda.id_venda_ml ||
                            venda.id
                        );

                    if (
                        idPrincipal ===
                        vendaId
                    ) {

                        return true;
                    }

                    if (
                        Array.isArray(
                            venda._order_ids_pack
                        )
                    ) {

                        return venda
                            ._order_ids_pack
                            .map(
                                normalizarOrderIdML
                            )
                            .includes(
                                vendaId
                            );
                    }

                    return false;
                }
            )
            : null;

    // =====================================================
    // GUARDAR O GRUPO ATUAL
    // =====================================================

    window._nfeVendaGrupoAtual =
        vendaGrupo ||
        null;

    let orderIds =
        vendaGrupo
            ?._order_ids_pack ||
        [
            vendaId
        ];

    orderIds =
        [
            ...new Set(

                orderIds
                    .map(
                        normalizarOrderIdML
                    )
                    .filter(Boolean)
            )
        ];

    if (
        orderIds.length ===
        0
    ) {

        orderIds = [
            vendaId
        ];
    }

    window._nfeOrderIdsAtuais =
        orderIds;

    window._nfePackIdAtual =
        vendaGrupo
            ?._pack_id ||
        null;

    window._nfeShipmentIdAtual =
        vendaGrupo
            ?._shipment_id ||
        null;

    console.log(
        '📦 Venda selecionada para emissão:',
        {
            principal:
                vendaId,

            ehPack:
                orderIds.length > 1,

            packId:
                window
                    ._nfePackIdAtual,

            shipmentId:
                window
                    ._nfeShipmentIdAtual,

            orders:
                orderIds
        }
    );

    abrirModalEdicaoProdutos(
        vendaId
    );
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

function renderizarVendasNFETabela(
    vendas
) {

    const tbody =
        document.getElementById(
            'vendasPendentesBody'
        );

    if (!tbody) {
        return;
    }

    garantirControlesVendasNFE();

    // =====================================================
    // SEM VENDAS
    // =====================================================

    if (
        !Array.isArray(
            vendas
        ) ||
        vendas.length ===
            0
    ) {

        vendasPendentes =
            [];

        tbody.innerHTML = `
            <tr>
                <td
                    colspan="9"
                    class="text-center py-4"
                >
                    Nenhuma venda encontrada para esta data.
                </td>
            </tr>
        `;

        return;
    }

    vendasPendentes =
        vendas;

    // =====================================================
    // BADGE DE ENVIO
    // =====================================================

    const badgeEnvio =
        venda => {

            const tipo =
                `${venda._logistic_type || ''} ${venda._shipping_mode || ''} ${venda.tipo_envio || ''}`
                    .toUpperCase();

            if (
                venda._is_full ||
                tipo.includes(
                    'FULL'
                ) ||
                tipo.includes(
                    'FULFILLMENT'
                )
            ) {

                return `
                    <span
                        style="
                            background:#dc3545;
                            color:white;
                            padding:4px 8px;
                            border-radius:5px;
                            font-size:11px;
                        "
                    >
                        <i class="fas fa-warehouse"></i>
                        FULL
                    </span>
                `;
            }

            if (
                tipo.includes(
                    'FLEX'
                ) ||
                tipo.includes(
                    'SELF_SERVICE'
                ) ||
                tipo.includes(
                    'DROP_OFF'
                )
            ) {

                return `
                    <span
                        style="
                            background:#fd7e14;
                            color:white;
                            padding:4px 8px;
                            border-radius:5px;
                            font-size:11px;
                        "
                    >
                        <i class="fas fa-motorcycle"></i>
                        FLEX
                    </span>
                `;
            }

            if (
                tipo.includes(
                    'CROSS_DOCKING'
                ) ||
                tipo.includes(
                    'MERCADO'
                ) ||
                tipo.includes(
                    'ME2'
                )
            ) {

                return `
                    <span
                        style="
                            background:#17a2b8;
                            color:white;
                            padding:4px 8px;
                            border-radius:5px;
                            font-size:11px;
                        "
                    >
                        <i class="fas fa-truck"></i>
                        ME
                    </span>
                `;
            }

            return `
                <span
                    style="
                        background:#6c757d;
                        color:white;
                        padding:4px 8px;
                        border-radius:5px;
                        font-size:11px;
                    "
                >
                    ${escaparHTMLNFE(
                        tipo ||
                        'N/I'
                    )}
                </span>
            `;
        };

    // =====================================================
    // ESTOQUE
    // =====================================================

    const htmlEstoque =
        venda => {

            const vendaId =
                normalizarOrderIdML(
                    venda.id_venda_ml ||
                    venda.id
                );

            if (
                venda._is_full
            ) {

                return `
                    <span
                        style="
                            background:#e9ecef;
                            padding:4px 7px;
                            border-radius:5px;
                            font-size:11px;
                        "
                    >
                        <i class="fas fa-warehouse"></i>
                        Estoque FULL
                    </span>
                `;
            }

            if (
                venda
                    ._estoque_baixado
            ) {

                return `
                    <span
                        style="
                            background:#28a745;
                            color:white;
                            padding:4px 8px;
                            border-radius:5px;
                            font-size:11px;
                        "
                    >
                        <i class="fas fa-check"></i>
                        Estoque baixado
                    </span>
                `;
            }

            const status =
                venda._estoque_status ||
                'nao_verificado';

            if (
                status ===
                'disponivel'
            ) {

                return `
                    <div>

                        <div
                            style="
                                color:#28a745;
                                font-size:11px;
                                font-weight:600;
                            "
                        >
                            <i class="fas fa-check-circle"></i>
                            Produto cadastrado
                        </div>

                        <button
                            type="button"
                            class="btn btn-sm btn-primary"
                            style="margin-top:4px;"
                            onclick="darBaixaEstoqueVenda('${escaparHTMLNFE(vendaId)}')"
                        >
                            <i class="fas fa-minus-circle"></i>
                            Dar baixa
                        </button>

                    </div>
                `;
            }

            if (
                status ===
                'baixado_sync_pendente'
            ) {

                return `
                    <div>

                        <span
                            style="
                                color:#856404;
                                font-size:11px;
                            "
                        >
                            ⚠️ Baixado, sync ML pendente
                        </span>

                        <br>

                        <button
                            type="button"
                            class="btn btn-sm btn-warning"
                            style="margin-top:4px;"
                            onclick="sincronizarEstoqueVendaManual('${escaparHTMLNFE(vendaId)}')"
                        >
                            Sincronizar ML
                        </button>

                    </div>
                `;
            }

            if (
                status ===
                'sem_cadastro'
            ) {

                return `
                    <span
                        style="
                            color:#dc3545;
                            font-size:11px;
                            font-weight:600;
                        "
                    >
                        <i class="fas fa-exclamation-triangle"></i>
                        Não cadastrado
                    </span>
                `;
            }

            if (
                status ===
                'processando'
            ) {

                return `
                    <span
                        style="
                            color:#6c757d;
                            font-size:11px;
                        "
                    >
                        <i class="fas fa-spinner fa-spin"></i>
                        Processando
                    </span>
                `;
            }

            return `
                <span
                    style="
                        color:#6c757d;
                        font-size:11px;
                    "
                >
                    Não verificado
                </span>
            `;
        };

    // =====================================================
    // LINHAS
    // =====================================================

    tbody.innerHTML =
        vendas.map(
            venda => {

                const vendaId =
                    normalizarOrderIdML(
                        venda.id_venda_ml ||
                        venda.id
                    );

                const isFull =
                    Boolean(
                        venda._is_full
                    );

                const temNfe =
                    Boolean(
                        venda._tem_nfe
                    );

                // =================================================
                // DATA
                // =================================================

                let dataEnvio =
                    isFull
                        ? obterDataVendaNFE(
                            venda
                        )
                        : venda._data_envio;

                let tituloData =
                    isFull
                        ? 'Venda FULL'
                        : 'Despachar';

                let hora =
                    '';

                if (
                    !isFull &&
                    venda._prazo_envio
                ) {

                    try {

                        hora =
                            new Date(
                                venda
                                    ._prazo_envio
                            )
                                .toLocaleTimeString(
                                    'pt-BR',
                                    {
                                        hour:
                                            '2-digit',
                                        minute:
                                            '2-digit'
                                    }
                                );

                    } catch (
                        error
                    ) {}
                }

                // =================================================
                // CLIENTE
                // =================================================

                const cliente =
                    venda.cliente ||

                    venda.buyer
                        ?.nickname ||

                    `${venda.buyer?.first_name || ''} ${venda.buyer?.last_name || ''}`
                        .trim() ||

                    'N/I';

                // =================================================
                // SKU
                // =================================================

                let skus =
                    [];

                if (
                    venda.eh_kit &&
                    Array.isArray(
                        venda.skus_kit
                    )
                ) {

                    skus =
                        venda.skus_kit
                            .map(
                                item =>
                                    item.sku
                            )
                            .filter(Boolean);

                } else if (
                    Array.isArray(
                        venda.order_items
                    )
                ) {

                    skus =
                        venda.order_items
                            .map(
                                item =>
                                    item.item
                                        ?.seller_sku
                            )
                            .filter(Boolean);

                } else if (
                    venda.sku
                ) {

                    skus = [
                        venda.sku
                    ];
                }

                if (
                    skus.length ===
                    0
                ) {

                    skus = [
                        'SEM_SKU'
                    ];
                }

                const skuHtml =
                    skus
                        .map(
                            sku =>
                                `<div><code>${escaparHTMLNFE(sku)}</code></div>`
                        )
                        .join('');

                // =================================================
                // VALOR
                // =================================================

                const valor =
                    Number(
                        venda._valor_produto ??
                        venda.valor_total ??
                        venda.total_amount ??
                        0
                    );

                // =================================================
                // NF-E
                // =================================================

                let statusNFE;
                let acoes;

                if (
                    isFull
                ) {

                    statusNFE = `
                        <span
                            style="
                                background:#dc3545;
                                color:white;
                                padding:4px 8px;
                                border-radius:5px;
                                font-size:11px;
                                white-space:nowrap;
                            "
                        >
                            <i class="fas fa-warehouse"></i>
                            NF-e ML
                        </span>
                    `;

                    acoes = `
                        <span
                            style="
                                color:#6c757d;
                                font-size:11px;
                            "
                        >
                            Automática
                        </span>
                    `;

                } else if (
                    temNfe
                ) {

                    statusNFE = `
                        <span
                            style="
                                background:#28a745;
                                color:white;
                                padding:4px 8px;
                                border-radius:5px;
                                font-size:11px;
                            "
                        >
                            <i class="fas fa-check"></i>
                            Emitida
                        </span>
                    `;

                    acoes = `

                        <button
                            type="button"
                            class="btn btn-sm btn-warning btn-ver-nfe"
                            data-venda-id="${escaparHTMLNFE(vendaId)}"
                        >
                            <i class="fas fa-eye"></i>
                            Ver
                        </button>

                        <button
                            type="button"
                            class="btn btn-sm btn-danger btn-cancelar-nfe"
                            data-venda-id="${escaparHTMLNFE(vendaId)}"
                        >
                            <i class="fas fa-times"></i>
                            Cancelar
                        </button>
                    `;

                } else {

                    statusNFE = `
                        <span
                            style="
                                background:#ffc107;
                                color:#212529;
                                padding:4px 8px;
                                border-radius:5px;
                                font-size:11px;
                            "
                        >
                            <i class="fas fa-clock"></i>
                            Pendente
                        </span>
                    `;

                    acoes = `
                        <button
                            type="button"
                            class="btn btn-sm btn-success btn-emitir-nfe"
                            data-venda-id="${escaparHTMLNFE(vendaId)}"
                        >
                            <i class="fas fa-file-invoice"></i>
                            Emitir NF-e
                        </button>
                    `;
                }

                return `

                    <tr>

                        <td>
                            <strong>
                                ${escaparHTMLNFE(vendaId)}
                            </strong>
                        </td>


                        <td>

                            <strong>
                                ${formatarDataNFE(dataEnvio)}
                            </strong>

                            <div
                                style="
                                    color:#6c757d;
                                    font-size:10px;
                                "
                            >
                                ${tituloData}
                                ${
                                    hora
                                        ? ` até ${escaparHTMLNFE(hora)}`
                                        : ''
                                }
                            </div>

                        </td>


                        <td>
                            ${escaparHTMLNFE(cliente)}
                        </td>


                        <td>
                            ${skuHtml}
                        </td>


                        <td>
                            <strong>
                                R$ ${valor.toFixed(2)}
                            </strong>
                        </td>


                        <td>
                            ${badgeEnvio(venda)}
                        </td>


                        <td>
                            ${statusNFE}
                        </td>


                        <td>
                            ${htmlEstoque(venda)}
                        </td>


                        <td
                            style="
                                white-space:nowrap;
                            "
                        >
                            ${acoes}
                        </td>

                    </tr>
                `;
            }
        )
        .join('');

    // =====================================================
    // EVENTOS
    // =====================================================

    document
        .querySelectorAll(
            '#vendasPendentesBody .btn-emitir-nfe'
        )
        .forEach(
            btn => {

                btn.removeEventListener(
                    'click',
                    window
                        .handleEmitirNFEClick
                );

                btn.addEventListener(
                    'click',
                    window
                        .handleEmitirNFEClick
                );
            }
        );

    document
        .querySelectorAll(
            '#vendasPendentesBody .btn-ver-nfe'
        )
        .forEach(
            btn => {

                btn.removeEventListener(
                    'click',
                    window
                        .handleVerNFEClick
                );

                btn.addEventListener(
                    'click',
                    window
                        .handleVerNFEClick
                );
            }
        );

    document
        .querySelectorAll(
            '#vendasPendentesBody .btn-cancelar-nfe'
        )
        .forEach(
            btn => {

                btn.removeEventListener(
                    'click',
                    window
                        .handleCancelarNFEClick
                );

                btn.addEventListener(
                    'click',
                    window
                        .handleCancelarNFEClick
                );
            }
        );
}

async function sincronizarEstoqueVendaManual(
    vendaId
) {

    try {

        showToast(
            '🔄 Sincronizando estoque com o Mercado Livre...',
            'info'
        );

        const sucesso =
            await sincronizarEstoqueComML(
                String(vendaId)
            );

        if (!sucesso) {

            showToast(
                '⚠️ Ainda não foi possível sincronizar o estoque.',
                'warning'
            );

            return;
        }

        await window
            .supabaseClient
            .from(
                'vendas_nfe_cache'
            )
            .update({

                estoque_status:
                    'baixado'

            })
            .eq(
                'id_venda_ml',
                String(vendaId)
            );

        showToast(
            '✅ Estoque sincronizado com o ML!',
            'success'
        );

        const data =
            document.getElementById(
                'filtroDataEnvioNFE'
            )?.value ||
            obterDataHojeLocal();

        const vendas =
            await carregarVendasCacheNFE(
                window._nfeFiltroTodas
                    ? null
                    : data
            );

        renderizarVendasNFETabela(
            vendas
        );

    } catch (error) {

        console.error(
            error
        );

        showToast(
            '❌ Erro ao sincronizar estoque',
            'error'
        );
    }
}

async function registrarHistoricoBaixaEstoqueNFE(
    vendaId,
    origem = 'manual',
    detalhesEstoque = []
) {

    vendaId =
        normalizarOrderIdML(
            vendaId
        );

    if (!vendaId) {

        return {
            success: false,
            error: 'ID da venda inválido'
        };
    }

    try {

        // =====================================================
        // DESCRIÇÃO DOS PRODUTOS
        // =====================================================

        const produtos =
            Array.isArray(
                detalhesEstoque
            )
                ? detalhesEstoque
                : [];

        const descricaoProdutos =
            produtos
                .filter(
                    item =>
                        item?.sku &&
                        item.encontrado !==
                            false
                )
                .map(
                    item => {

                        const quantidade =
                            Number(
                                item.quantidade_venda ||
                                1
                            );

                        return (
                            `${item.sku} x${quantidade}`
                        );
                    }
                )
                .join(' | ');

        // =====================================================
        // ORIGEM
        // =====================================================

        const origemTexto =
            origem === 'nfe'
                ? 'automática após emissão da NF-e'
                : 'manual pelo botão Dar baixa';

        let observacao =
            `Baixa de estoque ${origemTexto} - Venda ML ${vendaId}`;

        if (
            descricaoProdutos
        ) {

            observacao +=
                ` - Produtos: ${descricaoProdutos}`;
        }

        console.log(
            '📝 Registrando histórico da baixa:',
            observacao
        );

        // =====================================================
        // IMPORTANTE:
        //
        // O código antigo NÃO verificava o error retornado
        // pelo Supabase.
        // =====================================================

        const {
            data,
            error
        } =
            await window
                .supabaseClient
                .from(
                    'estoque_historico'
                )
                .insert({

                    venda_id:
                        vendaId,

                    tipo:
                        'venda',

                    observacao:
                        observacao,

                    criado_por:
                        origem === 'nfe'
                            ? 'Emissão NF-e'
                            : 'Sistema NF-e',

                    criado_em:
                        new Date()
                            .toISOString()

                })
                .select();

        if (error) {

            console.error(
                '❌ SUPABASE recusou o histórico da baixa:',
                error
            );

            return {

                success: false,

                error:
                    error.message ||
                    'Erro ao gravar histórico',

                detalhe:
                    error
            };
        }

        console.log(
            '✅ Histórico da baixa gravado:',
            data
        );

        return {

            success: true,

            data
        };

    } catch (error) {

        console.error(
            '❌ Erro inesperado ao registrar histórico:',
            error
        );

        return {

            success: false,

            error:
                error.message
        };
    }
}

async function darBaixaEstoqueVenda(
    vendaId
) {

    vendaId =
        normalizarOrderIdML(
            vendaId
        );

    if (!vendaId) {

        showToast(
            '❌ ID da venda inválido',
            'error'
        );

        return;
    }

    if (
        window
            ._baixaEstoqueEmAndamento
    ) {

        showToast(
            '⚠️ Já existe uma baixa sendo processada.',
            'warning'
        );

        return;
    }

    // =====================================================
    // PACK
    // =====================================================

    let orderIds =
        obterOrderIdsVendaAtualNFE(
            vendaId
        );

    orderIds =
        [
            ...new Set(

                (
                    orderIds ||
                    [vendaId]
                )
                    .map(
                        normalizarOrderIdML
                    )
                    .filter(Boolean)
            )
        ];

    if (
        orderIds.length ===
        0
    ) {

        orderIds = [
            vendaId
        ];
    }

    // =====================================================
    // PRÉ-VALIDAÇÃO DE TODAS AS ORDERS
    // =====================================================

    try {

        const {
            data:
                vendasCache,

            error
        } =
            await window
                .supabaseClient
                .from(
                    'vendas_nfe_cache'
                )
                .select(`
                    id_venda_ml,
                    is_full,
                    estoque_baixado,
                    estoque_status,
                    estoque_detalhes
                `)
                .in(
                    'id_venda_ml',
                    orderIds
                );

        if (error) {

            throw error;
        }

        const cache =
            Array.isArray(
                vendasCache
            )
                ? vendasCache
                : [];

        for (
            const venda
            of cache
        ) {

            if (
                venda.is_full ||
                venda.estoque_baixado
            ) {

                continue;
            }

            const detalhes =
                Array.isArray(
                    venda.estoque_detalhes
                )
                    ? venda.estoque_detalhes
                    : [];

            if (
                detalhes.length ===
                0
            ) {

                throw new Error(
                    `Venda ${venda.id_venda_ml}: estoque ainda não verificado`
                );
            }

            const faltante =
                detalhes.find(
                    item =>
                        !item.encontrado
                );

            if (
                faltante
            ) {

                throw new Error(
                    `SKU ${faltante.sku || 'SEM_SKU'} não está cadastrado`
                );
            }
        }

    } catch (error) {

        showToast(
            `⚠️ Não foi possível dar baixa: ${error.message}`,
            'warning'
        );

        return;
    }

    // =====================================================
    // CONFIRMAÇÃO
    // =====================================================

    const confirmar =
        confirm(

            orderIds.length >
                1

                ? (
                    `Confirma a baixa do estoque deste PACK?\n\n` +
                    `${orderIds.length} pedidos serão processados.\n\n` +
                    `Após cada baixa o estoque será sincronizado com o Mercado Livre.`
                )

                : (
                    `Confirma a baixa do estoque da venda ${vendaId}?\n\n` +
                    `Após a baixa o estoque será sincronizado com o Mercado Livre.`
                )
        );

    if (!confirmar) {

        return;
    }

    window
        ._baixaEstoqueEmAndamento =
        vendaId;

    try {

        const resultados =
            [];

        // =====================================================
        // CADA ORDER PASSA PELA MESMA ROTINA CENTRAL
        // =====================================================

        for (
            const orderId
            of orderIds
        ) {

            const resultado =
                await garantirBaixaEstoqueVenda(
                    orderId,
                    'manual'
                );

            resultados.push({

                orderId,

                ...resultado
            });
        }

        const falhas =
            resultados.filter(
                item =>
                    !item.success
            );

        const baixadosAgora =
            resultados.filter(
                item =>
                    item.success &&
                    !item.already &&
                    !item.skipped
            );

        const jaBaixados =
            resultados.filter(
                item =>
                    item.success &&
                    (
                        item.already ||
                        item.skipped
                    )
            );

        const syncPendente =
            resultados.filter(
                item =>
                    item.success &&
                    item.sincronizado ===
                        false
            );

        // =====================================================
        // MENSAGEM
        // =====================================================

        if (
            falhas.length >
            0
        ) {

            const erros =
                falhas
                    .map(
                        item =>
                            `${item.orderId}: ${item.error || 'erro'}`
                    )
                    .join(' | ');

            showToast(
                `⚠️ Houve erro em parte da baixa: ${erros}`,
                'warning'
            );

        } else if (
            syncPendente.length >
            0
        ) {

            showToast(
                '⚠️ Estoque baixado, mas existe sincronização pendente com o Mercado Livre.',
                'warning'
            );

        } else if (
            baixadosAgora.length >
            0
        ) {

            showToast(
                orderIds.length > 1
                    ? `✅ Pack baixado e sincronizado com ML! ${baixadosAgora.length} pedido(s) processado(s).`
                    : '✅ Estoque baixado e sincronizado com o Mercado Livre!',
                'success'
            );

        } else if (
            jaBaixados.length >
            0
        ) {

            showToast(
                '✅ O estoque já havia sido baixado anteriormente.',
                'success'
            );
        }

        // =====================================================
        // ATUALIZAR TABELA
        // =====================================================

        const data =
            document
                .getElementById(
                    'filtroDataEnvioNFE'
                )
                ?.value ||
            obterDataHojeLocal();

        const vendas =
            await carregarVendasCacheNFE(

                window._nfeFiltroTodas
                    ? null
                    : data
            );

        renderizarVendasNFETabela(
            vendas
        );

        if (
            typeof window
                .carregarProdutosEstoque ===
            'function'
        ) {

            try {

                await window
                    .carregarProdutosEstoque();

            } catch (error) {}
        }

    } catch (error) {

        console.error(
            '❌ Erro geral na baixa:',
            error
        );

        showToast(
            `❌ Erro ao baixar estoque: ${error.message}`,
            'error'
        );

    } finally {

        window
            ._baixaEstoqueEmAndamento =
            null;
    }
}

async function atualizarTabelaVendasNFEPosEstoque() {

    try {

        const data =
            document.getElementById(
                'filtroDataEnvioNFE'
            )?.value ||
            obterDataHojeLocal();

        const vendas =
            await carregarVendasCacheNFE(

                window._nfeFiltroTodas
                    ? null
                    : data
            );

        renderizarVendasNFETabela(
            vendas
        );

    } catch (
        error
    ) {

        console.warn(
            '⚠️ Erro ao atualizar tabela após baixa:',
            error
        );
    }
}

async function salvarVendasCacheNFE(
    vendas
) {

    if (
        !Array.isArray(
            vendas
        ) ||
        vendas.length ===
            0
    ) {

        return;
    }

    try {

        console.log(
            `💾 Salvando ${vendas.length} venda(s) no cache NF-e`
        );

        const ids =
            [
                ...new Set(

                    vendas
                        .map(
                            venda =>
                                normalizarOrderIdML(
                                    venda.id_venda_ml ||
                                    venda.id
                                )
                        )
                        .filter(Boolean)
                )
            ];

        if (
            ids.length ===
            0
        ) {

            return;
        }

        // =====================================================
        // ESTADO ANTERIOR
        // =====================================================

        let existentes =
            [];

        try {

            const {
                data,
                error
            } =
                await window
                    .supabaseClient
                    .from(
                        'vendas_nfe_cache'
                    )
                    .select(`
                        id_venda_ml,
                        tem_nfe,
                        estoque_baixado,
                        estoque_status,
                        estoque_baixado_em,
                        estoque_detalhes
                    `)
                    .in(
                        'id_venda_ml',
                        ids
                    );

            if (!error) {

                existentes =
                    data || [];
            }

        } catch (
            error
        ) {

            console.warn(
                '⚠️ Erro lendo cache anterior:',
                error
            );
        }

        const mapaAnterior =
            new Map();

        existentes.forEach(
            registro => {

                mapaAnterior.set(
                    normalizarOrderIdML(
                        registro
                            .id_venda_ml
                    ),
                    registro
                );
            }
        );

        const registros =
            [];

        for (
            const venda
            of vendas
        ) {

            const idVenda =
                normalizarOrderIdML(
                    venda.id_venda_ml ||
                    venda.id
                );

            if (!idVenda) {
                continue;
            }

            const anterior =
                mapaAnterior.get(
                    idVenda
                ) ||
                {};

            const info =
                parseInformacoesEnvioNFE(
                    venda
                );

            const isFull =
                detectarVendaFullNFE(
                    venda
                );

            const dataEnvio =
                isFull
                    ? null
                    : (
                        venda._data_envio ||
                        extrairDataEnvioML(
                            venda
                        )
                    );

            const prazoEnvio =
                isFull
                    ? null
                    : (
                        venda._prazo_envio ||
                        extrairPrazoEnvioCompletoML(
                            venda
                        )
                    );

            // =================================================
            // CLIENTE
            // =================================================

            const cliente =
                venda.cliente ||

                venda.buyer
                    ?.nickname ||

                `${venda.buyer?.first_name || ''} ${venda.buyer?.last_name || ''}`
                    .trim() ||

                'N/I';

            // =================================================
            // SKU
            // =================================================

            const sku =
                venda.sku ||
                venda.item_sku ||
                venda.codigo ||
                venda.order_items
                    ?.[0]
                    ?.item
                    ?.seller_sku ||
                'SEM_SKU';

            // =================================================
            // SHIPMENT
            // =================================================

            const shipmentId =
                venda.id_envio ||
                venda.shipping
                    ?.id ||
                info.id ||
                null;

            // =================================================
            // VALORES
            // =================================================

            const valorProduto =
                Number(
                    venda._valor_produto ??
                    venda.valor_produto ??
                    venda.valor_total ??
                    venda.total_amount ??
                    0
                );

            const valorFrete =
                Number(
                    venda._valor_frete ??
                    venda.valor_frete ??
                    0
                );

            const totalPago =
                Number(
                    venda._total_pago ??
                    venda.total_pago ??
                    venda.valor_total ??
                    venda.total_amount ??
                    valorProduto ??
                    0
                );

            // =================================================
            // ENVIO
            // =================================================

            const logisticType =
                venda._logistic_type ||
                venda.tipo_envio ||
                info.tipo ||
                venda.meio_envio ||
                (
                    isFull
                        ? 'FULL'
                        : 'N/I'
                );

            const shippingMode =
                venda._shipping_mode ||
                info.tipo ||
                logisticType ||
                '';

            // =================================================
            // NF-E
            // =================================================

            let temNfe =
                Boolean(
                    anterior
                        .tem_nfe
                );

            if (
                typeof venda
                    ._tem_nfe ===
                'boolean'
            ) {

                temNfe =
                    venda
                        ._tem_nfe;
            }

            if (
                venda.nfe_emitida ===
                true
            ) {

                temNfe =
                    true;
            }

            // FULL = NF-e automática do ML
            if (isFull) {

                temNfe =
                    true;
            }

            // =================================================
            // ESTOQUE
            //
            // REGRA CRÍTICA:
            //
            // estoque_baixado TRUE nunca volta a FALSE.
            // =================================================

            const estoqueJaBaixado =
                Boolean(
                    anterior
                        .estoque_baixado ||
                    venda
                        ._estoque_baixado
                );

            let estoqueStatus;
            let estoqueDetalhes;
            let estoqueBaixadoEm;

            if (
                estoqueJaBaixado
            ) {

                estoqueStatus =
                    anterior
                        .estoque_status ||
                    venda
                        ._estoque_status ||
                    'baixado';

                estoqueDetalhes =
                    anterior
                        .estoque_detalhes ||
                    venda
                        ._estoque_detalhes ||
                    [];

                estoqueBaixadoEm =
                    anterior
                        .estoque_baixado_em ||
                    venda
                        ._estoque_baixado_em ||
                    null;

            } else {

                estoqueStatus =
                    isFull
                        ? 'full'
                        : (
                            venda
                                ._estoque_status ||
                            anterior
                                .estoque_status ||
                            'nao_verificado'
                        );

                estoqueDetalhes =
                    venda
                        ._estoque_detalhes ||
                    anterior
                        .estoque_detalhes ||
                    [];

                estoqueBaixadoEm =
                    null;
            }

            const dataVenda =
                venda.data_venda ||
                venda.date_created ||
                venda.created_at ||
                null;

            // =================================================
            // JSON COMPLETO
            // =================================================

            const vendaJson = {

                ...venda,

                id:
                    idVenda,

                id_venda_ml:
                    idVenda,

                _data_envio:
                    dataEnvio,

                _prazo_envio:
                    prazoEnvio,

                _logistic_type:
                    logisticType,

                _shipping_mode:
                    shippingMode,

                _is_full:
                    isFull,

                _tem_nfe:
                    temNfe,

                _valor_produto:
                    valorProduto,

                _valor_frete:
                    valorFrete,

                _total_pago:
                    totalPago,

                _estoque_status:
                    estoqueStatus,

                _estoque_baixado:
                    estoqueJaBaixado,

                _estoque_baixado_em:
                    estoqueBaixadoEm,

                _estoque_detalhes:
                    estoqueDetalhes
            };

            registros.push({

                id_venda_ml:
                    idVenda,

                data_venda:
                    dataVenda,

                shipment_id:
                    shipmentId
                        ? String(
                            shipmentId
                        )
                        : null,

                data_envio:
                    dataEnvio ||
                    null,

                prazo_envio:
                    prazoEnvio ||
                    null,

                cliente:
                    cliente,

                sku:
                    sku,

                valor_produto:
                    valorProduto,

                valor_frete:
                    valorFrete,

                total_pago:
                    totalPago,

                logistic_type:
                    logisticType,

                shipping_mode:
                    shippingMode,

                is_full:
                    isFull,

                tem_nfe:
                    temNfe,

                estoque_baixado:
                    estoqueJaBaixado,

                estoque_status:
                    estoqueStatus,

                estoque_baixado_em:
                    estoqueBaixadoEm,

                estoque_detalhes:
                    estoqueDetalhes,

                venda_json:
                    vendaJson,

                atualizado_em:
                    new Date()
                        .toISOString()
            });
        }

        if (
            registros.length ===
            0
        ) {

            return;
        }

        const {
            error
        } =
            await window
                .supabaseClient
                .from(
                    'vendas_nfe_cache'
                )
                .upsert(
                    registros,
                    {
                        onConflict:
                            'id_venda_ml'
                    }
                );

        if (error) {
            throw error;
        }

        console.log(
            `✅ ${registros.length} venda(s) gravadas no cache`
        );

    } catch (
        error
    ) {

        console.error(
            '❌ Erro salvando cache NF-e:',
            error
        );
    }
}

function obterDadosCompletosVendaNFE(
    venda
) {

    if (!venda) {
        return {};
    }

    let dados =
        venda.dados_completos ||
        {};

    if (
        typeof dados ===
        'string'
    ) {

        try {

            dados =
                JSON.parse(
                    dados
                );

        } catch (error) {

            dados = {};
        }
    }

    if (
        !dados ||
        typeof dados !==
            'object'
    ) {

        return {};
    }

    return dados;
}

function obterPackIdNFE(
    venda
) {

    if (!venda) {
        return null;
    }

    const dados =
        obterDadosCompletosVendaNFE(
            venda
        );

    const vendaJson =
        parseObjetoSeguroNFE(
            venda.venda_json
        );

    const candidatos = [

        venda.pack_id,

        venda.pack?.id,

        venda._pack_id,

        dados.pack_id,

        dados.pack?.id,

        vendaJson.pack_id,

        vendaJson.pack?.id
    ];

    for (
        const candidato
        of candidatos
    ) {

        if (
            candidato !==
                null &&
            candidato !==
                undefined &&
            String(
                candidato
            ).trim()
        ) {

            return String(
                candidato
            ).trim();
        }
    }

    return null;
}

function obterShipmentIdNFE(
    venda
) {

    if (!venda) {
        return null;
    }

    const dados =
        obterDadosCompletosVendaNFE(
            venda
        );

    const info =
        parseObjetoSeguroNFE(
            venda.informacoes_envio
        );

    const candidatos = [

        venda.shipment_id,

        venda._shipment_id,

        venda.id_envio,

        venda.shipping?.id,

        info.id,

        info.shipment_id,

        dados.shipping?.id,

        dados.id_envio
    ];

    for (
        const candidato
        of candidatos
    ) {

        if (
            candidato !==
                null &&
            candidato !==
                undefined &&
            String(
                candidato
            ).trim()
        ) {

            return String(
                candidato
            ).trim();
        }
    }

    return null;
}

function obterChaveAgrupamentoNFE(
    venda
) {

    if (!venda) {
        return null;
    }

    const orderId =
        normalizarOrderIdML(
            venda.id_venda_ml ||
            venda.id
        );

    // =====================================================
    // 1. PACK_ID REAL
    // =====================================================

    const packId =
        obterPackIdNFE(
            venda
        );

    if (packId) {

        return (
            `PACK:${packId}`
        );
    }

    // =====================================================
    // 2. SHIPMENT
    //
    // Duas orders dentro do MESMO pacote de despacho
    // devem virar uma única linha.
    // =====================================================

    const shipmentId =
        obterShipmentIdNFE(
            venda
        );

    if (
        shipmentId &&
        !venda._is_full
    ) {

        return (
            `SHIPMENT:${shipmentId}`
        );
    }

    // =====================================================
    // 3. VENDA INDIVIDUAL
    // =====================================================

    return (
        `ORDER:${orderId}`
    );
}

function agruparVendasEmPacksNFE(
    vendas
) {

    if (
        !Array.isArray(
            vendas
        ) ||
        vendas.length ===
            0
    ) {

        return [];
    }

    const grupos =
        new Map();

    // =====================================================
    // AGRUPAR
    // =====================================================

    for (
        const venda
        of vendas
    ) {

        if (!venda) {
            continue;
        }

        const chave =
            obterChaveAgrupamentoNFE(
                venda
            );

        if (!chave) {
            continue;
        }

        if (
            !grupos.has(
                chave
            )
        ) {

            grupos.set(
                chave,
                []
            );
        }

        grupos
            .get(
                chave
            )
            .push(
                venda
            );
    }

    const resultado =
        [];

    // =====================================================
    // MONTAR GRUPOS
    // =====================================================

    for (
        const [
            chave,
            membrosBrutos
        ]
        of grupos.entries()
    ) {

        if (
            !Array.isArray(
                membrosBrutos
            ) ||
            membrosBrutos.length ===
                0
        ) {

            continue;
        }

        // =================================================
        // ELIMINAR POSSÍVEL REPETIÇÃO DA MESMA ORDER
        // =================================================

        const mapaOrders =
            new Map();

        membrosBrutos.forEach(
            venda => {

                const id =
                    normalizarOrderIdML(
                        venda.id_venda_ml ||
                        venda.id
                    );

                if (!id) {
                    return;
                }

                mapaOrders.set(
                    id,
                    venda
                );
            }
        );

        const membros =
            [
                ...mapaOrders.values()
            ];

        if (
            membros.length ===
            0
        ) {

            continue;
        }

        const principal =
            membros[0];

        const orderIds =
            membros
                .map(
                    venda =>
                        normalizarOrderIdML(
                            venda.id_venda_ml ||
                            venda.id
                        )
                )
                .filter(Boolean);

        const packId =
            membros
                .map(
                    obterPackIdNFE
                )
                .find(Boolean) ||
            null;

        const shipmentId =
            membros
                .map(
                    obterShipmentIdNFE
                )
                .find(Boolean) ||
            null;

        // =================================================
        // VENDA INDIVIDUAL
        // =================================================

        if (
            membros.length ===
            1
        ) {

            resultado.push({

                ...principal,

                _eh_pack:
                    false,

                _pack_key:
                    chave,

                _pack_id:
                    packId,

                _shipment_id:
                    shipmentId,

                _order_ids_pack:
                    orderIds,

                _membros_pack:
                    membros,

                _quantidade_orders_pack:
                    1
            });

            continue;
        }

        // =================================================
        // É PACK
        // =================================================

        console.log(
            '📦 PACK ENCONTRADO:',
            {
                chave,
                packId,
                shipmentId,
                orders:
                    orderIds
            }
        );

        // =================================================
        // ITENS DE TODAS AS ORDERS
        // =================================================

        const todosItens =
            [];

        for (
            const membro
            of membros
        ) {

            const orderIdMembro =
                normalizarOrderIdML(
                    membro.id_venda_ml ||
                    membro.id
                );

            if (
                Array.isArray(
                    membro.order_items
                ) &&
                membro.order_items.length >
                    0
            ) {

                membro.order_items
                    .forEach(
                        item => {

                            todosItens.push({

                                ...item,

                                _order_id:
                                    orderIdMembro
                            });
                        }
                    );

                continue;
            }

            // =============================================
            // FALLBACK DO CACHE vendas_ml
            // =============================================

            const sku =
                membro.sku ||
                membro.item_sku ||
                membro.codigo ||
                'SEM_SKU';

            const quantidade =
                Number(
                    membro.quantidade ||
                    membro.quantity ||
                    1
                );

            const valor =
                Number(
                    membro._valor_produto ??
                    membro.valor_produto ??
                    membro.valor_total ??
                    membro.total_amount ??
                    0
                );

            todosItens.push({

                _order_id:
                    orderIdMembro,

                quantity:
                    quantidade,

                unit_price:
                    quantidade >
                    0
                        ? valor /
                          quantidade
                        : valor,

                item: {

                    title:
                        membro.titulo ||
                        membro.title ||
                        'Produto',

                    seller_sku:
                        sku
                }
            });
        }

        // =================================================
        // SOMAR VALORES
        // =================================================

        const valorProduto =
            membros.reduce(
                (
                    total,
                    venda
                ) => {

                    return (
                        total +
                        Number(
                            venda._valor_produto ??
                            venda.valor_produto ??
                            venda.valor_total ??
                            venda.total_amount ??
                            0
                        )
                    );
                },
                0
            );

        const valorFrete =
            membros.reduce(
                (
                    total,
                    venda
                ) => {

                    return (
                        total +
                        Number(
                            venda._valor_frete ??
                            venda.valor_frete ??
                            0
                        )
                    );
                },
                0
            );

        const totalPago =
            membros.reduce(
                (
                    total,
                    venda
                ) => {

                    return (
                        total +
                        Number(
                            venda._total_pago ??
                            venda.total_pago ??
                            venda.valor_total ??
                            venda.total_amount ??
                            venda._valor_produto ??
                            0
                        )
                    );
                },
                0
            );

        // =================================================
        // NF-E
        // =================================================

        const temNfe =
            membros.some(
                venda =>
                    venda._tem_nfe ===
                    true
            );

        // =================================================
        // ESTOQUE
        // =================================================

        const naoFull =
            membros.filter(
                venda =>
                    !venda._is_full
            );

        const estoqueBaixado =
            naoFull.length >
                0 &&
            naoFull.every(
                venda =>
                    venda._estoque_baixado ===
                    true
            );

        let estoqueStatus =
            'nao_verificado';

        if (
            estoqueBaixado
        ) {

            estoqueStatus =
                naoFull.some(
                    venda =>
                        venda._estoque_status ===
                        'baixado_sync_pendente'
                )
                    ? 'baixado_sync_pendente'
                    : 'baixado';

        } else if (
            naoFull.some(
                venda =>
                    venda._estoque_status ===
                    'sem_cadastro'
            )
        ) {

            estoqueStatus =
                'sem_cadastro';

        } else if (
            naoFull.length >
                0 &&
            naoFull.every(
                venda =>
                    venda._estoque_status ===
                    'disponivel'
            )
        ) {

            estoqueStatus =
                'disponivel';

        } else if (
            naoFull.some(
                venda =>
                    venda._estoque_status ===
                    'processando'
            )
        ) {

            estoqueStatus =
                'processando';

        } else if (
            naoFull.some(
                venda =>
                    venda._estoque_status ===
                    'erro'
            )
        ) {

            estoqueStatus =
                'erro';
        }

        // =================================================
        // DETALHES DE ESTOQUE
        // =================================================

        let detalhesEstoque =
            [];

        naoFull.forEach(
            venda => {

                if (
                    Array.isArray(
                        venda._estoque_detalhes
                    )
                ) {

                    detalhesEstoque.push(
                        ...venda._estoque_detalhes
                    );
                }
            }
        );

        if (
            typeof consolidarItensEstoqueNFE ===
            'function'
        ) {

            detalhesEstoque =
                consolidarItensEstoqueNFE(
                    detalhesEstoque
                );
        }

        // =================================================
        // DATA DE ENVIO
        // =================================================

        const datasEnvio =
            membros
                .map(
                    venda =>
                        venda._data_envio
                )
                .filter(Boolean)
                .sort();

        const dataEnvio =
            datasEnvio[0] ||
            principal._data_envio ||
            null;

        const prazos =
            membros
                .map(
                    venda =>
                        venda._prazo_envio
                )
                .filter(Boolean)
                .sort(
                    (
                        a,
                        b
                    ) => {

                        return (
                            new Date(a) -
                            new Date(b)
                        );
                    }
                );

        const prazoEnvio =
            prazos[0] ||
            principal._prazo_envio ||
            null;

        // =================================================
        // MODALIDADE
        // =================================================

        const logisticType =
            membros
                .map(
                    venda =>
                        modalidadeEnvioValidaNFE(
                            venda._logistic_type
                        )
                )
                .find(Boolean) ||
            '';

        const shippingMode =
            membros
                .map(
                    venda =>
                        modalidadeEnvioValidaNFE(
                            venda._shipping_mode
                        )
                )
                .find(Boolean) ||
            '';

        // =================================================
        // CLIENTE
        // =================================================

        const cliente =
            principal.cliente ||

            principal.buyer
                ?.nickname ||

            'N/I';

        // =================================================
        // PACK FINAL
        // =================================================

        resultado.push({

            ...principal,

            id:
                orderIds[0],

            id_venda_ml:
                orderIds[0],

            cliente,

            order_items:
                todosItens,

            total_amount:
                totalPago,

            shipment_id:
                shipmentId,

            id_envio:
                shipmentId,

            _eh_pack:
                true,

            _pack_key:
                chave,

            _pack_id:
                packId,

            _shipment_id:
                shipmentId,

            _order_ids_pack:
                orderIds,

            _membros_pack:
                membros,

            _quantidade_orders_pack:
                orderIds.length,

            _data_envio:
                dataEnvio,

            _prazo_envio:
                prazoEnvio,

            _logistic_type:
                logisticType,

            _shipping_mode:
                shippingMode,

            _is_full:
                false,

            _tem_nfe:
                temNfe,

            _valor_produto:
                valorProduto,

            _valor_frete:
                valorFrete,

            _total_pago:
                totalPago,

            _estoque_baixado:
                estoqueBaixado,

            _estoque_status:
                estoqueStatus,

            _estoque_detalhes:
                detalhesEstoque
        });
    }

    console.log(
        `📦 Agrupamento: ${vendas.length} orders → ${resultado.length} linha(s)`
    );

    return resultado;
}

function consolidarItensEstoqueNFE(
    itens
) {

    const mapa =
        new Map();

    for (
        const item
        of itens || []
    ) {

        if (
            !item ||
            !item.sku
        ) {

            continue;
        }

        const sku =
            String(
                item.sku
            ).trim();

        if (!sku) {

            continue;
        }

        const quantidade =
            Number(
                item.quantidade_venda ||
                0
            );

        if (
            mapa.has(
                sku
            )
        ) {

            const existente =
                mapa.get(
                    sku
                );

            existente.quantidade_venda =
                Number(
                    existente
                        .quantidade_venda ||
                    0
                ) +
                quantidade;

            // Guardar origens para facilitar diagnóstico
            if (
                item.sku_original &&
                !existente.skus_origem
                    .includes(
                        item.sku_original
                    )
            ) {

                existente
                    .skus_origem
                    .push(
                        item.sku_original
                    );
            }

        } else {

            mapa.set(
                sku,
                {

                    ...item,

                    sku,

                    quantidade_venda:
                        quantidade,

                    skus_origem:
                        item.sku_original
                            ? [
                                item
                                    .sku_original
                            ]
                            : []
                }
            );
        }
    }

    return [
        ...mapa.values()
    ];
}

function montarItensEstoqueVendaNFE(
    venda
) {

    const itens =
        [];

    if (!venda) {

        return itens;
    }

    // =====================================================
    // 1. PACK
    //
    // Cada membro é processado separadamente.
    // =====================================================

    if (
        venda._eh_pack &&
        Array.isArray(
            venda._membros_pack
        ) &&
        venda._membros_pack.length >
            0
    ) {

        for (
            const membro
            of venda._membros_pack
        ) {

            const itensMembro =
                montarItensEstoqueVendaNFE({

                    ...membro,

                    // Evitar entrar novamente neste bloco
                    _eh_pack:
                        false,

                    _membros_pack:
                        null
                });

            itens.push(
                ...itensMembro
            );
        }

        return consolidarItensEstoqueNFE(
            itens
        );
    }

    // =====================================================
    // 2. KIT JÁ CONFIGURADO NO SISTEMA
    // =====================================================

    if (
        venda.eh_kit &&
        Array.isArray(
            venda.skus_kit
        ) &&
        venda.skus_kit.length >
            0
    ) {

        const quantidadeVenda =
            Number(
                venda.quantidade ||
                venda.quantity ||
                1
            );

        for (
            const itemKit
            of venda.skus_kit
        ) {

            const quantidadeKit =
                Number(
                    itemKit.estoque ||
                    itemKit.quantidade ||
                    1
                );

            const componentes =
                decomporSkuCompostoNFE(

                    itemKit.sku,

                    quantidadeVenda *
                    quantidadeKit
                );

            itens.push(
                ...componentes
            );
        }

        return consolidarItensEstoqueNFE(
            itens
        );
    }

    // =====================================================
    // 3. ORDER_ITEMS
    //
    // Prioridade sobre venda.sku porque uma order pode
    // conter mais de um item.
    // =====================================================

    if (
        Array.isArray(
            venda.order_items
        ) &&
        venda.order_items.length >
            0
    ) {

        for (
            const item
            of venda.order_items
        ) {

            const skuOriginal =
                item.item
                    ?.seller_sku ||
                item.seller_sku ||
                '';

            const quantidadeVenda =
                Number(
                    item.quantity ||
                    1
                );

            if (!skuOriginal) {

                itens.push({

                    sku:
                        'SEM_SKU',

                    sku_original:
                        'SEM_SKU',

                    quantidade_venda:
                        quantidadeVenda
                });

                continue;
            }

            // =============================================
            // AQUI ENTRA O SKU COM "."
            // =============================================

            const componentes =
                decomporSkuCompostoNFE(
                    skuOriginal,
                    quantidadeVenda
                );

            itens.push(
                ...componentes
            );
        }

        return consolidarItensEstoqueNFE(
            itens
        );
    }

    // =====================================================
    // 4. FORMATO DA TABELA vendas_ml
    // =====================================================

    if (
        venda.sku
    ) {

        const quantidadeVenda =
            Number(
                venda.quantidade ||
                venda.quantity ||
                1
            );

        const componentes =
            decomporSkuCompostoNFE(
                venda.sku,
                quantidadeVenda
            );

        itens.push(
            ...componentes
        );
    }

    return consolidarItensEstoqueNFE(
        itens
    );
}

function modalidadeEnvioValidaNFE(valor) {

    if (
        valor === null ||
        valor === undefined
    ) {
        return '';
    }

    const texto =
        String(valor).trim();

    if (!texto) {
        return '';
    }

    const normalizado =
        texto
            .toUpperCase()
            .trim();

    const invalidos = [
        'N/I',
        'NI',
        'N/A',
        'NA',
        'NULL',
        'UNDEFINED',
        'NÃO ESPECIFICADO',
        'NAO ESPECIFICADO',
        'NÃO INFORMADO',
        'NAO INFORMADO',
        '-'
    ];

    if (
        invalidos.includes(
            normalizado
        )
    ) {
        return '';
    }

    return texto;
}

function parseObjetoSeguroNFE(valor) {

    if (!valor) {
        return {};
    }

    if (
        typeof valor ===
        'object'
    ) {
        return valor;
    }

    if (
        typeof valor ===
        'string'
    ) {

        try {

            const parsed =
                JSON.parse(valor);

            if (
                parsed &&
                typeof parsed ===
                    'object'
            ) {
                return parsed;
            }

        } catch (error) {

            return {};
        }
    }

    return {};
}

function extrairModalidadeEnvioLocalNFE(
    venda
) {

    if (!venda) {

        return {
            logisticType: '',
            shippingMode: ''
        };
    }

    const infoEnvio =
        parseObjetoSeguroNFE(
            venda.informacoes_envio
        );

    const dadosCompletos =
        parseObjetoSeguroNFE(
            venda.dados_completos
        );

    const vendaJson =
        parseObjetoSeguroNFE(
            venda.venda_json
        );

    // =====================================================
    // LOGISTIC TYPE
    // =====================================================

    const candidatosLogistic = [

        venda._logistic_type,

        venda.logistic_type,

        venda.shipping
            ?.logistic_type,

        infoEnvio
            ?.logistic_type,

        infoEnvio
            ?.sla
            ?.logistic_type,

        dadosCompletos
            ?.shipping
            ?.logistic_type,

        vendaJson
            ?._logistic_type,

        vendaJson
            ?.shipping
            ?.logistic_type,

        venda.tipo_envio,

        venda.meio_envio,

        infoEnvio.tipo
    ];

    let logisticType = '';

    for (
        const candidato
        of candidatosLogistic
    ) {

        const valor =
            modalidadeEnvioValidaNFE(
                candidato
            );

        if (valor) {

            logisticType =
                valor;

            break;
        }
    }

    // =====================================================
    // SHIPPING MODE
    // =====================================================

    const candidatosMode = [

        venda._shipping_mode,

        venda.shipping_mode,

        venda.shipping
            ?.shipping_mode,

        venda.shipping
            ?.mode,

        infoEnvio
            ?.shipping_mode,

        infoEnvio
            ?.mode,

        infoEnvio
            ?.sla
            ?.shipping_mode,

        dadosCompletos
            ?.shipping
            ?.shipping_mode,

        dadosCompletos
            ?.shipping
            ?.mode,

        vendaJson
            ?._shipping_mode,

        vendaJson
            ?.shipping
            ?.shipping_mode
    ];

    let shippingMode = '';

    for (
        const candidato
        of candidatosMode
    ) {

        const valor =
            modalidadeEnvioValidaNFE(
                candidato
            );

        if (valor) {

            shippingMode =
                valor;

            break;
        }
    }

    return {
        logisticType,
        shippingMode
    };
}

async function carregarVendasCacheNFE(
    dataEnvio = null
) {

    try {

        const {
            data,
            error
        } =
            await window
                .supabaseClient
                .from(
                    'vendas_nfe_cache'
                )
                .select('*')
                .order(
                    'data_venda',
                    {
                        ascending:
                            false
                    }
                )
                .limit(
                    3000
                );

        if (error) {

            throw error;
        }

        const registros =
            Array.isArray(
                data
            )
                ? data
                : [];

        // =====================================================
        // NORMALIZAR ORDERS
        // =====================================================

        const vendasNormalizadas =
            registros.map(
                registro => {

                    let venda =
                        registro.venda_json ||
                        {};

                    if (
                        typeof venda ===
                        'string'
                    ) {

                        try {

                            venda =
                                JSON.parse(
                                    venda
                                );

                        } catch (error) {

                            venda = {};
                        }
                    }

                    const idVenda =
                        normalizarOrderIdML(
                            registro.id_venda_ml
                        );

                    // =========================================
                    // MODALIDADE
                    // =========================================

                    const local =
                        extrairModalidadeEnvioLocalNFE(
                            venda
                        );

                    const logisticType =
                        modalidadeEnvioValidaNFE(
                            registro.logistic_type
                        ) ||

                        modalidadeEnvioValidaNFE(
                            local.logisticType
                        ) ||

                        '';

                    const shippingMode =
                        modalidadeEnvioValidaNFE(
                            registro.shipping_mode
                        ) ||

                        modalidadeEnvioValidaNFE(
                            local.shippingMode
                        ) ||

                        '';

                    // =========================================
                    // SHIPMENT
                    // =========================================

                    const shipmentId =
                        registro.shipment_id ||

                        venda.shipment_id ||

                        venda.id_envio ||

                        venda.shipping
                            ?.id ||

                        obterShipmentIdNFE(
                            venda
                        ) ||

                        null;

                    // =========================================
                    // ORDER ITEMS
                    // =========================================

                    let orderItems =
                        Array.isArray(
                            venda.order_items
                        )
                            ? venda.order_items
                            : [];

                    if (
                        orderItems.length ===
                            0 &&
                        (
                            registro.sku ||
                            venda.sku
                        )
                    ) {

                        const quantidade =
                            Number(
                                venda.quantidade ||
                                venda.quantity ||
                                1
                            );

                        const valorProduto =
                            Number(
                                registro.valor_produto ||
                                venda._valor_produto ||
                                venda.valor_total ||
                                0
                            );

                        orderItems = [
                            {

                                quantity:
                                    quantidade,

                                unit_price:
                                    quantidade >
                                    0
                                        ? valorProduto /
                                          quantidade
                                        : valorProduto,

                                item: {

                                    title:
                                        venda.titulo ||
                                        venda.title ||
                                        'Produto',

                                    seller_sku:
                                        registro.sku ||
                                        venda.sku ||
                                        'SEM_SKU'
                                }
                            }
                        ];
                    }

                    return {

                        ...venda,

                        id:
                            idVenda,

                        id_venda_ml:
                            idVenda,

                        shipment_id:
                            shipmentId,

                        id_envio:
                            shipmentId,

                        cliente:
                            registro.cliente ||
                            venda.cliente,

                        date_created:
                            registro.data_venda ||
                            venda.date_created,

                        data_venda:
                            registro.data_venda ||
                            venda.data_venda ||
                            venda.date_created,

                        buyer:
                            venda.buyer || {
                                nickname:
                                    registro.cliente ||
                                    venda.cliente ||
                                    'N/I'
                            },

                        order_items:
                            orderItems,

                        shipping: {

                            ...(venda.shipping || {}),

                            id:
                                shipmentId,

                            logistic_type:
                                logisticType,

                            shipping_mode:
                                shippingMode
                        },

                        // =========================================
                        // ENVIO
                        // =========================================

                        _data_envio:
                            registro.data_envio ||
                            venda._data_envio ||
                            null,

                        _prazo_envio:
                            registro.prazo_envio ||
                            venda._prazo_envio ||
                            null,

                        _shipment_id:
                            shipmentId,

                        _logistic_type:
                            logisticType,

                        _shipping_mode:
                            shippingMode,

                        _is_full:
                            Boolean(
                                registro.is_full ||
                                venda._is_full
                            ),

                        // =========================================
                        // VALORES
                        // =========================================

                        _valor_produto:
                            Number(
                                registro.valor_produto ??
                                venda._valor_produto ??
                                venda.valor_total ??
                                0
                            ),

                        _valor_frete:
                            Number(
                                registro.valor_frete ??
                                venda._valor_frete ??
                                0
                            ),

                        _total_pago:
                            Number(
                                registro.total_pago ??
                                venda._total_pago ??
                                venda.valor_total ??
                                0
                            ),

                        // =========================================
                        // NF-E
                        // =========================================

                        _tem_nfe:
                            Boolean(
                                registro.tem_nfe ||
                                venda._tem_nfe
                            ),

                        // =========================================
                        // ESTOQUE
                        // =========================================

                        _estoque_status:
                            registro.estoque_status ||
                            venda._estoque_status ||
                            'nao_verificado',

                        _estoque_baixado:
                            Boolean(
                                registro.estoque_baixado ||
                                venda._estoque_baixado
                            ),

                        _estoque_baixado_em:
                            registro.estoque_baixado_em ||
                            venda._estoque_baixado_em ||
                            null,

                        _estoque_detalhes:
                            Array.isArray(
                                registro.estoque_detalhes
                            )
                                ? registro.estoque_detalhes
                                : (
                                    venda._estoque_detalhes ||
                                    []
                                )
                    };
                }
            );

        // =====================================================
        // AQUI ESTÁ A CORREÇÃO PRINCIPAL
        //
        // AGRUPAR ANTES DE FILTRAR/RENDERIZAR
        // =====================================================

        let vendas =
            agruparVendasEmPacksNFE(
                vendasNormalizadas
            );

        // =====================================================
        // FILTRO DA DATA
        // =====================================================

        if (dataEnvio) {

            vendas =
                vendas.filter(
                    venda => {

                        if (
                            venda._is_full
                        ) {

                            const dataVenda =
                                normalizarDataEnvioML(
                                    venda.data_venda ||
                                    venda.date_created
                                );

                            return (
                                dataVenda ===
                                dataEnvio
                            );
                        }

                        return (
                            normalizarDataEnvioML(
                                venda._data_envio
                            ) ===
                            dataEnvio
                        );
                    }
                );
        }

        // =====================================================
        // ORDENAR
        // =====================================================

        vendas.sort(
            (
                a,
                b
            ) => {

                const prazoA =
                    a._prazo_envio
                        ? new Date(
                            a._prazo_envio
                        ).getTime()
                        : Number.MAX_SAFE_INTEGER;

                const prazoB =
                    b._prazo_envio
                        ? new Date(
                            b._prazo_envio
                        ).getTime()
                        : Number.MAX_SAFE_INTEGER;

                if (
                    prazoA !==
                    prazoB
                ) {

                    return (
                        prazoA -
                        prazoB
                    );
                }

                return String(
                    b.id_venda_ml ||
                    ''
                ).localeCompare(
                    String(
                        a.id_venda_ml ||
                        ''
                    )
                );
            }
        );

        console.log(
            `⚡ Cache NF-e: ${registros.length} orders → ${vendas.length} venda(s)/pack(s)`
        );

        return vendas;

    } catch (error) {

        console.error(
            '❌ Erro ao carregar cache NF-e:',
            error
        );

        return [];
    }
}

async function processarListaVendasNFE(
    lista,
    idsComNFE
) {

    const processadas =
        [];

    const TAMANHO_LOTE =
        8;

    for (
        let i = 0;
        i < lista.length;
        i += TAMANHO_LOTE
    ) {

        const lote =
            lista.slice(
                i,
                i +
                    TAMANHO_LOTE
            );

        const resultados =
            await Promise.all(

                lote.map(
                    venda =>
                        processarVendaParaNFE(
                            venda,
                            idsComNFE
                        )
                )
            );

        processadas.push(
            ...resultados.filter(
                Boolean
            )
        );
    }

    return processadas;
}

async function processarVendaParaNFE(
    venda,
    idsComNFE
) {

    const idVenda =
        normalizarOrderIdML(
            venda.id_venda_ml ||
            venda.id
        );

    if (!idVenda) {
        return null;
    }

    const isFull =
        detectarVendaFullNFE(
            venda
        );

    const info =
        parseInformacoesEnvioNFE(
            venda
        );

    const tipoEnvio =
        venda.tipo_envio ||
        venda._logistic_type ||
        info.tipo ||
        (
            isFull
                ? 'FULL'
                : 'N/I'
        );

    // =====================================================
    // FULL
    // =====================================================

    if (isFull) {

        const valor =
            Number(
                venda.valor_total ??
                venda.total_amount ??
                venda._valor_produto ??
                0
            );

        return {

            ...venda,

            id:
                idVenda,

            id_venda_ml:
                idVenda,

            _logistic_type:
                tipoEnvio ||
                'FULL',

            _shipping_mode:
                info.tipo ||
                tipoEnvio ||
                'FULL',

            _is_full:
                true,

            // FULL = NF-e automática ML
            _tem_nfe:
                true,

            _data_envio:
                null,

            _prazo_envio:
                null,

            _valor_produto:
                valor,

            _valor_frete:
                0,

            _total_pago:
                valor,

            _estoque_status:
                'full',

            _estoque_detalhes:
                []
        };
    }

    // =====================================================
    // VALOR
    // =====================================================

    let valorProduto =
        Number(
            venda.valor_total ??
            venda.total_amount ??
            venda._valor_produto ??
            0
        );

    let valorFrete =
        Number(
            venda._valor_frete ??
            0
        );

    let totalPago =
        valorProduto;

    try {

        // =================================================
        // CONTINUA USANDO A FUNÇÃO DO MERCADO PAGO
        //
        // portanto mantém:
        //
        // Mercado Pago
        // x
        // total_amount
        //
        // e usa o menor conforme sua função existente.
        // =================================================

        const pagamento =
            await buscarValorExatoPagamento(
                idVenda
            );

        if (pagamento) {

            valorProduto =
                Number(
                    pagamento
                        .valor_produto ??
                    valorProduto
                );

            valorFrete =
                Number(
                    pagamento
                        .valor_frete ??
                    0
                );

            totalPago =
                Number(
                    pagamento
                        .total_pago ??
                    valorProduto
                );
        }

    } catch (
        error
    ) {

        console.warn(
            `⚠️ Pagamento da venda ${idVenda}:`,
            error
        );
    }

    // =====================================================
    // ESTOQUE
    // =====================================================

    let estoque = {

        status:
            'nao_verificado',

        produtos:
            []
    };

    try {

        estoque =
            await verificarEstoqueVenda(
                venda
            );

    } catch (
        error
    ) {

        console.warn(
            `⚠️ Estoque da venda ${idVenda}:`,
            error
        );
    }

    // =====================================================
    // PRODUTO
    // =====================================================

    const sku =
        venda.sku ||
        venda.codigo ||
        venda.item_sku ||
        venda.order_items
            ?.[0]
            ?.item
            ?.seller_sku ||
        'SEM_SKU';

    const quantidade =
        Number(
            venda.quantidade ||
            venda.quantity ||
            venda.order_items
                ?.[0]
                ?.quantity ||
            1
        );

    const titulo =
        venda.titulo ||
        venda.title ||
        venda.order_items
            ?.[0]
            ?.item
            ?.title ||
        'Produto';

    const cliente =
        venda.cliente ||
        venda.buyer
            ?.nickname ||
        'N/I';

    return {

        ...venda,

        id:
            idVenda,

        id_venda_ml:
            idVenda,

        buyer:
            venda.buyer ||
            {
                nickname:
                    cliente
            },

        order_items:
            (
                Array.isArray(
                    venda.order_items
                ) &&
                venda.order_items
                    .length
            )
                ? venda.order_items
                : [
                    {
                        quantity:
                            quantidade,

                        unit_price:
                            quantidade >
                            0
                                ? valorProduto /
                                    quantidade
                                : valorProduto,

                        item: {
                            title:
                                titulo,
                            seller_sku:
                                sku
                        }
                    }
                ],

        shipping:
            venda.shipping ||
            {
                id:
                    venda.id_envio ||
                    info.id ||
                    null
            },

        total_amount:
            totalPago,

        _data_envio:
            extrairDataEnvioML(
                venda
            ),

        _prazo_envio:
            extrairPrazoEnvioCompletoML(
                venda
            ),

        _logistic_type:
            tipoEnvio,

        _shipping_mode:
            info.tipo ||
            tipoEnvio,

        _is_full:
            false,

        _tem_nfe:
            idsComNFE.has(
                idVenda
            ) ||
            venda.nfe_emitida ===
                true,

        _valor_produto:
            valorProduto,

        _valor_frete:
            valorFrete,

        _total_pago:
            totalPago,

        _estoque_status:
            estoque.status,

        _estoque_detalhes:
            estoque.produtos
    };
}

async function sincronizarVendasPendentesML(
    dataEnvio = null,
    atualizacaoRapida = false
) {

    console.log(
        '🔄 Sincronizando vendas NF-e',
        {
            dataEnvio,
            atualizacaoRapida
        }
    );

    // =====================================================
    // TRÊS FONTES AO MESMO TEMPO
    // =====================================================

    const [
        idsComNFE,
        vendasBanco,
        vendasAtualizadas
    ] =
        await Promise.all([

            carregarIdsNFEAtivas(),

            carregarVendasFonteBancoML(),

            // =================================================
            // É ISTO QUE ENCONTRA VENDA ANTIGA ALTERADA HOJE
            // =================================================

            buscarVendasAtualizadasRecentementeNFE(

                dataEnvio,

                atualizacaoRapida
                    ? 4
                    : 15,

                atualizacaoRapida
                    ? 150
                    : 300
            )
        ]);

    // =====================================================
    // BANCO + ORDERS ATUALIZADAS
    // =====================================================

    const vendasBancoAtualizadas =
        mesclarVendasFonteNFE(
            vendasBanco,
            vendasAtualizadas
        );

    // =====================================================
    // PREPARAR CANDIDATAS
    // =====================================================

    const prepararCandidatas =
        fonte => {

            let lista =
                fonte.map(
                    venda => {

                        const idVenda =
                            normalizarOrderIdML(
                                venda.id_venda_ml ||
                                venda.id
                            );

                        const isFull =
                            detectarVendaFullNFE(
                                venda
                            );

                        return {

                            ...venda,

                            id:
                                idVenda,

                            id_venda_ml:
                                idVenda,

                            _is_full:
                                isFull,

                            _data_envio:
                                isFull
                                    ? null
                                    : extrairDataEnvioML(
                                        venda
                                    ),

                            _prazo_envio:
                                isFull
                                    ? null
                                    : extrairPrazoEnvioCompletoML(
                                        venda
                                    ),

                            _tem_nfe:
                                isFull
                                    ? true
                                    : (
                                        idsComNFE.has(
                                            idVenda
                                        ) ||
                                        venda.nfe_emitida ===
                                            true
                                    )
                        };
                    }
                );

            if (
                dataEnvio
            ) {

                lista =
                    lista.filter(
                        venda =>
                            vendaPertenceDataSelecionadaNFE(
                                venda,
                                dataEnvio
                            )
                    );
            }

            return lista;
        };

    // =====================================================
    // PRIMEIRO BANCO + ORDERS ATUALIZADAS
    // =====================================================

    let candidatasBanco =
        prepararCandidatas(
            vendasBancoAtualizadas
        );

    if (
        !dataEnvio
    ) {

        candidatasBanco =
            candidatasBanco.slice(
                0,
                atualizacaoRapida
                    ? 250
                    : 500
            );
    }

    console.log(
        `📅 ${candidatasBanco.length} venda(s) candidata(s) para ${dataEnvio || 'todas as datas'}`
    );

    const processadasBanco =
        await processarListaVendasNFE(
            candidatasBanco,
            idsComNFE
        );

    if (
        processadasBanco.length
    ) {

        await salvarVendasCacheNFE(
            processadasBanco
        );
    }

    // =====================================================
    // JÁ ATUALIZAR TELA
    // =====================================================

    if (
        dataEnvio ||
        window._nfeFiltroTodas
    ) {

        const tela =
            await carregarVendasCacheNFE(
                dataEnvio ||
                null
            );

        renderizarVendasNFETabela(
            tela
        );
    }

    const idsJaProcessados =
        new Set(

            processadasBanco
                .map(
                    venda =>
                        normalizarOrderIdML(
                            venda.id_venda_ml ||
                            venda.id
                        )
                )
                .filter(Boolean)
        );

    // =====================================================
    // BUSCAR VENDA NOVA
    //
    // ainda mantemos buscarVendasML()
    // porque ela traz toda a estrutura detalhada
    // usada na aba Vendas ML.
    // =====================================================

    let vendasRecentes =
        [];

    try {

        if (
            typeof window
                .buscarVendasML ===
            'function'
        ) {

            const limite =
                atualizacaoRapida
                    ? 50
                    : 200;

            const resultado =
                await window
                    .buscarVendasML(
                        limite
                    );

            if (
                resultado?.success &&
                Array.isArray(
                    resultado.vendas
                )
            ) {

                vendasRecentes =
                    resultado.vendas;
            }
        }

    } catch (
        error
    ) {

        console.warn(
            '⚠️ buscarVendasML falhou:',
            error
        );
    }

    // =====================================================
    // MESCLAR TUDO
    // =====================================================

    const mescladas =
        mesclarVendasFonteNFE(
            vendasBancoAtualizadas,
            vendasRecentes
        );

    let candidatasRecentes =
        prepararCandidatas(
            mescladas
        )
            .filter(
                venda => {

                    const id =
                        normalizarOrderIdML(
                            venda.id_venda_ml ||
                            venda.id
                        );

                    return (
                        !idsJaProcessados
                            .has(id)
                    );
                }
            );

    if (
        !dataEnvio
    ) {

        candidatasRecentes =
            candidatasRecentes.slice(
                0,
                atualizacaoRapida
                    ? 250
                    : 500
            );
    }

    const processadasRecentes =
        await processarListaVendasNFE(
            candidatasRecentes,
            idsComNFE
        );

    if (
        processadasRecentes
            .length
    ) {

        await salvarVendasCacheNFE(
            processadasRecentes
        );
    }

    // =====================================================
    // TELA FINAL
    // =====================================================

    if (
        dataEnvio ||
        window._nfeFiltroTodas
    ) {

        const telaFinal =
            await carregarVendasCacheNFE(
                dataEnvio ||
                null
            );

        renderizarVendasNFETabela(
            telaFinal
        );
    }

    const total =
        processadasBanco
            .length +
        processadasRecentes
            .length;

    console.log(
        `✅ Sincronização NF-e concluída: ${total} venda(s)`
    );

    return [
        ...processadasBanco,
        ...processadasRecentes
    ];
}

async function carregarVendasPendentes(
    forcarAtualizacao = false,
    dataForcada = null
) {

    const tbody =
        document.getElementById(
            'vendasPendentesBody'
        );

    if (!tbody) {
        return;
    }

    inicializarFiltroDataNFE();

    const input =
        document.getElementById(
            'filtroDataEnvioNFE'
        );

    const dataSelecionada =
        dataForcada ||
        input?.value ||
        obterDataHojeLocal();

    // =====================================================
    // 1. CACHE PRIMEIRO
    // =====================================================

    const vendasCache =
        window._nfeFiltroTodas
            ? await carregarVendasCacheNFE(
                null
            )
            : await carregarVendasCacheNFE(
                dataSelecionada
            );

    renderizarVendasNFETabela(
        vendasCache
    );

    // =====================================================
    // EVITAR DUPLICIDADE
    // =====================================================

    if (
        window
            ._sincronizacaoVendasNFEEmAndamento
    ) {

        return;
    }

    const chaveSync =
        `nfe_sync_${dataSelecionada}`;

    const ultimaSync =
        Number(
            localStorage.getItem(
                chaveSync
            ) ||
            0
        );

    const precisaAtualizar =
        forcarAtualizacao ||

        vendasCache.length ===
            0 ||

        (
            Date.now() -
            ultimaSync >
            2 *
            60 *
            1000
        );

    if (
        precisaAtualizar
    ) {

        window
            ._sincronizacaoVendasNFEEmAndamento =
            true;

        const processo =
            sincronizarVendasPendentesML(
                dataSelecionada,
                true
            )

                .then(
                    () => {

                        localStorage.setItem(
                            chaveSync,
                            String(
                                Date.now()
                            )
                        );
                    }
                )

                .catch(
                    error => {

                        console.error(
                            '❌ Atualização rápida:',
                            error
                        );
                    }
                )

                .finally(
                    () => {

                        window
                            ._sincronizacaoVendasNFEEmAndamento =
                            false;
                    }
                );

        if (
            forcarAtualizacao
        ) {

            await processo;
        }
    }

    // =====================================================
    // SINCRONIZAÇÃO COMPLETA
    // =====================================================

    const ultimaCompleta =
        Number(
            localStorage.getItem(
                'nfe_sync_completa'
            ) ||
            0
        );

    if (
        Date.now() -
            ultimaCompleta >
            6 *
            60 *
            60 *
            1000 &&

        !window
            ._nfeSyncCompleta
    ) {

        window
            ._nfeSyncCompleta =
            true;

        setTimeout(

            async () => {

                try {

                    await sincronizarVendasPendentesML(
                        null,
                        false
                    );

                    localStorage.setItem(
                        'nfe_sync_completa',
                        String(
                            Date.now()
                        )
                    );

                } catch (
                    error
                ) {

                    console.warn(
                        '⚠️ Sincronização completa:',
                        error
                    );

                } finally {

                    window
                        ._nfeSyncCompleta =
                        false;
                }
            },

            1500
        );
    }
}

async function sincronizarEstoqueComML(
    vendaId
) {

    try {

        console.log(
            `🔄 Sincronizando estoque com ML para venda ${vendaId}`
        );

        let token =
            localStorage.getItem(
                'ml_access_token'
            );

        if (
            !token &&
            typeof window
                .getValidToken ===
            'function'
        ) {

            const tokenData =
                await window
                    .getValidToken();

            token =
                tokenData
                    ?.access_token;
        }

        if (!token) {

            console.warn(
                '⚠️ Token ML não disponível'
            );

            return false;
        }

        const itensParaSincronizar =
            [];

        // =====================================================
        // 1. CACHE NOVO
        // =====================================================

        try {

            const {
                data:
                    cache,

                error
            } =
                await window
                    .supabaseClient
                    .from(
                        'vendas_nfe_cache'
                    )
                    .select(
                        'estoque_detalhes'
                    )
                    .eq(
                        'id_venda_ml',
                        String(
                            vendaId
                        )
                    )
                    .maybeSingle();

            if (
                !error &&
                Array.isArray(
                    cache
                        ?.estoque_detalhes
                )
            ) {

                cache
                    .estoque_detalhes
                    .forEach(
                        item => {

                            if (
                                item.encontrado &&
                                item.sku
                            ) {

                                itensParaSincronizar.push({

                                    sku:
                                        item.sku,

                                    quantidade:
                                        item.quantidade_venda ||
                                        1
                                });
                            }
                        }
                    );
            }

        } catch (cacheError) {

            console.warn(
                '⚠️ Erro ao ler cache:',
                cacheError
            );
        }

        // =====================================================
        // 2. FALLBACK vendas_ml
        // =====================================================

        if (
            itensParaSincronizar.length ===
            0
        ) {

            try {

                const {
                    data:
                        venda
                } =
                    await window
                        .supabaseClient
                        .from(
                            'vendas_ml'
                        )
                        .select(
                            'sku, quantidade, skus_kit, eh_kit'
                        )
                        .eq(
                            'id_venda_ml',
                            String(
                                vendaId
                            )
                        )
                        .maybeSingle();

                if (venda) {

                    if (
                        venda.eh_kit &&
                        Array.isArray(
                            venda.skus_kit
                        )
                    ) {

                        venda.skus_kit
                            .forEach(
                                kit => {

                                    const {
                                        sku,
                                        multiplicador
                                    } =
                                        extrairSkuEQuantidade(
                                            kit.sku
                                        );

                                    itensParaSincronizar.push({

                                        sku,

                                        quantidade:
                                            (
                                                kit.estoque ||
                                                1
                                            ) *
                                            (
                                                venda.quantidade ||
                                                1
                                            ) *
                                            multiplicador
                                    });
                                }
                            );

                    } else if (
                        venda.sku
                    ) {

                        const {
                            sku,
                            multiplicador
                        } =
                            extrairSkuEQuantidade(
                                venda.sku
                            );

                        itensParaSincronizar.push({

                            sku,

                            quantidade:
                                (
                                    venda.quantidade ||
                                    1
                                ) *
                                multiplicador
                        });
                    }
                }

            } catch (error) {

                console.warn(
                    '⚠️ Fallback vendas_ml falhou:',
                    error
                );
            }
        }

        // Remover SKUs repetidos
        const skusUnicos =
            [
                ...new Set(
                    itensParaSincronizar
                        .map(
                            item =>
                                item.sku
                        )
                        .filter(Boolean)
                )
            ];

        if (
            skusUnicos.length ===
            0
        ) {

            console.warn(
                '⚠️ Nenhum SKU para sincronizar'
            );

            return false;
        }

        let sucessos =
            0;

        let falhas =
            0;

        // =====================================================
        // SINCRONIZAR CADA SKU
        // =====================================================

        for (
            const sku
            of skusUnicos
        ) {

            const {
                data:
                    produto,

                error
            } =
                await window
                    .supabaseClient
                    .from(
                        'produtos_estoque'
                    )
                    .select(`
                        id,
                        sku,
                        nome,
                        quantidade,
                        mlb_codes,
                        bloquear_sync_ml
                    `)
                    .eq(
                        'sku',
                        sku
                    )
                    .maybeSingle();

            if (
                error ||
                !produto
            ) {

                console.warn(
                    `⚠️ SKU ${sku} não encontrado`
                );

                falhas++;

                continue;
            }

            if (
                produto
                    .bloquear_sync_ml
            ) {

                console.log(
                    `🔒 Sync ML bloqueada para ${sku}`
                );

                continue;
            }

            let mlbCodes =
                [];

            if (
                Array.isArray(
                    produto.mlb_codes
                )
            ) {

                mlbCodes =
                    produto.mlb_codes;

            } else if (
                typeof produto
                    .mlb_codes ===
                'string'
            ) {

                try {

                    const parsed =
                        JSON.parse(
                            produto.mlb_codes
                        );

                    mlbCodes =
                        Array.isArray(
                            parsed
                        )
                            ? parsed
                            : [parsed];

                } catch {

                    mlbCodes =
                        produto.mlb_codes
                            .split(',')
                            .map(
                                item =>
                                    item.trim()
                            )
                            .filter(Boolean);
                }

            } else if (
                produto.mlb_codes &&
                typeof produto.mlb_codes ===
                'object'
            ) {

                mlbCodes =
                    Object.values(
                        produto.mlb_codes
                    );
            }

            if (
                mlbCodes.length ===
                0
            ) {

                console.warn(
                    `⚠️ SKU ${sku} não possui MLB`
                );

                falhas++;

                continue;
            }

            for (
                const codigo
                of mlbCodes
            ) {

                const codigoTexto =
                    String(
                        codigo
                    );

                const itemId =
                    codigoTexto.startsWith(
                        'MLB'
                    )
                        ? codigoTexto
                        : `MLB${codigoTexto}`;

                try {

                    const updateUrl =
                        `https://api.mercadolibre.com/items/${itemId}`;

                    const proxyUrl =
                        `${window.WORKER_URL}/api/ml/proxy?url=` +
                        `${encodeURIComponent(updateUrl)}` +
                        `&token=${encodeURIComponent(token)}` +
                        `&method=PUT`;

                    const response =
                        await fetch(
                            proxyUrl,
                            {
                                method:
                                    'PUT',

                                headers: {
                                    'Content-Type':
                                        'application/json'
                                },

                                body:
                                    JSON.stringify({

                                        available_quantity:
                                            Number(
                                                produto.quantidade ||
                                                0
                                            )
                                    })
                            }
                        );

                    if (
                        response.ok
                    ) {

                        sucessos++;

                        console.log(
                            `✅ ${sku} / ${itemId} = ${produto.quantidade}`
                        );

                    } else {

                        falhas++;

                        console.warn(
                            `⚠️ Erro ML ${itemId}:`,
                            await response.text()
                        );
                    }

                } catch (error) {

                    falhas++;

                    console.warn(
                        `⚠️ Erro ao sincronizar ${itemId}:`,
                        error
                    );
                }
            }
        }

        console.log(
            `📊 Sync ML: ${sucessos} sucesso(s), ${falhas} falha(s)`
        );

        return (
            sucessos >
            0 &&
            falhas ===
            0
        );

    } catch (error) {

        console.error(
            '❌ Erro na sincronização ML:',
            error
        );

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
// EMITIR NF-e PARA VENDA (CORRIGIDO - ENDEREÇO SEM REPETIÇÃO)
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
                        console.log('📦 Endereço do shipment:', address);
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
        
        // 🔥 CORREÇÃO: Endereço sem repetir o número
        let logradouro = address.address_line || address.street_name || '';
        let numero = address.street_number || 'S/N';
        
        // 🔥 Se o logradouro já contém o número, remove para não duplicar
        if (logradouro && numero && numero !== 'S/N') {
            // Remove o número do final do logradouro se estiver repetido
            const numeroPattern = new RegExp(`\\s*[,.]?\\s*${numero}\\s*$`);
            logradouro = logradouro.replace(numeroPattern, '');
            // Remove vírgulas extras no final
            logradouro = logradouro.replace(/,\s*$/, '');
        }
        
        console.log(`📋 Logradouro: "${logradouro}", Número: "${numero}"`);
        
        document.getElementById('clienteEndereco').value = logradouro;
        document.getElementById('clienteNumero').value = numero;
        document.getElementById('clienteBairro').value = address.neighborhood?.name || address.neighborhood || '';
        document.getElementById('clienteCidade').value = address.city?.name || address.city || '';
        
        const ufOriginal = address.state?.name || address.state || '';
        const ufSigla = mapearUF(ufOriginal);
        document.getElementById('clienteUF').value = ufSigla;
        document.getElementById('clienteCEP').value = address.zip_code ? address.zip_code.replace(/\D/g, '') : '';
        document.getElementById('clienteDocumento').value = '';

        console.log('📋 Dados preenchidos:', {
            nome,
            endereco: document.getElementById('clienteEndereco').value,
            numero: document.getElementById('clienteNumero').value,
            cidade: document.getElementById('clienteCidade').value,
            uf: ufSigla
        });

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

async function salvarClienteNoBanco(dadosCliente) {
    try {
        console.log('👤 Iniciando salvamento do cliente:', dadosCliente);

        const documentoLimpo = String(dadosCliente.documento || '')
            .replace(/\D/g, '');

        if (!documentoLimpo) {
            throw new Error('Documento do cliente não informado');
        }

        // =====================================================
        // 1. VERIFICAR SE O CLIENTE JÁ EXISTE
        // =====================================================

        const urlBusca =
            `${window.API_BASE_URL}/nfe/clientes?documento=${encodeURIComponent(documentoLimpo)}`;

        console.log('🔎 Procurando cliente:', documentoLimpo);

        const responseBusca = await fetch(urlBusca);

        if (responseBusca.ok) {
            const dataBusca = await responseBusca.json();

            console.log('📥 Resultado da busca do cliente:', dataBusca);

            const clientes = Array.isArray(dataBusca.clientes)
                ? dataBusca.clientes
                : [];

            // IMPORTANTE:
            // não basta existir algum cliente.
            // Tem que existir o MESMO CPF/CNPJ.
            const clienteExistente = clientes.find(cliente => {
                const documentoCliente = String(cliente.documento || '')
                    .replace(/\D/g, '');

                return documentoCliente === documentoLimpo;
            });

            if (clienteExistente) {
                console.log(
                    'ℹ️ Cliente já cadastrado:',
                    clienteExistente.nome,
                    documentoLimpo
                );

                return {
                    success: true,
                    existente: true,
                    cliente: clienteExistente
                };
            }
        } else {
            console.warn(
                '⚠️ Não foi possível consultar cliente existente:',
                responseBusca.status
            );
        }

        // =====================================================
        // 2. CADASTRAR CLIENTE
        // =====================================================

        const payload = {
            nome: dadosCliente.nome,
            documento: documentoLimpo,
            logradouro: dadosCliente.endereco,
            numero: dadosCliente.numero || 'S/N',
            bairro: dadosCliente.bairro || '',
            cidade: dadosCliente.cidade,
            uf: dadosCliente.uf,
            cep: String(dadosCliente.cep || '').replace(/\D/g, '')
        };

        console.log('📤 Cadastrando cliente:', payload);

        const response = await fetch(`${window.API_BASE_URL}/nfe/clientes`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        let result = {};

        try {
            result = await response.json();
        } catch (e) {
            console.warn('⚠️ API não retornou JSON ao cadastrar cliente');
        }

        console.log('📥 Resposta do cadastro do cliente:', {
            status: response.status,
            ok: response.ok,
            result
        });

        if (!response.ok) {
            throw new Error(
                result.error ||
                result.message ||
                `Erro HTTP ${response.status} ao cadastrar cliente`
            );
        }

        if (result.success === false) {
            throw new Error(
                result.error ||
                result.message ||
                'API informou erro ao cadastrar cliente'
            );
        }

        console.log('✅ Cliente salvo com sucesso:', documentoLimpo);

        return {
            success: true,
            existente: false,
            cliente: result.cliente || result
        };

    } catch (error) {

        console.error('❌ ERRO AO SALVAR CLIENTE:', error);

        showToast(
            `⚠️ NF-e emitida, mas o cliente não foi salvo: ${error.message}`,
            'warning'
        );

        return {
            success: false,
            error: error.message
        };
    }
}

async function confirmarEmissaoNFE() {

    console.log(
        '🔵 [confirmarEmissaoNFE] INICIADA'
    );

    let nfeFoiEmitida =
        false;

    const orderId =
        pendingEmitOrderId;

    if (!orderId) {

        showToast(
            '❌ Nenhuma venda selecionada',
            'error'
        );

        fecharModalEdicaoProdutos();

        return;
    }

    if (
        window
            ._nfeEmissaoEmAndamento
    ) {

        showToast(
            '⚠️ Já existe uma emissão em andamento.',
            'warning'
        );

        return;
    }

    const modal =
        document.getElementById(
            'modalEdicaoProdutos'
        );

    if (!modal) {

        showToast(
            '❌ Modal não encontrado',
            'error'
        );

        return;
    }

    const campo =
        seletor =>
            modal.querySelector(
                seletor
            );

    const nome =
        campo(
            '#clienteNome'
        )?.value.trim() ||
        '';

    const documento =
        (
            campo(
                '#clienteDocumento'
            )?.value ||
            ''
        )
            .replace(
                /\D/g,
                ''
            );

    const endereco =
        campo(
            '#clienteEndereco'
        )?.value.trim() ||
        '';

    const numero =
        campo(
            '#clienteNumero'
        )?.value.trim() ||
        'S/N';

    const bairro =
        campo(
            '#clienteBairro'
        )?.value.trim() ||
        '';

    const cidade =
        campo(
            '#clienteCidade'
        )?.value.trim() ||
        '';

    const uf =
        (
            campo(
                '#clienteUF'
            )?.value ||
            ''
        )
            .trim()
            .toUpperCase();

    const cep =
        (
            campo(
                '#clienteCEP'
            )?.value ||
            ''
        )
            .replace(
                /\D/g,
                ''
            );

    const transportadoraId =
        campo(
            '#nfeTransportadora'
        )?.value ||
        null;

    const cfop =
        campo(
            '#nfeCfop'
        )?.value ||
        '6108';

    // =====================================================
    // VALIDAÇÕES
    // =====================================================

    if (!nome) {

        showToast(
            '⚠️ Nome obrigatório',
            'warning'
        );

        return;
    }

    if (
        documento.length !==
            11 &&
        documento.length !==
            14
    ) {

        showToast(
            '⚠️ CPF/CNPJ inválido',
            'warning'
        );

        return;
    }

    if (!endereco) {

        showToast(
            '⚠️ Endereço obrigatório',
            'warning'
        );

        return;
    }

    if (!cidade) {

        showToast(
            '⚠️ Cidade obrigatória',
            'warning'
        );

        return;
    }

    const ufValidas = [
        'AC','AL','AP','AM','BA','CE',
        'DF','ES','GO','MA','MT','MS',
        'MG','PA','PB','PR','PE','PI',
        'RJ','RN','RS','RO','RR','SC',
        'SP','SE','TO'
    ];

    if (
        !ufValidas.includes(
            uf
        )
    ) {

        showToast(
            `⚠️ UF "${uf}" inválida`,
            'warning'
        );

        return;
    }

    const btn =
        modal.querySelector(
            '#confirmarProdutosFinalBtn'
        );

    const originalText =
        btn?.innerHTML ||
        '';

    if (btn) {

        btn.disabled =
            true;

        btn.innerHTML =
            '<span class="spinner"></span> Emitindo...';
    }

    window
        ._nfeEmissaoEmAndamento =
        String(
            orderId
        );

    try {

        // =====================================================
        // VERIFICAR DUPLICIDADE
        // =====================================================

        const listResponse =
            await fetch(
                `${window.API_BASE_URL}/nfe/listar-nfes`,
                {
                    cache:
                        'no-store'
                }
            );

        const listData =
            await listResponse
                .json();

        if (
            listData.success &&
            Array.isArray(
                listData.notas
            )
        ) {

            const existente =
                listData.notas.find(
                    nfe => {

                        const venda =
                            nfe.venda_id ||
                            nfe.venda_id_ml ||
                            nfe.id_venda;

                        return (
                            String(
                                venda
                            ) ===
                            String(
                                orderId
                            )
                        ) &&
                        !nfe.cancelada;
                    }
                );

            if (existente) {

                showToast(
                    '🚫 Esta venda já possui NF-e.',
                    'warning'
                );

                fecharModalEdicaoProdutos();

                pendingEmitOrderId =
                    null;

                vendaIdParaEdicao =
                    null;

                return;
            }
        }

        // =====================================================
        // TOKEN
        // =====================================================

        let token =
            localStorage.getItem(
                'ml_access_token'
            );

        if (
            !token &&
            typeof window
                .getValidToken ===
            'function'
        ) {

            const tokenData =
                await window
                    .getValidToken();

            token =
                tokenData
                    ?.access_token;
        }

        const produtos =
            Array.isArray(
                window
                    .produtosParaEmissao
            )
                ? window
                    .produtosParaEmissao
                : [];

        if (
            produtos.length ===
            0
        ) {

            throw new Error(
                'Nenhum produto para emissão'
            );
        }

        const produtosFinal =
            await Promise.all(

                produtos.map(
                    async produto => {

                        let ncm =
                            produto.ncm ||
                            '87149990';

                        if (
                            produto.sku &&
                            produto.sku !==
                            'SEM_SKU'
                        ) {

                            const salvo =
                                await buscarNCMporSKU(
                                    produto.sku
                                );

                            if (salvo) {

                                ncm =
                                    salvo;

                            } else {

                                await salvarNCMporSKU(
                                    produto.sku,
                                    ncm
                                );
                            }
                        }

                        return {

                            ...produto,

                            ncm
                        };
                    }
                )
            );

        const mlToken =
            window
                ._mlAccessToken ||
            token;

        const payload = {

            venda_id:
                String(
                    orderId
                ),

            cliente: {
                nome,
                documento,
                endereco,
                numero,
                bairro,
                cidade,
                uf,
                cep
            },

            produtos:
                produtosFinal,

            cfop,

            natureza_operacao:
                'VENDA',

            modalidade_frete:
                transportadoraId
                    ? '0'
                    : '9',

            transportadora_id:
                transportadoraId,

            ml_access_token:
                mlToken
        };

        console.log(
            '📤 Payload:',
            JSON.stringify(
                payload,
                null,
                2
            )
        );

        const response =
            await fetch(
                `${window.API_BASE_URL}/nfe/emitir`,
                {
                    method:
                        'POST',

                    headers: {
                        'Content-Type':
                            'application/json'
                    },

                    body:
                        JSON.stringify(
                            payload
                        )
                }
            );

        const result =
            await response.json();

        if (
            !result.success
        ) {

            const mensagem =
                result.error ||
                'Erro desconhecido';

            showToast(
                `❌ Erro ao emitir NF-e: ${mensagem}`,
                'error'
            );

            return;
        }

        // =====================================================
        // A PARTIR DAQUI NF-E JÁ FOI EMITIDA
        // =====================================================

        nfeFoiEmitida =
            true;

        console.log(
            '✅ NF-e emitida:',
            result
        );

        showToast(
            `✅ NF-e emitida! Protocolo: ${result.protocolo || 'autorizada'}`,
            'success'
        );

        fecharModalEdicaoProdutos();

        pendingEmitOrderId =
            null;

        vendaIdParaEdicao =
            null;

        produtosEditados =
            [];

        // =====================================================
        // SALVAR NF-E
        // =====================================================

        try {

            const chave =
                result.chave_acesso ||
                result.chave;

            if (chave) {

                const {
                    data:
                        existente
                } =
                    await window
                        .supabaseClient
                        .from(
                            'nfe_emitidas'
                        )
                        .select(
                            'id'
                        )
                        .eq(
                            'chave_acesso',
                            chave
                        )
                        .maybeSingle();

                if (!existente) {

                    await window
                        .supabaseClient
                        .from(
                            'nfe_emitidas'
                        )
                        .insert({

                            chave_acesso:
                                chave,

                            venda_id:
                                orderId,

                            protocolo:
                                result.protocolo,

                            data_emissao:
                                new Date()
                                    .toISOString(),

                            cliente_nome:
                                nome,

                            valor_total:
                                produtosFinal.reduce(
                                    (
                                        total,
                                        p
                                    ) =>
                                        total +
                                        (
                                            Number(
                                                p.valor_unitario ||
                                                0
                                            ) *
                                            Number(
                                                p.quantidade ||
                                                1
                                            )
                                        ),
                                    0
                                ),

                            xml_assinado:
                                result.xml ||
                                null,

                            cancelada:
                                false
                        });
                }
            }

        } catch (error) {

            console.warn(
                '⚠️ NF-e emitida, mas erro ao salvar registro:',
                error
            );
        }

        // =====================================================
        // STATUS vendas_ml
        // =====================================================

        try {

            await window
                .supabaseClient
                .from(
                    'vendas_ml'
                )
                .update({

                    nfe_emitida:
                        true,

                    status_nfe:
                        'emitida',

                    status_sistema:
                        'finalizada',

                    updated_at:
                        new Date()
                            .toISOString()

                })
                .eq(
                    'id_venda_ml',
                    String(
                        orderId
                    )
                );

        } catch (error) {

            console.warn(
                '⚠️ Erro ao atualizar vendas_ml:',
                error
            );
        }

        // =====================================================
        // CACHE
        // SOMENTE MUDA NF-e.
        // NÃO TOCA EM ESTOQUE.
        // =====================================================

        try {

            await window
                .supabaseClient
                .from(
                    'vendas_nfe_cache'
                )
                .update({

                    tem_nfe:
                        true,

                    atualizado_em:
                        new Date()
                            .toISOString()

                })
                .eq(
                    'id_venda_ml',
                    String(
                        orderId
                    )
                );

                // =====================================================
// BAIXA AUTOMÁTICA DO ESTOQUE APÓS NF-e
//
// REGRA:
// - se já baixou pelo botão → não faz nada.
// - se ainda não baixou → baixa agora.
// - FULL → não mexe.
// =====================================================

try {

    const vendaIdEstoque =
        normalizarOrderIdML(
            orderId
        );

    console.log(
        `📦 NF-e emitida. Verificando estoque da venda ${vendaIdEstoque}...`
    );

    const resultadoEstoque =
        await garantirBaixaEstoqueVenda(
            vendaIdEstoque,
            'nfe'
        );

    if (
        resultadoEstoque.success
    ) {

        if (
            resultadoEstoque.full
        ) {

            console.log(
                'ℹ️ Venda FULL. Nenhuma baixa local necessária.'
            );

        } else if (
            resultadoEstoque.already
        ) {

            console.log(
                `✅ Venda ${vendaIdEstoque}: estoque já havia sido baixado anteriormente. NF-e NÃO baixou novamente.`
            );

        } else {

            console.log(
                `✅ Venda ${vendaIdEstoque}: estoque baixado automaticamente após emissão da NF-e.`
            );

            if (
                resultadoEstoque.sincronizado
            ) {

                showToast(
                    '✅ NF-e emitida e estoque baixado/sincronizado!',
                    'success'
                );

            } else {

                showToast(
                    '⚠️ NF-e emitida e estoque baixado. Sincronização com ML ficou pendente.',
                    'warning'
                );
            }
        }

    } else {

        // =================================================
        // IMPORTANTE:
        //
        // A NF-e JÁ FOI EMITIDA.
        // Erro de estoque não pode virar "erro de emissão".
        // =================================================

        console.warn(
            `⚠️ NF-e emitida, mas não foi possível baixar estoque:`,
            resultadoEstoque.error
        );

        showToast(
            `⚠️ NF-e emitida, mas o estoque não foi baixado: ${resultadoEstoque.error}`,
            'warning'
                    );
                }

            } catch (
                estoqueError
            ) {

                console.error(
                    '⚠️ NF-e JÁ FOI EMITIDA, mas ocorreu erro na baixa automática:',
                    estoqueError
                );

                showToast(
                    '⚠️ NF-e emitida, mas houve erro ao processar a baixa de estoque.',
                    'warning'
                );
            }

        } catch (error) {

            console.warn(
                '⚠️ Erro ao atualizar cache:',
                error
            );
        }

        // =====================================================
        // XML MERCADO LIVRE
        // =====================================================

        try {

            const chave =
                result.chave_acesso ||
                result.chave;

            if (chave) {

                const xmlResponse =
                    await fetch(
                        `${window.API_BASE_URL}/nfe/buscar-xml?chave=${encodeURIComponent(chave)}`
                    );

                const xmlData =
                    await xmlResponse
                        .json();

                if (
                    xmlData.xml
                ) {

                    let xmlContent =
                        xmlData.xml;

                    if (
                        !xmlContent.startsWith(
                            '<?xml'
                        )
                    ) {

                        xmlContent =
                            '<?xml version="1.0" encoding="UTF-8"?>\n' +
                            xmlContent;
                    }

                    if (
                        xmlContent.includes(
                            '<NFe'
                        ) &&
                        !xmlContent.includes(
                            '<nfeProc'
                        )
                    ) {

                        const nfeMatch =
                            xmlContent.match(
                                /<NFe[^>]*>([\s\S]*?)<\/NFe>/
                            );

                        const protMatch =
                            xmlContent.match(
                                /<protNFe[^>]*>([\s\S]*?)<\/protNFe>/
                            );

                        if (nfeMatch) {

                            xmlContent =
                                `<?xml version="1.0" encoding="UTF-8"?>\n` +
                                `<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">\n` +
                                `${nfeMatch[0]}\n` +
                                `${protMatch ? protMatch[0] : ''}\n` +
                                `</nfeProc>`;
                        }
                    }

                    xmlContent =
                        xmlContent
                            .replace(
                                />\s+</g,
                                '><'
                            )
                            .replace(
                                /^\s*[\r\n]/gm,
                                ''
                            );

                    await enviarXMLparaMercadoLivre(
                        orderId,
                        xmlContent,
                        mlToken
                    );
                }
            }

        } catch (error) {

            console.warn(
                '⚠️ NF-e emitida, mas erro no XML ML:',
                error
            );

            showToast(
                '⚠️ NF-e emitida, mas houve erro ao vincular o XML ao ML.',
                'warning'
            );
        }

        // =====================================================
        // CLIENTE
        // =====================================================

        try {

            await salvarClienteNoBanco({
                nome,
                documento,
                endereco,
                numero,
                bairro,
                cidade,
                uf,
                cep
            });

        } catch (error) {

            console.warn(
                '⚠️ NF-e emitida, mas erro ao salvar cliente:',
                error
            );
        }

        // =====================================================
        // HISTÓRICO
        // =====================================================

        try {

            await window
                .supabaseClient
                .from(
                    'estoque_historico'
                )
                .insert({

                    venda_id:
                        orderId,

                    tipo:
                        'nfe',

                    observacao:
                        `NF-e emitida - Venda ${orderId} - Cliente: ${nome}`,

                    criado_por:
                        'Sistema NF-e',

                    criado_em:
                        new Date()
                            .toISOString()
                });

        } catch (error) {

            console.warn(
                '⚠️ Erro no histórico:',
                error
            );
        }

        window
            .produtosParaEmissao =
            null;

        // Atualizar apenas a tela/cache
        const data =
            document.getElementById(
                'filtroDataEnvioNFE'
            )?.value ||
            obterDataHojeLocal();

        const vendas =
            await carregarVendasCacheNFE(
                window._nfeFiltroTodas
                    ? null
                    : data
            );

        renderizarVendasNFETabela(
            vendas
        );

        try {

            await carregarNFesEmitidas();

        } catch {}

        showToast(
            '✅ Processo da NF-e concluído!',
            'success'
        );

    } catch (error) {

        if (
            nfeFoiEmitida
        ) {

            console.error(
                '⚠️ NF-e JÁ FOI EMITIDA. Erro posterior:',
                error
            );

            showToast(
                '⚠️ A NF-e FOI EMITIDA. Houve apenas um erro posterior. NÃO EMITA NOVAMENTE.',
                'warning'
            );

            fecharModalEdicaoProdutos();

        } else {

            console.error(
                '❌ Erro antes da emissão:',
                error
            );

            showToast(
                `❌ Não foi possível emitir a NF-e: ${error.message}`,
                'error'
            );
        }

    } finally {

        if (
            !nfeFoiEmitida &&
            btn &&
            document.body.contains(
                btn
            )
        ) {

            btn.disabled =
                false;

            btn.innerHTML =
                originalText;
        }

        if (
            nfeFoiEmitida
        ) {

            fecharModalEdicaoProdutos();
        }

        window
            ._mlAccessToken =
            null;

        window
            ._nfeEmissaoEmAndamento =
            null;
    }
}

async function garantirBaixaEstoqueVenda(
    vendaId,
    origem = 'manual'
) {

    vendaId =
        normalizarOrderIdML(
            vendaId
        );

    if (!vendaId) {

        return {

            success: false,

            error:
                'ID da venda inválido'
        };
    }

    console.log(
        `📦 [BAIXA] Venda ${vendaId} | origem: ${origem}`
    );

    try {

        // =====================================================
        // 1. BUSCAR ESTADO DA VENDA
        // =====================================================

        const {
            data:
                vendaCache,

            error:
                erroVenda
        } =
            await window
                .supabaseClient
                .from(
                    'vendas_nfe_cache'
                )
                .select(`
                    id_venda_ml,
                    is_full,
                    estoque_baixado,
                    estoque_status,
                    estoque_baixado_em,
                    estoque_detalhes
                `)
                .eq(
                    'id_venda_ml',
                    vendaId
                )
                .maybeSingle();

        if (
            erroVenda
        ) {

            throw erroVenda;
        }

        if (
            !vendaCache
        ) {

            throw new Error(
                `Venda ${vendaId} não encontrada no cache`
            );
        }

        // =====================================================
        // 2. FULL
        // =====================================================

        if (
            vendaCache.is_full
        ) {

            console.log(
                `ℹ️ ${vendaId} é FULL. Sem baixa local.`
            );

            return {

                success: true,

                full: true,

                skipped: true
            };
        }

        // =====================================================
        // 3. JÁ FOI BAIXADO
        //
        // NÃO BAIXAR NOVAMENTE.
        // =====================================================

        if (
            vendaCache
                .estoque_baixado
        ) {

            console.log(
                `✅ ${vendaId}: estoque já havia sido baixado`
            );

            // =================================================
            // SE A SINCRONIZAÇÃO ANTERIOR FICOU PENDENTE,
            // TENTAMOS NOVAMENTE.
            // =================================================

            if (
                vendaCache
                    .estoque_status ===
                'baixado_sync_pendente'
            ) {

                console.log(
                    `🔄 ${vendaId}: baixa já feita, tentando novamente a sincronização ML...`
                );

                let sincronizado =
                    false;

                try {

                    sincronizado =
                        await sincronizarEstoqueComML(
                            vendaId
                        );

                } catch (error) {

                    console.error(
                        '❌ Erro repetindo sincronização ML:',
                        error
                    );
                }

                if (
                    sincronizado
                ) {

                    await window
                        .supabaseClient
                        .from(
                            'vendas_nfe_cache'
                        )
                        .update({

                            estoque_status:
                                'baixado',

                            atualizado_em:
                                new Date()
                                    .toISOString()

                        })
                        .eq(
                            'id_venda_ml',
                            vendaId
                        );
                }

                return {

                    success: true,

                    already: true,

                    skipped: true,

                    sincronizado
                };
            }

            return {

                success: true,

                already: true,

                skipped: true,

                sincronizado: true
            };
        }

        // =====================================================
        // 4. DETALHES DOS PRODUTOS
        // =====================================================

        const detalhesEstoque =
            Array.isArray(
                vendaCache
                    .estoque_detalhes
            )
                ? vendaCache
                    .estoque_detalhes
                : [];

        if (
            detalhesEstoque.length ===
            0
        ) {

            return {

                success: false,

                error:
                    'Produtos ainda não foram verificados no estoque'
            };
        }

        const naoEncontrado =
            detalhesEstoque.find(
                item =>
                    !item.encontrado
            );

        if (
            naoEncontrado
        ) {

            return {

                success: false,

                semCadastro: true,

                error:
                    `SKU ${naoEncontrado.sku || 'SEM_SKU'} não cadastrado`
            };
        }

        // =====================================================
        // 5. MARCAR PROCESSANDO
        // =====================================================

        await window
            .supabaseClient
            .from(
                'vendas_nfe_cache'
            )
            .update({

                estoque_status:
                    'processando'

            })
            .eq(
                'id_venda_ml',
                vendaId
            )
            .eq(
                'estoque_baixado',
                false
            );

        // =====================================================
        // 6. BAIXA ATÔMICA
        //
        // ESSA RPC É A PROTEÇÃO FINAL CONTRA DUPLICIDADE.
        // =====================================================

        console.log(
            `📉 Executando baixa local da venda ${vendaId}...`
        );

        const {
            data:
                resultado,

            error:
                erroBaixa
        } =
            await window
                .supabaseClient
                .rpc(
                    'dar_baixa_estoque_venda_nfe',
                    {
                        p_venda_id:
                            vendaId
                    }
                );

        if (
            erroBaixa
        ) {

            throw erroBaixa;
        }

        // =====================================================
        // RPC DETECTOU BAIXA ANTERIOR
        // =====================================================

        if (
            resultado?.already
        ) {

            console.log(
                `✅ RPC confirmou que ${vendaId} já havia sido baixada`
            );

            return {

                success: true,

                already: true,

                skipped: true
            };
        }

        if (
            !resultado?.success
        ) {

            throw new Error(
                resultado?.error ||
                'Erro ao realizar baixa de estoque'
            );
        }

        console.log(
            '✅ BAIXA LOCAL CONCLUÍDA:',
            resultado
        );

        // =====================================================
        // 7. HISTÓRICO
        //
        // A BAIXA SÓ CHEGA AQUI SE REALMENTE ACONTECEU.
        // =====================================================

        const resultadoHistorico =
            await registrarHistoricoBaixaEstoqueNFE(

                vendaId,

                origem,

                detalhesEstoque
            );

        if (
            !resultadoHistorico
                .success
        ) {

            // =============================================
            // A BAIXA JÁ ACONTECEU.
            // NÃO PODEMOS DESFAZER.
            // MAS PRECISAMOS INFORMAR O ERRO.
            // =============================================

            console.error(
                '⚠️ Estoque foi baixado, mas histórico NÃO foi gravado:',
                resultadoHistorico
            );

            showToast(
                `⚠️ Estoque baixado, mas houve erro ao gravar o histórico: ${resultadoHistorico.error}`,
                'warning'
            );
        }

        // =====================================================
        // 8. SINCRONIZAÇÃO COM MERCADO LIVRE
        //
        // IMPORTANTE:
        //
        // TODO CAMINHO DE BAIXA PASSA AQUI:
        //
        // botão
        // ou
        // emissão NF-e
        // =====================================================

        console.log(
            `🚀 Acionando sincronização com Mercado Livre após baixa da venda ${vendaId}...`
        );

        let sincronizado =
            false;

        try {

            sincronizado =
                await sincronizarEstoqueComML(
                    vendaId
                );

        } catch (
            syncError
        ) {

            console.error(
                `❌ Erro ao sincronizar estoque da venda ${vendaId} com ML:`,
                syncError
            );

            sincronizado =
                false;
        }

        // =====================================================
        // 9. STATUS FINAL
        // =====================================================

        if (
            sincronizado
        ) {

            const {
                error:
                    erroStatus
            } =
                await window
                    .supabaseClient
                    .from(
                        'vendas_nfe_cache'
                    )
                    .update({

                        estoque_baixado:
                            true,

                        estoque_status:
                            'baixado',

                        estoque_baixado_em:
                            new Date()
                                .toISOString(),

                        atualizado_em:
                            new Date()
                                .toISOString()

                    })
                    .eq(
                        'id_venda_ml',
                        vendaId
                    );

            if (
                erroStatus
            ) {

                console.error(
                    '⚠️ Erro atualizando status final:',
                    erroStatus
                );
            }

            console.log(
                `✅ ${vendaId}: estoque local + Mercado Livre sincronizados`
            );

        } else {

            const {
                error:
                    erroStatus
            } =
                await window
                    .supabaseClient
                    .from(
                        'vendas_nfe_cache'
                    )
                    .update({

                        estoque_baixado:
                            true,

                        estoque_status:
                            'baixado_sync_pendente',

                        estoque_baixado_em:
                            new Date()
                                .toISOString(),

                        atualizado_em:
                            new Date()
                                .toISOString()

                    })
                    .eq(
                        'id_venda_ml',
                        vendaId
                    );

            if (
                erroStatus
            ) {

                console.error(
                    '⚠️ Erro atualizando status pendente:',
                    erroStatus
                );
            }

            console.warn(
                `⚠️ ${vendaId}: estoque baixado, mas sincronização ML pendente`
            );
        }

        return {

            success: true,

            already: false,

            skipped: false,

            sincronizado,

            historico:
                resultadoHistorico
                    .success,

            resultado
        };

    } catch (error) {

        console.error(
            `❌ Erro na baixa ${vendaId}:`,
            error
        );

        // =====================================================
        // SÓ MARCAR ERRO SE A BAIXA NÃO TIVER ACONTECIDO
        // =====================================================

        try {

            const {
                data:
                    estadoAtual
            } =
                await window
                    .supabaseClient
                    .from(
                        'vendas_nfe_cache'
                    )
                    .select(
                        'estoque_baixado'
                    )
                    .eq(
                        'id_venda_ml',
                        vendaId
                    )
                    .maybeSingle();

            if (
                !estadoAtual
                    ?.estoque_baixado
            ) {

                await window
                    .supabaseClient
                    .from(
                        'vendas_nfe_cache'
                    )
                    .update({

                        estoque_status:
                            'erro'

                    })
                    .eq(
                        'id_venda_ml',
                        vendaId
                    );
            }

        } catch (
            erroStatus
        ) {

            console.warn(
                '⚠️ Erro atualizando status após falha:',
                erroStatus
            );
        }

        return {

            success: false,

            error:
                error.message
        };
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

// =========================================================
// NORMALIZAÇÃO DE ID
// =========================================================

function normalizarOrderIdML(valor) {

    if (
        valor === null ||
        valor === undefined
    ) {
        return '';
    }

    return String(valor)
        .trim()
        .replace(/^ML(?=\d)/i, '');
}

function variantesOrderIdML(valor) {

    const id =
        normalizarOrderIdML(valor);

    if (!id) {
        return [];
    }

    return [
        id,
        `ML${id}`
    ];
}

// =========================================================
// PARSE DAS INFORMAÇÕES DE ENVIO
// =========================================================

function parseInformacoesEnvioNFE(venda) {

    let info =
        venda?.informacoes_envio ||
        {};

    if (
        typeof info ===
        'string'
    ) {

        try {

            info =
                JSON.parse(info);

        } catch (error) {

            info = {};
        }
    }

    if (
        !info ||
        typeof info !==
            'object'
    ) {

        return {};
    }

    return info;
}

// =========================================================
// DATA DA VENDA
// =========================================================

function obterDataVendaNFE(venda) {

    const valor =
        venda?.data_venda ||
        venda?.date_created ||
        venda?.created_at ||
        null;

    if (!valor) {
        return null;
    }

    const match =
        String(valor).match(
            /(\d{4}-\d{2}-\d{2})/
        );

    return match
        ? match[1]
        : null;
}

async function carregarTransportadorasSelect() {

    console.log(
        '🚚 Carregando transportadoras no MODAL NOVO...'
    );

    // =====================================================
    // BUSCAR ESPECIFICAMENTE NO MODAL NOVO
    // =====================================================

    const modal =
        document.getElementById(
            'modalEdicaoProdutos'
        );

    if (!modal) {

        console.error(
            '❌ Modal de emissão não encontrado'
        );

        return false;
    }

    const select =
        modal.querySelector(
            '#nfeTransportadora'
        );

    if (!select) {

        console.error(
            '❌ Select de transportadora não encontrado dentro do modal'
        );

        return false;
    }

    try {

        select.disabled = true;

        select.innerHTML = `
            <option value="">
                ⏳ Carregando transportadoras...
            </option>
        `;

        const url =
            `${window.API_BASE_URL}/nfe/transportadoras`;

        console.log(
            '🚚 URL:',
            url
        );

        const response =
            await fetch(
                url,
                {
                    method: 'GET',

                    headers: {
                        'Accept':
                            'application/json'
                    },

                    cache:
                        'no-store'
                }
            );

        console.log(
            '🚚 HTTP:',
            response.status
        );

        if (!response.ok) {

            throw new Error(
                `HTTP ${response.status}`
            );
        }

        const data =
            await response.json();

        console.log(
            '🚚 Dados recebidos:',
            data
        );

        if (!data.success) {

            throw new Error(
                data.error ||
                'API retornou success=false'
            );
        }

        const transportadoras =
            Array.isArray(
                data.transportadoras
            )
                ? data.transportadoras
                : [];

        console.log(
            `🚚 ${transportadoras.length} transportadoras encontradas`
        );

        if (
            transportadoras.length === 0
        ) {

            select.innerHTML = `
                <option value="">
                    Nenhuma transportadora cadastrada
                </option>
            `;

            select.disabled = false;

            return true;
        }

        // =====================================================
        // PRIMEIRA OPÇÃO
        // =====================================================

        select.innerHTML = '';

        const optionInicial =
            document.createElement(
                'option'
            );

        optionInicial.value = '';

        optionInicial.textContent =
            'Selecione uma transportadora';

        select.appendChild(
            optionInicial
        );

        // =====================================================
        // TRANSPORTADORAS
        // =====================================================

        transportadoras.forEach(
            transportadora => {

                const option =
                    document.createElement(
                        'option'
                    );

                option.value =
                    String(
                        transportadora.id
                    );

                let texto =
                    transportadora.nome ||
                    'Transportadora';

                if (
                    transportadora.cnpj
                ) {

                    texto +=
                        ` - ${transportadora.cnpj}`;
                }

                option.textContent =
                    texto;

                select.appendChild(
                    option
                );
            }
        );

        select.disabled = false;

        console.log(
            '✅ Select preenchido:',
            select.options.length,
            'opções'
        );

        return true;

    } catch (error) {

        console.error(
            '❌ Erro ao carregar transportadoras:',
            error
        );

        select.innerHTML = `
            <option value="">
                ❌ Erro ao carregar transportadoras
            </option>
        `;

        select.disabled = false;

        return false;
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

    await atualizarVendasDataSelecionada();
}

function inicializarAbaNFE() {

    inicializarFiltroDataNFE();

    mostrarAbaNFE(
        'vendas'
    );
}

async function atualizarListaNFE() {

    if (
        window._nfeFiltroTodas
    ) {

        const vendas =
            await carregarVendasCacheNFE(
                null
            );

        renderizarVendasNFETabela(
            vendas
        );

        return;
    }

    await atualizarVendasDataSelecionada();

    try {

        await carregarNFesEmitidas();

    } catch (
        error
    ) {

        console.warn(
            '⚠️ Erro carregando NF-es emitidas:',
            error
        );
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
window.obterDataHojeLocal = obterDataHojeLocal;
window.extrairDataEnvioML = extrairDataEnvioML;
window.garantirControlesVendasNFE = garantirControlesVendasNFE;
window.inicializarFiltroDataNFE = inicializarFiltroDataNFE;
window.carregarVendasCacheNFE = carregarVendasCacheNFE;
window.salvarVendasCacheNFE = salvarVendasCacheNFE;
window.verificarEstoqueVenda = verificarEstoqueVenda;
window.renderizarVendasNFETabela = renderizarVendasNFETabela;
window.sincronizarVendasPendentesML = sincronizarVendasPendentesML;
window.carregarVendasPendentes = carregarVendasPendentes;
window.atualizarVendasDataSelecionada = atualizarVendasDataSelecionada;
window.mostrarTodasVendasCacheNFE = mostrarTodasVendasCacheNFE;
window.darBaixaEstoqueVenda = darBaixaEstoqueVenda;
window.sincronizarEstoqueVendaManual = sincronizarEstoqueVendaManual;
window.sincronizarEstoqueComML = sincronizarEstoqueComML;
window.atualizarListaNFE = atualizarListaNFE;
window.sincronizarVendasML = sincronizarVendasML;

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