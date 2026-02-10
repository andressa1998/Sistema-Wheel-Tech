// ============================================
// SISTEMA DE SINCRONIZAÇÃO DE VENDAS ML
// ============================================

console.log('🛒 Sistema de Vendas ML iniciando...');

// ml_sales_sync.js - LINHA 4
const WORKER_URL = 'https://homework-fees-saving-beliefs.trycloudflare.com';

// E também exponha globalmente
window.WORKER_URL = WORKER_URL;
console.log('🛒 Worker URL configurada para vendas:', WORKER_URL);

// OU use uma variável global
if (!window.WORKER_URL) {
    console.error('❌ WORKER_URL não definido. Configure no ml_token_manager.js');
    window.WORKER_URL = 'https://purple-bonus-3b1c.andmiotto1998.workers.dev';
}

// Configurações
const SALES_CONFIG = {
    CHECK_INTERVAL: 5 * 60 * 1000, // 5 minutos
    MAX_ORDERS_PER_SYNC: 50,
    SUPABASE_TABLE: 'vendas_ml',
    ESTOQUE_TABLE: 'estoque_produtos'
};

// Estado do sistema
let salesSyncStatus = {
    isRunning: false,
    lastSync: null,
    lastOrderId: null,
    totalSynced: 0,
    errors: []
};

// Torna global para que outros scripts (como script.js) vejam
window.salesSyncStatus = salesSyncStatus;

// ml_sales_sync.js - FUNÇÃO DE SINCRONIZAÇÃO ATUALIZADA
async function sincronizarVendasML() {
    if (salesSyncStatus.isRunning) return;
    
    // Pega o token do gerenciador
    const token = window.mlTokenStatus ? window.mlTokenStatus.access_token : null;
    const sellerId = '415176739'; // ID extraído do seu token logado

    if (!token) {
        console.warn('⚠️ Token não encontrado.');
        return;
    }

    salesSyncStatus.isRunning = true;

    try {
        // URL CORRIGIDA: seller=me alterado para o ID numérico
        const url = `https://api.mercadolibre.com/orders/search?seller=${sellerId}&order.status=paid&sort=date_desc`;
        
        console.log('🔄 Buscando vendas para o vendedor:', sellerId);
        
        const response = await fetch(`${window.WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(url)}&token=${token}`);
        
        if (!response.ok) throw new Error(`API ML retornou ${response.status}`);

        const data = await response.json();
        const vendas = data.results || [];

        for (const venda of vendas) {
            // --- CAPTURA DE SKU ---
            const item = venda.order_items[0].item;
            const sku = item.seller_sku || "SEM SKU";

            // --- CAPTURA DE MEIO DE ENVIO ---
            let meioEnvio = "A combinar";
            if (venda.shipping && venda.shipping.id) {
                // Se for Fulfillment (FULL), aparece nas tags
                meioEnvio = (venda.tags && venda.tags.includes('fulfillment')) 
                    ? "Mercado Envios (FULL)" 
                    : "Mercado Envios";
            }

            const dadosVenda = {
                id: venda.id,
                date_created: venda.date_created,
                buyer_nickname: venda.buyer ? venda.buyer.nickname : 'N/A',
                total_amount: venda.total_amount,
                status: venda.status,
                sku: sku,               // Adicionado SKU
                meio_envio: meioEnvio,   // Adicionado Meio de Envio
                produto_titulo: item.title,
                last_updated: new Date().toISOString()
            };

            // Salva no Supabase
            await window.supabaseClient
                .from('vendas_ml')
                .upsert(dadosVenda);
        }

        console.log(`✅ Sincronização automática ok: ${vendas.length} vendas.`);
    } catch (error) {
        console.error('❌ Erro na sincronização:', error);
    } finally {
        salesSyncStatus.isRunning = false;
    }
}

// ===== BUSCAR VENDAS RECENTES =====
async function buscarVendasRecentes(token, limit = SALES_CONFIG.MAX_ORDERS_PER_SYNC) {
    try {
        const now = new Date();
        const threeDaysAgo = new Date(now);
        threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
        
        // Construir URL com filtros
        const params = new URLSearchParams({
            seller: 'me',
            sort: 'date_desc',
            'order.status': 'paid',
            'order.date_created.from': threeDaysAgo.toISOString().split('T')[0],
            limit: limit.toString()
        });
        
        // Se tivermos último ID, buscar a partir dele
        if (salesSyncStatus.lastOrderId) {
            params.append('order.id.from', salesSyncStatus.lastOrderId);
        }
        
        const url = `https://api.mercadolibre.com/orders/search?${params.toString()}`;
        
        console.log(`🔍 Buscando vendas: ${url}`);
        
        // Usar Worker como proxy
        const response = await fetch(`${WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(url)}&token=${token}`);
        
        if (!response.ok) {
            throw new Error(`API ML retornou ${response.status}`);
        }
        
        const data = await response.json();
        
        if (!data.results || !Array.isArray(data.results)) {
            return [];
        }
        
        // Processar e enriquecer dados
        const vendasProcessadas = await Promise.all(
            data.results.map(async (venda) => {
                try {
                    // Buscar detalhes completos da venda
                    const detalhes = await buscarDetalhesVenda(venda.id, token);
                    
                    return {
                        ...venda,
                        ...detalhes,
                        // Informações adicionais
                        processado_em: new Date().toISOString(),
                        status_sistema: 'pendente',
                        conferido: false,
                        conferido_por: null,
                        data_conferencia: null
                    };
                } catch (error) {
                    console.error(`Erro ao buscar detalhes da venda ${venda.id}:`, error);
                    return {
                        ...venda,
                        processado_em: new Date().toISOString(),
                        status_sistema: 'erro_detalhes',
                        erro: error.message
                    };
                }
            })
        );
        
        return vendasProcessadas.filter(v => v !== null);
        
    } catch (error) {
        console.error('❌ Erro ao buscar vendas:', error);
        return [];
    }
}

