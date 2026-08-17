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
// BUSCAR VALOR EXATO + MÉTODO DE PAGAMENTO + PARCELAMENTO
//
// IMPORTANTE:
// - mantém a correção do frete
// - frete NÃO reduz valor do produto
// - pega bandeira/tipo de pagamento
// - pega quantidade de parcelas
// =========================================================

async function buscarValorExatoPagamento(orderId) {

    try {

        // =====================================================
        // NORMALIZAR ID
        // =====================================================

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
            `🔍 Buscando pagamento da venda ${orderId}...`
        );


        // =====================================================
        // TOKEN ML
        // =====================================================

        let token =
            localStorage.getItem(
                'ml_access_token'
            );


        if (
            !token &&
            typeof window.getValidToken ===
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

            return null;
        }


        // =====================================================
        // BUSCAR ORDER NO MERCADO LIVRE
        // =====================================================

        const orderUrl =
            `https://api.mercadolibre.com/orders/${orderId}`;


        const orderProxyUrl =
            `${window.WORKER_URL}/api/ml/proxy?url=` +
            `${encodeURIComponent(orderUrl)}` +
            `&token=${encodeURIComponent(token)}`;


        const orderResponse =
            await fetch(
                orderProxyUrl,
                {
                    cache:
                        'no-store'
                }
            );


        if (!orderResponse.ok) {

            console.warn(
                `⚠️ Não foi possível buscar venda ${orderId}: HTTP ${orderResponse.status}`
            );

            return null;
        }


        const orderData =
            await orderResponse
                .json();


        console.log(
            '📦 Dados da venda:',
            orderData
        );


        // =====================================================
        // VALOR DA VENDA ML
        // =====================================================

        const valorVenda =
            parseFloat(
                orderData.total_amount ||
                0
            ) ||
            0;


        console.log(
            `💰 Valor da venda ML: R$ ${valorVenda.toFixed(2)}`
        );


        // =====================================================
        // PAYMENT ID
        // =====================================================

        let paymentId =
            null;


        if (
            Array.isArray(
                orderData.payments
            ) &&
            orderData.payments.length >
                0
        ) {

            paymentId =
                orderData
                    .payments[0]
                    ?.id;

        } else if (
            orderData.payment_id
        ) {

            paymentId =
                orderData
                    .payment_id;

        } else if (
            Array.isArray(
                orderData.payment_ids
            ) &&
            orderData.payment_ids.length >
                0
        ) {

            paymentId =
                orderData
                    .payment_ids[0];
        }


        // =====================================================
        // SEM PAYMENT ID
        // =====================================================

        if (!paymentId) {

            console.warn(
                `⚠️ Payment ID não encontrado para venda ${orderId}`
            );


            return {

                valor_produto:
                    valorVenda,

                valor_frete:
                    0,

                total_pago:
                    valorVenda,

                payment_id:
                    null,

                desconto_cupom:
                    0,

                fonte:
                    'venda',

                valor_venda:
                    valorVenda,

                valor_mp:
                    null,

                metodo_pagamento_id:
                    null,

                tipo_pagamento:
                    null,

                metodo_pagamento_nome:
                    'Não informado',

                parcelas:
                    null,

                parcelamento_nome:
                    null,

                valor_parcela:
                    null
            };
        }


        console.log(
            `💳 Payment ID: ${paymentId}`
        );


        // =====================================================
        // BUSCAR PAGAMENTO NO MERCADO PAGO
        // =====================================================

        const paymentUrl =
            `https://api.mercadopago.com/v1/payments/${paymentId}`;


        const paymentProxyUrl =
            `${window.WORKER_URL}/api/ml/proxy?url=` +
            `${encodeURIComponent(paymentUrl)}` +
            `&token=${encodeURIComponent(token)}`;


        const paymentResponse =
            await fetch(
                paymentProxyUrl,
                {
                    cache:
                        'no-store'
                }
            );


        // =====================================================
        // ERRO MERCADO PAGO
        // =====================================================

        if (!paymentResponse.ok) {

            console.warn(
                `⚠️ Erro ao buscar pagamento ${paymentId}: HTTP ${paymentResponse.status}`
            );


            return {

                valor_produto:
                    valorVenda,

                valor_frete:
                    0,

                total_pago:
                    valorVenda,

                payment_id:
                    paymentId,

                desconto_cupom:
                    0,

                fonte:
                    'venda',

                valor_venda:
                    valorVenda,

                valor_mp:
                    null,

                metodo_pagamento_id:
                    null,

                tipo_pagamento:
                    null,

                metodo_pagamento_nome:
                    'Não informado',

                parcelas:
                    null,

                parcelamento_nome:
                    null,

                valor_parcela:
                    null
            };
        }


        // =====================================================
        // DADOS MERCADO PAGO
        // =====================================================

        const paymentData =
            await paymentResponse
                .json();


        console.log(
            '💳 Dados Mercado Pago:',
            paymentData
        );


        // =====================================================
        // VALORES
        // =====================================================

        const totalPago =
            parseFloat(
                paymentData
                    .transaction_amount ??
                paymentData
                    .total_amount ??
                0
            ) ||
            0;


        const descontoCupom =
            parseFloat(
                paymentData
                    .coupon_amount ??
                0
            ) ||
            0;


        // =====================================================
        // FRETE
        //
        // SOMENTE INFORMAÇÃO.
        //
        // NÃO SUBTRAIR DO VALOR DO PRODUTO.
        // =====================================================

        let valorFrete =
            0;


        if (
            paymentData
                .additional_info
                ?.shipments
                ?.shipping_amount !==
                    undefined &&
            paymentData
                .additional_info
                ?.shipments
                ?.shipping_amount !==
                    null
        ) {

            valorFrete =
                parseFloat(
                    paymentData
                        .additional_info
                        .shipments
                        .shipping_amount
                ) ||
                0;

        } else if (
            paymentData
                .shipping_amount !==
                    undefined &&
            paymentData
                .shipping_amount !==
                    null
        ) {

            valorFrete =
                parseFloat(
                    paymentData
                        .shipping_amount
                ) ||
                0;

        } else if (
            orderData
                .shipping
                ?.cost !==
                    undefined &&
            orderData
                .shipping
                ?.cost !==
                    null
        ) {

            valorFrete =
                parseFloat(
                    orderData
                        .shipping
                        .cost
                ) ||
                0;
        }


        // =====================================================
        // VALOR DO MERCADO PAGO
        //
        // FRETE NÃO É DESCONTADO.
        // =====================================================

        let valorProdutoMP =
            totalPago -
            descontoCupom;


        if (
            !Number.isFinite(
                valorProdutoMP
            ) ||
            valorProdutoMP <
                0
        ) {

            valorProdutoMP =
                0;
        }


        // =====================================================
        // MÉTODO DE PAGAMENTO
        // =====================================================

        const metodoPagamentoId =
            String(
                paymentData
                    .payment_method_id ||
                ''
            )
                .trim()
                .toLowerCase();


        const tipoPagamento =
            String(
                paymentData
                    .payment_type_id ||
                ''
            )
                .trim()
                .toLowerCase();


        // =====================================================
        // NOMES DE BANDEIRAS
        // =====================================================

        const nomesCartoes = {

            visa:
                'Visa',

            master:
                'Mastercard',

            mastercard:
                'Mastercard',

            amex:
                'American Express',

            elo:
                'Elo',

            hipercard:
                'Hipercard'
        };


        // =====================================================
        // NOME AMIGÁVEL
        // =====================================================

        let metodoPagamentoNome =
            'Não informado';


        if (
            metodoPagamentoId ===
            'pix'
        ) {

            metodoPagamentoNome =
                'Pix';

        } else if (
            tipoPagamento ===
            'credit_card'
        ) {

            const bandeira =
                nomesCartoes[
                    metodoPagamentoId
                ] ||
                metodoPagamentoId;


            metodoPagamentoNome =
                bandeira

                    ? `Cartão de crédito - ${bandeira}`

                    : 'Cartão de crédito';

        } else if (
            tipoPagamento ===
            'debit_card'
        ) {

            const bandeira =
                nomesCartoes[
                    metodoPagamentoId
                ] ||
                metodoPagamentoId;


            metodoPagamentoNome =
                bandeira

                    ? `Cartão de débito - ${bandeira}`

                    : 'Cartão de débito';

        } else if (
            tipoPagamento ===
            'prepaid_card'
        ) {

            metodoPagamentoNome =
                'Cartão pré-pago';

        } else if (
            tipoPagamento ===
            'account_money'
        ) {

            metodoPagamentoNome =
                'Saldo Mercado Pago';

        } else if (
            tipoPagamento ===
            'ticket'
        ) {

            metodoPagamentoNome =
                'Boleto';

        } else if (
            tipoPagamento ===
            'bank_transfer'
        ) {

            metodoPagamentoNome =
                metodoPagamentoId ===
                    'pix'

                    ? 'Pix'

                    : 'Transferência bancária';

        } else if (
            metodoPagamentoId
        ) {

            metodoPagamentoNome =
                metodoPagamentoId;
        }


        // =====================================================
        // PARCELAMENTO
        // =====================================================

        let parcelas =
            null;


        let valorParcela =
            null;


        let parcelamentoNome =
            null;


        // Só faz sentido tratar parcelas para cartão de crédito
        if (
            tipoPagamento ===
            'credit_card'
        ) {

            parcelas =
                Number(
                    paymentData
                        .installments ??
                    1
                );


            if (
                !Number.isFinite(
                    parcelas
                ) ||
                parcelas <=
                    0
            ) {

                parcelas =
                    1;
            }


            // =================================================
            // VALOR DA PARCELA
            //
            // Primeiro tenta pegar do MP.
            // Caso não venha, calcula pelo total.
            // =================================================

            valorParcela =
                parseFloat(
                    paymentData
                        .transaction_details
                        ?.installment_amount ??
                    0
                ) ||
                0;


            if (
                !valorParcela &&
                parcelas >
                    0
            ) {

                valorParcela =
                    totalPago /
                    parcelas;
            }


            // =================================================
            // TEXTO
            // =================================================

            if (
                parcelas ===
                1
            ) {

                parcelamentoNome =
                    '1x (À vista)';

            } else {

                parcelamentoNome =
                    `${parcelas}x de R$ ${valorParcela.toFixed(2)}`;
            }
        }


        // =====================================================
        // LOG
        // =====================================================

        console.log(
            '💳 PAGAMENTO IDENTIFICADO:',
            {

                paymentId,

                metodoPagamentoId,

                tipoPagamento,

                metodoPagamentoNome,

                parcelas,

                valorParcela,

                parcelamentoNome
            }
        );


        // =====================================================
        // MENOR VALOR ENTRE ML E MP
        // =====================================================

        let valorProdutoFinal =
            valorVenda;


        let fonte =
            'venda';


        if (
            valorProdutoMP >
                0 &&
            valorVenda >
                0
        ) {

            valorProdutoFinal =
                Math.min(
                    valorProdutoMP,
                    valorVenda
                );


            fonte =
                valorProdutoMP <=
                valorVenda

                    ? 'mercado_pago'

                    : 'venda';

        } else if (
            valorProdutoMP >
                0
        ) {

            valorProdutoFinal =
                valorProdutoMP;


            fonte =
                'mercado_pago';

        } else if (
            valorVenda >
                0
        ) {

            valorProdutoFinal =
                valorVenda;


            fonte =
                'venda';
        }


        // =====================================================
        // LOG FINAL
        // =====================================================

        console.log(
            `✅ VALOR FINAL NF-e: R$ ${valorProdutoFinal.toFixed(2)}`
        );


        console.log(
            `💳 Método: ${metodoPagamentoNome}`
        );


        if (
            parcelamentoNome
        ) {

            console.log(
                `💳 Parcelamento: ${parcelamentoNome}`
            );
        }


        console.log(
            `📦 Frete: R$ ${valorFrete.toFixed(2)} - NÃO descontado`
        );


        // =====================================================
        // RETORNO
        // =====================================================

        return {

            // =============================================
            // VALORES
            // =============================================

            valor_produto:
                valorProdutoFinal,


            valor_frete:
                valorFrete,


            total_pago:
                totalPago,


            desconto_cupom:
                descontoCupom,


            fonte:
                fonte,


            valor_venda:
                valorVenda,


            valor_mp:
                valorProdutoMP,


            // =============================================
            // PAGAMENTO
            // =============================================

            payment_id:
                paymentId,


            metodo_pagamento_id:
                metodoPagamentoId ||
                null,


            tipo_pagamento:
                tipoPagamento ||
                null,


            metodo_pagamento_nome:
                metodoPagamentoNome,


            // =============================================
            // PARCELAMENTO
            // =============================================

            parcelas:
                parcelas,


            parcelamento_nome:
                parcelamentoNome,


            valor_parcela:
                valorParcela
        };


    } catch (
        error
    ) {

        console.error(
            '❌ Erro ao buscar valor no Mercado Pago:',
            error
        );


        return null;
    }
}

// =========================================================
// CANCELAR NF-e - SISTEMA + SEFAZ
// =========================================================

