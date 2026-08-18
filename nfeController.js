const WORKER_URL = process.env.WORKER_URL || 'https://purple-bonus-3b1c.andmiotto1998.workers.dev';

// nfeController.js - Emissão, Cancelamento, Listagem, Consulta, Avulsa, Sincronização ML
const { gerarXmlNfe } = require('./xmlBuilder');
const { assinarXml } = require('./xmlSigner');
const NFEService = require('./nfeService');
const { loadCertificates } = require('./utils');
const supabase = require('./supabaseClient');
const { extrairProtocolo, extrairChaveAcesso } = require('./nfeUtils');
const fs = require('fs');
const path = require('path');

const DEFAULT_IBGE = '4101804'; // Araucária/PR (fallback)

// ===== TOKENS CSRT DO AMBIENTE =====
const CSRT_TOKEN_HOMOLOGACAO = process.env.CSRT_TOKEN_HOMOLOGACAO || '16UBATD6FDRUDYK2NV5P21NVB1I08UOYC220';
const CSRT_TOKEN_PRODUCAO = process.env.CSRT_TOKEN_PRODUCAO || 'DM3JSLGIU2Z957T83B2P85CB8YG0C8D3JZUG';
const AMBIENTE = process.env.NFE_AMBIENTE || 'producao';

// ===================== OBTER CÓDIGO IBGE =====================
async function obterCodigoMunicipio(
    nomeCidade,
    uf,
    cep = null
) {

    const cidadeLimpa =
        String(
            nomeCidade ||
            ''
        ).trim();


    const ufLimpa =
        String(
            uf ||
            ''
        )
            .trim()
            .toUpperCase();


    const cepLimpo =
        String(
            cep ||
            ''
        )
            .replace(
                /\D/g,
                ''
            );


    if (
        !cidadeLimpa
    ) {

        throw new Error(
            'Cidade do destinatário não informada.'
        );
    }


    if (
        !ufLimpa ||
        ufLimpa.length !==
            2
    ) {

        throw new Error(
            'UF do destinatário inválida.'
        );
    }


    // =====================================================
    // CÓDIGO IBGE DA UF
    //
    // Os 2 primeiros dígitos do município identificam a UF.
    // =====================================================

    const codigosUF = {

        RO: '11',
        AC: '12',
        AM: '13',
        RR: '14',
        PA: '15',
        AP: '16',
        TO: '17',

        MA: '21',
        PI: '22',
        CE: '23',
        RN: '24',
        PB: '25',
        PE: '26',
        AL: '27',
        SE: '28',
        BA: '29',

        MG: '31',
        ES: '32',
        RJ: '33',
        SP: '35',

        PR: '41',
        SC: '42',
        RS: '43',

        MS: '50',
        MT: '51',
        GO: '52',
        DF: '53'
    };


    const prefixoEsperado =
        codigosUF[
            ufLimpa
        ];


    if (
        !prefixoEsperado
    ) {

        throw new Error(
            `UF não reconhecida: ${ufLimpa}`
        );
    }


    // =====================================================
    // VALIDADOR
    // =====================================================

    const validarCodigo =
        codigo => {

            const codigoLimpo =
                String(
                    codigo ||
                    ''
                )
                    .replace(
                        /\D/g,
                        ''
                    );


            if (
                codigoLimpo.length !==
                7
            ) {

                return null;
            }


            if (
                !codigoLimpo.startsWith(
                    prefixoEsperado
                )
            ) {

                console.warn(
                    `⚠️ Código IBGE ${codigoLimpo} não pertence à UF ${ufLimpa}`
                );

                return null;
            }


            return codigoLimpo;
        };


    // =====================================================
    // 1. BUSCAR NA NOSSA TABELA DE MUNICÍPIOS
    // =====================================================

    try {

        const {
            data,
            error
        } =
            await supabase
                .from(
                    'municipios'
                )
                .select(
                    'codigo_ibge, nome, uf'
                )
                .ilike(
                    'nome',
                    cidadeLimpa
                )
                .eq(
                    'uf',
                    ufLimpa
                )
                .maybeSingle();


        if (
            !error &&
            data?.codigo_ibge
        ) {

            const codigoValido =
                validarCodigo(
                    data.codigo_ibge
                );


            if (
                codigoValido
            ) {

                console.log(
                    `🏙️ Município encontrado no banco: ${cidadeLimpa}/${ufLimpa} → ${codigoValido}`
                );


                return codigoValido;
            }
        }


        if (
            error
        ) {

            console.warn(
                '⚠️ Erro buscando município no Supabase:',
                error.message
            );
        }


    } catch (
        error
    ) {

        console.warn(
            '⚠️ Falha buscando município no banco:',
            error.message
        );
    }


    // =====================================================
    // 2. BUSCAR PELO CEP
    // =====================================================

    if (
        cepLimpo.length ===
        8
    ) {

        try {

            const fetch =
                require(
                    'node-fetch'
                );


            console.log(
                `📍 Buscando IBGE pelo CEP ${cepLimpo}...`
            );


            const response =
                await fetch(
                    `https://brasilapi.com.br/api/cep/v1/${cepLimpo}`
                );


            if (
                response.ok
            ) {

                const json =
                    await response.json();


                const ufCEP =
                    String(
                        json.state ||
                        ''
                    )
                        .trim()
                        .toUpperCase();


                // =================================================
                // PROTEÇÃO IMPORTANTE:
                // CEP precisa pertencer à mesma UF do cliente.
                // =================================================

                if (
                    ufCEP &&
                    ufCEP !==
                        ufLimpa
                ) {

                    throw new Error(
                        `O CEP ${cepLimpo} pertence a ${ufCEP}, mas o cliente está cadastrado como ${ufLimpa}.`
                    );
                }


                const codigoValido =
                    validarCodigo(
                        json.ibge_code
                    );


                if (
                    codigoValido
                ) {

                    console.log(
                        `✅ IBGE pelo CEP: ${json.city}/${ufCEP} → ${codigoValido}`
                    );


                    // =============================================
                    // SALVAR NO CACHE LOCAL
                    // =============================================

                    try {

                        await supabase
                            .from(
                                'municipios'
                            )
                            .upsert(
                                {
                                    codigo_ibge:
                                        parseInt(
                                            codigoValido,
                                            10
                                        ),

                                    nome:
                                        json.city ||
                                        cidadeLimpa,

                                    uf:
                                        ufCEP ||
                                        ufLimpa
                                },
                                {
                                    onConflict:
                                        'codigo_ibge'
                                }
                            );

                    } catch (
                        cacheError
                    ) {

                        console.warn(
                            '⚠️ Não foi possível salvar município no cache:',
                            cacheError.message
                        );
                    }


                    return codigoValido;
                }
            }


        } catch (
            error
        ) {

            // Se descobrimos que CEP e UF divergem,
            // não esconder esse erro.
            if (
                String(
                    error.message ||
                    ''
                ).includes(
                    'pertence a'
                )
            ) {

                throw error;
            }


            console.warn(
                '⚠️ Falha consultando município pelo CEP:',
                error.message
            );
        }
    }


    // =====================================================
    // NÃO USAR MAIS ARAUCÁRIA/PR COMO FALLBACK
    //
    // Melhor impedir emissão do que mandar cMun incorreto
    // para a SEFAZ.
    // =====================================================

    throw new Error(
        `Não foi possível determinar o código IBGE de ${cidadeLimpa}/${ufLimpa}. ` +
        `Confira cidade e CEP no cadastro do cliente.`
    );
}

// ===================== IMPORTAR NF-e NO ML =====================
async function importarNFEnoML(shipment_id, xml, token) {
    if (!shipment_id) return { ok: true, message: 'Sem shipment_id' };
    const url = `https://api.mercadolibre.com/shipments/${shipment_id}/invoice_data?siteId=MLB`;
    const fetch = require('node-fetch');
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/xml'
            },
            body: xml
        });
        if (!response.ok) {
            const text = await response.text();
            console.warn(`❌ ML retornou erro ${response.status}: ${text.substring(0, 200)}`);
            // Se o erro for 400 ou 409, pode ser que a NF-e já tenha sido importada ou o envio não precise
            if (response.status === 400 || response.status === 409) {
                return { ok: true, message: 'ML já possui NF-e ou não requer importação' };
            }
            return { ok: false, error: text };
        }
        return { ok: true, xml_url: response.headers.get('location') };
    } catch (error) {
        console.warn('Erro ao importar NF-e no ML (não crítico):', error.message);
        return { ok: false, error: error.message };
    }
}

// ===================== BUSCAR TRANSPORTADORA POR ID =====================
async function buscarTransportadoraPorId(id) {
    if (!id) return null;
    try {
        const { data, error } = await supabase
            .from('transportadoras')
            .select('*')
            .eq('id', id)
            .single();
        if (error) throw error;
        return data;
    } catch (error) {
        console.error('❌ Erro ao buscar transportadora:', error);
        return null;
    }
}