// ===== BUSCAR DETALHES COMPLETOS DA VENDA =====
// Modifique a função buscarDetalhesVenda:
async function buscarDetalhesVenda(orderId, token) {
    try {
        const url = `https://api.mercadolibre.com/orders/${orderId}`;
        const response = await fetch(`${WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(url)}&token=${token}`);
        
        if (!response.ok) {
            throw new Error(`Detalhes retornou ${response.status}`);
        }
        
        const detalhes = await response.json();
        
        console.log(`🔍 Analisando estrutura da venda ${orderId}...`);
        console.log('📋 Estrutura do primeiro item:', detalhes.order_items?.[0] ? JSON.stringify(detalhes.order_items[0], null, 2) : 'Sem itens');
        
        // Buscar SKUs específicos com tentativa de múltiplas fontes
        const skusInfo = await Promise.all(
            (detalhes.order_items || []).map(async (item, index) => {
                // Tenta buscar informações adicionais do item
                let itemInfo = null;
                if (item.item?.id) {
                    itemInfo = await buscarInformacoesItem(item.item.id, token);
                }
                
                // Determina o SKU (tentativa em múltiplos campos)
                let sku = 'SEM_SKU';
                const possibleSkuSources = [
                    item.item?.seller_custom_field,
                    itemInfo?.sku,
                    item.item?.variation_attributes?.find(attr => 
                        attr.id === 'SELLER_SKU' || attr.name === 'SKU'
                    )?.value_name,
                    item.item?.seller_sku,
                    `VAR-${item.item?.variation_id}`,
                    `ITEM-${item.item?.id}`
                ];
                
                for (const source of possibleSkuSources) {
                    if (source && source !== 'SEM_SKU') {
                        sku = source;
                        console.log(`✅ SKU ${index+1} definido como: ${sku} (fonte: ${source})`);
                        break;
                    }
                }
                
                return {
                    sku: sku,
                    item_id: item.item?.id,
                    title: item.item?.title,
                    quantity_sold: item.quantity,
                    unit_price: item.unit_price,
                    variation_attributes: item.item?.variation_attributes || [],
                    seller_custom_field: item.item?.seller_custom_field,
                    seller_sku: item.item?.seller_sku,
                    variation_id: item.item?.variation_id,
                    item_info: itemInfo
                };
            })
        );
        
        // Extrair informações importantes
        const informacoesExtras = {
            // Informações do comprador
            buyer_info: {
                id: detalhes.buyer?.id,
                nickname: detalhes.buyer?.nickname,
                email: detalhes.buyer?.email,
                first_name: detalhes.buyer?.first_name,
                last_name: detalhes.buyer?.last_name
            },
            
            // Informações dos itens COM SKUs
            items_detalhados: detalhes.order_items?.map((item, index) => ({
                item_id: item.item?.id,
                title: item.item?.title,
                sku: skusInfo[index]?.sku || 'SEM_SKU',
                category_id: item.item?.category_id,
                quantity: item.quantity,
                unit_price: item.unit_price,
                full_unit_price: item.full_unit_price,
                gross_price: item.gross_price,
                sale_fee: item.sale_fee,
                variation_attributes: item.item?.variation_attributes || [],
                warranty: item.item?.warranty,
                condition: item.item?.condition,
                seller_custom_field: item.item?.seller_custom_field,
                seller_sku: item.item?.seller_sku,
                variation_id: item.item?.variation_id,
                stock_available: null
            })) || [],
            
            // SKUs separados
            skus_info: skusInfo,
            
            // Informações de pagamento
            payments_detalhados: detalhes.payments?.map(payment => ({
                payment_id: payment.id,
                payment_method: payment.payment_method_id,
                status: payment.status,
                transaction_amount: payment.transaction_amount,
                installments: payment.installments,
                date_approved: payment.date_approved
            })) || [],
            
            // Informações de envio
            shipping_info: detalhes.shipping ? {
                shipping_id: detalhes.shipping.id,
                shipping_mode: detalhes.shipping.mode,
                shipping_status: detalhes.shipping.status
            } : null,
            
            // Tags e status
            tags: detalhes.tags || [],
            status_detail: detalhes.status_detail,
            
            // Informações financeiras
            total_com_frete: detalhes.total_amount,
            currency: detalhes.currency_id,
            taxes: detalhes.taxes?.amount || 0,
            
            // Datas importantes
            date_closed: detalhes.date_closed,
            last_updated: detalhes.last_updated,
            manufacturing_ending_date: detalhes.manufacturing_ending_date
        };
        
        console.log(`✅ Venda ${orderId} processada com ${informacoesExtras.items_detalhados.length} itens`);
        
        return informacoesExtras;
        
    } catch (error) {
        console.error(`❌ Erro ao buscar detalhes da venda ${orderId}:`, error);
        
        // Tenta uma abordagem alternativa
        console.log('🔄 Tentando abordagem alternativa para venda', orderId);
        return await buscarDetalhesAlternativo(orderId, token);
    }
}

// Adicione esta função alternativa:
async function buscarDetalhesAlternativo(orderId, token) {
    try {
        // Primeiro busca a ordem básica
        const url = `https://api.mercadolibre.com/orders/${orderId}`;
        const response = await fetch(`${WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(url)}&token=${token}`);
        
        if (!response.ok) {
            throw new Error(`API retornou ${response.status}`);
        }
        
        const orderData = await response.json();
        
        // Para cada item, busca informações detalhadas
        const itemsCompletos = await Promise.all(
            (orderData.order_items || []).map(async (item) => {
                let sku = 'SEM_SKU';
                
                // Tenta buscar o item completo
                if (item.item?.id) {
                    try {
                        const itemUrl = `https://api.mercadolibre.com/items/${item.item.id}`;
                        const itemResponse = await fetch(`${WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(itemUrl)}&token=${token}`);
                        
                        if (itemResponse.ok) {
                            const itemData = await itemResponse.json();
                            
                            // Verifica múltiplas fontes de SKU
                            if (itemData.seller_custom_field) {
                                sku = itemData.seller_custom_field;
                            } else if (itemData.variations && itemData.variations.length > 0) {
                                // Verifica variações
                                const variation = itemData.variations.find(v => v.id === item.item?.variation_id);
                                if (variation && variation.seller_custom_field) {
                                    sku = variation.seller_custom_field;
                                }
                            }
                        }
                    } catch (error) {
                        console.error(`Erro ao buscar item ${item.item.id}:`, error);
                    }
                }
                
                return {
                    item_id: item.item?.id,
                    title: item.item?.title,
                    sku: sku,
                    category_id: item.item?.category_id,
                    quantity: item.quantity,
                    unit_price: item.unit_price,
                    full_unit_price: item.full_unit_price,
                    variation_attributes: item.item?.variation_attributes || [],
                    warranty: item.item?.warranty,
                    condition: item.item?.condition
                };
            })
        );
        
        return {
            items_detalhados: itemsCompletos,
            skus_info: itemsCompletos.map(item => ({
                sku: item.sku,
                item_id: item.item_id,
                title: item.title,
                quantity_sold: item.quantity,
                unit_price: item.unit_price
            })),
            buyer_info: {
                id: orderData.buyer?.id,
                nickname: orderData.buyer?.nickname
            },
            total_com_frete: orderData.total_amount,
            currency: orderData.currency_id,
            tags: orderData.tags || [],
            status: orderData.status
        };
        
    } catch (error) {
        console.error(`❌ Erro na abordagem alternativa:`, error);
        throw error;
    }
}