async function cancelarNFESistema(chaveAcesso) {

    console.log(
        '🔵 [cancelarNFESistema] FUNÇÃO INICIADA'
    );

    // =====================================================
    // VALIDAR CHAVE
    // =====================================================

    if (!chaveAcesso) {

        chaveAcesso = prompt(
            'Digite a chave da NF-e (44 dígitos) que deseja cancelar:'
        );

        if (!chaveAcesso) {

            showToast(
                '❌ Operação cancelada',
                'warning'
            );

            return;
        }
    }

    chaveAcesso =
        String(chaveAcesso)
            .replace(/\D/g, '')
            .trim();

    if (chaveAcesso.length !== 44) {

        showToast(
            '❌ Chave de acesso inválida. A chave deve possuir 44 dígitos.',
            'error'
        );

        return;
    }

    try {

        // =====================================================
        // 1. BUSCAR NF-e
        // =====================================================

        const listResponse =
            await fetch(
                `${window.API_BASE_URL}/nfe/listar-nfes`
            );

        const listData =
            await listResponse.json();

        if (
            !listResponse.ok ||
            !listData.success ||
            !Array.isArray(listData.notas)
        ) {

            throw new Error(
                listData.error ||
                'Não foi possível listar as NF-es.'
            );
        }

        const nfe =
            listData.notas.find(
                nota =>
                    String(
                        nota.chave_acesso ||
                        nota.chave ||
                        ''
                    ).replace(/\D/g, '') ===
                    chaveAcesso
            );

        if (!nfe) {

            showToast(
                `❌ NF-e ${chaveAcesso} não encontrada.`,
                'error'
            );

            return;
        }

        // =====================================================
        // DADOS DA NF-e
        // =====================================================

        const vendaId =
            nfe.venda_id ||
            nfe.venda_id_ml ||
            nfe.id_venda ||
            'N/A';

        const cliente =
            nfe.cliente_nome ||
            nfe.cliente?.nome ||
            'N/A';

        const valor =
            Number.isFinite(
                Number(nfe.valor_total)
            )
                ? Number(
                    nfe.valor_total
                ).toFixed(2)
                : 'N/A';

        const protocolo =
            nfe.protocolo ||
            'Não informado';

        // =====================================================
        // DATA DE EMISSÃO
        // =====================================================

        let dataEmissao =
            'Não informada';

        if (nfe.data_emissao) {

            try {

                let valorData =
                    String(
                        nfe.data_emissao
                    ).trim();

                /*
                 * Caso o Supabase/Postgres tenha devolvido
                 * timestamp UTC sem Z, considera UTC.
                 *
                 * Exemplo:
                 * 2026-08-13T13:09:55
                 *
                 * passa para:
                 * 2026-08-13T13:09:55Z
                 */

                if (
                    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/
                        .test(valorData)
                ) {

                    valorData += 'Z';
                }

                const data =
                    new Date(valorData);

                if (
                    !Number.isNaN(
                        data.getTime()
                    )
                ) {

                    dataEmissao =
                        data.toLocaleString(
                            'pt-BR',
                            {
                                timeZone:
                                    'America/Sao_Paulo',

                                day:
                                    '2-digit',

                                month:
                                    '2-digit',

                                year:
                                    'numeric',

                                hour:
                                    '2-digit',

                                minute:
                                    '2-digit',

                                second:
                                    '2-digit'
                            }
                        );
                }

            } catch (erroData) {

                console.warn(
                    '⚠️ Erro ao formatar data da NF-e:',
                    erroData
                );
            }
        }

        // =====================================================
        // 2. JÁ CANCELADA
        // =====================================================

        if (nfe.cancelada) {

            showToast(
                '⚠️ Esta NF-e já está cancelada.',
                'warning'
            );

            return;
        }

        // =====================================================
        // 3. CONFIRMAÇÃO
        // =====================================================

        const mensagem = `📋 CONFIRMAR CANCELAMENTO DA NF-e:

🔑 Chave: ${chaveAcesso}
🆔 Venda: ${vendaId}
👤 Cliente: ${cliente}
💰 Valor: R$ ${valor}
📅 Data Emissão: ${dataEmissao}
📋 Protocolo: ${protocolo}

⚠️ ATENÇÃO:
- O cancelamento será enviado à SEFAZ
- A NF-e será cancelada de forma definitiva
- O estoque será restaurado
- A venda voltará para pendentes

Deseja realmente CANCELAR esta NF-e?`;

        if (!confirm(mensagem)) {

            showToast(
                '❌ Cancelamento cancelado',
                'warning'
            );

            return;
        }

        // =====================================================
        // 4. JUSTIFICATIVA
        // =====================================================

        let justificativa =
            prompt(
                'Digite a justificativa para o cancelamento:\n\n' +
                'Exemplo: Erro no preenchimento da NF-e.'
            );

        if (!justificativa) {

            showToast(
                '❌ Justificativa obrigatória.',
                'warning'
            );

            return;
        }

        justificativa =
            justificativa.trim();

        if (
            justificativa.length <
            15
        ) {

            showToast(
                '❌ A justificativa deve possuir pelo menos 15 caracteres.',
                'warning'
            );

            return;
        }

        // =====================================================
        // 5. LOADING
        // =====================================================

        showToast(
            '🔄 Cancelando NF-e na SEFAZ...',
            'info'
        );

        const btn =
            document.querySelector(
                `button[onclick*="cancelarNFESistema('${chaveAcesso}')"]`
            );

        let originalText =
            '';

        if (btn) {

            originalText =
                btn.innerHTML;

            btn.innerHTML =
                '<span class="spinner"></span> Cancelando...';

            btn.disabled =
                true;
        }

        try {

            // =================================================
            // 6. CHAMAR BACKEND
            // =================================================

            console.log(
                '📤 Enviando cancelamento:',
                {
                    chaveAcesso,
                    justificativa,
                    vendaId,
                    protocolo
                }
            );

            const response =
                await fetch(
                    `${window.API_BASE_URL}/nfe/cancelar`,
                    {
                        method:
                            'POST',

                        headers: {
                            'Content-Type':
                                'application/json'
                        },

                        body:
                            JSON.stringify({
                                chaveAcesso,
                                justificativa
                            })
                    }
                );

            // =================================================
            // LER RETORNO COM SEGURANÇA
            // =================================================

            let result =
                {};

            const textoResposta =
                await response.text();

            try {

                result =
                    textoResposta
                        ? JSON.parse(
                            textoResposta
                        )
                        : {};

            } catch {

                result = {
                    success:
                        false,

                    error:
                        textoResposta ||
                        `Erro HTTP ${response.status}`
                };
            }

            console.log(
                '📥 Retorno cancelamento:',
                result
            );

            // =================================================
            // ERRO
            // =================================================

            if (
                !response.ok ||
                !result.success
            ) {

                const mensagemOriginal =
                    result.error ||
                    result.message ||
                    `Erro HTTP ${response.status}`;

                let mensagemErro =
                    mensagemOriginal;

                const cStatMatch =
                    mensagemOriginal.match(
                        /cStat[=: ]+(\d+)/i
                    );

                const cStat =
                    cStatMatch
                        ? cStatMatch[1]
                        : null;

                // =============================================
                // TRATAMENTO ESPECÍFICO SEFAZ
                // =============================================

                if (cStat === '577') {

                    mensagemErro =
                        'SEFAZ rejeitou o cancelamento (cStat=577).\n\n' +
                        'A data/hora do evento de cancelamento ficou anterior ' +
                        'à data/hora da emissão da NF-e.\n\n' +
                        'Verifique o dhEvento gerado no backend.';
                }

                else if (
                    cStat === '578'
                ) {

                    mensagemErro =
                        'SEFAZ rejeitou o cancelamento (cStat=578).\n\n' +
                        'A data/hora do evento ficou à frente do horário ' +
                        'aceito pela SEFAZ.';
                }

                else if (
                    cStat === '573'
                ) {

                    mensagemErro =
                        'Este evento de cancelamento já foi enviado anteriormente.';
                }

                else if (
                    cStat === '579'
                ) {

                    mensagemErro =
                        'A data do evento ficou anterior à autorização da NF-e.';
                }

                console.error(
                    '❌ Cancelamento rejeitado:',
                    {
                        statusHTTP:
                            response.status,

                        cStat,

                        mensagem:
                            mensagemOriginal
                    }
                );

                showToast(
                    `❌ ${mensagemErro}`,
                    'error'
                );

                return;
            }

            // =================================================
            // 7. SUCESSO NA SEFAZ
            // =================================================

            console.log(
                '✅ NF-e cancelada na SEFAZ:',
                result
            );

            showToast(
                '✅ NF-e cancelada na SEFAZ!',
                'success'
            );

            // =================================================
            // 8. REMOVER / ATUALIZAR SISTEMA
            // =================================================

            await removerNFESistema(
                chaveAcesso
            );

            // =================================================
            // 9. RESTAURAR ESTOQUE
            // =================================================

            if (
                vendaId &&
                vendaId !== 'N/A'
            ) {

                await restaurarEstoqueSistema(
                    vendaId
                );
            }

            // =================================================
            // 10. HISTÓRICO
            // =================================================

            await registrarHistoricoSistema(
                vendaId,
                chaveAcesso,
                justificativa
            );

            // =================================================
            // 11. ATUALIZAR TELAS
            // =================================================

            try {

                await carregarNFesEmitidas();

            } catch (
                error
            ) {

                console.warn(
                    '⚠️ Erro ao atualizar NF-es:',
                    error
                );
            }

            try {

                await carregarVendasPendentes();

            } catch (
                error
            ) {

                console.warn(
                    '⚠️ Erro ao atualizar vendas:',
                    error
                );
            }

            // =================================================
            // 12. AVISO FINAL
            // =================================================

            alert(
`✅ NF-e CANCELADA COM SUCESSO!

📋 Venda: ${vendaId}
🔑 Chave: ${chaveAcesso}

✅ Cancelada na SEFAZ
✅ Estoque restaurado
✅ Venda retornou para pendentes`
            );

        } catch (error) {

            console.error(
                '❌ Erro no cancelamento:',
                error
            );

            showToast(
                `❌ Erro no cancelamento: ${error.message}`,
                'error'
            );

        } finally {

            if (btn) {

                btn.innerHTML =
                    originalText;

                btn.disabled =
                    false;
            }
        }

    } catch (error) {

        console.error(
            '❌ Erro em cancelarNFESistema:',
            error
        );

        showToast(
            `❌ ${error.message}`,
            'error'
        );
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

async function abrirModalEdicaoProdutos(orderId) {

    console.log(
        '🔧 Abrindo modal único de emissão:',
        orderId
    );

    // =====================================================
    // NORMALIZAR ORDER ID
    // =====================================================

    orderId =
        normalizarOrderIdML(
            orderId
        );

    if (
        !orderId ||
        orderId === 'null' ||
        orderId === 'undefined'
    ) {

        showToast(
            '❌ ID da venda inválido',
            'error'
        );

        return;
    }


    // =====================================================
    // REMOVER MODAIS ANTIGOS
    // =====================================================

    const modalClienteAntigo =
        document.getElementById(
            'modalDadosClienteNFE'
        );

    if (
        modalClienteAntigo
    ) {

        modalClienteAntigo.remove();
    }


    const modalAnterior =
        document.getElementById(
            'modalEdicaoProdutos'
        );

    if (
        modalAnterior
    ) {

        modalAnterior.remove();
    }


    // =====================================================
    // ESTADO GLOBAL
    // =====================================================

    vendaIdParaEdicao =
        orderId;

    pendingEmitOrderId =
        orderId;


    // =====================================================
    // TOKEN ML
    // =====================================================

    let token =
        localStorage.getItem(
            'ml_access_token'
        );


    if (
        !token &&
        typeof window.getValidToken ===
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


    try {

        showToast(
            '🔄 Carregando dados da venda...',
            'info'
        );


        // =====================================================
        // LOCALIZAR VENDA ATUAL NA TABELA/CACHE
        // =====================================================

        const vendasDisponiveis =
            Array.isArray(
                vendasPendentes
            )
                ? vendasPendentes
                : [];


        let vendaAtual =
            window._nfeVendaAtual ||
            vendasDisponiveis.find(
                venda =>
                    normalizarOrderIdML(
                        venda.id_venda_ml ||
                        venda.id
                    ) ===
                    orderId
            ) ||
            null;


        // =====================================================
        // HELPERS LOCAIS PACK / SHIPMENT
        // =====================================================

        const obterPackIdLocal =
            venda => {

                if (!venda) {
                    return null;
                }


                if (
                    typeof obterPackIdNFE ===
                    'function'
                ) {

                    const resultado =
                        obterPackIdNFE(
                            venda
                        );

                    if (resultado) {

                        return String(
                            resultado
                        );
                    }
                }


                let json =
                    venda.venda_json ||
                    venda.dados_completos ||
                    {};


                if (
                    typeof json ===
                    'string'
                ) {

                    try {

                        json =
                            JSON.parse(
                                json
                            );

                    } catch {

                        json =
                            {};
                    }
                }


                const packId =
                    venda._pack_id ||
                    venda.pack_id ||
                    json.pack_id ||
                    json.order?.pack_id ||
                    null;


                return (
                    packId !== null &&
                    packId !== undefined &&
                    packId !== ''
                )
                    ? String(
                        packId
                    )
                    : null;
            };


        const obterShipmentIdLocal =
            venda => {

                if (!venda) {
                    return null;
                }


                if (
                    typeof obterShipmentIdNFE ===
                    'function'
                ) {

                    const resultado =
                        obterShipmentIdNFE(
                            venda
                        );

                    if (resultado) {

                        return String(
                            resultado
                        );
                    }
                }


                const info =
                    typeof parseInformacoesEnvioNFE ===
                        'function'
                        ? parseInformacoesEnvioNFE(
                            venda
                        )
                        : {};


                const shipmentId =
                    venda._shipment_id ||
                    venda.shipment_id ||
                    venda.id_envio ||
                    venda.shipping?.id ||
                    info?.id ||
                    null;


                return (
                    shipmentId !== null &&
                    shipmentId !== undefined &&
                    shipmentId !== ''
                )
                    ? String(
                        shipmentId
                    )
                    : null;
            };


        // =====================================================
        // DESCOBRIR TODAS AS ORDERS QUE PERTENCEM À NOTA
        // =====================================================

        let orderIdsDaNFE =
            [];


        // -----------------------------------------------------
        // 1. SE JÁ FOI AGRUPADO NA TABELA
        // -----------------------------------------------------

        if (
            vendaAtual &&
            Array.isArray(
                vendaAtual._order_ids_pack
            ) &&
            vendaAtual._order_ids_pack.length >
                0
        ) {

            orderIdsDaNFE =
                vendaAtual
                    ._order_ids_pack
                    .map(
                        normalizarOrderIdML
                    )
                    .filter(Boolean);
        }


        // -----------------------------------------------------
        // 2. GLOBAL DEFINIDO PELO HANDLER
        // -----------------------------------------------------

        if (
            orderIdsDaNFE.length ===
                0 &&
            Array.isArray(
                window._nfeOrderIdsAtuais
            ) &&
            window._nfeOrderIdsAtuais.length >
                0
        ) {

            orderIdsDaNFE =
                window
                    ._nfeOrderIdsAtuais
                    .map(
                        normalizarOrderIdML
                    )
                    .filter(Boolean);
        }


        // -----------------------------------------------------
        // 3. PROCURAR MESMO PACK/SHIPMENT NAS VENDAS DA TELA
        // -----------------------------------------------------

        if (
            orderIdsDaNFE.length ===
            0
        ) {

            const packIdAtual =
                obterPackIdLocal(
                    vendaAtual
                );


            const shipmentAtual =
                obterShipmentIdLocal(
                    vendaAtual
                );


            if (
                packIdAtual ||
                shipmentAtual
            ) {

                const relacionadas =
                    vendasDisponiveis.filter(
                        venda => {

                            if (
                                detectarVendaFullNFE(
                                    venda
                                )
                            ) {

                                return false;
                            }


                            const id =
                                normalizarOrderIdML(
                                    venda.id_venda_ml ||
                                    venda.id
                                );


                            if (!id) {

                                return false;
                            }


                            const pack =
                                obterPackIdLocal(
                                    venda
                                );


                            const shipment =
                                obterShipmentIdLocal(
                                    venda
                                );


                            if (
                                packIdAtual &&
                                pack
                            ) {

                                return (
                                    pack ===
                                    packIdAtual
                                );
                            }


                            if (
                                shipmentAtual &&
                                shipment
                            ) {

                                return (
                                    shipment ===
                                    shipmentAtual
                                );
                            }


                            return false;
                        }
                    );


                orderIdsDaNFE =
                    relacionadas
                        .map(
                            venda =>
                                normalizarOrderIdML(
                                    venda.id_venda_ml ||
                                    venda.id
                                )
                        )
                        .filter(Boolean);
            }
        }


        // -----------------------------------------------------
        // 4. FALLBACK
        // -----------------------------------------------------

        if (
            orderIdsDaNFE.length ===
            0
        ) {

            orderIdsDaNFE = [
                orderId
            ];
        }


        // Garantir principal
        if (
            !orderIdsDaNFE.includes(
                orderId
            )
        ) {

            orderIdsDaNFE.unshift(
                orderId
            );
        }


        orderIdsDaNFE =
            [
                ...new Set(
                    orderIdsDaNFE
                )
            ];


        window._nfeOrderIdsAtuais =
            orderIdsDaNFE;


        console.log(
            '📦 Orders da mesma NF-e:',
            orderIdsDaNFE
        );


        // =====================================================
        // MEMBROS DO PACK
        // =====================================================

        const membrosPack =
            vendasDisponiveis.filter(
                venda =>
                    orderIdsDaNFE.includes(
                        normalizarOrderIdML(
                            venda.id_venda_ml ||
                            venda.id
                        )
                    )
            );


        if (
            orderIdsDaNFE.length >
            1
        ) {

            window._nfeVendaAtual = {

                ...(vendaAtual || membrosPack[0] || {}),

                _eh_pack:
                    true,

                _order_ids_pack:
                    orderIdsDaNFE,

                _membros_pack:
                    membrosPack
            };

        } else {

            window._nfeVendaAtual =
                vendaAtual ||
                membrosPack[0] ||
                null;
        }


        // =====================================================
        // BUSCAR TODAS AS ORDERS NO ML
        // =====================================================

        const buscarOrderCompleta =
            async id => {

                const url =
                    `https://api.mercadolibre.com/orders/${id}`;


                const proxy =
                    `${window.WORKER_URL}/api/ml/proxy?url=` +
                    `${encodeURIComponent(url)}` +
                    `&token=${encodeURIComponent(token)}`;


                const response =
                    await fetch(
                        proxy,
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


                const venda =
                    await response.json();


                let pagamento =
                    null;


                try {

                    pagamento =
                        await buscarValorExatoPagamento(
                            id
                        );

                } catch (
                    error
                ) {

                    console.warn(
                        `⚠️ Pagamento ${id}:`,
                        error
                    );
                }


                return {

                    id,

                    venda,

                    pagamento
                };
            };


        const orders =
            await Promise.all(

                orderIdsDaNFE.map(
                    buscarOrderCompleta
                )
            );


        console.log(
            '📦 Orders carregadas:',
            orders
        );


        // =====================================================
        // NÃO PERMITIR FULL
        // =====================================================

        const possuiFull =
            orders.some(
                dados =>
                    typeof isFullByAnyField ===
                        'function' &&
                    isFullByAnyField(
                        dados.venda
                    )
            );


        if (
            possuiFull
        ) {

            pendingEmitOrderId =
                null;

            vendaIdParaEdicao =
                null;

            showToast(
                '🚫 Este pacote contém venda FULL e não permite emissão manual.',
                'warning'
            );

            return;
        }


        // =====================================================
        // PRINCIPAL
        // =====================================================

        const principal =
            orders.find(
                item =>
                    item.id ===
                    orderId
            ) ||
            orders[0];


        const venda =
            principal.venda;


        // =====================================================
        // JUNTAR TODOS OS PRODUTOS
        // =====================================================

        const items =
            [];

        let valorTotalProduto =
            0;


        for (
            const dados
            of orders
        ) {

            const order =
                dados.venda;


            const orderItems =
                Array.isArray(
                    order.order_items
                )
                    ? order.order_items
                    : [];


            if (
                orderItems.length ===
                0
            ) {

                continue;
            }


            const totalOriginal =
                orderItems.reduce(
                    (
                        total,
                        item
                    ) =>
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
                        ),
                    0
                );


            const quantidadeOriginal =
                orderItems.reduce(
                    (
                        total,
                        item
                    ) =>
                        total +
                        Number(
                            item.quantity ||
                            1
                        ),
                    0
                );


            let valorOrder =
                Number(
                    dados.pagamento
                        ?.valor_produto ||
                    0
                );


            if (
                valorOrder <=
                0
            ) {

                valorOrder =
                    Number(
                        order.total_amount ||
                        totalOriginal ||
                        0
                    );
            }


            valorTotalProduto +=
                valorOrder;


            for (
                const item
                of orderItems
            ) {

                const quantidade =
                    Number(
                        item.quantity ||
                        1
                    );


                const valorLinhaOriginal =
                    Number(
                        item.unit_price ||
                        0
                    ) *
                    quantidade;


                let valorUnitarioCorrigido =
                    Number(
                        item.unit_price ||
                        0
                    );


                if (
                    valorOrder >
                    0
                ) {

                    if (
                        totalOriginal >
                        0
                    ) {

                        const proporcao =
                            valorLinhaOriginal /
                            totalOriginal;


                        const valorLinhaCorrigido =
                            valorOrder *
                            proporcao;


                        valorUnitarioCorrigido =
                            valorLinhaCorrigido /
                            Math.max(
                                quantidade,
                                1
                            );


                    } else if (
                        quantidadeOriginal >
                        0
                    ) {

                        valorUnitarioCorrigido =
                            valorOrder /
                            quantidadeOriginal;
                    }
                }


                items.push({

                    ...item,

                    _order_id:
                        dados.id,

                    _valor_unitario_corrigido:
                        valorUnitarioCorrigido
                });
            }
        }


        if (
            items.length ===
            0
        ) {

            showToast(
                '⚠️ Nenhum produto encontrado.',
                'warning'
            );

            return;
        }


        console.log(
            '📦 Produtos que entrarão na NF-e:',
            items.map(
                item => ({
                    order:
                        item._order_id,

                    sku:
                        item.item?.seller_sku,

                    quantidade:
                        item.quantity,

                    valor:
                        item._valor_unitario_corrigido
                })
            )
        );


        // =====================================================
        // ENDEREÇO
        // =====================================================

        let address =
            {};


        if (
            venda.shipping?.id
        ) {

            try {

                const shipUrl =
                    `https://api.mercadolibre.com/shipments/${venda.shipping.id}`;


                const proxy =
                    `${window.WORKER_URL}/api/ml/proxy?url=` +
                    `${encodeURIComponent(shipUrl)}` +
                    `&token=${encodeURIComponent(token)}`;


                const response =
                    await fetch(
                        proxy
                    );


                if (
                    response.ok
                ) {

                    const shipment =
                        await response.json();


                    address =
                        shipment.receiver_address ||
                        {};
                }


            } catch (
                error
            ) {

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
                venda.buyer.address;
        }


        // =====================================================
        // BILLING INFO
        // =====================================================

        let billingInfo =
            {};


        try {

            const billingUrl =
                `https://api.mercadolibre.com/orders/${orderId}/billing_info`;


            const proxy =
                `${window.WORKER_URL}/api/ml/proxy?url=` +
                `${encodeURIComponent(billingUrl)}` +
                `&token=${encodeURIComponent(token)}`;


            const response =
                await fetch(
                    proxy
                );


            if (
                response.ok
            ) {

                const resultado =
                    await response.json();


                billingInfo =
                    resultado?.billing_info ||
                    resultado ||
                    {};
            }


        } catch (
            error
        ) {

            console.warn(
                '⚠️ Billing info:',
                error
            );
        }


        // =====================================================
        // ADDITIONAL INFO
        // =====================================================

        const infoExtra =
            {};


        if (
            Array.isArray(
                billingInfo.additional_info
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
            '';


        const documentoCliente =
            String(

                infoExtra.DOC_NUMBER ||

                billingInfo.doc_number ||

                billingInfo.document_number ||

                billingInfo.identification
                    ?.number ||

                buyer.identification
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
            address.address_line ||
            address.street_name ||
            infoExtra.STREET_NAME ||
            '';


        let numero =
            address.street_number ||
            infoExtra.STREET_NUMBER ||
            'S/N';


        if (
            logradouro &&
            numero &&
            numero !== 'S/N'
        ) {

            const numeroEscapado =
                String(
                    numero
                ).replace(
                    /[.*+?^${}()|[\]\\]/g,
                    '\\$&'
                );


            const pattern =
                new RegExp(
                    `\\s*[,.]?\\s*${numeroEscapado}\\s*$`
                );


            logradouro =
                logradouro
                    .replace(
                        pattern,
                        ''
                    )
                    .replace(
                        /,\s*$/,
                        ''
                    )
                    .trim();
        }


        const bairro =
            address.neighborhood?.name ||
            address.neighborhood ||
            infoExtra.NEIGHBORHOOD ||
            '';


        const cidade =
            address.city?.name ||
            address.city ||
            infoExtra.CITY_NAME ||
            infoExtra.CITY ||
            '';


        const ufOriginal =
            address.state?.name ||
            address.state ||
            infoExtra.STATE_NAME ||
            infoExtra.STATE ||
            '';


        const uf =
            mapearUF(
                ufOriginal
            );


        const cep =
            String(
                address.zip_code ||
                infoExtra.ZIP_CODE ||
                ''
            )
                .replace(
                    /\D/g,
                    ''
                );


        // =====================================================
        // NCM
        // =====================================================

        const ncmPorSku =
            {};


        const skus =
            [
                ...new Set(

                    items
                        .map(
                            item =>
                                item.item
                                    ?.seller_sku
                        )
                        .filter(Boolean)
                )
            ];


        if (
            skus.length >
            0
        ) {

            try {

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


            } catch (
                error
            ) {

                console.warn(
                    '⚠️ NCM:',
                    error
                );
            }
        }


        // =====================================================
        // PRODUTOS EDITÁVEIS
        // =====================================================

        produtosEditados =
            items.map(
                item => {

                    const sku =
                        item.item
                            ?.seller_sku ||
                        'SEM_SKU';


                    return {

                        nome:
                            item.item
                                ?.title ||
                            'Produto',

                        quantidade:
                            Number(
                                item.quantity ||
                                1
                            ),

                        valor_unitario:
                            Number(
                                item._valor_unitario_corrigido ??
                                item.unit_price ??
                                0
                            ),

                        sku,

                        ncm:
                            ncmPorSku[sku] ||
                            '87149990',

                        _order_id:
                            item._order_id,

                        _valor_original:
                            Number(
                                item.unit_price ||
                                0
                            )
                    };
                }
            );


        // =====================================================
        // CORRIGIR CENTAVOS NO TOTAL
        // =====================================================

        const totalCalculado =
            produtosEditados.reduce(
                (
                    total,
                    produto
                ) =>
                    total +
                    (
                        Number(
                            produto.valor_unitario ||
                            0
                        ) *
                        Number(
                            produto.quantidade ||
                            1
                        )
                    ),
                0
            );


        const diferenca =
            valorTotalProduto -
            totalCalculado;


        if (
            Math.abs(
                diferenca
            ) >=
                0.005 &&
            produtosEditados.length >
                0
        ) {

            const ultimo =
                produtosEditados[
                    produtosEditados.length -
                    1
                ];


            ultimo.valor_unitario +=
                diferenca /
                Math.max(
                    Number(
                        ultimo.quantidade ||
                        1
                    ),
                    1
                );
        }


        // =====================================================
        // ESCAPAR HTML
        // =====================================================

        const esc =
            valor =>
                String(
                    valor ??
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


        const textoOrders =
            orderIdsDaNFE.length >
                1
                ? `Pacote com ${orderIdsDaNFE.length} pedidos: ${orderIdsDaNFE.join(' / ')}`
                : `Venda Mercado Livre: ${orderId}`;


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
                        align-items:center;
                        margin-bottom:18px;
                    "
                >

                    <div>

                        <h3 style="margin:0;">
                            <i class="fas fa-file-invoice"></i>
                            Emitir NF-e
                        </h3>

                        <small style="color:#6c757d;">
                            ${esc(textoOrders)}
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


                ${
                    orderIdsDaNFE.length > 1
                        ? `
                            <div
                                style="
                                    background:#e8f4ff;
                                    border:1px solid #b8daff;
                                    padding:10px 14px;
                                    border-radius:7px;
                                    margin-bottom:15px;
                                    color:#004085;
                                "
                            >
                                <strong>
                                    📦 Pacote Mercado Livre
                                </strong>

                                <br>

                                Os ${orderIdsDaNFE.length} pedidos abaixo serão emitidos em
                                <strong>uma única NF-e</strong>.
                            </div>
                        `
                        : ''
                }


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
                    style="margin-bottom:22px;"
                >

                    <table
                        class="table table-striped"
                        style="min-width:980px;"
                    >

                        <thead>

                            <tr>
                                <th>Nome do produto</th>
                                <th>SKU</th>
                                <th>Qtd</th>
                                <th>Valor unit.</th>
                                <th>NCM</th>
                                <th>Subtotal</th>
                            </tr>

                        </thead>


                        <tbody
                            id="produtosEditaveisBody"
                        >

                            ${
                                produtosEditados
                                    .map(
                                        (
                                            produto,
                                            index
                                        ) => `

                                        <tr
                                            data-index="${index}"
                                        >

                                            <td>

                                                <input
                                                    type="text"
                                                    class="form-control form-control-sm nome-produto"
                                                    data-index="${index}"
                                                    value="${esc(produto.nome)}"
                                                >

                                            </td>

                                            <td>

                                                <input
                                                    type="text"
                                                    class="form-control form-control-sm sku-produto"
                                                    data-index="${index}"
                                                    value="${esc(produto.sku)}"
                                                >

                                            </td>

                                            <td>

                                                <input
                                                    type="number"
                                                    class="form-control form-control-sm qtd-produto"
                                                    data-index="${index}"
                                                    value="${produto.quantidade}"
                                                    min="0.01"
                                                    step="0.01"
                                                >

                                            </td>

                                            <td>

                                                <input
                                                    type="number"
                                                    class="form-control form-control-sm valor-produto"
                                                    data-index="${index}"
                                                    value="${produto.valor_unitario.toFixed(2)}"
                                                    min="0"
                                                    step="0.01"
                                                >

                                            </td>

                                            <td>

                                                <input
                                                    type="text"
                                                    class="form-control form-control-sm ncm-produto"
                                                    data-index="${index}"
                                                    value="${esc(produto.ncm)}"
                                                    maxlength="8"
                                                >

                                            </td>

                                            <td
                                                class="subtotal-produto"
                                            >
                                                R$
                                                ${(produto.quantidade * produto.valor_unitario).toFixed(2)}
                                            </td>

                                        </tr>

                                    `
                                    )
                                    .join(
                                        ''
                                    )
                            }

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
                                    style="text-align:right;"
                                >
                                    Total da Nota:
                                </td>

                                <td
                                    id="totalGeralProdutos"
                                >
                                    R$
                                    ${
                                        produtosEditados
                                            .reduce(
                                                (
                                                    total,
                                                    produto
                                                ) =>
                                                    total +
                                                    (
                                                        Number(
                                                            produto.quantidade ||
                                                            0
                                                        ) *
                                                        Number(
                                                            produto.valor_unitario ||
                                                            0
                                                        )
                                                    ),
                                                0
                                            )
                                            .toFixed(
                                                2
                                            )
                                    }
                                </td>

                            </tr>

                        </tfoot>

                    </table>

                </div>


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
                            display:flex;
                            align-items:center;
                            gap:8px;
                        "
                    >
                        <i class="fas fa-user"></i>
                        Dados do cliente
                    </h4>


                    <div
                        style="
                            display:grid;
                            grid-template-columns:repeat(12, 1fr);
                            gap:12px;
                            align-items:end;
                        "
                    >

                        <div style="grid-column:span 8;">

                            <label
                                style="
                                    display:block;
                                    font-weight:600;
                                    margin-bottom:5px;
                                "
                            >
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


                        <div style="grid-column:span 4;">

                            <label
                                style="
                                    display:block;
                                    font-weight:600;
                                    margin-bottom:5px;
                                "
                            >
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


                        <div style="grid-column:span 6;">

                            <label
                                style="
                                    display:block;
                                    font-weight:600;
                                    margin-bottom:5px;
                                "
                            >
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


                        <div style="grid-column:span 2;">

                            <label
                                style="
                                    display:block;
                                    font-weight:600;
                                    margin-bottom:5px;
                                "
                            >
                                Número
                            </label>

                            <input
                                type="text"
                                id="clienteNumero"
                                class="form-control"
                                value="${esc(numero || 'S/N')}"
                            >

                        </div>


                        <div style="grid-column:span 4;">

                            <label
                                style="
                                    display:block;
                                    font-weight:600;
                                    margin-bottom:5px;
                                "
                            >
                                Bairro
                            </label>

                            <input
                                type="text"
                                id="clienteBairro"
                                class="form-control"
                                value="${esc(bairro)}"
                            >

                        </div>


                        <div style="grid-column:span 6;">

                            <label
                                style="
                                    display:block;
                                    font-weight:600;
                                    margin-bottom:5px;
                                "
                            >
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


                        <div style="grid-column:span 2;">

                            <label
                                style="
                                    display:block;
                                    font-weight:600;
                                    margin-bottom:5px;
                                "
                            >
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


                        <div style="grid-column:span 4;">

                            <label
                                style="
                                    display:block;
                                    font-weight:600;
                                    margin-bottom:5px;
                                "
                            >
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


                <h4>
    <i class="fas fa-receipt"></i>
    Dados fiscais e transporte
</h4>


<div class="row">

    <!-- CFOP -->
    <div class="col-md-4">

        <div class="form-group">

            <label>
                CFOP *
            </label>

            <select
                id="nfeCfop"
                class="form-control"
                required
            >

                <option value="6108">
                    6108 - Venda interestadual
                </option>

                <option value="5102">
                    5102 - Venda dentro do estado
                </option>

                <option value="5405">
                    5405 - Venda de produção
                </option>

            </select>

        </div>

    </div>


    <!-- NATUREZA DA OPERAÇÃO -->
    <div class="col-md-4">

        <div class="form-group">

            <label>
                Natureza da Operação *
            </label>

            <select
                id="nfeNaturezaOperacao"
                class="form-control"
                required
            >

                <option value="">
                    Carregando Naturezas...
                </option>

            </select>

        </div>

    </div>


    <!-- TRANSPORTADORA -->
    <div class="col-md-4">

        <div class="form-group">

            <label>
                Transportadora
            </label>

            <select
                id="nfeTransportadora"
                class="form-control"
            >

                <option value="">
                    Selecione uma transportadora
                </option>

            </select>

        </div>

    </div>

</div>


                <div
                    class="d-flex justify-content-end gap-2 mt-3"
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


        const container =
            document.createElement(
                'div'
            );


        container.innerHTML =
            modalHTML;


        document.body.appendChild(
            container.firstElementChild
        );


        // =====================================================
        // CFOP SUGERIDO
        // =====================================================

        const cfopSelect =
            document.getElementById(
                'nfeCfop'
            );


        if (
            cfopSelect
        ) {

            cfopSelect.value =
                uf === 'PR'
                    ? '5102'
                    : '6108';
        }


        // =====================================================
        // TRANSPORTADORAS
        // =====================================================

        try {

            await carregarTransportadorasSelect();

        } catch (
            error
        ) {

            console.warn(
                '⚠️ Transportadoras:',
                error
            );
        }

        // =====================================================
        // CARREGAR NATUREZAS DA OPERAÇÃO
        // =====================================================

        try {

            await preencherSelectNaturezaNFE(
                'nfeNaturezaOperacao',
                'ml'
            );

        } catch (
            error
        ) {

            console.warn(
                '⚠️ Erro carregando Naturezas:',
                error
            );
        }


        window._mlAccessToken =
            token;


        // =====================================================
        // RECALCULAR
        // =====================================================

        const recalcularTotalGeral =
            () => {

                let total =
                    0;


                produtosEditados.forEach(
                    produto => {

                        total +=
                            Number(
                                produto.quantidade ||
                                0
                            ) *
                            Number(
                                produto.valor_unitario ||
                                0
                            );
                    }
                );


                const totalCell =
                    document.getElementById(
                        'totalGeralProdutos'
                    );


                if (
                    totalCell
                ) {

                    totalCell.textContent =
                        `R$ ${total.toFixed(2)}`;
                }
            };


        // =====================================================
        // INPUTS
        // =====================================================

        document
            .querySelectorAll(
                `
                #modalEdicaoProdutos .nome-produto,
                #modalEdicaoProdutos .sku-produto,
                #modalEdicaoProdutos .qtd-produto,
                #modalEdicaoProdutos .valor-produto,
                #modalEdicaoProdutos .ncm-produto
                `
            )
            .forEach(
                input => {

                    input.addEventListener(
                        'input',
                        function () {

                            const index =
                                Number(
                                    this.dataset.index
                                );


                            const row =
                                this.closest(
                                    'tr'
                                );


                            if (
                                !row ||
                                !produtosEditados[index]
                            ) {

                                return;
                            }


                            const produto =
                                produtosEditados[index];


                            produto.nome =
                                row.querySelector(
                                    '.nome-produto'
                                )?.value.trim() ||
                                'Produto';


                            produto.sku =
                                row.querySelector(
                                    '.sku-produto'
                                )?.value.trim() ||
                                'SEM_SKU';


                            produto.quantidade =
                                parseFloat(
                                    row.querySelector(
                                        '.qtd-produto'
                                    )?.value
                                ) ||
                                0;


                            produto.valor_unitario =
                                parseFloat(
                                    row.querySelector(
                                        '.valor-produto'
                                    )?.value
                                ) ||
                                0;


                            produto.ncm =
                                row.querySelector(
                                    '.ncm-produto'
                                )?.value.trim() ||
                                '87149990';


                            const subtotal =
                                row.querySelector(
                                    '.subtotal-produto'
                                );


                            if (
                                subtotal
                            ) {

                                subtotal.textContent =
                                    `R$ ${(produto.quantidade * produto.valor_unitario).toFixed(2)}`;
                            }


                            recalcularTotalGeral();
                        }
                    );
                }
            );


        // =====================================================
        // BOTÃO
        // =====================================================

        document
            .getElementById(
                'confirmarProdutosFinalBtn'
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
            `✅ Modal carregado com ${orderIdsDaNFE.length} order(s) e ${produtosEditados.length} produto(s)`
        );


    } catch (
        error
    ) {

        console.error(
            '❌ Erro ao abrir modal:',
            error
        );


        showToast(
            `❌ Erro ao carregar emissão: ${error.message}`,
            'error'
        );


        pendingEmitOrderId =
            null;

        vendaIdParaEdicao =
            null;

        window._nfeOrderIdsAtuais =
            null;

        window._nfeVendaAtual =
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
            <th>Pagamento</th>
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

        console.log(
            '🔎 [NFE] Verificando estoque da venda:',
            {
                id:
                    venda.id_venda_ml ||
                    venda.id,

                sku:
                    venda.sku,

                eh_kit:
                    venda.eh_kit,

                skus_kit:
                    venda.skus_kit
            }
        );


        let itensParaVerificar =
            [];


        // =====================================================
        // FUNÇÃO INTERNA
        //
        // RECEBE UM SKU QUE PODE SER:
        //
        // 00100972ROLCXDIR45,3-35-7,3
        //
        // OU:
        //
        // 00100872ROL-S16250000.00200972ROLCXDIR45,3-35-7,3
        //
        // E TRANSFORMA EM PRODUTOS FÍSICOS.
        // =====================================================

        const adicionarSku =
            (
                skuOriginal,
                quantidadeBase = 1
            ) => {

                quantidadeBase =
                    Number(
                        quantidadeBase ||
                        1
                    );


                if (
                    !skuOriginal ||
                    skuOriginal ===
                        'SEM_SKU' ||
                    skuOriginal ===
                        'N/A'
                ) {

                    itensParaVerificar.push({

                        sku:
                            'SEM_SKU',

                        sku_original:
                            skuOriginal ||
                            'SEM_SKU',

                        quantidade_venda:
                            quantidadeBase
                    });

                    return;
                }


                // =============================================
                // ESTA FUNÇÃO JÁ EXISTE NO SEU CÓDIGO
                //
                // Ela:
                // - separa pelo ponto
                // - lê os 3 primeiros caracteres
                // - remove o prefixo
                // - calcula a quantidade
                // =============================================

                const componentes =
                    decomporSkuCompostoNFE(
                        skuOriginal,
                        quantidadeBase
                    );


                if (
                    componentes.length ===
                    0
                ) {

                    itensParaVerificar.push({

                        sku:
                            'SEM_SKU',

                        sku_original:
                            skuOriginal,

                        quantidade_venda:
                            quantidadeBase
                    });

                    return;
                }


                for (
                    const componente
                    of componentes
                ) {

                    itensParaVerificar.push({

                        ...componente,

                        quantidade_venda:
                            Number(
                                componente
                                    .quantidade_venda ||
                                1
                            )
                    });
                }
            };


        // =====================================================
        // 1. KIT JÁ CONFIGURADO NA ABA VENDAS ML
        // =====================================================

        if (
            venda.eh_kit &&
            Array.isArray(
                venda.skus_kit
            ) &&
            venda.skus_kit.length >
                0
        ) {

            console.log(
                `📦 [NFE] KIT configurado com ${venda.skus_kit.length} item(ns)`
            );


            for (
                const item
                of venda.skus_kit
            ) {

                const quantidadeBase =
                    Number(
                        item.estoque ||
                        item.quantidade ||
                        1
                    ) *
                    Number(
                        venda.quantidade ||
                        venda.quantity ||
                        1
                    );


                adicionarSku(
                    item.sku,
                    quantidadeBase
                );
            }


        // =====================================================
        // 2. SKU DIRETO DA VENDA
        //
        // PODE SER SIMPLES OU COMPOSTO.
        // =====================================================

        } else if (
            venda.sku &&
            venda.sku !==
                'SEM_SKU'
        ) {

            adicionarSku(

                venda.sku,

                Number(
                    venda.quantidade ||
                    venda.quantity ||
                    1
                )
            );


        // =====================================================
        // 3. FALLBACK PARA ORDER_ITEMS DO MERCADO LIVRE
        // =====================================================

        } else if (
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

                adicionarSku(

                    item.item
                        ?.seller_sku,

                    Number(
                        item.quantity ||
                        1
                    )
                );
            }
        }


        console.log(
            '🧩 [NFE] Componentes identificados:',
            itensParaVerificar
        );


        // =====================================================
        // NENHUM PRODUTO IDENTIFICADO
        // =====================================================

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
        // CONSOLIDAR PRODUTOS REPETIDOS
        //
        // A CHAVE É SEMPRE OS 8 PRIMEIROS CARACTERES.
        //
        // Ex.:
        // 001ABC...
        // 001ABC...
        //
        // Soma as quantidades.
        // =====================================================

        const mapaProdutos =
            new Map();


        let contadorSemSku =
            0;


        for (
            const item
            of itensParaVerificar
        ) {

            if (
                !item.sku ||
                item.sku ===
                    'SEM_SKU' ||
                item.sku ===
                    'N/A'
            ) {

                mapaProdutos.set(
                    `SEM_SKU_${contadorSemSku++}`,
                    {
                        ...item
                    }
                );

                continue;
            }


            const chave =
                chaveCadastroSkuNFE(
                    item.sku
                );


            if (
                mapaProdutos.has(
                    chave
                )
            ) {

                const existente =
                    mapaProdutos.get(
                        chave
                    );


                existente
                    .quantidade_venda +=
                    Number(
                        item.quantidade_venda ||
                        0
                    );


                existente
                    .skus_origem =
                    [
                        ...(
                            existente
                                .skus_origem ||
                            [
                                existente
                                    .sku_original
                            ]
                        ),

                        item.sku_original
                    ];


            } else {

                mapaProdutos.set(
                    chave,
                    {
                        ...item,

                        chave_cadastro:
                            chave,

                        quantidade_venda:
                            Number(
                                item.quantidade_venda ||
                                1
                            ),

                        skus_origem:
                            [
                                item.sku_original
                            ]
                    }
                );
            }
        }


        const itensConsolidados =
            [
                ...mapaProdutos.values()
            ];


        console.log(
            '📦 [NFE] Produtos físicos consolidados:',
            itensConsolidados
        );


        // =====================================================
        // CONSULTAR CADA PRODUTO NO CADASTRO
        // =====================================================

        const resultado =
            [];


        for (
            const item
            of itensConsolidados
        ) {

            // =============================================
            // SEM SKU
            // =============================================

            if (
                !item.sku ||
                item.sku ===
                    'SEM_SKU' ||
                item.sku ===
                    'N/A'
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


            // =============================================
            // BUSCAR PELOS 8 PRIMEIROS CARACTERES
            // =============================================

            const {
                produto,
                error
            } =
                await buscarProdutoEstoquePorSkuNFE(
                    item.sku
                );


            if (
                error ||
                !produto
            ) {

                resultado.push({

                    ...item,

                    encontrado:
                        false,

                    motivo:
                        `SKU não cadastrado pela chave ${chaveCadastroSkuNFE(item.sku)}`
                });

                continue;
            }


            // =============================================
            // PRODUTO ENCONTRADO
            //
            // IMPORTANTE:
            // "sku" passa a ser o SKU REAL DO CADASTRO.
            //
            // Isso deixa a baixa, histórico e sync trabalhando
            // com o produto correto.
            // =============================================

            resultado.push({

                ...item,

                sku_detectado:
                    item.sku,

                sku:
                    produto.sku,

                chave_cadastro:
                    chaveCadastroSkuNFE(
                        produto.sku
                    ),

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

                quantidade_venda:
                    Number(
                        item.quantidade_venda ||
                        1
                    )
            });
        }


        // =====================================================
        // TODOS PRECISAM ESTAR CADASTRADOS
        // =====================================================

        const todosEncontrados =
            resultado.length >
                0 &&
            resultado.every(
                item =>
                    item.encontrado ===
                    true
            );


        console.log(
            '✅ [NFE] Resultado final da verificação:',
            {
                status:
                    todosEncontrados
                        ? 'disponivel'
                        : 'sem_cadastro',

                produtos:
                    resultado
            }
        );


        return {

            status:
                todosEncontrados
                    ? 'disponivel'
                    : 'sem_cadastro',

            produtos:
                resultado
        };


    } catch (
        error
    ) {

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

function extrairSkuEQuantidade(
    skuComPrefixo
) {

    if (
        !skuComPrefixo ||
        skuComPrefixo === 'SEM_SKU' ||
        skuComPrefixo === 'N/A'
    ) {

        return {
            sku: skuComPrefixo,
            multiplicador: 1,
            skuOriginal: skuComPrefixo
        };
    }

    const texto =
        String(
            skuComPrefixo
        ).trim();

    const match =
        texto.match(/^(\d{3})(.+)$/);

    if (match) {
        let multiplicador =
            parseInt(
                match[1],
                10
            );

        let skuReal =
            String(match[2] || '').trim();

        if (
            !Number.isFinite(
                multiplicador) ||
            multiplicador <= 0
        ) {

            multiplicador = 1;
        }

        if (
            skuReal.startsWith('/') ||
            skuReal.startsWith('\\')
        ) {

            skuReal = skuReal.substring(1
                );
        }

        return {
            sku: skuReal,
            multiplicador,
            skuOriginal: texto
        };
    }

        return {
            sku: texto,
            multiplicador: 1,
            skuOriginal: texto
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

    const quantidadeAnuncio =
        Number(
            quantidadeVenda ||
            1
        );

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


        resultado.push({

            sku,
            sku_original: parte,
            sku_anuncio:
                String(
                    skuOriginal
                ),

            multiplicador:
                Number(
                    multiplicador ||
                    1
                ),

            quantidade_venda:
                quantidadeAnuncio *
                Number(multiplicador || 1
                )
        });
    }

    return resultado;
}

// =========================================================
// NORMALIZAR SKU PARA CONSULTA NO CADASTRO
// =========================================================

function normalizarSkuCadastroNFE(sku) {

    return String(
        sku || ''
    )
        .trim()
        .toUpperCase();
}


// =========================================================
// CHAVE DO PRODUTO = 8 PRIMEIROS CARACTERES DO SKU REAL
// =========================================================

function chaveCadastroSkuNFE(sku) {

    return normalizarSkuCadastroNFE(
        sku
    ).substring(
        0,
        8
    );
}


// =========================================================
// BUSCAR PRODUTO NO ESTOQUE PELOS 8 PRIMEIROS CARACTERES
// =========================================================

async function buscarProdutoEstoquePorSkuNFE(
    skuFisico
) {

    const skuNormalizado =
        normalizarSkuCadastroNFE(
            skuFisico
        );


    const chave =
        chaveCadastroSkuNFE(
            skuFisico
        );


    if (!chave) {

        return {
            produto: null,
            error: null
        };
    }


    console.log(
        `🔎 [NFE] Buscando produto: SKU=${skuFisico} | chave=${chave}`
    );


    try {

        const {
            data,
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
                    quantidade
                `)
                .ilike(
                    'sku',
                    `${chave}%`
                )
                .limit(
                    50
                );


        if (error) {

            console.error(
                `❌ [NFE] Erro buscando SKU ${skuFisico}:`,
                error
            );

            return {
                produto: null,
                error
            };
        }


        // =====================================================
        // GARANTIR QUE OS 8 PRIMEIROS CARACTERES SÃO IGUAIS
        // =====================================================

        const candidatos =
            (
                Array.isArray(data)
                    ? data
                    : []
            )
                .filter(
                    produto =>
                        chaveCadastroSkuNFE(
                            produto.sku
                        ) ===
                        chave
                );


        if (
            candidatos.length ===
            0
        ) {

            console.warn(
                `⚠️ [NFE] Nenhum produto encontrado para a chave ${chave}`
            );

            return {
                produto: null,
                error: null
            };
        }


        // =====================================================
        // SE EXISTIR O SKU COMPLETO EXATO, ELE TEM PRIORIDADE
        // =====================================================

        const produtoExato =
            candidatos.find(
                produto =>
                    normalizarSkuCadastroNFE(
                        produto.sku
                    ) ===
                    skuNormalizado
            );


        const produto =
            produtoExato ||
            candidatos[0];


        if (
            candidatos.length >
                1 &&
            !produtoExato
        ) {

            console.warn(
                `⚠️ [NFE] Mais de um produto possui a chave ${chave}. Utilizando:`,
                produto
            );
        }


        console.log(
            `✅ [NFE] Produto encontrado pela chave ${chave}:`,
            {
                skuVenda:
                    skuFisico,

                skuCadastro:
                    produto.sku,

                produtoId:
                    produto.id,

                nome:
                    produto.nome,

                quantidade:
                    produto.quantidade
            }
        );


        return {
            produto,
            error: null
        };


    } catch (
        error
    ) {

        console.error(
            `❌ [NFE] Erro inesperado buscando ${skuFisico}:`,
            error
        );


        return {
            produto: null,
            error
        };
    }
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

    garantirEstruturaCadastrosNFE();


    // =====================================================
    // CLIENTES / TRANSPORTADORAS SÃO SOMENTE CONSULTA
    // =====================================================

    removerBotoesCadastroAbasConsultaNFE();


    const nomesAbas = [
        'Vendas',
        'Emitidas',
        'Avulsa',
        'Transportadoras',
        'Clientes',
        'Cadastros'
    ];


    // =====================================================
    // ESCONDER TODAS
    // =====================================================

    nomesAbas.forEach(
        nome => {

            const elemento =
                document.getElementById(
                    `aba${nome}`
                );


            if (
                elemento
            ) {

                elemento
                    .classList
                    .add(
                        'hidden'
                    );
            }
        }
    );


    // =====================================================
    // MOSTRAR ABA
    // =====================================================

    const nomeCapitalizado =
        aba.charAt(0)
            .toUpperCase() +
        aba.slice(1);


    const target =
        document.getElementById(
            `aba${nomeCapitalizado}`
        );


    if (
        target
    ) {

        target
            .classList
            .remove(
                'hidden'
            );
    }


    // =====================================================
    // BOTÕES SUPERIORES
    // =====================================================

    nomesAbas.forEach(
        nome => {

            const btn =
                document.getElementById(
                    `tab${nome}Btn`
                );


            if (!btn) {

                return;
            }


            if (
                nome.toLowerCase() ===
                aba
            ) {

                btn.classList.remove(
                    'btn-outline-primary'
                );

                btn.classList.add(
                    'btn-primary'
                );


            } else {

                btn.classList.remove(
                    'btn-primary'
                );

                btn.classList.add(
                    'btn-outline-primary'
                );
            }
        }
    );


    // =====================================================
    // VENDAS
    // =====================================================

    if (
        aba ===
        'vendas'
    ) {

        inicializarFiltroDataNFE();


        await carregarVendasPendentes(
            false
        );


        return;
    }


    // =====================================================
    // PARAR MONITOR
    // =====================================================

    if (
        typeof pararMonitorVendasNovasNFE ===
        'function'
    ) {

        pararMonitorVendasNovasNFE();
    }


    // =====================================================
    // EMITIDAS
    // =====================================================

    if (
        aba ===
        'emitidas'
    ) {

        await carregarNFesEmitidas();

        return;
    }


    // =====================================================
    // AVULSA
    // =====================================================

    if (
        aba ===
        'avulsa'
    ) {

        await prepararEmissaoAvulsaNFE();

        return;
    }


    // =====================================================
    // TRANSPORTADORAS
    // =====================================================

    if (
        aba ===
        'transportadoras'
    ) {

        await carregarTransportadoras();

        removerBotoesCadastroAbasConsultaNFE();

        return;
    }


    // =====================================================
    // CLIENTES
    // =====================================================

    if (
        aba ===
        'clientes'
    ) {

        await carregarClientes();

        removerBotoesCadastroAbasConsultaNFE();

        return;
    }


    // =====================================================
    // CADASTROS
    // =====================================================

    if (
        aba ===
        'cadastros'
    ) {

        await carregarCadastrosNFE();

        return;
    }
}

// =========================================================
// NF-e AVULSA - ESTRUTURA E CARREGAMENTOS
// =========================================================

window._clientesAvulsaNFE =
    window._clientesAvulsaNFE ||
    [];


// =========================================================
// ESCAPAR HTML
// Independente das funções de Cadastros
// =========================================================

function escaparHTMLAvulsaNFE(valor) {

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


function garantirEstruturaAvulsaNFE() {

    const aba =
        document.getElementById(
            'abaAvulsa'
        );


    if (!aba) {

        console.error(
            '❌ abaAvulsa não encontrada'
        );

        return false;
    }


    // =====================================================
    // CLIENTE PESQUISÁVEL
    // =====================================================

    let campoBusca =
        aba.querySelector(
            '#avulsaClienteBusca'
        );


    if (!campoBusca) {

        const campoClienteAntigo =
            aba.querySelector(
                '#avulsaClienteId'
            );


        if (campoClienteAntigo) {

            const wrapper =
                document.createElement(
                    'div'
                );


            wrapper.id =
                'avulsaClientePesquisaWrapper';


            wrapper.style.cssText = `
                position:relative;
                width:100%;
            `;


            wrapper.innerHTML = `

                <input
                    type="text"
                    id="avulsaClienteBusca"
                    class="form-control"
                    placeholder="Digite o nome, CPF ou CNPJ do cliente..."
                    autocomplete="off"
                >

                <input
                    type="hidden"
                    id="avulsaClienteId"
                    value=""
                >

                <div
                    id="avulsaClienteResultados"
                    style="
                        display:none;
                        position:absolute;
                        top:100%;
                        left:0;
                        right:0;
                        z-index:12000;
                        background:#fff;
                        border:1px solid #ced4da;
                        border-top:none;
                        border-radius:0 0 6px 6px;
                        max-height:300px;
                        overflow-y:auto;
                        box-shadow:0 5px 15px rgba(0,0,0,.15);
                    "
                ></div>

                <div
                    id="avulsaClienteSelecionado"
                    style="
                        display:none;
                        margin-top:8px;
                        padding:10px 12px;
                        background:#eaf7ee;
                        border:1px solid #b9dfc3;
                        border-radius:6px;
                    "
                ></div>
            `;


            campoClienteAntigo.replaceWith(
                wrapper
            );

        } else {

            console.warn(
                '⚠️ Campo de cliente não encontrado'
            );
        }
    }


    // =====================================================
    // CFOP
    //
    // Se atualmente for INPUT, será convertido em SELECT.
    // =====================================================

    garantirSelectAvulsaNFE(
        'avulsaCfop',
        'CFOP *',
        'Carregando CFOPs...'
    );


    // =====================================================
    // NATUREZA DA OPERAÇÃO
    //
    // Se atualmente for INPUT, será convertido em SELECT.
    // =====================================================

    garantirSelectAvulsaNFE(
        'avulsaNatOp',
        'Natureza da Operação *',
        'Carregando Naturezas...'
    );


    // =====================================================
    // TRANSPORTADORA
    // =====================================================

    garantirSelectAvulsaNFE(
        'avulsaTransportadoraId',
        'Transportadora',
        'Carregando transportadoras...'
    );


    // =====================================================
    // MODALIDADE DE FRETE
    // =====================================================

    let modalidade =
        aba.querySelector(
            '#avulsaModFrete'
        );


    if (
        modalidade &&
        modalidade.tagName !==
            'SELECT'
    ) {

        const select =
            document.createElement(
                'select'
            );


        select.id =
            'avulsaModFrete';

        select.className =
            modalidade.className ||
            'form-control';


        select.innerHTML = `

            <option value="9">
                9 - Sem ocorrência de transporte
            </option>

            <option value="0">
                0 - Frete por conta do emitente
            </option>

            <option value="1">
                1 - Frete por conta do destinatário
            </option>

            <option value="2">
                2 - Frete por conta de terceiros
            </option>
        `;


        modalidade.replaceWith(
            select
        );


        modalidade =
            select;
    }


    if (!modalidade) {

        const grupo =
            document.createElement(
                'div'
            );


        grupo.className =
            'form-group';


        grupo.innerHTML = `

            <label>
                Modalidade do Frete
            </label>

            <select
                id="avulsaModFrete"
                class="form-control"
            >

                <option value="9">
                    9 - Sem ocorrência de transporte
                </option>

                <option value="0">
                    0 - Frete por conta do emitente
                </option>

                <option value="1">
                    1 - Frete por conta do destinatário
                </option>

                <option value="2">
                    2 - Frete por conta de terceiros
                </option>

            </select>
        `;


        const produtos =
            aba.querySelector(
                '#avulsaProdutos'
            );


        const grupoProdutos =
            produtos?.closest(
                '.form-group'
            ) ||
            produtos?.parentElement;


        if (
            grupoProdutos &&
            grupoProdutos.parentElement
        ) {

            grupoProdutos
                .parentElement
                .insertBefore(
                    grupo,
                    grupoProdutos
                );

        } else {

            aba.appendChild(
                grupo
            );
        }
    }


    console.log(
        '✅ Estrutura da NF-e avulsa pronta:',
        {
            cliente:
                Boolean(
                    document.getElementById(
                        'avulsaClienteBusca'
                    )
                ),

            cfop:
                document.getElementById(
                    'avulsaCfop'
                )?.tagName,

            natureza:
                document.getElementById(
                    'avulsaNatOp'
                )?.tagName,

            transportadora:
                document.getElementById(
                    'avulsaTransportadoraId'
                )?.tagName
        }
    );


    return true;
}


// =========================================================
// CARREGAR CLIENTES
// =========================================================

async function carregarClientesAvulsaNFE() {

    const busca =
        document.getElementById(
            'avulsaClienteBusca'
        );


    const campoId =
        document.getElementById(
            'avulsaClienteId'
        );


    const resultados =
        document.getElementById(
            'avulsaClienteResultados'
        );


    if (
        !busca ||
        !campoId ||
        !resultados
    ) {

        console.error(
            '❌ Estrutura do cliente avulso não encontrada'
        );

        return false;
    }


    try {

        busca.disabled =
            true;


        busca.placeholder =
            'Carregando clientes...';


        const response =
            await fetch(
                `${window.API_BASE_URL}/nfe/clientes`,
                {
                    method:
                        'GET',

                    headers: {
                        'Accept':
                            'application/json'
                    },

                    cache:
                        'no-store'
                }
            );


        if (!response.ok) {

            throw new Error(
                `HTTP ${response.status}`
            );
        }


        const data =
            await response.json();


        if (
            data.success ===
            false
        ) {

            throw new Error(
                data.error ||
                'Erro ao carregar clientes'
            );
        }


        window._clientesAvulsaNFE =
            Array.isArray(
                data.clientes
            )
                ? data.clientes
                : [];


        busca.disabled =
            false;


        busca.placeholder =
            'Digite o nome, CPF ou CNPJ do cliente...';


        // Remove evento anterior
        busca.oninput =
            null;


        busca.onfocus =
            null;


        // Pesquisa
        busca.oninput =
            function () {

                // Se começar a digitar depois de selecionar,
                // limpar ID selecionado.
                campoId.value =
                    '';


                const selecionado =
                    document.getElementById(
                        'avulsaClienteSelecionado'
                    );


                if (selecionado) {

                    selecionado.style.display =
                        'none';

                    selecionado.innerHTML =
                        '';
                }


                pesquisarClienteAvulsaNFE(
                    this.value
                );
            };


        busca.onfocus =
            function () {

                if (
                    this.value.trim()
                ) {

                    pesquisarClienteAvulsaNFE(
                        this.value
                    );
                }
            };


        console.log(
            `✅ ${window._clientesAvulsaNFE.length} cliente(s) carregado(s)`
        );


        return true;


    } catch (error) {

        console.error(
            '❌ Erro carregando clientes da NF-e avulsa:',
            error
        );


        busca.disabled =
            false;


        busca.placeholder =
            'Erro ao carregar clientes';


        return false;
    }
}


// =========================================================
// PESQUISAR CLIENTE
// =========================================================

function pesquisarClienteAvulsaNFE(
    termo
) {

    const resultados =
        document.getElementById(
            'avulsaClienteResultados'
        );


    if (!resultados) {

        return;
    }


    const texto =
        String(
            termo ||
            ''
        )
            .trim()
            .toLowerCase();


    if (
        texto.length ===
        0
    ) {

        resultados.style.display =
            'none';


        resultados.innerHTML =
            '';


        return;
    }


    const numeros =
        texto.replace(
            /\D/g,
            ''
        );


    const clientes =
        Array.isArray(
            window._clientesAvulsaNFE
        )
            ? window._clientesAvulsaNFE
            : [];


    const filtrados =
        clientes
            .filter(
                cliente => {

                    const nome =
                        String(
                            cliente.nome ||
                            ''
                        )
                            .toLowerCase();


                    const documento =
                        String(
                            cliente.documento ||
                            ''
                        )
                            .replace(
                                /\D/g,
                                ''
                            );


                    const cidade =
                        String(
                            cliente.cidade ||
                            ''
                        )
                            .toLowerCase();


                    return (

                        nome.includes(
                            texto
                        ) ||

                        cidade.includes(
                            texto
                        ) ||

                        (
                            numeros.length >
                                0 &&
                            documento.includes(
                                numeros
                            )
                        )
                    );
                }
            )
            .slice(
                0,
                20
            );


    if (
        filtrados.length ===
        0
    ) {

        resultados.innerHTML = `

            <div
                style="
                    padding:12px;
                    text-align:center;
                    color:#6c757d;
                "
            >
                Nenhum cliente encontrado
            </div>
        `;


        resultados.style.display =
            'block';


        return;
    }


    resultados.innerHTML =
        filtrados
            .map(
                cliente => `

                    <div
                        style="
                            padding:10px 12px;
                            cursor:pointer;
                            border-bottom:1px solid #eee;
                        "
                        onmouseover="
                            this.style.background='#f5f5f5'
                        "
                        onmouseout="
                            this.style.background='#fff'
                        "
                        onclick="
                            selecionarClienteAvulsaNFE(
                                ${Number(cliente.id)}
                            )
                        "
                    >

                        <div
                            style="
                                font-weight:600;
                            "
                        >
                            ${escaparHTMLAvulsaNFE(
                                cliente.nome ||
                                'Cliente'
                            )}
                        </div>


                        <div
                            style="
                                font-size:12px;
                                color:#6c757d;
                            "
                        >

                            ${
                                escaparHTMLAvulsaNFE(
                                    cliente.documento ||
                                    'Sem documento'
                                )
                            }

                            ${
                                cliente.cidade
                                    ? ` • ${escaparHTMLAvulsaNFE(
                                        cliente.cidade
                                    )}/${escaparHTMLAvulsaNFE(
                                        cliente.uf ||
                                        ''
                                    )}`
                                    : ''
                            }

                        </div>

                    </div>
                `
            )
            .join(
                ''
            );


    resultados.style.display =
        'block';
}


// =========================================================
// SELECIONAR CLIENTE
// =========================================================

function selecionarClienteAvulsaNFE(
    clienteId
) {

    const cliente =
        window._clientesAvulsaNFE
            .find(
                item =>
                    String(
                        item.id
                    ) ===
                    String(
                        clienteId
                    )
            );


    if (!cliente) {

        showToast(
            'Cliente não encontrado',
            'warning'
        );

        return;
    }


    const campoId =
        document.getElementById(
            'avulsaClienteId'
        );


    const busca =
        document.getElementById(
            'avulsaClienteBusca'
        );


    const resultados =
        document.getElementById(
            'avulsaClienteResultados'
        );


    const selecionado =
        document.getElementById(
            'avulsaClienteSelecionado'
        );


    if (campoId) {

        campoId.value =
            String(
                cliente.id
            );
    }


    if (busca) {

        busca.value =
            cliente.nome ||
            '';
    }


    if (resultados) {

        resultados.innerHTML =
            '';

        resultados.style.display =
            'none';
    }


    if (selecionado) {

        selecionado.innerHTML = `

            <div
                style="
                    display:flex;
                    align-items:center;
                    justify-content:space-between;
                    gap:10px;
                "
            >

                <div>

                    <strong>
                        <i class="fas fa-check-circle"></i>
                        ${escaparHTMLAvulsaNFE(
                            cliente.nome ||
                            ''
                        )}
                    </strong>

                    <div
                        style="
                            margin-top:3px;
                            color:#6c757d;
                            font-size:12px;
                        "
                    >

                        ${escaparHTMLAvulsaNFE(
                            cliente.documento ||
                            ''
                        )}

                        ${
                            cliente.cidade
                                ? ` • ${escaparHTMLAvulsaNFE(
                                    cliente.cidade
                                )}/${escaparHTMLAvulsaNFE(
                                    cliente.uf ||
                                    ''
                                )}`
                                : ''
                        }

                    </div>

                </div>


                <button
                    type="button"
                    class="btn btn-sm btn-secondary"
                    onclick="limparClienteSelecionadoAvulsaNFE()"
                >
                    Trocar
                </button>

            </div>
        `;


        selecionado.style.display =
            'block';
    }


    console.log(
        '✅ Cliente selecionado:',
        cliente.nome,
        cliente.id
    );
}


// =========================================================
// LIMPAR CLIENTE
// =========================================================

function limparClienteSelecionadoAvulsaNFE() {

    const campoId =
        document.getElementById(
            'avulsaClienteId'
        );


    const busca =
        document.getElementById(
            'avulsaClienteBusca'
        );


    const resultados =
        document.getElementById(
            'avulsaClienteResultados'
        );


    const selecionado =
        document.getElementById(
            'avulsaClienteSelecionado'
        );


    if (campoId) {

        campoId.value =
            '';
    }


    if (busca) {

        busca.value =
            '';

        busca.focus();
    }


    if (resultados) {

        resultados.innerHTML =
            '';

        resultados.style.display =
            'none';
    }


    if (selecionado) {

        selecionado.innerHTML =
            '';

        selecionado.style.display =
            'none';
    }
}


// =========================================================
// CFOP - EXCLUSIVO DA EMISSÃO AVULSA
//
// NÃO DEPENDE DE preencherSelectCFOPNFE()
// =========================================================

async function preencherSelectCFOPAvulsaNFE() {

    const select =
        document.getElementById(
            'avulsaCfop'
        );


    if (!select) {

        console.error(
            '❌ avulsaCfop não encontrado'
        );

        return false;
    }


    try {

        select.disabled =
            true;


        select.innerHTML = `

            <option value="">
                Carregando CFOPs...
            </option>
        `;


        const {
            data,
            error
        } =
            await window
                .supabaseClient
                .from(
                    'nfe_cfops'
                )
                .select(`
                    id,
                    codigo,
                    descricao,
                    ativo,
                    padrao_avulsa
                `)
                .eq(
                    'ativo',
                    true
                )
                .order(
                    'codigo',
                    {
                        ascending:
                            true
                    }
                );


        if (error) {

            throw error;
        }


        const cfops =
            Array.isArray(
                data
            )
                ? data
                : [];


        if (
            cfops.length ===
            0
        ) {

            select.innerHTML = `

                <option value="">
                    Nenhum CFOP ativo cadastrado
                </option>
            `;


            select.disabled =
                false;


            return false;
        }


        select.innerHTML =
            '<option value="">Selecione o CFOP</option>' +

            cfops
                .map(
                    cfop => `

                        <option
                            value="${escaparHTMLAvulsaNFE(
                                cfop.codigo
                            )}"
                        >
                            ${escaparHTMLAvulsaNFE(
                                cfop.codigo
                            )}
                            -
                            ${escaparHTMLAvulsaNFE(
                                cfop.descricao ||
                                ''
                            )}
                        </option>
                    `
                )
                .join(
                    ''
                );


        const padrao =
            cfops.find(
                cfop =>
                    cfop.padrao_avulsa ===
                    true
            ) ||
            cfops[0];


        select.value =
            padrao.codigo;


        select.disabled =
            false;


        console.log(
            '✅ CFOPs avulsos carregados:',
            cfops.length,
            'Padrão:',
            padrao.codigo
        );


        return true;


    } catch (error) {

        console.error(
            '❌ Erro carregando CFOPs avulsos:',
            error
        );


        select.innerHTML = `

            <option value="">
                Erro ao carregar CFOPs
            </option>
        `;


        select.disabled =
            false;


        return false;
    }
}


// =========================================================
// NATUREZA - EXCLUSIVA DA EMISSÃO AVULSA
// =========================================================

async function preencherSelectNaturezaAvulsaNFE() {

    const select =
        document.getElementById(
            'avulsaNatOp'
        );


    if (!select) {

        console.error(
            '❌ avulsaNatOp não encontrado'
        );

        return false;
    }


    try {

        select.disabled =
            true;


        select.innerHTML = `

            <option value="">
                Carregando Naturezas...
            </option>
        `;


        const {
            data,
            error
        } =
            await window
                .supabaseClient
                .from(
                    'nfe_naturezas_operacao'
                )
                .select(`
                    id,
                    descricao,
                    ativo,
                    padrao_avulsa
                `)
                .eq(
                    'ativo',
                    true
                )
                .order(
                    'descricao',
                    {
                        ascending:
                            true
                    }
                );


        if (error) {

            throw error;
        }


        const naturezas =
            Array.isArray(
                data
            )
                ? data
                : [];


        if (
            naturezas.length ===
            0
        ) {

            select.innerHTML = `

                <option value="">
                    Nenhuma Natureza ativa cadastrada
                </option>
            `;


            select.disabled =
                false;


            return false;
        }


        select.innerHTML =
            '<option value="">Selecione a Natureza</option>' +

            naturezas
                .map(
                    natureza => `

                        <option
                            value="${escaparHTMLAvulsaNFE(
                                natureza.descricao
                            )}"
                        >
                            ${escaparHTMLAvulsaNFE(
                                natureza.descricao
                            )}
                        </option>
                    `
                )
                .join(
                    ''
                );


        const padrao =
            naturezas.find(
                natureza =>
                    natureza.padrao_avulsa ===
                    true
            ) ||
            naturezas[0];


        select.value =
            padrao.descricao;


        select.disabled =
            false;


        console.log(
            '✅ Naturezas avulsas carregadas:',
            naturezas.length,
            'Padrão:',
            padrao.descricao
        );


        return true;


    } catch (error) {

        console.error(
            '❌ Erro carregando Naturezas avulsas:',
            error
        );


        select.innerHTML = `

            <option value="">
                Erro ao carregar Naturezas
            </option>
        `;


        select.disabled =
            false;


        return false;
    }
}


// =========================================================
// TRANSPORTADORA - EMISSÃO AVULSA
// =========================================================

async function preencherSelectTransportadoraAvulsaNFE() {

    const select =
        document.getElementById(
            'avulsaTransportadoraId'
        );


    if (!select) {

        console.error(
            '❌ avulsaTransportadoraId não encontrado'
        );

        return false;
    }


    // IMPORTANTE:
    // avulsaTransportadoraId precisa ser SELECT.
    if (
        select.tagName !==
        'SELECT'
    ) {

        console.error(
            '❌ avulsaTransportadoraId existe, mas não é SELECT'
        );

        return false;
    }


    try {

        select.disabled =
            true;


        select.innerHTML = `

            <option value="">
                Carregando transportadoras...
            </option>
        `;


        const response =
            await fetch(
                `${window.API_BASE_URL}/nfe/transportadoras`,
                {
                    method:
                        'GET',

                    headers: {
                        'Accept':
                            'application/json'
                    },

                    cache:
                        'no-store'
                }
            );


        if (!response.ok) {

            throw new Error(
                `HTTP ${response.status}`
            );
        }


        const data =
            await response.json();


        if (
            data.success ===
            false
        ) {

            throw new Error(
                data.error ||
                'Erro ao carregar transportadoras'
            );
        }


        const transportadoras =
            Array.isArray(
                data.transportadoras
            )
                ? data.transportadoras
                : [];


        select.innerHTML = `

            <option value="">
                Sem transportadora
            </option>

            ${
                transportadoras
                    .map(
                        transportadora => `

                            <option
                                value="${Number(
                                    transportadora.id
                                )}"
                            >
                                ${escaparHTMLAvulsaNFE(
                                    transportadora.nome ||
                                    'Transportadora'
                                )}

                                ${
                                    transportadora.cnpj
                                        ? ` - ${escaparHTMLAvulsaNFE(
                                            transportadora.cnpj
                                        )}`
                                        : ''
                                }
                            </option>
                        `
                    )
                    .join(
                        ''
                    )
            }
        `;


        select.disabled =
            false;


        console.log(
            `✅ ${transportadoras.length} transportadora(s) carregada(s) na Avulsa`
        );


        return true;


    } catch (error) {

        console.error(
            '❌ Erro carregando transportadoras avulsas:',
            error
        );


        select.innerHTML = `

            <option value="">
                Erro ao carregar transportadoras
            </option>
        `;


        select.disabled =
            false;


        return false;
    }
}


async function prepararEmissaoAvulsaNFE() {

    console.log(
        '🧾 Preparando NF-e avulsa...'
    );


    try {

        // =================================================
        // ESTRUTURA GERAL
        // =================================================

        const estruturaOk =
            garantirEstruturaAvulsaNFE();


        if (!estruturaOk) {

            throw new Error(
                'Não foi possível preparar a estrutura da emissão avulsa'
            );
        }


        // =================================================
        // ESTRUTURA DE PRODUTOS
        // =================================================

        const produtosOk =
            garantirEstruturaProdutosAvulsaNFE();


        if (!produtosOk) {

            throw new Error(
                'Não foi possível preparar a área de produtos'
            );
        }


        // =================================================
        // CARREGAR DADOS
        // =================================================

        const resultados =
            await Promise.all([

                carregarClientesAvulsaNFE(),

                preencherSelectCFOPAvulsaNFE(),

                preencherSelectNaturezaAvulsaNFE(),

                preencherSelectTransportadoraAvulsaNFE(),

                carregarProdutosAvulsaNFE()
            ]);


        console.log(
            '✅ Emissão avulsa preparada:',
            {
                clientes:
                    resultados[0],

                cfop:
                    resultados[1],

                natureza:
                    resultados[2],

                transportadora:
                    resultados[3],

                produtos:
                    resultados[4]
            }
        );


        return true;


    } catch (
        error
    ) {

        console.error(
            '❌ Erro preparando NF-e avulsa:',
            error
        );


        showToast(
            `Erro ao preparar emissão avulsa: ${error.message}`,
            'error'
        );


        return false;
    }
}

function garantirSelectAvulsaNFE(
    id,
    label,
    textoInicial
) {

    const aba =
        document.getElementById(
            'abaAvulsa'
        );

    if (!aba) {

        console.error(
            '❌ abaAvulsa não encontrada'
        );

        return null;
    }


    let campo =
        aba.querySelector(
            `#${id}`
        );


    // =====================================================
    // JÁ É SELECT
    // =====================================================

    if (
        campo &&
        campo.tagName ===
            'SELECT'
    ) {

        return campo;
    }


    // =====================================================
    // EXISTE, MAS É INPUT
    //
    // Substituir automaticamente por SELECT.
    // =====================================================

    if (campo) {

        console.log(
            `🔧 Convertendo ${id} de ${campo.tagName} para SELECT`
        );


        const valorAnterior =
            campo.value ||
            '';


        const select =
            document.createElement(
                'select'
            );


        select.id =
            id;


        select.className =
            campo.className ||
            'form-control';


        select.name =
            campo.name ||
            '';


        select.innerHTML = `
            <option value="">
                ${textoInicial}
            </option>
        `;


        // Guardar temporariamente
        select.dataset.valorAnterior =
            valorAnterior;


        campo.replaceWith(
            select
        );


        return select;
    }


    // =====================================================
    // CAMPO NÃO EXISTE
    // Criar bloco novo
    // =====================================================

    console.warn(
        `⚠️ ${id} não existe. Criando SELECT...`
    );


    const grupo =
        document.createElement(
            'div'
        );


    grupo.className =
        'form-group';


    grupo.innerHTML = `

        <label>
            ${label}
        </label>

        <select
            id="${id}"
            class="form-control"
        >

            <option value="">
                ${textoInicial}
            </option>

        </select>
    `;


    const produtos =
        aba.querySelector(
            '#avulsaProdutos'
        );


    const grupoProdutos =
        produtos?.closest(
            '.form-group'
        ) ||
        produtos?.parentElement;


    if (
        grupoProdutos &&
        grupoProdutos.parentElement
    ) {

        grupoProdutos
            .parentElement
            .insertBefore(
                grupo,
                grupoProdutos
            );

    } else {

        aba.appendChild(
            grupo
        );
    }


    return grupo.querySelector(
        `#${id}`
    );
}


// =========================================================
// EXPORTAR
// =========================================================

window.escaparHTMLAvulsaNFE = escaparHTMLAvulsaNFE;
window.garantirEstruturaAvulsaNFE = garantirEstruturaAvulsaNFE;
window.carregarClientesAvulsaNFE = carregarClientesAvulsaNFE;
window.pesquisarClienteAvulsaNFE = pesquisarClienteAvulsaNFE;
window.selecionarClienteAvulsaNFE = selecionarClienteAvulsaNFE;
window.limparClienteSelecionadoAvulsaNFE = limparClienteSelecionadoAvulsaNFE;
window.preencherSelectCFOPAvulsaNFE = preencherSelectCFOPAvulsaNFE;
window.preencherSelectNaturezaAvulsaNFE = preencherSelectNaturezaAvulsaNFE;
window.preencherSelectTransportadoraAvulsaNFE = preencherSelectTransportadoraAvulsaNFE;
window.prepararEmissaoAvulsaNFE = prepararEmissaoAvulsaNFE;
window.limparFormAvulsa = limparFormAvulsa;

// =========================================================
// HANDLERS PARA OS BOTÕES DA TABELA
// =========================================================

// Handler para emitir NF-e
function handleEmitirNFEClick(
    event
) {

    const vendaId =
        normalizarOrderIdML(
            event.currentTarget
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
    // LOCALIZAR VENDA QUE ESTÁ NA TELA
    //
    // vendasPendentes já está agrupado.
    // =====================================================

    const venda =
        vendasPendentes.find(
            item =>
                normalizarOrderIdML(
                    item.id_venda_ml ||
                    item.id
                ) ===
                vendaId
        );

    window._nfeVendaAtual =
        venda ||
        null;

    const orderIds =
        venda?._eh_pack
            ? venda._order_ids_pack
            : [
                vendaId
            ];

    window._nfeOrderIdsAtuais =
        [
            ...new Set(

                orderIds
                    .map(
                        normalizarOrderIdML
                    )
                    .filter(Boolean)
            )
        ];

    console.log(
        '🧾 NF-e selecionada:',
        {
            principal:
                vendaId,
            pack:
                Boolean(
                    venda?._eh_pack
                ),
            orders:
                window
                    ._nfeOrderIdsAtuais,
            produtos:
                venda
                    ?.order_items
                    ?.map(
                        item =>
                            item.item
                                ?.seller_sku
                    )
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

function obterPackIdNFE(venda) {

    if (!venda) {
        return null;
    }

    let dadosCompletos =
        venda.dados_completos ||
        venda.venda_json ||
        {};

    if (
        typeof dadosCompletos ===
        'string'
    ) {

        try {
            dadosCompletos =
                JSON.parse(
                    dadosCompletos
                );
        } catch {
            dadosCompletos = {};
        }
    }

    const packId =
        venda._pack_id ||
        venda.pack_id ||
        dadosCompletos.pack_id ||
        dadosCompletos.order?.pack_id ||
        null;

    if (
        packId === null ||
        packId === undefined ||
        packId === ''
    ) {
        return null;
    }

    return String(
        packId
    );
}


function obterShipmentIdNFE(venda) {

    if (!venda) {
        return null;
    }

    const info =
        typeof parseInformacoesEnvioNFE ===
            'function'
            ? parseInformacoesEnvioNFE(
                venda
            )
            : {};

    let dadosCompletos =
        venda.dados_completos ||
        venda.venda_json ||
        {};

    if (
        typeof dadosCompletos ===
        'string'
    ) {

        try {
            dadosCompletos =
                JSON.parse(
                    dadosCompletos
                );
        } catch {
            dadosCompletos = {};
        }
    }

    const shipmentId =
        venda._shipment_id ||
        venda.shipment_id ||
        venda.id_envio ||
        venda.shipping?.id ||
        info?.id ||
        dadosCompletos?.shipping?.id ||
        dadosCompletos?.shipment_id ||
        null;

    if (
        shipmentId === null ||
        shipmentId === undefined ||
        shipmentId === ''
    ) {
        return null;
    }

    return String(
        shipmentId
    );
}


function obterChaveAgrupamentoNFE(
    venda
) {

    const vendaId =
        normalizarOrderIdML(
            venda?.id_venda_ml ||
            venda?.id
        );

    if (!vendaId) {
        return null;
    }

    // FULL não deve entrar no agrupamento manual
    if (
        detectarVendaFullNFE(
            venda
        )
    ) {

        return `order:${vendaId}`;
    }

    const packId =
        obterPackIdNFE(
            venda
        );

    if (packId) {

        return `pack:${packId}`;
    }

    const shipmentId =
        obterShipmentIdNFE(
            venda
        );

    if (shipmentId) {

        return `shipment:${shipmentId}`;
    }

    return `order:${vendaId}`;
}


function obterItensVendaParaPackNFE(
    venda
) {

    const vendaId =
        normalizarOrderIdML(
            venda.id_venda_ml ||
            venda.id
        );

    let items =
        Array.isArray(
            venda.order_items
        )
            ? venda.order_items
            : [];

    // =====================================================
    // FALLBACK
    // =====================================================

    if (
        items.length === 0 &&
        venda.sku
    ) {

        items = [
            {
                quantity:
                    Number(
                        venda.quantidade ||
                        venda.quantity ||
                        1
                    ),

                unit_price:
                    Number(
                        venda._valor_produto ||
                        venda.valor_total ||
                        0
                    ) /
                    Math.max(
                        Number(
                            venda.quantidade ||
                            venda.quantity ||
                            1
                        ),
                        1
                    ),

                item: {
                    seller_sku:
                        venda.sku,

                    title:
                        venda.titulo ||
                        venda.title ||
                        'Produto'
                }
            }
        ];
    }

    // =====================================================
    // VALOR REAL DESTA ORDER
    // =====================================================

    const valorVenda =
        Number(
            venda._valor_produto ??
            venda.valor_produto ??
            venda.valor_total ??
            venda.total_amount ??
            0
        );

    const totalOriginal =
        items.reduce(
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

    const quantidadeTotal =
        items.reduce(
            (
                total,
                item
            ) =>
                total +
                Number(
                    item.quantity ||
                    1
                ),
            0
        );

    return items.map(
        item => {

            let valorUnitarioCorrigido =
                Number(
                    item.unit_price ||
                    0
                );

            if (
                valorVenda > 0
            ) {

                if (
                    totalOriginal > 0
                ) {

                    const proporcao =
                        (
                            Number(
                                item.unit_price ||
                                0
                            ) *
                            Number(
                                item.quantity ||
                                1
                            )
                        ) /
                        totalOriginal;

                    const valorLinha =
                        valorVenda *
                        proporcao;

                    valorUnitarioCorrigido =
                        valorLinha /
                        Math.max(
                            Number(
                                item.quantity ||
                                1
                            ),
                            1
                        );

                } else if (
                    quantidadeTotal > 0
                ) {

                    valorUnitarioCorrigido =
                        valorVenda /
                        quantidadeTotal;
                }
            }

            return {

                ...item,

                _order_id:
                    vendaId,

                _valor_unitario_corrigido:
                    valorUnitarioCorrigido
            };
        }
    );
}


function agruparVendasEmPacksNFE(
    vendas
) {

    if (
        !Array.isArray(
            vendas
        ) ||
        vendas.length === 0
    ) {

        return [];
    }

    const grupos =
        new Map();

    for (
        const venda
        of vendas
    ) {

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


    for (
        const [
            chave,
            membros
        ]
        of grupos.entries()
    ) {

        // =====================================================
        // VENDA NORMAL
        // =====================================================

        if (
            membros.length ===
            1
        ) {

            resultado.push(
                membros[0]
            );

            continue;
        }


        // =====================================================
        // PACK
        // =====================================================

        const principal =
            membros[0];


        const orderIds =
            [
                ...new Set(

                    membros
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


        const todosItems =
            membros.flatMap(
                venda =>
                    obterItensVendaParaPackNFE(
                        venda
                    )
            );


        const valorProduto =
            membros.reduce(
                (
                    total,
                    venda
                ) =>
                    total +
                    Number(
                        venda._valor_produto ??
                        venda.valor_produto ??
                        venda.valor_total ??
                        venda.total_amount ??
                        0
                    ),
                0
            );


        const valorFrete =
            membros.reduce(
                (
                    total,
                    venda
                ) =>
                    total +
                    Number(
                        venda._valor_frete ??
                        venda.valor_frete ??
                        0
                    ),
                0
            );


        const totalPago =
            membros.reduce(
                (
                    total,
                    venda
                ) =>
                    total +
                    Number(
                        venda._total_pago ??
                        venda.total_pago ??
                        venda._valor_produto ??
                        venda.valor_total ??
                        0
                    ),
                0
            );


        // =====================================================
        // NF-E
        //
        // Se UM dos pedidos já possui NF-e, bloqueamos nova
        // emissão para não correr risco de duplicidade.
        // =====================================================

        const temNfe =
            membros.some(
                venda =>
                    Boolean(
                        venda._tem_nfe
                    )
            );


        // =====================================================
        // ESTOQUE
        // =====================================================

        const todosBaixados =
            membros.every(
                venda =>
                    Boolean(
                        venda._estoque_baixado
                    )
            );


        let estoqueStatus =
            'nao_verificado';


        if (
            membros.some(
                venda =>
                    venda._estoque_status ===
                    'sem_cadastro'
            )
        ) {

            estoqueStatus =
                'sem_cadastro';

        } else if (
            todosBaixados
        ) {

            estoqueStatus =
                'baixado';

        } else if (
            membros.every(
                venda =>
                    venda._estoque_status ===
                    'disponivel'
            )
        ) {

            estoqueStatus =
                'disponivel';

        } else if (
            membros.some(
                venda =>
                    venda._estoque_status ===
                    'processando'
            )
        ) {

            estoqueStatus =
                'processando';
        }


        const detalhesEstoque =
            membros.flatMap(
                venda =>
                    Array.isArray(
                        venda._estoque_detalhes
                    )
                        ? venda._estoque_detalhes
                        : []
            );


        const packId =
            obterPackIdNFE(
                principal
            );


        const shipmentId =
            obterShipmentIdNFE(
                principal
            );


        const agrupada = {

            ...principal,

            // =============================================
            // IDENTIFICAÇÃO DO PACK
            // =============================================

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

            // =============================================
            // PRODUTOS
            // =============================================

            order_items:
                todosItems,

            // =============================================
            // VALORES
            // =============================================

            _valor_produto:
                valorProduto,

            _valor_frete:
                valorFrete,

            _total_pago:
                totalPago,

            total_amount:
                totalPago,

            // =============================================
            // STATUS
            // =============================================

            _tem_nfe:
                temNfe,

            _estoque_baixado:
                todosBaixados,

            _estoque_status:
                estoqueStatus,

            _estoque_detalhes:
                detalhesEstoque
        };


        console.log(
            '📦 PACK ML AGRUPADO:',
            {
                chave,
                packId,
                shipmentId,
                orderIds,
                produtos:
                    todosItems.map(
                        item =>
                            item.item
                                ?.seller_sku
                    ),
                valor:
                    valorProduto
            }
        );


        resultado.push(
            agrupada
        );
    }


    return resultado;
}


function obterOrderIdsVendaAtualNFE(
    orderId
) {

    const principal =
        normalizarOrderIdML(
            orderId
        );


    const atual =
        window._nfeVendaAtual;


    if (
        atual &&
        Array.isArray(
            atual._order_ids_pack
        ) &&
        atual._order_ids_pack.length >
            0
    ) {

        return [
            ...new Set(

                atual._order_ids_pack
                    .map(
                        normalizarOrderIdML
                    )
                    .filter(Boolean)
            )
        ];
    }


    if (
        Array.isArray(
            window._nfeOrderIdsAtuais
        ) &&
        window._nfeOrderIdsAtuais
            .length >
            0
    ) {

        return [
            ...new Set(

                window._nfeOrderIdsAtuais
                    .map(
                        normalizarOrderIdML
                    )
                    .filter(Boolean)
            )
        ];
    }


    return principal
        ? [
            principal
        ]
        : [];
}

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
    // AGRUPAR PACKS
    // =====================================================

    vendas =
        agruparVendasEmPacksNFE(
            vendas
        );


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
                    colspan="10"
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


            // =============================================
            // FULL
            // =============================================

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
                            white-space:nowrap;
                        "
                    >
                        <i class="fas fa-warehouse"></i>
                        FULL
                    </span>
                `;
            }


            // =============================================
            // FLEX
            // =============================================

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
                            white-space:nowrap;
                        "
                    >
                        <i class="fas fa-motorcycle"></i>
                        FLEX
                    </span>
                `;
            }


            // =============================================
            // MERCADO ENVIOS
            // =============================================

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
                            white-space:nowrap;
                        "
                    >
                        <i class="fas fa-truck"></i>
                        ME
                    </span>
                `;
            }


            // =============================================
            // OUTROS
            // =============================================

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
    // PAGAMENTO
    // =====================================================

    const htmlPagamento =
        venda => {

            const metodoPagamento =
                venda._metodo_pagamento_nome ||
                venda.metodo_pagamento_nome ||
                'N/I';


            const metodoPagamentoId =
                String(
                    venda._metodo_pagamento_id ||
                    venda.metodo_pagamento_id ||
                    ''
                )
                    .toLowerCase();


            const tipoPagamento =
                String(
                    venda._tipo_pagamento ||
                    venda.tipo_pagamento ||
                    ''
                )
                    .toLowerCase();


            const parcelasBruto =
                venda._parcelas ??
                venda.parcelas ??
                null;


            const parcelas =
                parcelasBruto !== null &&
                parcelasBruto !== undefined &&
                parcelasBruto !== ''

                    ? Number(
                        parcelasBruto
                    )

                    : null;


            const valorParcelaBruto =
                venda._valor_parcela ??
                venda.valor_parcela ??
                null;


            const valorParcela =
                valorParcelaBruto !== null &&
                valorParcelaBruto !== undefined &&
                valorParcelaBruto !== ''

                    ? Number(
                        valorParcelaBruto
                    )

                    : null;


            let parcelamentoNome =
                venda._parcelamento_nome ||
                venda.parcelamento_nome ||
                null;


            // =============================================
            // CRIAR TEXTO DE PARCELAMENTO CASO O CACHE
            // TENHA OS DADOS MAS NÃO TENHA O TEXTO PRONTO
            // =============================================

            if (
                tipoPagamento ===
                    'credit_card' &&
                !parcelamentoNome &&
                parcelas &&
                parcelas > 0
            ) {

                if (
                    parcelas ===
                    1
                ) {

                    parcelamentoNome =
                        '1x (À vista)';

                } else if (
                    valorParcela !== null &&
                    Number.isFinite(
                        valorParcela
                    )
                ) {

                    parcelamentoNome =
                        `${parcelas}x de R$ ${valorParcela.toLocaleString(
                            'pt-BR',
                            {
                                minimumFractionDigits:
                                    2,

                                maximumFractionDigits:
                                    2
                            }
                        )}`;

                } else {

                    parcelamentoNome =
                        `${parcelas}x`;
                }
            }


            // =============================================
            // PIX
            // =============================================

            if (
                metodoPagamentoId ===
                    'pix' ||
                String(
                    metodoPagamento
                )
                    .toLowerCase()
                    .includes(
                        'pix'
                    )
            ) {

                return `
                    <div>

                        <span
                            style="
                                background:#28a745;
                                color:white;
                                padding:4px 8px;
                                border-radius:5px;
                                font-size:11px;
                                white-space:nowrap;
                                display:inline-block;
                            "
                        >
                            <i class="fas fa-qrcode"></i>
                            Pix
                        </span>

                    </div>
                `;
            }


            // =============================================
            // CARTÃO DE CRÉDITO
            // =============================================

            if (
                tipoPagamento ===
                    'credit_card' ||
                String(
                    metodoPagamento
                )
                    .toLowerCase()
                    .includes(
                        'crédito'
                    )
            ) {

                const htmlParcelamento =
                    parcelamentoNome

                        ? `
                            <div
                                style="
                                    margin-top:4px;
                                    font-size:10px;
                                    color:#495057;
                                    white-space:nowrap;
                                    font-weight:600;
                                "
                            >
                                ${escaparHTMLNFE(
                                    parcelamentoNome
                                )}
                            </div>
                        `

                        : '';


                return `
                    <div>

                        <span
                            style="
                                background:#007bff;
                                color:white;
                                padding:4px 8px;
                                border-radius:5px;
                                font-size:11px;
                                white-space:nowrap;
                                display:inline-block;
                            "
                        >
                            <i class="fas fa-credit-card"></i>

                            ${escaparHTMLNFE(
                                metodoPagamento
                            )}
                        </span>

                        ${htmlParcelamento}

                    </div>
                `;
            }


            // =============================================
            // CARTÃO DE DÉBITO
            // =============================================

            if (
                tipoPagamento ===
                    'debit_card' ||
                String(
                    metodoPagamento
                )
                    .toLowerCase()
                    .includes(
                        'débito'
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
                            white-space:nowrap;
                            display:inline-block;
                        "
                    >
                        <i class="fas fa-credit-card"></i>

                        ${escaparHTMLNFE(
                            metodoPagamento
                        )}
                    </span>
                `;
            }


            // =============================================
            // SALDO MERCADO PAGO
            // =============================================

            if (
                tipoPagamento ===
                    'account_money'
            ) {

                return `
                    <span
                        style="
                            background:#ffc107;
                            color:#212529;
                            padding:4px 8px;
                            border-radius:5px;
                            font-size:11px;
                            white-space:nowrap;
                            display:inline-block;
                        "
                    >
                        <i class="fas fa-wallet"></i>

                        ${escaparHTMLNFE(
                            metodoPagamento
                        )}
                    </span>
                `;
            }


            // =============================================
            // BOLETO
            // =============================================

            if (
                tipoPagamento ===
                    'ticket'
            ) {

                return `
                    <span
                        style="
                            background:#6f42c1;
                            color:white;
                            padding:4px 8px;
                            border-radius:5px;
                            font-size:11px;
                            white-space:nowrap;
                            display:inline-block;
                        "
                    >
                        <i class="fas fa-barcode"></i>

                        ${escaparHTMLNFE(
                            metodoPagamento
                        )}
                    </span>
                `;
            }


            // =============================================
            // NÃO INFORMADO
            // =============================================

            if (
                !metodoPagamento ||
                metodoPagamento ===
                    'N/I' ||
                metodoPagamento ===
                    'Não informado'
            ) {

                return `
                    <span
                        style="
                            color:#6c757d;
                            font-size:11px;
                        "
                    >
                        N/I
                    </span>
                `;
            }


            // =============================================
            // OUTROS
            // =============================================

            return `
                <span
                    style="
                        background:#6c757d;
                        color:white;
                        padding:4px 8px;
                        border-radius:5px;
                        font-size:11px;
                        white-space:nowrap;
                        display:inline-block;
                    "
                >
                    ${escaparHTMLNFE(
                        metodoPagamento
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


            // =============================================
            // FULL
            // =============================================

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


            // =============================================
            // BAIXADO
            // =============================================

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


            // =============================================
            // DISPONÍVEL
            // =============================================

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


            // =============================================
            // SYNC PENDENTE
            // =============================================

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


            // =============================================
            // SEM CADASTRO
            // =============================================

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


            // =============================================
            // PROCESSANDO
            // =============================================

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


            // =============================================
            // PADRÃO
            // =============================================

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
        vendas
            .map(
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
                    // NF-E / AÇÕES
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


                    // =================================================
                    // LINHA
                    // =================================================

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
                                ${htmlPagamento(venda)}
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
            error:
                'ID da venda inválido'
        };
    }


    try {

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

                .join(
                    ' | '
                );


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
            '📝 Registrando histórico geral da baixa:',
            observacao
        );


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


        if (
            error
        ) {

            console.error(
                '❌ SUPABASE recusou histórico geral:',
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
            '✅ Histórico geral gravado:',
            data
        );


        return {

            success: true,

            data
        };


    } catch (
        error
    ) {

        console.error(
            '❌ Erro no histórico geral:',
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
                        estoque_detalhes,
                        metodo_pagamento_id,
                        tipo_pagamento,
                        metodo_pagamento_nome,
                        parcelas,
                        parcelamento_nome,
                        valor_parcela
                    `)
                    .in(
                        'id_venda_ml',
                        ids
                    );


            if (!error) {

                existentes =
                    data || [];

            } else {

                console.warn(
                    '⚠️ Erro lendo estado anterior do cache:',
                    error
                );
            }

        } catch (
            error
        ) {

            console.warn(
                '⚠️ Erro lendo cache anterior:',
                error
            );
        }


        // =====================================================
        // MAPA ESTADO ANTERIOR
        // =====================================================

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


        // =====================================================
        // MONTAR REGISTROS
        // =====================================================

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
            // MÉTODO DE PAGAMENTO
            //
            // Se a consulta atual não trouxer o dado,
            // preserva o que já estava salvo.
            // =================================================

            const metodoPagamentoId =
                venda._metodo_pagamento_id ??
                venda.metodo_pagamento_id ??
                anterior.metodo_pagamento_id ??
                null;


            const tipoPagamento =
                venda._tipo_pagamento ??
                venda.tipo_pagamento ??
                anterior.tipo_pagamento ??
                null;


            const metodoPagamentoNome =
                venda._metodo_pagamento_nome ??
                venda.metodo_pagamento_nome ??
                anterior.metodo_pagamento_nome ??
                null;


            // =================================================
            // PARCELAMENTO
            // =================================================

            const parcelasBruto =
                venda._parcelas ??
                venda.parcelas ??
                anterior.parcelas ??
                null;


            const parcelas =
                parcelasBruto !== null &&
                parcelasBruto !== undefined &&
                parcelasBruto !== ''

                    ? Number(
                        parcelasBruto
                    )

                    : null;


            const parcelamentoNome =
                venda._parcelamento_nome ??
                venda.parcelamento_nome ??
                anterior.parcelamento_nome ??
                null;


            const valorParcelaBruto =
                venda._valor_parcela ??
                venda.valor_parcela ??
                anterior.valor_parcela ??
                null;


            const valorParcela =
                valorParcelaBruto !== null &&
                valorParcelaBruto !== undefined &&
                valorParcelaBruto !== ''

                    ? Number(
                        valorParcelaBruto
                    )

                    : null;


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


            // FULL = NF-e automática ML
            if (isFull) {

                temNfe =
                    true;
            }


            // =================================================
            // ESTOQUE
            //
            // estoque_baixado TRUE nunca volta a FALSE
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


            // =================================================
            // DATA VENDA
            // =================================================

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


                // =============================================
                // VALORES
                // =============================================

                _valor_produto:
                    valorProduto,


                _valor_frete:
                    valorFrete,


                _total_pago:
                    totalPago,


                // =============================================
                // PAGAMENTO
                // =============================================

                _metodo_pagamento_id:
                    metodoPagamentoId,


                _tipo_pagamento:
                    tipoPagamento,


                _metodo_pagamento_nome:
                    metodoPagamentoNome,


                _parcelas:
                    parcelas,


                _parcelamento_nome:
                    parcelamentoNome,


                _valor_parcela:
                    valorParcela,


                // =============================================
                // ESTOQUE
                // =============================================

                _estoque_status:
                    estoqueStatus,


                _estoque_baixado:
                    estoqueJaBaixado,


                _estoque_baixado_em:
                    estoqueBaixadoEm,


                _estoque_detalhes:
                    estoqueDetalhes
            };


            // =================================================
            // REGISTRO SUPABASE
            // =================================================

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


                // =============================================
                // VALORES
                // =============================================

                valor_produto:
                    valorProduto,


                valor_frete:
                    valorFrete,


                total_pago:
                    totalPago,


                // =============================================
                // PAGAMENTO
                // =============================================

                metodo_pagamento_id:
                    metodoPagamentoId,


                tipo_pagamento:
                    tipoPagamento,


                metodo_pagamento_nome:
                    metodoPagamentoNome,


                parcelas:
                    parcelas,


                parcelamento_nome:
                    parcelamentoNome,


                valor_parcela:
                    valorParcela,


                // =============================================
                // LOGÍSTICA
                // =============================================

                logistic_type:
                    logisticType,


                shipping_mode:
                    shippingMode,


                is_full:
                    isFull,


                // =============================================
                // NF-E
                // =============================================

                tem_nfe:
                    temNfe,


                // =============================================
                // ESTOQUE
                // =============================================

                estoque_baixado:
                    estoqueJaBaixado,


                estoque_status:
                    estoqueStatus,


                estoque_baixado_em:
                    estoqueBaixadoEm,


                estoque_detalhes:
                    estoqueDetalhes,


                // =============================================
                // JSON
                // =============================================

                venda_json:
                    vendaJson,


                atualizado_em:
                    new Date()
                        .toISOString()
            });
        }


        // =====================================================
        // NADA PARA SALVAR
        // =====================================================

        if (
            registros.length ===
            0
        ) {

            return;
        }


        // =====================================================
        // UPSERT
        // =====================================================

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

async function carregarVendasCacheNFE(
    dataEnvio = null
) {

    try {

        // =====================================================
        // BUSCAR CACHE
        // =====================================================

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
                    2000
                );


        if (error) {

            throw error;
        }


        let registros =
            Array.isArray(data)
                ? data
                : [];


        // =====================================================
        // FILTRO
        // =====================================================

        if (dataEnvio) {

            registros =
                registros.filter(
                    registro => {

                        // =========================================
                        // FULL
                        // =========================================

                        if (
                            registro
                                .is_full
                        ) {

                            return (
                                normalizarDataEnvioML(
                                    registro
                                        .data_venda
                                ) ===
                                dataEnvio
                            );
                        }


                        // =========================================
                        // ENVIO NORMAL
                        // =========================================

                        return (
                            normalizarDataEnvioML(
                                registro
                                    .data_envio
                            ) ===
                            dataEnvio
                        );
                    }
                );
        }


        // =====================================================
        // CONVERTER REGISTROS
        // =====================================================

        return registros.map(
            registro => {

                let venda =
                    registro
                        .venda_json ||
                    {};


                // =================================================
                // JSON PODE VIR COMO STRING
                // =================================================

                if (
                    typeof venda ===
                    'string'
                ) {

                    try {

                        venda =
                            JSON.parse(
                                venda
                            );

                    } catch (
                        error
                    ) {

                        console.warn(
                            `⚠️ Erro lendo venda_json ${registro.id_venda_ml}:`,
                            error
                        );


                        venda =
                            {};
                    }
                }


                // =================================================
                // PAGAMENTO
                // =================================================

                const metodoPagamentoId =
                    registro.metodo_pagamento_id ??
                    venda._metodo_pagamento_id ??
                    venda.metodo_pagamento_id ??
                    null;


                const tipoPagamento =
                    registro.tipo_pagamento ??
                    venda._tipo_pagamento ??
                    venda.tipo_pagamento ??
                    null;


                const metodoPagamentoNome =
                    registro.metodo_pagamento_nome ??
                    venda._metodo_pagamento_nome ??
                    venda.metodo_pagamento_nome ??
                    null;


                // =================================================
                // PARCELAMENTO
                // =================================================

                const parcelasBruto =
                    registro.parcelas ??
                    venda._parcelas ??
                    venda.parcelas ??
                    null;


                const parcelas =
                    parcelasBruto !== null &&
                    parcelasBruto !== undefined &&
                    parcelasBruto !== ''

                        ? Number(
                            parcelasBruto
                        )

                        : null;


                const parcelamentoNome =
                    registro.parcelamento_nome ??
                    venda._parcelamento_nome ??
                    venda.parcelamento_nome ??
                    null;


                const valorParcelaBruto =
                    registro.valor_parcela ??
                    venda._valor_parcela ??
                    venda.valor_parcela ??
                    null;


                const valorParcela =
                    valorParcelaBruto !== null &&
                    valorParcelaBruto !== undefined &&
                    valorParcelaBruto !== ''

                        ? Number(
                            valorParcelaBruto
                        )

                        : null;


                // =================================================
                // RETORNO
                // =================================================

                return {

                    ...venda,


                    // =============================================
                    // ID
                    // =============================================

                    id:
                        normalizarOrderIdML(
                            registro
                                .id_venda_ml
                        ),


                    id_venda_ml:
                        normalizarOrderIdML(
                            registro
                                .id_venda_ml
                        ),


                    // =============================================
                    // DATA
                    // =============================================

                    date_created:
                        registro
                            .data_venda ||
                        venda
                            .date_created,


                    data_venda:
                        registro
                            .data_venda ||
                        venda
                            .data_venda,


                    // =============================================
                    // CLIENTE
                    // =============================================

                    cliente:
                        registro
                            .cliente ||
                        venda
                            .cliente,


                    buyer:
                        venda.buyer ||
                        {
                            nickname:
                                registro
                                    .cliente
                        },


                    // =============================================
                    // ENVIO
                    // =============================================

                    _data_envio:
                        registro
                            .data_envio,


                    _prazo_envio:
                        registro
                            .prazo_envio,


                    // =============================================
                    // VALORES
                    // =============================================

                    _valor_produto:
                        Number(
                            registro
                                .valor_produto ||
                            0
                        ),


                    _valor_frete:
                        Number(
                            registro
                                .valor_frete ||
                            0
                        ),


                    _total_pago:
                        Number(
                            registro
                                .total_pago ||
                            0
                        ),


                    // =============================================
                    // PAGAMENTO
                    // =============================================

                    _metodo_pagamento_id:
                        metodoPagamentoId,


                    _tipo_pagamento:
                        tipoPagamento,


                    _metodo_pagamento_nome:
                        metodoPagamentoNome,


                    metodo_pagamento_id:
                        metodoPagamentoId,


                    tipo_pagamento:
                        tipoPagamento,


                    metodo_pagamento_nome:
                        metodoPagamentoNome,


                    // =============================================
                    // PARCELAMENTO
                    // =============================================

                    _parcelas:
                        parcelas,


                    _parcelamento_nome:
                        parcelamentoNome,


                    _valor_parcela:
                        valorParcela,


                    parcelas:
                        parcelas,


                    parcelamento_nome:
                        parcelamentoNome,


                    valor_parcela:
                        valorParcela,


                    // =============================================
                    // LOGÍSTICA
                    // =============================================

                    _logistic_type:
                        registro
                            .logistic_type ||
                        venda
                            ._logistic_type ||
                        '',


                    _shipping_mode:
                        registro
                            .shipping_mode ||
                        venda
                            ._shipping_mode ||
                        '',


                    _is_full:
                        Boolean(
                            registro
                                .is_full
                        ),


                    // =============================================
                    // NF-E
                    // =============================================

                    _tem_nfe:
                        Boolean(
                            registro
                                .tem_nfe
                        ),


                    // =============================================
                    // ESTOQUE
                    // =============================================

                    _estoque_status:
                        registro
                            .estoque_status ||
                        'nao_verificado',


                    _estoque_baixado:
                        Boolean(
                            registro
                                .estoque_baixado
                        ),


                    _estoque_baixado_em:
                        registro
                            .estoque_baixado_em ||
                        null,


                    _estoque_detalhes:
                        registro
                            .estoque_detalhes ||
                        []
                };
            }
        );


    } catch (
        error
    ) {

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
    // DADOS DE PAGAMENTO QUE JÁ POSSAM EXISTIR
    // =====================================================

    let metodoPagamentoId =
        venda._metodo_pagamento_id ??
        venda.metodo_pagamento_id ??
        null;


    let tipoPagamento =
        venda._tipo_pagamento ??
        venda.tipo_pagamento ??
        null;


    let metodoPagamentoNome =
        venda._metodo_pagamento_nome ??
        venda.metodo_pagamento_nome ??
        null;


    let parcelas =
        venda._parcelas ??
        venda.parcelas ??
        null;


    let parcelamentoNome =
        venda._parcelamento_nome ??
        venda.parcelamento_nome ??
        null;


    let valorParcela =
        venda._valor_parcela ??
        venda.valor_parcela ??
        null;


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
                Number(
                    venda._valor_frete ??
                    venda.valor_frete ??
                    0
                ),

            _total_pago:
                Number(
                    venda._total_pago ??
                    venda.total_pago ??
                    valor
                ),


            // =============================================
            // PAGAMENTO
            // =============================================

            _metodo_pagamento_id:
                metodoPagamentoId,

            _tipo_pagamento:
                tipoPagamento,

            _metodo_pagamento_nome:
                metodoPagamentoNome,

            _parcelas:
                parcelas,

            _parcelamento_nome:
                parcelamentoNome,

            _valor_parcela:
                valorParcela,


            // =============================================
            // ESTOQUE
            // =============================================

            _estoque_status:
                'full',

            _estoque_detalhes:
                []
        };
    }


    // =====================================================
    // VALORES
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
            venda.valor_frete ??
            0
        );


    let totalPago =
        Number(
            venda._total_pago ??
            venda.total_pago ??
            valorProduto
        );


    // =====================================================
    // MERCADO PAGO
    // =====================================================

    try {

        const pagamento =
            await buscarValorExatoPagamento(
                idVenda
            );


        if (pagamento) {

            // =============================================
            // VALORES
            // =============================================

            valorProduto =
                Number(
                    pagamento.valor_produto ??
                    valorProduto
                );


            valorFrete =
                Number(
                    pagamento.valor_frete ??
                    valorFrete ??
                    0
                );


            totalPago =
                Number(
                    pagamento.total_pago ??
                    totalPago ??
                    valorProduto
                );


            // =============================================
            // MÉTODO DE PAGAMENTO
            // =============================================

            metodoPagamentoId =
                pagamento.metodo_pagamento_id ??
                metodoPagamentoId ??
                null;


            tipoPagamento =
                pagamento.tipo_pagamento ??
                tipoPagamento ??
                null;


            metodoPagamentoNome =
                pagamento.metodo_pagamento_nome ??
                metodoPagamentoNome ??
                null;


            // =============================================
            // PARCELAMENTO
            // =============================================

            parcelas =
                pagamento.parcelas ??
                parcelas ??
                null;


            parcelamentoNome =
                pagamento.parcelamento_nome ??
                parcelamentoNome ??
                null;


            valorParcela =
                pagamento.valor_parcela ??
                valorParcela ??
                null;


            console.log(
                `💳 Pagamento processado da venda ${idVenda}:`,
                {
                    metodoPagamentoId,
                    tipoPagamento,
                    metodoPagamentoNome,
                    parcelas,
                    parcelamentoNome,
                    valorParcela
                }
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


    // =====================================================
    // RETORNO
    // =====================================================

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
                venda.order_items.length
            )
                ? venda.order_items
                : [
                    {
                        quantity:
                            quantidade,

                        unit_price:
                            quantidade > 0
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


        // =================================================
        // ENVIO
        // =================================================

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


        // =================================================
        // NF-E
        // =================================================

        _tem_nfe:
            idsComNFE.has(
                idVenda
            ) ||
            venda.nfe_emitida ===
                true,


        // =================================================
        // VALORES
        // =================================================

        _valor_produto:
            valorProduto,


        _valor_frete:
            valorFrete,


        _total_pago:
            totalPago,


        // =================================================
        // PAGAMENTO
        // =================================================

        _metodo_pagamento_id:
            metodoPagamentoId,


        _tipo_pagamento:
            tipoPagamento,


        _metodo_pagamento_nome:
            metodoPagamentoNome,


        _parcelas:
            parcelas,


        _parcelamento_nome:
            parcelamentoNome,


        _valor_parcela:
            valorParcela,


        // =================================================
        // ESTOQUE
        // =================================================

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

    vendaId =
        normalizarOrderIdML(
            vendaId
        );

    if (!vendaId) {

        console.error(
            '❌ [SYNC ML] ID da venda inválido'
        );

        return false;
    }


    try {

        console.log(
            `🚀 [SYNC ML] Iniciando venda ${vendaId}`
        );


        // =====================================================
        // 1. TOKEN MERCADO LIVRE
        // =====================================================

        let token =
            localStorage.getItem(
                'ml_access_token'
            );


        if (
            !token &&
            typeof window.getValidToken ===
                'function'
        ) {

            const tokenData =
                await window
                    .getValidToken();

            token =
                tokenData
                    ?.access_token ||
                null;
        }


        if (!token) {

            console.error(
                '❌ [SYNC ML] Token Mercado Livre não disponível'
            );

            return false;
        }


        // =====================================================
        // 2. DESCOBRIR TODOS OS SKUS DA VENDA
        //
        // PRIMEIRO USA estoque_detalhes, POIS ELE JÁ POSSUI
        // OS PRODUTOS FÍSICOS CORRETOS DA BAIXA.
        //
        // ISTO FUNCIONA TAMBÉM PARA KIT.
        // =====================================================

        const itensParaSincronizar =
            [];


        try {

            const {
                data:
                    cache,

                error:
                    erroCache
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
                        vendaId
                    )
                    .maybeSingle();


            if (
                erroCache
            ) {

                console.warn(
                    '⚠️ [SYNC ML] Erro lendo cache:',
                    erroCache
                );

            } else if (
                Array.isArray(
                    cache
                        ?.estoque_detalhes
                )
            ) {

                for (
                    const item
                    of cache
                        .estoque_detalhes
                ) {

                    if (
                        !item ||
                        item.encontrado ===
                            false ||
                        !item.sku
                    ) {

                        continue;
                    }


                    itensParaSincronizar.push({

                        sku:
                            String(
                                item.sku
                            ).trim(),

                        produto_id:
                            item.produto_id ||
                            null,

                        quantidade_venda:
                            Number(
                                item.quantidade_venda ||
                                1
                            )
                    });
                }
            }


        } catch (
            error
        ) {

            console.warn(
                '⚠️ [SYNC ML] Erro inesperado lendo estoque_detalhes:',
                error
            );
        }


        // =====================================================
        // 3. FALLBACK PARA vendas_ml
        //
        // SÓ É USADO SE estoque_detalhes NÃO ESTIVER DISPONÍVEL.
        // =====================================================

        if (
            itensParaSincronizar.length ===
            0
        ) {

            console.warn(
                '⚠️ [SYNC ML] estoque_detalhes vazio. Usando vendas_ml como fallback.'
            );


            try {

                const variantes =
                    variantesOrderIdML(
                        vendaId
                    );


                const {
                    data:
                        vendasEncontradas,

                    error:
                        erroVenda
                } =
                    await window
                        .supabaseClient
                        .from(
                            'vendas_ml'
                        )
                        .select(
                            'id_venda_ml, sku, quantidade, skus_kit, eh_kit'
                        )
                        .in(
                            'id_venda_ml',
                            variantes
                        )
                        .limit(
                            1
                        );


                if (
                    erroVenda
                ) {

                    console.warn(
                        '⚠️ [SYNC ML] Erro buscando vendas_ml:',
                        erroVenda
                    );

                } else {

                    const venda =
                        Array.isArray(
                            vendasEncontradas
                        ) &&
                        vendasEncontradas.length >
                            0
                            ? vendasEncontradas[0]
                            : null;


                    if (venda) {

                        // =========================================
                        // FUNÇÃO INTERNA PARA SKU SIMPLES/COMPOSTO
                        // =========================================

                        const adicionarSku =
                            (
                                skuOriginal,
                                quantidadeBase = 1
                            ) => {

                                if (
                                    !skuOriginal
                                ) {

                                    return;
                                }


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


                                    itensParaSincronizar.push({

                                        sku:
                                            String(
                                                sku
                                            ).trim(),

                                        quantidade_venda:
                                            Number(
                                                quantidadeBase ||
                                                1
                                            ) *
                                            Number(
                                                multiplicador ||
                                                1
                                            )
                                    });
                                }
                            };


                        // =========================================
                        // KIT
                        // =========================================

                        if (
                            venda.eh_kit &&
                            Array.isArray(
                                venda.skus_kit
                            ) &&
                            venda.skus_kit
                                .length >
                            0
                        ) {

                            for (
                                const kit
                                of venda.skus_kit
                            ) {

                                adicionarSku(

                                    kit.sku,

                                    Number(
                                        kit.estoque ||
                                        kit.quantidade ||
                                        1
                                    ) *
                                    Number(
                                        venda.quantidade ||
                                        1
                                    )
                                );
                            }


                        // =========================================
                        // PRODUTO NORMAL / SKU COMPOSTO
                        // =========================================

                        } else if (
                            venda.sku
                        ) {

                            adicionarSku(

                                venda.sku,

                                Number(
                                    venda.quantidade ||
                                    1
                                )
                            );
                        }
                    }
                }


            } catch (
                error
            ) {

                console.warn(
                    '⚠️ [SYNC ML] Fallback vendas_ml falhou:',
                    error
                );
            }
        }


        // =====================================================
        // 4. CONSOLIDAR SKUS
        // =====================================================

        const mapaSkus =
            new Map();


        for (
            const item
            of itensParaSincronizar
        ) {

            const sku =
                String(
                    item.sku ||
                    ''
                ).trim();


            if (
                !sku ||
                sku === 'SEM_SKU' ||
                sku === 'N/A'
            ) {

                continue;
            }


            if (
                mapaSkus.has(
                    sku
                )
            ) {

                const existente =
                    mapaSkus.get(
                        sku
                    );


                existente.quantidade_venda +=
                    Number(
                        item.quantidade_venda ||
                        0
                    );


            } else {

                mapaSkus.set(
                    sku,
                    {

                        ...item,

                        sku,

                        quantidade_venda:
                            Number(
                                item.quantidade_venda ||
                                0
                            )
                    }
                );
            }
        }


        const itensUnicos =
            [
                ...mapaSkus.values()
            ];


        console.log(
            '📦 [SYNC ML] Produtos físicos:',
            itensUnicos
        );


        if (
            itensUnicos.length ===
            0
        ) {

            console.error(
                '❌ [SYNC ML] Nenhum SKU identificado'
            );

            return false;
        }


        let sucessos =
            0;

        let falhas =
            0;

        let ignorados =
            0;


        // =====================================================
        // 5. PROCESSAR CADA PRODUTO
        // =====================================================

        for (
            const item
            of itensUnicos
        ) {

            const sku =
                item.sku;


            console.log(
                `🔎 [SYNC ML] Buscando produto "${sku}"`
            );


            // =================================================
            // IMPORTANTE
            //
            // USAMOS select('*').
            //
            // Assim a consulta NÃO quebra porque uma coluna
            // opcional como bloquear_sync_ml não existe.
            // =================================================

            const {
                data:
                    produto,

                error:
                    erroProduto
            } =
                await window
                    .supabaseClient
                    .from(
                        'produtos_estoque'
                    )
                    .select('*')
                    .eq(
                        'sku',
                        sku
                    )
                    .maybeSingle();


            if (
                erroProduto
            ) {

                console.error(
                    `❌ [SYNC ML] Erro REAL ao consultar produto "${sku}":`,
                    {
                        message:
                            erroProduto.message,

                        details:
                            erroProduto.details,

                        hint:
                            erroProduto.hint,

                        code:
                            erroProduto.code
                    }
                );

                falhas++;

                continue;
            }


            if (
                !produto
            ) {

                console.error(
                    `❌ [SYNC ML] Produto "${sku}" realmente não encontrado no estoque`
                );

                falhas++;

                continue;
            }


            console.log(
                `✅ [SYNC ML] Produto encontrado: ${sku}`,
                {
                    id:
                        produto.id,

                    quantidade:
                        produto.quantidade,

                    mlb_codes:
                        produto.mlb_codes,

                    bloquear_sync_ml:
                        produto.bloquear_sync_ml
                }
            );


            // =================================================
            // 6. BLOQUEIO DE SINCRONIZAÇÃO
            //
            // SE A COLUNA NÃO EXISTIR:
            //
            // undefined === true -> false
            //
            // portanto sincroniza normalmente.
            // =================================================

            if (
                produto
                    .bloquear_sync_ml ===
                true
            ) {

                console.log(
                    `🔒 [SYNC ML] SKU ${sku}: sincronização bloqueada`
                );

                ignorados++;

                continue;
            }


            // =================================================
            // 7. MLB CODES
            // =================================================

            let mlbCodes =
                produto
                    .mlb_codes;


            if (
                !mlbCodes
            ) {

                console.warn(
                    `⚠️ [SYNC ML] SKU ${sku} não possui mlb_codes`
                );

                falhas++;

                continue;
            }


            // STRING
            if (
                typeof mlbCodes ===
                'string'
            ) {

                try {

                    const parsed =
                        JSON.parse(
                            mlbCodes
                        );


                    mlbCodes =
                        Array.isArray(
                            parsed
                        )
                            ? parsed
                            : [
                                parsed
                            ];


                } catch {

                    mlbCodes =
                        mlbCodes
                            .split(',')
                            .map(
                                codigo =>
                                    codigo.trim()
                            )
                            .filter(Boolean);
                }
            }


            // OBJETO
            if (
                !Array.isArray(
                    mlbCodes
                ) &&
                mlbCodes &&
                typeof mlbCodes ===
                    'object'
            ) {

                mlbCodes =
                    Object.values(
                        mlbCodes
                    );
            }


            if (
                !Array.isArray(
                    mlbCodes
                )
            ) {

                mlbCodes =
                    mlbCodes
                        ? [
                            mlbCodes
                        ]
                        : [];
            }


            // =================================================
            // NORMALIZAR CÓDIGOS
            // =================================================

            mlbCodes =
                mlbCodes

                    .map(
                        codigo => {

                            if (
                                codigo &&
                                typeof codigo ===
                                    'object'
                            ) {

                                return (
                                    codigo.mlb ||
                                    codigo.mlb_id ||
                                    codigo.item_id ||
                                    codigo.id ||
                                    codigo.codigo ||
                                    ''
                                );
                            }


                            return String(
                                codigo ||
                                ''
                            );
                        }
                    )

                    .map(
                        codigo =>
                            codigo.trim()
                    )

                    .filter(Boolean);


            console.log(
                `🔗 [SYNC ML] MLBs do SKU ${sku}:`,
                mlbCodes
            );


            if (
                mlbCodes.length ===
                0
            ) {

                console.warn(
                    `⚠️ [SYNC ML] Nenhum anúncio ML encontrado para SKU ${sku}`
                );

                falhas++;

                continue;
            }


            // =================================================
            // 8. ESTOQUE ATUAL
            //
            // ESTA QUANTIDADE JÁ É A QUANTIDADE DEPOIS DA BAIXA.
            // =================================================

            const estoqueAtual =
                Number(
                    produto.quantidade ||
                    0
                );


            console.log(
                `📊 [SYNC ML] ${sku}: novo estoque = ${estoqueAtual}`
            );


            // =================================================
            // 9. ATUALIZAR CADA ANÚNCIO
            // =================================================

            for (
                const codigo
                of mlbCodes
            ) {

                // =============================================
                // EXTRAIR SOMENTE MLB / NÚMERO
                // =============================================

                const match =
                    String(
                        codigo
                    )
                        .toUpperCase()
                        .match(
                            /MLB\d+|\d+/
                        );


                if (!match) {

                    console.warn(
                        `⚠️ [SYNC ML] Código MLB inválido: ${codigo}`
                    );

                    falhas++;

                    continue;
                }


                let itemId =
                    match[0];


                if (
                    !itemId.startsWith(
                        'MLB'
                    )
                ) {

                    itemId =
                        `MLB${itemId}`;
                }


                console.log(
                    `📤 [SYNC ML] Atualizando ${itemId}: ${estoqueAtual}`
                );


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
                                            estoqueAtual
                                    })
                            }
                        );


                    if (
                        response.ok
                    ) {

                        let respostaML =
                            null;


                        try {

                            respostaML =
                                await response.json();

                        } catch {}


                        console.log(
                            `✅ [SYNC ML] ${itemId} atualizado para ${estoqueAtual}`,
                            respostaML
                        );


                        sucessos++;


                    } else {

                        const erroTexto =
                            await response.text();


                        console.error(
                            `❌ [SYNC ML] Mercado Livre rejeitou ${itemId}: HTTP ${response.status}`,
                            erroTexto
                        );


                        falhas++;
                    }


                } catch (
                    error
                ) {

                    console.error(
                        `❌ [SYNC ML] Erro enviando ${itemId}:`,
                        error
                    );


                    falhas++;
                }
            }
        }


        // =====================================================
        // 10. RESULTADO
        // =====================================================

        console.log(
            `📊 [SYNC ML] FINAL: ${sucessos} sucesso(s), ${falhas} falha(s), ${ignorados} ignorado(s)`
        );


        // Todos estavam bloqueados voluntariamente
        if (
            sucessos ===
                0 &&
            falhas ===
                0 &&
            ignorados >
                0
        ) {

            return true;
        }


        return (
            sucessos >
                0 &&
            falhas ===
                0
        );


    } catch (
        error
    ) {

        console.error(
            '❌ [SYNC ML] Erro geral:',
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

// =========================================================
// CLIENTES - EMISSÃO AVULSA
// =========================================================

window._clientesAvulsaNFE =
    [];


async function carregarClientesAvulsaNFE() {

    const busca =
        document.getElementById(
            'avulsaClienteBusca'
        );

    const clienteId =
        document.getElementById(
            'avulsaClienteId'
        );

    const resultados =
        document.getElementById(
            'avulsaClienteResultados'
        );


    if (
        !busca ||
        !clienteId ||
        !resultados
    ) {

        console.warn(
            '⚠️ Campos de pesquisa de cliente da NF-e avulsa não encontrados'
        );

        return false;
    }


    try {

        busca.disabled =
            true;

        busca.placeholder =
            'Carregando clientes...';


        const response =
            await fetch(
                `${window.API_BASE_URL}/nfe/clientes`,
                {
                    method:
                        'GET',

                    headers: {
                        'Accept':
                            'application/json'
                    },

                    cache:
                        'no-store'
                }
            );


        if (
            !response.ok
        ) {

            throw new Error(
                `HTTP ${response.status}`
            );
        }


        const data =
            await response.json();


        if (
            data.success ===
            false
        ) {

            throw new Error(
                data.error ||
                'Erro ao carregar clientes'
            );
        }


        window._clientesAvulsaNFE =
            Array.isArray(
                data.clientes
            )
                ? data.clientes
                : [];


        console.log(
            `👤 ${window._clientesAvulsaNFE.length} cliente(s) disponíveis para NF-e avulsa`
        );


        busca.disabled =
            false;

        busca.placeholder =
            'Digite o nome, CPF ou CNPJ do cliente...';


        // =============================================
        // EVENTO DE PESQUISA
        // =============================================

        busca.oninput =
            function () {

                pesquisarClienteAvulsaNFE(
                    this.value
                );
            };


        busca.onfocus =
            function () {

                if (
                    this.value.trim()
                ) {

                    pesquisarClienteAvulsaNFE(
                        this.value
                    );
                }
            };


        return true;


    } catch (
        error
    ) {

        console.error(
            '❌ Erro carregando clientes para NF-e avulsa:',
            error
        );


        busca.disabled =
            false;

        busca.placeholder =
            'Erro ao carregar clientes';


        return false;
    }
}


function pesquisarClienteAvulsaNFE(
    termo
) {

    const resultados =
        document.getElementById(
            'avulsaClienteResultados'
        );


    if (!resultados) {

        return;
    }


    const pesquisa =
        String(
            termo ||
            ''
        )
            .trim()
            .toLowerCase();


    if (
        pesquisa.length <
        1
    ) {

        resultados.style.display =
            'none';

        resultados.innerHTML =
            '';

        return;
    }


    const somenteNumeros =
        pesquisa.replace(
            /\D/g,
            ''
        );


    const clientes =
        Array.isArray(
            window._clientesAvulsaNFE
        )
            ? window._clientesAvulsaNFE
            : [];


    const encontrados =
        clientes
            .filter(
                cliente => {

                    const nome =
                        String(
                            cliente.nome ||
                            ''
                        )
                            .toLowerCase();


                    const documento =
                        String(
                            cliente.documento ||
                            ''
                        )
                            .replace(
                                /\D/g,
                                ''
                            );


                    const cidade =
                        String(
                            cliente.cidade ||
                            ''
                        )
                            .toLowerCase();


                    return (

                        nome.includes(
                            pesquisa
                        ) ||

                        cidade.includes(
                            pesquisa
                        ) ||

                        (
                            somenteNumeros &&
                            documento.includes(
                                somenteNumeros
                            )
                        )
                    );
                }
            )
            .slice(
                0,
                15
            );


    if (
        encontrados.length ===
        0
    ) {

        resultados.innerHTML = `

            <div
                style="
                    padding:12px;
                    color:#6c757d;
                    text-align:center;
                "
            >
                Nenhum cliente encontrado.
            </div>
        `;


        resultados.style.display =
            'block';

        return;
    }


    resultados.innerHTML =
        encontrados
            .map(
                cliente => {

                    const documento =
                        escaparHTMLCadastroNFE(
                            cliente.documento ||
                            ''
                        );

                    const cidade =
                        escaparHTMLCadastroNFE(
                            cliente.cidade ||
                            ''
                        );

                    const uf =
                        escaparHTMLCadastroNFE(
                            cliente.uf ||
                            ''
                        );


                    return `

                        <div
                            class="resultado-cliente-avulsa"
                            data-cliente-id="${Number(cliente.id)}"
                            style="
                                padding:10px 12px;
                                cursor:pointer;
                                border-bottom:1px solid #eee;
                            "
                            onmouseover="
                                this.style.background='#f5f7f9'
                            "
                            onmouseout="
                                this.style.background='white'
                            "
                            onclick="
                                selecionarClienteAvulsaNFE(${Number(cliente.id)})
                            "
                        >

                            <div
                                style="
                                    font-weight:600;
                                "
                            >
                                ${escaparHTMLCadastroNFE(
                                    cliente.nome ||
                                    'Cliente'
                                )}
                            </div>


                            <div
                                style="
                                    font-size:12px;
                                    color:#6c757d;
                                    margin-top:2px;
                                "
                            >

                                ${documento || 'Sem documento'}

                                ${
                                    cidade
                                        ? ` • ${cidade}${uf ? `/${uf}` : ''}`
                                        : ''
                                }

                            </div>

                        </div>
                    `;
                }
            )
            .join(
                ''
            );


    resultados.style.display =
        'block';
}


function selecionarClienteAvulsaNFE(
    id
) {

    const clientes =
        Array.isArray(
            window._clientesAvulsaNFE
        )
            ? window._clientesAvulsaNFE
            : [];


    const cliente =
        clientes.find(
            item =>
                String(
                    item.id
                ) ===
                String(
                    id
                )
        );


    if (!cliente) {

        showToast(
            'Cliente não encontrado',
            'warning'
        );

        return;
    }


    const campoId =
        document.getElementById(
            'avulsaClienteId'
        );

    const busca =
        document.getElementById(
            'avulsaClienteBusca'
        );

    const resultados =
        document.getElementById(
            'avulsaClienteResultados'
        );

    const selecionado =
        document.getElementById(
            'avulsaClienteSelecionado'
        );


    if (
        campoId
    ) {

        campoId.value =
            String(
                cliente.id
            );
    }


    if (
        busca
    ) {

        busca.value =
            cliente.nome ||
            '';
    }


    if (
        resultados
    ) {

        resultados.style.display =
            'none';

        resultados.innerHTML =
            '';
    }


    if (
        selecionado
    ) {

        selecionado.innerHTML = `

            <div
                style="
                    display:flex;
                    justify-content:space-between;
                    gap:10px;
                    align-items:center;
                "
            >

                <div>

                    <strong>
                        <i class="fas fa-check-circle"></i>
                        ${escaparHTMLCadastroNFE(
                            cliente.nome ||
                            ''
                        )}
                    </strong>

                    <div
                        style="
                            color:#6c757d;
                            margin-top:3px;
                        "
                    >

                        ${escaparHTMLCadastroNFE(
                            cliente.documento ||
                            ''
                        )}

                        ${
                            cliente.cidade
                                ? ` • ${escaparHTMLCadastroNFE(
                                    cliente.cidade
                                )}/${escaparHTMLCadastroNFE(
                                    cliente.uf ||
                                    ''
                                )}`
                                : ''
                        }

                    </div>

                </div>


                <button
                    type="button"
                    class="btn btn-sm btn-outline-secondary"
                    onclick="limparClienteSelecionadoAvulsaNFE()"
                >
                    Trocar
                </button>

            </div>
        `;


        selecionado.style.display =
            'block';
    }


    console.log(
        '✅ Cliente selecionado para NF-e avulsa:',
        cliente
    );
}


function limparClienteSelecionadoAvulsaNFE() {

    const campoId =
        document.getElementById(
            'avulsaClienteId'
        );

    const busca =
        document.getElementById(
            'avulsaClienteBusca'
        );

    const resultados =
        document.getElementById(
            'avulsaClienteResultados'
        );

    const selecionado =
        document.getElementById(
            'avulsaClienteSelecionado'
        );


    if (
        campoId
    ) {

        campoId.value =
            '';
    }


    if (
        busca
    ) {

        busca.value =
            '';

        busca.focus();
    }


    if (
        resultados
    ) {

        resultados.innerHTML =
            '';

        resultados.style.display =
            'none';
    }


    if (
        selecionado
    ) {

        selecionado.innerHTML =
            '';

        selecionado.style.display =
            'none';
    }
}


// =========================================================
// TRANSPORTADORAS - EMISSÃO AVULSA
// =========================================================

async function preencherSelectTransportadoraAvulsaNFE() {

    const select =
        document.getElementById(
            'avulsaTransportadoraId'
        );


    if (!select) {

        console.warn(
            '⚠️ avulsaTransportadoraId não encontrado'
        );

        return false;
    }


    try {

        select.disabled =
            true;


        select.innerHTML = `

            <option value="">
                Carregando transportadoras...
            </option>
        `;


        const response =
            await fetch(
                `${window.API_BASE_URL}/nfe/transportadoras`,
                {
                    method:
                        'GET',

                    headers: {
                        'Accept':
                            'application/json'
                    },

                    cache:
                        'no-store'
                }
            );


        if (
            !response.ok
        ) {

            throw new Error(
                `HTTP ${response.status}`
            );
        }


        const data =
            await response.json();


        if (
            data.success ===
            false
        ) {

            throw new Error(
                data.error ||
                'Erro ao carregar transportadoras'
            );
        }


        const transportadoras =
            Array.isArray(
                data.transportadoras
            )
                ? data.transportadoras
                : [];


        select.innerHTML = `

            <option value="">
                Sem transportadora
            </option>

            ${
                transportadoras
                    .map(
                        transportadora => `

                            <option
                                value="${Number(
                                    transportadora.id
                                )}"
                            >

                                ${escaparHTMLCadastroNFE(
                                    transportadora.nome ||
                                    'Transportadora'
                                )}

                                ${
                                    transportadora.cnpj
                                        ? ` - ${escaparHTMLCadastroNFE(
                                            transportadora.cnpj
                                        )}`
                                        : ''
                                }

                            </option>

                        `
                    )
                    .join(
                        ''
                    )
            }
        `;


        select.disabled =
            false;


        return true;


    } catch (
        error
    ) {

        console.error(
            '❌ Erro carregando transportadoras para NF-e avulsa:',
            error
        );


        select.innerHTML = `

            <option value="">
                Erro ao carregar transportadoras
            </option>
        `;


        select.disabled =
            false;


        return false;
    }
}

async function confirmarEmissaoNFE() {

    console.log(
        '🔵 [confirmarEmissaoNFE] INICIADA'
    );


    let nfeFoiEmitida =
        false;


    const orderIdPrincipal =
        normalizarOrderIdML(
            pendingEmitOrderId
        );


    if (
        !orderIdPrincipal
    ) {

        showToast(
            '❌ Nenhuma venda selecionada',
            'error'
        );

        fecharModalEdicaoProdutos();

        return;
    }


    // =====================================================
    // TODAS AS ORDERS QUE PERTENCEM À MESMA NF-E
    // =====================================================

    let orderIdsDaNFE =
        [];


    if (
        Array.isArray(
            window._nfeOrderIdsAtuais
        ) &&
        window._nfeOrderIdsAtuais.length >
            0
    ) {

        orderIdsDaNFE =
            window
                ._nfeOrderIdsAtuais
                .map(
                    normalizarOrderIdML
                )
                .filter(Boolean);
    }


    if (
        orderIdsDaNFE.length ===
        0 &&
        window._nfeVendaAtual &&
        Array.isArray(
            window._nfeVendaAtual
                ._order_ids_pack
        )
    ) {

        orderIdsDaNFE =
            window
                ._nfeVendaAtual
                ._order_ids_pack
                .map(
                    normalizarOrderIdML
                )
                .filter(Boolean);
    }


    if (
        orderIdsDaNFE.length ===
        0
    ) {

        orderIdsDaNFE = [
            orderIdPrincipal
        ];
    }


    if (
        !orderIdsDaNFE.includes(
            orderIdPrincipal
        )
    ) {

        orderIdsDaNFE.unshift(
            orderIdPrincipal
        );
    }


    orderIdsDaNFE =
        [
            ...new Set(
                orderIdsDaNFE
            )
        ];


    console.log(
        '📦 Orders desta NF-e:',
        orderIdsDaNFE
    );


    // =====================================================
    // BLOQUEIO DE DUPLICIDADE DE CLIQUE
    // =====================================================

    if (
        window._nfeEmissaoEmAndamento
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


    // =====================================================
    // CLIENTE
    // =====================================================

    const nome =
        campo(
            '#clienteNome'
        )?.value.trim() ||
        '';


    const documento =
        String(
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
        String(
            campo(
                '#clienteUF'
            )?.value ||
            ''
        )
            .trim()
            .toUpperCase();


    const cep =
        String(
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


    const naturezaOperacao =
        campo(
            '#nfeNaturezaOperacao'
        )?.value ||
        'VENDA';


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

try {

    console.log(
        '👤 Garantindo cadastro do cliente após emissão da NF-e...',
        {
            nome,
            documento
        }
    );


    // ===== SALVAR CLIENTE IMEDIATAMENTE APÓS EMISSÃO =====
const resultadoCliente = await salvarClienteNoBanco({
    nome,
    documento,
    endereco,
    numero,
    bairro,
    cidade,
    uf,
    cep
});

if (resultadoCliente.success) {
    if (resultadoCliente.existente) {
        console.log('ℹ️ Cliente já estava cadastrado');
    } else {
        console.log('✅ Novo cliente cadastrado com sucesso');
    }
} else {
    console.warn('⚠️ NF-e emitida, mas cliente não foi cadastrado');
}


    if (
        resultadoCliente?.success
    ) {

        if (
            resultadoCliente.existente
        ) {

            console.log(
                `ℹ️ Cliente ${documento} já estava cadastrado`
            );

        } else {

            console.log(
                `✅ Cliente ${documento} cadastrado automaticamente após a NF-e`
            );
        }


        // Atualizar a lista de clientes em memória/tela
        try {

            await carregarClientes();

        } catch (
            error
        ) {

            console.warn(
                '⚠️ Cliente salvo, mas lista não foi atualizada:',
                error
            );
        }


    } else {

        console.warn(
            '⚠️ NF-e emitida, mas cliente não foi salvo:',
            resultadoCliente?.error
        );
    }


} catch (
    error
) {

    // =====================================================
    // MUITO IMPORTANTE:
    //
    // A NF-e JÁ FOI EMITIDA.
    // Erro ao salvar cliente NÃO pode transformar isso
    // em erro de emissão.
    // =====================================================

    console.warn(
        '⚠️ NF-e emitida, mas houve erro ao salvar o cliente:',
        error
    );
}


    // =====================================================
    // PRODUTOS
    // =====================================================

    const produtos =
        Array.isArray(
            window.produtosParaEmissao
        )
            ? window.produtosParaEmissao
            : [];


    if (
        produtos.length ===
        0
    ) {

        showToast(
            '❌ Nenhum produto para emissão',
            'error'
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


    if (
        btn
    ) {

        btn.disabled =
            true;

        btn.innerHTML =
            '<span class="spinner"></span> Emitindo...';
    }


    window._nfeEmissaoEmAndamento =
        orderIdPrincipal;


    try {

        // =====================================================
        // 1. VERIFICAR DUPLICIDADE
        //
        // SE QUALQUER ORDER DO PACOTE JÁ TEM NF-E,
        // NÃO PODE EMITIR NOVAMENTE.
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

                        if (
                            nfe.cancelada
                        ) {

                            return false;
                        }


                        const vendaNfe =
                            normalizarOrderIdML(

                                nfe.venda_id ||

                                nfe.venda_id_ml ||

                                nfe.id_venda
                            );


                        return (
                            vendaNfe &&
                            orderIdsDaNFE.includes(
                                vendaNfe
                            )
                        );
                    }
                );


            if (
                existente
            ) {

                showToast(
                    '🚫 Um dos pedidos deste pacote já possui NF-e.',
                    'warning'
                );


                fecharModalEdicaoProdutos();


                pendingEmitOrderId =
                    null;

                vendaIdParaEdicao =
                    null;

                window._nfeOrderIdsAtuais =
                    null;

                window._nfeVendaAtual =
                    null;


                return;
            }
        }


        // =====================================================
        // 2. TOKEN
        // =====================================================

        let token =
            localStorage.getItem(
                'ml_access_token'
            );


        if (
            !token &&
            typeof window.getValidToken ===
                'function'
        ) {

            const tokenData =
                await window
                    .getValidToken();


            token =
                tokenData
                    ?.access_token;
        }


        const mlToken =
            window._mlAccessToken ||
            token;


        // =====================================================
        // 3. NCM
        // =====================================================

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

                            try {

                                const salvo =
                                    await buscarNCMporSKU(
                                        produto.sku
                                    );


                                if (
                                    salvo
                                ) {

                                    ncm =
                                        salvo;

                                } else {

                                    await salvarNCMporSKU(
                                        produto.sku,
                                        ncm
                                    );
                                }


                            } catch (
                                error
                            ) {

                                console.warn(
                                    `⚠️ NCM ${produto.sku}:`,
                                    error
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

        const payload = {

            venda_id:
                String(
                    orderIdPrincipal
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
                naturezaOperacao,

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
            '📤 Payload NF-e PACK:',
            {
                orderPrincipal:
                    orderIdPrincipal,

                todasOrders:
                    orderIdsDaNFE,

                quantidadeProdutos:
                    produtosFinal.length,

                payload
            }
        );


        // =====================================================
        // 5. EMITIR UMA ÚNICA NF-E
        // =====================================================

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


        let result =
            {};


        try {

            result =
                await response.json();

        } catch {

            throw new Error(
                `API retornou HTTP ${response.status} sem JSON válido`
            );
        }


        if (
            !response.ok ||
            !result.success
        ) {

            throw new Error(
                result.error ||
                result.message ||
                `Erro HTTP ${response.status} ao emitir NF-e`
            );
        }


        // =====================================================
        // A NF-E JÁ EXISTE A PARTIR DAQUI
        // =====================================================

        nfeFoiEmitida =
            true;


        const chave =
            result.chaveAcesso ||
            result.chave_acesso ||
            result.chave ||
            null;


        console.log(
            '✅ NF-e ÚNICA emitida:',
            {
                chave,
                protocolo:
                    result.protocolo,

                orders:
                    orderIdsDaNFE,

                resultado:
                    result
            }
        );


        showToast(
            orderIdsDaNFE.length >
                1
                ? `✅ NF-e única emitida para o pacote com ${orderIdsDaNFE.length} pedidos!`
                : `✅ NF-e emitida! Protocolo: ${result.protocolo || 'autorizada'}`,
            'success'
        );


        // Fechar imediatamente para impedir clique duplicado
        fecharModalEdicaoProdutos();


        // =====================================================
        // 6. SALVAR UMA ÚNICA NF-E
        // =====================================================

        try {

            if (
                chave
            ) {

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


                if (
                    !existente
                ) {

                    const valorTotal =
                        produtosFinal.reduce(
                            (
                                total,
                                produto
                            ) =>
                                total +
                                (
                                    Number(
                                        produto.valor_unitario ||
                                        0
                                    ) *
                                    Number(
                                        produto.quantidade ||
                                        1
                                    )
                                ),
                            0
                        );


                    const {
                        error
                    } =
                        await window
                            .supabaseClient
                            .from(
                                'nfe_emitidas'
                            )
                            .insert({

                                chave_acesso:
                                    chave,

                                // Apenas order principal
                                venda_id:
                                    orderIdPrincipal,

                                protocolo:
                                    result.protocolo ||
                                    null,

                                data_emissao:
                                    new Date()
                                        .toISOString(),

                                cliente_nome:
                                    nome,

                                valor_total:
                                    valorTotal,

                                xml_assinado:
                                    result.xml ||
                                    null,

                                cancelada:
                                    false
                            });


                    if (
                        error
                    ) {

                        console.warn(
                            '⚠️ NF-e emitida, mas registro não foi salvo:',
                            error
                        );
                    }
                }
            }


        } catch (
            error
        ) {

            console.warn(
                '⚠️ Erro salvando NF-e:',
                error
            );
        }


        // =====================================================
        // 7. MARCAR TODAS AS ORDERS COMO NF-E EMITIDA
        // =====================================================

        const variantesTodasOrders =
            [
                ...new Set(

                    orderIdsDaNFE.flatMap(
                        id =>
                            typeof variantesOrderIdML ===
                                'function'
                                ? variantesOrderIdML(
                                    id
                                )
                                : [
                                    id
                                ]
                    )
                )
            ];


        // -----------------------------------------------------
        // vendas_ml
        // -----------------------------------------------------

        try {

            const {
                error:
                    erroCompleto
            } =
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
                    .in(
                        'id_venda_ml',
                        variantesTodasOrders
                    );


            // Algumas instalações não possuem todas as colunas
            if (
                erroCompleto
            ) {

                console.warn(
                    '⚠️ Update completo vendas_ml falhou. Tentando básico:',
                    erroCompleto
                );


                const {
                    error:
                        erroBasico
                } =
                    await window
                        .supabaseClient
                        .from(
                            'vendas_ml'
                        )
                        .update({

                            nfe_emitida:
                                true,

                            updated_at:
                                new Date()
                                    .toISOString()

                        })
                        .in(
                            'id_venda_ml',
                            variantesTodasOrders
                        );


                if (
                    erroBasico
                ) {

                    console.warn(
                        '⚠️ Update básico vendas_ml também falhou:',
                        erroBasico
                    );
                }
            }


        } catch (
            error
        ) {

            console.warn(
                '⚠️ Erro atualizando vendas_ml:',
                error
            );
        }


        // -----------------------------------------------------
        // CACHE
        // -----------------------------------------------------

        try {

            const {
                error
            } =
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
                    .in(
                        'id_venda_ml',
                        orderIdsDaNFE
                    );


            if (
                error
            ) {

                console.warn(
                    '⚠️ Erro marcando cache:',
                    error
                );
            }


        } catch (
            error
        ) {

            console.warn(
                '⚠️ Erro atualizando cache:',
                error
            );
        }


        // =====================================================
        // 8. BAIXA DO ESTOQUE
        //
        // UMA NF-E
        // MAS CADA ORDER PRECISA SER PROCESSADA.
        // =====================================================

        const resultadosEstoque =
            [];


        for (
            const idVendaEstoque
            of orderIdsDaNFE
        ) {

            try {

                console.log(
                    `📦 Processando baixa da order ${idVendaEstoque}...`
                );


                const resultadoEstoque =
                    await garantirBaixaEstoqueVenda(
                        idVendaEstoque,
                        'nfe'
                    );


                resultadosEstoque.push({

                    vendaId:
                        idVendaEstoque,

                    ...resultadoEstoque
                });


            } catch (
                error
            ) {

                console.error(
                    `❌ Erro na baixa ${idVendaEstoque}:`,
                    error
                );


                resultadosEstoque.push({

                    vendaId:
                        idVendaEstoque,

                    success:
                        false,

                    error:
                        error.message
                });
            }
        }


        console.log(
            '📦 Resultado das baixas do pacote:',
            resultadosEstoque
        );


        const falhasEstoque =
            resultadosEstoque.filter(
                resultado =>
                    !resultado.success
            );


        const syncPendente =
            resultadosEstoque.filter(
                resultado =>
                    resultado.success &&
                    resultado.sincronizado ===
                        false &&
                    !resultado.full
            );


        if (
            falhasEstoque.length >
            0
        ) {

            showToast(
                `⚠️ NF-e emitida, mas ${falhasEstoque.length} pedido(s) tiveram erro na baixa do estoque.`,
                'warning'
            );


        } else if (
            syncPendente.length >
            0
        ) {

            showToast(
                '⚠️ NF-e emitida e estoque baixado. Existe sincronização com ML pendente.',
                'warning'
            );


        } else {

            console.log(
                '✅ Estoque de todas as orders processado'
            );
        }


        // =====================================================
        // 9. BUSCAR XML
        // =====================================================

        try {

            if (
                chave
            ) {

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


                        if (
                            nfeMatch
                        ) {

                            xmlContent =
                                '<?xml version="1.0" encoding="UTF-8"?>\n' +
                                '<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">\n' +
                                nfeMatch[0] +
                                '\n' +
                                (
                                    protMatch
                                        ? protMatch[0]
                                        : ''
                                ) +
                                '\n</nfeProc>';
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


                    // =============================================
                    // VINCULAR A MESMA NF-E ÀS ORDERS DO PACOTE
                    // =============================================

                    for (
                        const idML
                        of orderIdsDaNFE
                    ) {

                        try {

                            console.log(
                                `📤 Vinculando NF-e à order ${idML}`
                            );


                            const resultadoXML =
                                await enviarXMLparaMercadoLivre(
                                    idML,
                                    xmlContent,
                                    mlToken
                                );


                            console.log(
                                `📥 XML order ${idML}:`,
                                resultadoXML
                            );


                        } catch (
                            error
                        ) {

                            console.warn(
                                `⚠️ XML não vinculado à order ${idML}:`,
                                error
                            );
                        }
                    }
                }
            }


        } catch (
            error
        ) {

            console.warn(
                '⚠️ NF-e emitida, mas erro ao processar XML ML:',
                error
            );


            showToast(
                '⚠️ NF-e emitida, mas houve erro ao vincular o XML ao Mercado Livre.',
                'warning'
            );
        }


        // =====================================================
        // 10. SALVAR CLIENTE
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


        } catch (
            error
        ) {

            console.warn(
                '⚠️ NF-e emitida, mas erro salvando cliente:',
                error
            );
        }


        // =====================================================
        // 11. HISTÓRICO GERAL DA NF-E
        // =====================================================

        try {

            await window
                .supabaseClient
                .from(
                    'estoque_historico'
                )
                .insert({

                    venda_id:
                        orderIdPrincipal,

                    tipo:
                        'nfe',

                    observacao:
                        orderIdsDaNFE.length >
                            1
                            ? `NF-e única emitida para pacote ML - Orders: ${orderIdsDaNFE.join(', ')} - Cliente: ${nome}`
                            : `NF-e emitida - Venda ${orderIdPrincipal} - Cliente: ${nome}`,

                    criado_por:
                        'Sistema NF-e',

                    criado_em:
                        new Date()
                            .toISOString()
                });


        } catch (
            error
        ) {

            // Histórico individual da baixa é feito
            // pela rotina de estoque.
            console.warn(
                '⚠️ Histórico geral NF-e:',
                error
            );
        }


        // =====================================================
        // LIMPAR ESTADO
        // =====================================================

        window.produtosParaEmissao =
            null;


        pendingEmitOrderId =
            null;

        vendaIdParaEdicao =
            null;


        // =====================================================
        // 12. RECARREGAR TELA
        // =====================================================

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
            orderIdsDaNFE.length >
                1
                ? `✅ Processo concluído! 1 NF-e para ${orderIdsDaNFE.length} pedidos.`
                : '✅ Processo da NF-e concluído!',
            'success'
        );
    } catch (
        error
    ) {
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
        window._mlAccessToken =
            null;
        window._nfeEmissaoEmAndamento =
            null;
        if (
            nfeFoiEmitida
        ) {
            window._nfeOrderIdsAtuais =
                null;
            window._nfeVendaAtual =
                null;
        }
    }
}

function normalizarResultadoRPCBaixaNFE(
    resultado
) {

    // =====================================================
    // SUPABASE PODE RETORNAR:
    //
    // { success: true }
    //
    // OU
    //
    // [ { success: true } ]
    //
    // =====================================================

    if (
        Array.isArray(
            resultado
        )
    ) {

        if (
            resultado.length ===
            0
        ) {

            return {};
        }

        return (
            resultado[0] ||
            {}
        );
    }


    if (
        resultado &&
        typeof resultado ===
            'object'
    ) {

        return resultado;
    }


    return {};
}

async function registrarMovimentacoesProdutosBaixaNFE(
    vendaId,
    origem = 'manual',
    detalhesEstoque = []
) {

    vendaId =
        normalizarOrderIdML(
            vendaId
        );


    const detalhes =
        Array.isArray(
            detalhesEstoque
        )
            ? detalhesEstoque
            : [];


    if (
        detalhes.length ===
        0
    ) {

        console.warn(
            `⚠️ Venda ${vendaId}: nenhum produto para registrar movimentação`
        );

        return {
            success: false,
            registrados: 0,
            erros: []
        };
    }


    // =====================================================
    // A FUNÇÃO registrarMovimentacao É A ROTINA
    // DO PRÓPRIO SISTEMA DE ESTOQUE.
    //
    // É ELA QUE FAZ A SAÍDA APARECER NO HISTÓRICO
    // DO CADASTRO INDIVIDUAL DO PRODUTO.
    // =====================================================

    if (
        typeof window
            .registrarMovimentacao !==
        'function'
    ) {

        console.error(
            '❌ window.registrarMovimentacao não está disponível.'
        );

        return {
            success: false,
            registrados: 0,
            erros: [
                'registrarMovimentacao não disponível'
            ]
        };
    }


    let registrados =
        0;

    const erros =
        [];


    for (
        const item
        of detalhes
    ) {

        if (
            !item ||
            item.encontrado ===
                false
        ) {

            continue;
        }


        const produtoId =
            item.produto_id;


        const sku =
            item.sku ||
            'SEM_SKU';


        const quantidade =
            Number(
                item.quantidade_venda ||
                0
            );


        if (
            !produtoId
        ) {

            console.warn(
                `⚠️ SKU ${sku}: produto_id não encontrado no estoque_detalhes`
            );

            erros.push(
                `${sku}: sem produto_id`
            );

            continue;
        }


        if (
            quantidade <=
            0
        ) {

            console.warn(
                `⚠️ SKU ${sku}: quantidade inválida para histórico`
            );

            erros.push(
                `${sku}: quantidade inválida`
            );

            continue;
        }


        try {

            // =================================================
            // REFERÊNCIA DA MOVIMENTAÇÃO
            // =================================================

            const referencia =
                origem === 'nfe'

                    ? `NFE-${vendaId}`

                    : `ML-${vendaId}`;


            console.log(
                `📝 Registrando movimentação do produto ${sku}: -${quantidade}`,
                {
                    produtoId,
                    vendaId,
                    origem,
                    referencia
                }
            );


            await window
                .registrarMovimentacao(

                    produtoId,

                    'saida',

                    quantidade,

                    referencia,

                    'venda'
                );


            registrados++;


            console.log(
                `✅ Movimentação registrada: ${sku} -${quantidade}`
            );


        } catch (
            error
        ) {

            console.error(
                `❌ Erro ao registrar movimentação do SKU ${sku}:`,
                error
            );


            erros.push(
                `${sku}: ${error.message}`
            );
        }
    }


    return {

        success:
            erros.length === 0,

        registrados,

        erros
    };
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
        `📦 [BAIXA] Venda ${vendaId} | origem=${origem}`
    );


    try {

        // =====================================================
        // 1. ESTADO DA VENDA
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
                `ℹ️ ${vendaId}: FULL, sem baixa local`
            );


            return {

                success: true,

                full: true,

                skipped: true
            };
        }


        // =====================================================
        // 3. JÁ BAIXADO
        // =====================================================

        if (
            vendaCache
                .estoque_baixado
        ) {

            console.log(
                `✅ ${vendaId}: estoque já baixado`
            );


            // =============================================
            // SE SYNC ESTAVA PENDENTE, TENTAR NOVAMENTE
            // =============================================

            if (
                vendaCache
                    .estoque_status ===
                'baixado_sync_pendente'
            ) {

                console.log(
                    `🔄 ${vendaId}: repetindo sincronização ML`
                );


                const sincronizado =
                    await sincronizarProdutosBaixadosNFE(
                        vendaCache.estoque_detalhes || []
                    );


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

                sincronizado:
                    true
            };
        }


        // =====================================================
        // 4. PRODUTOS
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


        console.log(
            '📦 Produtos da baixa:',
            detalhesEstoque
        );


        // =====================================================
        // 5. PROCESSANDO
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
        // 6. RPC
        // =====================================================

        console.log(
            `📉 Executando RPC de baixa ${vendaId}`
        );


        const {
            data:
                resultadoRPCOriginal,

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


        console.log(
            '📥 Retorno bruto da RPC:',
            resultadoRPCOriginal
        );


        // =====================================================
        // NORMALIZAR RETORNO
        // =====================================================

        const resultado =
            normalizarResultadoRPCBaixaNFE(
                resultadoRPCOriginal
            );


        console.log(
            '📥 Retorno normalizado da RPC:',
            resultado
        );


        // =====================================================
        // JÁ BAIXADO PELA RPC
        // =====================================================

        if (
            resultado
                .already ===
            true
        ) {

            console.log(
                `✅ RPC informou que ${vendaId} já estava baixada`
            );


            return {

                success: true,

                already: true,

                skipped: true
            };
        }


        // =====================================================
        // VALIDAR RESULTADO
        // =====================================================

        if (
            resultado
                .success !==
            true
        ) {

            throw new Error(
                resultado
                    .error ||
                'RPC realizou a operação, mas não retornou success=true'
            );
        }


        console.log(
            `✅ ${vendaId}: BAIXA LOCAL CONCLUÍDA`
        );


        // =====================================================
        // 7. HISTÓRICO INDIVIDUAL DOS PRODUTOS
        //
        // ESTA É A PARTE QUE FAZ APARECER NO CADASTRO.
        // =====================================================

        const movimentacoes =
            await registrarMovimentacoesProdutosBaixaNFE(

                vendaId,

                origem,

                detalhesEstoque
            );


        if (
            movimentacoes.success
        ) {

            console.log(
                `✅ ${movimentacoes.registrados} movimentação(ões) registrada(s) nos produtos`
            );

        } else {

            console.warn(
                '⚠️ Falha em alguma movimentação de produto:',
                movimentacoes
            );
        }


        // =====================================================
        // 8. HISTÓRICO GERAL
        // =====================================================

        const historico =
            await registrarHistoricoBaixaEstoqueNFE(

                vendaId,

                origem,

                detalhesEstoque
            );


        if (
            !historico.success
        ) {

            console.warn(
                '⚠️ Histórico geral não foi gravado:',
                historico
            );
        }


        // =====================================================
        // 9. SYNC ML
        //
        // SEMPRE DEPOIS DA BAIXA LOCAL.
        // =====================================================

        console.log(
    `🚀 Acionando sincronização da Gestão de Estoque após baixa da venda ${vendaId}...`
            );

            let sincronizado =
                false;


            try {

                sincronizado =
                    await sincronizarProdutosBaixadosNFE(
                        detalhesEstoque
                    );


            } catch (
                syncError
            ) {

                console.error(
                    `❌ Erro ao sincronizar produtos da venda ${vendaId}:`,
                    syncError
                );

                sincronizado =
                    false;
            }


        // =====================================================
        // 10. ESTADO FINAL
        // =====================================================

        const agora =
            new Date()
                .toISOString();


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
                            agora,

                        atualizado_em:
                            agora

                    })
                    .eq(
                        'id_venda_ml',
                        vendaId
                    );


            if (
                erroStatus
            ) {

                console.error(
                    '⚠️ Erro salvando status baixado:',
                    erroStatus
                );
            }


            console.log(
                `✅ ${vendaId}: BAIXA + HISTÓRICO + SYNC ML CONCLUÍDOS`
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
                            agora,

                        atualizado_em:
                            agora

                    })
                    .eq(
                        'id_venda_ml',
                        vendaId
                    );


            if (
                erroStatus
            ) {

                console.error(
                    '⚠️ Erro salvando sync pendente:',
                    erroStatus
                );
            }


            console.warn(
                `⚠️ ${vendaId}: baixa realizada, mas sync ML ficou pendente`
            );
        }


        // =====================================================
        // ATUALIZAR VISUAL DO ESTOQUE
        // =====================================================

        if (
            typeof window
                .carregarProdutosEstoque ===
            'function'
        ) {

            try {

                await window
                    .carregarProdutosEstoque();

            } catch (
                error
            ) {

                console.warn(
                    '⚠️ Erro recarregando produtos:',
                    error
                );
            }
        }


        return {

            success: true,

            already: false,

            skipped: false,

            sincronizado,

            movimentacoes:

                movimentacoes
                    .registrados,

            historico:
                historico.success,

            resultado
        };


    } catch (
        error
    ) {

        console.error(
            `❌ Erro na baixa ${vendaId}:`,
            error
        );


        // =====================================================
        // CUIDADO:
        // A RPC PODE TER ALTERADO O ESTOQUE.
        //
        // VERIFICAR CACHE ANTES DE MARCAR ERRO.
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
                '⚠️ Erro verificando status depois da falha:',
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

// =========================================================
// DATA/HORA CORRETA PARA NF-e / EVENTOS SEFAZ
// Timezone oficial usado pelo sistema: America/Sao_Paulo
// Exemplo:
// 2026-08-13T10:20:35-03:00
// =========================================================

function obterDataHoraNFeBrasil(data = new Date()) {
    const timeZone = 'America/Sao_Paulo';

    const formatter = new Intl.DateTimeFormat(
        'en-CA',
        {
            timeZone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hourCycle: 'h23',
            timeZoneName: 'longOffset'
        }
    );

    const partes = formatter.formatToParts(data);

    const valores = {};

    for (const parte of partes) {
        valores[parte.type] = parte.value;
    }

    let offset = '-03:00';

    if (valores.timeZoneName) {
        const match = valores.timeZoneName.match(
            /GMT([+-]\d{2}):?(\d{2})/
        );

        if (match) {
            offset = `${match[1]}:${match[2]}`;
        }
    }

    const resultado =
        `${valores.year}-` +
        `${valores.month}-` +
        `${valores.day}T` +
        `${valores.hour}:` +
        `${valores.minute}:` +
        `${valores.second}` +
        `${offset}`;

    return resultado;
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

async function emitirNFEAvulsa(
    event = null
) {

    const clienteId =
        document
            .getElementById(
                'avulsaClienteId'
            )
            ?.value;


    const cfop =
        document
            .getElementById(
                'avulsaCfop'
            )
            ?.value;


    const naturezaOperacao =
        document
            .getElementById(
                'avulsaNatOp'
            )
            ?.value;


    const transportadoraId =
        document
            .getElementById(
                'avulsaTransportadoraId'
            )
            ?.value ||
        null;


    const modalidadeFrete =
        document
            .getElementById(
                'avulsaModFrete'
            )
            ?.value ||
        '9';


    // =====================================================
    // VALIDAÇÕES
    // =====================================================

    if (!clienteId) {

        showToast(
            'Selecione um cliente',
            'warning'
        );

        document
            .getElementById(
                'avulsaClienteBusca'
            )
            ?.focus();

        return;
    }


    if (!cfop) {

        showToast(
            'Selecione o CFOP',
            'warning'
        );

        return;
    }


    if (
        !naturezaOperacao
    ) {

        showToast(
            'Selecione a Natureza da Operação',
            'warning'
        );

        return;
    }

    if (
    !Array.isArray(
        window._itensAvulsaNFE
    ) ||
    window._itensAvulsaNFE.length === 0
) {

    showToast(
        'Adicione pelo menos um produto à NF-e',
        'warning'
    );

    document
        .getElementById(
            'avulsaProdutoBusca'
        )
        ?.focus();

    return;
}


atualizarProdutosJSONAvulsaNFE();


    // =====================================================
    // PRODUTOS
    // =====================================================

    let produtos;


    try {

        produtos =
            JSON.parse(
                document
                    .getElementById(
                        'avulsaProdutos'
                    )
                    ?.value ||
                '[]'
            );


        if (
            !Array.isArray(
                produtos
            ) ||
            produtos.length ===
                0
        ) {

            throw new Error(
                'Produtos inválidos'
            );
        }


    } catch (
        error
    ) {

        showToast(
            'Produtos inválidos. Use um array JSON válido.',
            'error'
        );

        return;
    }


    // =====================================================
    // PAYLOAD
    // =====================================================

    const dados = {

        cliente: {

            id:
                clienteId
        },

        produtos,

        cfop,

        natureza_operacao:
            naturezaOperacao,

        modalidade_frete:
            modalidadeFrete,

        transportadora_id:
            transportadoraId
    };


    console.log(
        '📤 NF-e avulsa:',
        dados
    );


    // =====================================================
    // BOTÃO
    // =====================================================

    const btn =
        event?.currentTarget ||
        event?.target ||
        document.querySelector(
            '[onclick*="emitirNFEAvulsa"]'
        );


    const original =
        btn?.innerHTML ||
        '';


    if (
        btn
    ) {

        btn.disabled =
            true;

        btn.innerHTML =
            '<span class="spinner"></span> Emitindo...';
    }


    try {

        const response =
            await fetch(
                `${window.API_BASE_URL}/nfe/emitir-avulsa`,
                {
                    method:
                        'POST',

                    headers: {
                        'Content-Type':
                            'application/json'
                    },

                    body:
                        JSON.stringify(
                            dados
                        )
                }
            );


        let result =
            {};


        try {

            result =
                await response.json();

        } catch {}


        if (
            !response.ok ||
            !result.success
        ) {

            throw new Error(
                result.error ||
                result.message ||
                `Erro HTTP ${response.status}`
            );
        }


        showToast(
            '✅ NF-e avulsa emitida com sucesso!',
            'success'
        );


        await limparFormAvulsa();


        try {

            await carregarNFesEmitidas();

        } catch {}


    } catch (
        error
    ) {

        console.error(
            '❌ Erro na NF-e avulsa:',
            error
        );


        showToast(
            `Erro ao emitir NF-e: ${error.message}`,
            'error'
        );


    } finally {

        if (
            btn
        ) {

            btn.disabled =
                false;

            btn.innerHTML =
                original;
        }
    }
}

async function limparFormAvulsa() {

    // =====================================================
    // CLIENTE
    // =====================================================

    limparClienteSelecionadoAvulsaNFE();


    // =====================================================
    // PRODUTOS
    // =====================================================

    window._itensAvulsaNFE =
        [];


    renderizarProdutosAvulsaNFE();


    const buscaProduto =
        document.getElementById(
            'avulsaProdutoBusca'
        );


    if (
        buscaProduto
    ) {

        buscaProduto.value =
            '';
    }


    const resultadosProduto =
        document.getElementById(
            'avulsaProdutoResultados'
        );


    if (
        resultadosProduto
    ) {

        resultadosProduto.innerHTML =
            '';

        resultadosProduto.style.display =
            'none';
    }


    // =====================================================
    // TRANSPORTADORA
    // =====================================================

    const transportadora =
        document.getElementById(
            'avulsaTransportadoraId'
        );


    if (
        transportadora
    ) {

        transportadora.value =
            '';
    }


    // =====================================================
    // FRETE
    // =====================================================

    const modalidade =
        document.getElementById(
            'avulsaModFrete'
        );


    if (
        modalidade
    ) {

        modalidade.value =
            '9';
    }


    // =====================================================
    // RESTAURAR PADRÕES
    // =====================================================

    try {

        await Promise.all([

            preencherSelectCFOPAvulsaNFE(),

            preencherSelectNaturezaAvulsaNFE(),

            preencherSelectTransportadoraAvulsaNFE(),

            carregarProdutosAvulsaNFE()
        ]);


    } catch (
        error
    ) {

        console.warn(
            '⚠️ Erro restaurando formulário avulso:',
            error
        );
    }
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

function garantirEstruturaCadastrosNFE() {

    let aba =
        document.getElementById(
            'abaCadastros'
        );


    // =====================================================
    // CRIAR ABA CASO NÃO EXISTA
    // =====================================================

    if (!aba) {

        const referencia =
            document.getElementById(
                'abaClientes'
            ) ||
            document.getElementById(
                'abaTransportadoras'
            ) ||
            document.getElementById(
                'abaAvulsa'
            ) ||
            document.getElementById(
                'abaVendas'
            );


        if (!referencia) {

            console.error(
                '❌ Não foi possível localizar a área NF-e para criar Cadastros'
            );

            return null;
        }


        aba =
            document.createElement(
                'div'
            );

        aba.id =
            'abaCadastros';

        aba.className =
            'hidden';


        const pai =
            referencia.parentElement;


        pai.appendChild(
            aba
        );
    }


    // =====================================================
    // GARANTIR ESTRUTURA INTERNA
    //
    // IMPORTANTE:
    // não basta #abaCadastros existir.
    // =====================================================

    if (
        !aba.querySelector(
            '#cadastrosNFEConteudo'
        ) ||
        !aba.querySelector(
            '#cadNFEBtnTransportadoras'
        )
    ) {

        aba.innerHTML = `

            <div class="card">

                <div
                    style="
                        display:flex;
                        justify-content:space-between;
                        align-items:center;
                        margin-bottom:20px;
                    "
                >

                    <div>

                        <h3 style="margin:0;">
                            <i class="fas fa-cogs"></i>
                            Cadastros NF-e
                        </h3>

                        <small style="color:#6c757d;">
                            Cadastre aqui os dados utilizados
                            nas emissões de NF-e.
                        </small>

                    </div>

                </div>


                <div
                    style="
                        display:grid;
                        grid-template-columns:repeat(auto-fit,minmax(190px,1fr));
                        gap:10px;
                        margin-bottom:22px;
                    "
                >

                    <button
                        type="button"
                        class="btn btn-outline-primary"
                        id="cadNFEBtnTransportadoras"
                        data-tipo="transportadoras"
                    >
                        <i class="fas fa-truck"></i>
                        Transportadoras
                    </button>


                    <button
                        type="button"
                        class="btn btn-outline-primary"
                        id="cadNFEBtnClientes"
                        data-tipo="clientes"
                    >
                        <i class="fas fa-user"></i>
                        Clientes
                    </button>


                    <button
                        type="button"
                        class="btn btn-outline-primary"
                        id="cadNFEBtnNaturezas"
                        data-tipo="naturezas"
                    >
                        <i class="fas fa-file-alt"></i>
                        Natureza da Operação
                    </button>


                    <button
                        type="button"
                        class="btn btn-outline-primary"
                        id="cadNFEBtnCFOPs"
                        data-tipo="cfops"
                    >
                        <i class="fas fa-list-ol"></i>
                        CFOP
                    </button>

                </div>


                <div
                    id="cadastrosNFEConteudo"
                ></div>

            </div>
        `;
    }


    // =====================================================
    // EVENTOS
    //
    // NÃO DEPENDER DE onclick NO HTML.
    // =====================================================

    const botoes =
        aba.querySelectorAll(
            '[data-tipo]'
        );


    botoes.forEach(
        botao => {

            botao.onclick =
                async event => {

                    event.preventDefault();

                    const tipo =
                        botao.dataset.tipo;


                    await mostrarCadastroNFE(
                        tipo
                    );
                };
        }
    );


    return aba;
}

// =========================================================
// HELPERS - CADASTROS NF-e
// =========================================================

function escaparHTMLCadastroNFE(
    valor
) {

    return String(
        valor ??
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
}


// =========================================================
// CADASTRO - TRANSPORTADORAS
// =========================================================

async function carregarCadastroTransportadorasNFE() {

    const container =
        document.getElementById(
            'cadastrosNFEConteudo'
        );


    if (!container) {

        console.error(
            '❌ cadastrosNFEConteudo não encontrado'
        );

        return;
    }


    container.innerHTML = `

        <div style="text-align:center; padding:25px;">

            <div class="spinner"></div>

            <div style="margin-top:8px;">
                Carregando transportadoras...
            </div>

        </div>
    `;


    try {

        const response =
            await fetch(
                `${window.API_BASE_URL}/nfe/transportadoras`,
                {
                    method:
                        'GET',

                    headers: {
                        'Accept':
                            'application/json'
                    },

                    cache:
                        'no-store'
                }
            );


        if (
            !response.ok
        ) {

            throw new Error(
                `HTTP ${response.status}`
            );
        }


        const data =
            await response.json();


        if (
            data.success ===
            false
        ) {

            throw new Error(
                data.error ||
                'Erro ao carregar transportadoras'
            );
        }


        const transportadoras =
            Array.isArray(
                data.transportadoras
            )
                ? data.transportadoras
                : [];


        container.innerHTML = `

            <div>

                <div
                    style="
                        display:flex;
                        justify-content:space-between;
                        align-items:center;
                        gap:10px;
                        margin-bottom:15px;
                    "
                >

                    <div>

                        <h4 style="margin:0;">
                            <i class="fas fa-truck"></i>
                            Transportadoras
                        </h4>

                        <small style="color:#6c757d;">
                            Cadastre e gerencie as transportadoras utilizadas nas NF-es.
                        </small>

                    </div>


                    <button
                        type="button"
                        class="btn btn-success"
                        onclick="abrirModalTransportadora()"
                    >
                        <i class="fas fa-plus"></i>
                        Nova Transportadora
                    </button>

                </div>


                <div class="table-responsive">

                    <table class="table table-striped">

                        <thead>

                            <tr>

                                <th>
                                    Nome
                                </th>

                                <th>
                                    CNPJ
                                </th>

                                <th>
                                    IE
                                </th>

                                <th>
                                    Cidade / UF
                                </th>

                                <th
                                    style="width:120px;"
                                >
                                    Ações
                                </th>

                            </tr>

                        </thead>


                        <tbody>

                            ${
                                transportadoras.length ===
                                0

                                    ? `

                                        <tr>

                                            <td
                                                colspan="5"
                                                class="text-center"
                                                style="
                                                    padding:25px;
                                                    color:#6c757d;
                                                "
                                            >
                                                Nenhuma transportadora cadastrada.
                                            </td>

                                        </tr>

                                    `

                                    :

                                    transportadoras
                                        .map(
                                            transportadora => `

                                                <tr>

                                                    <td>

                                                        <strong>
                                                            ${escaparHTMLCadastroNFE(
                                                                transportadora.nome ||
                                                                ''
                                                            )}
                                                        </strong>

                                                    </td>


                                                    <td>

                                                        ${escaparHTMLCadastroNFE(
                                                            transportadora.cnpj ||
                                                            '-'
                                                        )}

                                                    </td>


                                                    <td>

                                                        ${escaparHTMLCadastroNFE(
                                                            transportadora.ie ||
                                                            '-'
                                                        )}

                                                    </td>


                                                    <td>

                                                        ${escaparHTMLCadastroNFE(
                                                            transportadora.cidade ||
                                                            '-'
                                                        )}

                                                        ${transportadora.uf
                                                            ? ` / ${escaparHTMLCadastroNFE(
                                                                transportadora.uf
                                                            )}`
                                                            : ''
                                                        }

                                                    </td>


                                                    <td>

                                                        <button
                                                            type="button"
                                                            class="btn btn-sm btn-danger"
                                                            onclick="excluirTransportadora(${Number(
                                                                transportadora.id
                                                            )})"
                                                            title="Excluir transportadora"
                                                        >
                                                            <i class="fas fa-trash"></i>
                                                        </button>

                                                    </td>

                                                </tr>

                                            `
                                        )
                                        .join(
                                            ''
                                        )
                            }

                        </tbody>

                    </table>

                </div>

            </div>
        `;


    } catch (
        error
    ) {

        console.error(
            '❌ Erro carregando cadastro de transportadoras:',
            error
        );


        container.innerHTML = `

            <div class="alert alert-danger">

                <strong>
                    Erro ao carregar transportadoras.
                </strong>

                <br>

                ${escaparHTMLCadastroNFE(
                    error.message
                )}

            </div>
        `;
    }
}


// =========================================================
// CADASTRO - CLIENTES
// =========================================================

async function carregarCadastroClientesNFE() {

    const container =
        document.getElementById(
            'cadastrosNFEConteudo'
        );


    if (!container) {

        console.error(
            '❌ cadastrosNFEConteudo não encontrado'
        );

        return;
    }


    container.innerHTML = `

        <div style="text-align:center; padding:25px;">

            <div class="spinner"></div>

            <div style="margin-top:8px;">
                Carregando clientes...
            </div>

        </div>
    `;


    try {

        const response =
            await fetch(
                `${window.API_BASE_URL}/nfe/clientes`,
                {
                    method:
                        'GET',

                    headers: {
                        'Accept':
                            'application/json'
                    },

                    cache:
                        'no-store'
                }
            );


        if (
            !response.ok
        ) {

            throw new Error(
                `HTTP ${response.status}`
            );
        }


        const data =
            await response.json();


        if (
            data.success ===
            false
        ) {

            throw new Error(
                data.error ||
                'Erro ao carregar clientes'
            );
        }


        const clientes =
            Array.isArray(
                data.clientes
            )
                ? data.clientes
                : [];


        container.innerHTML = `

            <div>

                <div
                    style="
                        display:flex;
                        justify-content:space-between;
                        align-items:center;
                        gap:10px;
                        margin-bottom:15px;
                    "
                >

                    <div>

                        <h4 style="margin:0;">
                            <i class="fas fa-users"></i>
                            Clientes
                        </h4>

                        <small style="color:#6c757d;">
                            Cadastre e gerencie os clientes utilizados nas NF-es.
                        </small>

                    </div>


                    <button
                        type="button"
                        class="btn btn-success"
                        onclick="abrirModalCadastroClienteNFE()"
                    >
                        <i class="fas fa-user-plus"></i>
                        Novo Cliente
                    </button>

                </div>


                <div class="table-responsive">

                    <table class="table table-striped">

                        <thead>

                            <tr>

                                <th>
                                    Nome
                                </th>

                                <th>
                                    CPF / CNPJ
                                </th>

                                <th>
                                    Endereço
                                </th>

                                <th>
                                    Cidade / UF
                                </th>

                                <th
                                    style="width:120px;"
                                >
                                    Ações
                                </th>

                            </tr>

                        </thead>


                        <tbody>

                            ${
                                clientes.length ===
                                0

                                    ? `

                                        <tr>

                                            <td
                                                colspan="5"
                                                class="text-center"
                                                style="
                                                    padding:25px;
                                                    color:#6c757d;
                                                "
                                            >
                                                Nenhum cliente cadastrado.
                                            </td>

                                        </tr>

                                    `

                                    :

                                    clientes
                                        .map(
                                            cliente => `

                                                <tr>

                                                    <td>

                                                        <strong>
                                                            ${escaparHTMLCadastroNFE(
                                                                cliente.nome ||
                                                                ''
                                                            )}
                                                        </strong>

                                                    </td>


                                                    <td>

                                                        ${escaparHTMLCadastroNFE(
                                                            cliente.documento ||
                                                            '-'
                                                        )}

                                                    </td>


                                                    <td>

                                                        ${escaparHTMLCadastroNFE(
                                                            cliente.logradouro ||
                                                            ''
                                                        )}

                                                        ${
                                                            cliente.numero
                                                                ? `, ${escaparHTMLCadastroNFE(
                                                                    cliente.numero
                                                                )}`
                                                                : ''
                                                        }

                                                        ${
                                                            cliente.bairro
                                                                ? ` - ${escaparHTMLCadastroNFE(
                                                                    cliente.bairro
                                                                )}`
                                                                : ''
                                                        }

                                                    </td>


                                                    <td>

                                                        ${escaparHTMLCadastroNFE(
                                                            cliente.cidade ||
                                                            '-'
                                                        )}

                                                        ${
                                                            cliente.uf
                                                                ? ` / ${escaparHTMLCadastroNFE(
                                                                    cliente.uf
                                                                )}`
                                                                : ''
                                                        }

                                                    </td>


                                                    <td>

                                                        <button
                                                            type="button"
                                                            class="btn btn-sm btn-info"
                                                            onclick="visualizarCliente(${Number(
                                                                cliente.id
                                                            )})"
                                                            title="Visualizar cliente"
                                                        >
                                                            <i class="fas fa-eye"></i>
                                                        </button>


                                                        <button
                                                            type="button"
                                                            class="btn btn-sm btn-danger"
                                                            onclick="excluirCliente(${Number(
                                                                cliente.id
                                                            )})"
                                                            title="Excluir cliente"
                                                        >
                                                            <i class="fas fa-trash"></i>
                                                        </button>

                                                    </td>

                                                </tr>

                                            `
                                        )
                                        .join(
                                            ''
                                        )
                            }

                        </tbody>

                    </table>

                </div>

            </div>
        `;


    } catch (
        error
    ) {

        console.error(
            '❌ Erro carregando cadastro de clientes:',
            error
        );


        container.innerHTML = `

            <div class="alert alert-danger">

                <strong>
                    Erro ao carregar clientes.
                </strong>

                <br>

                ${escaparHTMLCadastroNFE(
                    error.message
                )}

            </div>
        `;
    }
}