// ===================== EMISSÃO DE NF-e =====================
async function emitirNFe(req, res) {

    console.log('📨 Requisição de emissão recebida');

    try {

        // =====================================================
        // DADOS RECEBIDOS
        // =====================================================

        const dados =
            req.body || {};


        const {
            venda_id,
            cliente,
            produtos,
            cfop,
            natureza_operacao,
            modalidade_frete,
            transportadora_id,
            ml_access_token,

            // NF-e avulsa / devolução
            emissao_avulsa,
            eh_devolucao,
            finalidade_nfe,
            tp_nf,
            chave_nfe_referenciada

        } = dados;


        // =====================================================
        // VALIDAÇÕES INICIAIS
        // =====================================================

        if (!cliente) {

            throw new Error(
                'Cliente não informado'
            );
        }


        if (
            !Array.isArray(produtos) ||
            produtos.length === 0
        ) {

            throw new Error(
                'Nenhum produto informado'
            );
        }


        if (!cfop) {

            throw new Error(
                'CFOP não informado'
            );
        }


        // =====================================================
        // IDENTIFICAR OPERAÇÃO
        // =====================================================

        const SELLER_UF =
            'PR';


        const buyerUF =
            String(
                cliente.uf ||
                ''
            )
                .trim()
                .toUpperCase();


        if (
            !buyerUF ||
            buyerUF.length !== 2
        ) {

            throw new Error(
                'UF do cliente não informada ou inválida.'
            );
        }


        const naturezaNormalizada =
            String(
                natureza_operacao ||
                ''
            )
                .normalize('NFD')
                .replace(
                    /[\u0300-\u036f]/g,
                    ''
                )
                .trim()
                .toLowerCase();


        const ehDevolucao =
            eh_devolucao === true ||

            String(
                finalidade_nfe ||
                ''
            ) === '4' ||

            naturezaNormalizada.includes(
                'devolucao'
            );


        console.log(
            '🧾 Tipo da operação:',
            {
                ehDevolucao,
                natureza_operacao,
                finalidade_nfe,
                tp_nf,
                cfop,
                buyerUF
            }
        );


        // =====================================================
        // VALIDAR CFOP
        // =====================================================

        if (ehDevolucao) {

            // =================================================
            // ENTRADA DE DEVOLUÇÃO
            //
            // PR → PR = 1202
            // Outro estado → PR = 2202
            // =================================================

            const cfopEsperado =
                buyerUF === SELLER_UF
                    ? '1202'
                    : '2202';


            if (
                String(cfop) !==
                cfopEsperado
            ) {

                throw new Error(

                    buyerUF === SELLER_UF

                        ? `Entrada de Devolução dentro do PR exige CFOP ${cfopEsperado}.`

                        : `Entrada de Devolução do estado ${buyerUF} exige CFOP ${cfopEsperado}.`
                );
            }


            const chaveReferenciada =
                String(
                    chave_nfe_referenciada ||
                    ''
                )
                    .replace(
                        /\D/g,
                        ''
                    );


            if (
                chaveReferenciada.length !==
                44
            ) {

                throw new Error(
                    'Entrada de Devolução exige a chave de acesso da NF-e original com 44 dígitos.'
                );
            }


            console.log(
                '↩️ DEVOLUÇÃO VALIDADA:',
                {
                    buyerUF,
                    cfop,
                    finalidade_nfe: '4',
                    tpNF: '0',
                    chaveReferenciada
                }
            );


        } else {

            // =================================================
            // VENDA NORMAL
            // =================================================

            if (
                buyerUF === SELLER_UF &&
                String(cfop) !== '5102'
            ) {

                throw new Error(
                    `Venda dentro do estado (${buyerUF}) exige CFOP 5102.`
                );
            }


            if (
                buyerUF !== SELLER_UF &&
                String(cfop) !== '6108'
            ) {

                throw new Error(
                    `Venda fora do estado (${buyerUF}) exige CFOP 6108.`
                );
            }
        }


        // =====================================================
        // CPF / CNPJ
        // =====================================================

        let documento =
            String(
                cliente.documento ||
                ''
            )
                .replace(
                    /\D/g,
                    ''
                );


        if (
            !documento ||
            (
                documento.length !== 11 &&
                documento.length !== 14
            )
        ) {

            console.warn(
                '⚠️ Documento inválido, usando CPF genérico para homologação'
            );


            documento =
                '99999999999';
        }


        const tipoDoc =
            documento.length === 14
                ? 'CNPJ'
                : 'CPF';


        // =====================================================
        // DADOS DESTINATÁRIO
        // =====================================================

        const logradouro =
            cliente.endereco ||
            cliente.logradouro ||
            'NÃO INFORMADO';


        const numero =
            cliente.numero ||
            'S/N';


        const bairro =
            cliente.bairro ||
            'CENTRO';


        const cidade =
            String(
                cliente.cidade ||
                'ARAUCARIA'
            )
                .trim();


        const uf =
            buyerUF;


        let cep =
            String(
                cliente.cep ||
                '83702090'
            )
                .replace(
                    /\D/g,
                    ''
                );


        if (
            cep.length !== 8
        ) {

            cep =
                '83702090';
        }


        // =====================================================
        // IBGE DO MUNICÍPIO DO DESTINATÁRIO
        // =====================================================

        const codigoIbge =
            await obterCodigoMunicipio(
                cidade,
                uf,
                cep
            );


        console.log(
            '🏙️ MUNICÍPIO DESTINATÁRIO:',
            {
                cidade,
                uf,
                cep,
                codigoIbge
            }
        );


        // =====================================================
        // DESTINATÁRIO XML
        // =====================================================

        const destinatario = {

            xNome:
                cliente.nome ||
                'Consumidor Final',

            xLgr:
                logradouro,

            nro:
                numero,

            xBairro:
                bairro,

            xMun:
                cidade,

            UF:
                uf,

            CEP:
                cep,

            cMun:
                codigoIbge
        };


        if (
            tipoDoc === 'CPF'
        ) {

            destinatario.CPF =
                documento;

        } else {

            destinatario.CNPJ =
                documento;
        }


        // =====================================================
        // CONTROLE SEQUENCIAL DA NF
        // =====================================================

        const serie =
            3;


        let nNF =
            null;


        for (
            let i = 0;
            i < 5;
            i++
        ) {

            try {

                const {
                    data: controle
                } =
                    await supabase
                        .from(
                            'controle_nfe'
                        )
                        .select(
                            'ultimo_numero'
                        )
                        .eq(
                            'serie',
                            serie
                        )
                        .maybeSingle();


                const proximo =
                    (
                        controle
                            ?.ultimo_numero ||
                        50000
                    ) + 1;


                const {
                    error
                } =
                    await supabase
                        .from(
                            'controle_nfe'
                        )
                        .upsert(
                            {
                                serie,
                                ultimo_numero:
                                    proximo
                            },
                            {
                                onConflict:
                                    'serie'
                            }
                        );


                if (!error) {

                    nNF =
                        proximo;


                    console.log(
                        `✅ Número NF alocado: ${nNF}`
                    );


                    break;
                }


            } catch (err) {

                console.warn(
                    err
                );
            }


            await new Promise(
                resolve =>
                    setTimeout(
                        resolve,
                        200
                    )
            );
        }


        if (!nNF) {

            nNF =
                Math.floor(
                    Math.random() *
                    900000000
                ) +
                100000000;
        }


        // =====================================================
        // TRANSPORTADORA
        // =====================================================

        let transportadoraDados =
            null;


        if (transportadora_id) {

            try {

                const {
                    data: transp,
                    error
                } =
                    await supabase
                        .from(
                            'transportadoras'
                        )
                        .select('*')
                        .eq(
                            'id',
                            transportadora_id
                        )
                        .maybeSingle();


                if (
                    !error &&
                    transp
                ) {

                    const cnpjLimpo =
                        String(
                            transp.cnpj ||
                            ''
                        )
                            .replace(
                                /\D/g,
                                ''
                            );


                    if (
                        cnpjLimpo.length ===
                        14
                    ) {

                        transportadoraDados = {

                            CNPJ:
                                cnpjLimpo,

                            xNome:
                                transp.nome ||
                                'Transportadora não informada',

                            IE:
                                transp.ie ||
                                'ISENTO',

                            xEnder:
                                transp.endereco ||
                                '',

                            xMun:
                                transp.cidade ||
                                '',

                            UF:
                                transp.uf ||
                                ''
                        };


                        console.log(
                            `✅ Transportadora carregada: ${transp.nome}`
                        );

                    } else {

                        console.warn(
                            `⚠️ CNPJ da transportadora inválido: ${transp.cnpj} - Ignorando.`
                        );
                    }
                }


            } catch (err) {

                console.warn(
                    '⚠️ Erro ao buscar transportadora:',
                    err.message
                );
            }
        }


        // =====================================================
        // VALOR TOTAL
        // =====================================================

        const valorTotal =
            produtos.reduce(
                (
                    sum,
                    produto
                ) => {

                    const quantidade =
                        Number(
                            produto.quantidade ||
                            0
                        );


                    const valorUnitario =
                        Number(
                            produto.valor_unitario ||
                            0
                        );


                    return (
                        sum +
                        (
                            quantidade *
                            valorUnitario
                        )
                    );
                },
                0
            );


        // =====================================================
        // TRIBUTOS APROXIMADOS
        // =====================================================

        const percentualTributos =
            0.15;


        const totalTributos =
            valorTotal *
            percentualTributos;


        const federais =
            totalTributos *
            0.4;


        const estaduais =
            totalTributos *
            0.6;


        const infAdic =
`INFORMAÇÕES COMPLEMENTARES
I - "DOCUMENTO EMITIDO POR ME OU EPP OPTANTE PELO SIMPLES NACIONAL";II - "NAO GERA DIREITO A CREDITO FISCAL DE ICMS, DE ISS E DE IPI".
Valor aproximado dos tributos:
R$ ${federais.toFixed(2)} federais
R$ ${estaduais.toFixed(2)} estaduais
Fonte: IBPT/empresometro.com.br 92589A`;


        // =====================================================
        // CSRT
        // =====================================================

        const tokenCSRT =
            AMBIENTE === 'producao'
                ? CSRT_TOKEN_PRODUCAO
                : CSRT_TOKEN_HOMOLOGACAO;


        // =====================================================
        // MODALIDADE FRETE
        //
        // Venda ML mantém 2 como fallback.
        // Avulsa mantém 9 como fallback.
        // =====================================================

        const modFreteFinal =
            String(
                modalidade_frete ??
                (
                    emissao_avulsa
                        ? '9'
                        : '2'
                )
            );


        // =====================================================
        // GERAR XML BASE
        // =====================================================

        let xml =
            gerarXmlNfe({

                nNF,

                serie,

                tpAmb:
                    AMBIENTE ===
                    'producao'
                        ? '1'
                        : '2',

                destinatario,

                produtos,

                cfop,

                natOp:
                    natureza_operacao ||
                    'Venda',

                modFrete:
                    modFreteFinal,

                transportadora:
                    transportadoraDados,

                volumes: {
                    qVol: 1,
                    pesoL: 0,
                    pesoB: 0
                },

                fatura:
                    null,

                infAdic,

                respTec: {

                    CNPJ:
                        '32830261000125',

                    xContato:
                        'WHEEL TECH BICYCLING LTDA',

                    email:
                        'wheeltechbicycling@gmail.com.br',

                    fone:
                        '4131501230',

                    tokenCSRT
                }
            });


        // =====================================================
        // AJUSTAR XML PARA DEVOLUÇÃO
        // =====================================================

        if (ehDevolucao) {

            console.log(
                '↩️ Ajustando XML para ENTRADA DE DEVOLUÇÃO...'
            );


            const chaveReferenciada =
                String(
                    chave_nfe_referenciada ||
                    ''
                )
                    .replace(
                        /\D/g,
                        ''
                    );


            if (
                chaveReferenciada.length !==
                44
            ) {

                throw new Error(
                    'NF-e de devolução exige chave referenciada com 44 dígitos.'
                );
            }


            // =================================================
            // tpNF
            //
            // 0 = Entrada
            // =================================================

            if (
                /<tpNF>\d<\/tpNF>/.test(
                    xml
                )
            ) {

                xml =
                    xml.replace(
                        /<tpNF>\d<\/tpNF>/,
                        '<tpNF>0</tpNF>'
                    );

            } else {

                throw new Error(
                    'Tag <tpNF> não encontrada no XML gerado.'
                );
            }


            // =================================================
            // finNFe
            //
            // 4 = Devolução
            // =================================================

            if (
                /<finNFe>\d<\/finNFe>/.test(
                    xml
                )
            ) {

                xml =
                    xml.replace(
                        /<finNFe>\d<\/finNFe>/,
                        '<finNFe>4</finNFe>'
                    );

            } else {

                throw new Error(
                    'Tag <finNFe> não encontrada no XML gerado.'
                );
            }


            // =================================================
            // NF-e REFERENCIADA
            // =================================================

            xml =
                xml.replace(
                    /<NFref>[\s\S]*?<\/NFref>/g,
                    ''
                );


            const xmlReferencia =
                `<NFref>` +
                    `<refNFe>${chaveReferenciada}</refNFe>` +
                `</NFref>`;


            if (
                xml.includes(
                    '</ide>'
                )
            ) {

                xml =
                    xml.replace(
                        '</ide>',
                        `${xmlReferencia}</ide>`
                    );

            } else {

                throw new Error(
                    'Tag </ide> não encontrada no XML gerado.'
                );
            }


            // =================================================
            // PAGAMENTO DA DEVOLUÇÃO
            //
            // tPag = 90 = Sem Pagamento
            // vPag = 0.00
            // =================================================

            const xmlPagamentoDevolucao =
                `<pag>` +
                    `<detPag>` +
                        `<tPag>90</tPag>` +
                        `<vPag>0.00</vPag>` +
                    `</detPag>` +
                `</pag>`;


            // =================================================
            // SUBSTITUI PAGAMENTO EXISTENTE
            // =================================================

            if (
                /<pag>[\s\S]*?<\/pag>/.test(
                    xml
                )
            ) {

                xml =
                    xml.replace(
                        /<pag>[\s\S]*?<\/pag>/,
                        xmlPagamentoDevolucao
                    );


            // =================================================
            // CASO NÃO EXISTA <pag>
            // =================================================

            } else if (
                xml.includes(
                    '<infAdic>'
                )
            ) {

                xml =
                    xml.replace(
                        '<infAdic>',
                        `${xmlPagamentoDevolucao}<infAdic>`
                    );


            } else if (
                xml.includes(
                    '<infRespTec>'
                )
            ) {

                xml =
                    xml.replace(
                        '<infRespTec>',
                        `${xmlPagamentoDevolucao}<infRespTec>`
                    );


            } else if (
                xml.includes(
                    '</infNFe>'
                )
            ) {

                xml =
                    xml.replace(
                        '</infNFe>',
                        `${xmlPagamentoDevolucao}</infNFe>`
                    );


            } else {

                throw new Error(
                    'Não foi possível inserir o grupo de pagamento da devolução.'
                );
            }


            // =================================================
            // CONFERÊNCIA
            // =================================================

            const tpNFXml =
                xml.match(
                    /<tpNF>([^<]+)<\/tpNF>/
                )?.[1];


            const finNFeXml =
                xml.match(
                    /<finNFe>([^<]+)<\/finNFe>/
                )?.[1];


            const refNFeXml =
                xml.match(
                    /<refNFe>(\d{44})<\/refNFe>/
                )?.[1];


            const tPagXml =
                xml.match(
                    /<tPag>([^<]+)<\/tPag>/
                )?.[1];


            const vPagXml =
                xml.match(
                    /<vPag>([^<]+)<\/vPag>/
                )?.[1];


            console.log(
                '✅ XML DEVOLUÇÃO AJUSTADO:',
                {
                    tpNF:
                        tpNFXml,

                    finNFe:
                        finNFeXml,

                    refNFe:
                        refNFeXml,

                    tPag:
                        tPagXml,

                    vPag:
                        vPagXml,

                    cfop,

                    ufCliente:
                        buyerUF,

                    modFrete:
                        modFreteFinal
                }
            );


            // =================================================
            // VALIDAÇÕES INTERNAS
            // =================================================

            if (
                tpNFXml !== '0'
            ) {

                throw new Error(
                    `Erro interno: devolução ficou com tpNF=${tpNFXml}. Esperado 0.`
                );
            }


            if (
                finNFeXml !== '4'
            ) {

                throw new Error(
                    `Erro interno: devolução ficou com finNFe=${finNFeXml}. Esperado 4.`
                );
            }


            if (
                refNFeXml !==
                chaveReferenciada
            ) {

                throw new Error(
                    'Erro interno: a chave da NF-e referenciada não foi inserida corretamente.'
                );
            }


            if (
                tPagXml !== '90'
            ) {

                throw new Error(
                    `Erro interno: devolução ficou com tPag=${tPagXml}. Esperado 90.`
                );
            }


            if (
                Number(
                    vPagXml ||
                    0
                ) !== 0
            ) {

                throw new Error(
                    `Erro interno: devolução ficou com vPag=${vPagXml}. Esperado 0.00.`
                );
            }
        }


        // =====================================================
        // DEBUG FISCAL FINAL
        // =====================================================

        console.log(
            '🧾 DADOS FISCAIS DO XML:',
            {
                operacao:
                    ehDevolucao
                        ? 'ENTRADA DE DEVOLUÇÃO'
                        : 'VENDA',

                cfop,

                buyerUF,

                tpNF:
                    xml.match(
                        /<tpNF>([^<]+)<\/tpNF>/
                    )?.[1],

                finNFe:
                    xml.match(
                        /<finNFe>([^<]+)<\/finNFe>/
                    )?.[1],

                refNFe:
                    xml.match(
                        /<refNFe>(\d{44})<\/refNFe>/
                    )?.[1] ||
                    null,

                modFrete:
                    xml.match(
                        /<modFrete>([^<]+)<\/modFrete>/
                    )?.[1],

                tPag:
                    xml.match(
                        /<tPag>([^<]+)<\/tPag>/
                    )?.[1],

                vPag:
                    xml.match(
                        /<vPag>([^<]+)<\/vPag>/
                    )?.[1]
            }
        );


        // =====================================================
        // ASSINAR XML
        // =====================================================

        const certData =
            loadCertificates();


        console.log(
            '🔑 Certificado carregado?',
            !!certData.privateKey,
            !!certData.cert
        );


        const xmlAssinado =
            assinarXml(
                xml,
                {
                    privateKey:
                        certData.privateKey,

                    cert:
                        certData.cert
                }
            );


        // =====================================================
        // SALVAR XML ASSINADO
        // =====================================================

        const xmlPath =
            path.join(
                __dirname,
                'xml_gerado',
                `nfe_${nNF}_${Date.now()}.xml`
            );


        const dir =
            path.dirname(
                xmlPath
            );


        if (
            !fs.existsSync(
                dir
            )
        ) {

            fs.mkdirSync(
                dir,
                {
                    recursive:
                        true
                }
            );
        }


        fs.writeFileSync(
            xmlPath,
            xmlAssinado,
            'utf8'
        );


        console.log(
            `📁 XML assinado salvo em: ${xmlPath}`
        );


        // =====================================================
        // ENVIAR SEFAZ
        // =====================================================

        const nfeService =
            new NFEService(
                AMBIENTE
            );


        const respostaSefaz =
            await nfeService
                .sendNFe(
                    xmlAssinado,
                    certData
                );


        console.log(
            '📨 RESPOSTA SEFAZ (COMPLETA):',
            respostaSefaz
        );


        // =====================================================
        // PROTOCOLO / CHAVE
        // =====================================================

        const protocolo =
            extrairProtocolo(
                respostaSefaz
            );


        const chaveMatch =
            respostaSefaz
                .match(
                    /<chNFe>(\d+)<\/chNFe>/
                );


        let chaveAcesso;


        if (chaveMatch) {

            chaveAcesso =
                chaveMatch[1];


            console.log(
                `✅ Chave extraída da resposta SEFAZ: ${chaveAcesso}`
            );

        } else {

            chaveAcesso =
                extrairChaveAcesso(
                    xmlAssinado
                );


            console.log(
                `⚠️ Chave extraída do XML: ${chaveAcesso}`
            );
        }


        if (!protocolo) {

            throw new Error(
                'SEFAZ não retornou protocolo'
            );
        }


        console.log(
            '✅ NF-e autorizada. Protocolo:',
            protocolo
        );


        // =====================================================
        // XML nfeProc
        // =====================================================

        let xmlParaML =
            null;


        let mlXmlPath =
            null;


        try {

            const protNFeMatch =
                respostaSefaz
                    .match(
                        /<protNFe[^>]*>([\s\S]*?)<\/protNFe>/
                    );


            let protNFe =
                '';


            if (protNFeMatch) {

                protNFe =
                    protNFeMatch[0];
            }


            const xmlAssinadoSemDeclaracao =
                xmlAssinado
                    .replace(
                        /^<\?xml[^?]*\?>/,
                        ''
                    )
                    .trim();


            const nfeProcXML =
`<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
${xmlAssinadoSemDeclaracao}
${protNFe}
</nfeProc>`;


            mlXmlPath =
                path.join(
                    __dirname,
                    'xml_gerado',
                    `nfe_${nNF}_ml.xml`
                );


            fs.writeFileSync(
                mlXmlPath,
                nfeProcXML,
                'utf8'
            );


            xmlParaML =
                nfeProcXML;


            console.log(
                `📁 XML para ML salvo em: ${mlXmlPath}`
            );


        } catch (err) {

            console.warn(
                '⚠️ Erro ao gerar XML para ML (não crítico):',
                err.message
            );
        }


        // =====================================================
        // SALVAR NF-e SUPABASE
        // =====================================================

        const dadosInsert = {

            data_emissao:
                new Date()
                    .toISOString(),

            numero_nf:
                String(
                    nNF
                ),

            protocolo,

            xml_assinado:
                xmlAssinado,

            chave_acesso:
                chaveAcesso,

            venda_id:
                venda_id ||
                null,

            cliente_nome:
                cliente?.nome ||
                null,

            produto_nome:
                produtos
                    .map(
                        produto =>
                            produto.nome
                    )
                    .join(
                        ', '
                    ),

            valor_total:
                valorTotal,

            status:
                'autorizada',

            cancelada:
                false
        };


        const {
            error: insertError
        } =
            await supabase
                .from(
                    'nfe_emitidas'
                )
                .insert(
                    dadosInsert
                );


        if (insertError) {

            console.error(
                '❌ Erro ao salvar NF-e no Supabase:',
                insertError
            );

        } else {

            console.log(
                '✅ NF-e salva no Supabase com sucesso.'
            );
        }


        // =====================================================
        // VENDA MERCADO LIVRE
        // =====================================================

        if (venda_id) {

            try {

                await supabase
                    .from(
                        'vendas_ml'
                    )
                    .update({

                        nfe_emitida:
                            true,

                        nfe_chave:
                            chaveAcesso,

                        nfe_protocolo:
                            protocolo,

                        data_emissao:
                            new Date()
                                .toISOString()
                    })
                    .eq(
                        'id',
                        venda_id
                    );


                // =============================================
                // TOKEN / SHIPMENT
                // =============================================

                let shipmentId =
                    null;


                let tokenML =
                    ml_access_token;


                if (!tokenML) {

                    const {
                        data: tokenData
                    } =
                        await supabase
                            .from(
                                'vendas_ml'
                            )
                            .select(
                                'ml_access_token'
                            )
                            .eq(
                                'id',
                                venda_id
                            )
                            .single();


                    tokenML =
                        tokenData
                            ?.ml_access_token;
                }


                if (
                    !tokenML &&
                    typeof getValidToken ===
                    'function'
                ) {

                    const tokenObj =
                        await getValidToken();


                    tokenML =
                        tokenObj
                            ?.access_token;
                }


                const {
                    data: venda
                } =
                    await supabase
                        .from(
                            'vendas_ml'
                        )
                        .select(
                            'shipment_id'
                        )
                        .eq(
                            'id',
                            venda_id
                        )
                        .single();


                shipmentId =
                    venda
                        ?.shipment_id;


                // =============================================
                // BUSCAR SHIPMENT NO ML
                // =============================================

                if (
                    !shipmentId &&
                    tokenML
                ) {

                    console.log(
                        `🔍 Buscando shipment_id para venda ${venda_id}...`
                    );


                    try {

                        const orderUrl =
                            `https://api.mercadolibre.com/orders/${venda_id}`;


                        const proxyUrl =
                            `${WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(orderUrl)}&token=${encodeURIComponent(tokenML)}`;


                        const orderRes =
                            await fetch(
                                proxyUrl
                            );


                        if (
                            orderRes.ok
                        ) {

                            const order =
                                await orderRes
                                    .json();


                            shipmentId =
                                order.shipping
                                    ?.id ||
                                null;


                            if (shipmentId) {

                                await supabase
                                    .from(
                                        'vendas_ml'
                                    )
                                    .update({
                                        shipment_id:
                                            shipmentId
                                    })
                                    .eq(
                                        'id',
                                        venda_id
                                    );


                                console.log(
                                    `✅ shipment_id ${shipmentId} obtido e salvo.`
                                );
                            }
                        }


                    } catch (error) {

                        console.warn(
                            '⚠️ Erro ao buscar shipment_id:',
                            error.message
                        );
                    }
                }


                // =============================================
                // ENVIAR XML PARA ML
                // =============================================

                if (
                    shipmentId &&
                    tokenML &&
                    xmlParaML
                ) {

                    const isFull =
                        await verificarSeVendaFull(
                            venda_id,
                            tokenML
                        );


                    if (isFull) {

                        console.log(
                            'ℹ️ Venda FULL - não é necessário importar NF-e.'
                        );

                    } else {

                        console.log(
                            `📤 Enviando NF-e para ML - Shipment: ${shipmentId}`
                        );


                        const resultado =
                            await importarNFEnoML(
                                shipmentId,
                                xmlParaML,
                                tokenML
                            );


                        if (
                            resultado.ok
                        ) {

                            console.log(
                                '✅ NF-e enviada ao ML com sucesso!'
                            );


                            await supabase
                                .from(
                                    'vendas_ml'
                                )
                                .update({
                                    nfe_importada_ml:
                                        true
                                })
                                .eq(
                                    'id',
                                    venda_id
                                );

                        } else {

                            console.warn(
                                '⚠️ Falha ao enviar NF-e ao ML (não crítico)'
                            );
                        }
                    }

                } else {

                    console.warn(
                        `⚠️ Não foi possível enviar NF-e ao ML: shipmentId=${shipmentId}, token=${!!tokenML}, xml=${!!xmlParaML}`
                    );
                }


            } catch (error) {

                console.error(
                    '❌ Erro ao processar integração com ML:',
                    error.message
                );
            }
        }


        // =====================================================
        // RETORNO
        // =====================================================

        return res.json({

            success:
                true,

            protocolo,

            chaveAcesso,

            chave_acesso:
                chaveAcesso,

            xml_ml:
                !!mlXmlPath,

            devolucao:
                ehDevolucao
        });


    } catch (error) {

        console.error(
            '❌ Erro na emissão:',
            error
        );


        return res
            .status(
                500
            )
            .json({

                success:
                    false,

                error:
                    error?.message ||
                    'Erro interno na emissão da NF-e'
            });
    }
}