// Adicione esta função no ml_sales_sync.js para debug:
async function debugVendaCompleta(orderId, token) {
    try {
        console.log(`🔍 DEBUG: Analisando venda ${orderId}...`);
        
        const url = `https://api.mercadolibre.com/orders/${orderId}`;
        const response = await fetch(`${WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(url)}&token=${token}`);
        
        if (!response.ok) {
            console.error(`❌ API retornou erro: ${response.status}`);
            return;
        }
        
        const orderData = await response.json();
        
        console.log('📊 DADOS COMPLETOS DA VENDA:');
        console.log(JSON.stringify(orderData, null, 2));
        
        // Analisa cada item
        if (orderData.order_items && orderData.order_items.length > 0) {
            console.log('\n🔍 ANALISANDO ITENS:');
            
            orderData.order_items.forEach((item, index) => {
                console.log(`\n📦 Item ${index + 1}:`);
                console.log(`   Título: ${item.item?.title}`);
                console.log(`   ID: ${item.item?.id}`);
                console.log(`   Variation ID: ${item.item?.variation_id}`);
                console.log(`   Seller Custom Field: ${item.item?.seller_custom_field}`);
                console.log(`   Seller SKU: ${item.item?.seller_sku}`);
                
                // Verifica atributos de variação
                if (item.item?.variation_attributes && item.item.variation_attributes.length > 0) {
                    console.log(`   Variation Attributes:`);
                    item.item.variation_attributes.forEach(attr => {
                        console.log(`     - ${attr.id}: ${attr.value_name} (${attr.name})`);
                    });
                }
                
                // Verifica discountos que podem conter SKU
                if (item.discounts && item.discounts.length > 0) {
                    console.log(`   Discounts:`, JSON.stringify(item.discounts, null, 2));
                }
            });
        } else {
            console.log('❌ Nenhum item encontrado na venda');
        }
        
    } catch (error) {
        console.error('❌ Erro no debug:', error);
    }
}

// Adicione esta função global para testar:
window.debugVendaML = async function(orderId) {
    const token = await autoManageMLToken();
    if (token) {
        await debugVendaCompleta(orderId, token);
    }
};

// ===== PROCESSAR VENDA (SALVAR NO SUPABASE) =====
async function processarVenda(venda, token) {
    try {
        // 1. Extrair SKU e Título
        // Percorremos os itens da ordem (geralmente é o primeiro [0])
        const itemInfo = venda.order_items && venda.order_items[0] ? venda.order_items[0].item : {};
        const sku = itemInfo.seller_sku || "SEM SKU";
        const titulo = itemInfo.title || "Produto sem título";

        // 2. Extrair Meio de Envio
        // De acordo com a documentação: shipping.id existe para Mercado Envios
        let meioEnvio = "A combinar";
        if (venda.shipping && venda.shipping.id) {
            meioEnvio = "Mercado Envios";
            // Verifica se é FULL (Fulfillment) pelas tags
            if (venda.tags && venda.tags.includes('fulfillment')) {
                meioEnvio = "Mercado Envios (FULL)";
            } else if (venda.shipping.shipping_mode === 'me2') {
                meioEnvio = "Mercado Envios (ME2)";
            }
        }

        // 3. Montar objeto para o Supabase
        const dadosParaSalvar = {
            id: venda.id,
            date_created: venda.date_created,
            date_closed: venda.date_closed,
            buyer_nickname: venda.buyer ? venda.buyer.nickname : 'N/A',
            total_amount: venda.total_amount,
            status: venda.status,
            sku: sku,               // NOVO CAMPO
            meio_envio: meioEnvio,   // NOVO CAMPO
            produto_titulo: titulo,
            last_updated: new Date().toISOString()
        };

        // 4. Upsert no Supabase
        const { error } = await window.supabaseClient
            .from(SALES_CONFIG.SUPABASE_TABLE)
            .upsert(dadosParaSalvar, { onConflict: 'id' });

        if (error) throw error;
        return true;

    } catch (error) {
        console.error(`❌ Erro ao processar venda ${venda.id}:`, error);
        return false;
    }
}