// =========================================================
// CADASTRO - CFOP
// =========================================================

async function carregarCadastroCFOPsNFE() {

    const container =
        document.getElementById(
            'cadastrosNFEConteudo'
        );


    if (!container) {

        console.error(
            '❌ cadastrosNFEConteudo não encontrado'
        );

        return;
    }


    container.innerHTML = `

        <div style="text-align:center; padding:25px;">

            <div class="spinner"></div>

            <div style="margin-top:8px;">
                Carregando CFOPs...
            </div>

        </div>
    `;


    try {

        const {
            data,
            error
        } =
            await window
                .supabaseClient
                .from(
                    'nfe_cfops'
                )
                .select('*')
                .order(
                    'codigo',
                    {
                        ascending:
                            true
                    }
                );


        if (
            error
        ) {

            throw error;
        }


        const cfops =
            Array.isArray(
                data
            )
                ? data
                : [];


        container.innerHTML = `

            <div>

                <div
                    style="
                        display:flex;
                        justify-content:space-between;
                        align-items:center;
                        gap:10px;
                        margin-bottom:15px;
                    "
                >

                    <div>

                        <h4 style="margin:0;">
                            <i class="fas fa-list-ol"></i>
                            CFOP
                        </h4>

                        <small style="color:#6c757d;">
                            CFOPs disponíveis para emissão de NF-e.
                        </small>

                    </div>


                    <button
                        type="button"
                        class="btn btn-success"
                        onclick="abrirModalCFOPNFE()"
                    >
                        <i class="fas fa-plus"></i>
                        Novo CFOP
                    </button>

                </div>


                <div class="table-responsive">

                    <table class="table table-striped">

                        <thead>

                            <tr>

                                <th>
                                    Código
                                </th>

                                <th>
                                    Descrição
                                </th>

                                <th>
                                    Padrão ML
                                </th>

                                <th>
                                    Padrão Avulsa
                                </th>

                                <th>
                                    Status
                                </th>

                                <th
                                    style="width:170px;"
                                >
                                    Ações
                                </th>

                            </tr>

                        </thead>


                        <tbody>

                            ${
                                cfops.length ===
                                0

                                    ? `

                                        <tr>

                                            <td
                                                colspan="6"
                                                class="text-center"
                                                style="
                                                    padding:25px;
                                                    color:#6c757d;
                                                "
                                            >
                                                Nenhum CFOP cadastrado.
                                            </td>

                                        </tr>

                                    `

                                    :

                                    cfops
                                        .map(
                                            cfop => `

                                                <tr>

                                                    <td>

                                                        <strong>
                                                            ${escaparHTMLCadastroNFE(
                                                                cfop.codigo
                                                            )}
                                                        </strong>

                                                    </td>


                                                    <td>

                                                        ${escaparHTMLCadastroNFE(
                                                            cfop.descricao ||
                                                            ''
                                                        )}

                                                    </td>


                                                    <td>

                                                        ${
                                                            cfop.padrao_ml

                                                                ? `
                                                                    <span class="badge badge-success">
                                                                        Sim
                                                                    </span>
                                                                `

                                                                : '-'
                                                        }

                                                    </td>


                                                    <td>

                                                        ${
                                                            cfop.padrao_avulsa

                                                                ? `
                                                                    <span class="badge badge-success">
                                                                        Sim
                                                                    </span>
                                                                `

                                                                : '-'
                                                        }

                                                    </td>


                                                    <td>

                                                        ${
                                                            cfop.ativo !==
                                                            false

                                                                ? `
                                                                    <span
                                                                        style="
                                                                            color:#28a745;
                                                                            font-weight:600;
                                                                        "
                                                                    >
                                                                        Ativo
                                                                    </span>
                                                                `

                                                                : `
                                                                    <span
                                                                        style="
                                                                            color:#dc3545;
                                                                            font-weight:600;
                                                                        "
                                                                    >
                                                                        Inativo
                                                                    </span>
                                                                `
                                                        }

                                                    </td>


                                                    <td>

                                                        <button
                                                            type="button"
                                                            class="btn btn-sm btn-info"
                                                            onclick="abrirModalCFOPNFE(${Number(
                                                                cfop.id
                                                            )})"
                                                            title="Editar"
                                                        >
                                                            <i class="fas fa-edit"></i>
                                                        </button>


                                                        ${
                                                            cfop.ativo !==
                                                            false

                                                                ? `
                                                                    <button
                                                                        type="button"
                                                                        class="btn btn-sm btn-warning"
                                                                        onclick="alterarStatusCFOPNFE(${Number(
                                                                            cfop.id
                                                                        )}, false)"
                                                                        title="Inativar"
                                                                    >
                                                                        <i class="fas fa-ban"></i>
                                                                    </button>
                                                                `

                                                                : `
                                                                    <button
                                                                        type="button"
                                                                        class="btn btn-sm btn-success"
                                                                        onclick="alterarStatusCFOPNFE(${Number(
                                                                            cfop.id
                                                                        )}, true)"
                                                                        title="Ativar"
                                                                    >
                                                                        <i class="fas fa-check"></i>
                                                                    </button>
                                                                `
                                                        }

                                                    </td>

                                                </tr>

                                            `
                                        )
                                        .join(
                                            ''
                                        )
                            }

                        </tbody>

                    </table>

                </div>

            </div>
        `;


    } catch (
        error
    ) {

        console.error(
            '❌ Erro carregando CFOPs:',
            error
        );


        container.innerHTML = `

            <div class="alert alert-danger">

                <strong>
                    Erro ao carregar CFOPs.
                </strong>

                <br>

                ${escaparHTMLCadastroNFE(
                    error.message
                )}

            </div>
        `;
    }
}