// ===== FUNÇÃO AUXILIAR: verificar se venda é FULL =====
async function verificarSeVendaFull(vendaId, token) {
    try {
        const url = `https://api.mercadolibre.com/orders/${vendaId}`;
        const proxyUrl = `${WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(url)}&token=${encodeURIComponent(token)}`;
        const res = await fetch(proxyUrl);
        if (!res.ok) return false;
        const order = await res.json();
        const shipping = order.shipping || {};
        const logisticType = shipping.logistic_type || '';
        const tags = (order.tags || []).map(t => t.toLowerCase());
        return logisticType === 'fulfillment' || tags.includes('fulfillment');
    } catch (e) {
        return false;
    }
}

// ===================== CANCELAMENTO DE NF-e =====================
async function cancelarNFe(req, res) {
    console.log('📨 Requisição de cancelamento recebida');
    try {
        const { venda_id, chaveAcesso, justificativa } = req.body;
        let chave = chaveAcesso;
        if (!chave && venda_id) {
            const { data } = await supabase.from('vendas_ml').select('nfe_chave').eq('id', venda_id).single();
            if (!data?.nfe_chave) throw new Error('NF-e não encontrada para esta venda');
            chave = data.nfe_chave;
        }
        if (!chave) throw new Error('Chave de acesso não informada');
        const chaveNumerica = chave.replace(/\D/g, '');
        if (chaveNumerica.length !== 44) throw new Error('Chave inválida');

        // Busca o protocolo e último sequencial da NF-e – usando chave_acesso
        const { data: nfeData, error } = await supabase
            .from('nfe_emitidas')
            .select('ultimo_evento_seq, protocolo')
            .eq('chave_acesso', chaveNumerica)   // <-- corrigido
            .maybeSingle();

        if (error) {
            console.error('Erro ao buscar NF-e:', error);
            throw new Error('Erro ao consultar banco de dados');
        }

        if (!nfeData) throw new Error('NF-e não encontrada no banco');
        if (!nfeData.protocolo) throw new Error('NF-e sem protocolo de autorização');
        
        const tpEvento = "110111";
        const chNFe = chaveNumerica.length === 43 ? `${chaveNumerica}1` : chaveNumerica;
        const nSeqEvento = "01";
        const idEvento = `ID${tpEvento}${chNFe}${nSeqEvento}`;

        const xmlEvento = montarXmlCancelamento(
            chaveNumerica,
            nfeData.protocolo,
            justificativa || 'Cancelamento solicitado',
            nSeqEvento
        );

        const certData = loadCertificates();
        const xmlAssinado = assinarXmlEvento(xmlEvento, certData);
        const nfeService = new NFEService(AMBIENTE);
        console.log('📄 XML do evento ASSINADO (COMPLETO):\n', xmlAssinado);
        const resposta = await nfeService.sendEvento(xmlAssinado, certData);
        const resultado = extrairResultadoCancelamento(resposta);
        console.log(`📊 Resultado do cancelamento: cStat=${resultado.cStat}, motivo=${resultado.motivo}, protocolo=${resultado.protocolo}`);

        if (!resultado.cancelado && resultado.cStat !== '135' && resultado.cStat !== '136') {
        throw new Error(`SEFAZ rejeitou cancelamento: ${resultado.motivo} (cStat=${resultado.cStat})`);
        }

        // Atualiza NF-e – usando chave_acesso
        await supabase
            .from('nfe_emitidas')
            .update({
                cancelada: true,
                cancelamento_protocolo: resultado.protocolo,
                cancelamento_justificativa: justificativa,
                data_cancelamento: new Date().toISOString(),
                ultimo_evento_seq: nSeqEvento
            })
            .eq('chave_acesso', chaveNumerica);   // <-- corrigido

        if (venda_id) {
            await supabase
                .from('vendas_ml')
                .update({
                    nfe_cancelada: true,
                    nfe_cancelamento_protocolo: resultado.protocolo,
                    nfe_cancelamento_justificativa: justificativa,
                    nfe_cancelamento_data: new Date().toISOString(),
                    nfe_ultimo_evento_seq: nSeqEvento
                })
                .eq('id', venda_id);
        }

        res.json({ success: true, protocoloCancelamento: resultado.protocolo });
    } catch (error) {
        console.error('❌ Erro no cancelamento:', error);
        res.status(500).json({ success: false, error: error.message });
    }
}