// Nova função para inserir venda completa:
async function inserirVendaCompletaNoSupabase(vendaML, detalhes) {
    try {
        const vendaFormatada = {
            order_id: vendaML.id,
            order_data: vendaML,
            status: vendaML.status,
            status_detail: vendaML.status_detail,
            buyer_id: vendaML.buyer?.id,
            buyer_nickname: vendaML.buyer?.nickname,
            total_amount: vendaML.total_amount,
            currency: vendaML.currency_id,
            date_created: vendaML.date_created,
            date_closed: vendaML.date_closed,
            last_updated: vendaML.last_updated,
            tags: vendaML.tags || [],
            items_count: vendaML.order_items?.length || 0,
            items_json: detalhes.items_detalhados || [],
            skus_info: detalhes.skus_info || [],
            payments_json: detalhes.payments_detalhados || [],
            shipping_info: detalhes.shipping_info,
            status_sistema: 'pendente',
            conferido: false,
            conferido_por: null,
            data_conferencia: null,
            processado_em: new Date().toISOString(),
            sincronizado_em: new Date().toISOString(),
            // Adiciona metadados para debug
            metadata: {
                has_skus: detalhes.items_detalhados?.some(item => item.sku && item.sku !== 'SEM_SKU') || false,
                skus_found: detalhes.items_detalhados?.map(item => ({
                    sku: item.sku,
                    source: item.seller_custom_field ? 'seller_custom_field' : 
                            item.seller_sku ? 'seller_sku' : 
                            item.variation_id ? 'variation_id' : 'not_found'
                })) || []
            }
        };
        
        const { data, error } = await supabaseClient
            .from(SALES_CONFIG.SUPABASE_TABLE)
            .insert([vendaFormatada]);
        
        if (error) throw error;
        
        console.log(`✅ Venda ${vendaML.id} salva com ${vendaFormatada.items_json.length} itens`);
        
        // Log dos SKUs encontrados
        const skusEncontrados = vendaFormatada.items_json.filter(item => item.sku && item.sku !== 'SEM_SKU');
        console.log(`📦 SKUs encontrados: ${skusEncontrados.length}/${vendaFormatada.items_json.length}`);
        skusEncontrados.forEach(item => {
            console.log(`   - ${item.sku}: ${item.title}`);
        });
        
        return data;
        
    } catch (error) {
        console.error('❌ Erro ao inserir venda completa:', error);
        throw error;
    }
}

// ===== VERIFICAR SE DEVE ATUALIZAR VENDA =====
function deveAtualizarVenda(vendaExistente, vendaNova) {
    // Atualizar se:
    // 1. Status mudou
    // 2. Tags mudaram
    // 3. Valor total mudou
    // 4. Houve atualização recente na venda
    
    const ultimaAtualizacaoExistente = new Date(vendaExistente.last_updated || vendaExistente.date_closed);
    const ultimaAtualizacaoNova = new Date(vendaNova.last_updated || vendaNova.date_closed);
    
    return ultimaAtualizacaoNova > ultimaAtualizacaoExistente ||
           vendaExistente.status !== vendaNova.status ||
           JSON.stringify(vendaExistente.tags) !== JSON.stringify(vendaNova.tags);
}

// ===== INSERIR VENDA NO SUPABASE =====
async function inserirVendaNoSupabase(venda) {
    try {
        const vendaFormatada = {
            order_id: venda.id,
            order_data: venda,
            status: venda.status,
            status_detail: venda.status_detail,
            buyer_id: venda.buyer?.id,
            buyer_nickname: venda.buyer?.nickname,
            total_amount: venda.total_amount,
            currency: venda.currency_id,
            date_created: venda.date_created,
            date_closed: venda.date_closed,
            last_updated: venda.last_updated,
            tags: venda.tags || [],
            items_count: venda.order_items?.length || 0,
            items_json: venda.items_detalhados || [],
            payments_json: venda.payments_detalhados || [],
            shipping_info: venda.shipping_info,
            status_sistema: 'pendente',
            conferido: false,
            conferido_por: null,
            data_conferencia: null,
            processado_em: new Date().toISOString(),
            sincronizado_em: new Date().toISOString()
        };
        
        const { data, error } = await supabaseClient
            .from(SALES_CONFIG.SUPABASE_TABLE)
            .insert([vendaFormatada]);
        
        if (error) throw error;
        
        return data;
        
    } catch (error) {
        console.error('❌ Erro ao inserir venda no Supabase:', error);
        throw error;
    }
}

// ===== ATUALIZAR VENDA NO SUPABASE =====
async function atualizarVendaNoSupabase(vendaId, novosDados) {
    try {
        const atualizacao = {
            order_data: novosDados,
            status: novosDados.status,
            status_detail: novosDados.status_detail,
            total_amount: novosDados.total_amount,
            last_updated: novosDados.last_updated,
            tags: novosDados.tags || [],
            items_json: novosDados.items_detalhados || [],
            payments_json: novosDados.payments_detalhados || [],
            shipping_info: novosDados.shipping_info,
            atualizado_em: new Date().toISOString()
        };
        
        const { error } = await supabaseClient
            .from(SALES_CONFIG.SUPABASE_TABLE)
            .update(atualizacao)
            .eq('id', vendaId);
        
        if (error) throw error;
        
    } catch (error) {
        console.error('❌ Erro ao atualizar venda no Supabase:', error);
        throw error;
    }
}

// ===== ATUALIZAR ESTOQUE =====
async function atualizarEstoqueVenda(venda) {
    try {
        if (!venda.items_detalhados || venda.items_detalhados.length === 0) {
            console.log(`⚠️ Venda ${venda.id} sem itens para atualizar estoque`);
            return;
        }
        
        console.log(`📦 Atualizando estoque para venda ${venda.id}...`);
        
        for (const item of venda.items_detalhados) {
            if (!item.sku) {
                console.log(`⚠️ Item sem SKU na venda ${venda.id}: ${item.title}`);
                continue;
            }
            
            // Verificar se o produto existe no estoque
            const { data: produto, error: erroBusca } = await supabaseClient
                .from(SALES_CONFIG.ESTOQUE_TABLE)
                .select('id, sku, quantidade_estoque')
                .eq('sku', item.sku)
                .single();
            
            if (erroBusca && erroBusca.code === 'PGRST116') {
                // Produto não encontrado - criar registro
                console.log(`➕ Criando novo produto no estoque: ${item.sku}`);
                
                const { error: erroInsercao } = await supabaseClient
                    .from(SALES_CONFIG.ESTOQUE_TABLE)
                    .insert([{
                        sku: item.sku,
                        nome_produto: item.title,
                        quantidade_estoque: -item.quantity, // Negativo pois foi vendido
                        quantidade_minima: 10,
                        quantidade_maxima: 100,
                        ultima_venda: new Date().toISOString(),
                        historico_vendas: [{
                            order_id: venda.id,
                            quantidade: item.quantity,
                            data: new Date().toISOString(),
                            valor_unitario: item.unit_price
                        }]
                    }]);
                
                if (erroInsercao) {
                    console.error(`❌ Erro ao criar produto ${item.sku}:`, erroInsercao);
                }
                
            } else if (produto) {
                // Atualizar estoque existente
                const novaQuantidade = (produto.quantidade_estoque || 0) - item.quantity;
                
                // Buscar histórico atual
                const { data: produtoCompleto } = await supabaseClient
                    .from(SALES_CONFIG.ESTOQUE_TABLE)
                    .select('historico_vendas')
                    .eq('sku', item.sku)
                    .single();
                
                const historicoAtual = produtoCompleto?.historico_vendas || [];
                const novoHistorico = [
                    ...historicoAtual,
                    {
                        order_id: venda.id,
                        quantidade: item.quantity,
                        data: new Date().toISOString(),
                        valor_unitario: item.unit_price
                    }
                ];
                
                const { error: erroAtualizacao } = await supabaseClient
                    .from(SALES_CONFIG.ESTOQUE_TABLE)
                    .update({
                        quantidade_estoque: novaQuantidade,
                        ultima_venda: new Date().toISOString(),
                        ultima_atualizacao: new Date().toISOString(),
                        historico_vendas: novoHistorico
                    })
                    .eq('sku', item.sku);
                
                if (erroAtualizacao) {
                    console.error(`❌ Erro ao atualizar estoque ${item.sku}:`, erroAtualizacao);
                } else {
                    console.log(`✅ Estoque ${item.sku} atualizado: ${novaQuantidade} unidades`);
                }
            }
        }
        
        console.log(`✅ Estoque atualizado para venda ${venda.id}`);
        
    } catch (error) {
        console.error(`❌ Erro ao atualizar estoque da venda ${venda.id}:`, error);
    }
}