// =========================================================
// CADASTRO - NATUREZA DA OPERAÇÃO
// =========================================================

async function carregarCadastroNaturezasNFE() {

    const container =
        document.getElementById(
            'cadastrosNFEConteudo'
        );


    if (!container) {

        console.error(
            '❌ cadastrosNFEConteudo não encontrado'
        );

        return;
    }


    container.innerHTML = `

        <div style="text-align:center; padding:25px;">

            <div class="spinner"></div>

            <div style="margin-top:8px;">
                Carregando Naturezas da Operação...
            </div>

        </div>
    `;


    try {

        const {
            data,
            error
        } =
            await window
                .supabaseClient
                .from(
                    'nfe_naturezas_operacao'
                )
                .select('*')
                .order(
                    'descricao',
                    {
                        ascending:
                            true
                    }
                );


        if (
            error
        ) {

            throw error;
        }


        const naturezas =
            Array.isArray(
                data
            )
                ? data
                : [];


        container.innerHTML = `

            <div>

                <div
                    style="
                        display:flex;
                        justify-content:space-between;
                        align-items:center;
                        gap:10px;
                        margin-bottom:15px;
                    "
                >

                    <div>

                        <h4 style="margin:0;">
                            <i class="fas fa-file-alt"></i>
                            Natureza da Operação
                        </h4>

                        <small style="color:#6c757d;">
                            Naturezas utilizadas nas emissões de NF-e.
                        </small>

                    </div>


                    <button
                        type="button"
                        class="btn btn-success"
                        onclick="abrirModalNaturezaOperacaoNFE()"
                    >
                        <i class="fas fa-plus"></i>
                        Nova Natureza
                    </button>

                </div>


                <div class="table-responsive">

                    <table class="table table-striped">

                        <thead>

                            <tr>

                                <th>
                                    Descrição
                                </th>

                                <th>
                                    Padrão ML
                                </th>

                                <th>
                                    Padrão Avulsa
                                </th>

                                <th>
                                    Status
                                </th>

                                <th
                                    style="width:170px;"
                                >
                                    Ações
                                </th>

                            </tr>

                        </thead>


                        <tbody>

                            ${
                                naturezas.length ===
                                0

                                    ? `

                                        <tr>

                                            <td
                                                colspan="5"
                                                class="text-center"
                                                style="
                                                    padding:25px;
                                                    color:#6c757d;
                                                "
                                            >
                                                Nenhuma Natureza da Operação cadastrada.
                                            </td>

                                        </tr>

                                    `

                                    :

                                    naturezas
                                        .map(
                                            natureza => `

                                                <tr>

                                                    <td>

                                                        <strong>
                                                            ${escaparHTMLCadastroNFE(
                                                                natureza.descricao ||
                                                                ''
                                                            )}
                                                        </strong>

                                                    </td>


                                                    <td>

                                                        ${
                                                            natureza.padrao_ml

                                                                ? `
                                                                    <span class="badge badge-success">
                                                                        Sim
                                                                    </span>
                                                                `

                                                                : '-'
                                                        }

                                                    </td>


                                                    <td>

                                                        ${
                                                            natureza.padrao_avulsa

                                                                ? `
                                                                    <span class="badge badge-success">
                                                                        Sim
                                                                    </span>
                                                                `

                                                                : '-'
                                                        }

                                                    </td>


                                                    <td>

                                                        ${
                                                            natureza.ativo !==
                                                            false

                                                                ? `
                                                                    <span
                                                                        style="
                                                                            color:#28a745;
                                                                            font-weight:600;
                                                                        "
                                                                    >
                                                                        Ativa
                                                                    </span>
                                                                `

                                                                : `
                                                                    <span
                                                                        style="
                                                                            color:#dc3545;
                                                                            font-weight:600;
                                                                        "
                                                                    >
                                                                        Inativa
                                                                    </span>
                                                                `
                                                        }

                                                    </td>


                                                    <td>

                                                        <button
                                                            type="button"
                                                            class="btn btn-sm btn-info"
                                                            onclick="abrirModalNaturezaOperacaoNFE(${Number(
                                                                natureza.id
                                                            )})"
                                                            title="Editar"
                                                        >
                                                            <i class="fas fa-edit"></i>
                                                        </button>


                                                        ${
                                                            natureza.ativo !==
                                                            false

                                                                ? `
                                                                    <button
                                                                        type="button"
                                                                        class="btn btn-sm btn-warning"
                                                                        onclick="alterarStatusNaturezaNFE(${Number(
                                                                            natureza.id
                                                                        )}, false)"
                                                                        title="Inativar"
                                                                    >
                                                                        <i class="fas fa-ban"></i>
                                                                    </button>
                                                                `

                                                                : `
                                                                    <button
                                                                        type="button"
                                                                        class="btn btn-sm btn-success"
                                                                        onclick="alterarStatusNaturezaNFE(${Number(
                                                                            natureza.id
                                                                        )}, true)"
                                                                        title="Ativar"
                                                                    >
                                                                        <i class="fas fa-check"></i>
                                                                    </button>
                                                                `
                                                        }

                                                    </td>

                                                </tr>

                                            `
                                        )
                                        .join(
                                            ''
                                        )
                            }

                        </tbody>

                    </table>

                </div>

            </div>
        `;


    } catch (
        error
    ) {

        console.error(
            '❌ Erro carregando Naturezas:',
            error
        );


        container.innerHTML = `

            <div class="alert alert-danger">

                <strong>
                    Erro ao carregar Naturezas da Operação.
                </strong>

                <br>

                ${escaparHTMLCadastroNFE(
                    error.message
                )}

            </div>
        `;
    }
}