async function testarEventoRaw(req, res) {
    console.log('📨 [TESTE EVENTO] Enviando evento diretamente');
    try {
        let xml = req.body.xml || req.body;
        if (typeof xml === 'object') xml = xml.xml;
        if (!xml || typeof xml !== 'string') throw new Error('XML inválido');

        const certData = loadCertificates();
        const nfeService = new NFEService(AMBIENTE);
        const resposta = await nfeService.sendEvento(xml, certData);
        const resultado = extrairResultadoCancelamento(resposta);
        res.json({ success: resultado.cancelado, ...resultado, resposta });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

// ===================== LISTAR NF-ES EMITIDAS =====================
async function listarNFesEmitidas(req, res) {
    try {
        const { data, error } = await supabase
            .from('nfe_emitidas')
            .select('*')
            .order('data_emissao', { ascending: false });
        if (error) throw error;
        res.json({ success: true, notas: data });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

// ===================== TRANSPORTADORAS =====================
async function listarTransportadoras(req, res) {
    try {
        const { data, error } = await supabase.from('transportadoras').select('*').order('nome');
        if (error) throw error;
        res.json({ success: true, transportadoras: data });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

async function cadastrarTransportadora(req, res) {
    try {
        const { nome, cnpj, ie, endereco, cidade, uf } = req.body;
        if (!nome || !cnpj) throw new Error('Nome e CNPJ obrigatórios');
        const { data, error } = await supabase.from('transportadoras').insert([{ nome, cnpj, ie, endereco, cidade, uf }]).select();
        if (error) throw error;
        res.json({ success: true, transportadora: data[0] });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

// ===================== CLIENTES =====================
async function listarClientes(req, res) {
    try {
        const { data, error } = await supabase.from('clientes').select('*').order('nome');
        if (error) throw error;
        res.json({ success: true, clientes: data });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

// ===================== EMISSÃO AVULSA =====================
async function emitirNFEAvulsa(req, res) {

    console.log(
        '📨 Requisição de emissão AVULSA recebida'
    );

    try {

        // =====================================================
        // PAYLOAD
        // =====================================================

        const {
            cliente,
            produtos,
            cfop,
            natureza_operacao,
            modalidade_frete,
            transportadora_id,
            finalidade_nfe,
            chave_nfe_referenciada

        } = req.body || {};


        console.log(
            '📦 Payload NF-e avulsa:',
            {
                cliente,
                produtos:
                    Array.isArray(
                        produtos
                    )
                        ? produtos.length
                        : 0,
                cfop,
                natureza_operacao,
                modalidade_frete,
                transportadora_id,
                finalidade_nfe,
                chave_nfe_referenciada
            }
        );


        // =====================================================
        // VALIDAÇÕES
        // =====================================================

        if (!cliente) {

            throw new Error(
                'Cliente não informado'
            );
        }


        if (
            !Array.isArray(produtos) ||
            produtos.length === 0
        ) {

            throw new Error(
                'Nenhum produto informado'
            );
        }


        if (!cfop) {

            throw new Error(
                'CFOP não informado'
            );
        }


        if (!natureza_operacao) {

            throw new Error(
                'Natureza da operação não informada'
            );
        }


        // =====================================================
        // BUSCAR CLIENTE COMPLETO
        // =====================================================

        let clienteCompleto =
            null;


        if (
            cliente?.id
        ) {

            console.log(
                `👤 Buscando cliente completo ID ${cliente.id}...`
            );


            const {
                data,
                error
            } =
                await supabase
                    .from(
                        'clientes'
                    )
                    .select('*')
                    .eq(
                        'id',
                        cliente.id
                    )
                    .maybeSingle();


            if (error) {

                console.error(
                    '❌ Erro buscando cliente:',
                    error
                );


                throw new Error(
                    `Erro ao buscar cliente: ${error.message}`
                );
            }


            if (!data) {

                throw new Error(
                    `Cliente ID ${cliente.id} não encontrado`
                );
            }


            clienteCompleto =
                data;

        } else {

            clienteCompleto = {
                ...cliente
            };
        }


        // =====================================================
        // NORMALIZAR CLIENTE
        // =====================================================

        clienteCompleto.uf =
            String(
                clienteCompleto.uf ||
                ''
            )
                .trim()
                .toUpperCase();


        clienteCompleto.cidade =
            String(
                clienteCompleto.cidade ||
                ''
            )
                .trim();


        clienteCompleto.cep =
            String(
                clienteCompleto.cep ||
                ''
            )
                .replace(
                    /\D/g,
                    ''
                );


        clienteCompleto.documento =
            String(
                clienteCompleto.documento ||
                ''
            )
                .replace(
                    /\D/g,
                    ''
                );


        if (
            !clienteCompleto.uf ||
            clienteCompleto.uf.length !==
                2
        ) {

            throw new Error(
                `UF inválida no cadastro do cliente ${clienteCompleto.nome || cliente.id}.`
            );
        }


        console.log(
            '👤 CLIENTE AVULSA COMPLETO:',
            {
                id:
                    clienteCompleto.id,

                nome:
                    clienteCompleto.nome,

                documento:
                    clienteCompleto.documento,

                cidade:
                    clienteCompleto.cidade,

                uf:
                    clienteCompleto.uf,

                cep:
                    clienteCompleto.cep
            }
        );


        // =====================================================
        // IDENTIFICAR DEVOLUÇÃO
        // =====================================================

        const naturezaNormalizada =
            String(
                natureza_operacao ||
                ''
            )
                .normalize('NFD')
                .replace(
                    /[\u0300-\u036f]/g,
                    ''
                )
                .trim()
                .toLowerCase();


        const ehDevolucao =
            String(
                finalidade_nfe ||
                ''
            ) === '4' ||

            naturezaNormalizada.includes(
                'devolucao'
            );


        // =====================================================
        // CHAVE REFERENCIADA
        // =====================================================

        const chaveReferenciada =
            String(
                chave_nfe_referenciada ||
                ''
            )
                .replace(
                    /\D/g,
                    ''
                );


        // =====================================================
        // VALIDAR DEVOLUÇÃO
        // =====================================================

        if (ehDevolucao) {

            if (
                chaveReferenciada.length !==
                44
            ) {

                throw new Error(
                    'Entrada de Devolução exige a chave de acesso da NF-e original com 44 dígitos.'
                );
            }


            const cfopEsperado =
                clienteCompleto.uf ===
                'PR'
                    ? '1202'
                    : '2202';


            if (
                String(cfop) !==
                cfopEsperado
            ) {

                throw new Error(

                    clienteCompleto.uf ===
                    'PR'

                        ? `Entrada de Devolução dentro do PR exige CFOP ${cfopEsperado}.`

                        : `Entrada de Devolução do estado ${clienteCompleto.uf} exige CFOP ${cfopEsperado}.`
                );
            }


            console.log(
                '✅ DEVOLUÇÃO AVULSA VALIDADA:',
                {
                    ufCliente:
                        clienteCompleto.uf,

                    cfop,

                    finalidade_nfe:
                        '4',

                    tp_nf:
                        '0',

                    chaveReferenciada
                }
            );
        }


        // =====================================================
        // CONVERSÃO NUMÉRICA
        // =====================================================

        const converterNumero =
            valor => {

                if (
                    typeof valor ===
                    'number'
                ) {

                    return valor;
                }


                let texto =
                    String(
                        valor ??
                        ''
                    )
                        .trim();


                if (!texto) {

                    return 0;
                }


                if (
                    texto.includes(',') &&
                    texto.includes('.')
                ) {

                    texto =
                        texto
                            .replace(
                                /\./g,
                                ''
                            )
                            .replace(
                                ',',
                                '.'
                            );

                } else if (
                    texto.includes(',')
                ) {

                    texto =
                        texto.replace(
                            ',',
                            '.'
                        );
                }


                const numero =
                    Number(
                        texto
                    );


                return Number.isFinite(
                    numero
                )
                    ? numero
                    : 0;
            };


        // =====================================================
        // NORMALIZAR PRODUTOS
        // =====================================================

        const produtosNormalizados =
            produtos.map(
                (
                    produto,
                    index
                ) => {

                    const quantidade =
                        converterNumero(
                            produto.quantidade
                        );


                    const valorUnitario =
                        converterNumero(
                            produto.valor_unitario
                        );


                    if (
                        quantidade <= 0
                    ) {

                        throw new Error(
                            `Quantidade inválida no produto ${index + 1}`
                        );
                    }


                    if (
                        valorUnitario < 0
                    ) {

                        throw new Error(
                            `Valor inválido no produto ${index + 1}`
                        );
                    }


                    return {

                        ...produto,

                        quantidade,

                        valor_unitario:
                            valorUnitario,

                        sku:
                            String(
                                produto.sku ||
                                'SEM_SKU'
                            )
                                .trim(),

                        ncm:
                            String(
                                produto.ncm ||
                                '87149990'
                            )
                                .replace(
                                    /\D/g,
                                    ''
                                )
                                .substring(
                                    0,
                                    8
                                )
                    };
                }
            );


        // =====================================================
        // PAYLOAD INTERNO PARA emitirNFe
        // =====================================================

        const dados = {

            venda_id:
                null,

            cliente:
                clienteCompleto,

            produtos:
                produtosNormalizados,

            cfop:
                String(
                    cfop
                ),

            natureza_operacao:
                natureza_operacao,

            modalidade_frete:
                String(
                    modalidade_frete ||
                    '9'
                ),

            transportadora_id:
                transportadora_id ||
                null,


            // =============================================
            // IDENTIFICADORES
            // =============================================

            emissao_avulsa:
                true,

            eh_devolucao:
                ehDevolucao,

            finalidade_nfe:
                ehDevolucao
                    ? '4'
                    : String(
                        finalidade_nfe ||
                        '1'
                    ),

            tp_nf:
                ehDevolucao
                    ? '0'
                    : '1',

            chave_nfe_referenciada:
                ehDevolucao
                    ? chaveReferenciada
                    : null
        };


        console.log(
            '📤 Dados finais para emitirNFe:',
            {
                cliente: {
                    id:
                        dados.cliente.id,

                    nome:
                        dados.cliente.nome,

                    cidade:
                        dados.cliente.cidade,

                    uf:
                        dados.cliente.uf
                },

                produtos:
                    dados.produtos.length,

                cfop:
                    dados.cfop,

                natureza_operacao:
                    dados.natureza_operacao,

                modalidade_frete:
                    dados.modalidade_frete,

                eh_devolucao:
                    dados.eh_devolucao,

                finalidade_nfe:
                    dados.finalidade_nfe,

                tp_nf:
                    dados.tp_nf,

                chave_nfe_referenciada:
                    dados.chave_nfe_referenciada
            }
        );


        // =====================================================
        // RESPOSTA INTERNA
        // =====================================================

        const emitResult =
            await new Promise(
                (
                    resolve,
                    reject
                ) => {

                    let finalizado =
                        false;


                    const respostaInterna = {

                        json:
                            objeto => {

                                if (
                                    finalizado
                                ) {

                                    return objeto;
                                }


                                finalizado =
                                    true;


                                if (
                                    objeto?.success ===
                                    false
                                ) {

                                    const erro =
                                        new Error(
                                            objeto.error ||
                                            objeto.message ||
                                            'Erro na emissão da NF-e'
                                        );


                                    erro.status =
                                        500;


                                    erro.payload =
                                        objeto;


                                    reject(
                                        erro
                                    );


                                    return objeto;
                                }


                                resolve(
                                    objeto
                                );


                                return objeto;
                            },


                        status:
                            statusCode => ({

                                json:
                                    objeto => {

                                        if (
                                            finalizado
                                        ) {

                                            return objeto;
                                        }


                                        finalizado =
                                            true;


                                        const erro =
                                            new Error(
                                                objeto?.error ||
                                                objeto?.message ||
                                                `Erro HTTP ${statusCode}`
                                            );


                                        erro.status =
                                            statusCode;


                                        erro.payload =
                                            objeto;


                                        reject(
                                            erro
                                        );


                                        return objeto;
                                    }

                            })
                    };


                    Promise
                        .resolve(
                            emitirNFe(
                                {
                                    body:
                                        dados
                                },
                                respostaInterna
                            )
                        )
                        .catch(
                            error => {

                                if (
                                    !finalizado
                                ) {

                                    finalizado =
                                        true;


                                    reject(
                                        error
                                    );
                                }
                            }
                        );
                }
            );


        console.log(
            '✅ NF-e AVULSA CONCLUÍDA:',
            emitResult
        );


        return res.json(
            emitResult
        );


    } catch (error) {

        console.error(
            '❌ Erro na emissão avulsa:',
            error
        );


        const statusCode =
            (
                Number(
                    error?.status
                ) >= 400 &&
                Number(
                    error?.status
                ) <= 599
            )
                ? Number(
                    error.status
                )
                : 500;


        return res
            .status(
                statusCode
            )
            .json({

                success:
                    false,

                error:
                    error?.message ||
                    'Erro interno na emissão da NF-e avulsa'
            });
    }
}

async function atualizarCliente(
    req,
    res
) {

    try {

        const {
            id
        } =
            req.params;


        const {
            nome,
            documento,
            logradouro,
            numero,
            bairro,
            cidade,
            uf,
            cep
        } =
            req.body ||
            {};


        if (!id) {

            return res
                .status(
                    400
                )
                .json({
                    success:
                        false,

                    error:
                        'ID do cliente não informado'
                });
        }


        const documentoLimpo =
            String(
                documento ||
                ''
            )
                .replace(
                    /\D/g,
                    ''
                );


        if (!nome) {

            return res
                .status(
                    400
                )
                .json({
                    success:
                        false,

                    error:
                        'Nome do cliente é obrigatório'
                });
        }


        if (
            documentoLimpo.length !== 11 &&
            documentoLimpo.length !== 14
        ) {

            return res
                .status(
                    400
                )
                .json({
                    success:
                        false,

                    error:
                        'CPF/CNPJ inválido'
                });
        }


        // =====================================================
        // NÃO DEIXAR O MESMO CPF/CNPJ EM OUTRO CLIENTE
        // =====================================================

        const {
            data: duplicado,
            error: erroBusca
        } =
            await supabase
                .from(
                    'clientes'
                )
                .select(
                    'id, nome'
                )
                .eq(
                    'documento',
                    documentoLimpo
                )
                .neq(
                    'id',
                    id
                )
                .maybeSingle();


        if (erroBusca) {

            throw erroBusca;
        }


        if (duplicado) {

            return res
                .status(
                    409
                )
                .json({

                    success:
                        false,

                    error:
                        `Já existe outro cliente cadastrado com este CPF/CNPJ: ${duplicado.nome}`
                });
        }


        // =====================================================
        // ATUALIZAR
        // =====================================================

        const {
            data,
            error
        } =
            await supabase
                .from(
                    'clientes'
                )
                .update({

                    nome:
                        String(
                            nome
                        ).trim(),

                    documento:
                        documentoLimpo,

                    logradouro:
                        String(
                            logradouro ||
                            ''
                        ).trim(),

                    numero:
                        String(
                            numero ||
                            'S/N'
                        ).trim(),

                    bairro:
                        String(
                            bairro ||
                            ''
                        ).trim(),

                    cidade:
                        String(
                            cidade ||
                            ''
                        ).trim(),

                    uf:
                        String(
                            uf ||
                            ''
                        )
                            .trim()
                            .toUpperCase(),

                    cep:
                        String(
                            cep ||
                            ''
                        )
                            .replace(
                                /\D/g,
                                ''
                            )
                })
                .eq(
                    'id',
                    id
                )
                .select()
                .maybeSingle();


        if (error) {

            throw error;
        }


        if (!data) {

            return res
                .status(
                    404
                )
                .json({
                    success:
                        false,

                    error:
                        'Cliente não encontrado'
                });
        }


        console.log(
            `✅ Cliente ${id} atualizado:`,
            data
        );


        return res.json({

            success:
                true,

            cliente:
                data
        });


    } catch (
        error
    ) {

        console.error(
            '❌ Erro ao atualizar cliente:',
            error
        );


        return res
            .status(
                500
            )
            .json({

                success:
                    false,

                error:
                    error.message
            });
    }
}

// ===================== CONSULTAR STATUS =====================
async function consultarStatusNFE(req, res) {
    try {
        const { chaveAcesso } = req.body;
        if (!chaveAcesso) throw new Error('Chave obrigatória');
        const certData = loadCertificates();
        const nfeService = new NFEService(AMBIENTE);
        const resposta = await nfeService.consultarStatus(chaveAcesso.replace(/\D/g, ''), certData);
        const cStat = resposta.match(/<cStat>(\d+)<\/cStat>/)?.[1] || '999';
        const xMotivo = resposta.match(/<xMotivo>([^<]+)<\/xMotivo>/)?.[1] || 'Desconhecido';
        res.json({ success: true, cStat, xMotivo });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

// ===================== VENDAS SEM NF-e (listagem) =====================
async function listarVendasSemNFE(req, res) {
    try {
        const { data, error } = await supabase
            .from('vendas_ml')
            .select('id, cliente, sku, valor_total, data_venda, dados_completos, meio_envio')
            .eq('nfe_emitida', false);
        if (error) throw error;
        if (!data) return res.json([]);
        const vendas = data.map(v => ({
            id: v.id,
            order_id: String(v.id),
            cliente_nome: v.cliente || 'Cliente',
            sku: v.sku,
            valor_total: v.valor_total,
            data_venda: v.data_venda,
            produtos: v.dados_completos,
            meio_envio: v.meio_envio
        }));
        res.json(vendas);
    } catch (error) {
        console.error('Erro listarVendasSemNFE:', error);
        res.status(500).json({ error: error.message });
    }
}

async function listarVendasComNFE(req, res) {
    try {
        const { data, error } = await supabase
            .from('vendas_ml')
            .select('*, nfe_emitidas(*)')
            .eq('nfe_emitida', true);
        if (error) throw error;
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

async function buscarXMLPorChave(req, res) {
    const { chave } = req.query;
    if (!chave) return res.status(400).json({ error: 'Chave não informada' });
    
    // Remove espaços e caracteres especiais (garante apenas números)
    const chaveLimpa = chave.replace(/\D/g, '');
    if (chaveLimpa.length !== 44) {
        return res.status(400).json({ error: 'Chave inválida (deve ter 44 dígitos)' });
    }

    try {
        const { data, error } = await supabase
            .from('nfe_emitidas')
            .select('xml_assinado')   // ← nome correto da coluna
            .eq('chave_acesso', chaveLimpa)   // ← nome correto da coluna
            .maybeSingle();  // ← em vez de .single() para evitar erro se não achar

        if (error) {
            console.error('Erro no Supabase:', error);
            return res.status(500).json({ error: 'Erro ao buscar XML' });
        }

        if (!data || !data.xml_assinado) {
            return res.status(404).json({ error: 'XML não encontrado para esta chave' });
        }

        res.json({ xml: data.xml_assinado });
    } catch (error) {
        console.error('Erro em buscarXMLPorChave:', error);
        res.status(500).json({ error: error.message });
    }
}

// ===================== SINCRONIZAÇÃO (desabilitada no backend) =====================
async function sincronizarVendasML(req, res) {
    res.status(200).json({ success: false, message: 'Sincronize via frontend' });
}

// ===================== FUNÇÕES AUXILIARES (cancelamento) =====================
function montarXmlCancelamento(chaveAcesso, protocolo, justificativa, nSeqEvento) {
    // 1. Obtém o momento atual da máquina e subtrai 5 minutos de segurança
    const dataAlvo = new Date();
    dataAlvo.setMinutes(dataAlvo.getMinutes() - 5);

    // 2. Força a formatação exata no padrão da SEFAZ usando o fuso de Brasília (America/Sao_Paulo)
    const formatter = new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false
    });

    const partes = formatter.formatToParts(dataAlvo);
    const mapa = Object.fromEntries(partes.map(p => [p.type, p.value]));

    // Resultado esperado: YYYY-MM-DDTHH:mm:ss-03:00
    const dhEvento = `${mapa.year}-${mapa.month}-${mapa.day}T${mapa.hour}:${mapa.minute}:${mapa.second}-03:00`;

    const nSeqEventoFormatado = String(nSeqEvento).padStart(2, '0');
    const id = `ID110111${chaveAcesso}${nSeqEventoFormatado}`;
    const nSeqEventoTag = String(parseInt(nSeqEvento, 10));

    return `<?xml version="1.0" encoding="UTF-8"?>
<envEvento xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00">
    <idLote>${Math.floor(Math.random() * 999999999999999)}</idLote>
    <evento versao="1.00">
        <infEvento Id="${id}">
            <cOrgao>41</cOrgao>
            <tpAmb>${AMBIENTE === 'producao' ? '1' : '2'}</tpAmb>
            <CNPJ>32830261000125</CNPJ>
            <chNFe>${chaveAcesso}</chNFe>
            <dhEvento>${dhEvento}</dhEvento>
            <tpEvento>110111</tpEvento>
            <nSeqEvento>${nSeqEventoTag}</nSeqEvento>
            <verEvento>1.00</verEvento>
            <detEvento versao="1.00">
                <descEvento>Cancelamento</descEvento>
                <nProt>${protocolo}</nProt>
                <xJust>${justificativa.substring(0, 255)}</xJust>
            </detEvento>
        </infEvento>
    </evento>
</envEvento>`;
}

function assinarXmlEvento(xml, certData) {
    const { SignedXml } = require('xml-crypto');

    // 1. Extrair o Id do infEvento
    const idMatch = xml.match(/<infEvento[^>]*Id="([^"]+)"/);
    if (!idMatch) throw new Error('❌ Id do infEvento não encontrado para assinatura');
    const id = idMatch[1];
    console.log(`🔑 Assinando evento com Id: ${id}`);

    // 2. Limpar o XML (remove quebras e espaços extras)
    let xmlLimpo = xml
        .replace(/\r?\n/g, '')
        .replace(/>\s+</g, '><')
        .replace(/\s{2,}/g, ' ')
        .trim();

    // 3. Usar a chave privada diretamente (já é PKCS#8)
    const privateKeyPem = certData.privateKey;

    const sig = new SignedXml();
    sig.privateKey = privateKeyPem;
    sig.signatureAlgorithm = 'http://www.w3.org/2000/09/xmldsig#rsa-sha1';
    sig.canonicalizationAlgorithm = 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315';

    // 4. Adicionar referência ao infEvento
    sig.addReference({
        xpath: `//*[local-name(.)='infEvento' and @Id='${id}']`,
        transforms: [
            'http://www.w3.org/2000/09/xmldsig#enveloped-signature',
            'http://www.w3.org/TR/2001/REC-xml-c14n-20010315'
        ],
        digestAlgorithm: 'http://www.w3.org/2000/09/xmldsig#sha1',
        uri: `#${id}`
    });

    // 5. Inserir certificado na KeyInfo
    let certBase64 = certData.cert
        .replace(/-----BEGIN CERTIFICATE-----/g, '')
        .replace(/-----END CERTIFICATE-----/g, '')
        .replace(/\r?\n/g, '')
        .trim();
    sig.getKeyInfoContent = () =>
        `<X509Data><X509Certificate>${certBase64}</X509Certificate></X509Data>`;

    // 6. Calcular assinatura
    sig.computeSignature(xmlLimpo, {
        location: {
            reference: `//*[local-name(.)='infEvento' and @Id='${id}']`,
            action: 'after'
        }
    });

    let signedXml = sig.getSignedXml();

    // 7. Limpeza final
    signedXml = signedXml
        .replace(/xmlns=""/g, '')
        .replace(/[\x00-\x1F\x7F]/g, '');

    if (!signedXml.includes('<Signature xmlns="http://www.w3.org/2000/09/xmldsig#"')) {
        signedXml = signedXml.replace('<Signature', '<Signature xmlns="http://www.w3.org/2000/09/xmldsig#"');
    }

    if (!signedXml.startsWith('<?xml')) {
        signedXml = '<?xml version="1.0" encoding="UTF-8"?>' + signedXml;
    }

    // Salvar o XML do evento assinado para inspeção (opcional)
    const eventPath = path.join(__dirname, 'xml_gerado', `evento_cancelamento_${Date.now()}.xml`);
    fs.writeFileSync(eventPath, signedXml, 'utf8');
    console.log(`📁 Evento assinado salvo em: ${eventPath}`);

    console.log('✅ Evento assinado com sucesso.');
    return signedXml;
}

function extrairResultadoCancelamento(respostaXml) {
    // Busca o retEvento (dentro do env:Body > nfeResultMsg > retEvento)
    const retEventoMatch = respostaXml.match(/<retEvento[^>]*>([\s\S]*?)<\/retEvento>/);
    if (!retEventoMatch) {
        // Se não encontrar retEvento, tenta buscar no envelope genérico (fallback)
        const cStat = respostaXml.match(/<cStat[^>]*>(\d+)<\/cStat>/)?.[1] || '999';
        const motivo = respostaXml.match(/<xMotivo[^>]*>([^<]+)<\/xMotivo>/)?.[1] || 'Erro desconhecido';
        const protocolo = respostaXml.match(/<nProt[^>]*>(\d+)<\/nProt>/)?.[1] || null;
        return { cancelado: (cStat === '135' || cStat === '136'), cStat, motivo, protocolo };
    }

    const retEvento = retEventoMatch[1];
    const cStat = retEvento.match(/<cStat[^>]*>(\d+)<\/cStat>/)?.[1] || '999';
    const motivo = retEvento.match(/<xMotivo[^>]*>([^<]+)<\/xMotivo>/)?.[1] || 'Erro desconhecido';
    const protocolo = retEvento.match(/<nProt[^>]*>(\d+)<\/nProt>/)?.[1] || null;

    // cStat 135 ou 136 indicam sucesso no cancelamento
    const cancelado = (cStat === '135' || cStat === '136');
    return { cancelado, cStat, motivo, protocolo };
}

// ===================== TESTE COM XML ENVIADO PELO USUÁRIO =====================
async function testarXmlRaw(req, res) {
    console.log('📨 [TESTE RAW] Recebendo XML para enviar à SEFAZ');
    try {
        let xml = req.body;
        if (typeof xml === 'object' && xml.xml) {
            xml = xml.xml;
        }
        if (typeof xml === 'object' && !xml.xml) {
            xml = req.body.toString();
        }
        if (!xml || typeof xml !== 'string' || xml.trim().length === 0) {
            return res.status(400).json({ error: 'XML não informado. Envie {"xml": "SEU_XML_AQUI"}' });
        }

        const certData = loadCertificates();
        const hasEnviNFe = /<enviNFe\s/.test(xml);

        let resposta;
        if (hasEnviNFe) {
            console.log('📄 XML já contém <enviNFe> – enviando diretamente.');
            const soapEnvelope = `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema"><soap:Body><nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeAutorizacao4">${xml}</nfeDadosMsg></soap:Body></soap:Envelope>`;

            const axios = require('axios');
            const https = require('https');
            const httpsAgent = new https.Agent({
                cert: certData.cert,
                key: certData.privateKey,
                ca: certData.ca || undefined,
                rejectUnauthorized: false,
                minVersion: 'TLSv1.2',
                maxVersion: 'TLSv1.2'
            });
            const url = AMBIENTE === 'producao' ? 'https://nfe.sefa.pr.gov.br/nfe/NFeAutorizacao4' : 'https://homologacao.nfe.sefa.pr.gov.br/nfe/NFeAutorizacao4';
            const response = await axios.post(url, soapEnvelope, {
                httpsAgent,
                headers: {
                    'Content-Type': 'text/xml; charset=utf-8',
                    'SOAPAction': 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeAutorizacao4/nfeDadosMsg'
                },
                timeout: 60000,
                responseType: 'text'
            });
            resposta = response.data;
        } else {
            console.log('📄 XML sem <enviNFe> – utilizando NFEService padrão.');
            const nfeService = new NFEService(AMBIENTE);
            resposta = await nfeService.sendNFe(xml, certData);
        }

        const protocolo = extrairProtocolo(resposta);
        const cStat = resposta.match(/<cStat>(\d+)<\/cStat>/)?.[1] || 'N/A';
        const xMotivo = resposta.match(/<xMotivo>([^<]+)<\/xMotivo>/)?.[1] || 'N/A';

        res.json({
            success: !!protocolo,
            protocolo: protocolo || null,
            cStat,
            xMotivo,
            respostaCompleta: resposta.substring(0, 2000)
        });
    } catch (error) {
        console.error('Erro no teste raw:', error);
        res.status(500).json({ error: error.message });
    }
}

async function cadastrarCliente(req, res) {
  try {
    const { nome, documento, logradouro, numero, bairro, cidade, uf, cep } = req.body;
    if (!nome || !documento) {
      return res.status(400).json({ success: false, error: 'Nome e documento são obrigatórios' });
    }

    // Verifica se já existe
    const { data: existing, error: searchError } = await supabase
      .from('clientes')
      .select('id')
      .eq('documento', documento)
      .maybeSingle();

    if (searchError) throw searchError;
    if (existing) {
      return res.json({ success: true, cliente: existing, message: 'Cliente já cadastrado' });
    }

    const { data, error } = await supabase
      .from('clientes')
      .insert([{ nome, documento, logradouro, numero, bairro, cidade, uf, cep }])
      .select();

    if (error) throw error;
    res.json({ success: true, cliente: data[0] });
  } catch (error) {
    console.error('Erro ao cadastrar cliente:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

async function buscarClientePorId(req, res) {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from('clientes')
      .select('*')
      .eq('id', id)
      .single();
    if (error) throw error;
    res.json({ success: true, cliente: data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}

// ===================== ROTA DE TESTE COM XML FIXO =====================
async function testarEnvioXMLFixo(req, res) {
    console.log('📨 [TESTE] Enviando XML conhecido (que já funcionou)');
    try {
        const xmlFixo = `<?xml version="1.0" encoding="UTF-8"?>
<enviNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
    <idLote>1</idLote>
    <indSinc>1</indSinc>
    <NFe xmlns="http://www.portalfiscal.inf.br/nfe">
        <infNFe versao="4.00" Id="NFe41260632830261000125550030000500101842455204">
            <ide>
                <cUF>41</cUF>
                <cNF>84245520</cNF>
                <natOp>Venda</natOp>
                <mod>55</mod>
                <serie>3</serie>
                <nNF>50010</nNF>
                <dhEmi>2026-06-19T09:14:19-03:00</dhEmi>
                <dhSaiEnt>2026-06-19T09:14:19-03:00</dhSaiEnt>
                <tpNF>1</tpNF>
                <idDest>1</idDest>
                <cMunFG>4101804</cMunFG>
                <tpImp>1</tpImp>
                <tpEmis>1</tpEmis>
                <cDV>4</cDV>
                <tpAmb>2</tpAmb>
                <finNFe>1</finNFe>
                <indFinal>1</indFinal>
                <indPres>9</indPres>
                <indIntermed>0</indIntermed>
                <procEmi>0</procEmi>
                <verProc>1.0</verProc>
            </ide>
            <emit>
                <CNPJ>32830261000125</CNPJ>
                <xNome>WHEEL TECH BICYCLING LTDA</xNome>
                <xFant>WHEEL TECH BICYCLING</xFant>
                <enderEmit>
                    <xLgr>RUA LOURENCO JASIOCHA</xLgr>
                    <nro>1927</nro>
                    <xBairro>CENTRO</xBairro>
                    <cMun>4101804</cMun>
                    <xMun>ARAUCARIA</xMun>
                    <UF>PR</UF>
                    <CEP>83702090</CEP>
                    <cPais>1058</cPais>
                    <xPais>BRASIL</xPais>
                    <fone>4131501230</fone>
                </enderEmit>
                <IE>9087859328</IE>
                <CRT>1</CRT>
            </emit>
            <dest>
                <CPF>47840605885</CPF>
                <xNome>Andressa Miotto</xNome>
                <enderDest>
                    <xLgr>Rua Jardineira</xLgr>
                    <nro>156</nro>
                    <xBairro>Campina da Barra</xBairro>
                    <cMun>4101804</cMun>
                    <xMun>ARAUCARIA</xMun>
                    <UF>PR</UF>
                    <CEP>83709310</CEP>
                    <cPais>1058</cPais>
                    <xPais>BRASIL</xPais>
                </enderDest>
                <indIEDest>9</indIEDest>
            </dest>
            <det nItem="1">
                <prod>
                    <cProd>MLB123456</cProd>
                    <cEAN>SEM GTIN</cEAN>
                    <xProd>Bicicleta Aro 29</xProd>
                    <NCM>87149990</NCM>
                    <CFOP>5102</CFOP>
                    <uCom>UN</uCom>
                    <qCom>1.0000</qCom>
                    <vUnCom>150.00000</vUnCom>
                    <vProd>150.00</vProd>
                    <cEANTrib>SEM GTIN</cEANTrib>
                    <uTrib>UN</uTrib>
                    <qTrib>1.0000</qTrib>
                    <vUnTrib>150.00000</vUnTrib>
                    <indTot>1</indTot>
                </prod>
                <imposto>
                    <ICMS>
                        <ICMSSN102>
                            <orig>0</orig>
                            <CSOSN>102</CSOSN>
                        </ICMSSN102>
                    </ICMS>
                    <PIS>
                        <PISNT>
                            <CST>07</CST>
                        </PISNT>
                    </PIS>
                    <COFINS>
                        <COFINSNT>
                            <CST>07</CST>
                        </COFINSNT>
                    </COFINS>
                </imposto>
            </det>
            <total>
                <ICMSTot>
                    <vBC>0.00</vBC>
                    <vICMS>0.00</vICMS>
                    <vICMSDeson>0.00</vICMSDeson>
                    <vFCP>0.00</vFCP>
                    <vBCST>0.00</vBCST>
                    <vST>0.00</vST>
                    <vFCPST>0.00</vFCPST>
                    <vFCPSTRet>0.00</vFCPSTRet>
                    <vProd>150.00</vProd>
                    <vFrete>0.00</vFrete>
                    <vSeg>0.00</vSeg>
                    <vDesc>0.00</vDesc>
                    <vII>0.00</vII>
                    <vIPI>0.00</vIPI>
                    <vIPIDevol>0.00</vIPIDevol>
                    <vPIS>0.00</vPIS>
                    <vCOFINS>0.00</vCOFINS>
                    <vOutro>0.00</vOutro>
                    <vTotTrib>0.00</vTotTrib>
                    <vNF>150.00</vNF>
                </ICMSTot>
            </total>
            <transp>
                <modFrete>9</modFrete>
            </transp>
            <pag>
                <detPag>
                    <tPag>01</tPag>
                    <vPag>150.00</vPag>
                </detPag>
            </pag>
            <infRespTec>
                <CNPJ>64555626000147</CNPJ>
                <xContato>MARIA ANTONIA MELO COSTA</xContato>
                <email>privacidade@iob.com.br</email>
                <fone>1930043303</fone>
                <idCSRT>01</idCSRT>
                <hashCSRT>z9ywwhAy7fsb/3QyV5mYiSRZnuA=</hashCSRT>
            </infRespTec>
        </infNFe>
    </NFe>
</enviNFe>`;

        const certData = loadCertificates();
        const { assinarXml: assinar } = require('./xmlSigner');
        const xmlAssinado = assinar(xmlFixo, certData);

        const nfeService = new NFEService(AMBIENTE);
        const resposta = await nfeService.sendNFe(xmlAssinado, certData);
        const protocolo = extrairProtocolo(resposta);

        res.json({
            success: !!protocolo,
            protocolo: protocolo || null,
            cStat: resposta.match(/<cStat>(\d+)<\/cStat>/)?.[1],
            xMotivo: resposta.match(/<xMotivo>([^<]+)<\/xMotivo>/)?.[1],
            respostaCompleta: resposta.substring(0, 1500)
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
}

// ===================== EXPORTAÇÃO =====================
module.exports = {
    emitirNFe,
    cancelarNFe,
    listarNFesEmitidas,
    listarTransportadoras,
    cadastrarTransportadora,
    listarClientes,
    emitirNFEAvulsa,
    consultarStatusNFE,
    sincronizarVendasML,
    listarVendasSemNFE,
    listarVendasComNFE,
    buscarXMLPorChave,
    testarEnvioXMLFixo,
    testarXmlRaw,
    testarEventoRaw,
    cadastrarCliente,      // ADICIONE
    buscarClientePorId,
    atualizarCliente
};