// ===== FUNÇÕES DE INTERFACE =====
function atualizarStatusVendasUI() {
    // Atualizar elemento de status na interface
    const statusElement = document.getElementById('salesSyncStatus');
    const lastSyncElement = document.getElementById('lastSyncSales');
    const totalSalesElement = document.getElementById('totalSyncedSales');
    
    if (statusElement) {
        statusElement.textContent = salesSyncStatus.isRunning ? '🔄 Sincronizando...' : '✅ Em espera';
        statusElement.className = salesSyncStatus.isRunning ? 'badge badge-warning' : 'badge badge-success';
    }
    
    if (lastSyncElement && salesSyncStatus.lastSync) {
        const lastSync = new Date(salesSyncStatus.lastSync);
        lastSyncElement.textContent = lastSync.toLocaleString('pt-BR');
    }
    
    if (totalSalesElement) {
        totalSalesElement.textContent = salesSyncStatus.totalSynced.toString();
    }
}

function mostrarNotificacaoVendas(quantidade) {
    // Mostrar notificação de novas vendas
    if (Notification.permission === 'granted') {
        new Notification(`🛒 ${quantidade} nova(s) venda(s)!`, {
            body: 'Clique para verificar as vendas sincronizadas',
            icon: '/favicon.ico'
        });
    }
    
    // Mostrar toast
    showToast(`🛒 ${quantidade} nova(s) venda(s) sincronizada(s)!`, 'success');
    
    // Atualizar badge de notificações
    atualizarBadgeVendas(quantidade);
}

function atualizarBadgeVendas(quantidade) {
    const badge = document.getElementById('salesNotificationBadge');
    if (badge) {
        if (quantidade > 0) {
            badge.textContent = quantidade;
            badge.style.display = 'block';
        } else {
            badge.style.display = 'none';
        }
    }
}

// ===== INICIAR SINCRONIZAÇÃO AUTOMÁTICA =====
function iniciarSincronizacaoAutomatica() {
    console.log(`⏰ Iniciando sincronização automática (a cada ${SALES_CONFIG.CHECK_INTERVAL/60000} minutos)`);
    
    // Executar imediatamente
    sincronizarVendasML();
    
    // Agendar execução periódica
    setInterval(() => {
        sincronizarVendasML();
    }, SALES_CONFIG.CHECK_INTERVAL);
    
    // Atualizar status na interface
    atualizarStatusVendasUI();
}

// ===== FUNÇÕES DE CONTROLE MANUAL =====
// ===== FUNÇÃO PARA FORÇAR SINCRONIZAÇÃO =====
window.forcarSincronizacaoVendas = async function() {
    if (!currentUser) {
        showToast('⚠️ Faça login primeiro', 'warning');
        return;
    }
    
    console.log('🔄 Forçando sincronização manual de vendas...');
    showToast('🔄 Sincronizando vendas do Mercado Livre...', 'info');
    
    try {
        // 1. Obter token
        const token = await autoManageMLToken();
        if (!token) {
            showToast('❌ Token ML não disponível', 'error');
            return;
        }
        
        showToast('🔍 Buscando vendas recentes...', 'info');
        
        // 2. Buscar vendas dos últimos 7 dias
        const agora = new Date();
        const seteDiasAtras = new Date(agora);
        seteDiasAtras.setDate(seteDiasAtras.getDate() - 7);
        
        const params = new URLSearchParams({
            seller: 'me',
            sort: 'date_desc',
            'order.status': 'paid',
            'order.date_created.from': seteDiasAtras.toISOString().split('T')[0],
            limit: '100'
        });
        
        // Usar Worker como proxy
        const url = `https://api.mercadolibre.com/orders/search?${params.toString()}`;
        const response = await fetch(`${WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(url)}&token=${token}`);
        
        if (!response.ok) {
            throw new Error(`API ML retornou ${response.status}`);
        }
        
        const data = await response.json();
        
        if (!data.results || data.results.length === 0) {
            showToast('📭 Nenhuma venda encontrada no Mercado Livre', 'info');
            return;
        }
        
        showToast(`✅ ${data.results.length} vendas encontradas. Salvando...`, 'success');
        
        // 3. Processar e salvar cada venda
        let vendasSalvas = 0;
        let vendasAtualizadas = 0;
        
        for (const vendaML of data.results) {
            try {
                // Verificar se venda já existe
                const { data: vendaExistente } = await supabaseClient
                    .from('vendas_ml')
                    .select('id, order_id')
                    .eq('order_id', vendaML.id)
                    .single();
                
                if (vendaExistente) {
                    // Atualizar venda existente
                    await supabaseClient
                        .from('vendas_ml')
                        .update({
                            order_data: vendaML,
                            status: vendaML.status,
                            total_amount: vendaML.total_amount,
                            last_updated: vendaML.last_updated || new Date().toISOString(),
                            atualizado_em: new Date().toISOString()
                        })
                        .eq('order_id', vendaML.id);
                    
                    vendasAtualizadas++;
                } else {
                    // Inserir nova venda
                    await supabaseClient
                        .from('vendas_ml')
                        .insert([{
                            order_id: vendaML.id,
                            order_data: vendaML,
                            status: vendaML.status,
                            status_detail: vendaML.status_detail,
                            buyer_id: vendaML.buyer?.id,
                            buyer_nickname: vendaML.buyer?.nickname,
                            total_amount: vendaML.total_amount,
                            currency: vendaML.currency_id,
                            date_created: vendaML.date_created,
                            date_closed: vendaML.date_closed,
                            last_updated: vendaML.last_updated,
                            tags: vendaML.tags || [],
                            items_count: vendaML.order_items?.length || 0,
                            items_json: vendaML.order_items || [],
                            payments_json: vendaML.payments || [],
                            shipping_info: vendaML.shipping,
                            status_sistema: 'pendente',
                            conferido: false,
                            conferido_por: null,
                            data_conferencia: null,
                            processado_em: new Date().toISOString(),
                            sincronizado_em: new Date().toISOString()
                        }]);
                    
                    vendasSalvas++;
                }
                
            } catch (error) {
                console.error(`❌ Erro ao processar venda ${vendaML.id}:`, error);
            }
        }
        
        showToast(`✅ Sincronização completa! ${vendasSalvas} novas, ${vendasAtualizadas} atualizadas`, 'success');
        
        // 4. Recarregar a lista
        if (window.carregarVendasDashboard) {
            await carregarVendasDashboard('hoje');
        }
        
    } catch (error) {
        console.error('❌ Erro na sincronização:', error);
        showToast('❌ Erro ao sincronizar vendas: ' + error.message, 'error');
    }
};