async function mostrarCadastroNFE(
    tipo
) {

    const aba =
        garantirEstruturaCadastrosNFE();


    if (!aba) {

        return;
    }


    // =====================================================
    // DESTACAR CADASTRO SELECIONADO
    // =====================================================

    aba
        .querySelectorAll(
            '[data-tipo]'
        )
        .forEach(
            botao => {

                if (
                    botao.dataset.tipo ===
                    tipo
                ) {

                    botao.classList.remove(
                        'btn-outline-primary'
                    );

                    botao.classList.add(
                        'btn-primary'
                    );

                } else {

                    botao.classList.remove(
                        'btn-primary'
                    );

                    botao.classList.add(
                        'btn-outline-primary'
                    );
                }
            }
        );


    try {

        switch (
            tipo
        ) {

            case 'transportadoras':

                await carregarCadastroTransportadorasNFE();

                break;


            case 'clientes':

                await carregarCadastroClientesNFE();

                break;


            case 'naturezas':

                await carregarCadastroNaturezasNFE();

                break;


            case 'cfops':

                await carregarCadastroCFOPsNFE();

                break;


            default:

                console.warn(
                    'Cadastro desconhecido:',
                    tipo
                );
        }


    } catch (
        error
    ) {

        console.error(
            `❌ Erro abrindo cadastro ${tipo}:`,
            error
        );


        const container =
            document.getElementById(
                'cadastrosNFEConteudo'
            );


        if (container) {

            container.innerHTML = `

                <div class="alert alert-danger">

                    Erro ao abrir cadastro:

                    ${escaparHTMLCadastroNFE(
                        error.message
                    )}

                </div>
            `;
        }
    }
}