// ===== TESTAR CONEXÃO COM ML =====
window.testarConexaoML = async function() {
    console.log('🔗 Testando conexão com Mercado Livre...');
    showToast('🔗 Testando conexão...', 'info');
    
    try {
        const token = await autoManageMLToken();
        if (!token) {
            showToast('❌ Token ML não disponível', 'error');
            return;
        }
        
        // Testar endpoint simples
        const response = await fetch(`${WORKER_URL}/api/ml/proxy?url=${encodeURIComponent('https://api.mercadolibre.com/users/me')}&token=${token}`);
        
        if (!response.ok) {
            throw new Error(`API retornou ${response.status}`);
        }
        
        const userData = await response.json();
        console.log('✅ Usuário ML:', userData);
        showToast(`✅ Conectado como: ${userData.nickname}`, 'success');
        
        return true;
        
    } catch (error) {
        console.error('❌ Erro na conexão:', error);
        showToast('❌ Falha na conexão: ' + error.message, 'error');
        return false;
    }
};

// ===== INICIALIZAR =====
function inicializarSistemaVendas() {
    console.log('🚀 Inicializando sistema de vendas ML...');
    
    // Verificar se Supabase está disponível
    if (!window.supabaseClient) {
        console.error('❌ Supabase não disponível');
        return;
    }
    
    // Verificar se Worker está disponível
    if (!window.WORKER_URL) {
        console.error('❌ Worker URL não configurado');
        return;
    }
    
    // Criar tabelas no Supabase se não existirem
    criarTabelasSupabase().then(() => {
        // Iniciar sincronização automática
        iniciarSincronizacaoAutomatica();
        
        // Adicionar elementos de status à interface
        adicionarElementosStatusUI();
        
        console.log('✅ Sistema de vendas ML inicializado com sucesso!');
    });
}

// ===== CRIAR TABELAS NO SUPABASE =====
async function criarTabelasSupabase() {
    try {
        console.log('🛠️ Verificando tabelas no Supabase...');
        
        // Tabela de vendas
        const { error: errorVendas } = await supabaseClient
            .from(SALES_CONFIG.SUPABASE_TABLE)
            .select('id')
            .limit(1);
        
        if (errorVendas && errorVendas.code === '42P01') {
            console.log('📋 Criando tabela de vendas...');
            // A tabela será criada automaticamente na primeira inserção
        }
        
        // Tabela de estoque
        const { error: errorEstoque } = await supabaseClient
            .from(SALES_CONFIG.ESTOQUE_TABLE)
            .select('id')
            .limit(1);
        
        if (errorEstoque && errorEstoque.code === '42P01') {
            console.log('📋 Criando tabela de estoque...');
            // A tabela será criada automaticamente na primeira inserção
        }
        
    } catch (error) {
        console.error('❌ Erro ao verificar tabelas:', error);
    }
}

// ===== ADICIONAR ELEMENTOS DE STATUS NA INTERFACE =====
function adicionarElementosStatusUI() {
    // Adicionar status na tela de vendas
    const salesSystem = document.getElementById('salesSystem');
    if (!salesSystem) return;
    
    // Adicionar card de status
    const statusCard = document.createElement('div');
    statusCard.className = 'card mb-4';
    statusCard.innerHTML = `
        <div class="card-header">
            <h3 class="card-title">
                <i class="fas fa-sync-alt"></i> Status da Sincronização
            </h3>
            <button onclick="forcarSincronizacaoVendas()" class="btn btn-sm btn-primary">
                <i class="fas fa-sync"></i> Sincronizar Agora
            </button>
        </div>
        <div class="card-body">
            <div class="row">
                <div class="col-md-3">
                    <div class="info-item">
                        <div class="info-label">Status</div>
                        <div class="info-value">
                            <span id="salesSyncStatus" class="badge badge-success">✅ Em espera</span>
                        </div>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="info-item">
                        <div class="info-label">Última sincronização</div>
                        <div class="info-value" id="lastSyncSales">-</div>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="info-item">
                        <div class="info-label">Total sincronizado</div>
                        <div class="info-value">
                            <span id="totalSyncedSales">0</span> vendas
                        </div>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="info-item">
                        <div class="info-label">Próxima sincronização</div>
                        <div class="info-value" id="nextSyncSales">5 minutos</div>
                    </div>
                </div>
            </div>
            <div class="mt-3">
                <small class="text-muted">
                    <i class="fas fa-info-circle"></i>
                    O sistema verifica novas vendas a cada 5 minutos automaticamente.
                </small>
            </div>
        </div>
    `;
    
    // Inserir após o primeiro card
    const firstCard = salesSystem.querySelector('.card');
    if (firstCard) {
        firstCard.parentNode.insertBefore(statusCard, firstCard.nextSibling);
    }
}

// ml_sales_sync.js - ADICIONE ISSO NO FINAL (após todas as funções)

// ===== GARANTIR QUE FUNÇÕES ESTEJAM DISPONÍVEIS GLOBALMENTE =====
if (typeof window !== 'undefined') {
    // Exportar função principal de sincronização
    window.sincronizarVendasML = sincronizarVendasML;
    
    // Exportar função de sincronização manual
    window.forcarSincronizacaoVendas = forcarSincronizacaoVendas;
    
    // Exportar função de teste
    window.testarConexaoML = testarConexaoML;
    
    // Exportar status
    window.salesSyncStatus = salesSyncStatus;
    
    console.log('✅ Funções de vendas exportadas para window');
}

// ===== INICIAR SISTEMA QUANDO DISPONÍVEL =====
function iniciarQuandoPronto() {
    if (window.supabaseClient && window.autoManageMLToken) {
        console.log('🚀 Iniciando sistema de vendas...');
        inicializarSistemaVendas();
    } else {
        console.log('⏳ Aguardando dependências...');
        setTimeout(iniciarQuandoPronto, 1000);
    }
}

// Aguardar carregamento
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciarQuandoPronto);
} else {
    iniciarQuandoPronto();
}

// Adicione esta função após a função buscarDetalhesVenda
// Substitua a função processarSKUsDoPedido por esta versão corrigida:
// NO ml_sales_sync.js - Substitua a função processarSKUsDoPedido
async function processarSKUsDoPedido(orderId, token) {
    try {
        const url = `https://api.mercadolibre.com/orders/${orderId}`;
        const response = await fetch(`${WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(url)}&token=${token}`);
        
        if (!response.ok) {
            throw new Error(`Detalhes retornou ${response.status}`);
        }
        
        const orderData = await response.json();
        
        console.log(`🔍 Buscando SKUs da venda ${orderId}...`);
        
        // EXTRAIR SKUs - ESTRATÉGIA MELHORADA
        const skusInfo = await Promise.all(
            (orderData.order_items || []).map(async (item, index) => {
                let skuEncontrado = null;
                let fonteSKU = 'não_encontrado';
                
                // ESTRATÉGIA 1: Buscar informações completas do item
                if (item.item?.id) {
                    try {
                        const itemUrl = `https://api.mercadolibre.com/items/${item.item.id}`;
                        const itemResponse = await fetch(`${WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(itemUrl)}&token=${token}`);
                        
                        if (itemResponse.ok) {
                            const itemData = await itemResponse.json();
                            
                            // Verificar múltiplos locais onde o SKU pode estar
                            if (itemData.seller_custom_field) {
                                skuEncontrado = itemData.seller_custom_field;
                                fonteSKU = 'seller_custom_field';
                            } 
                            // Verificar variações
                            else if (itemData.variations && itemData.variations.length > 0) {
                                // Para produtos com variações
                                const variation = itemData.variations.find(v => 
                                    v.id === item.item?.variation_id || 
                                    v.seller_custom_field
                                );
                                
                                if (variation?.seller_custom_field) {
                                    skuEncontrado = variation.seller_custom_field;
                                    fonteSKU = 'variation_seller_custom_field';
                                } else if (variation?.id) {
                                    skuEncontrado = `VAR-${variation.id}`;
                                    fonteSKU = 'variation_id';
                                }
                            }
                            // SKU padrão do ML
                            else if (itemData.seller_sku) {
                                skuEncontrado = itemData.seller_sku;
                                fonteSKU = 'seller_sku';
                            }
                        }
                    } catch (error) {
                        console.error(`Erro ao buscar item ${item.item.id}:`, error);
                    }
                }
                
                // ESTRATÉGIA 2: Verificar campos diretos na ordem
                if (!skuEncontrado && item.item?.seller_custom_field) {
                    skuEncontrado = item.item.seller_custom_field;
                    fonteSKU = 'order_item_seller_custom_field';
                }
                
                // ESTRATÉGIA 3: Verificar atributos de variação na ordem
                if (!skuEncontrado && item.item?.variation_attributes) {
                    const skuAttr = item.item.variation_attributes.find(attr => 
                        attr.id === 'SELLER_SKU' || 
                        attr.name === 'SKU' || 
                        attr.id === 'SKU' ||
                        (attr.value_name && attr.value_name.includes('SKU'))
                    );
                    
                    if (skuAttr?.value_name) {
                        skuEncontrado = skuAttr.value_name;
                        fonteSKU = 'variation_attributes';
                    }
                }
                
                // ESTRATÉGIA 4: Usar ID como fallback
                if (!skuEncontrado) {
                    skuEncontrado = `ITEM-${item.item?.id || `UNKNOWN-${index}`}`;
                    fonteSKU = 'item_id_fallback';
                }
                
                console.log(`✅ Item ${index + 1}: SKU = ${skuEncontrado} (fonte: ${fonteSKU})`);
                
                return {
                    sku: skuEncontrado,
                    fonte_sku: fonteSKU,
                    item_id: item.item?.id,
                    title: item.item?.title,
                    quantity_sold: item.quantity,
                    unit_price: item.unit_price,
                    variation_attributes: item.item?.variation_attributes || [],
                    seller_custom_field: item.item?.seller_custom_field,
                    seller_sku: item.item?.seller_sku,
                    variation_id: item.item?.variation_id
                };
            })
        );
        
        console.log(`📊 SKUs encontrados para venda ${orderId}:`, skusInfo);
        
        return skusInfo;
        
    } catch (error) {
        console.error(`❌ Erro ao buscar SKUs da venda ${orderId}:`, error);
        return [];
    }
}