function removerBotoesCadastroAbasConsultaNFE() {

    // =====================================================
    // ABA CLIENTES
    // =====================================================

    const abaClientes =
        document.getElementById(
            'abaClientes'
        );


    if (abaClientes) {

        abaClientes
            .querySelectorAll(
                'button, a'
            )
            .forEach(
                elemento => {

                    const onclick =
                        String(
                            elemento.getAttribute(
                                'onclick'
                            ) ||
                            ''
                        )
                            .toLowerCase();


                    const texto =
                        String(
                            elemento.textContent ||
                            ''
                        )
                            .trim()
                            .toLowerCase();


                    const ehCadastro =
                        onclick.includes(
                            'abrirmodalcadastroclientenfe'
                        ) ||

                        onclick.includes(
                            'novocliente'
                        ) ||

                        texto.includes(
                            'novo cliente'
                        ) ||

                        texto.includes(
                            'cadastrar cliente'
                        ) ||

                        texto ===
                            'adicionar cliente';


                    if (
                        ehCadastro
                    ) {

                        console.log(
                            '🗑️ Removendo botão de cadastro da aba Clientes'
                        );

                        elemento.remove();
                    }
                }
            );
    }


    // =====================================================
    // ABA TRANSPORTADORAS
    // =====================================================

    const abaTransportadoras =
        document.getElementById(
            'abaTransportadoras'
        );


    if (abaTransportadoras) {

        abaTransportadoras
            .querySelectorAll(
                'button, a'
            )
            .forEach(
                elemento => {

                    const onclick =
                        String(
                            elemento.getAttribute(
                                'onclick'
                            ) ||
                            ''
                        )
                            .toLowerCase();


                    const texto =
                        String(
                            elemento.textContent ||
                            ''
                        )
                            .trim()
                            .toLowerCase();


                    const ehCadastro =
                        onclick.includes(
                            'abrirmodaltransportadora'
                        ) ||

                        texto.includes(
                            'nova transportadora'
                        ) ||

                        texto.includes(
                            'cadastrar transportadora'
                        ) ||

                        texto ===
                            'adicionar transportadora';


                    if (
                        ehCadastro
                    ) {

                        console.log(
                            '🗑️ Removendo botão de cadastro da aba Transportadoras'
                        );

                        elemento.remove();
                    }
                }
            );
    }
}

async function carregarCadastrosNFE() {

    const aba =
        garantirEstruturaCadastrosNFE();


    if (!aba) {

        return;
    }


    const container =
        aba.querySelector(
            '#cadastrosNFEConteudo'
        );


    if (!container) {

        console.error(
            '❌ cadastrosNFEConteudo não encontrado'
        );

        return;
    }


    container.innerHTML = `

        <div
            style="
                padding:30px;
                text-align:center;
                color:#6c757d;
                border:1px dashed #ced4da;
                border-radius:8px;
            "
        >

            <i
                class="fas fa-mouse-pointer"
                style="
                    font-size:28px;
                    margin-bottom:10px;
                "
            ></i>

            <br>

            Selecione acima o cadastro que deseja gerenciar.

            <div
                style="
                    margin-top:8px;
                    font-size:12px;
                "
            >
                Clientes, Transportadoras, Natureza da Operação e CFOP.
            </div>

        </div>
    `;
}

async function sincronizarProdutosBaixadosNFE(
        detalhesEstoque
    ) {

    console.log(
        '🔄 [NFE → ESTOQUE] Chamando sincronização existente da Gestão de Estoque...'
    );
    if (
        typeof window.sincronizarEstoqueML !==
        'function'
    ) {
        console.error(
            '❌ Função window.sincronizarEstoqueML não está disponível'
        );

        return false;
    }
    if (
        !Array.isArray(
            detalhesEstoque
        ) ||
        detalhesEstoque.length ===
            0
    ) {
        console.warn(
            '⚠️ Nenhum produto para sincronizar'
        );
        return false;
    }

    let todosSincronizados =
        true;

    for (
        const item
        of detalhesEstoque
    ) {
        if (
            !item ||
            item.encontrado ===
                false
        ) {
            continue;
        }

        try {
            let produto =
                null;
            let erroProduto =
                null;

            // =============================================
            // PRIORIDADE: ID DO PRODUTO
            // =============================================

            if (
                item.produto_id
            ) {

                const {
                    data,
                    error
                } =
                    await window
                        .supabaseClient
                        .from(
                            'produtos_estoque'
                        )
                        .select(
                            '*'
                        )
                        .eq(
                            'id',
                            item.produto_id
                        )
                        .maybeSingle();
                produto =
                    data;
                erroProduto =
                    error;
            // =============================================
            // FALLBACK: SKU
            // =============================================

            } else if (
                item.sku
            ) {

                const {
                    data,
                    error
                } =
                    await window
                        .supabaseClient
                        .from(
                            'produtos_estoque'
                        )
                        .select(
                            '*'
                        )
                        .eq(
                            'sku',
                            item.sku
                        )
                        .maybeSingle();
                produto =
                    data;

                erroProduto =
                    error;
            }
            if (
                erroProduto
            ) {

                console.error(
                    `❌ Erro buscando produto ${item.sku}:`,
                    erroProduto
                );

                todosSincronizados =
                    false;

                continue;
            }
            if (
                !produto
            ) {
                console.error(
                    `❌ Produto ${item.sku} não encontrado após a baixa`
                );
                todosSincronizados =
                    false;
                continue;
            }
            console.log(
                `🚀 [NFE → ESTOQUE] Sincronizando ${produto.sku} | estoque atual: ${produto.quantidade}`
            );


            // =============================================
            // AQUI CHAMA A FUNÇÃO ORIGINAL DO ESTOQUE
            // =============================================

            const resultadoSync =
                await window
                    .sincronizarEstoqueML(
                        produto
                    );
            console.log(
                `📥 Resultado sincronização ${produto.sku}:`,
                resultadoSync
            );
            if (
                !resultadoSync ||
                resultadoSync.success ===
                    false
            ) {

                todosSincronizados =
                    false;

                console.warn(
                    `⚠️ Sincronização falhou para ${produto.sku}`,
                    resultadoSync
                );
            } else {
                console.log(
                    `✅ ${produto.sku} sincronizado pela rotina da Gestão de Estoque`
                );
            }
        } catch (
            error
        ) {

            todosSincronizados =
                false;

            console.error(
                `❌ Erro sincronizando ${item.sku}:`,
                error
            );
        }
    }
    return todosSincronizados;
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
// CADASTRO DE CLIENTES
// =========================================================

function fecharModalCadastroClienteNFE() {

    const modal =
        document.getElementById(
            'modalCadastroClienteNFE'
        );

    if (modal) {
        modal.remove();
    }
}


function abrirModalCadastroClienteNFE() {

    fecharModalCadastroClienteNFE();

    const modal =
        document.createElement(
            'div'
        );

    modal.id =
        'modalCadastroClienteNFE';

    modal.className =
        'modal';

    modal.style.cssText = `
        display:flex;
        position:fixed;
        inset:0;
        background:rgba(0,0,0,.55);
        z-index:11000;
        align-items:center;
        justify-content:center;
        padding:20px;
    `;

    modal.innerHTML = `

        <div
            class="modal-content"
            style="
                max-width:760px;
                width:100%;
                max-height:90vh;
                overflow-y:auto;
                background:#fff;
                padding:25px;
                border-radius:10px;
                box-shadow:0 10px 40px rgba(0,0,0,.25);
            "
        >

            <div
                style="
                    display:flex;
                    justify-content:space-between;
                    align-items:center;
                    margin-bottom:20px;
                "
            >

                <h3 style="margin:0;">
                    <i class="fas fa-user-plus"></i>
                    Novo Cliente
                </h3>

                <button
                    type="button"
                    onclick="fecharModalCadastroClienteNFE()"
                    style="
                        border:none;
                        background:none;
                        font-size:26px;
                        cursor:pointer;
                    "
                >
                    &times;
                </button>

            </div>


            <div class="form-group">

                <label>
                    Nome / Razão Social *
                </label>

                <input
                    type="text"
                    id="cadClienteNome"
                    class="form-control"
                    autocomplete="off"
                >

            </div>


            <div class="form-group">

                <label>
                    CPF / CNPJ *
                </label>

                <input
                    type="text"
                    id="cadClienteDocumento"
                    class="form-control"
                    maxlength="18"
                    autocomplete="off"
                    placeholder="Somente números"
                >

            </div>


            <div class="form-group">

                <label>
                    Logradouro
                </label>

                <input
                    type="text"
                    id="cadClienteLogradouro"
                    class="form-control"
                    autocomplete="off"
                >

            </div>


            <div class="row">

                <div class="col-md-3">

                    <div class="form-group">

                        <label>
                            Número
                        </label>

                        <input
                            type="text"
                            id="cadClienteNumero"
                            class="form-control"
                            value="S/N"
                        >

                    </div>

                </div>


                <div class="col-md-9">

                    <div class="form-group">

                        <label>
                            Bairro
                        </label>

                        <input
                            type="text"
                            id="cadClienteBairro"
                            class="form-control"
                        >

                    </div>

                </div>

            </div>


            <div class="row">

                <div class="col-md-6">

                    <div class="form-group">

                        <label>
                            Cidade
                        </label>

                        <input
                            type="text"
                            id="cadClienteCidade"
                            class="form-control"
                        >

                    </div>

                </div>


                <div class="col-md-2">

                    <div class="form-group">

                        <label>
                            UF
                        </label>

                        <input
                            type="text"
                            id="cadClienteUF"
                            maxlength="2"
                            class="form-control"
                            style="text-transform:uppercase;"
                        >

                    </div>

                </div>


                <div class="col-md-4">

                    <div class="form-group">

                        <label>
                            CEP
                        </label>

                        <input
                            type="text"
                            id="cadClienteCEP"
                            maxlength="9"
                            class="form-control"
                        >

                    </div>

                </div>

            </div>


            <div
                class="d-flex justify-content-end gap-2"
                style="margin-top:20px;"
            >

                <button
                    type="button"
                    class="btn btn-secondary"
                    onclick="fecharModalCadastroClienteNFE()"
                >
                    Cancelar
                </button>


                <button
                    type="button"
                    class="btn btn-success"
                    id="btnSalvarCadastroClienteNFE"
                    onclick="salvarCadastroClienteNFE()"
                >
                    <i class="fas fa-save"></i>
                    Salvar Cliente
                </button>

            </div>

        </div>
    `;


    document.body.appendChild(
        modal
    );


    // =====================================================
    // FORMATOS / LIMITES
    // =====================================================

    const documento =
        modal.querySelector(
            '#cadClienteDocumento'
        );

    const cep =
        modal.querySelector(
            '#cadClienteCEP'
        );

    const uf =
        modal.querySelector(
            '#cadClienteUF'
        );


    documento?.addEventListener(
        'input',
        function () {

            this.value =
                this.value
                    .replace(/\D/g, '')
                    .substring(
                        0,
                        14
                    );
        }
    );


    cep?.addEventListener(
        'input',
        function () {

            this.value =
                this.value
                    .replace(/\D/g, '')
                    .substring(
                        0,
                        8
                    );
        }
    );


    uf?.addEventListener(
        'input',
        function () {

            this.value =
                this.value
                    .replace(
                        /[^a-zA-Z]/g,
                        ''
                    )
                    .toUpperCase()
                    .substring(
                        0,
                        2
                    );
        }
    );


    // Fechar clicando no fundo
    modal.addEventListener(
        'click',
        event => {

            if (
                event.target ===
                modal
            ) {

                fecharModalCadastroClienteNFE();
            }
        }
    );


    setTimeout(
        () =>
            documento
                ?.focus(),
        50
    );
}


async function salvarCadastroClienteNFE() {

    const nome =
        document
            .getElementById(
                'cadClienteNome'
            )
            ?.value
            .trim() ||
        '';

    const documento =
        String(
            document
                .getElementById(
                    'cadClienteDocumento'
                )
                ?.value ||
            ''
        )
            .replace(
                /\D/g,
                ''
            );

    const logradouro =
        document
            .getElementById(
                'cadClienteLogradouro'
            )
            ?.value
            .trim() ||
        '';

    const numero =
        document
            .getElementById(
                'cadClienteNumero'
            )
            ?.value
            .trim() ||
        'S/N';

    const bairro =
        document
            .getElementById(
                'cadClienteBairro'
            )
            ?.value
            .trim() ||
        '';

    const cidade =
        document
            .getElementById(
                'cadClienteCidade'
            )
            ?.value
            .trim() ||
        '';

    const uf =
        document
            .getElementById(
                'cadClienteUF'
            )
            ?.value
            .trim()
            .toUpperCase() ||
        '';

    const cep =
        String(
            document
                .getElementById(
                    'cadClienteCEP'
                )
                ?.value ||
            ''
        )
            .replace(
                /\D/g,
                ''
            );


    // =====================================================
    // VALIDAÇÕES
    // =====================================================

    if (!nome) {

        showToast(
            'Informe o nome do cliente',
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
            'CPF/CNPJ deve possuir 11 ou 14 dígitos',
            'warning'
        );

        return;
    }


    if (
        uf &&
        uf.length !==
            2
    ) {

        showToast(
            'UF deve possuir 2 letras',
            'warning'
        );

        return;
    }


    const botao =
        document.getElementById(
            'btnSalvarCadastroClienteNFE'
        );

    const textoOriginal =
        botao?.innerHTML ||
        'Salvar';


    if (botao) {

        botao.disabled =
            true;

        botao.innerHTML =
            '<span class="spinner"></span> Salvando...';
    }


    try {

        // =====================================================
        // UTILIZA A MESMA FUNÇÃO DO SALVAMENTO AUTOMÁTICO
        // DA NF-e.
        //
        // Ela também impede duplicidade por CPF/CNPJ.
        // =====================================================

        const resultado =
            await salvarClienteNoBanco({

                nome,

                documento,

                logradouro,

                endereco:
                    logradouro,

                numero,

                bairro,

                cidade,

                uf,

                cep
            });


        if (
            !resultado ||
            !resultado.success
        ) {

            throw new Error(
                resultado?.error ||
                'Não foi possível cadastrar o cliente'
            );
        }


        fecharModalCadastroClienteNFE();


        // Atualizar gerenciamento
        try {

            await carregarCadastroClientesNFE();

        } catch (
            error
        ) {

            console.warn(
                '⚠️ Cliente salvo, mas não foi possível atualizar Cadastros:',
                error
            );
        }


        // Atualizar aba de consulta
        try {

            await carregarClientes();

        } catch (
            error
        ) {

            console.warn(
                '⚠️ Cliente salvo, mas não foi possível atualizar lista:',
                error
            );
        }


        if (
            resultado.existente
        ) {

            showToast(
                'Cliente já estava cadastrado',
                'info'
            );

        } else {

            showToast(
                'Cliente cadastrado com sucesso!',
                'success'
            );
        }


    } catch (
        error
    ) {

        console.error(
            '❌ Erro ao salvar cliente:',
            error
        );


        showToast(
            `Erro ao cadastrar cliente: ${error.message}`,
            'error'
        );


    } finally {

        const btnAtual =
            document.getElementById(
                'btnSalvarCadastroClienteNFE'
            );


        if (btnAtual) {

            btnAtual.disabled =
                false;

            btnAtual.innerHTML =
                textoOriginal;
        }
    }
}


// =========================================================
// CADASTRO DE CFOP
// =========================================================

function fecharModalCFOPNFE() {

    const modal =
        document.getElementById(
            'modalCadastroCFOPNFE'
        );

    if (modal) {

        modal.remove();
    }
}


async function abrirModalCFOPNFE(
    id = null
) {

    fecharModalCFOPNFE();


    if (
        !window.supabaseClient
    ) {

        showToast(
            'Supabase não inicializado',
            'error'
        );

        return;
    }


    let registro =
        null;


    // =====================================================
    // EDIÇÃO
    // =====================================================

    if (id) {

        try {

            const {
                data,
                error
            } =
                await window
                    .supabaseClient
                    .from(
                        'nfe_cfops'
                    )
                    .select('*')
                    .eq(
                        'id',
                        id
                    )
                    .maybeSingle();


            if (error) {

                throw error;
            }


            if (!data) {

                throw new Error(
                    'CFOP não encontrado'
                );
            }


            registro =
                data;


        } catch (
            error
        ) {

            console.error(
                '❌ Erro ao buscar CFOP:',
                error
            );

            showToast(
                `Erro ao buscar CFOP: ${error.message}`,
                'error'
            );

            return;
        }
    }


    const modal =
        document.createElement(
            'div'
        );


    modal.id =
        'modalCadastroCFOPNFE';

    modal.className =
        'modal';

    modal.style.cssText = `
        display:flex;
        position:fixed;
        inset:0;
        background:rgba(0,0,0,.55);
        z-index:11000;
        align-items:center;
        justify-content:center;
        padding:20px;
    `;


    modal.innerHTML = `

        <div
            class="modal-content"
            style="
                max-width:620px;
                width:100%;
                background:#fff;
                padding:25px;
                border-radius:10px;
                box-shadow:0 10px 40px rgba(0,0,0,.25);
            "
        >

            <div
                style="
                    display:flex;
                    justify-content:space-between;
                    align-items:center;
                    margin-bottom:20px;
                "
            >

                <h3 style="margin:0;">
                    <i class="fas fa-list-ol"></i>
                    ${registro ? 'Editar CFOP' : 'Novo CFOP'}
                </h3>

                <button
                    type="button"
                    onclick="fecharModalCFOPNFE()"
                    style="
                        border:none;
                        background:none;
                        font-size:26px;
                        cursor:pointer;
                    "
                >
                    &times;
                </button>

            </div>


            <input
                type="hidden"
                id="cadCFOPId"
                value="${registro?.id || ''}"
            >


            <div class="form-group">

                <label>
                    Código CFOP *
                </label>

                <input
                    type="text"
                    id="cadCFOPCodigo"
                    class="form-control"
                    maxlength="4"
                    inputmode="numeric"
                    value="${escaparHTMLCadastroNFE(registro?.codigo || '')}"
                    placeholder="Ex.: 5102"
                >

            </div>


            <div class="form-group">

                <label>
                    Descrição *
                </label>

                <input
                    type="text"
                    id="cadCFOPDescricao"
                    class="form-control"
                    value="${escaparHTMLCadastroNFE(registro?.descricao || '')}"
                    placeholder="Ex.: Venda de mercadoria adquirida de terceiros"
                >

            </div>


            <hr>


            <div class="form-check">

                <input
                    type="checkbox"
                    id="cadCFOPAtivo"
                    class="form-check-input"
                    ${registro?.ativo !== false ? 'checked' : ''}
                >

                <label
                    for="cadCFOPAtivo"
                    class="form-check-label"
                >
                    CFOP ativo
                </label>

            </div>


            <div class="form-check">

                <input
                    type="checkbox"
                    id="cadCFOPPadraoML"
                    class="form-check-input"
                    ${registro?.padrao_ml ? 'checked' : ''}
                >

                <label
                    for="cadCFOPPadraoML"
                    class="form-check-label"
                >
                    Padrão para Mercado Livre
                </label>

            </div>


            <div class="form-check">

                <input
                    type="checkbox"
                    id="cadCFOPPadraoAvulsa"
                    class="form-check-input"
                    ${registro?.padrao_avulsa ? 'checked' : ''}
                >

                <label
                    for="cadCFOPPadraoAvulsa"
                    class="form-check-label"
                >
                    Padrão para NF-e Avulsa
                </label>

            </div>


            <div
                class="d-flex justify-content-end gap-2"
                style="margin-top:20px;"
            >

                <button
                    type="button"
                    class="btn btn-secondary"
                    onclick="fecharModalCFOPNFE()"
                >
                    Cancelar
                </button>


                <button
                    type="button"
                    id="btnSalvarCFOPNFE"
                    class="btn btn-success"
                    onclick="salvarCFOPNFE()"
                >
                    <i class="fas fa-save"></i>
                    Salvar
                </button>

            </div>

        </div>
    `;


    document.body.appendChild(
        modal
    );


    const codigo =
        modal.querySelector(
            '#cadCFOPCodigo'
        );


    codigo?.addEventListener(
        'input',
        function () {

            this.value =
                this.value
                    .replace(
                        /\D/g,
                        ''
                    )
                    .substring(
                        0,
                        4
                    );
        }
    );


    modal.addEventListener(
        'click',
        event => {

            if (
                event.target ===
                modal
            ) {

                fecharModalCFOPNFE();
            }
        }
    );


    setTimeout(
        () =>
            codigo
                ?.focus(),
        50
    );
}


async function salvarCFOPNFE() {

    if (
        !window.supabaseClient
    ) {

        showToast(
            'Supabase não inicializado',
            'error'
        );

        return;
    }


    const idValor =
        document
            .getElementById(
                'cadCFOPId'
            )
            ?.value;


    const id =
        idValor
            ? Number(
                idValor
            )
            : null;


    const codigo =
        String(
            document
                .getElementById(
                    'cadCFOPCodigo'
                )
                ?.value ||
            ''
        )
            .replace(
                /\D/g,
                ''
            )
            .substring(
                0,
                4
            );


    const descricao =
        document
            .getElementById(
                'cadCFOPDescricao'
            )
            ?.value
            .trim() ||
        '';


    const ativo =
        Boolean(
            document
                .getElementById(
                    'cadCFOPAtivo'
                )
                ?.checked
        );


    const padraoML =
        Boolean(
            document
                .getElementById(
                    'cadCFOPPadraoML'
                )
                ?.checked
        );


    const padraoAvulsa =
        Boolean(
            document
                .getElementById(
                    'cadCFOPPadraoAvulsa'
                )
                ?.checked
        );


    // =====================================================
    // VALIDAÇÃO
    // =====================================================

    if (
        codigo.length !==
        4
    ) {

        showToast(
            'CFOP deve possuir exatamente 4 dígitos',
            'warning'
        );

        return;
    }


    if (!descricao) {

        showToast(
            'Informe a descrição do CFOP',
            'warning'
        );

        return;
    }


    const botao =
        document.getElementById(
            'btnSalvarCFOPNFE'
        );


    const textoOriginal =
        botao?.innerHTML ||
        'Salvar';


    if (botao) {

        botao.disabled =
            true;

        botao.innerHTML =
            '<span class="spinner"></span> Salvando...';
    }


    try {

        // =====================================================
        // PRIMEIRO SALVA O REGISTRO SEM MARCAR PADRÃO
        //
        // Isso evita conflito caso exista índice que permita
        // somente um padrão ML / Avulsa.
        // =====================================================

        const payloadBase = {

            codigo,

            descricao,

            ativo,

            padrao_ml:
                false,

            padrao_avulsa:
                false,

            atualizado_em:
                new Date()
                    .toISOString()
        };


        let idSalvo =
            id;


        if (id) {

            const {
                data,
                error
            } =
                await window
                    .supabaseClient
                    .from(
                        'nfe_cfops'
                    )
                    .update(
                        payloadBase
                    )
                    .eq(
                        'id',
                        id
                    )
                    .select(
                        'id'
                    )
                    .maybeSingle();


            if (error) {

                throw error;
            }


            idSalvo =
                data?.id ||
                id;


        } else {

            const {
                data,
                error
            } =
                await window
                    .supabaseClient
                    .from(
                        'nfe_cfops'
                    )
                    .insert(
                        payloadBase
                    )
                    .select(
                        'id'
                    )
                    .single();


            if (error) {

                throw error;
            }


            idSalvo =
                data.id;
        }


        // =====================================================
        // DEFINIR PADRÃO MERCADO LIVRE
        // =====================================================

        if (
            padraoML
        ) {

            const {
                error:
                    erroLimparML
            } =
                await window
                    .supabaseClient
                    .from(
                        'nfe_cfops'
                    )
                    .update({
                        padrao_ml:
                            false
                    })
                    .neq(
                        'id',
                        idSalvo
                    );


            if (
                erroLimparML
            ) {

                throw erroLimparML;
            }


            const {
                error:
                    erroPadraoML
            } =
                await window
                    .supabaseClient
                    .from(
                        'nfe_cfops'
                    )
                    .update({
                        padrao_ml:
                            true
                    })
                    .eq(
                        'id',
                        idSalvo
                    );


            if (
                erroPadraoML
            ) {

                throw erroPadraoML;
            }
        }


        // =====================================================
        // DEFINIR PADRÃO AVULSA
        // =====================================================

        if (
            padraoAvulsa
        ) {

            const {
                error:
                    erroLimparAvulsa
            } =
                await window
                    .supabaseClient
                    .from(
                        'nfe_cfops'
                    )
                    .update({
                        padrao_avulsa:
                            false
                    })
                    .neq(
                        'id',
                        idSalvo
                    );


            if (
                erroLimparAvulsa
            ) {

                throw erroLimparAvulsa;
            }


            const {
                error:
                    erroPadraoAvulsa
            } =
                await window
                    .supabaseClient
                    .from(
                        'nfe_cfops'
                    )
                    .update({
                        padrao_avulsa:
                            true
                    })
                    .eq(
                        'id',
                        idSalvo
                    );


            if (
                erroPadraoAvulsa
            ) {

                throw erroPadraoAvulsa;
            }
        }


        fecharModalCFOPNFE();


        await carregarCadastroCFOPsNFE();


        showToast(
            id
                ? 'CFOP atualizado com sucesso!'
                : 'CFOP cadastrado com sucesso!',
            'success'
        );


    } catch (
        error
    ) {

        console.error(
            '❌ Erro salvando CFOP:',
            error
        );


        let mensagem =
            error.message ||
            'Erro desconhecido';


        if (
            error.code ===
            '23505'
        ) {

            mensagem =
                'Já existe um CFOP com este código.';
        }


        showToast(
            `Erro ao salvar CFOP: ${mensagem}`,
            'error'
        );


    } finally {

        const btnAtual =
            document.getElementById(
                'btnSalvarCFOPNFE'
            );


        if (btnAtual) {

            btnAtual.disabled =
                false;

            btnAtual.innerHTML =
                textoOriginal;
        }
    }
}


async function alterarStatusCFOPNFE(
    id,
    ativo
) {

    if (
        !window.supabaseClient
    ) {

        showToast(
            'Supabase não inicializado',
            'error'
        );

        return;
    }


    try {

        const payload = {

            ativo:
                Boolean(
                    ativo
                ),

            atualizado_em:
                new Date()
                    .toISOString()
        };


        // Se estiver inativando,
        // também deixa de ser padrão.
        if (
            !ativo
        ) {

            payload.padrao_ml =
                false;

            payload.padrao_avulsa =
                false;
        }


        const {
            error
        } =
            await window
                .supabaseClient
                .from(
                    'nfe_cfops'
                )
                .update(
                    payload
                )
                .eq(
                    'id',
                    id
                );


        if (error) {

            throw error;
        }


        await carregarCadastroCFOPsNFE();


        showToast(
            ativo
                ? 'CFOP ativado'
                : 'CFOP inativado',
            'success'
        );


    } catch (
        error
    ) {

        console.error(
            '❌ Erro alterando CFOP:',
            error
        );


        showToast(
            `Erro: ${error.message}`,
            'error'
        );
    }
}


// =========================================================
// NATUREZA DA OPERAÇÃO
// =========================================================

function fecharModalNaturezaOperacaoNFE() {

    const modal =
        document.getElementById(
            'modalNaturezaOperacaoNFE'
        );

    if (modal) {

        modal.remove();
    }
}


async function abrirModalNaturezaOperacaoNFE(
    id = null
) {

    fecharModalNaturezaOperacaoNFE();


    if (
        !window.supabaseClient
    ) {

        showToast(
            'Supabase não inicializado',
            'error'
        );

        return;
    }


    let registro =
        null;


    // =====================================================
    // EDIÇÃO
    // =====================================================

    if (id) {

        try {

            const {
                data,
                error
            } =
                await window
                    .supabaseClient
                    .from(
                        'nfe_naturezas_operacao'
                    )
                    .select('*')
                    .eq(
                        'id',
                        id
                    )
                    .maybeSingle();


            if (error) {

                throw error;
            }


            if (!data) {

                throw new Error(
                    'Natureza da Operação não encontrada'
                );
            }


            registro =
                data;


        } catch (
            error
        ) {

            console.error(
                '❌ Erro buscando Natureza:',
                error
            );


            showToast(
                `Erro ao buscar Natureza: ${error.message}`,
                'error'
            );


            return;
        }
    }


    const modal =
        document.createElement(
            'div'
        );


    modal.id =
        'modalNaturezaOperacaoNFE';

    modal.className =
        'modal';

    modal.style.cssText = `
        display:flex;
        position:fixed;
        inset:0;
        background:rgba(0,0,0,.55);
        z-index:11000;
        align-items:center;
        justify-content:center;
        padding:20px;
    `;


    modal.innerHTML = `

        <div
            class="modal-content"
            style="
                max-width:620px;
                width:100%;
                background:#fff;
                padding:25px;
                border-radius:10px;
                box-shadow:0 10px 40px rgba(0,0,0,.25);
            "
        >

            <div
                style="
                    display:flex;
                    justify-content:space-between;
                    align-items:center;
                    margin-bottom:20px;
                "
            >

                <h3 style="margin:0;">
                    <i class="fas fa-file-alt"></i>

                    ${
                        registro
                            ? 'Editar Natureza da Operação'
                            : 'Nova Natureza da Operação'
                    }

                </h3>


                <button
                    type="button"
                    onclick="fecharModalNaturezaOperacaoNFE()"
                    style="
                        border:none;
                        background:none;
                        font-size:26px;
                        cursor:pointer;
                    "
                >
                    &times;
                </button>

            </div>


            <input
                type="hidden"
                id="cadNaturezaId"
                value="${registro?.id || ''}"
            >


            <div class="form-group">

                <label>
                    Descrição *
                </label>

                <input
                    type="text"
                    id="cadNaturezaDescricao"
                    class="form-control"
                    value="${escaparHTMLCadastroNFE(registro?.descricao || '')}"
                    placeholder="Ex.: VENDA"
                >

            </div>


            <hr>


            <div class="form-check">

                <input
                    type="checkbox"
                    id="cadNaturezaAtivo"
                    class="form-check-input"
                    ${registro?.ativo !== false ? 'checked' : ''}
                >

                <label
                    class="form-check-label"
                    for="cadNaturezaAtivo"
                >
                    Natureza ativa
                </label>

            </div>


            <div class="form-check">

                <input
                    type="checkbox"
                    id="cadNaturezaPadraoML"
                    class="form-check-input"
                    ${registro?.padrao_ml ? 'checked' : ''}
                >

                <label
                    class="form-check-label"
                    for="cadNaturezaPadraoML"
                >
                    Padrão para Mercado Livre
                </label>

            </div>


            <div class="form-check">

                <input
                    type="checkbox"
                    id="cadNaturezaPadraoAvulsa"
                    class="form-check-input"
                    ${registro?.padrao_avulsa ? 'checked' : ''}
                >

                <label
                    class="form-check-label"
                    for="cadNaturezaPadraoAvulsa"
                >
                    Padrão para NF-e Avulsa
                </label>

            </div>


            <div
                class="d-flex justify-content-end gap-2"
                style="margin-top:20px;"
            >

                <button
                    type="button"
                    class="btn btn-secondary"
                    onclick="fecharModalNaturezaOperacaoNFE()"
                >
                    Cancelar
                </button>


                <button
                    type="button"
                    id="btnSalvarNaturezaNFE"
                    class="btn btn-success"
                    onclick="salvarNaturezaOperacaoNFE()"
                >
                    <i class="fas fa-save"></i>
                    Salvar
                </button>

            </div>

        </div>
    `;


    document.body.appendChild(
        modal
    );


    modal.addEventListener(
        'click',
        event => {

            if (
                event.target ===
                modal
            ) {

                fecharModalNaturezaOperacaoNFE();
            }
        }
    );


    setTimeout(
        () =>
            modal
                .querySelector(
                    '#cadNaturezaDescricao'
                )
                ?.focus(),
        50
    );
}


async function salvarNaturezaOperacaoNFE() {

    if (
        !window.supabaseClient
    ) {

        showToast(
            'Supabase não inicializado',
            'error'
        );

        return;
    }


    const idValor =
        document
            .getElementById(
                'cadNaturezaId'
            )
            ?.value;


    const id =
        idValor
            ? Number(
                idValor
            )
            : null;


    const descricao =
        document
            .getElementById(
                'cadNaturezaDescricao'
            )
            ?.value
            .trim() ||
        '';


    const ativo =
        Boolean(
            document
                .getElementById(
                    'cadNaturezaAtivo'
                )
                ?.checked
        );


    const padraoML =
        Boolean(
            document
                .getElementById(
                    'cadNaturezaPadraoML'
                )
                ?.checked
        );


    const padraoAvulsa =
        Boolean(
            document
                .getElementById(
                    'cadNaturezaPadraoAvulsa'
                )
                ?.checked
        );


    if (!descricao) {

        showToast(
            'Informe a Natureza da Operação',
            'warning'
        );

        return;
    }


    const botao =
        document.getElementById(
            'btnSalvarNaturezaNFE'
        );


    const textoOriginal =
        botao?.innerHTML ||
        'Salvar';


    if (botao) {

        botao.disabled =
            true;

        botao.innerHTML =
            '<span class="spinner"></span> Salvando...';
    }


    try {

        // =====================================================
        // SALVAR SEM PADRÃO PRIMEIRO
        // =====================================================

        const payloadBase = {

            descricao,

            ativo,

            padrao_ml:
                false,

            padrao_avulsa:
                false,

            atualizado_em:
                new Date()
                    .toISOString()
        };


        let idSalvo =
            id;


        if (id) {

            const {
                data,
                error
            } =
                await window
                    .supabaseClient
                    .from(
                        'nfe_naturezas_operacao'
                    )
                    .update(
                        payloadBase
                    )
                    .eq(
                        'id',
                        id
                    )
                    .select(
                        'id'
                    )
                    .maybeSingle();


            if (error) {

                throw error;
            }


            idSalvo =
                data?.id ||
                id;


        } else {

            const {
                data,
                error
            } =
                await window
                    .supabaseClient
                    .from(
                        'nfe_naturezas_operacao'
                    )
                    .insert(
                        payloadBase
                    )
                    .select(
                        'id'
                    )
                    .single();


            if (error) {

                throw error;
            }


            idSalvo =
                data.id;
        }


        // =====================================================
        // PADRÃO ML
        // =====================================================

        if (
            padraoML
        ) {

            const {
                error:
                    erroLimparML
            } =
                await window
                    .supabaseClient
                    .from(
                        'nfe_naturezas_operacao'
                    )
                    .update({
                        padrao_ml:
                            false
                    })
                    .neq(
                        'id',
                        idSalvo
                    );


            if (
                erroLimparML
            ) {

                throw erroLimparML;
            }


            const {
                error:
                    erroPadraoML
            } =
                await window
                    .supabaseClient
                    .from(
                        'nfe_naturezas_operacao'
                    )
                    .update({
                        padrao_ml:
                            true
                    })
                    .eq(
                        'id',
                        idSalvo
                    );


            if (
                erroPadraoML
            ) {

                throw erroPadraoML;
            }
        }


        // =====================================================
        // PADRÃO AVULSA
        // =====================================================

        if (
            padraoAvulsa
        ) {

            const {
                error:
                    erroLimparAvulsa
            } =
                await window
                    .supabaseClient
                    .from(
                        'nfe_naturezas_operacao'
                    )
                    .update({
                        padrao_avulsa:
                            false
                    })
                    .neq(
                        'id',
                        idSalvo
                    );


            if (
                erroLimparAvulsa
            ) {

                throw erroLimparAvulsa;
            }


            const {
                error:
                    erroPadraoAvulsa
            } =
                await window
                    .supabaseClient
                    .from(
                        'nfe_naturezas_operacao'
                    )
                    .update({
                        padrao_avulsa:
                            true
                    })
                    .eq(
                        'id',
                        idSalvo
                    );


            if (
                erroPadraoAvulsa
            ) {

                throw erroPadraoAvulsa;
            }
        }


        fecharModalNaturezaOperacaoNFE();


        await carregarCadastroNaturezasNFE();


        showToast(
            id
                ? 'Natureza da Operação atualizada!'
                : 'Natureza da Operação cadastrada!',
            'success'
        );


    } catch (
        error
    ) {

        console.error(
            '❌ Erro salvando Natureza da Operação:',
            error
        );


        let mensagem =
            error.message ||
            'Erro desconhecido';


        if (
            error.code ===
            '23505'
        ) {

            mensagem =
                'Esta Natureza da Operação já está cadastrada.';
        }


        showToast(
            `Erro ao salvar Natureza: ${mensagem}`,
            'error'
        );


    } finally {

        const btnAtual =
            document.getElementById(
                'btnSalvarNaturezaNFE'
            );


        if (btnAtual) {

            btnAtual.disabled =
                false;

            btnAtual.innerHTML =
                textoOriginal;
        }
    }
}


async function alterarStatusNaturezaNFE(
    id,
    ativo
) {

    if (
        !window.supabaseClient
    ) {

        showToast(
            'Supabase não inicializado',
            'error'
        );

        return;
    }


    try {

        const payload = {

            ativo:
                Boolean(
                    ativo
                ),

            atualizado_em:
                new Date()
                    .toISOString()
        };


        // =====================================================
        // SE INATIVAR, NÃO PODE CONTINUAR SENDO PADRÃO
        // =====================================================

        if (
            !ativo
        ) {

            payload.padrao_ml =
                false;

            payload.padrao_avulsa =
                false;
        }


        const {
            error
        } =
            await window
                .supabaseClient
                .from(
                    'nfe_naturezas_operacao'
                )
                .update(
                    payload
                )
                .eq(
                    'id',
                    id
                );


        if (error) {
            throw error;
        }

        await carregarCadastroNaturezasNFE();

        showToast(
            ativo
                ? 'Natureza da Operação ativada'
                : 'Natureza da Operação inativada',
            'success'
        );

    } catch (
        error
    ) {

        console.error(
            '❌ Erro alterando Natureza:',
            error
        );

        showToast(
            `Erro: ${error.message}`,
            'error'
        );
    }
}

// =========================================================
// PRODUTOS - NF-e AVULSA
// =========================================================

window._produtosEstoqueAvulsaNFE =
    window._produtosEstoqueAvulsaNFE ||
    [];

window._itensAvulsaNFE =
    window._itensAvulsaNFE ||
    [];


// =========================================================
// GARANTIR ESTRUTURA VISUAL DOS PRODUTOS
// =========================================================

function garantirEstruturaProdutosAvulsaNFE() {

    const aba =
        document.getElementById(
            'abaAvulsa'
        );


    if (!aba) {

        console.error(
            '❌ abaAvulsa não encontrada'
        );

        return false;
    }


    // =====================================================
    // SE JÁ EXISTE NOSSA ESTRUTURA, NÃO CRIAR NOVAMENTE
    // =====================================================

    if (
        aba.querySelector(
            '#avulsaProdutoBusca'
        )
    ) {

        return true;
    }


    // =====================================================
    // LOCALIZAR CAMPO ANTIGO avulsaProdutos
    // =====================================================

    const campoAntigo =
        aba.querySelector(
            '#avulsaProdutos'
        );


    const bloco =
        document.createElement(
            'div'
        );


    bloco.id =
        'blocoProdutosAvulsaNFE';


    bloco.style.cssText = `
        margin-top:20px;
        margin-bottom:20px;
    `;


    bloco.innerHTML = `

        <h4
            style="
                margin-bottom:12px;
            "
        >
            <i class="fas fa-box"></i>
            Produtos
        </h4>


        <!-- ===============================================
             PESQUISA
        ================================================ -->

        <div
            style="
                position:relative;
                margin-bottom:15px;
            "
        >

            <label
                style="
                    display:block;
                    font-weight:600;
                    margin-bottom:5px;
                "
            >
                Pesquisar produto
            </label>


            <input
                type="text"
                id="avulsaProdutoBusca"
                class="form-control"
                placeholder="Digite o nome ou SKU do produto..."
                autocomplete="off"
            >


            <div
                id="avulsaProdutoResultados"
                style="
                    display:none;
                    position:absolute;
                    top:100%;
                    left:0;
                    right:0;
                    z-index:12000;
                    background:#fff;
                    border:1px solid #ced4da;
                    border-top:none;
                    max-height:320px;
                    overflow-y:auto;
                    box-shadow:0 5px 15px rgba(0,0,0,.15);
                    border-radius:0 0 6px 6px;
                "
            ></div>

        </div>


        <!-- ===============================================
             PRODUTOS SELECIONADOS
        ================================================ -->

        <div
            id="avulsaProdutosSelecionadosWrapper"
        >

            <div
                class="table-responsive"
            >

                <table
                    class="table table-striped"
                    style="
                        min-width:900px;
                    "
                >

                    <thead>

                        <tr>

                            <th>
                                Produto
                            </th>

                            <th>
                                SKU
                            </th>

                            <th
                                style="width:110px;"
                            >
                                Qtd
                            </th>

                            <th
                                style="width:150px;"
                            >
                                Valor unit.
                            </th>

                            <th
                                style="width:130px;"
                            >
                                NCM
                            </th>

                            <th
                                style="width:130px;"
                            >
                                Subtotal
                            </th>

                            <th
                                style="width:70px;"
                            >
                            </th>

                        </tr>

                    </thead>


                    <tbody
                        id="avulsaProdutosSelecionadosBody"
                    >

                        <tr
                            id="avulsaSemProdutosRow"
                        >

                            <td
                                colspan="7"
                                class="text-center"
                                style="
                                    padding:25px;
                                    color:#6c757d;
                                "
                            >
                                Nenhum produto adicionado.
                            </td>

                        </tr>

                    </tbody>


                    <tfoot>

                        <tr
                            style="
                                background:#f8f9fa;
                                font-weight:bold;
                            "
                        >

                            <td
                                colspan="5"
                                style="text-align:right;"
                            >
                                Total:
                            </td>

                            <td
                                id="avulsaTotalProdutos"
                            >
                                R$ 0,00
                            </td>

                            <td>
                            </td>

                        </tr>

                    </tfoot>

                </table>

            </div>

        </div>


        <!-- ===============================================
             CAMPO QUE emitirNFEAvulsa() CONTINUA LENDO
        ================================================ -->

        <input
            type="hidden"
            id="avulsaProdutos"
            value="[]"
        >
    `;


    // =====================================================
    // SUBSTITUIR CAMPO ANTIGO
    // =====================================================

    if (
        campoAntigo
    ) {

        const grupoAntigo =
            campoAntigo.closest(
                '.form-group'
            );


        if (
            grupoAntigo &&
            grupoAntigo.parentElement
        ) {

            grupoAntigo.replaceWith(
                bloco
            );

        } else {

            campoAntigo.replaceWith(
                bloco
            );
        }


    } else {

        // =================================================
        // SE NÃO EXISTIR CAMPO ANTIGO, INSERIR ANTES DO BOTÃO
        // =================================================

        const botaoEmitir =
            aba.querySelector(
                '[onclick*="emitirNFEAvulsa"]'
            );


        if (
            botaoEmitir
        ) {

            const containerBotao =
                botaoEmitir.parentElement;


            containerBotao.parentElement
                .insertBefore(
                    bloco,
                    containerBotao
                );


        } else {

            aba.appendChild(
                bloco
            );
        }
    }


    // =====================================================
    // EVENTO DA BUSCA
    // =====================================================

    const busca =
        document.getElementById(
            'avulsaProdutoBusca'
        );


    if (
        busca
    ) {

        busca.oninput =
            function () {

                pesquisarProdutoAvulsaNFE(
                    this.value
                );
            };


        busca.onfocus =
            function () {

                if (
                    this.value.trim()
                ) {

                    pesquisarProdutoAvulsaNFE(
                        this.value
                    );
                }
            };
    }


    console.log(
        '✅ Estrutura dos produtos da NF-e avulsa criada'
    );


    return true;
}


// =========================================================
// CARREGAR PRODUTOS DIRETAMENTE DE produtos_estoque
// =========================================================

async function carregarProdutosAvulsaNFE() {

    const campoBusca =
        document.getElementById(
            'avulsaProdutoBusca'
        );


    if (!campoBusca) {

        console.error(
            '❌ avulsaProdutoBusca não encontrado'
        );

        return false;
    }


    if (
        !window.supabaseClient
    ) {

        console.error(
            '❌ Supabase não inicializado'
        );

        return false;
    }


    try {

        campoBusca.disabled =
            true;


        campoBusca.placeholder =
            'Carregando produtos do estoque...';


        const {
            data,
            error
        } =
            await window
                .supabaseClient
                .from(
                    'produtos_estoque'
                )
                .select(`
                    id,
                    nome,
                    sku,
                    quantidade,
                    preco,
                    categoria
                `)
                .order(
                    'nome',
                    {
                        ascending:
                            true
                    }
                );


        if (
            error
        ) {

            throw error;
        }


        window._produtosEstoqueAvulsaNFE =
            Array.isArray(
                data
            )
                ? data
                : [];


        campoBusca.disabled =
            false;


        campoBusca.placeholder =
            'Digite o nome ou SKU do produto...';


        console.log(
            `✅ ${window._produtosEstoqueAvulsaNFE.length} produto(s) disponíveis na emissão avulsa`
        );


        return true;


    } catch (
        error
    ) {

        console.error(
            '❌ Erro carregando produtos para NF-e avulsa:',
            error
        );


        campoBusca.disabled =
            false;


        campoBusca.placeholder =
            'Erro ao carregar produtos';


        return false;
    }
}


// =========================================================
// PESQUISAR PRODUTO
// =========================================================

function pesquisarProdutoAvulsaNFE(
    termo
) {

    const resultados =
        document.getElementById(
            'avulsaProdutoResultados'
        );


    if (!resultados) {

        return;
    }


    const pesquisa =
        String(
            termo ||
            ''
        )
            .trim()
            .toLowerCase();


    if (
        pesquisa.length ===
        0
    ) {

        resultados.innerHTML =
            '';

        resultados.style.display =
            'none';

        return;
    }


    const produtos =
        Array.isArray(
            window._produtosEstoqueAvulsaNFE
        )
            ? window._produtosEstoqueAvulsaNFE
            : [];


    const encontrados =
        produtos
            .filter(
                produto => {

                    const nome =
                        String(
                            produto.nome ||
                            ''
                        )
                            .toLowerCase();


                    const sku =
                        String(
                            produto.sku ||
                            ''
                        )
                            .toLowerCase();


                    const categoria =
                        String(
                            produto.categoria ||
                            ''
                        )
                            .toLowerCase();


                    return (

                        nome.includes(
                            pesquisa
                        ) ||

                        sku.includes(
                            pesquisa
                        ) ||

                        categoria.includes(
                            pesquisa
                        )
                    );
                }
            )
            .slice(
                0,
                20
            );


    if (
        encontrados.length ===
        0
    ) {

        resultados.innerHTML = `

            <div
                style="
                    padding:12px;
                    text-align:center;
                    color:#6c757d;
                "
            >
                Nenhum produto encontrado.
            </div>
        `;


        resultados.style.display =
            'block';


        return;
    }


    resultados.innerHTML =
        encontrados
            .map(
                produto => {

                    const quantidade =
                        Number(
                            produto.quantidade ||
                            0
                        );


                    const preco =
                        Number(
                            produto.preco ||
                            0
                        );


                    const corEstoque =
                        quantidade >
                        0
                            ? '#28a745'
                            : '#dc3545';


                    return `

                        <div
                            style="
                                padding:10px 12px;
                                cursor:pointer;
                                border-bottom:1px solid #eee;
                            "
                            onmouseover="
                                this.style.background='#f5f7f9'
                            "
                            onmouseout="
                                this.style.background='#fff'
                            "
                            onclick="
                                selecionarProdutoAvulsaNFE(
                                    ${Number(produto.id)}
                                )
                            "
                        >

                            <div
                                style="
                                    display:flex;
                                    justify-content:space-between;
                                    gap:15px;
                                "
                            >

                                <div>

                                    <div
                                        style="
                                            font-weight:600;
                                        "
                                    >
                                        ${escaparHTMLAvulsaNFE(
                                            produto.nome ||
                                            'Produto'
                                        )}
                                    </div>


                                    <div
                                        style="
                                            font-size:12px;
                                            color:#6c757d;
                                            margin-top:2px;
                                        "
                                    >

                                        SKU:
                                        <strong>
                                            ${escaparHTMLAvulsaNFE(
                                                produto.sku ||
                                                '-'
                                            )}
                                        </strong>

                                        ${
                                            produto.categoria
                                                ? ` • ${escaparHTMLAvulsaNFE(
                                                    produto.categoria
                                                )}`
                                                : ''
                                        }

                                    </div>

                                </div>


                                <div
                                    style="
                                        text-align:right;
                                        white-space:nowrap;
                                    "
                                >

                                    <div
                                        style="
                                            font-weight:600;
                                        "
                                    >
                                        R$
                                        ${preco.toFixed(2)}
                                    </div>


                                    <div
                                        style="
                                            font-size:11px;
                                            color:${corEstoque};
                                        "
                                    >
                                        Estoque:
                                        ${quantidade}
                                    </div>

                                </div>

                            </div>

                        </div>
                    `;
                }
            )
            .join(
                ''
            );


    resultados.style.display =
        'block';
}


// =========================================================
// SELECIONAR PRODUTO
// =========================================================

async function selecionarProdutoAvulsaNFE(
    produtoId
) {

    const produto =
        window
            ._produtosEstoqueAvulsaNFE
            .find(
                item =>
                    String(
                        item.id
                    ) ===
                    String(
                        produtoId
                    )
            );


    if (!produto) {

        showToast(
            'Produto não encontrado',
            'warning'
        );

        return;
    }


    // =====================================================
    // NÃO ADICIONAR DUPLICADO
    // =====================================================

    const existente =
        window
            ._itensAvulsaNFE
            .find(
                item =>
                    String(
                        item.produto_id
                    ) ===
                    String(
                        produto.id
                    )
            );


    if (
        existente
    ) {

        existente.quantidade =
            Number(
                existente.quantidade ||
                1
            ) +
            1;


        renderizarProdutosAvulsaNFE();


        showToast(
            'Quantidade do produto aumentada',
            'info'
        );


        limparBuscaProdutoAvulsaNFE();


        return;
    }


    // =====================================================
    // NCM
    // =====================================================

    let ncm =
        '87149990';


    try {

        if (
            typeof buscarNCMporSKU ===
                'function' &&
            produto.sku
        ) {

            const ncmSalvo =
                await buscarNCMporSKU(
                    produto.sku
                );


            if (
                ncmSalvo
            ) {

                ncm =
                    ncmSalvo;
            }
        }


    } catch (
        error
    ) {

        console.warn(
            `⚠️ Erro buscando NCM do SKU ${produto.sku}:`,
            error
        );
    }


    // =====================================================
    // ADICIONAR
    // =====================================================

    window
        ._itensAvulsaNFE
        .push({

            produto_id:
                produto.id,

            nome:
                produto.nome ||
                'Produto',

            sku:
                produto.sku ||
                'SEM_SKU',

            quantidade:
                1,

            valor_unitario:
                Number(
                    produto.preco ||
                    0
                ),

            ncm,

            estoque_atual:
                Number(
                    produto.quantidade ||
                    0
                )
        });


    console.log(
        '✅ Produto adicionado à NF-e avulsa:',
        produto
    );


    renderizarProdutosAvulsaNFE();


    limparBuscaProdutoAvulsaNFE();
}


// =========================================================
// LIMPAR BUSCA DE PRODUTO
// =========================================================

function limparBuscaProdutoAvulsaNFE() {

    const busca =
        document.getElementById(
            'avulsaProdutoBusca'
        );


    const resultados =
        document.getElementById(
            'avulsaProdutoResultados'
        );


    if (
        busca
    ) {

        busca.value =
            '';

        busca.focus();
    }


    if (
        resultados
    ) {

        resultados.innerHTML =
            '';

        resultados.style.display =
            'none';
    }
}


// =========================================================
// RENDERIZAR PRODUTOS SELECIONADOS
// =========================================================

function renderizarProdutosAvulsaNFE() {

    const tbody =
        document.getElementById(
            'avulsaProdutosSelecionadosBody'
        );


    if (!tbody) {

        return;
    }


    const itens =
        Array.isArray(
            window._itensAvulsaNFE
        )
            ? window._itensAvulsaNFE
            : [];


    if (
        itens.length ===
        0
    ) {

        tbody.innerHTML = `

            <tr
                id="avulsaSemProdutosRow"
            >

                <td
                    colspan="7"
                    class="text-center"
                    style="
                        padding:25px;
                        color:#6c757d;
                    "
                >
                    Nenhum produto adicionado.
                </td>

            </tr>
        `;


        atualizarProdutosJSONAvulsaNFE();


        return;
    }


    tbody.innerHTML =
        itens
            .map(
                (
                    item,
                    index
                ) => {

                    const subtotal =
                        Number(
                            item.quantidade ||
                            0
                        ) *
                        Number(
                            item.valor_unitario ||
                            0
                        );


                    return `

                        <tr
                            data-index="${index}"
                        >

                            <td>

                                <input
                                    type="text"
                                    class="form-control form-control-sm avulsa-item-nome"
                                    data-index="${index}"
                                    value="${escaparHTMLAvulsaNFE(
                                        item.nome
                                    )}"
                                >

                                <small
                                    style="
                                        color:#6c757d;
                                    "
                                >
                                    Estoque atual:
                                    ${Number(
                                        item.estoque_atual ||
                                        0
                                    )}
                                </small>

                            </td>


                            <td>

                                <input
                                    type="text"
                                    class="form-control form-control-sm avulsa-item-sku"
                                    data-index="${index}"
                                    value="${escaparHTMLAvulsaNFE(
                                        item.sku
                                    )}"
                                    readonly
                                >

                            </td>


                            <td>

                                <input
                                    type="number"
                                    class="form-control form-control-sm avulsa-item-quantidade"
                                    data-index="${index}"
                                    value="${Number(
                                        item.quantidade ||
                                        1
                                    )}"
                                    min="0.01"
                                    step="0.01"
                                >

                            </td>


                            <td>

                                <input
                                    type="number"
                                    class="form-control form-control-sm avulsa-item-valor"
                                    data-index="${index}"
                                    value="${Number(
                                        item.valor_unitario ||
                                        0
                                    ).toFixed(2)}"
                                    min="0"
                                    step="0.01"
                                >

                            </td>


                            <td>

                                <input
                                    type="text"
                                    class="form-control form-control-sm avulsa-item-ncm"
                                    data-index="${index}"
                                    value="${escaparHTMLAvulsaNFE(
                                        item.ncm ||
                                        '87149990'
                                    )}"
                                    maxlength="8"
                                >

                            </td>


                            <td
                                class="avulsa-item-subtotal"
                            >

                                R$
                                ${subtotal.toFixed(2)}

                            </td>


                            <td>

                                <button
                                    type="button"
                                    class="btn btn-sm btn-danger"
                                    onclick="
                                        removerProdutoAvulsaNFE(
                                            ${index}
                                        )
                                    "
                                    title="Remover produto"
                                >

                                    <i class="fas fa-trash"></i>

                                </button>

                            </td>

                        </tr>
                    `;
                }
            )
            .join(
                ''
            );


    // =====================================================
    // EVENTOS
    // =====================================================

    tbody
        .querySelectorAll(
            `
            .avulsa-item-nome,
            .avulsa-item-quantidade,
            .avulsa-item-valor,
            .avulsa-item-ncm
            `
        )
        .forEach(
            input => {

                input.addEventListener(
                    'input',
                    function () {

                        atualizarItemProdutoAvulsaNFE(
                            Number(
                                this.dataset.index
                            )
                        );
                    }
                );
            }
        );


    atualizarProdutosJSONAvulsaNFE();
}


// =========================================================
// ATUALIZAR ITEM APÓS EDIÇÃO
// =========================================================

function atualizarItemProdutoAvulsaNFE(
    index
) {

    const item =
        window
            ._itensAvulsaNFE[
                index
            ];


    if (!item) {

        return;
    }


    const linha =
        document.querySelector(
            `#avulsaProdutosSelecionadosBody tr[data-index="${index}"]`
        );


    if (!linha) {

        return;
    }


    item.nome =
        linha.querySelector(
            '.avulsa-item-nome'
        )?.value.trim() ||
        'Produto';


    item.quantidade =
        parseFloat(
            linha.querySelector(
                '.avulsa-item-quantidade'
            )?.value
        ) ||
        0;


    item.valor_unitario =
        parseFloat(
            linha.querySelector(
                '.avulsa-item-valor'
            )?.value
        ) ||
        0;


    item.ncm =
        String(
            linha.querySelector(
                '.avulsa-item-ncm'
            )?.value ||
            ''
        )
            .replace(
                /\D/g,
                ''
            )
            .substring(
                0,
                8
            ) ||
        '87149990';


    const subtotal =
        item.quantidade *
        item.valor_unitario;


    const subtotalCell =
        linha.querySelector(
            '.avulsa-item-subtotal'
        );


    if (
        subtotalCell
    ) {

        subtotalCell.textContent =
            `R$ ${subtotal.toFixed(2)}`;
    }


    atualizarProdutosJSONAvulsaNFE();
}


// =========================================================
// REMOVER PRODUTO
// =========================================================

function removerProdutoAvulsaNFE(
    index
) {

    if (
        !Array.isArray(
            window._itensAvulsaNFE
        )
    ) {

        return;
    }


    window
        ._itensAvulsaNFE
        .splice(
            index,
            1
        );


    renderizarProdutosAvulsaNFE();
}


// =========================================================
// GERAR JSON QUE A API JÁ ESPERA
// =========================================================

function atualizarProdutosJSONAvulsaNFE() {

    const campo =
        document.getElementById(
            'avulsaProdutos'
        );


    const totalCell =
        document.getElementById(
            'avulsaTotalProdutos'
        );


    const itens =
        Array.isArray(
            window._itensAvulsaNFE
        )
            ? window._itensAvulsaNFE
            : [];


    const produtosPayload =
        itens.map(
            item => ({

                nome:
                    item.nome ||
                    'Produto',

                quantidade:
                    Number(
                        item.quantidade ||
                        0
                    ),

                valor_unitario:
                    Number(
                        item.valor_unitario ||
                        0
                    ),

                sku:
                    item.sku ||
                    'SEM_SKU',

                ncm:
                    item.ncm ||
                    '87149990'
            })
        );


    if (
        campo
    ) {

        campo.value =
            JSON.stringify(
                produtosPayload
            );
    }


    const total =
        produtosPayload.reduce(
            (
                acumulado,
                produto
            ) =>
                acumulado +
                (
                    produto.quantidade *
                    produto.valor_unitario
                ),
            0
        );


    if (
        totalCell
    ) {

        totalCell.textContent =
            `R$ ${total.toFixed(2)}`;
    }


    console.log(
        '📦 Produtos NF-e avulsa:',
        produtosPayload
    );
}

async function preencherSelectNaturezaNFE(
    selectId,
    contexto = 'ml'
) {

    const select =
        document.getElementById(
            selectId
        );


    if (!select) {

        console.warn(
            `⚠️ Select ${selectId} não encontrado`
        );

        return false;
    }


    if (
        !window.supabaseClient
    ) {

        console.error(
            '❌ Supabase não inicializado'
        );

        select.innerHTML = `
            <option value="">
                Erro ao carregar Naturezas
            </option>
        `;

        return false;
    }


    try {

        select.disabled =
            true;


        select.innerHTML = `
            <option value="">
                Carregando Naturezas...
            </option>
        `;


        const {
            data,
            error
        } =
            await window
                .supabaseClient
                .from(
                    'nfe_naturezas_operacao'
                )
                .select(`
                    id,
                    descricao,
                    ativo,
                    padrao_ml,
                    padrao_avulsa
                `)
                .eq(
                    'ativo',
                    true
                )
                .order(
                    'descricao',
                    {
                        ascending:
                            true
                    }
                );


        if (error) {

            throw error;
        }


        const naturezas =
            Array.isArray(
                data
            )
                ? data
                : [];


        if (
            naturezas.length ===
            0
        ) {

            select.innerHTML = `
                <option value="">
                    Nenhuma Natureza cadastrada
                </option>
            `;

            select.disabled =
                false;

            return false;
        }


        // =====================================================
        // IDENTIFICAR PADRÃO
        // =====================================================

        let padrao =
            null;


        if (
            contexto ===
            'avulsa'
        ) {

            padrao =
                naturezas.find(
                    item =>
                        item.padrao_avulsa ===
                        true
                );

        } else {

            padrao =
                naturezas.find(
                    item =>
                        item.padrao_ml ===
                        true
                );
        }


        // Se nenhum estiver marcado,
        // selecionar o primeiro ativo.
        if (!padrao) {

            padrao =
                naturezas[0];
        }


        // =====================================================
        // MONTAR SELECT
        // =====================================================

        select.innerHTML =
            '';


        naturezas.forEach(
            natureza => {

                const option =
                    document.createElement(
                        'option'
                    );


                // O backend espera a descrição:
                // VENDA, DEVOLUÇÃO, REMESSA etc.
                option.value =
                    natureza.descricao;


                option.textContent =
                    natureza.descricao;


                if (
                    padrao &&
                    natureza.id ===
                    padrao.id
                ) {

                    option.selected =
                        true;
                }


                select.appendChild(
                    option
                );
            }
        );


        select.disabled =
            false;


        console.log(
            `✅ ${naturezas.length} Natureza(s) carregada(s) para ${contexto}`,
            {
                padrao:
                    padrao?.descricao
            }
        );


        return true;


    } catch (
        error
    ) {

        console.error(
            '❌ Erro carregando Naturezas da Operação:',
            error
        );


        select.innerHTML = `
            <option value="">
                Erro ao carregar Naturezas
            </option>
        `;


        select.disabled =
            false;


        return false;
    }
}


window.preencherSelectNaturezaNFE = preencherSelectNaturezaNFE;

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
window.garantirEstruturaCadastrosNFE = garantirEstruturaCadastrosNFE;
window.removerBotoesCadastroAbasConsultaNFE = removerBotoesCadastroAbasConsultaNFE;
window.carregarCadastrosNFE = carregarCadastrosNFE;
window.mostrarCadastroNFE = mostrarCadastroNFE;
window.abrirModalCadastroClienteNFE = abrirModalCadastroClienteNFE;
window.fecharModalCadastroClienteNFE = fecharModalCadastroClienteNFE;
window.salvarCadastroClienteNFE = salvarCadastroClienteNFE;
window.abrirModalTransportadora = abrirModalTransportadora;
window.fecharModalTransportadora = fecharModalTransportadora;
window.salvarNovaTransportadora = salvarNovaTransportadora;
window.excluirTransportadora = excluirTransportadora;
window.excluirCliente = excluirCliente;
window.abrirModalCFOPNFE = abrirModalCFOPNFE;
window.fecharModalCFOPNFE = fecharModalCFOPNFE;
window.salvarCFOPNFE = salvarCFOPNFE;
window.alterarStatusCFOPNFE = alterarStatusCFOPNFE;
window.abrirModalNaturezaOperacaoNFE = abrirModalNaturezaOperacaoNFE;
window.fecharModalNaturezaOperacaoNFE = fecharModalNaturezaOperacaoNFE;
window.salvarNaturezaOperacaoNFE = salvarNaturezaOperacaoNFE;
window.alterarStatusNaturezaNFE = alterarStatusNaturezaNFE;
window.escaparHTMLCadastroNFE = escaparHTMLCadastroNFE;
window.carregarCadastroTransportadorasNFE = carregarCadastroTransportadorasNFE;
window.carregarCadastroClientesNFE = carregarCadastroClientesNFE;
window.carregarCadastroCFOPsNFE = carregarCadastroCFOPsNFE;
window.carregarCadastroNaturezasNFE = carregarCadastroNaturezasNFE;
window.carregarClientesAvulsaNFE = carregarClientesAvulsaNFE;
window.pesquisarClienteAvulsaNFE = pesquisarClienteAvulsaNFE;
window.selecionarClienteAvulsaNFE = selecionarClienteAvulsaNFE;
window.limparClienteSelecionadoAvulsaNFE = limparClienteSelecionadoAvulsaNFE;
window.preencherSelectTransportadoraAvulsaNFE = preencherSelectTransportadoraAvulsaNFE;
window.prepararEmissaoAvulsaNFE = prepararEmissaoAvulsaNFE;
window.emitirNFEAvulsa = emitirNFEAvulsa;
window.limparFormAvulsa = limparFormAvulsa;
window.garantirSelectAvulsaNFE = garantirSelectAvulsaNFE;
window.garantirEstruturaProdutosAvulsaNFE = garantirEstruturaProdutosAvulsaNFE;
window.carregarProdutosAvulsaNFE = carregarProdutosAvulsaNFE;
window.pesquisarProdutoAvulsaNFE = pesquisarProdutoAvulsaNFE;
window.selecionarProdutoAvulsaNFE = selecionarProdutoAvulsaNFE;
window.limparBuscaProdutoAvulsaNFE = limparBuscaProdutoAvulsaNFE;
window.renderizarProdutosAvulsaNFE = renderizarProdutosAvulsaNFE;
window.atualizarItemProdutoAvulsaNFE = atualizarItemProdutoAvulsaNFE;
window.removerProdutoAvulsaNFE = removerProdutoAvulsaNFE;
window.atualizarProdutosJSONAvulsaNFE = atualizarProdutosJSONAvulsaNFE;

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