// Adicione esta função em ml_sales_sync.js para testar
window.testarExtracaoSKU = async function(orderId) {
    try {
        console.log(`🔍 TESTE: Extraindo SKU da venda ${orderId}`);
        
        const token = await autoManageMLToken();
        if (!token) {
            showToast('Token não disponível', 'error');
            return;
        }
        
        const skus = await processarSKUsDoPedido(orderId, token);
        
        console.log('📊 RESULTADO DO TESTE:', skus);
        
        // Mostrar resultado em um modal
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.style.cssText = `
            display: flex; align-items: center; justify-content: center;
            background: rgba(0,0,0,0.7); z-index: 2000;
        `;
        
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 600px; max-height: 80vh; overflow-y: auto;">
                <div style="background: linear-gradient(135deg, #8A2BE2 0%, #4B0082 100%); color: white; padding: 20px;">
                    <h3 style="margin: 0;">
                        <i class="fas fa-search"></i> Teste de Extração de SKU
                    </h3>
                    <p style="margin: 5px 0 0 0; opacity: 0.9;">
                        Venda: ${orderId}
                    </p>
                </div>
                
                <div style="padding: 20px;">
                    <h4>Resultados:</h4>
                    ${skus.length === 0 ? 
                        '<p>Nenhum SKU encontrado</p>' : 
                        skus.map((item, index) => `
                            <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 10px; border: 1px solid #e9ecef;">
                                <strong>Item ${index + 1}:</strong> ${item.title}<br>
                                <strong>SKU:</strong> ${item.sku}<br>
                                <strong>Fonte:</strong> ${item.fonte_sku}<br>
                                <strong>Quantidade:</strong> ${item.quantity_sold}<br>
                                <small style="color: #6c757d;">
                                    Seller Custom Field: ${item.seller_custom_field || 'N/A'}<br>
                                    Seller SKU: ${item.seller_sku || 'N/A'}<br>
                                    Variation ID: ${item.variation_id || 'N/A'}
                                </small>
                            </div>
                        `).join('')
                    }
                </div>
                
                <div style="padding: 15px 20px; background: #f8f9fa; border-top: 1px solid #dee2e6; text-align: center;">
                    <button class="btn btn-primary" onclick="this.parentElement.parentElement.parentElement.remove()">
                        Fechar
                    </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
    } catch (error) {
        console.error('❌ Erro no teste:', error);
        showToast('Erro no teste: ' + error.message, 'error');
    }
};

// Adicione também esta função para buscar informações do item diretamente:
async function buscarInformacoesItem(itemId, token) {
    try {
        const url = `https://api.mercadolibre.com/items/${itemId}`;
        const response = await fetch(`${WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(url)}&token=${token}`);
        
        if (!response.ok) {
            throw new Error(`Item API retornou ${response.status}`);
        }
        
        const itemData = await response.json();
        
        // O SKU pode estar em vários campos
        let sku = null;
        if (itemData.seller_custom_field) {
            sku = itemData.seller_custom_field;
        } else if (itemData.variations && itemData.variations.length > 0) {
            // Para produtos com variações, verifica em cada variação
            for (const variation of itemData.variations) {
                if (variation.seller_custom_field) {
                    sku = variation.seller_custom_field;
                    break;
                }
            }
        }
        
        return {
            sku: sku || 'SEM_SKU',
            title: itemData.title,
            category_id: itemData.category_id,
            variations: itemData.variations || []
        };
        
    } catch (error) {
        console.error(`❌ Erro ao buscar item ${itemId}:`, error);
        return null;
    }
}

// No final do ml_sales_sync.js, garanta este fluxo:
function iniciarSincronizacaoContinuada() {
    console.log('⏱️ Configurando monitoramento automático (Intervalo: 5 min)');
    
    // Executa uma vez após 5 segundos do carregamento
    setTimeout(() => {
        sincronizarVendasML();
    }, 5000);

    // Configura o intervalo fixo
    setInterval(async () => {
        console.log('⏰ Verificação periódica iniciada...');
        await sincronizarVendasML();
    }, SALES_CONFIG.CHECK_INTERVAL);
}

// Modifique a função inicializarSistemaVendas para chamar a sincronização contínua
function inicializarSistemaVendas() {
    console.log('🚀 Inicializando sistema de vendas ML...');
    
    // Verificar se Supabase está disponível
    if (!window.supabaseClient) {
        console.error('❌ Supabase não disponível');
        return;
    }
    
    // Verificar se Worker está disponível
    if (!window.WORKER_URL) {
        console.error('❌ Worker URL não configurado');
        return;
    }
    
    // Criar tabelas no Supabase se não existirem
    criarTabelasSupabase().then(() => {
        // INICIAR SINCRONIZAÇÃO CONTÍNUA (TROQUE ESTA LINHA)
        iniciarSincronizacaoContinuada();
        
        // Adicionar elementos de status à interface
        adicionarElementosStatusUI();
        
        console.log('✅ Sistema de vendas ML inicializado com sucesso!');
    });
}

// Ajuste o final do arquivo ml_sales_sync.js
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        // Dá um pequeno tempo para o ml_token_manager inicializar
        setTimeout(inicializarSistemaVendas, 3000);
    });
} else {
    setTimeout(inicializarSistemaVendas, 3000);
}

function inicializarSistemaVendas() {
    if (!window.supabaseClient) {
        console.error('❌ Supabase não carregado. Reiniciando tentativa em 2s...');
        setTimeout(inicializarSistemaVendas, 2000);
        return;
    }

    // Criar tabelas e iniciar loop
    criarTabelasSupabase().then(() => {
        iniciarSincronizacaoContinuada();
        console.log('✅ Sistema de Vendas ML Ativado e Monitorando!');
    });
}

// ===== EXPORTAR FUNÇÕES =====
    window.sincronizarVendasML = sincronizarVendasML;
    window.forcarSincronizacaoVendas = forcarSincronizacaoVendas;
    window.testarConexaoML = testarConexaoML;
    window.inicializarSistemaVendas = inicializarSistemaVendas;
    window.salesSyncStatus = salesSyncStatus;

console.log('✅ Sistema de vendas ML carregado!');

// ===== INICIAR QUANDO O SISTEMA ESTIVER PRONTO =====
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => {
            if (window.supabaseClient && window.autoManageMLToken) {
                inicializarSistemaVendas();
            }
        }, 3000);
    });
} else {
    setTimeout(() => {
        if (window.supabaseClient && window.autoManageMLToken) {
            inicializarSistemaVendas();
        }
    }, 3000);
}